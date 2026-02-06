/**
 * Durable Object: SlotLock
 * 予約スロットのロックを管理し、同時POSTでも二重予約を防ぐ
 */

export class SlotLock {
  private state: DurableObjectState;
  private env: {
    SAAS_FACTORY: KVNamespace;
  };

  constructor(state: DurableObjectState, env: { SAAS_FACTORY: KVNamespace }) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Durable Objectは同一IDに対して同時に1つのリクエストしか処理しないため、
    // 自然にロックがかかる（追加のロック機構は不要）

    const method = request.method;

    // DELETE メソッド: 予約キャンセル
    if (method === 'DELETE') {
      try {
        const body = await request.json();
        const { date, time } = body;

        // validation: date/time 必須
        if (!date || typeof date !== 'string') {
          return new Response(
            JSON.stringify({ ok: false, error: 'invalid request' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (!time || typeof time !== 'string') {
          return new Response(
            JSON.stringify({ ok: false, error: 'invalid request' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const kv = this.env.SAAS_FACTORY;
        const key = `rsv:${date}:${time}`;

        // ロック状態（Durable Objectの特性により既にロックされている）
        // KV確認: 予約が存在するかチェック
        const existing = await kv.get(key);
        if (!existing) {
          // 削除対象が無い → 404
          return new Response(
            JSON.stringify({ ok: false, error: 'not found' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 予約データを取得してreservationIdを確認
        let reservationId: string | null = null;
        let reservationData: any = null;
        try {
          reservationData = JSON.parse(existing);
          reservationId = reservationData.reservationId || reservationData.id || null;
        } catch (e) {
          // パースエラーは無視
        }

        // 予約データのstatusを"canceled"に更新（削除しない）
        if (reservationData) {
          reservationData.status = 'canceled';
          await kv.put(key, JSON.stringify(reservationData));
        } else {
          // パースできなかった場合は削除（後方互換性）
          await kv.delete(key);
        }

        // 逆引きインデックスのstatusを"canceled"に更新（削除しない）
        if (reservationId) {
          const reverseKey = `rsv:id:${reservationId}`;
          const reverseData = { date, time, status: 'canceled' as const };
          await kv.put(reverseKey, JSON.stringify(reverseData));
        }

        // ロック解除（Durable Objectのリクエスト処理が終了すると自動的にロック解除）

        return new Response(
          JSON.stringify({
            ok: true,
            date,
            time,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: 'invalid request' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // POST メソッド: 予約作成
    try {
      const body = await request.json();
      const { date, time, name, phone, staffId } = body;

      // validation: date/time/name 必須。phone/staffIdは任意
      if (!date || typeof date !== 'string') {
        return new Response(
          JSON.stringify({ ok: false, error: 'date is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!time || typeof time !== 'string') {
        return new Response(
          JSON.stringify({ ok: false, error: 'time is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return new Response(
          JSON.stringify({ ok: false, error: 'name is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // staffId の検証（string | null | undefined を許可）
      if (staffId !== undefined && staffId !== null && typeof staffId !== 'string') {
        return new Response(
          JSON.stringify({ ok: false, error: 'staffId must be string or null' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const kv = this.env.SAAS_FACTORY;
      // staffId がある場合は key に含める（後で検索しやすくするため）
      // ただし、既存の予約との互換性のため、まずは staffId なしの key で保存
      const key = `rsv:${date}:${time}`;
      // 将来的には `rsv:${date}:${time}:${staffId || 'any'}` に変更可能

      // ロック状態（Durable Objectの特性により既にロックされている）
      // KV確認: 既に予約が存在するかチェック
      const existing = await kv.get(key);
      if (existing) {
        // 既に予約済み → 409
        return new Response(
          JSON.stringify({ ok: false, error: 'slot already reserved' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 予約データを保存
      // reservationId を生成: "rsv_" + ランダム文字列
      const randomStr =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      const reservationId = `rsv_${randomStr}`;

      const reservationData = {
        id: reservationId, // 後方互換性のため
        reservationId,
        date,
        time,
        name,
        phone: phone || null,
        status: 'reserved' as const,
        staffId: staffId || null,
        createdAt: new Date().toISOString(),
      };

      await kv.put(key, JSON.stringify(reservationData));

      // 逆引きインデックスを作成: rsv:id:${reservationId} -> { date, time, status: "active" }
      const reverseKey = `rsv:id:${reservationId}`;
      await kv.put(reverseKey, JSON.stringify({ date, time, status: 'active' }));

      // ロック解除（Durable Objectのリクエスト処理が終了すると自動的にロック解除）

      return new Response(
        JSON.stringify({
          ok: true,
          reservationId,
          date,
          time,
          name,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}


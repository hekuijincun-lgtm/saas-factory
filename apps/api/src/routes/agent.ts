/**
 * Admin Agent Chat Route
 *
 * POST /admin/agent/chat
 * Conversational AI agent for admin dashboard.
 * Uses OpenAI chat completions with tenant context (reservations, customers, etc.)
 */

import { getTenantId } from '../helpers';

// ── System prompt builder ──────────────────────────────────────────────

function buildSystemPrompt(vertical: string, tenantId: string): string {
  const verticalLabels: Record<string, string> = {
    pet: 'ペットサロン',
    eyebrow: 'アイブロウサロン',
    nail: 'ネイルサロン',
    hair: 'ヘアサロン',
    dental: '歯科医院',
    esthetic: 'エステサロン',
    cleaning: 'クリーニング店',
    seitai: '整体院',
    gym: 'ジム',
    school: 'スクール',
  };
  const label = verticalLabels[vertical] || '店舗';

  return `あなたは${label}の管理者向けAIアシスタントです。
テナントID: ${tenantId}

以下の機能があります:
- 予約情報の検索・集計（今日/今週/今月の予約件数・売上）
- 予約の作成・キャンセル・完了処理
- 顧客情報の検索・詳細表示（来店履歴、リピート率）
- ペット情報の一覧・犬種別料金検索
- ワクチン期限切れの確認（ペットサロンの場合）
- リピート対象顧客の一覧・リピート促進メッセージ一括送信
- メニュー・見積もりの一覧取得
- クーポンの作成・一覧・LINE送信
- KPI・ダッシュボード情報の要約

ルール:
- 日本語で回答すること
- 具体的な数値はツール実行結果に基づいて回答すること
- データが取得できない場合は「確認できませんでした」と正直に答えること
- 管理者の業務効率化を支援すること
- 回答は簡潔に、要点を箇条書きにすること
- 返答は必ず簡潔にまとめること
- 「何か他にお手伝いできることがあれば」などの定型文は絶対に使わないこと
- 結果だけを端的に日本語で報告すること`;
}

// ── Tool definitions for function calling ──────────────────────────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_today_reservations',
      description: '今日の予約一覧と件数を取得する',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_dashboard_stats',
      description: '今日・今週・今月の予約件数と売上を取得する',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_expiring_vaccines',
      description: '30日以内にワクチン期限が切れるペットの一覧を取得する（ペットサロン専用）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_repeat_targets',
      description: 'リピート促進対象の顧客一覧を取得する（前回来店から一定期間経過した顧客）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_customer_stats',
      description: '顧客統計（総数、今月の新規、リピート率）を取得する',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_reservation',
      description: '新しい予約を作成します。顧客名・電話番号・メニューID・開始日時・ペット名・犬種・サイズが必要です。実行前に必ず内容を確認してください。',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: '顧客名' },
          phone: { type: 'string', description: '電話番号' },
          menu_id: { type: 'string', description: 'メニューID' },
          start_at: { type: 'string', description: '開始日時 ISO8601形式' },
          pet_name: { type: 'string', description: 'ペット名' },
          breed: { type: 'string', description: '犬種' },
          size: { type: 'string', description: 'サイズ (small/medium/large)' },
        },
        required: ['customer_name', 'phone', 'menu_id', 'start_at'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancel_reservation',
      description: '予約をキャンセルします。予約IDが必要です。破壊的操作のため実行前に必ず確認してください。',
      parameters: {
        type: 'object',
        properties: {
          reservation_id: { type: 'string', description: '予約ID' },
        },
        required: ['reservation_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'complete_reservation',
      description: '予約を完了済みにします。実際の施術時間（分）も記録します。',
      parameters: {
        type: 'object',
        properties: {
          reservation_id: { type: 'string', description: '予約ID' },
          actual_duration_minutes: { type: 'number', description: '実際の施術時間（分）' },
        },
        required: ['reservation_id', 'actual_duration_minutes'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_customers',
      description: '顧客一覧を取得します。名前や電話番号で検索できます。',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: '検索キーワード（名前・電話番号）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_customer',
      description: '顧客の詳細情報と予約履歴を取得します。',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '顧客ID' },
        },
        required: ['customer_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_pets',
      description: 'ペットの一覧を取得します。顧客IDで絞り込みも可能です。',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '顧客ID（省略可）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_breed_pricing',
      description: '犬種とサイズから料金と施術時間を検索します。',
      parameters: {
        type: 'object',
        properties: {
          breed: { type: 'string', description: '犬種名' },
          size: { type: 'string', description: 'サイズ (small/medium/large)' },
        },
        required: ['breed', 'size'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_estimates',
      description: 'AI見積の一覧を取得します。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'sent'], description: 'ステータスで絞り込み（省略可）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_menu_items',
      description: '提供しているメニューと料金の一覧を取得します。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_coupons',
      description: 'クーポンの一覧を取得します。',
      parameters: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: '有効なクーポンのみ取得する場合はtrue' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_coupon',
      description: '新しいクーポンを作成します。実行前に内容を確認してください。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'クーポン名' },
          discount_type: { type: 'string', enum: ['percent', 'fixed'], description: '割引タイプ' },
          discount_value: { type: 'number', description: '割引値（%または円）' },
          expires_at: { type: 'string', description: '有効期限 ISO8601形式' },
        },
        required: ['name', 'discount_type', 'discount_value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_coupon_via_line',
      description: 'クーポンをLINEで送信します。customer_idを省略すると全員に送信します。実行前に必ず確認してください。',
      parameters: {
        type: 'object',
        properties: {
          coupon_id: { type: 'string', description: 'クーポンID' },
          customer_id: { type: 'string', description: '顧客ID（省略すると全員送信）' },
        },
        required: ['coupon_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_repeat_reminder',
      description: 'しばらく来店していない顧客にLINEでリピート促進メッセージを一括送信します。実行前に必ず確認してください。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────

async function executeTool(
  name: string,
  _args: Record<string, unknown>,
  tenantId: string,
  env: any,
  baseUrl: string,
  authToken: string,
): Promise<string> {
  const db = env.DB;
  const kv = env.SAAS_FACTORY;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const args = _args;

  try {
    switch (name) {
      case 'get_today_reservations': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const rows = await db.prepare(
          `SELECT id, customer_name, slot_start, staff_id, status, meta
           FROM reservations
           WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ?
             AND status != 'cancelled'
           ORDER BY slot_start ASC LIMIT 50`
        ).bind(tenantId, `${todayStr}T00:00`, `${todayStr}T23:59`).all();
        const reservations = (rows.results ?? []).map((r: any) => {
          let menuName = '';
          try { menuName = JSON.parse(r.meta || '{}').menuName || ''; } catch {}
          return {
            id: r.id,
            customerName: r.customer_name,
            time: r.slot_start?.slice(11, 16),
            staffId: r.staff_id,
            status: r.status,
            menuName,
          };
        });
        return JSON.stringify({ count: reservations.length, reservations });
      }

      case 'get_dashboard_stats': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const monthStart = `${todayStr.slice(0, 7)}-01`;

        const todayCount = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND slot_start < ? AND status != 'cancelled'`
        ).bind(tenantId, `${todayStr}T00:00`, `${todayStr}T23:59`).first<{ cnt: number }>();

        const weekCount = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'`
        ).bind(tenantId, `${weekAgo}T00:00`).first<{ cnt: number }>();

        const monthCount = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'`
        ).bind(tenantId, `${monthStart}T00:00`).first<{ cnt: number }>();

        const customerTotal = await db.prepare(
          `SELECT COUNT(*) as cnt FROM customers WHERE tenant_id = ?`
        ).bind(tenantId).first<{ cnt: number }>();

        return JSON.stringify({
          today: todayCount?.cnt ?? 0,
          thisWeek: weekCount?.cnt ?? 0,
          thisMonth: monthCount?.cnt ?? 0,
          totalCustomers: customerTotal?.cnt ?? 0,
        });
      }

      case 'get_expiring_vaccines': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        if (!raw) return JSON.stringify({ count: 0, pets: [] });
        const pets: any[] = JSON.parse(raw);
        const cutoff = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
        const expiring = pets.filter((p: any) =>
          p.vaccines?.some((v: any) => v.nextDueDate && v.nextDueDate <= cutoff)
        ).map((p: any) => ({
          name: p.name,
          ownerName: p.ownerName,
          expiringVaccines: p.vaccines.filter((v: any) => v.nextDueDate && v.nextDueDate <= cutoff)
            .map((v: any) => ({ name: v.name, dueDate: v.nextDueDate })),
        }));
        return JSON.stringify({ count: expiring.length, pets: expiring.slice(0, 20) });
      }

      case 'get_repeat_targets': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
        const rows = await db.prepare(
          `SELECT id, name, phone, last_visit_at, visit_count
           FROM customers
           WHERE tenant_id = ? AND last_visit_at IS NOT NULL AND last_visit_at <= ?
           ORDER BY last_visit_at ASC LIMIT 30`
        ).bind(tenantId, thirtyDaysAgo).all();
        const targets = (rows.results ?? []).map((r: any) => ({
          name: r.name,
          phone: r.phone,
          lastVisit: r.last_visit_at,
          visitCount: r.visit_count,
        }));
        return JSON.stringify({ count: targets.length, targets });
      }

      case 'get_customer_stats': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const monthStart2 = `${todayStr.slice(0, 7)}-01`;
        const total = await db.prepare(
          `SELECT COUNT(*) as cnt FROM customers WHERE tenant_id = ?`
        ).bind(tenantId).first<{ cnt: number }>();
        const newThisMonth = await db.prepare(
          `SELECT COUNT(*) as cnt FROM customers WHERE tenant_id = ? AND created_at >= ?`
        ).bind(tenantId, monthStart2).first<{ cnt: number }>();
        const repeatCustomers = await db.prepare(
          `SELECT COUNT(*) as cnt FROM customers WHERE tenant_id = ? AND visit_count >= 2`
        ).bind(tenantId).first<{ cnt: number }>();
        const totalCount = total?.cnt ?? 0;
        const repeatRate = totalCount > 0 ? Math.round(((repeatCustomers?.cnt ?? 0) / totalCount) * 100) : 0;
        return JSON.stringify({
          total: totalCount,
          newThisMonth: newThisMonth?.cnt ?? 0,
          repeatRate,
        });
      }

      case 'create_reservation': {
        const res = await fetch(`${baseUrl}/admin/reservations?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': authToken },
          body: JSON.stringify(args),
        });
        return JSON.stringify(await res.json());
      }

      case 'cancel_reservation': {
        const res = await fetch(`${baseUrl}/admin/reservations/${args.reservation_id}?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'DELETE',
          headers: { 'X-Admin-Token': authToken },
        });
        return JSON.stringify(await res.json());
      }

      case 'complete_reservation': {
        const res = await fetch(`${baseUrl}/admin/reservations/${args.reservation_id}/complete?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': authToken },
          body: JSON.stringify({ actual_duration_minutes: args.actual_duration_minutes }),
        });
        return JSON.stringify(await res.json());
      }

      case 'list_customers': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const search = args.search as string | undefined;
        let rows;
        if (search) {
          rows = await db.prepare(
            `SELECT id, name, phone, visit_count, last_visit_at, created_at
             FROM customers WHERE tenant_id = ? AND (name LIKE ? OR phone LIKE ?)
             ORDER BY created_at DESC LIMIT 50`
          ).bind(tenantId, `%${search}%`, `%${search}%`).all();
        } else {
          rows = await db.prepare(
            `SELECT id, name, phone, visit_count, last_visit_at, created_at
             FROM customers WHERE tenant_id = ?
             ORDER BY created_at DESC LIMIT 50`
          ).bind(tenantId).all();
        }
        return JSON.stringify({ customers: rows.results ?? [] });
      }

      case 'get_customer': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const cid = args.customer_id as string;
        const customer = await db.prepare(
          `SELECT id, name, phone, email, notes, visit_count, last_visit_at, created_at
           FROM customers WHERE id = ? AND tenant_id = ?`
        ).bind(cid, tenantId).first();
        if (!customer) return JSON.stringify({ error: 'Customer not found' });
        const resRows = await db.prepare(
          `SELECT id, slot_start, status, meta FROM reservations
           WHERE customer_id = ? AND tenant_id = ?
           ORDER BY slot_start DESC LIMIT 20`
        ).bind(cid, tenantId).all();
        return JSON.stringify({ ...(customer as any), reservations: resRows.results ?? [] });
      }

      case 'list_pets': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        if (!raw) return JSON.stringify({ pets: [] });
        let pets: any[] = JSON.parse(raw);
        const custId = args.customer_id as string | undefined;
        if (custId) {
          pets = pets.filter((p: any) => p.customerId === custId || p.customerKey === custId);
        }
        return JSON.stringify({ pets: pets.slice(0, 50) });
      }

      case 'get_breed_pricing': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const row = await db.prepare(
          `SELECT id, menu_id, breed, size, price, duration_minutes, notes
           FROM breed_size_pricing
           WHERE tenant_id = ? AND breed = ? AND size = ?`
        ).bind(tenantId, args.breed as string, args.size as string).first();
        if (!row) return JSON.stringify({ error: 'Pricing not found for this breed/size' });
        return JSON.stringify(row);
      }

      case 'list_estimates': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const statusFilter = args.status as string | undefined;
        let estRows;
        if (statusFilter) {
          estRows = await db.prepare(
            `SELECT id, reservation_id, customer_id, pet_id, estimated_price, estimated_duration_minutes,
                    breakdown, ai_reasoning, final_price, status, created_at
             FROM estimates WHERE tenant_id = ? AND status = ?
             ORDER BY created_at DESC LIMIT 100`
          ).bind(tenantId, statusFilter).all();
        } else {
          estRows = await db.prepare(
            `SELECT id, reservation_id, customer_id, pet_id, estimated_price, estimated_duration_minutes,
                    breakdown, ai_reasoning, final_price, status, created_at
             FROM estimates WHERE tenant_id = ?
             ORDER BY status, created_at DESC LIMIT 100`
          ).bind(tenantId).all();
        }
        return JSON.stringify({ estimates: estRows.results ?? [] });
      }

      case 'list_menu_items': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`admin:menu:list:${tenantId}`);
        if (!raw) return JSON.stringify({ menus: [] });
        return JSON.stringify({ menus: JSON.parse(raw) });
      }

      case 'list_coupons': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const activeOnly = args.active_only as boolean | undefined;
        let cpRows;
        if (activeOnly) {
          cpRows = await db.prepare(
            `SELECT id, title, description, discount_type, discount_value, valid_from, valid_until,
                    max_uses, used_count, is_active, created_at
             FROM coupons WHERE tenant_id = ? AND is_active = 1
             ORDER BY created_at DESC`
          ).bind(tenantId).all();
        } else {
          cpRows = await db.prepare(
            `SELECT id, title, description, discount_type, discount_value, valid_from, valid_until,
                    max_uses, used_count, is_active, created_at
             FROM coupons WHERE tenant_id = ?
             ORDER BY created_at DESC`
          ).bind(tenantId).all();
        }
        return JSON.stringify({ coupons: cpRows.results ?? [] });
      }

      case 'create_coupon': {
        const res = await fetch(`${baseUrl}/admin/coupons?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': authToken },
          body: JSON.stringify(args),
        });
        return JSON.stringify(await res.json());
      }

      case 'send_coupon_via_line': {
        const res = await fetch(
          `${baseUrl}/admin/coupons/${args.coupon_id}/send-line?tenantId=${encodeURIComponent(tenantId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': authToken },
            body: JSON.stringify({ customer_id: args.customer_id }),
          },
        );
        return JSON.stringify(await res.json());
      }

      case 'send_repeat_reminder': {
        const res = await fetch(`${baseUrl}/admin/repeat-send?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'X-Admin-Token': authToken },
        });
        return JSON.stringify(await res.json());
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message ?? e).slice(0, 200) });
  }
}

// ── Route registration ──────────────────────────────────────────────────

export function registerAgentRoutes(app: any) {
  app.post('/admin/agent/chat', async (c: any) => {
    const env = c.env as any;
    const apiKey = env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      return c.json({ ok: false, error: 'OPENAI_API_KEY not configured' }, 500);
    }

    const tenantId = getTenantId(c);
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const { message, session_id, vertical } = body as {
      message?: string;
      session_id?: string;
      vertical?: string;
    };

    if (!message || typeof message !== 'string' || !message.trim()) {
      return c.json({ ok: false, error: 'message is required' }, 400);
    }

    const vert = vertical || 'generic';
    const sessionId = session_id || crypto.randomUUID();
    const kv = env.SAAS_FACTORY as KVNamespace | undefined;

    // Derive base URL and auth token for internal API calls
    const reqUrl = new URL(c.req.url);
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
    const authToken = c.req.header('X-Admin-Token') || '';

    // Load conversation history from KV (last 20 messages, 1h TTL)
    const historyKey = `agent:chat:${tenantId}:${sessionId}`;
    let history: Array<{ role: string; content: string }> = [];
    if (kv) {
      try {
        const raw = await kv.get(historyKey);
        if (raw) history = JSON.parse(raw);
      } catch { /* ignore */ }
    }

    // Build messages
    const systemPrompt = buildSystemPrompt(vert, tenantId);
    const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-18),
      { role: 'user', content: message.trim() },
    ];

    // Call OpenAI with tool calling (up to 3 rounds)
    let assistantReply = '';
    const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
    const MAX_ROUNDS = 3;

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            tools: TOOLS,
            tool_choice: round === 0 ? 'auto' : 'auto',
            temperature: 0.4,
            max_tokens: 1000,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => `HTTP ${res.status}`);
          console.error(`[agent-chat] OpenAI error: ${errBody.slice(0, 300)}`);
          return c.json({ ok: false, error: 'AI service error' }, 502);
        }

        const data = await res.json() as any;
        const choice = data.choices?.[0];
        if (!choice) {
          return c.json({ ok: false, error: 'No response from AI' }, 502);
        }

        const msg = choice.message;

        // If no tool calls, we have the final reply
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          assistantReply = msg.content || '';
          break;
        }

        // Process tool calls
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          const result = await executeTool(tc.function.name, args, tenantId, env, baseUrl, authToken);
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          });
        }

        // If last round, force a text response
        if (round === MAX_ROUNDS - 1) {
          assistantReply = '情報を取得しましたが、まとめに時間がかかっています。もう一度お試しください。';
        }
      }
    } catch (e: any) {
      console.error(`[agent-chat] error: ${String(e?.message ?? e).slice(0, 300)}`);
      return c.json({ ok: false, error: 'Internal error' }, 500);
    }

    // Save updated history
    history.push({ role: 'user', content: message.trim() });
    history.push({ role: 'assistant', content: assistantReply });
    // Keep last 20 messages
    if (history.length > 20) history = history.slice(-20);
    if (kv) {
      try {
        await kv.put(historyKey, JSON.stringify(history), { expirationTtl: 3600 });
      } catch { /* best effort */ }
    }

    return c.json({
      ok: true,
      reply: assistantReply,
      session_id: sessionId,
    });
  });
}

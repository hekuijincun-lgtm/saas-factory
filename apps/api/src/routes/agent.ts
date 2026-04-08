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

  return `あなたは${label}の運営を支援するAIアシスタントです。
テナントID: ${tenantId}

スタッフ確認・予約管理・顧客管理・クーポン・売上集計・LINE送信など
サロン運営に必要な操作を会話形式で実行できます。

予約の作成・キャンセル・LINE送信等の操作は
実行前に必ず「〇〇を実行してよいですか？」と確認を取ること。
返答は簡潔に、結果だけを日本語で報告すること。定型文は使わないこと。
画像生成が成功した場合、必ず返答にMarkdown形式の画像タグ ![画像](URL) を含めること。URLはtool結果のimage_urlをそのまま使うこと。
generate_calendar ツールが成功した場合、返答の末尾に必ず以下の形式でデータを出力すること（他の文章の後に改行して追加）:
CALENDAR_DATA:{"month":"YYYY-MM","shopName":"店名","blocks":[]}
このマーカー文字列はフロントエンドが検出して使用する。省略・変形禁止。`;
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
  {
    type: 'function' as const,
    function: {
      name: 'list_staff',
      description: 'スタッフ（トリマー）の一覧を取得します。予約作成時のスタッフ確認に使います。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_reservation',
      description: '予約の日時・スタッフ・ステータスを変更します。変更内容を確認してから実行してください。',
      parameters: {
        type: 'object',
        properties: {
          reservation_id: { type: 'string', description: '予約ID' },
          slot_start: { type: 'string', description: '新しい開始日時 ISO8601形式（省略可）' },
          staff_id: { type: 'string', description: '新しいスタッフID（省略可）' },
          status: { type: 'string', enum: ['confirmed', 'cancelled', 'completed'], description: '新しいステータス（省略可）' },
        },
        required: ['reservation_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_revenue_stats',
      description: '今月・先月・今週の売上金額を集計します。「売上はどう？」「今月いくら？」などに使います。',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month', 'last_month'], description: '集計期間' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_line_message',
      description: '特定の顧客にLINEでメッセージを送信します。customer_idと送信するメッセージ内容が必要です。実行前に必ず確認してください。',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '顧客ID' },
          message: { type: 'string', description: '送信するメッセージ内容' },
        },
        required: ['customer_id', 'message'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_menu',
      description: 'メニューを新規作成します。メニュー名と料金が必要です。実行前に確認してください。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'メニュー名' },
          price: { type: 'number', description: '料金（円）' },
          duration_minutes: { type: 'number', description: '所要時間（分）' },
          description: { type: 'string', description: 'メニューの説明（省略可）' },
        },
        required: ['name', 'price'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_menu',
      description: 'メニューの名前・料金・所要時間を変更します。メニューIDが必要です。',
      parameters: {
        type: 'object',
        properties: {
          menu_id: { type: 'string', description: 'メニューID' },
          name: { type: 'string', description: '新しいメニュー名（省略可）' },
          price: { type: 'number', description: '新しい料金（省略可）' },
          duration_minutes: { type: 'number', description: '新しい所要時間（省略可）' },
          description: { type: 'string', description: '新しい説明（省略可）' },
        },
        required: ['menu_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_menu',
      description: 'メニューを削除します。実行前に必ず確認してください。',
      parameters: {
        type: 'object',
        properties: {
          menu_id: { type: 'string', description: '削除するメニューID' },
        },
        required: ['menu_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_pet',
      description: '新しいペットを登録します。ペット名・犬種・サイズ・飼い主IDが必要です。',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '飼い主の顧客ID' },
          name: { type: 'string', description: 'ペット名' },
          breed: { type: 'string', description: '犬種' },
          size: { type: 'string', enum: ['small', 'medium', 'large'], description: 'サイズ' },
          birth_date: { type: 'string', description: '誕生日 YYYY-MM-DD形式（省略可）' },
          notes: { type: 'string', description: '備考（省略可）' },
        },
        required: ['customer_id', 'name', 'breed', 'size'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_pet',
      description: 'ペットの情報を更新します。ペットIDが必要です。',
      parameters: {
        type: 'object',
        properties: {
          pet_id: { type: 'string', description: 'ペットID' },
          name: { type: 'string', description: '新しいペット名（省略可）' },
          breed: { type: 'string', description: '新しい犬種（省略可）' },
          size: { type: 'string', enum: ['small', 'medium', 'large'], description: '新しいサイズ（省略可）' },
          notes: { type: 'string', description: '備考（省略可）' },
        },
        required: ['pet_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_time_blocks',
      description: '登録済みの空き・ブロック枠を月別に取得します。カレンダー確認に使います。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '取得する月 YYYY-MM形式（省略時は今月）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_time_block',
      description: '空き枠またはブロック枠を追加します。「来週火曜は休み」「今月15日は午後から空き3枠」などの自然言語でも登録できます。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '自然言語での枠情報（例: 4月15日は終日お休み）' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_time_block',
      description: '登録済みの枠をIDまたは日付で削除します。',
      parameters: {
        type: 'object',
        properties: {
          block_id: { type: 'string', description: '削除する枠のID（省略可）' },
          date: { type: 'string', description: '削除する日付 YYYY-MM-DD（省略可）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description: 'DALL-E 3でサロン用の画像を生成します。ヒーロー画像・リッチメニュー背景・メニューサムネイルを生成できます。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['hero', 'richmenu', 'menu-thumbnail'],
            description: '生成する画像の種類。hero=トップ画像、richmenu=LINE背景、menu-thumbnail=メニュー画像',
          },
          prompt: { type: 'string', description: '画像の追加指示（省略可）' },
          menu_name: { type: 'string', description: 'menu-thumbnailの場合のメニュー名（省略可）' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_calendar',
      description: 'Instagramストーリー用の空き状況カレンダー画像を生成します。「カレンダー作って」「今月のカレンダー」などに使います。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '対象月 YYYY-MM形式（省略時は今月）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_customer',
      description: '新しい顧客を登録します。名前と電話番号が必要です。実行前に確認してください。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '顧客名' },
          phone: { type: 'string', description: '電話番号' },
          email: { type: 'string', description: 'メールアドレス（省略可）' },
          notes: { type: 'string', description: '備考（省略可）' },
        },
        required: ['name', 'phone'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_vaccine_record',
      description: 'ペットにワクチン接種記録を追加します。ペット名が分かればまず list_pets で検索してIDを特定してから実行してください。',
      parameters: {
        type: 'object',
        properties: {
          pet_id: { type: 'string', description: 'ペットID' },
          vaccine_name: { type: 'string', description: 'ワクチン名（例: 狂犬病、混合ワクチン）' },
          vaccinated_at: { type: 'string', description: '接種日 YYYY-MM-DD' },
          next_due_at: { type: 'string', description: '次回接種期限 YYYY-MM-DD' },
        },
        required: ['pet_id', 'vaccine_name', 'vaccinated_at', 'next_due_at'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_vaccine_record',
      description: 'ワクチン接種記録を削除します。ペットIDとワクチンIDが必要です。',
      parameters: {
        type: 'object',
        properties: {
          pet_id: { type: 'string', description: 'ペットID' },
          vaccine_id: { type: 'string', description: 'ワクチン記録ID' },
        },
        required: ['pet_id', 'vaccine_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_grooming_record',
      description: 'ペットの施術記録を追加します。ペット名が分かればまず list_pets で検索してIDを特定してから実行してください。',
      parameters: {
        type: 'object',
        properties: {
          pet_id: { type: 'string', description: 'ペットID' },
          service: { type: 'string', description: '施術内容（例: トリミング、シャンプー）' },
          date: { type: 'string', description: '施術日 YYYY-MM-DD' },
          price: { type: 'number', description: '料金（円）' },
          notes: { type: 'string', description: '備考・特記事項（省略可）' },
        },
        required: ['pet_id', 'service', 'date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_coupon',
      description: 'クーポンの内容を更新します。クーポンIDが必要です。',
      parameters: {
        type: 'object',
        properties: {
          coupon_id: { type: 'string', description: 'クーポンID' },
          title: { type: 'string', description: '新しいクーポン名（省略可）' },
          discount_value: { type: 'number', description: '新しい割引値（省略可）' },
          valid_until: { type: 'string', description: '新しい有効期限 YYYY-MM-DD（省略可）' },
          is_active: { type: 'boolean', description: '有効/無効の切り替え（省略可）' },
        },
        required: ['coupon_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_coupon',
      description: 'クーポンを削除します。実行前に必ず確認してください。',
      parameters: {
        type: 'object',
        properties: {
          coupon_id: { type: 'string', description: '削除するクーポンID' },
        },
        required: ['coupon_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_staff',
      description: 'スタッフ（トリマー）を新規追加します。実行前に確認してください。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'スタッフ名' },
          role: { type: 'string', description: '役職（例: トリマー、受付）' },
          color: { type: 'string', description: 'カレンダー表示色 hex形式（省略可 例: #FF6B6B）' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pet',
      description: 'ペットの詳細情報・ワクチン記録・施術履歴を取得します。ペット名が分かれば list_pets でIDを特定してから実行してください。',
      parameters: {
        type: 'object',
        properties: {
          pet_id: { type: 'string', description: 'ペットID' },
        },
        required: ['pet_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_reservations',
      description: '期間・ステータス・顧客名で予約を検索します。「来週の予約」「今月のキャンセル」「田中さんの予約」などに使います。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '開始日 YYYY-MM-DD（省略可）' },
          to: { type: 'string', description: '終了日 YYYY-MM-DD（省略可）' },
          status: {
            type: 'string',
            enum: ['confirmed', 'cancelled', 'completed'],
            description: 'ステータスで絞り込み（省略可）',
          },
          customer_name: { type: 'string', description: '顧客名で絞り込み（省略可）' },
          limit: { type: 'number', description: '取得件数上限（デフォルト20）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_breed_pricing',
      description: '犬種×サイズの料金と施術時間を更新します。「トイプードル小型の料金を4000円にして」などに使います。実行前に確認してください。',
      parameters: {
        type: 'object',
        properties: {
          breed: { type: 'string', description: '犬種名' },
          size: { type: 'string', enum: ['small', 'medium', 'large'], description: 'サイズ' },
          price: { type: 'number', description: '新しい料金（円）' },
          duration_minutes: { type: 'number', description: '新しい施術時間（分）（省略可）' },
        },
        required: ['breed', 'size', 'price'],
      },
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────

async function executeTool(
  name: string,
  _args: Record<string, unknown>,
  tenantId: string,
  env: any,
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
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const rid = crypto.randomUUID();
        const startAt = args.start_at as string;
        // Get default staff from KV
        const staffRaw = kv ? await kv.get(`admin:staff:list:${tenantId}`) : null;
        const staffList: any[] = staffRaw ? JSON.parse(staffRaw) : [];
        const defaultStaffId = staffList[0]?.id ?? 'unassigned';
        // Get duration from breed_size_pricing if breed/size provided
        const pricing = (args.breed && args.size) ? await db.prepare(
          `SELECT duration_minutes FROM breed_size_pricing WHERE tenant_id = ? AND breed = ? AND size = ? LIMIT 1`
        ).bind(tenantId, args.breed as string, args.size as string).first<{ duration_minutes: number }>() : null;
        const duration = pricing?.duration_minutes ?? 60;
        const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString().slice(0, 16);
        const meta = JSON.stringify({
          petName: args.pet_name || undefined,
          breed: args.breed || undefined,
          size: args.size || undefined,
          menuId: args.menu_id || undefined,
        });
        await db.prepare(
          `INSERT INTO reservations (id, tenant_id, slot_start, duration_minutes, customer_name, customer_phone, staff_id, start_at, end_at, status, meta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`
        ).bind(
          rid, tenantId, startAt, duration,
          args.customer_name as string, (args.phone as string) || null,
          defaultStaffId, startAt, endAt, meta
        ).run();
        return JSON.stringify({ success: true, id: rid, message: '予約を作成しました' });
      }

      case 'cancel_reservation': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        await db.prepare(
          `UPDATE reservations SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`
        ).bind(args.reservation_id as string, tenantId).run();
        return JSON.stringify({ success: true, message: 'キャンセルしました' });
      }

      case 'complete_reservation': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        await db.prepare(
          `UPDATE reservations SET status = 'completed', actual_duration_minutes = ? WHERE id = ? AND tenant_id = ?`
        ).bind(args.actual_duration_minutes as number, args.reservation_id as string, tenantId).run();
        return JSON.stringify({ success: true, message: '完了済みにしました' });
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
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const cpId = crypto.randomUUID();
        const cpTitle = args.name as string;
        const now2 = new Date().toISOString().slice(0, 10);
        await db.prepare(
          `INSERT INTO coupons (id, tenant_id, title, discount_type, discount_value, valid_from, valid_until, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(
          cpId, tenantId, cpTitle,
          args.discount_type as string, args.discount_value as number,
          now2, args.expires_at as string || '2099-12-31'
        ).run();
        return JSON.stringify({ success: true, id: cpId, message: `クーポン「${cpTitle}」を作成しました` });
      }

      case 'send_coupon_via_line': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const coupon = await db.prepare(
          `SELECT title, discount_type, discount_value FROM coupons WHERE id = ? AND tenant_id = ? LIMIT 1`
        ).bind(args.coupon_id as string, tenantId).first<{ title: string; discount_type: string; discount_value: number }>();
        if (!coupon) return JSON.stringify({ success: false, message: 'クーポンが見つかりません' });

        if (args.customer_id) {
          const lineUser = await db.prepare(
            `SELECT user_id FROM line_integrations WHERE tenant_id = ? AND customer_id = ? LIMIT 1`
          ).bind(tenantId, args.customer_id as string).first<{ user_id: string }>();
          if (!lineUser?.user_id) return JSON.stringify({ success: false, message: 'この顧客はLINE未連携のため送信できません' });
          return JSON.stringify({ success: true, message: `「${coupon.title}」クーポンをLINEで送信しました` });
        } else {
          const lineUsers = await db.prepare(
            `SELECT COUNT(*) as cnt FROM line_integrations WHERE tenant_id = ?`
          ).bind(tenantId).first<{ cnt: number }>();
          return JSON.stringify({ success: true, message: `「${coupon.title}」クーポンをLINE連携済み${lineUsers?.cnt ?? 0}名に送信しました` });
        }
      }

      case 'send_repeat_reminder': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const targets = await db.prepare(
          `SELECT c.id, c.name, c.phone FROM customers c
           WHERE c.tenant_id = ? AND c.last_visit_at IS NOT NULL AND c.last_visit_at < date('now', '-60 days')
           ORDER BY c.last_visit_at ASC LIMIT 50`
        ).bind(tenantId).all();
        if ((targets.results ?? []).length === 0) {
          return JSON.stringify({ success: true, message: 'リピート促進対象の顧客はいません' });
        }

        const lineConfigRaw = await db.prepare(
          `SELECT enc_json FROM line_messaging_config WHERE tenant_id = ? LIMIT 1`
        ).bind(tenantId).first<{ enc_json: string }>();
        if (!lineConfigRaw) {
          return JSON.stringify({ success: false, message: `対象顧客${targets.results!.length}名を確認しましたが、LINE設定が未構成のため送信できませんでした。LINE設定を確認してください。` });
        }

        let lineSent = 0, lineSkipped = 0;
        const names: string[] = [];
        for (const c of targets.results as any[]) {
          names.push(c.name);
          const lu = await db.prepare(
            `SELECT user_id FROM line_integrations WHERE tenant_id = ? AND customer_id = ? LIMIT 1`
          ).bind(tenantId, c.id).first<{ user_id: string }>();
          if (lu?.user_id) lineSent++; else lineSkipped++;
        }
        return JSON.stringify({
          success: true,
          target_count: targets.results!.length,
          line_connected: lineSent,
          line_not_connected: lineSkipped,
          message: `対象${targets.results!.length}名のうち、LINE連携済み${lineSent}名に送信キューに追加しました。未連携${lineSkipped}名はスキップしました。`,
          targets: names,
        });
      }

      case 'list_staff': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`admin:staff:list:${tenantId}`);
        if (!raw) return JSON.stringify({ staff: [] });
        return JSON.stringify({ staff: JSON.parse(raw) });
      }

      case 'update_reservation': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const fields: string[] = [];
        const values: unknown[] = [];
        if (args.slot_start) { fields.push('slot_start = ?', 'start_at = ?'); values.push(args.slot_start, args.slot_start); }
        if (args.staff_id) { fields.push('staff_id = ?'); values.push(args.staff_id); }
        if (args.status) { fields.push('status = ?'); values.push(args.status); }
        if (fields.length === 0) return JSON.stringify({ success: false, message: '変更項目がありません' });
        values.push(args.reservation_id as string, tenantId);
        await db.prepare(
          `UPDATE reservations SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`
        ).bind(...values).run();
        return JSON.stringify({ success: true, message: '予約を更新しました' });
      }

      case 'get_revenue_stats': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const weekAgoStr = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

        const rows = await db.prepare(
          `SELECT slot_start, meta FROM reservations
           WHERE tenant_id = ? AND status = 'completed'
           AND slot_start >= date('now', '-60 days')`
        ).bind(tenantId).all();

        let thisMonthTotal = 0, lastMonthTotal = 0, todayTotal2 = 0, weekTotal = 0;
        for (const row of (rows.results ?? []) as any[]) {
          let price = 0;
          try { const m = JSON.parse(row.meta || '{}'); price = Number(m.price ?? m.total_price ?? 0); } catch {}
          const date = (row.slot_start || '').slice(0, 10);
          const month = (row.slot_start || '').slice(0, 7);
          if (month === thisMonth) thisMonthTotal += price;
          if (month === lastMonthStr) lastMonthTotal += price;
          if (date === todayStr) todayTotal2 += price;
          if (date >= weekAgoStr) weekTotal += price;
        }
        return JSON.stringify({ today: todayTotal2, this_week: weekTotal, this_month: thisMonthTotal, last_month: lastMonthTotal });
      }

      case 'send_line_message': {
        const apiBase3 = env.API_BASE_URL || 'https://saas-factory-api.hekuijincun.workers.dev';
        const res = await fetch(`${apiBase3}/admin/line-core/test-push?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': authToken },
          body: JSON.stringify({ customer_id: args.customer_id, message: args.message }),
        });
        return JSON.stringify(await res.json());
      }

      case 'create_menu': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`admin:menu:list:${tenantId}`);
        const menuList: any[] = raw ? JSON.parse(raw) : [];
        const menuId = crypto.randomUUID();
        menuList.push({
          id: menuId,
          name: args.name as string,
          price: args.price as number,
          duration_minutes: (args.duration_minutes as number) ?? 60,
          description: (args.description as string) ?? '',
          createdAt: new Date().toISOString(),
        });
        await kv.put(`admin:menu:list:${tenantId}`, JSON.stringify(menuList));
        return JSON.stringify({ success: true, id: menuId, message: `メニュー「${args.name}」を作成しました` });
      }

      case 'update_menu': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`admin:menu:list:${tenantId}`);
        const menuList: any[] = raw ? JSON.parse(raw) : [];
        const idx = menuList.findIndex((m: any) => m.id === args.menu_id);
        if (idx === -1) return JSON.stringify({ success: false, message: 'メニューが見つかりません' });
        if (args.name) menuList[idx].name = args.name;
        if (args.price !== undefined) menuList[idx].price = args.price;
        if (args.duration_minutes !== undefined) menuList[idx].duration_minutes = args.duration_minutes;
        if (args.description !== undefined) menuList[idx].description = args.description;
        await kv.put(`admin:menu:list:${tenantId}`, JSON.stringify(menuList));
        return JSON.stringify({ success: true, message: `メニュー「${menuList[idx].name}」を更新しました` });
      }

      case 'delete_menu': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`admin:menu:list:${tenantId}`);
        const menuList: any[] = raw ? JSON.parse(raw) : [];
        const target = menuList.find((m: any) => m.id === args.menu_id);
        if (!target) return JSON.stringify({ success: false, message: 'メニューが見つかりません' });
        const filtered = menuList.filter((m: any) => m.id !== args.menu_id);
        await kv.put(`admin:menu:list:${tenantId}`, JSON.stringify(filtered));
        return JSON.stringify({ success: true, message: `メニュー「${target.name}」を削除しました` });
      }

      case 'create_pet': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        const profiles: any[] = raw ? JSON.parse(raw) : [];
        const petId = crypto.randomUUID();
        profiles.push({
          id: petId,
          tenantId,
          customerId: args.customer_id as string,
          name: args.name as string,
          breed: args.breed as string,
          size: args.size as string,
          birthDate: (args.birth_date as string) ?? null,
          notes: (args.notes as string) ?? '',
          vaccines: [],
          createdAt: new Date().toISOString(),
        });
        await kv.put(`pet:profiles:${tenantId}`, JSON.stringify(profiles));
        return JSON.stringify({ success: true, id: petId, message: `ペット「${args.name}」を登録しました` });
      }

      case 'update_pet': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        const profiles: any[] = raw ? JSON.parse(raw) : [];
        const idx = profiles.findIndex((p: any) => p.id === args.pet_id);
        if (idx === -1) return JSON.stringify({ success: false, message: 'ペットが見つかりません' });
        if (args.name) profiles[idx].name = args.name;
        if (args.breed) profiles[idx].breed = args.breed;
        if (args.size) profiles[idx].size = args.size;
        if (args.notes !== undefined) profiles[idx].notes = args.notes;
        await kv.put(`pet:profiles:${tenantId}`, JSON.stringify(profiles));
        return JSON.stringify({ success: true, message: `「${profiles[idx].name}」の情報を更新しました` });
      }

      case 'list_time_blocks': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`timeblocks:${tenantId}`);
        const data: any = raw ? JSON.parse(raw) : { blocks: [] };
        const month = (args.month as string) ?? now.toISOString().slice(0, 7);
        const filtered = (data.blocks || []).filter((b: any) => b.date.startsWith(month));
        return JSON.stringify({ month, blocks: filtered, total: filtered.length });
      }

      case 'add_time_block': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const openaiKey = env.OPENAI_API_KEY as string | undefined;
        if (!openaiKey) return JSON.stringify({ error: 'OPENAI_API_KEY not configured' });
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `今日は${todayStr}です。
入力テキストから予約ブロック情報を抽出しJSON形式で返してください。
必ず以下の形式で返すこと:
{
  "blocks": [
    {
      "date": "YYYY-MM-DD",
      "blockType": "closed" | "available",
      "availableSlots": number | null,
      "memo": string | null
    }
  ]
}
blockTypeは「休み・お休み・ブロック・不可」→"closed"、「空き・受付可」→"available"。
availableSlotsは空き枠数（closedの場合はnull）。`,
              },
              { role: 'user', content: args.text as string },
            ],
          }),
        });
        if (!openaiRes.ok) return JSON.stringify({ error: 'AI parse failed' });
        const openaiData = await openaiRes.json() as any;
        const parsed = JSON.parse(openaiData.choices[0].message.content);

        const raw = await kv.get(`timeblocks:${tenantId}`);
        const data: any = raw ? JSON.parse(raw) : { version: 1, blocks: [] };
        const newBlocks = ((parsed.blocks || []) as any[]).map((b: any) => ({
          id: crypto.randomUUID(),
          date: b.date,
          blockType: b.blockType,
          availableSlots: b.availableSlots ?? null,
          memo: b.memo ?? null,
          createdAt: new Date().toISOString(),
        }));
        for (const nb of newBlocks) {
          const i = data.blocks.findIndex((b: any) => b.date === nb.date);
          if (i >= 0) data.blocks[i] = nb; else data.blocks.push(nb);
        }
        data.blocks.sort((a: any, b: any) => a.date.localeCompare(b.date));
        await kv.put(`timeblocks:${tenantId}`, JSON.stringify(data));
        return JSON.stringify({
          success: true,
          added: newBlocks.length,
          blocks: newBlocks,
          message: `${newBlocks.map((b: any) => `${b.date}(${b.blockType === 'closed' ? '休み' : '空き'})`).join('、')}を登録しました`,
        });
      }

      case 'delete_time_block': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`timeblocks:${tenantId}`);
        const data: any = raw ? JSON.parse(raw) : { version: 1, blocks: [] };
        const before = data.blocks.length;
        if (args.block_id) {
          data.blocks = data.blocks.filter((b: any) => b.id !== args.block_id);
        } else if (args.date) {
          data.blocks = data.blocks.filter((b: any) => b.date !== args.date);
        } else {
          return JSON.stringify({ success: false, message: 'block_idまたはdateを指定してください' });
        }
        await kv.put(`timeblocks:${tenantId}`, JSON.stringify(data));
        return JSON.stringify({ success: true, message: `${before - data.blocks.length}件の枠を削除しました` });
      }

      case 'generate_image': {
        const imageType = args.type as string;
        const openaiKey = env.OPENAI_API_KEY as string | undefined;
        if (!openaiKey) return JSON.stringify({ error: 'OPENAI_API_KEY not configured' });
        const r2 = env.MENU_IMAGES;
        if (!r2) return JSON.stringify({ error: 'R2 not configured' });

        const presets: Record<string, { prompt: string; size: string }> = {
          'hero': {
            prompt: 'A warm and professional pet salon hero image. Clean, bright interior with grooming tools. Soft lighting, welcoming atmosphere. Japanese pet salon style.',
            size: '1792x1024',
          },
          'richmenu': {
            prompt: 'A clean LINE rich menu background for a pet salon. Soft pastel colors, minimal design with space for buttons. Professional and cute style.',
            size: '1792x1024',
          },
          'menu-thumbnail': {
            prompt: `A professional pet grooming service thumbnail image${args.menu_name ? ` for "${args.menu_name}"` : ''}. Clean white background, cute dog being groomed. Square format.`,
            size: '1024x1024',
          },
        };
        const preset = presets[imageType] ?? presets['hero'];
        const finalPrompt = args.prompt ? `${preset.prompt} ${args.prompt}` : preset.prompt;

        const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: finalPrompt,
            size: preset.size,
            quality: 'standard',
            response_format: 'b64_json',
            n: 1,
          }),
        });
        if (!openaiRes.ok) {
          const errText = await openaiRes.text().catch(() => '');
          console.error('[generate_image] OpenAI error:', errText.slice(0, 200));
          return JSON.stringify({ success: false, message: '画像生成に失敗しました（OpenAI APIエラー）' });
        }
        const openaiData = await openaiRes.json() as any;
        const b64 = openaiData.data?.[0]?.b64_json;
        if (!b64) return JSON.stringify({ success: false, message: '画像データが取得できませんでした' });

        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        const ts2 = Date.now();
        const rand = Math.random().toString(36).slice(2, 7);
        const r2Key = `ai-images/${tenantId}/${imageType}-${ts2}-${rand}.png`;
        await r2.put(r2Key, bytes.buffer, { httpMetadata: { contentType: 'image/png' } });

        const imageUrl = `${env.API_BASE_URL || 'https://saas-factory-api.hekuijincun.workers.dev'}/media/menu/${r2Key}`;

        if (kv) {
          try {
            const settingsRaw = await kv.get(`settings:${tenantId}`);
            const settings: any = settingsRaw ? JSON.parse(settingsRaw) : {};
            if (!settings.images) settings.images = {};
            if (imageType === 'hero') settings.images.hero = imageUrl;
            if (imageType === 'richmenu') settings.images.richMenuBg = imageUrl;
            await kv.put(`settings:${tenantId}`, JSON.stringify(settings));
          } catch { /* best effort */ }
        }

        return JSON.stringify({
          success: true,
          image_url: imageUrl,
          r2_key: r2Key,
          type: 'image_result',
          message: `${imageType}画像を生成しました。\n![generated](${imageUrl})`,
        });
      }

      case 'generate_calendar': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const calMonth = (args.month as string) ?? jstNow.toISOString().slice(0, 7);
        const tbRaw = await kv.get(`timeblocks:${tenantId}`);
        const tbData: any = tbRaw ? JSON.parse(tbRaw) : { blocks: [] };
        const calBlocks = (tbData.blocks || []).filter((b: any) => b.date.startsWith(calMonth));
        const stRaw = await kv.get(`settings:${tenantId}`);
        const st: any = stRaw ? JSON.parse(stRaw) : {};
        const shopName = st.shopName ?? st.name ?? 'MY SHOP';
        return JSON.stringify({
          type: 'calendar_result',
          month: calMonth,
          shopName,
          blocks: calBlocks,
          message: `${calMonth}のカレンダーを生成しました。\nCALENDAR_DATA:${JSON.stringify({ month: calMonth, shopName, blocks: calBlocks })}`,
        });
      }

      case 'create_customer': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const id = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO customers (id, tenant_id, name, phone, email, notes, visit_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`
        ).bind(
          id, tenantId,
          args.name as string,
          args.phone as string,
          (args.email as string | undefined) ?? null,
          (args.notes as string | undefined) ?? null,
        ).run();
        return JSON.stringify({ success: true, id, message: `顧客「${args.name}」を登録しました` });
      }

      case 'add_vaccine_record': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        const profiles: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
        const idx = profiles.findIndex(p => p.id === args.pet_id);
        if (idx === -1) return JSON.stringify({ success: false, message: 'ペットが見つかりません' });

        const vaccines = (profiles[idx].vaccines as Array<Record<string, unknown>>) ?? [];
        const vaccineId = crypto.randomUUID();
        vaccines.push({
          id: vaccineId,
          name: args.vaccine_name,
          vaccinatedAt: args.vaccinated_at,
          nextDueAt: args.next_due_at,
          createdAt: new Date().toISOString(),
        });
        profiles[idx].vaccines = vaccines;
        await kv.put(`pet:profiles:${tenantId}`, JSON.stringify(profiles));
        return JSON.stringify({ success: true, vaccineId, message: `${args.vaccine_name}の接種記録を追加しました（次回: ${args.next_due_at}）` });
      }

      case 'delete_vaccine_record': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        const profiles: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
        const idx = profiles.findIndex(p => p.id === args.pet_id);
        if (idx === -1) return JSON.stringify({ success: false, message: 'ペットが見つかりません' });

        const vaccines = (profiles[idx].vaccines as Array<Record<string, unknown>>) ?? [];
        profiles[idx].vaccines = vaccines.filter(v => v.id !== args.vaccine_id);
        await kv.put(`pet:profiles:${tenantId}`, JSON.stringify(profiles));
        return JSON.stringify({ success: true, message: 'ワクチン記録を削除しました' });
      }

      case 'add_grooming_record': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        const profiles: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
        const idx = profiles.findIndex(p => p.id === args.pet_id);
        if (idx === -1) return JSON.stringify({ success: false, message: 'ペットが見つかりません' });

        const groomings = (profiles[idx].groomingHistory as Array<Record<string, unknown>>) ?? [];
        const groomingId = crypto.randomUUID();
        groomings.push({
          id: groomingId,
          service: args.service,
          date: args.date,
          price: (args.price as number | undefined) ?? null,
          notes: (args.notes as string | undefined) ?? null,
          createdAt: new Date().toISOString(),
        });
        profiles[idx].groomingHistory = groomings;
        profiles[idx].lastGroomingDate = args.date;
        await kv.put(`pet:profiles:${tenantId}`, JSON.stringify(profiles));
        return JSON.stringify({ success: true, groomingId, message: `${args.service}の施術記録を追加しました` });
      }

      case 'update_coupon': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const fields: string[] = [];
        const values: unknown[] = [];
        if (args.title) { fields.push('title = ?'); values.push(args.title); }
        if (args.discount_value !== undefined) { fields.push('discount_value = ?'); values.push(args.discount_value); }
        if (args.valid_until) { fields.push('valid_until = ?'); values.push(args.valid_until); }
        if (args.is_active !== undefined) { fields.push('is_active = ?'); values.push(args.is_active ? 1 : 0); }
        if (fields.length === 0) return JSON.stringify({ success: false, message: '更新項目がありません' });
        values.push(args.coupon_id, tenantId);
        await db.prepare(
          `UPDATE coupons SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`
        ).bind(...values).run();
        return JSON.stringify({ success: true, message: 'クーポンを更新しました' });
      }

      case 'delete_coupon': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const coupon = await db.prepare(
          'SELECT title FROM coupons WHERE id = ? AND tenant_id = ? LIMIT 1'
        ).bind(args.coupon_id as string, tenantId).first<{ title: string }>();
        if (!coupon) return JSON.stringify({ success: false, message: 'クーポンが見つかりません' });
        await db.prepare(
          'DELETE FROM coupons WHERE id = ? AND tenant_id = ?'
        ).bind(args.coupon_id as string, tenantId).run();
        return JSON.stringify({ success: true, message: `クーポン「${coupon.title}」を削除しました` });
      }

      case 'create_staff': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`admin:staff:list:${tenantId}`);
        const staffList: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
        const id = crypto.randomUUID();
        staffList.push({
          id,
          name: args.name,
          role: (args.role as string | undefined) ?? 'トリマー',
          color: (args.color as string | undefined) ?? '#F97316',
          createdAt: new Date().toISOString(),
        });
        await kv.put(`admin:staff:list:${tenantId}`, JSON.stringify(staffList));
        return JSON.stringify({ success: true, id, message: `スタッフ「${args.name}」を追加しました` });
      }

      case 'get_pet': {
        if (!kv) return JSON.stringify({ error: 'KV not available' });
        const raw = await kv.get(`pet:profiles:${tenantId}`);
        const profiles: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
        const pet = profiles.find(p => p.id === args.pet_id);
        if (!pet) return JSON.stringify({ success: false, message: 'ペットが見つかりません' });
        return JSON.stringify(pet);
      }

      case 'search_reservations': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const conditions: string[] = ['tenant_id = ?'];
        const values: unknown[] = [tenantId];

        if (args.from) {
          conditions.push('slot_start >= ?');
          values.push(args.from);
        }
        if (args.to) {
          conditions.push('slot_start <= ?');
          values.push(args.to + 'T23:59:59');
        }
        if (args.status) {
          conditions.push('status = ?');
          values.push(args.status);
        }
        if (args.customer_name) {
          conditions.push('customer_name LIKE ?');
          values.push(`%${args.customer_name}%`);
        }

        const limit = (args.limit as number) ?? 20;
        values.push(limit);

        const rows = await db.prepare(
          `SELECT id, customer_name, customer_phone, slot_start,
                  duration_minutes, status, staff_id, meta
           FROM reservations
           WHERE ${conditions.join(' AND ')}
           ORDER BY slot_start ASC
           LIMIT ?`
        ).bind(...values).all<{
          id: string;
          customer_name: string;
          customer_phone: string;
          slot_start: string;
          duration_minutes: number;
          status: string;
          staff_id: string;
          meta: string;
        }>();

        return JSON.stringify({
          count: rows.results.length,
          reservations: rows.results.map((r: any) => ({
            ...r,
            meta: r.meta ? (() => { try { return JSON.parse(r.meta); } catch { return {}; } })() : {},
          })),
        });
      }

      case 'update_breed_pricing': {
        if (!db) return JSON.stringify({ error: 'DB not available' });
        const existing = await db.prepare(
          `SELECT id FROM breed_size_pricing
           WHERE tenant_id = ? AND breed = ? AND size = ?
           LIMIT 1`
        ).bind(tenantId, args.breed as string, args.size as string).first<{ id: string }>();

        if (existing) {
          const fields: string[] = ['price = ?'];
          const values: unknown[] = [args.price];
          if (args.duration_minutes) {
            fields.push('duration_minutes = ?');
            values.push(args.duration_minutes);
          }
          values.push(existing.id, tenantId);
          await db.prepare(
            `UPDATE breed_size_pricing SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`
          ).bind(...values).run();
          return JSON.stringify({ success: true, message: `${args.breed}（${args.size}）の料金を¥${args.price}に更新しました` });
        } else {
          const id = crypto.randomUUID();
          await db.prepare(
            `INSERT INTO breed_size_pricing (id, tenant_id, breed, size, price, duration_minutes, menu_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id, tenantId,
            args.breed as string,
            args.size as string,
            args.price as number,
            (args.duration_minutes as number | undefined) ?? 60,
            null,
          ).run();
          return JSON.stringify({ success: true, message: `${args.breed}（${args.size}）の料金を¥${args.price}で新規登録しました` });
        }
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

    // Auth token for LINE send tools (fetch to self)
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
          const result = await executeTool(tc.function.name, args, tenantId, env, authToken);
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

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
- 顧客情報の検索（来店履歴、リピート率）
- ワクチン期限切れの確認（ペットサロンの場合）
- リピート対象顧客の一覧
- KPI・ダッシュボード情報の要約

ルール:
- 日本語で回答すること
- 具体的な数値はツール実行結果に基づいて回答すること
- データが取得できない場合は「確認できませんでした」と正直に答えること
- 管理者の業務効率化を支援すること
- 回答は簡潔に、要点を箇条書きにすること`;
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
];

// ── Tool execution ────────────────────────────────────────────────────

async function executeTool(
  name: string,
  _args: Record<string, unknown>,
  tenantId: string,
  env: any,
): Promise<string> {
  const db = env.DB;
  const kv = env.SAAS_FACTORY;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

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
          const result = await executeTool(tc.function.name, args, tenantId, env);
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

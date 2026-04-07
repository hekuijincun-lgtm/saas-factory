/**
 * Karte Photos Routes — visual karte (photo upload → GPT-4o Vision → LINE report)
 * Registered via registerKartePhotoRoutes(app).
 */
import { getTenantId, checkTenantMismatch, requireRole } from '../helpers';
import { LineCore } from '../line/core';

export function registerKartePhotoRoutes(app: any) {

// ── POST /admin/karte-photos — upload photo + GPT-4o Vision analysis ────────
app.post('/admin/karte-photos', async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const r2 = (c.env as any).MENU_IMAGES;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);
    if (!r2) return c.json({ ok: false, error: "R2_not_bound" }, 500);

    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ ok: false, error: "invalid_form_data" }, 400);

    const file = formData.get('file') as File | null;
    const customerId = formData.get('customer_id') as string | null;
    const visitDate = (formData.get('visit_date') as string) || new Date().toISOString().split('T')[0];

    if (!file) return c.json({ ok: false, error: "missing_file_field" }, 400);
    if (!customerId) return c.json({ ok: false, error: "customer_id is required" }, 400);

    if (file.size > 5 * 1024 * 1024) {
      return c.json({ ok: false, error: "file_too_large", maxBytes: 5242880 }, 413);
    }
    const contentType = file.type || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      return c.json({ ok: false, error: "invalid_file_type", got: contentType }, 400);
    }

    // Upload to R2
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const rand = Math.random().toString(36).slice(2, 9);
    const imageKey = `karte-photos/${tenantId}/${customerId}/${Date.now()}-${rand}.${ext}`;
    const buf = await file.arrayBuffer();
    await r2.put(imageKey, buf, { httpMetadata: { contentType } });

    const reqUrl = new URL(c.req.url);
    const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
    const photoUrl = `${apiBase}/media/menu/${imageKey}`;

    // GPT-4o Vision analysis
    let aiDescription = '';
    const openaiKey = (c.env as any).OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const mimeType = contentType || 'image/jpeg';
        const model = String((c.env as any).OPENAI_MODEL || 'gpt-4o').trim() || 'gpt-4o';

        const openAIRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 400,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
                {
                  type: 'text',
                  text: `あなたはプロのトリマーです。この犬のトリミング後の仕上がり写真を分析して、カルテ記録用に以下の形式で日本語で記述してください。

【全体スタイル】: （例: テディベアカット、サマーカット等）
【顔まわり】: （耳の長さ・形、マズルの丸み等）
【ボディ】: （背中・お腹の毛の長さ感）
【足まわり】: （足先・パッドまわりの状態）
【仕上がりの特徴】: （こだわりポイントを1〜2文で）
【次回への申し送り】: （次回トリマーへのメモ）

簡潔に、各項目2〜3文以内で記述してください。`,
                },
              ],
            }],
          }),
        });
        const openAIData = await openAIRes.json() as any;
        aiDescription = openAIData.choices?.[0]?.message?.content || '';
      } catch (e) {
        console.error('GPT-4o Vision error:', e);
        aiDescription = '（AI解析に失敗しました。手動で記入してください）';
      }
    } else {
      aiDescription = '（OPENAI_API_KEY未設定のためAI解析をスキップしました）';
    }

    // Save to D1
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO karte_photos (id, tenant_id, customer_id, photo_url, visit_date, ai_description)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(id, tenantId, customerId, photoUrl, visitDate, aiDescription).run();

    return c.json({ ok: true, id, photoUrl, aiDescription });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// ── GET /admin/karte-photos?customerId=xxx — list photos for customer ───────
app.get('/admin/karte-photos', async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const customerId = c.req.query('customerId');
    if (!customerId) return c.json({ ok: true, photos: [] });

    const result = await db.prepare(`
      SELECT * FROM karte_photos
      WHERE tenant_id = ?1 AND customer_id = ?2
      ORDER BY visit_date DESC, created_at DESC
      LIMIT 20
    `).bind(tenantId, customerId).all();

    return c.json({ ok: true, photos: result.results ?? [] });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// ── PATCH /admin/karte-photos/:id — update trimmer notes ────────────────────
app.patch('/admin/karte-photos/:id', async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({} as any));
    const { trimmerNotes } = body;

    const result = await db.prepare(`
      UPDATE karte_photos SET trimmer_notes = ?1 WHERE id = ?2 AND tenant_id = ?3
    `).bind(trimmerNotes ?? null, id, tenantId).run();

    if ((result.meta?.changes ?? 0) === 0) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

// ── POST /admin/karte-photos/:id/send-line — send report to customer via LINE ─
app.post('/admin/karte-photos/:id/send-line', async (c: any) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB not available" }, 500);

    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({} as any));
    const { lineUserId, petName, customMessage } = body;

    if (!lineUserId) return c.json({ ok: false, error: "lineUserId is required" }, 400);

    // Get photo record
    const photo = await db.prepare(
      `SELECT * FROM karte_photos WHERE id = ?1 AND tenant_id = ?2`
    ).bind(id, tenantId).first() as any;

    if (!photo) return c.json({ ok: false, error: "not_found" }, 404);

    const description = (photo.trimmer_notes || photo.ai_description || '').substring(0, 200);
    const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
    const displayName = petName || 'ペット';

    // Build Flex Message
    const flex: Record<string, unknown> = {
      type: 'bubble',
      hero: {
        type: 'image',
        url: photo.photo_url,
        size: 'full',
        aspectRatio: '4:3',
        aspectMode: 'cover',
      },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1C1C1C',
        paddingAll: '12px',
        contents: [{
          type: 'text',
          text: `🐾 ${today}のトリミング報告`,
          color: '#FFFFFF',
          weight: 'bold',
          size: 'md',
        }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: `${displayName}ちゃんの仕上がりです✨`,
            weight: 'bold',
            size: 'sm',
            color: '#333333',
          },
          {
            type: 'text',
            text: description || '（施術メモなし）',
            wrap: true,
            size: 'xs',
            color: '#666666',
          },
          ...(customMessage ? [{
            type: 'text',
            text: `💬 ${customMessage}`,
            wrap: true,
            size: 'xs',
            color: '#555555',
            margin: 'md',
          }] : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'またのご来店をお待ちしています🐕',
          size: 'xs',
          color: '#999999',
          align: 'center',
        }],
      },
    };

    // Send via LineCore
    const lc = new LineCore(c.env);
    const result = await lc.sendPush(tenantId, lineUserId, [{
      type: 'flex',
      altText: `${displayName}ちゃんのトリミング報告が届きました`,
      contents: flex,
    }]);

    if (!result.success) {
      return c.json({ ok: false, error: "LINE送信失敗", detail: result.error }, 500);
    }

    // Update sent flag
    await db.prepare(
      `UPDATE karte_photos SET is_sent_to_customer = 1 WHERE id = ?1`
    ).bind(id).run();

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});

} // end registerKartePhotoRoutes

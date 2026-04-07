/**
 * Billing routes — PAY.JP subscription, webhooks, self-managed portal, enterprise inquiry, support
 *
 * PAY.JP REST API を fetch() で直接呼び出す（Cloudflare Workers 互換）。
 * SDK は Edge Runtime 非対応のため不使用。
 */
import type { PlanId, SubscriptionInfo } from "../settings";
import { getTenantId } from "../helpers";

const PAYJP_API = 'https://api.pay.jp/v1';

/** PAY.JP REST API helper — Basic Auth (secret key : empty password) */
async function payjpFetch(env: any, path: string, method: string = 'GET', body?: Record<string, string>): Promise<any> {
  const key: string = env.PAYJP_SECRET_KEY ?? '';
  if (!key) throw new Error('payjp_not_configured');

  const headers: Record<string, string> = {
    'Authorization': 'Basic ' + btoa(key + ':'),
  };

  let fetchBody: string | undefined;
  if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchBody = new URLSearchParams(body).toString();
  }

  const res = await fetch(`${PAYJP_API}${path}`, { method, headers, body: fetchBody });
  const json = await res.json();
  if (!res.ok) {
    const err = (json as any)?.error?.message ?? `PAY.JP API error ${res.status}`;
    throw new Error(err);
  }
  return json;
}

/** HMAC-SHA256 Webhook signature verification */
async function verifyPayjpSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}

export function registerBillingRoutes(app: any) {

  // ── Rate limit helper for card operations (10 attempts/hour per IP) ──
  const CARD_RATE_LIMIT = 10;
  const CARD_RATE_TTL = 3600; // 1 hour
  async function checkCardRateLimit(c: any): Promise<Response | null> {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const rlKey = `billing:attempt:${ip}`;
    const countRaw = await kv.get(rlKey);
    const count = countRaw ? parseInt(countRaw, 10) : 0;
    if (count >= CARD_RATE_LIMIT) {
      return c.json({ ok: false, error: 'rate_limited',
        message: 'カード操作の試行回数が上限を超えました。1時間後に再試行してください。' }, 429);
    }
    await kv.put(rlKey, String(count + 1), { expirationTtl: CARD_RATE_TTL });
    return null;
  }

  // ── Create subscription (card token from frontend → customer → subscription) ──
  app.post('/billing/subscribe', async (c: any) => {
    const env = c.env as any;
    if (!env.PAYJP_SECRET_KEY) {
      return c.json({ ok: false, error: 'payjp_not_configured' }, 500);
    }

    // Card attempt rate limiting
    const rlBlock = await checkCardRateLimit(c);
    if (rlBlock) return rlBlock;

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const token: string = String(body.token ?? '').trim();
    const planId: string = String(body.planId ?? '');
    const email: string = String(body.email ?? '').trim();

    if (!token) {
      return c.json({ ok: false, error: 'missing_token' }, 400);
    }
    if (planId !== 'starter' && planId !== 'pro') {
      return c.json({ ok: false, error: 'invalid_plan' }, 400);
    }

    const payjpPlanId: string = planId === 'starter'
      ? (env.PAYJP_PLAN_STARTER ?? '')
      : (env.PAYJP_PLAN_PRO ?? '');

    if (!payjpPlanId) {
      return c.json({ ok: false, error: 'plan_not_configured' }, 500);
    }

    try {
      // 1. Finalize 3-D Secure on token (required before use)
      try {
        await payjpFetch(env, `/tokens/${token}/tds_finish`, 'POST');
      } catch (tdsErr: any) {
        // tds_finish may fail if 3DS was not triggered (e.g. frictionless flow) — log but continue
        console.warn('tds_finish warning:', tdsErr?.message);
      }

      // 2. Create customer with card token
      const customerParams: Record<string, string> = { card: token };
      if (email) customerParams.email = email;
      customerParams.metadata_planId = planId;

      const customer = await payjpFetch(env, '/customers', 'POST', customerParams);

      // 3. Create subscription
      const subscription = await payjpFetch(env, '/subscriptions', 'POST', {
        customer: customer.id,
        plan: payjpPlanId,
        metadata_planId: planId,
      });

      return c.json({
        ok: true,
        customerId: customer.id,
        subscriptionId: subscription.id,
        planId,
        status: subscription.status,
      });
    } catch (err: any) {
      const msg: string = err?.message ?? 'subscribe_failed';
      console.error('billing/subscribe error:', msg);
      return c.json({ ok: false, error: 'subscribe_failed', detail: msg }, 500);
    }
  });

  // ── Verify subscription (used during signup to confirm subscription exists) ──
  app.post('/billing/verify-subscription', async (c: any) => {
    const env = c.env as any;
    if (!env.PAYJP_SECRET_KEY) {
      return c.json({ ok: false, error: 'payjp_not_configured' }, 500);
    }

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const subscriptionId: string = String(body.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      return c.json({ ok: false, error: 'missing_subscription_id' }, 400);
    }

    try {
      const sub = await payjpFetch(env, `/subscriptions/${subscriptionId}`);
      if (sub.status !== 'active' && sub.status !== 'trial') {
        return c.json({ ok: false, error: 'subscription_not_active', status: sub.status });
      }
      const planId = (sub.metadata?.planId ?? 'starter') as PlanId;
      return c.json({
        ok: true,
        planId,
        status: sub.status,
        customerId: sub.customer,
        subscriptionId: sub.id,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: 'subscription_not_found', detail: err.message }, 404);
    }
  });

  // ── Webhook ──────────────────────────────────────────────────────────────────
  app.post('/billing/webhook', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const whSecret: string = env.PAYJP_WEBHOOK_SECRET ?? '';

    if (!env.PAYJP_SECRET_KEY || !whSecret) {
      return c.json({ ok: false, error: 'webhook_not_configured' }, 500);
    }

    // 1. Signature verification
    const rawBody = await c.req.text();
    const sig = c.req.header('X-Payjp-Signature') ?? '';
    const valid = await verifyPayjpSignature(rawBody, sig, whSecret);
    if (!valid) {
      return c.json({ ok: false, error: 'signature_invalid' }, 401);
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch {
      return c.json({ ok: false, error: 'invalid_json' }, 400);
    }

    // 2. Tenant resolution helper
    async function resolveTenant(customerId: string) {
      const tenantId = await kv.get(`payjp:customer:${customerId}`);
      if (!tenantId) return null;
      const raw = await kv.get(`settings:${tenantId}`);
      const settings = raw ? JSON.parse(raw) : null;
      return { tenantId, settings };
    }

    async function saveSubscription(tenantId: string, settings: any, sub: Partial<SubscriptionInfo>) {
      const existing: SubscriptionInfo | undefined = settings?.subscription;
      const updated: SubscriptionInfo = {
        ...existing,
        ...sub,
        createdAt: existing?.createdAt ?? Date.now(),
      } as SubscriptionInfo;
      const merged = { ...(settings ?? {}), subscription: updated };
      await kv.put(`settings:${tenantId}`, JSON.stringify(merged));
    }

    // 3. Event dispatch — PAY.JP event types
    const eventType: string = event.type ?? '';
    const data = event.data ?? {};

    switch (eventType) {
      case 'subscription.created': {
        const customerId = String(data.customer ?? '');
        const subscriptionId = String(data.id ?? '');
        const planId = (data.metadata?.planId ?? '') as PlanId;
        if (customerId) {
          const t = await resolveTenant(customerId);
          if (t) {
            await saveSubscription(t.tenantId, t.settings, {
              planId: planId || t.settings?.subscription?.planId || 'starter',
              payjpCustomerId: customerId,
              payjpSubscriptionId: subscriptionId || undefined,
              status: 'active',
            });
          }
        }
        break;
      }

      case 'subscription.updated': {
        const customerId = String(data.customer ?? '');
        const t = await resolveTenant(customerId);
        if (t) {
          const payjpStatus: string = data.status ?? '';
          const statusMap: Record<string, SubscriptionInfo['status']> = {
            active: 'active', trial: 'trialing', canceled: 'cancelled',
            paused: 'cancelled',
          };
          const planId = (data.metadata?.planId ?? '') as PlanId;
          await saveSubscription(t.tenantId, t.settings, {
            status: statusMap[payjpStatus] ?? 'active',
            currentPeriodEnd: data.current_period_end ? data.current_period_end * 1000 : undefined,
            ...(planId ? { planId } : {}),
            payjpSubscriptionId: data.id,
          });
        }
        break;
      }

      case 'subscription.deleted': {
        const customerId = String(data.customer ?? '');
        const t = await resolveTenant(customerId);
        if (t) {
          await saveSubscription(t.tenantId, t.settings, {
            status: 'cancelled',
            payjpSubscriptionId: data.id,
          });
        }
        break;
      }

      case 'charge.failed': {
        // Payment failure — mark as past_due
        const customerId = String(data.customer ?? '');
        const t = await resolveTenant(customerId);
        if (t) {
          await saveSubscription(t.tenantId, t.settings, {
            status: 'past_due',
          });
        }
        break;
      }
    }

    return c.json({ ok: true, type: eventType });
  });

  // ── Self-managed billing portal (PAY.JP has no hosted portal) ─────────────

  // Card update: replace customer's default card
  app.post('/admin/billing/update-card', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    if (!env.PAYJP_SECRET_KEY) {
      return c.json({ ok: false, error: 'payjp_not_configured' }, 500);
    }

    // Card attempt rate limiting
    const rlBlock = await checkCardRateLimit(c);
    if (rlBlock) return rlBlock;

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const token: string = String(body.token ?? '').trim();
    if (!token) {
      return c.json({ ok: false, error: 'missing_token' }, 400);
    }

    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    const settings = JSON.parse(raw);
    const customerId: string = settings?.subscription?.payjpCustomerId ?? '';
    if (!customerId) {
      return c.json({ ok: false, error: 'no_payjp_customer' }, 400);
    }

    try {
      // Finalize 3-D Secure on token before use
      try {
        await payjpFetch(env, `/tokens/${token}/tds_finish`, 'POST');
      } catch (tdsErr: any) {
        console.warn('tds_finish warning (card update):', tdsErr?.message);
      }

      await payjpFetch(env, `/customers/${customerId}`, 'POST', { card: token });
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ ok: false, error: 'card_update_failed', detail: err.message }, 500);
    }
  });

  // Cancel subscription
  app.post('/admin/billing/cancel', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    if (!env.PAYJP_SECRET_KEY) {
      return c.json({ ok: false, error: 'payjp_not_configured' }, 500);
    }

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    const settings = JSON.parse(raw);
    const subscriptionId: string = settings?.subscription?.payjpSubscriptionId ?? '';
    if (!subscriptionId) {
      return c.json({ ok: false, error: 'no_subscription' }, 400);
    }

    try {
      await payjpFetch(env, `/subscriptions/${subscriptionId}/cancel`, 'POST');
      // Update local state immediately
      const existing: SubscriptionInfo | undefined = settings?.subscription;
      const updated: SubscriptionInfo = {
        ...existing,
        status: 'cancelled',
      } as SubscriptionInfo;
      const merged = { ...settings, subscription: updated };
      await kv.put(`settings:${tenantId}`, JSON.stringify(merged));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ ok: false, error: 'cancel_failed', detail: err.message }, 500);
    }
  });

  // Charges list (billing history)
  app.get('/admin/billing/charges', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    if (!env.PAYJP_SECRET_KEY) {
      return c.json({ ok: false, error: 'payjp_not_configured' }, 500);
    }

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    const settings = JSON.parse(raw);
    const customerId: string = settings?.subscription?.payjpCustomerId ?? '';
    if (!customerId) {
      return c.json({ ok: false, error: 'no_payjp_customer' }, 400);
    }

    try {
      const charges = await payjpFetch(env, `/charges?customer=${customerId}&limit=20`);
      const items = (charges.data ?? []).map((ch: any) => ({
        id: ch.id,
        amount: ch.amount,
        currency: ch.currency,
        status: ch.paid ? 'paid' : ch.refunded ? 'refunded' : 'failed',
        createdAt: ch.created ? ch.created * 1000 : 0,
        description: ch.description ?? '',
      }));
      return c.json({ ok: true, charges: items });
    } catch (err: any) {
      return c.json({ ok: false, error: 'charges_fetch_failed', detail: err.message }, 500);
    }
  });

  // ── Enterprise inquiry ──────────────────────────────────────────────────────
  app.post('/billing/enterprise-inquiry', async (c: any) => {
    const env = c.env as any;
    const kv: KVNamespace = env.SAAS_FACTORY;

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const { company, name, email, phone, storeCount, vertical, message } = body;
    if (!company || !name || !email || !storeCount || !vertical || !message) {
      return c.json({ ok: false, error: 'missing_required_fields' }, 400);
    }

    // Store inquiry in KV with timestamp for later retrieval
    const inquiryId = `ent_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const inquiry = {
      id: inquiryId,
      company, name, email, phone: phone || null,
      storeCount, vertical, message,
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    // Append to inquiry list
    const listKey = 'billing:enterprise:inquiries';
    const existing = await kv.get(listKey);
    const list = existing ? JSON.parse(existing) : [];
    list.unshift(inquiry);
    await kv.put(listKey, JSON.stringify(list.slice(0, 200))); // keep last 200

    // Also store individually for lookup
    await kv.put(`billing:enterprise:${inquiryId}`, JSON.stringify(inquiry), { expirationTtl: 7776000 }); // 90 days

    return c.json({ ok: true, inquiryId });
  });

  // ── Support ticket submission ───────────────────────────────────────────────
  app.post('/admin/support', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const tenantId = getTenantId(c, body);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    const validCategories = ['bug', 'feature', 'support', 'other'];
    const category = body.category;
    if (!category || !validCategories.includes(category)) {
      return c.json({ ok: false, error: 'invalid_category' }, 400);
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 3) {
      return c.json({ ok: false, error: 'message_too_short' }, 400);
    }

    // Simple email validation if provided
    const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
    if (contactEmail && !contactEmail.includes('@')) {
      return c.json({ ok: false, error: 'invalid_email' }, 400);
    }

    const validPriorities = ['low', 'medium', 'high'];
    const priority = validPriorities.includes(body.priority) ? body.priority : 'medium';

    const now = new Date();
    const ts = now.getTime();
    const rand = Math.random().toString(36).slice(2, 8);
    const ticketId = `${ts}-${rand}`;

    const ticket = {
      id: ticketId,
      tenantId,
      category,
      subject: typeof body.subject === 'string' ? body.subject.trim() : undefined,
      message,
      priority,
      wantsReply: body.wantsReply === true,
      contactEmail: contactEmail || undefined,
      pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl : undefined,
      userAgent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 500) : undefined,
      status: 'new',
      source: 'admin_ui',
      createdAt: body.createdAt || now.toISOString(),
    };

    const kvKey = `support:ticket:${tenantId}:${ticketId}`;
    await kv.put(kvKey, JSON.stringify(ticket), { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year TTL

    return c.json({ ok: true, id: ticketId, saved: true });
  });

}

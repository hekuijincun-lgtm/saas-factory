/**
 * Billing routes — Stripe Checkout, webhooks, portal, enterprise inquiry, support
 */
import Stripe from "stripe";
import type { PlanId, SubscriptionInfo } from "../settings";
import { getTenantId } from "../helpers";

function getStripe(env: any): Stripe | null {
  const key: string = env.STRIPE_SECRET_KEY ?? '';
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export function registerBillingRoutes(app: any) {

  app.post('/billing/checkout', async (c: any) => {
    const env = c.env as any;
    const stripe = getStripe(env);
    if (!stripe) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const planId: string = String(body.planId ?? '');
    if (planId !== 'starter' && planId !== 'pro') {
      return c.json({ ok: false, error: 'invalid_plan' }, 400);
    }

    const priceId: string = planId === 'starter'
      ? (env.STRIPE_PRICE_STARTER ?? '')
      : (env.STRIPE_PRICE_PRO ?? '');

    if (!priceId) {
      return c.json({ ok: false, error: 'price_not_configured' }, 500);
    }

    const webOrigin: string = (env.WEB_ORIGIN ?? env.WEB_BASE ?? 'https://saas-factory-web-v2.pages.dev')
      .replace(/\/+$/, '');

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { planId },
        success_url: `${webOrigin}/signup?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${webOrigin}/signup?canceled=1`,
      });

      return c.json({ ok: true, url: session.url });
    } catch (err: any) {
      const msg: string = err?.message ?? 'checkout_failed';
      console.error('billing/checkout error:', msg);
      return c.json({ ok: false, error: 'checkout_failed', detail: msg }, 500);
    }
  });

  app.post('/billing/verify-session', async (c: any) => {
    const env = c.env as any;
    const stripe = getStripe(env);
    if (!stripe) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const sessionId: string = String(body.sessionId ?? '');
    if (!sessionId) {
      return c.json({ ok: false, error: 'missing_session_id' }, 400);
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return c.json({ ok: false, error: 'payment_not_completed', paymentStatus: session.payment_status });
      }
      const planId = (session.metadata?.planId ?? 'starter') as PlanId;
      return c.json({
        ok: true,
        planId,
        paymentStatus: session.payment_status,
        customerId: session.customer,
        subscriptionId: session.subscription,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: 'session_not_found', detail: err.message }, 404);
    }
  });

  app.post('/billing/webhook', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const stripe = getStripe(env);
    const whSecret: string = env.STRIPE_WEBHOOK_SECRET ?? '';

    if (!stripe || !whSecret) {
      return c.json({ ok: false, error: 'webhook_not_configured' }, 500);
    }

    // 1. Signature verification
    const rawBody = await c.req.text();
    const sig = c.req.header('Stripe-Signature') ?? '';
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody, sig, whSecret,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );
    } catch {
      return c.json({ ok: false, error: 'signature_invalid' }, 401);
    }

    // 2. Tenant resolution helper
    async function resolveTenant(customerId: string) {
      const tenantId = await kv.get(`stripe:customer:${customerId}`);
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

    // 3. Event dispatch
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = String(session.customer ?? '');
        const subscriptionId = String(session.subscription ?? '');
        const planId = (session.metadata?.planId ?? '') as PlanId;
        if (customerId) {
          const t = await resolveTenant(customerId);
          if (t) {
            await saveSubscription(t.tenantId, t.settings, {
              planId: planId || t.settings?.subscription?.planId || 'starter',
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId || undefined,
              status: 'active',
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = String(sub.customer ?? '');
        const t = await resolveTenant(customerId);
        if (t) {
          const stripeStatus = sub.status;
          const statusMap: Record<string, SubscriptionInfo['status']> = {
            active: 'active', past_due: 'past_due', canceled: 'cancelled',
            trialing: 'trialing', unpaid: 'past_due', incomplete: 'past_due',
            incomplete_expired: 'cancelled', paused: 'cancelled',
          };
          const planId = (sub.metadata?.planId ?? '') as PlanId;
          await saveSubscription(t.tenantId, t.settings, {
            status: statusMap[stripeStatus] ?? 'active',
            currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : undefined,
            ...(planId ? { planId } : {}),
            stripeSubscriptionId: sub.id,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = String(sub.customer ?? '');
        const t = await resolveTenant(customerId);
        if (t) {
          await saveSubscription(t.tenantId, t.settings, {
            status: 'cancelled',
            stripeSubscriptionId: sub.id,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = String(invoice.customer ?? '');
        const t = await resolveTenant(customerId);
        if (t) {
          await saveSubscription(t.tenantId, t.settings, {
            status: 'past_due',
          });
        }
        break;
      }
    }

    return c.json({ ok: true, type: event.type });
  });

  app.post('/admin/billing/portal-session', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const stripe = getStripe(env);
    if (!stripe) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    // Resolve customerId from tenant settings
    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) {
      return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    }
    const settings = JSON.parse(raw);
    const customerId: string = settings?.subscription?.stripeCustomerId ?? '';
    if (!customerId) {
      return c.json({ ok: false, error: 'no_stripe_customer' }, 400);
    }

    const webOrigin: string = (env.WEB_ORIGIN ?? env.WEB_BASE ?? 'https://saas-factory-web-v2.pages.dev')
      .replace(/\/+$/, '');
    const returnUrl = `${webOrigin}/admin/billing?tenantId=${encodeURIComponent(tenantId)}`;

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return c.json({ ok: true, url: session.url });
    } catch (err: any) {
      return c.json({ ok: false, error: 'portal_session_failed', detail: err.message }, 500);
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

    // TODO: Send notification email via Resend when configured

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

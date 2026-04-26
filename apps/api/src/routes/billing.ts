/**
 * Billing routes — Stripe only
 *
 * All payment processing uses the official Stripe SDK (stripe v22)
 * with fetch httpClient for Cloudflare Workers compatibility.
 */
import Stripe from 'stripe';
import type { PlanId, SubscriptionInfo } from "../settings";
import { getTenantId } from "../helpers";

// ────────────────────────────────────────────────────────────────────────────
// Stripe helpers
// ────────────────────────────────────────────────────────────────────────────
function getStripeClient(env: any): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-03-25.dahlia' as any,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function stripePriceId(env: any, planId: PlanId): string {
  return planId === 'starter'
    ? String(env.STRIPE_PRICE_ID_STARTER ?? '')
    : String(env.STRIPE_PRICE_ID_PRO ?? '');
}

function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionInfo['status'] {
  switch (s) {
    case 'active':
    case 'incomplete':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return 'cancelled';
    default:
      return 'active';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────────────────────
export function registerBillingRoutes(app: any) {

  // ── Rate limit helper for card/subscribe operations (10 attempts/hour per IP) ──
  const CARD_RATE_LIMIT = 10;
  const CARD_RATE_TTL = 3600;
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

  // ───────────────────────────────────────────────────────────────────────────
  // POST /billing/subscribe
  //   Create Stripe Customer + incomplete Subscription, return clientSecret
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/billing/subscribe', async (c: any) => {
    const env = c.env as any;

    const rlBlock = await checkCardRateLimit(c);
    if (rlBlock) return rlBlock;

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const planId: string = String(body.planId ?? '');
    const email: string = String(body.email ?? '').trim();

    if (planId !== 'starter' && planId !== 'pro') {
      return c.json({ ok: false, error: 'invalid_plan' }, 400);
    }

    if (!env.STRIPE_SECRET_KEY) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }
    const priceId = stripePriceId(env, planId as PlanId);
    if (!priceId) {
      return c.json({ ok: false, error: 'plan_not_configured' }, 500);
    }

    try {
      const stripe = getStripeClient(env);

      // 1. Customer
      const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { planId },
      });

      // 2. Subscription with deferred payment (clientSecret for PaymentElement)
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        metadata: { planId },
        expand: ['latest_invoice.payment_intent'],
      });

      const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
      const paymentIntent = (latestInvoice as any)?.payment_intent as Stripe.PaymentIntent | undefined;
      const clientSecret = paymentIntent?.client_secret ?? null;

      return c.json({
        ok: true,
        provider: 'stripe',
        customerId: customer.id,
        subscriptionId: subscription.id,
        planId,
        status: subscription.status,
        clientSecret,
      });
    } catch (err: any) {
      const msg: string = err?.message ?? 'subscribe_failed';
      console.error('stripe subscribe error:', msg);
      return c.json({ ok: false, error: 'subscribe_failed', detail: msg }, 500);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /billing/verify-subscription
  //   Confirm subscription is active (used during signup hand-off)
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/billing/verify-subscription', async (c: any) => {
    const env = c.env as any;

    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const subscriptionId: string = String(body.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      return c.json({ ok: false, error: 'missing_subscription_id' }, 400);
    }

    if (!env.STRIPE_SECRET_KEY) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }
    try {
      const stripe = getStripeClient(env);
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status !== 'active' && sub.status !== 'trialing') {
        return c.json({ ok: false, error: 'subscription_not_active', status: sub.status });
      }
      const planId = (sub.metadata?.planId ?? 'starter') as PlanId;
      return c.json({
        ok: true,
        provider: 'stripe',
        planId,
        status: sub.status,
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        subscriptionId: sub.id,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: 'subscription_not_found', detail: err.message }, 404);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /billing/webhook
  //   Stripe webhook handler
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/billing/webhook', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;

    const stripeSig = c.req.header('stripe-signature') ?? '';
    const rawBody = await c.req.text();

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

    async function resolveTenant(indexKey: string) {
      const tenantId = await kv.get(indexKey);
      if (!tenantId) return null;
      const raw = await kv.get(`settings:${tenantId}`);
      const settings = raw ? JSON.parse(raw) : null;
      return { tenantId, settings };
    }

    if (!stripeSig) {
      return c.json({ ok: false, error: 'missing_signature' }, 400);
    }

    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      return c.json({ ok: false, error: 'webhook_not_configured' }, 500);
    }
    const stripe = getStripeClient(env);
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        stripeSig,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err: any) {
      console.error('stripe webhook signature invalid:', err?.message);
      return c.json({ ok: false, error: 'signature_invalid' }, 400);
    }

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
          const t = await resolveTenant(`stripe:customer:${customerId}`);
          if (t) {
            const planId = (sub.metadata?.planId ?? '') as PlanId;
            await saveSubscription(t.tenantId, t.settings, {
              provider: 'stripe',
              status: mapStripeStatus(sub.status),
              currentPeriodEnd: (sub as any).current_period_end
                ? (sub as any).current_period_end * 1000
                : undefined,
              ...(planId ? { planId } : {}),
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
            });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
          const t = await resolveTenant(`stripe:customer:${customerId}`);
          if (t) {
            await saveSubscription(t.tenantId, t.settings, {
              provider: 'stripe',
              status: 'cancelled',
              stripeSubscriptionId: sub.id,
            });
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const inv = event.data.object as Stripe.Invoice;
          const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? '';
          if (customerId) {
            const t = await resolveTenant(`stripe:customer:${customerId}`);
            if (t) {
              await saveSubscription(t.tenantId, t.settings, {
                provider: 'stripe',
                status: 'active',
              });
            }
          }
          break;
        }
        case 'invoice.payment_failed': {
          const inv = event.data.object as Stripe.Invoice;
          const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? '';
          if (customerId) {
            const t = await resolveTenant(`stripe:customer:${customerId}`);
            if (t) {
              await saveSubscription(t.tenantId, t.settings, {
                provider: 'stripe',
                status: 'past_due',
              });
            }
          }
          break;
        }
        default:
          // Unhandled → 200 to acknowledge
          break;
      }
    } catch (err: any) {
      console.error('stripe webhook handler error:', err?.message);
    }
    return c.json({ ok: true, type: event.type });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /admin/billing/update-card
  //   Stripe: create SetupIntent for PaymentElement → client confirms
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/admin/billing/update-card', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;

    const rlBlock = await checkCardRateLimit(c);
    if (rlBlock) return rlBlock;

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    const settings = JSON.parse(raw);
    const sub: SubscriptionInfo | undefined = settings?.subscription;

    if (!env.STRIPE_SECRET_KEY) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }
    const customerId = sub?.stripeCustomerId ?? '';
    if (!customerId) {
      return c.json({ ok: false, error: 'no_stripe_customer' }, 400);
    }

    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const paymentMethodId: string = String(body.paymentMethodId ?? '').trim();

    try {
      const stripe = getStripeClient(env);

      // Mode A: client has already confirmed SetupIntent → pass paymentMethodId
      if (paymentMethodId) {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
        // Also update the subscription's default PM
        if (sub?.stripeSubscriptionId) {
          await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            default_payment_method: paymentMethodId,
          });
        }
        return c.json({ ok: true });
      }

      // Mode B: bootstrap — return SetupIntent clientSecret for PaymentElement
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      });
      return c.json({ ok: true, clientSecret: setupIntent.client_secret });
    } catch (err: any) {
      return c.json({ ok: false, error: 'card_update_failed', detail: err.message }, 500);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /admin/billing/cancel
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/admin/billing/cancel', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    const settings = JSON.parse(raw);
    const sub: SubscriptionInfo | undefined = settings?.subscription;

    if (!env.STRIPE_SECRET_KEY) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }
    const subscriptionId = sub?.stripeSubscriptionId ?? '';
    if (!subscriptionId) {
      return c.json({ ok: false, error: 'no_subscription' }, 400);
    }
    try {
      const stripe = getStripeClient(env);
      await stripe.subscriptions.cancel(subscriptionId);
      const updated: SubscriptionInfo = { ...(sub as SubscriptionInfo), status: 'cancelled' };
      await kv.put(`settings:${tenantId}`, JSON.stringify({ ...settings, subscription: updated }));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ ok: false, error: 'cancel_failed', detail: err.message }, 500);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /admin/billing/charges — billing history
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/admin/billing/charges', async (c: any) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;

    const tenantId = getTenantId(c);
    if (!tenantId || tenantId === 'default') {
      return c.json({ ok: false, error: 'missing_tenant_id' }, 400);
    }

    const raw = await kv.get(`settings:${tenantId}`);
    if (!raw) return c.json({ ok: false, error: 'tenant_not_found' }, 404);
    const settings = JSON.parse(raw);
    const sub: SubscriptionInfo | undefined = settings?.subscription;

    if (!env.STRIPE_SECRET_KEY) {
      return c.json({ ok: false, error: 'stripe_not_configured' }, 500);
    }
    const customerId = sub?.stripeCustomerId ?? '';
    if (!customerId) {
      return c.json({ ok: false, error: 'no_stripe_customer' }, 400);
    }
    try {
      const stripe = getStripeClient(env);
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 });
      const items = invoices.data.map((inv: Stripe.Invoice) => ({
        id: inv.id,
        amount: inv.amount_paid ?? inv.amount_due ?? 0,
        currency: inv.currency,
        status:
          inv.status === 'paid' ? 'paid' :
          inv.status === 'uncollectible' || inv.status === 'void' ? 'refunded' :
          inv.status === 'open' || inv.status === 'draft' ? 'pending' : 'failed',
        createdAt: inv.created ? inv.created * 1000 : 0,
        description: inv.description ?? inv.lines?.data?.[0]?.description ?? '',
      }));
      return c.json({ ok: true, charges: items });
    } catch (err: any) {
      return c.json({ ok: false, error: 'charges_fetch_failed', detail: err.message }, 500);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /billing/config — expose publishable key to frontend
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/billing/config', async (c: any) => {
    const env = c.env as any;
    return c.json({
      ok: true,
      provider: 'stripe',
      stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY ?? '',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /billing/enterprise-inquiry
  // ───────────────────────────────────────────────────────────────────────────
  app.post('/billing/enterprise-inquiry', async (c: any) => {
    const env = c.env as any;
    const kv: KVNamespace = env.SAAS_FACTORY;

    let body: any = {};
    try { body = await c.req.json(); } catch {}

    const { company, name, email, phone, storeCount, vertical, message } = body;
    if (!company || !name || !email || !storeCount || !vertical || !message) {
      return c.json({ ok: false, error: 'missing_required_fields' }, 400);
    }

    const inquiryId = `ent_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const inquiry = {
      id: inquiryId,
      company, name, email, phone: phone || null,
      storeCount, vertical, message,
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    const listKey = 'billing:enterprise:inquiries';
    const existing = await kv.get(listKey);
    const list = existing ? JSON.parse(existing) : [];
    list.unshift(inquiry);
    await kv.put(listKey, JSON.stringify(list.slice(0, 200)));

    await kv.put(`billing:enterprise:${inquiryId}`, JSON.stringify(inquiry), { expirationTtl: 7776000 });

    return c.json({ ok: true, inquiryId });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /admin/support — support ticket submission
  // ───────────────────────────────────────────────────────────────────────────
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
    await kv.put(kvKey, JSON.stringify(ticket), { expirationTtl: 60 * 60 * 24 * 365 });

    return c.json({ ok: true, id: ticketId, saved: true });
  });

}

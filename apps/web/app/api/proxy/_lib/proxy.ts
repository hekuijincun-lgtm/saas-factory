// apps/web/app/api/proxy/_lib/proxy.ts
// ✅ single source of truth for upstream base (Pages/Preview/Local)
// ✅ avoids hard-coded staging domains (ERR_NAME_NOT_RESOLVED killer)

export const runtime = 'edge';

type Dict = Record<string, string>;

function pickFirst(...vals: Array<string | undefined | null>): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function normalizeBase(base: string): string {
  // remove trailing slash
  return base.replace(/\/+$/, '');
}

export function resolveUpstreamBase(): string {
  // Priority:
  // 1) Explicit public base (Next.js client/server unified)
  // 2) Explicit server-only base
  // 3) Vite style (if ever used)
  // 4) Local dev fallback
  const env = (globalThis as any)?.process?.env ?? {};

  const base =
    pickFirst(
      env.NEXT_PUBLIC_API_BASE,
      env.API_BASE,
      env.VITE_API_BASE,
      env.BOOKING_API_BASE, // last resort (some setups reuse same)
    ) ?? 'http://127.0.0.1:8787';

  return normalizeBase(base);
}

export function resolveBookingBase(): string {
  const env = (globalThis as any)?.process?.env ?? {};
  const base =
    pickFirst(
      env.NEXT_PUBLIC_BOOKING_API_BASE,
      env.BOOKING_API_BASE,
      env.NEXT_PUBLIC_API_BASE,
      env.API_BASE,
      env.VITE_API_BASE,
    ) ?? resolveUpstreamBase();

  return normalizeBase(base);
}

function safeJoin(base: string, path: string): string {
  const b = normalizeBase(base);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function copyHeaders(src: Headers, extra?: Dict): Headers {
  const h = new Headers();

  // Forward only what we want (avoid hop-by-hop headers)
  const allow = new Set([
    'accept',
    'accept-language',
    'content-type',
    'authorization',
    'cookie',
    'user-agent',
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
    'cf-ipcountry',
    'referer',
    'origin',
  ]);

  src.forEach((v, k) => {
    const key = k.toLowerCase();
    if (allow.has(key)) h.set(k, v);
  });

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null) h.set(k, String(v));
    }
  }

  return h;
}

export type ProxyTarget = 'api' | 'booking';

export function resolveTargetBase(target: ProxyTarget): string {
  return target === 'booking' ? resolveBookingBase() : resolveUpstreamBase();
}

export async function proxyFetch(
  req: Request,
  upstreamPath: string,
  opts?: {
    target?: ProxyTarget;
    method?: string;
    headers?: Dict;
    body?: BodyInit | null;
    // pass-through: if true, do not force json headers
    passthrough?: boolean;
  }
): Promise<Response> {
  const target: ProxyTarget = opts?.target ?? 'api';
  const base = resolveTargetBase(target);
  const url = safeJoin(base, upstreamPath);

  const method = (opts?.method ?? req.method ?? 'GET').toUpperCase();

  const headers = copyHeaders(req.headers, opts?.headers);

  // Phase 0.6: /admin/* へ転送する場合のみ X-Admin-Token をサーバーサイドから注入する。
  // ブラウザにはトークンを渡さない（NEXT_PUBLIC_ / localStorage 不使用）。
  // ADMIN_TOKEN 未設定時は何もしない（後方互換）。
  let adminTokenInjected = false;
  {
    const p = new URL(url).pathname;
    if (p === '/admin' || p.startsWith('/admin/')) {
      const env = (globalThis as any)?.process?.env ?? {};
      const adminToken = env.ADMIN_TOKEN as string | undefined;
      if (adminToken) {
        headers.set('X-Admin-Token', adminToken);
        adminTokenInjected = true;
      }
    }
  }

  // If we send body, ensure content-type exists (caller may override)
  const body = opts?.body ?? (method === 'GET' || method === 'HEAD' ? null : await req.arrayBuffer().catch(() => null));

  // Avoid cache surprises in auth flows
  headers.set('cache-control', 'no-store');

  const res = await fetch(url, {
    method,
    headers,
    body: body as any,
    redirect: 'manual',
  });

  // Optionally pass through raw response
  if (opts?.passthrough) {
    if (!adminTokenInjected) return res;
    const ph = new Headers(res.headers);
    ph.set('x-admin-token-present', '1');
    return new Response(res.body, { status: res.status, headers: ph });
  }

  // Default: just return upstream response as-is (status/headers/body)
  // But ensure CORS for browser calls if you use this from client
  const outHeaders = new Headers(res.headers);
  if (!outHeaders.has('access-control-allow-origin')) {
    outHeaders.set('access-control-allow-origin', '*');
  }
  if (!outHeaders.has('access-control-allow-headers')) {
    outHeaders.set('access-control-allow-headers', '*');
  }
  if (!outHeaders.has('access-control-allow-methods')) {
    outHeaders.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (adminTokenInjected) outHeaders.set('x-admin-token-present', '1');

  return new Response(res.body, {
    status: res.status,
    headers: outHeaders,
  });
}

export async function proxyJson<T = any>(
  req: Request,
  upstreamPath: string,
  opts?: {
    target?: ProxyTarget;
    method?: string;
    headers?: Dict;
    bodyJson?: any;
  }
): Promise<Response> {
  const headers: Dict = {
    ...(opts?.headers ?? {}),
    'content-type': 'application/json',
  };
  const body = opts?.bodyJson == null ? null : JSON.stringify(opts.bodyJson);

  return proxyFetch(req, upstreamPath, {
    target: opts?.target ?? 'api',
    method: opts?.method ?? 'POST',
    headers,
    body,
  });
}

// Backward-compatible aliases (in case other files import these names)
export const getApiBase = resolveUpstreamBase;
export const getBookingApiBase = resolveBookingBase;
/**
 * forwardJson: minimal fetch forwarder (no dependency on other helpers)
 * - clones method/headers/body from incoming Request
 * - allows overriding via init (optional)
 */
export async function forwardJson(req: Request, url: string, init: RequestInit = {}) {
  const h = new Headers(req.headers);

  // allow init headers override/merge
  if (init.headers) {
    const ih = new Headers(init.headers as HeadersInit);
    ih.forEach((v, k) => h.set(k, v));
  }

  // Phase 0.6: /admin/* へ転送する場合のみ X-Admin-Token を注入（proxyFetch と同じポリシー）。
  let adminTokenInjected = false;
  try {
    const pathname = new URL(url).pathname;
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const env = (globalThis as any)?.process?.env ?? {};
      const adminToken = env.ADMIN_TOKEN as string | undefined;
      if (adminToken) {
        h.set('X-Admin-Token', adminToken);
        adminTokenInjected = true;
      }
    }
  } catch { /* 無効 URL は無視 */ }

  // body: keep streaming where possible
  const method = (init.method ?? req.method).toUpperCase();
  const bodyAllowed = !(method === "GET" || method === "HEAD");

  const upstreamReq = new Request(url, {
    method,
    headers: h,
    body: bodyAllowed ? (init.body ?? (req as any).body) : undefined,
    redirect: "manual",
  });

  const res = await fetch(upstreamReq);

  // ensure JSON-ish content-type if upstream forgets; always build rh for flag injection
  const rh = new Headers(res.headers);
  if (!rh.get("content-type")) {
    rh.set("content-type", "application/json; charset=utf-8");
  }
  if (adminTokenInjected) rh.set('x-admin-token-present', '1');
  return new Response(res.body, { status: res.status, headers: rh });
}


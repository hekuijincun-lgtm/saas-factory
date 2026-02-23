// apps/web/app/api/proxy/_lib/proxy.ts
// ✅ single source of truth for upstream base (Pages/Preview/Local)
// ✅ avoids hard-coded staging domains (ERR_NAME_NOT_RESOLVED killer)

export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

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

// ── Admin token + debug helpers ────────────────────────────────────────────
// これらを各 route から import することで注入ロジックを一元管理する。

/** /admin または /admin/* かどうかを pathname で判定する */
export function isAdminPathname(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** ADMIN_TOKEN を環境から読む: CF Pages runtime env → process.env の順 */
export function readAdminToken(): string | undefined {
  try {
    const ctx = getRequestContext();
    const v = (ctx?.env as any)?.ADMIN_TOKEN;
    if (typeof v === 'string' && v.length) return v;
  } catch {}
  const v2 = (process.env as any)?.ADMIN_TOKEN;
  return typeof v2 === 'string' && v2.length ? v2 : undefined;
}

/**
 * X-Admin-Token を headers に注入する。
 * /admin/* 以外・ADMIN_TOKEN 未設定時は false を返す（注入なし）。
 */
export function injectAdminToken(headers: Headers, pathname: string): boolean {
  if (!isAdminPathname(pathname)) return false;
  const token = readAdminToken();
  if (!token) return false;
  headers.set('X-Admin-Token', token);
  return true;
}

/** x-debug-proxy 用タイムスタンプ文字列を生成する (UTC) */
export function makeDebugStamp(): string {
  const iso = new Date().toISOString();
  return 'STAMP_' + iso.slice(0, 10).replace(/-/g, '') + '_' + iso.slice(11, 16).replace(/:/g, '');
}

/** debug=1 のときのみ呼び出す: 観測用レスポンスヘッダを一括付与する */
export function applyDebugHeaders(
  headers: Headers,
  opts: { stamp: string; isAdminRoute: boolean; tokenConfigured: boolean; tokenInjected: boolean }
): void {
  headers.set('x-debug-proxy', opts.stamp);
  headers.set('x-admin-route', opts.isAdminRoute ? '1' : '0');
  headers.set('x-admin-token-configured', opts.tokenConfigured ? '1' : '0');
  headers.set('x-admin-token-present', opts.tokenInjected ? '1' : '0');
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

  let isDebug = false;
  let dbgStamp = "";
  try {
    if (new URL(req.url).searchParams.get('debug') === '1') {
      isDebug = true;
      dbgStamp = makeDebugStamp();
    }
  } catch {}

  const method = (opts?.method ?? req.method ?? 'GET').toUpperCase();

  const headers = copyHeaders(req.headers, opts?.headers);

  // /admin/* のみ X-Admin-Token をサーバーサイドから注入（ブラウザ非公開）
  const upstreamPathname = new URL(url).pathname;
  const isAdminRoute = isAdminPathname(upstreamPathname);
  const isTokenConfigured = isAdminRoute && !!readAdminToken();
  const adminTokenInjected = injectAdminToken(headers, upstreamPathname);

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
    if (!adminTokenInjected && !isDebug) return res;
    const ph = new Headers(res.headers);
    if (adminTokenInjected) ph.set('x-admin-token-present', '1');
    if (isDebug) {
      applyDebugHeaders(ph, { stamp: dbgStamp, isAdminRoute, tokenConfigured: isTokenConfigured, tokenInjected: adminTokenInjected });
    }
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
  if (isDebug) {
    applyDebugHeaders(outHeaders, { stamp: dbgStamp, isAdminRoute, tokenConfigured: isTokenConfigured, tokenInjected: adminTokenInjected });
  }

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

  let isDebug = false;
  let dbgStamp = "";
  try {
    if (new URL(req.url).searchParams.get('debug') === '1') {
      isDebug = true;
      dbgStamp = makeDebugStamp();
    }
  } catch {}

  // allow init headers override/merge
  if (init.headers) {
    const ih = new Headers(init.headers as HeadersInit);
    ih.forEach((v, k) => h.set(k, v));
  }

  // /admin/* のみ X-Admin-Token を注入（proxyFetch と同じポリシー）
  let adminTokenInjected = false;
  let isAdminRoute = false;
  let isTokenConfigured = false;
  try {
    const pathname = new URL(url).pathname;
    isAdminRoute = isAdminPathname(pathname);
    isTokenConfigured = isAdminRoute && !!readAdminToken();
    adminTokenInjected = injectAdminToken(h, pathname);
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
  if (isDebug) {
    applyDebugHeaders(rh, { stamp: dbgStamp, isAdminRoute, tokenConfigured: isTokenConfigured, tokenInjected: adminTokenInjected });
  }
  return new Response(res.body, { status: res.status, headers: rh });
}


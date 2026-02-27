/**
 * Server-side admin menu fetch for Cloudflare Pages (edge runtime)
 * Reads API_BASE and ADMIN_TOKEN directly from process.env.
 * Called from Server Components — never imported by client bundles.
 */

export interface AdminMenuItem {
  id: string;
  name: string;
  description?: string;
  priceYen: number;
  durationMin: number;
  tags?: string[];
}

type RawItem = Record<string, unknown>;

function parseItem(x: RawItem): AdminMenuItem {
  const desc =
    (typeof x.description === "string" && x.description) ||
    (typeof x.detail === "string" && x.detail) ||
    undefined;
  return {
    id: String(x.id ?? ""),
    name: String(x.name ?? ""),
    description: desc,
    priceYen:
      Number(x.price) || Number(x.priceYen) || Number(x.amount) || 0,
    durationMin:
      Number(x.durationMin) || Number(x.duration) || 45,
    tags: undefined,
  };
}

/** CF Pages edge env: plain_text → process.env, secret_text → getRequestContext() fallback */
function readEnv(name: string): string {
  // process.env is patched by @cloudflare/next-on-pages for both plain_text and secret_text
  const v = process.env[name];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();

  // Fallback: CF Pages runtime bindings via getRequestContext
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRequestContext } = require("@cloudflare/next-on-pages");
    const ctx = getRequestContext();
    const bv = (ctx?.env as Record<string, unknown>)?.[name];
    if (typeof bv === "string" && bv.trim().length > 0) return bv.trim();
  } catch {
    // not in CF Pages runtime (local dev, etc.)
  }
  return "";
}

/**
 * Fetch menu items from Workers API directly (server-side).
 * Returns mapped array on success, null on any failure or empty result.
 */
export async function fetchAdminMenuServer(
  tenantId: string
): Promise<AdminMenuItem[] | null> {
  try {
    const apiBase = readEnv("API_BASE").replace(/\/+$/, "");
    const adminToken = readEnv("ADMIN_TOKEN");

    if (!apiBase) return null;

    const url = `${apiBase}/admin/menu?tenantId=${encodeURIComponent(tenantId)}`;
    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
    };
    if (adminToken) {
      reqHeaders["X-Admin-Token"] = adminToken;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: reqHeaders,
      cache: "no-store",
    });

    if (!res.ok) return null;

    const raw: unknown = await res.json();

    let list: RawItem[] = [];
    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        list = obj.data as RawItem[];
      }
    }
    if (Array.isArray(raw)) {
      list = raw as RawItem[];
    }

    if (list.length === 0) return null;

    return list
      .filter((x) => x.active !== false)
      .sort((a, b) => {
        const ao = Number(a.sortOrder) || 0;
        const bo = Number(b.sortOrder) || 0;
        return ao !== bo
          ? ao - bo
          : String(a.name).localeCompare(String(b.name), "ja");
      })
      .map(parseItem);
  } catch {
    return null;
  }
}

import { getRequestContext } from "@cloudflare/next-on-pages";

/**
 * Cloudflare Pages (Edge) では process.env が期待通りにならないケースがあるので、
 * getRequestContext().env を優先して読む。
 */
function readEnv(key: string): string | undefined {
  // Pages runtime env / secrets
  try {
    const ctx = getRequestContext();
    const v = ctx?.env?.[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {}

  // fallback (build/server env)
  const pv = (process.env as any)?.[key];
  if (typeof pv === "string" && pv.length > 0) return pv;

  return undefined;
}

export function getApiBase(): string {
  const base =
    readEnv("API_BASE") ||
    readEnv("WORKER_API_BASE") ||
    readEnv("NEXT_PUBLIC_API_BASE") ||
    readEnv("NEXT_PUBLIC_API_BASE_URL") ||
    readEnv("NEXT_PUBLIC_API_BASE_HTTPS") ||
    readEnv("BOOKING_API_BASE");

  if (!base) throw new Error("API base is not defined in env");

  // trim trailing slash
  return base.replace(/\/+$/, "");
}





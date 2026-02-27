/**
 * 眉毛サロン予約アプリ用 APIクライアント
 * /api/proxy/* を経由して Workers API を呼び出す
 */

const PROXY_BASE = "/api/proxy";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${PROXY_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as Record<string, unknown>;
      msg = String(data?.error ?? data?.message ?? msg);
    } catch { /* ignore */ }
    throw new ApiError(msg, res.status);
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  return request<T>(path + qs);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  query?: Record<string, string>
): Promise<T> {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  return request<T>(path + qs, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 予約スロット取得（404/501 は null を返す → 呼び出し側でフォールバック） */
export interface SlotItem {
  time: string;
  available: boolean;
  reason?: string;
}

export async function fetchSlots(
  tenantId: string,
  date: string
): Promise<SlotItem[] | null> {
  try {
    const res = await apiGet<{ ok: boolean; slots?: SlotItem[]; data?: SlotItem[] }>(
      "/slots",
      { tenantId, date }
    );
    const raw = res.slots ?? res.data ?? [];
    return raw.filter((s) => s.available !== false);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501 || e.status === 0)) {
      return null; // fallback signal
    }
    return null;
  }
}

export interface ReservePayload {
  tenantId: string;
  staffId: string;
  startAt: string;
  endAt: string;
  customerName: string;
  phone?: string | null;
  menuId?: string;
  notes?: string;
}

export interface ReserveResponse {
  ok: boolean;
  reservationId?: string;
  id?: string;
  error?: string;
}

export async function postReserve(
  payload: ReservePayload
): Promise<ReserveResponse> {
  return apiPost<ReserveResponse>(
    `/reserve?tenantId=${encodeURIComponent(payload.tenantId)}`,
    payload
  );
}

/** HH:mm + durationMin → endAt ISO string (JST +09:00) */
export function buildEndAt(date: string, time: string, durationMin: number): string {
  const tz = "+09:00";
  const [hh, mm] = time.split(":").map(Number);
  const start = new Date(`${date}T${time}:00${tz}`);
  start.setMinutes(start.getMinutes() + durationMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` +
    `T${pad(start.getHours())}:${pad(start.getMinutes())}:00${tz}`
  );
}

/** 営業時間フォールバックスロット生成 (10:00-18:30, 30分刻み) */
export function generateFallbackSlots(): SlotItem[] {
  const slots: SlotItem[] = [];
  for (let h = 10; h < 19; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) break;
      slots.push({
        time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        available: true,
      });
    }
  }
  return slots;
}

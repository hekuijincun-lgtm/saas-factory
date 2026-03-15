/**
 * Booking API クライアント
 * slots/reserve エンドポイントを叩く関数を提供
 */

import { apiGet, apiPost, apiDelete, apiPatch, apiPut, ApiClientError } from './apiClient';

export interface TimeSlot {
  time: string;
  /** Grid cell has capacity (interval-based overlap). Used by admin grid. */
  available: boolean;
  /** Same as available — explicit name for grid cell availability */
  cellAvailable?: boolean;
  /** Menu duration fits without conflict. Only differs from available when durationMin > slotIntervalMin. */
  bookableForMenu?: boolean;
  reason?: 'cutoff' | 'reserved' | 'shift' | 'closed';
  /** Availability status from admin: 'available'=○, 'few'=△, 'full'=× */
  status?: 'available' | 'few' | 'full';
}

export interface SlotsResponse {
  ok: boolean;
  date: string;
  slots: TimeSlot[];
}

export interface CreateReservationPayload {
  date: string;
  time: string;
  name: string;
  phone?: string;
  email?: string;
  staffId?: string;
  lineUserId?: string;
  durationMin?: number;
  meta?: Record<string, any>;
}

export interface ReservationResponse {
  ok: boolean;
  reservationId: string;
  date: string;
  time: string;
  name: string;
  customerKey?: string; // API generated key for reservation list lookup
}

export interface MyReservation {
  reservationId: string;
  date: string;
  time: string;
  name: string;
  staffId: string;
  durationMin: number;
  status: string;
  menuName?: string;
  surveyAnswers?: Record<string, string | boolean>;
}

export interface ReservationMeta {
  // P5: 業種バーティカルデータ（新形式・主データ）
  verticalData?: {
    styleType?: string;       // スタイルタイプ（例: 'natural', 'bold'）
    [key: string]: unknown;   // 他業種拡張用
  };
  // 同意ログ
  consentLog?: {
    acceptedAt?: string;           // 同意日時（ISO）
    consentVersionHash?: string;   // 同意文バージョンハッシュ
  };
  // 画像
  beforeUrl?: string;       // Before画像URL
  afterUrl?: string;        // After画像URL
  snsPublishOk?: boolean;   // SNS公開同意
  // アンケート回答（meta.surveyAnswers として保存）
  surveyAnswers?: Record<string, string | boolean>;
  // 予約メタ（/reserve 時に保存）
  menuName?: string;
  customerKey?: string;
  lineUserId?: string;
}

export interface Reservation {
  reservationId: string;
  date: string;
  time: string;
  name: string;
  phone?: string;
  staffId?: string;
  note?: string;
  durationMin?: number;
  status?: string;
  createdAt: string;
  meta?: ReservationMeta;
}

export interface ReservationsResponse {
  ok: boolean;
  date: string;
  reservations: Reservation[];
}

export interface CancelReservationResponse {
  ok: boolean;
  date: string;
  time: string;
}

// ── Vertical Attributes / Data Extension Strategy ──────────────────
//
// verticalAttributes (menu / staff) と verticalData (reservation) は
// vertical ごとに異なる schema を持つ。以下のルールに従って拡張すること:
//
// 1. 全フィールドは optional（?）で定義する
// 2. vertical ごとの型は「参考型」として定義（実行時は Record<string, unknown>）
// 3. plugin の flags で UI 表示を制御（flags.hasMenuAttributes 等）
// 4. KPI 集計に使う field 名は vertical 間で揃える（例: styleType / designType / category）
//
// Menu verticalAttributes 例:
//   eyebrow: { firstTimeOnly, genderTarget, styleType }
//   nail:    { designType, handFoot, firstTimeOnly }
//   hair:    { category, genderTarget, firstTimeOnly }
//
// Staff verticalAttributes 例:
//   eyebrow: { skillLevel, specialties }
//   nail:    { skillLevel, specialties }
//   hair:    { skillLevel, specialties, rank }
//
// Reservation verticalData 例:
//   eyebrow: { styleType }
//   nail:    { designType, colorPreference }
//   hair:    { category, lengthBefore }
//

// Admin API types
export interface StaffVerticalAttributes {
  skillLevel?: 1 | 2 | 3 | 4 | 5;     // 技術レベル（1:初級〜5:エキスパート）
  specialties?: string[];              // 得意技術タグ（例: "ナチュラル", "韓国風", etc）
}

export interface Staff {
  id: string;
  name: string;
  role?: string;
  active: boolean;
  sortOrder: number;
  /** 業種共通スキル属性 */
  verticalAttributes?: Record<string, unknown>;
}

/**
 * スタッフの業種属性を正規化して返す read adapter。
 */
export function getStaffVerticalAttrs(staff: Staff): StaffVerticalAttributes | undefined {
  if (staff.verticalAttributes && Object.keys(staff.verticalAttributes).length > 0) {
    return staff.verticalAttributes as unknown as StaffVerticalAttributes;
  }
  return undefined;
}

export interface MenuVerticalAttributes {
  firstTimeOnly?: boolean;                             // 初回限定メニュー
  genderTarget?: 'male' | 'female' | 'both';          // 性別ターゲット
  styleType?: 'natural' | 'sharp' | 'korean' | 'custom'; // スタイル種別
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  active: boolean;
  sortOrder: number;
  /** 業種共通属性 */
  verticalAttributes?: Record<string, unknown>;
  imageKey?: string;          // R2 object key (P1)
  imageUrl?: string;          // 公開URL
}

// ── ReservationMeta vertical data read helper ──────────

/**
 * 予約メタの業種データを正規化して返す read adapter。
 */
export function getReservationVerticalData(meta?: ReservationMeta): Record<string, unknown> | undefined {
  if (meta?.verticalData && Object.keys(meta.verticalData).length > 0) {
    return meta.verticalData;
  }
  return undefined;
}

// ── MenuItem vertical attributes read helper ───────────

/**
 * メニューアイテムの業種属性を正規化して返す read adapter。
 */
export function getMenuVerticalAttrs(item: MenuItem): MenuVerticalAttributes | undefined {
  if (item.verticalAttributes && Object.keys(item.verticalAttributes).length > 0) {
    return item.verticalAttributes as unknown as MenuVerticalAttributes;
  }
  return undefined;
}

export interface AdminSettings {
  openTime: string;
  closeTime: string;
  slotIntervalMin: number;
  closedWeekdays: number[];
  timezone: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * GET /api/proxy/slots?date=YYYY-MM-DD&staffId=xxx(optional) を実行
 * Next.js プロキシAPI経由で Worker API の /slots に中継
 */
export async function getSlots(date: string, staffId?: string, durationMin?: number): Promise<SlotsResponse> {
  try {
    const params = new URLSearchParams({ date });
    params.append('tenantId', (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tenantId')) || 'default');
    if (staffId && staffId !== 'any') {
      params.append('staffId', staffId);
    }
    if (durationMin && durationMin > 0) {
      params.append('durationMin', String(durationMin));
    }
    // cache-buster: ensure fresh slots after conflict/refetch
    params.append('_t', String(Date.now()));

    // Next.js プロキシAPI経由で取得（相対パスで /api/proxy/slots を呼ぶ）
    const response = await fetch(`/api/proxy/slots?${params.toString()}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      // エラーレスポンスのテキストを読み取る
      const errorText = await response.text();
      let errorData: any;
      try {
        errorData = errorText ? JSON.parse(errorText) : {};
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      
      throw new ApiClientError(
        errorData.error || errorData.message || `Failed to fetch slots: ${response.status}`,
        response.status
      );
    }

    const raw = (await response.json() as any);
    // normalize for UI compatibility: accept {slots:[]}, {data:[]}, or both
    const slots = (raw && Array.isArray(raw.slots)) ? raw.slots
               : (raw && Array.isArray(raw.data)) ? raw.data
               : [];
    const normalized = { ...raw, slots, data: slots };
    return normalized as SlotsResponse;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(error instanceof Error ? error.message : 'Failed to fetch slots');
  }
}

/**
 * POST /reserve を実行
 */
export async function createReservation(
  payload: CreateReservationPayload
): Promise<ReservationResponse> {
  try {
    // ✅ legacy UI payload(date/time/name) -> new API payload(startAt/endAt/customerName)
    const tz = "+09:00";
    const date = payload.date;
    const time = payload.time;
    const staffId = payload.staffId ?? "any";

    if (!date || !time || !payload.name) {
      throw new ApiClientError("Missing required fields: date/time/name", 400);
    }

    // "YYYY-MM-DD" + "HH:mm" -> ISO-ish string with JST offset
    const startAt = `${date}T${time}:00${tz}`;

    // endAt: use menu duration or default 60 minutes
    const durMin = payload.durationMin && payload.durationMin > 0 ? payload.durationMin : 60;
    const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
    const endDateObj = new Date(`${date}T${time}:00${tz}`);
    endDateObj.setMinutes(endDateObj.getMinutes() + durMin);
    const pad = (n: number) => String(n).padStart(2, "0");
    const endAt = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())}T${pad(endDateObj.getHours())}:${pad(endDateObj.getMinutes())}:00${tz}`;

    // tenantId: URL query param (booking UI) → proxy will also inject session
    // tenantId via x-session-tenant-id header for admin callers without URL param.
    const urlTenantId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('tenantId')
      : null;

    const newPayload: any = {
      ...(urlTenantId ? { tenantId: urlTenantId } : {}),
      staffId,
      startAt,
      endAt,
      customerName: payload.name,
      phone: payload.phone ?? null,
      ...(payload.email ? { email: payload.email.toLowerCase().trim() } : {}),
      ...(payload.lineUserId ? { lineUserId: payload.lineUserId } : {}),
      ...(payload.meta ? { meta: payload.meta } : {}),
    };

    console.log("[createReservation payload->newPayload]", { payload, newPayload });

    return await apiPost<ReservationResponse>("/api/proxy/reserve", newPayload);
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError("Failed to create reservation");
  }
}
/**
 * GET /admin/reservations?date=YYYY-MM-DD を実行
 */
export async function getReservations(date: string, tenantId?: string): Promise<ReservationsResponse> {
  try {
    const params = new URLSearchParams({ date });
    if (tenantId) params.set('tenantId', tenantId);
    const response = await apiGet<ReservationsResponse>(`/api/proxy/admin/reservations?${params.toString()}`);
    // reservationsが配列かチェック
    if (response.reservations && !Array.isArray(response.reservations)) {
      console.warn('getReservations: response.reservations is not an array, setting to empty array');
      return {
        ...response,
        reservations: [],
      };
    }
    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch reservations');
  }
}

/**
 * GET /my/reservations — 顧客向け予約一覧
 */
export async function getMyReservations(
  tenantId: string,
  customerKey: string
): Promise<MyReservation[]> {
  try {
    const params = new URLSearchParams({ tenantId, customerKey });
    const res = await fetch(`/api/proxy/my/reservations?${params.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await res.json() as any;
    if (!data.ok) throw new ApiClientError(data.error || 'Failed to fetch my reservations', res.status);
    return (data.reservations || []) as MyReservation[];
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('Failed to fetch my reservations');
  }
}

/**
 * DELETE /admin/reservations/:id を実行
 */
export async function cancelReservationById(
  reservationId: string
): Promise<CancelReservationResponse> {
  try {
    return await apiDelete<CancelReservationResponse>(`/api/proxy/admin/reservations/${encodeURIComponent(reservationId)}`);
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to cancel reservation');
  }
}

/**
 * @deprecated この関数は削除予定です。代わりに cancelReservationById() を使用してください。
 */
export async function cancelReservation(
  date: string,
  time: string
): Promise<CancelReservationResponse> {
  // 後方互換性のため、reservationIdを推測する必要があるが、非推奨
  console.warn('cancelReservation(date, time) is deprecated. Use cancelReservationById(reservationId) instead.');
  throw new ApiClientError('cancelReservation(date, time) is deprecated. Use cancelReservationById(reservationId) instead.');
}

/**
 * GET /admin/staff を実行
 * tenantId はセッションから注入されるが、明示的に渡すことで proxy の ?tenantId= も設定する（多重防御）。
 */
export async function getStaff(tenantId?: string): Promise<Staff[]> {
  try {
    const resolvedTenantId = tenantId
      || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tenantId'))
      || 'default';
    const params = new URLSearchParams();
    params.set("tenantId", resolvedTenantId);
    const response = await apiGet<ApiResponse<Staff[]>>(`/api/proxy/admin/staff?${params}`);
    if (response.ok && response.data) {
      // 配列チェック
      if (!Array.isArray(response.data)) {
        console.warn('getStaff: response.data is not an array, returning empty array');
        return [];
      }
      return response.data.filter(s => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    throw new ApiClientError(response.error || 'Failed to fetch staff');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch staff');
  }
}

/**
 * POST /admin/staff を実行
 */
export async function createStaff(payload: Omit<Staff, 'id'>, tenantId: string = "default"): Promise<Staff> {
  try {
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    const response = await apiPost<ApiResponse<Staff>>(`/api/proxy/admin/staff?${params}`, payload);
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to create staff');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to create staff');
  }
}

/**
 * PATCH /api/proxy/admin/staff/:id を実行
 * proxy 経由で直接呼ぶことで x-session-tenant-id の注入が効く。
 */
export async function updateStaff(id: string, payload: Partial<Omit<Staff, 'id'>>, tenantId: string = "default"): Promise<Staff> {
  try {
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    const response = await apiPatch<ApiResponse<Staff>>(`/api/proxy/admin/staff/${id}?${params}`, payload);
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to update staff');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to update staff');
  }
}

/**
 * GET /admin/menu を実行
 */
export async function getMenu(tenantId: string = "default"): Promise<MenuItem[]> {
  try {
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);

    const response = await fetch("/api/booking/menu?" + params.toString(), {
      method: "GET",
      headers: { "accept": "application/json" },
      cache: "no-store",
    });

    // まず JSON として読む（失敗しても raw text で拾う）
    let raw: any = null;
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      raw = await response.json().catch(() => null);
    } else {
      const t = await response.text().catch(() => "");
      try { raw = JSON.parse(t); } catch { raw = t; }
    }

    // ✅ HTTP エラー
    if (!response.ok) {
      const msg =
        raw?.error?.message ||
        raw?.error ||
        raw?.detail ||
        raw?.message ||
        ("Failed to fetch menu: " + response.status);
      throw new ApiClientError(msg, response.status, response.statusText, raw);
    }

    // ✅ 200 でも { ok:false } を弾く
    if (raw && typeof raw === "object" && raw.ok === false) {
      const msg = raw?.error?.message || raw?.error || raw?.detail || raw?.message || "Failed to fetch menu";
      throw new ApiClientError(msg, response.status, response.statusText, raw);
    }

    // ✅ データ抽出（今のAPIは raw.data が配列）
    // 将来の揺れに備えて raw.data.data も拾う
    const list = Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.data?.data)
        ? raw.data.data
        : Array.isArray(raw)
          ? raw
          : [];

    // ✅ 正規化（price/durationMin が "5000" みたいな文字列でも数値に）
    const n = (v: any, d = 0) => {
      const k = Number(v);
      return Number.isFinite(k) ? k : d;
    };

    return list.map((x: any) => {
      const rawUrl = x?.imageUrl != null ? String(x.imageUrl) : undefined;
      // XSS防止: http/https スキームのみ許可
      const safeImageUrl = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined;
      return {
        id: String(x?.id ?? ""),
        name: String(x?.name ?? ""),
        price: n(x?.price, 0),
        durationMin: n(x?.durationMin, 60),
        active: x?.active !== false,
        sortOrder: n(x?.sortOrder, 0),
        tenantId: (x?.tenantId != null ? String(x.tenantId) : tenantId),
        ...(x?.imageKey            ? { imageKey: String(x.imageKey) }           : {}),
        ...(safeImageUrl           ? { imageUrl: safeImageUrl }                : {}),
        ...(x?.verticalAttributes  ? { verticalAttributes: x.verticalAttributes } : {}),
      };
    }) as MenuItem[];
  } catch (error) {
    throw new ApiClientError(error instanceof Error ? error.message : "Failed to fetch menu");
  }
}

/**
 * Public booking settings fetch — bypasses admin session/tenant guard.
 */
export async function fetchBookingSettings(tenantId: string = "default"): Promise<AdminSettings> {
  const params = new URLSearchParams({ tenantId });
  const res = await fetch(`/api/booking/settings?${params}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiClientError("Failed to fetch settings", res.status);
  const json: any = await res.json();
  return (json?.data ?? json) as AdminSettings;
}

export async function createMenuItem(payload: Omit<MenuItem, 'id'>): Promise<MenuItem> {
  try {
    const response = await apiPost<ApiResponse<MenuItem>>('/api/proxy/admin/menu', payload);
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to create menu item');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to create menu item');
  }
}

/**
 * PATCH /admin/menu/:id を実行
 */

export async function deleteMenuItem(tenantId: string, id: string) {
  const u = `/api/proxy/admin/menu/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`;

  const res = await fetch(u, { method: 'DELETE' });

  // JSONが返らないケースも一応吸収
  let data: any = null;
  try { data = await res.json(); } catch {}

  if (!res.ok || !data?.ok) {
    throw new Error(`deleteMenuItem failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}
export async function updateMenuItem(id: string, payload: Partial<Omit<MenuItem, 'id'>>): Promise<MenuItem> {
  try {
    const response = await apiPatch<ApiResponse<MenuItem>>(`/api/proxy/admin/menu/${id}`, payload);
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to update menu item');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to update menu item');
  }
}

/**
 * GET /admin/settings を実行
 */
export async function getSettings(): Promise<AdminSettings> {
  try {
    const response = await apiGet<ApiResponse<AdminSettings>>('/api/proxy/admin/settings');
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to fetch settings');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch settings');
  }
}

/**
 * PUT /admin/settings を実行
 */
export async function updateSettings(payload: AdminSettings): Promise<AdminSettings> {
  try {
    const response = await apiPut<ApiResponse<AdminSettings>>('/api/proxy/admin/settings', payload);
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to update settings');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to update settings');
  }
}

/**
 * PATCH /admin/reservations/:id を実行（スタッフ割当）
 */
export async function assignStaffToReservation(reservationId: string, staffId: string | null): Promise<Reservation> {
  try {
    const response = await apiPatch<ApiResponse<Reservation>>(`/api/proxy/admin/reservations/${reservationId}`, { staffId });
    if (response.ok && response.data) {
      return response.data;
    }
    throw new ApiClientError(response.error || 'Failed to assign staff');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to assign staff');
  }
}

















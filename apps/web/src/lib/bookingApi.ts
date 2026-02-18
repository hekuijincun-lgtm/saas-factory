/**
 * Booking API クライアント
 * slots/reserve エンドポイントを叩く関数を提供
 */

import { apiGet, apiPost, apiDelete, apiPatch, apiPut, ApiClientError } from './apiClient';

export interface TimeSlot {
  time: string;
  available: boolean;
  reason?: 'cutoff' | 'reserved' | 'shift' | 'closed';
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
  staffId?: string;
}

export interface ReservationResponse {
  ok: boolean;
  reservationId: string;
  date: string;
  time: string;
  name: string;
}

export interface Reservation {
  reservationId: string;
  date: string;
  time: string;
  name: string;
  phone?: string;
  createdAt: string;
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

// Admin API types
export interface Staff {
  id: string;
  name: string;
  role?: string;
  active: boolean;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  active: boolean;
  sortOrder: number;
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
export async function getSlots(date: string, staffId?: string): Promise<SlotsResponse> {
  try {
    const params = new URLSearchParams({ date });
    params.append('tenantId', 'default'); // tenantId を追加
    if (staffId && staffId !== 'any') {
      params.append('staffId', staffId);
    }
    
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

    // endAt: default 60 minutes later
    const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
    const endDateObj = new Date(`${date}T${time}:00${tz}`);
    endDateObj.setMinutes(endDateObj.getMinutes() + 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    const endAt = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())}T${pad(endDateObj.getHours())}:${pad(endDateObj.getMinutes())}:00${tz}`;

    const newPayload: any = {
      tenantId: "default",
      staffId,
      startAt,
      endAt,
      customerName: payload.name,
      phone: payload.phone ?? null,
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
export async function getReservations(date: string): Promise<ReservationsResponse> {
  try {
    const response = await apiGet<ReservationsResponse>(`/admin/reservations?date=${encodeURIComponent(date)}`);
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
 * DELETE /admin/reservations/:id を実行
 */
export async function cancelReservationById(
  reservationId: string
): Promise<CancelReservationResponse> {
  try {
    return await apiDelete<CancelReservationResponse>(`/admin/reservations/${encodeURIComponent(reservationId)}`);
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
 */
export async function getStaff(): Promise<Staff[]> {
  try {
    const response = await apiGet<ApiResponse<Staff[]>>('/api/proxy/admin/staff');
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
export async function createStaff(payload: Omit<Staff, 'id'>): Promise<Staff> {
  try {
    const response = await apiPost<ApiResponse<Staff>>('/api/proxy/admin/staff', payload);
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
 * PATCH /admin/staff/:id を実行
 */
export async function updateStaff(id: string, payload: Partial<Omit<Staff, 'id'>>): Promise<Staff> {
  try {
    const response = await apiPatch<ApiResponse<Staff>>(`/admin/staff/${id}`, payload);
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
    params.append("tenantId", tenantId || "default");
    params.append("nocache", (globalThis.crypto?.randomUUID?.() ?? String(Date.now())));

    const response = await fetch("/api/proxy/admin/menu?" + params.toString(), {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    const text = await response.text();
    
     /** MENU_FETCH_DEBUG_V1 */
     const ct = response.headers.get("content-type") ?? "";
     console.log([menu:getMenu] status=, response.status, ct=, ct, head=, text.slice(0, 120));
     /** END MENU_FETCH_DEBUG_V1 */
let raw: any = null;
    try { raw = text ? JSON.parse(text) : null; } catch { raw = null; }

    if (!response.ok || !raw?.ok) {
      const msg = raw?.error?.message || raw?.error || raw?.detail || raw?.message || ("Failed to fetch menu: " + response.status);
      throw new ApiClientError(String(msg), response.status);
    }

    const list = Array.isArray(raw.data) ? raw.data : [];
    return list as MenuItem[];
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError(error instanceof Error ? error.message : "Failed to fetch menu");
  }
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
export async function updateMenuItem(id: string, payload: Partial<Omit<MenuItem, 'id'>>): Promise<MenuItem> {
  try {
    const response = await apiPatch<ApiResponse<MenuItem>>(`/admin/menu/${id}`, payload);
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
    const response = await apiPatch<ApiResponse<Reservation>>(`/admin/reservations/${reservationId}`, { staffId });
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












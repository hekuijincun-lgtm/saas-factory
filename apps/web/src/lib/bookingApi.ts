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

    const data = await response.json();
    return data as SlotsResponse;
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
    return await apiPost<ReservationResponse>('/reserve', payload);
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to create reservation');
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
    const response = await apiGet<ApiResponse<Staff[]>>('/admin/staff');
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
    const response = await apiPost<ApiResponse<Staff>>('/admin/staff', payload);
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
export async function getMenu(): Promise<MenuItem[]> {
  try {
    const response = await apiGet<ApiResponse<MenuItem[]>>('/admin/menu');
    if (response.ok && response.data) {
      return response.data.filter(m => m.active).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    throw new ApiClientError(response.error || 'Failed to fetch menu');
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to fetch menu');
  }
}

/**
 * POST /admin/menu を実行
 */
export async function createMenuItem(payload: Omit<MenuItem, 'id'>): Promise<MenuItem> {
  try {
    const response = await apiPost<ApiResponse<MenuItem>>('/admin/menu', payload);
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
    const response = await apiGet<ApiResponse<AdminSettings>>('/admin/settings');
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
    const response = await apiPut<ApiResponse<AdminSettings>>('/admin/settings', payload);
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


/**
 * Staff Shift API クライアント
 * GET/PUT /admin/staff/:id/shift エンドポイントを叩く関数を提供
 */

import { apiGet, apiPut, ApiClientError } from './apiClient';
import type { StaffShift } from '../types/shift';
import type { ApiResponse } from '../types';

/**
 * GET /admin/staff/:id/shift を実行
 */
export async function getStaffShift(staffId: string): Promise<StaffShift> {
  try {
    const response = await apiGet<ApiResponse<StaffShift>>(`/admin/staff/${encodeURIComponent(staffId)}/shift`);
    if (response.ok && response.data) {
      return response.data;
    }
    // 失敗時は空のshiftを返す（UIを落とさない）
    return {
      staffId,
      weekly: [],
      exceptions: [],
    };
  } catch (error) {
    // エラー時も空のshiftを返す（UIを落とさない）
    console.warn(`Failed to fetch shift for staff ${staffId}:`, error);
    return {
      staffId,
      weekly: [],
      exceptions: [],
    };
  }
}

/**
 * PUT /admin/staff/:id/shift を実行
 */
export async function updateStaffShift(staffId: string, shift: StaffShift): Promise<void> {
  try {
    const response = await apiPut<ApiResponse<StaffShift>>(`/admin/staff/${encodeURIComponent(staffId)}/shift`, shift);
    if (!response.ok) {
      throw new ApiClientError((('error' in response) && response.error) ? response.error : 'Failed to update shift');
    }
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError('Failed to update shift');
  }
}






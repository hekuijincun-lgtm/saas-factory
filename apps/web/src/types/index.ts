/**
 * 共通型定義
 */

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
  publicDays: number; // 公開期間（今日から何日後まで）
  tenantName: string; // 店舗名 / ブランド名
  contactEmail: string; // 連絡先メールアドレス
  integrations?: {
    lineConnected?: boolean;
    stripeConnected?: boolean;
  };
  // 既存フィールド（後方互換性のため）
  openTime?: string; // "HH:mm"
  closeTime?: string; // "HH:mm"
  slotIntervalMin?: number;
  closedWeekdays?: number[]; // 0=日曜, 1=月曜, ...
  timezone?: string; // "Asia/Tokyo"
}

export interface Reservation {
  id: string;
  reservationId: string; // 後方互換性のため
  date: string;
  time: string;
  name: string;
  phone?: string;
  status: 'reserved' | 'completed' | 'canceled';
  staffId?: string | null;
  createdAt: string;
}


export * from './api';


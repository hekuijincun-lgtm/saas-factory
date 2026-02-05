'use client';

import { useState, useEffect, useCallback } from 'react';
import { getReservations, cancelReservationById, type Reservation } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import PageHeader from '../ui/PageHeader';
import { Download, RefreshCw, Eye, X } from 'lucide-react';
import { getAdminSettings } from '@/src/lib/adminSettingsApi';
import type { AdminSettings } from '@/src/types/settings';

type StatusFilter = 'all' | 'reserved' | 'completed' | 'canceled';

export default function ReservationsManager() {
  const [mounted, setMounted] = useState(false);
  const [todayStr, setTodayStr] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    const today = new Date().toISOString().split('T')[0];
    setTodayStr(today);
    setDate(today);
  }, []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getReservations(date);
      // 配列チェック
      if (Array.isArray(response.reservations)) {
        setReservations(response.reservations);
      } else {
        console.warn('fetchReservations: response.reservations is not an array, setting to empty array');
        setReservations([]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch reservations';
      setError(errorMessage);
      setReservations([]); // エラー時は空配列にフォールバック
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (date) {
      fetchReservations();
    }
  }, [date, fetchReservations]);

  // 設定を取得
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getAdminSettings();
        setSettings(data);
      } catch (err) {
        console.warn('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // フィルタリング処理
  useEffect(() => {
    let filtered = [...reservations];

    // ステータスフィルタ（現在は全て "reserved" として扱う）
    if (statusFilter !== 'all') {
      // TODO: 実際のステータスフィールドに基づいてフィルタリング
      // 現時点では全て reserved として扱うため、all 以外は空になる
      if (statusFilter === 'reserved') {
        // 全て表示（現時点では全て reserved）
      } else {
        filtered = [];
      }
    }

    // 検索フィルタ
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((reservation) => {
        return (
          reservation.name.toLowerCase().includes(query) ||
          reservation.phone?.toLowerCase().includes(query) ||
          reservation.reservationId.toLowerCase().includes(query)
        );
      });
    }

    setFilteredReservations(filtered);
  }, [reservations, statusFilter, searchQuery]);

  // キャンセル可能かどうかを判定
  const canCancel = (reservation: Reservation): { canCancel: boolean; reason?: string } => {
    if (!settings) {
      return { canCancel: true }; // 設定が読み込まれていない場合は許可
    }
    
    const reservationDateTime = new Date(`${reservation.date}T${reservation.time}:00+09:00`);
    const now = new Date();
    const jstOffset = 9 * 60; // 分単位
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowJST = new Date(utc + (jstOffset * 60000));
    
    const diffMinutes = (reservationDateTime.getTime() - nowJST.getTime()) / (1000 * 60);
    
    if (diffMinutes < settings.rules.cancelMinutes) {
      return {
        canCancel: false,
        reason: `キャンセル期限（${settings.rules.cancelMinutes}分前）を過ぎています`,
      };
    }
    
    return { canCancel: true };
  };

  const handleCancel = async (reservation: Reservation) => {
    const cancelCheck = canCancel(reservation);
    if (!cancelCheck.canCancel) {
      setError(cancelCheck.reason || 'キャンセルできません');
      return;
    }
    
    if (!window.confirm(`予約をキャンセルしますか？\n日付: ${reservation.date}\n時間: ${reservation.time}\nお名前: ${reservation.name}`)) {
      return;
    }

    setCancellingId(reservation.reservationId);

    try {
      await cancelReservationById(reservation.reservationId);
      await fetchReservations();
      setSelectedReservation(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        await fetchReservations();
        setSelectedReservation(null);
      } else if (err instanceof ApiClientError && err.status === 409) {
        // 409エラー: キャンセル期限切れ or 既にキャンセル済み
        const errorMessage = err.message || '';
        if (errorMessage.includes('already canceled') || errorMessage.includes('既にキャンセル')) {
          setError('既にキャンセル済みです');
          // 既にキャンセル済みの場合は一覧を更新
          await fetchReservations();
          setSelectedReservation(null);
        } else {
          setError(err.message || 'キャンセル期限を過ぎています');
        }
      } else {
        const errorMessage =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to cancel reservation';
        setError(errorMessage);
      }
    } finally {
      setCancellingId(null);
    }
  };

  const handleExportCSV = () => {
    // TODO: CSV エクスポート機能を実装
    console.log('CSV export - TODO');
  };

  const formatDateTime = (isoString: string): string => {
    if (!mounted) return isoString;
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (reservation: Reservation) => {
    // TODO: 実際のステータスフィールドに基づいて判定
    // 現時点では全て "reserved" として扱う
    return <Badge variant="reserved">予約済み</Badge>;
  };

  const columns = [
    {
      key: 'time',
      label: '時刻',
      render: (item: Reservation) => (
        <span className="font-medium text-brand-text">{item.time}</span>
      ),
    },
    {
      key: 'name',
      label: '顧客',
      render: (item: Reservation) => (
        <div>
          <div className="font-medium text-brand-text">{item.name}</div>
          {item.phone && (
            <div className="text-sm text-brand-muted">{item.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'menu',
      label: 'メニュー',
      render: () => (
        <span className="text-brand-muted">-</span>
      ),
    },
    {
      key: 'staff',
      label: '担当',
      render: () => (
        <span className="text-brand-muted">-</span>
      ),
    },
    {
      key: 'status',
      label: 'ステータス',
      render: (item: Reservation) => getStatusBadge(item),
    },
    {
      key: 'actions',
      label: '操作',
      render: (item: Reservation) => {
        const cancelCheck = canCancel(item);
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReservation(item);
              }}
              className="p-1.5 text-brand-muted hover:text-brand-primary hover:bg-brand-bg rounded-lg transition-all"
              title="詳細"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancel(item);
              }}
              disabled={cancellingId === item.reservationId || !cancelCheck.canCancel}
              className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={cancelCheck.reason || 'キャンセル'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="予約管理"
        subtitle="予約の一覧と管理を行います。"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              CSVエクスポート
            </button>
            <button
              onClick={fetchReservations}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-brand-text bg-white border border-brand-border rounded-xl hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              更新
            </button>
          </div>
        }
      />

      {/* フィルター */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-brand-text mb-2">
              日付
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-brand-text mb-2">
              ステータス
            </label>
            <div className="relative">
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                disabled={true}
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all bg-white disabled:bg-brand-bg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="all">すべて</option>
                <option value="reserved">予約済み</option>
                <option value="completed">完了</option>
                <option value="canceled">キャンセル</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">
                準備中
              </span>
            </div>
            <p className="mt-1 text-xs text-brand-muted">ステータス機能は準備中です</p>
          </div>
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-brand-text mb-2">
              検索
            </label>
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="顧客名・電話・予約ID"
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
            />
          </div>
        </div>
      </Card>

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* テーブル */}
      <Card>
        <DataTable
          columns={columns}
          data={filteredReservations}
          keyExtractor={(item) => item.reservationId}
          loading={loading}
          emptyMessage="予約がありません"
          onRowClick={(item) => setSelectedReservation(item)}
        />
      </Card>

      {/* 詳細モーダル */}
      {selectedReservation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedReservation(null)}>
          <div className="bg-white rounded-2xl shadow-soft max-w-2xl w-full p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-brand-text">予約詳細</h2>
                <p className="text-sm text-brand-muted mt-1">予約ID: {selectedReservation.reservationId}</p>
              </div>
              <button
                onClick={() => setSelectedReservation(null)}
                className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">日付</p>
                  <p className="text-base text-brand-text">{selectedReservation.date}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">時間</p>
                  <p className="text-base text-brand-text">{selectedReservation.time}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">お名前</p>
                <p className="text-base text-brand-text">{selectedReservation.name}</p>
              </div>

              {selectedReservation.phone && (
                <div>
                  <p className="text-sm font-medium text-brand-muted mb-1">電話番号</p>
                  <p className="text-base text-brand-text">{selectedReservation.phone}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">作成日時</p>
                <p className="text-base text-brand-text">{formatDateTime(selectedReservation.createdAt)}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-brand-muted mb-1">ステータス</p>
                <div>{getStatusBadge(selectedReservation)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-brand-border">
              {(() => {
                const cancelCheck = canCancel(selectedReservation);
                return (
                  <>
                    <button
                      onClick={() => {
                        setSelectedReservation(null);
                        handleCancel(selectedReservation);
                      }}
                      disabled={cancellingId === selectedReservation.reservationId || !cancelCheck.canCancel}
                      title={cancelCheck.reason}
                      className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {cancellingId === selectedReservation.reservationId ? 'キャンセル中...' : 'キャンセル'}
                    </button>
                    {!cancelCheck.canCancel && cancelCheck.reason && (
                      <p className="text-xs text-rose-600 ml-2">{cancelCheck.reason}</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

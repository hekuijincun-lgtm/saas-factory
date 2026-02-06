'use client';

import { useState, useEffect, useRef } from 'react';
import { getAdminSettings, updateAdminSettings, sendTestSlack, mergeDefaults, disconnectLine, testLineConnection, getLineStatus, updateLineNotify, getLineConfig, updateLineConfig, deleteLineConfig, type LineStatus, type LineConfigInput } from '@/src/lib/adminSettingsApi';
import type { AdminSettings, BusinessException } from '@/src/types/settings';
import { DEFAULT_ADMIN_SETTINGS } from '@/src/types/settings';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import { Save, CheckCircle2, X, Plus, Trash2, Send, Link2, Unlink } from 'lucide-react';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function SettingsForm() {
  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [formData, setFormData] = useState<AdminSettings>(DEFAULT_ADMIN_SETTINGS);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Slack integration state
  const [slackTestLoading, setSlackTestLoading] = useState<boolean>(false);

  // LINE integration state
  const [lineConnecting, setLineConnecting] = useState<boolean>(false);
  const [lineDisconnecting, setLineDisconnecting] = useState<boolean>(false);
  const [lineTesting, setLineTesting] = useState<boolean>(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [lineStatus, setLineStatus] = useState<LineStatus>({ kind: 'loading' });
  const [lineBusy, setLineBusy] = useState<boolean>(false); // 操作中フラグ（UI 再レンダリング用）
  const lineBusyRef = useRef<boolean>(false); // 操作中フラグ（useEffect 内でチェック用）
  const lineReqSeq = useRef<number>(0); // 連番による requestId 管理
  const linePollCooldownUntil = useRef<number>(0); // ポーリング cooldown 終了時刻
  // LINE設定フォーム用の状態
  const [lineConfigSaving, setLineConfigSaving] = useState<boolean>(false);
  const [lineConfigForm, setLineConfigForm] = useState<LineConfigInput>({
    clientId: '',
    channelAccessToken: '',
    channelSecret: '',
  });
  const [lineConfigErrors, setLineConfigErrors] = useState<Record<string, string>>({});

  // lineBusy の setter（state と ref の両方を更新）
  const setLineBusyWithRef = (value: boolean) => {
    lineBusyRef.current = value;
    setLineBusy(value);
  };

  // 次の requestId を取得（連番）
  const nextLineReqId = (): number => {
    return ++lineReqSeq.current;
  };

  // LINEステータスを手動でリフレッシュ（操作成功後に呼ぶ）
  const refreshLineStatus = async (): Promise<void> => {
    try {
      const status = await getLineStatus();
      setLineStatus(status);
    } catch (err) {
      setLineStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'ステータスの取得に失敗しました',
      });
    }
  };

  // 初期データ取得
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminSettings();
        // マージして欠損フィールドを補完
        const merged = mergeDefaults(DEFAULT_ADMIN_SETTINGS as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>) as unknown as AdminSettings;
        setFormData(merged);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch settings';
        setError(errorMessage);
        // エラー時もデフォルト値で続行
        setFormData(DEFAULT_ADMIN_SETTINGS);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // URLパラメータからエラー/成功メッセージを取得
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const successParam = params.get('success');

    if (errorParam) {
      setLineError(decodeURIComponent(errorParam));
      // URLからエラーパラメータを削除
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('error');
      window.history.replaceState({}, '', newUrl.toString());
    }

    if (successParam === 'line_connected') {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // 設定を再取得
      getAdminSettings().then((data) => {
        const merged = mergeDefaults(DEFAULT_ADMIN_SETTINGS as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>) as unknown as AdminSettings;
        setFormData(merged);
      });
      // URLから成功パラメータを削除
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('success');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, []);

  // LINEステータス取得（起動時と定期的に更新、競合対策付き）
  useEffect(() => {
    let isMounted = true;
    let currentReqId = 0;

    const fetchLineStatus = async () => {
      // 操作中または cooldown 中はポーリングをスキップ
      if (lineBusyRef.current || Date.now() < linePollCooldownUntil.current) {
        return;
      }

      const reqId = nextLineReqId();
      currentReqId = reqId;
      try {
        const status = await getLineStatus();
        // 最新のリクエストのみ setLineStatus を実行
        if (isMounted && reqId === currentReqId) {
          setLineStatus(status);
        }
      } catch (err) {
        if (isMounted && reqId === currentReqId) {
          setLineStatus({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to fetch LINE status',
          });
        }
      }
    };

    // 初回取得
    fetchLineStatus();
    // 定期的に更新（30秒ごと、ただし操作中や cooldown 中はスキップ）
    const interval = setInterval(fetchLineStatus, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // lineBusy は ref でチェックするため依存配列には含めない

  // バリデーション
  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // publicDays
    if (formData.publicDays < 1 || formData.publicDays > 365) {
      errors.publicDays = '公開期間は1〜365日の範囲で入力してください';
    }

    // tenant
    const tenantName = formData.tenant?.name ?? '';
    const tenantEmail = formData.tenant?.email ?? '';
    
    if (!tenantName || tenantName.trim().length === 0) {
      errors.tenantName = '店舗名は必須です';
    } else if (tenantName.length > 80) {
      errors.tenantName = '店舗名は80文字以内で入力してください';
    }

    if (!tenantEmail || tenantEmail.trim().length === 0) {
      errors.tenantEmail = '連絡先メールアドレスは必須です';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(tenantEmail)) {
        errors.tenantEmail = '有効なメールアドレスを入力してください';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 保存処理
  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateAdminSettings(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存に失敗しました';
      setError(errorMessage);
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  // Slackテスト送信
  const handleTestSlack = async () => {
    setSlackTestLoading(true);
    setError(null);
    try {
      // webhookUrlは省略可能（API側で設定から取得）
      const result = await sendTestSlack(formData.notifications?.slackWebhookUrl);
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'テスト送信に失敗しました');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テスト送信に失敗しました');
    } finally {
      setSlackTestLoading(false);
    }
  };

  // 例外日追加
  const handleAddException = () => {
    const today = typeof window !== 'undefined' ? new Date().toISOString().split('T')[0] : '';
    if (!today) return;

    setFormData({
      ...formData,
      exceptions: [
        ...(formData.exceptions || []),
        {
          date: today,
          type: 'closed',
        },
      ],
    });
  };

  // 例外日削除
  const handleRemoveException = (index: number) => {
    setFormData({
      ...formData,
      exceptions: (formData.exceptions || []).filter((_, i) => i !== index),
    });
  };

  // 例外日変更
  const handleExceptionChange = (index: number, field: keyof BusinessException, value: string | number) => {
    setFormData({
      ...formData,
      exceptions: (formData.exceptions || []).map((ex, i) =>
        i === index ? { ...ex, [field]: value } : ex
      ),
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
            <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* 成功メッセージ */}
      {success && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-50 border border-green-200 rounded-xl shadow-soft">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-700">保存しました</span>
          </div>
        </div>
      )}

      {/* エラーメッセージ */}
      {error && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-red-50 border border-red-200 rounded-xl shadow-soft">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-red-700">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* セクションA: 公開設定 */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">公開設定</h3>
          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">
              今日から{' '}
              <input
                type="number"
                value={formData.publicDays}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setFormData({ ...formData, publicDays: value });
                  setFieldErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.publicDays;
                    return newErrors;
                  });
                }}
                className="inline-block w-20 px-3 py-2 mx-1 border border-brand-border rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                min={1}
                max={365}
                step={1}
              />{' '}
              日後まで公開
            </label>
            <p className="text-xs text-brand-muted mt-1">予約の公開範囲を設定します（1〜365日）</p>
            {fieldErrors.publicDays && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.publicDays}</p>
            )}
          </div>
        </div>
      </Card>

      {/* セクションB: テナント情報 */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">テナント情報</h3>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">店舗名 / ブランド名 *</label>
            <input
              type="text"
              value={formData.tenant?.name ?? ''}
              onChange={(e) => {
                setFormData({
                  ...formData,
                  tenant: { ...(formData.tenant || { name: '', email: '' }), name: e.target.value },
                });
                setFieldErrors((prev) => {
                  const newErrors = { ...prev };
                  delete newErrors.tenantName;
                  return newErrors;
                });
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary ${
                fieldErrors.tenantName ? 'border-red-300' : 'border-brand-border'
              }`}
              placeholder="例: Lumiere 表参道"
              maxLength={80}
            />
            {fieldErrors.tenantName && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.tenantName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">連絡先メールアドレス *</label>
            <input
              type="email"
              value={formData.tenant?.email ?? ''}
              onChange={(e) => {
                setFormData({
                  ...formData,
                  tenant: { ...(formData.tenant || { name: '', email: '' }), email: e.target.value },
                });
                setFieldErrors((prev) => {
                  const newErrors = { ...prev };
                  delete newErrors.tenantEmail;
                  return newErrors;
                });
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary ${
                fieldErrors.tenantEmail ? 'border-red-300' : 'border-brand-border'
              }`}
              placeholder="contact@example.com"
            />
            {fieldErrors.tenantEmail && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.tenantEmail}</p>
            )}
          </div>
        </div>
      </Card>

      {/* セクションC: 営業時間・定休日・例外日 */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">営業時間・定休日・例外日</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">営業開始時間 *</label>
              <input
                type="time"
                value={formData.businessHours?.openTime ?? '10:00'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    businessHours: { ...(formData.businessHours || { openTime: '10:00', closeTime: '19:00' }), openTime: e.target.value },
                  })
                }
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">営業終了時間 *</label>
              <input
                type="time"
                value={formData.businessHours?.closeTime ?? '19:00'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    businessHours: { ...(formData.businessHours || { openTime: '10:00', closeTime: '19:00' }), closeTime: e.target.value },
                  })
                }
                className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">定休日</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, index) => (
                <button
                  key={index}
                  onClick={() => {
                    const closed = formData.closedWeekdays.includes(index)
                      ? formData.closedWeekdays.filter((d) => d !== index)
                      : [...formData.closedWeekdays, index];
                    setFormData({ ...formData, closedWeekdays: closed });
                  }}
                  className={`px-4 py-2 rounded-xl border transition-all ${
                    (formData.closedWeekdays || []).includes(index)
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-white border-brand-border text-brand-text hover:border-brand-primary'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-brand-text">例外日</label>
              <button
                onClick={handleAddException}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-medium hover:shadow-md transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>追加</span>
              </button>
            </div>

            {(!formData.exceptions || formData.exceptions.length === 0) ? (
              <p className="text-sm text-brand-muted text-center py-4">例外日がありません</p>
            ) : (
              <DataTable
                headers={['日付', '種別', '開始', '終了', 'メモ', '操作']}
                rows={(formData.exceptions || []).map((ex, index) => [
                  <input
                    key="date"
                    type="date"
                    value={ex.date}
                    onChange={(e) => handleExceptionChange(index, 'date', e.target.value)}
                    className="px-2 py-1 border border-brand-border rounded text-sm"
                  />,
                  <select
                    key="type"
                    value={ex.type}
                    onChange={(e) => handleExceptionChange(index, 'type', e.target.value)}
                    className="px-2 py-1 border border-brand-border rounded text-sm"
                  >
                    <option value="closed">休み</option>
                    <option value="short">短縮</option>
                    <option value="special">特別</option>
                  </select>,
                  ex.type !== 'closed' ? (
                    <input
                      key="openTime"
                      type="time"
                      value={ex.openTime || ''}
                      onChange={(e) => handleExceptionChange(index, 'openTime', e.target.value)}
                      className="px-2 py-1 border border-brand-border rounded text-sm"
                    />
                  ) : (
                    <span key="openTime" className="text-brand-muted">-</span>
                  ),
                  ex.type !== 'closed' ? (
                    <input
                      key="closeTime"
                      type="time"
                      value={ex.closeTime || ''}
                      onChange={(e) => handleExceptionChange(index, 'closeTime', e.target.value)}
                      className="px-2 py-1 border border-brand-border rounded text-sm"
                    />
                  ) : (
                    <span key="closeTime" className="text-brand-muted">-</span>
                  ),
                  <input
                    key="memo"
                    type="text"
                    value={ex.memo || ''}
                    onChange={(e) => handleExceptionChange(index, 'memo', e.target.value)}
                    className="px-2 py-1 border border-brand-border rounded text-sm"
                    placeholder="メモ"
                  />,
                  <button
                    key="delete"
                    onClick={() => handleRemoveException(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>,
                ])}
              />
            )}
          </div>
        </div>
      </Card>

      {/* セクションD: 予約ルール */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">予約ルール</h3>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">
              予約締切（当日何分前まで予約可） *
            </label>
            <input
              type="number"
              value={formData.rules?.cutoffMinutes ?? 120}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  rules: { ...(formData.rules || { cutoffMinutes: 120, cancelMinutes: 1440, anyCapacityPerSlot: 1 }), cutoffMinutes: parseInt(e.target.value) || 0 },
                })
              }
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              min={0}
              placeholder="120"
            />
            <p className="text-xs text-brand-muted mt-1">例: 120（2時間前まで）</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">
              キャンセル締切（何分前までキャンセル可） *
            </label>
            <input
              type="number"
              value={formData.rules?.cancelMinutes ?? 1440}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  rules: { ...(formData.rules || { cutoffMinutes: 120, cancelMinutes: 1440, anyCapacityPerSlot: 1 }), cancelMinutes: parseInt(e.target.value) || 0 },
                })
              }
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              min={0}
              placeholder="1440"
            />
            <p className="text-xs text-brand-muted mt-1">例: 1440（24時間前まで）</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">指名なし上限 *</label>
            <input
              type="number"
              value={formData.rules?.anyCapacityPerSlot ?? 1}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  rules: { ...(formData.rules || { cutoffMinutes: 120, cancelMinutes: 1440, anyCapacityPerSlot: 1 }), anyCapacityPerSlot: parseInt(e.target.value) || 1 },
                })
              }
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              min={1}
              placeholder="1"
            />
            <p className="text-xs text-brand-muted mt-1">1つの時間枠に受け入れ可能な指名なし予約数</p>
          </div>
        </div>
      </Card>

      {/* セクションE: 通知設定 */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">通知設定</h3>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enableAdminNotify"
              checked={formData.notifications?.enableAdminNotify ?? false}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  notifications: { ...(formData.notifications || { enableAdminNotify: false, enableCustomerNotify: false }), enableAdminNotify: e.target.checked },
                })
              }
              className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
            />
            <label htmlFor="enableAdminNotify" className="text-sm font-medium text-brand-text">
              管理者通知を有効にする
            </label>
          </div>

          {(formData.notifications?.enableAdminNotify ?? false) && (
            <>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-2">Slack Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.notifications?.slackWebhookUrl || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notifications: { ...(formData.notifications || { enableAdminNotify: false, enableCustomerNotify: false }), slackWebhookUrl: e.target.value },
                      })
                    }
                    className="flex-1 px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                    placeholder="https://hooks.slack.com/services/..."
                  />
                  <button
                    onClick={handleTestSlack}
                    disabled={slackTestLoading || !formData.notifications?.slackWebhookUrl}
                    className="px-4 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center gap-2 disabled:bg-brand-muted disabled:cursor-not-allowed"
                  >
                    {slackTestLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>テスト送信</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-text mb-2">通知先メールアドレス</label>
                <input
                  type="email"
                  value={formData.notifications?.email || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      notifications: { ...(formData.notifications || { enableAdminNotify: false, enableCustomerNotify: false }), email: e.target.value },
                    })
                  }
                  className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                  placeholder="admin@example.com"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enableCustomerNotify"
              checked={formData.notifications?.enableCustomerNotify ?? false}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  notifications: { ...(formData.notifications || { enableAdminNotify: false, enableCustomerNotify: false }), enableCustomerNotify: e.target.checked },
                })
              }
              className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
            />
            <label htmlFor="enableCustomerNotify" className="text-sm font-medium text-brand-text">
              顧客通知を有効にする（将来実装）
            </label>
          </div>
        </div>
      </Card>

      {/* セクションF: 指名なしの自動割当ルール */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">指名なしの自動割当ルール</h3>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">割当モード *</label>
            <select
              value={formData.assignment?.mode ?? 'manual'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  assignment: {
                    ...(formData.assignment || { mode: 'manual', strategy: 'priority', priorityOrder: [] }),
                    mode: e.target.value as 'manual' | 'auto',
                  },
                })
              }
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            >
              <option value="manual">手動</option>
              <option value="auto">自動</option>
            </select>
          </div>

          {(formData.assignment?.mode ?? 'manual') === 'auto' && (
            <>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-2">割当戦略 *</label>
                <select
                  value={formData.assignment?.strategy || 'priority'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      assignment: {
                        ...(formData.assignment || { mode: 'manual', strategy: 'priority', priorityOrder: [] }),
                        strategy: e.target.value as 'priority' | 'round_robin' | 'least_busy',
                      },
                    })
                  }
                  className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                >
                  <option value="priority">優先順</option>
                  <option value="round_robin">均等割当</option>
                  <option value="least_busy">最少負荷（将来実装）</option>
                </select>
              </div>

              {(formData.assignment?.strategy || 'priority') === 'priority' && (
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-2">優先順（スタッフID）</label>
                  <input
                    type="text"
                    value={formData.assignment?.priorityOrder?.join(', ') || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        assignment: {
                          ...(formData.assignment || { mode: 'manual', strategy: 'priority', priorityOrder: [] }),
                          priorityOrder: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                    placeholder="staff1, staff2, staff3"
                  />
                  <p className="text-xs text-brand-muted mt-1">カンマ区切りでスタッフIDを入力</p>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* セクションG: 外部連携 */}
      <Card>
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-brand-text">外部連携</h3>

          <div className="space-y-4">
            {/* LINE公式アカウント連携 */}
            <div className="p-4 border border-brand-border rounded-xl bg-brand-bg">
              {(() => {
                // lineStatus.kind による分岐のみで描画（旧コードを完全に削除）
                if (lineStatus.kind === 'loading') {
                  return (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-primary"></div>
                      <span className="ml-2 text-sm text-brand-muted">読み込み中...</span>
                    </div>
                  );
                }

                if (lineStatus.kind === 'unconfigured') {
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-sm font-medium text-brand-text">LINE公式アカウント連携</span>
                        </div>
                        <span className="text-xs text-red-600 font-medium">未設定</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-700 font-medium mb-1">LINE設定が必要です</p>
                          <p className="text-xs text-blue-600">{lineStatus.message || 'LINE公式アカウントの設定情報を入力してください。'}</p>
                        </div>

                        {/* LINE設定フォーム */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-brand-text mb-1">
                              LINE Login Channel ID <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={lineConfigForm.clientId}
                              onChange={(e) => {
                                const value = e.target.value;
                                setLineConfigForm((prev) => ({ ...prev, clientId: value }));
                                if (lineConfigErrors.clientId) {
                                  setLineConfigErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.clientId;
                                    return next;
                                  });
                                }
                              }}
                              placeholder="例: 1234567890"
                              disabled={lineConfigSaving}
                              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary ${
                                lineConfigErrors.clientId
                                  ? 'border-red-300 bg-red-50'
                                  : 'border-brand-border bg-white'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            />
                            {lineConfigErrors.clientId && (
                              <p className="mt-1 text-xs text-red-600">{lineConfigErrors.clientId}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-brand-text mb-1">
                              LINE Messaging API Channel Access Token <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="password"
                              value={lineConfigForm.channelAccessToken}
                              onChange={(e) => {
                                const value = e.target.value;
                                setLineConfigForm((prev) => ({ ...prev, channelAccessToken: value }));
                                if (lineConfigErrors.channelAccessToken) {
                                  setLineConfigErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.channelAccessToken;
                                    return next;
                                  });
                                }
                              }}
                              placeholder="長期間有効なトークンを入力"
                              disabled={lineConfigSaving}
                              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary ${
                                lineConfigErrors.channelAccessToken
                                  ? 'border-red-300 bg-red-50'
                                  : 'border-brand-border bg-white'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            />
                            {lineConfigErrors.channelAccessToken && (
                              <p className="mt-1 text-xs text-red-600">{lineConfigErrors.channelAccessToken}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-brand-text mb-1">
                              LINE Messaging API Channel Secret <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="password"
                              value={lineConfigForm.channelSecret}
                              onChange={(e) => {
                                const value = e.target.value;
                                setLineConfigForm((prev) => ({ ...prev, channelSecret: value }));
                                if (lineConfigErrors.channelSecret) {
                                  setLineConfigErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.channelSecret;
                                    return next;
                                  });
                                }
                              }}
                              placeholder="Channel Secretを入力"
                              disabled={lineConfigSaving}
                              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary ${
                                lineConfigErrors.channelSecret
                                  ? 'border-red-300 bg-red-50'
                                  : 'border-brand-border bg-white'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            />
                            {lineConfigErrors.channelSecret && (
                              <p className="mt-1 text-xs text-red-600">{lineConfigErrors.channelSecret}</p>
                            )}
                          </div>

                          {lineError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                              <p className="text-xs text-red-700">{lineError}</p>
                            </div>
                          )}

                          <button
                            onClick={async () => {
                              // バリデーション
                              const errors: Record<string, string> = {};
                              if (!lineConfigForm.clientId) {
                                errors.clientId = 'LINE Login Channel IDは必須です';
                              } else if (!/^\d+$/.test(lineConfigForm.clientId)) {
                                errors.clientId = 'LINE Login Channel IDは数字のみです';
                              }
                              if (!lineConfigForm.channelAccessToken) {
                                errors.channelAccessToken = 'Channel Access Tokenは必須です';
                              } else if (lineConfigForm.channelAccessToken.length < 10) {
                                errors.channelAccessToken = 'Channel Access Tokenが短すぎます';
                              }
                              if (!lineConfigForm.channelSecret) {
                                errors.channelSecret = 'Channel Secretは必須です';
                              } else if (lineConfigForm.channelSecret.length < 10) {
                                errors.channelSecret = 'Channel Secretが短すぎます';
                              }

                              if (Object.keys(errors).length > 0) {
                                setLineConfigErrors(errors);
                                return;
                              }

                              setLineConfigSaving(true);
                              setLineError(null);
                              setLineConfigErrors({});
                              try {
                                await updateLineConfig(lineConfigForm);
                                
                                // フォームをクリア（秘密値は復元しない）
                                setLineConfigForm({
                                  clientId: '',
                                  channelAccessToken: '',
                                  channelSecret: '',
                                });
                                
                                // 保存後にステータス再取得（画面を即座に更新）
                                const newStatus = await getLineStatus();
                                setLineStatus(newStatus);
                                
                                // 成功メッセージ
                                setSuccess(true);
                                setTimeout(() => setSuccess(false), 3000);
                              } catch (err) {
                                setLineError(err instanceof Error ? err.message : '設定の保存に失敗しました');
                              } finally {
                                setLineConfigSaving(false);
                              }
                            }}
                            disabled={lineConfigSaving}
                            className="w-full px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {lineConfigSaving ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>保存中...</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                <span>LINE設定を保存</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  );
                }

                if (lineStatus.kind === 'error') {
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-sm font-medium text-brand-text">LINE公式アカウント連携</span>
                        </div>
                        <span className="text-xs text-red-600 font-medium">エラー</span>
                      </div>
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-700 font-medium mb-1">エラーが発生しました</p>
                        <p className="text-xs text-red-600">{lineStatus.message}</p>
                      </div>
                      <button
                        onClick={async () => {
                          setLineError(null);
                          setLineBusyWithRef(true);
                          try {
                            await refreshLineStatus();
                            // cooldown を設定（5秒）
                            linePollCooldownUntil.current = Date.now() + 5000;
                          } catch (err) {
                            setLineStatus({
                              kind: 'error',
                              message: err instanceof Error ? err.message : 'ステータスの取得に失敗しました',
                            });
                          } finally {
                            setLineBusyWithRef(false);
                          }
                        }}
                        className="w-full px-4 py-2 bg-white text-brand-text border border-brand-border rounded-xl text-sm font-medium hover:shadow-md transition-all flex items-center justify-center gap-2"
                      >
                        <span>再試行</span>
                      </button>
                    </>
                  );
                }

                if (lineStatus.kind === 'disconnected') {
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full bg-gray-300" />
                          <span className="text-sm font-medium text-brand-text">LINE公式アカウント連携</span>
                        </div>
                        <span className="text-xs text-gray-500">未接続</span>
                      </div>

                      {lineError && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-700">{lineError}</p>
                        </div>
                      )}

                      <button
                        onClick={async () => {
                          setLineError(null);
                          setLineConnecting(true);
                          setLineBusyWithRef(true);
                          try {
                            const tenantId = 'default';
                            const params = new URLSearchParams({ tenantId });
                            const res = await fetch(`https://saas-factory-api..workers.dev/admin/integrations/line/auth-url?${params.toString()}`, {
                              method: 'GET',
                              cache: 'no-store',
                            });

                            if (!res.ok) {
                              throw new Error(`Request failed with status ${res.status}`);
                            }

                            const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };

                            if (!data.ok || !data.url) {
                              throw new Error(data.error ?? 'LINE auth-url is missing');
                            }

                            // LINE 認可画面へリダイレクト
                            window.location.href = data.url;
                          } catch (err) {
                            const errorMessage = err instanceof Error ? err.message : '認証URLの取得に失敗しました';
                            setLineError(errorMessage);
                            console.error('Failed to start LINE auth flow', err);
                          } finally {
                            setLineConnecting(false);
                            setLineBusyWithRef(false);
                          }
                        }}
                        disabled={lineConnecting}
                        className="w-full px-4 py-2 bg-white text-brand-text border border-brand-border rounded-xl text-sm font-medium hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {lineConnecting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-primary"></div>
                            <span>処理中...</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-4 h-4" />
                            <span>LINEと連携する</span>
                          </>
                        )}
                      </button>
                    </>
                  );
                }

                // lineStatus.kind === 'connected'
                
                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-brand-text">LINE公式アカウント連携</span>
                      </div>
                      <span className="text-xs text-green-600 font-medium">接続済み</span>
                    </div>

                    {lineStatus.lineUserIdMasked && (
                      <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs text-green-700">
                          LINE User ID: {lineStatus.lineUserIdMasked}
                        </p>
                        {lineStatus.linkedAt && (
                          <p className="text-xs text-green-600 mt-1">
                            接続日時: {new Date(lineStatus.linkedAt).toLocaleString('ja-JP')}
                          </p>
                        )}
                      </div>
                    )}

                    {lineError && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-700">{lineError}</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setLineTesting(true);
                          setLineError(null);
                          setLineBusyWithRef(true);
                          try {
                            const result = await testLineConnection();
                            if (result.ok) {
                              setSuccess(true);
                              setTimeout(() => setSuccess(false), 3000);
                              // ステータスを手動リフレッシュ
                              await refreshLineStatus();
                              // cooldown を設定（7秒）
                              linePollCooldownUntil.current = Date.now() + 7000;
                            } else {
                              setLineError(result.error || '疎通テストに失敗しました');
                            }
                          } catch (err) {
                            setLineError(err instanceof Error ? err.message : '疎通テストに失敗しました');
                          } finally {
                            setLineTesting(false);
                            setLineBusyWithRef(false);
                          }
                        }}
                        disabled={lineTesting || lineBusy}
                        className="flex-1 px-4 py-2 bg-white text-brand-text border border-brand-border rounded-xl text-sm font-medium hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {lineTesting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-primary"></div>
                            <span>テスト中...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>疎通テスト</span>
                          </>
                        )}
                      </button>
                      <button
                            onClick={async () => {
                              if (!window.confirm('LINE連携を解除しますか？')) {
                                return;
                              }
                              setLineDisconnecting(true);
                              setLineError(null);
                              setLineBusyWithRef(true);
                              try {
                                const result = await disconnectLine();
                                if (result.ok) {
                                  // ステータスを手動リフレッシュ
                                  await refreshLineStatus();
                                  // cooldown を設定（7秒）
                                  linePollCooldownUntil.current = Date.now() + 7000;
                                  setSuccess(true);
                                  setTimeout(() => setSuccess(false), 3000);
                                } else {
                                  setLineError(result.error || '連携解除に失敗しました');
                                }
                              } catch (err) {
                                setLineError(err instanceof Error ? err.message : '連携解除に失敗しました');
                              } finally {
                                setLineDisconnecting(false);
                                setLineBusyWithRef(false);
                              }
                            }}
                        disabled={lineDisconnecting || lineBusy}
                        className="flex-1 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {lineDisconnecting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            <span>解除中...</span>
                          </>
                        ) : (
                          <>
                            <Unlink className="w-4 h-4" />
                            <span>連携解除</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* 通知設定 */}
                    <div className="mt-4 pt-4 border-t border-brand-border space-y-3">
                      <h4 className="text-sm font-semibold text-brand-text">通知設定</h4>
                      
                      <label className="flex items-center justify-between p-3 bg-white border border-brand-border rounded-lg cursor-pointer hover:bg-brand-bg transition-all">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-brand-text">通知を有効にする</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={lineStatus.notifyEnabled}
                          disabled={lineTesting || lineDisconnecting || lineBusy}
                          onChange={async (e) => {
                            const enabled = e.target.checked;
                            setLineError(null);
                            setLineBusyWithRef(true);
                            try {
                              const result = await updateLineNotify(enabled);
                              if (result.ok) {
                                // ステータスを手動リフレッシュ
                                await refreshLineStatus();
                                // cooldown を設定（7秒）
                                linePollCooldownUntil.current = Date.now() + 7000;
                                setSuccess(true);
                                setTimeout(() => setSuccess(false), 3000);
                              } else {
                                setLineError(result.error || '通知設定の更新に失敗しました');
                              }
                            } catch (err) {
                              setLineError(err instanceof Error ? err.message : '通知設定の更新に失敗しました');
                            } finally {
                              setLineBusyWithRef(false);
                            }
                          }}
                          className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </label>
                    </div>

                    {/* 状態表示 */}
                    {(lineStatus.lastSentAt || lineStatus.lastError) && (
                      <div className="mt-4 pt-4 border-t border-brand-border space-y-2">
                        <h4 className="text-sm font-semibold text-brand-text">状態</h4>

                        
                        {lineStatus.lastSentAt && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-xs text-green-700 font-medium mb-1">最終送信日時</p>
                            <p className="text-xs text-green-600">
                              {new Date(lineStatus.lastSentAt.at).toLocaleString('ja-JP', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </p>
                            <p className="text-xs text-green-600 mt-1 opacity-75">
                              {lineStatus.lastSentAt.message}
                            </p>
                          </div>
                        )}

                        {lineStatus.lastError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-xs text-red-700 font-medium mb-1">最終エラー</p>
                            <p className="text-xs text-red-600">
                              {new Date(lineStatus.lastError.at).toLocaleString('ja-JP', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </p>
                            <p className="text-xs text-red-600 mt-1 font-medium">
                              {lineStatus.lastError.error}
                            </p>
                            <p className="text-xs text-red-600 mt-1 opacity-75">
                              {lineStatus.lastError.message}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="flex items-center justify-between p-4 border border-brand-border rounded-xl bg-brand-bg">
              <div className="flex items-center gap-3">
                <span
                  className={`w-3 h-3 rounded-full ${
                    formData.integrations.stripe?.connected ? 'bg-purple-500' : 'bg-gray-300'
                  }`}
                />
                <span className="text-sm font-medium text-brand-text">Stripe 決済連携</span>
              </div>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    alert('準備中: Stripe 決済連携');
                  }
                }}
                className="px-4 py-2 bg-white text-brand-text border border-brand-border rounded-xl text-sm font-medium hover:shadow-md transition-all"
              >
                設定する
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 固定フッター保存ボタン */}
      <div className="sticky bottom-0 bg-white border-t border-brand-border px-6 py-4 -mx-6 -mb-6 mt-6 z-10">
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:bg-brand-muted disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>変更を保存して適用</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}



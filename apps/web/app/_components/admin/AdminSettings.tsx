'use client';

import { useState, useEffect } from 'react';
import { getSettings, updateSettings, type AdminSettings } from '@/src/lib/bookingApi';
import { ApiClientError } from '@/src/lib/apiClient';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import { Save } from 'lucide-react';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdminSettings>({
    openTime: '10:00',
    closeTime: '18:00',
    slotIntervalMin: 60,
    closedWeekdays: [0],
    timezone: 'Asia/Tokyo',
  });

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      setSettings(data);
      setFormData(data);
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch settings';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async () => {
    // バリデーション
    if (!/^\d{2}:\d{2}$/.test(formData.openTime)) {
      setError('営業開始時間はHH:mm形式で入力してください');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(formData.closeTime)) {
      setError('営業終了時間はHH:mm形式で入力してください');
      return;
    }
    if (formData.slotIntervalMin <= 0) {
      setError('時間枠間隔は1分以上である必要があります');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await updateSettings(formData);
      setSettings(updated);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update settings';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleWeekdayToggle = (day: number) => {
    setFormData((prev) => {
      const closed = prev.closedWeekdays.includes(day)
        ? prev.closedWeekdays.filter((d) => d !== day)
        : [...prev.closedWeekdays, day];
      return { ...prev, closedWeekdays: closed };
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="管理者設定" subtitle="システム設定を変更します。" />
        <Card>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
            <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="管理者設定"
        subtitle="システム設定を変更します。"
        right={
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-brand-primary text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center gap-2 disabled:bg-brand-muted disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            <span>{saving ? '保存中...' : '保存'}</span>
          </button>
        }
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Card>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">営業開始時間 *</label>
            <input
              type="time"
              value={formData.openTime}
              onChange={(e) => setFormData({ ...formData, openTime: e.target.value })}
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">営業終了時間 *</label>
            <input
              type="time"
              value={formData.closeTime}
              onChange={(e) => setFormData({ ...formData, closeTime: e.target.value })}
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">時間枠間隔（分） *</label>
            <input
              type="number"
              value={formData.slotIntervalMin}
              onChange={(e) => setFormData({ ...formData, slotIntervalMin: parseInt(e.target.value) || 60 })}
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-2">定休日</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, index) => (
                <button
                  key={index}
                  onClick={() => handleWeekdayToggle(index)}
                  className={`px-4 py-2 rounded-xl border transition-all ${
                    formData.closedWeekdays.includes(index)
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
            <label className="block text-sm font-medium text-brand-text mb-2">タイムゾーン</label>
            <input
              type="text"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              placeholder="Asia/Tokyo"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

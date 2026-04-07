'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

// Use proxy for same-origin requests (avoids CORS in LINE browser)
const API_BASE = '/api/proxy';

interface KarteForm {
  customerName: string;
  petName: string;
  petBreed: string;
  petAge: string;
  petWeight: string;
  allergies: string;
  cutStyle: string;
  notes: string;
}

const EMPTY: KarteForm = {
  customerName: '', petName: '', petBreed: '', petAge: '',
  petWeight: '', allergies: '', cutStyle: '', notes: '',
};

export default function KartePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#999' }}>読み込み中...</div>}>
      <KarteContent />
    </Suspense>
  );
}

function KarteContent() {
  const params = useSearchParams();
  const tenantId = params.get('tenantId') || '';
  const userId = params.get('userId') || 'anonymous';

  const [form, setForm] = useState<KarteForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fetchKarte = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/public/karte?tenantId=${encodeURIComponent(tenantId)}&userId=${encodeURIComponent(userId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json() as any;
      if (json.ok && json.data) {
        const d = json.data;
        setForm({
          customerName: d.customer_name || '',
          petName: d.pet_name || '',
          petBreed: d.pet_breed || '',
          petAge: d.pet_age || '',
          petWeight: d.pet_weight || '',
          allergies: d.allergies || '',
          cutStyle: d.cut_style || '',
          notes: d.notes || '',
        });
      }
    } catch {}
    setLoading(false);
  }, [tenantId, userId]);

  useEffect(() => { fetchKarte(); }, [fetchKarte]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/public/karte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, userId, ...form }),
      });
      const json = await res.json() as any;
      if (json.ok) {
        setSaved(true);
      } else {
        setError(json.error || '保存に失敗しました');
      }
    } catch (e: any) {
      setError(e.message || '通信エラー');
    }
    setSaving(false);
  };

  const update = (key: keyof KarteForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }));
    setSaved(false);
  };

  if (!tenantId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
        パラメータが不足しています
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFF8F0', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px' }}>
        {/* Header */}
        <div style={{
          background: '#1C1C1C', borderRadius: 12, padding: '20px 16px', marginBottom: 20,
          color: '#fff', textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>カルテ</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>あなたの情報を登録・編集</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>読み込み中...</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="お名前" value={form.customerName} onChange={update('customerName')} placeholder="山田 太郎" />
              <Field label="ペット名" value={form.petName} onChange={update('petName')} placeholder="ポチ" />
              <Field label="犬種" value={form.petBreed} onChange={update('petBreed')} placeholder="トイプードル" />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="年齢" value={form.petAge} onChange={update('petAge')} placeholder="3歳" />
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="体重" value={form.petWeight} onChange={update('petWeight')} placeholder="4kg" />
                </div>
              </div>
              <Field label="アレルギー" value={form.allergies} onChange={update('allergies')} placeholder="なし" />
              <Field label="カットスタイル" value={form.cutStyle} onChange={update('cutStyle')} placeholder="テディベアカット" />
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>備考</label>
                <textarea
                  value={form.notes}
                  onChange={update('notes')}
                  placeholder="気になることがあればご記入ください"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid #ddd', fontSize: 15, resize: 'vertical',
                    background: '#fff', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {error && <div style={{ color: '#c00', marginTop: 12, fontSize: 14, textAlign: 'center' }}>{error}</div>}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '14px 0', marginTop: 20, borderRadius: 10,
                background: saved ? '#4CAF50' : '#1C1C1C', color: '#fff',
                fontSize: 16, fontWeight: 700, border: 'none', cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1, transition: 'background 0.3s',
              }}
            >
              {saving ? '保存中...' : saved ? '保存しました' : '保存する'}
            </button>

            {saved && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <a
                  href="https://line.me/R/"
                  style={{
                    display: 'inline-block', padding: '12px 32px', borderRadius: 10,
                    background: '#06C755', color: '#fff', fontSize: 15, fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  LINEに戻る
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: '1px solid #ddd', fontSize: 15, background: '#fff',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

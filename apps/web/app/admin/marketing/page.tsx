'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminTopBar from '../../_components/ui/AdminTopBar';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import StoryCalendar, { downloadCalendarPng, type TimeBlock } from '@/src/components/StoryCalendar';
import { Send, Trash2, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiBase(path: string, tenantId: string): string {
  return `/api/proxy/${path}?tenantId=${encodeURIComponent(tenantId)}`;
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m };
}

function shiftMonth(ym: string, delta: number) {
  const { year, month } = parseYearMonth(ym);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYearMonth(ym: string) {
  const { year, month } = parseYearMonth(ym);
  return `${year}年${month}月`;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  full: '満席',
  closed: '定休日',
  partial: '一部空き',
  open: '空き',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const { tenantId, status: tenantStatus } = useAdminTenantId();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [parseResult, setParseResult] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [storeName, setStoreName] = useState('');

  // ── Fetch settings ────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    fetch(apiBase('admin/settings', tenantId))
      .then(r => r.json())
      .then((data: any) => {
        setStoreName(data.storeName || data.tenant?.name || '');
      })
      .catch(() => {});
  }, [tenantId]);

  // ── Fetch blocks ──────────────────────────────────────────────────────
  const fetchBlocks = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(apiBase(`admin/time-blocks`, tenantId) + `&month=${yearMonth}`);
      const data: any = await res.json();
      setBlocks((data.blocks || []).map((b: any) => ({ ...b, memo: b.memo ?? b.note ?? '', timeRange: b.timeRange ?? null })));
    } catch {
      setBlocks([]);
    }
  }, [tenantId, yearMonth]);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  // ── AI Parse ──────────────────────────────────────────────────────────
  const handleAiParse = async () => {
    if (!tenantId || !text.trim()) return;
    setLoading(true);
    setParseResult('');
    try {
      const res = await fetch(apiBase('admin/time-blocks/ai-parse', tenantId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), yearMonth }),
      });
      const data: any = await res.json();
      if (data.ok) {
        setParseResult(`${data.inserted ?? data.parsed ?? 0}件の空き枠を登録しました`);
        setText('');
        fetchBlocks();
      } else {
        setParseResult(`エラー: ${data.error || '登録に失敗しました'}`);
      }
    } catch (err: any) {
      setParseResult(`エラー: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Delete block ──────────────────────────────────────────────────────
  const handleDelete = async (blockId: string) => {
    if (!tenantId) return;
    try {
      await fetch(apiBase(`admin/time-blocks/${blockId}`, tenantId), { method: 'DELETE' });
      fetchBlocks();
    } catch {}
  };

  // ── Download PNG ──────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCalendarPng(yearMonth);
    } catch (err: any) {
      alert('ダウンロードに失敗しました: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const { year, month } = parseYearMonth(yearMonth);

  return (
    <>
      <AdminTopBar title="マーケティング" subtitle="AIで空き枠を登録し、Instagramストーリー用カレンダー画像を生成します" />

      <div className="px-4 sm:px-6 pb-8 space-y-6 sm:space-y-8">

        {/* ── Section 1: AIチャット空き枠入力 ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="text-xl">🤖</span>
            AIチャット空き枠入力
          </h2>

          <div className="space-y-4">
            {/* Text input */}
            <div>
              <textarea
                className="w-full min-h-[44px] border border-gray-300 rounded-lg p-4 text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent resize-none"
                rows={4}
                placeholder={`今月の空き枠を入力してください\n例: "6日13時以降、8日Closed、12日満員、29日は9:00と13:00が空いてます"`}
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Submit */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <button
                onClick={handleAiParse}
                disabled={loading || !text.trim()}
                className="inline-flex items-center justify-center gap-2 bg-brand-primary text-white px-5 py-2.5 min-h-[44px] rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition w-full sm:w-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                AIで登録
              </button>

              <span className="text-sm text-gray-500 text-center sm:text-left">
                対象月: {formatYearMonth(yearMonth)}
              </span>
            </div>

            {/* Result message */}
            {parseResult && (
              <div className={`text-sm p-3 rounded-lg ${parseResult.startsWith('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {parseResult}
              </div>
            )}

            {/* Registered blocks list */}
            {blocks.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-600 mb-2">
                  登録済みの空き枠 ({blocks.length}件)
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {blocks.map(block => (
                    <div key={block.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-gray-700">{block.date}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          block.blockType === 'full' ? 'bg-red-100 text-red-700' :
                          block.blockType === 'closed' ? 'bg-gray-200 text-gray-600' :
                          block.blockType === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {BLOCK_TYPE_LABELS[block.blockType] || block.blockType}
                        </span>
                        {block.availableSlots && (
                          <span className="text-gray-500 text-xs">
                            {block.availableSlots.join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(block.id)}
                        className="text-gray-400 hover:text-red-500 transition p-1"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 2: カレンダー画像生成 ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="text-xl">📅</span>
            カレンダー画像生成
          </h2>

          {/* Month selector + download */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setYearMonth(ym => shiftMonth(ym, -1))}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-lg font-medium min-w-[120px] text-center">
                {formatYearMonth(yearMonth)}
              </span>
              <button
                onClick={() => setYearMonth(ym => shiftMonth(ym, 1))}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 bg-brand-primary text-white px-5 py-2.5 min-h-[44px] rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition w-full sm:w-auto"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              PNG ダウンロード
            </button>
          </div>

          {/* Calendar preview (scaled) */}
          <div className="flex justify-center overflow-hidden">
            <div style={{ width: '360px', height: '640px', overflow: 'hidden' }}>
              <div style={{ transform: 'scale(0.333)', transformOrigin: 'top left' }}>
                <StoryCalendar
                  yearMonth={yearMonth}
                  shopName={storeName}
                  blocks={blocks}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

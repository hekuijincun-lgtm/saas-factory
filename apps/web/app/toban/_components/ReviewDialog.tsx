"use client";

import { useState } from "react";
import { Check, X, Plus, Ban, RotateCcw, AlertTriangle } from "lucide-react";
import type { Row, Schedule } from "../_lib/types";
import { createRow } from "../_lib/types";
import { calcWeekday } from "../_lib/dateUtils";

interface Props {
  rows: Row[];
  schedule: Schedule;
  onChange: (schedule: Schedule) => void;
  onClose: () => void;
  title: string;
}

/**
 * OCR / Excel 読み取り結果の確認・修正ダイアログ
 * 確認後に表エディタに流し込む
 */
/** 簡易類似度: 1文字違いの名前を候補として返す */
function findSimilar(name: string, members: string[]): string[] {
  if (!name.trim() || members.length === 0) return [];
  return members.filter((m) => {
    if (m === name) return false;
    // レーベンシュタイン距離1以内
    if (Math.abs(m.length - name.length) > 1) return false;
    let diff = 0;
    const longer = m.length >= name.length ? m : name;
    const shorter = m.length >= name.length ? name : m;
    let si = 0;
    for (let li = 0; li < longer.length && diff <= 1; li++) {
      if (shorter[si] === longer[li]) {
        si++;
      } else {
        diff++;
        if (m.length === name.length) si++;
      }
    }
    return diff <= 1;
  });
}

export default function ReviewDialog({ rows: initialRows, schedule, onChange, onClose, title }: Props) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const memberList = schedule.members;

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const updateMember = (rowIdx: number, memberIdx: number, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const members = [...r.members];
        members[memberIdx] = value;
        return { ...r, members };
      })
    );
  };

  const addMember = (rowIdx: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIdx ? { ...r, members: [...r.members, ""] } : r))
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleCancelled = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, cancelled: !r.cancelled } : r))
    );
  };

  const handleConfirm = () => {
    // 既存の行に追加
    onChange({
      ...schedule,
      rows: [...schedule.rows, ...rows],
    });
    onClose();
  };

  const handleReplace = () => {
    // 既存の行を置き換え
    onChange({
      ...schedule,
      rows: rows,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-4xl max-h-[90vh] sm:max-h-[85vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 truncate">{title}</h3>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {rows.length}件検出。確認・修正してください。
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2">
            <X size={20} />
          </button>
        </div>

        {/* コンテンツ — モバイルではカード表示 */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-3 sm:py-4">
          {/* デスクトップ: テーブル */}
          <table className="hidden sm:table w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-2 py-2 text-left font-medium">日付</th>
                <th className="px-2 py-2 text-left font-medium w-10">曜日</th>
                <th className="px-2 py-2 text-left font-medium">場所</th>
                <th className="px-2 py-2 text-left font-medium">担当</th>
                <th className="px-2 py-2 text-left font-medium w-10">中止</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.id} className={`border-t border-gray-200 ${row.cancelled ? "bg-gray-50 text-gray-400" : ""}`}>
                  <td className="px-1 py-1.5">
                    <input type="text" value={row.date} onChange={(e) => { const date = e.target.value; const weekday = calcWeekday(date, schedule.year); updateRow(ri, { date, weekday }); }} className="w-20 px-2 py-1 text-sm border border-gray-300 rounded" />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <span className={`text-sm font-medium ${row.weekday === "土" ? "text-blue-600" : row.weekday === "日" ? "text-red-500" : "text-gray-600"}`}>{row.weekday}</span>
                  </td>
                  <td className="px-1 py-1.5">
                    <input type="text" value={row.place} onChange={(e) => updateRow(ri, { place: e.target.value })} className="w-28 px-2 py-1 text-sm border border-gray-300 rounded" />
                  </td>
                  <td className="px-1 py-1.5">
                    <div className="flex flex-wrap gap-1 items-center">
                      {row.members.map((m, mi) => {
                        const unknown = m.trim() && memberList.length > 0 && !memberList.includes(m.trim());
                        const similar = unknown ? findSimilar(m.trim(), memberList) : [];
                        return (
                          <div key={mi} className="relative group">
                            <input type="text" value={m} onChange={(e) => updateMember(ri, mi, e.target.value)} className={`w-20 px-2 py-1 text-sm border rounded ${unknown ? "border-yellow-400 bg-yellow-50" : "border-gray-300"}`} />
                            {similar.length > 0 && (
                              <div className="absolute z-10 top-full left-0 mt-0.5 hidden group-hover:block bg-white border border-yellow-300 rounded shadow-sm p-1 text-xs">
                                <span className="text-yellow-700">もしかして: </span>
                                {similar.map((s) => (
                                  <button key={s} onClick={() => updateMember(ri, mi, s)} className="text-blue-600 hover:underline ml-1">{s}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button onClick={() => addMember(ri)} className="text-blue-500 hover:text-blue-700"><Plus size={14} /></button>
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button onClick={() => toggleCancelled(ri)} className={`p-1 rounded hover:bg-gray-100 ${row.cancelled ? "text-orange-500" : "text-gray-300"}`}>
                      {row.cancelled ? <RotateCcw size={14} /> : <Ban size={14} />}
                    </button>
                  </td>
                  <td className="px-1 py-1.5">
                    <button onClick={() => removeRow(ri)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* モバイル: カード */}
          <div className="sm:hidden space-y-2">
            {rows.map((row, ri) => (
              <div key={row.id} className={`border rounded-lg p-3 space-y-2 ${row.cancelled ? "bg-gray-50 border-gray-300" : "border-gray-200"}`}>
                <div className="flex items-center gap-2">
                  <input type="text" value={row.date} onChange={(e) => { const date = e.target.value; const weekday = calcWeekday(date, schedule.year); updateRow(ri, { date, weekday }); }} className="w-16 px-2 py-1 text-sm border border-gray-300 rounded" />
                  <span className={`text-sm font-bold w-6 text-center ${row.weekday === "土" ? "text-blue-600" : row.weekday === "日" ? "text-red-500" : "text-gray-500"}`}>{row.weekday}</span>
                  <input type="text" value={row.place} onChange={(e) => updateRow(ri, { place: e.target.value })} className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded" />
                  <button onClick={() => toggleCancelled(ri)} className={`p-1 ${row.cancelled ? "text-orange-500" : "text-gray-300"}`}>
                    {row.cancelled ? <RotateCcw size={14} /> : <Ban size={14} />}
                  </button>
                  <button onClick={() => removeRow(ri)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.members.map((m, mi) => {
                    const unknown = m.trim() && memberList.length > 0 && !memberList.includes(m.trim());
                    const similar = unknown ? findSimilar(m.trim(), memberList) : [];
                    return (
                      <div key={mi}>
                        <input type="text" value={m} onChange={(e) => updateMember(ri, mi, e.target.value)} className={`w-20 px-2 py-1 text-sm border rounded ${unknown ? "border-yellow-400 bg-yellow-50" : "border-gray-300"}`} />
                        {similar.length > 0 && (
                          <div className="text-[10px] mt-0.5 text-yellow-700">
                            →{similar.map((s) => (
                              <button key={s} onClick={() => updateMember(ri, mi, s)} className="text-blue-600 hover:underline ml-1">{s}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => addMember(ri)} className="text-blue-500 hover:text-blue-700 p-1"><Plus size={14} /></button>
                </div>
                {row.cancelled && <span className="inline-block text-[10px] px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full">中止</span>}
              </div>
            ))}
          </div>

          {rows.some((r) => r.cancelled) && (
            <div className="flex items-center gap-2 mt-3 px-2 text-xs text-orange-600">
              <AlertTriangle size={13} />
              <span>取り消し線が検出された行があります</span>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <p className="hidden sm:block text-xs text-gray-400">
            画像・データはサーバーに保存されません
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              キャンセル
            </button>
            <button onClick={handleReplace} className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              置換
            </button>
            <button onClick={handleConfirm} className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 flex items-center justify-center gap-1.5">
              <Check size={15} />
              追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

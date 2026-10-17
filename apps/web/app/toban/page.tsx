"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Calendar,
  ChevronDown,
  Shield,
  Download,
} from "lucide-react";
import type { Schedule } from "./_lib/types";
import { createSchedule } from "./_lib/types";
import {
  loadOrCreate,
  saveSchedules,
  setActiveId,
  updateSchedule,
  deleteSchedule,
} from "./_lib/storage";
import ScheduleEditor from "./_components/ScheduleEditor";
import MemberManager from "./_components/MemberManager";
import PdfExportDialog from "./_components/PdfExportDialog";
import TextParseInput from "./_components/TextParseInput";
import ImageUploader from "./_components/ImageUploader";
import ExcelImporter from "./_components/ExcelImporter";

type Tab = "editor" | "text" | "import" | "members";

export default function TobanPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeId, setActive] = useState<string>("");
  const [tab, setTab] = useState<Tab>("editor");
  const [showPdf, setShowPdf] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 初期ロード
  useEffect(() => {
    const { schedules: s, activeId: id } = loadOrCreate();
    setSchedules(s);
    setActive(id);
    setLoaded(true);
  }, []);

  // 保存
  useEffect(() => {
    if (!loaded) return;
    saveSchedules(schedules);
  }, [schedules, loaded]);

  useEffect(() => {
    if (!loaded || !activeId) return;
    setActiveId(activeId);
  }, [activeId, loaded]);

  const current = schedules.find((s) => s.id === activeId);

  const handleScheduleChange = useCallback(
    (updated: Schedule) => {
      setSchedules((prev) => updateSchedule(prev, updated));
    },
    []
  );

  const handleAddSchedule = () => {
    const s = createSchedule({ title: "新しい当番表" });
    setSchedules((prev) => [...prev, s]);
    setActive(s.id);
    setShowSelector(false);
  };

  const handleDeleteSchedule = (id: string) => {
    if (schedules.length <= 1) return;
    const next = deleteSchedule(schedules, id);
    setSchedules(next);
    if (activeId === id) setActive(next[0]?.id ?? "");
  };

  const handleExcelExport = async () => {
    if (!current) return;
    try {
      const { writeXlsx } = await import("./_lib/excelUtils");
      const blob = await writeXlsx(current.rows, current.title);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${current.title || "当番表"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel出力エラー:", err);
      alert("Excel出力に失敗しました。");
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Calendar size={20} className="text-blue-600 flex-shrink-0" />
            <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">当番表メーカー</h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPdf(true)}
              className="px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
            >
              <FileText size={14} />
              <span className="hidden xs:inline">PDF</span>
            </button>
            <button
              onClick={handleExcelExport}
              className="px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
            >
              <Download size={14} />
              <span className="hidden xs:inline">Excel</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* プライバシー通知 */}
        <div className="flex items-start gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-50 border border-blue-100 rounded-lg text-xs sm:text-sm text-blue-700">
          <Shield size={14} className="mt-0.5 flex-shrink-0" />
          <p>データはブラウザ内に保存されます。サーバーへの送信は行いません。</p>
        </div>

        {/* スケジュール選択 — モバイルではスタック */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* 上段: スケジュールセレクタ + 年 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <button
                onClick={() => setShowSelector(!showSelector)}
                className="flex items-center gap-2 w-full sm:w-auto px-3 sm:px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                <span className="font-medium text-gray-800 truncate">
                  {current?.title || "当番表を選択"}
                </span>
                <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
              </button>

              {showSelector && (
                <div className="absolute top-full left-0 mt-1 w-full sm:w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-30">
                  {schedules.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 ${
                        s.id === activeId ? "bg-blue-50 text-blue-700" : "text-gray-700"
                      }`}
                    >
                      <span
                        onClick={() => {
                          setActive(s.id);
                          setShowSelector(false);
                        }}
                        className="flex-1 truncate"
                      >
                        {s.title || "無題"}
                      </span>
                      {schedules.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSchedule(s.id);
                          }}
                          className="text-gray-300 hover:text-red-500 ml-2"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleAddSchedule}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100"
                  >
                    <Plus size={14} />
                    新しい当番表を作成
                  </button>
                </div>
              )}
            </div>

            {/* 年の設定 */}
            {current && (
              <label className="flex items-center gap-1 text-sm text-gray-600 flex-shrink-0">
                <input
                  type="number"
                  value={current.year}
                  onChange={(e) =>
                    handleScheduleChange({
                      ...current,
                      year: parseInt(e.target.value) || new Date().getFullYear(),
                    })
                  }
                  className="w-16 sm:w-20 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center"
                />
                <span>年</span>
              </label>
            )}
          </div>

          {/* タイトル編集 */}
          {current && (
            <input
              type="text"
              value={current.title}
              onChange={(e) =>
                handleScheduleChange({ ...current, title: e.target.value })
              }
              placeholder="当番表タイトル"
              className="w-full sm:flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          )}
        </div>

        {/* タブ切り替え — モバイルでスクロール可能 */}
        <div className="flex border-b border-gray-200 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide">
          {(
            [
              { key: "editor", label: "表エディタ" },
              { key: "text", label: "テキスト" },
              { key: "import", label: "読み込み" },
              { key: "members", label: "名簿" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        {current && tab === "editor" && (
          <ScheduleEditor schedule={current} onChange={handleScheduleChange} />
        )}

        {current && tab === "text" && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <TextParseInput schedule={current} onChange={handleScheduleChange} />
          </div>
        )}

        {current && tab === "import" && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 space-y-6 sm:space-y-8">
            <ImageUploader schedule={current} onChange={handleScheduleChange} />
            <hr className="border-gray-200" />
            <ExcelImporter schedule={current} onChange={handleScheduleChange} />
          </div>
        )}

        {current && tab === "members" && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <MemberManager
              members={current.members}
              onChange={(members) =>
                handleScheduleChange({ ...current, members })
              }
            />
          </div>
        )}
      </main>

      {/* PDF出力ダイアログ */}
      {showPdf && current && (
        <PdfExportDialog
          rows={current.rows}
          defaultTitle={current.title}
          onClose={() => setShowPdf(false)}
        />
      )}
    </div>
  );
}

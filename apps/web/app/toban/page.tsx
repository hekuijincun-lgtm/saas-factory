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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={22} className="text-blue-600" />
            <h1 className="text-lg font-bold text-gray-800">当番表メーカー</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPdf(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
            >
              <FileText size={15} />
              <span className="hidden sm:inline">PDF出力</span>
            </button>
            <button
              onClick={handleExcelExport}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Excel出力</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* プライバシー通知 */}
        <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <Shield size={16} className="mt-0.5 flex-shrink-0" />
          <p>
            入力データはすべてブラウザ内（localStorage）に保存されます。サーバーへの送信・保存は行いません。
          </p>
        </div>

        {/* スケジュール選択 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowSelector(!showSelector)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              <span className="font-medium text-gray-800 max-w-[200px] truncate">
                {current?.title || "当番表を選択"}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {showSelector && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-30">
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

          {/* タイトル編集 */}
          {current && (
            <input
              type="text"
              value={current.title}
              onChange={(e) =>
                handleScheduleChange({ ...current, title: e.target.value })
              }
              placeholder="当番表タイトル"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          )}

          {/* 年の設定 */}
          {current && (
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <span>年:</span>
              <input
                type="number"
                value={current.year}
                onChange={(e) =>
                  handleScheduleChange({
                    ...current,
                    year: parseInt(e.target.value) || new Date().getFullYear(),
                  })
                }
                className="w-20 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
          )}
        </div>

        {/* タブ切り替え */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab("editor")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === "editor"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            表エディタ
          </button>
          <button
            onClick={() => setTab("text")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === "text"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            テキスト入力
          </button>
          <button
            onClick={() => setTab("import")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === "import"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            読み込み
          </button>
          <button
            onClick={() => setTab("members")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === "members"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            メンバー名簿
          </button>
        </div>

        {/* コンテンツ */}
        {current && tab === "editor" && (
          <ScheduleEditor schedule={current} onChange={handleScheduleChange} />
        )}

        {current && tab === "text" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <TextParseInput schedule={current} onChange={handleScheduleChange} />
          </div>
        )}

        {current && tab === "import" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-8">
            <ImageUploader schedule={current} onChange={handleScheduleChange} />
            <hr className="border-gray-200" />
            <ExcelImporter schedule={current} onChange={handleScheduleChange} />
          </div>
        )}

        {current && tab === "members" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
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

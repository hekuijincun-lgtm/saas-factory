"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Shield,
  Download,
  Camera,
  PenLine,
  Table2,
  Users,
  Settings,
  X,
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

type Flow = null | "photo" | "text" | "table";
type Step = 1 | 2 | 3;

const ONBOARDING_KEY = "toban_onboarding_seen";

export default function TobanPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeId, setActive] = useState<string>("");
  const [flow, setFlow] = useState<Flow>(null);
  const [step, setStep] = useState<Step>(1);
  const [showPdf, setShowPdf] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 初期ロード
  useEffect(() => {
    const { schedules: s, activeId: id } = loadOrCreate();
    setSchedules(s);
    setActive(id);
    setLoaded(true);
    // 初回のみオンボーディング表示
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setShowOnboarding(true);
    }
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

  const startFlow = (f: Flow) => {
    setFlow(f);
    setStep(1);
  };

  const goToFinish = () => {
    setStep(3);
  };

  const goBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
    } else {
      setFlow(null);
    }
  };

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem(ONBOARDING_KEY, "1");
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  // ステップ表示
  const stepLabel = flow
    ? flow === "photo" ? "写真から作る"
    : flow === "text" ? "文章で入力して作る"
    : "表に入力して作る"
    : "";

  const stepNames = flow === "photo"
    ? ["写真を選ぶ", "読み取り結果を確認・直す", "保存・共有する"]
    : flow === "text"
    ? ["文章を入力する", "結果を確認・直す", "保存・共有する"]
    : ["表に入力する", "名簿を管理する", "保存・共有する"];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {flow ? (
              <button onClick={goBack} className="text-gray-500 hover:text-gray-700 p-1 -ml-1">
                <ChevronLeft size={20} />
              </button>
            ) : (
              <Calendar size={20} className="text-blue-600 flex-shrink-0" />
            )}
            <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">
              {flow ? stepLabel : "当番表メーカー"}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {!flow && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <Settings size={18} />
              </button>
            )}
            <button
              onClick={() => setShowPdf(true)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 font-medium"
            >
              <FileText size={15} />
              <span>保存・共有</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* オンボーディング */}
        {showOnboarding && !flow && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 relative">
            <button onClick={dismissOnboarding} className="absolute top-3 right-3 text-blue-400 hover:text-blue-600">
              <X size={16} />
            </button>
            <p className="text-sm font-medium text-blue-800">はじめての方へ</p>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>1. 下のボタンから入力方法を選んでください</li>
              <li>2. 内容を確認・修正できます</li>
              <li>3. PDF・画像で保存、LINEで共有できます</li>
            </ul>
          </div>
        )}

        {/* プライバシー通知 */}
        {!flow && (
          <div className="flex items-start gap-2 px-3 sm:px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <Shield size={13} className="mt-0.5 flex-shrink-0" />
            <p>データはブラウザに自動保存。閉じても消えません。サーバーには送信しません。</p>
          </div>
        )}

        {/* ===== トップ画面: 3ボタン ===== */}
        {!flow && (
          <>
            {/* スケジュール選択 */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <button
                    onClick={() => setShowSelector(!showSelector)}
                    className="flex items-center gap-2 w-full sm:w-auto px-3 sm:px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
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
                      className="w-16 sm:w-20 px-2 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center"
                    />
                    <span>年</span>
                  </label>
                )}
              </div>

              {current && (
                <input
                  type="text"
                  value={current.title}
                  onChange={(e) =>
                    handleScheduleChange({ ...current, title: e.target.value })
                  }
                  placeholder="当番表のタイトル"
                  className="w-full sm:flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                />
              )}
            </div>

            {/* 大きな3ボタン */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <button
                onClick={() => startFlow("photo")}
                className="flex items-center gap-4 p-5 sm:p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Camera size={24} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800">写真から作る</p>
                  <p className="text-sm text-gray-500 mt-0.5">写真やExcelから読み取り</p>
                </div>
              </button>

              <button
                onClick={() => startFlow("text")}
                className="flex items-center gap-4 p-5 sm:p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50/30 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <PenLine size={24} className="text-green-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800">文章で入力して作る</p>
                  <p className="text-sm text-gray-500 mt-0.5">自然な文章を入力</p>
                </div>
              </button>

              <button
                onClick={() => startFlow("table")}
                className="flex items-center gap-4 p-5 sm:p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50/30 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Table2 size={24} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800">表に入力して作る</p>
                  <p className="text-sm text-gray-500 mt-0.5">表で直接編集</p>
                </div>
              </button>
            </div>

            {/* 設定パネル（名簿・Excel出力） */}
            {showSettings && current && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 space-y-6">
                <MemberManager
                  members={current.members}
                  onChange={(members) =>
                    handleScheduleChange({ ...current, members })
                  }
                />
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExcelExport}
                    className="px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Download size={15} />
                    Excel出力
                  </button>
                </div>
              </div>
            )}

            {/* 既存データがある場合の表示 */}
            {current && current.rows.some((r) => r.date || r.place || r.members.some((m) => m)) && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">
                    現在の当番表 ({current.rows.filter((r) => !r.isBlank && (r.date || r.place)).length}件)
                  </h3>
                  <button
                    onClick={() => startFlow("table")}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    編集する
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {current.rows.filter((r) => !r.isBlank && (r.date || r.place)).slice(0, 10).map((r) => (
                    <div key={r.id} className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${r.cancelled ? "text-gray-400 line-through" : "text-gray-700"}`}>
                      <span className="w-14 flex-shrink-0">{r.date}</span>
                      <span className={`w-5 text-center font-medium ${r.weekday === "土" ? "text-blue-600" : r.weekday === "日" ? "text-red-500" : "text-gray-400"}`}>{r.weekday}</span>
                      <span className="w-16 flex-shrink-0 truncate">{r.place}</span>
                      <span className="flex-1 truncate text-gray-500">{r.members.filter((m) => m).join(" ")}</span>
                    </div>
                  ))}
                  {current.rows.filter((r) => !r.isBlank && (r.date || r.place)).length > 10 && (
                    <p className="text-xs text-gray-400 px-2">他 {current.rows.filter((r) => !r.isBlank && (r.date || r.place)).length - 10} 件...</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== フロー画面: ステップ表示 ===== */}
        {flow && (
          <>
            {/* ステップインジケーター */}
            <div className="flex items-center gap-2 px-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                    s === step ? "bg-blue-600 text-white" : s < step ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
                  }`}>
                    {s}
                  </div>
                  <span className={`text-xs truncate ${s === step ? "text-blue-700 font-medium" : "text-gray-400"}`}>
                    {stepNames[s - 1]}
                  </span>
                  {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? "bg-blue-300" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>

            {/* ステップコンテンツ */}
            {current && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
                {/* ===== 写真フロー ===== */}
                {flow === "photo" && step === 1 && (
                  <div>
                    <ImageUploader schedule={current} onChange={(s) => { handleScheduleChange(s); setStep(2); }} />
                  </div>
                )}
                {flow === "photo" && step === 2 && (
                  <div className="space-y-4">
                    <ScheduleEditor schedule={current} onChange={handleScheduleChange} />
                    <div className="flex justify-end">
                      <button onClick={goToFinish} className="px-5 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        次へ: 保存・共有する →
                      </button>
                    </div>
                  </div>
                )}

                {/* ===== テキストフロー ===== */}
                {flow === "text" && step === 1 && (
                  <div>
                    <TextParseInput schedule={current} onChange={(s) => { handleScheduleChange(s); setStep(2); }} />
                  </div>
                )}
                {flow === "text" && step === 2 && (
                  <div className="space-y-4">
                    <ScheduleEditor schedule={current} onChange={handleScheduleChange} />
                    <div className="flex justify-end">
                      <button onClick={goToFinish} className="px-5 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        次へ: 保存・共有する →
                      </button>
                    </div>
                  </div>
                )}

                {/* ===== 表フロー ===== */}
                {flow === "table" && step === 1 && (
                  <div className="space-y-4">
                    <ScheduleEditor schedule={current} onChange={handleScheduleChange} />
                    <div className="flex justify-between">
                      <button onClick={() => setStep(2)} className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                        名簿を管理する
                      </button>
                      <button onClick={goToFinish} className="px-5 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        次へ: 保存・共有する →
                      </button>
                    </div>
                  </div>
                )}
                {flow === "table" && step === 2 && (
                  <div className="space-y-4">
                    <MemberManager
                      members={current.members}
                      onChange={(members) => handleScheduleChange({ ...current, members })}
                    />
                    <div className="flex justify-end">
                      <button onClick={goToFinish} className="px-5 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        次へ: 保存・共有する →
                      </button>
                    </div>
                  </div>
                )}

                {/* ===== ステップ3: 保存・共有 (全フロー共通) ===== */}
                {step === 3 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 text-center">完成しました！</h3>
                    <p className="text-sm text-gray-500 text-center">保存や共有の方法を選んでください</p>
                    <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto pt-2">
                      <button
                        onClick={() => setShowPdf(true)}
                        className="flex items-center justify-center gap-2 px-5 py-4 text-base font-medium text-white bg-green-500 rounded-xl hover:bg-green-600"
                      >
                        <FileText size={20} />
                        LINEで送る・保存する
                      </button>
                      <button
                        onClick={handleExcelExport}
                        className="flex items-center justify-center gap-2 px-5 py-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
                      >
                        <Download size={16} />
                        Excelで保存する
                      </button>
                      <button
                        onClick={() => { setFlow(null); setStep(1); }}
                        className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
                      >
                        トップに戻る
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* 保存・共有ダイアログ */}
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

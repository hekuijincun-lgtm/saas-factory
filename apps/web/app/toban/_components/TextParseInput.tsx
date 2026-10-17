"use client";

import { useState } from "react";
import { MessageSquareText, Loader2, Plus, Check, X, AlertTriangle } from "lucide-react";
import type { Row, Schedule } from "../_lib/types";
import { createRow } from "../_lib/types";
import { calcWeekday } from "../_lib/dateUtils";
import { parseNaturalInput, splitNames } from "../_lib/nameParser";

interface ParsedRow {
  date: string;
  weekday: string;
  place: string;
  members: string[];
  confidence: "high" | "medium" | "low";
  raw: string;
}

interface Props {
  schedule: Schedule;
  onChange: (schedule: Schedule) => void;
}

export default function TextParseInput({ schedule, onChange }: Props) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleParse = async () => {
    const lines = input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    setLoading(true);
    setError("");

    const results: ParsedRow[] = [];

    for (const line of lines) {
      const parsed = parseNaturalInput(line);
      if (!parsed) continue;

      const { date, place, membersText } = parsed;
      const weekday = date ? calcWeekday(date, schedule.year) : "";

      // 名前分割（ルールベース）
      let members: string[] = [];
      let confidence: "high" | "medium" | "low" = "high";

      if (membersText) {
        const { matched, unmatched } = splitNames(membersText, schedule.members);

        if (!unmatched) {
          // 完全マッチ
          members = matched;
          confidence = "high";
        } else if (matched.length > 0) {
          // 部分マッチ — unmatchedをClaude APIで解析
          members = [...matched];
          confidence = "medium";
          const aiResult = await tryAiParse(unmatched, line);
          if (aiResult) {
            members = [...members, ...aiResult];
          } else {
            members.push(unmatched);
            confidence = "low";
          }
        } else {
          // マッチなし — Claude APIで解析
          const aiResult = await tryAiParse(membersText, line);
          if (aiResult) {
            members = aiResult;
            confidence = "medium";
          } else {
            // スペース区切りを試す
            const spaceSplit = membersText.split(/[\s、,]+/).filter(Boolean);
            members = spaceSplit.length > 1 ? spaceSplit : [membersText];
            confidence = "low";
          }
        }
      }

      results.push({
        date,
        weekday,
        place,
        members,
        confidence,
        raw: line,
      });
    }

    setParsed(results);
    setLoading(false);
  };

  /** Claude API で名前分割を試みる */
  const tryAiParse = async (
    text: string,
    context: string
  ): Promise<string[] | null> => {
    try {
      const res = await fetch("/api/toban/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-toban-passcode": getPasscode(),
        },
        body: JSON.stringify({ text, context, members: schedule.members }),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.names ?? null;
    } catch {
      return null;
    }
  };

  /** 確認済みの解析結果を表に追加 */
  const handleConfirm = () => {
    const newRows: Row[] = parsed.map((p) => createRow({
      date: p.date,
      weekday: p.weekday,
      place: p.place,
      members: p.members.length > 0 ? p.members : ["", "", ""],
      cancelled: false,
    }));

    onChange({
      ...schedule,
      rows: [...schedule.rows, ...newRows],
    });

    setParsed([]);
    setInput("");
  };

  /** 解析結果の個別編集 */
  const updateParsedRow = (index: number, patch: Partial<ParsedRow>) => {
    setParsed((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  const updateParsedMember = (rowIdx: number, memberIdx: number, value: string) => {
    setParsed((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const members = [...r.members];
        members[memberIdx] = value;
        return { ...r, members };
      })
    );
  };

  const addParsedMember = (rowIdx: number) => {
    setParsed((prev) =>
      prev.map((r, i) => (i === rowIdx ? { ...r, members: [...r.members, ""] } : r))
    );
  };

  const removeParsedRow = (index: number) => {
    setParsed((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <MessageSquareText size={16} />
        <span>テキスト入力</span>
      </div>

      <p className="text-xs text-gray-500">
        1行1件。例: 「9/21与野南担当大成駒谷今村」「7/4 田島中 出田 尾形 鈴木」
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={"9/21与野南担当大成駒谷今村\n7/4田島中担当出田尾形鈴木"}
        rows={5}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
      />

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      <button
        onClick={handleParse}
        disabled={loading || !input.trim()}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareText size={15} />}
        解析する
      </button>

      {/* 確認画面 */}
      {parsed.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">
              解析結果の確認（{parsed.length}件）
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setParsed([])}
                className="px-3 py-1 text-xs text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 flex items-center gap-1"
              >
                <Check size={12} />
                表に追加
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {parsed.map((row, ri) => (
              <div key={ri} className="px-4 py-3 space-y-2">
                {/* 元テキスト */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">{row.raw}</span>
                  <ConfidenceBadge level={row.confidence} />
                  <button
                    onClick={() => removeParsedRow(ri)}
                    className="ml-auto text-gray-300 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* 編集可能フィールド */}
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <span className="text-gray-500">日付:</span>
                    <input
                      type="text"
                      value={row.date}
                      onChange={(e) => {
                        const date = e.target.value;
                        const weekday = calcWeekday(date, schedule.year);
                        updateParsedRow(ri, { date, weekday });
                      }}
                      className="w-16 px-1.5 py-1 text-xs border border-gray-300 rounded"
                    />
                    <span className={`text-xs font-medium ${
                      row.weekday === "土" ? "text-blue-600" : row.weekday === "日" ? "text-red-500" : "text-gray-500"
                    }`}>
                      {row.weekday && `(${row.weekday})`}
                    </span>
                  </label>

                  <label className="flex items-center gap-1 text-xs">
                    <span className="text-gray-500">場所:</span>
                    <input
                      type="text"
                      value={row.place}
                      onChange={(e) => updateParsedRow(ri, { place: e.target.value })}
                      className="w-24 px-1.5 py-1 text-xs border border-gray-300 rounded"
                    />
                  </label>

                  <div className="flex items-center gap-1 text-xs flex-wrap">
                    <span className="text-gray-500">担当:</span>
                    {row.members.map((m, mi) => (
                      <input
                        key={mi}
                        type="text"
                        value={m}
                        onChange={(e) => updateParsedMember(ri, mi, e.target.value)}
                        className="w-16 px-1.5 py-1 text-xs border border-gray-300 rounded"
                      />
                    ))}
                    <button
                      onClick={() => addParsedMember(ri)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-red-100 text-red-700",
  };
  const labels = {
    high: "確定",
    medium: "要確認",
    low: "手動修正",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

/** localStorage からパスコードを取得 */
function getPasscode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("toban_passcode") ?? "";
}

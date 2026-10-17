"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  Ban,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";
import type { Row, Schedule } from "../_lib/types";
import { createRow } from "../_lib/types";
import { calcWeekday } from "../_lib/dateUtils";
import Autocomplete from "./Autocomplete";

interface Props {
  schedule: Schedule;
  onChange: (schedule: Schedule) => void;
}

type CellRef = { row: number; col: number };

export default function ScheduleEditor({ schedule, onChange }: Props) {
  const { rows, year, members } = schedule;
  const [focusCell, setFocusCell] = useState<CellRef | null>(null);
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const maxMembers = Math.max(3, ...rows.map((r) => r.members.length));

  // セルのキー
  const cellKey = (row: number, col: number) => `${row}-${col}`;

  // セルに ref を登録
  const registerRef = useCallback(
    (row: number, col: number) => (el: HTMLInputElement | null) => {
      const key = cellKey(row, col);
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    },
    []
  );

  // フォーカス移動
  useEffect(() => {
    if (!focusCell) return;
    const key = cellKey(focusCell.row, focusCell.col);
    const el = cellRefs.current.get(key);
    el?.focus();
  }, [focusCell]);

  const updateRow = (index: number, patch: Partial<Row>) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], ...patch };
    onChange({ ...schedule, rows: newRows });
  };

  const updateCell = (rowIdx: number, col: number, value: string) => {
    const row = rows[rowIdx];
    if (col === 0) {
      // 日付セル — 曜日を自動計算
      const weekday = calcWeekday(value, year);
      updateRow(rowIdx, { date: value, weekday });
    } else if (col === 1) {
      updateRow(rowIdx, { place: value });
    } else {
      const memberIdx = col - 2;
      const newMembers = [...row.members];
      while (newMembers.length <= memberIdx) newMembers.push("");
      newMembers[memberIdx] = value;
      updateRow(rowIdx, { members: newMembers });
    }
  };

  const getCellValue = (rowIdx: number, col: number): string => {
    const row = rows[rowIdx];
    if (col === 0) return row.date;
    if (col === 1) return row.place;
    return row.members[col - 2] ?? "";
  };

  const totalCols = 2 + maxMembers;

  const handleKeyNav = (rowIdx: number, col: number) => (e: React.KeyboardEvent) => {
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const nr = rowIdx + dr;
      const nc = col + dc;
      // 空行をスキップ
      if (nr >= 0 && nr < rows.length && nc >= 0 && nc < totalCols) {
        setFocusCell({ row: nr, col: nc });
      }
    };

    switch (e.key) {
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          if (col > 0) move(0, -1);
          else if (rowIdx > 0) setFocusCell({ row: rowIdx - 1, col: totalCols - 1 });
        } else {
          if (col < totalCols - 1) move(0, 1);
          else if (rowIdx < rows.length - 1) setFocusCell({ row: rowIdx + 1, col: 0 });
        }
        break;
      case "Enter":
        if (!e.shiftKey) move(1, 0);
        break;
      case "ArrowUp":
        if (e.ctrlKey || e.metaKey) move(-1, 0);
        break;
      case "ArrowDown":
        if (e.ctrlKey || e.metaKey) move(1, 0);
        break;
    }
  };

  const addRow = (afterIdx?: number) => {
    const newRows = [...rows];
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : rows.length;
    newRows.splice(insertAt, 0, createRow({ members: Array(maxMembers).fill("") }));
    onChange({ ...schedule, rows: newRows });
    setTimeout(() => setFocusCell({ row: insertAt, col: 0 }), 0);
  };

  const addBlankRow = (afterIdx: number) => {
    const newRows = [...rows];
    newRows.splice(afterIdx + 1, 0, createRow({ isBlank: true }));
    onChange({ ...schedule, rows: newRows });
  };

  const deleteRow = (index: number) => {
    if (rows.length <= 1) return;
    const newRows = rows.filter((_, i) => i !== index);
    onChange({ ...schedule, rows: newRows });
  };

  const toggleCancelled = (index: number) => {
    updateRow(index, { cancelled: !rows[index].cancelled });
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= rows.length) return;
    const newRows = [...rows];
    [newRows[index], newRows[newIdx]] = [newRows[newIdx], newRows[index]];
    onChange({ ...schedule, rows: newRows });
  };

  const addMemberColumn = () => {
    const newRows = rows.map((r) => ({
      ...r,
      members: [...r.members, ""],
    }));
    onChange({ ...schedule, rows: newRows });
  };

  const removeMemberColumn = () => {
    if (maxMembers <= 1) return;
    const newRows = rows.map((r) => ({
      ...r,
      members: r.members.slice(0, -1),
    }));
    onChange({ ...schedule, rows: newRows });
  };

  // Excelからの貼り付け対応
  const handlePaste = (rowIdx: number, col: number) => (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // 単一セルは通常処理
    e.preventDefault();

    const pasteRows = text.split(/\r?\n/).filter((line) => line.trim());
    const newRows = [...rows];

    for (let ri = 0; ri < pasteRows.length; ri++) {
      const targetRow = rowIdx + ri;
      const cells = pasteRows[ri].split("\t");

      // 行が足りなければ追加
      while (newRows.length <= targetRow) {
        newRows.push(createRow({ members: Array(maxMembers).fill("") }));
      }

      for (let ci = 0; ci < cells.length; ci++) {
        const targetCol = col + ci;
        if (targetCol >= totalCols) break;
        const value = cells[ci].trim();

        if (targetCol === 0) {
          newRows[targetRow] = {
            ...newRows[targetRow],
            date: value,
            weekday: calcWeekday(value, year),
          };
        } else if (targetCol === 1) {
          newRows[targetRow] = { ...newRows[targetRow], place: value };
        } else {
          const mi = targetCol - 2;
          const ms = [...newRows[targetRow].members];
          while (ms.length <= mi) ms.push("");
          ms[mi] = value;
          newRows[targetRow] = { ...newRows[targetRow], members: ms };
        }
      }
    }

    onChange({ ...schedule, rows: newRows });
  };

  return (
    <div className="space-y-3">
      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => addRow()}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus size={14} /> 行を追加
        </button>
        <button
          onClick={addMemberColumn}
          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
        >
          <Plus size={14} /> 担当列
        </button>
        {maxMembers > 1 && (
          <button
            onClick={removeMemberColumn}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
          >
            <Trash2 size={14} /> 担当列
          </button>
        )}
        <span className="text-xs text-gray-400 ml-2">
          Tab/Enter で移動 ・ Excelからの貼り付け対応
        </span>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="w-8 px-1 py-2"></th>
              <th className="px-2 py-2 text-left font-medium min-w-[100px]">日付</th>
              <th className="px-2 py-2 text-left font-medium w-10">曜日</th>
              <th className="px-2 py-2 text-left font-medium min-w-[100px]">場所</th>
              {Array.from({ length: maxMembers }, (_, i) => (
                <th key={i} className="px-2 py-2 text-left font-medium min-w-[90px]">
                  担当{i + 1}
                </th>
              ))}
              <th className="w-28 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) =>
              row.isBlank ? (
                <tr key={row.id} className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={totalCols + 2} className="py-1 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs text-gray-400">— 区切り —</span>
                      <button
                        onClick={() => deleteRow(ri)}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={row.id}
                  className={`border-t border-gray-200 ${
                    row.cancelled
                      ? "bg-gray-50 text-gray-400 line-through"
                      : ""
                  }`}
                >
                  {/* ドラッグハンドル */}
                  <td className="px-1 text-center text-gray-300">
                    <GripVertical size={14} />
                  </td>

                  {/* 日付 */}
                  <td className="px-1 py-1">
                    <input
                      ref={registerRef(ri, 0)}
                      type="text"
                      value={row.date}
                      onChange={(e) => updateCell(ri, 0, e.target.value)}
                      onKeyDown={handleKeyNav(ri, 0)}
                      onPaste={handlePaste(ri, 0)}
                      placeholder="7/4"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    />
                  </td>

                  {/* 曜日（自動計算・読み取り専用） */}
                  <td className="px-1 py-1 text-center">
                    <span
                      className={`text-sm font-medium ${
                        row.weekday === "土"
                          ? "text-blue-600"
                          : row.weekday === "日"
                          ? "text-red-500"
                          : "text-gray-600"
                      }`}
                    >
                      {row.weekday}
                    </span>
                  </td>

                  {/* 場所 */}
                  <td className="px-1 py-1">
                    <input
                      ref={registerRef(ri, 1)}
                      type="text"
                      value={row.place}
                      onChange={(e) => updateCell(ri, 1, e.target.value)}
                      onKeyDown={handleKeyNav(ri, 1)}
                      onPaste={handlePaste(ri, 1)}
                      placeholder="場所"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    />
                  </td>

                  {/* 担当セル */}
                  {Array.from({ length: maxMembers }, (_, mi) => (
                    <td key={mi} className="px-1 py-1">
                      <Autocomplete
                        inputRef={registerRef(ri, 2 + mi)}
                        value={row.members[mi] ?? ""}
                        onChange={(v) => updateCell(ri, 2 + mi, v)}
                        suggestions={members}
                        placeholder="名前"
                        onKeyNav={handleKeyNav(ri, 2 + mi)}
                      />
                    </td>
                  ))}

                  {/* 操作ボタン */}
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => toggleCancelled(ri)}
                        title={row.cancelled ? "中止を取消" : "中止にする"}
                        className={`p-1 rounded hover:bg-gray-100 ${
                          row.cancelled ? "text-orange-500" : "text-gray-400"
                        }`}
                      >
                        {row.cancelled ? <RotateCcw size={14} /> : <Ban size={14} />}
                      </button>
                      <button
                        onClick={() => moveRow(ri, -1)}
                        disabled={ri === 0}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => moveRow(ri, 1)}
                        disabled={ri === rows.length - 1}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        onClick={() => addRow(ri)}
                        title="下に行を追加"
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => addBlankRow(ri)}
                        title="区切り行を追加"
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => deleteRow(ri)}
                        disabled={rows.length <= 1}
                        className="p-1 rounded hover:bg-gray-100 text-red-400 disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// X icon used in blank row
function X({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

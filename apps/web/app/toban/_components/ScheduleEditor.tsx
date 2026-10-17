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
  MoreHorizontal,
  X,
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
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [chipRow, setChipRow] = useState<number | null>(null); // モバイル: チップ選択表示中の行
  const [addToListPrompt, setAddToListPrompt] = useState<{ rowIdx: number; name: string } | null>(null);
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const maxMembers = Math.max(3, ...rows.map((r) => r.members.length));

  const cellKey = (row: number, col: number) => `${row}-${col}`;

  const registerRef = useCallback(
    (row: number, col: number) => (el: HTMLInputElement | null) => {
      const key = cellKey(row, col);
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    },
    []
  );

  useEffect(() => {
    if (!focusCell) return;
    const key = cellKey(focusCell.row, focusCell.col);
    const el = cellRefs.current.get(key);
    el?.focus();
  }, [focusCell]);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (openMenu === null) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenu]);

  const updateRow = (index: number, patch: Partial<Row>) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], ...patch };
    onChange({ ...schedule, rows: newRows });
  };

  const updateCell = (rowIdx: number, col: number, value: string) => {
    const row = rows[rowIdx];
    if (col === 0) {
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

  const totalCols = 2 + maxMembers;

  const handleKeyNav = (rowIdx: number, col: number) => (e: React.KeyboardEvent) => {
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const nr = rowIdx + dr;
      const nc = col + dc;
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

  /** モバイル: チップタップで担当を追加/削除 */
  const toggleMemberChip = (rowIdx: number, name: string) => {
    const row = rows[rowIdx];
    const idx = row.members.indexOf(name);
    if (idx >= 0) {
      // 削除
      const newMembers = row.members.filter((_, i) => i !== idx);
      updateRow(rowIdx, { members: newMembers.length > 0 ? newMembers : [""] });
    } else {
      // 追加: 空のスロットがあればそこに、なければ末尾に
      const emptyIdx = row.members.findIndex((m) => !m.trim());
      if (emptyIdx >= 0) {
        const newMembers = [...row.members];
        newMembers[emptyIdx] = name;
        updateRow(rowIdx, { members: newMembers });
      } else {
        updateRow(rowIdx, { members: [...row.members, name] });
      }
    }
  };

  /** 名簿にない名前を入力したときの確認 */
  const handleUnknownName = (rowIdx: number, name: string) => {
    if (name.trim() && members.length > 0 && !members.includes(name.trim())) {
      setAddToListPrompt({ rowIdx, name: name.trim() });
    }
  };

  const confirmAddToList = () => {
    if (!addToListPrompt) return;
    onChange({ ...schedule, members: [...members, addToListPrompt.name] });
    setAddToListPrompt(null);
  };

  /** 同じ日に同じ名前がいないかチェック */
  const isDuplicate = (rowIdx: number, name: string) => {
    if (!name.trim()) return false;
    return rows.some((r, i) => i !== rowIdx && r.date === rows[rowIdx].date && r.members.includes(name));
  };

  const addMemberColumn = () => {
    const newRows = rows.map((r) => ({ ...r, members: [...r.members, ""] }));
    onChange({ ...schedule, rows: newRows });
  };

  const removeMemberColumn = () => {
    if (maxMembers <= 1) return;
    const newRows = rows.map((r) => ({ ...r, members: r.members.slice(0, -1) }));
    onChange({ ...schedule, rows: newRows });
  };

  const handlePaste = (rowIdx: number, col: number) => (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();

    const pasteRows = text.split(/\r?\n/).filter((line) => line.trim());
    const newRows = [...rows];

    for (let ri = 0; ri < pasteRows.length; ri++) {
      const targetRow = rowIdx + ri;
      const cells = pasteRows[ri].split("\t");

      while (newRows.length <= targetRow) {
        newRows.push(createRow({ members: Array(maxMembers).fill("") }));
      }

      for (let ci = 0; ci < cells.length; ci++) {
        const targetCol = col + ci;
        if (targetCol >= totalCols) break;
        const value = cells[ci].trim();

        if (targetCol === 0) {
          newRows[targetRow] = { ...newRows[targetRow], date: value, weekday: calcWeekday(value, year) };
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
          className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus size={14} /> 行を追加
        </button>
        <button
          onClick={addMemberColumn}
          className="px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
        >
          <Plus size={14} /> <span className="hidden sm:inline">担当</span>列
        </button>
        {maxMembers > 1 && (
          <button
            onClick={removeMemberColumn}
            className="px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
          >
            <Trash2 size={14} /> <span className="hidden sm:inline">担当</span>列
          </button>
        )}
        <span className="hidden sm:inline text-xs text-gray-400 ml-2">
          Tab/Enter で移動 ・ Excelからの貼り付け対応
        </span>
      </div>

      {/* デスクトップ: テーブル表示 */}
      <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg">
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
                      <button onClick={() => deleteRow(ri)} className="text-gray-300 hover:text-red-500">
                        <XIcon size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={row.id}
                  className={`border-t border-gray-200 ${row.cancelled ? "bg-gray-50 text-gray-400 line-through" : ""}`}
                >
                  <td className="px-1 text-center text-gray-300"><GripVertical size={14} /></td>
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
                  <td className="px-1 py-1 text-center">
                    <span className={`text-sm font-medium ${row.weekday === "土" ? "text-blue-600" : row.weekday === "日" ? "text-red-500" : "text-gray-600"}`}>
                      {row.weekday}
                    </span>
                  </td>
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
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => toggleCancelled(ri)} title={row.cancelled ? "中止を取消" : "中止にする"} className={`p-1 rounded hover:bg-gray-100 ${row.cancelled ? "text-orange-500" : "text-gray-400"}`}>
                        {row.cancelled ? <RotateCcw size={14} /> : <Ban size={14} />}
                      </button>
                      <button onClick={() => moveRow(ri, -1)} disabled={ri === 0} className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronUp size={14} /></button>
                      <button onClick={() => moveRow(ri, 1)} disabled={ri === rows.length - 1} className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronDown size={14} /></button>
                      <button onClick={() => addRow(ri)} title="下に行を追加" className="p-1 rounded hover:bg-gray-100 text-gray-400"><Plus size={14} /></button>
                      <button onClick={() => addBlankRow(ri)} title="区切り行を追加" className="p-1 rounded hover:bg-gray-100 text-gray-400"><Copy size={14} /></button>
                      <button onClick={() => deleteRow(ri)} disabled={rows.length <= 1} className="p-1 rounded hover:bg-gray-100 text-red-400 disabled:opacity-30"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* モバイル: カード表示 */}
      <div className="md:hidden space-y-2">
        {rows.map((row, ri) =>
          row.isBlank ? (
            <div key={row.id} className="flex items-center justify-center gap-2 py-2 border-t border-dashed border-gray-300">
              <span className="text-xs text-gray-400">— 区切り —</span>
              <button onClick={() => deleteRow(ri)} className="text-gray-300 hover:text-red-500">
                <XIcon size={13} />
              </button>
            </div>
          ) : (
            <div
              key={row.id}
              className={`bg-white border rounded-lg p-3 space-y-2.5 ${
                row.cancelled
                  ? "border-gray-300 bg-gray-50 opacity-70"
                  : "border-gray-200"
              }`}
            >
              {/* 1段目: 日付・曜日・場所 + メニュー */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.date}
                  onChange={(e) => updateCell(ri, 0, e.target.value)}
                  placeholder="7/4"
                  className={`w-16 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white ${row.cancelled ? "line-through text-gray-400" : ""}`}
                />
                <span
                  className={`text-sm font-bold w-6 text-center ${
                    row.weekday === "土" ? "text-blue-600" : row.weekday === "日" ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  {row.weekday}
                </span>
                <input
                  type="text"
                  value={row.place}
                  onChange={(e) => updateCell(ri, 1, e.target.value)}
                  placeholder="場所"
                  className={`flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white ${row.cancelled ? "line-through text-gray-400" : ""}`}
                />

                {/* 行アクションメニュー */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === ri ? null : ri);
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {openMenu === ri && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 w-36">
                      <button
                        onClick={() => { toggleCancelled(ri); setOpenMenu(null); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
                      >
                        {row.cancelled ? <RotateCcw size={14} /> : <Ban size={14} />}
                        {row.cancelled ? "中止を取消" : "中止にする"}
                      </button>
                      <button
                        onClick={() => { moveRow(ri, -1); setOpenMenu(null); }}
                        disabled={ri === 0}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left disabled:opacity-30"
                      >
                        <ChevronUp size={14} /> 上に移動
                      </button>
                      <button
                        onClick={() => { moveRow(ri, 1); setOpenMenu(null); }}
                        disabled={ri === rows.length - 1}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left disabled:opacity-30"
                      >
                        <ChevronDown size={14} /> 下に移動
                      </button>
                      <button
                        onClick={() => { addRow(ri); setOpenMenu(null); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
                      >
                        <Plus size={14} /> 下に行追加
                      </button>
                      <button
                        onClick={() => { addBlankRow(ri); setOpenMenu(null); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
                      >
                        <Copy size={14} /> 区切り追加
                      </button>
                      <hr className="my-1 border-gray-100" />
                      <button
                        onClick={() => { deleteRow(ri); setOpenMenu(null); }}
                        disabled={rows.length <= 1}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left text-red-500 disabled:opacity-30"
                      >
                        <Trash2 size={14} /> 削除
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 2段目: 担当者 — チップ選択 + 手入力 */}
              <div className="space-y-2">
                {/* 選択済みの担当者 */}
                <div className="flex flex-wrap gap-1.5">
                  {row.members.filter((m) => m.trim()).map((m, mi) => (
                    <span
                      key={mi}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-sm rounded-full ${
                        isDuplicate(ri, m)
                          ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {m}
                      <button
                        onClick={() => {
                          const newMembers = row.members.filter((_, i) => i !== row.members.indexOf(m));
                          updateRow(ri, { members: newMembers.length > 0 ? newMembers : [""] });
                        }}
                        className="text-blue-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => setChipRow(chipRow === ri ? null : ri)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-sm text-gray-500 bg-gray-100 rounded-full hover:bg-gray-200"
                  >
                    <Plus size={12} /> 追加
                  </button>
                </div>

                {/* 名簿チップ選択パネル */}
                {chipRow === ri && members.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
                    <p className="text-xs text-gray-500">名簿からタップで選択:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((name) => {
                        const selected = row.members.includes(name);
                        return (
                          <button
                            key={name}
                            onClick={() => toggleMemberChip(ri, name)}
                            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                              selected
                                ? "bg-blue-600 text-white"
                                : "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50"
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                    {/* 手入力 */}
                    <div className="pt-1">
                      <Autocomplete
                        value=""
                        onChange={(v) => {
                          if (!v.trim()) return;
                          toggleMemberChip(ri, v.trim());
                          handleUnknownName(ri, v);
                        }}
                        suggestions={members}
                        placeholder="手入力で追加..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 中止バッジ */}
              {row.cancelled && (
                <span className="inline-block text-[10px] px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">
                  中止
                </span>
              )}
            </div>
          )
        )}
      </div>

      {/* 名簿追加の確認 */}
      {addToListPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-gray-800">
              「<strong>{addToListPrompt.name}</strong>」は名簿にありません。名簿に追加しますか？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAddToListPrompt(null)}
                className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                いいえ
              </button>
              <button
                onClick={confirmAddToList}
                className="px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function XIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

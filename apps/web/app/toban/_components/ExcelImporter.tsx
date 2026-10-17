"use client";

import { useState, useRef } from "react";
import { FileSpreadsheet, Upload, Loader2, AlertTriangle } from "lucide-react";
import type { Row, Schedule } from "../_lib/types";
import ReviewDialog from "./ReviewDialog";

interface Props {
  schedule: Schedule;
  onChange: (schedule: Schedule) => void;
}

export default function ExcelImporter({ schedule, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importedRows, setImportedRows] = useState<Row[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError(".xlsx ファイルを選択してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { readXlsx } = await import("../_lib/excelUtils");
      const rows = await readXlsx(file, schedule.year);

      if (rows.length === 0) {
        setError("表データが見つかりませんでした");
        return;
      }

      setImportedRows(rows);
    } catch (err: any) {
      console.error("Excel import error:", err);
      setError(err.message || "Excelの読み取りに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <FileSpreadsheet size={16} />
        <span>Excelファイルから読み込み</span>
      </div>

      <p className="text-xs text-gray-500">
        .xlsxファイルを読み込みます。取り消し線の書式（strikethrough）がある行は自動的に「中止」として認識されます。
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 hover:bg-green-50/30 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          className="hidden"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-green-500 animate-spin" />
            <p className="text-sm text-gray-500">Excelを読み取り中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={32} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">
                クリックまたはドラッグ&ドロップで .xlsx をアップロード
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {importedRows && (
        <ReviewDialog
          rows={importedRows}
          schedule={schedule}
          onChange={onChange}
          onClose={() => setImportedRows(null)}
          title="Excel読み取り結果の確認"
        />
      )}
    </div>
  );
}

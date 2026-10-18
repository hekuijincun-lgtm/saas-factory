"use client";

import { useState, useRef } from "react";
import { Camera, ImageIcon, FileSpreadsheet, Upload, Loader2, AlertTriangle } from "lucide-react";
import type { Row, Schedule } from "../_lib/types";
import { createRow } from "../_lib/types";
import ReviewDialog from "./ReviewDialog";

interface Props {
  schedule: Schedule;
  onChange: (schedule: Schedule) => void;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — これを超えたらリサイズ

export default function ImageUploader({ schedule, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [resultRows, setResultRows] = useState<Row[] | null>(null);
  const [resultTitle, setResultTitle] = useState("読み取り結果の確認");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  /** 画像ファイルを処理（OCR） */
  const handleImageFile = async (file: File) => {
    // HEIC チェック
    const name = file.name.toLowerCase();
    if (name.endsWith(".heic") || name.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif") {
      setError("HEIC/HEIF形式は対応していません。\niPhoneの場合: 設定 → カメラ → フォーマット → 「互換性優先」に変更するか、\n写真アプリから共有時にJPEGで送ってください。");
      return;
    }

    setLoading(true);
    setLoadingMsg("画像を準備しています...");
    setError("");

    try {
      let processedFile = file;

      // 常にリサイズ・圧縮（OCRには高解像度は不要、通信量を減らす）
      setLoadingMsg("画像を圧縮しています...");
      try {
        const { compressImage } = await import("@/src/lib/compressImage");
        processedFile = await compressImage(file, {
          maxBytes: MAX_IMAGE_BYTES,
          maxDim: 1600,
          quality: 0.8,
        });
      } catch (compressErr) {
        console.warn("Image compression failed, using original:", compressErr);
        // 圧縮失敗時はオリジナルで続行
      }

      // プレビュー表示
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(processedFile);

      setLoadingMsg("AIが画像を読み取っています...");

      const formData = new FormData();
      formData.append("image", processedFile);

      const res = await fetch("/api/toban/ocr", {
        method: "POST",
        headers: { "x-toban-passcode": getPasscode() },
        body: formData,
      });

      if (!res.ok) {
        const data: any = await res.json().catch(() => ({}));
        throw new Error(data.error || `読み取りに失敗しました (${res.status})`);
      }

      const data: any = await res.json();
      if (!data.rows || !Array.isArray(data.rows)) {
        throw new Error("読み取り結果が不正です");
      }

      const rows: Row[] = data.rows.map((r: any) =>
        createRow({
          date: r.date || "",
          weekday: r.weekday || "",
          place: r.place || "",
          members: Array.isArray(r.members) ? r.members : [],
          cancelled: !!r.cancelled,
        })
      );

      if (rows.length === 0) {
        setError("当番表のデータが見つかりませんでした。\n明るい場所でもう一度撮るか、別の写真を選んでください。");
        return;
      }

      setResultTitle("写真読み取り結果の確認");
      setResultRows(rows);
    } catch (err: any) {
      console.error("OCR error:", err);
      setError(err.message || "写真が読み取れませんでした。\n明るい場所でもう一度撮るか、別の写真を選んでください。");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  /** Excelファイルを処理 */
  const handleExcelFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError(".xlsx ファイルを選んでください。");
      return;
    }

    setLoading(true);
    setLoadingMsg("Excelファイルを読み取っています...");
    setError("");

    try {
      const { readXlsx } = await import("../_lib/excelUtils");
      const rows = await readXlsx(file, schedule.year);

      if (rows.length === 0) {
        setError("当番表のデータが見つかりませんでした。\nExcelの1シート目に日付・場所・担当者の列があるか確認してください。");
        return;
      }

      setResultTitle("Excel読み取り結果の確認");
      setResultRows(rows);
    } catch (err: any) {
      console.error("Excel import error:", err);
      setError(err.message || "Excelの読み取りに失敗しました。");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  /** ファイルの種類を判別して処理 */
  const handleAnyFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      handleExcelFile(file);
    } else if (file.type.startsWith("image/") || name.endsWith(".heic") || name.endsWith(".heif")) {
      handleImageFile(file);
    } else {
      setError("対応していないファイル形式です。\n写真（JPG/PNG）またはExcel（.xlsx）を選んでください。");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleAnyFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, handler: (f: File) => void) => {
    const file = e.target.files?.[0];
    if (file) handler(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* 3つのボタン */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* カメラで撮る */}
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-3 px-4 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-colors disabled:opacity-50"
        >
          <Camera size={24} className="text-blue-500 flex-shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-gray-800">カメラで撮る</p>
            <p className="text-xs text-gray-400">当番表を撮影</p>
          </div>
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          capture="environment"
          onChange={(e) => handleInputChange(e, handleImageFile)}
          className="hidden"
        />

        {/* 写真を選ぶ */}
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-3 px-4 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 transition-colors disabled:opacity-50"
        >
          <ImageIcon size={24} className="text-green-500 flex-shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-gray-800">写真を選ぶ</p>
            <p className="text-xs text-gray-400">ギャラリーから</p>
          </div>
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={(e) => handleInputChange(e, handleImageFile)}
          className="hidden"
        />

        {/* Excelを読み込む */}
        <button
          onClick={() => excelRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-3 px-4 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50/30 transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet size={24} className="text-emerald-600 flex-shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-gray-800">Excelを読み込む</p>
            <p className="text-xs text-gray-400">.xlsxファイル</p>
          </div>
        </button>
        <input
          ref={excelRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleInputChange(e, handleExcelFile)}
          className="hidden"
        />
      </div>

      {/* PC向けドラッグ&ドロップ */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="hidden sm:block border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 hover:bg-blue-50/20 transition-colors cursor-pointer"
        onClick={() => galleryRef.current?.click()}
      >
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <Upload size={16} />
          <span>ドラッグ&ドロップでも読み込めます（写真・Excel）</span>
        </div>
      </div>

      {/* 読み込み中 */}
      {loading && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 rounded-lg">
          <Loader2 size={20} className="text-blue-500 animate-spin flex-shrink-0" />
          <p className="text-sm text-blue-700">{loadingMsg}</p>
        </div>
      )}

      {/* プレビュー */}
      {preview && !loading && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="アップロードした画像"
            className="max-h-48 rounded-lg border border-gray-200 object-contain"
          />
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      {/* 確認ダイアログ */}
      {resultRows && (
        <ReviewDialog
          rows={resultRows}
          schedule={schedule}
          onChange={onChange}
          onClose={() => {
            setResultRows(null);
            setPreview(null);
          }}
          title={resultTitle}
        />
      )}

      <p className="text-xs text-gray-400">
        画像・ファイルはサーバーに保存されません。読み取り処理のみに使用されます。
      </p>
    </div>
  );
}

function getPasscode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("toban_passcode") ?? "";
}

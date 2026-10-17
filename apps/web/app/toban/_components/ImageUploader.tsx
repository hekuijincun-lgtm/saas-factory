"use client";

import { useState, useRef } from "react";
import { Camera, Upload, Loader2, AlertTriangle } from "lucide-react";
import type { Row, Schedule } from "../_lib/types";
import { createRow } from "../_lib/types";
import ReviewDialog from "./ReviewDialog";

interface Props {
  schedule: Schedule;
  onChange: (schedule: Schedule) => void;
}

export default function ImageUploader({ schedule, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [ocrRows, setOcrRows] = useState<Row[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    // HEIC の場合は注意を表示
    if (file.name.toLowerCase().endsWith(".heic") || file.type === "image/heic") {
      setError("HEIC形式はサポートされていません。JPEGまたはPNGに変換してからアップロードしてください。");
      return;
    }

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/toban/ocr", {
        method: "POST",
        headers: {
          "x-toban-passcode": getPasscode(),
        },
        body: formData,
      });

      if (!res.ok) {
        const data: any = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: any = await res.json();
      if (!data.rows || !Array.isArray(data.rows)) {
        throw new Error("OCR結果が不正です");
      }

      // OCR結果をRow型に変換
      const rows: Row[] = data.rows.map((r: any) =>
        createRow({
          date: r.date || "",
          weekday: r.weekday || "",
          place: r.place || "",
          members: Array.isArray(r.members) ? r.members : [],
          cancelled: !!r.cancelled,
        })
      );

      setOcrRows(rows);
    } catch (err: any) {
      console.error("OCR error:", err);
      setError(err.message || "画像の読み取りに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // リセット（同じファイルを再選択可能にする）
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Camera size={16} />
        <span>写真から読み取り</span>
      </div>

      <p className="text-xs text-gray-500">
        当番表の写真（JPG/PNG）をアップロードすると、AIが表データを読み取ります。
        画像はサーバーに保存されません。
      </p>

      {/* ドロップゾーン */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleInputChange}
          capture="environment"
          className="hidden"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500">AIが画像を読み取り中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={32} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">
                クリックまたはドラッグ&ドロップで画像をアップロード
              </p>
              <p className="text-xs text-gray-400 mt-1">
                JPG, PNG, GIF, WebP対応 ・ スマホカメラからも撮影可能
              </p>
            </div>
          </div>
        )}
      </div>

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
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* 確認ダイアログ */}
      {ocrRows && (
        <ReviewDialog
          rows={ocrRows}
          schedule={schedule}
          onChange={onChange}
          onClose={() => {
            setOcrRows(null);
            setPreview(null);
          }}
          title="写真読み取り結果の確認"
        />
      )}
    </div>
  );
}

function getPasscode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("toban_passcode") ?? "";
}

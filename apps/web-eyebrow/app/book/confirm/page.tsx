"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { postReserve, buildEndAt } from "@/src/lib/apiClient";

const DEFAULT_CONSENT = "予約内容を確認し、同意の上で予約を確定します";

function mapError(msg: string): string {
  if (msg.includes("duplicate_slot") || msg.includes("duplicate"))
    return "この時間帯はすでに予約で埋まっています。前の画面に戻って別の日時をお選びください。";
  return msg;
}

function ConfirmForm() {
  const router = useRouter();
  const params = useSearchParams();

  const menuId   = params.get("menuId") ?? "";
  const menuName = params.get("menuName") ?? "";
  const price    = params.get("price") ?? "0";
  const duration = params.get("duration") ?? "30";
  const tenantId = params.get("tenantId") ?? "default";
  const date     = params.get("date") ?? "";
  const time     = params.get("time") ?? "";

  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [agreed, setAgreed]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!name.trim()) { setError("お名前を入力してください"); return; }
    if (!agreed) { setError("同意にチェックしてください"); return; }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    setIsDuplicate(false);

    try {
      const startAt = `${date}T${time}:00+09:00`;
      const endAt   = buildEndAt(date, time, Number(duration));

      const res = await postReserve({
        tenantId,
        staffId: "any",
        startAt,
        endAt,
        customerName: name.trim(),
        phone: phone.trim() || null,
        menuId: menuId || undefined,
      });

      if (res.ok) {
        const id = res.reservationId ?? res.id ?? "";
        router.push(
          `/book/done?menuName=${encodeURIComponent(menuName)}&date=${date}&time=${time}&name=${encodeURIComponent(name.trim())}&id=${encodeURIComponent(id)}`
        );
      } else {
        const errMsg = mapError(res.error ?? "予約に失敗しました");
        setError(errMsg);
        if (res.error?.includes("duplicate")) setIsDuplicate(true);
        submittingRef.current = false;
        setSubmitting(false);
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      const errMsg = mapError(raw);
      setError(errMsg);
      if (raw.includes("duplicate")) setIsDuplicate(true);
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const dayStr = date
    ? (() => {
        const d = new Date(date + "T00:00:00");
        const days = ["日", "月", "火", "水", "木", "金", "土"];
        return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
      })()
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--brow-text)" }}>
          予約内容の確認
        </h1>
      </div>

      {/* Summary card */}
      <div className="card space-y-2">
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--brow-muted)" }}>メニュー</span>
          <span className="font-semibold" style={{ color: "var(--brow-text)" }}>
            {decodeURIComponent(menuName)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--brow-muted)" }}>料金</span>
          <span className="font-semibold" style={{ color: "var(--brow-primary)" }}>
            ¥{Number(price).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--brow-muted)" }}>施術時間</span>
          <span className="font-semibold" style={{ color: "var(--brow-text)" }}>{duration}分</span>
        </div>
        <div
          className="flex justify-between text-sm pt-2 mt-2"
          style={{ borderTop: "1px solid var(--brow-border)" }}
        >
          <span style={{ color: "var(--brow-muted)" }}>日時</span>
          <span className="font-semibold" style={{ color: "var(--brow-text)" }}>
            {dayStr} {time}〜
          </span>
        </div>
      </div>

      {/* Input form */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brow-text)" }}>
            お名前 <span style={{ color: "var(--brow-accent)" }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="山田 花子"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brow-text)" }}>
            電話番号 <span className="text-xs font-normal" style={{ color: "var(--brow-muted)" }}>(任意)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="090-0000-0000"
            className="input"
          />
        </div>
      </div>

      {/* Consent */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0"
          style={{ accentColor: "var(--brow-primary)" }}
        />
        <span className="text-xs leading-relaxed" style={{ color: "var(--brow-muted)" }}>
          {DEFAULT_CONSENT}
        </span>
      </label>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "#fff0f0", border: "1px solid #fca5a5", color: "#991b1b" }}
        >
          {error}
        </div>
      )}

      {isDuplicate && (
        <div className="text-center">
          <a
            href={`/book/slot?menuId=${menuId}&menuName=${menuName}&price=${price}&duration=${duration}&tenantId=${tenantId}`}
            className="text-sm underline font-semibold"
            style={{ color: "var(--brow-accent)" }}
          >
            ← 別の日時を選ぶ
          </a>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-primary w-full text-base py-4"
      >
        {submitting ? "予約中…" : "予約を確定する"}
      </button>

      <div>
        <a
          href={`/book/slot?menuId=${menuId}&menuName=${menuName}&price=${price}&duration=${duration}&tenantId=${tenantId}`}
          className="text-xs underline"
          style={{ color: "var(--brow-muted)" }}
        >
          ← 日時選択に戻る
        </a>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-sm" style={{ color: "var(--brow-muted)" }}>読み込み中…</div>}>
      <ConfirmForm />
    </Suspense>
  );
}

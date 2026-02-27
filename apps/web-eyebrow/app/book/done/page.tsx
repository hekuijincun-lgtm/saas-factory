"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { defaultCopy } from "@/src/eyebrow/presets";

function DoneContent() {
  const params = useSearchParams();
  const menuName = params.get("menuName") ?? "";
  const date     = params.get("date") ?? "";
  const time     = params.get("time") ?? "";
  const name     = params.get("name") ?? "";

  const dayStr = date
    ? (() => {
        const d = new Date(date + "T00:00:00");
        const days = ["日", "月", "火", "水", "木", "金", "土"];
        return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
      })()
    : "";

  return (
    <div className="space-y-8">
      {/* Success hero */}
      <section className="text-center py-6 space-y-3">
        <div className="text-5xl">✦</div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--brow-text)" }}>
          ご予約が完了しました
        </h1>
        {name && (
          <p className="text-sm" style={{ color: "var(--brow-muted)" }}>
            {decodeURIComponent(name)} 様、ありがとうございます
          </p>
        )}
      </section>

      {/* Booking summary */}
      <div className="card space-y-2">
        <h2 className="font-semibold text-sm mb-3" style={{ color: "var(--brow-text)" }}>
          ご予約内容
        </h2>
        {menuName && (
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--brow-muted)" }}>メニュー</span>
            <span className="font-semibold" style={{ color: "var(--brow-text)" }}>
              {decodeURIComponent(menuName)}
            </span>
          </div>
        )}
        {dayStr && time && (
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--brow-muted)" }}>日時</span>
            <span className="font-semibold" style={{ color: "var(--brow-text)" }}>
              {dayStr} {time}〜
            </span>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card space-y-2">
        <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--brow-text)" }}>
          ご来店の前に
        </h3>
        <ul className="space-y-2">
          {defaultCopy.notes.map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--brow-muted)" }}>
              <span className="shrink-0 mt-0.5" style={{ color: "var(--brow-accent)" }}>✦</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs pt-2 font-medium" style={{ color: "var(--brow-accent)" }}>
          ♻ {defaultCopy.repeatCycle}
        </p>
      </div>

      {/* CTA */}
      <div className="text-center space-y-3">
        <Link href="/" className="btn-primary text-sm px-6 py-3 inline-flex">
          トップページへ
        </Link>
        <div>
          <Link href="/book/menu" className="text-xs underline" style={{ color: "var(--brow-muted)" }}>
            別のメニューを予約する
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DonePage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-sm" style={{ color: "var(--brow-muted)" }}>読み込み中…</div>}>
      <DoneContent />
    </Suspense>
  );
}

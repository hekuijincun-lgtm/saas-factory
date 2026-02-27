"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { eyebrowMenus } from "@/src/eyebrow/presets";

function MenuList() {
  const params = useSearchParams();
  const tenantId = params.get("tenantId") ?? "default";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--brow-text)" }}>
          メニューを選ぶ
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--brow-muted)" }}>
          ご希望のメニューをお選びください
        </p>
      </div>

      <div className="space-y-3">
        {eyebrowMenus.map((m) => (
          <Link
            key={m.id}
            href={`/book/slot?menuId=${m.id}&menuName=${encodeURIComponent(m.name)}&price=${m.price}&duration=${m.durationMin}&tenantId=${encodeURIComponent(tenantId)}`}
            className="card flex items-start justify-between gap-3 hover:shadow-md transition-shadow block"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-sm" style={{ color: "var(--brow-text)" }}>
                  {m.name}
                </span>
                {m.tags?.slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "var(--brow-light)", color: "var(--brow-accent)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--brow-muted)" }}>
                {m.description}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sm" style={{ color: "var(--brow-primary)" }}>
                ¥{m.price.toLocaleString()}
              </p>
              <p className="text-xs" style={{ color: "var(--brow-muted)" }}>{m.durationMin}分</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-sm" style={{ color: "var(--brow-muted)" }}>読み込み中…</div>}>
      <MenuList />
    </Suspense>
  );
}

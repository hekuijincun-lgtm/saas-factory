"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { eyebrowMenus } from "@/src/eyebrow/presets";
import {
  fetchAdminMenu,
  type EyebrowMenuView,
} from "@/src/lib/adminMenuClient";

type Source = "loading" | "api" | "preset";

/** プリセットを EyebrowMenuView 形式に変換 */
function presetsAsView(): EyebrowMenuView[] {
  return eyebrowMenus.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    priceYen: m.price,
    durationMin: m.durationMin,
    tags: m.tags,
  }));
}

function MenuList() {
  const params = useSearchParams();
  const tenantId = params.get("tenantId") ?? "default";
  const debug = params.get("debug") === "1";

  const [menus, setMenus] = useState<EyebrowMenuView[]>([]);
  const [source, setSource] = useState<Source>("loading");

  useEffect(() => {
    fetchAdminMenu(tenantId).then((apiMenus) => {
      if (apiMenus.length > 0) {
        setMenus(apiMenus);
        setSource("api");
      } else {
        setMenus(presetsAsView());
        setSource("preset");
      }
    });
  }, [tenantId]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold" style={{ color: "var(--brow-text)" }}>
            メニューを選ぶ
          </h1>
          {debug && source !== "loading" && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={
                source === "api"
                  ? { background: "#d1fae5", color: "#065f46" }
                  : { background: "#fef3c7", color: "#92400e" }
              }
            >
              source={source}
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--brow-muted)" }}>
          ご希望のメニューをお選びください
        </p>
      </div>

      {source === "loading" ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--brow-muted)" }}>
          読み込み中…
        </p>
      ) : (
        <div className="space-y-3">
          {menus.map((m) => (
            <Link
              key={m.id}
              href={`/book/slot?menuId=${m.id}&menuName=${encodeURIComponent(m.name)}&price=${m.priceYen}&duration=${m.durationMin}&tenantId=${encodeURIComponent(tenantId)}`}
              className="card flex items-start justify-between gap-3 hover:shadow-md transition-shadow block"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className="font-semibold text-sm"
                    style={{ color: "var(--brow-text)" }}
                  >
                    {m.name}
                  </span>
                  {m.tags?.slice(0, 2).map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: "var(--brow-light)",
                        color: "var(--brow-accent)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                {m.description && (
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--brow-muted)" }}
                  >
                    {m.description}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                {m.priceYen > 0 ? (
                  <p
                    className="font-bold text-sm"
                    style={{ color: "var(--brow-primary)" }}
                  >
                    ¥{m.priceYen.toLocaleString()}
                  </p>
                ) : (
                  <p
                    className="text-xs font-medium"
                    style={{ color: "var(--brow-muted)" }}
                  >
                    要確認
                  </p>
                )}
                {m.durationMin > 0 ? (
                  <p className="text-xs" style={{ color: "var(--brow-muted)" }}>
                    {m.durationMin}分
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--brow-muted)" }}>
                    —
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div
          className="text-center py-10 text-sm"
          style={{ color: "var(--brow-muted)" }}
        >
          読み込み中…
        </div>
      }
    >
      <MenuList />
    </Suspense>
  );
}

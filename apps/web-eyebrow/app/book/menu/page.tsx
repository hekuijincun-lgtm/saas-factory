// Server Component — no "use client"
// SSR時点でAPIメニューを取得し、失敗時のみプリセットにフォールバック
import Link from "next/link";
import { eyebrowMenus } from "@/src/eyebrow/presets";
import {
  fetchAdminMenuServer,
  type AdminMenuItem,
} from "@/src/lib/adminMenuServer";

// CF Pages では searchParams が毎リクエスト異なるため常に動的レンダリング
export const dynamic = "force-dynamic";

/** プリセットを統一モデルに変換 */
function presetsAsView(): AdminMenuItem[] {
  return eyebrowMenus.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    priceYen: m.price,
    durationMin: m.durationMin,
    tags: m.tags,
  }));
}

// Next.js 15 App Router: searchParams は Promise
export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; debug?: string }>;
}) {
  const sp = await searchParams;
  const tenantId = sp.tenantId ?? "default";
  const debug = sp.debug === "1";

  // SSR でAPIを叩く（失敗・0件 → null）
  const apiResult = await fetchAdminMenuServer(tenantId);
  const source: "api" | "preset" =
    apiResult && apiResult.length > 0 ? "api" : "preset";
  const menus: AdminMenuItem[] =
    source === "api" ? apiResult! : presetsAsView();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--brow-text)" }}
          >
            メニューを選ぶ
          </h1>
          {debug && (
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
    </div>
  );
}

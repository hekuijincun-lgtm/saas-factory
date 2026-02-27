import Link from "next/link";
import { eyebrowMenus, defaultCopy } from "@/src/eyebrow/presets";

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="text-center py-10 space-y-5">
        <div className="text-5xl">✦ ✦ ✦</div>
        <h1 className="text-3xl font-bold leading-snug" style={{ color: "var(--brow-text)" }}>
          {defaultCopy.salonName}
        </h1>
        <p className="text-base" style={{ color: "var(--brow-muted)" }}>
          {defaultCopy.tagline}
        </p>
        <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: "var(--brow-muted)" }}>
          {defaultCopy.description}
        </p>
        <Link
          href="/book/menu"
          className="btn-primary text-base px-8 py-4 rounded-2xl shadow-md inline-flex"
        >
          今すぐ予約する →
        </Link>
      </section>

      {/* Featured menus */}
      <section>
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--brow-text)" }}>
          人気メニュー
        </h2>
        <div className="space-y-3">
          {eyebrowMenus.slice(0, 3).map((m) => (
            <Link
              key={m.id}
              href={`/book/slot?menuId=${m.id}&menuName=${encodeURIComponent(m.name)}&price=${m.price}&duration=${m.durationMin}&tenantId=default`}
              className="card flex items-start justify-between gap-3 hover:shadow-md transition-shadow block"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm" style={{ color: "var(--brow-text)" }}>
                    {m.name}
                  </span>
                  {m.tags?.slice(0, 1).map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "var(--brow-light)", color: "var(--brow-accent)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-xs leading-relaxed truncate" style={{ color: "var(--brow-muted)" }}>
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
        <div className="text-center mt-4">
          <Link href="/book/menu" className="text-sm font-semibold underline" style={{ color: "var(--brow-accent)" }}>
            全メニューを見る →
          </Link>
        </div>
      </section>

      {/* Notes */}
      <section className="card space-y-2">
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
      </section>
    </div>
  );
}

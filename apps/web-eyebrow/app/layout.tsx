import type { Metadata } from "next";
import "./globals.css";
import { defaultCopy } from "@/src/eyebrow/presets";

export const metadata: Metadata = {
  title: `${defaultCopy.salonName} | 眉毛サロン予約`,
  description: defaultCopy.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col" style={{ background: "var(--brow-bg)" }}>
        {/* Header */}
        <header className="sticky top-0 z-50 border-b" style={{ background: "var(--brow-card)", borderColor: "var(--brow-border)" }}>
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--brow-primary)" }}>
              <span className="text-2xl">✦</span>
              <span>{defaultCopy.salonName}</span>
            </a>
            <a
              href="/book/menu"
              className="text-xs font-semibold px-4 py-2 rounded-full"
              style={{ background: "var(--brow-primary)", color: "white" }}
            >
              ご予約
            </a>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1">
          <div className="max-w-xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 text-center text-xs" style={{ color: "var(--brow-muted)", borderTop: "1px solid var(--brow-border)" }}>
          <p>© 2024 {defaultCopy.salonName}. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}

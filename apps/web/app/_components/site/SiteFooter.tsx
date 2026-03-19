import Link from 'next/link';
import { LEGAL } from '../../../src/lib/legal';

/**
 * Shared public-site footer.
 * Used on LPs, legal pages, and any public-facing route.
 * Do NOT add to /admin or /booking layouts.
 */
export function SiteFooter() {
  return (
    <footer
      className="bg-slate-900 text-slate-400 py-10 px-5"
      aria-label="フッター"
    >
      <div className="mx-auto max-w-5xl flex flex-col gap-6">
        {/* Top row: brand + nav */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-rose-500 rounded-md flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5 text-white"
                aria-hidden="true"
              >
                <circle cx="6" cy="6" r="3" />
                <path d="M8.12 8.12 12 12" />
                <path d="M20 4 8.12 15.88" />
                <circle cx="6" cy="18" r="3" />
                <path d="M14.8 14.8 20 20" />
              </svg>
            </div>
            <span className="text-sm font-bold text-white">
              {LEGAL.serviceName}
            </span>
          </div>

          <nav
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs"
            aria-label="フッターナビゲーション"
          >
            <Link
              href="/legal/tokushoho"
              className="hover:text-white transition-colors"
            >
              特定商取引法に基づく表記
            </Link>
            <Link
              href="/legal/privacy"
              className="hover:text-white transition-colors"
            >
              プライバシーポリシー
            </Link>
            <Link
              href="/legal/terms"
              className="hover:text-white transition-colors"
            >
              利用規約
            </Link>
            <a
              href={`mailto:${LEGAL.email}`}
              className="hover:text-white transition-colors"
            >
              お問い合わせ
            </a>
            <Link
              href="/login"
              className="hover:text-white transition-colors"
            >
              ログイン
            </Link>
          </nav>
        </div>

        {/* Bottom row: copyright */}
        <p className="text-center text-xs">
          &copy; {new Date().getFullYear()} {LEGAL.serviceName}. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}

import Link from 'next/link';

export default function LpFooter() {
  return (
    <footer className="px-6 py-12 md:py-16 bg-gray-900 text-gray-400">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr] gap-8 md:gap-12">
          {/* ブランド */}
          <div>
            <div className="text-white font-black text-xl">🐾 PetBoard</div>
            <p className="mt-2 text-xs text-gray-500 max-w-xs leading-relaxed">
              ペットサロン向け AI店長アプリ。オーナーが何もしなくても、AI が毎日サロンの売上を最大化します。
            </p>
            <p className="mt-4 text-xs text-gray-500">
              お問い合わせ:<br />
              <a href="mailto:hekuijincun@gmail.com" className="hover:text-white transition-colors">hekuijincun@gmail.com</a><br />
              TEL: 080-7353-0117 (平日 10:00〜18:00)
            </p>
          </div>

          {/* プロダクト */}
          <div>
            <div className="text-white font-bold text-sm mb-4">プロダクト</div>
            <ul className="space-y-2.5 text-xs">
              <li><Link href="/lp/pet" className="hover:text-white transition-colors">PetBoard トップ</Link></li>
              <li><Link href="/lp/pet#pricing" className="hover:text-white transition-colors">料金プラン</Link></li>
              <li><Link href="/lp/pet/line-setup" className="hover:text-white transition-colors">LINE連携設定ガイド</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <div className="text-white font-bold text-sm mb-4">規約・法令</div>
            <ul className="space-y-2.5 text-xs">
              <li><Link href="/legal/tokushoho" className="hover:text-white transition-colors">特定商取引法に基づく表記</Link></li>
              <li><Link href="/legal/terms" className="hover:text-white transition-colors">利用規約</Link></li>
              <li><Link href="/legal/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div>&copy; 2026 SaaS Factory. All rights reserved.</div>
          <div className="text-gray-600">
            Powered by Cloudflare &times; Stripe
          </div>
        </div>
      </div>
    </footer>
  );
}

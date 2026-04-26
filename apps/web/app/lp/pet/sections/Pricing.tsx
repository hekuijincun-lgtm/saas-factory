'use client';
import InstallCTA from '../InstallCTA';
import ScrollReveal from '../components/ScrollReveal';

const FEATURES = [
  '予約・顧客管理',
  'LINE連携 配信無制限',
  'カルテ・メニュー・スタッフ管理',
  'クーポン管理',
  '営業日カレンダー自動生成',
  'AIペット見積もり',
  'AI店長 24時間稼働',
  '5本の売上レバー（休眠呼び戻し・空き枠・誕生日・リマインド・サンキュー）',
  '休眠顧客への自動クーポン配信',
  'AI店長と会話で調整',
  '活動レポート（週次・月次）',
];

export default function Pricing({ onInstall, isInstalled }: { onInstall: () => void; isInstalled: boolean }) {
  return (
    <section id="pricing" className="px-6 py-20 md:py-28 bg-gradient-to-b from-white to-orange-50/40">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <p className="text-center text-xs md:text-sm font-semibold text-orange-600 uppercase tracking-widest">
            料金プラン
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2 className="mt-3 text-3xl md:text-5xl font-black text-center text-gray-900 leading-tight">
            シンプルな<span className="text-orange-500">ワンプラン</span>
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.2}>
          <p className="mt-5 text-center text-base md:text-lg text-gray-600">
            初期費用・追加料金なし。すべての機能がひとつのプランに。
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <div className="mt-14 max-w-lg mx-auto">
            <div className="relative rounded-3xl bg-white border-4 border-orange-500 shadow-2xl p-8 md:p-10 flex flex-col overflow-hidden">
              <div className="absolute -top-20 -right-20 w-60 h-60 bg-orange-100 rounded-full blur-3xl pointer-events-none" />

              <div className="relative flex flex-col flex-1">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-bold text-orange-600 uppercase tracking-wider">PetBoard</div>
                  <div className="px-2.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">ベータ期間 先行リリース</div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <div className="text-4xl md:text-5xl font-black text-gray-900">¥9,800</div>
                  <div className="text-lg md:text-xl text-gray-500">/ 月</div>
                </div>
                <p className="mt-2 text-sm text-gray-500">1店舗あたり / 税抜</p>

                <div className="mt-8 space-y-3 flex-1">
                  {FEATURES.map((f, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 mt-0.5 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                      <div className="font-medium text-gray-800">{f}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-10">
                  <InstallCTA onClick={onInstall} isInstalled={isInstalled} size="xl" fullWidth />
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.4}>
          <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 justify-center text-xs md:text-sm text-gray-500">
            <span>✓ 初期費用 0円</span>
            <span>✓ 最低利用期間なし</span>
            <span>✓ いつでも解約可能</span>
            <span>✓ クレジットカード登録後開始</span>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

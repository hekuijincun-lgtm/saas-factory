// ────────────────────────────────────────────────────────────────────────────
// Legal / business information constants
// Keep all public-facing legal text here so pages stay DRY and consistent.
// When these need to become tenant-configurable, swap for a settings fetch.
// ────────────────────────────────────────────────────────────────────────────

export const LEGAL = {
  /** 販売事業者 / 屋号 */
  businessName: '今村和葵',
  /** 運営責任者 */
  operatorName: '今村和葵',
  /** 郵便番号 */
  postalCode: '330-0856',
  /** 所在地 */
  address: '埼玉県さいたま市大宮区三橋2丁目249-18',
  /** 電話番号 */
  phone: '080-7353-0117',
  /** メールアドレス */
  email: 'hekuijincun@gmail.com',
  /** サービス名 */
  serviceName: 'SaaS Factory',
  /** 販売価格の説明 */
  salesPriceText: '各プランページに記載',
  /** 支払方法 */
  paymentMethodText: 'クレジットカード（Stripe）',
  /** 支払時期 */
  paymentTimingText: 'お申し込み時に即時決済',
  /** 商品の提供時期 */
  deliveryTimingText: '決済完了後、即時利用可能',
  /** 商品代金以外の必要料金 */
  extraFeesText:
    'インターネット接続に必要な通信料金等はお客様のご負担となります',
  /** キャンセル・返金ポリシー */
  refundPolicyText:
    'サービスの性質上、決済完了後の返金は原則として受け付けておりません。ただし法令上認められる場合を除きます。月額料金は日割り計算されず、解約月の満額を請求いたします。解約後も当該月末日までサービスをご利用いただけます。本サービスは特定商取引法上の「通信販売」に該当し、クーリング・オフ制度の適用対象外です。',
  /** 動作環境 */
  environmentText:
    '【ブラウザ】最新版の Google Chrome / Safari / Microsoft Edge / Firefox 【対応デバイス】PC (Windows / Mac)、iPad、iPhone、Android タブレット・スマートフォン 【通信環境】ブロードバンド接続推奨 【外部サービス】LINE公式アカウント（Messaging API対応プラン）',
  /** サイトURL */
  siteUrl: 'https://saas-factory-web-v2.pages.dev',
  /** 商品・サービスの内容 */
  serviceDescription:
    '美容サロン・店舗向けオンライン予約管理SaaS。LINE予約受付、顧客管理、スタッフ管理、メニュー管理、前日自動リマインド、リピート促進配信、AI接客（自動返信）、LINE連携等の機能を提供します。',
  /** 中途解約 */
  cancellationText:
    'サブスクリプションは次回更新日の前日までにマイページから解約手続きを行うことで、次回以降の課金を停止できます。解約月の日割り返金は行いません。【解約手順】(1)管理画面にログイン → (2)「設定」→「ご契約情報」を開く → (3)「解約する」ボタンを押す → (4)確認画面で「解約を確定する」を押す。ご不明な場合は上記メールアドレスまでお問い合わせください。',
  /** 注意書き */
  disclaimerText:
    '本サービスの利用により売上・集客等の効果を保証するものではありません。サービス内容は予告なく変更・追加・終了する場合があります。',
  /** 申込有効期限 */
  applicationValidityText:
    'お申込み完了後、決済処理が正常に完了するまでを申込有効期限とします。決済が完了しない場合、お申込みは無効となります。',
  /** 販売数量の制限 */
  salesQuantityText:
    '1事業者につき1契約を基本とします。複数店舗運営の場合は店舗数分のご契約が可能です。',
  /** 特別の販売条件 */
  specialConditionsText:
    '本サービスは事業者向けの業務用サービスです。個人のお客様（消費者）との契約は想定しておりません。お申込みには営業可能な実店舗または事業所の存在が必要です。',
  /** 不良品・不具合時の対応 */
  defectPolicyText:
    'サービス内容が明らかに事前説明と異なる場合、または当社の過失によりサービスが利用できない状態が30日を超えて継続した場合、当該期間分の料金を返金いたします。',
} as const;

export type LegalInfo = typeof LEGAL;

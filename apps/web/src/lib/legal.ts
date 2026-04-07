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
  address: '埼玉県さいたま市大宮区',
  /** 電話番号 */
  phone: '080-7353-0117',
  /** メールアドレス */
  email: 'hekuijincun@gmail.com',
  /** サービス名（PAY.JP 登録と一致させる） */
  serviceName: 'SaaS Factory',
  /** 販売価格の説明 */
  salesPriceText: '各プランページに記載',
  /** 支払方法 */
  paymentMethodText: 'クレジットカード（PAY.JP）',
  /** 支払時期 */
  paymentTimingText: 'お申し込み時に即時決済',
  /** 商品の提供時期 */
  deliveryTimingText: '決済完了後、即時利用可能',
  /** 商品代金以外の必要料金 */
  extraFeesText:
    'インターネット接続に必要な通信料金等はお客様のご負担となります',
  /** キャンセル・返金ポリシー */
  refundPolicyText:
    'サービスの性質上、決済完了後の返金は原則として受け付けておりません。ただし法令上認められる場合を除きます。',
  /** 動作環境 */
  environmentText: '最新のブラウザ環境にてご利用ください',
  /** サイトURL */
  siteUrl: 'https://saas-factory-web-v2.pages.dev',
  /** 商品・サービスの内容 */
  serviceDescription:
    '美容サロン・店舗向けオンライン予約管理SaaS。LINE予約受付、顧客管理、スタッフ管理、メニュー管理、前日自動リマインド、リピート促進配信、AI接客（自動返信）、LINE連携等の機能を提供します。',
  /** 中途解約 */
  cancellationText:
    'サブスクリプションは次回更新日の前日までにマイページから解約手続きを行うことで、次回以降の課金を停止できます。解約月の日割り返金は行いません。',
  /** 注意書き */
  disclaimerText:
    '本サービスの利用により売上・集客等の効果を保証するものではありません。サービス内容は予告なく変更・追加・終了する場合があります。',
} as const;

export type LegalInfo = typeof LEGAL;

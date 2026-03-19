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
  /** サービス名（Stripe 登録と一致させる） */
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
    'サービスの性質上、決済完了後の返金は原則として受け付けておりません。ただし法令上認められる場合を除きます。',
  /** 動作環境 */
  environmentText: '最新のブラウザ環境にてご利用ください',
} as const;

export type LegalInfo = typeof LEGAL;

// Outreach OS — Pain Hypothesis Engine (pure function)
// ============================================================
// Rule-based engine that maps extracted features to structured pain hypotheses.
// No side effects, no external calls.

import type { ExtractedFeatures } from "./analyzer";

export type PainSeverity = "low" | "medium" | "high";

export interface PainHypothesis {
  code: string;
  label: string;
  severity: PainSeverity;
  reason: string;
}

// ── Hypothesis codes ───────────────────────────────────────────────────────

export const PAIN_CODES = {
  INSTAGRAM_WITHOUT_BOOKING: "instagram_without_booking",
  HIGH_VISIBILITY_LOW_CONVERSION: "high_visibility_low_conversion_path",
  NO_LINE_RETENTION: "no_line_retention_path",
  WEAK_MENU_INFO: "weak_menu_information",
  MISSING_CONTACT: "missing_contact_channel",
  SHALLOW_BRAND: "shallow_brand_signal",
  NO_CLEAR_BOOKING_CTA: "no_clear_booking_cta",
  NO_PRICE_TRANSPARENCY: "no_price_transparency",
  NO_WEBSITE: "no_website",
} as const;

// ── Engine ─────────────────────────────────────────────────────────────────

/**
 * Pure function: generate pain hypotheses from extracted features.
 * Returns an array of structured hypotheses, sorted by severity (high first).
 */
export function generatePainHypotheses(features: ExtractedFeatures): PainHypothesis[] {
  const hypotheses: PainHypothesis[] = [];

  // No website at all
  if (!features.hasWebsite) {
    hypotheses.push({
      code: PAIN_CODES.NO_WEBSITE,
      label: "ウェブサイト未整備",
      severity: "high",
      reason:
        "ウェブサイトが存在しないか到達不能です。オンラインでの集客導線が欠けており、新規顧客の獲得機会を逃している可能性があります。",
    });
    // If no website, most other hypotheses don't apply
    if (features.hasInstagram) {
      hypotheses.push({
        code: PAIN_CODES.INSTAGRAM_WITHOUT_BOOKING,
        label: "Instagram活用だが予約導線なし",
        severity: "high",
        reason:
          "Instagramでの発信は行っていますが、ウェブサイトがないためフォロワーからの予約導線が不明確です。DM予約に依存している可能性が高く、取りこぼしが発生しやすい構造です。",
      });
    }
    return sortBySeverity(hypotheses);
  }

  // Instagram without booking link
  if (features.hasInstagram && !features.hasBookingLink) {
    hypotheses.push({
      code: PAIN_CODES.INSTAGRAM_WITHOUT_BOOKING,
      label: "Instagram活用だが予約導線なし",
      severity: "high",
      reason:
        "Instagramで集客しているにも関わらず、サイト上にオンライン予約の導線がありません。SNSで興味を持ったユーザーが予約に至るまでの摩擦が大きい状態です。",
    });
  }

  // High visibility but low conversion path
  if (features.hasWebsite && features.titleFound && !features.hasBookingLink && features.bookingCtaCount === 0) {
    hypotheses.push({
      code: PAIN_CODES.HIGH_VISIBILITY_LOW_CONVERSION,
      label: "認知はあるが予約転換率が低い可能性",
      severity: "high",
      reason:
        "ウェブサイトは存在しますが、予約導線（CTAボタン・予約リンク）が見つかりません。サイト訪問者が予約に進めず離脱している可能性があります。",
    });
  }

  // No LINE retention path
  if (!features.hasLineLink && features.hasWebsite) {
    hypotheses.push({
      code: PAIN_CODES.NO_LINE_RETENTION,
      label: "LINE公式アカウント未活用",
      severity: "medium",
      reason:
        "サイト上にLINE公式アカウントへの導線がありません。顧客のリピート促進やリマインド通知にLINEを活用できておらず、再来店率の向上余地があります。",
    });
  }

  // Weak menu information
  if (features.menuCountGuess < 2 && features.hasWebsite) {
    hypotheses.push({
      code: PAIN_CODES.WEAK_MENU_INFO,
      label: "メニュー情報が不十分",
      severity: "medium",
      reason:
        "サイト上のメニュー情報が少ないか、構造化されていません。来店前にサービス内容を確認したい顧客にとって判断材料が不足しています。",
    });
  }

  // Missing contact channel
  if (!features.contactEmailFound && !features.phoneFound && features.hasWebsite) {
    hypotheses.push({
      code: PAIN_CODES.MISSING_CONTACT,
      label: "問い合わせ手段が不明確",
      severity: "medium",
      reason:
        "メールアドレスや電話番号がサイト上で見つかりません。潜在顧客が問い合わせたくてもできない状態です。",
    });
  }

  // Shallow brand signal
  if (!features.titleFound || !features.metaDescriptionFound) {
    hypotheses.push({
      code: PAIN_CODES.SHALLOW_BRAND,
      label: "ブランド発信が弱い",
      severity: "low",
      reason: [
        !features.titleFound ? "ページタイトルが未設定" : null,
        !features.metaDescriptionFound ? "メタディスクリプションが未設定" : null,
      ]
        .filter(Boolean)
        .join("、") +
        "です。検索エンジンでの表示品質が低く、クリック率に影響している可能性があります。",
    });
  }

  // No clear booking CTA
  if (features.hasBookingLink && features.bookingCtaCount === 0) {
    hypotheses.push({
      code: PAIN_CODES.NO_CLEAR_BOOKING_CTA,
      label: "予約CTAが目立たない",
      severity: "medium",
      reason:
        "予約リンクは存在しますが、明確なCTAボタンが見つかりません。ユーザーが予約ページにたどり着きにくい構造になっている可能性があります。",
    });
  }

  // No price transparency
  if (!features.priceInfoFound && features.hasWebsite) {
    hypotheses.push({
      code: PAIN_CODES.NO_PRICE_TRANSPARENCY,
      label: "料金情報の透明性不足",
      severity: "low",
      reason:
        "サイト上に料金情報が見つかりません。来店前に費用感を知りたい顧客にとってハードルとなり、予約をためらう原因になり得ます。",
    });
  }

  return sortBySeverity(hypotheses);
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<PainSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortBySeverity(hypotheses: PainHypothesis[]): PainHypothesis[] {
  return hypotheses.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

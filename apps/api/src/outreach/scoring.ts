// Outreach OS — Lead Scoring (pure function)
// ============================================================
// Score range: 0–100
// All sub-scores normalized to 0–1, then weighted sum * 100.

import type { ExtractedFeatures } from "./analyzer";
import type { PainHypothesis } from "./pain-hypothesis";

export interface ScoreInput {
  reviewCount: number;
  rating: number | null;       // 1.0–5.0
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasBookingLink: boolean;
  hasLineLink: boolean;
  contactEmail: string | null;
  category: string | null;
  /** Optional list of high-value categories for niche fit */
  targetCategories?: string[];
}

export interface ScoreBreakdown {
  score: number;
  components: {
    reviewCount: number;
    rating: number;
    hasWebsite: number;
    hasInstagram: number;
    hasBookingLink: number;
    hasLineLink: number;
    contactability: number;
    nicheFit: number;
    /** Phase 2: pain depth bonus (0–1) — only present when features analyzed */
    painDepth?: number;
    /** Phase 2: conversion readiness (0–1) — only present when features analyzed */
    conversionReadiness?: number;
  };
}

// ── V1 Weights (sum to 1.0) — used when no extracted features ──────────────

const W = {
  reviewCount: 0.15,
  rating: 0.15,
  hasWebsite: 0.10,
  hasInstagram: 0.10,
  hasBookingLink: 0.10,
  hasLineLink: 0.10,
  contactability: 0.15,
  nicheFit: 0.15,
} as const;

// ── V2 Weights (sum to 1.0) — used when extracted features available ───────

const W2 = {
  reviewCount: 0.10,
  rating: 0.10,
  hasWebsite: 0.05,
  hasInstagram: 0.05,
  hasBookingLink: 0.05,
  hasLineLink: 0.05,
  contactability: 0.15,
  nicheFit: 0.10,
  painDepth: 0.20,
  conversionReadiness: 0.15,
} as const;

/**
 * Pure function: compute lead score 0–100 with breakdown.
 * No side effects, no external calls.
 * Backward-compatible: works without extracted features (V1 mode).
 */
export function computeLeadScore(input: ScoreInput): ScoreBreakdown {
  return computeScoreCore(input);
}

/**
 * V2 scoring: uses extracted features + pain hypotheses for deeper scoring.
 * Falls back to V1 if features not provided.
 */
export function computeLeadScoreV2(
  input: ScoreInput,
  features?: ExtractedFeatures | null,
  hypotheses?: PainHypothesis[] | null
): ScoreBreakdown {
  return computeScoreCore(input, features, hypotheses);
}

function computeScoreCore(
  input: ScoreInput,
  features?: ExtractedFeatures | null,
  hypotheses?: PainHypothesis[] | null
): ScoreBreakdown {
  // reviewCount: log scale, cap at 100 reviews = 1.0
  const rc = Math.min(1, Math.log10(Math.max(1, input.reviewCount + 1)) / 2);

  // rating: linear 1–5 → 0–1
  const rt = input.rating != null
    ? Math.max(0, Math.min(1, (input.rating - 1) / 4))
    : 0;

  // Boolean features: use extracted features when available, fallback to input flags
  const ws = (features ? features.hasWebsite : input.hasWebsite) ? 1 : 0;
  const ig = (features ? features.hasInstagram : input.hasInstagram) ? 1 : 0;
  const bk = (features ? features.hasBookingLink : input.hasBookingLink) ? 1 : 0;
  const ln = (features ? features.hasLineLink : input.hasLineLink) ? 1 : 0;

  // Contactability: 0–1 based on available contact channels
  let contactChannels = 0;
  if (features) {
    if (features.contactEmailFound) contactChannels++;
    if (features.phoneFound) contactChannels++;
    if (features.hasLineLink) contactChannels++;
    if (features.hasInstagram) contactChannels++;
    if (features.hasWebsite) contactChannels++;
  } else {
    if (input.contactEmail) contactChannels++;
    if (input.hasWebsite) contactChannels++;
    if (input.hasLineLink) contactChannels++;
    if (input.hasInstagram) contactChannels++;
  }
  const ct = Math.min(1, contactChannels / 3);

  // Niche fit
  let nf = 0;
  if (input.category) {
    nf = 0.5;
    if (input.targetCategories?.length) {
      const cat = input.category.toLowerCase();
      if (input.targetCategories.some((t) => cat.includes(t.toLowerCase()))) {
        nf = 1.0;
      }
    }
  }

  // V2-only components
  if (features && hypotheses) {
    // Pain depth: more high-severity pains = higher opportunity score
    const highPains = hypotheses.filter((h) => h.severity === "high").length;
    const medPains = hypotheses.filter((h) => h.severity === "medium").length;
    const painDepth = Math.min(1, (highPains * 0.4 + medPains * 0.2) / 1.0);

    // Conversion readiness: how close is this lead to being convertible
    // Higher when: has website but missing booking (easy to add value)
    let convReady = 0;
    if (features.hasWebsite && !features.hasBookingLink) convReady += 0.4; // clear value prop
    if (features.hasInstagram && !features.hasBookingLink) convReady += 0.2; // additional surface
    if (features.menuCountGuess > 0 && !features.priceInfoFound) convReady += 0.15;
    if (!features.hasLineLink && features.hasWebsite) convReady += 0.15;
    if (features.contactEmailFound || features.phoneFound) convReady += 0.1;
    convReady = Math.min(1, convReady);

    const components = {
      reviewCount: rc,
      rating: rt,
      hasWebsite: ws,
      hasInstagram: ig,
      hasBookingLink: bk,
      hasLineLink: ln,
      contactability: ct,
      nicheFit: nf,
      painDepth,
      conversionReadiness: convReady,
    };

    const weighted =
      rc * W2.reviewCount +
      rt * W2.rating +
      ws * W2.hasWebsite +
      ig * W2.hasInstagram +
      bk * W2.hasBookingLink +
      ln * W2.hasLineLink +
      ct * W2.contactability +
      nf * W2.nicheFit +
      painDepth * W2.painDepth +
      convReady * W2.conversionReadiness;

    return { score: Math.round(weighted * 100), components };
  }

  // V1 fallback (no features)
  const components = {
    reviewCount: rc,
    rating: rt,
    hasWebsite: ws,
    hasInstagram: ig,
    hasBookingLink: bk,
    hasLineLink: ln,
    contactability: ct,
    nicheFit: nf,
  };

  const weighted =
    rc * W.reviewCount +
    rt * W.rating +
    ws * W.hasWebsite +
    ig * W.hasInstagram +
    bk * W.hasBookingLink +
    ln * W.hasLineLink +
    ct * W.contactability +
    nf * W.nicheFit;

  return { score: Math.round(weighted * 100), components };
}

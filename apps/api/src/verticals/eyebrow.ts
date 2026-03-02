/**
 * Vertical Plugin: eyebrow (眉毛サロン)
 * P4: KPI / repeat / onboarding のビジネスロジックをここに集約。
 * 他業種プラグイン（nail.ts / dental.ts 等）も同構造で追加可能。
 */

/** デフォルトリピートテンプレート */
export const DEFAULT_REPEAT_TEMPLATE =
  '前回のご来店からそろそろ{interval}週が経ちます。眉毛のリタッチはいかがでしょうか？';

/** スタイルタイプ → 日本語ラベル */
export const STYLE_LABELS: Record<string, string> = {
  natural: 'ナチュラル',
  bold:    'ボールド',
  sharp:   'シャープ',
  korean:  '韓国風',
  feathering: 'フェザリング',
  custom:  'カスタム',
};

/** meta オブジェクトからスタイルタイプを取得（verticalData 優先・eyebrowDesign フォールバック） */
export function getStyleType(meta: any): string | null {
  return (meta?.verticalData?.styleType ?? meta?.eyebrowDesign?.styleType) || null;
}

/** スタイルタイプから日本語ラベルを返す */
export function getStyleLabel(styleType: string | null): string {
  if (!styleType) return '';
  return STYLE_LABELS[styleType] ?? styleType;
}

export interface RepeatConfig {
  enabled: boolean;
  intervalDays: number;
  template: string;
}

/**
 * 設定オブジェクトからリピート設定を取得。
 * 新形式（verticalConfig.repeat）優先、旧形式（eyebrow.repeat）フォールバック。
 */
export function getRepeatConfig(settings: any): RepeatConfig {
  // 新形式: verticalConfig.repeat
  const vc = settings?.verticalConfig?.repeat;
  if (vc && (vc.template || vc.intervalDays != null || vc.enabled != null)) {
    return {
      enabled: Boolean(vc.enabled),
      intervalDays: Number(vc.intervalDays) || 42,
      template: String(vc.template || DEFAULT_REPEAT_TEMPLATE),
    };
  }
  // 旧形式: eyebrow.repeat
  const eb = settings?.eyebrow?.repeat;
  if (eb) {
    return {
      enabled: Boolean(eb.enabled),
      intervalDays: Number(eb.intervalDays) || 42,
      template: String(eb.template || DEFAULT_REPEAT_TEMPLATE),
    };
  }
  return { enabled: false, intervalDays: 42, template: DEFAULT_REPEAT_TEMPLATE };
}

/**
 * リピート促進メッセージのトークン置換。
 * {storeName} {style} {staff} {bookingUrl} {interval} を置換する。
 */
export function buildRepeatMessage(
  template: string,
  tokens: { storeName: string; style: string; staff: string; bookingUrl: string; interval: string },
): string {
  return template
    .replace(/\{interval\}/g, tokens.interval)
    .replace(/\{storeName\}/g, tokens.storeName)
    .replace(/\{style\}/g, tokens.style)
    .replace(/\{staff\}/g, tokens.staff)
    .replace(/\{bookingUrl\}/g, tokens.bookingUrl);
}

export interface OnboardingCheckItem {
  key: string;
  label: string;
  done: boolean;
  action: string;
  detail?: string;
}

/**
 * 眉毛サロン固有のオンボーディングチェック項目。
 * onboarding-status ハンドラーから呼び出す。
 */
export function eyebrowOnboardingChecks(opts: {
  menuEyebrowCount: number;
  repeatEnabled: boolean;
  templateSet: boolean;
}): OnboardingCheckItem[] {
  return [
    {
      key: 'menuEyebrow',
      label: '眉毛スタイル設定済みメニュー（1件以上）',
      done: opts.menuEyebrowCount > 0,
      action: '/admin/menu',
      detail: opts.menuEyebrowCount > 0 ? `${opts.menuEyebrowCount}件` : undefined,
    },
    {
      key: 'repeatConfig',
      label: 'リピート設定（有効化 + テンプレ設定）',
      done: opts.repeatEnabled && opts.templateSet,
      action: '/admin/settings',
    },
  ];
}

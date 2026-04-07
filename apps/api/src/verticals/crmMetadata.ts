/**
 * Phase 13: CRM / GTM Automation Metadata
 *
 * Defines campaign types, send reasons, and follow-up intents
 * per vertical. This is the foundation for automated CRM workflows
 * in future phases.
 *
 * Safety: No auto-send logic here — metadata only.
 * Actual sending requires explicit admin enable + review queue.
 */

import type { VerticalType } from '../settings';

// ── Campaign Types ───────────────────────────────────────────────────

export type CampaignType =
  | 'repeat_reminder'      // 定期リピート促進
  | 'dormant_recovery'     // 休眠顧客掘り起こし
  | 'first_visit_followup' // 初回来店後フォロー
  | 'seasonal_campaign'    // 季節キャンペーン
  | 'birthday_greeting'    // 誕生日メッセージ
  | 'review_request';      // 口コミ依頼

export type SendReason =
  | 'interval_elapsed'     // リピート間隔経過
  | 'dormant_threshold'    // 休眠閾値超過
  | 'post_first_visit'     // 初回来店翌日
  | 'seasonal_trigger'     // 季節トリガー
  | 'birthday'             // 誕生日前日
  | 'manual';              // 手動送信

export interface CampaignTypeConfig {
  type: CampaignType;
  label: string;
  description: string;
  defaultEnabled: boolean;
  safetyLevel: 'safe' | 'review' | 'manual_only';
  /** 推奨送信タイミング（来店後の日数） */
  defaultTriggerDays?: number;
  /** vertical固有のメッセージヒント */
  messageHint: string;
}

// ── Per-Vertical Campaign Configs ────────────────────────────────────

const COMMON_CAMPAIGNS: CampaignTypeConfig[] = [
  {
    type: 'first_visit_followup',
    label: '初回来店後フォロー',
    description: '初めてのお客様に翌日お礼メッセージを送信',
    defaultEnabled: false,
    safetyLevel: 'safe',
    defaultTriggerDays: 1,
    messageHint: 'ご来店ありがとうございました。次回のご予約もお待ちしております。',
  },
  {
    type: 'review_request',
    label: '口コミ依頼',
    description: '来店3日後に口コミをお願いするメッセージ',
    defaultEnabled: false,
    safetyLevel: 'review',
    defaultTriggerDays: 3,
    messageHint: '先日はありがとうございました。よろしければ感想をお聞かせください。',
  },
];

const VERTICAL_CAMPAIGNS: Record<VerticalType, CampaignTypeConfig[]> = {
  eyebrow: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: 'リタッチリマインド',
      description: '眉毛のリタッチ推奨時期にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 28,
      messageHint: '眉毛のラインが崩れてくる頃です。リタッチで美しい眉をキープしませんか？',
    },
    {
      type: 'dormant_recovery',
      label: '休眠顧客掘り起こし',
      description: '60日以上来店がないお客様にメッセージ送信',
      defaultEnabled: false,
      safetyLevel: 'review',
      defaultTriggerDays: 60,
      messageHint: 'お久しぶりです。眉毛のお手入れ、お気軽にご予約ください。',
    },
  ],
  nail: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '付け替えリマインド',
      description: 'ジェルネイルの付け替え推奨時期にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 21,
      messageHint: 'ジェルネイルの付け替え時期です。爪への負担を防ぐためにも早めのご予約を。',
    },
    {
      type: 'seasonal_campaign',
      label: '季節デザインキャンペーン',
      description: '季節の変わり目に新作デザインを案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '新作の季節デザインが入りました。トレンドネイルはいかがですか？',
    },
  ],
  hair: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: 'カット周期リマインド',
      description: 'カット・カラーの推奨周期にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 35,
      messageHint: '前回のカットからそろそろ1ヶ月。毛先が気になる頃ではないですか？',
    },
    {
      type: 'dormant_recovery',
      label: '休眠顧客掘り起こし',
      description: '90日以上来店がないお客様にメッセージ送信',
      defaultEnabled: false,
      safetyLevel: 'review',
      defaultTriggerDays: 90,
      messageHint: 'お久しぶりです。季節の変わり目、ヘアスタイルのリフレッシュはいかがですか？',
    },
  ],
  dental: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '定期検診リマインド',
      description: '前回検診から推奨間隔後にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 180,
      messageHint: '定期検診の時期です。症状が出る前の予防ケアが大切です。',
    },
    {
      type: 'dormant_recovery',
      label: '来院促進メッセージ',
      description: '1年以上来院がない患者さんにメッセージ送信',
      defaultEnabled: false,
      safetyLevel: 'review',
      defaultTriggerDays: 365,
      messageHint: 'お口の健康を守るために、定期的なチェックをおすすめします。',
    },
  ],
  esthetic: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '継続ケアリマインド',
      description: '施術効果の持続に合わせたリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 28,
      messageHint: 'お肌のターンオーバーに合わせた定期ケアで、効果を持続させませんか？',
    },
    {
      type: 'seasonal_campaign',
      label: '季節ケアキャンペーン',
      description: '季節の変わり目に肌ケアを案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '季節の変わり目のお肌ケア。今の時期に合った施術をご提案します。',
    },
  ],
  cleaning: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '定期クリーニングリマインド',
      description: '前回のクリーニングから推奨間隔後にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 90,
      messageHint: 'エアコンや水回りの汚れが溜まる前に、定期クリーニングはいかがでしょうか？',
    },
    {
      type: 'seasonal_campaign',
      label: '季節クリーニングキャンペーン',
      description: '大掃除・エアコンシーズン前にクリーニングを案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: 'エアコンシーズン前のクリーニングで快適な空間を。今なら早期割引も。',
    },
  ],
  handyman: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '定期メンテナンスリマインド',
      description: '前回の作業から一定期間後にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 180,
      messageHint: 'お家の定期メンテナンスの時期です。気になるところはございませんか？',
    },
    {
      type: 'seasonal_campaign',
      label: '季節メンテナンスキャンペーン',
      description: '季節の変わり目に庭木剪定やエアコン整備を案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '季節の変わり目、お庭や設備のメンテナンスはお済みですか？',
    },
  ],
  pet: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: 'トリミングリマインド',
      description: '前回のトリミングから推奨間隔後にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 28,
      messageHint: 'わんちゃんの毛が伸びてきた頃ではないでしょうか？トリミングのご予約をお待ちしています。',
    },
    {
      type: 'dormant_recovery',
      label: '休眠顧客掘り起こし',
      description: '90日以上来店がないお客様にメッセージ送信',
      defaultEnabled: false,
      safetyLevel: 'review',
      defaultTriggerDays: 90,
      messageHint: 'お久しぶりです。わんちゃんの毛玉や皮膚トラブル予防のためにも、定期的なトリミングがおすすめです。',
    },
  ],
  seitai: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder' as const,
      label: 'メンテナンス来院リマインド',
      description: '前回施術から推奨間隔が経過した顧客に来院を促す',
      defaultEnabled: true,
      safetyLevel: 'safe' as const,
      defaultTriggerDays: 14,
      messageHint: '前回の施術からそろそろ{interval}週が経ちます。お身体の調子はいかがですか？',
    },
    {
      type: 'dormant_recovery' as const,
      label: '休眠顧客 復帰促進',
      description: '45日以上来院がない顧客に声掛けする',
      defaultEnabled: true,
      safetyLevel: 'review' as const,
      defaultTriggerDays: 45,
      messageHint: '最近お身体の調子はいかがですか？痛みが出る前の定期メンテナンスがおすすめです。',
    },
  ],
  gym: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'dormant_recovery',
      label: '休眠会員復帰促進',
      description: '30日以上来館がない会員にメッセージ送信',
      defaultEnabled: true,
      safetyLevel: 'review',
      defaultTriggerDays: 30,
      messageHint: '最近ジムにお越しいただけていないようです。トレーニングの習慣を取り戻しませんか？',
    },
    {
      type: 'seasonal_campaign',
      label: '季節キャンペーン',
      description: '夏前・新年など目標設定しやすい時期にキャンペーン案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '新しい季節、新しい目標を設定しませんか？今なら体験無料キャンペーン実施中です。',
    },
    {
      type: 'birthday_greeting',
      label: 'お誕生日メッセージ',
      description: '会員の誕生日に特典付きメッセージを送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      messageHint: 'お誕生日おめでとうございます！ささやかですが、パーソナルトレーニング1回無料チケットをプレゼントいたします。',
    },
  ],
  school: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'dormant_recovery',
      label: '休会生徒復帰促進',
      description: '30日以上受講がない生徒にメッセージ送信',
      defaultEnabled: true,
      safetyLevel: 'review',
      defaultTriggerDays: 30,
      messageHint: 'レッスンのお休みが続いていますが、お変わりありませんか？いつでもお気軽にお戻りください。',
    },
    {
      type: 'seasonal_campaign',
      label: '季節キャンペーン（新学期・夏期講習）',
      description: '新学期や長期休暇前に集中コースを案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '新学期に向けて、集中コースで一気にレベルアップしませんか？',
    },
    {
      type: 'repeat_reminder',
      label: '発表会・イベント案内',
      description: '次回の発表会やイベントの参加案内を送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 60,
      messageHint: '次回の発表会のご案内です。日頃の練習成果を披露するチャンスです！',
    },
    {
      type: 'birthday_greeting',
      label: 'お誕生日メッセージ',
      description: '生徒の誕生日にお祝いメッセージを送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      messageHint: 'お誕生日おめでとうございます！これからも一緒に楽しく学んでいきましょう。',
    },
  ],
  shop: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: 'リピート購入リマインド',
      description: '前回購入から一定期間後にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 30,
      messageHint: '前回お買い上げいただいた商品はいかがでしたか？新商品やおすすめ商品をご案内いたします。',
    },
    {
      type: 'seasonal_campaign',
      label: '季節キャンペーン',
      description: '季節の変わり目やセール時にキャンペーンを案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '期間限定セール開催中！お見逃しなく。',
    },
  ],
  food: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '定期お届けリマインド',
      description: '前回注文から一定期間後にリピート購入を案内',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 30,
      messageHint: 'そろそろ前回ご注文いただいた商品がなくなる頃ではないでしょうか？旬の食材もご用意しております。',
    },
    {
      type: 'seasonal_campaign',
      label: '旬の食材キャンペーン',
      description: '季節の食材やギフトシーズンにキャンペーンを案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '旬の食材が入荷しました！期間限定のお取り寄せはいかがですか？',
    },
  ],
  handmade: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: '新作お知らせ',
      description: '前回購入から一定期間後に新作情報を案内',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 30,
      messageHint: '新作が完成しました！一点もののため、気になる作品はお早めにどうぞ。',
    },
    {
      type: 'seasonal_campaign',
      label: '季節の作品キャンペーン',
      description: '季節に合わせた作品やイベント情報を案内',
      defaultEnabled: false,
      safetyLevel: 'review',
      messageHint: '季節にぴったりの新作をご用意しました。ギフトにもおすすめです。',
    },
  ],
  generic: [
    ...COMMON_CAMPAIGNS,
    {
      type: 'repeat_reminder',
      label: 'リピートリマインド',
      description: '前回来店から一定期間後にリマインド送信',
      defaultEnabled: false,
      safetyLevel: 'safe',
      defaultTriggerDays: 30,
      messageHint: '前回のご来店からしばらく経ちました。またのご来店をお待ちしております。',
    },
  ],
};

/**
 * Get CRM campaign type configs for a vertical.
 */
export function getVerticalCampaigns(vertical: VerticalType): CampaignTypeConfig[] {
  return VERTICAL_CAMPAIGNS[vertical] ?? VERTICAL_CAMPAIGNS.generic;
}

/**
 * Get the default repeat reminder config for a vertical.
 */
export function getDefaultRepeatCampaign(vertical: VerticalType): CampaignTypeConfig | undefined {
  return getVerticalCampaigns(vertical).find(c => c.type === 'repeat_reminder');
}

/**
 * Get the dormant recovery config for a vertical.
 */
export function getDormantRecoveryCampaign(vertical: VerticalType): CampaignTypeConfig | undefined {
  return getVerticalCampaigns(vertical).find(c => c.type === 'dormant_recovery');
}

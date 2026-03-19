import {
  CalendarDays, Bell, Shield, BarChart3,
  MessageCircle, Users, ClipboardList, Clock,
  SmartphoneNfc, Sparkles, HeartPulse,
} from 'lucide-react';

// ── Theme System ────────────────────────────────────────────────────
export type ThemeKey = 'rose' | 'indigo' | 'emerald' | 'amber' | 'sky' | 'violet' | 'teal' | 'orange' | 'fuchsia' | 'cyan';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryText: string;
  primaryBorder: string;
  primaryRing: string;
  heroGlow1: string;
  heroGlow2: string;
  heroBg: string;
  cardHover: string;
  iconBg: string;
  iconColor: string;
  planBorder: string;
  planRing: string;
  /** Gradient for hero — used by some designs */
  heroGradient: string;
  /** Soft accent bg for alternating sections */
  sectionBg: string;
}

export const THEMES: Record<ThemeKey, ThemeColors> = {
  rose: {
    primary: 'bg-rose-500', primaryHover: 'hover:bg-rose-600', primaryLight: 'bg-rose-50',
    primaryText: 'text-rose-600', primaryBorder: 'border-rose-300', primaryRing: 'ring-rose-500',
    heroGlow1: 'bg-rose-600/15', heroGlow2: 'bg-indigo-600/15', heroBg: 'bg-slate-950',
    cardHover: 'hover:border-rose-200', iconBg: 'bg-rose-100', iconColor: 'text-rose-500',
    planBorder: 'border-rose-300', planRing: 'ring-rose-500',
    heroGradient: 'from-rose-600 via-pink-600 to-fuchsia-600',
    sectionBg: 'bg-rose-50/50',
  },
  indigo: {
    primary: 'bg-indigo-500', primaryHover: 'hover:bg-indigo-600', primaryLight: 'bg-indigo-50',
    primaryText: 'text-indigo-600', primaryBorder: 'border-indigo-300', primaryRing: 'ring-indigo-500',
    heroGlow1: 'bg-indigo-600/15', heroGlow2: 'bg-purple-600/15', heroBg: 'bg-gray-950',
    cardHover: 'hover:border-indigo-200', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-500',
    planBorder: 'border-indigo-300', planRing: 'ring-indigo-500',
    heroGradient: 'from-indigo-600 via-blue-600 to-violet-600',
    sectionBg: 'bg-indigo-50/50',
  },
  emerald: {
    primary: 'bg-emerald-500', primaryHover: 'hover:bg-emerald-600', primaryLight: 'bg-emerald-50',
    primaryText: 'text-emerald-600', primaryBorder: 'border-emerald-300', primaryRing: 'ring-emerald-500',
    heroGlow1: 'bg-emerald-600/15', heroGlow2: 'bg-teal-600/15', heroBg: 'bg-slate-950',
    cardHover: 'hover:border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-500',
    planBorder: 'border-emerald-300', planRing: 'ring-emerald-500',
    heroGradient: 'from-emerald-600 via-green-600 to-teal-600',
    sectionBg: 'bg-emerald-50/50',
  },
  amber: {
    primary: 'bg-amber-500', primaryHover: 'hover:bg-amber-600', primaryLight: 'bg-amber-50',
    primaryText: 'text-amber-600', primaryBorder: 'border-amber-300', primaryRing: 'ring-amber-500',
    heroGlow1: 'bg-amber-500/15', heroGlow2: 'bg-orange-600/15', heroBg: 'bg-stone-950',
    cardHover: 'hover:border-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-500',
    planBorder: 'border-amber-300', planRing: 'ring-amber-500',
    heroGradient: 'from-amber-500 via-orange-500 to-yellow-500',
    sectionBg: 'bg-amber-50/50',
  },
  sky: {
    primary: 'bg-sky-500', primaryHover: 'hover:bg-sky-600', primaryLight: 'bg-sky-50',
    primaryText: 'text-sky-600', primaryBorder: 'border-sky-300', primaryRing: 'ring-sky-500',
    heroGlow1: 'bg-sky-600/15', heroGlow2: 'bg-blue-600/15', heroBg: 'bg-slate-950',
    cardHover: 'hover:border-sky-200', iconBg: 'bg-sky-100', iconColor: 'text-sky-500',
    planBorder: 'border-sky-300', planRing: 'ring-sky-500',
    heroGradient: 'from-sky-500 via-blue-500 to-cyan-500',
    sectionBg: 'bg-sky-50/50',
  },
  violet: {
    primary: 'bg-violet-500', primaryHover: 'hover:bg-violet-600', primaryLight: 'bg-violet-50',
    primaryText: 'text-violet-600', primaryBorder: 'border-violet-300', primaryRing: 'ring-violet-500',
    heroGlow1: 'bg-violet-600/15', heroGlow2: 'bg-fuchsia-600/15', heroBg: 'bg-gray-950',
    cardHover: 'hover:border-violet-200', iconBg: 'bg-violet-100', iconColor: 'text-violet-500',
    planBorder: 'border-violet-300', planRing: 'ring-violet-500',
    heroGradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
    sectionBg: 'bg-violet-50/50',
  },
  teal: {
    primary: 'bg-teal-500', primaryHover: 'hover:bg-teal-600', primaryLight: 'bg-teal-50',
    primaryText: 'text-teal-600', primaryBorder: 'border-teal-300', primaryRing: 'ring-teal-500',
    heroGlow1: 'bg-teal-600/15', heroGlow2: 'bg-cyan-600/15', heroBg: 'bg-slate-950',
    cardHover: 'hover:border-teal-200', iconBg: 'bg-teal-100', iconColor: 'text-teal-500',
    planBorder: 'border-teal-300', planRing: 'ring-teal-500',
    heroGradient: 'from-teal-500 via-emerald-500 to-cyan-500',
    sectionBg: 'bg-teal-50/50',
  },
  orange: {
    primary: 'bg-orange-500', primaryHover: 'hover:bg-orange-600', primaryLight: 'bg-orange-50',
    primaryText: 'text-orange-600', primaryBorder: 'border-orange-300', primaryRing: 'ring-orange-500',
    heroGlow1: 'bg-orange-500/15', heroGlow2: 'bg-red-600/15', heroBg: 'bg-stone-950',
    cardHover: 'hover:border-orange-200', iconBg: 'bg-orange-100', iconColor: 'text-orange-500',
    planBorder: 'border-orange-300', planRing: 'ring-orange-500',
    heroGradient: 'from-orange-500 via-red-500 to-amber-500',
    sectionBg: 'bg-orange-50/50',
  },
  fuchsia: {
    primary: 'bg-fuchsia-500', primaryHover: 'hover:bg-fuchsia-600', primaryLight: 'bg-fuchsia-50',
    primaryText: 'text-fuchsia-600', primaryBorder: 'border-fuchsia-300', primaryRing: 'ring-fuchsia-500',
    heroGlow1: 'bg-fuchsia-600/15', heroGlow2: 'bg-pink-600/15', heroBg: 'bg-gray-950',
    cardHover: 'hover:border-fuchsia-200', iconBg: 'bg-fuchsia-100', iconColor: 'text-fuchsia-500',
    planBorder: 'border-fuchsia-300', planRing: 'ring-fuchsia-500',
    heroGradient: 'from-fuchsia-600 via-pink-600 to-rose-600',
    sectionBg: 'bg-fuchsia-50/50',
  },
  cyan: {
    primary: 'bg-cyan-500', primaryHover: 'hover:bg-cyan-600', primaryLight: 'bg-cyan-50',
    primaryText: 'text-cyan-600', primaryBorder: 'border-cyan-300', primaryRing: 'ring-cyan-500',
    heroGlow1: 'bg-cyan-600/15', heroGlow2: 'bg-blue-600/15', heroBg: 'bg-slate-950',
    cardHover: 'hover:border-cyan-200', iconBg: 'bg-cyan-100', iconColor: 'text-cyan-500',
    planBorder: 'border-cyan-300', planRing: 'ring-cyan-500',
    heroGradient: 'from-cyan-500 via-blue-500 to-teal-500',
    sectionBg: 'bg-cyan-50/50',
  },
};

// ── Vertical → Theme mapping ────────────────────────────────────────
const VERTICAL_THEME: Record<string, ThemeKey> = {
  nail: 'rose', hair: 'indigo', dental: 'sky', esthetic: 'violet',
  cleaning: 'emerald', handyman: 'amber', pet: 'orange',
};

export function getTheme(vertical: string): ThemeColors {
  const key = VERTICAL_THEME[vertical];
  if (key) return THEMES[key];
  const keys = Object.keys(THEMES) as ThemeKey[];
  let hash = 0;
  for (let i = 0; i < vertical.length; i++) hash = ((hash << 5) - hash + vertical.charCodeAt(i)) | 0;
  return THEMES[keys[Math.abs(hash) % keys.length]];
}

// ── Content types ───────────────────────────────────────────────────
export interface VerticalLPConfig {
  label: string;
  badge: string;
  headline: string;
  subheadline: string;
  problems: { icon: string; title: string; desc: string }[];
  features: { icon: string; title: string; desc: string }[];
  flow: { step: string; title: string; desc: string }[];
  faqs: { q: string; a: string }[];
  metaTitle: string;
  metaDesc: string;
}

export interface DesignProps {
  d: VerticalLPConfig;
  t: ThemeColors;
  vertical: string;
  signupUrl: string;
}

// ── Shared constants ────────────────────────────────────────────────
export const SIGNUP_HREF = '/signup';

export const PLANS = [
  {
    name: 'Starter', price: '¥3,980', period: '/月（税込）',
    description: '個人・開業サロンに',
    features: ['LINEで予約受付', '前日自動リマインド', 'スタッフ 2名まで', 'メニュー 10件まで', '予約台帳', 'メールサポート'],
    highlighted: false, badge: null as string | null, cta: '新規登録（30秒）', href: null as string | null,
  },
  {
    name: 'Pro', price: '¥9,800', period: '/月（税込）',
    description: '成長中のサロンに',
    features: ['Starter のすべて', 'スタッフ・メニュー無制限', '事前アンケート', 'リピート促進配信', 'AI 接客（自動返信）', '優先サポート'],
    highlighted: true, badge: 'いちばん人気', cta: '新規登録（30秒）', href: null as string | null,
  },
  {
    name: 'Enterprise', price: 'ご相談', period: '',
    description: '複数店舗・法人向け',
    features: ['Pro のすべて', '複数店舗一括管理', '専任サポート担当', 'カスタム機能対応', '請求書払い対応', 'SLA保証'],
    highlighted: false, badge: null, cta: 'お問い合わせ', href: '/contact/enterprise',
  },
];

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: CalendarDays, message: MessageCircle, bell: Bell, shield: Shield,
  chart: BarChart3, users: Users, phone: SmartphoneNfc, clock: Clock,
  sparkles: Sparkles, heart: HeartPulse,
};

export function getIcon(name: string) {
  return ICON_MAP[name] ?? ClipboardList;
}

// ── Design registry type ────────────────────────────────────────────
export type DesignKey =
  | 'dark-hero'
  | 'split-hero'
  | 'minimal'
  | 'storytelling'
  | 'card-showcase'
  | 'comparison'
  | 'testimonial'
  | 'gradient-wave'
  | 'magazine'
  | 'bold-typography';

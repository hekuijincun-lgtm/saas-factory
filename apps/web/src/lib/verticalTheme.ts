/**
 * Vertical Theme Colors — single source of truth for per-vertical Tailwind classes.
 *
 * Used across LP, admin, signup, and booking.
 * When adding a new vertical, add an entry here.
 *
 * ⚠️ All class names must appear as full static strings (no template interpolation)
 *    so Tailwind JIT can detect them.
 */

export interface VerticalThemeTokens {
  /** Main accent (e.g. bg-orange-500) */
  primary: string;
  /** Hover variant (e.g. hover:bg-orange-600) */
  primaryHover: string;
  /** Light background (e.g. bg-orange-50) */
  light: string;
  /** Text color (e.g. text-orange-600) */
  text: string;
  /** Subtle text (e.g. text-orange-500) */
  textSubtle: string;
  /** Border (e.g. border-orange-200) */
  border: string;
  /** Strong border (e.g. border-orange-300) */
  borderStrong: string;
  /** Focus ring (e.g. focus:ring-orange-100) */
  focusRing: string;
  /** Sidebar active bg (e.g. bg-orange-600) */
  sidebarActive: string;
  /** Sidebar active shadow (e.g. shadow-orange-900/30) */
  sidebarShadow: string;
  /** Sidebar inactive text (e.g. text-orange-400) */
  sidebarText: string;
  /** Sidebar inactive hover text (e.g. hover:text-orange-200) */
  sidebarHover: string;
  /** LP ThemeKey mapping */
  lpThemeKey: string;
}

const rose: VerticalThemeTokens = {
  primary: 'bg-rose-500', primaryHover: 'hover:bg-rose-600',
  light: 'bg-rose-50', text: 'text-rose-600', textSubtle: 'text-rose-500',
  border: 'border-rose-200', borderStrong: 'border-rose-300',
  focusRing: 'focus:ring-rose-100',
  sidebarActive: 'bg-rose-600', sidebarShadow: 'shadow-rose-900/30',
  sidebarText: 'text-rose-400', sidebarHover: 'hover:text-rose-200',
  lpThemeKey: 'rose',
};

const pink: VerticalThemeTokens = {
  primary: 'bg-pink-500', primaryHover: 'hover:bg-pink-600',
  light: 'bg-pink-50', text: 'text-pink-600', textSubtle: 'text-pink-500',
  border: 'border-pink-200', borderStrong: 'border-pink-300',
  focusRing: 'focus:ring-pink-100',
  sidebarActive: 'bg-pink-600', sidebarShadow: 'shadow-pink-900/30',
  sidebarText: 'text-pink-400', sidebarHover: 'hover:text-pink-200',
  lpThemeKey: 'rose',
};

const violet: VerticalThemeTokens = {
  primary: 'bg-violet-500', primaryHover: 'hover:bg-violet-600',
  light: 'bg-violet-50', text: 'text-violet-600', textSubtle: 'text-violet-500',
  border: 'border-violet-200', borderStrong: 'border-violet-300',
  focusRing: 'focus:ring-violet-100',
  sidebarActive: 'bg-violet-600', sidebarShadow: 'shadow-violet-900/30',
  sidebarText: 'text-violet-400', sidebarHover: 'hover:text-violet-200',
  lpThemeKey: 'indigo',
};

const sky: VerticalThemeTokens = {
  primary: 'bg-sky-500', primaryHover: 'hover:bg-sky-600',
  light: 'bg-sky-50', text: 'text-sky-600', textSubtle: 'text-sky-500',
  border: 'border-sky-200', borderStrong: 'border-sky-300',
  focusRing: 'focus:ring-sky-100',
  sidebarActive: 'bg-sky-600', sidebarShadow: 'shadow-sky-900/30',
  sidebarText: 'text-sky-400', sidebarHover: 'hover:text-sky-200',
  lpThemeKey: 'sky',
};

const purple: VerticalThemeTokens = {
  primary: 'bg-purple-500', primaryHover: 'hover:bg-purple-600',
  light: 'bg-purple-50', text: 'text-purple-600', textSubtle: 'text-purple-500',
  border: 'border-purple-200', borderStrong: 'border-purple-300',
  focusRing: 'focus:ring-purple-100',
  sidebarActive: 'bg-purple-600', sidebarShadow: 'shadow-purple-900/30',
  sidebarText: 'text-purple-400', sidebarHover: 'hover:text-purple-200',
  lpThemeKey: 'violet',
};

const emerald: VerticalThemeTokens = {
  primary: 'bg-emerald-500', primaryHover: 'hover:bg-emerald-600',
  light: 'bg-emerald-50', text: 'text-emerald-600', textSubtle: 'text-emerald-500',
  border: 'border-emerald-200', borderStrong: 'border-emerald-300',
  focusRing: 'focus:ring-emerald-100',
  sidebarActive: 'bg-emerald-600', sidebarShadow: 'shadow-emerald-900/30',
  sidebarText: 'text-emerald-400', sidebarHover: 'hover:text-emerald-200',
  lpThemeKey: 'emerald',
};

const amber: VerticalThemeTokens = {
  primary: 'bg-amber-500', primaryHover: 'hover:bg-amber-600',
  light: 'bg-amber-50', text: 'text-amber-600', textSubtle: 'text-amber-500',
  border: 'border-amber-200', borderStrong: 'border-amber-300',
  focusRing: 'focus:ring-amber-100',
  sidebarActive: 'bg-amber-600', sidebarShadow: 'shadow-amber-900/30',
  sidebarText: 'text-amber-400', sidebarHover: 'hover:text-amber-200',
  lpThemeKey: 'amber',
};

const orange: VerticalThemeTokens = {
  primary: 'bg-orange-500', primaryHover: 'hover:bg-orange-600',
  light: 'bg-orange-50', text: 'text-orange-600', textSubtle: 'text-orange-500',
  border: 'border-orange-200', borderStrong: 'border-orange-300',
  focusRing: 'focus:ring-orange-100',
  sidebarActive: 'bg-orange-600', sidebarShadow: 'shadow-orange-900/30',
  sidebarText: 'text-orange-400', sidebarHover: 'hover:text-orange-200',
  lpThemeKey: 'orange',
};

const teal: VerticalThemeTokens = {
  primary: 'bg-teal-500', primaryHover: 'hover:bg-teal-600',
  light: 'bg-teal-50', text: 'text-teal-600', textSubtle: 'text-teal-500',
  border: 'border-teal-200', borderStrong: 'border-teal-300',
  focusRing: 'focus:ring-teal-100',
  sidebarActive: 'bg-teal-600', sidebarShadow: 'shadow-teal-900/30',
  sidebarText: 'text-teal-400', sidebarHover: 'hover:text-teal-200',
  lpThemeKey: 'teal',
};

const blue: VerticalThemeTokens = {
  primary: 'bg-blue-500', primaryHover: 'hover:bg-blue-600',
  light: 'bg-blue-50', text: 'text-blue-600', textSubtle: 'text-blue-500',
  border: 'border-blue-200', borderStrong: 'border-blue-300',
  focusRing: 'focus:ring-blue-100',
  sidebarActive: 'bg-blue-600', sidebarShadow: 'shadow-blue-900/30',
  sidebarText: 'text-blue-400', sidebarHover: 'hover:text-blue-200',
  lpThemeKey: 'indigo',
};

const indigoTheme: VerticalThemeTokens = {
  primary: 'bg-indigo-500', primaryHover: 'hover:bg-indigo-600',
  light: 'bg-indigo-50', text: 'text-indigo-600', textSubtle: 'text-indigo-500',
  border: 'border-indigo-200', borderStrong: 'border-indigo-300',
  focusRing: 'focus:ring-indigo-100',
  sidebarActive: 'bg-indigo-600', sidebarShadow: 'shadow-indigo-900/30',
  sidebarText: 'text-indigo-400', sidebarHover: 'hover:text-indigo-200',
  lpThemeKey: 'indigo',
};

const red: VerticalThemeTokens = {
  primary: 'bg-red-500', primaryHover: 'hover:bg-red-600',
  light: 'bg-red-50', text: 'text-red-600', textSubtle: 'text-red-500',
  border: 'border-red-200', borderStrong: 'border-red-300',
  focusRing: 'focus:ring-red-100',
  sidebarActive: 'bg-red-600', sidebarShadow: 'shadow-red-900/30',
  sidebarText: 'text-red-400', sidebarHover: 'hover:text-red-200',
  lpThemeKey: 'rose',
};

const yellow: VerticalThemeTokens = {
  primary: 'bg-yellow-500', primaryHover: 'hover:bg-yellow-600',
  light: 'bg-yellow-50', text: 'text-yellow-600', textSubtle: 'text-yellow-500',
  border: 'border-yellow-200', borderStrong: 'border-yellow-300',
  focusRing: 'focus:ring-yellow-100',
  sidebarActive: 'bg-yellow-600', sidebarShadow: 'shadow-yellow-900/30',
  sidebarText: 'text-yellow-400', sidebarHover: 'hover:text-yellow-200',
  lpThemeKey: 'amber',
};

const slate: VerticalThemeTokens = {
  primary: 'bg-slate-500', primaryHover: 'hover:bg-slate-600',
  light: 'bg-slate-50', text: 'text-slate-600', textSubtle: 'text-slate-500',
  border: 'border-slate-200', borderStrong: 'border-slate-300',
  focusRing: 'focus:ring-slate-100',
  sidebarActive: 'bg-indigo-600', sidebarShadow: 'shadow-indigo-900/30',
  sidebarText: 'text-gray-400', sidebarHover: 'hover:text-white',
  lpThemeKey: 'indigo',
};

/**
 * Hex color values for CSS custom properties (booking page).
 * Keys match the variable names: primary, primaryHover, header.
 */
export interface VerticalHexColors {
  primary: string;
  primaryHover: string;
  header: string;
}

export const VERTICAL_HEX: Record<string, VerticalHexColors> = {
  eyebrow:  { primary: '#f43f5e', primaryHover: '#e11d48', header: '#9f1239' },
  nail:     { primary: '#ec4899', primaryHover: '#db2777', header: '#9d174d' },
  hair:     { primary: '#8b5cf6', primaryHover: '#7c3aed', header: '#5b21b6' },
  dental:   { primary: '#0ea5e9', primaryHover: '#0284c7', header: '#075985' },
  esthetic: { primary: '#a855f7', primaryHover: '#9333ea', header: '#6b21a8' },
  cleaning: { primary: '#10b981', primaryHover: '#059669', header: '#065f46' },
  handyman: { primary: '#f59e0b', primaryHover: '#d97706', header: '#92400e' },
  pet:      { primary: '#f97316', primaryHover: '#ea580c', header: '#9a3412' },
  seitai:   { primary: '#14b8a6', primaryHover: '#0d9488', header: '#115e59' },
  gym:      { primary: '#3b82f6', primaryHover: '#2563eb', header: '#1e40af' },
  school:   { primary: '#6366f1', primaryHover: '#4f46e5', header: '#3730a3' },
  shop:     { primary: '#ef4444', primaryHover: '#dc2626', header: '#991b1b' },
  food:     { primary: '#eab308', primaryHover: '#ca8a04', header: '#854d0e' },
  handmade: { primary: '#ec4899', primaryHover: '#db2777', header: '#9d174d' },
  generic:  { primary: '#2563eb', primaryHover: '#1d4ed8', header: '#475569' },
};

export function getVerticalHex(vertical: string | undefined | null): VerticalHexColors {
  if (!vertical) return VERTICAL_HEX.generic;
  return VERTICAL_HEX[vertical] ?? VERTICAL_HEX.generic;
}

/** Vertical → Theme tokens mapping */
export const VERTICAL_THEMES: Record<string, VerticalThemeTokens> = {
  eyebrow:  rose,
  nail:     pink,
  hair:     violet,
  dental:   sky,
  esthetic: purple,
  cleaning: emerald,
  handyman: amber,
  pet:      orange,
  seitai:   teal,
  gym:      blue,
  school:   indigoTheme,
  shop:     red,
  food:     yellow,
  handmade: pink,
  generic:  slate,
};

/**
 * Get theme tokens for a vertical. Falls back to generic (slate).
 */
export function getVerticalTheme(vertical: string | undefined | null): VerticalThemeTokens {
  if (!vertical) return slate;
  return VERTICAL_THEMES[vertical] ?? slate;
}

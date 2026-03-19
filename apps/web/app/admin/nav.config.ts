// ナビゲーション構成
// AdminShell.tsx でアイコンを付与し、テナントの vertical に応じてフィルタリングして描画する

export interface NavItem {
  label: string;
  href: string;
  /** Show only for these verticals. undefined = show for all */
  verticals?: string[];
  /** Hide for these verticals */
  hideFor?: string[];
}

export const adminNavItems: NavItem[] = [
  { label: "ダッシュボード", href: "/admin" },
  { label: "メニュー管理",   href: "/admin/menu",          hideFor: ["pet"] },
  { label: "スタッフ管理",   href: "/admin/staff" },
  { label: "予約管理",       href: "/admin/reservations" },
  { label: "顧客管理",       href: "/admin/customers" },
  { label: "AI接客設定",     href: "/admin/ai",            hideFor: ["pet"] },
  { label: "LINE Core",      href: "/admin/line-core" },
  { label: "請求管理",       href: "/admin/billing" },
  // ── ペットサロン専用 ──
  { label: "ペットサロン",   href: "/admin/pet",           verticals: ["pet"] },
  { label: "ペットカルテ",   href: "/admin/pet/profiles",  verticals: ["pet"] },
  { label: "ワクチン管理",   href: "/admin/pet/vaccines",  verticals: ["pet"] },
  { label: "料金設定",       href: "/admin/pet/pricing",   verticals: ["pet"] },
  { label: "AI応答設定",     href: "/admin/pet/ai-config", verticals: ["pet"] },
  // ── 共通 ──
  { label: "サポート",       href: "/admin/support" },
  { label: "管理者設定",     href: "/admin/settings" },
];

/**
 * Filter nav items based on tenant's vertical.
 * - Items with `verticals` array: only show if vertical matches
 * - Items with `hideFor` array: hide if vertical matches
 * - Items with neither: always show
 */
export function filterNavItems(items: NavItem[], vertical: string | undefined): NavItem[] {
  const v = vertical || 'generic';
  return items.filter(item => {
    if (item.verticals && !item.verticals.includes(v)) return false;
    if (item.hideFor && item.hideFor.includes(v)) return false;
    return true;
  });
}

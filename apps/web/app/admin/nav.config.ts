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
  { label: "ダッシュボード", href: "/admin",               hideFor: ["pet"] },
  { label: "メニュー管理",   href: "/admin/menu",          hideFor: ["pet"] },
  { label: "スタッフ管理",   href: "/admin/staff",         hideFor: ["pet"] },
  { label: "予約管理",       href: "/admin/reservations",  hideFor: ["pet"] },
  { label: "顧客管理",       href: "/admin/customers",     hideFor: ["pet"] },
  { label: "AI接客設定",     href: "/admin/ai",            hideFor: ["pet"] },
  { label: "LINE Core",      href: "/admin/line-core",     hideFor: ["pet"] },
  { label: "請求管理",       href: "/admin/billing",       hideFor: ["pet"] },
  // ── ペットサロン専用 ──
  { label: "ダッシュボード", href: "/admin/pet",           verticals: ["pet"] },
  { label: "予約管理",       href: "/admin/pet/reservations", verticals: ["pet"] },
  { label: "ペットカルテ",   href: "/admin/pet/profiles",  verticals: ["pet"] },
  { label: "ワクチン管理",   href: "/admin/pet/vaccines",  verticals: ["pet"] },
  { label: "スタッフ管理",   href: "/admin/pet/staff",     verticals: ["pet"] },
  { label: "メニュー管理",   href: "/admin/pet/pricing",   verticals: ["pet"] },
  { label: "AI応答設定",     href: "/admin/pet/ai-config", verticals: ["pet"] },
  { label: "管理者設定",     href: "/admin/pet/settings",  verticals: ["pet"] },
  // ── 業務特化機能（specialFeatures ベースで表示制御） ──
  { label: "施術メモ",       href: "/admin/visit-summary",   verticals: ["eyebrow", "nail", "hair"] },
  { label: "カラーレシピ",   href: "/admin/color-formula",   verticals: ["nail", "hair"] },
  { label: "アレルギー記録", href: "/admin/allergy-record",  verticals: ["dental", "esthetic"] },
  { label: "ビフォーアフター", href: "/admin/before-after",  verticals: ["eyebrow", "nail", "hair", "esthetic", "cleaning", "handyman", "pet"] },
  { label: "ワクチン記録",   href: "/admin/vaccine-record",  verticals: ["pet"] },
  { label: "機器チェック",   href: "/admin/equipment-check", verticals: ["cleaning", "handyman"] },
  // ── 共通 ──
  { label: "サポート",       href: "/admin/support" },
  { label: "管理者設定",     href: "/admin/settings",      hideFor: ["pet"] },
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

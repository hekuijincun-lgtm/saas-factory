// ナビゲーション構成
// AdminShell.tsx でアイコンを付与して描画する

export const adminNavItems = [
  { label: "ダッシュボード", href: "/admin" },
  { label: "メニュー管理",   href: "/admin/menu" },
  { label: "スタッフ管理",   href: "/admin/staff" },
  { label: "予約管理",       href: "/admin/reservations" },
  { label: "顧客管理",       href: "/admin/customers" },
  { label: "AI接客設定",     href: "/admin/ai" },
  { label: "管理者設定",     href: "/admin/settings" },
] as const;

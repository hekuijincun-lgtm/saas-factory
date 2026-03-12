// ナビゲーション構成
// AdminShell.tsx でアイコンを付与して描画する

export const adminNavItems = [
  { label: "ダッシュボード", href: "/admin" },
  { label: "メニュー管理",   href: "/admin/menu" },
  { label: "スタッフ管理",   href: "/admin/staff" },
  { label: "予約管理",       href: "/admin/reservations" },
  { label: "顧客管理",       href: "/admin/customers" },
  { label: "AI接客設定",     href: "/admin/ai" },
  { label: "請求管理",       href: "/admin/billing" },
  { label: "営業リード",     href: "/admin/outreach/leads" },
  { label: "レビューキュー", href: "/admin/outreach/review" },
  { label: "CRM",           href: "/admin/outreach/crm" },
  { label: "営業分析",       href: "/admin/outreach/analytics" },
  { label: "ソース検索",     href: "/admin/outreach/sources" },
  { label: "CSVインポート",  href: "/admin/outreach/import" },
  { label: "キャンペーン",   href: "/admin/outreach/campaigns" },
  { label: "配信設定",       href: "/admin/outreach/settings" },
  // temporarily hidden — re-enable when admin management is needed
  // { label: "管理者管理",     href: "/admin/admins" },
  // { label: "セキュリティ",   href: "/admin/security" },
  { label: "サポート",       href: "/admin/support" },
  { label: "管理者設定",     href: "/admin/settings" },
] as const;

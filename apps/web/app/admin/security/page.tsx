// temporarily hidden — security settings page is suspended
// Original component: BootstrapKeyManager via SecurityPage
// To restore: uncomment nav.config.ts entries and revert this file

import { redirect } from 'next/navigation';

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { tenantId } = await searchParams;
  redirect(tenantId ? `/admin?tenantId=${encodeURIComponent(tenantId)}` : '/admin');
}

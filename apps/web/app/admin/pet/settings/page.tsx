'use client';

import AdminTopBar from '../../../_components/ui/AdminTopBar';
import AdminSettingsClient from '../../settings/AdminSettingsClient';

export default function PetSettingsPage() {
  return (
    <>
      <AdminTopBar title="管理者設定" subtitle="店舗情報・営業時間・予約設定を管理します。" />
      <AdminSettingsClient />
    </>
  );
}

import dynamic from "next/dynamic";
import { Suspense } from "react";

// /app/admin/settings/AdminSettingsClient.tsx（client component）を動的インポート
const AdminSettingsClient = dynamic(
  () => import("./AdminSettingsClient"),
  { ssr: false }
);

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-gray-500">
          Loading settings...
        </div>
      }
    >
      <AdminSettingsClient />
    </Suspense>
  );
}

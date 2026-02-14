"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// /app/admin/settings/AdminSettingsClient.tsx（client component）を動的インポート
const AdminSettingsClient = dynamic(() => import("./AdminSettingsClient"), { ssr: false });

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const line = searchParams.get("line");
    if (!line) return;

    const reason =
      line === "error_secret" ? "secret" :
      line === "error_missing" ? "missing_env" :
      line === "ok" ? "ok" :
      "unknown";

    router.replace(`/admin/line-setup?reason=${encodeURIComponent(reason)}`);
  }, [searchParams, router]);

  return <AdminSettingsClient />;
}

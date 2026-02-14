import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

const AdminSettingsClient = dynamic(() => import("./AdminSettingsClient"), { ssr: false });

export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const lineRaw = searchParams?.line;
  const line = Array.isArray(lineRaw) ? lineRaw[0] : lineRaw;

  if (line) {
    const reason =
      line === "error_secret" ? "secret" :
      line === "error_missing" ? "missing_env" :
      line === "ok" ? "ok" :
      "unknown";

    redirect(`/admin/line-setup?reason=${encodeURIComponent(reason)}`);
  }

  return <AdminSettingsClient />;
}

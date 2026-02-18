import type { ReactNode } from "react";

const CF_COMMIT = (process.env.CF_PAGES_COMMIT_SHA || "local").slice(0, 7);
const CF_DEPLOY = process.env.CF_PAGES_DEPLOYMENT_ID || "local";
const CF_TS = process.env.CF_PAGES_DEPLOYMENT_TIMESTAMP || "local";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 /* ADMIN_LAYOUT_STAMP_20260216_121212 */ flex items-start justify-center p-6">
      <div className="w-full max-w-5xl">
        {children}
      </div>
    </div>
  );
}




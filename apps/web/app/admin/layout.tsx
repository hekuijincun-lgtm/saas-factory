import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 /* ADMIN_LAYOUT_STAMP_20260216_121212 */ flex items-start justify-center p-6">
      <div className="w-full max-w-5xl">
        {children}
      </div>
    </div>
  );
}



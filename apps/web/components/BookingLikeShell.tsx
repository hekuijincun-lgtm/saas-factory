import React from "react";

type Props = {
  label?: string; // e.g. "ADMIN" / "HAIR SALON"
  title: string;
  children: React.ReactNode;
};

export function BookingLikeShell({ label = "ADMIN", title, children }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="bg-slate-700 px-10 py-8">
          <div className="text-[13px] tracking-[0.16em] font-semibold text-slate-200">
            {label}
          </div>
          <div className="mt-2 text-3xl font-bold text-white">
            {title}
          </div>
        </div>

        <div className="px-10 py-10">
          {children}
        </div>
      </div>
    </div>
  );
}

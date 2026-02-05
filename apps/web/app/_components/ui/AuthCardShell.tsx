"use client";

import React from "react";

export function AuthCardShell(props: {
  badge?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { badge, title, subtitle, children } = props;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-3xl overflow-hidden bg-white shadow-sm border border-gray-200">
        {/* header bar */}
        <div className="bg-slate-600 px-10 py-8">
          <div className="text-white/80 text-xs tracking-widest">SaaS FACTORY</div>
          <h1 className="text-white text-2xl font-semibold mt-1">{title}</h1>
          {subtitle ? <p className="text-white/80 text-sm mt-2">{subtitle}</p> : null}
        </div>

        {/* body */}
        <div className="px-10 py-10">
          {badge ? (
            <div className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 mb-6">
              {badge}
            </div>
          ) : null}

          {children}
        </div>
      </section>
    </main>
  );
}

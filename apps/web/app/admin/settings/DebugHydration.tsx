"use client";

import { useEffect } from "react";

export default function DebugHydration({ name }: { name: string }) {
  useEffect(() => {
    // これが出たコンポーネントは CSR 側で確実にマウントしている
    console.log("[HYDRATE-MOUNT]", name, {
      href: window.location.href,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: new Date().toISOString(),
      ua: navigator.userAgent,
    });
  }, [name]);

  return null;
}


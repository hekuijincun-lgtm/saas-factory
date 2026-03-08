export const runtime = "edge";

import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenantId?: string;
    returnTo?: string;
    reason?: string;
    debug?: string;
  }>;
}) {
  const params = await searchParams;

  // open-redirect guard: returnTo must be a relative path
  const rawReturnTo = params.returnTo ?? "/admin";
  let returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/admin";

  // Resolve tenantId: direct param first, then extract from returnTo as fallback
  let tenantId = params.tenantId ?? "";
  if (!tenantId && returnTo.includes("tenantId=")) {
    try {
      const rtUrl = new URL(returnTo, "http://localhost");
      tenantId = rtUrl.searchParams.get("tenantId") ?? "";
    } catch { /* malformed returnTo — tenantId stays empty */ }
  }
  if (!tenantId) tenantId = "default";

  // Ensure tenantId is embedded in returnTo so the auth callback
  // can redirect to the correct tenant after login.
  if (tenantId !== "default" && !returnTo.includes("tenantId=")) {
    const sep = returnTo.includes("?") ? "&" : "?";
    returnTo = `${returnTo}${sep}tenantId=${encodeURIComponent(tenantId)}`;
  }
  const reason = params.reason ?? null;
  const isDebug = params.debug === "1";

  return (
    <LoginForm
      tenantId={tenantId}
      returnTo={returnTo}
      reason={reason}
      isDebug={isDebug}
    />
  );
}

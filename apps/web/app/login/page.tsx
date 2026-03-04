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

  const tenantId = params.tenantId ?? "default";
  // open-redirect guard: returnTo must be a relative path
  const rawReturnTo = params.returnTo ?? "/admin";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/admin";
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

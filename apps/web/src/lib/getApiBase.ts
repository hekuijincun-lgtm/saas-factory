export function getApiBase() {
  const base =
    process.env.API_BASE ||
    process.env.WORKER_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE;

  if (!base) throw new Error("API_BASE is not defined");
  return base.replace(/\/$/, "");
}

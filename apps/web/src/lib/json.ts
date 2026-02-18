export async function readJson<T = unknown>(res: Response): Promise<T> {
  // fetchが204とか空ボディ返すことあるのでガード
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {} as T;
  return (await res.json()) as T;
}

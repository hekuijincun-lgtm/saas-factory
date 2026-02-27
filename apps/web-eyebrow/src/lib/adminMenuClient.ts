/**
 * 眉毛サロン予約アプリ — 管理画面メニューAPIクライアント
 * /api/proxy/admin/menu → API_BASE/admin/menu (X-Admin-Token はプロキシが注入)
 * 失敗・0件 → [] を返して呼び元でプリセットにフォールバック
 */

export interface EyebrowMenuView {
  id: string;
  name: string;
  description?: string;
  priceYen: number;
  durationMin: number;
  tags?: string[];
}

type RawItem = Record<string, unknown>;

function toView(x: RawItem): EyebrowMenuView {
  const desc =
    (typeof x.description === "string" && x.description) ||
    (typeof x.detail === "string" && x.detail) ||
    undefined;
  return {
    id: String(x.id ?? ""),
    name: String(x.name ?? ""),
    description: desc,
    priceYen:
      Number(x.price) || Number(x.priceYen) || Number(x.amount) || 0,
    durationMin:
      Number(x.durationMin) || Number(x.duration) || 45,
    tags: undefined,
  };
}

export async function fetchAdminMenu(
  tenantId: string
): Promise<EyebrowMenuView[]> {
  try {
    const url = `/api/proxy/admin/menu?tenantId=${encodeURIComponent(tenantId)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    // 200以外（401/404/500等）はすべて失敗→フォールバック
    if (!res.ok) return [];

    const raw: unknown = await res.json();

    let list: RawItem[] = [];
    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      // {ok:true, data:[...]} 形式
      if (Array.isArray(obj.data)) {
        list = obj.data as RawItem[];
      } else if (Array.isArray(obj.data)) {
        list = obj.data as RawItem[];
      }
    }
    if (Array.isArray(raw)) {
      list = raw as RawItem[];
    }

    if (list.length === 0) return [];

    return list
      .filter((x) => x.active !== false)
      .sort((a, b) => {
        const ao = Number(a.sortOrder) || 0;
        const bo = Number(b.sortOrder) || 0;
        return ao !== bo
          ? ao - bo
          : String(a.name).localeCompare(String(b.name), "ja");
      })
      .map(toView);
  } catch {
    return [];
  }
}

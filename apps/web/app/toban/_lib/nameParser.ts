/**
 * 名前分割ロジック
 * 登録済みメンバー名簿との最長一致でルールベース分割
 */

/**
 * 最長一致で名前を分割する
 * 例: "大成駒谷今村" + members=["大成","駒谷","今村"] → ["大成","駒谷","今村"]
 * マッチしない残りは unmatched として返す
 */
export function splitNames(
  text: string,
  members: string[]
): { matched: string[]; unmatched: string } {
  if (!text.trim()) return { matched: [], unmatched: "" };

  // 長い名前から先にマッチさせる（最長一致）
  const sorted = [...members].filter(Boolean).sort((a, b) => b.length - a.length);
  const result: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    let found = false;
    for (const name of sorted) {
      if (remaining.startsWith(name)) {
        result.push(name);
        remaining = remaining.slice(name.length);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return { matched: result, unmatched: remaining };
}

/**
 * 自然言語入力を解析する（ルールベース部分）
 * 例: "9/21与野南担当大成駒谷今村"
 * → { date: "9/21", place: "与野南", membersText: "大成駒谷今村" }
 */
export function parseNaturalInput(line: string): {
  date: string;
  place: string;
  membersText: string;
  raw: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 日付パターン: M/D or MM/DD (先頭)
  const dateMatch = trimmed.match(/^(\d{1,2}\/\d{1,2})/);
  if (!dateMatch) {
    return { date: "", place: "", membersText: trimmed, raw: trimmed };
  }

  const date = dateMatch[1];
  let rest = trimmed.slice(date.length);

  // 「担当」をデリミタとして使う
  const tantoIdx = rest.indexOf("担当");
  let place = "";
  let membersText = "";

  if (tantoIdx >= 0) {
    place = rest.slice(0, tantoIdx).trim();
    membersText = rest.slice(tantoIdx + 2).trim();
  } else {
    // 「担当」がない場合: 場所と名前が連結している可能性
    // スペース区切りを試す
    const parts = rest.trim().split(/\s+/);
    if (parts.length >= 2) {
      place = parts[0];
      membersText = parts.slice(1).join("");
    } else {
      // 全部残りとして返す
      place = "";
      membersText = rest.trim();
    }
  }

  return { date, place, membersText, raw: trimmed };
}

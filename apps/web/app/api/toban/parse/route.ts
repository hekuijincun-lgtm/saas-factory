/**
 * 自然言語から名前を分割する API
 * Claude API でスペースなしの名前連結を解析
 * 簡易パスコード認証付き
 */
export const runtime = "edge";

export async function POST(req: Request) {
  // 簡易パスコード認証
  const passcode = req.headers.get("x-toban-passcode");
  const expected = process.env.TOBAN_PASSCODE;
  if (expected && passcode !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { text: string; context: string; members: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { text, context, members } = body;
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  try {
    // Claude API を直接 fetch で呼ぶ（SDK の edge 互換性問題を回避）
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: buildPrompt(text, context, members),
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Claude API error:", err);
      return Response.json({ error: "ai_error" }, { status: 502 });
    }

    const data: any = await res.json();
    const content = data.content?.[0]?.text ?? "";

    // JSON 部分を抽出
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return Response.json({ names: null });
    }

    const names = JSON.parse(jsonMatch[0]) as string[];
    return Response.json({ names });
  } catch (err) {
    console.error("Parse API error:", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

function buildPrompt(text: string, context: string, members: string[]): string {
  const memberList = members.length > 0
    ? `\n既知のメンバー名簿: ${members.join("、")}`
    : "";

  return `以下のテキストから日本語の人名を分割してください。
スペースなしで連結されている場合があります。
日本語の姓（苗字）として自然な区切りで分割してください。
${memberList}

テキスト: "${text}"
元の入力行: "${context}"

JSON配列で名前のリストのみを返してください。例: ["大成", "駒谷", "今村"]
余計な説明は不要です。`;
}

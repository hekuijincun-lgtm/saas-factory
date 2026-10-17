/**
 * 写真から当番表を読み取る API（Claude Vision）
 * 画像はサーバーに保存しない（リクエスト処理後に破棄）
 * 簡易パスコード認証付き
 */
export const runtime = "edge";

interface OcrRow {
  date: string;
  weekday: string;
  place: string;
  members: string[];
  cancelled: boolean;
}

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

  // multipart/form-data で画像を受信
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = formData.get("image") as File | null;
  if (!file) {
    return Response.json({ error: "image is required" }, { status: 400 });
  }

  // 画像を base64 に変換
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // MIME type
  const mediaType = file.type || "image/jpeg";
  const supportedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!supportedTypes.includes(mediaType)) {
    return Response.json(
      { error: `Unsupported image type: ${mediaType}. Use JPEG, PNG, GIF, or WebP.` },
      { status: 400 }
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: OCR_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Claude Vision API error:", err);
      return Response.json({ error: "ai_error" }, { status: 502 });
    }

    const data: any = await res.json();
    const content = data.content?.[0]?.text ?? "";

    // JSON配列を抽出
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: "parse_failed", raw: content }, { status: 422 });
    }

    const rows: OcrRow[] = JSON.parse(jsonMatch[0]);
    return Response.json({ rows });
  } catch (err) {
    console.error("OCR API error:", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

const OCR_PROMPT = `この画像は当番表（日付・場所・担当者の表）です。
画像から表データを読み取り、以下のJSON配列として返してください。

各行は:
{
  "date": "7/4",        // M/D 形式
  "weekday": "土",       // 曜日（画像にあれば）
  "place": "田島中",     // 場所名
  "members": ["出田", "尾形", "鈴木"],  // 担当者名のリスト
  "cancelled": false     // 取り消し線がある行は true
}

注意事項:
- 取り消し線（横線で消されている行）は cancelled: true にしてください
- 空行は無視してください
- 日付は M/D 形式に統一してください
- 曜日が書かれていなくても date フィールドは必ず入れてください
- 担当者名は個別に分割してください
- 読み取れない文字は「?」としてください

JSON配列のみを返してください。説明は不要です。`;

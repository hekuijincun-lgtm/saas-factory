export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function LineSetupPage({ searchParams }: any) {
  const reason = searchParams?.reason ?? null;
  const tenantId = searchParams?.tenantId ?? "default";

  const startUrl = `/api/auth/line/start?tenantId=${encodeURIComponent(tenantId)}&returnTo=${encodeURIComponent("/admin/line-setup")}`;

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>LINE 連携セットアップ</h1>

      {reason && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, border: "1px solid #ddd", background: "#fafafa" }}>
          <b>ステータス:</b> {String(reason)}
          {reason === "secret" && (
            <div style={{ marginTop: 8, padding: 12, border: "1px solid #f5c2c7", background: "#f8d7da", borderRadius: 12 }}>
              <b>Channel Secret 不一致っぽい</b><br />
              Workers の LINE_CHANNEL_SECRET（staging/prod）を見直してね。
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>ステップ 1：LINE Login（必須）</h2>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          まずは LINEログインで「許可」まで完走させて、連携状態を作るよ。
        </p>

        <a
          href={startUrl}
          style={{
            display: "inline-block",
            marginTop: 10,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #111",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          LINEと連携する（ログインへ）
        </a>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          ※ returnTo は /admin/line-setup に固定（settings 経由は封印）
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>ステップ 2：Messaging API（未実装OK）</h2>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          ここはまだ作ってなくてOK。作る時はこの画面で
          「Webhook URL」「Channel Access Token」「Webhook検証」まで案内する💅
        </p>

        <button
          disabled
          style={{
            marginTop: 8,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ccc",
            opacity: 0.6,
            cursor: "not-allowed",
          }}
        >
          （未実装）Messaging API を設定する
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <a href="/admin" style={{ textDecoration: "underline" }}>管理画面へ戻る</a>
      </div>
    </div>
  );
}

export default function LineSetupPage({ searchParams }: any) {
  const reason = searchParams?.reason ?? null;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>LINE 連携セットアップ</h1>

      {reason === "secret" && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #f5c2c7", background: "#f8d7da" }}>
          <b>LINEログイン検証で失敗</b>（Channel Secret 不一致の可能性）<br />
          まずは「LINE Login Channel Secret」を正しく設定してね。
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>ステップ 1：LINE Login（必須）</h2>
        <p style={{ marginTop: 8 }}>
          ✅ これは「ログイン」のための設定。いまここが原因で止まってる可能性が高いよ。
        </p>
        <ol style={{ marginTop: 8, paddingLeft: 18 }}>
          <li>LINE Developers → チャネル → Channel Secret をコピー</li>
          <li>Workers の secret に反映（staging/prod）</li>
        </ol>
      </div>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>ステップ 2：Messaging API（あとでOK）</h2>
        <p style={{ marginTop: 8 }}>
          🚧 ここはまだ未実装でもOK。実装したらこの画面で
          「Webhook URL」「Channel Access Token」などを案内するよ。
        </p>
        <button style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc" }}>
          （未実装）Messaging API を設定する
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <a href="/admin" style={{ textDecoration: "underline" }}>管理画面へ戻る</a>
      </div>
    </div>
  );
}

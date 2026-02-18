import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div style={{display:"none"}}>CF_PAGES_COMMIT_SHA=20260218_184100</div>{children}<div style={{display:"none"}}>CF_PAGES_COMMIT_SHA=20260218_183801</div>
</body>
    </html>
  );
}







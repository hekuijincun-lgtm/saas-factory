import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Noto+Sans+JP:wght@400;500;700;900&family=Noto+Serif+JP:wght@400;500&family=Playfair+Display:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div style={{display:"none"}}>CF_PAGES_COMMIT_SHA=20260218_184100</div>{children}<div style={{display:"none"}}>CF_PAGES_COMMIT_SHA=20260218_183801</div>
</body>
    </html>
  );
}







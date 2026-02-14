export const runtime = "edge";

export default function LoginPage() {
  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:"24px"}}>
      <div style={{maxWidth:420,width:"100%",display:"grid",gap:12}}>
        <h1 style={{fontSize:24,fontWeight:700}}>ログイン</h1>

        <a
          href={`/api/auth/line/start?tenantId=${tenantId}`}`
          style={{
            display:"inline-flex",
            justifyContent:"center",
            alignItems:"center",
            height:48,
            borderRadius:12,
            fontWeight:700,
            textDecoration:"none",
            border:"1px solid rgba(0,0,0,.12)"
          }}
        >
          LINEでログイン
        </a>

        <p style={{opacity:.7,fontSize:12}}>
          うまくいかない場合はURL末尾に <code>?nocache=1</code> を付けて再読み込みしてね
        </p>
      </div>
    </main>
  );
}


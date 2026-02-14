export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: any) {
  const tenantId = searchParams?.tenantId ?? "default";
  const returnTo = `/admin/line-setup?tenantId=${encodeURIComponent(tenantId)}`;

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:"24px"}}>
      <div style={{maxWidth:420,width:"100%",display:"grid",gap:12}}>
        <h1 style={{fontSize:24,fontWeight:700}}>ログイン</h1>

        <a
          href={`/api/auth/line/start?tenantId=${encodeURIComponent(tenantId)}&returnTo=${encodeURIComponent(returnTo)}`}
          style={{
            display:"inline-flex",
            justifyContent:"center",
            alignItems:"center",
            height:48,
            borderRadius:12,
            fontWeight:700,
            background:"#06C755",
            color:"#fff",
            textDecoration:"none"
          }}
        >
          LINEでログイン
        </a>
      </div>
    </main>
  );
}

export type Env = Record<string, unknown>

// Durable Object: SlotLock
// - POST /lock   { key, ttlSeconds }  -> 200 {ok:true} or 409 {ok:false, error:"locked"}
// - POST /unlock { key }              -> 200 {ok:true}
// - GET  /__ping                      -> 200 "DO_OK"
export class SlotLock {
  state: DurableObjectState
  constructor(state: DurableObjectState, _env: Env) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    let url: URL
    try { url = new URL(request.url) } catch { url = new URL("https://invalid/") }

    if (url.pathname === "/__ping" && request.method === "GET") {
      return new Response("DO_OK", { status: 200 })
    }

    if (url.pathname === "/lock" && request.method === "POST") {
      const body = await request.json().catch(() => ({} as any))
      const key = String(body?.key ?? "")
      const ttl = Number(body?.ttlSeconds ?? 30)
      if (!key) return new Response(JSON.stringify({ ok:false, error:"missing_key" }), { status: 400 })

      const now = Date.now()
      const rec = await this.state.storage.get<{ until:number }>(key)
      if (rec && rec.until > now) {
        return new Response(JSON.stringify({ ok:false, error:"locked", until:rec.until }), { status: 409, headers: { "content-type":"application/json" } })
      }
      await this.state.storage.put(key, { until: now + ttl * 1000 })
      return new Response(JSON.stringify({ ok:true, key, ttlSeconds: ttl }), { status: 200, headers: { "content-type":"application/json" } })
    }

    if (url.pathname === "/unlock" && request.method === "POST") {
      const body = await request.json().catch(() => ({} as any))
      const key = String(body?.key ?? "")
      if (!key) return new Response(JSON.stringify({ ok:false, error:"missing_key" }), { status: 400 })
      await this.state.storage.delete(key)
      return new Response(JSON.stringify({ ok:true, key }), { status: 200, headers: { "content-type":"application/json" } })
    }

    return new Response(JSON.stringify({ ok:false, error:"not_found", path:url.pathname, method:request.method }), { status: 404, headers: { "content-type":"application/json" } })
  }
}

import { DurableObject } from "cloudflare:workers";

type LockState = {
  // key: slotId など
  locks: Record<string, string>; // lockId
};

export class SlotLock extends DurableObject {
  private stateObj!: LockState;

  constructor(state: DurableObjectState, env: unknown) {
    super(state, env);
    this.stateObj = { locks: {} };
  }

  // POST /lock  { key, lockId }
  // POST /unlock { key, lockId }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json().catch(() => ({} as any));
    const key = String(body?.key ?? "");
    const lockId = String(body?.lockId ?? "");

    if (!key || !lockId) {
      return Response.json({ ok: false, error: "key and lockId are required" }, { status: 400 });
    }

    // Durable Object の "transaction" 相当：blockConcurrencyWhile で直列化
    return await this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get<LockState>("state")) ?? { locks: {} };
      this.stateObj = stored;

      if (url.pathname.endsWith("/lock")) {
        // 既にロック済みなら409
        if (this.stateObj.locks[key] && this.stateObj.locks[key] !== lockId) {
          return Response.json({ ok: false, error: "locked" }, { status: 409 });
        }
        this.stateObj.locks[key] = lockId;
        await this.state.storage.put("state", this.stateObj);
        return Response.json({ ok: true });
      }

      if (url.pathname.endsWith("/unlock")) {
        if (this.stateObj.locks[key] === lockId) {
          delete this.stateObj.locks[key];
          await this.state.storage.put("state", this.stateObj);
        }
        return Response.json({ ok: true });
      }

      return Response.json({ ok: false, error: "unknown endpoint" }, { status: 404 });
    });
  }
}

/**
 * Owner Marketing Routes — Instagram auto-posting for vertical-specific accounts
 *
 * Manages IG accounts, content generation (AI), post queue, metrics, and A/B tests.
 * All routes under /owner/marketing/* — owner auth handled by middleware in index.ts.
 */
import type { Hono } from "hono";

// ── Types ────────────────────────────────────────────────────────────────────

interface IgAccount {
  vertical: string;
  igUserId: string;
  accessToken: string;
  tokenExpiresAt: number;
  autoPost: boolean;
  postTimes: string[];
  abTestEnabled: boolean;
}

interface QueueItem {
  id: string;
  vertical: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  variantGroup?: string;
  variant?: "A" | "B";
  scheduledAt: string;
  status: "pending" | "posted" | "failed";
  postedAt?: string;
  igMediaId?: string;
  metrics?: { likes: number; comments: number; reach: number; saves: number };
}

interface GenerateRequest {
  vertical: string;
  contentType: "case_study" | "feature_demo" | "pain_point" | "tip";
  abTest: boolean;
  useRealData: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return `ig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function kvGetJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  try {
    return await kv.get(key, "json");
  } catch {
    try {
      const raw = await kv.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

// ── Vertical display labels ─────────────────────────────────────────────────

const VERTICAL_LABELS: Record<string, string> = {
  eyebrow: "眉毛サロン",
  nail: "ネイルサロン",
  hair: "美容室",
  dental: "歯科医院",
  esthetic: "エステサロン",
  cleaning: "クリーニング店",
  handyman: "便利屋",
  pet: "ペットサロン",
  seitai: "整体院",
  gym: "ジム",
  school: "スクール",
  shop: "ショップ",
  food: "飲食店",
  handmade: "ハンドメイド",
  construction: "建設",
  reform: "リフォーム",
  equipment: "設備",
};

// ── Content generation prompts ──────────────────────────────────────────────

function buildSystemPrompt(
  vertical: string,
  contentType: GenerateRequest["contentType"],
  realData?: { tenantCount: number; avgReservations: number } | null,
): string {
  const label = VERTICAL_LABELS[vertical] || vertical;
  const base = `あなたはInstagramマーケティングのプロフェッショナルです。
ターゲットは「${label}を経営している日本のオーナー」です。
SaaS Factory（業種特化型クラウド管理ツール）への新規登録を促す投稿を作成してください。

ルール:
- 日本語で書く
- 絵文字を適度に使う（1〜2文に1つ程度）
- CTAは「プロフィールのリンクから無料トライアル開始」を必ず含める
- ハッシュタグは15〜20個（業種関連+経営+SaaS系）
- キャプションは200〜400文字

出力はJSON形式: {"caption":"...","hashtags":["..."],"imagePrompt":"DALL-E用の英語画像プロンプト(1文)"}`;

  const typeInstructions: Record<string, string> = {
    case_study: realData
      ? `導入事例形式。実績データ: 現在${realData.tenantCount}店舗が導入中、平均予約数${realData.avgReservations}件/月。「導入後◯%改善」の形式で数値を使ってください。個人情報は含めないこと。`
      : `導入事例形式。具体的な改善数値（例: 予約数30%アップ、業務時間50%削減）を含めてください。`,
    feature_demo: `${label}に特化した機能を1つピックアップして説明。操作の簡単さ・時短効果を強調。`,
    pain_point: `${label}オーナーが日常で抱える課題（手作業での予約管理、顧客管理の煩雑さ等）に共感してから、SaaS Factoryで解決できることを提示。`,
    tip: `${label}経営に役立つ実用的なTipsを提供しつつ、最後にSaaS Factoryの関連機能に自然につなげる。`,
  };

  return `${base}\n\nコンテンツタイプ: ${contentType}\n${typeInstructions[contentType] || ""}`;
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerOwnerMarketingRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {
  // ── Accounts CRUD ───────────────────────────────────────────────

  app.get("/owner/marketing/accounts", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
    return c.json({ ok: true, accounts });
  });

  app.post("/owner/marketing/accounts", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const body = await c.req.json<Partial<IgAccount>>();
    if (!body.vertical || !body.igUserId || !body.accessToken) {
      return c.json({ ok: false, error: "vertical, igUserId, accessToken are required" }, 400);
    }
    const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
    if (accounts.some((a) => a.vertical === body.vertical)) {
      return c.json({ ok: false, error: `Account for vertical '${body.vertical}' already exists` }, 409);
    }
    const account: IgAccount = {
      vertical: body.vertical,
      igUserId: body.igUserId,
      accessToken: body.accessToken,
      tokenExpiresAt: body.tokenExpiresAt ?? (Date.now() + 60 * 24 * 60 * 60 * 1000),
      autoPost: body.autoPost ?? true,
      postTimes: body.postTimes ?? ["09:00", "19:00"],
      abTestEnabled: body.abTestEnabled ?? false,
    };
    accounts.push(account);
    await kv.put("owner:instagram:accounts", JSON.stringify(accounts));
    await kv.put(`owner:instagram:account:${body.vertical}`, JSON.stringify(account));
    return c.json({ ok: true, account }, 201);
  });

  app.put("/owner/marketing/accounts/:vertical", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");
    const body = await c.req.json<Partial<IgAccount>>();
    const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
    const idx = accounts.findIndex((a) => a.vertical === vertical);
    if (idx === -1) return c.json({ ok: false, error: "Account not found" }, 404);
    const updated = { ...accounts[idx], ...body, vertical };
    accounts[idx] = updated;
    await kv.put("owner:instagram:accounts", JSON.stringify(accounts));
    await kv.put(`owner:instagram:account:${vertical}`, JSON.stringify(updated));
    return c.json({ ok: true, account: updated });
  });

  app.delete("/owner/marketing/accounts/:vertical", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");
    const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
    const filtered = accounts.filter((a) => a.vertical !== vertical);
    if (filtered.length === accounts.length) return c.json({ ok: false, error: "Account not found" }, 404);
    await kv.put("owner:instagram:accounts", JSON.stringify(filtered));
    await kv.delete(`owner:instagram:account:${vertical}`);
    await kv.delete(`owner:instagram:queue:${vertical}`);
    return c.json({ ok: true });
  });

  // ── Queue ───────────────────────────────────────────────────────

  app.get("/owner/marketing/queue/:vertical", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${vertical}`) ?? [];
    return c.json({ ok: true, queue });
  });

  app.post("/owner/marketing/queue/:vertical", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");
    const body = await c.req.json<Partial<QueueItem>>();
    if (!body.caption || !body.scheduledAt) {
      return c.json({ ok: false, error: "caption and scheduledAt are required" }, 400);
    }
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${vertical}`) ?? [];
    const item: QueueItem = {
      id: uid(),
      vertical,
      caption: body.caption,
      hashtags: body.hashtags ?? [],
      imagePrompt: body.imagePrompt ?? "",
      variantGroup: body.variantGroup,
      variant: body.variant,
      scheduledAt: body.scheduledAt,
      status: "pending",
    };
    queue.push(item);
    await kv.put(`owner:instagram:queue:${vertical}`, JSON.stringify(queue));
    return c.json({ ok: true, item }, 201);
  });

  app.delete("/owner/marketing/queue/:vertical/:id", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");
    const id = c.req.param("id");
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${vertical}`) ?? [];
    const filtered = queue.filter((q) => q.id !== id);
    if (filtered.length === queue.length) return c.json({ ok: false, error: "Queue item not found" }, 404);
    await kv.put(`owner:instagram:queue:${vertical}`, JSON.stringify(filtered));
    return c.json({ ok: true });
  });

  // ── DALL-E image generation ─────────────────────────────────────

  app.post("/owner/marketing/generate-image", async (c) => {
    const env = c.env as any;
    const openaiKey: string | undefined = env.OPENAI_API_KEY;
    if (!openaiKey) return c.json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

    const r2 = env.MENU_IMAGES;
    if (!r2) return c.json({ ok: false, error: "R2 not configured" }, 503);

    const body = await c.req.json<{ prompt: string; vertical: string }>();
    if (!body.prompt?.trim()) {
      return c.json({ ok: false, error: "prompt is required" }, 400);
    }

    try {
      // Call DALL-E 3
      const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: body.prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          response_format: "b64_json",
        }),
      });

      if (!dalleRes.ok) {
        const errText = await dalleRes.text().catch(() => "");
        return c.json({ ok: false, error: "dalle_error", status: dalleRes.status, detail: errText }, 502);
      }

      const dalleData = (await dalleRes.json()) as any;
      const b64 = dalleData?.data?.[0]?.b64_json;
      if (!b64) return c.json({ ok: false, error: "no_image_data" }, 502);

      // Decode base64 to binary
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Store in R2
      const vertical = body.vertical || "generic";
      const rand = Math.random().toString(36).slice(2, 9);
      const r2Key = `marketing/${vertical}/${Date.now()}-${rand}.png`;
      await r2.put(r2Key, bytes.buffer, { httpMetadata: { contentType: "image/png" } });

      // Build public URL via /media/menu/ route (serves R2 objects)
      const reqUrl = new URL(c.req.url);
      const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
      const imageUrl = `${apiBase}/media/menu/${r2Key}`;

      return c.json({
        ok: true,
        imageUrl,
        r2Key,
        revisedPrompt: dalleData?.data?.[0]?.revised_prompt,
      });
    } catch (e: any) {
      return c.json({ ok: false, error: `Image generation failed: ${e?.message}` }, 500);
    }
  });

  // ── Content generation (AI) ─────────────────────────────────────

  app.post("/owner/marketing/generate", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const openaiKey: string | undefined = env.OPENAI_API_KEY;
    if (!openaiKey) return c.json({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

    const body = await c.req.json<GenerateRequest>();
    if (!body.vertical || !body.contentType) {
      return c.json({ ok: false, error: "vertical and contentType are required" }, 400);
    }

    // Gather real data if requested
    let realData: { tenantCount: number; avgReservations: number } | null = null;
    if (body.useRealData) {
      try {
        // Scan settings:* for tenant count in this vertical
        const listResult = await kv.list({ prefix: "settings:" });
        let count = 0;
        let totalReservations = 0;
        for (const key of listResult.keys) {
          try {
            const s = await kvGetJson<any>(kv, key.name);
            if (s?.vertical === body.vertical) {
              count++;
              totalReservations += s?.reservationCount ?? 0;
            }
          } catch { /* skip */ }
        }
        if (count > 0) {
          realData = { tenantCount: count, avgReservations: Math.round(totalReservations / count) };
        }
      } catch { /* ignore, proceed without real data */ }
    }

    const systemPrompt = buildSystemPrompt(body.vertical, body.contentType, realData);
    const variantCount = body.abTest ? 2 : 1;
    const results: Array<{ caption: string; hashtags: string[]; imagePrompt: string; variant?: "A" | "B" }> = [];
    const variantGroup = body.abTest ? uid() : undefined;

    for (let i = 0; i < variantCount; i++) {
      const variant = body.abTest ? (i === 0 ? "A" : "B") : undefined;
      const userMsg = variant
        ? `バリアント${variant}を生成してください。${variant === "B" ? "Aとは異なるトーン・切り口で。" : ""}`
        : "投稿コンテンツを1つ生成してください。";

      try {
        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMsg },
            ],
            response_format: { type: "json_object" },
            temperature: 0.8,
            max_tokens: 800,
          }),
        });

        if (!aiRes.ok) {
          const err = await aiRes.text().catch(() => "");
          return c.json({ ok: false, error: `OpenAI API error: ${aiRes.status}`, detail: err }, 502);
        }

        const aiData = (await aiRes.json()) as any;
        const content = aiData.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content || "{}");
        results.push({
          caption: parsed.caption || "",
          hashtags: parsed.hashtags || [],
          imagePrompt: parsed.imagePrompt || "",
          variant,
        });
      } catch (e: any) {
        return c.json({ ok: false, error: `AI generation failed: ${e?.message}` }, 500);
      }
    }

    return c.json({ ok: true, results, variantGroup });
  });

  // ── Immediate post ──────────────────────────────────────────────

  app.post("/owner/marketing/post/:vertical", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");

    const account = await kvGetJson<IgAccount>(kv, `owner:instagram:account:${vertical}`);
    if (!account) return c.json({ ok: false, error: "Account not found for this vertical" }, 404);

    const body = await c.req.json<{ queueItemId?: string; caption?: string; hashtags?: string[]; imageUrl?: string }>();

    let caption = body.caption ?? "";
    let hashtags: string[] = body.hashtags ?? [];
    let queueItemId = body.queueItemId;

    // If posting from queue, fetch item
    if (queueItemId) {
      const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${vertical}`) ?? [];
      const item = queue.find((q) => q.id === queueItemId);
      if (!item) return c.json({ ok: false, error: "Queue item not found" }, 404);
      caption = item.caption;
      hashtags = item.hashtags;
    }

    if (!caption) return c.json({ ok: false, error: "caption is required" }, 400);

    const fullCaption = `${caption}\n\n${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;

    // If no imageUrl provided, we can't post (image is required for IG)
    const imageUrl = body.imageUrl;
    if (!imageUrl) {
      return c.json({ ok: false, error: "imageUrl is required for Instagram posts" }, 400);
    }

    try {
      console.log(`[IG_POST] vertical=${vertical} igUserId=${account.igUserId} imageUrl=${imageUrl}`);

      // Step 1: Create media container
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${account.igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            caption: fullCaption,
            access_token: account.accessToken,
          }),
        },
      );
      const containerData = (await containerRes.json().catch(() => ({}))) as any;
      console.log(`[IG_POST] container status=${containerRes.status} body=${JSON.stringify(containerData).slice(0, 500)}`);
      if (!containerRes.ok) {
        return c.json({
          ok: false,
          error: `Meta API: media container creation failed (${containerRes.status})`,
          detail: containerData?.error?.message || JSON.stringify(containerData).slice(0, 300),
        }, 502);
      }
      const creationId = containerData.id;
      if (!creationId) {
        return c.json({ ok: false, error: "Meta API: no creation_id returned", detail: JSON.stringify(containerData).slice(0, 300) }, 502);
      }

      // Step 2: Publish
      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${account.igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: account.accessToken,
          }),
        },
      );
      const publishData = (await publishRes.json().catch(() => ({}))) as any;
      console.log(`[IG_POST] publish status=${publishRes.status} body=${JSON.stringify(publishData).slice(0, 500)}`);
      if (!publishRes.ok) {
        return c.json({
          ok: false,
          error: `Meta API: publish failed (${publishRes.status})`,
          detail: publishData?.error?.message || JSON.stringify(publishData).slice(0, 300),
        }, 502);
      }
      const igMediaId = publishData.id;

      // Update queue item status if applicable
      if (queueItemId) {
        const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${vertical}`) ?? [];
        const idx = queue.findIndex((q) => q.id === queueItemId);
        if (idx !== -1) {
          queue[idx].status = "posted";
          queue[idx].postedAt = new Date().toISOString();
          queue[idx].igMediaId = igMediaId;
          await kv.put(`owner:instagram:queue:${vertical}`, JSON.stringify(queue));
        }
      }

      return c.json({ ok: true, igMediaId });
    } catch (e: any) {
      return c.json({ ok: false, error: `Post failed: ${e?.message}` }, 500);
    }
  });

  // ── Metrics ─────────────────────────────────────────────────────

  app.get("/owner/marketing/metrics/:vertical", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${vertical}`) ?? [];
    const posted = queue.filter((q) => q.status === "posted");

    let totalLikes = 0;
    let totalComments = 0;
    let totalReach = 0;
    let totalSaves = 0;
    for (const p of posted) {
      if (p.metrics) {
        totalLikes += p.metrics.likes;
        totalComments += p.metrics.comments;
        totalReach += p.metrics.reach;
        totalSaves += p.metrics.saves;
      }
    }

    return c.json({
      ok: true,
      vertical,
      totalPosts: posted.length,
      pendingPosts: queue.filter((q) => q.status === "pending").length,
      metrics: { totalLikes, totalComments, totalReach, totalSaves },
      recentPosts: posted.slice(-10).reverse(),
    });
  });

  // ── A/B Test results ────────────────────────────────────────────

  app.get("/owner/marketing/abtest/:groupId", async (c) => {
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const groupId = c.req.param("groupId");

    // Check stored result first
    const stored = await kvGetJson<any>(kv, `owner:instagram:abtest:${groupId}`);
    if (stored) return c.json({ ok: true, ...stored });

    // Otherwise, compute from queue items across all accounts
    const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
    const variants: QueueItem[] = [];
    for (const acc of accounts) {
      const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${acc.vertical}`) ?? [];
      variants.push(...queue.filter((q) => q.variantGroup === groupId));
    }

    if (variants.length === 0) return c.json({ ok: false, error: "A/B test group not found" }, 404);

    const variantA = variants.find((v) => v.variant === "A");
    const variantB = variants.find((v) => v.variant === "B");

    const score = (item?: QueueItem) => {
      if (!item?.metrics) return 0;
      return item.metrics.likes + item.metrics.comments * 2 + item.metrics.saves * 3;
    };

    const result = {
      groupId,
      variantA: variantA ? { id: variantA.id, caption: variantA.caption, metrics: variantA.metrics, score: score(variantA) } : null,
      variantB: variantB ? { id: variantB.id, caption: variantB.caption, metrics: variantB.metrics, score: score(variantB) } : null,
      winner: score(variantA) >= score(variantB) ? "A" : "B",
    };

    return c.json({ ok: true, ...result });
  });

  // ── Token refresh ───────────────────────────────────────────────

  app.post("/owner/marketing/token-refresh/:vertical", async (c) => {
    const env = c.env as any;
    const kv = env.SAAS_FACTORY as KVNamespace;
    const vertical = c.req.param("vertical");

    const appId: string | undefined = env.META_APP_ID;
    const appSecret: string | undefined = env.META_APP_SECRET;
    if (!appId || !appSecret) return c.json({ ok: false, error: "META_APP_ID or META_APP_SECRET not configured" }, 503);

    const account = await kvGetJson<IgAccount>(kv, `owner:instagram:account:${vertical}`);
    if (!account) return c.json({ ok: false, error: "Account not found" }, 404);

    try {
      const url = new URL("https://graph.facebook.com/oauth/access_token");
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", appId);
      url.searchParams.set("client_secret", appSecret);
      url.searchParams.set("fb_exchange_token", account.accessToken);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        return c.json({ ok: false, error: "Token refresh failed", detail: err?.error?.message }, 502);
      }

      const data = (await res.json()) as any;
      const newToken = data.access_token;
      const expiresIn = data.expires_in ?? 5184000; // default 60 days

      account.accessToken = newToken;
      account.tokenExpiresAt = Date.now() + expiresIn * 1000;

      // Update both account record and accounts list
      await kv.put(`owner:instagram:account:${vertical}`, JSON.stringify(account));
      const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
      const idx = accounts.findIndex((a) => a.vertical === vertical);
      if (idx !== -1) {
        accounts[idx] = account;
        await kv.put("owner:instagram:accounts", JSON.stringify(accounts));
      }

      return c.json({ ok: true, tokenExpiresAt: account.tokenExpiresAt });
    } catch (e: any) {
      return c.json({ ok: false, error: `Token refresh error: ${e?.message}` }, 500);
    }
  });
}

// ── Cron handlers (called from scheduled.ts) ────────────────────────────────

/** Process pending queue items whose scheduledAt has passed */
export async function cronPostQueue(env: any): Promise<void> {
  const kv = env.SAAS_FACTORY as KVNamespace;
  const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
  const now = new Date().toISOString();
  const STAMP = "IG_POST_CRON_V1";

  for (const account of accounts) {
    if (!account.autoPost) continue;
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${account.vertical}`) ?? [];
    let changed = false;

    for (const item of queue) {
      if (item.status !== "pending") continue;
      if (item.scheduledAt > now) continue;

      // Need an image URL to post — skip items without igMediaId placeholder
      // In production, images would be pre-uploaded to R2
      // For now, log and mark as failed if no image available
      console.log(`[${STAMP}] Skipping ${item.id} — automated image posting not yet implemented`);
      // TODO: When image generation is in scope, post here
      // For now, items must be posted manually via POST /owner/marketing/post/:vertical
    }

    if (changed) {
      await kv.put(`owner:instagram:queue:${account.vertical}`, JSON.stringify(queue));
    }
  }
}

/** Fetch insights for recently posted items (call 24h+ after posting) */
export async function cronFetchInsights(env: any): Promise<void> {
  const kv = env.SAAS_FACTORY as KVNamespace;
  const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
  const STAMP = "IG_INSIGHTS_CRON_V1";
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const account of accounts) {
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${account.vertical}`) ?? [];
    let changed = false;

    for (const item of queue) {
      if (item.status !== "posted" || !item.igMediaId) continue;
      if (item.postedAt && new Date(item.postedAt).getTime() > oneDayAgo) continue; // too recent
      if (item.metrics && item.metrics.reach > 0) continue; // already fetched

      try {
        const url = new URL(`https://graph.facebook.com/v19.0/${item.igMediaId}/insights`);
        url.searchParams.set("metric", "impressions,reach,likes,comments,shares,saved");
        url.searchParams.set("access_token", account.accessToken);

        const res = await fetch(url.toString());
        if (!res.ok) continue;

        const data = (await res.json()) as any;
        const metricsMap: Record<string, number> = {};
        for (const d of data.data ?? []) {
          metricsMap[d.name] = d.values?.[0]?.value ?? 0;
        }

        item.metrics = {
          likes: metricsMap.likes ?? 0,
          comments: metricsMap.comments ?? 0,
          reach: metricsMap.reach ?? 0,
          saves: metricsMap.saved ?? 0,
        };
        changed = true;

        // Also store per-post metrics
        await kv.put(`owner:instagram:metrics:${account.vertical}:${item.id}`, JSON.stringify(item.metrics));
        console.log(`[${STAMP}] Updated metrics for ${item.id}: reach=${item.metrics.reach}`);
      } catch (e: any) {
        console.error(`[${STAMP}] Failed to fetch insights for ${item.id}:`, e?.message);
      }
    }

    if (changed) {
      await kv.put(`owner:instagram:queue:${account.vertical}`, JSON.stringify(queue));
    }
  }
}

/** Refresh tokens expiring within 15 days */
export async function cronRefreshTokens(env: any): Promise<void> {
  const kv = env.SAAS_FACTORY as KVNamespace;
  const appId: string | undefined = (env as any).META_APP_ID;
  const appSecret: string | undefined = (env as any).META_APP_SECRET;
  if (!appId || !appSecret) return;

  const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
  const STAMP = "IG_TOKEN_REFRESH_CRON_V1";
  const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;

  for (const account of accounts) {
    if (account.tokenExpiresAt - Date.now() > fifteenDaysMs) continue;

    try {
      const url = new URL("https://graph.facebook.com/oauth/access_token");
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", appId);
      url.searchParams.set("client_secret", appSecret);
      url.searchParams.set("fb_exchange_token", account.accessToken);

      const res = await fetch(url.toString());
      if (!res.ok) {
        console.error(`[${STAMP}] Token refresh failed for ${account.vertical}: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as any;
      account.accessToken = data.access_token;
      account.tokenExpiresAt = Date.now() + (data.expires_in ?? 5184000) * 1000;

      await kv.put(`owner:instagram:account:${account.vertical}`, JSON.stringify(account));
      console.log(`[${STAMP}] Refreshed token for ${account.vertical}, expires ${new Date(account.tokenExpiresAt).toISOString()}`);
    } catch (e: any) {
      console.error(`[${STAMP}] Error refreshing token for ${account.vertical}:`, e?.message);
    }
  }

  // Save updated accounts list
  await kv.put("owner:instagram:accounts", JSON.stringify(accounts));
}

/** Weekly A/B test aggregation — determine winners */
export async function cronABTestAggregation(env: any): Promise<void> {
  const kv = env.SAAS_FACTORY as KVNamespace;
  const accounts = await kvGetJson<IgAccount[]>(kv, "owner:instagram:accounts") ?? [];
  const STAMP = "IG_ABTEST_CRON_V1";

  const groupMap = new Map<string, QueueItem[]>();

  for (const account of accounts) {
    const queue = await kvGetJson<QueueItem[]>(kv, `owner:instagram:queue:${account.vertical}`) ?? [];
    for (const item of queue) {
      if (!item.variantGroup || item.status !== "posted" || !item.metrics) continue;
      const group = groupMap.get(item.variantGroup) ?? [];
      group.push(item);
      groupMap.set(item.variantGroup, group);
    }
  }

  const score = (item: QueueItem) => {
    if (!item.metrics) return 0;
    return item.metrics.likes + item.metrics.comments * 2 + item.metrics.saves * 3;
  };

  for (const [groupId, items] of groupMap) {
    if (items.length < 2) continue;
    const variantA = items.find((i) => i.variant === "A");
    const variantB = items.find((i) => i.variant === "B");
    if (!variantA || !variantB) continue;

    const result = {
      groupId,
      variantA: { id: variantA.id, caption: variantA.caption, metrics: variantA.metrics, score: score(variantA) },
      variantB: { id: variantB.id, caption: variantB.caption, metrics: variantB.metrics, score: score(variantB) },
      winner: score(variantA) >= score(variantB) ? "A" : "B",
      aggregatedAt: new Date().toISOString(),
    };

    await kv.put(`owner:instagram:abtest:${groupId}`, JSON.stringify(result));
    console.log(`[${STAMP}] A/B test ${groupId}: winner=${result.winner}`);
  }
}

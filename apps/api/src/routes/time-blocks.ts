/**
 * Time Blocks Routes — AI-powered availability management
 *
 * POST /admin/time-blocks/ai-parse  — Parse natural language into time blocks
 * GET  /admin/time-blocks            — List time blocks for a month
 * DELETE /admin/time-blocks/:id      — Delete a single time block
 */
import type { Hono } from "hono";
import { getTenantId, requireRole } from "../helpers";
import { AICore } from "../ai";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimeBlock {
  id: string;
  date: string;        // "YYYY-MM-DD"
  blockType: 'full' | 'closed' | 'partial' | 'open';
  availableSlots?: string[];  // ["9:00", "13:00"] for partial
  memo?: string;
  createdAt: string;
}

interface TimeBlockStore {
  version: 1;
  blocks: TimeBlock[];
}

// ── Register ─────────────────────────────────────────────────────────────────

export function registerTimeBlockRoutes(app: Hono) {

  // ── AI Parse: natural language → structured time blocks ──────────────
  app.post("/admin/time-blocks/ai-parse", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) return c.json({ error: "tenantId required" }, 400);
    const roleErr = await requireRole(c, tenantId, ["owner", "admin"]);
    if (roleErr) return roleErr;

    const body = await c.req.json<{ text: string; yearMonth?: string }>();
    if (!body.text || typeof body.text !== "string") {
      return c.json({ error: "text is required" }, 400);
    }

    const now = new Date();
    const yearMonth = body.yearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Use AI to parse the natural language
    const env = c.env as any;
    const ai = new AICore(env);

    let parsed: Array<{ date: string; blockType: string; availableSlots?: string[]; memo?: string }>;

    try {
      const result = await ai.generateJson<typeof parsed>({
        tenantId,
        task: "time-block-parse",
        promptKey: "time-block-parse",
        variables: {
          text: body.text,
          yearMonth,
        },
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "YYYY-MM-DD format" },
              blockType: { type: "string", enum: ["full", "closed", "partial", "open"] },
              availableSlots: { type: "array", items: { type: "string" }, description: "HH:mm format slots for partial type" },
              memo: { type: "string" },
            },
            required: ["date", "blockType"],
          },
        },
        temperature: 0.1,
      });

      parsed = result.data as typeof parsed;
    } catch (aiErr: any) {
      // Fallback: simple regex-based parsing if AI is not available
      parsed = fallbackParse(body.text, yearMonth);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      // Try fallback
      parsed = fallbackParse(body.text, yearMonth);
    }

    // Convert to TimeBlock objects and merge with existing
    const kv = env.SAAS_FACTORY as KVNamespace;
    const storeKey = `timeblocks:${tenantId}`;
    const existing = await kv.get(storeKey, "json").catch(() => null) as TimeBlockStore | null;
    const store: TimeBlockStore = existing?.version === 1
      ? existing
      : { version: 1, blocks: [] };

    const newBlocks: TimeBlock[] = [];
    for (const p of parsed) {
      if (!p.date || !p.blockType) continue;
      // Remove existing block for the same date
      const idx = store.blocks.findIndex(b => b.date === p.date);
      if (idx >= 0) store.blocks.splice(idx, 1);

      const block: TimeBlock = {
        id: `tb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: p.date,
        blockType: p.blockType as TimeBlock["blockType"],
        availableSlots: p.availableSlots,
        memo: p.memo,
        createdAt: new Date().toISOString(),
      };
      store.blocks.push(block);
      newBlocks.push(block);
    }

    // Sort by date
    store.blocks.sort((a, b) => a.date.localeCompare(b.date));

    await kv.put(storeKey, JSON.stringify(store));

    return c.json({ ok: true, blocks: newBlocks, total: store.blocks.length });
  });

  // ── List time blocks for a month ──────────────────────────────────────
  app.get("/admin/time-blocks", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) return c.json({ error: "tenantId required" }, 400);
    const roleErr = await requireRole(c, tenantId, ["owner", "admin", "viewer"]);
    if (roleErr) return roleErr;

    const yearMonth = c.req.query("yearMonth"); // "2026-04"
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const store = await kv.get(`timeblocks:${tenantId}`, "json").catch(() => null) as TimeBlockStore | null;

    let blocks = store?.blocks || [];
    if (yearMonth) {
      blocks = blocks.filter(b => b.date.startsWith(yearMonth));
    }

    return c.json({ blocks });
  });

  // ── Delete a time block ───────────────────────────────────────────────
  app.delete("/admin/time-blocks/:id", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) return c.json({ error: "tenantId required" }, 400);
    const roleErr = await requireRole(c, tenantId, ["owner", "admin"]);
    if (roleErr) return roleErr;

    const blockId = c.req.param("id");
    const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
    const storeKey = `timeblocks:${tenantId}`;
    const store = await kv.get(storeKey, "json").catch(() => null) as TimeBlockStore | null;

    if (!store || store.version !== 1) {
      return c.json({ error: "not found" }, 404);
    }

    const idx = store.blocks.findIndex(b => b.id === blockId);
    if (idx < 0) return c.json({ error: "not found" }, 404);

    store.blocks.splice(idx, 1);
    await kv.put(storeKey, JSON.stringify(store));

    return c.json({ ok: true });
  });
}

// ── Fallback Parser (no AI needed) ──────────────────────────────────────────

function fallbackParse(text: string, yearMonth: string): Array<{ date: string; blockType: string; availableSlots?: string[]; memo?: string }> {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const results: Array<{ date: string; blockType: string; availableSlots?: string[]; memo?: string }> = [];

  // Split by common delimiters
  const parts = text.split(/[、,，\n]+/).map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    // Extract day number
    const dayMatch = part.match(/(\d{1,2})日/);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[1], 10);
    if (day < 1 || day > 31) continue;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const lower = part.toLowerCase();

    if (/closed|休|定休/i.test(lower)) {
      results.push({ date, blockType: "closed" });
    } else if (/満|満員|満席|full/i.test(lower)) {
      results.push({ date, blockType: "full" });
    } else {
      // Look for time slots
      const timeMatches = part.match(/(\d{1,2}):(\d{2})/g) || part.match(/(\d{1,2})時/g);
      if (timeMatches && timeMatches.length > 0) {
        const slots = timeMatches.map(t => {
          if (t.includes("時")) {
            const h = t.replace("時", "");
            return `${h.padStart(2, "0")}:00`;
          }
          return t;
        });
        results.push({ date, blockType: "partial", availableSlots: slots });
      } else if (/以降|から|空/i.test(lower)) {
        // "13時以降" pattern — extract the time
        const hourMatch = part.match(/(\d{1,2})時/);
        if (hourMatch) {
          const h = parseInt(hourMatch[1], 10);
          const slots: string[] = [];
          for (let t = h; t <= 19; t++) {
            slots.push(`${String(t).padStart(2, "0")}:00`);
          }
          results.push({ date, blockType: "partial", availableSlots: slots });
        } else {
          results.push({ date, blockType: "open" });
        }
      } else {
        results.push({ date, blockType: "open" });
      }
    }
  }

  return results;
}

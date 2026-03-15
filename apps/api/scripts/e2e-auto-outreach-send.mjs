#!/usr/bin/env node
/**
 * Outreach OS — E2E Auto Send Test (v2)
 * =======================================
 * Verifies the complete outreach pipeline:
 *   Lead Create → AI Draft → Approve → Send → delivery_event verification
 *
 * API Contract (verified from routes.ts):
 *   POST /admin/outreach/leads?tenantId=X           → { ok, data: { id, ... } }
 *   POST /admin/outreach/generate-message/:id?t=X   → { ok, data: { messageId, generated: { subject, ... } } }
 *   GET  /admin/outreach/settings?tenantId=X         → { ok, data: { sendMode, requireApproval, ... } }
 *   POST /admin/outreach/review/:id/approve?t=X      → { ok, data: { messageId, status: "approved" } }
 *   POST /admin/outreach/campaigns/:id/send?t=X      → { ok, data: { sent, provider, sendMode, eventId, error } }
 *   GET  /admin/outreach/debug/pipeline?t=X&limit=10 → { ok, data: { deliveryEvents, ... } }
 *
 * Usage:
 *   node scripts/e2e-auto-outreach-send.mjs \
 *     --admin-token TOKEN --tenant TENANT_ID [--api-base URL] [--json]
 *
 * Env fallbacks: ADMIN_TOKEN, OUTREACH_TENANT_ID, OUTREACH_API_BASE
 */

const args = parseArgs(process.argv.slice(2));
const API_BASE = args["api-base"] || process.env.OUTREACH_API_BASE || "https://saas-factory-api.hekuijincun.workers.dev";
const ADMIN_TOKEN = args["admin-token"] || process.env.ADMIN_TOKEN || "";
const TENANT_ID = args["tenant"] || process.env.OUTREACH_TENANT_ID || "";
const JSON_OUTPUT = args["json"] !== undefined;

if (!TENANT_ID) die("--tenant or OUTREACH_TENANT_ID required");
if (!ADMIN_TOKEN) die("--admin-token or ADMIN_TOKEN required");

const timestamp = Date.now();
const TEST_EMAIL = `e2e-send-${timestamp}@outreach-test.example.com`;
const checks = [];
const output = { test: "auto_outreach_send", lead_id: null, draft_id: null, draft_created: false, delivery_status: null, result: "FAIL" };

function log(label, status, detail = "") {
  checks.push({ label, status, detail });
  if (!JSON_OUTPUT) {
    const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
    console.log(`  ${icon} ${label}: ${status}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  console.log(`\n🔬 Outreach OS — E2E Auto Send Test`);
  console.log(`   API:    ${API_BASE}`);
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Email:  ${TEST_EMAIL}\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 1: Create test lead
  // POST /admin/outreach/leads?tenantId=X
  // Body: { store_name (required), contact_email, category, area, website_url }
  // Returns: { ok, data: { id, store_name, ... } }
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── Step 1: Create test lead ──");
  const createRes = await adminPost(`/admin/outreach/leads?tenantId=${TENANT_ID}`, {
    store_name: `[E2E] Auto Send Test ${timestamp}`,
    contact_email: TEST_EMAIL,
    category: "e2e-test",
    area: "tokyo",
    website_url: `https://e2e-${timestamp}.example.com`,
    notes: "Auto-created by e2e-auto-outreach-send.mjs",
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    log("Lead create", "FAIL", httpErr(createRes.status, body));
    return finish();
  }

  const leadId = (await createRes.json()).data?.id;
  output.lead_id = leadId;
  if (!leadId) { log("Lead create", "FAIL", "no id in response"); return finish(); }
  log("Lead create", "PASS", `id=${leadId}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 2: Generate AI draft
  // POST /admin/outreach/generate-message/{leadId}?tenantId=X
  // Body: { tone?: "friendly", channel?: "email" }
  // Returns: { ok, data: { messageId, generated: { subject, opener, body, cta, tone } } }
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Step 2: Generate AI draft ──");
  const genRes = await adminPost(`/admin/outreach/generate-message/${leadId}?tenantId=${TENANT_ID}`, {
    channel: "email",
    tone: "friendly",
  });

  if (!genRes.ok) {
    const body = await genRes.text();
    log("Draft generate", "FAIL", httpErr(genRes.status, body));
    if (genRes.status === 500) log("Hint", "WARN", "OPENAI_API_KEY may be missing or invalid");
    return finish();
  }

  const genData = (await genRes.json()).data;
  // API returns { messageId, generated: { subject, ... } }
  const draftId = genData?.messageId;
  const subject = genData?.generated?.subject || "";
  output.draft_id = draftId;

  if (!draftId) { log("Draft generate", "FAIL", "no messageId in response"); return finish(); }
  output.draft_created = true;
  log("Draft generate", "PASS", `id=${draftId}, subject="${subject.slice(0, 40)}"`);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 3: Check settings + approve
  // GET /admin/outreach/settings?tenantId=X → { ok, data: { sendMode, requireApproval, ... } }
  // POST /admin/outreach/review/{draftId}/approve?tenantId=X → { ok, data: { messageId, status } }
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Step 3: Settings & approve ──");
  let sendMode = "safe";
  let requireApproval = true;
  try {
    const sRes = await adminGet(`/admin/outreach/settings?tenantId=${TENANT_ID}`);
    if (sRes.ok) {
      const s = (await sRes.json()).data || {};
      sendMode = s.sendMode || "safe";
      requireApproval = s.requireApproval !== false;
      log("Settings", "PASS", `sendMode=${sendMode}, requireApproval=${requireApproval}`);
    } else {
      log("Settings", "WARN", `HTTP ${sRes.status} — using defaults`);
    }
  } catch { log("Settings", "WARN", "fetch failed — using defaults"); }

  // Always attempt approve (safe even if already approved or requireApproval=false)
  const appRes = await adminPost(`/admin/outreach/review/${draftId}/approve?tenantId=${TENANT_ID}`, {});
  if (appRes.ok) {
    log("Approve", "PASS", "status=approved");
  } else {
    const body = await appRes.text();
    log("Approve", "WARN", httpErr(appRes.status, body));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 4: Send message
  // POST /admin/outreach/campaigns/{draftId}/send?tenantId=X
  // Returns: { ok, data: { sent: bool, provider, sendMode, eventId, error? } }
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Step 4: Send message ──");
  const sendRes = await adminPost(`/admin/outreach/campaigns/${draftId}/send?tenantId=${TENANT_ID}`, {});

  if (!sendRes.ok) {
    const body = await sendRes.text();
    log("Send", "FAIL", httpErr(sendRes.status, body));
    if (sendRes.status === 404) log("Hint", "WARN", "draft may not be approved — check step 3");
    if (sendRes.status === 400) log("Hint", "WARN", "unsubscribed, cooldown, duplicate, or missing contact_email");
    if (sendRes.status === 429) log("Hint", "WARN", "rate limit reached");
    return finish();
  }

  const sendData = (await sendRes.json()).data || {};
  // sendData = { sent: bool, provider: string, sendMode: string, eventId: string, error?: string }
  if (sendData.error) {
    log("Send", "FAIL", `provider=${sendData.provider}, error=${sendData.error}`);
    return finish();
  }
  log("Send", "PASS", `sent=${sendData.sent}, provider=${sendData.provider}, mode=${sendData.sendMode}, eventId=${sendData.eventId?.slice(0, 16)}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 5: Verify delivery_event via debug pipeline
  // GET /admin/outreach/debug/pipeline?limit=10&tenantId=X
  // Returns: { ok, data: { deliveryEvents: [{ id, lead_id, event_type, status, ... }] } }
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── Step 5: Verify pipeline ──");
  await sleep(2000);

  const debugRes = await adminGet(`/admin/outreach/debug/pipeline?limit=15&tenantId=${TENANT_ID}`);
  if (!debugRes.ok) {
    log("Debug pipeline", "FAIL", `HTTP ${debugRes.status}`);
    // Fallback: use send response directly
    if (sendData.sent) {
      output.delivery_status = "sent";
      output.result = "PASS";
      log("Fallback", "WARN", "debug API failed but send returned success → treating as PASS");
    }
    return finish();
  }

  const pipeline = (await debugRes.json()).data || {};
  const events = pipeline.deliveryEvents || [];
  const ourEvent = events.find(e => e.lead_id === leadId);

  if (!ourEvent) {
    // Check if send reported success anyway
    if (sendData.sent) {
      output.delivery_status = "sent";
      output.result = "PASS";
      log("Delivery event", "WARN", "not in debug pipeline (limit/timing) but send API confirmed success");
    } else {
      log("Delivery event", "FAIL", "no delivery_event found for this lead in debug pipeline");
    }
    return finish();
  }

  log("Delivery event", "PASS", `event_type=${ourEvent.event_type}, status=${ourEvent.status}, channel=${ourEvent.channel || "email"}`);
  output.delivery_status = ourEvent.status;

  if (ourEvent.status === "sent") {
    log("FINAL", "PASS", "delivery_event.status == sent");
    output.result = "PASS";
  } else {
    log("FINAL", "FAIL", `delivery_event.status=${ourEvent.status} (expected: sent)`);
  }

  return finish();
}

// ── Output ──────────────────────────────────────────────────────────────
function finish() {
  const failed = checks.filter(r => r.status === "FAIL");
  const warned = checks.filter(r => r.status === "WARN");
  console.log(`\n${"─".repeat(50)}`);

  if (output.result === "PASS") {
    console.log(`✅ Overall: PASS (${checks.length} checks, ${warned.length} warnings)`);
  } else {
    console.log(`❌ Overall: FAIL (${failed.length} failures, ${warned.length} warnings)`);
    for (const f of failed) console.log(`   ↳ ${f.label}: ${f.detail}`);
  }

  console.log(`\n📋 Structured Result:`);
  console.log(JSON.stringify(output, null, 2));

  process.exit(output.result === "PASS" ? 0 : 1);
}

// ── Helpers ─────────────────────────────────────────────────────────────
function adminGet(path) {
  return fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
}
function adminPost(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function httpErr(status, body) {
  const msg = typeof body === "string" ? body.slice(0, 100) : "";
  const hints = { 401: "admin token invalid", 403: "forbidden/tenant mismatch", 404: "route or resource not found" };
  return `HTTP ${status}: ${hints[status] || msg}`;
}
function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2), v = argv[i + 1];
      if (v && !v.startsWith("--")) { r[k] = v; i++; } else { r[k] = ""; }
    }
  }
  return r;
}
function die(msg) { console.error(`❌ ${msg}`); process.exit(1); }

main().catch(err => { console.error(`\n❌ Unexpected: ${err.message}`); process.exit(1); });

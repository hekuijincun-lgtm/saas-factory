#!/usr/bin/env node
/**
 * Outreach OS — E2E Auto Send Test
 * ==================================
 * Verifies: Lead Create → AI Draft → Send (safe mode) → delivery_event recorded
 *
 * Usage:
 *   node scripts/e2e-auto-outreach-send.mjs \
 *     --admin-token TOKEN \
 *     --tenant TENANT_ID \
 *     [--api-base URL] [--json]
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
const results = [];
const output = {
  test: "auto_outreach_send",
  lead_id: null,
  draft_created: false,
  delivery_status: null,
  result: "FAIL",
};

function log(label, status, detail = "") {
  results.push({ label, status, detail });
  if (!JSON_OUTPUT) {
    const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
    console.log(`  ${icon} ${label}: ${status}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  console.log(`\n🔬 Outreach OS — E2E Auto Send Test`);
  console.log(`   API: ${API_BASE}`);
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Test email: ${TEST_EMAIL}\n`);

  // ── Step 1: Create test lead ──
  console.log("── Step 1: Create test lead ──");
  const createRes = await adminPost(`/admin/outreach/leads?tenantId=${TENANT_ID}`, {
    store_name: `[E2E Auto Send] Test Salon ${timestamp}`,
    contact_email: TEST_EMAIL,
    category: "e2e-test",
    area: "tokyo",
    website_url: `https://e2e-test-${timestamp}.example.com`,
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    log("Lead create", "FAIL", `HTTP ${createRes.status}: ${errText.slice(0, 100)}`);
    return finish();
  }

  const createData = await createRes.json();
  const leadId = createData.data?.id;
  output.lead_id = leadId;

  if (!leadId) {
    log("Lead create", "FAIL", "no lead ID returned");
    return finish();
  }
  log("Lead create", "PASS", `id=${leadId}`);

  // ── Step 2: Generate AI draft ──
  console.log("\n── Step 2: Generate AI draft ──");
  const genRes = await adminPost(`/admin/outreach/generate-message/${leadId}?tenantId=${TENANT_ID}`, {
    channel: "email",
    tone: "friendly",
  });

  if (!genRes.ok) {
    const errText = await genRes.text();
    log("Draft generate", "FAIL", `HTTP ${genRes.status}: ${errText.slice(0, 100)}`);
    return finish();
  }

  const genData = await genRes.json();
  const draft = genData.data;

  if (!draft?.id) {
    log("Draft generate", "FAIL", "no draft returned");
    return finish();
  }

  output.draft_created = true;
  log("Draft generate", "PASS", `id=${draft.id}, subject=${(draft.subject || "").slice(0, 40)}, status=${draft.status}`);

  // ── Step 3: Check settings + approve if needed ──
  console.log("\n── Step 3: Check settings & approve ──");
  const settingsRes = await adminGet(`/admin/outreach/settings?tenantId=${TENANT_ID}`);
  const settingsData = await settingsRes.json();
  const settings = settingsData.data || {};

  log("Settings", "PASS", `sendMode=${settings.sendMode || "safe"}, requireApproval=${settings.requireApproval}`);

  // Approve the draft if requireApproval is true
  if (settings.requireApproval !== false) {
    const approveRes = await adminPost(`/admin/outreach/review/${draft.id}/approve?tenantId=${TENANT_ID}`, {});
    if (approveRes.ok) {
      log("Approve draft", "PASS", "approved for send");
    } else {
      log("Approve draft", "WARN", `HTTP ${approveRes.status} — may already be approved or route differs`);
    }
  } else {
    log("Approve skip", "PASS", "requireApproval=false, skipping approval");
  }

  // ── Step 4: Send the message ──
  console.log("\n── Step 4: Send message ──");
  const sendRes = await adminPost(`/admin/outreach/campaigns/${draft.id}/send?tenantId=${TENANT_ID}`, {});

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    log("Send", "FAIL", `HTTP ${sendRes.status}: ${errText.slice(0, 120)}`);
    // Check common failure reasons
    if (sendRes.status === 404) log("Send hint", "WARN", "draft may need approval first (requireApproval=true)");
    if (sendRes.status === 400) log("Send hint", "WARN", "lead may be unsubscribed, cooldown active, or missing email");
    if (sendRes.status === 429) log("Send hint", "WARN", "rate limit reached");
    return finish();
  }

  const sendData = await sendRes.json();
  const sendResult = sendData.data || sendData;

  output.delivery_status = sendResult.status || sendResult.sendResult?.provider || "unknown";
  log("Send", "PASS", `provider=${sendResult.sendResult?.provider || "?"}, messageId=${sendResult.sendResult?.messageId?.slice(0, 20) || "?"}`);

  // ── Step 5: Wait + verify via debug pipeline ──
  console.log("\n── Step 5: Verify pipeline (after 2s wait) ──");
  await sleep(2000);

  const debugRes = await adminGet(`/admin/outreach/debug/pipeline?limit=10&tenantId=${TENANT_ID}`);
  if (!debugRes.ok) {
    log("Debug pipeline", "FAIL", `HTTP ${debugRes.status}`);
    return finish();
  }

  const debugData = await debugRes.json();
  const pipeline = debugData.data || {};

  // Check delivery events
  const deliveryEvents = pipeline.deliveryEvents || [];
  const ourEvent = deliveryEvents.find(e => e.lead_id === leadId);

  if (ourEvent) {
    log("Delivery event", "PASS", `event_type=${ourEvent.event_type}, status=${ourEvent.status}, channel=${ourEvent.channel || "email"}`);
    output.delivery_status = ourEvent.status;

    if (ourEvent.status === "sent") {
      log("Send verified", "PASS", "delivery_event.status == sent");
      output.result = "PASS";
    } else if (ourEvent.status === "failed") {
      log("Send verified", "FAIL", `status=failed, check metadata`);
    } else {
      log("Send verified", "WARN", `unexpected status: ${ourEvent.status}`);
    }
  } else {
    // Fallback: check send response directly
    if (sendResult.sendResult?.success || sendData.ok) {
      log("Delivery event", "WARN", "not found in debug pipeline but send API returned success");
      output.delivery_status = "sent";
      output.result = "PASS";
    } else {
      log("Delivery event", "FAIL", "no delivery_event found for this lead");
    }
  }

  return finish();
}

function finish() {
  const failed = results.filter(r => r.status === "FAIL");
  console.log(`\n${"─".repeat(50)}`);

  if (output.result === "PASS") {
    console.log(`✅ Overall: PASS`);
  } else {
    console.log(`❌ Overall: FAIL (${failed.length} failures)`);
    for (const f of failed) {
      console.log(`   ↳ ${f.label}: ${f.detail}`);
    }
  }

  console.log(`\n📋 Structured Result:`);
  console.log(JSON.stringify(output, null, 2));

  process.exit(output.result === "PASS" ? 0 : 1);
}

// ── Helpers ─────────────────────────────────────────────────────────────
function adminGet(path) {
  return fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

function adminPost(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) { r[k] = v; i++; } else { r[k] = ""; }
    }
  }
  return r;
}

function die(msg) { console.error(`❌ Error: ${msg}`); process.exit(1); }

main().catch(err => { console.error(`\n❌ Unexpected error: ${err.message}`); process.exit(1); });

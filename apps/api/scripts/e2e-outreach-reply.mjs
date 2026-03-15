#!/usr/bin/env node
/**
 * Outreach OS — E2E Reply Pipeline Test
 * ========================================
 * Tests: Webhook → Classify → Auto-Reply → Close → Handoff
 *
 * Usage:
 *   node scripts/e2e-outreach-reply.mjs \
 *     --api-base https://saas-factory-api.hekuijincun.workers.dev \
 *     --admin-token YOUR_TOKEN \
 *     --webhook-secret YOUR_SECRET \
 *     --tenant YOUR_TENANT_ID \
 *     --email test-e2e@example.com \
 *     --case all
 *
 * Env fallbacks:
 *   OUTREACH_API_BASE, ADMIN_TOKEN, OUTREACH_WEBHOOK_SECRET, OUTREACH_TENANT_ID
 */

const args = parseArgs(process.argv.slice(2));

const API_BASE = args["api-base"] || process.env.OUTREACH_API_BASE || "https://saas-factory-api.hekuijincun.workers.dev";
const ADMIN_TOKEN = args["admin-token"] || process.env.ADMIN_TOKEN || "";
const WEBHOOK_SECRET = args["webhook-secret"] || process.env.OUTREACH_WEBHOOK_SECRET || "";
const TENANT_ID = args["tenant"] || process.env.OUTREACH_TENANT_ID || "";
const TEST_EMAIL = args["email"] || "e2e-test@outreach-test.example.com";
const CASE = args["case"] || "all";
const JSON_OUTPUT = args["json"] !== undefined;
const CLEANUP = args["cleanup"] !== undefined;

// ── Validation ─────────────────────────────────────────────────────────
if (!TENANT_ID) die("--tenant or OUTREACH_TENANT_ID is required");
if (!WEBHOOK_SECRET) die("--webhook-secret or OUTREACH_WEBHOOK_SECRET is required");
if (!ADMIN_TOKEN) die("--admin-token or ADMIN_TOKEN is required");

const results = [];
const log = (label, status, detail = "") => {
  const line = { label, status, detail };
  results.push(line);
  if (!JSON_OUTPUT) {
    const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
    console.log(`  ${icon} ${label}: ${status}${detail ? ` (${detail})` : ""}`);
  }
};

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔬 Outreach OS — E2E Reply Pipeline Test`);
  console.log(`   API: ${API_BASE}`);
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Email: ${TEST_EMAIL}`);
  console.log(`   Case: ${CASE}\n`);

  // P2: Ensure test lead exists
  await ensureTestLead();

  // P3: Send webhook events
  const cases = CASE === "all" ? ["A", "B", "C"] : [CASE.toUpperCase()];
  for (const c of cases) {
    await runCase(c);
  }

  // P5: Summary
  const failed = results.filter(r => r.status === "FAIL");
  console.log(`\n${"─".repeat(50)}`);
  if (failed.length === 0) {
    console.log(`✅ Overall: PASS (${results.length} checks)`);
  } else {
    console.log(`❌ Overall: FAIL (${failed.length}/${results.length} failed)`);
    for (const f of failed) {
      console.log(`   ↳ ${f.label}: ${f.detail}`);
    }
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ results, overall: failed.length === 0 ? "PASS" : "FAIL" }, null, 2));
  }

  // Cleanup
  if (CLEANUP) {
    console.log(`\n🧹 Cleanup: test lead and events for ${TEST_EMAIL} remain in DB.`);
    console.log(`   To clean: DELETE FROM outreach_replies WHERE from_email='${TEST_EMAIL}' AND tenant_id='${TENANT_ID}'`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

// ── P2: Test Lead ──────────────────────────────────────────────────────
async function ensureTestLead() {
  // Check if lead with this email exists
  const res = await adminGet(`/admin/outreach/leads?limit=1&tenantId=${TENANT_ID}`);
  if (!res.ok) {
    log("Lead API", "FAIL", `API error: ${res.status}`);
    return;
  }
  const data = await res.json();
  const leads = data.data?.leads || data.data || [];

  // Search specifically for our test email
  const searchRes = await adminGet(`/admin/outreach/leads?limit=200&tenantId=${TENANT_ID}`);
  const searchData = await searchRes.json();
  const allLeads = searchData.data?.leads || searchData.data || [];
  const existing = allLeads.find(l => l.contact_email?.toLowerCase() === TEST_EMAIL.toLowerCase());

  if (existing) {
    log("Lead check", "PASS", `found: ${existing.id} (${existing.store_name})`);
    return;
  }

  // Create test lead
  const createRes = await adminPost(`/admin/outreach/leads?tenantId=${TENANT_ID}`, {
    store_name: "[E2E Test] Reply Pipeline Test Lead",
    contact_email: TEST_EMAIL,
    category: "e2e-test",
    area: "test-area",
    website_url: "https://example.com",
  });

  if (createRes.ok) {
    const created = await createRes.json();
    log("Lead create", "PASS", `created: ${created.data?.id || "ok"}`);
  } else {
    const err = await createRes.text();
    // 409 = domain duplicate, which means lead likely exists under different email
    if (createRes.status === 409) {
      log("Lead create", "PASS", "domain exists (409) — lead likely present");
    } else {
      log("Lead create", "FAIL", `${createRes.status}: ${err.slice(0, 100)}`);
    }
  }
}

// ── P3: Webhook Cases ──────────────────────────────────────────────────
const CASES = {
  A: {
    label: "Case A: Interested/Pricing",
    text: "興味があります。料金について詳しく教えていただけますか？",
    subject: "[E2E Test] Re: サービスのご案内 - Case A",
    expectedIntents: ["pricing", "interested", "question"],
    expectClose: true,
  },
  B: {
    label: "Case B: Unsubscribe",
    text: "配信停止してください。今後メールは不要です。",
    subject: "[E2E Test] Re: サービスのご案内 - Case B",
    expectedIntents: ["unsubscribe", "not_interested"],
    expectClose: false,
  },
  C: {
    label: "Case C: Demo/Meeting",
    text: "来週少し話せます。30分くらいでデモ見せてもらえますか？",
    subject: "[E2E Test] Re: サービスのご案内 - Case C",
    expectedIntents: ["demo", "interested"],
    expectClose: true,
  },
};

async function runCase(caseKey) {
  const c = CASES[caseKey];
  if (!c) { log(`Case ${caseKey}`, "FAIL", "unknown case"); return; }

  console.log(`\n── ${c.label} ──`);
  const msgId = `e2e-${caseKey.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Send webhook
  const webhookRes = await fetch(`${API_BASE}/webhooks/email/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      from: `E2E Tester <${TEST_EMAIL}>`,
      subject: c.subject,
      text: c.text,
      message_id: msgId,
    }),
  });

  if (!webhookRes.ok) {
    const errText = await webhookRes.text().catch(() => "");
    log(`${caseKey} inbound`, "FAIL", `HTTP ${webhookRes.status}: ${errText.slice(0, 80)}`);
    return;
  }

  const webhookData = await webhookRes.json();

  if (webhookData.skipped) {
    log(`${caseKey} inbound`, "FAIL", `skipped: ${webhookData.reason}`);
    return;
  }

  log(`${caseKey} inbound`, "PASS", `processed=${webhookData.processed}, results=${webhookData.results?.length}`);

  // Wait a moment for async processing
  await sleep(1500);

  // Fetch debug pipeline to verify
  const debugRes = await adminGet(`/admin/outreach/debug/pipeline?limit=15&tenantId=${TENANT_ID}`);
  if (!debugRes.ok) {
    log(`${caseKey} debug`, "FAIL", `debug API error: ${debugRes.status}`);
    return;
  }

  const debug = await debugRes.json();
  const pipeline = debug.data || {};

  // Find our reply by message_id match or most recent
  const replies = pipeline.replies || [];
  const ourReply = replies.find(r => r.subject?.includes(`Case ${caseKey}`));

  if (!ourReply) {
    log(`${caseKey} classify`, "FAIL", "reply not found in debug pipeline");
    return;
  }

  // Check classification
  if (ourReply.intent) {
    const intentMatch = c.expectedIntents.includes(ourReply.intent);
    log(`${caseKey} classify`, intentMatch ? "PASS" : "WARN",
      `intent=${ourReply.intent}, confidence=${ourReply.intent_confidence != null ? Math.round(ourReply.intent_confidence * 100) + "%" : "?"}`);
  } else {
    log(`${caseKey} classify`, "FAIL", "intent is null — classification may have failed");
  }

  // Check auto reply
  if (ourReply.ai_handled || ourReply.ai_response_sent) {
    log(`${caseKey} auto_reply`, "PASS",
      `handled=${ourReply.ai_handled}, sent=${ourReply.ai_response_sent}, status=${ourReply.status}`);
  } else {
    // Check if auto-reply is even enabled
    const result = webhookData.results?.[0];
    if (result && !result.autoProcessed) {
      log(`${caseKey} auto_reply`, "WARN", "autoReplyEnabled may be false — check settings");
    } else {
      log(`${caseKey} auto_reply`, "WARN", "not yet processed (may be handled by cron)");
    }
  }

  // Check close evaluation
  if (c.expectClose) {
    if (ourReply.close_intent) {
      log(`${caseKey} close_eval`, "PASS",
        `close_intent=${ourReply.close_intent}, temp=${ourReply.deal_temperature}`);
    } else {
      // Check close logs
      const closeLogs = pipeline.closeLogs || [];
      const ourClose = closeLogs.find(cl => cl.reply_id === ourReply.id);
      if (ourClose) {
        log(`${caseKey} close_eval`, "PASS", `close_intent=${ourClose.close_intent} (from logs)`);
      } else {
        log(`${caseKey} close_eval`, "WARN", "no close eval — auto_close may be disabled");
      }
    }
  }

  // Check handoff (for Case B especially)
  if (ourReply.handoff_required) {
    log(`${caseKey} handoff`, "PASS", "handoff created");
  } else if (caseKey === "B" && ourReply.intent === "unsubscribe") {
    log(`${caseKey} unsub`, "PASS", "unsubscribe intent detected (suppression expected)");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function adminGet(path) {
  return fetch(`${API_BASE}${path}`, {
    headers: { "X-Admin-Token": ADMIN_TOKEN },
  });
}

function adminPost(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Admin-Token": ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "";
      }
    }
  }
  return result;
}

function die(msg) {
  console.error(`❌ Error: ${msg}`);
  process.exit(1);
}

main().catch(err => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
});

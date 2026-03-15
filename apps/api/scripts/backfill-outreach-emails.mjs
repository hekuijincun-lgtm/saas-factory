#!/usr/bin/env node
/**
 * Outreach OS — Email Enrichment Backfill
 * =========================================
 * Finds leads without contact_email, crawls their website for email addresses,
 * and updates the lead record.
 *
 * Strategy:
 *   1. Check outreach_lead_features.raw_signals_json for already-extracted emails
 *   2. If no features or no emails: fetch website + /contact + /about subpages
 *   3. Extract emails via regex (same pattern as analyzer.ts)
 *   4. Score and select best email (domain email > free email)
 *   5. Update lead.contact_email (--apply only)
 *
 * Usage:
 *   node scripts/backfill-outreach-emails.mjs \
 *     --admin-token TOKEN --tenant TENANT_ID \
 *     [--limit 50] [--dry-run] [--apply]
 *
 * Env: ADMIN_TOKEN, OUTREACH_TENANT_ID, OUTREACH_API_BASE
 */

const args = parseArgs(process.argv.slice(2));
const API_BASE = args["api-base"] || process.env.OUTREACH_API_BASE || "https://saas-factory-api.hekuijincun.workers.dev";
const TOKEN = args["admin-token"] || process.env.ADMIN_TOKEN || "";
const TENANT = args["tenant"] || process.env.OUTREACH_TENANT_ID || "";
const LIMIT = Number(args["limit"] || "50");
const DRY_RUN = args["apply"] === undefined; // default is dry-run
const FETCH_TIMEOUT = 8000;
const MAX_BODY = 512 * 1024;

if (!TENANT) die("--tenant required");
if (!TOKEN) die("--admin-token required");

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EXCLUDE_DOMAINS = ["example.com", "wixpress.com", "sentry.io", "w3.org", "schema.org", "googleapis.com", "gravatar.com", "wordpress.org"];
const FREE_DOMAINS = ["gmail.com", "yahoo.co.jp", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "me.com"];
const CONTACT_PATHS = ["/contact", "/contact-us", "/inquiry", "/about", "/company", "/お問い合わせ", "/会社概要"];

const stats = { total: 0, hasWebsite: 0, alreadyHasFeatureEmail: 0, crawled: 0, emailFound: 0, emailUpdated: 0, noEmail: 0, fetchFailed: 0, formOnly: 0, igOnly: 0, lineOnly: 0, noWebsite: 0 };

async function main() {
  console.log(`\n📧 Outreach OS — Email Enrichment Backfill`);
  console.log(`   API:     ${API_BASE}`);
  console.log(`   Tenant:  ${TENANT}`);
  console.log(`   Limit:   ${LIMIT}`);
  console.log(`   Mode:    ${DRY_RUN ? "DRY RUN (no changes)" : "APPLY (will update leads)"}\n`);

  // Fetch leads without contact_email
  const res = await get(`/admin/outreach/leads?tenantId=${TENANT}&limit=200`);
  if (!res.ok) { die(`Failed to fetch leads: HTTP ${res.status}`); }
  const allLeads = (await res.json()).data?.leads || (await res.json()).data || [];

  // Filter: no contact_email
  const targets = (Array.isArray(allLeads) ? allLeads : []).filter(l => !l.contact_email).slice(0, LIMIT);
  stats.total = targets.length;
  console.log(`Found ${stats.total} leads without contact_email (limit=${LIMIT})\n`);

  for (const lead of targets) {
    const name = (lead.store_name || "?").slice(0, 30);
    const webUrl = lead.website_url || "";

    if (!webUrl) {
      stats.noWebsite++;
      const channel = lead.instagram_url ? "instagram" : lead.line_url ? "line" : "none";
      if (channel === "instagram") stats.igOnly++;
      if (channel === "line") stats.lineOnly++;
      console.log(`  ⬜ ${name}  — no website (channel=${channel})`);
      continue;
    }
    stats.hasWebsite++;

    // Step 1: Try extracting from website
    const emails = await extractEmailsFromSite(webUrl);

    if (emails.length === 0) {
      stats.noEmail++;
      // Check for contact form indicators
      const hasForm = await hasContactForm(webUrl);
      if (hasForm) {
        stats.formOnly++;
        console.log(`  🔲 ${name}  — form only (no email found)`);
      } else {
        console.log(`  ❌ ${name}  — no email found`);
      }
      continue;
    }

    // Step 2: Score and select best email
    const best = selectBestEmail(emails, webUrl);
    stats.emailFound++;

    const isFree = FREE_DOMAINS.some(d => best.email.endsWith(`@${d}`));
    const label = isFree ? "free" : "domain";

    if (DRY_RUN) {
      console.log(`  ✅ ${name}  — found: ${best.email} (${label}, from: ${best.source})`);
    } else {
      // Apply: update lead
      const updateRes = await post(`/admin/outreach/leads/${lead.id}?tenantId=${TENANT}`, {
        contact_email: best.email,
      }, "PATCH");

      if (updateRes.ok) {
        stats.emailUpdated++;
        console.log(`  ✅ ${name}  — updated: ${best.email} (${label})`);
      } else {
        console.log(`  ⚠️ ${name}  — found ${best.email} but update failed: HTTP ${updateRes.status}`);
      }
    }
  }

  // Summary
  console.log(`\n${"─".repeat(50)}`);
  console.log(`📊 Summary:`);
  console.log(`   Total processed:    ${stats.total}`);
  console.log(`   Has website:        ${stats.hasWebsite}`);
  console.log(`   Email found:        ${stats.emailFound}`);
  console.log(`   Email updated:      ${DRY_RUN ? "(dry run)" : stats.emailUpdated}`);
  console.log(`   No email:           ${stats.noEmail}`);
  console.log(`   Form only:          ${stats.formOnly}`);
  console.log(`   No website:         ${stats.noWebsite}`);
  console.log(`   Instagram only:     ${stats.igOnly}`);
  console.log(`   LINE only:          ${stats.lineOnly}`);
  console.log(`   Fetch failed:       ${stats.fetchFailed}`);

  if (DRY_RUN && stats.emailFound > 0) {
    console.log(`\n💡 Run with --apply to update ${stats.emailFound} leads`);
  }
}

// ── Email extraction ────────────────────────────────────────────────────
async function extractEmailsFromSite(baseUrl) {
  const found = [];

  // Fetch top page
  const topEmails = await extractEmailsFromPage(baseUrl);
  for (const e of topEmails) found.push({ email: e, source: "top" });

  // If nothing found on top page, try contact subpages
  if (found.length === 0) {
    let origin;
    try { origin = new URL(baseUrl).origin; } catch { return found; }

    for (const path of CONTACT_PATHS) {
      if (found.length > 0) break; // stop once we find something
      const subEmails = await extractEmailsFromPage(`${origin}${path}`);
      for (const e of subEmails) found.push({ email: e, source: path });
    }
  }

  return found;
}

async function extractEmailsFromPage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SaaSFactoryBot/1.0 (email-enrichment; +https://saas-factory.dev)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return [];

    // Stream limited body
    const reader = res.body?.getReader();
    if (!reader) return [];
    let chunks = [];
    let totalLen = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
      if (totalLen >= MAX_BODY) break;
    }
    reader.cancel().catch(() => {});

    const html = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));

    // Extract emails
    const raw = html.match(EMAIL_RE) || [];
    const unique = [...new Set(raw)].filter(e => {
      const domain = e.split("@")[1]?.toLowerCase() || "";
      return !EXCLUDE_DOMAINS.some(d => domain.includes(d));
    });

    return unique.slice(0, 10);
  } catch (err) {
    stats.fetchFailed++;
    return [];
  }
}

async function hasContactForm(baseUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(baseUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "SaaSFactoryBot/1.0", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes("<form") && (html.includes("お問い合わせ") || html.includes("contact") || html.includes("inquiry"));
  } catch { return false; }
}

function selectBestEmail(candidates, websiteUrl) {
  let siteDomain = "";
  try { siteDomain = new URL(websiteUrl).hostname.replace(/^www\./, ""); } catch {}

  // Prefer domain email matching the website
  const domainMatch = candidates.find(c => {
    const emailDomain = c.email.split("@")[1]?.toLowerCase() || "";
    return emailDomain === siteDomain || siteDomain.includes(emailDomain) || emailDomain.includes(siteDomain);
  });
  if (domainMatch) return domainMatch;

  // Prefer non-free email
  const nonFree = candidates.find(c => {
    const emailDomain = c.email.split("@")[1]?.toLowerCase() || "";
    return !FREE_DOMAINS.includes(emailDomain);
  });
  if (nonFree) return nonFree;

  // Fallback to first found
  return candidates[0];
}

// ── HTTP helpers ────────────────────────────────────────────────────────
function get(path) {
  return fetch(`${API_BASE}${path}`, { headers: { "X-Admin-Token": TOKEN } });
}
function post(path, body, method = "POST") {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: { "X-Admin-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

main().catch(err => { console.error(`\n❌ ${err.message}`); process.exit(1); });

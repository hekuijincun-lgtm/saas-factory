#!/usr/bin/env node
/**
 * KV Migration: Stripe → PAY.JP
 *
 * This script migrates existing tenant subscription data from Stripe-format
 * keys/fields to PAY.JP-format keys/fields.
 *
 * What it does:
 * 1. Lists all `stripe:customer:*` keys and creates corresponding `payjp:customer:*` keys
 * 2. Updates `settings:{tenantId}.subscription` fields:
 *    - stripeCustomerId → payjpCustomerId
 *    - stripeSubscriptionId → payjpSubscriptionId
 *    - Removes stripeSessionId
 * 3. Lists all `stripe:session:used:*` keys and creates `payjp:subscription:used:*` keys
 *
 * Usage:
 *   # Dry run (default)
 *   node scripts/migrate-stripe-to-payjp.mjs
 *
 *   # Actually write changes
 *   node scripts/migrate-stripe-to-payjp.mjs --execute
 *
 * Prerequisites:
 *   Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars,
 *   or run via wrangler (which sets them automatically).
 *
 * NOTE: This script uses the Cloudflare KV REST API.
 *       You need to set KV_NAMESPACE_ID to the production namespace ID.
 */

const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || 'b3bde2eb54cc4e91a69998c89f948b18';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DRY_RUN = !process.argv.includes('--execute');

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}`;
const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

async function kvGet(key) {
  const res = await fetch(`${BASE}/values/${encodeURIComponent(key)}`, { headers });
  if (!res.ok) return null;
  return res.text();
}

async function kvPut(key, value) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] PUT ${key} = ${value.slice(0, 100)}...`);
    return;
  }
  const res = await fetch(`${BASE}/values/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    body: value,
  });
  if (!res.ok) {
    console.error(`  FAILED PUT ${key}: ${res.status}`);
  }
}

async function kvList(prefix) {
  const keys = [];
  let cursor;
  do {
    const url = new URL(`${BASE}/keys`);
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers });
    const json = await res.json();
    for (const k of json.result ?? []) keys.push(k.name);
    cursor = json.result_info?.cursor;
  } while (cursor);
  return keys;
}

async function main() {
  console.log(`\n=== Stripe → PAY.JP KV Migration ${DRY_RUN ? '(DRY RUN)' : '(EXECUTING)'} ===\n`);

  // 1. Migrate stripe:customer:* → payjp:customer:*
  console.log('Step 1: Migrating customer reverse-index keys...');
  const customerKeys = await kvList('stripe:customer:');
  console.log(`  Found ${customerKeys.length} stripe:customer:* keys`);

  for (const key of customerKeys) {
    const tenantId = await kvGet(key);
    if (!tenantId) continue;
    const customerId = key.replace('stripe:customer:', '');
    const newKey = `payjp:customer:${customerId}`;
    console.log(`  ${key} → ${newKey} (tenant: ${tenantId})`);
    await kvPut(newKey, tenantId);
  }

  // 2. Migrate settings:{tenantId}.subscription fields
  console.log('\nStep 2: Migrating subscription fields in tenant settings...');
  const settingsKeys = await kvList('settings:');
  let migrated = 0;

  for (const key of settingsKeys) {
    const raw = await kvGet(key);
    if (!raw) continue;
    let settings;
    try { settings = JSON.parse(raw); } catch { continue; }

    const sub = settings.subscription;
    if (!sub) continue;
    if (!sub.stripeCustomerId && !sub.stripeSubscriptionId && !sub.stripeSessionId) continue;

    console.log(`  ${key}: migrating subscription fields`);
    const updated = { ...sub };
    if (sub.stripeCustomerId) {
      updated.payjpCustomerId = sub.stripeCustomerId;
      delete updated.stripeCustomerId;
    }
    if (sub.stripeSubscriptionId) {
      updated.payjpSubscriptionId = sub.stripeSubscriptionId;
      delete updated.stripeSubscriptionId;
    }
    delete updated.stripeSessionId;

    settings.subscription = updated;

    // Also update integrations.stripe → integrations.payjp
    if (settings.integrations?.stripe) {
      settings.integrations.payjp = { connected: settings.integrations.stripe.connected };
      delete settings.integrations.stripe;
    }

    await kvPut(key, JSON.stringify(settings));
    migrated++;
  }
  console.log(`  Migrated ${migrated} tenant settings`);

  // 3. Migrate stripe:session:used:* → payjp:subscription:used:*
  console.log('\nStep 3: Migrating session-used keys...');
  const sessionKeys = await kvList('stripe:session:used:');
  console.log(`  Found ${sessionKeys.length} stripe:session:used:* keys`);

  for (const key of sessionKeys) {
    const tenantId = await kvGet(key);
    if (!tenantId) continue;
    const sessionId = key.replace('stripe:session:used:', '');
    const newKey = `payjp:subscription:used:${sessionId}`;
    console.log(`  ${key} → ${newKey}`);
    await kvPut(newKey, tenantId);
  }

  console.log(`\n=== Migration complete ${DRY_RUN ? '(DRY RUN — no changes written)' : ''} ===\n`);
  if (DRY_RUN) {
    console.log('Run with --execute to apply changes.\n');
  }
}

main().catch(console.error);

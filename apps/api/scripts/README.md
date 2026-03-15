# Outreach OS — E2E Test Scripts

## Auto Send Test

Verifies the full outreach pipeline: Lead → AI Draft → Approve → Send → delivery_event.

### Quick Start

```bash
cd apps/api
pnpm test:auto-send -- --admin-token YOUR_TOKEN --tenant YOUR_TENANT_ID
```

### Options

| Flag | Env Fallback | Required | Description |
|------|-------------|----------|-------------|
| `--admin-token` | `ADMIN_TOKEN` | Yes | Workers admin API token |
| `--tenant` | `OUTREACH_TENANT_ID` | Yes | Target tenant ID |
| `--api-base` | `OUTREACH_API_BASE` | No | API URL (default: production) |
| `--retries` | — | No | Pipeline verify retries (default: 3) |
| `--json` | — | No | Output machine-readable JSON |

### What It Tests

1. Creates a test lead (`[E2E] Auto Send Test ...`)
2. Generates an AI draft via OpenAI
3. Approves the draft
4. Sends via the configured provider (safe_mode or real_mode)
5. Verifies `delivery_event.status == "sent"` in the debug pipeline

### Common Failures

| Error | Cause | Fix |
|-------|-------|-----|
| HTTP 401 | Bad admin token | Check ADMIN_TOKEN |
| HTTP 500 at draft | Missing OPENAI_API_KEY | `wrangler secret put OPENAI_API_KEY --env production` |
| HTTP 400 at send | Lead has no contact_email, or cooldown active | Check lead data |
| HTTP 429 at send | Rate limit hit | Wait or increase dailyCap in settings |
| Pipeline missing | Timing or tenant mismatch | Increase `--retries` or check tenant |

### Example Output

```
🔬 Outreach OS — E2E Auto Send Test
   API:    https://saas-factory-api.hekuijincun.workers.dev
   Tenant: my_tenant
   Email:  e2e-send-1710489600000@outreach-test.example.com

  ✅ Preflight: PASS (API reachable, sendMode=safe)

── Step 1: Create test lead ──
  ✅ Lead create: PASS (id=sl_abc123)

── Step 2: Generate AI draft ──
  ✅ Draft generate: PASS (draftId=dm_xyz, subject="サービスのご案内")

── Step 3: Approve ──
  ✅ Approve: PASS (status=approved)

── Step 4: Send message ──
  ✅ Send: PASS (sent=true, provider=safe_mode, mode=safe)

── Step 5: Verify pipeline ──
  ✅ Delivery event: PASS (event_type=sent, status=sent, channel=email)
  ✅ VERIFIED: PASS (delivery_event.status == sent ✓)

──────────────────────────────────────────────────
✅ Overall: PASS (8 checks, 0 warnings)
```

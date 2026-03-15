#!/bin/bash
# Outreach OS — Test Helper Script
# Usage: ./test-outreach.sh <API_BASE> <ADMIN_TOKEN> <TENANT_ID>
# Example: ./test-outreach.sh https://your-worker.workers.dev YOUR_TOKEN tenant_abc

set -e

API_BASE="${1:?Usage: $0 <API_BASE> <ADMIN_TOKEN> <TENANT_ID>}"
TOKEN="${2:?Missing ADMIN_TOKEN}"
TENANT="${3:?Missing TENANT_ID}"
WEBHOOK_SECRET="${4:-test-webhook-secret-123}"

echo "=== Outreach OS Test Suite ==="
echo "API: $API_BASE"
echo "Tenant: $TENANT"
echo ""

# ── 1. Auto Send: Check settings ──
echo "--- 1. GET /admin/outreach/settings ---"
curl -s "$API_BASE/admin/outreach/settings?tenantId=$TENANT" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(raw response above)"
echo ""

# ── 2. Reply Ingest: Manual test ──
echo "--- 2. POST /admin/outreach/replies/ingest (manual test) ---"
REPLY_RESULT=$(curl -s -X POST "$API_BASE/admin/outreach/replies/ingest?tenantId=$TENANT" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"lead_id\": \"test_lead_001\",
    \"reply_text\": \"料金について教えてください。月額プランはありますか？\",
    \"reply_source\": \"email\",
    \"from_email\": \"test@example.com\",
    \"subject\": \"Re: サービスのご案内\"
  }")
echo "$REPLY_RESULT" | python3 -m json.tool 2>/dev/null || echo "$REPLY_RESULT"
echo ""

# ── 3. Webhook Ingest: Simulated Resend inbound ──
echo "--- 3. POST /webhooks/email/inbound (webhook test) ---"
WEBHOOK_RESULT=$(curl -s -X POST "$API_BASE/webhooks/email/inbound" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"email.received\",
    \"data\": {
      \"from\": \"TestSender <webhook-test@example.com>\",
      \"to\": \"outreach@yourdomain.com\",
      \"subject\": \"Re: お問い合わせありがとうございます\",
      \"text\": \"興味があります。詳しい資料を送っていただけますか？\",
      \"message_id\": \"test-msg-$(date +%s)\"
    }
  }")
echo "$WEBHOOK_RESULT" | python3 -m json.tool 2>/dev/null || echo "$WEBHOOK_RESULT"
echo ""

# ── 4. List replies ──
echo "--- 4. GET /admin/outreach/auto-reply/list ---"
curl -s "$API_BASE/admin/outreach/auto-reply/list?tenantId=$TENANT&limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(raw)"
echo ""

# ── 5. Check unsubscribe list ──
echo "--- 5. GET /admin/outreach/unsubscribes ---"
curl -s "$API_BASE/admin/outreach/unsubscribes?tenantId=$TENANT" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(raw)"
echo ""

# ── 6. Analytics (reply rate check) ──
echo "--- 6. GET /admin/outreach/analytics ---"
curl -s "$API_BASE/admin/outreach/analytics?tenantId=$TENANT" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(raw)"
echo ""

# ── 7. Health check ──
echo "--- 7. GET /admin/outreach/health/$TENANT ---"
curl -s "$API_BASE/admin/outreach/health/$TENANT" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(raw)"
echo ""

echo "=== Test Complete ==="
echo ""
echo "Next steps:"
echo "  1. Verify reply was ingested (check step 4 output)"
echo "  2. Verify intent was classified (look for 'pricing' intent)"
echo "  3. Test auto-send: Create schedule with mode=auto_send, run-now"
echo "  4. Test safe mode: Ensure sendMode=safe in settings"
echo "  5. Test real mode: Set sendMode=real + RESEND_API_KEY"

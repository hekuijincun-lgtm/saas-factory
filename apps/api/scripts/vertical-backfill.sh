#!/usr/bin/env bash
# ============================================================
# Phase 5b: Vertical Backfill Script
#
# Populates new-path fields from legacy eyebrow fields:
#   settings.verticalConfig      ← settings.eyebrow
#   menu[i].verticalAttributes   ← menu[i].eyebrow
#   staff[i].verticalAttributes  ← staff[i].eyebrow
#   meta.verticalData            ← meta.eyebrowDesign
#
# Usage:
#   ./vertical-backfill.sh status  <tenantId>           # readiness check
#   ./vertical-backfill.sh dry-run <tenantId> [scope]   # scan only
#   ./vertical-backfill.sh apply   <tenantId> [scope]   # apply changes
#
# scope: all | settings | menu | staff | reservations (default: all)
#
# Environment:
#   API_BASE   — Workers API URL (default: https://saas-factory-api.hekuijincun.workers.dev)
#   ADMIN_TOKEN — admin bearer token
# ============================================================

set -euo pipefail

API_BASE="${API_BASE:-https://saas-factory-api.hekuijincun.workers.dev}"
ADMIN_TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN is required}"

ACTION="${1:?Usage: $0 <status|dry-run|apply> <tenantId> [scope]}"
TENANT_ID="${2:?Usage: $0 <status|dry-run|apply> <tenantId> [scope]}"
SCOPE="${3:-all}"

echo "=== Vertical Backfill ==="
echo "Action:    $ACTION"
echo "Tenant:    $TENANT_ID"
echo "Scope:     $SCOPE"
echo "API Base:  $API_BASE"
echo "========================="
echo ""

case "$ACTION" in
  status)
    echo "[STATUS] Checking readiness for tenant: $TENANT_ID"
    curl -s -X GET \
      "${API_BASE}/admin/backfill/vertical/status?tenantId=${TENANT_ID}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  dry-run)
    echo "[DRY-RUN] Scanning tenant: $TENANT_ID (scope: $SCOPE)"
    echo "No data will be modified."
    echo ""
    curl -s -X POST \
      "${API_BASE}/admin/backfill/vertical?tenantId=${TENANT_ID}&dryRun=1&scope=${SCOPE}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  apply)
    echo "[APPLY] Writing changes for tenant: $TENANT_ID (scope: $SCOPE)"
    echo ""
    read -p "Are you sure? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 1
    fi
    curl -s -X POST \
      "${API_BASE}/admin/backfill/vertical?tenantId=${TENANT_ID}&dryRun=0&scope=${SCOPE}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
    echo ""

    # Auto-verify: run status after apply
    echo ""
    echo "[VERIFY] Post-apply status:"
    curl -s -X GET \
      "${API_BASE}/admin/backfill/vertical/status?tenantId=${TENANT_ID}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  *)
    echo "Unknown action: $ACTION"
    echo "Usage: $0 <status|dry-run|apply> <tenantId> [scope]"
    exit 1
    ;;
esac

echo "Done."

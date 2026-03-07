#!/usr/bin/env python3
"""
E2E Multi-Tenant Isolation Test Suite for SaaS Factory.

Tests:
  1. Settings isolation (KV) — requires --admin-token
  2. Staff isolation (KV) — requires --admin-token
  3. Menu isolation (KV) — requires --admin-token
  4. Reservation isolation (D1)
  5. Cross-tenant same-slot booking
  6. Same-tenant same-slot conflict
  7. /slots and /reserve alignment
  8. Tenant ID propagation via proxy
  9. debug parameter passthrough
 10. Default fallback

Usage:
  python3 scripts/e2e-tenant-isolation.py [--base URL] [--admin-token TOKEN]

Defaults to production Workers API.
"""

import urllib.request
import json
import ssl
import sys
import time
from datetime import datetime, timedelta

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'https://saas-factory-api.hekuijincun.workers.dev'
ADMIN_TOKEN = sys.argv[sys.argv.index('--admin-token') + 1] if '--admin-token' in sys.argv else None
CTX = ssl.create_default_context()
UA = {'User-Agent': 'Mozilla/5.0 E2E-TenantIsolation/1.0', 'Content-Type': 'application/json'}

PASS_COUNT = 0
FAIL_COUNT = 0
SKIP_COUNT = 0

def api(method, path, body=None, qs='', headers=None):
    url = f'{BASE}{path}{"?" + qs if qs else ""}'
    data = json.dumps(body).encode() if body else None
    hdrs = {**UA, **(headers or {})}
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
            resp = urllib.request.urlopen(req, context=CTX)
            return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read())
            except:
                return e.code, {'raw': ''}
        except (urllib.error.URLError, ConnectionResetError, OSError) as e:
            if attempt < 2:
                time.sleep(1 + attempt)
                continue
            return 0, {'error': str(e)}
    return 0, {'error': 'max_retries'}

def admin_api(method, path, body=None, qs=''):
    """API call with X-Admin-Token header for admin routes."""
    hdrs = {}
    if ADMIN_TOKEN:
        hdrs['X-Admin-Token'] = ADMIN_TOKEN
    return api(method, path, body=body, qs=qs, headers=hdrs)

def check(label, cond, detail=''):
    global PASS_COUNT, FAIL_COUNT
    if cond:
        PASS_COUNT += 1
        print(f'  \033[32mPASS\033[0m  {label}')
    else:
        FAIL_COUNT += 1
        print(f'  \033[31mFAIL\033[0m  {label}  {detail}')

def skip(label, reason=''):
    global SKIP_COUNT
    SKIP_COUNT += 1
    print(f'  \033[33mSKIP\033[0m  {label}  {reason}')

# Use a future date guaranteed clean
DATE = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
TENANT_A = 'store-aea0'
TENANT_B = 'e2e-isolation-test'  # Non-existent tenant — tests isolation
TENANT_DEFAULT = 'default'

print(f'\n{"="*70}')
print(f'  SaaS Factory — Multi-Tenant Isolation E2E')
print(f'  Base: {BASE}')
print(f'  Date: {DATE}')
print(f'  Tenants: {TENANT_A}, {TENANT_B}, {TENANT_DEFAULT}')
print(f'  Admin token: {"set" if ADMIN_TOKEN else "not set (admin tests will SKIP)"}')
print(f'{"="*70}\n')

# ============================================================
# 1. Settings Isolation (KV)
# ============================================================
print('--- 1. Settings Isolation ---')

code_a, settings_a = admin_api('GET', '/admin/settings', qs=f'tenantId={TENANT_A}')
code_b, settings_b = admin_api('GET', '/admin/settings', qs=f'tenantId={TENANT_B}')
code_d, settings_d = admin_api('GET', '/admin/settings', qs=f'tenantId={TENANT_DEFAULT}')

# Note: admin routes need X-Admin-Token; if 401 we know auth is working
if code_a == 401:
    skip('T1.1: settings A fetch', 'Admin auth required — pass --admin-token')
    skip('T1.2: settings isolation', 'Skipped due to auth')
else:
    check('T1.1: settings A fetch', code_a == 200, f'code={code_a}')
    check('T1.2: settings B fetch independent', code_b == 200, f'code={code_b}')
    # Settings for different tenants should have different KV keys
    # At minimum, storeName or some field should differ (or B returns defaults)
    check('T1.3: settings A != settings B (isolation)',
          settings_a != settings_b,
          'settings objects are identical — possible cross-tenant leak')

# ============================================================
# 2. Staff Isolation (KV)
# ============================================================
print('\n--- 2. Staff Isolation ---')

code_a, staff_a = admin_api('GET', '/admin/staff', qs=f'tenantId={TENANT_A}')
code_b, staff_b = admin_api('GET', '/admin/staff', qs=f'tenantId={TENANT_B}')

if code_a == 401:
    skip('T2.1: staff isolation', 'Admin auth required — pass --admin-token')
    skip('T2.2: staff B different', 'Skipped due to auth')
else:
    staff_a_list = staff_a.get('staff', staff_a.get('data', []))
    staff_b_list = staff_b.get('staff', staff_b.get('data', []))
    check('T2.1: staff A returns data', code_a == 200, f'code={code_a}')
    check('T2.2: staff B empty or different',
          code_b == 200 and staff_b_list != staff_a_list,
          f'A={len(staff_a_list)} items, B={len(staff_b_list)} items')

# ============================================================
# 3. Menu Isolation (KV)
# ============================================================
print('\n--- 3. Menu Isolation ---')

code_a, menu_a = admin_api('GET', '/admin/menu', qs=f'tenantId={TENANT_A}')
code_b, menu_b = admin_api('GET', '/admin/menu', qs=f'tenantId={TENANT_B}')

if code_a == 401:
    skip('T3.1: menu isolation', 'Admin auth required — pass --admin-token')
    skip('T3.2: menu B different', 'Skipped due to auth')
else:
    menu_a_list = menu_a.get('menu', menu_a.get('data', []))
    menu_b_list = menu_b.get('menu', menu_b.get('data', []))
    check('T3.1: menu A returns data', code_a == 200, f'code={code_a}')
    check('T3.2: menu B empty or different',
          code_b == 200 and menu_b_list != menu_a_list,
          f'A={len(menu_a_list)} items, B={len(menu_b_list)} items')

# ============================================================
# 4. Booking/Reservation Isolation (D1)
# ============================================================
print('\n--- 4. Reservation Isolation ---')

# 4a. Get slots for both tenants
code_a, slots_a = api('GET', '/slots', qs=f'tenantId={TENANT_A}&date={DATE}')
code_b, slots_b = api('GET', '/slots', qs=f'tenantId={TENANT_B}&date={DATE}')
code_d, slots_d = api('GET', '/slots', qs=f'tenantId={TENANT_DEFAULT}&date={DATE}')

check('T4.1: slots A ok', code_a == 200, f'code={code_a}')
check('T4.2: slots B ok', code_b == 200, f'code={code_b}')
check('T4.3: slots default ok', code_d == 200, f'code={code_d}')

avail_a = [s for s in slots_a.get('slots', []) if s.get('bookableForMenu', s.get('available'))]
avail_b = [s for s in slots_b.get('slots', []) if s.get('bookableForMenu', s.get('available'))]

# ============================================================
# 5. Cross-Tenant Same-Slot Booking
# ============================================================
print('\n--- 5. Cross-Tenant Same-Slot Booking ---')

if avail_a:
    t = avail_a[0]['time']
    start = f'{DATE}T{t}:00+09:00'
    end_dt = datetime.fromisoformat(start) + timedelta(minutes=45)
    end = end_dt.strftime('%Y-%m-%dT%H:%M:%S+09:00')

    # Reserve on tenant A
    code1, r1 = api('POST', '/reserve', {
        'tenantId': TENANT_A, 'staffId': 'any',
        'startAt': start, 'endAt': end, 'customerName': 'IsolationA'
    }, 'debug=1')
    check('T5.1: tenant A reserve', code1 == 200, f'code={code1} err={r1.get("error")}')

    # Same slot on tenant B — MUST succeed (cross-tenant isolation)
    code2, r2 = api('POST', '/reserve', {
        'tenantId': TENANT_B, 'staffId': 'any',
        'startAt': start, 'endAt': end, 'customerName': 'IsolationB'
    }, 'debug=1')
    check('T5.2: tenant B same slot succeeds (isolation)',
          code2 == 200, f'code={code2} err={r2.get("error")} reason={r2.get("reason")}')

    # Same slot on default — MUST succeed
    code3, r3 = api('POST', '/reserve', {
        'tenantId': TENANT_DEFAULT, 'staffId': 'any',
        'startAt': start, 'endAt': end, 'customerName': 'IsolationD'
    }, 'debug=1')
    check('T5.3: default same slot succeeds (isolation)',
          code3 == 200, f'code={code3} err={r3.get("error")} reason={r3.get("reason")}')
else:
    skip('T5: cross-tenant booking', 'No available slots for tenant A')

# ============================================================
# 6. Same-Tenant Same-Slot Conflict
# ============================================================
print('\n--- 6. Same-Tenant Conflict ---')

if avail_a and len(avail_a) > 1:
    # Use a different slot to avoid collisions with test 5
    t2 = avail_a[1]['time']
    start2 = f'{DATE}T{t2}:00+09:00'
    end_dt2 = datetime.fromisoformat(start2) + timedelta(minutes=45)
    end2 = end_dt2.strftime('%Y-%m-%dT%H:%M:%S+09:00')

    # First reserve
    code, r = api('POST', '/reserve', {
        'tenantId': TENANT_A, 'staffId': 'any',
        'startAt': start2, 'endAt': end2, 'customerName': 'Conflict1'
    }, 'debug=1')
    check('T6.1: 1st reserve', code == 200, f'code={code}')

    # Second reserve — depends on staff count
    code, r = api('POST', '/reserve', {
        'tenantId': TENANT_A, 'staffId': 'any',
        'startAt': start2, 'endAt': end2, 'customerName': 'Conflict2'
    }, 'debug=1')
    # With 2 staff: 200 (auto-assign to 2nd). With 1 staff: 409.
    staff2_ok = code == 200

    # Third reserve — should always fail if 2 staff, or 2nd already failed
    code, r = api('POST', '/reserve', {
        'tenantId': TENANT_A, 'staffId': 'any',
        'startAt': start2, 'endAt': end2, 'customerName': 'Conflict3'
    }, 'debug=1')
    check('T6.2: conflict detected (same tenant, same slot)',
          code == 409,
          f'code={code} err={r.get("error")} reason={r.get("reason")}')
    check('T6.3: conflict has reason field',
          'reason' in r,
          f'keys={list(r.keys())}')
else:
    skip('T6: same-tenant conflict', 'Not enough available slots')

# ============================================================
# 7. /slots and /reserve Alignment
# ============================================================
print('\n--- 7. /slots-/reserve Alignment ---')

# After bookings above, re-check slots
code, d = api('GET', '/slots', qs=f'tenantId={TENANT_A}&date={DATE}&durationMin=45')
if code == 200:
    booked_slot = next((s for s in d['slots'] if s['time'] == t2), None) if avail_a and len(avail_a) > 1 else None
    if booked_slot:
        is_full = not booked_slot.get('bookableForMenu', booked_slot.get('available'))
        check('T7.1: fully booked slot shows x in /slots', is_full,
              f'time={booked_slot["time"]} bookable={booked_slot.get("bookableForMenu")}')

    free_slot = next((s for s in d['slots'] if s.get('bookableForMenu', s.get('available'))), None)
    if free_slot:
        # Reserve at an available slot — should succeed
        t3 = free_slot['time']
        start3 = f'{DATE}T{t3}:00+09:00'
        end_dt3 = datetime.fromisoformat(start3) + timedelta(minutes=45)
        end3 = end_dt3.strftime('%Y-%m-%dT%H:%M:%S+09:00')

        code, r = api('POST', '/reserve', {
            'tenantId': TENANT_A, 'staffId': 'any',
            'startAt': start3, 'endAt': end3, 'customerName': 'AlignTest'
        })
        check('T7.2: available slot reserve succeeds', code == 200,
              f'code={code} err={r.get("error")}')
    else:
        skip('T7.2: no free slots remaining')
else:
    skip('T7: alignment check', f'slots fetch failed: {code}')

# ============================================================
# 8. Tenant ID in /slots Response
# ============================================================
print('\n--- 8. Tenant ID Propagation ---')

code, d = api('GET', '/slots', qs=f'tenantId={TENANT_A}&date={DATE}&debug=1')
check('T8.1: /slots returns tenantId', d.get('tenantId') == TENANT_A,
      f'expected={TENANT_A} got={d.get("tenantId")}')

code, d = api('GET', '/slots', qs=f'tenantId={TENANT_B}&date={DATE}&debug=1')
check('T8.2: /slots tenant B returns tenantId', d.get('tenantId') == TENANT_B,
      f'expected={TENANT_B} got={d.get("tenantId")}')

# ============================================================
# 9. Debug Parameter Passthrough
# ============================================================
print('\n--- 9. Debug Passthrough ---')

# 409 with debug=1 should have _debug
if avail_a and len(avail_a) > 1:
    code, r = api('POST', '/reserve', {
        'tenantId': TENANT_A, 'staffId': 'any',
        'startAt': start2, 'endAt': end2, 'customerName': 'DebugTest'
    }, 'debug=1')
    if code == 409:
        check('T9.1: debug=1 returns _debug', '_debug' in r, f'keys={list(r.keys())}')
        check('T9.2: reason always present', 'reason' in r, f'keys={list(r.keys())}')
    else:
        skip('T9.1-2: expected 409 for debug test', f'got {code}')

    # Without debug, _debug should be absent
    code, r = api('POST', '/reserve', {
        'tenantId': TENANT_A, 'staffId': 'any',
        'startAt': start2, 'endAt': end2, 'customerName': 'NoDebug'
    })
    if code == 409:
        check('T9.3: no debug=1 → no _debug', '_debug' not in r, f'_debug={"_debug" in r}')
        check('T9.4: reason present without debug', 'reason' in r, f'keys={list(r.keys())}')
    else:
        skip('T9.3-4: expected 409', f'got {code}')
else:
    skip('T9: debug passthrough', 'No slots to test with')

# ============================================================
# 10. Tenant Fallback Behavior
# ============================================================
print('\n--- 10. Default Fallback ---')

# Request without tenantId — should fall back to 'default'
code, d = api('GET', '/slots', qs=f'date={DATE}&debug=1')
check('T10.1: missing tenantId falls back to default',
      d.get('tenantId') == 'default',
      f'got tenantId={d.get("tenantId")}')

# Empty tenantId — should also fall back
code, d = api('GET', '/slots', qs=f'tenantId=&date={DATE}&debug=1')
check('T10.2: empty tenantId falls back to default',
      d.get('tenantId') == 'default',
      f'got tenantId={d.get("tenantId")}')

# ============================================================
# 11. Admin Tenant Mismatch Guard
# ============================================================
print('\n--- 11. Tenant Mismatch Guard ---')

# When ENFORCE_TENANT_MISMATCH=1 is set, requests with both
# x-session-tenant-id and ?tenantId that differ should get 403.
# Without the env var, this is a no-op (returns null).
# We test the guard is wired up by checking it doesn't break normal requests.
if ADMIN_TOKEN:
    code, d = admin_api('GET', '/admin/settings', qs=f'tenantId={TENANT_A}')
    check('T11.1: admin settings with matching tenant ok', code == 200, f'code={code}')
    code, d = admin_api('GET', '/admin/menu', qs=f'tenantId={TENANT_A}')
    check('T11.2: admin menu with tenant ok', code == 200, f'code={code}')
    code, d = admin_api('GET', '/admin/staff', qs=f'tenantId={TENANT_A}')
    check('T11.3: admin staff with tenant ok', code == 200, f'code={code}')
else:
    skip('T11.1-3: mismatch guard', 'Admin auth required — pass --admin-token')

# ============================================================
# Summary
# ============================================================
print(f'\n{"="*70}')
total = PASS_COUNT + FAIL_COUNT + SKIP_COUNT
print(f'  Results: {PASS_COUNT} PASS / {FAIL_COUNT} FAIL / {SKIP_COUNT} SKIP / {total} total')
if FAIL_COUNT == 0:
    print(f'  \033[32mALL TESTS PASSED\033[0m')
else:
    print(f'  \033[31m{FAIL_COUNT} TESTS FAILED\033[0m')
print(f'{"="*70}\n')

sys.exit(0 if FAIL_COUNT == 0 else 1)

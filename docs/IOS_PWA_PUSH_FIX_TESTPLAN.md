# iOS PWA Push Notification Fix - Test Plan & Implementation Summary

## 📋 Document Version
- **Date**: 2026-01-03
- **Author**: Principal Engineer (PWA Web Push + iOS Safari)
- **Project**: ROOMRISE CONTROL HUB

---

## 1. ROOT CAUSE DECISION TREE

```
iOS PWA Push failed=1
│
├── HTTP 404/410 (GONE/NOT_FOUND)
│   ├── Cause: Subscription invalid/expired
│   ├── Action: AUTO-HEAL
│   │   ├── Delete subscription from DB
│   │   ├── Audit log: SUBSCRIPTION_DELETED
│   │   └── Response: {needResubscribe: true, reason: "SUBSCRIPTION_GONE"}
│   └── FE Action: Call handlePushResponseAndMaybeResubscribe()
│
├── HTTP 401/403 (UNAUTHORIZED/FORBIDDEN)
│   ├── Cause: VAPID key mismatch (public/private/subject)
│   ├── Action: NO AUTO-HEAL
│   │   ├── Log: VAPID fingerprint + subject
│   │   └── Response: {vapidMismatch: true, reason: "VAPID_UNAUTHORIZED"}
│   └── FE Action: Show error, do NOT resubscribe automatically
│
├── HTTP 400 (BAD_REQUEST)
│   ├── Cause: Payload/headers/content-encoding issue
│   ├── Action: NO AUTO-HEAL
│   │   ├── Log: Full response body for debugging
│   │   └── Response: {badRequest: true, reason: "PUSH_BAD_REQUEST"}
│   └── FE Action: Show error for dev to fix
│
└── Network/Crypto Error
    ├── Cause: Connection failed, JWT creation failed
    ├── Action: Mark subscription failure, don't delete
    └── Response: {failed: 1, error: "message"}
```

---

## 2. FILES MODIFIED/CREATED

### Backend (Supabase Edge Functions)

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/functions/send-push/index.ts` | MODIFIED | Added diagnostic logging, auto-heal, categorized errors |
| `supabase/functions/test-push/index.ts` | MODIFIED | Uses PUSH_TEST event type, logs to debug_push_logs |
| `supabase/functions/vapid-public-key/index.ts` | MODIFIED | Added version/fingerprint for VAPID consistency |

### Database Migration

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/migrations/20250103000001_push_audit_and_dedupe.sql` | CREATED | Audit logs, dedupe, endpoint_host column |

### Frontend (React)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pwa/pushAntiLoop.ts` | CREATED | Anti-loop guardrails: cooldown, single-tab lock |
| `src/pwa/registerSW.ts` | MODIFIED | Integrated anti-loop, added handlePushResponseAndMaybeResubscribe |

---

## 3. JSON RESPONSE SAMPLES

### Success Case
```json
{
  "success": true,
  "requestId": "push_1704261234567_abc123",
  "sent": 1,
  "failed": 0,
  "expired": 0,
  "duplicates": 0,
  "vapidMismatch": 0,
  "badRequest": 0,
  "total_subscriptions": 1
}
```

### needResubscribe Case (404/410)
```json
{
  "success": true,
  "requestId": "push_1704261234567_abc123",
  "sent": 0,
  "failed": 0,
  "expired": 1,
  "needResubscribe": true,
  "reason": "SUBSCRIPTION_GONE",
  "affectedUsers": ["user-uuid-here"]
}
```

### vapidMismatch Case (401/403)
```json
{
  "success": true,
  "requestId": "push_1704261234567_abc123",
  "sent": 0,
  "failed": 0,
  "vapidMismatch": 1,
  "vapidMismatch": true,
  "reason": "VAPID_UNAUTHORIZED"
}
```

### badRequest Case (400)
```json
{
  "success": true,
  "requestId": "push_1704261234567_abc123",
  "sent": 0,
  "failed": 1,
  "badRequest": 1,
  "diagnostics": [{
    "requestId": "push_1704261234567_abc123",
    "endpointHost": "web.push.apple.com",
    "statusCode": 400,
    "responseBodySnippet": "BadDeviceToken...",
    "vapidPublicKeyFingerprint": "12345678",
    "ttl": "86400",
    "encoding": "json"
  }]
}
```

---

## 4. TEST PLAN (8 TEST CASES)

### TC1: iOS PWA Fresh Install → Subscribe → Test Push
**Steps:**
1. Install PWA from Safari "Add to Home Screen"
2. Open PWA, login
3. Enable push notifications in Settings
4. Send Test Push

**Expected:**
- `sent: 1, failed: 0`
- iOS notification appears
- Logs show: `[send-push][requestId] Sending to: web.push.apple.com`

### TC2: iOS PWA Clear Website Data → Resubscribe
**Steps:**
1. Go to iOS Settings > Safari > Clear History and Website Data
2. Open PWA again
3. Enable push notifications
4. Send Test Push

**Expected:**
- New subscription created (old one auto-deleted if 410)
- `sent: 1, failed: 0`
- Audit log: `SUBSCRIPTION_UPSERT`

### TC3: Simulate 410 (Expired Subscription)
**Steps:**
1. Have working push subscription
2. Mock backend to return 410 for push
3. Send Test Push
4. Observe FE response handling

**Expected:**
- Backend: Deletes subscription, logs `SUBSCRIPTION_DELETED`
- Response: `{needResubscribe: true, reason: "SUBSCRIPTION_GONE"}`
- FE: Calls `handlePushResponseAndMaybeResubscribe()`, creates new sub
- After resubscribe: `sent: 1`

### TC4: Simulate 401/403 (VAPID Mismatch)
**Steps:**
1. Have working push subscription
2. Change VAPID_PRIVATE_KEY in Supabase secrets (mismatch)
3. Send Test Push

**Expected:**
- Response: `{vapidMismatch: true, reason: "VAPID_UNAUTHORIZED"}`
- FE: Does NOT auto-resubscribe
- Logs show: `VAPID fingerprint: ...XXXXXXXX, subject: mailto:...`
- User sees error message

### TC5: Simulate 400 (Bad Request)
**Steps:**
1. Modify send-push to send malformed payload
2. Send Test Push

**Expected:**
- Response: `{badRequest: true}`
- FE: Does NOT auto-resubscribe
- Logs show full response body for debugging
- User sees technical error

### TC6: Multi-Tab Lock Test
**Steps:**
1. Open 2 browser tabs with the app
2. In Tab 1: Trigger resubscribe scenario
3. Quickly try to resubscribe in Tab 2

**Expected:**
- Tab 1: Acquires lock, completes resubscribe
- Tab 2: Blocked with message "Another tab is performing resubscribe"
- Lock released after Tab 1 completes

### TC7: Dedupe Test (DB Cleanup)
**Steps:**
1. Manually insert 2 records with same endpoint in push_subscriptions
2. Run migration/dedupe script
3. Query push_subscriptions

**Expected:**
- Only 1 active record remains (newest)
- Older record marked `is_active: false`
- Audit log: `SUBSCRIPTION_DEDUPE_BATCH`

### TC8: Test Push NOT in Notification Feed
**Steps:**
1. Send Test Push multiple times
2. Check notification feed/bell
3. Query `notifications` or `booking_changes` table

**Expected:**
- Test Push appears as iOS notification
- Does NOT appear in app notification feed
- Only logged in `debug_push_logs` table
- `event_type: PUSH_TEST` can be filtered if needed

---

## 5. EXPECTED LOG OUTPUT (SUCCESS)

```
[send-push][push_1704261234567_abc123] Processing PUSH_TEST with key: test:user-uuid:1704261234567
[send-push][push_1704261234567_abc123] VAPID fingerprint: ...12345678, subject: mailto:admin@roomrise.vn
[send-push][push_1704261234567_abc123] Target mode: 1 users
[send-push][push_1704261234567_abc123] Found 1 subscriptions
[send-push][push_1704261234567_abc123] Sending to: web.push.apple.com, isApple: true
[send-push][push_1704261234567_abc123] Apple Push - payload size: 245, vapid: ...12345678
[send-push][push_1704261234567_abc123] Apple response status: 201
[send-push][push_1704261234567_abc123] Results: {"sent":1,"duplicates":0,"failed":0,"expired":0,"vapidMismatch":0,"badRequest":0}
```

---

## 6. EXPECTED LOG OUTPUT (FAILURE - 410)

```
[send-push][push_1704261234567_abc123] Processing PUSH_TEST with key: test:user-uuid:1704261234567
[send-push][push_1704261234567_abc123] Sending to: web.push.apple.com, isApple: true
[send-push][push_1704261234567_abc123] Apple response status: 410
[send-push][push_1704261234567_abc123] Apple error: 410, body: Gone, vapid: ...12345678, subject: mailto:admin@roomrise.vn
[send-push][push_1704261234567_abc123] AUTO-HEAL: Deactivated subscription sub-uuid for user user-uuid, reason: SUBSCRIPTION_GONE
[send-push][push_1704261234567_abc123] Results: {"sent":0,"duplicates":0,"failed":0,"expired":1,"vapidMismatch":0,"badRequest":0}
```

---

## 7. ANTI-LOOP GUARDRAILS SUMMARY

| Guardrail | Value | Description |
|-----------|-------|-------------|
| Cooldown | 10 minutes | Time between resubscribe attempts |
| Max Attempts | 3/hour | After 3 attempts, 1-hour cooldown |
| Lock Timeout | 30 seconds | Max time a tab can hold lock |
| VAPID Mismatch | Never resubscribe | Requires manual VAPID fix |
| Bad Request | Never resubscribe | Requires code fix |

---

## 8. DEPLOYMENT CHECKLIST

- [ ] Run migration: `supabase db push`
- [ ] Deploy edge functions:
  - [ ] `supabase functions deploy send-push`
  - [ ] `supabase functions deploy test-push`
  - [ ] `supabase functions deploy vapid-public-key`
- [ ] Verify VAPID secrets match:
  - [ ] `VITE_VAPID_PUBLIC_KEY` in frontend env
  - [ ] `VAPID_PUBLIC_KEY` in Supabase secrets
  - [ ] `VAPID_PRIVATE_KEY` in Supabase secrets
  - [ ] `VAPID_SUBJECT` in Supabase secrets (mailto: format)
- [ ] Clear existing failed subscriptions (optional):
  ```sql
  UPDATE push_subscriptions 
  SET is_active = false 
  WHERE consecutive_failures >= 3;
  ```
- [ ] Test on iOS device:
  - [ ] TC1: Fresh install
  - [ ] TC2: Clear data resubscribe
  - [ ] TC8: Verify no feed pollution

---

## 9. TROUBLESHOOTING GUIDE

### Issue: `sent=0, failed=1` on iOS

1. **Check logs** in Supabase Dashboard > Edge Functions > Logs
2. Look for `[send-push][requestId]` entries
3. Find `statusCode` and `responseBody`:
   - `410`: Run resubscribe flow
   - `401/403`: Check VAPID keys match
   - `400`: Check payload format

### Issue: Infinite resubscribe loop

1. Check `localStorage` in browser DevTools:
   - `push_resubscribe_cooldown_until`
   - `push_subscribe_lock`
   - `push_resubscribe_attempts`
2. If stuck, run in console:
   ```javascript
   import { resetAllAntiLoopState } from '@/pwa/pushAntiLoop';
   resetAllAntiLoopState();
   ```

### Issue: Duplicate subscriptions

1. Run dedupe query:
   ```sql
   SELECT endpoint, COUNT(*) as cnt 
   FROM push_subscriptions 
   WHERE is_active = true 
   GROUP BY endpoint 
   HAVING COUNT(*) > 1;
   ```
2. Migration should have cleaned this, but run manually if needed.

---

## 10. CONTACT

For issues with this implementation, check:
- Supabase Edge Function logs
- Browser console logs (`[PWA]` and `[PushAntiLoop]` prefixes)
- `debug_push_logs` table for test push history
- `audit_logs` table for subscription lifecycle events

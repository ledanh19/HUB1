# Notification Sync Test Checklist

## Overview
This checklist verifies that notification UI is 100% consistent across:
1. **NotificationBell** (popover feed)
2. **PWA System Notification** (sw.js)
3. **Foreground** (system notification only, toast disabled)

## Pre-requisites
- [ ] VAPID keys configured in Supabase secrets
- [ ] PWA installed on test device
- [ ] Push notification permission granted
- [ ] Test device connected to same Supabase project
- [ ] Config sync verified: `cp src/modules/notifications/notificationConfig.json supabase/functions/_shared/`

---

## CRITICAL TEST: Push Filter Sync (Same as Bell)

### Test A: Tech-only Update => No Push

**Purpose:** Verify tech-only updates (channex_revision_id, guest_name alone, etc.) do NOT trigger push when near a primary event.

**Test Steps:**
1. Create a new booking (INSERT) via Channex webhook
2. Within 10 minutes, send a tech-only UPDATE with `changed_fields: ["channex_revision_id", "updated_at"]`
3. Check push logs and device

**Expected:**
- [ ] INSERT triggers push notification
- [ ] Tech-only UPDATE does NOT trigger push
- [ ] Webhook logs show: `Push SKIPPED by filter: TECH_ONLY_NEAR_PRIMARY`
- [ ] NotificationBell shows only the NEW_BOOKING event

---

### Test B: INSERT + UPDATE Quick => Not Push 2 Times

**Purpose:** Verify rapid INSERT followed by UPDATE doesn't spam user with 2 pushes for the same booking.

**Test Steps:**
1. Send INSERT webhook for booking X
2. Within 5 seconds, send UPDATE webhook for booking X with tech-only changes
3. Check push_deliveries table and device notifications

**Expected:**
- [ ] Only 1 push notification received (for INSERT)
- [ ] push_deliveries has 1 record for this booking (idempotency check)
- [ ] Webhook logs show UPDATE was filtered out

---

### Test C: Config Drift => Push Matches UI

**Purpose:** Verify that push notification title/body matches NotificationBell exactly (no config drift).

**Test Steps:**
1. Run `npm run sync-config` before deploy
2. Check browser console for: `[NotificationConfig] FE config hash: XXXXXXXX`
3. Check Edge Function logs for: `[NotificationConfig] Edge config hash: XXXXXXXX`
4. Verify both hashes match
5. Trigger a BOOKING_NEW event
6. Compare system notification content with Bell popover content

**Expected:**
- [ ] Config sync script ran: `npm run sync-config` 
- [ ] FE console shows config hash
- [ ] Edge logs show SAME config hash
- [ ] Push title: `🆕 ĐẶT PHÒNG MỚI`
- [ ] Push body format: `{Guest} • CI: {date} • {nights} đêm • {OTA} • ₫{amount}`
- [ ] Bell shows EXACT same title/body format
- [ ] No emoji mismatch, no label mismatch

**Config Hash Verification Command:**
```bash
# Run sync and check hash
npm run sync-config
# Output: [sync-config] Hash for verification: XXXXXXXX

# In browser console:
# [NotificationConfig] FE config hash: XXXXXXXX

# In Supabase Edge Function logs:
# [NotificationConfig] Edge config hash: XXXXXXXX
```

---

### Test D: Race Condition => No Duplicate Push

**Purpose:** Verify parallel webhooks for same booking don't cause duplicate pushes.

**Test Steps:**
1. Send 2 identical INSERT webhooks within 1 second
2. Check push_deliveries table
3. Check device notifications

**Expected:**
- [ ] Only 1 push notification received
- [ ] push_deliveries shows idempotency_key with time bucket
- [ ] Second webhook logs: `duplicate: true`

**Idempotency Key Format:**
`channex:{booking_id}:{event_type}:{time_bucket}`
- event_type = exact event type (BOOKING_NEW, BOOKING_MODIFIED, BOOKING_CANCELLED)
- time_bucket = floor(timestamp / 60000) → 1-minute window
- CRITICAL: Different events in same minute will NOT be deduped (each gets unique key)

---

## GATE 1: Test E: Different Events Same Minute => Both Delivered

**Purpose:** Verify that 2 DIFFERENT events for same booking within 1 minute are BOTH delivered (not incorrectly deduped).

**Test Steps:**
1. Send BOOKING_NEW webhook at T=0
2. Send BOOKING_MODIFIED webhook at T=30s (same minute)
3. Check push_deliveries table and device notifications

**Expected:**
- [ ] 2 push notifications received (one NEW, one MODIFIED)
- [ ] push_deliveries has 2 records with different idempotency_keys:
  - `channex:booking123:BOOKING_NEW:1234567`
  - `channex:booking123:BOOKING_MODIFIED:1234567`
- [ ] Both notifications have correct content (title/body match event type)

**Why This Works:**
- Old key format: `channex:{id}:{event_group}:{bucket}` → would dedup NEW and MODIFIED as both are "modify"
- New key format: `channex:{id}:{event_type}:{bucket}` → different eventType = different key

---

## GATE 2: Test F: Manual Config Edit => Sync Fails

**Purpose:** Verify that manually editing config hash fields causes sync script to FAIL (protecting config integrity).

**Test Steps:**
1. Open `src/modules/notifications/notificationConfig.json`
2. Manually change `"windowSeconds": 600` to `"windowSeconds": 300`
3. Run `npm run sync-config`
4. Observe script output

**Expected:**
- [ ] Script outputs: `❌ ERROR: Manual edit detected!`
- [ ] Script exits with code 1 (failure)
- [ ] Target config NOT updated
- [ ] Script suggests fix: "delete _configHash and re-run sync"

**Recovery:**
```bash
# Option 1: Revert manual changes
git checkout src/modules/notifications/notificationConfig.json

# Option 2: Accept changes and regenerate hash
# Delete _configHash field, then:
npm run sync-config
```

---

## GATE 3: Test G: FE Filter Uses JSON Config

**Purpose:** Verify that FE filter (filterNotifications.ts) imports TECH_FIELDS/OPS_FIELDS/WINDOW_SECONDS from JSON config (not hardcoded).

**Test Steps:**
1. Open browser console
2. Check for log: `[filterNotifications] Loaded config hash: XXXXXXXX`
3. Verify hash matches Edge config hash
4. Test filter behavior with known payload

**Expected:**
- [ ] Console shows: `[filterNotifications] Loaded config hash: ...`
- [ ] Hash matches Edge Function log hash
- [ ] No hardcoded TECH_FIELDS/OPS_FIELDS in filterNotifications.ts
- [ ] Same filter decision for same payload on Bell vs Edge

**Verification Query:**
```sql
-- Get recent change with tech-only fields
SELECT * FROM booking_changes 
WHERE changed_fields @> '["channex_revision_id"]'
ORDER BY created_at DESC LIMIT 1;

-- Verify Bell and Edge would make same decision
-- Bell: filterNotifications() → should hide if near primary
-- Edge: shouldTriggerPush() → should return shouldPush=false if near primary
```

**Mirror Feed Checklist:**
| Payload | Bell Decision | Push Decision | Match? |
|---------|--------------|---------------|--------|
| NEW_BOOKING | SHOW | shouldPush=true | ☐ |
| CANCELLED | SHOW | shouldPush=true | ☐ |
| UPDATE (ops_fields) | SHOW | shouldPush=true | ☐ |
| UPDATE (tech_only, near primary) | HIDE | shouldPush=false | ☐ |
| UPDATE (tech_only, no primary) | SHOW | shouldPush=true | ☐ |

---

## Test Case 1: New Booking (BOOKING_NEW)

### Expected Content
- **Title:** `🆕 ĐẶT PHÒNG MỚI`
- **Body:** `{Guest Name} • CI: {dd/mm/yyyy} • {X} đêm • {OTA} • ₫{Amount}`

### Test Steps
1. Trigger a new booking via Channex webhook simulator or real OTA
2. Wait for push notification

### Verification

| Platform | Title Matches | Body Matches | Deep Link Works |
|----------|---------------|--------------|-----------------|
| Android PWA - Background | ☐ | ☐ | ☐ |
| Android PWA - Foreground | ☐ | ☐ | ☐ |
| iOS PWA - Background | ☐ | ☐ | ☐ |
| iOS PWA - Foreground | ☐ | ☐ | ☐ |
| NotificationBell | ☐ | ☐ | ☐ |

### Additional Checks
- [ ] No duplicate toast in foreground (should be system notification only)
- [ ] Vibrate pattern: celebratory `[100, 50, 100, 50, 200]`
- [ ] `requireInteraction: true` (notification stays visible)
- [ ] `silent: false` (sound plays)

---

## Test Case 2: Booking Cancellation (BOOKING_CANCELLED)

### Expected Content
- **Title:** `❌ HỦY PHÒNG`
- **Body:** `{Guest Name} • CI: {dd/mm/yyyy} • {X} đêm • {OTA}` (no amount)

### Test Steps
1. Cancel an existing booking via Channex or OTA
2. Wait for push notification

### Verification

| Platform | Title Matches | Body Matches | Deep Link Works |
|----------|---------------|--------------|-----------------|
| Android PWA - Background | ☐ | ☐ | ☐ |
| Android PWA - Foreground | ☐ | ☐ | ☐ |
| iOS PWA - Background | ☐ | ☐ | ☐ |
| iOS PWA - Foreground | ☐ | ☐ | ☐ |
| NotificationBell | ☐ | ☐ | ☐ |

### Additional Checks
- [ ] No duplicate toast in foreground
- [ ] Vibrate pattern: urgent `[200, 100, 200, 100, 200]`
- [ ] `requireInteraction: true`
- [ ] `silent: false`
- [ ] Badge has `animate-pulse` class in Bell

---

## Test Case 3: Booking Modification (BOOKING_MODIFIED)

### Expected Content
- **Title:** `✏️ THAY ĐỔI ĐẶT PHÒNG`
- **Body:** `{Guest Name} • CI: {dd/mm/yyyy} • {X} đêm • {OTA} • ₫{Amount}`

### Test Steps
1. Modify an existing booking (dates, room type, amount)
2. Wait for push notification

### Verification

| Platform | Title Matches | Body Matches | Deep Link Works |
|----------|---------------|--------------|-----------------|
| Android PWA - Background | ☐ | ☐ | ☐ |
| Android PWA - Foreground | ☐ | ☐ | ☐ |
| iOS PWA - Background | ☐ | ☐ | ☐ |
| iOS PWA - Foreground | ☐ | ☐ | ☐ |
| NotificationBell | ☐ | ☐ | ☐ |

### Additional Checks
- [ ] No duplicate toast in foreground
- [ ] Vibrate pattern: standard `[100, 50, 100]`
- [ ] `requireInteraction: false` (auto-dismiss OK)
- [ ] `silent: true` (less intrusive)

---

## Test Case 4: Message Inbound (MESSAGE_INBOUND)

### Expected Content
- **Title:** `💬 TIN NHẮN MỚI`
- **Body:** Message content (max 100 chars)

### Verification

| Platform | Title Matches | Body Matches | Deep Link Works |
|----------|---------------|--------------|-----------------|
| Android PWA | ☐ | ☐ | ☐ |
| iOS PWA | ☐ | ☐ | ☐ |
| NotificationBell | ☐ | ☐ | ☐ |

---

## Test Case 5: No Duplicate Push

### Test Steps
1. Send same booking event twice with same `idempotency_key`
2. Check `push_deliveries` table

### Verification
- [ ] Only 1 push notification delivered
- [ ] Second request returns `duplicate: true`
- [ ] No extra entry in `push_deliveries`

---

## Test Case 6: Smart Dedup (Tech-only Updates)

### Test Steps
1. Create a new booking (INSERT)
2. Within 10 minutes, trigger a tech-only UPDATE (e.g., `channex_booking_id` change)
3. Check NotificationBell

### Verification
- [ ] Only NEW_BOOKING event shows in Bell
- [ ] Tech-only UPDATE is hidden
- [ ] Console log shows smart dedup stats

---

## Test Case 7: OPS Changes Always Show

### Test Steps
1. Modify booking dates (check_in, check_out)
2. Modify room type
3. Modify amount

### Verification
- [ ] All OPS changes show in NotificationBell (never hidden)
- [ ] Push notification sent for each OPS change

---

## Regression Checks

### Do Not Break
- [ ] `filterBookingChanges()` still works correctly
- [ ] `processedChangeIds` prevents double rendering
- [ ] `realtimeManager` subscription still active
- [ ] `pushAntiLoop` cooldown still enforced
- [ ] No infinite resubscribe loops in console

### Edge Function Health
- [ ] `channex-webhook` deploys successfully
- [ ] `send-push` deploys successfully
- [ ] Import of `../_shared/renderNotification.ts` works

---

## Files Changed

| File | Change |
|------|--------|
| `src/modules/notifications/renderNotification.ts` | NEW - Shared renderer |
| `supabase/functions/_shared/renderNotification.ts` | NEW - Deno version |
| `src/components/layout/NotificationBell.tsx` | Uses shared EVENT_CONFIG |
| `src/hooks/useForegroundPush.ts` | Toast disabled, uses shared config |
| `supabase/functions/channex-webhook/index.ts` | Uses shared renderer |
| `public/sw.js` | Receives pre-rendered payload |

---

## Sign-off

| Tester | Platform | Date | Pass/Fail |
|--------|----------|------|-----------|
| | Android Chrome PWA | | |
| | iOS Safari PWA | | |
| | Desktop Chrome | | |

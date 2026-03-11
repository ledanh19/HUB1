# NOTIFICATIONS TEST CHECKLIST

**Version:** 1.0.0  
**Purpose:** Complete verification checklist for Roomrise PMS notification implementation  
**Based on:** Roomrise Control Hub production implementation

---

## HOW TO USE THIS CHECKLIST

1. **Environment Setup:** Configure test environment với mock Channex webhooks
2. **Sequential Testing:** Execute tests in order (dependencies exist)
3. **Mark Status:** ✅ Pass | ❌ Fail | ⏭️ Skip | 🔄 In Progress
4. **Document Issues:** Note any deviations for review

---

## SECTION 1: DATABASE SETUP

### 1.1 Tables Created

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1.1 | `booking_changes` table exists | ☐ | |
| 1.1.2 | `booking_changes.id` is UUID PK | ☐ | |
| 1.1.3 | `booking_changes.unified_booking_id` is TEXT NOT NULL | ☐ | |
| 1.1.4 | `booking_changes.change_type` is TEXT NOT NULL | ☐ | |
| 1.1.5 | `booking_changes.changed_fields` is JSONB | ☐ | |
| 1.1.6 | `booking_changes.before_data` is JSONB | ☐ | |
| 1.1.7 | `booking_changes.after_data` is JSONB | ☐ | |
| 1.1.8 | `booking_changes.created_at` has default NOW() | ☐ | |
| 1.1.9 | Index on `unified_booking_id` exists | ☐ | |
| 1.1.10 | Index on `created_at DESC` exists | ☐ | |

### 1.2 Push Tables (if implementing push)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.2.1 | `push_subscriptions` table exists | ☐ | |
| 1.2.2 | Unique constraint on `endpoint` | ☐ | |
| 1.2.3 | `push_deliveries` table exists | ☐ | |
| 1.2.4 | Unique constraint on `(event_type, idempotency_key, recipient_user_id)` | ☐ | |

---

## SECTION 2: EVENT TYPE MAPPING

### 2.1 Change Type to Event Type

| # | Input | Expected Output | Status |
|---|-------|-----------------|--------|
| 2.1.1 | `change_type = 'INSERT'` | `event_type = 'NEW_BOOKING'` | ☐ |
| 2.1.2 | `change_type = 'UPDATE'` + `booking_status = 'CANCELLED'` | `event_type = 'CANCELLED'` | ☐ |
| 2.1.3 | `change_type = 'UPDATE'` + `booking_status = 'CONFIRMED'` | `event_type = 'UPDATED'` | ☐ |
| 2.1.4 | `change_type = 'STATUS_CHANGE'` + `booking_status != 'CANCELLED'` | `event_type = 'UPDATED'` | ☐ |
| 2.1.5 | `change_type = 'AMOUNT_CHANGE'` | `event_type = 'UPDATED'` | ☐ |
| 2.1.6 | `change_type = 'DATES_CHANGE'` | `event_type = 'UPDATED'` | ☐ |

### 2.2 Status Detection (Case Insensitive)

| # | Input Status | Should Detect as Cancelled | Status |
|---|--------------|---------------------------|--------|
| 2.2.1 | `CANCELLED` | ✅ Yes | ☐ |
| 2.2.2 | `cancelled` | ✅ Yes | ☐ |
| 2.2.3 | `Cancelled` | ✅ Yes | ☐ |
| 2.2.4 | `CANCELED` (American spelling) | ✅ Yes | ☐ |
| 2.2.5 | `CONFIRMED` | ❌ No | ☐ |
| 2.2.6 | `MODIFIED` | ❌ No | ☐ |

---

## SECTION 3: SMART FILTER LOGIC

### 3.1 Primary Events Always Show

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 3.1.1 | NEW_BOOKING event | SHOW | ☐ |
| 3.1.2 | CANCELLED event | SHOW | ☐ |
| 3.1.3 | NEW_BOOKING with only tech fields | SHOW (primary overrides) | ☐ |
| 3.1.4 | CANCELLED with only tech fields | SHOW (primary overrides) | ☐ |

### 3.2 OPS Fields → Show

| # | Changed Fields | Expected | Status |
|---|----------------|----------|--------|
| 3.2.1 | `["check_in_date"]` | SHOW | ☐ |
| 3.2.2 | `["check_out_date"]` | SHOW | ☐ |
| 3.2.3 | `["nights"]` | SHOW | ☐ |
| 3.2.4 | `["total_amount_gross"]` | SHOW | ☐ |
| 3.2.5 | `["total_amount_net"]` | SHOW | ☐ |
| 3.2.6 | `["booking_status"]` | SHOW | ☐ |
| 3.2.7 | `["room_type_id"]` | SHOW | ☐ |
| 3.2.8 | `["adults", "children"]` | SHOW | ☐ |
| 3.2.9 | `["rate_plan_id"]` | SHOW | ☐ |
| 3.2.10 | `["payment_status"]` | SHOW | ☐ |

### 3.3 TECH Fields Only → Hide

| # | Changed Fields | Expected | Status |
|---|----------------|----------|--------|
| 3.3.1 | `["channex_revision_id"]` | HIDE | ☐ |
| 3.3.2 | `["synced_at"]` | HIDE | ☐ |
| 3.3.3 | `["updated_at"]` | HIDE | ☐ |
| 3.3.4 | `["mapping_status"]` | HIDE | ☐ |
| 3.3.5 | `["pms_booking_id"]` | HIDE | ☐ |
| 3.3.6 | `["guest_name"]` | HIDE | ☐ |
| 3.3.7 | `["guest_email", "guest_phone"]` | HIDE | ☐ |
| 3.3.8 | `["channex_revision_id", "synced_at", "updated_at"]` | HIDE | ☐ |
| 3.3.9 | `[]` (empty array) | HIDE | ☐ |
| 3.3.10 | `null` | HIDE | ☐ |

### 3.4 Mixed Fields

| # | Changed Fields | Expected | Reason | Status |
|---|----------------|----------|--------|--------|
| 3.4.1 | `["check_in_date", "synced_at"]` | SHOW | Has OPS field | ☐ |
| 3.4.2 | `["guest_name", "total_amount_gross"]` | SHOW | Has OPS field | ☐ |
| 3.4.3 | `["unknown_field"]` | SHOW | Unknown = show for safety | ☐ |
| 3.4.4 | `["guest_name", "guest_email"]` | HIDE | All are TECH | ☐ |

---

## SECTION 4: UI NOTIFICATION BELL

### 4.1 Badge Count

| # | Scenario | Expected Badge | Status |
|---|----------|----------------|--------|
| 4.1.1 | 0 unread notifications | No badge visible | ☐ |
| 4.1.2 | 5 unread notifications | Badge shows "5" | ☐ |
| 4.1.3 | 99 unread notifications | Badge shows "99" | ☐ |
| 4.1.4 | 150 unread notifications | Badge shows "99+" | ☐ |
| 4.1.5 | Open panel then close | Badge becomes 0 | ☐ |

### 4.2 Unread Indicator

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 4.2.1 | Notification newer than last_read_at | Yellow highlight + "MỚI" badge | ☐ |
| 4.2.2 | Notification older than last_read_at | Normal style, no highlight | ☐ |
| 4.2.3 | Panel opened | last_read_at updated to now | ☐ |
| 4.2.4 | Panel closed after viewing | All items lose "MỚI" badge | ☐ |

### 4.3 Sorting

| # | Scenario | Expected Order | Status |
|---|----------|----------------|--------|
| 4.3.1 | 3 notifications at different times | Newest first | ☐ |
| 4.3.2 | Realtime event arrives | New item at TOP of list | ☐ |
| 4.3.3 | Mixed types (booking + message) | Still sorted by time, not type | ☐ |

### 4.4 Display Fields

| # | Field | Format | Status |
|---|-------|--------|--------|
| 4.4.1 | Guest name | "{guest_name}" | ☐ |
| 4.4.2 | Check-in date | "CI: dd/MM/yyyy" | ☐ |
| 4.4.3 | Nights | "{n} đêm" | ☐ |
| 4.4.4 | Amount | "₫{formatted}" with thousands separator | ☐ |
| 4.4.5 | Time | Relative ("5 phút trước", "2 giờ trước") | ☐ |
| 4.4.6 | OTA Logo | Correct logo for source | ☐ |
| 4.4.7 | Event badge | Correct color per type | ☐ |

### 4.5 Panel Behavior

| # | Action | Expected | Status |
|---|--------|----------|--------|
| 4.5.1 | Click bell icon | Panel opens | ☐ |
| 4.5.2 | Click outside panel | Panel closes | ☐ |
| 4.5.3 | Click notification item | Panel closes + navigate | ☐ |
| 4.5.4 | Empty state | Show "Không có thông báo nào" | ☐ |
| 4.5.5 | Loading state | Show spinner | ☐ |
| 4.5.6 | Scroll | ScrollArea with max height | ☐ |

---

## SECTION 5: ROUTING (Click Navigation)

### 5.1 Booking Events

| # | Event Type | Expected Route | Status |
|---|------------|----------------|--------|
| 5.1.1 | BOOKING_NEW | `/bookings/{booking_id}` | ☐ |
| 5.1.2 | BOOKING_MODIFIED | `/bookings/{booking_id}` | ☐ |
| 5.1.3 | BOOKING_CANCELLED | `/bookings/{booking_id}` | ☐ |

### 5.2 Message Events

| # | Event Type | Expected Route | Status |
|---|------------|----------------|--------|
| 5.2.1 | MESSAGE_INBOUND | `/ota-messages?conversation={id}` | ☐ |

### 5.3 Edge Cases

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 5.3.1 | Booking exists | Navigate to detail page | ☐ |
| 5.3.2 | Booking deleted | Show 404 or redirect to list | ☐ |
| 5.3.3 | Booking not yet synced | Show loading then 404 | ☐ |

---

## SECTION 6: IDEMPOTENCY & DEDUP

### 6.1 Webhook Idempotency

| # | Scenario | booking_changes | push_deliveries | push sent | Status |
|---|----------|-----------------|-----------------|-----------|--------|
| 6.1.1 | Webhook sent 1x | 1 record | 1 record | 1 push | ☐ |
| 6.1.2 | Same webhook sent 2x | 2 records | 1 record (conflict) | 1 push | ☐ |
| 6.1.3 | Same webhook sent 5x | 5 records | 1 record | 1 push | ☐ |

### 6.2 UI Dedup

| # | Scenario | Visible Notifications | Status |
|---|----------|----------------------|--------|
| 6.2.1 | Same booking NEW received 3x | 1 notification (deduped by booking+type) | ☐ |
| 6.2.2 | Booking NEW then MODIFIED | 2 notifications (different types) | ☐ |
| 6.2.3 | 5 TECH updates for same booking | 0 notifications (all hidden) | ☐ |

### 6.3 Time Window Dedup

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 6.3.1 | TECH update 2 seconds after NEW | HIDE (within 10min window) | ☐ |
| 6.3.2 | TECH update 5 minutes after NEW | HIDE (within 10min window) | ☐ |
| 6.3.3 | TECH update 15 minutes after NEW | HIDE (still tech-only) | ☐ |

---

## SECTION 7: VISIBILITY & ACCESS CONTROL

### 7.1 Property-Based Filtering

| # | User Properties | Booking Property | Should See | Status |
|---|-----------------|------------------|------------|--------|
| 7.1.1 | [prop-001, prop-002] | prop-001 | ✅ Yes | ☐ |
| 7.1.2 | [prop-001, prop-002] | prop-002 | ✅ Yes | ☐ |
| 7.1.3 | [prop-001, prop-002] | prop-003 | ❌ No | ☐ |
| 7.1.4 | [] (no properties) | prop-001 | ❌ No | ☐ |
| 7.1.5 | [*] (admin all) | any property | ✅ Yes | ☐ |

### 7.2 Role-Based Access

| # | Role | Can See In-App Bell | Can Receive Push | Status |
|---|------|---------------------|------------------|--------|
| 7.2.1 | Admin | ✅ All properties | ✅ | ☐ |
| 7.2.2 | Manager | ✅ Assigned properties | ✅ | ☐ |
| 7.2.3 | Staff | ✅ Assigned properties | ✅ | ☐ |
| 7.2.4 | Viewer | ✅ Assigned properties | ❌ | ☐ |

---

## SECTION 8: EDGE CASES

### 8.1 Missing Data

| # | Missing Field | Expected Behavior | Status |
|---|---------------|-------------------|--------|
| 8.1.1 | No guest_name | Display "Khách" | ☐ |
| 8.1.2 | No check_in_date | Omit CI from display | ☐ |
| 8.1.3 | No nights | Display "1 đêm" (default) | ☐ |
| 8.1.4 | No amount or amount=0 | Omit amount from display | ☐ |
| 8.1.5 | No ota_source | No logo, no OTA name | ☐ |

### 8.2 OTA Source Normalization

| # | Input | Expected Output | Logo | Status |
|---|-------|-----------------|------|--------|
| 8.2.1 | "Booking.com" | "Booking.com" | booking.png | ☐ |
| 8.2.2 | "BOOKING.COM" | "Booking.com" | booking.png | ☐ |
| 8.2.3 | "booking" | "Booking.com" | booking.png | ☐ |
| 8.2.4 | "Agoda" | "Agoda" | agoda.png | ☐ |
| 8.2.5 | "Trip.com" | "Trip.com" | ctrip.png | ☐ |
| 8.2.6 | "CTRIP" | "Trip.com" | ctrip.png | ☐ |
| 8.2.7 | "Expedia" | "Expedia" | expedia.png | ☐ |
| 8.2.8 | "Traveloka" | "Traveloka" | traveloka.png | ☐ |
| 8.2.9 | "UnknownOTA" | "UnknownOTA" | favicon.png | ☐ |

### 8.3 Out-of-Order Events

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 8.3.1 | MODIFIED arrives before NEW | Both shown, ordered by arrival time | ☐ |
| 8.3.2 | CANCELLED arrives before NEW | Both shown, CANCELLED more recent | ☐ |
| 8.3.3 | Multiple MODIFIEDs out of order | All shown (if OPS fields), sorted by created_at | ☐ |

### 8.4 Special Characters

| # | Input | Expected | Status |
|---|-------|----------|--------|
| 8.4.1 | Guest name with Unicode: "Nguyễn Văn Á" | Display correctly | ☐ |
| 8.4.2 | Guest name with special chars: "O'Brien" | Display correctly | ☐ |
| 8.4.3 | Message with emoji: "Hello 👋" | Display correctly | ☐ |
| 8.4.4 | Message with newlines | Truncate to single line | ☐ |
| 8.4.5 | Very long guest name (50+ chars) | Truncate with ellipsis | ☐ |

---

## SECTION 9: REALTIME UPDATES

### 9.1 Subscription

| # | Check | Status |
|---|-------|--------|
| 9.1.1 | Realtime subscription established on page load | ☐ |
| 9.1.2 | Subscription filters to correct table (booking_changes) | ☐ |
| 9.1.3 | Subscription includes INSERT events | ☐ |
| 9.1.4 | Reconnect on connection drop | ☐ |

### 9.2 Event Processing

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 9.2.1 | Realtime INSERT received | Notification appears without refresh | ☐ |
| 9.2.2 | Realtime UPDATE received (OPS) | Notification appears | ☐ |
| 9.2.3 | Realtime UPDATE received (TECH) | No notification (filtered) | ☐ |
| 9.2.4 | Duplicate from realtime + polling | Only 1 notification shown | ☐ |

---

## SECTION 10: PUSH NOTIFICATIONS (Optional)

### 10.1 Subscription Management

| # | Check | Status |
|---|-------|--------|
| 10.1.1 | Enable push creates subscription record | ☐ |
| 10.1.2 | Disable push soft-deletes subscription | ☐ |
| 10.1.3 | Re-enable updates existing record | ☐ |
| 10.1.4 | VAPID key correctly configured | ☐ |

### 10.2 Push Delivery

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 10.2.1 | New booking → push sent | System notification appears | ☐ |
| 10.2.2 | Duplicate webhook → no duplicate push | Only 1 push | ☐ |
| 10.2.3 | Tech-only update → no push | No notification | ☐ |
| 10.2.4 | User disabled push → no push | No notification | ☐ |

### 10.3 Push Content

| # | Check | Status |
|---|-------|--------|
| 10.3.1 | Title is pre-rendered (no emoji in title) | ☐ |
| 10.3.2 | Body contains guest name, date, amount | ☐ |
| 10.3.3 | Icon is OTA logo | ☐ |
| 10.3.4 | Click navigates to correct page | ☐ |

---

## SECTION 11: PERFORMANCE

### 11.1 Query Performance

| # | Query | Expected Timing | Status |
|---|-------|-----------------|--------|
| 11.1.1 | Fetch last 200 booking_changes | < 500ms | ☐ |
| 11.1.2 | Join with bookings_mirror | < 800ms | ☐ |
| 11.1.3 | Smart filter processing | < 100ms | ☐ |

### 11.2 Polling Intervals

| # | Check | Expected | Status |
|---|-------|----------|--------|
| 11.2.1 | booking_changes refetch interval | 5 seconds | ☐ |
| 11.2.2 | messages refetch interval | 10 seconds | ☐ |
| 11.2.3 | Stale time appropriate | 3-5 seconds | ☐ |

---

## SECTION 12: GOLDEN SCENARIOS (End-to-End)

### 12.1 Happy Path: New Booking

```
SETUP: User logged in, push enabled, has access to prop-001
ACTION: Channex webhook NEW booking for prop-001
VERIFY:
☐ booking_changes record created
☐ Notification bell badge increments
☐ Notification appears in panel with "ĐẶT PHÒNG MỚI"
☐ Guest name displayed correctly
☐ CI date formatted correctly
☐ Amount formatted with ₫
☐ OTA logo shown
☐ Click navigates to /bookings/{id}
☐ Push notification received (if enabled)
```

### 12.2 Cancellation Flow

```
SETUP: Booking exists in system
ACTION: Channex webhook CANCELLATION for that booking
VERIFY:
☐ booking_changes record with booking_status=CANCELLED
☐ Notification shows "HỦY PHÒNG"
☐ Badge has pulse animation (urgent)
☐ Amount shows ₫0 or hidden
☐ Click goes to booking detail
```

### 12.3 Tech Update Filtering

```
SETUP: Booking was created 5 minutes ago
ACTION: Channex webhook UPDATE with changed_fields = ["channex_revision_id"]
VERIFY:
☐ booking_changes record IS created
☐ Notification bell badge does NOT increment
☐ No notification visible in panel
☐ No push notification sent
```

### 12.4 Duplicate Handling

```
SETUP: Normal state
ACTION: Same webhook sent 3 times (simulate retry)
VERIFY:
☐ 3 booking_changes records exist
☐ Only 1 notification shown in bell
☐ Only 1 push notification sent
☐ Badge count = 1 (not 3)
```

### 12.5 Multi-Property User

```
SETUP: User has access to prop-001 and prop-002
ACTION: 3 bookings arrive: 2 for prop-001, 1 for prop-003
VERIFY:
☐ User sees 2 notifications (prop-001 only)
☐ prop-003 booking is filtered out
☐ Badge count = 2
```

### 12.6 Read/Unread Transition

```
SETUP: 5 unread notifications exist
ACTION: Open notification panel, view, close
VERIFY:
☐ last_read_at updated to current time
☐ Badge count becomes 0
☐ All items lose "MỚI" highlight
☐ Items still visible but not highlighted
```

### 12.7 Message Notification

```
SETUP: Conversation exists for booking
ACTION: Guest sends message via OTA
VERIFY:
☐ MESSAGE_INBOUND notification appears
☐ Shows "TIN NHẮN MỚI" badge
☐ Shows message preview (truncated)
☐ Click goes to /ota-messages?conversation={id}
```

### 12.8 Rapid Modifications

```
SETUP: Booking exists
ACTION: 5 modifications in 30 seconds (different fields)
VERIFY:
☐ OPS field changes are shown
☐ TECH field changes are hidden
☐ No duplicate notifications for same booking+type
☐ UI doesn't flicker or duplicate
```

### 12.9 Offline Recovery

```
SETUP: User goes offline for 1 hour
ACTION: 10 new bookings arrive during offline
ACTION: User comes back online
VERIFY:
☐ All 10 notifications appear after reconnect
☐ Badge shows correct count
☐ Sorted by time (newest first)
```

### 12.10 Push + In-App Consistency

```
SETUP: Push enabled, app in background
ACTION: New booking arrives
VERIFY:
☐ System push notification appears
☐ Push shows same info as in-app
☐ Tap push opens app to booking detail
☐ In-app bell also shows notification
```

### 12.11 Foreign Currency

```
SETUP: Normal state
ACTION: Booking arrives with amount in USD
VERIFY:
☐ Amount displayed (consider showing currency code)
☐ No crash or error
☐ Display is readable
```

### 12.12 Empty State

```
SETUP: No notifications exist (new user)
ACTION: Open notification panel
VERIFY:
☐ Shows empty state message
☐ Shows icon/illustration
☐ Badge not visible
☐ No errors in console
```

---

## SECTION 13: INTEGRATION TEST MATRIX

### 13.1 API Endpoints (if applicable)

| # | Endpoint | Method | Expected Response | Status |
|---|----------|--------|-------------------|--------|
| 13.1.1 | `/api/notifications` | GET | List of notifications | ☐ |
| 13.1.2 | `/api/notifications/unread-count` | GET | { count: N } | ☐ |
| 13.1.3 | `/api/notifications/mark-read` | POST | Success | ☐ |

### 13.2 Webhook Endpoints

| # | Endpoint | Payload | Expected | Status |
|---|----------|---------|----------|--------|
| 13.2.1 | POST channex webhook | booking NEW | 200 OK, record created | ☐ |
| 13.2.2 | POST channex webhook | booking MODIFIED | 200 OK, record created | ☐ |
| 13.2.3 | POST channex webhook | booking CANCELLED | 200 OK, record created | ☐ |
| 13.2.4 | POST channex webhook | message INBOUND | 200 OK, record created | ☐ |
| 13.2.5 | POST invalid payload | malformed | 400 Bad Request | ☐ |

---

## SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Tech Lead | | | |
| Product | | | |

---

## APPENDIX A: Test Data Setup

```sql
-- Create test properties
INSERT INTO properties (id, name) VALUES
  ('prop-001-uuid', 'Test Hotel 1'),
  ('prop-002-uuid', 'Test Hotel 2'),
  ('prop-999-no-access', 'Hidden Hotel');

-- Create test user with property access
INSERT INTO user_properties (user_id, property_id) VALUES
  ('test-user-id', 'prop-001-uuid'),
  ('test-user-id', 'prop-002-uuid');

-- Create test booking
INSERT INTO bookings_mirror (unified_booking_id, guest_name, ota_source, ...)
VALUES ('booking-001', 'Test Guest', 'Booking.com', ...);
```

---

## APPENDIX B: Mock Webhook Script

```bash
# Send test NEW booking webhook
curl -X POST http://localhost:8000/api/webhooks/channex \
  -H "Content-Type: application/json" \
  -d '{
    "event": "booking",
    "event_type": "new",
    "property_id": "prop-001-uuid",
    "payload": {
      "id": "test-booking-001",
      "customer": { "name": "Test Guest" },
      "rooms": [{ "checkin_date": "2026-01-15", "nights": 2, "amount": 2000000 }],
      "ota_name": "Booking.com",
      "amount": 2000000
    }
  }'

# Send test CANCELLATION webhook
curl -X POST http://localhost:8000/api/webhooks/channex \
  -H "Content-Type: application/json" \
  -d '{
    "event": "booking",
    "event_type": "cancellation",
    "property_id": "prop-001-uuid",
    "payload": {
      "id": "test-booking-001",
      "status": "cancelled",
      "cancellation_reason": "Guest requested"
    }
  }'
```

---

**END OF CHECKLIST**

# ROOMRISE NOTIFICATION SYSTEM SPECIFICATION

**Version:** 1.0.0  
**Extracted From:** Roomrise Control Hub (Production)  
**Date:** 2026-01-12  
**Purpose:** Language/DB-agnostic spec for Roomrise PMS re-implementation

---

## A. EXECUTIVE SUMMARY

### A.1. Mục đích hệ thống

Hệ thống Notification của Roomrise cung cấp:
1. **Real-time feed** các sự kiện booking từ OTA (qua Channex)
2. **Push notification** cho PWA (Web Push API)
3. **In-app notification bell** với badge count và unread tracking

### A.2. Nguyên tắc bất biến (INVARIANTS)

| # | INVARIANT | Giải thích |
|---|-----------|------------|
| INV-1 | **Idempotent Event Processing** | Cùng 1 webhook gửi N lần → chỉ tạo 1 notification |
| INV-2 | **No Duplicate Push** | Cùng event + cùng user → chỉ nhận 1 push notification |
| INV-3 | **Tech Updates Hidden** | UPDATE events chỉ thay đổi technical fields (revision_id, synced_at) → KHÔNG hiển thị |
| INV-4 | **Primary Events Always Visible** | NEW_BOOKING và CANCELLED → LUÔN hiển thị, không filter |
| INV-5 | **Ops Updates Visible** | UPDATE có thay đổi operational fields (dates, amount, status) → hiển thị |
| INV-6 | **Click → Direct Navigation** | Click notification → đi thẳng đến entity, không qua trang trung gian |
| INV-7 | **Property-Scoped Visibility** | User chỉ thấy notifications của properties họ được phân quyền |
| INV-8 | **Chronological Order** | Notifications luôn sort by created_at DESC |
| INV-9 | **User-Level Read State** | Read/unread tracking theo từng user, không phải global |
| INV-10 | **Pre-Rendered Push Payload** | Push notification payload được render sẵn ở server, client chỉ hiển thị |

---

## B. DOMAIN MODEL

### B.1. Core Entities

#### B.1.1. Notification Source: `booking_changes`

Notifications KHÔNG lưu riêng table `notifications`. Thay vào đó, chúng được **computed** từ table `booking_changes`.

```
TABLE: booking_changes
├── id: UUID (PK)
├── unified_booking_id: TEXT (FK to bookings_mirror)
├── pms_booking_id: TEXT (nullable)
├── change_source: TEXT 
│   └── Values: 'CHANNEX_SYNC' | 'CHANNEX_WEBHOOK' | 'MANUAL'
├── change_type: TEXT
│   └── Values: 'INSERT' | 'UPDATE' | 'STATUS_CHANGE' | 'DATES_CHANGE' | 'AMOUNT_CHANGE' | 'GUESTS_CHANGE' | 'ROOM_LINE_ADDED' | 'ROOM_LINE_MODIFIED' | 'ROOM_LINE_REMOVED'
├── changed_fields: JSONB (array of field names)
├── before_data: JSONB
├── after_data: JSONB
├── source_updated_at: TIMESTAMPTZ
├── sync_run_id: UUID (nullable)
└── created_at: TIMESTAMPTZ (default: now())

INDEXES:
├── idx_booking_changes_unified_booking_id (unified_booking_id)
└── idx_booking_changes_created_at (created_at DESC)

REALTIME: Enabled (Supabase Realtime subscription)
```

#### B.1.2. Push Subscription: `push_subscriptions`

```
TABLE: push_subscriptions
├── id: UUID (PK)
├── user_id: UUID (FK to auth.users)
├── endpoint: TEXT (Web Push endpoint URL) - UNIQUE
├── p256dh: TEXT (Public key for encryption)
├── auth: TEXT (Auth secret)
├── endpoint_host: TEXT (extracted host for debugging)
├── user_agent: TEXT
├── device_fingerprint: TEXT (nullable)
├── is_active: BOOLEAN (default: true)
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
├── last_used_at: TIMESTAMPTZ
├── consecutive_failures: INTEGER (default: 0)
├── last_failure_at: TIMESTAMPTZ
└── last_failure_reason: TEXT

INDEXES:
├── idx_push_subscriptions_user_id (user_id) WHERE is_active = true
├── idx_push_subscriptions_failures (consecutive_failures) WHERE is_active = true
└── idx_push_subscriptions_last_used (last_used_at) WHERE is_active = true

CONSTRAINT: unique_active_endpoint UNIQUE (endpoint)
```

#### B.1.3. Push Delivery (Idempotency): `push_deliveries`

```
TABLE: push_deliveries
├── id: UUID (PK)
├── event_type: TEXT
├── idempotency_key: TEXT
├── recipient_user_id: UUID (FK to auth.users)
├── subscription_id: UUID (FK to push_subscriptions, nullable)
├── source_table: TEXT
├── source_record_id: TEXT
├── delivered_at: TIMESTAMPTZ
├── ttl_seconds: INTEGER (default: 86400)
└── payload_hash: TEXT

CONSTRAINT: unique_push_delivery UNIQUE (event_type, idempotency_key, recipient_user_id)
```

### B.2. Read/Unread Model

**QUAN TRỌNG:** Read state được track **per-user** và lưu ở **client-side (localStorage)**, KHÔNG lưu server-side.

```javascript
// localStorage keys
STORAGE_KEY = 'notification_last_read_at'  // ISO timestamp

// Logic:
isUnread = notification.created_at > user.last_read_at
```

**Lý do thiết kế:**
- Giảm write operations lên database
- Notification feed là computed từ booking_changes, không có notification_id riêng
- Simplify architecture: không cần table `notification_reads`

### B.3. Notification Item (Computed Object)

Khi render UI, system tính toán `NotificationItem` từ `booking_changes`:

```typescript
interface NotificationItem {
  id: string;                    // = booking_changes.id
  booking_id: string;            // = unified_booking_id
  created_at: string;            // ISO timestamp
  event_type: NotificationEventType;
  changed_fields: string[] | null;
  source: string | null;         // = change_source
  after_data: Record<string, unknown> | null;
  before_data: Record<string, unknown> | null;
}

type NotificationEventType = 
  | 'NEW_BOOKING'      // from INSERT
  | 'CANCELLED'        // from any change with status=CANCELLED
  | 'UPDATED'          // from UPDATE, STATUS_CHANGE, etc.
  | 'INSERT'           // raw type
  | 'UPDATE'           // raw type
  | 'MODIFICATION'     // alias
  | 'CANCELLATION'     // alias
  | 'STATUS_CHANGED';  // specific update
```

### B.4. Feed Event (UI Display Object)

Khi hiển thị trong NotificationBell, transform thành `FeedEvent`:

```typescript
interface FeedEvent {
  id: string;                    // Format: 'bc:{booking_changes.id}'
  type: 'NEW_BOOKING' | 'MODIFICATION' | 'CANCELLATION' | 'NEW_MESSAGE';
  title: string;                 // "{guest_name} - CI: {check_in_date}"
  subtitle: string;              // "{nights} đêm | Đặt lúc {time}"
  timestamp: string;             // ISO
  source?: string;               // OTA name (AGODA, BOOKING.COM, etc.)
  amount?: number;               // total_amount
  link: string;                  // Deep link path
  isNew: boolean;                // = timestamp > lastReadAt
  hasBookingJoin: boolean;       // Has booking data joined
  
  // Rich display fields
  guestName?: string;
  checkInDate?: string;          // Formatted: dd/MM/yyyy
  nights?: number;
  bookedAt?: string;             // Formatted time: HH:mm dd/MM
}
```

---

## C. EVENT TYPES TABLE

| event_key | source | entity | severity | filter_behavior | mô tả |
|-----------|--------|--------|----------|-----------------|-------|
| `BOOKING_NEW` | CHANNEX_WEBHOOK / CHANNEX_SYNC | booking | HIGH | ALWAYS_SHOW | Đặt phòng mới từ OTA |
| `BOOKING_MODIFIED` | CHANNEX_WEBHOOK / CHANNEX_SYNC | booking | MEDIUM | SMART_FILTER | Thay đổi booking (ngày, giá, phòng) |
| `BOOKING_CANCELLED` | CHANNEX_WEBHOOK / CHANNEX_SYNC | booking | HIGH | ALWAYS_SHOW | Hủy đặt phòng |
| `MESSAGE_INBOUND` | CHANNEX_MESSAGES_WEBHOOK | message | MEDIUM | ALWAYS_SHOW | Tin nhắn từ khách qua OTA |
| `PUSH_TEST` | MANUAL | system | LOW | N/A | Test notification |

### C.1. Event Type Configuration

```json
{
  "BOOKING_NEW": {
    "emoji": "🆕",
    "labelVi": "ĐẶT PHÒNG MỚI",
    "titlePrefix": "Đặt phòng mới",
    "badgeClass": "bg-green-500/20 text-green-600 border-green-500/30 font-bold",
    "isUrgent": true,
    "requireInteraction": true,
    "vibratePattern": [100, 50, 100, 50, 200],
    "silent": false
  },
  "BOOKING_MODIFIED": {
    "emoji": "✏️",
    "labelVi": "THAY ĐỔI",
    "titlePrefix": "Thay đổi đặt phòng",
    "badgeClass": "bg-amber-500/20 text-amber-600 border-amber-500/30",
    "isUrgent": false,
    "requireInteraction": false,
    "vibratePattern": [100, 50, 100],
    "silent": true
  },
  "BOOKING_CANCELLED": {
    "emoji": "❌",
    "labelVi": "HỦY PHÒNG",
    "titlePrefix": "Huỷ đặt phòng",
    "badgeClass": "bg-red-500/20 text-red-600 border-red-500/30 font-bold animate-pulse",
    "isUrgent": true,
    "requireInteraction": true,
    "vibratePattern": [200, 100, 200, 100, 200],
    "silent": false
  },
  "MESSAGE_INBOUND": {
    "emoji": "💬",
    "labelVi": "TIN NHẮN MỚI",
    "titlePrefix": "Tin nhắn mới",
    "badgeClass": "bg-violet-500/20 text-violet-600 border-violet-500/30",
    "isUrgent": false,
    "requireInteraction": false,
    "vibratePattern": [100, 50, 100],
    "silent": false
  }
}
```

---

## D. PAYLOAD CONTRACT

### D.1. Channex Webhook Payload (booking event)

```json
{
  "event": "booking",
  "event_type": "new" | "modification" | "cancellation",
  "property_id": "channex_property_uuid",
  "payload": {
    "id": "channex_booking_uuid",
    "revision_id": "rev_xxxxx",
    "status": "new" | "modified" | "cancelled",
    "booking_id": "OTA_BOOKING_CODE",
    
    "customer": {
      "name": "Guest Full Name",
      "surname": "Surname",
      "mail": "guest@email.com",
      "phone": "+84xxxxxxxxx"
    },
    
    "rooms": [{
      "checkin_date": "2026-01-15",
      "checkout_date": "2026-01-18",
      "nights": 3,
      "room_type_id": "channex_room_type_uuid",
      "rate_plan_id": "channex_rate_plan_uuid",
      "amount": 3500000,
      "currency": "VND",
      "guests": [{ "name": "Guest Name" }]
    }],
    
    "ota_name": "Booking.com",
    "ota_reservation_code": "BDC_123456",
    
    "amount": 3500000,
    "currency": "VND",
    "commission": 525000,
    
    "notes": "Guest request late checkout",
    "inserted_at": "2026-01-12T10:30:00Z",
    "updated_at": "2026-01-12T10:30:00Z"
  }
}
```

### D.2. Transformed booking_changes Record

```json
{
  "id": "uuid-of-change",
  "unified_booking_id": "internal_booking_uuid",
  "pms_booking_id": null,
  "change_source": "CHANNEX_WEBHOOK",
  "change_type": "INSERT",
  "changed_fields": ["*"],
  "before_data": null,
  "after_data": {
    "guest_name": "Guest Full Name",
    "guest_email": "guest@email.com",
    "guest_phone": "+84xxxxxxxxx",
    "check_in_date": "2026-01-15",
    "check_out_date": "2026-01-18",
    "nights": 3,
    "booking_status": "CONFIRMED",
    "total_amount_gross": 3500000,
    "total_amount_net": 2975000,
    "currency": "VND",
    "ota_source": "Booking.com",
    "ota_booking_code": "BDC_123456",
    "channex_property_id": "channex_property_uuid",
    "channex_room_type_id": "channex_room_type_uuid",
    "channex_revision_id": "rev_xxxxx"
  },
  "source_updated_at": "2026-01-12T10:30:00Z",
  "created_at": "2026-01-12T10:30:05Z"
}
```

### D.3. Push Notification Payload (Pre-Rendered)

```json
{
  "title": "Đặt phòng mới",
  "body": "Quý vị có đặt phòng mới\nGuest Full Name • CI: 15/01 • 3 đêm • 3,500,000đ\nBooking.com • An Gia Hotel",
  "icon": "/ota-logos/booking.png",
  "badge": "/favicon.png",
  "tag": "roomrise-booking_new-uuid-of-booking",
  "requireInteraction": true,
  "silent": false,
  "vibrate": [100, 50, 100, 50, 200],
  "data": {
    "event_type": "BOOKING_NEW",
    "entity_id": "internal_booking_uuid",
    "deep_link": "/bookings/internal_booking_uuid",
    "_pre_rendered": true
  }
}
```

### D.4. Field Classification

#### D.4.1. Routing Fields (dùng để navigate)
| Field | Purpose |
|-------|---------|
| `unified_booking_id` | Navigate to booking detail |
| `conversation_id` | Navigate to message thread |
| `event_type` | Determine target route |

#### D.4.2. Display Fields (chỉ để hiển thị)
| Field | Purpose |
|-------|---------|
| `guest_name` | Show in notification title |
| `check_in_date` | Show CI date |
| `nights` | Show duration |
| `total_amount_*` | Show price |
| `ota_source` | Show OTA logo |

#### D.4.3. Technical Fields (HIDDEN - không hiển thị notification)
```javascript
TECH_FIELDS = [
  "channex_revision_id",
  "channex_status",
  "channex_updated_at",
  "channex_booking_id",
  "channex_property_id",
  "channex_room_type_id",
  "channex_user_id",
  "revision_id",
  "raw_message",
  "raw_data",
  "raw_payload",
  "updated_at",
  "synced_at",
  "last_synced_at",
  "source_updated_at",
  "notes",
  "internal_notes",
  "ota_notes",
  "guest_name",           // Name changes are tech updates
  "guest_first_name",
  "guest_last_name",
  "mapping_status",
  "sync_status",
  "pms_booking_id",
  "pms_property_name",
  "external_id",
  "guest_phone",
  "guest_email",
  "ota_source",
  "provider",
  "provider_booking_id",
  "ota_booking_code",
  "ota_property_id",
  "customer_id",
  "booking_type"
]
```

#### D.4.4. Operational Fields (VISIBLE - hiển thị notification)
```javascript
OPS_FIELDS = [
  "check_in",
  "check_in_date",
  "check_out",
  "check_out_date",
  "arrival_date",
  "departure_date",
  "nights",
  "room_type",
  "room_type_id",
  "room_type_name",
  "room_id",
  "assigned_room",
  "room_name",
  "gross_amount",
  "net_amount",
  "total_amount",
  "total_amount_gross",
  "total_amount_net",
  "amount",
  "currency",
  "price",
  "rate",
  "commission_amount",
  "payment_type",
  "payment_status",
  "payment_method",
  "is_prepaid",
  "booking_status",
  "status",
  "stay_status",
  "guest_count",
  "adults",
  "children",
  "infants",
  "number_of_guests",
  "rate_plan",
  "rate_plan_id",
  "rate_plan_name",
  "board_type",
  "meal_plan",
  "cancellation_reason",
  "cancelled_at",
  "room_lines",
  "rooms"
]
```

---

## E. UI BEHAVIOR RULES

### E.1. Badge Count

```
badge_count = notifications.filter(n => n.created_at > user.last_read_at).length
```

**Rules:**
- Count chỉ tính **VISIBLE** notifications (sau khi smart filter)
- Giới hạn hiển thị: `99+` nếu > 99
- Badge có animation `animate-pulse` nếu > 0
- Badge màu `bg-destructive` (đỏ)

### E.2. Sorting Rule

```sql
ORDER BY created_at DESC
LIMIT 200  -- Raw fetch limit
-- After smart filter, show all visible
```

**Dedup within UI:**
- Group by `booking_id + event_type`
- Keep only NEWEST event per group

### E.3. Unread Dot Rules

| Condition | Show Dot | Animation |
|-----------|----------|-----------|
| `created_at > last_read_at` | ✅ Yes | Ping animation |
| `created_at <= last_read_at` | ❌ No | None |

**Visual Treatment for NEW:**
```css
/* New notification row */
background: amber-100 (light) / amber-900/40 (dark)
border-left: 4px solid amber-500
animation: notification-flash 1.5s ease-in-out infinite
```

### E.4. When NOT to Display

| Scenario | Action |
|----------|--------|
| UPDATE with only TECH_FIELDS | HIDE |
| UPDATE with empty changed_fields | HIDE |
| Booking not in user's property scope | HIDE |
| Duplicate notification (same booking+type within 10min) | DEDUPE to 1 |

### E.5. Panel Behavior

- **Trigger:** Click bell icon
- **Type:** Popover (not modal, not drawer)
- **Width:** 400px
- **Max Height:** 400px (ScrollArea)
- **Position:** Aligned to end (right side)
- **Close:** Click outside, click item, click "Xem Dashboard"

### E.6. Time Display

```javascript
// Relative time with Vietnamese locale
formatDistanceToNow(timestamp, { addSuffix: true, locale: vi })
// Output: "5 phút trước", "2 giờ trước", "1 ngày trước"
```

---

## F. ROUTING RULES

### F.1. Click Navigation Matrix

| event_type | route_pattern | params | example |
|------------|---------------|--------|---------|
| `BOOKING_NEW` | `/bookings/{booking_id}` | booking_id | `/bookings/abc-123` |
| `BOOKING_MODIFIED` | `/bookings/{booking_id}` | booking_id | `/bookings/abc-123` |
| `BOOKING_CANCELLED` | `/bookings/{booking_id}` | booking_id | `/bookings/abc-123` |
| `MESSAGE_INBOUND` | `/ota-messages?conversation={id}` | conversation_id | `/ota-messages?conversation=xyz` |

### F.2. Deep Link Generation

```typescript
function buildDeepLink(eventType: string, entityId: string): string {
  switch (eventType) {
    case 'BOOKING_NEW':
    case 'BOOKING_MODIFIED':
    case 'BOOKING_CANCELLED':
      return `/bookings/${entityId}`;
    
    case 'MESSAGE_INBOUND':
      return `/ota-messages?conversation=${entityId}`;
    
    default:
      return '/';
  }
}
```

### F.3. Entity Not Found Handling

| Scenario | Behavior |
|----------|----------|
| Booking exists | Navigate to booking detail |
| Booking deleted/not synced | Show 404 page or redirect to booking list |
| Message conversation exists | Navigate to thread |
| Conversation not found | Redirect to messages list |

**Implementation:**
- Target page handles loading state
- Target page shows error if entity not found
- NO client-side pre-check (avoid extra API call)

### F.4. Post-Click Actions

1. Close notification panel
2. Navigate to target route
3. Update `last_read_at` to current timestamp
4. Recalculate unread count (will be 0 if all viewed)

---

## G. IDEMPOTENCY & DEDUP RULES

### G.1. Webhook Idempotency

**Dedup Key Formula:**
```
idempotency_key = SHA256(
  source_table + ":" + 
  source_record_id + ":" + 
  event_type + ":" + 
  JSON.stringify(payload_subset)
)

// Or simplified:
idempotency_key = `${source_table}:${source_record_id}:${event_type}`
```

**Database Constraint:**
```sql
UNIQUE (event_type, idempotency_key, recipient_user_id)
```

### G.2. Webhook Processing Flow

```
Webhook arrives
    │
    ├─► Compute idempotency_key
    │
    ├─► TRY INSERT INTO push_deliveries
    │       │
    │       ├─► SUCCESS (new row) → Send push notification
    │       │
    │       └─► CONFLICT (duplicate) → Skip push, return success
    │
    └─► Always INSERT INTO booking_changes (no dedup here)
```

### G.3. UI-Level Dedup (Smart Filter)

```typescript
function shouldShowNotification(notification): { show: boolean, reason: string } {
  
  // RULE 1: Primary events always shown
  if (isPrimaryEvent(notification.event_type)) {
    return { show: true, reason: 'primary_event' };
  }
  
  // RULE 2: Unknown event types → show by default
  if (!isUpdateEvent(notification.event_type)) {
    return { show: true, reason: 'unknown_type_show_default' };
  }
  
  // Extract changed fields
  const changedFields = extractChangedFields(notification);
  
  // RULE 3: Has operational fields → always show
  if (hasOpsFields(changedFields)) {
    return { show: true, reason: 'has_ops_fields' };
  }
  
  // RULE 4: Has unknown fields (not in TECH or OPS) → show for traceability
  if (!isOnlyTechFields(changedFields)) {
    return { show: true, reason: 'has_unknown_fields' };
  }
  
  // RULE 5: Tech-only update near primary event → hide
  // Check if there's a NEW_BOOKING or CANCELLED for same booking within window
  const primaryEventsForBooking = findPrimaryEvents(notification.booking_id);
  for (const primary of primaryEventsForBooking) {
    if (isWithinWindow(notification.created_at, primary.created_at, 600)) { // 10 min
      return { show: false, reason: 'tech_update_near_primary' };
    }
  }
  
  // RULE 6: Standalone tech-only update → hide
  return { show: false, reason: 'tech_only_internal_update' };
}
```

### G.4. Time Window for Dedup

```javascript
WINDOW_SECONDS = 600; // 10 minutes

// Two events considered "related" if within this window
function isWithinWindow(t1: string, t2: string): boolean {
  const diff = Math.abs(new Date(t1) - new Date(t2));
  return diff <= WINDOW_SECONDS * 1000;
}
```

### G.5. Retry Safety

| Scenario | Result |
|----------|--------|
| Same webhook sent 1x | 1 notification created, 1 push sent |
| Same webhook sent 10x | 1 notification created, 1 push sent |
| Same webhook after 24h | New notification (TTL expired) |

---

## H. VISIBILITY MATRIX

### H.1. Property-Based Filtering

Notifications are filtered by **channex_property_id** matching user's assigned properties.

```typescript
// useAnGiaProperties hook returns list of property IDs user can access
const { propertyIds: anGiaPropertyIds } = useAnGiaProperties();

// Filter bookings
const visibleBookings = bookings.filter(b => 
  anGiaPropertyIds.has(b.channex_property_id)
);
```

### H.2. Role × Entity Visibility

| Role | BOOKING_NEW | BOOKING_MODIFIED | BOOKING_CANCELLED | MESSAGE_INBOUND |
|------|-------------|------------------|-------------------|-----------------|
| Admin | ✅ All properties | ✅ All properties | ✅ All properties | ✅ All properties |
| Manager | ✅ Assigned properties | ✅ Assigned properties | ✅ Assigned properties | ✅ Assigned properties |
| Staff | ✅ Assigned properties | ✅ Assigned properties | ✅ Assigned properties | ✅ Assigned properties |
| Viewer | ❌ No push | ❌ No push | ❌ No push | ❌ No push |

### H.3. Push Notification Recipients

```typescript
// Determine who receives push for an event
function getRecipients(event, propertyId): UserId[] {
  // Option 1: Broadcast to all users with access to property
  return getUsersWithPropertyAccess(propertyId);
  
  // Option 2: Use triage group (assigned responders)
  // return getTriageGroupMembers(propertyId);
  
  // Option 3: Specific user (assigned_to)
  // return [event.assigned_to_user_id];
}
```

### H.4. Current Implementation

**Control Hub hiện tại:** Broadcast đến tất cả authenticated users có quyền truy cập property.

---

## I. EDGE CASES

### I.1. Duplicate Webhook

**Scenario:** Channex gửi cùng webhook 2 lần do network retry.

**Handling:**
1. booking_changes: Cả 2 đều được INSERT (có unique change ID)
2. push_deliveries: Chỉ INSERT được 1 (unique constraint)
3. UI Filter: Smart dedup hiển thị 1 notification

**Result:** User thấy 1 notification, nhận 1 push.

### I.2. Out-of-Order Events

**Scenario:** MODIFIED webhook đến trước NEW webhook.

**Handling:**
1. Cả hai đều được ghi vào booking_changes với `created_at = now()`
2. UI sort by `created_at DESC` → hiển thị theo thứ tự nhận được
3. Booking detail page hiển thị trạng thái mới nhất

**Result:** UI có thể hiện MODIFIED trước NEW, nhưng data vẫn đúng.

### I.3. Booking Chưa Sync Xong

**Scenario:** Notification đến nhưng bookings_mirror chưa có record.

**Handling:**
1. booking_changes được insert
2. UI query bookings_mirror JOIN → không có match
3. Notification vẫn hiển thị nhưng thiếu rich data (guest name, amount)
4. User click → booking detail page sẽ 404 hoặc loading

**Result:** Notification hiển thị với data giới hạn từ `after_data`.

### I.4. Event Thiếu Field

**Scenario:** Webhook không có `customer.name`.

**Handling:**
1. Use fallback: `guest_name = after_data.guest_name || 'Khách'`
2. Display "Khách" thay vì empty hoặc undefined

**Fallback Values:**
```typescript
const DEFAULTS = {
  guest_name: 'Khách',
  nights: 1,
  total_amount: 0,
  check_in_date: '', // Empty string, not null
  ota_source: '',
};
```

### I.5. Property ID Mismatch

**Scenario:** Webhook có property_id không khớp với bất kỳ property nào trong system.

**Handling:**
1. Notification vẫn được tạo trong booking_changes
2. Không user nào có visibility → không ai thấy
3. Admin có thể thấy trong system audit

### I.6. Push Subscription Expired

**Scenario:** Browser unsubscribed nhưng DB vẫn có record.

**Handling:**
1. Push service trả về 404 hoặc 410
2. System soft-delete subscription: `is_active = false`
3. Increment `consecutive_failures`
4. Log to audit_logs

### I.7. Concurrent Webhook Processing

**Scenario:** 2 webhooks cho cùng booking đến cùng lúc.

**Handling:**
1. Database unique constraint prevent duplicate push_deliveries
2. Cả 2 booking_changes đều được tạo
3. First-to-insert wins cho push

---

## J. GOLDEN SCENARIOS

### J.1. Happy Path - New Booking

```gherkin
GIVEN user is logged in with push enabled
  AND user has access to property "hotel-abc"
WHEN Channex sends NEW booking webhook for "hotel-abc"
THEN booking_changes record is created with change_type=INSERT
  AND push notification is sent to user
  AND notification bell shows badge count = 1
  AND notification panel shows "ĐẶT PHÒNG MỚI" with guest name and CI date
  AND clicking notification navigates to /bookings/{id}
```

### J.2. Happy Path - Booking Cancelled

```gherkin
GIVEN existing booking "booking-123" in system
WHEN Channex sends CANCELLATION webhook for "booking-123"
THEN booking_changes record is created with change_type=UPDATE
  AND after_data.booking_status = "CANCELLED"
  AND event_type computed as BOOKING_CANCELLED
  AND push notification sent with "Huỷ đặt phòng" title
  AND badge shows with pulse animation (urgent)
```

### J.3. Smart Filter - Tech Update Hidden

```gherkin
GIVEN booking "booking-123" was created 5 minutes ago
WHEN Channex sends UPDATE webhook with changed_fields = ["channex_revision_id", "synced_at"]
THEN booking_changes record IS created
  BUT notification IS NOT shown in bell
  AND no push notification is sent
  AND badge count does NOT increment
```

### J.4. Smart Filter - Ops Update Shown

```gherkin
GIVEN booking "booking-123" exists
WHEN Channex sends UPDATE webhook with changed_fields = ["check_in_date", "total_amount_net"]
THEN notification IS shown with "THAY ĐỔI" badge
  AND push notification IS sent
```

### J.5. Duplicate Webhook Handling

```gherkin
GIVEN webhook with revision_id="rev-001" was processed
WHEN same webhook is received again (retry)
THEN booking_changes creates new record
  BUT push_deliveries INSERT fails (conflict)
  AND user does NOT receive duplicate push
  AND UI smart filter shows only 1 notification
```

### J.6. Message Inbound

```gherkin
GIVEN conversation exists between guest and property
WHEN guest sends message via OTA
  AND Channex forwards via messages webhook
THEN messages table is updated
  AND notification shows "TIN NHẮN MỚI"
  AND clicking navigates to /ota-messages?conversation={id}
```

### J.7. Multi-Property User

```gherkin
GIVEN user has access to property-A and property-B
  AND user does NOT have access to property-C
WHEN new bookings arrive for all 3 properties
THEN user sees notifications for property-A and property-B only
  AND property-C notifications are filtered out
```

### J.8. Unread to Read Transition

```gherkin
GIVEN 5 unread notifications exist
  AND badge shows "5"
WHEN user opens notification panel
  AND panel closes
THEN last_read_at is updated to now()
  AND badge count becomes 0
  AND all notifications lose "MỚI" badge and yellow highlight
```

### J.9. Real-time Update

```gherkin
GIVEN notification panel is open
WHEN new booking webhook arrives
THEN notification appears at TOP of list
  AND badge count increments
  AND new item has "MỚI" badge and highlight
  AND no page refresh needed (realtime subscription)
```

### J.10. PWA Background Push

```gherkin
GIVEN user has PWA installed with push enabled
  AND app is in background (not visible)
WHEN new booking arrives
THEN system notification appears on device
  AND notification shows OTA logo as icon
  AND tapping notification opens app and navigates to booking
```

### J.11. Push Disabled Fallback

```gherkin
GIVEN user has push notifications disabled
WHEN new booking arrives
THEN in-app notification bell updates via realtime
  AND badge shows unread count
  AND no system push notification
```

### J.12. Offline then Online

```gherkin
GIVEN user is offline for 2 hours
  AND 10 new bookings arrived during offline
WHEN user comes online
THEN polling/realtime fetches latest booking_changes
  AND badge shows correct unread count
  AND all 10 notifications are visible in panel
```

---

## APPENDIX A: OTA Logo Mapping

```typescript
const OTA_LOGOS: Record<string, string> = {
  // Booking.com
  'BOOKING.COM': '/ota-logos/booking.png',
  'BOOKING': '/ota-logos/booking.png',
  'BOOKINGCOM': '/ota-logos/booking.png',
  
  // Agoda
  'AGODA': '/ota-logos/agoda.png',
  'AGODA.COM': '/ota-logos/agoda.png',
  
  // Expedia
  'EXPEDIA': '/ota-logos/expedia.png',
  'EXPEDIA.COM': '/ota-logos/expedia.png',
  
  // Trip.com / Ctrip
  'CTRIP': '/ota-logos/ctrip.png',
  'TRIP.COM': '/ota-logos/ctrip.png',
  'TRIP': '/ota-logos/ctrip.png',
  
  // Traveloka
  'TRAVELOKA': '/ota-logos/traveloka.png',
};
```

---

## APPENDIX B: Polling Intervals

| Query | Interval | Stale Time | Purpose |
|-------|----------|------------|---------|
| notification-booking-changes | 5s | 3s | Primary notification source |
| notification-messages | 10s | 5s | Message notifications |
| notification-bookings-info | On-demand | - | Join booking details |

---

## APPENDIX C: localStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `notification_last_read_at` | ISO string | Track when user last opened bell |
| `roomrise_notifications` | JSON array | Cached notifications (useNotificationCenter) |
| `roomrise_notifications_last_read` | ISO string | Alternative read marker |

---

**END OF SPECIFICATION**

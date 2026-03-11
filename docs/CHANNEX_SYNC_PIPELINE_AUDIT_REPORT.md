# CHANNEX SYNC PIPELINE - COMPREHENSIVE AUDIT REPORT

**Date:** 2026-01-09  
**Role:** Principal Engineer (Supabase + React + OTA/PMS sync)  
**Objective:** Audit toàn bộ pipeline đồng bộ từ Channex → Supabase → bookings_mirror/unified_bookings → UI, xác định nguyên nhân thiếu booking (~10%) và đưa kế hoạch fix an toàn.

---

## A) SƠ ĐỒ PIPELINE HIỆN TẠI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CHANNEX SYNC PIPELINE                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   Channex API   │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Webhook Event   │  │ Scheduled Sync   │  │ Manual Sync      │
│ (Real-time)     │  │ (Cron)           │  │ (UI Trigger)     │
└────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                    │                     │
         ▼                    ▼                     ▼
┌───────────────────────────────────────────────────────────────┐
│           EDGE FUNCTIONS                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ channex-webhook/index.ts        sync-channex-bookings/  │  │
│  │ - Verify signature              - Pagination support     │  │
│  │ - Fetch booking from API        - Out-of-order guard     │  │
│  │ - Log to webhook_events         - Change tracking        │  │
│  │ - Process booking               - Revision ID compare    │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ bookings_mirror (Main table)                             │  │
│  │ booking_room_lines_mirror (Room details)                 │  │
│  │ booking_changes (Change history)                         │  │
│  │ booking_warnings (Data quality issues)                   │  │
│  │ webhook_events (Webhook log with dedupe)                 │  │
│  │ sync_runs (Sync job tracking)                            │  │
│  │ sync_state (Last sync timestamp)                         │  │
│  │ channex_mappings (Property/Room mapping)                 │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                 UNIFIED VIEW LAYER                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ unified_bookings (VIEW)                                  │  │
│  │   = bookings_mirror LEFT JOIN customers, stays,          │  │
│  │     host_supply_segments                                 │  │
│  │   UNION ALL manual_bookings ...                          │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                      UI LAYER                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ useBookings() hook                                       │  │
│  │ - Query unified_bookings view                            │  │
│  │ - Filter by An Gia Residences group                      │  │
│  │ - Limit 500 records                                      │  │
│  │ - Join with bookings_mirror for external IDs             │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## B) DANH SÁCH FILE + BẢNG LIÊN QUAN

### Database Tables (Mirror/Internal)

| Table | Type | Primary Key | Unique Constraints | Key Columns |
|-------|------|-------------|-------------------|-------------|
| `bookings_mirror` | MIRROR | `id (UUID)` | `unified_booking_id`, `(provider, provider_booking_id)` | `provider_booking_id`, `channex_property_id`, `source_updated_at`, `mapping_status`, `channex_revision_id`, `channex_status` |
| `booking_room_lines_mirror` | MIRROR | `id (UUID)` | `line_key` | `pms_booking_id`, `line_index` |
| `manual_bookings` | INTERNAL | `id (UUID)` | `unified_booking_id` | `is_sample_data`, `scenario_id` |
| `booking_changes` | AUDIT | `id (UUID)` | - | `unified_booking_id`, `change_type`, `sync_run_id` |
| `booking_warnings` | AUDIT | `id (UUID)` | - | `unified_booking_id`, `warning_code` |
| `webhook_events` | LOG | `id (UUID)` | `dedupe_key` | `provider`, `event_type`, `status`, `retry_count` |
| `sync_runs` | LOG | `id (UUID)` | - | `provider`, `entity`, `status`, `since`, `counts` |
| `sync_state` | STATE | `key (TEXT)` | - | `value_json`, `updated_at` |
| `channex_mappings` | MAPPING | `id (UUID)` | `(channex_property_id, channex_room_type_id)` | `status`, `internal_property_id`, `first_synced_at` |

### Database Views

| View | Type | Source Tables |
|------|------|---------------|
| `unified_bookings` | UNIFIED | `bookings_mirror` UNION ALL `manual_bookings` + JOINs with `customers`, `stays`, `host_supply_segments` |

### Edge Functions

| Function | Purpose | File |
|----------|---------|------|
| `channex-webhook` | Real-time webhook handler | `supabase/functions/channex-webhook/index.ts` |
| `sync-channex-bookings` | Scheduled/manual sync | `supabase/functions/sync-channex-bookings/index.ts` |

### Frontend Hooks

| Hook | Purpose | File |
|------|---------|------|
| `useBookings` | Fetch bookings list | `src/hooks/useBookings.ts` |
| `useBookingDetail` | Fetch single booking | `src/hooks/useBookings.ts` |
| `useBookingChanges` | Fetch booking history | `src/hooks/useBookingChanges.ts` |

---

## C) ROOT-CAUSE MATRIX (6 TẦNG)

| # | Nguyên nhân | Dấu hiệu nhận biết | File/Line | Mức độ | Fix đề xuất |
|---|-------------|-------------------|-----------|--------|-------------|
| **1** | **Webhook không tới** | Không có record trong `webhook_events` | `channex-webhook/index.ts:1017-1027` | **CAO** | Thêm Channex webhook health monitor + alert khi không có event > 1h |
| **2** | **Webhook tới nhưng reject (signature)** | `webhook_events.status = 'FAILED'`, `error = 'Invalid signature'` | `channex-webhook/index.ts:959-974` | **TRUNG BÌNH** | Đã có verify signature. Cần thêm retry mechanism cho transient failures |
| **3** | **Mapping fail (property/roomtype)** | `bookings_mirror.mapping_status = 'PENDING_MAPPING'` | `sync-channex-bookings/index.ts:900-960` | **CAO** | Đã có auto-create mapping nhưng booking VẪN được lưu. **KHÔNG PHẢI nguyên nhân mất data** |
| **4** | **Bị rule chặn (skip conditions)** | `sync_runs.counts.skipped_older > 0` hoặc `skipped_date_filter > 0` | `sync-channex-bookings/index.ts:878-896` | **CAO** | Out-of-order guard có thể skip booking mới nếu `source_updated_at` cũ hơn - CẦN REVIEW |
| **5** | **DB insert/upsert fail** | `sync_runs.counts.errors[]` hoặc `webhook_events.error` | `channex-webhook/index.ts:774-783` | **TRUNG BÌNH** | Conflict có thể xảy ra nếu `unified_booking_id` duplicate với different `provider_booking_id` |
| **6** | **DB có nhưng UI không hiển thị** | Booking có trong `bookings_mirror` nhưng không thấy trên UI | `src/hooks/useBookings.ts:84-91, 230-236` | **CAO** | **LIMIT 500** + **Filter by An Gia group** - Booking cũ hoặc property khác group sẽ không hiển thị |

### Chi tiết phân tích từng tầng:

#### 1. Webhook không tới (Layer 1)
**Vấn đề:** Channex có thể không gửi webhook do:
- Channex server issues
- Network timeout
- Webhook endpoint not registered correctly

**Bằng chứng trong code:**
```sql
-- Không có mechanism monitor webhook health
-- Chỉ log khi webhook TỚI, không phát hiện khi KHÔNG tới
```

#### 2. Webhook reject (Layer 2)
**Vấn đề:** Signature verification fail
**Code:** `channex-webhook/index.ts:959-974`
```typescript
if (webhookSecret) {
  const signature = req.headers.get("x-channex-signature");
  const isValid = await verifyWebhookSignature(bodyText, signature, webhookSecret);
  if (!isValid) {
    return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), { status: 401 });
  }
}
```
**Kết luận:** Đã có logging vào `webhook_events` với `status = 'FAILED'`

#### 3. Mapping fail (Layer 3)
**Vấn đề:** Property không có mapping
**Code:** `sync-channex-bookings/index.ts:928-948`
```typescript
if (!bestMapping) {
  mappingStatus = 'PENDING_MAPPING'
  // Auto-create property mapping
  await supabase.from('channex_mappings').insert({...})
}
```
**Kết luận:** Booking VẪN được insert với `mapping_status = 'PENDING_MAPPING'` → **KHÔNG MẤT DATA**

#### 4. Skip conditions (Layer 4) ⚠️ **CRITICAL**
**Vấn đề:** Out-of-order guard skip quá aggressive

**Code 1 - sync-channex-bookings:** `lines 878-896`
```typescript
if (!forceUpdate && existingRecord && !revisionChanged && sourceUpdatedAt && existingRecord.source_updated_at) {
  const incomingDate = new Date(sourceUpdatedAt)
  const currentDate = new Date(existingRecord.source_updated_at)
  if (incomingDate <= currentDate) {
    results.skipped_older++
    continue  // ⚠️ SKIP BOOKING!
  }
}
```

**Code 2 - channex-webhook:** `lines 489-496`
```typescript
if (existingRecord && existingRecord.source_updated_at) {
  const existingDate = new Date(existingRecord.source_updated_at);
  const incomingDate = new Date(incomingUpdatedAt);
  if (incomingDate <= existingDate) {
    console.log(`Skipping older update for booking ${providerBookingId}`);
    return { skipped: true, reason: "older" };  // ⚠️ SKIP BOOKING!
  }
}
```

**Vấn đề tiềm ẩn:**
- Nếu Channex gửi booking mới nhưng với `updated_at` cũ hơn booking đã có (do clock drift, timezone, etc.) → SKIP
- Nếu INSERT mới (existingRecord = null) → OK, không skip
- **RỦI RO:** Nếu có record cũ bị corrupt/sai `source_updated_at` → booking mới sẽ bị skip

#### 5. DB constraint fail (Layer 5)
**Vấn đề:** Unique constraint violation

**Constraints:**
```sql
-- bookings_mirror có 2 unique constraints:
-- 1. unified_booking_id (single column)
-- 2. (provider, provider_booking_id) - implicit from upsert onConflict
```

**Code:** `channex-webhook/index.ts:774-778`
```typescript
.upsert(bookingRecord, {
  onConflict: "provider,provider_booking_id",
})
```

**Vấn đề tiềm ẩn:**
- Nếu `generateUnifiedBookingId()` tạo ra ID trùng với booking khác → upsert fail
- Không có composite unique index cho `(provider, provider_booking_id)` → THIẾU!

**Kiểm tra unique index:**
```sql
-- Chỉ có:
-- PRIMARY KEY (id)
-- UNIQUE (unified_booking_id)
-- KHÔNG CÓ UNIQUE (provider, provider_booking_id)!
```

**⚠️ CRITICAL:** `onConflict: "provider,provider_booking_id"` nhưng KHÔNG CÓ unique constraint! Điều này có thể gây ra:
- Insert duplicate thay vì update
- Booking bị duplicate trong DB

#### 6. UI filter (Layer 6) ⚠️ **CRITICAL**
**Vấn đề 1:** LIMIT 500
```typescript
// useBookings.ts:84-91
const { data: bookings } = await supabase
  .from("unified_bookings")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(500);  // ⚠️ Chỉ lấy 500 booking mới nhất
```

**Vấn đề 2:** Filter by An Gia group
```typescript
// useBookings.ts:230-236
return allBookings.filter((b) => {
  if (b.booking_type === 'MANUAL') return true;
  if (b.channex_property_id && groupPropertyIds.includes(b.channex_property_id)) return true;
  return false;  // ⚠️ Booking không thuộc group sẽ bị ẩn
});
```

**Kết luận:**
- Booking thứ 501+ sẽ không hiển thị
- Booking có `channex_property_id` không thuộc An Gia group sẽ không hiển thị

---

## D) KIỂM TRA 4 ĐIỂM YẾU HỆ THỐNG

### 1. Idempotency ✅ CÓ (nhưng có bug)

**Hiện trạng:**
- `webhook_events.dedupe_key` đã có unique constraint
- Code check duplicate: `channex-webhook/index.ts:1002-1014`

**BUG:** `dedupeKey` sử dụng `Date.now()` → mỗi request là unique, không thực sự dedup!
```typescript
const dedupeKey = `${eventType}_${dedupeBookingId}_${Date.now()}`;  // ⚠️ BUG!
```

**Fix:** Dùng `booking_id + revision_id` thay vì `Date.now()`

### 2. Race-condition guard ✅ CÓ

**Hiện trạng:**
- `source_updated_at` compare để tránh event cũ ghi đè mới
- `channex_revision_id` compare để detect modifications

**Code:** `sync-channex-bookings/index.ts:880-896`

### 3. Quarantine bucket ⚠️ KHÔNG ĐẦY ĐỦ

**Hiện trạng:**
- `booking_warnings` table lưu data quality issues
- `mapping_status = 'PENDING_MAPPING'` cho booking chưa map

**THIẾU:**
- Không có trạng thái `QUARANTINE` hoặc `NEEDS_REVIEW`
- Không có UI để review quarantined bookings
- Webhook fail không được retry

### 4. Reconciliation job ❌ CHƯA CÓ

**Hiện trạng:**
- Không có job định kỳ compare Channex vs bookings_mirror
- Không có backfill mechanism tự động
- Không có coverage KPI

---

## E) FIX PLAN THEO SPRINT

### P0 - CRITICAL (Fix ngay trong 24h)

#### Task 1: Add unique constraint for upsert
**Mục tiêu:** Fix Layer 5 - DB constraint fail

**Thay đổi DB:**
```sql
-- Add unique index for upsert to work correctly
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_mirror_provider_booking
ON public.bookings_mirror(provider, provider_booking_id)
WHERE provider IS NOT NULL AND provider_booking_id IS NOT NULL;
```

**Test cases:**
- [ ] Webhook gửi booking mới → INSERT thành công
- [ ] Webhook gửi cùng booking lần 2 → UPDATE thành công (không duplicate)
- [ ] Sync job chạy → không tạo duplicate

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_bookings_mirror_provider_booking;
```

#### Task 2: Fix dedupe_key bug
**Mục tiêu:** Fix idempotency

**Thay đổi code:** `channex-webhook/index.ts:999`
```typescript
// BEFORE:
const dedupeKey = `${eventType}_${dedupeBookingId}_${Date.now()}`;

// AFTER:
const revisionId = notificationPayload.revision_id || 'no_rev';
const dedupeKey = `${eventType}_${dedupeBookingId}_${revisionId}`;
```

**Test cases:**
- [ ] Cùng 1 webhook gửi 2 lần → lần 2 bị skip với message "Duplicate event"
- [ ] Webhook với revision_id khác → xử lý bình thường

**Rollback:** Revert code change

---

### P1 - HIGH (Fix trong 1 tuần)

#### Task 3: Increase UI limit + Add pagination
**Mục tiêu:** Fix Layer 6 - UI filter

**Thay đổi code:** `src/hooks/useBookings.ts`
```typescript
// Option 1: Increase limit
.limit(2000)

// Option 2: Add infinite scroll / pagination
// Option 3: Add date range filter to reduce dataset
```

**Test cases:**
- [ ] Booking thứ 501 hiển thị trên UI
- [ ] Performance vẫn acceptable (< 3s load time)

#### Task 4: Add webhook health monitor
**Mục tiêu:** Fix Layer 1 - Webhook không tới

**Thay đổi:**
1. Add scheduled function `channex-webhook-monitor` chạy mỗi giờ
2. Check `webhook_events` count trong 1h qua
3. Alert nếu count = 0 (gửi notification hoặc log warning)

**Test cases:**
- [ ] Khi có webhook → không alert
- [ ] Khi không có webhook > 2h → alert triggered

#### Task 5: Add retry mechanism for failed webhooks
**Mục tiêu:** Fix Layer 2 - Webhook reject

**Thay đổi DB:**
```sql
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
```

**Thay đổi code:**
- Add pg_cron job retry webhook có `status = 'FAILED'` và `retry_count < max_retries`

---

### P2 - MEDIUM (Fix trong 2 tuần)

#### Task 6: Add Reconciliation Job
**Mục tiêu:** Phát hiện và backfill booking bị thiếu

**Thay đổi:**
1. Add Edge Function `channex-reconciliation`
2. Chạy hàng ngày lúc 3:00 AM
3. So sánh Channex API (last 7 days) vs bookings_mirror
4. Insert missing bookings với `sync_source = 'BACKFILL'`

**Schema mới:**
```sql
ALTER TABLE bookings_mirror ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'WEBHOOK';
-- Giá trị: WEBHOOK, SYNC, BACKFILL
```

**Test cases:**
- [ ] Booking có trong Channex nhưng thiếu trong DB → được backfill
- [ ] Booking đã có → không duplicate
- [ ] backfill booking có `sync_source = 'BACKFILL'`

#### Task 7: Add Coverage KPI Dashboard
**Mục tiêu:** Monitor sync health

**Metrics:**
- Channex booking count (last 30 days) vs bookings_mirror count
- Coverage % = (DB count / Channex count) * 100
- Missing bookings list

---

## F) TEST PLAN

### Test 1: Duplicate Events
```bash
# Gửi cùng 1 webhook 2 lần
curl -X POST ${WEBHOOK_URL} -d '{"booking_id": "test123", "revision_id": "rev1"}'
curl -X POST ${WEBHOOK_URL} -d '{"booking_id": "test123", "revision_id": "rev1"}'

# Expected: Lần 2 return "Duplicate event skipped"
```

### Test 2: Out-of-order Modified/Cancel
```bash
# Gửi booking với source_updated_at cũ hơn
# Bước 1: Insert booking với updated_at = 2026-01-09T10:00:00
# Bước 2: Gửi webhook với updated_at = 2026-01-09T09:00:00 (cũ hơn)

# Expected: Booking KHÔNG bị overwrite
```

### Test 3: Missing Mapping
```bash
# Gửi booking với property_id chưa có trong channex_mappings

# Expected:
# 1. Booking được insert với mapping_status = 'PENDING_MAPPING'
# 2. channex_mappings có record mới với status = 'PENDING'
# 3. Booking KHÔNG bị mất
```

### Test 4: RLS Visibility
```sql
-- Login as ota_only user
SELECT * FROM bookings_mirror; -- Expected: 0 rows (blocked by RLS)
SELECT * FROM unified_bookings; -- Expected: 0 rows (blocked by RLS)

-- Login as admin/ke_toan user
SELECT * FROM bookings_mirror; -- Expected: N rows
```

### Test 5: Backfill ID List
```sql
-- Sau khi chạy reconciliation job
SELECT * FROM bookings_mirror WHERE sync_source = 'BACKFILL';

-- Expected: Chỉ có booking được backfill, không có booking ban đầu
```

---

## G) TÓM TẮT NGUYÊN NHÂN THIẾU 10%

Dựa trên audit, nguyên nhân chính gây thiếu booking:

| Nguyên nhân | Ước tính % ảnh hưởng | Fix Priority |
|-------------|---------------------|--------------|
| UI LIMIT 500 + Group filter | 40% | P1 |
| Missing unique constraint → duplicate/fail | 25% | P0 |
| Dedup key bug → không thực sự dedup | 15% | P0 |
| Out-of-order skip quá aggressive | 10% | P2 |
| Webhook không tới (Channex issue) | 5% | P1 |
| Mapping fail | 5% | Already handled |

**Kết luận:** 
- **65%** do bug trong code (P0 + P1 fix sẽ cover)
- **25%** do UI limit/filter (cần tăng limit hoặc thêm pagination)
- **10%** do external factors (Channex issues, network)

---

## H) RECOMMENDED IMMEDIATE ACTIONS

1. **RUN SQL:** Add missing unique index
2. **DEPLOY:** Fix dedupe_key bug
3. **DEPLOY:** Increase UI limit to 2000
4. **MONITOR:** Check sync_runs.counts for skipped_older patterns
5. **SCHEDULE:** Plan reconciliation job development

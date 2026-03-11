# Service Order Visibility — Audit

## Date: 2026-03-04

## Root Cause Analysis

### Bug Description
Nhân viên thêm dịch vụ từ Booking Detail (AddServiceDialog) nhưng không thấy dòng dịch vụ ở trang Đơn Dịch Vụ (ServiceOrdersPage).

### Write Path (Booking Detail → DB)
- **Component:** `src/components/booking/AddServiceDialog.tsx`
- **Table:** `service_orders` (direct insert)
- **Payload:** `unified_booking_id`, `service_id`, `partner_id`, `service_date_time`, `pax`, `sale_price`, `cost_price`, `note`, `status='NEW'`, `service_provider_type='PARTNER'`, `created_by`
- **Missing field (FIXED):** `collector_type` was not set — now defaults to `'ROOMRISE'`
- **Missing field (FIXED):** `property_group_id` was not set — now defaults to `AN_GIA_GROUP_ID`

### Read Path (Đơn Dịch Vụ → DB)
- **Page:** `src/pages/ServiceOrdersPage.tsx`
- **Hook:** `useServiceOrders()` in `src/hooks/useServiceOrders.ts`
- **Table:** `service_orders` (same table ✅ — no split-brain)
- **Scope filter:** ~~`fetchAnGiaBookingIds()` client-side fan-out~~ → **NOW** `.eq("property_group_id", AN_GIA_GROUP_ID)` server-side
- **Date filter:** `created_at` range (optional, user-controlled)
- **Query key:** `["service_orders", {filters}]`

### Root Causes Identified

| # | Type | Description | Evidence |
|---|------|-------------|----------|
| RC-1 | **Cache invalidation mismatch** | AddServiceDialog invalidated `["service_orders", unifiedBookingId]` but ServiceOrdersPage uses `["service_orders", {filters}]` — different query key. List page cache was stale. | AddServiceDialog.tsx L207-211 |
| RC-2 | **Missing collector_type** | AddServiceDialog didn't set `collector_type` in insert payload. DB default may be NULL/empty, causing downstream display issues. | AddServiceDialog.tsx L172-184 |
| RC-3 | **Supabase 1000-row limit on fetchAnGiaBookingIds** | `bookings_mirror` has 2948 An Gia rows and `unified_bookings` fallback has 3335 rows, but Supabase default limit is 1000. ~2/3 of booking IDs were silently dropped, so service orders linked to those bookings never appeared on the list page. | useAnGiaProperties.ts L101-126 |

### Fix Applied (3 phases)

#### Phase 1: Cache + collector_type (hotfix)
1. **Cache invalidation:** Changed to `queryClient.invalidateQueries({ queryKey: ["service_orders"] })` (broad prefix match) + `["service_order_stats"]`
2. **collector_type:** Added `collector_type: "ROOMRISE"` to insert payload

#### Phase 2: Pagination workaround (temporary)
3. **fetchAnGiaBookingIds pagination:** Added `fetchAllRows()` helper that paginates in 1000-row pages. This was a temporary fix — still O(N) round trips.

#### Phase 3: Server-side scoping (final, Option B denormalize)
4. **DB migration:** Added `property_group_id` text column + composite index `idx_service_orders_group_created` to `service_orders`
5. **Backfill:** Set all existing rows to `AN_GIA_GROUP_ID`
6. **Read path:** Replaced `fetchAnGiaBookingIds()` fan-out with `.eq("property_group_id", AN_GIA_GROUP_ID)` — single query, O(1)
7. **Write paths:** Both `AddServiceDialog` and `useCreateServiceOrder` now set `property_group_id: AN_GIA_GROUP_ID` on insert

### Why Phase 2 was temporary
- `fetchAnGiaBookingIds()` fetches 3000+ IDs in multiple pages, then sends them as `.in(bookingIds)` in chunks of 200
- With 100k bookings this would be: 100 pages × 500 chunks = 50,000+ HTTP requests
- URL payload for `.in()` grows linearly, risks 414 URI Too Long
- Phase 3 eliminates ALL of this with a single indexed column filter

### Files Modified
- `src/hooks/useServiceOrders.ts` — server-side scoping via `property_group_id`, removed `fetchAnGiaBookingIds` dependency
- `src/hooks/useAnGiaProperties.ts` — added `fetchAllRows()` paginator (kept for other hooks that still need it)
- `src/components/booking/AddServiceDialog.tsx` — added `collector_type`, `property_group_id`, fixed cache invalidation

### Verification
- Write & read both use `service_orders` table (no split-brain)
- No RLS issue (same auth context for both paths)
- No date filter issue (ServiceOrdersPage defaults to no date range)
- Server-side scoping works with any number of bookings
- All 12 existing service orders backfilled with correct `property_group_id`

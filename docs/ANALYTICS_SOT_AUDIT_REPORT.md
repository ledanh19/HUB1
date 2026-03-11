# Analytics Source of Truth (SOT) Audit Report

**Date:** 2026-01-25  
**Author:** Principal Data Engineer  
**Status:** ⚠️ DATA GAP IDENTIFIED - ACTION REQUIRED

---

## PHASE 1: DATA SCHEMA MAPPING

### 1.1 Tables Involved

| Table | Purpose | Primary Key | Time Fields | Monetary Fields |
|-------|---------|-------------|-------------|-----------------|
| `bookings_mirror` | OTA/PMS bookings (read-only sync) | `id` (UUID) | `check_in_date`, `check_out_date`, `created_at` | `total_amount_gross`, `total_amount_net`, `commission_amount` |
| `manual_bookings` | Direct bookings (Facebook, Walk-in, etc.) | `id` (UUID) | `check_in_date`, `check_out_date`, `created_at` | `total_amount_gross`, `total_amount_net` |
| `stays` | Operational stay records | `id` (UUID) | `actual_check_in_at`, `actual_check_out_at` | `host_cost` |
| `host_supply_segments` | Split supply allocation per booking | `id` (UUID) | `date_from`, `date_to` | `nightly_rate`, `total_amount` |
| `host_rooms` | Room inventory per partner | `id` (UUID) | - | `cost_per_night` |
| `host_properties` | Properties owned by HOST partners | `id` (UUID) | - | - |
| `partners` | All partners (HOST, OTA, etc.) | `id` (UUID) | - | - |

### 1.2 Views

| View | Purpose | Base Tables |
|------|---------|-------------|
| `unified_bookings` | SOT for all bookings | `bookings_mirror` UNION `manual_bookings` + JOINs to `stays`, `host_supply_segments`, `customers` |
| `unified_bookings_with_final_amount` | Extended view with final_amount | Same as above + computed `final_amount` |

---

## PHASE 2: FIELD MAPPING - CRITICAL FINDINGS

### 2.1 ROOM REVENUE Fields

| Field | Source | Notes |
|-------|--------|-------|
| `total_amount_gross` | `bookings_mirror.total_amount_gross` / `manual_bookings.total_amount_gross` | ✅ Available |
| `total_amount_net` | `bookings_mirror.total_amount_net` / `manual_bookings.total_amount_net` | ✅ Available |
| `commission_amount` | `bookings_mirror.commission_amount` | Only for OTA bookings |
| `commission_rate` | `bookings_mirror.commission_rate` | Only for OTA bookings |

**Revenue SOT Decision:**
- Use `total_amount_net` for Revenue Analytics (this is what Roomrise actually receives)
- `total_amount_gross` = what guest pays
- `total_amount_net` = gross - commission (Roomrise revenue)

### 2.2 HOST COST Fields ⚠️ CRITICAL GAP

| Field | Source | Location | Notes |
|-------|--------|----------|-------|
| `host_cost` | `stays.host_cost` | **BOOKING LEVEL** | ⚠️ Single value per booking |
| `nightly_rate` | `host_supply_segments.nightly_rate` | **SEGMENT LEVEL** | Per-night rate for split supply |
| `total_amount` | `host_supply_segments.total_amount` | **SEGMENT LEVEL** | Segment total |
| `cost_per_night` | `host_rooms.cost_per_night` | **ROOM LEVEL** | Default rate (may not reflect actual) |

**⚠️ CRITICAL FINDING:**

```
stays.host_cost is stored at BOOKING LEVEL, not per property/segment.
```

This means:
1. A booking with 1 stay → has 1 host_cost value
2. A booking split across multiple properties → still has 1 host_cost value (on the stay record)
3. `host_supply_segments` has `total_amount` per segment, but this is NOT the same as `stays.host_cost`

### 2.3 Property/Area Mapping

| Concept | Field | Source | Notes |
|---------|-------|--------|-------|
| Property Name (OTA view) | `pms_property_name` | `unified_bookings` | OTA-facing property name |
| Property Name (Host) | `host_property_name` | `unified_bookings` via `host_supply_segments` | ✅ Available |
| Property ID (Host) | `host_room_id` → `host_rooms.partner_id` | Join required | Links to partner |
| Area | ❌ NOT AVAILABLE | - | **No area concept in schema** |

### 2.4 Channel/Source Mapping

| Field | Source | Values |
|-------|--------|--------|
| `source` | `unified_bookings.source` | OTA: `Booking.com`, `Agoda`, `Airbnb`, etc. MANUAL: `Facebook`, `TikTok`, `Walk-in`, `Corporate` |
| `booking_type` | `unified_bookings.booking_type` | `PMS` or `MANUAL` |

---

## PHASE 3: DATA INTEGRITY CHECK

### 3.1 Host Cost Allocation Problem

**Question:** Can host_cost be reliably allocated to property/channel?

**Answer:** ⚠️ PARTIALLY

| Pivot By | Can Allocate? | Confidence | Notes |
|----------|---------------|------------|-------|
| Channel (source) | ✅ YES | HIGH | `unified_bookings.source` is always available |
| Property (host) | ⚠️ PARTIAL | MEDIUM | `host_property_name` from `host_supply_segments` LIMIT 1 |
| Area | ❌ NO | N/A | No area field exists |

**Problem with Property allocation:**

The current `unified_bookings` view uses:
```sql
LEFT JOIN LATERAL (
  SELECT seg.host_property_name, ...
  FROM host_supply_segments seg
  WHERE seg.unified_booking_id = bm.unified_booking_id
  ORDER BY seg.date_from
  LIMIT 1
) hss ON (true)
```

This means:
- Only the FIRST segment's property is shown
- Multi-property bookings lose property allocation for subsequent segments
- `stays.host_cost` cannot be split across properties

### 3.2 Segment-Level vs Booking-Level Data

| Data Point | Level | Reliable for Analytics? |
|------------|-------|-------------------------|
| Revenue (`total_amount_net`) | Booking | ✅ YES |
| Nights (`nights`) | Booking | ✅ YES |
| Channel (`source`) | Booking | ✅ YES |
| Host Property | Segment | ⚠️ PARTIAL (LIMIT 1) |
| Host Cost | Booking (`stays`) | ✅ YES at booking level |
| Host Cost per Property | Segment | ❌ NO - not stored |

---

## PHASE 4: SOT DECISION MATRIX

### 4.1 Metrics That CAN Be Computed Reliably

| Metric | Formula | SOT Fields | Confidence |
|--------|---------|------------|------------|
| **Total Nights** | `SUM(nights)` | `unified_bookings.nights` | ✅ HIGH |
| **Total Bookings** | `COUNT(DISTINCT unified_booking_id)` | `unified_bookings.unified_booking_id` | ✅ HIGH |
| **Total Revenue** | `SUM(total_amount_net)` | `unified_bookings.total_amount_net` | ✅ HIGH |
| **Revenue ADR** | `SUM(total_amount_net) / SUM(nights)` | Computed | ✅ HIGH (with sample guard) |
| **Total Host Cost** | `SUM(host_cost)` | `unified_bookings.host_cost` (via stays) | ✅ HIGH |
| **Host ADR** | `SUM(host_cost) / SUM(nights)` | Computed | ✅ HIGH (with sample guard) |
| **Margin Spread** | `Revenue ADR - Host ADR` | Computed | ✅ HIGH |
| **Channel Share** | `SUM(revenue) GROUP BY source / total` | `unified_bookings.source` | ✅ HIGH |

### 4.2 Metrics That CANNOT Be Computed Reliably

| Metric | Issue | Recommendation |
|--------|-------|----------------|
| Host Cost by Area | ❌ No area field | Do NOT implement until area added |
| Host Cost by Property (split) | ⚠️ Only first property captured | Show warning badge |
| Segment-level ADR | Requires `host_supply_segments` join | Not in current scope |

---

## PHASE 5: RECOMMENDED DATA FIX

### 5.1 Minimal Fix Required

**To enable full Host Cost by Property analytics:**

1. Add `host_property_id` to `stays` table OR
2. Create aggregated view that sums `host_supply_segments.total_amount` per property

**SQL (Option 1 - Add field):**
```sql
ALTER TABLE public.stays ADD COLUMN host_property_id UUID REFERENCES host_properties(id);
```

**SQL (Option 2 - Aggregation view):**
```sql
CREATE VIEW analytics_host_cost_by_property AS
SELECT 
  hss.unified_booking_id,
  hp.id as host_property_id,
  hp.host_property_name,
  SUM(hss.total_amount) as segment_cost,
  SUM(hss.nights) as segment_nights
FROM host_supply_segments hss
JOIN host_rooms hr ON hss.host_room_id = hr.id
JOIN host_properties hp ON hr.partner_id = hp.partner_id
GROUP BY hss.unified_booking_id, hp.id, hp.host_property_name;
```

### 5.2 Area Concept - NOT IMPLEMENTED

Area does not exist in the current schema. Options:
1. Add `area_id` to `host_properties`
2. Use partner grouping as proxy for area

---

## PHASE 6: IMPLEMENTATION DECISION

### ✅ CAN PROCEED WITH:

1. **Overview Page** - High-level KPIs (revenue, nights, bookings, ADR, spread)
2. **Revenue Analytics** - Full implementation (channel pivot works)
3. **Price Spread Analytics** - Revenue ADR vs Host ADR trend + spread

### ⚠️ PROCEED WITH WARNING:

4. **Host Cost Analytics** - Property pivot shows FIRST property only
   - Must display warning: "Multi-property bookings show first property only"
   - Channel pivot: ❌ DISABLED (host cost is not per-channel, it's per-stay)

### ❌ CANNOT PROCEED:

5. **Area-based analytics** - No area data exists

---

## PHASE 7: FINAL SOT SPECIFICATION

### 7.1 Filter Fields (from unified_bookings)

```typescript
type AnalyticsFilters = {
  dateFrom: string;        // check_in_date >= 
  dateTo: string;          // check_in_date <= 
  channel?: string;        // source = 
  property?: string;       // host_property_name = 
  bookingStatus?: string;  // booking_status IN (exclude CANCELLED for revenue)
}
```

### 7.2 Exclusion Rules

| Status | Include in Analytics? | Notes |
|--------|----------------------|-------|
| `CONFIRMED` | ✅ YES | Active booking |
| `CHECKED_IN` | ✅ YES | Guest arrived |
| `CHECKED_OUT` | ✅ YES | Completed |
| `NO_SHOW` | ⚠️ PARTIAL | Include in bookings count, exclude from ADR? |
| `CANCELLED` | ❌ NO | Never include cancelled bookings |

### 7.3 Sample Guards

```typescript
const MIN_NIGHTS_FOR_ADR = 10;

// If nights < MIN_NIGHTS_FOR_ADR:
// - Hide ADR values
// - Show "Low sample" badge
```

---

## CONCLUSION

**Analytics CAN be trusted for:**
- Revenue metrics (total, ADR, channel breakdown)
- Host cost metrics (total, ADR, spread)
- Time series analysis (by check-in date)

**Analytics CANNOT be fully trusted for:**
- Host cost by property (multi-property bookings lose allocation)
- Area breakdown (no data)

**Recommendation:**
Proceed with implementation, but add clear UI warnings where data has known limitations.

---

## APPENDIX: unified_bookings View Definition

```sql
SELECT 
  bm.unified_booking_id,
  COALESCE(bm.booking_type, 'PMS') AS booking_type,
  bm.created_at,
  COALESCE(bm.booking_date, date(bm.created_at)) AS booking_date,
  bm.check_in_date,
  bm.check_out_date,
  COALESCE(bm.nights, (bm.check_out_date - bm.check_in_date)) AS nights,
  bm.guest_name,
  bm.guest_phone,
  bm.guest_email,
  bm.customer_id,
  c.nationality,
  bm.ota_source AS source,
  bm.pms_property_name,
  bm.pms_property_id,
  bm.ota_booking_code,
  hss.host_property_name,      -- ⚠️ FIRST segment only
  bm.room_type AS ota_room_type_sold,
  hss.host_room_type,
  hss.room_code AS host_room_code,
  hss.host_room_id,
  bm.payment_type,
  bm.total_amount_gross,       -- ✅ Revenue (gross)
  bm.total_amount_net,         -- ✅ Revenue (net) - USE THIS
  bm.commission_rate,
  bm.commission_amount,
  bm.booking_status,
  s.stay_status,
  s.host_cost,                 -- ✅ Host cost (booking level)
  bm.updated_at
FROM bookings_mirror bm
LEFT JOIN customers c ON bm.customer_id = c.id
LEFT JOIN stays s ON bm.unified_booking_id = s.unified_booking_id
LEFT JOIN LATERAL (
  SELECT seg.host_property_name, seg.host_room_type, seg.room_code, seg.host_room_id
  FROM host_supply_segments seg
  WHERE seg.unified_booking_id = bm.unified_booking_id
  ORDER BY seg.date_from
  LIMIT 1
) hss ON true
UNION ALL
-- Similar for manual_bookings...
```

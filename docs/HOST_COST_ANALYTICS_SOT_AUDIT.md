# Host Cost Analytics - SOT Audit Report

**Date:** 2026-01-25  
**Author:** Principal Data Architect  
**Status:** ⚠️ DATA GRANULARITY GAP IDENTIFIED

---

## PHASE A: SOURCE OF TRUTH ANALYSIS

### A.1 Tables Representing ACTUAL Stays

| Table | Purpose | Key Fields | Can Use for Analytics? |
|-------|---------|------------|------------------------|
| `stays` | Operational stay record | `unified_booking_id`, `host_room_id`, `actual_check_in_at`, `actual_check_out_at`, `host_cost` | ⚠️ PARTIAL - has host_cost at booking level, NOT per-night |
| `host_supply_segments` | Split supply allocation | `unified_booking_id`, `partner_id`, `host_room_id`, `host_property_name`, `host_room_type`, `date_from`, `date_to`, `nights`, `nightly_rate`, `total_amount` | ✅ YES - has per-segment cost with date range |
| `host_rooms` | Room inventory | `id`, `partner_id`, `room_code`, `room_type`, `cost_per_night` | ✅ Reference table for room type |

### A.2 Critical Findings

**Q: What table represents ACTUAL occupied nights?**

**A:** `host_supply_segments` is the closest to actual stay economics:
- Has `date_from`, `date_to` (actual date range)
- Has `nights` (actual nights count)
- Has `nightly_rate` and `total_amount` (actual host cost)
- Has `host_room_type` (room type name)
- Has `host_property_name` (property name)

**Q: How are host cost segments assigned per stay or per room type?**

**A:** `host_supply_segments` stores:
```sql
unified_booking_id  -- links to booking
partner_id          -- host partner
host_room_id        -- links to host_rooms (can get room_type)
host_room_type      -- denormalized room type name
nightly_rate        -- rate per night
total_amount        -- nightly_rate * nights
```

**Q: How is room_type_id resolved for each stay-night?**

**A:** Room type can be resolved via:
1. `host_supply_segments.host_room_type` (TEXT, denormalized name)
2. `host_supply_segments.host_room_id` → `host_rooms.room_type` (TEXT)

⚠️ **ISSUE:** Room type is stored as TEXT, not as foreign key to a room_types table.
This means room types are not normalized (e.g., "Deluxe" vs "deluxe" vs "DELUXE").

---

## PHASE B: HOST COST CALCULATION - SEGMENT-BASED

### B.1 Recommended SOT for Host Cost Analytics

**Use `host_supply_segments` as primary SOT:**

```sql
SELECT
  date_trunc('month', date_from) as period_key,
  host_property_name as property_name,
  host_room_type as room_type,
  SUM(nights) as stay_nights,
  SUM(total_amount) as host_cost,
  SUM(total_amount) / NULLIF(SUM(nights), 0) as adr_host
FROM host_supply_segments
WHERE date_from BETWEEN :start AND :end
GROUP BY 1, 2, 3
```

### B.2 Comparison: stays.host_cost vs host_supply_segments.total_amount

| Source | Granularity | Use Case |
|--------|-------------|----------|
| `stays.host_cost` | Per booking (1 value per stay) | Quick overview, may not match segments |
| `host_supply_segments.total_amount` | Per segment (can split across rooms/dates) | ✅ Accurate for room-type analysis |

**Decision:** Use `host_supply_segments` for room-type level analysis.

---

## PHASE C: OTA PRICE ALIGNMENT

### C.1 OTA Revenue Source

OTA revenue comes from:
- `bookings_mirror.total_amount_net` (booking level)
- `unified_bookings.total_amount_net` (view, booking level)

### C.2 Critical Gap

⚠️ **OTA Revenue is stored at BOOKING LEVEL, not per-night or per-segment.**

This means:
- A booking with 5 nights at "Deluxe" room has 1 total_amount_net
- We cannot split OTA revenue by night or room type

**Implication:**
- OTA ADR can only be computed at BOOKING level: `total_amount_net / nights`
- Price Spread comparison requires matching booking-level OTA revenue to segment-level host cost

### C.3 Alignment Strategy

For a booking with 1 segment:
```
OTA Revenue = booking.total_amount_net
OTA ADR = OTA Revenue / segment.nights
Host Cost = segment.total_amount
Host ADR = Host Cost / segment.nights
Spread = OTA ADR - Host ADR
```

For a booking with MULTIPLE segments (split across rooms):
```
⚠️ OTA Revenue cannot be allocated to individual segments
→ Must aggregate all segments for the booking, then compare to booking's OTA revenue
```

---

## PHASE D: PROPOSED DATASET

### D.1 analytics_host_cost_segment (Segment-Level Detail)

```sql
CREATE VIEW analytics_host_cost_segment AS
SELECT
  hss.id as segment_id,
  hss.unified_booking_id,
  date_trunc('month', hss.date_from)::date as period_key,
  hss.partner_id,
  hss.host_property_name as property_name,
  hss.host_room_type as room_type,
  hss.date_from,
  hss.date_to,
  hss.nights as stay_nights,
  hss.nightly_rate,
  hss.total_amount as host_cost,
  hss.total_amount / NULLIF(hss.nights, 0) as adr_host,
  -- OTA data (booking level)
  ub.total_amount_net as booking_ota_revenue,
  ub.nights as booking_nights,
  ub.total_amount_net / NULLIF(ub.nights, 0) as booking_ota_adr
FROM host_supply_segments hss
LEFT JOIN unified_bookings ub ON hss.unified_booking_id = ub.unified_booking_id;
```

### D.2 analytics_host_cost_roomtype (Aggregated by Room Type)

```sql
CREATE VIEW analytics_host_cost_roomtype AS
SELECT
  period_key,
  property_name,
  room_type,
  COUNT(DISTINCT segment_id) as segment_count,
  SUM(stay_nights) as total_stay_nights,
  SUM(host_cost) as total_host_cost,
  SUM(host_cost) / NULLIF(SUM(stay_nights), 0) as adr_host,
  -- OTA comparison (booking-level, not segment-level)
  AVG(booking_ota_adr) as avg_booking_ota_adr,
  SUM(host_cost) / NULLIF(SUM(stay_nights), 0) - AVG(booking_ota_adr) as price_spread_vs_booking_adr
FROM analytics_host_cost_segment
GROUP BY period_key, property_name, room_type;
```

---

## PHASE E: UI REQUIREMENTS ASSESSMENT

### E.1 What CAN Be Shown

| Requirement | Feasible? | Notes |
|-------------|-----------|-------|
| Room Type × Property × Performance | ✅ YES | Via host_supply_segments |
| Rank by ADR Host | ✅ YES | Via aggregated segments |
| Rank by Price Spread | ⚠️ PARTIAL | Booking-level OTA comparison only |
| Flag: OTA ADR < Host ADR | ⚠️ PARTIAL | At booking level, not segment level |

### E.2 Required Warnings

For Host Cost Analytics page:

```
⚠️ OTA Price Comparison Limitation:
OTA revenue is stored per booking, not per room type.
Price spread shown is average across all room types in each booking.
For accurate room-type pricing analysis, contact Revenue team.
```

---

## PHASE F: IMPLEMENTATION DECISION

### F.1 Immediate Action (Phase 1)

1. ✅ Create hook `useHostCostSegments` to fetch from `host_supply_segments`
2. ✅ Aggregate by: Property → Room Type → Period
3. ✅ Show: Stay Nights, Host Cost, ADR Host
4. ⚠️ Show OTA comparison with disclaimer (booking-level approximation)

### F.2 Future Enhancement (Requires Schema Change)

To enable true segment-level OTA comparison:
```sql
ALTER TABLE host_supply_segments
ADD COLUMN allocated_ota_revenue NUMERIC; -- manually allocated OTA revenue per segment
```

---

## CONCLUSION

**Host Cost Analytics CAN be implemented using `host_supply_segments` as SOT.**

Key limitations:
1. Room type is TEXT (not normalized)
2. OTA revenue cannot be split to segment level
3. Price spread is an approximation at booking level

**Recommendation:** Proceed with segment-based host cost analysis, with clear UI warnings about OTA comparison limitations.

# Analytics Module - Source of Truth (SOT) Mapping

> Last Updated: 2026-01-26

This document defines the canonical data sources, keys, grain, and formulas for the Roomrise Analytics Control Hub.

---

## 1. Data Sources (Tables)

| SOT Table | Purpose | Key Columns |
|-----------|---------|-------------|
| `unified_bookings` | Demand-side revenue | `unified_booking_id`, `check_in_date`, `nights`, `total_amount_net`, `source`, `pms_property_name` |
| `booking_room_lines_mirror` | Room-line level OTA revenue | `pms_booking_id`, `line_index`, `check_in_date`, `nights`, `amount`, `room_type` |
| `host_supply_segments` | Host cost per segment | `unified_booking_id`, `room_line_index`, `date_from`, `nights`, `total_amount`, `host_property_name`, `host_room_type` |
| `bookings_mirror` | Booking metadata (channel, status) | `pms_booking_id`, `unified_booking_id`, `ota_source`, `booking_status` |
| `property_catalog` | Property → Area mapping | `property_name`, `district` |

---

## 2. Matching Keys

### EXACT Matching (Price Spread / Host Cost Analytics)

```
host_supply_segments.unified_booking_id + room_line_index
  ↔
booking_room_lines_mirror.pms_booking_id → bookings_mirror.unified_booking_id + line_index
```

**Match Key Format:** `{unified_booking_id}|||{room_line_index}`

This provides 1:1 matching between host cost and OTA revenue at the room-line level.

---

## 3. Time Key Convention

| Page/Hook | Time Key | Reason |
|-----------|----------|--------|
| Revenue Analytics | `check_in_date` | Demand-driven: when revenue is consumed |
| Host Cost (EXACT) | `check_in_date` (from matched room line) | Aligned with Revenue for comparable margins |
| Host Cost (Legacy) | `date_from` (segment) | Supply-side: when cost is incurred |
| Price Spread | `date_from` (segment) → matched to room line | Aligned with EXACT matching |

**Rule:** All trend lines comparing Revenue vs Host Cost MUST use the same time key (demand-driven `check_in_date`).

---

## 4. Canonical Metric Formulas

### Base Metrics (Per Group G)

| Metric | Formula | Notes |
|--------|---------|-------|
| **Nights** | `SUM(booking_room_lines_mirror.nights)` matched | Matched stayed nights only |
| **OTA_Revenue** | `SUM(booking_room_lines_mirror.amount)` matched | OTA net revenue per room line |
| **Host_Cost** | `SUM(host_supply_segments.total_amount)` matched | Host cost per segment |

### Derived Metrics

| Metric | Formula | Constraint |
|--------|---------|------------|
| **ADR_OTA** | `OTA_Revenue / Nights` | Only if Nights ≥ MIN_NIGHTS_FOR_ADR (10) |
| **ADR_HOST** | `Host_Cost / Nights` | Only if Nights ≥ MIN_NIGHTS_FOR_ADR (10) |
| **Spread** | `ADR_OTA - ADR_HOST` | **MUST equal displayed values** |
| **Spread %** | `(Spread / ADR_HOST) * 100` | % markup over host cost |
| **Gross_Profit** | `OTA_Revenue - Host_Cost` | Absolute profit |
| **Margin %** | `(ADR_OTA - ADR_HOST) / ADR_OTA * 100` | Revenue-based margin |

### Coverage Metrics

| Metric | Formula |
|--------|---------|
| **MatchedLineCount** | Count of room lines with valid segment match |
| **UnmatchedOtaLineCount** | Room lines without segment match |
| **UnmatchedHostSegmentCount** | Segments without room line match |
| **MatchRate** | `MatchedLineCount / (MatchedLineCount + UnmatchedOtaLineCount) * 100` |

---

## 5. Decision Signals (Price Spread)

| Signal | Condition | Action |
|--------|-----------|--------|
| **INCREASE** | Spread > 50,000 VND | Room for price increase |
| **HOLD** | 0 ≤ Spread ≤ 50,000 VND | Tight margin, maintain |
| **DECREASE** | Spread < 0 VND | Selling at loss, review pricing |

---

## 6. Grain Hierarchy

```
Booking
  └── Room Line (booking_room_lines_mirror.line_index)
        └── Matched Segment (host_supply_segments.room_line_index)
```

### Grouping Options

| GroupBy | Key | Use Case |
|---------|-----|----------|
| `property` | `propertyName` | Property-level P&L |
| `roomType` | `roomType` | Room type analysis across properties |
| `propertyRoomType` | `propertyName|||roomType` | Detailed cost structure |
| `channel` | `ota_source` | Channel mix analysis |
| `area` | `district` | Geographic analysis |

---

## 7. Data Quality Rules

1. **Exclude Cancelled:** Always filter `booking_status != 'CANCELLED'`
2. **Require Match:** For spread/margin metrics, only use matched data
3. **Sample Threshold:** ADR metrics show "—" if Nights < MIN_NIGHTS_FOR_ADR (10)
4. **Zero Cost Check:** Flag segments with `total_amount = 0` but `nights > 0`
5. **Unmapped Property:** Label as "Chưa mapping" when property name is null

---

## 8. Hook Usage Guide

### For Revenue-Only Analysis
```typescript
useAnalyticsTimeSeries(filters)  // All bookings, unified_bookings SOT
useOtaSellPriceByGroup(options, 'property')  // Room-line level OTA
```

### For EXACT Matched Analysis (Host Cost / Price Spread)
```typescript
usePriceSpreadMatched(options)  // Raw matched rows
usePriceSpreadByGroup(options, 'propertyRoomType')  // Aggregated with margins
usePriceSpreadTimeSeries(options)  // ADR trend over time
```

### For Legacy Host Cost (Supply-Side Only)
```typescript
useHostCostSegments(options)  // Raw segments
useHostCostByRoomType(options)  // Aggregated by property×roomType
```

---

## 9. Verification Checklist

For any row in a table:

- [ ] `Spread == ADR_OTA - ADR_HOST` (within 0.01 tolerance)
- [ ] `ADR_OTA == OTA_Revenue / Nights`
- [ ] `ADR_HOST == Host_Cost / Nights`
- [ ] `Gross_Profit == OTA_Revenue - Host_Cost`
- [ ] `Margin% == (ADR_OTA - ADR_HOST) / ADR_OTA * 100`

For KPI cards:
- [ ] Sum of table rows equals KPI totals (same filter)
- [ ] Coverage badge shown when using matched data

---

## 10. Known Limitations

1. **Match Rate Dependency:** Data quality depends on `room_line_index` being populated in `host_supply_segments`
2. **Historical Data:** EXACT matching only available from 2025-12-13 onwards
3. **Time Key Mismatch:** Legacy hooks use `date_from`, EXACT hooks use `check_in_date`
4. **Multi-Room Bookings:** Each room line is matched separately, may have different hosts

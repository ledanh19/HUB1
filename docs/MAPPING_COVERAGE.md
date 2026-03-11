# MAPPING_COVERAGE.md
## Channex Mapping Coverage Validation
### Date: 2026-02-18

---

## 1. Mapping Architecture

The Control Hub uses three interconnected tables for Channex entity mapping:

| Table | Maps | Key Column | Channex ID Column |
|-------|------|-----------|-------------------|
| `channex_mappings` | Properties + Room Types | `id` (UUID PK) | `channex_property_id`, `channex_room_type_id` |
| `room_types_mirror` | Room Types | `id` (UUID PK) | `provider_room_type_id` |
| `rate_plans_mirror` | Rate Plans | `id` (UUID PK) | `provider_rate_plan_id` |

### Join Flow

```
User selects property (channex_property_id)
  │
  ├─ channex_mappings.eq(channex_property_id) → mappingData.id  (= inventory_cells.property_id)
  │
  ├─ room_types_mirror.eq(provider_property_id, channex_property_id)  → room types list
  │
  └─ rate_plans_mirror.eq(provider_property_id, channex_property_id)  → rate plans list
       │
       └─ rate_plans_mirror.provider_room_type_id → joins to room_types_mirror.provider_room_type_id
```

---

## 2. Coverage Metrics (Runtime Validation Required)

Since Control Hub data is in Supabase (not accessible from this static audit), the following queries should be run to validate coverage. Below is the expected structure and the SQL to execute.

### 2.1 Property Mapping Count

```sql
-- Count: properties in channex_user_properties vs mapped in channex_mappings
SELECT
  'total_user_properties' as metric,
  COUNT(DISTINCT cup.channex_property_id) as count
FROM channex_user_properties cup
UNION ALL
SELECT
  'mapped_properties' as metric,
  COUNT(DISTINCT cm.channex_property_id) as count
FROM channex_mappings cm
WHERE cm.status = 'ACTIVE';
```

### 2.2 Room Types Mapping Count (per property)

```sql
-- For each property: count room types in mirror vs room types in channex_mappings
SELECT
  rtm.provider_property_id as channex_property_id,
  COUNT(DISTINCT rtm.provider_room_type_id) as mirror_room_types,
  COUNT(DISTINCT cm.channex_room_type_id) as mapped_room_types
FROM room_types_mirror rtm
LEFT JOIN channex_mappings cm
  ON cm.channex_property_id = rtm.provider_property_id
  AND cm.channex_room_type_id = rtm.provider_room_type_id
WHERE rtm.provider = 'channex'
GROUP BY rtm.provider_property_id;
```

### 2.3 Rate Plans Mapping Count (per property)

```sql
-- Count rate plans per property with provider_rate_plan_id populated
SELECT
  rpm.provider_property_id as channex_property_id,
  COUNT(*) as total_rate_plans,
  COUNT(CASE WHEN rpm.provider_rate_plan_id IS NOT NULL AND rpm.provider_rate_plan_id != '' THEN 1 END) as mapped_rate_plans,
  COUNT(CASE WHEN rpm.provider_room_type_id IS NOT NULL AND rpm.provider_room_type_id != '' THEN 1 END) as room_linked_rate_plans
FROM rate_plans_mirror rpm
WHERE rpm.provider = 'channex'
GROUP BY rpm.provider_property_id;
```

### 2.4 Inventory Cells Coverage

```sql
-- For a given property, count cells vs expected cells
-- Expected = room_types × rate_plans × dates_in_range
WITH property AS (
  SELECT id as property_uuid, channex_property_id
  FROM channex_mappings
  WHERE channex_property_id = '<TARGET_CHANNEX_PROPERTY_ID>'
  ORDER BY created_at ASC
  LIMIT 1
),
room_count AS (
  SELECT COUNT(*) as cnt
  FROM room_types_mirror
  WHERE provider_property_id = (SELECT channex_property_id FROM property)
  AND provider = 'channex'
),
rate_count AS (
  SELECT COUNT(*) as cnt
  FROM rate_plans_mirror
  WHERE provider_property_id = (SELECT channex_property_id FROM property)
  AND provider = 'channex'
),
cell_count AS (
  SELECT COUNT(*) as cnt
  FROM inventory_cells
  WHERE property_id = (SELECT property_uuid FROM property)
  AND cell_date >= CURRENT_DATE
  AND cell_date <= CURRENT_DATE + INTERVAL '14 days'
)
SELECT
  (SELECT cnt FROM room_count) as room_types,
  (SELECT cnt FROM rate_count) as rate_plans,
  (SELECT cnt FROM cell_count) as actual_cells,
  (SELECT cnt FROM room_count) * (SELECT cnt FROM rate_count) * 14 as expected_cells_14d;
```

---

## 3. Grid Row Generation Analysis

### Current Behavior

The grid generates rows based on **all room types** and **all rate plans** returned by mirror table queries for the selected property. The join logic is:

```typescript
// InventoryGrid.tsx — rate plans matched to room types
const roomRatePlans = ratePlans.filter(rp =>
  rp.provider_room_type_id === roomType.provider_room_type_id ||
  rp.provider_room_type_id === roomType.id
);
```

**Issues found:**

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 3.1 | Rate plan matched by `provider_room_type_id === roomType.id` (internal UUID) is incorrect — `provider_room_type_id` is a Channex UUID while `roomType.id` is an internal mirror UUID | Could show rate plans under wrong room type or show no rate plans | Remove fallback `|| rp.provider_room_type_id === roomType.id`. Only match by `provider_room_type_id`. |
| 3.2 | Channel extraction uses regex on rate plan name: `ratePlan.rate_plan_name.match(/\(([^)]+)\)\s*$/)` | Fragile — breaks if name format changes. Not all rate plans follow this convention. | Use `rate_plans_mirror.channels` array for channel association |
| 3.3 | Channel matching is case-insensitive substring: `c.name.toLowerCase().includes(channelName.toLowerCase())` | Could match incorrectly (e.g., "Go" matching "Agoda") | Use exact match or use `channels` array from mirror |
| 3.4 | Rate plans without channel match are shown as unaffiliated rows (no channel badge) | User sees rows without channel context | Show "Direct" or "Unmapped" badge for rate plans not matched to any channel |

### Missing "Unmapped" Badge

**Per spec requirement:** If a mapping is missing, row should show "Unmapped" badge (NOT "N/A").

**Current behavior:** When a cell has no data (`getCell` returns `undefined`), `renderCellValue` shows `<span>N/A</span>`.

**Fix needed:** Distinguish between:
1. Cell exists but value is null → show default (0 for avl, "—" for rate)
2. Cell doesn't exist but mapping exists → show "—" (no override, use default)
3. Mapping doesn't exist → show "Unmapped" badge

---

## 4. Missing Mapping Detection

### 4.1 Room Types Without Channex ID

```sql
-- Room types in mirror without provider_room_type_id (should not happen if synced correctly)
SELECT id, room_type_name, provider_property_id
FROM room_types_mirror
WHERE provider_room_type_id IS NULL OR provider_room_type_id = '';
```

### 4.2 Rate Plans Without Channex ID

```sql
-- Rate plans in mirror without provider_rate_plan_id
SELECT id, rate_plan_name, provider_property_id, provider_room_type_id
FROM rate_plans_mirror
WHERE provider_rate_plan_id IS NULL OR provider_rate_plan_id = '';
```

### 4.3 Rate Plans Without Room Type Link

```sql
-- Rate plans whose provider_room_type_id doesn't match any room in mirror
SELECT rpm.id, rpm.rate_plan_name, rpm.provider_room_type_id, rpm.provider_property_id
FROM rate_plans_mirror rpm
LEFT JOIN room_types_mirror rtm
  ON rtm.provider_room_type_id = rpm.provider_room_type_id
  AND rtm.provider_property_id = rpm.provider_property_id
WHERE rtm.id IS NULL
AND rpm.provider = 'channex';
```

### 4.4 Properties Without Mapping

```sql
-- Properties known to Channex user but not in channex_mappings
SELECT cup.channex_property_id, cup.property_name
FROM channex_user_properties cup
LEFT JOIN channex_mappings cm ON cm.channex_property_id = cup.channex_property_id
WHERE cm.id IS NULL;
```

---

## 5. Impacted Grid Rows

For each missing mapping scenario, the following grid behavior occurs:

| Scenario | Current Behavior | Expected Behavior | Impact |
|----------|-----------------|-------------------|--------|
| Room type in mirror, no cells | Empty row, all dates show "N/A" | Show room type row with default availability (from `occupancy` column) | All dates show wrong "N/A" instead of defaults |
| Rate plan in mirror, no cells | Row rendered, "N/A" for all dates | Show "—" with fallback to `base_rate` from mirror | Rates appear missing when they should show base rate |
| Rate plan not linked to room type | Rate plan not shown in grid (filtered out by join) | Should show as orphan row with "Unmapped" warning | Silent data loss — user never sees the rate plan |
| Property not in channex_mappings | No grid rendered, `selectedPropertyId = undefined` | Show property name with "Setup Required" banner | User sees empty page with no guidance |
| Channex rate plan not in mirror (new plan) | Not shown in grid | Should trigger auto-sync or show "New — Sync Required" | Data from Channex webhook stored but invisible |

---

## 6. Recommendations

### Immediate (Phase 3 patches)

1. **Fix join logic** in InventoryGrid: remove `|| rp.provider_room_type_id === roomType.id` fallback
2. **Add "Unmapped" badge** for cells without data where mapping is incomplete
3. **Use `channels` array** from `rate_plans_mirror` instead of regex name parsing
4. **Add fallback rates** from `rate_plans_mirror.base_rate` when cell has no rate

### Validation Script

Create a diagnostic query that can be run ad-hoc to check mapping health:

```sql
-- Mapping Health Report
SELECT
  'properties' as entity,
  COUNT(*) as total,
  COUNT(CASE WHEN cm.id IS NOT NULL THEN 1 END) as mapped,
  COUNT(CASE WHEN cm.id IS NULL THEN 1 END) as unmapped
FROM channex_user_properties cup
LEFT JOIN channex_mappings cm ON cm.channex_property_id = cup.channex_property_id

UNION ALL

SELECT
  'room_types' as entity,
  COUNT(*) as total,
  COUNT(CASE WHEN rtm.provider_room_type_id IS NOT NULL AND rtm.provider_room_type_id != '' THEN 1 END) as mapped,
  COUNT(CASE WHEN rtm.provider_room_type_id IS NULL OR rtm.provider_room_type_id = '' THEN 1 END) as unmapped
FROM room_types_mirror rtm

UNION ALL

SELECT
  'rate_plans' as entity,
  COUNT(*) as total,
  COUNT(CASE WHEN rpm.provider_rate_plan_id IS NOT NULL AND rpm.provider_rate_plan_id != '' THEN 1 END) as mapped,
  COUNT(CASE WHEN rpm.provider_rate_plan_id IS NULL OR rpm.provider_rate_plan_id = '' THEN 1 END) as unmapped
FROM rate_plans_mirror rpm;
```

---

*End of Mapping Coverage Validation. Runtime SQL queries must be executed against production/staging Supabase to get actual counts.*

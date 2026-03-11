# INVENTORY API - KẾ HOẠCH KIỂM TRA 0% LỖI

> **Version**: 1.0.0  
> **Last Updated**: 2024-12-19  
> **Status**: ACTIVE TEST PLAN

---

## MỤC LỤC

1. [Tổng quan](#tổng-quan)
2. [Phase 1: Backend Verification](#phase-1-backend-verification)
3. [Phase 2: Edge Function Testing](#phase-2-edge-function-testing)
4. [Phase 3: Database Integrity](#phase-3-database-integrity)
5. [Phase 4: Frontend-Backend Integration](#phase-4-frontend-backend-integration)
6. [Phase 5: End-to-End Flow Testing](#phase-5-end-to-end-flow-testing)
7. [Phase 6: Performance & Stress Testing](#phase-6-performance-stress-testing)
8. [Phase 7: Security & Permission Testing](#phase-7-security-permission-testing)
9. [Regression Testing Checklist](#regression-testing-checklist)
10. [Bug Severity Matrix](#bug-severity-matrix)

---

## TỔNG QUAN

### Mục tiêu
- Đảm bảo 100% chức năng hoạt động đúng spec
- 0 critical bugs trước go-live
- 0 data corruption issues
- 100% audit trail coverage

### Scope
- 6 Edge Functions
- 5+ Database Tables
- 1 Main UI Component (InventoryGrid)
- 10+ Sub-components

---

## PHASE 1: BACKEND VERIFICATION

### 1.1 Database Schema Check

```sql
-- Run these queries to verify schema integrity

-- 1. Check all required tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'inventory_cells',
  'inventory_overrides', 
  'inventory_snapshots',
  'inventory_sync_jobs',
  'inventory_batches',
  'inventory_edit_locks',
  'inventory_alerts',
  'inventory_alert_config',
  'inventory_sync_metrics',
  'inventory_system_version',
  'availability_rules',
  'channex_rate_plans',
  'channex_room_types'
);

-- 2. Verify column types match spec
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'inventory_cells';

-- 3. Check indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('inventory_cells', 'inventory_overrides');

-- 4. Verify RLS policies
SELECT tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename LIKE 'inventory%';
```

| Test Case | Expected | Status |
|-----------|----------|--------|
| 1.1.1 inventory_cells table exists | ✓ | ☐ |
| 1.1.2 inventory_overrides table exists | ✓ | ☐ |
| 1.1.3 inventory_snapshots table exists | ✓ | ☐ |
| 1.1.4 inventory_sync_jobs table exists | ✓ | ☐ |
| 1.1.5 inventory_batches table exists | ✓ | ☐ |
| 1.1.6 All required columns present | ✓ | ☐ |
| 1.1.7 Indexes on frequently queried columns | ✓ | ☐ |
| 1.1.8 RLS policies enabled | ✓ | ☐ |

### 1.2 Data Integrity Check

```sql
-- 1. No orphan cells (all have valid property)
SELECT COUNT(*) as orphan_count 
FROM inventory_cells ic 
LEFT JOIN channex_mappings cm ON ic.property_id = cm.channex_property_id::uuid
WHERE cm.id IS NULL;

-- 2. No null final_value
SELECT COUNT(*) FROM inventory_cells WHERE rate IS NULL AND availability IS NULL;

-- 3. Valid source_layer values
SELECT DISTINCT source_layer, COUNT(*) 
FROM inventory_cells 
GROUP BY source_layer;

-- 4. No duplicate cells (same key)
SELECT property_id, room_type_id, rate_plan_id, channel_id, cell_date, COUNT(*)
FROM inventory_cells
GROUP BY property_id, room_type_id, rate_plan_id, channel_id, cell_date
HAVING COUNT(*) > 1;
```

| Test Case | Expected | Status |
|-----------|----------|--------|
| 1.2.1 No orphan cells | 0 | ☐ |
| 1.2.2 No null values in critical fields | 0 | ☐ |
| 1.2.3 Valid source_layer only | BASE/SYNC/RULE/OVERRIDE | ☐ |
| 1.2.4 No duplicate cells | 0 | ☐ |

---

## PHASE 2: EDGE FUNCTION TESTING

### 2.1 inventory-grid Function

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| 2.1.1 Valid request | property_id, start_date, end_date | 200 + grid data | ☐ |
| 2.1.2 Missing property_id | omit property_id | 400 + error message | ☐ |
| 2.1.3 Invalid date format | start_date="2024/12/19" | 400 + INVALID_DATE | ☐ |
| 2.1.4 End before start | start > end | 400 + INVALID_RANGE | ☐ |
| 2.1.5 Filter by room_type_ids | room_type_ids=["abc"] | Filtered results | ☐ |
| 2.1.6 Filter by channel_ids | channel_ids=["booking"] | Filtered results | ☐ |
| 2.1.7 Response has meta.timezone | any valid request | meta.timezone present | ☐ |
| 2.1.8 Response has meta.data_version | any valid request | meta.data_version present | ☐ |
| 2.1.9 Response has meta.scope_hash | any valid request | meta.scope_hash present | ☐ |
| 2.1.10 All cells have final_value | any valid request | No undefined values | ☐ |
| 2.1.11 All cells have source_layer | any valid request | source_layer ∈ {BASE,SYNC,RULE,OVERRIDE} | ☐ |
| 2.1.12 All cells have state | any valid request | state ∈ {PENDING,SYNCED,FAILED,STALE} | ☐ |
| 2.1.13 Large date range pagination | 90 days | next_cursor present if > 1000 cells | ☐ |
| 2.1.14 Empty result | non-existent property | Empty grid, no error | ☐ |

### 2.2 inventory-cell-explain Function

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| 2.2.1 Valid cell explain | all required params | 200 + explanation | ☐ |
| 2.2.2 Cell from BASE layer | base cell | source_layer="BASE" | ☐ |
| 2.2.3 Cell from SYNC layer | synced cell | source_layer="SYNC" | ☐ |
| 2.2.4 Cell from RULE layer | rule-applied cell | source_layer="RULE", rule_id present | ☐ |
| 2.2.5 Cell from OVERRIDE layer | overridden cell | source_layer="OVERRIDE", override_id present | ☐ |
| 2.2.6 Resolution chain present | any cell | resolution_chain array | ☐ |
| 2.2.7 Precedence reason present | any cell | precedence_reason string | ☐ |
| 2.2.8 Non-existent cell | invalid ids | 404 + NOT_FOUND | ☐ |

### 2.3 inventory-dry-run Function

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| 2.3.1 Valid dry-run | valid changes | 200 + preview | ☐ |
| 2.3.2 Returns affected_cells | any valid | affected_cells count | ☐ |
| 2.3.3 Returns before_value | any valid | before_value for each cell | ☐ |
| 2.3.4 Returns after_value | any valid | after_value for each cell | ☐ |
| 2.3.5 Returns blast_radius | any valid | room_types, channels, dates counts | ☐ |
| 2.3.6 Does NOT write to DB | any valid | No DB changes | ☐ |
| 2.3.7 Large change warning | >100 cells | warnings array | ☐ |
| 2.3.8 Rate delta warning | >50% change | warnings array | ☐ |
| 2.3.9 Past date rejection | date < today | 400 + PAST_DATE | ☐ |
| 2.3.10 Empty changes | empty array | 400 + NO_CHANGES | ☐ |

### 2.4 inventory-batch-update Function

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| 2.4.1 Valid batch update | valid request | 200 + batch_id | ☐ |
| 2.4.2 Requires batch_id | omit batch_id | 400 + MISSING_BATCH_ID | ☐ |
| 2.4.3 Requires idempotency_key | omit key | 400 + MISSING_KEY | ☐ |
| 2.4.4 Requires scope_hash | omit hash | 400 + MISSING_HASH | ☐ |
| 2.4.5 Idempotent resend | same key twice | No duplicate, same response | ☐ |
| 2.4.6 Scope hash mismatch | stale hash | 409 + CONFLICT | ☐ |
| 2.4.7 Creates snapshot | valid update | snapshot_id in response | ☐ |
| 2.4.8 Returns affected_cells | valid update | affected_cells count | ☐ |
| 2.4.9 Audit trail created | valid update | applied_at, applied_by set | ☐ |
| 2.4.10 Past date rejection | date < today | 400 + PAST_DATE | ☐ |
| 2.4.11 Max cells limit | >1000 cells | 400 + LIMIT_EXCEEDED | ☐ |
| 2.4.12 Invalid value type | string for AVL | 400 + INVALID_VALUE | ☐ |

### 2.5 inventory-batch-status Function

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| 2.5.1 Valid status check | valid batch_id | 200 + status | ☐ |
| 2.5.2 Returns status | any batch | status ∈ {PENDING,PROCESSING,COMPLETED,FAILED} | ☐ |
| 2.5.3 Returns synced_cells | any batch | synced_cells count | ☐ |
| 2.5.4 Returns failed_cells | any batch | failed_cells count | ☐ |
| 2.5.5 Returns failures detail | failed batch | failures array with error | ☐ |
| 2.5.6 Non-existent batch | invalid id | 404 + NOT_FOUND | ☐ |

### 2.6 inventory-snapshot Function

| Test Case | Input | Expected Output | Status |
|-----------|-------|-----------------|--------|
| 2.6.1 Get latest snapshot | property_id only | 200 + latest snapshot | ☐ |
| 2.6.2 Get by version | property_id + version | Specific version data | ☐ |
| 2.6.3 Get by as_of | property_id + timestamp | Point-in-time data | ☐ |
| 2.6.4 Snapshot is immutable | try to modify | Read-only, no mutation | ☐ |
| 2.6.5 Contains audit data | any snapshot | created_at, created_by present | ☐ |
| 2.6.6 Non-existent snapshot | invalid version | 404 + NOT_FOUND | ☐ |
| 2.6.7 Usable for OTA dispute | valid snapshot | Complete data for audit | ☐ |

---

## PHASE 3: DATABASE INTEGRITY

### 3.1 Constraint Testing

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 3.1.1 FK constraint on property_id | Insert invalid property_id | Rejected | ☐ |
| 3.1.2 Unique constraint on cell key | Insert duplicate | Rejected | ☐ |
| 3.1.3 CHECK constraint on source_layer | Insert invalid layer | Rejected | ☐ |
| 3.1.4 NOT NULL on required fields | Insert null | Rejected | ☐ |

### 3.2 Trigger Testing

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 3.2.1 updated_at auto-update | UPDATE cell | updated_at changes | ☐ |
| 3.2.2 Version increment | UPDATE cell | version +1 | ☐ |
| 3.2.3 Audit log trigger | Any CRUD | Audit entry created | ☐ |

### 3.3 Index Performance

| Test Case | Query | Expected Time | Status |
|-----------|-------|---------------|--------|
| 3.3.1 Grid query by property + date | 30 days, 10 room types | <500ms | ☐ |
| 3.3.2 Cell lookup by key | Single cell | <50ms | ☐ |
| 3.3.3 Snapshot retrieval | By version | <200ms | ☐ |

---

## PHASE 4: FRONTEND-BACKEND INTEGRATION

### 4.1 InventoryGrid Component

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 4.1.1 Grid loads on mount | Visit page | Grid populated | ☐ |
| 4.1.2 Loading state shown | API pending | Skeleton/loading indicator | ☐ |
| 4.1.3 Error state handled | API error | Error message, retry button | ☐ |
| 4.1.4 Empty state handled | No data | Empty message | ☐ |
| 4.1.5 Property filter works | Select property | Grid refreshes | ☐ |
| 4.1.6 Date range filter works | Change dates | Grid refreshes | ☐ |
| 4.1.7 Room type filter works | Filter room | Filtered results | ☐ |
| 4.1.8 Channel filter works | Filter channel | Filtered results | ☐ |

### 4.2 Cell Editing

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 4.2.1 Click to edit | Click cell | Edit mode activated | ☐ |
| 4.2.2 Input validation | Invalid value | Error shown | ☐ |
| 4.2.3 Escape to cancel | Press Escape | Edit cancelled | ☐ |
| 4.2.4 Enter to confirm | Press Enter | Value staged | ☐ |
| 4.2.5 Tab to next | Press Tab | Move to next cell | ☐ |
| 4.2.6 Draft indicator | Edit cell | Yellow background | ☐ |
| 4.2.7 Dirty state tracked | Any edit | Unsaved changes indicator | ☐ |

### 4.3 Bulk Update Flow

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 4.3.1 Open bulk dialog | Click Bulk Update | Dialog opens | ☐ |
| 4.3.2 Select date range | Pick dates | Range validated | ☐ |
| 4.3.3 Select room types | Multi-select | Selection stored | ☐ |
| 4.3.4 Select channels | Multi-select | Selection stored | ☐ |
| 4.3.5 Preview required | Click Save | Dry-run executes first | ☐ |
| 4.3.6 Preview shows affected | After dry-run | Affected cells shown | ☐ |
| 4.3.7 Confirm to apply | Confirm | Batch update executes | ☐ |
| 4.3.8 Success toast | After success | Toast notification | ☐ |
| 4.3.9 Grid refreshes | After success | Updated values shown | ☐ |

### 4.4 Save Changes Flow

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 4.4.1 Draft bar appears | Edit cell | Bar with save/discard | ☐ |
| 4.4.2 Discard works | Click Discard | All drafts cleared | ☐ |
| 4.4.3 Preview before save | Click Preview | Dry-run results | ☐ |
| 4.4.4 Save disabled until preview | Without preview | Save button disabled | ☐ |
| 4.4.5 Save works | Click Save | Changes persisted | ☐ |
| 4.4.6 Optimistic update | After save | UI updates immediately | ☐ |
| 4.4.7 Rollback on error | Save fails | UI reverts | ☐ |

---

## PHASE 5: END-TO-END FLOW TESTING

### 5.1 Complete User Journey

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Login as admin | Dashboard shown | ☐ |
| 2 | Navigate to Inventory | Grid page loads | ☐ |
| 3 | Select property | Grid populates | ☐ |
| 4 | Filter by date range | Grid filters | ☐ |
| 5 | Click cell to edit | Edit mode | ☐ |
| 6 | Enter new value | Draft shown | ☐ |
| 7 | Click Preview | Dry-run results | ☐ |
| 8 | Click Save | Batch update sent | ☐ |
| 9 | Verify update | New value in grid | ☐ |
| 10 | Check audit trail | Change logged | ☐ |
| 11 | Create snapshot | Snapshot created | ☐ |
| 12 | Query snapshot | Data matches | ☐ |

### 5.2 Conflict Resolution Flow

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | User A opens grid | Grid loaded | ☐ |
| 2 | User B opens same grid | Same grid loaded | ☐ |
| 3 | User A edits cell X | Draft shown | ☐ |
| 4 | User B edits same cell X | Draft shown | ☐ |
| 5 | User A saves | Success | ☐ |
| 6 | User B saves | 409 Conflict | ☐ |
| 7 | User B sees conflict message | Clear indication | ☐ |
| 8 | User B reloads | User A's value shown | ☐ |

### 5.3 Error Recovery Flow

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1 | Start batch update | Request sent | ☐ |
| 2 | Network disconnects | Error caught | ☐ |
| 3 | Error message shown | Clear message | ☐ |
| 4 | Retry button available | User can retry | ☐ |
| 5 | Network reconnects | Retry works | ☐ |
| 6 | Idempotency prevents duplicate | No double write | ☐ |

---

## PHASE 6: PERFORMANCE & STRESS TESTING

### 6.1 Load Testing

| Test Case | Parameters | Target | Status |
|-----------|------------|--------|--------|
| 6.1.1 Grid load time | 30 days, 20 rooms | <2s | ☐ |
| 6.1.2 Grid load time | 90 days, 50 rooms | <5s | ☐ |
| 6.1.3 Dry-run time | 500 cells | <2s | ☐ |
| 6.1.4 Batch update time | 500 cells | <5s | ☐ |
| 6.1.5 Snapshot creation | Full property | <3s | ☐ |

### 6.2 Concurrent Users

| Test Case | Concurrent Users | Expected | Status |
|-----------|------------------|----------|--------|
| 6.2.1 Grid reads | 50 | All succeed | ☐ |
| 6.2.2 Mixed read/write | 20 | No deadlocks | ☐ |
| 6.2.3 Heavy writes | 10 simultaneous | Conflicts detected properly | ☐ |

### 6.3 Memory & Resource

| Test Case | Scenario | Limit | Status |
|-----------|----------|-------|--------|
| 6.3.1 Edge function memory | Large response | <128MB | ☐ |
| 6.3.2 Browser memory | Large grid | <500MB | ☐ |
| 6.3.3 DB connections | Burst load | Pool not exhausted | ☐ |

---

## PHASE 7: SECURITY & PERMISSION TESTING

### 7.1 Authentication

| Test Case | Action | Expected | Status |
|-----------|--------|----------|--------|
| 7.1.1 Unauthenticated request | No token | 401 | ☐ |
| 7.1.2 Invalid token | Expired token | 401 | ☐ |
| 7.1.3 Valid token | Valid JWT | Success | ☐ |

### 7.2 Authorization

| Test Case | Role | Action | Expected | Status |
|-----------|------|--------|----------|--------|
| 7.2.1 Admin read | admin | GET grid | Success | ☐ |
| 7.2.2 Admin write | admin | POST update | Success | ☐ |
| 7.2.3 CSKH read | cskh | GET grid | Success | ☐ |
| 7.2.4 CSKH write | cskh | POST update | Forbidden or Limited | ☐ |
| 7.2.5 Cross-property | any | Other property | Forbidden | ☐ |

### 7.3 Input Validation

| Test Case | Input | Expected | Status |
|-----------|-------|----------|--------|
| 7.3.1 SQL injection | property_id="'; DROP TABLE..." | Sanitized, no effect | ☐ |
| 7.3.2 XSS in value | value="<script>..." | Escaped | ☐ |
| 7.3.3 Negative numbers | rate=-100 | Rejected or handled | ☐ |
| 7.3.4 Huge numbers | rate=999999999999 | Limit enforced | ☐ |
| 7.3.5 Invalid UUID | property_id="not-uuid" | 400 error | ☐ |

---

## REGRESSION TESTING CHECKLIST

Sau mỗi lần deploy, chạy lại các test cases:

### Critical Path (Must Pass)

- [ ] Grid loads successfully
- [ ] Cell editing works
- [ ] Dry-run returns preview
- [ ] Batch update creates snapshot
- [ ] Conflict detection works
- [ ] Audit trail recorded

### Quick Smoke Test

```bash
# 1. Health check
curl -X GET "https://htfpjqkhtjbalaodymwb.supabase.co/functions/v1/inventory-grid?property_id=TEST&start_date=2024-12-19&end_date=2024-12-21"

# 2. Explain check  
curl -X GET "https://htfpjqkhtjbalaodymwb.supabase.co/functions/v1/inventory-cell-explain?property_id=TEST&..."

# 3. Dry-run check
curl -X POST "https://htfpjqkhtjbalaodymwb.supabase.co/functions/v1/inventory-dry-run" -d '{...}'
```

---

## BUG SEVERITY MATRIX

| Severity | Definition | Examples | Fix Timeline |
|----------|------------|----------|--------------|
| **CRITICAL** | Data loss, security breach, system down | Duplicate writes, data corruption | Immediate |
| **HIGH** | Major feature broken, no workaround | Save not working, conflict not detected | <24h |
| **MEDIUM** | Feature broken with workaround | Filter not working | <72h |
| **LOW** | Minor issue, cosmetic | Typo, alignment | Next sprint |

---

## TEST EXECUTION TRACKING

### Phase Status

| Phase | Total Tests | Passed | Failed | Blocked | Status |
|-------|-------------|--------|--------|---------|--------|
| 1. Backend | 12 | ☐ | ☐ | ☐ | Not Started |
| 2. Edge Functions | 44 | ☐ | ☐ | ☐ | Not Started |
| 3. Database | 10 | ☐ | ☐ | ☐ | Not Started |
| 4. Integration | 28 | ☐ | ☐ | ☐ | Not Started |
| 5. E2E | 21 | ☐ | ☐ | ☐ | Not Started |
| 6. Performance | 11 | ☐ | ☐ | ☐ | Not Started |
| 7. Security | 15 | ☐ | ☐ | ☐ | Not Started |
| **TOTAL** | **141** | ☐ | ☐ | ☐ | **Not Started** |

### Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Tech Lead | | | |
| Product Owner | | | |

---

## APPENDIX: AUTOMATED TEST COMMANDS

```bash
# Run all edge function tests
npm run test:edge-functions

# Run database integrity checks
npm run test:db-integrity

# Run E2E tests
npm run test:e2e

# Generate test report
npm run test:report
```

---

*Đây là kế hoạch kiểm tra chính thức cho Inventory API. Mọi bug phải được log và track theo severity matrix.*

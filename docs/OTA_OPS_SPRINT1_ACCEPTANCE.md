# OTA Operations Sprint 1 - Acceptance Checklist

> **Date**: 2026-01-09  
> **Sprint**: 1 - Classification, Issue Tag, Effort, Bulk Approve  
> **Author**: AI Assistant

---

## ✅ PHASE 1: AS-IS VERIFICATION (Completed)

### 1.1 Enums/Status Confirmed

| Item | File | Line | Value | Status |
|------|------|------|-------|--------|
| `ota_task_status` enum | [20260107_006_ota_tasks.sql](../supabase/migrations/20260107_006_ota_tasks.sql) | 21-28 | `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`, `BLOCKED`, `CANCELLED` | ✅ Confirmed |
| `ota_task_priority` enum | [20260107_006_ota_tasks.sql](../supabase/migrations/20260107_006_ota_tasks.sql) | 37-42 | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | ✅ Confirmed |
| `ota_project_status` enum | [OTA_OPS_CONTEXT_LOCK.md](OTA_OPS_CONTEXT_LOCK.md) | 132 | `PLANNING`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `ARCHIVED` | ✅ Confirmed |

### 1.2 DONE Guard Verified

| Component | File | Lines | Behavior | Status |
|-----------|------|-------|----------|--------|
| RPC `ota_update_task_status` | [20260108_024_ota_task_done_guard.sql](../supabase/migrations/20260108_024_ota_task_done_guard.sql) | 102-116 | Checks `COUNT(*) FROM ota_task_evidence WHERE review_status = 'APPROVED'` | ✅ Confirmed |
| Trigger `enforce_ota_task_done_guard` | [20260108_024_ota_task_done_guard.sql](../supabase/migrations/20260108_024_ota_task_done_guard.sql) | 157-175 | BEFORE UPDATE trigger raises exception if no approved evidence | ✅ Confirmed |
| UI Guard | [PanelHeader.tsx](../src/components/ota-operations/TaskSidePanel/PanelHeader.tsx) | 104-105 | `const canComplete = ... && approvedCount > 0` | ✅ Confirmed |

### 1.3 Evidence Workflow Verified

| Item | File | Lines | Status |
|------|------|-------|--------|
| `review_status` enum | [20260107_007_ota_task_evidence.sql](../supabase/migrations/20260107_007_ota_task_evidence.sql) | 44 | `PENDING`, `APPROVED`, `REJECTED`, `NEEDS_REVISION` | ✅ Confirmed |
| Evidence badge UI | [EvidenceTab.tsx](../src/components/ota-operations/TaskSidePanel/tabs/EvidenceTab.tsx) | 401-402 | Shows APPROVED/REJECTED with icons | ✅ Confirmed |

---

## 📁 PHASE 2: SPRINT 1 DELIVERABLES

### 2.A Task Classification

| Item | File | Status |
|------|------|--------|
| Migration 025 | [20260109_025_ota_task_classification.sql](../supabase/migrations/20260109_025_ota_task_classification.sql) | ✅ Created |
| Enum `ota_task_classification` | Values: `EXECUTION`, `PREP`, `AUTO`, `OPS` | ✅ Defined |
| Column `ota_tasks.classification` | DEFAULT 'EXECUTION' | ✅ Added |
| Type `OtaTaskClassification` | [otaOps.ts](../src/lib/otaOps.ts) lines 18-19 | ✅ Added |
| Config `CLASSIFICATION_CONFIG` | [otaOps.ts](../src/lib/otaOps.ts) lines 21-50 | ✅ Added |
| TaskCard badge | [TaskCard.tsx](../src/components/ota-operations/TaskCard.tsx) | ✅ Added |
| OverviewTab display | [OverviewTab.tsx](../src/components/ota-operations/TaskSidePanel/tabs/OverviewTab.tsx) | ✅ Added |

### 2.B Issue Tag

| Item | File | Status |
|------|------|--------|
| Migration 026 | [20260109_026_ota_issue_tag_effort.sql](../supabase/migrations/20260109_026_ota_issue_tag_effort.sql) | ✅ Created |
| Column `ota_tasks.issue_tag` | TEXT, indexed | ✅ Added |
| Index `idx_ota_tasks_issue_tag` | Partial index WHERE NOT NULL | ✅ Added |
| Config `COMMON_ISSUE_TAGS` | [otaOps.ts](../src/lib/otaOps.ts) lines 60-70 | ✅ Added |
| OverviewTab display | [OverviewTab.tsx](../src/components/ota-operations/TaskSidePanel/tabs/OverviewTab.tsx) | ✅ Added |

### 2.C Effort Tracking

| Item | File | Status |
|------|------|--------|
| Column `expected_effort_minutes` | INT | ✅ Added |
| Column `actual_effort_minutes` | INT | ✅ Added |
| OtaTask interface | [otaOps.ts](../src/lib/otaOps.ts) | ✅ Updated |
| OverviewTab display | [OverviewTab.tsx](../src/components/ota-operations/TaskSidePanel/tabs/OverviewTab.tsx) | ✅ Added |

### 2.D Enhanced DONE Guard with min_evidence_count

| Item | File | Status |
|------|------|--------|
| Column `min_evidence_count` | INT DEFAULT 1 | ✅ Added |
| Updated RPC | [20260109_026_ota_issue_tag_effort.sql](../supabase/migrations/20260109_026_ota_issue_tag_effort.sql) | ✅ Updated |
| Updated Trigger | [20260109_026_ota_issue_tag_effort.sql](../supabase/migrations/20260109_026_ota_issue_tag_effort.sql) | ✅ Updated |

### 2.E Bulk Approve Evidence

| Item | File | Status |
|------|------|--------|
| Migration 027 | [20260109_027_ota_bulk_approve_evidence.sql](../supabase/migrations/20260109_027_ota_bulk_approve_evidence.sql) | ✅ Created |
| RPC `ota_bulk_approve_evidence` | Lead/Admin only | ✅ Created |
| Audit logging | Per evidence + bulk action | ✅ Implemented |
| Hook `useBulkApproveEvidence` | [useOtaOperations.ts](../src/hooks/useOtaOperations.ts) | ✅ Added |
| Component `BulkApproveButton` | [BulkApproveButton.tsx](../src/components/ota-operations/BulkApproveButton.tsx) | ✅ Created |

---

## 🧪 PHASE 3: TEST PLAN

### 3.1 Migration Tests

| ID | Test Case | SQL | Expected | Status |
|----|-----------|-----|----------|--------|
| M1 | Run migration 025 | `\i 20260109_025_ota_task_classification.sql` | Enum + column created | ⬜ |
| M2 | Run migration 026 | `\i 20260109_026_ota_issue_tag_effort.sql` | Columns + updated RPC | ⬜ |
| M3 | Run migration 027 | `\i 20260109_027_ota_bulk_approve_evidence.sql` | RPC created | ⬜ |
| M4 | Verify enum values | `SELECT unnest(enum_range(NULL::ota_task_classification));` | EXECUTION, PREP, AUTO, OPS | ⬜ |
| M5 | Verify columns exist | `SELECT column_name FROM information_schema.columns WHERE table_name = 'ota_tasks' AND column_name IN ('classification', 'issue_tag', 'min_evidence_count');` | 3 rows | ⬜ |

### 3.2 RLS Security Tests

```sql
-- Test R1: STAFF cannot bulk approve
SET LOCAL ROLE 'authenticated';
SET LOCAL request.jwt.claims.user_id = '<staff_user_id>';
SELECT ota_bulk_approve_evidence(ARRAY['<task_id>']::uuid[]);
-- Expected: error ACCESS_DENIED

-- Test R2: LEAD can bulk approve
SET LOCAL request.jwt.claims.user_id = '<lead_user_id>';
SELECT ota_bulk_approve_evidence(ARRAY['<task_id>']::uuid[]);
-- Expected: success

-- Test R3: ADMIN can bulk approve
SET LOCAL request.jwt.claims.user_id = '<admin_user_id>';
SELECT ota_bulk_approve_evidence(ARRAY['<task_id>']::uuid[]);
-- Expected: success
```

| ID | Test Case | Role | Expected | Status |
|----|-----------|------|----------|--------|
| R1 | STAFF cannot bulk approve | ota_staff | ACCESS_DENIED | ⬜ |
| R2 | LEAD can bulk approve | ota_lead | success | ⬜ |
| R3 | ADMIN can bulk approve | admin | success | ⬜ |

### 3.3 DONE Guard Tests

```sql
-- Test D1: Task with min_evidence_count=2, only 1 approved
UPDATE ota_tasks SET min_evidence_count = 2 WHERE id = '<task_id>';
-- Upload 1 evidence, approve it
SELECT ota_update_task_status('<task_id>', 'DONE');
-- Expected: error EVIDENCE_REQUIRED with message "Requires 2 approved evidence, found 1"

-- Test D2: Task with min_evidence_count=2, 2 approved
-- Upload and approve 2nd evidence
SELECT ota_update_task_status('<task_id>', 'DONE');
-- Expected: success
```

| ID | Test Case | Condition | Expected | Status |
|----|-----------|-----------|----------|--------|
| D1 | DONE guard with min=2, found=1 | min_evidence_count=2 | EVIDENCE_REQUIRED | ⬜ |
| D2 | DONE guard with min=2, found=2 | min_evidence_count=2 | success | ⬜ |
| D3 | DONE guard with min=1 (default) | min_evidence_count=1 | Original behavior | ⬜ |

### 3.4 UI Tests

| ID | Test Case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| U1 | Classification badge on TaskCard | 1. View task board | Classification pill shows with icon | ⬜ |
| U2 | Classification in OverviewTab | 1. Open TaskSidePanel | Classification section with badge | ⬜ |
| U3 | Issue Tag in OverviewTab | 1. Create task with issue_tag 2. Open panel | Issue tag badge shows | ⬜ |
| U4 | Effort display | 1. Set expected_effort_minutes 2. Open panel | Shows "Dự kiến: Xh Xm" | ⬜ |
| U5 | BulkApproveButton visible | 1. Login as Lead/Admin 2. View task board | Button visible in toolbar | ⬜ |
| U6 | BulkApproveButton hidden | 1. Login as Staff 2. View task board | Button not visible | ⬜ |
| U7 | Bulk approve flow | 1. Select tasks 2. Click bulk approve 3. Confirm | Toast shows approved count | ⬜ |

### 3.5 Audit Log Tests

```sql
-- Test A1: Classification change logged
UPDATE ota_tasks SET classification = 'PREP' WHERE id = '<task_id>';
SELECT * FROM ota_audit_log WHERE entity_id = '<task_id>' ORDER BY performed_at DESC LIMIT 1;
-- Expected: action = 'UPDATE_OTA_TASKS', new_data contains classification = 'PREP'

-- Test A2: Bulk approve logged
SELECT ota_bulk_approve_evidence(ARRAY['<task_id>']::uuid[]);
SELECT * FROM ota_audit_log WHERE action = 'BULK_APPROVE_EVIDENCE' ORDER BY performed_at DESC LIMIT 1;
-- Expected: action = 'BULK_APPROVE_EVIDENCE', new_data contains approved_count
```

| ID | Test Case | Expected | Status |
|----|-----------|----------|--------|
| A1 | Classification change audit | UPDATE_OTA_TASKS logged | ⬜ |
| A2 | Issue tag change audit | UPDATE_OTA_TASKS logged | ⬜ |
| A3 | Bulk approve audit | BULK_APPROVE_EVIDENCE logged | ⬜ |

### 3.6 KPI Page Regression

| ID | Test Case | Expected | Status |
|----|-----------|----------|--------|
| K1 | KPI page loads without error | No console errors | ⬜ |
| K2 | Task board renders | All columns visible | ⬜ |
| K3 | Task cards render | No missing badges | ⬜ |

---

## 📋 FILE CHANGES SUMMARY

### New Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260109_025_ota_task_classification.sql` | Classification enum + column |
| `supabase/migrations/20260109_026_ota_issue_tag_effort.sql` | Issue tag, effort, min_evidence_count, updated DONE guard |
| `supabase/migrations/20260109_027_ota_bulk_approve_evidence.sql` | Bulk approve RPC |
| `src/components/ota-operations/BulkApproveButton.tsx` | Bulk approve UI component |

### Files Modified

| File | Change |
|------|--------|
| `src/lib/otaOps.ts` | Added `OtaTaskClassification`, `CLASSIFICATION_CONFIG`, `COMMON_ISSUE_TAGS`, updated `OtaTask` interface |
| `src/components/ota-operations/TaskCard.tsx` | Added `ClassificationPill` component and import, updated `TaskCardData` interface |
| `src/components/ota-operations/TaskSidePanel/tabs/OverviewTab.tsx` | Added Classification, Issue Tag, Effort sections |
| `src/hooks/useOtaOperations.ts` | Added `useBulkApproveEvidence` hook and types |

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Review all migrations
- [ ] Run migrations on staging
- [ ] Test RLS with different roles
- [ ] Test DONE guard with min_evidence_count
- [ ] Test bulk approve with Lead/Admin
- [ ] Verify audit logs
- [ ] Test KPI page (regression)
- [ ] Deploy to production

---

## 📝 NOTES

1. **Backward Compatibility**: All changes are additive. Existing tasks default to `classification = 'EXECUTION'` and `min_evidence_count = 1`.

2. **DONE Guard Logic**: Updated to check `min_evidence_count` instead of hardcoded `1`. Backward compatible since default is `1`.

3. **Audit Trail**: Bulk approve creates individual audit entries per evidence (via existing trigger) plus one bulk action entry.

4. **RLS Unchanged**: No changes to RLS policies. Bulk approve uses `is_ota_lead_or_admin()` helper.

---

*Document generated: 2026-01-09*

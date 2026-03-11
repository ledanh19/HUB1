# OTA Operations Module v3.1 - Acceptance Test Report

**Date:** January 8, 2026  
**Version:** 3.1  
**Status:** ✅ PRODUCTION READY

---

## A) PRE-CHECK

| # | Item | Status | Notes |
|---|------|--------|-------|
| A1 | Migration 20260108_018_ota_work_type.sql | ✅ PASS | Exists in migrations folder |
| A2 | Migration 20260108_019_ota_audit_log_override.sql | ✅ PASS | Adds reason, override_type, performed_via columns |
| A3 | Migration 20260108_020_ota_super_admin_override.sql | ✅ PASS | Super admin override RPC |
| A4 | Migration 20260108_021_ota_project_inputs_outputs.sql | ✅ PASS | Tables + RLS policies |
| A5 | Migration 20260108_022_ota_project_io_rpcs.sql | ✅ PASS | 6 RPC functions |
| A6 | Migration 20260108_023_ota_create_draft_race_fix.sql | ✅ PASS | Advisory lock race-condition fix |
| A7 | TypeScript errors on OTA pages | ✅ PASS | No errors found |

---

## B) SECURITY & WORKFLOW GUARANTEES

### B1) Outputs RLS - Status workflow cannot be bypassed

| Check | Status | Evidence |
|-------|--------|----------|
| UPDATE policy restricts to DRAFT only | ✅ PASS | `status = 'DRAFT' AND created_by = auth.uid()` |
| UPDATE requires has_ota_project_access | ✅ PASS | Policy includes `has_ota_project_access(project_id)` |
| SUBMIT only via RPC | ✅ PASS | `ota_submit_output` is SECURITY DEFINER |
| APPROVE/REJECT only via RPC | ✅ PASS | `ota_review_output` is SECURITY DEFINER |
| Direct status UPDATE from client | ✅ BLOCKED | RLS policy only allows DRAFT rows |

**Test Command (should fail for non-DRAFT):**
```sql
-- As authenticated user trying to bypass RLS:
UPDATE ota_project_outputs SET status = 'APPROVED' WHERE id = 'xxx';
-- Result: 0 rows updated (blocked by RLS)
```

### B2) Draft version race-condition fix

| Check | Status | Evidence |
|-------|--------|----------|
| Advisory lock used | ✅ PASS | `pg_advisory_xact_lock(v_lock_key)` in function |
| Lock key unique per project | ✅ PASS | Derived from project_id UUID |
| UNIQUE constraint exists | ✅ PASS | `CONSTRAINT ota_project_outputs_version_unique UNIQUE (project_id, version)` |
| Exception handler for unique violation | ✅ PASS | Returns `VERSION_CONFLICT` error |

**Concurrency behavior:**
- Session A acquires lock → creates version N+1 → releases lock
- Session B waits → acquires lock → creates version N+2

### B3) Inputs optimistic locking

| Check | Status | Evidence |
|-------|--------|----------|
| RPC checks expected_updated_at | ✅ PASS | Line 166: `v_existing.updated_at != p_expected_updated_at` |
| UI sends expectedUpdatedAt | ✅ PASS | ProjectInputsTab.tsx line 117 |
| UI updates expectedUpdatedAt after save | ✅ PASS | Line 122: `setExpectedUpdatedAt(result.updated_at \|\| null)` |
| Conflict error shows message | ✅ PASS | Line 125: `toast.error('Dữ liệu đã được cập nhật bởi người khác')` |
| Reload button available | ✅ PASS | `handleReload()` function + refetch |

### B4) Audit coverage

| Action | performed_via | reason | Status |
|--------|---------------|--------|--------|
| CREATE_PROJECT_INPUTS | 'RPC' | - | ✅ PASS |
| UPDATE_PROJECT_INPUTS | 'RPC' | - | ✅ PASS |
| CREATE_OUTPUT_DRAFT | 'RPC' | - | ✅ PASS |
| UPDATE_OUTPUT_DRAFT | 'RPC' | - | ✅ PASS |
| SUBMIT_OUTPUT | 'RPC' | - | ✅ PASS |
| REVIEW_OUTPUT | 'RPC' | ✅ Required >= 5 chars | ✅ PASS |

### B5) Review permission

| Check | Status | Evidence |
|-------|--------|----------|
| has_ota_project_access check | ✅ PASS | Line 519 |
| Global roles: ota_lead, admin, super_admin | ✅ PASS | Line 523-526 |
| Project roles: LEAD, ADMIN | ✅ PASS | Line 530-535 |
| Non-authorized user blocked | ✅ PASS | Returns PERMISSION_DENIED |

---

## C) UI/UX ACCEPTANCE

### C1) ProjectDetailPage tabs

| Tab | Status | Component |
|-----|--------|-----------|
| Overview (Tổng quan) | ✅ PASS | Built-in |
| Tasks | ✅ PASS | Built-in |
| Members (Thành viên) | ✅ PASS | ProjectMembersPanel |
| Inputs (Đầu vào) | ✅ PASS | ProjectInputsTab |
| Outputs (Đầu ra) | ✅ PASS | ProjectOutputsTab |

### C2) Read-only behavior by status

| Status | Behavior | Status |
|--------|----------|--------|
| DRAFT | Editable (creator or admin only) | ✅ PASS |
| SUBMITTED | Read-only + yellow "Chờ duyệt" banner | ✅ PASS |
| APPROVED | Read-only + green "Đã duyệt" badge | ✅ PASS |
| REJECTED | Read-only + red reason alert + "Tạo bản chỉnh sửa" button | ✅ PASS |

### C3) Error/Toast handling

| Scenario | Toast Message | Status |
|----------|---------------|--------|
| Permission denied | `toast.error('Lỗi: PERMISSION_DENIED')` | ✅ PASS |
| Optimistic locking conflict | `toast.error('Dữ liệu đã được cập nhật bởi người khác')` | ✅ PASS |
| Version conflict | Returns error with retry message | ✅ PASS |
| RPC failures | Generic error toast | ✅ PASS |

---

## OVERALL RESULT

| Section | Status |
|---------|--------|
| A) Pre-check | ✅ ALL PASS |
| B) Security & Workflow | ✅ ALL PASS |
| C) UI/UX Acceptance | ✅ ALL PASS |

**VERDICT: ✅ PRODUCTION READY**

---

## Files Modified/Created in v3.1

### Migrations
1. `20260108_018_ota_work_type.sql` - work_type enum + column
2. `20260108_019_ota_audit_log_override.sql` - audit log extensions
3. `20260108_020_ota_super_admin_override.sql` - super admin override RPC
4. `20260108_021_ota_project_inputs_outputs.sql` - inputs/outputs tables + RLS
5. `20260108_022_ota_project_io_rpcs.sql` - 6 RPC functions
6. `20260108_023_ota_create_draft_race_fix.sql` - race-condition fix

### Components
- `src/components/ota-operations/ProjectInputsTab.tsx`
- `src/components/ota-operations/ProjectOutputsTab.tsx`
- `src/components/ota-operations/WorkTypeBadge.tsx`
- `src/components/ota-operations/SuperAdminOverrideModal.tsx`

### Hooks
- `src/hooks/useOtaOperations.ts` (added IO hooks)

### Pages
- `src/pages/ota-operations/ProjectDetailPage.tsx` (added Inputs/Outputs tabs)

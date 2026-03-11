# Sprint 3A — Review/Approvals Bottleneck Fix
## ACCEPTANCE CHECKLIST

**Date:** 2026-01-10
**Status:** ⚠️ REVERTED (2026-01-10)
**Reverted By:** Product decision - Evidence review will be done directly in Task panel/Board

---

## 🔄 REVERT SUMMARY

**Decision:** Gỡ toàn bộ PendingReviewsPage UI vì ops quyết định review evidence trực tiếp trong Task panel/Board.

**What was REMOVED:**
- Route `/ota-operations/reviews`
- Sidebar menu "Duyệt minh chứng"
- Page `PendingReviewsPage.tsx` (marked for deletion)
- Export in `index.ts`
- Hook `usePendingReviews`
- Query key `ota-pending-reviews` invalidations

**What was KEPT (still useful):**
- RPC `ota_get_pending_reviews` — can be used for dashboard/reports later
- RPC `ota_review_evidence` — used by EvidenceTab in TaskSidePanel
- RPC `ota_bulk_approve_evidence` — can be used in Board bulk actions later
- Hook `useReviewEvidence` — used by EvidenceTab
- Hook `useBulkApproveEvidence` — kept for future use
- Type `BulkApproveResult` — kept

**Files to clean up manually:**
```bash
git rm src/pages/ota-operations/PendingReviewsPage.tsx
```

---

## 📋 ORIGINAL DECISION LOG (ARCHIVED)

### Why Approve-by-Task (not by-Evidence)?

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Granularity** | Approve all PENDING evidence of selected tasks | Faster for Lead/Admin; reduces clicks |
| **UX** | Checkbox per evidence row, but bulk action per task | User sees individual evidence, approves by task |
| **RPC** | `ota_bulk_approve_evidence(p_task_ids UUID[])` | Already implemented in Migration 027 |
| **Alternative** | Future: Add `p_evidence_ids UUID[]` param | If fine-grained control needed |

### How to Switch to Approve-by-Evidence (Future Sprint)

1. Modify RPC to accept `p_evidence_ids` instead of (or in addition to) `p_task_ids`
2. Update `useBulkApproveEvidence` hook to pass evidence IDs
3. Change button semantics: "Duyệt X minh chứng đã chọn"
4. No DB schema change needed

---

## ✅ PHASE A — VERIFY (COMPLETED)

| Item | Status | Notes |
|------|--------|-------|
| RPC `ota_get_pending_reviews` | ✅ EXISTS | Migration 009, returns PENDING evidence across projects |
| RPC `ota_review_evidence` | ✅ EXISTS | Individual approve/reject/needs_revision |
| RPC `ota_bulk_approve_evidence` | ✅ EXISTS | Migration 027, approve all PENDING for given task_ids |
| Hook `useReviewEvidence` | ✅ EXISTS + USED | EvidenceTab, EvidenceList, TaskContextPanel |
| Hook `useBulkApproveEvidence` | ✅ EXISTS | BulkApproveButton + PendingReviewsPage |
| Hook `usePendingReviews` | ✅ CREATED | Sprint 3A added wrapper for RPC |
| Type `OtaPendingReview` | ✅ EXISTS | Already defined in ota-operations.ts |
| BulkApproveButton component | ⚠️ EXISTS | Not reused (inline implementation in page) |

---

## ✅ PHASE B — BUILD (COMPLETED)

### B0: Create `usePendingReviews` Hook
- **File:** `src/hooks/useOtaOperations.ts` (lines ~1294-1343)
- **Query Key:** `['ota-pending-reviews', projectId]`
- **Stale Time:** 30s (reviews need freshness)
- **Cache Invalidation:** Added to `useReviewEvidence.onSuccess` and `useBulkApproveEvidence.onSuccess`

### B1: Pending Reviews Page
- **File:** `src/pages/ota-operations/PendingReviewsPage.tsx` (~540 lines)
- **Route:** `/ota-operations/reviews`
- **Features:**
  - Stats cards: Chờ duyệt / Đã chọn / Projects
  - Search by task, project, property, submitter
  - Filter by project
  - Table with checkbox selection
  - Individual Approve (✓) / Reject (✗) actions
  - Bulk Approve dialog with notes
  - Reject dialog with NEEDS_REVISION / REJECTED options

### B2: Wire BulkApproveButton (INLINE)
- Bulk approve integrated directly in PendingReviewsPage (not using separate component)
- Same UX: confirmation dialog, optional notes, success toast

### B3: Quick Filters
- Search input (task, project, property, submitter)
- Project dropdown filter
- Refresh button

### B5: Post-Approval Guidance
- ✅ Individual approve toast includes DONE hint + "Xem task" action
- ✅ Bulk approve toast includes task count + DONE reminder

### B4: Auto-Approve SKIPPED
- Per spec: "KHÔNG auto-approve evidence" — Lead approval is required

---

## 🧪 HARD QA TEST MATRIX

### T0: Bulk Approve Semantics (CRITICAL)
| Test | Expected | Status |
|------|----------|--------|
| Task with 3 pending evidence: select 1 row → bulk approve | ALL 3 evidence of that task approved | ⬜ Manual |
| Select 2 rows from same task | Button shows "1 task" (deduplicated) | ⬜ Manual |
| Select rows from 3 different tasks | Button shows "3 tasks" | ⬜ Manual |
| Dialog shows warning about approve-by-task | Yellow box with ⚠️ visible | ⬜ Manual |

### T1: Page Access & Security
| Test | Expected | Status |
|------|----------|--------|
| Lead/Admin visits `/ota-operations/reviews` | Page loads with pending list | ⬜ Manual |
| Staff visits `/ota-operations/reviews` | Access denied (OtaRoleGate) | ⬜ Manual |
| Cross-project access: user sees only their projects | RPC filters by `has_ota_project_access()` | ⬜ Manual |
| No pending evidence | Empty state "Không có minh chứng chờ duyệt" | ⬜ Manual |

### T2: Individual Actions
| Test | Expected | Status |
|------|----------|--------|
| Click ✓ on evidence | Toast "Đã duyệt minh chứng" + DONE hint | ⬜ Manual |
| Click ✗ → NEEDS_REVISION | Toast "Yêu cầu chỉnh sửa" | ⬜ Manual |
| Click ✗ → REJECTED | Toast "Đã từ chối" | ⬜ Manual |
| After approve, list refreshes | Evidence removed from list | ⬜ Manual |

### T3: Bulk Actions
| Test | Expected | Status |
|------|----------|--------|
| Select multiple → "Duyệt theo Task (N tasks)" | Button shows task count | ⬜ Manual |
| Confirm bulk approve | Toast "Đã duyệt X minh chứng" | ⬜ Manual |
| Selection cleared after success | Checkbox states reset | ⬜ Manual |
| Select all checkbox | All visible items selected | ⬜ Manual |

### T4: Race Conditions
| Test | Expected | Status |
|------|----------|--------|
| Double approve (2 tabs): approve same evidence twice | Second action returns graceful error or no-op | ⬜ Manual |
| Approve while page refreshing | No crash, mutation state handles | ⬜ Manual |

### T5: DONE Guard Integration
| Test | Expected | Status |
|------|----------|--------|
| EXECUTION task: approve evidence → can DONE | DONE guard passes | ⬜ Manual |
| EXECUTION task: no approved evidence → cannot DONE | DONE guard blocks | ⬜ Manual |
| PREP/AUTO/OPS task: can DONE without evidence | DONE guard passes | ⬜ Manual |

### T6: Filters & Navigation
| Test | Expected | Status |
|------|----------|--------|
| Search "task name" | List filtered | ⬜ Manual |
| Filter by project | Only that project's evidence shown | ⬜ Manual |
| Clear filters | All pending shown | ⬜ Manual |
| Sidebar shows "Duyệt minh chứng" | Link visible under OTA Operations | ⬜ Manual |
| Click task title → task detail | Navigates correctly | ⬜ Manual |
| Row shows "N pending" badge | When task has multiple pending | ⬜ Manual |

---

## 📁 FILES CHANGED

| File | Change Type | Lines |
|------|-------------|-------|
| `src/hooks/useOtaOperations.ts` | MODIFIED | +50 (usePendingReviews hook + cache invalidation) |
| `src/pages/ota-operations/PendingReviewsPage.tsx` | NEW + MODIFIED | ~660 (page + UX polish) |
| `src/pages/ota-operations/index.ts` | MODIFIED | +1 (export) |
| `src/App.tsx` | MODIFIED | +2 (import + route) |
| `src/components/layout/Sidebar.tsx` | MODIFIED | +1 (menu item) |
| `src/components/layout/ProtectedRoute.tsx` | MODIFIED | +1 (whitelist) |

---

## 🎯 SPRINT 3A OUTCOME

**BEFORE:**
- Lead phải vào từng Task → EvidenceTab → Review từng cái
- Không có overview của pending evidence
- BulkApproveButton tồn tại nhưng không được wire

**AFTER:**
- `/ota-operations/reviews` = Central review queue
- Multi-select + bulk approve
- Filters by project, search
- Post-approval toast với DONE hint
- Evidence approval bottleneck REMOVED

---

## 🚀 NEXT SPRINT CANDIDATES

1. **Sprint 3B: Auto-DONE suggestion** - After all evidence approved, prompt user to move task to DONE
2. **Sprint 3C: Review SLA tracking** - Track time-to-review metrics
3. **Sprint 4: My Tasks Dashboard** - Aggregate view of user's tasks across projects

---

**Sprint 3A Status: ✅ COMPLETE (pending manual QA)**

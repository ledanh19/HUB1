# SPRINT 2 - QUICK TASK ACCEPTANCE CHECKLIST

**Date**: 2026-01-09  
**Feature**: Quick Task via Daily Ops Bucket  
**Migration**: `20260109_029_ota_quick_task_ops_bucket.sql`

---

## 🎯 SPRINT 2 DEFINITION OF DONE

> Nhân viên có thể tạo – xử lý – hoàn thành việc nhỏ hằng ngày mà không làm rối Project,
> còn leader vẫn giữ được audit – kiểm soát – insight.

---

## 📋 FUNCTIONAL ACCEPTANCE CRITERIA

### ✅ AC-1: Quick Task Creation (≤10 seconds)

| Test Case | Expected | Status |
|-----------|----------|--------|
| Open Tasks page, click "Tạo Task" dropdown | Shows "Quick Task ⚡" option | ⏳ |
| Click "Quick Task ⚡" | Opens mini dialog with 5 fields | ⏳ |
| Fill only Title + submit | Task created in today's Ops Bucket | ⏳ |
| Time from click to task created | ≤ 10 seconds | ⏳ |

**SQL Verification**:
```sql
-- Verify Ops Bucket created
SELECT id, name, is_ops_bucket, bucket_date, status
FROM ota_projects
WHERE is_ops_bucket = true
AND bucket_date = CURRENT_DATE;

-- Verify Quick Task created
SELECT id, title, is_quick_task, project_id, classification, require_evidence
FROM ota_tasks
WHERE is_quick_task = true
ORDER BY created_at DESC LIMIT 1;
```

### ✅ AC-2: No Project Selection Required

| Test Case | Expected | Status |
|-----------|----------|--------|
| Quick Task dialog | No project dropdown | ⏳ |
| Task card shows | Project name = "Ops Bucket – YYYY-MM-DD" | ⏳ |
| Task card shows | ⚡ badge indicating Quick Task | ⏳ |

### ✅ AC-3: EXECUTION Quick Task - Evidence Required

| Test Case | Expected | Status |
|-----------|----------|--------|
| Create EXECUTION Quick Task | `require_evidence=true`, `min_evidence_count=1` | ⏳ |
| Try mark DONE without evidence | BLOCKED with toast message | ⏳ |
| Upload + approve 1 evidence | DONE button enabled | ⏳ |
| Mark DONE | Success | ⏳ |

### ✅ AC-4: PREP/AUTO/OPS Quick Task - No Evidence Required

| Test Case | Expected | Status |
|-----------|----------|--------|
| Create PREP Quick Task | `require_evidence=false`, `min_evidence_count=0` | ⏳ |
| Try mark DONE without evidence | SUCCESS - no block | ⏳ |
| Create AUTO Quick Task | Same behavior | ⏳ |
| Create OPS Quick Task | Same behavior | ⏳ |

### ✅ AC-5: Promote Quick Task to Project

| Test Case | Expected | Status |
|-----------|----------|--------|
| Open Quick Task in side panel | Shows "Chuyển vào Project..." in menu | ⏳ |
| Click "Chuyển vào Project..." | Opens project selection dialog | ⏳ |
| Select target project | Task moved, `is_quick_task=false` | ⏳ |
| Evidence + comments preserved | Yes | ⏳ |
| Audit log created | `QUICK_TASK_PROMOTED` action | ⏳ |

**SQL Verification**:
```sql
-- After promote, verify task updated
SELECT id, title, project_id, is_quick_task
FROM ota_tasks WHERE id = '<task_id>';
-- Expected: is_quick_task = false, project_id = target_project_id

-- Verify audit log
SELECT action, old_data, new_data
FROM ota_audit_log
WHERE entity_id = '<task_id>'
AND action = 'QUICK_TASK_PROMOTED';
```

---

## 🔒 SECURITY ACCEPTANCE CRITERIA

### ✅ SEC-1: Ops Bucket Hidden from Project List

| Test Case | Expected | Status |
|-----------|----------|--------|
| Go to Projects page | Ops Bucket NOT visible | ⏳ |
| Filter projects in CreateTaskDialog | Ops Bucket NOT in list | ⏳ |
| Direct URL to Ops Bucket | Should work for members only | ⏳ |

**SQL Verification**:
```sql
-- Frontend query excludes ops buckets
SELECT * FROM ota_projects
WHERE is_ops_bucket = false OR is_ops_bucket IS NULL;
```

### ✅ SEC-2: RLS Respected for Quick Tasks

| Test Case | Expected | Status |
|-----------|----------|--------|
| User A creates Quick Task | Only User A + team sees it | ⏳ |
| User B (different team) | Cannot see User A's Quick Task | ⏳ |
| project_id NOT NULL | All Quick Tasks have valid project_id | ⏳ |

### ✅ SEC-3: Promote Respects Access Control

| Test Case | Expected | Status |
|-----------|----------|--------|
| Try promote to project without access | ERROR: TARGET_ACCESS_DENIED | ⏳ |
| Try promote to another Ops Bucket | ERROR: INVALID_TARGET | ⏳ |
| Promote to accessible project | SUCCESS | ⏳ |

---

## 📊 AUDIT ACCEPTANCE CRITERIA

### ✅ AUD-1: Quick Task Created Audit

| Test Case | Expected | Status |
|-----------|----------|--------|
| Create Quick Task | Audit log entry created | ⏳ |
| Action | `QUICK_TASK_CREATED` | ⏳ |
| Data includes | title, classification, bucket_date | ⏳ |

### ✅ AUD-2: Ops Bucket Created Audit

| Test Case | Expected | Status |
|-----------|----------|--------|
| First Quick Task of day | Creates Ops Bucket | ⏳ |
| Audit log entry | `OPS_BUCKET_CREATED` action | ⏳ |
| Second Quick Task same day | Reuses existing bucket (no new audit) | ⏳ |

### ✅ AUD-3: Quick Task Promoted Audit

| Test Case | Expected | Status |
|-----------|----------|--------|
| Promote Quick Task | Audit log entry created | ⏳ |
| Action | `QUICK_TASK_PROMOTED` | ⏳ |
| Data includes | from_project_id, to_project_id | ⏳ |

---

## 🏗️ ARCHITECTURE INTEGRITY

### ✅ ARCH-1: No RLS Regression

| Check | Expected | Status |
|-------|----------|--------|
| `project_id` column | NOT NULL | ⏳ |
| RLS policies unchanged | Yes | ⏳ |
| All existing queries work | Yes | ⏳ |

### ✅ ARCH-2: Sprint 1 Rules Preserved

| Check | Expected | Status |
|-------|----------|--------|
| DONE guard works for Quick Tasks | Yes | ⏳ |
| Classification rules applied | Yes | ⏳ |
| Evidence workflow unchanged | Yes | ⏳ |
| Field-level immutability on DONE | Yes | ⏳ |

---

## 📁 FILES DELIVERED

### Database
- [x] `supabase/migrations/20260109_029_ota_quick_task_ops_bucket.sql`

### Frontend Components
- [x] `src/components/ota-operations/QuickTaskDialog.tsx` (NEW)
- [x] `src/components/ota-operations/PromoteTaskDialog.tsx` (NEW)

### Updated Files
- [x] `src/lib/otaOps.ts` - Added `is_quick_task`, `is_ops_bucket`, `bucket_date` to interfaces
- [x] `src/components/ota-operations/TaskCard.tsx` - Added Quick Task ⚡ badge
- [x] `src/components/ota-operations/TaskSidePanel/PanelHeader.tsx` - Added Promote action
- [x] `src/pages/ota-operations/TasksPage.tsx` - Added Quick Task dropdown
- [x] `src/hooks/useOtaOperations.ts` - Hide ops bucket from project list

### RPCs (in Migration 029)
- [x] `ota_get_or_create_ops_bucket(bucket_date)`
- [x] `ota_create_quick_task(payload)`
- [x] `ota_promote_quick_task_to_project(task_id, target_project_id)`

---

## 📊 SUMMARY

| Category | Total | Pass | Fail | Pending |
|----------|-------|------|------|---------|
| Functional | 5 | 0 | 0 | 5 |
| Security | 3 | 0 | 0 | 3 |
| Audit | 3 | 0 | 0 | 3 |
| Architecture | 2 | 0 | 0 | 2 |
| **TOTAL** | **13** | **0** | **0** | **13** |

---

## ❌ NOT IN SCOPE (Sprint 3+)

- [ ] Task Templates
- [ ] SLA Tracking
- [ ] Notifications
- [ ] Calendar Integration
- [ ] Bulk Status Updates

---

## ✍️ SIGN-OFF

**Tester**: _______________  
**Date**: _______________  
**Sprint 2 Status**: [ ] APPROVED / [ ] NEEDS FIXES

**Notes**:
```


```

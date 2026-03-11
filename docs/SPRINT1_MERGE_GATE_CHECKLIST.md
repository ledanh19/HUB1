# SPRINT 1 MERGE GATE CHECKLIST

**Date**: 2026-01-09  
**Migration**: `20260109_028_ota_classification_evidence_rules.sql`  
**Status**: PENDING VERIFICATION

---

## 📋 6 CHECKPOINT VERIFICATION

### ✅ Checkpoint 1: Migration Syntax Valid
**Requirement**: Migration 028 chạy pass trên DB thật (không lỗi column/trigger)

**Verification SQL**:
```sql
-- Run migration 028
-- Then verify:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'ota_tasks' 
AND column_name IN ('require_evidence', 'min_evidence_count');

-- Expected:
-- require_evidence | boolean | true
-- min_evidence_count | integer | 1
```

**Result**: [ ] PASS / [ ] FAIL

---

### ✅ Checkpoint 2: Trigger No Recursion
**Requirement**: Trigger evidence rules không recursion (chỉ set NEW.* / dùng IS DISTINCT FROM)

**Code Review**:
```sql
-- In ota_task_set_evidence_rules():
IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.classification IS DISTINCT FROM NEW.classification) THEN
  -- Only sets NEW.* fields, no UPDATE statements
  NEW.require_evidence := COALESCE(NEW.require_evidence, ...);
  NEW.min_evidence_count := GREATEST(COALESCE(...));
END IF;
RETURN NEW;
```

**Analysis**:
- ✅ Uses `IS DISTINCT FROM` for comparison
- ✅ Only sets `NEW.*` fields (no recursive UPDATE)
- ✅ Returns `NEW` without triggering another update

**Result**: [x] PASS

---

### ✅ Checkpoint 3: PREP/AUTO/OPS Logic
**Requirement**: require_evidence=false & min_evidence_count=0 => DONE được không cần evidence (UI+DB)

**DB Verification SQL**:
```sql
-- Create PREP task
INSERT INTO ota_tasks (title, classification, project_id) 
VALUES ('Test PREP', 'PREP', 'xxx') RETURNING id, require_evidence, min_evidence_count;
-- Expected: require_evidence=false, min_evidence_count=0

-- Try to mark DONE without evidence
SELECT ota_update_task_status('<task_id>', 'DONE');
-- Expected: success=true (no evidence required)
```

**UI Verification**:
```tsx
// In PanelHeader.tsx:
const requireEvidence = task.require_evidence ?? (task.classification === 'EXECUTION' || !task.classification);
const minEvidenceCount = task.min_evidence_count ?? (requireEvidence ? 1 : 0);
const evidenceSatisfied = !requireEvidence || approvedCount >= minEvidenceCount;

// For PREP: requireEvidence=false => evidenceSatisfied=true => canComplete=true
```

**Result**: [ ] PASS / [ ] FAIL

---

### ✅ Checkpoint 4: EXECUTION Logic
**Requirement**: require_evidence=true & min_evidence_count>=1 => DONE bị chặn nếu chưa đủ approved

**DB Verification SQL**:
```sql
-- Create EXECUTION task
INSERT INTO ota_tasks (title, classification, project_id) 
VALUES ('Test EXECUTION', 'EXECUTION', 'xxx') RETURNING id, require_evidence, min_evidence_count;
-- Expected: require_evidence=true, min_evidence_count=1

-- Try to mark DONE without evidence
SELECT ota_update_task_status('<task_id>', 'DONE');
-- Expected: success=false, error='EVIDENCE_REQUIRED'
```

**UI Verification**:
```tsx
// For EXECUTION: requireEvidence=true, minEvidenceCount=1
// If approvedCount=0: evidenceSatisfied=false => canComplete=false
// Toast: "Cần ít nhất 1 minh chứng được duyệt"
```

**Result**: [ ] PASS / [ ] FAIL

---

### ✅ Checkpoint 5: Bulk Approve Logic
**Requirement**: 
- Chỉ approve PENDING/NEEDS_REVISION
- Check has_ota_project_access per task
- Không approve cross-project

**Code Review**:
```sql
-- In ota_bulk_approve_evidence():

-- 1. Check project access per task
IF NOT has_ota_project_access(v_task.project_id) THEN
  v_skipped_count := v_skipped_count + 1;
  v_results := array_append(v_results, json_build_object(
    'task_id', v_task_id,
    'status', 'SKIPPED',
    'reason', 'PROJECT_ACCESS_DENIED'
  ));
  CONTINUE;
END IF;

-- 2. Only approve PENDING/NEEDS_REVISION
WHERE review_status IN ('PENDING', 'NEEDS_REVISION')
```

**Test SQL**:
```sql
-- As user without access to project_B
SELECT ota_bulk_approve_evidence(
  ARRAY['task_project_a', 'task_project_b']::uuid[]
);
-- Expected: task_project_b skipped with reason='PROJECT_ACCESS_DENIED'
```

**Result**: [ ] PASS / [ ] FAIL

---

### ✅ Checkpoint 6: DONE Immutability Field-Level
**Requirement**:
- Core fields locked: status, title, description, project_id, assignee_id, priority, due_date
- Metadata allowed: issue_tag, effort, tags, cover_image_url, classification

**Code Review**:
```sql
-- In enforce_ota_task_done_immutable():
v_immutable_fields TEXT[] := ARRAY['status', 'title', 'description', 'project_id', 'assignee_id', 'priority', 'due_date'];

-- Only checks these specific fields
-- ALLOWED: issue_tag, classification, expected_effort_minutes, actual_effort_minutes, 
--          tags, labels, work_type, cover_image_url, updated_at, updated_by
```

**Test SQL**:
```sql
-- Mark task as DONE first
UPDATE ota_tasks SET status = 'DONE' WHERE id = '<task_id>';

-- Try to update title (should FAIL)
UPDATE ota_tasks SET title = 'New Title' WHERE id = '<task_id>';
-- Expected: ERROR 'DONE_IMMUTABLE: Cannot change title of DONE task'

-- Try to update issue_tag (should SUCCEED)
UPDATE ota_tasks SET issue_tag = 'BUG' WHERE id = '<task_id>';
-- Expected: Success

-- Try to update cover_image_url (should SUCCEED)
UPDATE ota_tasks SET cover_image_url = 'https://...' WHERE id = '<task_id>';
-- Expected: Success
```

**Result**: [ ] PASS / [ ] FAIL

---

## 📊 SUMMARY

| Checkpoint | Description | Status |
|------------|-------------|--------|
| 1 | Migration syntax valid | ⏳ |
| 2 | Trigger no recursion | ✅ PASS |
| 3 | PREP/AUTO/OPS logic | ⏳ |
| 4 | EXECUTION logic | ⏳ |
| 5 | Bulk approve logic | ⏳ |
| 6 | DONE immutability field-level | ⏳ |

---

## 🚀 AFTER MERGE: SPRINT 2 SCOPE

### Quick Task theo Ops Bucket + Template v1

**Features**:
1. Quick Task creation from Ops Bucket
2. Template-based task creation
3. Bucket → Task auto-mapping
4. Template management UI

**Files to create**:
- `supabase/migrations/20260110_029_ota_quick_task_templates.sql`
- `src/components/ota-operations/QuickTaskCreate.tsx`
- `src/components/ota-operations/TemplateManager.tsx`

---

## ✍️ SIGN-OFF

**Reviewer**: _______________  
**Date**: _______________  
**Decision**: [ ] APPROVED TO MERGE / [ ] NEEDS FIXES

**Notes**:
```


```

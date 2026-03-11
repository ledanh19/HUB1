# WORK ENGINE - GAP & REDUNDANCY ANALYSIS

**Generated**: 2026-01-10  
**Phase**: 1 - Gap Analysis  
**Baseline**: WORK_ENGINE_AS_IS_REALITY_REPORT.md

---

## 📋 ANALYSIS STRUCTURE

### 3 Câu Hỏi Bắt Buộc:
1. **Cái gì đã tồn tại nhưng CHƯA ĐƯỢC SỬ DỤNG?**
2. **Cái gì đang được dùng nhưng SAI LOGIC OPS?**
3. **Cái gì CHƯA CÓ THẬT SỰ?**

---

## 1️⃣ ĐÃ TỒN TẠI NHƯNG CHƯA ĐƯỢC SỬ DỤNG

### 1.1 Database Fields - ORPHAN

| Field | Table | Issue | Action |
|-------|-------|-------|--------|
| `actual_hours` | ota_tasks | Field có, mutation có, **UI không có input** | **FIX** - Add input to TaskSidePanel |
| `actual_effort_minutes` | ota_tasks | Field có, **không có RPC/UI nào set** | **REMOVE** hoặc **FIX** - Wire vào completion flow |
| `expected_effort_minutes` | ota_tasks | Field có, QuickTaskDialog không show | **FIX** - Add optional input |
| `schema_version` | ota_project_inputs | Always = 1, không có migration logic | **IGNORE** - Chưa cần |
| `schema_version` | ota_project_outputs | Always = 1, không có migration logic | **IGNORE** - Chưa cần |

### 1.2 RPCs - WRITTEN BUT NOT CALLED

| RPC | Issue | Action |
|-----|-------|--------|
| `ota_update_task_priority` | Hook có, **UI không có inline priority change** | **FIX** - Add priority dropdown to TaskSidePanel |
| `ota_update_task_due_date` | Hook có, **UI không có date picker in side panel** | **FIX** - Add date picker to TaskSidePanel |
| `ota_get_project_inputs` | Có RPC, **ProjectInputsTab dùng direct query** | **KEEP** - Direct query đủ nhanh |
| `ota_get_project_outputs` | Có RPC, **ProjectOutputsTab dùng direct query** | **KEEP** - Direct query đủ nhanh |

### 1.3 UI Components - CODED BUT NOT TRIGGERED

| Component | Issue | Action |
|-----------|-------|--------|
| `MyTasksPageEnhanced.tsx` | **DUPLICATE** - Không có route, không được import | **REMOVE** |
| `TaskQuickViewDrawer` | Referenced in docs but **may not exist as standalone** | **VERIFY** - Check if TaskSidePanel covers this |

### 1.4 Triggers - EXISTS BUT NOT ALWAYS HIT

| Trigger | Issue | Action |
|---------|-------|--------|
| `tr_ota_task_done_guard` | **CORRECT** - Nhưng chỉ enforce EXECUTION tasks | **KEEP** - Logic đúng per Sprint 1 |

---

## 2️⃣ ĐANG ĐƯỢC DÙNG NHƯNG SAI LOGIC OPS

### 2.1 DONE Status - SEMANTIC ISSUE ⚠️

**Current Logic:**
- DONE = Status được set khi có ≥1 approved evidence (EXECUTION tasks)
- DONE = Có thể set ngay lập tức (PREP/AUTO/OPS tasks)

**OPS Reality Gap:**
- DONE hiện tại **KHÔNG bao gồm** khái niệm **BÀN GIAO**
- Không có field/mechanism để tracking ai đã nhận/verify kết quả
- Staff mark DONE → Không ai confirm → Có thể bị miss

**Evidence:**
```sql
-- Current: Task goes to DONE when evidence approved
-- Missing: No "handover_accepted_by" or "verified_by" field
```

**Action:** **NEED DISCUSSION**
- Option A: DONE = as-is (giữ nguyên logic đơn giản)
- Option B: Add HANDOVER status after DONE → COMPLETED (nếu cần tracking nhận)
- **Recommendation: KEEP AS-IS** - Bàn giao phức tạp, hiện tại đủ dùng. Chỉ add nếu có demand rõ ràng.

### 2.2 Evidence Upload - NO DECISION IMPACT

**Current Logic:**
- Evidence upload → review_status = PENDING
- Lead approve → review_status = APPROVED
- **Approved evidence KHÔNG tự động trigger action nào khác**

**OPS Reality Gap:**
- Approve evidence != Task done (đúng rồi)
- Nhưng **UI không guide user** sau khi evidence approved
- User có thể quên mark DONE sau khi evidence approved

**Action:** **FIX (UI only)**
- After evidence approved → Show toast/prompt: "Evidence đã được duyệt. Bạn có muốn đánh dấu task DONE?"
- Không thay đổi logic DB

### 2.3 Task Created - NO RESPONSIBILITY UNTIL ASSIGNED

**Current Logic:**
- Task created → assignee_id = NULL possible
- Task without assignee = Orphan (không ai chịu trách nhiệm)

**Evidence:**
```sql
SELECT COUNT(*) FROM ota_tasks 
WHERE assignee_id IS NULL 
AND status NOT IN ('DONE', 'CANCELLED');
-- Result: Unknown but possible
```

**Action:** **FIX (UI guidance)**
- CreateTaskDialog: Highlight "Chưa assign" warning
- Task list: Show "Chưa có người phụ trách" badge prominently
- **DO NOT** force assign on create (giữ flexibility)

### 2.4 Quick Task - CLASSIFICATION RULE INCONSISTENCY

**Current Logic (Sprint 1):**
- EXECUTION → require_evidence = true, min_evidence_count = 1
- PREP/AUTO/OPS → require_evidence = false

**Gap:**
- UI QuickTaskDialog có dropdown classification
- **Nhưng không hiển thị rõ** consequence của mỗi choice
- User có thể chọn sai classification → bypass evidence rule

**Action:** **FIX (UI clarity)**
- Add helper text under classification dropdown
- Show "Evidence bắt buộc" / "Không cần evidence" based on selection

### 2.5 Project Status COMPLETED - NOT AUTOMATED

**Current Logic:**
- Project status phải được manual set sang COMPLETED
- Không có automation khi all tasks DONE

**OPS Reality:**
- Có thể quên close project
- Có thể có project với all tasks DONE nhưng status = IN_PROGRESS

**Action:** **FIX (optional automation)**
- Add RPC `ota_check_project_completion` - suggest COMPLETED if all tasks done
- UI shows "Có thể đóng project" indicator
- **DO NOT auto-complete** - giữ control cho Lead

---

## 3️⃣ CHƯA CÓ THẬT SỰ (CẦN BUILD)

### 3.1 Multi-Department Support - ❌ NOT EXISTS

**Current State:**
- `work_type` enum có giá trị generic: OTA_ONBOARDING, OTA_OPTIMIZATION, etc.
- Tất cả projects/tasks thuộc về **OTA domain only**
- Không có concept **department/team** tách biệt

**What's Actually Missing:**

| Item | Description | Priority |
|------|-------------|----------|
| `department_id` field | FK to departments table | **P0** if multi-dept needed |
| `departments` table | id, name, code, settings | **P0** if multi-dept needed |
| Department-scoped RLS | Isolate data per department | **P0** if multi-dept needed |
| Work type per department | Different work_type enum per dept | **P1** |
| Cross-department tasks | Tasks spanning multiple depts | **P2** |

**Action:** **NEED REQUIREMENTS**
- ❓ Có bao nhiêu department cần support?
- ❓ Mỗi department có work_type riêng không?
- ❓ Có cần cross-department collaboration không?
- ❓ RLS cần isolate hoàn toàn hay chỉ soft filter?

### 3.2 Daily Ops Dashboard - ❌ NOT EXISTS

**Current State:**
- My Tasks page có action buckets (urgent/review/blocked/later)
- Không có **daily summary view** cho Lead/Admin

**What's Actually Missing:**

| Item | Description | Priority |
|------|-------------|----------|
| Daily Ops summary | Tasks created/completed today | **P1** |
| Team workload view | Who has how many tasks | **P1** |
| Bottleneck alerts | Which tasks stuck > X days | **P1** |
| Quick actions | Assign/escalate từ dashboard | **P2** |

**Action:** **BUILD if needed**
- Can reuse existing hooks + new aggregation RPC
- UI only, không cần new tables

### 3.3 Handover/Shift Transition - ❌ NOT EXISTS

**Current State:**
- Không có concept "ca làm việc" hay "bàn giao ca"
- Tasks không có "shift" awareness

**What's Actually Missing:**

| Item | Description | Priority |
|------|-------------|----------|
| Shift definition | Morning/Afternoon/Night etc. | **P2** (nếu cần) |
| Handover note | Note khi end of shift | **P2** |
| Incomplete task list | Tasks không xong trong ca | **P2** |

**Action:** **DO NOT BUILD YET**
- Quá phức tạp cho current scope
- Có thể handle bằng comments/notes hiện có

### 3.4 SLA / Deadline Enforcement - ❌ NOT EXISTS

**Current State:**
- `due_date` có trên tasks
- Không có **auto-escalation** khi overdue
- Không có **SLA rules** per work_type

**What's Actually Missing:**

| Item | Description | Priority |
|------|-------------|----------|
| SLA config per work_type | e.g., INCIDENT_SUPPORT = 4h | **P2** |
| Auto-escalation trigger | Notify Lead khi miss SLA | **P2** |
| SLA breach reporting | How many tasks missed SLA | **P2** |

**Action:** **DO NOT BUILD YET**
- Current health calculation (RED/YELLOW/GREEN) đủ dùng
- SLA phức tạp, cần business rules rõ ràng

### 3.5 Recurring Tasks - ❌ NOT EXISTS

**Current State:**
- Mỗi task là one-time
- Không có template/recurring mechanism

**What's Actually Missing:**

| Item | Description | Priority |
|------|-------------|----------|
| Task templates | Reusable task definitions | **P2** |
| Recurring schedule | Daily/Weekly/Monthly tasks | **P2** |
| Auto-create next occurrence | Khi task DONE → clone | **P2** |

**Action:** **DO NOT BUILD YET**
- Can workaround bằng Quick Task hàng ngày
- Complexity cao cho value không rõ

---

## 📊 DECISION MATRIX

### KEEP (Giữ nguyên)

| Item | Reason |
|------|--------|
| project_id NOT NULL | RLS safety, đã có Ops Bucket workaround |
| DONE guard (approved evidence) | Sprint 1 rule, đang work |
| Project → Task hierarchy | Core architecture, không đổi |
| Quick Task → Ops Bucket | Sprint 2 solution, đang work |
| KPI via RPC only | Security requirement, đã enforce |

### FIX (Sửa lại)

| Item | What to Fix | Effort |
|------|-------------|--------|
| TaskSidePanel missing fields | Add actual_hours, priority dropdown, due date picker | 2h |
| QuickTaskDialog classification helper | Show evidence requirement per classification | 1h |
| Unassigned task warning | Add visual indicator + guidance | 1h |
| Evidence approved → DONE prompt | Toast suggestion after approval | 1h |
| MyTasksPageEnhanced cleanup | Remove duplicate file | 30min |

### REMOVE / IGNORE

| Item | Reason |
|------|--------|
| `actual_effort_minutes` field | Redundant với `actual_hours` |
| `schema_version` fields | Chưa cần migration logic |
| Handover/Shift system | Out of scope, handle by comments |
| SLA automation | Quá phức tạp, chưa có business rules |
| Recurring tasks | Can workaround với Quick Task |

### NEED TO BUILD (Nếu có requirements rõ ràng)

| Item | Prerequisite | Effort Estimate |
|------|--------------|-----------------|
| Multi-Department support | Clear department list + rules | 3-5 days |
| Daily Ops Dashboard | UI spec | 2-3 days |
| Department-scoped work_type | Department table first | 1-2 days |

---

## ⚠️ CRITICAL QUESTIONS BEFORE BUILDING

### Về Multi-Department:

1. **Departments nào cần support?**
   - [ ] OTA Operations (đã có)
   - [ ] Housekeeping
   - [ ] Front Desk
   - [ ] Maintenance
   - [ ] Finance
   - [ ] Other: ___

2. **Isolation level?**
   - [ ] Complete isolation (mỗi dept không thấy dept khác)
   - [ ] Soft filter (có thể xem nhưng không edit)
   - [ ] Shared projects (cross-dept collaboration)

3. **Work types per department?**
   - [ ] Same work_type enum cho all
   - [ ] Different enum per department
   - [ ] Configurable per department

4. **Users có thể thuộc nhiều departments?**
   - [ ] Yes - Many-to-many
   - [ ] No - One user, one department

### Về Daily Ops:

5. **Lead cần thấy gì trong Daily Ops Dashboard?**
   - [ ] Today's tasks summary
   - [ ] Team workload distribution
   - [ ] Overdue tasks
   - [ ] Recently completed
   - [ ] Other: ___

---

## ✅ PHASE 1 COMPLETE - SUMMARY

### Findings:

| Category | Count |
|----------|-------|
| Fields unused | 5 |
| RPCs unused | 2 |
| Components duplicate | 1 |
| Logic gaps | 5 |
| Missing (real) | 5 |

### Recommended Immediate Actions:

1. **FIX UI gaps** (5h total) - No DB changes
2. **Remove duplicate** file (30min)
3. **Collect requirements** for Multi-Department

### DO NOT:
- Build Multi-Department without clear requirements
- Change DONE semantics
- Add SLA/Recurring complexity
- Create new tables without proven need

---

**END OF GAP & REDUNDANCY ANALYSIS**

*Next: PHASE 2 - Confirm OPS FLOW (nếu có câu trả lời cho Critical Questions)*

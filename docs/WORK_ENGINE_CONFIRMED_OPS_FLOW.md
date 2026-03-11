# WORK ENGINE - CONFIRMED OPS FLOW v2

**Generated**: 2026-01-10  
**Phase**: 2 - OPS Flow Confirmation  
**Status**: ✅ CONFIRMED - Ready for implementation

---

## 🎯 FLOW DEFINITIONS

### Nguyên tắc cốt lõi:
> **Roomrise ưu tiên sửa đúng hơn là làm nhiều.**
> Mọi flow phải backward-compatible và additive.

---

## FLOW 1: DAILY OPS (Quick Task)

### Description:
> Việc nhỏ phát sinh hàng ngày, không thuộc project cụ thể nào.
> Cần tạo nhanh (<10s), xử lý nhanh, không cần phức tạp.

### Current State: ✅ ĐÃ CÓ (Sprint 2)

```
User → Click "Quick Task ⚡" → Mini dialog (5 fields)
                                    ↓
                            Title (required)
                            Assignee (default: self)
                            Due date (default: tomorrow)
                            Classification (EXECUTION/PREP/AUTO/OPS)
                            Issue tag (optional)
                                    ↓
                            Auto-create Ops Bucket for today
                                    ↓
                            Task created → TODO status
                                    ↓
                            [Work on task]
                                    ↓
                            [Upload evidence if EXECUTION]
                                    ↓
                            [Evidence approved by Lead]
                                    ↓
                            Mark DONE
```

### Rules (Already Enforced):
- ✅ Quick Task ALWAYS belongs to Ops Bucket (project_id NOT NULL)
- ✅ EXECUTION → require ≥1 approved evidence to DONE
- ✅ PREP/AUTO/OPS → can DONE without evidence
- ✅ Can promote Quick Task to regular Project

### Confirmed Status: **NO CHANGES NEEDED**

---

## FLOW 2: PROJECT FLOW

### Description:
> Công việc có kế hoạch, thuộc về property cụ thể hoặc initiative dài hạn.
> Cần tracking progress, members, inputs/outputs.

### Current State: ✅ ĐÃ CÓ

```
Lead/Admin → Create Project
                ↓
        Select work_type (ONBOARDING, CONTENT_UPDATE, PROMOTION, etc.)
        Select property (optional based on work_type)
        Set dates (start, due)
                ↓
        Project status = PLANNING
                ↓
Lead → Add Members (assign STAFF/LEAD/ADMIN roles)
                ↓
        Project status → IN_PROGRESS
                ↓
Lead → Create Tasks within Project
                ↓
        [Task Flow - see FLOW 3]
                ↓
        When all tasks DONE (manual check)
                ↓
Lead → Set Project status = COMPLETED
                ↓
        (Optional) Archive project
```

### Rules (Already Enforced):
- ✅ Only Lead/Admin can create/edit projects
- ✅ Staff can only see projects they're members of
- ✅ Project has work_type (required)
- ✅ Project can have inputs (JSONB) and outputs (versioned)
- ✅ Output has review workflow (DRAFT → SUBMITTED → APPROVED/REJECTED)

### Gap Identified (FIX):
- ⚠️ No indicator when all tasks DONE → suggest COMPLETED

### Confirmed Action:
- Add visual indicator "All tasks completed - Ready to close?" in ProjectDetailPage
- **DO NOT** auto-complete (keep manual control)

---

## FLOW 3: TASK FLOW (Within Project)

### Description:
> Unit of work, assigned to a person, has clear lifecycle.

### Current State: ✅ ĐÃ CÓ

```
Lead/Staff → Create Task in Project
                    ↓
            Title, description, assignee, priority, due_date
            Classification (EXECUTION/PREP/AUTO/OPS)
                    ↓
            Task status = TODO
                    ↓
Assignee → Start working
                    ↓
            Task status → IN_PROGRESS
            (started_at auto-set)
                    ↓
            [Do the work]
                    ↓
            [Upload evidence if needed]
                    ↓
Assignee → Request review
                    ↓
            Task status → REVIEW
                    ↓
Lead → Review evidence
            ↓ APPROVED        ↓ REJECTED
            ↓                  Task status → BLOCKED
            ↓                  (with review_notes)
            ↓                  ↓
            ↓                  Assignee fixes → re-upload → back to REVIEW
            ↓
            Evidence review_status = APPROVED
                    ↓
            [DONE Guard check]
            (EXECUTION: need ≥1 approved evidence)
            (PREP/AUTO/OPS: no evidence needed)
                    ↓
Assignee → Mark DONE
                    ↓
            Task status = DONE
            (completed_at auto-set)
```

### Rules (Already Enforced):
- ✅ Staff can only update their own assigned tasks
- ✅ Lead/Admin can update any task in their projects
- ✅ CANCELLED tasks cannot be reopened
- ✅ DONE guard prevents completion without approved evidence (EXECUTION)

### Gap Identified (FIX):
- ⚠️ After evidence approved → no prompt to mark DONE

### Confirmed Action:
- Add toast after approval: "Evidence approved. Mark task as DONE?"
- UI-only change, no backend change

---

## FLOW 4: QUICK TASK FLOW (≤10 seconds)

### Description:
> Shortcut for FLOW 1 when user is already in Tasks page.

### Current State: ✅ ĐÃ CÓ (Sprint 2)

```
User (in TasksPage) → Click dropdown → "Quick Task ⚡"
                            ↓
                    QuickTaskDialog opens
                    (pre-filled: assignee=self, due=tomorrow)
                            ↓
                    Fill Title only → Submit
                            ↓
                    Task created in today's Ops Bucket
                    (< 10 seconds total)
```

### Confirmed Status: **NO CHANGES NEEDED**

---

## FLOW 5: HANDOVER / BÀNG GIAO

### Description:
> Chuyển giao công việc từ người này sang người khác, hoặc từ ca này sang ca khác.

### Current State: ⚠️ KHÔNG CÓ EXPLICIT FLOW

### Analysis:
Hiện tại handover được handle implicitly qua:
1. **Reassign task** - Lead assign task cho người khác
2. **Comments** - Ghi note khi handover
3. **Evidence** - Upload ghi chú/screenshot về trạng thái

### Decision: **DO NOT BUILD EXPLICIT HANDOVER**

**Reasons:**
1. Complexity cao, value chưa rõ
2. Current mechanisms đủ cho basic handover
3. Có thể revisit sau nếu có demand rõ ràng

### Workaround (Documented):
```
Handover Process (Manual):
1. Assignee ghi note cuối ngày vào comment
2. Lead reassign task cho người ca sau
3. Người mới đọc comments + evidence để context
```

---

## FLOW 6: PROMOTE QUICK TASK

### Description:
> Khi Quick Task phát hiện là việc lớn hơn dự kiến, cần chuyển vào Project chính thức.

### Current State: ✅ ĐÃ CÓ (Sprint 2)

```
User → Open Quick Task in side panel
            ↓
    Click menu → "Chuyển vào Project..."
            ↓
    PromoteTaskDialog opens
            ↓
    Select target project (only accessible projects shown)
            ↓
    Confirm promote
            ↓
    Task.project_id = target_project_id
    Task.is_quick_task = false
            ↓
    Evidence + Comments preserved
    Audit log: QUICK_TASK_PROMOTED
```

### Confirmed Status: **NO CHANGES NEEDED**

---

## ✅ DEFINITION OF "DONE"

### For Tasks:
> DONE = Task đã hoàn thành công việc và có đủ evidence (nếu EXECUTION).
> **DONE không bắt buộc bàn giao.**
> Bàn giao là responsibility của Lead (qua reassign nếu cần).

### For Projects:
> COMPLETED = Tất cả tasks đã DONE hoặc CANCELLED.
> Lead manually set status → COMPLETED.
> **COMPLETED không auto-trigger.**

### For Evidence:
> APPROVED = Lead đã xác nhận evidence đúng yêu cầu.
> APPROVED evidence unlock DONE status cho EXECUTION tasks.

---

## ⚠️ WHEN TO PROMOTE vs WHEN TO CLOSE

### Promote Quick Task:
- Khi task phức tạp hơn dự kiến
- Khi cần multiple sub-tasks
- Khi cần tracking trong project timeline

### Close Task (DONE):
- Khi công việc hoàn tất
- Khi có đủ evidence (EXECUTION)
- Không cần chờ approval từ customer/external

### Close Project (COMPLETED):
- Khi tất cả tasks done/cancelled
- Khi mục tiêu project đạt được
- Lead manually confirms

---

## 📋 CONFIRMED FLOWS SUMMARY

| Flow | Status | Changes Needed |
|------|--------|----------------|
| Daily Ops (Quick Task) | ✅ Working | None |
| Project Flow | ✅ Working | Add "ready to close" indicator |
| Task Flow | ✅ Working | Add DONE prompt after evidence approved |
| Quick Task Creation | ✅ Working | None |
| Handover | ⚠️ Implicit | DO NOT BUILD - use comments/reassign |
| Promote Quick Task | ✅ Working | None |

---

## ❌ KHÔNG ĐƯỢC LÀM

| Action | Reason |
|--------|--------|
| Đổi nghĩa DONE | Đang work, không cần thêm handover step |
| Auto-complete project | Giữ control cho Lead |
| Nullable project_id | RLS safety đã enforce |
| Tách module theo phòng ban (chưa) | Chưa có requirements rõ |
| Add HANDOVER status | Quá phức tạp, chưa cần |

---

## ✅ PHASE 2 COMPLETE

**Tất cả flows đã được confirm.**
**Sẵn sàng cho PHASE 3: Design Additive Only.**

---

**END OF OPS FLOW CONFIRMATION**

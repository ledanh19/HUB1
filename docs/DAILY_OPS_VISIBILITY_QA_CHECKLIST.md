# Daily Ops Visibility - QA Checklist

> **Version:** 1.0  
> **Date:** Sprint 3D  
> **Goal:** Lead/Staff mở hệ thống mỗi ngày là biết ngay: Hôm nay cần làm gì, Cái gì đang nghẽn, Project nào sắp close

---

## 📋 Scope

### Features Added/Enhanced

| Feature | Location | Role | Expected Behavior |
|---------|----------|------|-------------------|
| **Overdue Alert Card** | TasksPage header | Lead/Admin | Shows count of tasks past due date |
| **Blocked Alert Card** | TasksPage header | Lead/Admin | Shows count of BLOCKED tasks |
| **Click-to-filter** | Alert cards | Lead/Admin | Clicking card toggles filter |
| **MyTasksPage Buckets** | MyTasksPage | Staff | Already exists: 🔥 Urgent, ⏳ Review, 🚫 Blocked, 🧠 Later |
| **ProjectCompletionStatus** | ProjectDetailPage | Lead/Admin | Shows HANDOVER status and close-readiness |

---

## 🧪 Test Matrix by Role

### A. OTA_STAFF Role

| # | Test Case | Steps | Expected | Pass/Fail |
|---|-----------|-------|----------|-----------|
| S1 | My Tasks page loads | Login as ota_staff → Navigate to /ota-operations/my-tasks | Page loads with 4 bucket cards | ☐ |
| S2 | Urgent bucket shows overdue | Create task with yesterday's due date | Task appears in 🔥 CẦN LÀM NGAY | ☐ |
| S3 | Urgent bucket shows today | Create task due today | Task appears in 🔥 CẦN LÀM NGAY | ☐ |
| S4 | Review bucket works | Move task to REVIEW status | Task appears in ⏳ ĐANG CHỜ REVIEW | ☐ |
| S5 | Blocked bucket works | Move task to BLOCKED status | Task appears in 🚫 BỊ BLOCK | ☐ |
| S6 | Later bucket works | Task with future due date | Task appears in 🧠 CÓ THỂ LÀM SAU | ☐ |
| S7 | Click task opens panel | Click any task | TaskSidePanel opens | ☐ |
| S8 | Staff cannot see alert cards | Navigate to /ota-operations/tasks | Alert cards NOT visible (Lead/Admin only) | ☐ |

---

### B. OTA_LEAD Role

| # | Test Case | Steps | Expected | Pass/Fail |
|---|-----------|-------|----------|-----------|
| L1 | Alert cards visible | Navigate to /ota-operations/tasks | Overdue + Blocked cards visible (if counts > 0) | ☐ |
| L2 | Overdue card shows count | Have 2 overdue tasks in system | Card shows "🔥 Trễ hạn: 2" | ☐ |
| L3 | Blocked card shows count | Have 1 blocked task | Card shows "🚫 Bị chặn: 1" | ☐ |
| L4 | Click overdue card filters | Click overdue card | List shows only overdue tasks + "Đang lọc" badge | ☐ |
| L5 | Click again clears filter | Click overdue card again | Filter removed, all tasks shown | ☐ |
| L6 | Click blocked card filters | Click blocked card | Status filter = BLOCKED + "Đang lọc" badge | ☐ |
| L7 | Both filters exclusive | Click overdue → click blocked | Overdue filter cleared, blocked applied | ☐ |
| L8 | Cards hidden if no issues | No overdue/blocked tasks | Alert card row not rendered | ☐ |
| L9 | ProjectCompletionStatus visible | Open a project detail page | See completion status if all tasks done | ☐ |
| L10 | HANDOVER prompt shows | All tasks DONE, no HANDOVER task | Yellow alert: "Tất cả task đã DONE nhưng chưa có task HANDOVER" | ☐ |
| L11 | Ready to close shows | HANDOVER task exists + DONE | Green alert: "✅ Có task HANDOVER và đã DONE" | ☐ |
| L12 | Can create HANDOVER | Click "Tạo task HANDOVER" button | CreateHandoverDialog opens | ☐ |
| L13 | Can mark project complete | Click "Đánh dấu hoàn thành Project" | Project status changes to COMPLETED | ☐ |

---

### C. ADMIN Role

| # | Test Case | Steps | Expected | Pass/Fail |
|---|-----------|-------|----------|-----------|
| A1 | Same as Lead | Repeat L1-L13 | Same results | ☐ |
| A2 | See all tasks globally | Check task count | Should see ALL tasks across all projects | ☐ |

---

## 🔍 Visual Verification

### Alert Cards UI

| # | Check | Expected | Pass/Fail |
|---|-------|----------|-----------|
| V1 | Overdue card styling | Red border-left, red background (when > 0) | ☐ |
| V2 | Blocked card styling | Orange border-left, orange background (when > 0) | ☐ |
| V3 | Hover effect | shadow-md on hover | ☐ |
| V4 | Active filter state | ring-2 ring-red-300 (overdue) / ring-orange-300 (blocked) | ☐ |
| V5 | "Đang lọc" badge | Shows when filter active | ☐ |
| V6 | "Click để lọc/bỏ lọc" text | Appropriate hint text below count | ☐ |

### ProjectCompletionStatus UI

| # | Check | Expected | Pass/Fail |
|---|-------|----------|-----------|
| V7 | Yellow alert (missing handover) | amber-50 background, AlertTriangle icon | ☐ |
| V8 | Blue alert (handover pending) | blue-50 background, FileCheck icon | ☐ |
| V9 | Green alert (ready to close) | green-50 background, CheckCircle icon | ☐ |
| V10 | No alert (tasks in progress) | Component returns null | ☐ |

---

## 🚀 Regression Checks

| # | Area | Test | Expected | Pass/Fail |
|---|------|------|----------|-----------|
| R1 | TasksPage status filter | Select "Bị chặn" from dropdown | Works independently of alert cards | ☐ |
| R2 | TasksPage search | Search for task name | Filter works with alert filters | ☐ |
| R3 | View toggle | Switch List → Board → Calendar | All views work with filters applied | ☐ |
| R4 | Create task | Click "Tạo Task" button | Dialog opens, task created | ☐ |
| R5 | Task side panel | Click task in any view | Panel opens correctly | ☐ |
| R6 | MyTasksPage buckets | Check all 4 sections | Expand/collapse works | ☐ |

---

## 📊 Edge Cases

| # | Scenario | Expected | Pass/Fail |
|---|----------|----------|-----------|
| E1 | No tasks at all | No alert cards, empty state shown | ☐ |
| E2 | Only overdue tasks | Overdue card visible, blocked hidden | ☐ |
| E3 | Only blocked tasks | Blocked card visible, overdue hidden | ☐ |
| E4 | Task due_date = null | Not counted as overdue | ☐ |
| E5 | Task status = DONE (overdue) | Not counted as overdue | ☐ |
| E6 | Task status = CANCELLED | Not counted as overdue | ☐ |
| E7 | Staff views Tasks page | Alert cards NOT visible (Lead/Admin only) | ☐ |

---

## ✅ Sign-off

| Role | Tester | Date | Status |
|------|--------|------|--------|
| QA Lead | | | ☐ Pending |
| Product Owner | | | ☐ Pending |
| Dev Lead | | | ☐ Pending |

---

## 📝 Notes

- **Alert Cards**: Only visible to Lead/Admin roles (isLeadOrAdmin check)
- **Click-to-Filter**: Mutually exclusive - clicking one clears the other
- **ProjectCompletionStatus**: Only shows when all tasks DONE
- **PendingReviewsPage**: Marked for deletion (Sprint 3A revert), not linked anywhere

---

*Generated: Daily Ops Visibility Sprint*

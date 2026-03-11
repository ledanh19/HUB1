# OTA Operations - Drag & Drop Test Plan

## 🎯 TEST SCOPE

**Module**: OTA Operations - Tasks Board & Calendar  
**Features**: Drag & Drop status changes, Calendar date filtering  
**Test Types**: Functional, RBAC, UI/UX, Performance, Edge Cases  
**Estimated Time**: 2-3 hours  

---

## 👥 TEST USERS SETUP

Create 3 test users with different roles:

| User | Role | Email | Tasks Assigned |
|------|------|-------|----------------|
| User A | `ota_staff` | staff@test.com | Task 1, Task 2 |
| User B | `ota_lead` | lead@test.com | (Can see all) |
| User C | `admin` | admin@test.com | (Can see all) |

**Test Data**: Create 10 tasks across different statuses:
- 3 TODO
- 2 IN_PROGRESS (1 assigned to User A, 1 to someone else)
- 2 REVIEW
- 1 DONE
- 1 BLOCKED
- 1 with due_date = today

---

## 📝 TEST CASES

### A. DRAG & DROP - STAFF USER

**Pre-condition**: Login as User A (ota_staff)

#### TC-001: Drag Own Task TODO → IN_PROGRESS
**Steps**:
1. Go to /ota-operations/tasks
2. Switch to Board view
3. Find task assigned to User A in TODO column
4. Drag to IN_PROGRESS column

**Expected**:
- ✅ Card moves immediately
- ✅ Toast: "Cập nhật thành công"
- ✅ Task stays in IN_PROGRESS after page refresh

**Pass/Fail**: ______

---

#### TC-002: Attempt to Drag Other User's Task
**Steps**:
1. Find task NOT assigned to User A in TODO column
2. Try to drag it

**Expected**:
- ✅ Card shows 🔒 icon
- ✅ Cursor shows "not-allowed"
- ✅ Drag does not start
- ✅ Opacity: 60%

**Pass/Fail**: ______

---

#### TC-003: Drag Task to BLOCKED (Requires Reason)
**Steps**:
1. Drag User A's IN_PROGRESS task to BLOCKED column
2. Modal opens
3. Type "Test reason 12345" (15 chars)
4. Click "Chặn task"

**Expected**:
- ✅ Modal opens with Ban icon
- ✅ Confirm button disabled until 10+ chars
- ✅ After submit: modal closes, task moves to BLOCKED
- ✅ Toast: "Cập nhật thành công"

**Pass/Fail**: ______

---

#### TC-004: Cancel BLOCKED Modal
**Steps**:
1. Drag task to BLOCKED
2. Modal opens
3. Click outside modal or press ESC

**Expected**:
- ✅ Modal closes
- ✅ Task returns to original column (rollback)
- ✅ No toast shown

**Pass/Fail**: ______

---

#### TC-005: Attempt REVIEW → DONE (Denied)
**Steps**:
1. Drag task from REVIEW to DONE

**Expected**:
- ✅ Toast error: "Chỉ Lead/Admin mới có thể chuyển task sang Hoàn thành"
- ✅ Task stays in REVIEW

**Pass/Fail**: ______

---

#### TC-006: Drag BLOCKED → IN_PROGRESS (Unblock)
**Steps**:
1. Drag BLOCKED task to IN_PROGRESS

**Expected**:
- ✅ No modal
- ✅ Task moves immediately
- ✅ Toast: "Cập nhật thành công"

**Pass/Fail**: ______

---

### B. DRAG & DROP - LEAD USER

**Pre-condition**: Login as User B (ota_lead)

#### TC-101: Drag Any Project Task
**Steps**:
1. Switch to Board view
2. Drag any task (not assigned to User B) from TODO to IN_PROGRESS

**Expected**:
- ✅ Task moves (no lock)
- ✅ Toast success

**Pass/Fail**: ______

---

#### TC-102: Approve Task (REVIEW → DONE)
**Steps**:
1. Drag task from REVIEW to DONE

**Expected**:
- ✅ No modal
- ✅ Task moves immediately
- ✅ Toast: "Cập nhật thành công"

**Pass/Fail**: ______

---

#### TC-103: Revert Task (IN_PROGRESS → TODO)
**Steps**:
1. Drag task from IN_PROGRESS to TODO
2. Modal opens with RotateCcw icon
3. Type "Need more info 1234" (20 chars)
4. Click "Hoàn tác"

**Expected**:
- ✅ Confirmation modal opens
- ✅ Yellow warning box shown
- ✅ After submit: task moves to TODO
- ✅ Toast success

**Pass/Fail**: ______

---

#### TC-104: Cancel Task (TODO → CANCELLED)
**Steps**:
1. Drag task from TODO to CANCELLED
   - *Note: CANCELLED column hidden, test by manual status change or use admin*

**Expected**:
- ✅ Modal opens with XCircle icon
- ✅ Reason required (min 10 chars)
- ✅ After submit: task status = CANCELLED

**Pass/Fail**: ______ (Skip if CANCELLED column not visible)

---

### C. DRAG & DROP - ADMIN USER

**Pre-condition**: Login as User C (admin)

#### TC-201: Jump States (TODO → DONE)
**Steps**:
1. Drag task from TODO directly to DONE

**Expected**:
- ✅ Confirmation modal opens
- ✅ Warning text mentions "jump"
- ✅ Reason required
- ✅ After submit: task moves to DONE

**Pass/Fail**: ______

---

#### TC-202: Normal Transition (No Modal)
**Steps**:
1. Drag task TODO → IN_PROGRESS

**Expected**:
- ✅ No modal
- ✅ Immediate move
- ✅ Toast success

**Pass/Fail**: ______

---

### D. DRAG & DROP - ERROR HANDLING

#### TC-301: Network Failure Simulation
**Steps**:
1. Open DevTools → Network tab
2. Enable "Offline" mode
3. Drag task TODO → IN_PROGRESS
4. Wait 2 seconds

**Expected**:
- ✅ Card moves immediately (optimistic)
- ✅ After 2s: card rolls back to TODO
- ✅ Toast error: "Không thể cập nhật"

**Pass/Fail**: ______

---

#### TC-302: RPC Returns Error
**Steps**:
1. Drag task with invalid permission (simulate RLS block)

**Expected**:
- ✅ Optimistic update shows
- ✅ Error caught, rollback occurs
- ✅ Toast error shown

**Pass/Fail**: ______ (Requires backend RLS test)

---

### E. CALENDAR FILTER

**Pre-condition**: Login as any user, create tasks with due dates

#### TC-401: Click Date in Month View
**Steps**:
1. Go to /ota-operations/tasks
2. Switch to Calendar view
3. Ensure default is Month view
4. Click on date with tasks (e.g., January 8)

**Expected**:
- ✅ Date cell highlights (blue border + bg-blue-50)
- ✅ Badge appears: "Filtered: Jan 8, 2026"
- ✅ "Clear filter" button shows
- ✅ Tasks in list below filtered to only Jan 8 due dates

**Pass/Fail**: ______

---

#### TC-402: Toggle Filter (Click Same Date)
**Steps**:
1. With filter active from TC-401
2. Click same date again

**Expected**:
- ✅ Highlight removed
- ✅ Badge disappears
- ✅ "Clear filter" button hides
- ✅ All tasks shown

**Pass/Fail**: ______

---

#### TC-403: Clear Filter Button
**Steps**:
1. Click date to activate filter
2. Click "Clear filter" button

**Expected**:
- ✅ Same as TC-402 (filter clears)

**Pass/Fail**: ______

---

#### TC-404: Switch to Week View with Filter Active
**Steps**:
1. Click date in Month view (filter active)
2. Click "Week" button

**Expected**:
- ✅ View switches to Week
- ✅ Selected date still highlighted (if in current week)
- ✅ Badge still shows
- ✅ Filter persists

**Pass/Fail**: ______

---

#### TC-405: Navigate Month with Filter Active
**Steps**:
1. Click date (e.g., January 8)
2. Click Next Month arrow (→)

**Expected**:
- ✅ Calendar shows February
- ✅ Badge still shows "Filtered: Jan 8, 2026"
- ✅ Tasks still filtered (even though date not visible)
- ✅ "Clear filter" button still present

**Pass/Fail**: ______

---

#### TC-406: Filter with No Matching Tasks
**Steps**:
1. Click date with no tasks due

**Expected**:
- ✅ Date highlights
- ✅ Badge shows
- ✅ Task list below shows "Không có task nào"

**Pass/Fail**: ______

---

### F. UI/UX - VISUAL FEEDBACK

#### TC-501: Drag Overlay Appearance
**Steps**:
1. Start dragging a task card
2. Observe while dragging

**Expected**:
- ✅ Drag overlay follows cursor smoothly
- ✅ Original card opacity = 50%
- ✅ Overlay card has shadow (ring-2 ring-primary)

**Pass/Fail**: ______

---

#### TC-502: Column Hover States
**Steps**:
1. Drag card and hover over different columns

**Expected**:
- ✅ Drop zone highlights (visual feedback)
- ✅ Cursor changes to "grabbing"

**Pass/Fail**: ______

---

#### TC-503: Locked Task Visual
**Steps**:
1. As staff, view task NOT assigned to you

**Expected**:
- ✅ Card shows 🔒 icon (top-right)
- ✅ Card opacity = 60%
- ✅ Cursor = not-allowed
- ✅ Tooltip on hover (optional)

**Pass/Fail**: ______

---

#### TC-504: Priority Badge Colors
**Steps**:
1. View board with tasks of all priorities

**Expected**:
- ✅ URGENT: Red badge
- ✅ HIGH: Orange badge
- ✅ MEDIUM: Blue badge
- ✅ LOW: Gray badge

**Pass/Fail**: ______

---

#### TC-505: Column Header Counts
**Steps**:
1. View board with multiple tasks

**Expected**:
- ✅ Each column shows task count badge
- ✅ Overdue count badge (red) if any overdue tasks
- ✅ Counts update after drag

**Pass/Fail**: ______

---

### G. PERFORMANCE

#### TC-601: Board with 50+ Tasks
**Steps**:
1. Create 50+ tasks (or use existing dataset)
2. View Board
3. Drag multiple tasks

**Expected**:
- ✅ Initial render < 2 seconds
- ✅ Drag smooth (no lag)
- ✅ Drop updates < 500ms
- ✅ No memory leaks (check DevTools)

**Pass/Fail**: ______

---

#### TC-602: Calendar Navigation Speed
**Steps**:
1. View Calendar
2. Rapidly click Next/Previous month 10 times

**Expected**:
- ✅ Each transition < 300ms
- ✅ No flickering
- ✅ Counts update correctly

**Pass/Fail**: ______

---

### H. EDGE CASES

#### TC-701: Drag to Same Column
**Steps**:
1. Drag TODO task to TODO column

**Expected**:
- ✅ No RPC call (check Network tab)
- ✅ No toast
- ✅ Card returns to original position

**Pass/Fail**: ______

---

#### TC-702: Drag DONE Task (Should Fail)
**Steps**:
1. Try to drag task with status DONE

**Expected**:
- ✅ Cannot drag at all (disabled)
- ✅ Cursor = default (not grab)

**Pass/Fail**: ______

---

#### TC-703: Modal with Very Long Reason
**Steps**:
1. Drag to BLOCKED
2. Type 500+ character reason
3. Submit

**Expected**:
- ✅ Textarea scrolls (not overflow)
- ✅ Submit works
- ✅ Full text saved (verify in backend)

**Pass/Fail**: ______

---

#### TC-704: Rapid Drag Multiple Tasks
**Steps**:
1. Quickly drag 5 tasks consecutively (< 2 seconds total)

**Expected**:
- ✅ All updates processed
- ✅ No race conditions
- ✅ Final state matches backend

**Pass/Fail**: ______

---

#### TC-705: Concurrent Drag by Two Users
**Setup**: Open two browser windows (User A + User B)

**Steps**:
1. User A drags Task X TODO → IN_PROGRESS
2. User B drags same Task X TODO → BLOCKED (simultaneously)

**Expected**:
- ✅ One succeeds, one fails (RPC conflict)
- ✅ Failed user sees error toast
- ✅ Both users see correct final state after page refresh

**Pass/Fail**: ______

---

### I. RESPONSIVE DESIGN

#### TC-801: Mobile View (375px)
**Steps**:
1. Resize browser to 375px width
2. View Board

**Expected**:
- ✅ Columns scroll horizontally OR stack vertically
- ✅ Drag still works on touch
- ✅ Cards remain readable

**Pass/Fail**: ______ (Recommend: Use List view on mobile)

---

#### TC-802: Tablet View (768px)
**Steps**:
1. Resize to 768px width
2. View Board

**Expected**:
- ✅ 2-3 columns visible
- ✅ Horizontal scroll for remaining columns
- ✅ Drag & drop works

**Pass/Fail**: ______

---

### J. CROSS-BROWSER

#### TC-901: Chrome (Latest)
**Steps**: Run all critical test cases (TC-001, TC-101, TC-201, TC-401)

**Pass/Fail**: ______

---

#### TC-902: Firefox (Latest)
**Steps**: Run all critical test cases

**Pass/Fail**: ______

---

#### TC-903: Safari (macOS)
**Steps**: Run all critical test cases

**Pass/Fail**: ______

---

#### TC-904: Edge (Latest)
**Steps**: Run all critical test cases

**Pass/Fail**: ______

---

## 📊 TEST SUMMARY

**Total Test Cases**: 40+  
**Execution Time**: ~2-3 hours  

### Results Tracking

| Category | Total | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| Drag & Drop - Staff | 6 | ___ | ___ | ___ |
| Drag & Drop - Lead | 4 | ___ | ___ | ___ |
| Drag & Drop - Admin | 2 | ___ | ___ | ___ |
| Error Handling | 2 | ___ | ___ | ___ |
| Calendar Filter | 6 | ___ | ___ | ___ |
| UI/UX Visual | 5 | ___ | ___ | ___ |
| Performance | 2 | ___ | ___ | ___ |
| Edge Cases | 5 | ___ | ___ | ___ |
| Responsive | 2 | ___ | ___ | ___ |
| Cross-Browser | 4 | ___ | ___ | ___ |
| **TOTAL** | **38** | **___** | **___** | **___** |

---

## 🐛 BUG REPORT TEMPLATE

**Bug ID**: ______  
**Test Case**: TC-___  
**Severity**: Critical / High / Medium / Low  
**Browser**: Chrome / Firefox / Safari / Edge  
**User Role**: Staff / Lead / Admin  

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Result**:

**Actual Result**:

**Screenshots**: (Attach if applicable)

**Console Errors**: (Copy from DevTools)

---

## ✅ SIGN-OFF

**QA Engineer**: ________________  
**Date**: ________________  
**Overall Status**: Pass / Fail / Conditional Pass  

**Approval for Production**: Yes / No  

**Conditions (if any)**:
- 
- 

**Blocker Issues**:
- 
- 

---

**Document Version**: 1.0  
**Last Updated**: January 8, 2026

# OTA Operations - E2E UI Testing Checklist

**Version**: 2.0  
**Last Updated**: 2026-01-08  
**Purpose**: Comprehensive UI acceptance testing for Phase 2 release

---

## 🎯 TESTING STRATEGY

### Roles to Test
- ✅ **OTA Staff** - Limited access, own tasks only
- ✅ **OTA Lead** - Full access, team management
- ✅ **OTA Admin** - Full access + system settings
- ✅ **System Admin** - Superuser access

### Test Data Requirements
- **Projects**: ≥10 projects with varied status (PLANNING, IN_PROGRESS, COMPLETED, etc.)
- **Tasks**: ≥500 tasks (stress test performance)
  - Mix of statuses: TODO (100), IN_PROGRESS (80), REVIEW (30), DONE (250), BLOCKED (20), CANCELLED (20)
  - Mix of priorities: LOW (200), MEDIUM (150), HIGH (100), URGENT (50)
  - Mix of assignments: 60% assigned, 40% unowned
  - Overdue tasks: ≥20 (past due date)
  - Long-blocked tasks: ≥5 (blocked >72h)
- **Evidence**: ≥50 evidence files uploaded across tasks
- **Users**: ≥5 OTA Staff + 2 OTA Lead

### Browsers to Test
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (macOS)
- ✅ Edge (latest)
- ⚠️ Mobile Chrome (viewport 375px) - Basic responsive check

---

## 📋 FUNCTIONAL TESTS

### 1. My Tasks Page (Staff View)

#### 1.1 Action Buckets Display
- [ ] Page loads without errors (check console)
- [ ] 4 buckets visible: 🔥 Urgent | ⏳ Review | 🚫 Blocked | 🧠 Later
- [ ] Task counts correct in bucket headers
- [ ] Buckets are collapsible (click header to collapse/expand)
- [ ] Default state: All buckets expanded
- [ ] Collapsed state persists on page reload (localStorage)

#### 1.2 Bucket Logic Validation
- [ ] **Urgent bucket**: Contains tasks with `priority=URGENT` OR `due_date < today`
- [ ] **Review bucket**: Contains only tasks with `status=REVIEW`
- [ ] **Blocked bucket**: Contains only tasks with `status=BLOCKED`
- [ ] **Later bucket**: Contains tasks not in above categories
- [ ] No task appears in multiple buckets

#### 1.3 Task Card Display
- [ ] Task title visible and truncated if >50 chars
- [ ] Priority badge shows correct color (RED/YELLOW/BLUE/GRAY)
- [ ] Due date displays in readable format ("Jan 10")
- [ ] Overdue badge appears if due date passed
- [ ] Project name visible below title
- [ ] Assignee avatar visible (if assigned)
- [ ] "Unowned" badge if no assignee

#### 1.4 Task Click Behavior
- [ ] Click task card → Quick View drawer opens from right
- [ ] Drawer shows task details (title, status, priority, description)
- [ ] Drawer closes on ESC key
- [ ] Drawer closes on click outside (overlay click)
- [ ] Cmd/Ctrl+Click → Opens /tasks/:id in new tab

---

### 2. Projects List Page

#### 2.1 Stats Cards
- [ ] 6 stats cards displayed: Total, RED Critical, YELLOW Warning, In Progress, Completed, Planning
- [ ] Card counts match actual project counts
- [ ] RED card shows count of projects with critical health
- [ ] YELLOW card shows count of projects with warning health
- [ ] Clicking card filters table (future phase) OR navigates correctly

#### 2.2 Project Table
- [ ] Table displays all projects (pagination if >50 projects)
- [ ] Columns: Name | Property | Status | Progress | Health | Warnings | Due Date | Actions
- [ ] Progress bar reflects task completion percentage
- [ ] Health badge shows correct color (🔴/🟡/🟢)
- [ ] Warnings column shows "X overdue, Y blocked" (if any)
- [ ] Hover warnings → Tooltip with task details

#### 2.3 Health Calculation
- [ ] RED badge if >20% tasks overdue OR any task blocked >72h
- [ ] YELLOW badge if any task overdue OR any task blocked >24h
- [ ] GREEN badge if no overdue and no long-blocked tasks
- [ ] Health updates when task status/due date changes

#### 2.4 Navigation
- [ ] Click project row → Navigate to /projects/:id
- [ ] Click actions menu (⋮) → Show Edit/Archive/Delete options
- [ ] "Create Project" button opens CreateProjectDialog modal

---

### 3. Project Detail Page

#### 3.1 Tabs Structure
- [ ] 4 tabs visible: Overview | Tasks | Members | Activity
- [ ] Default tab: Overview
- [ ] Tab selection persists on page reload (URL param: `?tab=tasks`)
- [ ] Tab change does not reload page (client-side routing)

#### 3.2 Overview Tab
- [ ] Project name + property name displayed
- [ ] Large health badge (🔴/🟡/🟢 with icon + text)
- [ ] Progress bar with breakdown (TODO/IN_PROGRESS/REVIEW/DONE/BLOCKED counts)
- [ ] Key stats cards: Total tasks, Overdue, Blocked >48h, Completed
- [ ] Timeline: Created date, Start date, Due date, Completion date (if done)
- [ ] Description (full text, Markdown support if available)
- [ ] Edit button (if Lead/Admin permission)

#### 3.3 Tasks Tab
- [ ] Embedded task list (same as TasksPage)
- [ ] Toggle buttons: [List] [Board] (Calendar not embedded)
- [ ] List view shows tasks with columns: Title | Assignee | Status | Priority | Due Date
- [ ] Board view shows 5 columns (TODO/IN_PROGRESS/REVIEW/DONE/BLOCKED)
- [ ] Click task → Quick View drawer opens
- [ ] "Create Task" button opens CreateTaskDialog with project pre-selected
- [ ] Filter by status/priority works (if implemented)

#### 3.4 Members Tab
- [ ] Member cards displayed (3-column grid)
- [ ] Each card shows: Avatar, Name, Role, Task count, Overdue count, Blocked count, Capacity badge
- [ ] Capacity badge color: 🟢 Low (<3 tasks) | 🟡 Medium (3-7) | 🔴 High (>7)
- [ ] "Add Member" button (if Lead/Admin)
- [ ] Click member card → Show popover with task list (hover interaction)
- [ ] Remove member button (if Lead/Admin)

#### 3.5 Activity Tab (Future Phase - Placeholder OK)
- [ ] Shows "Coming soon" message OR basic activity log
- [ ] If activity log: Displays recent task changes (status, assignee, evidence)
- [ ] Chronological order (newest first)

---

### 4. Tasks Page (Multi-View)

#### 4.1 View Toggle
- [ ] 3 view buttons: [List] [Board] [Calendar]
- [ ] Default view: List
- [ ] View selection persists on page reload (localStorage)
- [ ] View change is instant (no loading spinner)

#### 4.2 List View
- [ ] Table displays all tasks (if Lead/Admin) OR assigned tasks (if Staff)
- [ ] Columns: Task | Project | Assignee | Status | Priority | Due Date | Actions
- [ ] Row height: 32px (compact density)
- [ ] Hover row → Highlight with shadow
- [ ] Click row → Quick View drawer opens
- [ ] Cmd/Ctrl+Click row → Open /tasks/:id in new tab
- [ ] Actions menu (⋮) → Edit/Change Status/Delete

#### 4.3 Board View
- [ ] 5 columns: TODO | IN_PROGRESS | REVIEW | DONE | BLOCKED
- [ ] Column headers show count: "TODO (12)"
- [ ] Task cards display: Title, Priority badge, Assignee avatar, Due date
- [ ] Overdue badge (red) if past due date
- [ ] Blocked >48h warning icon (⚠️) if applicable
- [ ] Click card → Quick View drawer opens
- [ ] Drag & drop disabled (Phase 2 - no backend support yet)

#### 4.4 Calendar View (NEW)
- [ ] Monthly calendar displays (default)
- [ ] Current month highlighted
- [ ] Previous/Next month buttons work
- [ ] Each task due date shows colored dot: 🔴 Urgent | 🟡 High | 🔵 Medium | ⚪ Low
- [ ] Hover date → Tooltip shows task titles (max 5) + "X more"
- [ ] Click date → Show all tasks for that day in drawer (or modal)
- [ ] Toggle to Weekly view works
- [ ] Weekly view shows 7 columns (Mon-Sun) with task cards

#### 4.5 Filters (if implemented)
- [ ] Status filter dropdown: All | TODO | IN_PROGRESS | REVIEW | DONE | BLOCKED
- [ ] Priority filter dropdown: All | LOW | MEDIUM | HIGH | URGENT
- [ ] Assignee filter dropdown: All | Unowned | Specific users
- [ ] Search box filters by task title (live search)
- [ ] Filters apply to current view (List/Board/Calendar)
- [ ] Clear filters button resets all

---

### 5. Task Detail Page

#### 5.1 Header & Navigation
- [ ] "← Back to Tasks" button navigates to previous page
- [ ] Task title displayed (editable if assignee or Lead)
- [ ] Status dropdown (with modal if BLOCKED/CANCELLED)
- [ ] Priority dropdown

#### 5.2 Timeline Component (NEW)
- [ ] Horizontal timeline visible
- [ ] Nodes: Created → In Progress → Review → Done
- [ ] Current status node highlighted
- [ ] If BLOCKED: Red node with warning icon
- [ ] If CANCELLED: Gray strikethrough
- [ ] Timestamps shown on hover

#### 5.3 Description Section
- [ ] Full description displayed (Markdown rendered if supported)
- [ ] Edit button (if assignee or Lead)
- [ ] Edit mode: Textarea with Markdown toolbar (if available)
- [ ] Save/Cancel buttons in edit mode

#### 5.4 Evidence Section
- [ ] Evidence files displayed in grid (3 columns)
- [ ] Each card: Thumbnail (if image), Filename, File size, Upload date
- [ ] Review status badge: Pending | Approved | Rejected
- [ ] If rejected: Show review notes
- [ ] Click evidence → Open full view modal
- [ ] "Upload Evidence" button (if assignee or Lead)
- [ ] Upload modal: Drag & drop OR file picker
- [ ] Upload progress indicator

#### 5.5 Comments Panel
- [ ] Comments displayed chronologically (newest first OR oldest first - be consistent)
- [ ] Each comment: Avatar, Name, Timestamp, Comment text
- [ ] Rich text editor (Markdown support)
- [ ] "Add comment" button → Expand textarea
- [ ] Submit button disabled if comment empty
- [ ] New comment appears immediately after submit (optimistic update)

#### 5.6 Details Sidebar
- [ ] Project name (clickable link to /projects/:id)
- [ ] Assignee name + avatar (with workload popover on hover)
- [ ] Created date
- [ ] Due date (with days left countdown)
- [ ] Estimated hours (if set)
- [ ] Actual hours (if set)
- [ ] Tags (if set)

---

### 6. Quick View Drawer (NEW Component)

#### 6.1 Trigger & Display
- [ ] Opens on task click from any view (My Tasks, Tasks List, Tasks Board, Project Tasks)
- [ ] Slides in from right (400px width)
- [ ] Semi-transparent overlay (20% black) appears behind
- [ ] Animation: Slide-in 180ms ease-out
- [ ] No layout shift (overlay position: fixed)

#### 6.2 Content
- [ ] Task title (editable if permission)
- [ ] Status dropdown (with modal if BLOCKED/CANCELLED)
- [ ] Priority dropdown
- [ ] Assignee select (with workload hints)
- [ ] Description (1st paragraph, max 150 chars, "..." if truncated)
- [ ] Evidence thumbnails (max 3, "+ N more" badge)
- [ ] Recent comments (max 3, "+ N more" badge)
- [ ] "View Full Details" button (prominent)

#### 6.3 Interactions
- [ ] Click outside drawer → Close drawer
- [ ] ESC key → Close drawer
- [ ] Click "View Full Details" → Navigate to /tasks/:id + close drawer
- [ ] Edit fields (status, priority, assignee) → Auto-save on change
- [ ] Optimistic updates: UI changes immediately, revert on error
- [ ] Drawer close animation: Slide-out 180ms ease-in

---

### 7. Assignee Selection with Workload

#### 7.1 Dropdown Display
- [ ] Assignee dropdown shows all OTA users (Staff + Lead + Admin)
- [ ] Each item displays: Avatar, Name, Task count, Overdue count, Capacity badge
- [ ] Capacity badge: 🟢 Low (<3) | 🟡 Medium (3-7) | 🔴 High (>7)
- [ ] Users sorted by capacity (Low → Medium → High)
- [ ] Current assignee pre-selected
- [ ] "Unassign" option at top (clears assignee)

#### 7.2 Workload Calculation
- [ ] Workload counts only active tasks: TODO, IN_PROGRESS, REVIEW
- [ ] Overdue count shows tasks past due date (not DONE)
- [ ] Capacity updates in real-time when tasks change
- [ ] Dropdown refreshes on open (not cached stale data)

#### 7.3 Hover Popover
- [ ] Hover assignee name anywhere → Show popover
- [ ] Popover displays: Avatar, Name, Task list (max 5 titles), "View all →" link
- [ ] Popover positioned intelligently (not off-screen)
- [ ] Popover disappears on mouse leave (delay 200ms)
- [ ] Click "View all →" → Navigate to /tasks?assignee=userId

---

### 8. Status Change Modal (Blocked/Cancelled)

#### 8.1 Trigger
- [ ] Appears when status changed to BLOCKED or CANCELLED
- [ ] Does NOT appear for TODO, IN_PROGRESS, REVIEW, DONE

#### 8.2 Modal Content
- [ ] Title: "Change Task Status to BLOCKED" (or CANCELLED)
- [ ] Reason field (textarea, required)
- [ ] Minimum 10 characters validation
- [ ] Cancel button → Close modal, revert status dropdown
- [ ] Confirm button → Save status + create comment with reason

#### 8.3 Behavior
- [ ] Reason saved in task notes OR comment (verify backend)
- [ ] Comment created: "Status changed to BLOCKED. Reason: [reason text]"
- [ ] Task status updated
- [ ] Optimistic update: UI changes immediately
- [ ] On error: Show error toast, revert status

---

## 🎨 UI/UX VALIDATION

### Design Consistency

#### 9.1 Typography
- [ ] Font family consistent (Inter, system-ui, or similar)
- [ ] Font sizes: 14px (labels), 16px (body), 18px (headings), 20px (titles)
- [ ] Line height: 1.5 for body text
- [ ] No font size <12px (accessibility)

#### 9.2 Spacing
- [ ] Consistent spacing: 4px, 8px, 16px, 24px, 32px (no arbitrary values)
- [ ] Card padding: 16px minimum
- [ ] Section gaps: 24px
- [ ] Page margins: 32px (desktop), 16px (mobile)

#### 9.3 Colors
- [ ] Health colors: Red (#EF4444), Yellow (#F59E0B), Green (#10B981)
- [ ] No heavy gradients (solid colors preferred)
- [ ] Text contrast ratio ≥4.5:1 (WCAG AA)
- [ ] Disabled states have reduced opacity (60%)

#### 9.4 Animations (Subtle Only)
- [ ] Drawer slide: 180ms ease-out
- [ ] Hover effects: 120ms transition
- [ ] No scale effects (hover:scale-105 forbidden)
- [ ] No pulse animations
- [ ] No staggered delays
- [ ] No blur effects

#### 9.5 "No AI-Look" Compliance
- [ ] ❌ No fancy gradients (bg-gradient-to-br)
- [ ] ❌ No glass morphism (backdrop-blur)
- [ ] ❌ No floating elements with excessive shadows
- [ ] ❌ No animated backgrounds
- [ ] ✅ Clean, flat design with subtle shadows
- [ ] ✅ Clear visual hierarchy
- [ ] ✅ Scannable layouts (not busy)

---

## ⚡ PERFORMANCE TESTS

### 10.1 Load Testing
- [ ] Load 500 tasks → Page renders in <2 seconds
- [ ] Scroll 500-task list → No lag, 60fps
- [ ] Switch views (List/Board/Calendar) → <500ms
- [ ] Open Quick View drawer → <200ms
- [ ] Filter 500 tasks → <300ms response

### 10.2 Optimization Checks
- [ ] React Query caching enabled (verify in DevTools)
- [ ] Infinite scroll OR pagination for large lists (if >100 items)
- [ ] Virtual scrolling for task lists (if >200 items)
- [ ] Debounced search input (300ms delay)
- [ ] Memoized calculations (calculateTaskBuckets, calculateProjectHealth)
- [ ] No console warnings about re-renders
- [ ] Network requests: <10 queries on page load

### 10.3 Bundle Size
- [ ] Lighthouse Performance score ≥90
- [ ] First Contentful Paint (FCP) <1.5s
- [ ] Largest Contentful Paint (LCP) <2.5s
- [ ] Time to Interactive (TTI) <3.5s
- [ ] No unused dependencies (analyze bundle with `vite-bundle-visualizer`)

---

## 🔐 SECURITY & PERMISSIONS

### 11.1 Role-Based Access

#### OTA Staff (Limited Access)
- [ ] My Tasks: ✅ Shows only assigned tasks
- [ ] All Tasks: ❌ Redirects to My Tasks OR filtered to own tasks
- [ ] Projects: ⚠️ Shows only projects with assigned tasks
- [ ] KPI: ❌ Access denied (redirect to My Tasks)
- [ ] Create Task: ❌ Button hidden
- [ ] Assign Task: ❌ Dropdown disabled (assigned by Lead)
- [ ] Review Evidence: ❌ Button hidden

#### OTA Lead (Full Access)
- [ ] My Tasks: ✅ Shows assigned tasks
- [ ] All Tasks: ✅ Shows all tasks
- [ ] Projects: ✅ Shows all projects
- [ ] KPI: ✅ Full access
- [ ] Create Task: ✅ Button visible
- [ ] Assign Task: ✅ Dropdown enabled
- [ ] Review Evidence: ✅ Button visible
- [ ] Delete Task: ✅ Allowed (soft delete)

#### OTA Admin (Full Access + Settings)
- [ ] All OTA Lead permissions
- [ ] Project settings: ✅ Can archive projects
- [ ] User management: ✅ Can add/remove members (if implemented)

### 11.2 Data Visibility
- [ ] Staff cannot see other staff's private tasks (via URL manipulation)
- [ ] Staff cannot access /tasks/:id if not assignee (redirect or 403)
- [ ] KPI page checks permission before rendering (PermissionGate)
- [ ] API requests respect RLS policies (verify in Network tab)
- [ ] No sensitive data leaked in error messages

### 11.3 Action Validation
- [ ] Create Task: Requires project_id (cannot be null)
- [ ] Assign Task: Only Lead/Admin can assign
- [ ] Change Status to BLOCKED/CANCELLED: Requires reason
- [ ] Delete Task: Soft delete only (status=CANCELLED, not DB delete)
- [ ] Upload Evidence: Only assignee + Lead can upload
- [ ] Review Evidence: Only Lead/Admin can approve/reject

---

## 📱 RESPONSIVE DESIGN (Basic Check)

### 12.1 Mobile Viewport (375px)
- [ ] Sidebar collapses to hamburger menu
- [ ] My Tasks: 1-column layout (buckets stacked vertically)
- [ ] Projects: Table switches to card layout
- [ ] Tasks: List view works, Board view scrollable horizontally
- [ ] Calendar: Month view works, weekly view preferred
- [ ] Quick View drawer: Full-width (not 400px)
- [ ] Buttons touchable (44px minimum height)

### 12.2 Tablet Viewport (768px)
- [ ] 2-column layouts switch to appropriate grid
- [ ] Sidebar visible (not hamburger)
- [ ] Drawer remains 400px width

---

## 🧪 EDGE CASES

### 13.1 Empty States
- [ ] No tasks in bucket → "No urgent tasks" message
- [ ] No projects → "Create your first project" CTA
- [ ] No evidence → "Upload evidence to get started"
- [ ] No comments → "Be the first to comment"
- [ ] Search no results → "No tasks match your filters"

### 13.2 Error States
- [ ] Network error → Show retry button
- [ ] 403 Permission denied → Redirect to My Tasks with error toast
- [ ] 404 Task not found → Show "Task not found" page
- [ ] Upload failed → Show error message, allow retry
- [ ] Form validation errors → Inline error messages (red text below field)

### 13.3 Loading States
- [ ] Page load → Skeleton loaders (not spinners)
- [ ] Drawer opening → Immediate content display (cached data)
- [ ] Filter change → Loading indicator on table
- [ ] Upload → Progress bar (percentage)

### 13.4 Data Edge Cases
- [ ] Task with no due date → Show "No due date" badge
- [ ] Task with no assignee → Show "Unowned" badge
- [ ] Project with 0 tasks → Progress bar at 0%, health GREEN
- [ ] Task title >100 chars → Truncated with "..." (tooltip on hover)
- [ ] Description >500 chars in drawer → Truncated to 150 chars + "Read more"
- [ ] 20+ evidence files → Paginated OR "Load more" button

---

## ✅ ACCEPTANCE CRITERIA

### Must Pass (Blockers)
- [ ] 0 compile errors
- [ ] 0 console errors on page load
- [ ] All 4 views work (My Tasks, Projects, Tasks List/Board/Calendar, Task Detail)
- [ ] Quick View drawer works from all entry points
- [ ] Assignee workload hints visible
- [ ] Project health calculation correct
- [ ] Permissions enforced (Staff vs Lead)
- [ ] No AI-look violations (gradients, pulse, scale)
- [ ] Performance: 500 tasks load <2s, 60fps scroll

### Should Pass (High Priority)
- [ ] Timeline component in Task Detail
- [ ] Evidence review workflow works
- [ ] Calendar view displays tasks by due date
- [ ] Workload popover on assignee hover
- [ ] Status change modal for BLOCKED/CANCELLED
- [ ] Mobile responsive (basic)

### Nice to Have (Can defer)
- [ ] Activity tab in Project Detail (Phase 3)
- [ ] Drag & drop in Board view (Phase 3)
- [ ] Advanced filters (tags, date range)
- [ ] Bulk actions (multi-select tasks)

---

## 📊 TEST TRACKING

### Test Execution Log

| Test ID | Test Name | Status | Tester | Date | Notes |
|---------|-----------|--------|--------|------|-------|
| 1.1 | Action Buckets Display | ⏳ Pending | - | - | - |
| 1.2 | Bucket Logic Validation | ⏳ Pending | - | - | - |
| 2.1 | Stats Cards | ⏳ Pending | - | - | - |
| 2.2 | Project Table | ⏳ Pending | - | - | - |
| ... | ... | ... | ... | ... | ... |

**Status Legend**:
- ⏳ Pending
- ✅ Passed
- ❌ Failed
- ⚠️ Blocked

---

## 📝 BUG REPORT TEMPLATE

```markdown
### Bug ID: OTA-XXX
**Title**: [Brief description]
**Severity**: Critical | High | Medium | Low
**Test ID**: [e.g., 6.3]
**Browser**: Chrome 120.0

**Steps to Reproduce**:
1. Navigate to /ota-operations/my-tasks
2. Click task card "Fix OTA sync"
3. Observe drawer behavior

**Expected**: Drawer opens from right
**Actual**: Drawer opens from left (incorrect)

**Screenshot**: [Attach if applicable]
**Console Errors**: [Copy error messages]

**Workaround**: None
**Assignee**: [Dev name]
**Fixed in**: [Commit hash or PR number]
```

---

## 🚀 SIGN-OFF

### Phase 2 Release Checklist

- [ ] All "Must Pass" tests passed
- [ ] All "Should Pass" tests passed (≥90%)
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Accessibility audit (basic WCAG AA)
- [ ] Cross-browser testing completed
- [ ] Documentation updated (this checklist + architecture docs)
- [ ] Code reviewed by ≥2 engineers
- [ ] Deployed to staging environment
- [ ] Stakeholder demo completed
- [ ] Sign-off by Product Owner: ________________
- [ ] Sign-off by Engineering Lead: ________________

---

**END OF E2E UI CHECKLIST**

*Use this document to validate Phase 2 OTA Operations UI before production deployment.*

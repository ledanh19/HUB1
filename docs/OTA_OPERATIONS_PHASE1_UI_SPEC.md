# OTA OPERATIONS PHASE 1 – UI ONLY SPECIFICATION

**Version:** 1.0  
**Date:** 2026-01-08  
**Scope:** UI/UX improvements only – NO backend changes  
**Goal:** Transform OTA Ops from task list → Risk Control System

---

## 🎯 SUCCESS CRITERIA (30-SECOND TEST)

After implementation, any user (Staff/Lead/Admin) must answer within 30 seconds:

| Role | Question | Expected Answer Location |
|------|----------|-------------------------|
| **Staff** | Hôm nay tôi phải làm gì? | My Tasks → 🔥 CẦN LÀM NGAY bucket |
| **Lead** | Project nào đang nghẽn? | Projects → RED badge projects at top |
| **Lead** | Task nào block cả team? | Board View → BLOCKED column with count |
| **Admin** | Có rủi ro trễ KPI không? | Projects → RED/YELLOW count + KPI Dashboard |

---

## 📋 COMPONENT CHANGES

### 1. **My Tasks Page** (NEW)

**Path:** `/ota-operations/my-tasks`  
**Component:** `src/pages/ota-operations/MyTasksPage.tsx` (NEW)

#### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ My Tasks - Công việc của tôi                        │
├─────────────────────────────────────────────────────┤
│ [Stats Row]                                         │
│  🔥 CẦN LÀM NGAY (5)  ⏳ CHỜ REVIEW (2)  🚫 BLOCK (1) │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 🔥 CẦN LÀM NGAY                                      │
│ ┌─────────────────────────────────────────────┐     │
│ │ [HIGH] Setup Agoda mapping              🔴  │     │
│ │ Project: Agoda Integration | Due: Hôm nay    │     │
│ ├─────────────────────────────────────────────┤     │
│ │ [URGENT] Fix Booking.com sync error    🔴🔴 │     │
│ │ Project: Booking.com | Overdue 2 days       │     │
│ └─────────────────────────────────────────────┘     │
│                                                     │
│ ⏳ ĐANG CHỜ REVIEW                                   │
│ ┌─────────────────────────────────────────────┐     │
│ │ [MEDIUM] Test payout reconciliation     🟡  │     │
│ │ Project: Finance Ops | In Review             │     │
│ └─────────────────────────────────────────────┘     │
│                                                     │
│ 🚫 BỊ BLOCK                                          │
│ ┌─────────────────────────────────────────────┐     │
│ │ [HIGH] Complete evidence upload         🔴  │     │
│ │ BLOCKED: Chờ API key từ IT team             │     │
│ │ Blocked for: 1 day                          │     │
│ └─────────────────────────────────────────────┘     │
│                                                     │
│ 🧠 CÓ THỂ LÀM SAU (3)                                │
│ (collapsed by default)                              │
└─────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

**AC1.1 - Action Buckets (CLIENT-SIDE LOGIC)**

| Bucket | Logic (JS Filter) | Sort Order |
|--------|-------------------|------------|
| 🔥 CẦN LÀM NGAY | `(task.due_date <= today OR overdue) AND status NOT IN ['DONE', 'CANCELLED']` | Priority DESC, Due Date ASC |
| ⏳ ĐANG CHỜ REVIEW | `status = 'REVIEW'` | Created At DESC |
| 🚫 BỊ BLOCK | `status = 'BLOCKED'` | Blocked Duration DESC |
| 🧠 CÓ THỂ LÀM SAU | `due_date > today AND status = 'TODO'` | Due Date ASC |

**AC1.2 - Visual Hierarchy**

- 🔥 CẦN LÀM NGAY: Always expanded, red alert styling
- Each task card shows:
  - Priority badge with color
  - Due date proximity (Overdue X days / Today / Tomorrow)
  - Project name
  - Task title
- Overdue tasks have 🔴 indicator
- Tasks due today have 🟡 indicator

**AC1.3 - Stats Row**

```tsx
const stats = {
  urgent: tasks.filter(t => isUrgent(t)).length,
  review: tasks.filter(t => t.status === 'REVIEW').length,
  blocked: tasks.filter(t => t.status === 'BLOCKED').length,
  later: tasks.filter(t => isLater(t)).length,
}
```

**AC1.4 - Permission**

- Staff: See only their own tasks (`useMyOtaTasks()`)
- Lead/Admin: Redirect to Board View (they use different interface)

---

### 2. **Board View** (ENHANCE EXISTING)

**Path:** `/ota-operations/tasks?view=board` (new param)  
**Component:** `src/components/ota-operations/TaskBoardView.tsx` (NEW)  
**Page:** Enhance `TasksPage.tsx` to support view toggle

#### UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [List View] [Board View] ← Toggle                                       │
├────────────┬────────────┬────────────┬────────────┬──────────┬─────────┤
│ TODO (8)   │ IN PROGRESS│ REVIEW (3) │ DONE (12)  │ BLOCKED  │ CANCEL  │
│            │    (5)     │ ⚠️ 2 overdue│            │   (2)    │   (1)   │
├────────────┼────────────┼────────────┼────────────┼──────────┼─────────┤
│            │            │            │            │          │         │
│ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │┌────────┐│         │
│ │[HIGH]  │ │ │[URGENT]│ │ │[MEDIUM]│ │ │[LOW]   ││[HIGH]  ││         │
│ │Setup   │ │ │Fix bug │ │ │Test API│ │ │Deploy  ││Blocked ││         │
│ │mapping │ │ │🔴Today │ │ │🟡Today │ │ │✓       ││🔴2 days││         │
│ │        │ │ │👤 Nam  │ │ │👤 Linh │ │ │        ││👤 Hoa  ││         │
│ │Project:│ │ │        │ │ │        │ │ │        ││        ││         │
│ │Agoda   │ │ │        │ │ │        │ │ │        ││Reason: ││         │
│ └────────┘ │ └────────┘ │ └────────┘ │ └────────┘ │API key ││         │
│            │            │            │            │└────────┘│         │
│            │            │            │            │          │         │
└────────────┴────────────┴────────────┴────────────┴──────────┴─────────┘
```

#### Acceptance Criteria

**AC2.1 - Column Headers**

Each column shows:
- Status name
- Task count in that status
- ⚠️ Overdue count (if > 0)
- Visual indicator if column is "hot" (many overdue or blocked)

**AC2.2 - Task Cards**

Each card displays:
- Priority badge (color-coded)
- Task title (truncated)
- Due date proximity:
  - 🔴 Overdue X days
  - 🟡 Due today
  - 📅 Due in X days
- Assignee avatar + name (if has assignee)
- Project name (small text)
- For BLOCKED: Show reason snippet

**AC2.3 - Visual Alerts**

```tsx
// Overdue in REVIEW column → Yellow border
// Blocked > 48h → Red border + pulse animation
// High priority → Bold title
// Urgent priority → Red accent bar on left
```

**AC2.4 - Filter Integration**

- Board view respects project filter from URL param
- Staff see only their assigned tasks
- Lead/Admin see all tasks in project

---

### 3. **Project List Health** (ENHANCE EXISTING)

**Path:** `/ota-operations/projects`  
**Component:** Enhance `ProjectsPage.tsx`

#### Health Calculation (CLIENT-SIDE)

```tsx
function calculateProjectHealth(project: OtaProject, tasks: OtaTask[]): {
  health: 'RED' | 'YELLOW' | 'GREEN';
  overdueCount: number;
  blockedCount: number;
  blockedDuration: number; // max hours
} {
  const projectTasks = tasks.filter(t => t.project_id === project.id);
  const now = new Date();
  
  const overdueTasks = projectTasks.filter(t => 
    t.due_date && new Date(t.due_date) < now && t.status !== 'DONE'
  );
  
  const blockedTasks = projectTasks.filter(t => t.status === 'BLOCKED');
  
  const maxBlockedDuration = Math.max(
    ...blockedTasks.map(t => {
      const statusChanged = t.updated_at; // or dedicated blocked_at field
      return (now.getTime() - new Date(statusChanged).getTime()) / (1000 * 60 * 60);
    }),
    0
  );
  
  const overduePercent = overdueTasks.length / projectTasks.length;
  
  let health: 'RED' | 'YELLOW' | 'GREEN' = 'GREEN';
  
  if (overduePercent > 0.2 || maxBlockedDuration > 48) {
    health = 'RED';
  } else if (overduePercent > 0 && overduePercent <= 0.2) {
    health = 'YELLOW';
  }
  
  return {
    health,
    overdueCount: overdueTasks.length,
    blockedCount: blockedTasks.length,
    blockedDuration: maxBlockedDuration,
  };
}
```

#### UI Changes

**Before:**
```
┌────────────────────────────────────────────────┐
│ Agoda Integration | PLANNING | 📅 01/02/2026  │
└────────────────────────────────────────────────┘
```

**After:**
```
┌────────────────────────────────────────────────┐
│ 🔴 CẦN CAN THIỆP                                │
│ Agoda Integration | IN_PROGRESS                │
│ ⚠️ 3 overdue | 🚫 1 blocked (2 days)            │
│ Progress: 60% (6/10 tasks done)                │
└────────────────────────────────────────────────┘
```

#### Acceptance Criteria

**AC3.1 - Health Badge**

| Health | Badge | Condition |
|--------|-------|-----------|
| 🔴 RED | "CẦN CAN THIỆP" | >20% overdue OR any blocked >48h |
| 🟡 YELLOW | "CHÚ Ý" | 1-20% overdue |
| 🟢 GREEN | No badge | No overdue, no long-term blocked |

**AC3.2 - Project Sorting**

```tsx
// Sort order:
// 1. RED projects (by overdue count DESC)
// 2. YELLOW projects (by overdue count DESC)
// 3. GREEN projects (by name ASC)
```

**AC3.3 - Project Card Display**

Each project card shows:
- Health badge (if RED or YELLOW)
- Project name + status
- Progress: `X% (completed/total tasks)`
- ⚠️ Overdue count (if > 0)
- 🚫 Blocked count + max duration (if > 0)

**AC3.4 - Quick Actions**

- RED projects: Button "Xem chi tiết" highlighted
- Click → go to Project Detail with Tasks tab open

---

### 4. **Task Detail Page** (NEW)

**Path:** `/ota-operations/tasks/:taskId`  
**Component:** `src/pages/ota-operations/TaskDetailPage.tsx` (NEW)

#### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ ← Back to Tasks                                      │
├─────────────────────────────────────────────────────┤
│ [HIGH] Setup Agoda mapping rules                    │
│ Status: BLOCKED | Assignee: 👤 Nguyễn Văn A         │
│ Project: Agoda Integration | Due: 05/01/2026 🔴     │
├─────────────────────────────────────────────────────┤
│ [TIMELINE]                                          │
│                                                     │
│ ✓ Created        03/01 10:00  (Trần Thị B)         │
│ ✓ In Progress    03/01 14:30  (Nguyễn Văn A)       │
│ ✓ Review         04/01 09:15  (Nguyễn Văn A)       │
│ ❌ BLOCKED       04/01 16:00  (Lead Phạm C)         │
│   Lý do: Chờ API key từ IT team                    │
│   Blocked for: 1 day 8 hours                       │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [DESCRIPTION]                                       │
│ Cần setup mapping rules cho Agoda channel...       │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [EVIDENCE] (2)                                      │
│ ┌─────────────────────────────────────────────┐    │
│ │ 📄 agoda_config.json                         │    │
│ │ Status: ✅ APPROVED                          │    │
│ │ Reviewed by: Lead Phạm C on 04/01 09:30     │    │
│ └─────────────────────────────────────────────┘    │
│ ┌─────────────────────────────────────────────┐    │
│ │ 📷 screenshot_mapping.png                    │    │
│ │ Status: ⏳ PENDING                           │    │
│ │ Uploaded: 04/01 15:45                       │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ [+ Upload Evidence] (if assigned to me)             │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [COMMENTS] (Coming in Phase D - migration 017)     │
└─────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

**AC4.1 - Header Section**

- Task title with priority badge
- Current status (large, color-coded)
- Assignee with avatar
- Project name (clickable → project detail)
- Due date with proximity indicator

**AC4.2 - Timeline Section**

Display all status transitions:
- Icon (✓ for completed, ❌ for blocked/rejected, ⏳ for pending)
- Status name
- Timestamp
- Actor (who changed it)
- For BLOCKED/REJECTED: Show reason prominently
- For BLOCKED: Show duration in hours/days

**AC4.3 - Evidence Section**

- List all evidence with:
  - File name (clickable to download)
  - Review status badge
  - Reviewer name + timestamp (if reviewed)
- Upload button only visible if:
  - User is assignee OR
  - User is Lead/Admin of project
- Use existing `ota_submit_evidence` RPC

**AC4.4 - Permission-based Actions**

| Role | Can Do |
|------|--------|
| Assignee | Upload evidence, update status (if allowed by workflow) |
| Lead | Review evidence, change assignee, update status |
| Admin | Full control |
| Others | Read-only |

---

### 5. **Sidebar Navigation Update**

**File:** `src/components/layout/Sidebar.tsx` (or navigation config)

#### New Structure

```
OTA Operations
├─ My Tasks        ← NEW, default for Staff
├─ Projects
├─ All Tasks       ← Renamed from "Tasks", Lead/Admin only
└─ KPI
```

#### Conditional Routing Logic

```tsx
// In Sidebar or navigation config
const otaOpsSubMenu = [
  {
    path: '/ota-operations/my-tasks',
    label: 'My Tasks',
    icon: CheckCircle2,
    roles: ['ota_staff', 'ota_lead', 'admin'], // All can access
    isDefault: true, // Default landing for ota_staff
  },
  {
    path: '/ota-operations/projects',
    label: 'Projects',
    icon: FolderKanban,
    roles: ['ota_staff', 'ota_lead', 'admin'],
  },
  {
    path: '/ota-operations/tasks',
    label: 'All Tasks',
    icon: ListChecks,
    roles: ['ota_lead', 'admin'], // Staff don't see this
  },
  {
    path: '/ota-operations/kpi',
    label: 'KPI',
    icon: ChartBar,
    roles: ['ota_lead', 'admin'],
  },
];

// Default redirect logic
if (user.role === 'ota_staff') {
  navigate('/ota-operations/my-tasks');
} else {
  navigate('/ota-operations/projects'); // or /tasks with board view
}
```

---

## 🛠️ IMPLEMENTATION CHECKLIST

### New Components to Create

- [ ] `src/pages/ota-operations/MyTasksPage.tsx`
- [ ] `src/pages/ota-operations/TaskDetailPage.tsx`
- [ ] `src/components/ota-operations/TaskBoardView.tsx`
- [ ] `src/components/ota-operations/TaskTimeline.tsx`
- [ ] `src/components/ota-operations/ProjectHealthBadge.tsx`

### Components to Enhance

- [ ] `src/pages/ota-operations/TasksPage.tsx` - Add view toggle (list/board)
- [ ] `src/pages/ota-operations/ProjectsPage.tsx` - Add health calculation
- [ ] `src/components/layout/Sidebar.tsx` - Update navigation structure

### Utility Functions to Add

- [ ] `src/lib/ota-utils.ts`:
  ```tsx
  export function calculateTaskBuckets(tasks: OtaTask[]): {
    urgent: OtaTask[];
    review: OtaTask[];
    blocked: OtaTask[];
    later: OtaTask[];
  }
  
  export function calculateProjectHealth(project: OtaProject, tasks: OtaTask[]): {
    health: 'RED' | 'YELLOW' | 'GREEN';
    overdueCount: number;
    blockedCount: number;
    blockedDuration: number;
  }
  
  export function getDueDateProximity(dueDate: string | null): {
    label: string;
    color: string;
    icon: React.ReactNode;
    isOverdue: boolean;
  }
  ```

### NO Changes Required

- ❌ No new Supabase tables
- ❌ No new RPCs (use existing `useOtaTasks`, `useMyOtaTasks`, etc.)
- ❌ No migration files
- ❌ No RLS policy changes

---

## 📊 DATA FLOW (CLIENT-SIDE ONLY)

```
useOtaTasks() / useMyOtaTasks()
       ↓
Client-side filtering & grouping
       ↓
UI Components (My Tasks, Board, Project Health)
       ↓
Display with visual indicators
```

**No backend changes. All logic in React components.**

---

## 🚨 CRITICAL RULES

1. **Use existing hooks only:**
   - `useOtaTasks()`
   - `useMyOtaTasks()`
   - `useOtaProject()`
   - `useOtaProjects()`

2. **All calculations client-side:**
   - Health calculation
   - Bucket grouping
   - Overdue detection
   - Blocked duration

3. **Respect existing permissions:**
   - Staff see only their tasks
   - Lead/Admin see all tasks in accessible projects

4. **No data duplication:**
   - Don't cache health status in DB
   - Calculate on every render (or use React Query cache)

5. **Use existing RPCs for mutations:**
   - `ota_update_task_status`
   - `ota_submit_evidence`
   - `ota_review_evidence`

---

## 📈 SUCCESS METRICS

After Phase 1 implementation:

| Metric | Before | Target After |
|--------|--------|--------------|
| Time to identify urgent tasks (Staff) | 2-3 min | <10 sec |
| Time to spot risky projects (Lead) | 5+ min | <30 sec |
| Number of "forgotten" overdue tasks | High | Near zero |
| User confusion about what to do next | High | Low |

---

## 🔄 NEXT PHASES (NOT IN SCOPE NOW)

**Phase 2 - RPC Optimization (if needed):**
- `get_my_tasks_grouped` - Pre-calculate buckets server-side
- `get_project_health_batch` - Batch health calculation

**Phase 3 - Advanced Features:**
- Auto-alerts for blocked >48h
- Workload balancing suggestions
- KPI correlation with task completion

---

## ✅ VALIDATION

Before considering Phase 1 complete, test:

1. [ ] Staff user logs in → lands on My Tasks → sees 🔥 CẦN LÀM NGAY bucket with today's tasks
2. [ ] Lead opens Projects → sees RED badge on project with >20% overdue
3. [ ] Lead clicks Board View → sees BLOCKED column with count
4. [ ] Anyone clicks task → sees timeline with status changes
5. [ ] Task with BLOCKED status shows reason prominently
6. [ ] Overdue tasks have 🔴 indicator everywhere
7. [ ] No backend errors (all using existing hooks/RPCs)

---

**END OF PHASE 1 SPEC**

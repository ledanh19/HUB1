# OTA Operations - Context Lock v1.0

**Generated**: 2026-01-08  
**Purpose**: Document current architecture before Phase 2 UI upgrade  
**Status**: ✅ LOCKED - Do not modify without review

---

## 📦 CURRENT ARCHITECTURE

### Pages (src/pages/ota-operations/)
- ✅ **MyTasksPage.tsx** - Staff action buckets view (phase 1)
- ✅ **TasksPage.tsx** - List view with board toggle
- ✅ **TaskDetailPage.tsx** - Single task view with timeline
- ✅ **ProjectsPage.tsx** - Projects with health indicators
- ✅ **ProjectDetailPage.tsx** - Project overview + tasks
- ✅ **KpiPage.tsx** - Channel/property KPIs via RPC only
- ⚠️ **MyTasksPageEnhanced.tsx** - Temporary enhanced version (to be merged/removed)

### Components (src/components/ota-operations/)
- ✅ **TaskBoardView.tsx** - Kanban board by status
- ✅ **CreateTaskDialog.tsx** - Task creation modal
- ✅ **CreateProjectDialog.tsx** - Project creation modal
- ✅ **ProjectEditDialog.tsx** - Project editing
- ✅ **EvidenceList.tsx** - Evidence display
- ✅ **EvidenceUploadDialog.tsx** - Evidence upload UI
- ✅ **ProjectMembersPanel.tsx** - Member management
- ✅ **TaskCommentsPanel.tsx** - Comments (phase 2)
- ❌ **MISSING**: TaskQuickViewDrawer, TaskCalendarView, ProjectHealthBadge

### Hooks (src/hooks/)
- ✅ **useOtaOperations.ts** - Main data hooks (1167 lines)
  - `useOtaProjects()` - Fetch projects with property names
  - `useOtaTasks()` - Fetch all tasks (filtered by project optional)
  - `useMyOtaTasks()` - Staff tasks only
  - `useOtaTasksWithAssignees()` - Tasks with assignee names (Lead/Admin)
  - `useOtaTaskDetail(id)` - Single task with full data
  - `useOtaProjectDetail(id)` - Single project with tasks
  - `useOtaKpi()` - **CRITICAL**: Uses RPC `ota_get_kpi` only
  - Mutations: create/update/delete task/project, upload evidence
- ✅ **useUserPagePermissions.ts** - Permission checks
  - `hasPageAccess(page)` - View permission
  - `canUsePage(page)` - Action permission

### Utils (src/lib/)
- ✅ **otaOps.ts** (374 lines) - Client-side calculations
  - `calculateTaskBuckets()` - Action buckets (urgent/review/blocked/later)
  - `calculateProjectHealth()` - RED/YELLOW/GREEN logic
  - `getDueDateProximity()` - Due date status
  - `groupTasksByStatus()` - Board grouping
  - `getBlockedDuration()` - Blocked time calculation

### Routing (src/App.tsx)
```tsx
/ota-operations → redirect to /my-tasks
/ota-operations/my-tasks → MyTasksPage
/ota-operations/projects → ProjectsPage
/ota-operations/projects/:id → ProjectDetailPage
/ota-operations/tasks → TasksPage
/ota-operations/tasks/:id → TaskDetailPage
/ota-operations/kpi → KpiPage
```

### Sidebar (src/components/layout/Sidebar.tsx)
```
📋 OTA Operations
  ├─ My Tasks (/my-tasks)
  ├─ Projects (/projects)
  ├─ All Tasks (/tasks)
  └─ KPI (/kpi)
```

---

## 🗄️ DATABASE SCHEMA

### Tables
```sql
-- Core tables (assumed from hook usage)
ota_projects (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  property_id uuid NOT NULL,
  status ota_project_status,
  start_date date,
  due_date date,
  created_at timestamptz,
  updated_at timestamptz
)

ota_tasks (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES ota_projects,
  title text NOT NULL,
  description text,
  assignee_id uuid, -- References auth.users
  status ota_task_status,
  priority ota_task_priority,
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  estimated_hours numeric,
  actual_hours numeric,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz
)

ota_evidence (
  id uuid PRIMARY KEY,
  task_id uuid REFERENCES ota_tasks,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  review_status text, -- 'pending' | 'approved' | 'rejected'
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  uploaded_by uuid NOT NULL,
  created_at timestamptz
)

-- Mirror tables (read-only for OTA roles)
properties_mirror (property_id, property_name)
bookings_mirror (booking_id, ...) -- NO DIRECT ACCESS for OTA roles
```

### Enums
```sql
CREATE TYPE ota_project_status AS ENUM ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');
CREATE TYPE ota_task_status AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED', 'CANCELLED');
CREATE TYPE ota_task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
```

### RPCs (Stored Functions)
```sql
-- Security helpers
is_ota_role() → boolean
has_ota_project_access(project_id uuid) → boolean
get_ota_project_role(project_id uuid) → text

-- KPI (CRITICAL - Only way to access booking data)
ota_get_kpi(
  p_start_date date,
  p_end_date date,
  p_group_by text DEFAULT 'channel'
) → jsonb

-- Evidence review
ota_review_evidence(
  p_evidence_id uuid,
  p_status text,
  p_notes text
) → void
```

### RLS Policies
```sql
-- Principle: OTA roles isolated from sensitive finance data
-- bookings_mirror: "NOT is_ota_role()" → No direct SELECT
-- ota_tasks: Staff see assigned tasks only
-- ota_projects: Lead/Admin see all, Staff see assigned projects
-- ota_evidence: Task assignee + reviewers only
```

---

## 🔄 CORE FLOWS

### 1. Project → Task → Evidence → Review → Done
```
1. Lead creates Project
2. Lead creates Tasks under Project
3. Lead assigns Task to Staff (assignee_id)
4. Staff:
   - Changes status TODO → IN_PROGRESS
   - Works on task
   - Uploads Evidence (file + metadata)
   - Changes status IN_PROGRESS → REVIEW
5. Lead reviews Evidence:
   - Approves → Task status REVIEW → DONE
   - Rejects → Task status REVIEW → BLOCKED (with notes)
6. Staff fixes → re-uploads → back to REVIEW
```

### 2. Workload Awareness
```
When assigning task:
1. UI shows assignee dropdown
2. For each user, calculate:
   - Active tasks count (TODO + IN_PROGRESS)
   - Overdue tasks count (past due_date)
   - Capacity badge: Low (<3) / Medium (3-7) / High (>7)
3. Lead assigns based on workload hints
```

### 3. Project Health Calculation (Client-side)
```typescript
// src/lib/otaOps.ts - calculateProjectHealth()
const projectTasks = tasks.filter(t => t.project_id === projectId);
const overdueTasks = projectTasks.filter(t => t.due_date < now && t.status !== 'DONE');
const blockedTasks = projectTasks.filter(t => t.status === 'BLOCKED');
const maxBlockedHours = max(blockedTasks.map(t => hoursSince(t.updated_at)));

if (overdueTasks.length / projectTasks.length > 0.2 || maxBlockedHours > 72) {
  return 'RED'; // 🔴 Critical
} else if (overdueTasks.length > 0 || maxBlockedHours > 24) {
  return 'YELLOW'; // 🟡 Warning
} else {
  return 'GREEN'; // 🟢 Healthy
}
```

---

## 🚫 ANTI-SCOPE (DO NOT IMPLEMENT)

### ❌ Forbidden Actions
1. **No Booking CRUD** - OTA module manages tasks, not bookings
2. **No Direct bookings_mirror Access** - Must use RPC `ota_get_kpi()` only
3. **No VIEWs to Bypass RLS** - All queries must respect RLS policies
4. **No New Modules** - No Pricing/Channel Manager/Finance features
5. **No Cache Tables** - No `ota_*_summary` tables; calculate client-side
6. **No PII Exposure** - Staff should not see other staff's personal data beyond names

### ✅ Allowed Optimizations
- Client-side aggregations (health, workload, buckets)
- Caching via React Query (already implemented)
- Adding assignee names via JOIN (if missing) - small migration OK
- UI-only features (drawers, modals, views) - no new tables

---

## 🔐 PERMISSION MATRIX

| Role | My Tasks | All Tasks | Projects | KPI | Assign | Review Evidence |
|------|----------|-----------|----------|-----|--------|----------------|
| **OTA Staff** | ✅ Own | ❌ | ⚠️ Assigned only | ❌ | ❌ | ❌ |
| **OTA Lead** | ✅ Own | ✅ All | ✅ All | ✅ Read | ✅ Yes | ✅ Yes |
| **OTA Admin** | ✅ Own | ✅ All | ✅ All | ✅ Read | ✅ Yes | ✅ Yes |
| **System Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Implementation**:
- `useUserPagePermissions.ts` hooks provide `hasPageAccess()` and `canUsePage()`
- `<PermissionGate>` component wraps UI elements
- Backend RLS enforces at DB level

---

## 🎯 CURRENT STATE ASSESSMENT

### ✅ What Works
- [x] Basic CRUD for projects/tasks
- [x] Task assignment to staff
- [x] Evidence upload (UI + backend)
- [x] KPI via RPC (secure)
- [x] Project health calculation (client-side)
- [x] Action buckets for staff (My Tasks)
- [x] Board view (Kanban by status)
- [x] Permission gates throughout UI

### ⚠️ What Needs Improvement
- [ ] **Quick View Drawer** - Click task opens drawer, not full page
- [ ] **Calendar View** - Tasks by due date (monthly/weekly)
- [ ] **Workload Hints** - Show capacity when assigning
- [ ] **Project Detail Tabs** - Overview/Tasks/Members/Activity
- [ ] **Task Timeline** - Visual status progression
- [ ] **Ownership Clarity** - Avatar + "Unowned" badge
- [ ] **Navigation Polish** - Cmd+Click new tab, click = drawer
- [ ] **Scanability** - List density, visual hierarchy
- [ ] **No AI Look** - Remove excessive gradients/animations

### ❌ Missing (Out of Scope for UI Phase)
- [ ] Real-time updates (WebSocket/Supabase Realtime) - Phase 3
- [ ] Activity audit log table - Phase 3
- [ ] Task dependencies - Phase 4
- [ ] Gantt chart - Phase 4
- [ ] Time tracking UI - Phase 2

---

## 🧪 KNOWN TECHNICAL DEBT

1. **MyTasksPageEnhanced.tsx duplicate** - Need to merge or remove
2. **No assignee names in basic useOtaTasks()** - Only in `useOtaTasksWithAssignees()`
   - Solution: Add RPC or migration to join names efficiently
3. **Heavy animations** - Recently simplified but may need further tuning
4. **No drawer component** - TaskQuickViewDrawer doesn't exist yet
5. **No calendar view** - TaskCalendarView doesn't exist yet

---

## 📋 PHASE 2 DELIVERABLES (THIS WORK)

### Must Have
1. **TaskQuickViewDrawer** component
2. **TaskCalendarView** component (monthly/weekly toggle)
3. **ProjectHealthBadge** component (reusable)
4. **Workload hints** in assign dropdown
5. **Project Detail tabs** (Overview/Tasks/Members)
6. **Task timeline** UI (status progression)
7. **Navigation rules** enforcement (click vs Cmd+Click)
8. **Ownership badges** (avatar + "Unowned")

### Nice to Have (if time permits)
- Task filters (quick filter bar)
- Bulk actions (multi-select tasks)
- Task templates (create from template)

---

## 🔍 VERIFICATION CHECKLIST

Before marking complete, test:
- [ ] Staff login → My Tasks shows action buckets
- [ ] Click task → drawer opens (not full page navigation)
- [ ] Cmd+Click task → new tab with TaskDetailPage
- [ ] Calendar view shows tasks by due date
- [ ] Project detail has tabs (Overview/Tasks/Members)
- [ ] Task detail shows timeline (created → progress → review → done)
- [ ] Assign dropdown shows workload hints (3 tasks, 1 overdue, Medium)
- [ ] Health badge appears on project cards (RED/YELLOW/GREEN with icon)
- [ ] No compile errors, no console warnings
- [ ] Permissions respected (staff doesn't see others' tasks in All Tasks)
- [ ] No AI-look (clean, minimal, professional)
- [ ] Performance: List 500 tasks without lag

---

## 📖 REFERENCES

- **Spec**: `docs/OTA_OPERATIONS_PHASE1_UI_SPEC.md` (if exists)
- **Hooks**: `src/hooks/useOtaOperations.ts` (line 1-1167)
- **Utils**: `src/lib/otaOps.ts` (line 1-374)
- **Types**: Defined in `useOtaOperations.ts` (OtaTask, OtaProject, KpiData)

---

**⚠️ CRITICAL REMINDERS**

1. **Never query bookings_mirror directly** - Use RPC only
2. **Always check permissions** - `hasPageAccess()` + `PermissionGate`
3. **No new tables** - Client-side calculations preferred
4. **No AI-look** - Clean, minimal, scannable
5. **Test with 500+ tasks** - Performance matters at scale

---

**END OF CONTEXT LOCK**

*This document represents the **immutable baseline** for Phase 2 UI work.*  
*Any changes to architecture must update this document first.*

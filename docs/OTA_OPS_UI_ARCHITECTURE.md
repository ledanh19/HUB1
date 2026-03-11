# OTA Operations - UI Architecture v2.0

**Generated**: 2026-01-08  
**Purpose**: Navigation map + interaction patterns  
**Audience**: Frontend engineers implementing Phase 2 UI

---

## 🗺️ NAVIGATION MAP

### Primary Routes

```
┌─ /ota-operations (redirect to /my-tasks)
│
├─ /my-tasks ────────────────── MyTasksPage
│  │                             - Action buckets (urgent/review/blocked/later)
│  │                             - Staff-only view
│  │                             - Click task → open Quick View drawer
│  │
├─ /projects ───────────────── ProjectsPage
│  │                             - List view with health indicators
│  │                             - Stats cards (6 total)
│  │                             - Click project → navigate to /projects/:id
│  │
├─ /projects/:id ──────────── ProjectDetailPage
│  │                             - Tabs: Overview | Tasks | Members | Activity
│  │                             - Overview: health, progress, warnings
│  │                             - Tasks: embedded list with quick view
│  │                             - Members: workload cards
│  │
├─ /tasks ─────────────────── TasksPage
│  │                             - Toggle: List / Board / Calendar
│  │                             - Filters: status, priority, assignee
│  │                             - Click task → open Quick View drawer
│  │                             - Cmd+Click → open /tasks/:id in new tab
│  │
├─ /tasks/:id ────────────── TaskDetailPage
│  │                             - Full task view
│  │                             - Timeline (status progression)
│  │                             - Evidence section
│  │                             - Comments panel
│  │
└─ /kpi ──────────────────── KpiPage
                                - Read-only dashboard
                                - Channel/property aggregations
                                - Date range picker
```

---

## 🎨 VIEW TYPES

### 1. My Tasks Page (Staff Action Buckets)

**Layout**: Horizontal 4-column layout  
**Sections**:
```
+------------------+------------------+------------------+------------------+
| 🔥 Urgent (5)   | ⏳ Review (3)   | 🚫 Blocked (2)  | 🧠 Later (12)   |
| Collapsible     | Collapsible     | Collapsible     | Collapsible     |
+------------------+------------------+------------------+------------------+
| Task card        | Task card        | Task card        | Task card        |
| Task card        | Task card        | Task card        | Task card        |
| ...              | ...              | ...              | ...              |
+------------------+------------------+------------------+------------------+
```

**Bucket Logic** (from `src/lib/otaOps.ts`):
- **🔥 Urgent**: `priority === 'URGENT'` OR `due_date < today` AND `status !== 'DONE'`
- **⏳ Review**: `status === 'REVIEW'`
- **🚫 Blocked**: `status === 'BLOCKED'`
- **🧠 Later**: Everything else (TODO, IN_PROGRESS, no urgency)

**Interactions**:
- Click task card → Open Quick View drawer
- Click "View All Tasks" → Navigate to /tasks

---

### 2. Projects List View

**Layout**: Table with stats header  
**Stats Cards** (6 cards):
```
+------------+------------+------------+------------+------------+------------+
| Total (24) | 🔴 RED (3) | 🟡 YELLOW  | In Progress| Completed  | Planning   |
|            |  Critical  | (5) Warning| (12)       | (8)        | (4)        |
+------------+------------+------------+------------+------------+------------+
```

**Table Columns**:
| Project Name | Property | Status | Progress | Health | Warnings | Due Date | Actions |
|--------------|----------|--------|----------|--------|----------|----------|---------|
| Fix OTA sync | Property A | IN_PROGRESS | 60% █████░░░░░ | 🟢 | 2 overdue | 2026-01-15 | ⋮ |
| Clean images | Property B | PLANNING | 0% ░░░░░░░░░░ | 🟡 | 1 blocked | 2026-01-20 | ⋮ |

**Health Badge Logic**:
- **🔴 RED**: >20% tasks overdue OR any task blocked >72h
- **🟡 YELLOW**: Any task overdue OR any task blocked >24h
- **🟢 GREEN**: No overdue, no long-blocked tasks

**Interactions**:
- Click row → Navigate to /projects/:id
- Hover warnings → Show tooltip with details

---

### 3. Project Detail Page (Tabbed View)

**Tab Structure**:
```
┌─────────────────────────────────────────────────┐
│ Project: Fix OTA Sync Issues                    │
│ Property: Sunshine Villa | Status: IN_PROGRESS  │
├─────────────────────────────────────────────────┤
│ [Overview] [Tasks] [Members] [Activity]         │
├─────────────────────────────────────────────────┤
│                                                  │
│  (Tab content here)                              │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Tab: Overview**
- Project health badge (large)
- Progress bar with breakdown (TODO/IN_PROGRESS/REVIEW/DONE/BLOCKED)
- Key stats: Total tasks, overdue, blocked >48h, completed
- Timeline: Created date, start date, due date, completion date
- Description

**Tab: Tasks**
- Embedded task list (same as TasksPage list view)
- Toggle: List / Board
- Click task → Quick View drawer
- "Create Task" button (if permission)

**Tab: Members**
- Member cards with workload:
  ```
  +---------------------+
  | 👤 Alice Chen       |
  | Role: Lead          |
  | ──────────────────  |
  | 📋 5 tasks          |
  | ⏰ 2 overdue        |
  | 🚫 0 blocked        |
  | Capacity: Medium    |
  +---------------------+
  ```
- "Add Member" button (if Lead/Admin)

**Tab: Activity** (Future phase)
- Audit log of task status changes
- Evidence uploads/reviews
- Member assignments

---

### 4. Tasks Page (Multi-View)

**Header Controls**:
```
┌───────────────────────────────────────────────────────────┐
│ Tasks (87)                                 [Filters ▼]     │
│                                                             │
│ View: [List] [Board] [Calendar]            🔍 Search...   │
└───────────────────────────────────────────────────────────┘
```

#### List View
**Columns**:
| Task | Project | Assignee | Status | Priority | Due Date | Actions |
|------|---------|----------|--------|----------|----------|---------|
| Fix booking sync | OTA Sync | 👤 Alice | IN_PROGRESS | 🔴 URGENT | 2026-01-10 | ⋮ |
| Upload images | Cleaning | Unowned | TODO | 🟡 MEDIUM | 2026-01-12 | ⋮ |

**Density**: Compact (32px row height)  
**Assignee Display**:
- If assigned: Avatar + name (hover → workload popover)
- If unassigned: "Unowned" badge with warning color

#### Board View
**5 Columns** (status-based):
```
+------------+------------+------------+------------+------------+
| TODO (12)  | IN_PROGRESS| REVIEW (5) | DONE (48)  | BLOCKED (3)|
|            | (15)       |            |            |            |
+------------+------------+------------+------------+------------+
| Task card  | Task card  | Task card  | Task card  | Task card  |
| Task card  | Task card  | Task card  | Task card  | Task card  |
| ...        | ...        | ...        | ...        | ...        |
+------------+------------+------------+------------+------------+
```

**Card Content**:
- Task title (1 line, truncate)
- Priority badge (if HIGH/URGENT)
- Assignee avatar (bottom left)
- Due date (bottom right)
- Overdue badge (red, if past due)
- Blocked >48h warning (if applicable)

**Drag & Drop**: Not in Phase 2 (requires backend changes)

#### Calendar View
**Monthly Layout**:
```
        January 2026
Su  Mo  Tu  We  Th  Fr  Sa
                1   2   3   4
5   6   7   8   9   10  11
12  13  14  15  16  17  18
19  20  21  22  23  24  25
26  27  28  29  30  31
```

**Task Dots**:
- Each task = colored dot on due date
- Hover → tooltip with task title + priority
- Click date → show all tasks for that day in drawer
- Color coding: RED (urgent), YELLOW (high), BLUE (medium), GRAY (low)

**Weekly Toggle**:
```
        Week of Jan 6 - Jan 12
Mon     Tue     Wed     Thu     Fri     Sat     Sun
Jan 6   Jan 7   Jan 8   Jan 9   Jan 10  Jan 11  Jan 12
────────────────────────────────────────────────────────
• Task 1  • Task 3          • Task 5  • Task 7
• Task 2          • Task 4            • Task 6
```

---

### 5. Task Detail Page

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│ ← Back to Tasks                                            │
├────────────────────────────────────────────────────────────┤
│ Task: Fix OTA sync for Booking #12345                     │
│ Status: [IN_PROGRESS ▼]  Priority: [URGENT ▼]            │
├────────────────────────────────────────────────────────────┤
│ Left Column (60%)           │ Right Column (40%)          │
│ ───────────────────────────│───────────────────────────  │
│ Description                 │ Timeline                    │
│ Lorem ipsum...              │ ○───●───○───○               │
│                             │ Created  In Progress Review │
│ Evidence Section            │                             │
│ ┌──────────────────┐       │ Details                     │
│ │ 📎 screenshot.png │       │ Project: OTA Sync           │
│ │ Status: Pending   │       │ Assignee: Alice Chen        │
│ │ [Review]          │       │ Created: Jan 1              │
│ └──────────────────┘       │ Due: Jan 10 (2 days left)   │
│                             │                             │
│ Comments (8)                │ Actions                     │
│ Alice: "Working on it..."   │ [Change Status]             │
│ Bob: "Need more info"       │ [Upload Evidence]           │
│                             │ [Add Comment]               │
└────────────────────────────────────────────────────────────┘
```

**Timeline Component** (NEW):
- Horizontal progress indicator
- Nodes: Created → In Progress → Review → Done
- If BLOCKED: red node with warning icon
- If CANCELLED: gray strikethrough

**Evidence Section**:
- Grid layout (3 columns)
- Each card: thumbnail + filename + status
- Hover → show review notes
- Click → open full view modal
- Upload button (if assignee or Lead)

**Comments Panel**:
- Chronological list
- Avatar + name + timestamp
- Rich text editor (markdown support)
- "Add comment" expands textarea

---

## 🖱️ INTERACTION PATTERNS

### Navigation Rules

| Action | Behavior | Use Case |
|--------|----------|----------|
| **Click task in list/board** | Open Quick View drawer | Fast preview without losing context |
| **Cmd/Ctrl+Click task** | Open /tasks/:id in new tab | Deep dive while keeping list open |
| **Click project in list** | Navigate to /projects/:id | View full project details |
| **Click "Create Task" button** | Open modal (CreateTaskDialog) | Inline creation without navigation |
| **Click "Edit Project" icon** | Open modal (ProjectEditDialog) | Inline editing |
| **Click status dropdown** | Show status change modal | Require reason if BLOCKED/CANCELLED |

### Quick View Drawer

**Component**: `TaskQuickViewDrawer.tsx` (NEW)  
**Trigger**: Click task card/row anywhere except actions menu  
**Position**: Slide in from right (400px width)  
**Content**:
- Task title (editable if permission)
- Status + Priority dropdowns
- Assignee (with workload hint)
- Description (1st paragraph only)
- Evidence thumbnails (max 3, "+ N more")
- Recent comments (max 3, "+ N more")
- "View Full Details" button → Navigate to /tasks/:id

**Interactions**:
- Click outside drawer → Close
- ESC key → Close
- Click "View Full Details" → Navigate + close drawer
- Edit fields → Auto-save on blur
- Background: Semi-transparent overlay (20% black)

**Animation**: Slide-in 180ms ease-out

---

### Assignee Selection with Workload

**Component**: Enhanced `<Select>` component  
**Dropdown Items**:
```
┌──────────────────────────────────┐
│ 👤 Alice Chen                    │
│    📋 5 tasks  ⏰ 2 overdue       │
│    Capacity: 🟡 Medium           │
├──────────────────────────────────┤
│ 👤 Bob Smith                     │
│    📋 2 tasks  ⏰ 0 overdue       │
│    Capacity: 🟢 Low              │
├──────────────────────────────────┤
│ 👤 Carol Lee                     │
│    📋 12 tasks  ⏰ 5 overdue      │
│    Capacity: 🔴 High             │
└──────────────────────────────────┘
```

**Capacity Calculation** (client-side):
```typescript
const activeTasks = tasks.filter(t => 
  t.assignee_id === userId && 
  ['TODO', 'IN_PROGRESS', 'REVIEW'].includes(t.status)
);
const capacity = 
  activeTasks.length <= 3 ? 'Low' :
  activeTasks.length <= 7 ? 'Medium' : 'High';
```

**Hover Interaction**:
- Hover assignee name → Show popover with task list
- Popover content: Task titles (max 5) + "View all →" link

---

### Status Change Modal

**Trigger**: Click status dropdown + select BLOCKED or CANCELLED  
**Modal Content**:
```
┌───────────────────────────────────┐
│ Change Task Status to BLOCKED     │
├───────────────────────────────────┤
│ Reason (required):                │
│ ┌───────────────────────────────┐ │
│ │ Waiting for 3rd party API fix │ │
│ └───────────────────────────────┘ │
│                                   │
│ [Cancel]            [Confirm]     │
└───────────────────────────────────┘
```

**Validation**:
- Reason must be ≥10 characters
- On confirm: Update task + create comment with reason
- On cancel: Revert dropdown selection

---

## 🎯 COMPONENT HIERARCHY

### New Components (Phase 2)

```
src/components/ota-operations/
├── TaskQuickViewDrawer.tsx          ← Priority 1 (enables all flows)
├── TaskCalendarView.tsx             ← Priority 2
├── TaskTimelineView.tsx             ← Priority 3 (timeline UI)
├── ProjectHealthBadge.tsx           ← Priority 4 (reusable badge)
├── AssigneeSelectWithWorkload.tsx   ← Priority 5 (enhanced select)
└── WorkloadPopover.tsx              ← Priority 6 (assignee hover)
```

### Enhanced Existing Components

```
src/pages/ota-operations/
├── TasksPage.tsx          → Add Calendar toggle
├── ProjectDetailPage.tsx  → Add tabs (Overview/Tasks/Members)
├── TaskDetailPage.tsx     → Add timeline component
└── MyTasksPage.tsx        → Add click → drawer behavior
```

---

## 🔄 STATE MANAGEMENT

### React Query Keys

```typescript
// Project queries
['ota-projects']                    // All projects
['ota-projects', projectId]         // Single project

// Task queries
['ota-tasks']                       // All tasks
['ota-tasks', { projectId }]        // Tasks by project
['my-ota-tasks']                    // Staff tasks only
['ota-tasks', taskId]               // Single task

// KPI queries
['ota-kpi', { startDate, endDate, groupBy }]  // KPI data

// Workload queries (derived)
['ota-workload', userId]            // User workload
```

### Local State (Component-level)

```typescript
// TasksPage
const [view, setView] = useState<'list' | 'board' | 'calendar'>('list');
const [filters, setFilters] = useState({ status: null, priority: null });

// Quick View Drawer
const [isOpen, setIsOpen] = useState(false);
const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

// Calendar View
const [currentMonth, setCurrentMonth] = useState(new Date());
const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
```

---

## 🎨 DESIGN TOKENS

### Spacing (No AI-look principle)
```typescript
const spacing = {
  tight: '0.25rem',   // 4px - inline elements
  compact: '0.5rem',  // 8px - card padding
  base: '1rem',       // 16px - default gap
  comfortable: '1.5rem', // 24px - section spacing
  loose: '2rem',      // 32px - page margins
};
```

### Typography
```typescript
const typography = {
  sm: '0.875rem',     // 14px - labels, captions
  base: '1rem',       // 16px - body text
  lg: '1.125rem',     // 18px - headings
  xl: '1.25rem',      // 20px - page titles
};
```

### Colors (Health States)
```typescript
const healthColors = {
  red: 'bg-red-100 text-red-800 border-red-300',        // Critical
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300', // Warning
  green: 'bg-green-100 text-green-800 border-green-300',     // Healthy
};
```

### Animations (Subtle only)
```typescript
const animations = {
  drawerSlide: 'transition-transform duration-180 ease-out',
  hover: 'transition-shadow duration-120 hover:shadow-md',
  fade: 'transition-opacity duration-150',
};
```

**FORBIDDEN**:
- ❌ Scale effects (`hover:scale-105`)
- ❌ Pulse animations (`animate-pulse`)
- ❌ Heavy gradients (`bg-gradient-to-br from-X via-Y to-Z`)
- ❌ Blur effects (`backdrop-blur-lg`)
- ❌ Staggered delays (children animating at different times)

---

## 📏 ACCESSIBILITY

### Keyboard Navigation
- Tab → Focus next interactive element
- Shift+Tab → Focus previous
- Enter → Activate button/link
- ESC → Close drawer/modal
- Arrow keys → Navigate calendar dates

### Screen Reader Support
- All buttons have `aria-label`
- Status badges have `role="status"` with `aria-live="polite"`
- Drawers have `role="dialog"` with `aria-modal="true"`
- Health indicators have descriptive text (not just colors)

---

## 🧪 TESTING CHECKLIST

See `docs/OTA_OPS_E2E_UI_CHECKLIST.md` for full E2E scenarios.

---

**END OF UI ARCHITECTURE**

*This document defines HOW users interact with OTA Operations.*  
*All UI implementations must follow these patterns.*

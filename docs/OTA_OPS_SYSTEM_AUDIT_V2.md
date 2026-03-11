# 🔍 OTA OPERATIONS MODULE – SYSTEM AUDIT V2

> **Audit Date**: 2026-01-08  
> **Auditor**: AI Assistant  
> **Spec Reference**: ROOMRISE CONTROL HUB – OPS FLOW V2 (OPS-HARDENED)  
> **Scope**: Full AS-IS discovery → Gap Analysis → TO-BE roadmap

---

## 📁 PHASE 1: INVENTORY

### 1.1 Frontend Files (src/pages/ota-operations/)

| File | Purpose | LOC (est.) |
|------|---------|------------|
| `ProjectsPage.tsx` | List all OTA projects with filters | ~350 |
| `ProjectDetailPage.tsx` | Project detail + embedded task board | ~500 |
| `TasksPage.tsx` | Global task Kanban board | ~400 |
| `TaskDetailPage.tsx` | Full task detail page (legacy) | ~450 |
| `MyTasksPage.tsx` | User's assigned tasks by buckets | ~350 |
| `KpiPage.tsx` | OTA performance KPI dashboard | ~600 |

### 1.2 Components (src/components/ota-operations/)

| File | Purpose | Status |
|------|---------|--------|
| `TaskBoardDnd.tsx` | Kanban board with DnD-kit | ✅ Active |
| `TaskCard.tsx` | Card with cover, priority, urgency | ✅ Active |
| `TaskSidePanel/index.tsx` | Trello-style center modal | ✅ Active |
| `TaskSidePanel/PanelHeader.tsx` | Status chip + quick actions | ✅ Active |
| `TaskSidePanel/tabs/OverviewTab.tsx` | Basic info display | ✅ Active |
| `TaskSidePanel/tabs/EvidenceTab.tsx` | Evidence CRUD + review | ✅ Active |
| `TaskSidePanel/tabs/CommentsTab.tsx` | Comments with image attachments | ✅ Active |
| `TaskSidePanel/tabs/HistoryTab.tsx` | Audit log viewer | ✅ Active |
| `TaskQuickViewDrawer.tsx` | Side drawer preview | ✅ Active |
| `TaskContextPanel.tsx` | Compact task context | ✅ Active |
| `TaskCardActions.tsx` | Inline quick actions | ✅ Active |
| `CreateProjectDialog.tsx` | New project with work_type | ✅ Active |
| `CreateTaskDialog.tsx` | New task form | ✅ Active |
| `EvidenceList.tsx` | Evidence grid display | ✅ Active |
| `StatusTransitionModal.tsx` | Status change confirmation | ✅ Active |
| `SuperAdminOverrideModal.tsx` | Override blocked actions | ✅ Active |
| `ProjectHealthBadge.tsx` | Health indicator pill | ✅ Active |
| `ProjectInputsTab.tsx` | Project inputs JSONB form | ✅ Active |
| `ProjectOutputsTab.tsx` | Project outputs JSONB viewer | ✅ Active |

### 1.3 Hooks & Libraries

| File | Purpose | LOC |
|------|---------|-----|
| `src/hooks/useOtaOperations.ts` | All OTA queries & mutations | ~2216 |
| `src/lib/otaOps.ts` | Client-side utilities, task buckets, health calc | ~728 |
| `src/lib/ui-tokens.ts` | UI theme tokens including WORK_TYPE_STYLES | ~250 |

### 1.4 Supabase Migrations (OTA-specific: 004-024)

| Migration | Purpose | Critical |
|-----------|---------|----------|
| `004_ota_projects.sql` | Projects table + status enum | ✅ |
| `005_ota_project_members.sql` | Membership with RBAC roles | ✅ |
| `006_ota_tasks.sql` | Tasks table + status enum | ✅ |
| `007_ota_task_evidence.sql` | Evidence + immutability triggers | ✅ |
| `008_ota_helper_functions.sql` | `is_ota_role()`, `has_ota_project_access()` | ✅ |
| `009_ota_projects_rls.sql` | RLS policies for projects | ✅ |
| `010_ota_tasks_rls.sql` | RLS policies for tasks | ✅ |
| `011_ota_task_evidence_rls.sql` | RLS policies for evidence | ✅ |
| `012_ota_permissions.sql` | Grants + audit log table + triggers | ✅ |
| `013_ota_project_members_rls.sql` | RLS for members table | ✅ |
| `014_ota_members_cascade.sql` | Member cleanup triggers | ❌ |
| `015_ota_evidence_revision.sql` | Evidence revision workflow | ✅ |
| `016_ota_update_task_status_rpc.sql` | `ota_update_task_status()` RPC | ✅ |
| `017_ota_task_comments.sql` | Comments table + threading | ✅ |
| `018_ota_work_type.sql` | `work_type` enum + column | ✅ |
| `019_ota_audit_log_override.sql` | Audit log override columns | ✅ |
| `020_ota_task_cover_image.sql` | `cover_image_url` column | ✅ |
| `021_ota_project_inputs_outputs.sql` | Project inputs/outputs JSONB | ✅ |
| `022_ota_evidence_states.sql` | Extended evidence states | ✅ |
| `023_ota_task_blockers.sql` | Task blocking relationships | ❌ |
| `024_ota_task_done_guard.sql` | DONE guard RPC + trigger | ✅ |

---

## 📊 PHASE 2: AS-IS DATA MODEL

### 2.1 Entity-Relationship Diagram (ASCII)

```
┌─────────────────┐      ┌─────────────────────┐      ┌────────────────────┐
│   properties    │      │    ota_projects     │      │ ota_project_members│
│─────────────────│      │─────────────────────│      │────────────────────│
│ id (PK)         │◄────┐│ id (PK)             │◄────┐│ id (PK)            │
│ name            │     ││ property_id (FK)    │     ││ project_id (FK)    │
│ partner_id      │     ││ name                │     ││ user_id (FK)       │
└─────────────────┘     ││ work_type           │     ││ role (ENUM)        │
                        ││ status (ENUM)       │     │└────────────────────┘
                        ││ start_date          │     │
                        ││ due_date            │     │
                        │└─────────────────────┘     │
                        │         │                  │
                        │         │ 1:N              │
                        │         ▼                  │
                        │ ┌─────────────────────┐    │
                        │ │     ota_tasks       │    │
                        │ │─────────────────────│    │
                        │ │ id (PK)             │    │
                        │ │ project_id (FK)     │────┘
                        │ │ title               │
                        │ │ status (ENUM)       │
                        │ │ priority (ENUM)     │
                        │ │ assignee_id (FK)    │───► auth.users
                        │ │ due_date            │
                        │ │ cover_image_url     │
                        │ │ tags JSONB          │
                        │ └─────────────────────┘
                        │          │
        ┌───────────────┼──────────┼───────────────┐
        │               │          │               │
        ▼               │          ▼               ▼
┌───────────────────┐   │  ┌─────────────────┐ ┌────────────────────┐
│ ota_task_evidence │   │  │ota_task_comments│ │   ota_audit_log    │
│───────────────────│   │  │─────────────────│ │────────────────────│
│ id (PK)           │   │  │ id (PK)         │ │ id (PK)            │
│ task_id (FK)      │   │  │ task_id (FK)    │ │ entity_type        │
│ evidence_type     │   │  │ author_id (FK)  │ │ entity_id (FK)     │
│ file_url          │   │  │ content         │ │ project_id (FK)    │
│ review_status     │   │  │ parent_id (FK)  │ │ old_data JSONB     │
│ reviewed_by       │   │  │ image_url       │ │ new_data JSONB     │
│ immutable_after   │   │  └─────────────────┘ │ performed_by       │
└───────────────────┘   │                      │ override_type      │
                        │                      └────────────────────┘
                        │
                        ▼
               ┌───────────────────────┐
               │ ota_project_inputs    │
               │───────────────────────│
               │ id (PK)               │
               │ project_id (FK)       │
               │ data JSONB            │
               │ schema_version        │
               └───────────────────────┘
               ┌───────────────────────┐
               │ ota_project_outputs   │
               │───────────────────────│
               │ id (PK)               │
               │ project_id (FK)       │
               │ version               │
               │ status                │
               │ data JSONB            │
               └───────────────────────┘
```

### 2.2 Enum Definitions

| Enum Name | Values | Location |
|-----------|--------|----------|
| `ota_project_status` | `PLANNING`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `ARCHIVED` | migration 004 |
| `ota_task_status` | `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`, `BLOCKED`, `CANCELLED` | migration 006 |
| `ota_task_priority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | migration 006 |
| `ota_project_role` | `STAFF`, `LEAD`, `ADMIN` | migration 005 |
| `ota_work_type` | `OTA_ONBOARDING`, `OTA_OPTIMIZATION`, `INCIDENT_SUPPORT`, `QUALITY_AUDIT`, `INTERNAL_OPS`, `STRATEGY_GROWTH` | migration 018 |
| `ota_evidence_review_status` | `PENDING`, `APPROVED`, `REJECTED`, `NEEDS_REVISION` | migration 007/022 |

### 2.3 State Machines

#### Project Status Flow
```
              ┌──────────────┐
              │   PLANNING   │ (initial)
              └──────┬───────┘
                     │ Start
                     ▼
              ┌──────────────┐
         ┌────│ IN_PROGRESS  │────┐
         │    └──────────────┘    │
     Hold│                        │Complete
         ▼                        ▼
  ┌──────────────┐         ┌──────────────┐
  │   ON_HOLD    │         │  COMPLETED   │
  └──────┬───────┘         └──────┬───────┘
         │ Resume                 │ Archive
         └─────────►──────────────▼
                           ┌──────────────┐
                           │   ARCHIVED   │ (terminal)
                           └──────────────┘
```

#### Task Status Flow (with DONE Guard)
```
     ┌───────────────────────────────────────────────────────────┐
     │                                                           │
     │  ┌─────────┐                                              │
     │  │  TODO   │ ─────────────────────────────────────────┐   │
     │  └────┬────┘                                          │   │
     │       │ Start                                     Block│  │
     │       ▼                                               │   │
     │  ┌─────────────┐      Submit         ┌─────────────┐  │   │
     │  │ IN_PROGRESS │ ──────────────────► │   REVIEW    │  │   │
     │  └─────────────┘                     └──────┬──────┘  │   │
     │       ▲                                     │         │   │
     │       │ Reject                              │ Approve │   │
     │       │                                     ▼         ▼   │
     │       │     ┌────────────────────────────────────────────┐│
     │       │     │                  DONE GUARD                ││
     │       │     │ ───────────────────────────────────────────││
     │       │     │ Pre-conditions:                            ││
     │       │     │  • ≥1 evidence with review_status=APPROVED ││
     │       │     │  • Task status = REVIEW                    ││
     │       │     │ Enforcement:                               ││
     │       │     │  • UI: Button disabled if conditions fail  ││
     │       │     │  • DB: Trigger raises exception if bypass  ││
     │       │     └────────────────────────────────────────────┘│
     │       │                         │                         │
     │       │                         ▼                         │
     │       │                   ┌─────────┐                     │
     │       └───────────────────│  DONE   │ (immutable*)       │
     │                           └─────────┘                     │
     │                                                           │
     │  ┌───────────┐                     ┌────────────┐         │
     │  │  BLOCKED  │◄────────────────────│ CANCELLED  │         │
     │  └───────────┘                     └────────────┘         │
     │       │                                   ▲               │
     │       │ Unblock                           │ Cancel        │
     │       └───────────►───────────────────────┴───────────────┘
```

*Immutable: DONE tasks cannot be edited (enforced by trigger `ota_done_guard_trigger`)

#### Evidence Review Flow
```
  Upload           Lead/Admin
    │              Review
    ▼                │
┌─────────┐          │
│ PENDING │──────────┼────────────────────────┐
└─────────┘          │                        │
                     ▼                        ▼
              ┌──────────────┐         ┌────────────┐
              │   APPROVED   │         │  REJECTED  │
              └──────────────┘         └────────────┘
                                              │
                                              │ Resubmit
                                              ▼
                                       ┌───────────────┐
                                       │ NEEDS_REVISION│
                                       └───────────────┘
```

### 2.4 RLS Policy Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `ota_projects` | `is_ota_role()` | `is_ota_lead_or_admin()` | `has_ota_project_access(id)` | Admin only |
| `ota_tasks` | via project access | `has_ota_project_access(project_id)` | `has_ota_project_access(project_id)` | `is_ota_lead_or_admin()` |
| `ota_task_evidence` | via task→project | `has_ota_project_access()` | Own evidence only | `is_ota_lead_or_admin()` |
| `ota_task_comments` | via task→project | `has_ota_project_access()` | Own comments only | Own or Lead/Admin |
| `ota_project_members` | via project access | Lead/Admin only | Lead/Admin only | Lead/Admin only |
| `ota_audit_log` | Admin only | Triggers only | Never | Never |

### 2.5 Key RPCs & Triggers

| Name | Type | Purpose | Security |
|------|------|---------|----------|
| `ota_update_task_status(task_id, new_status, comment)` | RPC | Status transition with audit | SECURITY DEFINER |
| `ota_mark_task_done(task_id)` | RPC | DONE guard enforcement | SECURITY DEFINER |
| `ota_done_guard_trigger()` | Trigger | Prevent DONE bypass | On UPDATE |
| `ota_evidence_immutability_trigger()` | Trigger | Freeze evidence after approval | On UPDATE |
| `ota_audit_trigger()` | Trigger | Log all changes | On INSERT/UPDATE/DELETE |

---

## 🔄 PHASE 3: GAP ANALYSIS vs OPS FLOW V2

### 3.1 Data Model Gaps

| V2 Requirement | AS-IS Status | Gap | Priority |
|----------------|--------------|-----|----------|
| **Task Classification** (Execution/Prep/Auto/Ops) | ❌ Missing | `task_classification` column + enum | P1 |
| **Quick Task** (project_id nullable) | ❌ Missing | Make `project_id` nullable + "Quick Tasks" view | P2 |
| **Template Versioning** (`template_id`, `version`) | ❌ Missing | New table `ota_project_templates` + versioning | P2 |
| **issue_tag for Ops Insight** | ❌ Missing | `issue_tag` column on tasks for aggregation | P1 |
| **Task Dependencies** (`blocked_by`) | ⚠️ Partial | `ota_task_blockers` table exists but unused | P3 |
| **Project Inputs/Outputs** | ✅ Exists | `ota_project_inputs`, `ota_project_outputs` tables | - |
| **DONE Guard (approved evidence)** | ✅ Exists | RPC + trigger in migration 024 | - |
| **Audit Log with Override** | ✅ Exists | `ota_audit_log` with `override_type` column | - |
| **Work Type Classification** | ✅ Exists | `work_type` enum on `ota_projects` | - |
| **Evidence Review States** | ✅ Exists | PENDING/APPROVED/REJECTED/NEEDS_REVISION | - |
| **Threaded Comments** | ✅ Exists | `parent_id` for replies | - |
| **Cover Image** | ✅ Exists | `cover_image_url` on tasks | - |

### 3.2 UI/UX Gaps

| V2 Requirement | AS-IS Status | Gap | Priority |
|----------------|--------------|-----|----------|
| **4-Column Kanban** (TODO/IN_PROGRESS/REVIEW/DONE) | ✅ Exists | `TaskBoardDnd.tsx` has 6 columns (incl BLOCKED/CANCELLED) | - |
| **Trello-style Modal** | ✅ Exists | `TaskSidePanel` is center modal | - |
| **Quick Task Creation** | ❌ Missing | Inline task creation without project | P2 |
| **Ops Insight Dashboard** | ⚠️ Partial | `KpiPage.tsx` exists but needs `issue_tag` aggregation | P1 |
| **Calendar View** | ❌ Missing | Task calendar view for deadlines | P3 |
| **Bulk Actions** | ❌ Missing | Select multiple tasks → bulk status change | P3 |
| **Project Timeline/Gantt** | ❌ Missing | Visual timeline for project phases | P3 |
| **Mobile Responsive** | ⚠️ Partial | Some components, not fully tested | P2 |

### 3.3 Workflow Gaps

| V2 Requirement | AS-IS Status | Gap | Priority |
|----------------|--------------|-----|----------|
| **Auto-status on Evidence** | ❌ Missing | Auto TODO→IN_PROGRESS when first evidence uploaded | P1 |
| **Reminder Notifications** | ❌ Missing | Push/email for approaching deadlines | P2 |
| **Escalation Rules** | ❌ Missing | Auto-escalate overdue tasks | P2 |
| **SLA Tracking** | ⚠️ Partial | Health calculation exists, SLA config missing | P2 |
| **Evidence Required Count** | ❌ Missing | `min_evidence_count` per task type | P2 |
| **Approval Workflow** | ✅ Exists | Lead/Admin can approve evidence | - |

### 3.4 Integration Gaps

| V2 Requirement | AS-IS Status | Gap | Priority |
|----------------|--------------|-----|----------|
| **Property Sync** | ✅ Exists | `property_id` FK on projects | - |
| **User Auth** | ✅ Exists | Supabase Auth + RLS | - |
| **File Storage** | ✅ Exists | `ota-evidence` bucket | - |
| **External OTA APIs** | ❌ Missing | Booking.com/Agoda API integration | P3 |
| **Slack/Teams Webhook** | ❌ Missing | Notification webhooks | P3 |

---

## 📋 PHASE 4: TO-BE ROADMAP

### 4.1 Sprint Plan

#### Sprint 1: Foundation (Week 1-2) - P1 Items

| ID | Task | Estimate | Acceptance Criteria |
|----|------|----------|---------------------|
| S1.1 | Add `task_classification` enum | 2h | Migration + UI dropdown |
| S1.2 | Add `issue_tag` column | 2h | Migration + tag input component |
| S1.3 | Ops Insight Dashboard v2 | 8h | Aggregation by `issue_tag` |
| S1.4 | Auto-status on evidence upload | 4h | Trigger: TODO→IN_PROGRESS |
| S1.5 | Unit tests for new features | 8h | 80% coverage |

**Sprint 1 Total**: ~24h (1 dev-week)

#### Sprint 2: Quick Tasks & Templates (Week 3-4) - P2 Items

| ID | Task | Estimate | Acceptance Criteria |
|----|------|----------|---------------------|
| S2.1 | Make `project_id` nullable | 4h | Migration + RLS update |
| S2.2 | Quick Task creation UI | 8h | Inline form, auto-assign |
| S2.3 | Quick Tasks view/board | 8h | Separate board for orphan tasks |
| S2.4 | Project Templates table | 4h | `ota_project_templates` migration |
| S2.5 | Template versioning | 8h | Version control + clone |
| S2.6 | Mobile responsive polish | 8h | Test all pages on mobile |

**Sprint 2 Total**: ~40h (2 dev-weeks)

#### Sprint 3: Notifications & Integrations (Week 5-6) - P2/P3 Items

| ID | Task | Estimate | Acceptance Criteria |
|----|------|----------|---------------------|
| S3.1 | Reminder notifications | 16h | Push/email 1-day before deadline |
| S3.2 | Escalation rules | 8h | Auto-priority bump on overdue |
| S3.3 | Bulk actions UI | 8h | Multi-select + bulk update |
| S3.4 | Calendar view | 16h | FullCalendar integration |
| S3.5 | Task dependencies UI | 8h | Show blocked_by relationships |

**Sprint 3 Total**: ~56h (3 dev-weeks)

### 4.2 Database Migrations To-Do

```sql
-- Migration 025: task_classification
CREATE TYPE ota_task_classification AS ENUM (
  'EXECUTION',  -- Tác vụ thực thi (upload content, reply guest...)
  'PREP',       -- Chuẩn bị (thu thập info, chờ input)
  'AUTO',       -- Tự động hóa (script runs)
  'OPS'         -- Vận hành nội bộ (meeting, report...)
);

ALTER TABLE ota_tasks 
ADD COLUMN classification ota_task_classification DEFAULT 'EXECUTION';

-- Migration 026: issue_tag for Ops Insight
ALTER TABLE ota_tasks
ADD COLUMN issue_tag TEXT; -- e.g., 'PRICE_MISMATCH', 'NO_SHOW', 'OVERBOOKING'

CREATE INDEX idx_ota_tasks_issue_tag ON ota_tasks(issue_tag);

-- Migration 027: project_id nullable for Quick Tasks
ALTER TABLE ota_tasks 
ALTER COLUMN project_id DROP NOT NULL;

-- Update RLS to handle orphan tasks
CREATE POLICY "Users can see own quick tasks"
ON ota_tasks FOR SELECT
USING (
  project_id IS NULL 
  AND assignee_id = auth.uid()
);

-- Migration 028: Project Templates
CREATE TABLE ota_project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  work_type ota_work_type NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  task_template JSONB NOT NULL, -- Array of task definitions
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration 029: min_evidence_count
ALTER TABLE ota_tasks
ADD COLUMN min_evidence_count INT DEFAULT 1;

-- Update DONE guard to check min_evidence_count
```

### 4.3 Component Modifications

| Component | Change | Files |
|-----------|--------|-------|
| `CreateTaskDialog.tsx` | Add `classification`, `issue_tag` fields | 1 |
| `TaskCard.tsx` | Show classification badge | 1 |
| `TaskSidePanel/OverviewTab.tsx` | Display classification, issue_tag | 1 |
| `KpiPage.tsx` | Add issue_tag aggregation charts | 1 |
| `TaskBoardDnd.tsx` | Filter by classification | 1 |
| New: `QuickTaskBoard.tsx` | Board for orphan tasks | 1 |
| New: `CalendarView.tsx` | Calendar with task deadlines | 1 |
| New: `TemplateManager.tsx` | Template CRUD | 1 |

---

## 🧪 PHASE 5: TEST PLAN

### 5.1 Migration Smoke Tests

| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| M1 | Run migration 025 (task_classification) | No errors, column added | ⬜ |
| M2 | Run migration 026 (issue_tag) | No errors, column + index added | ⬜ |
| M3 | Run migration 027 (project_id nullable) | Existing tasks unaffected | ⬜ |
| M4 | Run migration 028 (templates) | Table created with RLS | ⬜ |
| M5 | Rollback all migrations | Clean rollback | ⬜ |

### 5.2 UI Acceptance Tests

| ID | Test Case | Steps | Expected | Pass/Fail |
|----|-----------|-------|----------|-----------|
| U1 | Create task with classification | 1. Open CreateTaskDialog 2. Select classification 3. Save | Task saved with classification | ⬜ |
| U2 | Filter by classification | 1. On TaskBoardDnd 2. Select filter | Only matching tasks shown | ⬜ |
| U3 | Issue tag aggregation | 1. Open KpiPage 2. Check Ops Insight | Chart shows issue breakdown | ⬜ |
| U4 | Quick Task creation | 1. Create task without project 2. Check Quick Tasks view | Task visible in Quick Tasks | ⬜ |
| U5 | DONE guard with min_evidence | 1. Set min_evidence=2 2. Upload 1 evidence 3. Try mark DONE | Blocked, error shown | ⬜ |

### 5.3 RLS Security Tests

| ID | Test Case | User Role | Expected | Pass/Fail |
|----|-----------|-----------|----------|-----------|
| R1 | STAFF can see assigned quick tasks | ota_staff | Own tasks visible | ⬜ |
| R2 | STAFF cannot see others' quick tasks | ota_staff | 0 rows | ⬜ |
| R3 | LEAD can see all project tasks | ota_lead | All tasks in project | ⬜ |
| R4 | Admin can see all quick tasks | admin | All orphan tasks | ⬜ |

### 5.4 Integration Tests

| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| I1 | Auto-status trigger | Upload evidence → status changes to IN_PROGRESS | ⬜ |
| I2 | Template cloning | Clone template → new project created | ⬜ |
| I3 | Audit log for classification change | Change classification → logged | ⬜ |

---

## 📊 SUMMARY

### Current State (AS-IS)
- **Tables**: 8 OTA-specific tables
- **Enums**: 6 PostgreSQL enums
- **RLS Policies**: 20+ policies
- **Triggers**: 5 critical triggers
- **UI Components**: 20+ React components
- **LOC**: ~5,000 lines in hooks + lib

### Gaps Identified
- **P1 (Critical)**: 4 items (task_classification, issue_tag, Ops Insight v2, auto-status)
- **P2 (High)**: 8 items (Quick Tasks, templates, notifications, mobile)
- **P3 (Medium)**: 5 items (calendar, bulk actions, integrations)

### Estimated Effort
- **Sprint 1**: 24h (1 week)
- **Sprint 2**: 40h (2 weeks)
- **Sprint 3**: 56h (3 weeks)
- **Total**: ~120h (6 dev-weeks)

### Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking RLS on project_id nullable | HIGH | Thorough RLS testing before deploy |
| Template versioning complexity | MEDIUM | Start with simple version numbering |
| Migration rollback | LOW | All migrations idempotent + tested |

---

## ✅ CHECKLIST FOR IMPLEMENTATION

- [ ] Review and approve Sprint 1 scope
- [ ] Create branch `feature/ota-ops-v2-sprint1`
- [ ] Implement migrations 025-026
- [ ] Update UI components
- [ ] Write unit tests
- [ ] QA testing
- [ ] Merge to develop
- [ ] Repeat for Sprint 2, 3

---

*Document generated by AI System Audit*  
*Last updated: 2026-01-08*

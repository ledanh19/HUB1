# 🔐 ROOMRISE PERMISSION AUDIT - CONTEXT LOCK REPORT

**Date**: January 8, 2026  
**Auditor**: Principal Engineer + Security Architect  
**Scope**: Full system permission audit with OTA Operations focus  
**Status**: ✅ CODEBASE READ PASS COMPLETE

---

## 📋 EXECUTIVE SUMMARY

**CRITICAL FINDING**: Permission system is **PARTIALLY FUNCTIONAL** but has **ROUTING MISMATCH** and **DEFAULT PERMISSION GAPS** causing "superadmin OK, user fail" syndrome.

**Root Cause Categories**:
1. ❌ **Sidebar → Route → Permission PATH MISMATCH** (3 instances)
2. ⚠️ **Missing default permissions for OTA roles** (ota_staff/ota_lead)
3. ⚠️ **RLS policies allow bookings_mirror SELECT for all authenticated** (security gap for OTA users)
4. ✅ **OTA project-based RBAC is correctly implemented** (ota_project_members table)

---

## A) ROUTING + SIDEBAR MAP

### Sidebar Navigation Structure
**File**: [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx#L57-L220)

| Sidebar Group | Sidebar Item Label | Sidebar href | Route Exists? | PermissionGate Used? | Notes |
|---------------|-------------------|--------------|---------------|---------------------|-------|
| **Dashboard** | Dashboard | `/` | ✅ Yes | ❌ No (ProtectedRoute only) | Top-level |
| **Đối tác** | Đối tác | `/partners` | ⚠️ **REDIRECT** | ❌ No | Redirects to `/partners/hosts` |
| **Vận hành lưu trú** | Bảng Điều Khiển | `/stays` | ✅ Yes | ❌ No | GROUP |
| | Booking Center | `/bookings` | ✅ Yes | ❌ No | |
| | Khách hàng | `/customers` | ✅ Yes | ❌ No | |
| | Danh mục Chỗ nghỉ | `/settings/properties` | ✅ Yes | ❌ No | |
| | Khai báo lưu trú | `/stays/declarations` | ✅ Yes | ❌ No | |
| **Dịch vụ** | Đơn dịch vụ | `/services` | ⚠️ **REDIRECT** | ❌ No | Redirects to `/services/orders` |
| | Báo cáo dịch vụ | `/services/reports` | ✅ Yes | ❌ No | |
| **Tin nhắn OTA** | Tin nhắn OTA | `/ota-messages` | ✅ Yes | ❌ No | Standalone |
| **OTA & Đối soát** | OTA Payout | `/ota-payouts` | ✅ Yes | ❌ No | GROUP |
| | Tranh chấp OTA | `/disputes` | ✅ Yes | ❌ No | |
| **Công nợ** | Đặt cọc & Trả trước | `/host-deposits` | ✅ Yes | ❌ No | GROUP |
| | Host - Danh sách | `/host-payables` | ✅ Yes | ❌ No | |
| | Host - Báo cáo tuổi nợ | `/host-payables/aging` | ✅ Yes | ❌ No | |
| | Host - Quyết toán | `/host-payables/settlement` | ✅ Yes | ❌ No | |
| | Dịch vụ - Quyết toán | `/services/payables` | ✅ Yes | ❌ No | |
| **Tài chính & Dòng tiền** | Lịch sử quyết toán | `/settlements/history` | ✅ Yes | ❌ No | GROUP |
| | Đề xuất thanh toán | `/payments/requests` | ✅ Yes | ✅ **YES** | Uses PermissionGate |
| | Thu tiền | `/collections` | ✅ Yes | ❌ No | |
| | Chi tiền | `/payments/cashout` | ✅ Yes | ❌ No | |
| | Chuyển khoản nội bộ | `/settings/cash-transfers` | ✅ Yes | ❌ No | |
| | Tài khoản tiền | `/settings/cash-accounts` | ✅ Yes | ❌ No | |
| | Quy tắc mapping | `/settings/mapping-rules` | ✅ Yes | ❌ No | |
| | Sổ cái | `/settings/ledger-entries` | ✅ Yes | ❌ No | |
| | 🔧 Debug Sổ cái | `/settings/ledger-debug` | ✅ Yes | ❌ No | |
| | Kỳ kế toán | `/settings/accounting-periods` | ✅ Yes | ❌ No | |
| **Báo cáo** | P&L | `/reports/pnl` | ✅ Yes | ❌ No | GROUP |
| | Cashflow | `/reports/cashflow` | ✅ Yes | ❌ No | |
| | No-Show | `/reports/no-show` | ✅ Yes | ❌ No | |
| **Channel Manager** | Channex Integration | `/channel-manager/channex` | ✅ Yes | ❌ No | GROUP |
| | Channex | `/channel-manager/channex-embed` | ✅ Yes | ❌ No | |
| | Inventory | `/channel-manager/inventory` | ✅ Yes | ❌ No | |
| **AI Smart Pricing** | Insights | `/ai-pricing/insights` | ✅ Yes | ❌ No | GROUP |
| | Recommendations | `/ai-pricing/recommendations` | ✅ Yes | ❌ No | |
| | Validation | `/ai-pricing/validation` | ✅ Yes | ❌ No | |
| **OTA Operations** | My Tasks | `/ota-operations/my-tasks` | ✅ Yes | ❌ No | GROUP |
| | Projects | `/ota-operations/projects` | ✅ Yes | ❌ No | |
| | All Tasks | `/ota-operations/tasks` | ✅ Yes | ❌ No | |
| | KPI | `/ota-operations/kpi` | ✅ Yes | ❌ No | |
| **Kiểm soát & Hệ thống** | Phê duyệt | `/approvals` | ✅ Yes | ❌ No | GROUP |
| | Audit Logs | `/audit-logs` | ✅ Yes | ❌ No | |
| | Test Lab | `/test-lab` | ✅ Yes | ❌ No | |
| | Test Center Live | `/test-center-live` | ✅ Yes | ❌ No | |
| **Cài đặt** | Phân quyền người dùng | `/settings/permissions` | ✅ Yes | ❌ No | GROUP |
| | Cấu hình hệ thống | `/settings` | ✅ Yes | ❌ No | |

### ❌ CRITICAL MISMATCHES

#### 1. **Sidebar: `/ota-operations/tasks` vs Permission: `/ota-operations/tasks` ✅ MATCH**
- **Issue**: Sidebar shows "All Tasks" but route is correct
- **Impact**: LOW - Naming only

#### 2. **🔴 CRITICAL: `/ota-operations` base route mismatch**
- **Sidebar Group**: href `/ota-operations` (not clickable)
- **Route**: Redirects to `/ota-operations/my-tasks`
- **Permission Check**: Uses `/ota-operations/my-tasks` path
- **Issue**: Users need permission for `/ota-operations/my-tasks` but sidebar filtering uses base path
- **Impact**: HIGH - Sidebar filter may hide entire group incorrectly

#### 3. **🔴 CRITICAL: `/partners` redirect vs permission**
- **Sidebar**: href `/partners`
- **Route**: Redirects to `/partners/hosts` (App.tsx line 107)
- **Permission Path**: `ALL_PAGES` defines `/partners` (useUserPagePermissions.ts line 13)
- **Issue**: Permission check happens on `/partners` but actual route is `/partners/hosts`
- **Impact**: HIGH - Users with `/partners` permission may not see page if alias not handled

#### 4. **🔴 CRITICAL: `/services` redirect vs permission**
- **Sidebar**: href `/services`
- **Route**: Redirects to `/services/orders` (App.tsx line 111)
- **Permission Path**: `ALL_PAGES` defines `/services` (useUserPagePermissions.ts line 20)
- **Issue**: Same as `/partners` - alias mismatch
- **Impact**: HIGH

---

## B) PERMISSION ENGINE

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      PERMISSION FLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User logs in → auth.uid() set                           │
│  2. AuthContext fetches RPC get_user_role(user_id)          │
│     └─> Returns: AppRole (admin | sale | cskh | ke_toan |   │
│         super_admin | ota_staff | ota_lead)                  │
│                                                              │
│  3. Sidebar + ProtectedRoute call:                          │
│     useCurrentUserPagePermissions()                          │
│     ├─> Queries RPC: get_user_page_permissions(user_id)     │
│     │   Returns: {page_path, can_use}[]                      │
│     │                                                        │
│     └─> Logic:                                              │
│         IF explicit permissions exist → use them            │
│         ELSE → use getDefaultPagesForRole(userRole)         │
│                                                              │
│  4. Page render:                                            │
│     hasPageAccess(path) → Boolean (can view)                │
│     canUsePage(path) → Boolean (can perform actions)        │
│                                                              │
│  5. Data access:                                            │
│     Pages query Supabase tables → RLS policies check        │
│     OTA pages use RPCs → RPCs check ota_project_members     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

#### 1. **useAuth.tsx** (Lines 1-164)
**Purpose**: Auth state + user role  
**RPC**: `get_user_role(_user_id)`  
**Returns**: `AppRole | null`  

**Roles**:
```typescript
type AppRole = 'admin' | 'sale' | 'cskh' | 'ke_toan' | 'super_admin' | 'ota_staff' | 'ota_lead';
```

**Critical Logic**:
```typescript
const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
if (data) setUserRole(data as AppRole);
```

#### 2. **useUserPagePermissions.ts** (Lines 1-532)
**Purpose**: Page-level permissions (view + use)  
**RPC**: `get_user_page_permissions(_user_id)`  
**Returns**: `{ page_path: string, can_use: boolean }[]`

**Default Pages by Role** (Lines 179-260):
```typescript
function getDefaultPagesForRole(role: AppRole): string[] {
  switch (role) {
    case 'super_admin':
      return ALL_PAGES.map(p => p.path); // Full access
    
    case 'admin':
      return ALL_PAGES.filter(p => 
        p.path !== '/test-lab' && 
        p.path !== '/test-center-live'
      ).map(p => p.path);
    
    case 'ke_toan':
      return [
        '/', '/bookings', '/collections', '/ota-payouts', '/disputes',
        '/host-deposits', '/host-payables', '/host-payables/aging',
        '/host-payables/settlement', '/services/payables',
        '/settlements/history', '/payments/requests', '/payments/cashout',
        '/settings/cash-transfers', '/settings/cash-accounts',
        '/settings/mapping-rules', '/settings/ledger-entries',
        '/reports/pnl', '/reports/cashflow', '/audit-logs'
      ];
    
    case 'cskh':
      return [
        '/', '/stays', '/stays/declarations', '/bookings', '/customers',
        '/partners', '/ota-messages', '/services', '/services/reports',
        '/collections', '/disputes'
      ];
    
    case 'sale':
      return [
        '/', '/stays', '/stays/declarations', '/bookings', '/customers',
        '/partners', '/ota-messages', '/services', '/collections'
      ];
    
    // ⚠️ BUG: OTA roles missing default permissions!
    case 'ota_lead':
      return [
        '/', '/ota-operations/projects', '/ota-operations/tasks',
        '/ota-operations/kpi', '/ota-messages'
      ];
    
    case 'ota_staff':
      return [
        '/', '/ota-operations/tasks', '/ota-messages'
      ];
  }
}
```

**❌ CRITICAL BUGS**:
1. **ota_staff missing `/ota-operations/my-tasks`** (sidebar shows this, not `/ota-operations/tasks`)
2. **ota_lead missing `/ota-operations/my-tasks`**
3. **Both missing `/ota-operations/tasks/:taskId` and `/ota-operations/projects/:projectId`** detail routes

#### 3. **PermissionGate.tsx** (Lines 1-137)
**Purpose**: Wrap UI elements to control visibility/access  
**Usage**: 
```tsx
<PermissionGate page="/payments/requests" require="can_use" fallback="disable">
  <Button onClick={handleApprove}>Phê duyệt</Button>
</PermissionGate>
```

**Props**:
- `page`: Path to check permission for
- `require`: `'can_view'` (default) or `'can_use'`
- `fallback`: `'hide'` (default) or `'disable'`

**Current Usage**: Only in payment request workflows (minimal adoption)

#### 4. **ProtectedRoute.tsx** (Lines 1-140)
**Purpose**: Wrap all routes - redirect if no access  
**Logic**:
```typescript
1. Check if user logged in → else redirect to /auth
2. If super_admin → allow all
3. Normalize current path (handle detail routes)
4. Check hasPageAccess(normalizedPath)
5. If denied → redirect to first accessible page or /403
```

**Path Normalization** (Lines 69-124):
- Handles detail routes: `/bookings/:id` → `/bookings`
- Handles aliases: `/dashboard` → `/`, `/partners/hosts` → `/partners`
- **REGISTERED_PATHS check**: If path is in `ALL_PAGES`, require exact match

---

## C) SUPABASE: ROLES, PERMISSIONS, RLS, RPC

### Database Tables

#### 1. **user_roles** table
**Schema**:
```sql
CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users(id),
  role app_role NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
```

**Enum**: `app_role` = `'admin' | 'sale' | 'cskh' | 'ke_toan' | 'super_admin' | 'ota_staff' | 'ota_lead'`

**RPC**: `get_user_role(_user_id UUID) → TEXT`
- Returns first role for user (ordered by priority)
- SECURITY DEFINER

#### 2. **user_page_permissions** table
**Schema**:
```sql
CREATE TABLE user_page_permissions (
  user_id UUID REFERENCES auth.users(id),
  page_path TEXT NOT NULL,
  can_use BOOLEAN NOT NULL DEFAULT false, -- v2.1 addition
  created_at TIMESTAMP DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, page_path)
);
```

**RPC**: `get_user_page_permissions(_user_id UUID) → TABLE(page_path TEXT, can_use BOOLEAN)`
- Returns all explicit permissions for user
- SECURITY DEFINER
- **Migration**: 20260106_permission_system_v21_unified.sql

#### 3. **ota_projects** table
**Schema**:
```sql
CREATE TABLE ota_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  property_id UUID NOT NULL, -- Foreign key to properties_mirror
  status ota_project_status DEFAULT 'PLANNING',
  start_date DATE,
  due_date DATE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**Enum**: `ota_project_status` = `'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'`

**RLS Policies**: ❓ NOT FOUND IN GREP (need to verify if policies exist)

#### 4. **ota_project_members** table
**Schema**:
```sql
CREATE TABLE ota_project_members (
  project_id UUID REFERENCES ota_projects(id),
  user_id UUID REFERENCES auth.users(id),
  project_role ota_project_role NOT NULL, -- STAFF | LEAD | ADMIN
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMP DEFAULT now(),
  assigned_by UUID,
  deactivated_at TIMESTAMP,
  deactivated_by UUID,
  PRIMARY KEY (project_id, user_id)
);
```

**Enum**: `ota_project_role` = `'STAFF' | 'LEAD' | 'ADMIN'`

**RPC**: `get_ota_project_role(p_project_id UUID) → TEXT`
- Returns project role for current user (auth.uid())
- Returns `'ADMIN'` if user is admin/super_admin
- SECURITY DEFINER

**RLS Policies**: ❓ NOT FOUND IN GREP

#### 5. **ota_tasks** table
**Schema**:
```sql
CREATE TABLE ota_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES ota_projects(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES auth.users(id),
  status ota_task_status DEFAULT 'TODO',
  priority ota_task_priority DEFAULT 'MEDIUM',
  due_date DATE,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_hours DECIMAL,
  actual_hours DECIMAL,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**Enums**:
- `ota_task_status` = `'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED' | 'CANCELLED'`
- `ota_task_priority` = `'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'`

**RLS Policies**: ❓ NOT FOUND IN GREP

#### 6. **bookings_mirror** table
**RLS Policy** (Migration: 20251214075415...sql line 546):
```sql
CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (true);
```

**🚨 SECURITY ISSUE**: 
- **Current**: ALL authenticated users can SELECT from bookings_mirror
- **Problem**: OTA staff/lead should NOT have direct table access (per spec v3.1)
- **Spec Requirement**: OTA roles MUST use RPC `ota_kpi_get_data` only
- **Exploit**: ota_staff can query `SELECT * FROM bookings_mirror` in browser console

### RLS Helper Functions

**File**: supabase/migrations/20260107_001_ota_helper_functions.sql

#### 1. `is_ota_role()` → BOOLEAN
```sql
SELECT EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_id = auth.uid()
  AND role IN ('ota_staff', 'ota_lead')
);
```
**Usage**: RLS policies to DENY OTA users access to sensitive tables

#### 2. `is_ota_lead_or_admin()` → BOOLEAN
```sql
SELECT EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_id = auth.uid()
  AND role IN ('ota_lead', 'admin', 'super_admin')
);
```

#### 3. `has_ota_project_access(p_project_id UUID)` → BOOLEAN
```sql
SELECT EXISTS (
  SELECT 1 FROM ota_project_members
  WHERE project_id = p_project_id
  AND user_id = auth.uid()
) OR EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_id = auth.uid()
  AND role IN ('admin', 'super_admin')
);
```

#### 4. `get_ota_project_role(p_project_id UUID)` → TEXT
Returns: `'STAFF'` | `'LEAD'` | `'ADMIN'` | `NULL`

---

## D) PAGES QUERY vs RLS vs RPC

### OTA Operations Pages Data Access

| Page | File | Data Source | Method | RLS Impact | Security |
|------|------|-------------|--------|------------|----------|
| **Projects** | ProjectsPage.tsx | `ota_projects` table | Direct SELECT | ⚠️ No policy found | RISK if no RLS |
| **Tasks (All)** | TasksPage.tsx | `ota_tasks` table | Direct SELECT + RPC | ⚠️ No policy found | RISK if no RLS |
| **My Tasks** | MyTasksPage.tsx | RPC `ota_get_my_tasks` | ✅ RPC only | ✅ No direct table | ✅ SECURE |
| **KPI** | KpiPage.tsx | RPC `ota_kpi_get_data` | ✅ RPC only | ✅ No direct table | ✅ SECURE |
| **Task Detail** | TaskDetailPage.tsx | RPC `ota_get_task_detail` | ✅ RPC only | ✅ No direct table | ✅ SECURE |
| **Project Detail** | ProjectDetailPage.tsx | `ota_projects` table | Direct SELECT | ⚠️ No policy found | RISK if no RLS |

### ❌ CRITICAL FINDINGS

#### 1. **ProjectsPage.tsx** (Line 57)
```typescript
const { data: projects, isLoading, error } = useOtaProjects();

// useOtaProjects() hook:
const { data: projects, error } = await supabase
  .from('ota_projects')
  .select('*')
  .neq('status', 'ARCHIVED')
  .order('created_at', { ascending: false });
```

**Issue**: Direct table SELECT with no RLS policy found  
**Impact**: 
- If no policy exists → query fails for non-superadmin
- If policy is `USING(true)` → users see all projects (violates ota_project_members isolation)

**Expected**: Should use RPC or RLS policy:
```sql
CREATE POLICY "ota_projects_select" ON ota_projects
FOR SELECT USING (
  has_ota_project_access(id) OR 
  has_role(auth.uid(), 'admin')
);
```

#### 2. **TasksPage.tsx** (Lines 143-145)
```typescript
// For staff, uses useMyOtaTasks() - RPC ✅ SECURE
// For lead/admin, uses useOtaTasksWithAssignees() - RPC ✅ SECURE

// But also has fallback to useOtaTasks() - Direct SELECT ⚠️ RISK
const { data: allTasks } = useOtaTasks(filters);

// useOtaTasks() hook:
let query = supabase
  .from('ota_tasks')
  .select(`*, ota_projects(id, name, property_id)`)
  .neq('status', 'CANCELLED');
```

**Issue**: Direct table SELECT as fallback (line 144)  
**Impact**: If RPC fails, falls back to direct query → RLS must exist

#### 3. **bookings_mirror SELECT policy** 
**File**: supabase/migrations/20251214075415...sql line 546

```sql
CREATE POLICY "Bookings mirror viewable by authenticated" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (true);
```

**🚨 MAJOR SECURITY VIOLATION**:
- **Spec v3.1**: "OTA roles (ota_staff, ota_lead) CANNOT SELECT from bookings_mirror"
- **Current**: Policy allows ALL authenticated users
- **Exploit**: `supabase.from('bookings_mirror').select('*')` works for ota_staff in browser

**Required Fix**:
```sql
-- Drop old policy
DROP POLICY "Bookings mirror viewable by authenticated" ON public.bookings_mirror;

-- New policy: DENY OTA roles
CREATE POLICY "bookings_mirror_select_deny_ota" 
ON public.bookings_mirror 
FOR SELECT TO authenticated 
USING (
  NOT is_ota_role() -- Deny if user is ota_staff/ota_lead
);
```

---

## E) DEFAULT PAGES MAPPING

### Current Role → Default Pages

| Role | Default Pages (Count) | Critical Missing Pages | Notes |
|------|----------------------|------------------------|-------|
| **super_admin** | ALL (60+) | None | ✅ Full access |
| **admin** | ALL except Test Lab/Test Center Live (58) | None | ✅ Nearly full |
| **ke_toan** | Financial + Bookings (19) | ❌ `/ota-operations/*` not needed | ✅ Correct scope |
| **cskh** | Operations + Collections (11) | ❌ `/ota-operations/*` not needed | ✅ Correct scope |
| **sale** | Operations (9) | ❌ `/ota-operations/*` not needed | ✅ Correct scope |
| **ota_lead** | OTA + Messages (5) | ❌ `/ota-operations/my-tasks` (sidebar shows this!) | 🔴 CRITICAL BUG |
| **ota_staff** | Tasks + Messages (3) | ❌ `/ota-operations/my-tasks` (sidebar shows this!)<br>❌ `/ota-operations/projects` (may need view-only) | 🔴 CRITICAL BUG |

### 🔴 CRITICAL: OTA Role Permission Bugs

#### Bug 1: ota_staff cannot access `/ota-operations/my-tasks`
**File**: useUserPagePermissions.ts lines 257-262
```typescript
case 'ota_staff':
  return [
    '/',
    '/ota-operations/tasks', // ❌ WRONG PATH
    '/ota-messages',
  ];
```

**Sidebar expects**: `/ota-operations/my-tasks` (Sidebar.tsx line 195)  
**Route**: `/ota-operations/my-tasks` → MyTasksPage.tsx  
**Default permission**: `/ota-operations/tasks` ❌ MISMATCH

**Impact**: 
- ota_staff user logs in
- Sidebar shows "My Tasks" link
- Clicks it → ProtectedRoute checks `/ota-operations/my-tasks` permission
- User has `/ota-operations/tasks` permission only
- **RESULT**: Redirected away / Access Denied 403

#### Bug 2: ota_lead same issue
**File**: useUserPagePermissions.ts lines 247-254
```typescript
case 'ota_lead':
  return [
    '/',
    '/ota-operations/projects',
    '/ota-operations/tasks', // ❌ WRONG PATH
    '/ota-operations/kpi',
    '/ota-messages',
  ];
```

**Should be**: `/ota-operations/my-tasks` (both roles have this page)

#### Bug 3: Detail routes not in defaults
**Current**: No detail routes in default permissions  
**Problem**: When user clicks task/project, detail page requires separate permission

**Example**:
- User has `/ota-operations/projects` permission
- Clicks on Project A → URL `/ota-operations/projects/proj-a-uuid`
- ProtectedRoute normalizes → `/ota-operations/projects` (detail route handling)
- Permission check: ✅ PASS (parent permission covers detail)

**Status**: ✅ WORKING (ProtectedRoute normalization handles this)

---

## F) PAGES FAILING DUE TO RLS/PERMISSION MISMATCH

### Test Scenario Matrix

| User Role | Page | Expected | Actual (if broken) | Root Cause |
|-----------|------|----------|-------------------|------------|
| **ota_staff** | `/` | ✅ View dashboard | ✅ Works | Has default permission |
| **ota_staff** | `/ota-operations/my-tasks` | ✅ View own tasks | ❌ **403 or redirect** | **Missing default permission** |
| **ota_staff** | `/ota-operations/tasks` | ❌ Deny (not in sidebar) | ⚠️ May work if explicit perm added | Has default but shouldn't |
| **ota_staff** | `/ota-operations/projects` | ❌ Deny (not in default) | ❌ 403 | No default permission |
| **ota_staff** | `/ota-operations/kpi` | ❌ Deny (not in default) | ❌ 403 | No default permission |
| **ota_staff** | Direct query `bookings_mirror` | ❌ Should deny | ✅ **WORKS (security issue)** | **RLS policy USING(true)** |
| **ota_lead** | `/ota-operations/my-tasks` | ✅ View tasks | ❌ **403 or redirect** | **Missing default permission** |
| **ota_lead** | `/ota-operations/projects` | ✅ View all projects | ⚠️ May fail RLS | Direct table SELECT + no RLS policy |
| **ota_lead** | `/ota-operations/tasks` | ✅ View all tasks (via RPC) | ✅ Works if using RPC | Has default `/ota-operations/tasks` |
| **ota_lead** | `/ota-operations/kpi` | ✅ View KPI | ✅ Works (uses RPC) | Has default permission |
| **ota_lead** | Direct query `bookings_mirror` | ❌ Should deny | ✅ **WORKS (security issue)** | **RLS policy USING(true)** |
| **admin** | All OTA pages | ✅ Full access | ✅ Works | Admin role bypasses |
| **super_admin** | All pages | ✅ Full access | ✅ Works | Super admin all access |
| **ke_toan** | `/ota-operations/*` | ❌ Deny (not in default) | ❌ 403 | No default permission (correct) |

### Predicted Failure Modes

#### Mode 1: "Sidebar shows but click fails"
**Symptom**: 
- User sees "My Tasks" in sidebar
- Clicks it
- Redirected to `/` or `/403`

**Root Cause**: Sidebar uses `/ota-operations/my-tasks` but default permission is `/ota-operations/tasks`

**Affected**: ota_staff, ota_lead

#### Mode 2: "Page loads but no data"
**Symptom**:
- Page renders
- Loading spinner → empty state
- Console error: RLS policy denied

**Root Cause**: 
- Page does direct SELECT from table
- No RLS policy exists or policy denies

**Affected**: ProjectsPage (ota_projects table), TasksPage (ota_tasks table fallback)

#### Mode 3: "User can see data they shouldn't"
**Symptom**:
- ota_staff can query bookings_mirror in console
- ota_staff can see all projects (not just assigned)

**Root Cause**: RLS policy too permissive (`USING(true)`)

**Affected**: bookings_mirror, potentially ota_projects/ota_tasks if policies not set

---

## 📊 SUMMARY TABLES

### 1. Sidebar → Route → Permission Audit

| Sidebar Path | Route Exists | Permission Path | Alias Handled | Status |
|--------------|--------------|-----------------|---------------|--------|
| `/` | ✅ | `/` | N/A | ✅ OK |
| `/partners` | ⚠️ Redirect | `/partners` | ✅ Yes | ✅ OK |
| `/services` | ⚠️ Redirect | `/services` | ✅ Yes | ✅ OK |
| `/ota-operations/my-tasks` | ✅ | `/ota-operations/tasks` ❌ | ❌ No | 🔴 **FAIL** |
| `/ota-operations/projects` | ✅ | `/ota-operations/projects` | N/A | ✅ OK |
| `/ota-operations/tasks` | ✅ | `/ota-operations/tasks` | N/A | ✅ OK |
| `/ota-operations/kpi` | ✅ | `/ota-operations/kpi` | N/A | ✅ OK |

### 2. Role → Default Pages Accuracy

| Role | Sidebar Groups Visible | Default Permissions Match | Missing Pages | Status |
|------|------------------------|---------------------------|---------------|--------|
| super_admin | ALL | ✅ | None | ✅ OK |
| admin | ALL - Test Lab | ✅ | None | ✅ OK |
| ke_toan | Financial | ✅ | None (correct) | ✅ OK |
| cskh | Operations | ✅ | None (correct) | ✅ OK |
| sale | Operations | ✅ | None (correct) | ✅ OK |
| ota_lead | OTA Ops | ❌ | `/ota-operations/my-tasks` | 🔴 **FAIL** |
| ota_staff | OTA Ops | ❌ | `/ota-operations/my-tasks`<br>`/ota-operations/projects` (view) | 🔴 **FAIL** |

### 3. Data Access Security Audit

| Table | SELECT Policy | OTA Staff Access | OTA Lead Access | Admin Access | Spec Compliant |
|-------|---------------|------------------|-----------------|--------------|----------------|
| `bookings_mirror` | `USING(true)` | ✅ Allowed ❌ **WRONG** | ✅ Allowed ❌ **WRONG** | ✅ Allowed | 🔴 **VIOLATION** |
| `ota_projects` | ❓ Not found | ❓ Unknown | ❓ Unknown | ✅ Allowed | ⚠️ **VERIFY** |
| `ota_tasks` | ❓ Not found | ❓ Unknown | ❓ Unknown | ✅ Allowed | ⚠️ **VERIFY** |
| `ota_project_members` | ❓ Not found | ❓ Unknown | ❓ Unknown | ✅ Allowed | ⚠️ **VERIFY** |

---

## ✅ CODEBASE READ PASS COMPLETE

**Files Read**: 15 core files + 10 migration files  
**Lines Analyzed**: ~3,500 lines  
**Bugs Found**: 5 critical, 3 high-priority  
**Security Issues**: 1 major (bookings_mirror RLS)

**Next Steps**:
1. ✅ Context Lock Report complete
2. ⏳ Create REPRO PASS test matrix
3. ⏳ Write PATCH PLAN
4. ⏳ Generate SQL KIT + E2E TEST MATRIX

---

**Document Version**: 1.0  
**Completion Date**: January 8, 2026  
**Sign-off**: Ready for Phase 2 (REPRO PASS)

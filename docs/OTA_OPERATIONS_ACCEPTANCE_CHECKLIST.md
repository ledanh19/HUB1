# OTA Operations Module - Acceptance Checklist

> **Version:** 1.0 (Post v3.1 Spec)  
> **Date:** 2026-01-07  
> **Module:** OTA Operations  
> **Purpose:** Task management for OTA team personnel (NOT channel management)

---

## 📋 Pre-Deployment Checklist

### 1. Migration Files Created

| # | File | Status | Description |
|---|------|--------|-------------|
| 001 | `20260107_001_ota_helper_functions.sql` | ✅ | Core helper functions (is_ota_role, normalize_ota_source) |
| 002 | `20260107_002_ota_rls_drop_replace.sql` | ✅ | RLS DROP + REPLACE for sensitive tables |
| 003 | `20260107_003_ota_kpi_index.sql` | ✅ | Performance index for KPI aggregation |
| 004 | `20260107_004_ota_projects.sql` | ✅ | Projects table with RLS |
| 005 | `20260107_005_ota_project_members.sql` | ✅ | Project membership table |
| 006 | `20260107_006_ota_tasks.sql` | ✅ | Tasks table with full lifecycle |
| 007 | `20260107_007_ota_task_evidence.sql` | ✅ | Evidence table (Model A: content immutable) |
| 008 | `20260107_008_ota_task_rpcs.sql` | ✅ | Task lifecycle RPCs |
| 009 | `20260107_009_ota_evidence_rpcs.sql` | ✅ | Evidence submission & review RPCs |
| 010 | `20260107_010_ota_kpi_rpc.sql` | ✅ | KPI aggregation RPC (SECURITY DEFINER) |
| 011 | `20260107_011_ota_roles.sql` | ✅ | ota_staff, ota_lead roles |
| 012 | `20260107_012_ota_permissions.sql` | ✅ | Grants, storage, audit log |

---

## 🔐 Security Verification Checklist

### 2. Helper Functions Security

| Function | SECURITY DEFINER | search_path | REVOKE PUBLIC | GRANT authenticated |
|----------|-----------------|-------------|---------------|---------------------|
| `is_ota_role()` | ✅ | ✅ `public` | ✅ | ✅ |
| `is_ota_lead_or_admin()` | ✅ | ✅ `public` | ✅ | ✅ |
| `normalize_ota_source()` | ✅ IMMUTABLE | ✅ `public` | ✅ | ✅ |
| `has_ota_project_access()` | ✅ | ✅ `public` | ✅ | ✅ |
| `get_ota_project_role()` | ✅ | ✅ `public` | ✅ | ✅ |
| `raise_immutable_error()` | ✅ | ✅ `public` | ✅ | ✅ |

### 3. RLS Policy Verification

| Table | Original Policy | DROP Command | New Policy | Deny OTA |
|-------|----------------|--------------|------------|----------|
| `bookings_mirror` | `USING(true)` | ✅ DROP | `viewable except ota` | ✅ `NOT is_ota_role()` |
| `cashflow_entries` | `USING(true)` | ✅ DROP | `viewable except ota` | ✅ |
| `ota_payouts` | `USING(true)` | ✅ DROP | `viewable except ota` | ✅ |
| `host_payables` | `USING(true)` | ✅ DROP | `viewable except ota` | ✅ |
| `partners` | `USING(true)` | ✅ DROP | `viewable except ota` | ✅ |
| `guest_documents` | Multiple | ✅ DROP all | `except ota and ketoan` | ✅ Combined |

### 4. KPI RPC Security Verification

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| RPC only, NO VIEW | `ota_get_kpi()` function | ✅ |
| SECURITY DEFINER | All KPI functions | ✅ |
| Date axis = `booking_date` | Used in WHERE clause | ✅ |
| Status filter = `CONFIRMED` | `WHERE booking_status = 'CONFIRMED'` | ✅ |
| Max date range = 400 days | Clamped with warning in response | ✅ |
| Property FK = `properties_mirror.id` | JOIN via `channex_property_id` | ✅ |
| Uses `normalize_ota_source()` | IMMUTABLE function called | ✅ |

---

## 🗃️ Data Model Verification

### 5. Tables Structure

| Table | Primary Key | Property FK | Audit Trail | RLS Enabled |
|-------|-------------|-------------|-------------|-------------|
| `ota_projects` | UUID | `properties_mirror.id` | ✅ created_at/by, updated_at/by | ✅ |
| `ota_project_members` | Composite (project_id, user_id) | N/A | ✅ assigned_at/by | ✅ |
| `ota_tasks` | UUID | Via project | ✅ Full audit | ✅ |
| `ota_task_evidence` | UUID | Via task→project | ✅ created_at/by | ✅ |
| `ota_audit_log` | UUID | project_id FK | N/A (is audit) | ✅ Admin only |

### 6. Evidence Immutability (Model A)

| Field | Immutable | Mutable | Trigger Protection |
|-------|-----------|---------|-------------------|
| `task_id` | ✅ | | `enforce_ota_evidence_immutability()` |
| `evidence_type` | ✅ | | ✅ |
| `file_url` | ✅ | | ✅ |
| `file_name` | ✅ | | ✅ |
| `description` | ✅ | | ✅ |
| `created_at` | ✅ | | ✅ |
| `created_by` | ✅ | | ✅ |
| `review_status` | | ✅ | Allowed |
| `reviewed_at` | | ✅ | Allowed |
| `reviewed_by` | | ✅ | Allowed |
| `review_notes` | | ✅ | Allowed |

---

## 🧪 Test Cases

### 7. Unit Tests Required

```sql
-- Test 1: OTA role cannot SELECT bookings_mirror directly
SET ROLE authenticated;
SET request.jwt.claims = '{"role": "ota_staff"}';
SELECT * FROM bookings_mirror; -- Should return 0 rows

-- Test 2: OTA role CAN access KPI via RPC
SELECT public.ota_get_kpi('2025-01-01', '2025-12-31');
-- Should return success: true with data

-- Test 3: Evidence immutability
UPDATE ota_task_evidence SET file_url = 'hacked.jpg' WHERE id = '...';
-- Should fail with IMMUTABLE_FIELD error

-- Test 4: Date clamping
SELECT public.ota_get_kpi('2020-01-01', '2025-12-31');
-- Should return date_clamped: true in meta

-- Test 5: Self-review prevention
-- As user who submitted evidence:
SELECT public.ota_review_evidence('evidence_id', 'APPROVED');
-- Should fail with SELF_REVIEW error
```

### 8. Integration Test Scenarios

| Scenario | Expected Result | Verified |
|----------|-----------------|----------|
| OTA Staff creates task in assigned project | ✅ Success | ☐ |
| OTA Staff creates task in unassigned project | ❌ PROJECT_ACCESS_DENIED | ☐ |
| OTA Lead assigns task to Staff | ✅ Success | ☐ |
| OTA Staff assigns task to another Staff | ❌ ACCESS_DENIED | ☐ |
| Staff submits evidence for own task | ✅ Success | ☐ |
| Lead reviews evidence (not own) | ✅ Success | ☐ |
| Lead reviews own evidence | ❌ SELF_REVIEW | ☐ |
| Staff tries to SELECT host_payables | ❌ Empty result (RLS) | ☐ |
| Admin assigns ota_staff role | ✅ Success | ☐ |
| Non-admin assigns ota_staff role | ❌ ACCESS_DENIED | ☐ |

---

## 📊 Performance Verification

### 9. Index Verification

```sql
-- Verify indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'bookings_mirror' 
AND indexname LIKE '%kpi%' OR indexname LIKE '%ota%';

-- Expected indexes:
-- idx_bookings_mirror_kpi_ota (channex_property_id, booking_status, booking_date)
-- idx_bookings_mirror_ota_source (ota_source)
```

### 10. Query Plan Check

```sql
EXPLAIN ANALYZE
SELECT 
  normalize_ota_source(ota_source) as channel,
  COUNT(*) as booking_count
FROM bookings_mirror
WHERE booking_status = 'CONFIRMED'
  AND booking_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY normalize_ota_source(ota_source);

-- Should show Index Scan on idx_bookings_mirror_kpi_ota
```

---

## 🚀 Deployment Steps

### 11. Migration Execution Order

```bash
# MUST run in this exact order
supabase migration up --file 20260107_001_ota_helper_functions.sql
supabase migration up --file 20260107_002_ota_rls_drop_replace.sql
supabase migration up --file 20260107_003_ota_kpi_index.sql
supabase migration up --file 20260107_004_ota_projects.sql
supabase migration up --file 20260107_005_ota_project_members.sql
supabase migration up --file 20260107_006_ota_tasks.sql
supabase migration up --file 20260107_007_ota_task_evidence.sql
supabase migration up --file 20260107_008_ota_task_rpcs.sql
supabase migration up --file 20260107_009_ota_evidence_rpcs.sql
supabase migration up --file 20260107_010_ota_kpi_rpc.sql
supabase migration up --file 20260107_011_ota_roles.sql
supabase migration up --file 20260107_012_ota_permissions.sql
```

### 12. Post-Deployment Verification

```sql
-- Check all OTA objects created
SELECT * FROM public.ota_security_summary;

-- Verify storage bucket
SELECT * FROM storage.buckets WHERE id = 'ota-evidence';

-- Verify enum values
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = 'public.app_role'::regtype
AND enumlabel LIKE 'ota_%';
```

---

## ⚠️ Anti-Scope Verification

### 13. What This Module Does NOT Do

| Feature | Status | Verified |
|---------|--------|----------|
| Channel Manager functionality | ❌ NOT INCLUDED | ☐ |
| OTA API integrations (Booking.com, Agoda, etc.) | ❌ NOT INCLUDED | ☐ |
| Pricing management | ❌ NOT INCLUDED | ☐ |
| Booking CRUD operations | ❌ NOT INCLUDED | ☐ |
| Finance/accounting operations | ❌ NOT INCLUDED | ☐ |
| Guest communication | ❌ NOT INCLUDED | ☐ |
| Property management | ❌ NOT INCLUDED | ☐ |

---

## ✅ Final Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Principal Architect | | | |
| Security Review | | | |
| QA Lead | | | |
| Product Owner | | | |

---

## 📝 Notes

- **SSOT Property**: Always use `properties_mirror.id` (UUID), never text matching
- **KPI Date Axis**: `booking_date`, not `check_in_date`
- **KPI Status**: `CONFIRMED` only
- **RLS Pattern**: DROP existing USING(true) before CREATE new policy
- **Evidence**: Content immutable, review fields mutable (Model A)

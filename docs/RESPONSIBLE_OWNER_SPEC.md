# RESPONSIBLE OWNER SPECIFICATION
## Gán Phụ Trách & Chuyển Giao Phụ Trách - Logic Hoàn Chỉnh

**Version:** 1.1  
**Date:** 2026-01-07  
**Status:** ✅ Phase 1 IMPLEMENTED  

---

## A. TỔNG QUAN HỆ THỐNG HIỆN TẠI

### A1. Kiến trúc đã triển khai

```
┌─────────────────────────────────────────────────────────────────┐
│                     RESPONSIBLE OWNER SYSTEM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Frontend   │───▶│  audit_logs  │◀───│  Realtime    │       │
│  │  (React)     │    │  (Database)  │    │  (Supabase)  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │           useResponsibleOwner Hook                    │       │
│  │  - useDerivedOwner() ← PRIMARY SOURCE                │       │
│  │  - assignOwner()                                      │       │
│  │  - transferOwner()                                    │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### A2. Files liên quan

| File | Mục đích | Trạng thái |
|------|----------|------------|
| `src/hooks/useResponsibleOwner.ts` | Hook chính quản lý owner | ✅ Đã có |
| `src/lib/responsible-owner-types.ts` | Types & constants | ✅ Đã có |
| `src/components/booking/AssignOwnerDialog.tsx` | UI gán/chuyển giao | ✅ Đã có |
| `src/components/ui/ResponsibleOwnerBadge.tsx` | Hiển thị owner badge | ✅ Đã có |
| `supabase/migrations/*audit_logs*.sql` | Database schema | ✅ Đã có |

---

## B. TRẠNG THÁI TRIỂN KHAI

### B1. ĐÃ CÓ (Implemented) ✅

| Tính năng | Mô tả | Code |
|-----------|-------|------|
| **Owner từ audit_logs** | Xác định owner từ action gần nhất trong DB | `useDerivedOwner()` |
| **Gán thủ công** | Admin/user gán owner qua dialog | `AssignOwnerDialog` |
| **Chuyển giao trực tiếp** | Đổi owner sang user khác (1 bước) | `transferOwner()` |
| **Auto-assign on action** | Tự gán khi Check-in, Checkout, etc | `ASSIGN_OWNER_ACTIONS` |
| **Realtime sync** | Đồng bộ owner qua Supabase Realtime | Channel subscription |
| **Batch fetch** | Fetch owner cho nhiều booking hiệu quả | `useDerivedOwnersBatch()` |
| **User profile cache** | Cache profile để tránh N+1 queries | `useUserProfileCache()` |
| **Audit log mỗi action** | Mọi gán/chuyển đều ghi vào audit_logs | `saveOwnerToDatabase()` |

### B2. CHƯA CÓ (Not Implemented) ⚠️

| Tính năng | Mô tả | Lý do chưa có |
|-----------|-------|---------------|
| **Phân quyền Admin/Non-Admin** | Admin gán bất kỳ, Non-admin chỉ tự nhận | Chưa enforce |
| **Transfer Request (2 bước)** | Non-admin đề xuất → người nhận xác nhận | Chưa có table/flow |
| **RLS cho assignee** | Block non-admin update assignee_id | Chưa có RLS policy |
| **Kiểm tra same tenant** | Không cho gán chéo tenant | Single-tenant hiện tại |
| **Kiểm tra user active** | Chỉ gán user đang active | Chưa validate |

---

## C. LOGIC GÁN PHỤ TRÁCH (Đã chốt)

### C1. Định nghĩa Actions gán owner

```typescript
// src/lib/responsible-owner-types.ts
export const ASSIGN_OWNER_ACTIONS = [
  // Auto-assign on meaningful operations
  "Check-in",
  "Check-out",
  "Tạo segment",
  "Phân bổ phòng Host",
  "Đổi phòng Host",
  "Thu tiền",
  "Xác nhận thanh toán",
  "Đánh dấu No-show",
  
  // Manual assignment
  "Gán thủ công",
  "Gán người phụ trách",
  "Chuyển giao trách nhiệm",
  "Segment created",
  "No-show marked",
] as const;
```

### C2. Quy tắc gán (Current Implementation)

| Trường hợp | Hành vi hiện tại | Cần thêm |
|------------|------------------|----------|
| Entity chưa có owner + User thao tác | ✅ Gán user thao tác | - |
| Entity đã có owner + User thao tác | ✅ Giữ nguyên owner | - |
| Admin gán manual | ✅ Gán bất kỳ user | - |
| Non-admin gán manual | ⚠️ Cũng gán được | **Cần restrict** |

### C3. Data Flow hiện tại

```
User Action (Check-in, etc)
        │
        ▼
┌───────────────────────────────────┐
│ useResponsibleOwner.assignOwner() │
│                                   │
│ 1. Check entity đã có owner?      │
│    - Có: return existing          │
│    - Chưa: continue               │
│                                   │
│ 2. Check action có trong          │
│    ASSIGN_OWNER_ACTIONS?          │
│    - Có: create owner record      │
│    - Không: return null           │
│                                   │
│ 3. saveOwnerToDatabase()          │
│    INSERT INTO audit_logs         │
│                                   │
│ 4. Invalidate queries             │
└───────────────────────────────────┘
        │
        ▼
   audit_logs table
   (action, entity_id, user_id, event_time)
```

---

## D. LOGIC CHUYỂN GIAO PHỤ TRÁCH (Đã chốt)

### D1. Chuyển giao 1 bước (Hiện tại - Admin flow)

```
Admin clicks "Chuyển giao"
        │
        ▼
┌───────────────────────────────────┐
│ AssignOwnerDialog                 │
│                                   │
│ 1. Chọn user mới                  │
│ 2. transferOwner(newUserId)       │
│    - INSERT audit_logs            │
│      action: "Chuyển giao TN"     │
│    - Invalidate queries           │
│                                   │
│ 3. New owner effective NGAY       │
└───────────────────────────────────┘
```

### D2. Chuyển giao 2 bước (Cần implement - Non-admin flow)

```
Non-admin đề xuất chuyển giao
        │
        ▼
┌───────────────────────────────────┐
│ STEP 1: Create Transfer Request   │
│                                   │
│ INSERT INTO transfer_requests     │
│ - entity_type: 'booking'          │
│ - entity_id: booking_id           │
│ - from_user_id: current_owner     │
│ - to_user_id: selected_user       │
│ - status: 'PENDING'               │
│ - created_at: now()               │
│                                   │
│ Owner: KHÔNG ĐỔI (vẫn là from)    │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ STEP 2: Recipient Action          │
│                                   │
│ ACCEPT:                           │
│ - UPDATE transfer_requests        │
│   SET status = 'ACCEPTED'         │
│ - INSERT audit_logs               │
│   action: 'TRANSFER_ACCEPTED'     │
│ - New owner effective             │
│                                   │
│ REJECT:                           │
│ - UPDATE transfer_requests        │
│   SET status = 'REJECTED'         │
│ - Owner: KHÔNG ĐỔI               │
└───────────────────────────────────┘
```

**⚠️ DECISION: 2-step transfer KHÔNG BẬT ở Phase 1**

---

## E. PHÂN QUYỀN ✅ IMPLEMENTED

### E1. Ma trận quyền

| Role | Gán chính mình | Gán người khác | Đổi owner | Gỡ owner |
|------|----------------|----------------|-----------|----------|
| **super_admin** | ✅ | ✅ | ✅ Trực tiếp | ✅ |
| **admin** | ✅ | ✅ | ✅ Trực tiếp | ✅ |
| **ke_toan** | ✅ | ❌ BLOCKED | ❌ BLOCKED | ❌ BLOCKED |
| **cskh** | ✅ | ❌ BLOCKED | ❌ BLOCKED | ❌ BLOCKED |
| **sale** | ✅ | ❌ BLOCKED | ❌ BLOCKED | ❌ BLOCKED |

### E2. Implementation ✅ DONE

```typescript
// Trong AssignOwnerDialog.tsx (ĐÃ IMPLEMENT)
const { isAdmin } = usePermissions();
const { user } = useAuth();

// Non-admin chỉ thấy chính mình
const availableUsers = isAdmin ? users : users.filter(u => u.id === user?.id);

// Non-admin không được transfer khi đã có owner
const canTransfer = isAdmin || !isOwnerAssigned;
```

### E3. Backend Enforcement ✅ DONE

```sql
-- Migration: 20260107_responsible_owner_rls.sql

-- Trigger trên audit_logs kiểm tra:
-- 1. Nếu là manual assignment (after_data.source = 'responsible_owner_assignment')
-- 2. Nếu user không phải admin
-- 3. Nếu target_user_id != auth.uid() → RAISE EXCEPTION
-- 4. Nếu là unassign action → RAISE EXCEPTION cho non-admin
```

---

## F. DATABASE SCHEMA

### F1. Transfer Requests Table (KHÔNG CẦN - Phase 2 disabled)

```sql
-- Chỉ cần nếu muốn implement 2-step transfer
CREATE TABLE IF NOT EXISTS transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL DEFAULT 'booking',
  entity_id TEXT NOT NULL,
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED, CANCELLED, EXPIRED
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  
  CONSTRAINT unique_pending_transfer 
    UNIQUE NULLS NOT DISTINCT (entity_type, entity_id, status) 
    WHERE (status = 'PENDING')
);

-- RLS
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their requests"
ON transfer_requests FOR SELECT
USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "Users can create requests as from_user"
ON transfer_requests FOR INSERT
WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Recipients can update status"
ON transfer_requests FOR UPDATE
USING (to_user_id = auth.uid() AND status = 'PENDING');
```

### F2. Audit Log Actions (Already supported)

```sql
-- Các action đã có thể ghi vào audit_logs
-- ASSIGN (gán mới)
-- TRANSFER_REQUEST_CREATED (đề xuất chuyển)
-- TRANSFER_REQUEST_ACCEPTED (chấp nhận)
-- TRANSFER_REQUEST_REJECTED (từ chối)
-- TRANSFER_REQUEST_CANCELLED (huỷ)
-- Chuyển giao trách nhiệm (transfer trực tiếp)
```

---

## G. AUDIT LOG FORMAT

### G1. Cấu trúc hiện tại

```typescript
interface AuditLog {
  id: UUID;
  event_time: timestamp;
  user_id: UUID;           // Người thực hiện action
  role_snapshot: app_role; // Role tại thời điểm action
  action: string;          // "Check-in", "Gán thủ công", etc
  entity: string;          // "booking"
  entity_id: string;       // unified_booking_id
  before_data: JSONB;      // State trước action
  after_data: JSONB;       // State sau action
  ip_address: string;
  user_agent: string;
}
```

### G2. after_data cho assignment

```json
{
  "assigned_by": "MANUAL",
  "source": "responsible_owner_assignment",
  "previous_owner_id": "uuid-of-previous-owner",
  "new_owner_id": "uuid-of-new-owner"
}
```

---

## H. UI/UX BEHAVIOR (Giữ nguyên)

### H1. Booking Detail Page

| Trạng thái | Admin | Non-admin |
|------------|-------|-----------|
| Chưa có owner | Button "Gán phụ trách" | Button "Nhận phụ trách" |
| Đã có owner | Button "Chuyển giao" | Chỉ xem (badge) |
| Owner = mình | Button "Chuyển giao" | Badge "Bạn đang phụ trách" |

### H2. Component hiện tại

```tsx
// AssignOwnerDialog.tsx - line 184
{isOwnerAssigned ? "Chuyển giao phụ trách" : "Gán nhân viên phụ trách"}

// Button text - line 310  
{isOwnerAssigned ? "Chuyển giao" : "Gán phụ trách"}
```

---

## I. IMPLEMENTATION CHECKLIST

### Phase 1: Enforce Permissions (Recommended) ✅

- [ ] **Task 1.1**: Thêm permission check trong `AssignOwnerDialog`
  ```typescript
  const { isAdmin } = usePermissions();
  // Non-admin chỉ được self-assign
  ```

- [ ] **Task 1.2**: Filter user list theo role
  ```typescript
  const availableUsers = isAdmin ? allUsers : [currentUser];
  ```

- [ ] **Task 1.3**: Disable transfer cho non-admin khi đã có owner
  ```typescript
  const canTransfer = isAdmin || !isOwnerAssigned;
  ```

### Phase 2: 2-Step Transfer (Optional)

- [ ] **Task 2.1**: Create `transfer_requests` table
- [ ] **Task 2.2**: Create `useTransferRequest` hook
- [ ] **Task 2.3**: Add notification cho pending requests
- [ ] **Task 2.4**: Update UI để hiển thị pending state

### Phase 3: RLS Enforcement (Backend)

- [x] **Task 3.1**: Add RLS policy cho audit_logs với role check ✅
- [x] **Task 3.2**: Add function `is_admin_or_super_admin()` ✅
- [x] **Task 3.3**: Validate trong database trigger `trg_validate_owner_assignment` ✅

---

## J. PHASE 1 IMPLEMENTATION SUMMARY ✅

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260107_responsible_owner_rls.sql` | **NEW** - RLS enforcement trigger |
| `src/components/booking/AssignOwnerDialog.tsx` | Updated - UI restriction for non-admin |
| `docs/RESPONSIBLE_OWNER_SPEC.md` | Updated - Document Phase 1 completion |

### Backend Enforcement (Database Trigger)

```sql
-- Function: validate_owner_assignment()
-- Trigger: trg_validate_owner_assignment ON audit_logs

-- Logic:
-- 1. Check if INSERT is manual assignment (after_data.source = 'responsible_owner_assignment')
-- 2. If not manual → ALLOW (auto-assign from check-in/out works normally)
-- 3. If user is admin → ALLOW
-- 4. If action is UNASSIGN → DENY for non-admin
-- 5. If target_user_id != auth.uid() → DENY for non-admin
```

### UI Enforcement (Frontend)

```typescript
// AssignOwnerDialog.tsx
const { isAdmin } = usePermissions();

// 1. Non-admin chỉ thấy chính mình trong danh sách
const availableUsers = isAdmin ? users : users.filter(u => u.id === user?.id);

// 2. Non-admin không được transfer khi đã có owner
const canTransfer = isAdmin || !isOwnerAssigned;

// 3. UI hiển thị message phù hợp cho non-admin
```

---

## K. TEST PLAN ✅

### Test 1: Non-admin gán người khác → FAIL

```
1. Login với account cskh/sale/ke_toan
2. Mở booking chưa có owner
3. Mở AssignOwnerDialog
4. UI: Chỉ thấy chính mình (không thấy user khác)
5. Nếu bypass UI gọi trực tiếp:
   INSERT INTO audit_logs (entity, entity_id, action, user_id, after_data)
   VALUES ('booking', 'xxx', 'Gán thủ công', 'OTHER_USER_ID', 
           '{"source": "responsible_owner_assignment"}'::jsonb);
   → ERROR 42501: "Permission denied: You can only assign yourself as owner"
```

### Test 2: Non-admin tự nhận → OK

```
1. Login với account cskh/sale/ke_toan
2. Mở booking chưa có owner
3. Click "Nhận phụ trách"
4. Chọn chính mình → OK
5. Owner được gán cho mình
```

### Test 3: Non-admin unassign → FAIL

```
1. Login với account non-admin
2. Bypass UI gọi:
   INSERT INTO audit_logs (entity, entity_id, action, user_id, after_data)
   VALUES ('booking', 'xxx', 'Gỡ phụ trách', null, 
           '{"source": "responsible_owner_assignment"}'::jsonb);
   → ERROR 42501: "Permission denied: Only admin can unassign owner"
```

### Test 4: Admin full control → OK

```
1. Login với account admin/super_admin
2. Mở booking
3. Gán bất kỳ user → OK
4. Chuyển giao sang user khác → OK
5. (Nếu implement) Gỡ phụ trách → OK
```

### Test 5: Auto-assign (check-in) → OK cho tất cả

```
1. Login với account bất kỳ
2. Check-in booking
3. Owner tự động gán cho người check-in
4. Không bị block vì không có after_data.source = 'responsible_owner_assignment'
```

---

## L. DEPLOYMENT CHECKLIST

### Step 1: Apply Migration

```bash
# In Supabase Dashboard → SQL Editor
# Run: supabase/migrations/20260107_responsible_owner_rls.sql
```

### Step 2: Verify Functions Created

```sql
-- Check function exists
SELECT proname FROM pg_proc WHERE proname = 'is_admin_or_super_admin';
SELECT proname FROM pg_proc WHERE proname = 'validate_owner_assignment';

-- Check trigger exists
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass;
```

### Step 3: Test with Non-Admin

```sql
-- As non-admin user, try to assign someone else
INSERT INTO audit_logs (entity, entity_id, action, user_id, after_data)
VALUES ('booking', 'test-123', 'Gán thủ công', 'ANOTHER_USER_UUID', 
        '{"source": "responsible_owner_assignment"}'::jsonb);
-- Expected: ERROR 42501
```

### Step 4: Deploy Frontend

```bash
# Build & deploy
npm run build
# Verify AssignOwnerDialog shows only self for non-admin
```

---

## M. APPENDIX: CODE REFERENCES

### M1. Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `useDerivedOwner()` | useResponsibleOwner.ts:128 | Get owner từ audit_logs |
| `assignOwner()` | useResponsibleOwner.ts:581 | Gán owner mới |
| `transferOwner()` | useResponsibleOwner.ts:661 | Chuyển giao owner |
| `saveOwnerToDatabase()` | useResponsibleOwner.ts:543 | Insert vào audit_logs |
| `usePermissions()` | useAuth.tsx:129 | Check user role |
| `is_admin_or_super_admin()` | Migration SQL | Check admin role in DB |
| `validate_owner_assignment()` | Migration SQL | Trigger to enforce permissions |

### M2. Constants

```typescript
// ASSIGN_OWNER_ACTIONS - Actions trigger owner assignment
// KEEP_OWNER_ACTIONS - Actions không đổi owner
// TRANSFER_OWNER_ACTIONS - Actions explicit transfer
```

---

**END OF SPECIFICATION**

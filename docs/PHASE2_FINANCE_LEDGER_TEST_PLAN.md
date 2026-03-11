# PHASE II: Finance Ledger System - Test Plan

## Overview
Test plan cho việc triển khai Finance Ledger System với atomic transactions, ledger entries, và cash account mapping.

## Prerequisites
1. Migration `20260102_finance_ledger_system.sql` đã được apply
2. User có quyền admin hoặc ke_toan đã login
3. Đã có ít nhất 1 unified_booking trong hệ thống

---

## TC-01: Cash Account CRUD

### TC-01.1: Create Cash Account
**Steps:**
1. Navigate to `/settings/cash-accounts`
2. Click "Thêm tài khoản"
3. Enter: Code = `CASH_TEST`, Name = `Tiền mặt test`, Type = `CASH`
4. Click "Tạo mới"

**Expected:**
- Toast "Đã tạo tài khoản" xuất hiện
- Account mới hiện trong danh sách
- DB: `SELECT * FROM cash_accounts WHERE code = 'CASH_TEST'` returns 1 row

### TC-01.2: Edit Cash Account
**Steps:**
1. Click Pencil icon trên account vừa tạo
2. Change Name = `Tiền mặt test - Edited`
3. Click "Cập nhật"

**Expected:**
- Toast "Đã cập nhật tài khoản"
- Name đã thay đổi trong list
- DB: `SELECT name FROM cash_accounts WHERE code = 'CASH_TEST'` = `Tiền mặt test - Edited`

### TC-01.3: Archive/Restore Cash Account
**Steps:**
1. Click Archive icon trên account (không phải default)
2. Toggle "Hiện đã lưu trữ" = ON
3. Thấy account với badge "Đã lưu trữ"
4. Click Restore icon

**Expected:**
- Account bị archive: is_archived = true
- Account được restore: is_archived = false
- DB verify: `SELECT is_archived FROM cash_accounts WHERE code = 'CASH_TEST'`

### TC-01.4: Set Default Account
**Steps:**
1. Click Star icon trên account không phải default
2. Confirm action

**Expected:**
- Account mới có badge "Mặc định"
- Account cũ không còn badge
- DB: `SELECT COUNT(*) FROM cash_accounts WHERE is_default = true` = 1

---

## TC-02: Mapping Rules CRUD

### TC-02.1: Create Mapping Rule
**Steps:**
1. Navigate to `/settings/mapping-rules`
2. Click "Thêm quy tắc"
3. Select: Source = `hotel_collects`, Type = `COLLECT`
4. Select: DR = `CASH_MAIN`, CR = `REVENUE`
5. Priority = 100
6. Click "Tạo mới"

**Expected:**
- Toast "Đã tạo quy tắc mapping"
- Rule hiện trong table
- DB: `SELECT * FROM account_mapping_rules WHERE source_table = 'hotel_collects' AND transaction_type = 'COLLECT'`

### TC-02.2: Duplicate Rule Prevention
**Steps:**
1. Try to create same rule (hotel_collects + COLLECT)

**Expected:**
- Error toast "Quy tắc này đã tồn tại"
- No duplicate in DB

### TC-02.3: Archive/Restore Rule
**Steps:**
1. Archive a rule
2. Verify archived rules only show when toggle ON
3. Restore the rule

**Expected:**
- Archive/restore works correctly
- Archived rules not used by `resolve_account_mapping` function

---

## TC-03: Atomic Collection Creation

### TC-03.1: Create Collection via CreateCollectionDialog
**Steps:**
1. Navigate to `/collections`
2. Click "Thu tiền từ khách"
3. Select a HOTEL_COLLECT booking
4. Enter: Amount = 500000, Method = CASH, Bucket = ROOM
5. Submit

**Expected:**
- Toast "Đã ghi nhận thu tiền"
- hotel_collects has new row
- ledger_entries has 2 rows (DR + CR) with same source_id
- cashflow_entries has 1 row (direction = IN)

**DB Verification:**
```sql
-- Get latest collection
SELECT id FROM hotel_collects ORDER BY created_at DESC LIMIT 1;

-- Verify ledger entries (use id from above)
SELECT * FROM ledger_entries WHERE source_type = 'hotel_collects' AND source_id = '<id>';
-- Should have 2 rows: 1 DR, 1 CR, same amount

-- Verify cashflow
SELECT * FROM cashflow_entries WHERE source_type = 'HOTEL_COLLECT' AND source_id = '<id>';
-- Should have 1 row with direction = 'IN'
```

### TC-03.2: Collection via CollectPaymentStayDialog
**Steps:**
1. Navigate to `/stays`
2. Click "Thu tiền" on a booking row
3. Enter amount and submit

**Expected:**
- Same as TC-03.1: hotel_collects + ledger_entries + cashflow_entries created atomically

### TC-03.3: Collection Rollback on Error
**Steps:**
1. Temporarily break a constraint (e.g., invalid account_id in mapping)
2. Try to create collection

**Expected:**
- Error toast displayed
- NO partial data in any table
- Transaction fully rolled back

---

## TC-04: Atomic Cash Out Creation

### TC-04.1: Create Cash Out via CashOutPage
**Steps:**
1. Navigate to `/payments/cashout`
2. Select an approved payment_request
3. Enter: Method = CASH, Reference = `REF123`
4. Submit

**Expected:**
- Toast "Đã tạo chi tiền thành công"
- cash_outs has new row
- payment_requests status = PAID
- ledger_entries has 2 rows (DR Expense, CR Cash)
- cashflow_entries has 1 row (direction = OUT)

**DB Verification:**
```sql
-- Get latest cash_out
SELECT id, payment_request_id FROM cash_outs ORDER BY created_at DESC LIMIT 1;

-- Verify payment_request status
SELECT status FROM payment_requests WHERE id = '<payment_request_id>';
-- Should be 'PAID'

-- Verify ledger entries
SELECT * FROM ledger_entries WHERE source_type = 'cash_outs' AND source_id = '<id>';
-- Should have 2 rows

-- Verify cashflow
SELECT * FROM cashflow_entries WHERE source_type = 'CASH_OUT' AND source_id = '<id>';
-- Should have 1 row with direction = 'OUT'
```

### TC-04.2: Duplicate Cash Out Prevention (Race Condition Test)
**Steps:**
1. Open 2 browser tabs
2. Both select the same APPROVED payment_request
3. Click submit on both simultaneously

**Expected:**
- Only ONE cash_out created
- Second request gets error "Yêu cầu thanh toán này đã được chi tiền"
- DB: Only 1 cash_out for that payment_request_id

### TC-04.3: Invalid Payment Request Status
**Steps:**
1. Try to create cash_out for PENDING payment_request

**Expected:**
- Error: "Yêu cầu thanh toán chưa được phê duyệt"
- No records created

---

## TC-05: Ledger Entry Idempotency

### TC-05.1: Idempotent Ledger Entry Creation
**Steps:**
1. Get an idempotency_key from existing ledger_entry
2. Call `post_ledger_entry_idempotent` with same key

**Expected:**
- No error
- No duplicate entry
- Returns existing entry_id

**DB Verification:**
```sql
-- Count entries with same idempotency_key
SELECT COUNT(*) FROM ledger_entries WHERE idempotency_key = '<key>';
-- Should always be 1
```

---

## TC-06: Ledger Entry Reversal

### TC-06.1: Reverse Ledger Entry
**Steps:**
1. Create a collection (generates ledger entries)
2. Call `reverse_ledger_entry` with original entry_id

**Expected:**
- New reversal entry created with:
  - is_reversal = true
  - reversed_entry_id = original entry_id
  - Opposite DR/CR accounts
  - Same amount

**DB Verification:**
```sql
SELECT * FROM ledger_entries WHERE reversed_entry_id = '<original_id>';
-- Should have 1 row with is_reversal = true
```

### TC-06.2: Prevent Double Reversal
**Steps:**
1. Try to reverse the same entry again

**Expected:**
- Error: "Entry đã được đảo ngược"
- No duplicate reversal

---

## TC-07: Role-Based Access Control

### TC-07.1: Admin/KeToan Access
**Steps:**
1. Login as admin or ke_toan
2. Navigate to `/settings/cash-accounts`

**Expected:**
- Page loads with full CRUD functionality

### TC-07.2: Other Roles Blocked
**Steps:**
1. Login as cskh or ops
2. Navigate to `/settings/cash-accounts`

**Expected:**
- "Không có quyền truy cập" message displayed
- No CRUD actions available

---

## TC-08: Data Integrity

### TC-08.1: Ledger Balance Verification
**Steps:**
1. Create multiple collections and cash_outs
2. Run balance verification query

**DB Verification:**
```sql
-- Total DR should equal Total CR
SELECT 
  SUM(CASE WHEN debit_account_id IS NOT NULL THEN amount ELSE 0 END) as total_dr,
  SUM(CASE WHEN credit_account_id IS NOT NULL THEN amount ELSE 0 END) as total_cr
FROM ledger_entries
WHERE is_reversal = false;
-- total_dr MUST equal total_cr
```

### TC-08.2: Cashflow vs Ledger Reconciliation
**Steps:**
1. Run reconciliation query

**DB Verification:**
```sql
-- Cashflow IN should match Collection ledger entries
SELECT 
  (SELECT SUM(amount) FROM cashflow_entries WHERE direction = 'IN' AND source_type = 'HOTEL_COLLECT') as cashflow_in,
  (SELECT SUM(amount) FROM ledger_entries WHERE source_type = 'hotel_collects' AND debit_account_id IS NOT NULL AND is_reversal = false) as ledger_dr;
-- Should be equal

-- Cashflow OUT should match CashOut ledger entries  
SELECT
  (SELECT SUM(amount) FROM cashflow_entries WHERE direction = 'OUT' AND source_type = 'CASH_OUT') as cashflow_out,
  (SELECT SUM(amount) FROM ledger_entries WHERE source_type = 'cash_outs' AND credit_account_id IS NOT NULL AND is_reversal = false) as ledger_cr;
-- Should be equal
```

---

## Regression Tests

### RT-01: Existing Flows Still Work
- [ ] Thu tiền từ Booking Detail vẫn hoạt động
- [ ] Thu tiền từ Collections page vẫn hoạt động
- [ ] Chi tiền từ CashOut page vẫn hoạt động
- [ ] Refund collection vẫn hoạt động
- [ ] Void collection vẫn hoạt động

### RT-02: Query Performance
- [ ] Collections page load time < 2s
- [ ] CashOut page load time < 2s
- [ ] Ledger queries với index < 100ms

---

## Sign-off Checklist

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| TC-01.1 | ⬜ | | |
| TC-01.2 | ⬜ | | |
| TC-01.3 | ⬜ | | |
| TC-01.4 | ⬜ | | |
| TC-02.1 | ⬜ | | |
| TC-02.2 | ⬜ | | |
| TC-02.3 | ⬜ | | |
| TC-03.1 | ⬜ | | |
| TC-03.2 | ⬜ | | |
| TC-03.3 | ⬜ | | |
| TC-04.1 | ⬜ | | |
| TC-04.2 | ⬜ | | |
| TC-04.3 | ⬜ | | |
| TC-05.1 | ⬜ | | |
| TC-06.1 | ⬜ | | |
| TC-06.2 | ⬜ | | |
| TC-07.1 | ⬜ | | |
| TC-07.2 | ⬜ | | |
| TC-08.1 | ⬜ | | |
| TC-08.2 | ⬜ | | |
| RT-01 | ⬜ | | |
| RT-02 | ⬜ | | |

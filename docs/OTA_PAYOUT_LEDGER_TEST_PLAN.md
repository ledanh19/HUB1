# OTA PAYOUT LEDGER - Manual Account Selection Test Plan

## 🎯 OBJECTIVE
Test OTA Payout Cash-In flow với yêu cầu:
- ✅ **REQUIRED**: `cash_account_id` phải được chọn thủ công
- ❌ **KHÔNG** auto-resolve từ `account_mapping_rules`
- ❌ **KHÔNG** fallback về default account

---

## 📋 TEST CASES

### 1. UI VALIDATION

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 1.1 | Mở dialog "Ghi nhận tiền về" | Dropdown "Tài khoản nhận tiền" hiển thị với warning "Bắt buộc" | ⬜ |
| 1.2 | Không chọn account, nhấn Submit | Button disabled, hiện message "Vui lòng chọn tài khoản" | ⬜ |
| 1.3 | Chọn account từ dropdown | Hiện đầy đủ: Tên, Bank name, Account number (masked) | ⬜ |
| 1.4 | Submit với account đã chọn | Thành công, toast message "Đã ghi nhận tiền OTA về thành công (với Ledger Entry)" | ⬜ |

### 2. RPC VALIDATION

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 2.1 | Gọi RPC không truyền `p_cash_account_id` | Error: "cash_account_id là bắt buộc" | ⬜ |
| 2.2 | Gọi RPC với `p_cash_account_id` invalid | Error: "Tài khoản không tồn tại" | ⬜ |
| 2.3 | Gọi RPC với account archived | Error: "Tài khoản không tồn tại hoặc không hoạt động" | ⬜ |
| 2.4 | Gọi RPC với valid params | Success, return collection_id | ⬜ |

### 3. LEDGER ENTRY VALIDATION

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 3.1 | Sau khi cash-in thành công | Có ledger_entry với source_type='OTA_PAYOUT' | ⬜ |
| 3.2 | Check ledger direction | direction='DEBIT' (tiền vào) | ⬜ |
| 3.3 | Check ledger account_snapshot | Snapshot chứa đầy đủ: code, name, bank_name, account_number, selected_at, selected_by | ⬜ |
| 3.4 | Check counterparty | counterparty_type='OTA', counterparty_id=OTA source | ⬜ |

### 4. ACCOUNTING PERIOD LOCK

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 4.1 | Cash-in với ngày trong kỳ đã lock | Error: "Kỳ kế toán đã khóa. Không thể ghi nhận tiền vào ngày X" | ⬜ |
| 4.2 | Cash-in với ngày trong kỳ chưa lock | Success | ⬜ |
| 4.3 | Reverse với ngày gốc trong kỳ đã lock | Error: "Kỳ kế toán đã khóa" | ⬜ |

### 5. REVERSE (ĐẢO BÚT TOÁN)

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 5.1 | Nhấn nút "Đảo" trong lịch sử thu tiền | Mở dialog nhập lý do | ⬜ |
| 5.2 | Không nhập lý do, nhấn Submit | Button disabled | ⬜ |
| 5.3 | Nhập lý do và Submit | Tạo REVERSAL entry trong ledger | ⬜ |
| 5.4 | Check ledger sau reverse | Original entry: is_reversed=true, Reversal entry direction ngược lại | ⬜ |
| 5.5 | Payout status sau reverse | Cập nhật lại (PENDING/PARTIAL) theo total received | ⬜ |

### 6. PERMISSION CHECK

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 6.1 | User không phải admin/ke_toan gọi RPC | Error: "Permission denied" | ⬜ |
| 6.2 | User admin gọi RPC | Success | ⬜ |
| 6.3 | User ke_toan gọi RPC | Success | ⬜ |

### 7. DATA INTEGRITY

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 7.1 | Sửa cash_accounts sau khi đã có ledger | Ledger snapshot KHÔNG thay đổi | ⬜ |
| 7.2 | Archive cash_account đã dùng | Ledger vẫn hiện snapshot cũ đầy đủ | ⬜ |
| 7.3 | Check Cashflow Report | OTA Payout cash-in hiện trong IN | ⬜ |
| 7.4 | Check P&L Report | Không bị ảnh hưởng | ⬜ |

### 8. AUDIT LOG

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 8.1 | Sau cash-in | audit_logs có record với action='OTA_PAYOUT_CASHIN_ATOMIC' | ⬜ |
| 8.2 | after_data trong audit | Chứa: payout_id, collection_id, ledger_entry_id, cash_account_id, amount, etc. | ⬜ |
| 8.3 | Sau reverse | audit_logs có record với action='OTA_PAYOUT_CASHIN_REVERSED' | ⬜ |

---

## 🔧 DB QUERIES FOR VERIFICATION

```sql
-- Check ledger entries for OTA_PAYOUT
SELECT 
  id, entry_date, source_type, source_id, entry_type,
  cash_account_id, account_snapshot, direction, amount,
  counterparty_type, counterparty_id, is_reversed, note
FROM ledger_entries 
WHERE source_type = 'OTA_PAYOUT'
ORDER BY created_at DESC;

-- Check hotel_collects for OTA_PAYOUT
SELECT 
  id, source_payout_id, amount_collected, payment_method,
  collection_type, collected_at, note
FROM hotel_collects 
WHERE related_type = 'OTA_PAYOUT'
ORDER BY created_at DESC;

-- Check audit logs
SELECT 
  action, entity, entity_id, user_id, after_data, created_at
FROM audit_logs 
WHERE action LIKE 'OTA_PAYOUT%'
ORDER BY created_at DESC;

-- Check accounting period lock
SELECT * FROM accounting_periods WHERE is_locked = true;

-- Verify snapshot immutability
SELECT 
  le.id, le.entry_date, le.account_snapshot,
  ca.account_name as current_name, ca.bank_name as current_bank
FROM ledger_entries le
JOIN cash_accounts ca ON le.cash_account_id = ca.id
WHERE le.source_type = 'OTA_PAYOUT';
```

---

## ✅ ACCEPTANCE CRITERIA

1. **UI**:
   - [ ] Cash account dropdown BẮT BUỘC, không để trống
   - [ ] Warning message rõ ràng về yêu cầu manual selection
   - [ ] Account info hiển thị: Tên + Bank + Số TK (masked)

2. **Backend**:
   - [ ] RPC reject nếu không có cash_account_id
   - [ ] KHÔNG gọi resolve_account_mapping()
   - [ ] Ledger entry tạo với snapshot bất biến
   - [ ] Audit log đầy đủ

3. **Business Rules**:
   - [ ] Accounting period lock được enforce
   - [ ] Reverse là cách DUY NHẤT để sửa sai
   - [ ] Không cho edit trực tiếp ledger

4. **Regression**:
   - [ ] Cashflow report vẫn chạy đúng
   - [ ] P&L report không bị ảnh hưởng
   - [ ] Existing hotel_collect flow không bị ảnh hưởng

---

## 📝 NOTES

- Migration file: `20260104_ota_payout_ledger_manual.sql`
- Hook updated: `useOtaPayoutCashIn.ts`
- New hook: `useCashAccounts.ts`
- Page updated: `OtaPayoutDetailPage.tsx`
- Types updated: `types.ts` (RPCs)

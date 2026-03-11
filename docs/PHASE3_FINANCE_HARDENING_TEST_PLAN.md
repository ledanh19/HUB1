# PHASE III: FINANCE HARDENING - TEST PLAN

## 📋 Overview

Test plan cho Phase III Finance UX & Reporting - các tính năng để kế toán vận hành hằng ngày.

**Phạm vi:**
- Opening Balance, Reconciliation, Period Lock enforcement
- Transfers giữa các tài khoản
- Ledger Viewer với drill-down
- Không tạo trang P&L/Cashflow mới - chỉ patch existing

---

## 🧪 1. ACCOUNTING PERIODS (Kỳ kế toán)

### TC-P3-01: Lock kỳ kế toán
| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin vào Settings > Kỳ kế toán | Hiện danh sách kỳ |
| 2 | Click "Khóa kỳ mới" | Mở dialog |
| 3 | Chọn Tháng trước, thêm note | Pre-fill dates |
| 4 | Submit | Tạo record, is_locked=true |
| 5 | Check audit_logs | Có log "Khóa kỳ kế toán" |

### TC-P3-02: Unlock kỳ kế toán
| Step | Action | Expected |
|------|--------|----------|
| 1 | Với kỳ đã khóa, click Mở khóa | Mở dialog |
| 2 | Nhập lý do | Required |
| 3 | Submit | is_locked=false, note được append |
| 4 | Check audit_logs | Có log "Mở khóa kỳ kế toán" |

### TC-P3-03: Period Lock Enforcement - Cash Out
| Step | Action | Expected |
|------|--------|----------|
| 1 | Khóa kỳ 01-31/12/2024 | OK |
| 2 | Thử tạo Cash Out với paid_at = 15/12/2024 | ❌ REJECT với message "Kỳ kế toán đã khóa" |
| 3 | Thử tạo Cash Out với paid_at = 05/01/2025 | ✅ OK |

### TC-P3-04: Period Lock Enforcement - Collection
| Step | Action | Expected |
|------|--------|----------|
| 1 | Khóa kỳ 01-31/12/2024 | OK |
| 2 | Thử tạo Collection hôm nay trong kỳ đã khóa | ❌ REJECT |
| 3 | Mở khóa kỳ | OK |
| 4 | Retry Collection | ✅ OK |

### TC-P3-05: Period Lock Enforcement - Reverse Ledger
| Step | Action | Expected |
|------|--------|----------|
| 1 | Có ledger entry ngày 15/12/2024 | - |
| 2 | Khóa kỳ 01-31/12/2024 | OK |
| 3 | Thử Reverse entry đó | ❌ REJECT |
| 4 | Mở khóa kỳ, retry | ✅ OK |

---

## 🧪 2. CASH TRANSFERS (Chuyển khoản nội bộ)

### TC-P3-06: Tạo chuyển khoản
| Step | Action | Expected |
|------|--------|----------|
| 1 | Vào Settings > Chuyển khoản nội bộ | - |
| 2 | Click "Tạo chuyển khoản" | Mở dialog |
| 3 | Chọn từ TK1 → TK2, số tiền 1,000,000 | - |
| 4 | Submit | ✅ Tạo 2 ledger entries |
| 5 | Check ledger_entries | 1 CREDIT (TK1), 1 DEBIT (TK2) |
| 6 | Check cash_transfers table | 1 record với transfer_code |

### TC-P3-07: Transfer trong kỳ khóa
| Step | Action | Expected |
|------|--------|----------|
| 1 | Khóa kỳ 01-31/12/2024 | OK |
| 2 | Thử tạo transfer với date 15/12/2024 | ❌ REJECT |
| 3 | Tạo transfer với date 05/01/2025 | ✅ OK |

### TC-P3-08: Transfer - Same account validation
| Step | Action | Expected |
|------|--------|----------|
| 1 | Chọn TK1 làm nguồn | - |
| 2 | Chọn TK1 làm đích | Không hiện trong dropdown |
| 3 | Hoặc submit nếu bypass | ❌ RPC reject |

### TC-P3-09: Transfer - Amount validation
| Step | Action | Expected |
|------|--------|----------|
| 1 | Nhập amount = 0 | Button disabled |
| 2 | Nhập amount = -100 | Button disabled |
| 3 | Nhập amount > 0 | ✅ OK |

---

## 🧪 3. LEDGER RECONCILIATION (Đối soát)

### TC-P3-10: Reconcile entry
| Step | Action | Expected |
|------|--------|----------|
| 1 | Vào Sổ cái, click ... menu | Hiện Đối soát |
| 2 | Click Đối soát | Mở dialog |
| 3 | Nhập bank reference, ngày sao kê | - |
| 4 | Submit | Tạo ledger_reconciliations record |
| 5 | Cột Đối soát hiện ✓ badge | - |

### TC-P3-11: Unreconcile entry
| Step | Action | Expected |
|------|--------|----------|
| 1 | Với entry đã reconcile, click ... menu | Hiện Huỷ đối soát |
| 2 | Confirm | Delete reconciliation record |
| 3 | Badge biến mất | - |

### TC-P3-12: Reconcile - idempotent
| Step | Action | Expected |
|------|--------|----------|
| 1 | Reconcile entry với ref ABC | OK |
| 2 | Reconcile lại với ref XYZ | Update (không duplicate) |
| 3 | Check ledger_reconciliations | Chỉ 1 record, ref = XYZ |

---

## 🧪 4. LEDGER REVERSE (Đảo bút toán)

### TC-P3-13: Reverse ledger entry
| Step | Action | Expected |
|------|--------|----------|
| 1 | Vào Sổ cái, với entry ORIGINAL | - |
| 2 | Click ... > Đảo bút toán | Mở dialog |
| 3 | Nhập lý do (required) | - |
| 4 | Submit | Tạo REVERSAL entry (opposite direction) |
| 5 | Original entry: is_reversed=true | - |
| 6 | UI hiện strikethrough cho original | - |

### TC-P3-14: Cannot reverse already reversed
| Step | Action | Expected |
|------|--------|----------|
| 1 | Entry đã bị reverse | - |
| 2 | Không hiện menu Đảo | ✅ UI hidden |
| 3 | Nếu gọi RPC trực tiếp | ❌ "Entry already reversed" |

### TC-P3-15: Cannot reverse REVERSAL entry
| Step | Action | Expected |
|------|--------|----------|
| 1 | Entry type = REVERSAL | - |
| 2 | Không hiện menu Đảo | ✅ UI hidden |

---

## 🧪 5. CASHFLOW DRILL-DOWN

### TC-P3-16: Navigate to Ledger from Cashflow
| Step | Action | Expected |
|------|--------|----------|
| 1 | Vào Reports > Cashflow | - |
| 2 | Cuộn xuống thấy card "Chi tiết bút toán" | - |
| 3 | Click "Xem Sổ cái" | Navigate to /settings/ledger-entries?from=...&to=... |
| 4 | Ledger page filter theo date range | - |

---

## 🧪 6. PERMISSION TESTS

### TC-P3-17: Admin can access all
| User | Periods | Transfers | Ledger Actions |
|------|---------|-----------|----------------|
| Admin | ✅ Lock/Unlock | ✅ Create | ✅ Reverse/Reconcile |
| Ke_toan | ❌ | ✅ Create | ✅ Reverse/Reconcile |
| Le_tan | ❌ | ❌ | ❌ |

### TC-P3-18: Non-admin cannot lock/unlock
| Step | Action | Expected |
|------|--------|----------|
| 1 | Đăng nhập ke_toan | - |
| 2 | Vào /settings/accounting-periods | "Không có quyền" |

---

## 🧪 7. OPENING BALANCE (Future)

> ⚠️ Opening Balance table đã tạo nhưng UI chưa implement.
> Test manual qua SQL hoặc API.

### TC-P3-19: Insert opening balance
```sql
INSERT INTO account_opening_balances (cash_account_id, as_of_date, opening_amount, note)
VALUES ('uuid-of-account', '2025-01-01', 50000000, 'Số dư đầu năm 2025');
```

### TC-P3-20: Get balance at date
```sql
SELECT get_account_balance_at_date('uuid-of-account', '2025-01-15');
-- Should return: opening_amount + sum(DEBIT) - sum(CREDIT) from ledger
```

---

## 📊 Test Coverage Summary

| Feature | Unit | Integration | E2E |
|---------|------|-------------|-----|
| Accounting Periods | RPC tests | Lock enforcement | TC-P3-01 to 05 |
| Cash Transfers | RPC tests | 2-entry creation | TC-P3-06 to 09 |
| Reconciliation | RPC tests | Badge display | TC-P3-10 to 12 |
| Reverse Entry | RPC tests | UI visibility | TC-P3-13 to 15 |
| Drill-down | - | Navigation | TC-P3-16 |
| Permissions | RPC tests | Role guard | TC-P3-17 to 18 |

---

## 🚀 Deployment Checklist

- [ ] Run migration `20260103_phase3_finance_hardening.sql`
- [ ] Verify tables: `accounting_periods`, `cash_transfers`, `ledger_reconciliations`, `account_opening_balances`
- [ ] Verify RPCs: `is_period_locked`, `create_cash_transfer_atomic`, `reconcile_ledger_entry`, `reverse_ledger_entry`, etc.
- [ ] Test Period Lock enforcement in existing RPCs: `create_cash_out_atomic`, `create_collection_ledger_atomic`
- [ ] Deploy frontend
- [ ] Smoke test all new routes
- [ ] Admin creates first accounting period (previous month)

---

## 📝 Notes

1. **Migration ADD-ONLY**: Không sửa đổi Phase II schema, chỉ thêm mới
2. **Period Lock**: Áp dụng cho `entry_date` hoặc `paid_at`, không phải `posting_at`
3. **Reconciliation**: Soft feature - không block giao dịch, chỉ đánh dấu
4. **Reverse**: Hard feature - tạo entry ngược chiều, không xoá original
5. **Opening Balance**: Table sẵn sàng, UI để phase sau

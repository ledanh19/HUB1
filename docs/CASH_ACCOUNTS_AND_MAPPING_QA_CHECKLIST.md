# QA Checklist: Cash Accounts & Mapping Rules

## 📅 Version
- **Date**: 2026-01-03
- **Module**: Finance - Cash Accounts & Mapping Rules
- **Author**: Principal Engineer

---

## ✅ A. LAYOUT & SIDEBAR

### A1. Sidebar Behavior
| Test | Expected | Pass |
|------|----------|------|
| Open CashAccountsPage | Content không bị che bởi sidebar | ⬜ |
| Open MappingRulesPage | Content không bị che bởi sidebar | ⬜ |
| Open LedgerEntriesPage | Content không bị che bởi sidebar | ⬜ |
| Open CashTransfersPage | Content không bị che bởi sidebar | ⬜ |
| Open AccountingPeriodsPage | Content không bị che bởi sidebar | ⬜ |
| Collapse sidebar (click chevron) | Main content mở rộng smooth | ⬜ |
| Expand sidebar | Main content thu hẹp smooth | ⬜ |

### A2. Responsive
| Test | Expected | Pass |
|------|----------|------|
| Resize browser < 768px | Sidebar collapse hoặc ẩn | ⬜ |
| Resize browser > 1024px | Sidebar hiển thị đầy đủ | ⬜ |
| Mobile view | Content không bị tràn | ⬜ |

---

## ✅ B. CASH ACCOUNTS - AUTO CODE

### B1. Tạo tài khoản với Auto Code (ON)
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Click "Thêm tài khoản" | Dialog mở, toggle "Tự sinh mã" = ON | ⬜ |
| 2 | Xem preview mã | Hiển thị "Mã sẽ tự sinh: 001" (hoặc số tiếp theo) | ⬜ |
| 3 | Nhập tên: "Tiền mặt chính" | Input hoạt động | ⬜ |
| 4 | Chọn loại: Tiền mặt | Dropdown hoạt động | ⬜ |
| 5 | Click "Tạo mới" | Toast "Đã tạo tài khoản - Mã tự động sinh" | ⬜ |
| 6 | Xem list | Tài khoản mới với mã "001" hoặc CASH_xxx | ⬜ |

### B2. Tạo liên tiếp 3 tài khoản
| Step | Expected | Pass |
|------|----------|------|
| Tài khoản 1 | Mã: 001 hoặc BANK_XXX_xxxx | ⬜ |
| Tài khoản 2 | Mã: 002 hoặc tiếp theo | ⬜ |
| Tài khoản 3 | Mã: 003 hoặc tiếp theo | ⬜ |
| Không có mã trùng | Unique constraint OK | ⬜ |

### B3. Tạo với Manual Code (OFF)
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Click "Thêm tài khoản" | Dialog mở | ⬜ |
| 2 | Tắt toggle "Tự sinh mã" | Input mã xuất hiện | ⬜ |
| 3 | Nhập mã: "BANK_VCB" | Input chấp nhận chữ IN HOA | ⬜ |
| 4 | Nhập tên: "Vietcombank Danh" | OK | ⬜ |
| 5 | Nhập ngân hàng: "Vietcombank" | OK | ⬜ |
| 6 | Nhập số TK: "1234567890" | OK | ⬜ |
| 7 | Click "Tạo mới" | Toast "Đã tạo với mã tùy chỉnh" | ⬜ |
| 8 | Xem list | Mã = "BANK_VCB" | ⬜ |

### B4. Note Field
| Test | Expected | Pass |
|------|----------|------|
| Thêm ghi chú khi tạo | Ghi chú lưu DB | ⬜ |
| Xem list | Cột Ghi chú hiển thị (truncate nếu dài) | ⬜ |
| Hover ghi chú dài | Tooltip full text | ⬜ |
| Edit và sửa ghi chú | Update OK | ⬜ |

### B5. Display Columns
| Column | Expected | Pass |
|--------|----------|------|
| Mã TK | Font mono, hiển thị code | ⬜ |
| Tên tài khoản | Font medium | ⬜ |
| Loại | Badge với icon (💵/🏦/📱) | ⬜ |
| Ngân hàng | Tên bank hoặc "—" | ⬜ |
| Số TK | Masked: ****6789 hoặc "—" | ⬜ |
| Ghi chú | Text hoặc "—" | ⬜ |
| Mặc định | Badge nếu is_default | ⬜ |
| Trạng thái | Hoạt động / Lưu trữ | ⬜ |

---

## ✅ C. MAPPING RULES

### C1. Auto Priority
| Test | Expected | Pass |
|------|----------|------|
| Tạo rule với all "Tất cả" | Priority hiển thị: 9999 (catch-all) | ⬜ |
| Tạo rule cụ thể (có điều kiện) | Priority hiển thị: "Tự tính theo độ cụ thể" | ⬜ |
| Xem list rules | Rules cụ thể có priority < catch-all | ⬜ |
| Match conflict | Rule priority thấp hơn được chọn | ⬜ |

### C2. Dropdown Tài khoản đích
| Test | Expected | Pass |
|------|----------|------|
| Click dropdown | Danh sách accounts hiển thị | ⬜ |
| Account mặc định | Có badge "Mặc định", hiển thị đầu tiên | ⬜ |
| Format hiển thị | `Mã — Tên (Bank ****last4) — Note...` | ⬜ |
| Chọn account | Value lưu đúng | ⬜ |

### C3. Priority Không Hiển Thị Input
| Test | Expected | Pass |
|------|----------|------|
| Form tạo rule | Không có input priority | ⬜ |
| Hiển thị text | "9999 (catch-all)" hoặc "Tự tính..." | ⬜ |
| Backend trigger | `trg_set_rule_priority` tự tính | ⬜ |

---

## ✅ D. VALIDATION & ERROR

### D1. Required Fields
| Field | Validation | Pass |
|-------|------------|------|
| Tên tài khoản | Required, không được để trống | ⬜ |
| Mã thủ công (khi OFF auto) | Required | ⬜ |
| Tên quy tắc (mapping) | Required | ⬜ |
| Tài khoản đích (mapping) | Required | ⬜ |

### D2. Duplicate
| Test | Expected | Pass |
|------|----------|------|
| Tạo mã trùng | Error message rõ ràng | ⬜ |
| Tạo rule trùng | Error message | ⬜ |

---

## ✅ E. AUDIT LOG

### E1. Cash Account
| Action | audit_logs Entry | Pass |
|--------|-----------------|------|
| CREATE_CASH_ACCOUNT | Ghi nhận user, data | ⬜ |
| UPDATE_CASH_ACCOUNT | Ghi before/after | ⬜ |
| ARCHIVE_CASH_ACCOUNT | Ghi nhận | ⬜ |
| SET_DEFAULT_CASH_ACCOUNT | Ghi nhận | ⬜ |

---

## 📋 SIGN-OFF

| Role | Name | Date | Status |
|------|------|------|--------|
| QA | | | ⬜ Pending |
| Dev | | | ⬜ Pending |
| PM | | | ⬜ Pending |

---

## 🐛 BUGS FOUND

| # | Description | Severity | Status |
|---|-------------|----------|--------|
| 1 | | | |
| 2 | | | |

---

**END OF CHECKLIST**

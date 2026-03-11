# 📊 BẢNG TIÊU CHÍ NGHIỆM THU CHI TIẾT - ROOMRISE

## THÔNG TIN CHUNG

| Thông tin | Chi tiết |
|-----------|----------|
| Hệ thống | ROOMRISE - Vận hành & Kiểm soát Tài chính Nội bộ |
| Phiên bản | 1.0 |
| Ngày tạo | 2024 |
| Người tạo | Product Owner |

---

## BẢNG TIÊU CHÍ CHI TIẾT

### A. BOOKING MODULE

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| BK-01 | Tạo booking không sinh cashflow | Hệ thống hoạt động | Tạo booking mới | cashflow_entries KHÔNG có record mới | Critical | ☐ |
| BK-02 | Tạo booking không sinh payables | Hệ thống hoạt động | Tạo booking mới | host_payables KHÔNG có record mới | Critical | ☐ |
| BK-03 | Booking chỉ lưu thông tin đặt phòng | Có booking | Kiểm tra database | Chỉ có record trong bookings_mirror/manual_bookings | High | ☐ |

---

### B. OTA PAYOUT MODULE

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| OTA-01 | OTA payout không tự sinh cashflow | Có booking OTA_COLLECT đã checkout | Tạo OTA payout | cashflow_entries KHÔNG có record mới | Critical | ☐ |
| OTA-02 | OTA payout chỉ là nghĩa vụ | Có OTA payout với status=RECEIVED | Kiểm tra cashflow | Cashflow vẫn = 0 cho payout này | Critical | ☐ |
| OTA-03 | Thu tiền OTA mới tạo cashflow | Có OTA payout | Thu tiền cho payout (payee_type=ROOMRISE) | cashflow_entries có record direction=IN | Critical | ☐ |
| OTA-04 | Deductions hiển thị đúng | Có OTA payout với deductions | Xem chi tiết payout | Deductions hiển thị tách biệt | Medium | ☐ |

---

### C. THU TIỀN (COLLECTIONS) MODULE

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| COL-01 | Thu tiền ROOMRISE tạo cashflow IN | Có booking HOTEL_COLLECT | Thu tiền với payee_type=ROOMRISE | cashflow_entries có direction=IN | Critical | ☐ |
| COL-02 | Thu tiền HOST không tạo cashflow | Có booking với host segment | Thu tiền với payee_type=HOST | cashflow_entries KHÔNG có record mới | Critical | ☐ |
| COL-03 | Void collection tạo record âm | Có collection đã thu | Void collection | Tạo record với collection_type=VOID | High | ☐ |
| COL-04 | Refund tạo cashflow OUT | Có collection đã thu | Refund collection | cashflow_entries có direction=OUT | High | ☐ |
| COL-05 | Bucket phân loại đúng | Có booking | Thu tiền với các bucket khác nhau | ROOM/EXTRA/SERVICE phân loại đúng | Medium | ☐ |

---

### D. QUYẾT TOÁN (SETTLEMENT) MODULE

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| SET-01 | Quyết toán không sinh cashflow | Có payables đủ điều kiện | Chốt quyết toán | cashflow_entries KHÔNG có record mới | Critical | ☐ |
| SET-02 | Quyết toán tạo snapshot | Có payables | Chốt quyết toán | host_settlements có record với net_amount | Critical | ☐ |
| SET-03 | Net position đúng chiều | Host nợ Roomrise | Xem settlement | Hiển thị "Host phải trả" với số dương | High | ☐ |
| SET-04 | Net position đúng chiều (ngược) | Roomrise nợ Host | Xem settlement | Hiển thị "Roomrise phải trả" với số dương | High | ☐ |
| SET-05 | Settlement là immutable | Có settlement đã chốt | Cố gắng sửa net_amount | Không cho phép sửa | High | ☐ |

---

### E. CHI TIỀN (CASH-OUT) MODULE

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| CASH-01 | Chi tiền tạo cashflow OUT | Có payment request approved | Tạo cash-out | cashflow_entries có direction=OUT | Critical | ☐ |
| CASH-02 | Chi tiền phải gắn payment request | Không có payment request | Tạo cash-out | Không cho phép hoặc cảnh báo | High | ☐ |
| CASH-03 | Chi > settlement hiển thị warning | Settlement có remaining=100k | Chi 150k | Hiển thị cảnh báo chênh lệch | Medium | ☐ |

---

### F. CASHFLOW REPORT

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| CF-01 | Cashflow = Thu - Chi | Có nhiều transactions | Xem báo cáo Cashflow | Tổng = SUM(Thu) - SUM(Chi) | Critical | ☐ |
| CF-02 | Cashflow không chứa booking | Có booking mới | Xem Cashflow | Booking không xuất hiện trong cashflow | Critical | ☐ |
| CF-03 | Cashflow không chứa payout chưa thu | Có payout chưa thu tiền | Xem Cashflow | Payout không xuất hiện | Critical | ☐ |
| CF-04 | Cashflow không chứa settlement chưa chi | Có settlement chưa thanh toán | Xem Cashflow | Settlement không xuất hiện | Critical | ☐ |

---

### G. P&L REPORT

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| PL-01 | P&L có thể khác Cashflow | Có bookings với timing khác nhau | So sánh P&L vs Cashflow | Hai số có thể khác nhau (đúng thiết kế) | High | ☐ |
| PL-02 | Doanh thu = từ booking | Có bookings | Xem P&L | Revenue = tổng booking amounts | High | ☐ |
| PL-03 | Chi phí = từ segments | Có host segments | Xem P&L | Cost = tổng segment amounts | High | ☐ |

---

### H. DASHBOARD

| ID | Test Case | Precondition | Action | Expected Result | Priority | Status |
|----|-----------|--------------|--------|-----------------|----------|--------|
| DB-01 | Mọi số truy ngược được | Dashboard hiển thị các metrics | Click vào từng metric | Có thể drill down đến source data | Critical | ☐ |
| DB-02 | Dashboard không sinh số mới | Có data trong hệ thống | Kiểm tra dashboard calculations | Tất cả số = aggregate từ source tables | Critical | ☐ |
| DB-03 | Check-in count đúng | Có stays với check-in hôm nay | Xem Dashboard | Count = số stays check-in hôm nay | Medium | ☐ |
| DB-04 | Collections sum đúng | Có collections tháng này | Xem Dashboard | Sum = tổng collections tháng này | Medium | ☐ |

---

## TỔNG KẾT NGHIỆM THU

| Module | Tổng Test Cases | Passed | Failed | Pass Rate |
|--------|-----------------|--------|--------|-----------|
| Booking | 3 | | | |
| OTA Payout | 4 | | | |
| Thu tiền | 5 | | | |
| Quyết toán | 5 | | | |
| Chi tiền | 3 | | | |
| Cashflow Report | 4 | | | |
| P&L Report | 3 | | | |
| Dashboard | 4 | | | |
| **TỔNG** | **31** | | | |

---

## KẾT LUẬN

| Tiêu chí | Yêu cầu | Kết quả |
|----------|---------|---------|
| Critical tests (15 cases) | 100% PASS | ☐ PASS / ☐ FAIL |
| High tests (12 cases) | ≥90% PASS | ☐ PASS / ☐ FAIL |
| Medium tests (4 cases) | ≥80% PASS | ☐ PASS / ☐ FAIL |
| **Tổng kết** | Đạt tất cả tiêu chí | ☐ **NGHIỆM THU** / ☐ **TỪ CHỐI** |

---

**Người kiểm tra:** ________________________  
**Ngày:** ________________________  
**Chữ ký:** ________________________

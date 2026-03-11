# 📋 CHECKLIST NGHIỆM THU HỆ THỐNG ROOMRISE (1 TRANG)

## ✅ NGUYÊN TẮC VÀNG (6 điểm - BẮT BUỘC PASS TẤT CẢ)

| # | Nguyên tắc | Kiểm tra | Kết quả |
|---|-----------|----------|---------|
| 1 | Mỗi nghiệp vụ chỉ sinh dữ liệu tại 1 điểm | Booking không tạo cashflow/payables | ☐ |
| 2 | Thu tiền & Chi tiền là nguồn DUY NHẤT tạo Cashflow | hotel_collects (ROOMRISE) → cashflow_entries (IN) | ☐ |
| 3 | OTA payout ≠ tiền, chỉ là nghĩa vụ phải thu | ota_payouts không tự sinh cashflow | ☐ |
| 4 | Quyết toán ≠ chi tiền, chỉ là snapshot nghĩa vụ | host_settlements không tự sinh cashflow | ☐ |
| 5 | P&L ≠ Cashflow | Báo cáo P&L và Cashflow có thể khác nhau | ☐ |
| 6 | Dashboard chỉ tổng hợp – không sinh logic | Tất cả số trên Dashboard truy ngược được | ☐ |

---

## 🔹 FLOW CHUẨN (Kiểm tra từng bước)

### A. BOOKING
- ☐ Tạo booking → KHÔNG có cashflow_entries mới
- ☐ Tạo booking → KHÔNG có host_payables mới (chỉ có sau khi assign segment)

### B. OTA PAYOUT
- ☐ Booking OTA_COLLECT đủ điều kiện → xuất hiện trong danh sách payout
- ☐ Chưa ghi nhận payout → KHÔNG có cashflow
- ☐ Ghi nhận payout (status=RECEIVED) → vẫn CHƯA có cashflow
- ☐ Thu tiền OTA payout → MỚI có cashflow_entries (IN)

### C. THU TIỀN (Collections)
- ☐ Thu tiền với payee_type=ROOMRISE → cashflow_entries.direction=IN
- ☐ Thu tiền với payee_type=HOST → KHÔNG có cashflow (Host thu trực tiếp)
- ☐ Void/Refund → tạo record âm hoặc OUT

### D. QUYẾT TOÁN (Settlement)
- ☐ Chốt quyết toán → tạo host_settlements với net_amount snapshot
- ☐ Chốt quyết toán → KHÔNG tự tạo cashflow
- ☐ Net position hiển thị đúng (Host nợ / Roomrise nợ)

### E. CHI TIỀN (Cash-Out)
- ☐ Tạo chi tiền → cashflow_entries.direction=OUT
- ☐ Chi tiền phải gắn payment_request_id
- ☐ Chi > quyết toán → hiển thị cảnh báo

---

## 📊 BÁO CÁO (Kiểm tra số liệu)

### CASHFLOW
- ☐ Tổng = SUM(Thu tiền) - SUM(Chi tiền)
- ☐ KHÔNG chứa: booking, payout chưa thu, quyết toán chưa chi

### P&L
- ☐ Doanh thu = từ booking (accrual basis)
- ☐ Chi phí = từ segments + extra charges
- ☐ Có thể khác Cashflow (đúng theo thiết kế)

### DASHBOARD
- ☐ Mọi số đều truy ngược được về nguồn gốc
- ☐ Không có số "tự sinh" không giải thích được

---

## ⚠️ GIỚI HẠN HỆ THỐNG (CHẤP NHẬN - KHÔNG PHẢI BUG)

- ☐ Không snapshot theo kỳ → số có thể thay đổi
- ☐ Không khóa sổ → dữ liệu cũ có thể bị sửa
- ☐ Không auto-check → nhập sai vẫn cho lưu

---

## 🎯 KẾT LUẬN

| Tiêu chí | Kết quả |
|----------|---------|
| 6 nguyên tắc vàng | ☐ PASS / ☐ FAIL |
| Flow chuẩn | ☐ PASS / ☐ FAIL |
| Báo cáo | ☐ PASS / ☐ FAIL |
| **TỔNG KẾT** | ☐ **PASS** / ☐ **FAIL** |

---

**Ngày kiểm tra:** ____________  
**Người kiểm tra:** ____________  
**Chữ ký:** ____________

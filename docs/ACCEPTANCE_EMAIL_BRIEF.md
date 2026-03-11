# 📧 EMAIL/BRIEF NGHIỆM THU HỆ THỐNG ROOMRISE

---

**Đến:** QA Team / Lovable Team  
**Từ:** Product Owner  
**Ngày:** [Ngày hiện tại]  
**Chủ đề:** Nghiệm thu hệ thống ROOMRISE - Tiêu chí và hướng dẫn test

---

## 1. MỤC ĐÍCH

Tài liệu này cung cấp tiêu chí nghiệm thu chính thức cho hệ thống ROOMRISE - Hệ thống vận hành & kiểm soát tài chính nội bộ.

---

## 2. BẢN CHẤT HỆ THỐNG

ROOMRISE là hệ thống vận hành nội bộ với các đặc điểm:

- ✅ Dữ liệu **realtime** (không snapshot theo kỳ)
- ✅ Không khóa sổ kế toán tự động
- ✅ Không auto-audit
- ✅ Không suy luận số liệu

**⚠️ LƯU Ý QUAN TRỌNG:**  
Hệ thống báo đúng những gì đã ghi nhận - không đảm bảo "đúng tuyệt đối về kế toán" nếu nhập sai. Đây là **thiết kế có chủ đích**, không phải bug.

---

## 3. NGUYÊN TẮC TEST (6 ĐIỂM BẮT BUỘC)

| # | Nguyên tắc | Giải thích |
|---|-----------|------------|
| 1 | Mỗi nghiệp vụ chỉ sinh dữ liệu tại 1 điểm | Booking chỉ tạo booking, không tạo tiền hay công nợ |
| 2 | Thu tiền & Chi tiền là nguồn DUY NHẤT tạo Cashflow | Không có cách nào khác tạo ra dòng tiền |
| 3 | OTA payout ≠ tiền | OTA payout chỉ là nghĩa vụ phải thu, không phải tiền thực |
| 4 | Quyết toán ≠ chi tiền | Quyết toán chỉ là snapshot nghĩa vụ, không tự tạo dòng tiền |
| 5 | P&L ≠ Cashflow | Hai báo cáo này có thể và thường khác nhau |
| 6 | Dashboard chỉ tổng hợp | Không sinh logic mới, mọi số phải truy ngược được |

---

## 4. FLOW CẦN TEST

### A. Booking
- Tạo booking → Kiểm tra: KHÔNG có cashflow, KHÔNG có payables

### B. OTA Payout
- Ghi nhận payout → Kiểm tra: chỉ là obligation, KHÔNG có cashflow
- Thu tiền từ OTA → Kiểm tra: MỚI có cashflow (direction=IN)

### C. Thu tiền (Collections)
- Thu tiền (ROOMRISE collect) → Kiểm tra: có cashflow_entries với direction=IN
- Thu tiền (HOST collect) → Kiểm tra: KHÔNG có cashflow

### D. Quyết toán
- Chốt quyết toán → Kiểm tra: tạo settlement snapshot, KHÔNG có cashflow

### E. Chi tiền
- Tạo chi tiền → Kiểm tra: có cashflow_entries với direction=OUT

---

## 5. TIÊU CHÍ PASS/FAIL

### ✅ PASS khi:
- Số liệu giữa các trang khớp logic
- Không có dòng tiền "tự sinh"
- OTA payout chỉ thành tiền khi có Thu tiền
- Quyết toán không làm thay đổi tiền

### ❌ FAIL khi:
- Cashflow tăng khi chưa Thu tiền
- OTA payout được tính là tiền
- Quyết toán làm thay đổi Cashflow
- Dashboard có số không truy ngược được

---

## 6. GIỚI HẠN CHẤP NHẬN (KHÔNG PHẢI BUG)

- Không snapshot → số có thể thay đổi theo thời gian
- Không khóa kỳ → dữ liệu cũ có thể bị sửa
- Không auto-check → nhập sai vẫn cho lưu
- Không audit trail sâu → khó truy nguyên chi tiết

---

## 7. TÀI LIỆU ĐÍNH KÈM

1. `ACCEPTANCE_CHECKLIST.md` - Checklist 1 trang để test
2. `ACCEPTANCE_CRITERIA_TABLE.md` - Bảng tiêu chí chi tiết

---

## 8. YÊU CẦU PHẢN HỒI

Sau khi test, vui lòng phản hồi:
- [ ] Kết quả PASS/FAIL cho từng tiêu chí
- [ ] Danh sách bug/issue (nếu có)
- [ ] Screenshot/evidence cho các case FAIL

---

**Liên hệ:** [Email/Slack của PO]  
**Deadline test:** [Ngày deadline]

---

*Tài liệu này là phiên bản chính thức để nghiệm thu hệ thống ROOMRISE.*

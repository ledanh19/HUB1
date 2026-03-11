# 🧠 AI SMART PRICING – Phase 1 Specification

**Phase 1 – Insight & Recommendation (Observation Mode)**

---

## 1. ĐỊNH NGHĨA MODULE

AI Smart Pricing là module phân tích & khuyến nghị giá thông minh, được xây dựng dựa trên dữ liệu thị trường OTA (inventory, booking, rate) đồng bộ từ Channel Manager (Channex).

**Trong Phase 1, AI:**
- ❌ KHÔNG tự động thay đổi giá
- ❌ KHÔNG can thiệp vận hành
- ✅ CHỈ quan sát – phân tích – đề xuất – giải thích

**Mục tiêu chính:**
> Chứng minh AI hiểu đúng thị trường trước khi được phép hành động.

---

## 2. PHẠM VI DỮ LIỆU (DATA SCOPE)

### ✅ Dữ liệu sử dụng (Market Truth)
- Inventory theo ngày (Channex)
- Booking OTA (Channex)
- Giá hiện tại theo Room Type / Rate Plan
- Lead time
- Booking velocity
- Pattern lịch sử theo weekday / season

### ❌ Dữ liệu không sử dụng
- Booking thủ công từ PMS
- Luồng vận hành nội bộ
- Margin, payout, settlement
- Mã phòng chi tiết

**Nguyên tắc cốt lõi:**
> Inventory trên Channex là sự thật cuối cùng.
> Booking thủ công chỉ ảnh hưởng gián tiếp thông qua inventory.

---

## 3. CẤU TRÚC MODULE (TOPBAR / MENU)

```
Inventory        (đã có – mirror dữ liệu thô từ Channex)
AI Smart Pricing
 ├─ Insights
 └─ Recommendations
```

👉 Module chỉ có 2 trang
👉 Dashboard tính toán nằm bên trong 2 trang, không phải trang riêng
👉 Không có Auto / Apply / Rules ở Phase 1

---

## 4. TRANG 1 – AI SMART PRICING / INSIGHTS

### 🎯 Mục đích
Trả lời câu hỏi:
> "Dựa trên inventory & booking hiện tại, thị trường đang tốt hay xấu cho pricing?"

### 🧩 CẤU TRÚC TRANG INSIGHTS

#### A. Context Header
- Property selector
- Room Type selector
- Date range: 7 / 14 / 30 ngày tới

#### B. Market Health KPI Dashboard (BẮT BUỘC)
Dashboard tính toán, không phải số raw:
- **Avg Occupancy** (forward-looking)
- **Booking Velocity** vs baseline lịch sử
- **Days-to-Full** (ước tính)
- **Inventory at Risk** (% ngày có nguy cơ trống)

#### C. Booking Pace Analytics
So sánh:
- Booking hiện tại
- Booking lịch sử (same weekday)

Trả lời:
> "Bán nhanh hơn hay chậm hơn bình thường?"

#### D. Demand & Pricing Signal Calendar
Calendar theo ngày, mỗi ô hiển thị:

**Tín hiệu cầu:** High / Normal / Low

**Tín hiệu pricing:**
- Increase candidate
- Decrease candidate
- Hold

**Cảnh báo:**
- Trống sát ngày
- Full sớm bất thường

📌 Chỉ insight – không chỉnh sửa

#### E. Insight Detail (Click vào 1 ngày)
- Inventory snapshot (read-only)
- Booking velocity vs baseline
- Lead time profile
- AI Insight (text ngắn, dễ hiểu)

### ❌ Không có trên trang Insights
- Không chỉnh inventory
- Không chỉnh giá
- Không Apply / Auto
- Không lịch sử giá

---

## 5. TRANG 2 – AI SMART PRICING / RECOMMENDATIONS

### 🎯 Mục đích
Trả lời câu hỏi:
> "AI đề xuất giá như vậy có hợp lý không?"

### 🧩 CẤU TRÚC TRANG RECOMMENDATIONS

#### A. Header Filters
- Property
- Room Type
- Rate Plan
- Date range
- Confidence ≥ X

#### B. Recommendation Quality Dashboard
Dashboard đánh giá AI, không đánh giá doanh thu:
- Total recommendations
- High-confidence (%)
- Agree rate
- Disagree rate

#### C. Recommendation Table (CORE)
Mỗi dòng = Room Type × Rate Plan × Date

| Trường | Mô tả |
|--------|-------|
| Inventory | Số phòng còn |
| Current Rate | Giá hiện tại |
| Suggested Rate | Giá đề xuất |
| Δ% | Phần trăm thay đổi |
| Confidence | Độ tin cậy (0-1) |
| View Reason | Xem lý do |

#### D. Explainability Panel (BẮT BUỘC)
Khi mở 1 đề xuất, AI hiển thị:
- Remaining inventory
- Days to check-in
- Booking velocity vs baseline
- Lead time delta
- Data freshness
- Lý do đề xuất (3–5 bullet, rõ ràng)

❌ **Không có explain → đề xuất không hợp lệ**

#### E. Feedback Loop (Build Trust)
- 👍 Agree
- 👎 Disagree
- 💬 Add note

📌 Feedback không làm thay đổi giá, chỉ dùng để:
- Đo niềm tin
- Chuẩn bị Phase 2

#### F. Shadow Outcome (Inline / Tab phụ)
Sau ngày check-in:
- Booking thực tế
- Inventory cuối

So sánh:
- Giữ giá hiện tại
- Theo đề xuất AI (mô phỏng)

### ❌ Không có trên trang Recommendations
- Không Apply
- Không Auto
- Không Sync giá

---

## 6. NGUYÊN TẮC VẬN HÀNH (NON-NEGOTIABLE)

| Nguyên tắc | Mô tả |
|------------|-------|
| AI chỉ đề xuất | Không hành động |
| Mọi đề xuất phải có | Dữ liệu tính toán + Explain + Confidence |
| Không có dashboard | Không tin AI |
| Không có explain | Không cho hiển thị đề xuất |

---

## 7. KẾT QUẢ MONG ĐỢI CỦA PHASE 1

- ✅ Ops hiểu logic pricing
- ✅ Đo được:
  - % đề xuất hợp lý
  - % ops đồng ý
- ✅ Phát hiện sớm:
  - Lỗi dữ liệu
  - Lệch inventory
  - Insight sai ngữ cảnh
- ✅ Sẵn sàng mở Phase 2 (Semi-Auto)

---

## 8. TUYÊN BỐ CHUẨN (DÙNG CHO NỘI BỘ / DEV / INVESTOR)

> **AI Smart Pricing – Phase 1** của Roomrise là module phân tích và khuyến nghị giá, dựa trên dữ liệu thị trường OTA từ Channel Manager, được thiết kế với dashboard tính toán, explainable insight và feedback loop, nhằm kiểm chứng logic và xây dựng niềm tin trước khi tự động hóa.

---

## 9. CHỐT CUỐI

- ✔ Đúng bản chất ngành RMS
- ✔ Không trùng Inventory
- ✔ Không phụ thuộc PMS nội bộ
- ✔ Có dashboard & bằng chứng
- ✔ Không auto – không rủi ro

---

*Document saved: 2024-12-20*
*Version: 1.0*

# 🧠 AI SMART PRICING / INSIGHTS

**Phase 1 – Market Observation & Pricing Intelligence**

---

## 1. ĐỊNH NGHĨA CHUẨN (KHÓ BẮT BẺ)

AI Smart Pricing / Insights là trang phân tích thị trường OTA theo hướng pricing, sử dụng inventory + booking + rate từ Channel Manager (Channex) để:

- ✅ Đánh giá sức cầu tương lai (forward-looking)
- ✅ Phát hiện rủi ro trống phòng / full sớm
- ✅ Tạo tín hiệu pricing có giải thích & độ tin cậy
- ❌ KHÔNG thay đổi giá
- ❌ KHÔNG can thiệp vận hành

> Đây là **lớp trí tuệ (intelligence layer)**, không phải lớp hành động (execution layer).

---

## 2. PHẠM VI & NGUYÊN TẮC BẤT BIẾN

### 2.1 Dữ liệu sử dụng (Market Truth Only)

| Dữ liệu | Nguồn |
|---------|-------|
| Inventory theo ngày | Mirror từ Channex |
| Booking OTA | Mirror từ Channex |
| Giá hiện tại theo Room Type / Rate Plan | Channex |
| Lead time & booking velocity | Tính toán |
| Pattern lịch sử theo weekday / season | Tính toán |

### 2.2 Dữ liệu KHÔNG sử dụng

- ❌ Booking thủ công PMS
- ❌ Ý đồ vận hành nội bộ
- ❌ Margin / payout / settlement
- ❌ Mã phòng chi tiết

> **Nguyên tắc:** AI chỉ hiểu thị trường qua những gì thị trường thực sự nhìn thấy.

---

## 3. VAI TRÒ CỦA TRANG INSIGHTS (ĐÚNG BẢN CHẤT)

Trang này **KHÔNG** trả lời: *"Nên đặt giá bao nhiêu?"*

Trang này **CHỈ** trả lời:

1. Thị trường đang khỏe hay yếu cho pricing?
2. Ngày nào nguy hiểm nếu giữ giá hiện tại?
3. Ngày nào có tín hiệu sai lệch cung–cầu so với lịch sử?

👉 **Quyết định giá chỉ diễn ra ở trang Recommendations.**

---

## 4. UI / UX – CẤU TRÚC TRANG CHUẨN (TỪ TRÊN XUỐNG)

### A. Title & Mode Indicator

| Element | Value |
|---------|-------|
| Title | AI Smart Pricing / Insights |
| Mode badge | `Phase 1 · Advisory (No Auto)` |
| Tooltip cố định | "This page provides pricing insights only. No rate changes are applied." |

### B. Context Header (Ngữ cảnh phân tích)

- Property selector
- Room Type selector
- Date horizon: Next 7 / 14 / 30 days
- Baseline window: Last 8–12 weeks
- Data freshness indicator (timestamp + warning nếu trễ)

**Logic UX:** Không chọn context = không cho xem insight.

### C. Market Health Dashboard (TÍNH TOÁN – BẮT BUỘC)

Forward-looking KPIs, không phải số raw:

| KPI | Mô tả |
|-----|-------|
| Avg Forward Occupancy | Occupancy dự kiến trong khoảng thời gian đã chọn |
| Booking Velocity vs Baseline (%) | So sánh tốc độ booking với lịch sử |
| Median Days-to-Full (Forecast) | Dự đoán số ngày để full |
| Inventory at Risk (%) | % ngày có nguy cơ trống |

→ KPI này trả lời: *"Pricing environment hiện tại có thuận lợi không?"*

### D. Booking Pace Analytics (So sánh động lực cầu)

- Chart: Current pace vs Historical baseline
- So sánh theo same weekday
- Tooltip giải thích bằng ngôn ngữ ops, không kỹ thuật

### E. Demand & Pricing Signal Calendar (CORE)

Calendar theo ngày, mỗi ô hiển thị 3 lớp:

| Layer | Hiển thị |
|-------|----------|
| Inventory status | Read-only |
| Demand deviation | ↑ / ↓ / → so với baseline |
| Pricing signal (Advisory) | Increase candidate / Hold / Decrease candidate |
| Data Confidence | High / Medium / Low |

**Legend bắt buộc:**
> "Signal indicates demand–supply imbalance. It is not a pricing action."

### F. Alert Chips (Operational Awareness)

| Chip | Ý nghĩa |
|------|---------|
| Vacancy risk | Nguy cơ trống phòng |
| Sell-out risk | Nguy cơ full sớm |
| Inventory anomaly | Bất thường inventory |
| Data lag | Dữ liệu chưa được cập nhật |

→ Click chip = filter calendar.

### G. Day Insight Drawer (Explainable AI – BẮT BUỘC)

Khi click 1 ngày, AI phải giải thích được bằng lời:

#### 1) Snapshot
- Remaining inventory
- Current rate
- Days to check-in

#### 2) Calculated Metrics
- Booking velocity (vs baseline)
- Lead time profile
- Historical fill pattern

#### 3) AI Explanation (3–5 bullet, fixed template)
- Vì sao ngày này là rủi ro / cơ hội
- Dữ liệu nào mạnh / yếu
- Độ tin cậy của insight

#### 4) Action Guidance
Nút duy nhất: **👉 View related recommendations**

- ❌ Không chỉnh giá
- ❌ Không chỉnh tồn
- ❌ Không auto

---

## 5. LOGIC AI (EXPLAINABLE – KHÔNG MƠ HỒ)

### 5.1 Các phép tính cốt lõi

| Metric | Công thức |
|--------|-----------|
| Remaining Inventory | `max_inventory - booked` |
| Forward Occupancy | `booked / max_inventory * 100` |
| Booking Velocity (24h / 7d) | Số booking mới trong khoảng thời gian |
| Lead Time (median) | Số ngày từ booking đến check-in |
| Baseline Pace | Pace lịch sử same weekday (8-12 tuần) |
| Data Freshness | Thời gian từ lần sync cuối |

### 5.2 Risk Scoring

| Risk Type | Điều kiện |
|-----------|-----------|
| Vacancy Risk | Tồn cao + sát ngày + pace thấp |
| Sell-out Risk | Tồn thấp + pace cao + lịch sử full sớm |

### 5.3 Pricing Signal (Advisory)

| Signal | Điều kiện |
|--------|-----------|
| Increase candidate | Sell-out risk cao |
| Decrease candidate | Vacancy risk cao |
| Hold | Không rõ ràng hoặc data yếu |

### 5.4 Confidence (ĐÚNG NGHĨA)

Đây là **Data Confidence**, không phải "xác suất đúng"

**Giảm khi:**
- Data lag > 30 phút
- Baseline yếu (< 4 tuần data)
- Inventory anomaly (thay đổi đột ngột > 30%)

---

## 6. FLOW VẬN HÀNH CHUẨN

### Daily Ops Flow

```
1. Mở Insights
2. Nhìn Market KPIs
3. Quét calendar (ngày đỏ / bất thường)
4. Click ngày → đọc explain
5. Sang Recommendations để đánh giá giá
```

👉 **Insights không bao giờ là điểm kết thúc**, chỉ là điểm bắt đầu của tư duy pricing.

---

## 7. NGUYÊN TẮC GOVERNANCE (CỰC KỲ QUAN TRỌNG)

| Nguyên tắc | Ý nghĩa |
|------------|---------|
| Signal ≠ Action | Tín hiệu không phải hành động |
| Confidence ≠ Outcome | Độ tin cậy không phải kết quả |
| Insight ≠ Strategy | Insight không phải chiến lược |
| AI không hiểu "ý đồ" | Chỉ hiểu "thị trường" |
| Không explain → không hiển thị | Mọi insight phải có giải thích |

---

## 8. TUYÊN BỐ CUỐI (CHUẨN QUỐC TẾ)

> **AI Smart Pricing / Insights** is a market observation and intelligence layer that analyzes OTA inventory and booking behavior to surface pricing-relevant signals. It does not make pricing decisions or apply rate changes.

---

## 9. KẾT LUẬN

- ✔ Đúng bản chất RMS
- ✔ Không trùng Inventory
- ✔ Không overclaim AI
- ✔ Explainable, auditable
- ✔ Sẵn sàng mở Phase 2 mà không refactor

> Đây là cấu trúc "đủ sâu để tin – đủ an toàn để triển khai – đủ chuẩn để scale".

---

*Document saved: 2024-12-20*
*Version: 1.0 - SOURCE OF TRUTH*

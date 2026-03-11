# 📕 AI SMART PRICING – MASTER PLAN

**Roomrise Control Hub | Market-Driven Pricing Engine**

---

## I. TUYÊN BỐ NGUYÊN TẮC (NON-NEGOTIABLE PRINCIPLES)

| Nguyên tắc | Mô tả |
|------------|-------|
| **Market Truth = Channex** | Giá, tồn, booking OTA trên Channex là sự thật duy nhất để pricing |
| **Pricing ≠ Vận hành** | AI không học booking thủ công, không học ý đồ ops |
| **Human-in-control** | AI đề xuất → con người kiểm soát → auto có điều kiện |
| **Audit & Rollback bắt buộc** | Không có log → không auto |

> 👉 4 nguyên tắc này là "xương sống", không được phá.

---

## II. KIẾN TRÚC TỔNG THỂ (FINAL ARCHITECTURE)

### Các khối hệ thống

```
OTA
 ↓
Channex (Market Truth)
 ↓
Roomrise Control Hub
 ├─ Pricing Data Mirror
 ├─ AI Smart Pricing Engine
 ├─ Governance & Guardrails
 ├─ Pricing Audit & Analytics
 ↓
(Apply)
 ↓
Channex
```

> 📌 **PMS Roomrise không tham gia vòng quyết định giá**
> → PMS chỉ là consumer để xem & đánh giá.

---

## III. PHẠM VI TÍNH NĂNG (FEATURE BLUEPRINT)

### 1️⃣ Pricing Insight Engine (NỀN TẢNG)

AI phân tích:
- Occupancy theo ngày / room type
- Booking velocity
- Lead time
- Pattern full sớm / trống sát ngày
- Khác biệt OTA

> 👉 Chỉ đọc dữ liệu OTA từ Channex

### 2️⃣ Pricing Recommendation Engine (TRÁI TIM)

Cho mỗi **Room Type × Rate Plan × Date**, AI tạo:
- Giá đề xuất
- % tăng / giảm
- Confidence score (0–1)
- Explanation (vì sao đề xuất)

**Ví dụ explain chuẩn:**
```
"Inventory còn 1/5, check-in sau 2 ngày,
cùng kỳ 90% full → đề xuất +10% (confidence 0.81)"
```

### 3️⃣ Governance & Guardrails (LÁ CHẮN)

**BẮT BUỘC có:**
- Giá sàn / trần
- Max change / lần
- Freeze window (ví dụ <48h)
- Sanity band so với lịch sử

**Rate plan authority:**
- AI-managed
- Manual

> 👉 Không có guardrails = không được auto.

### 4️⃣ Execution Layer (ÁP DỤNG GIÁ)

**3 mode:**
1. **Manual** (chỉ đề xuất)
2. **Semi-Auto** (auto trong biên độ)
3. **Auto** (theo confidence & rule)

→ Push giá trực tiếp lên Channex

### 5️⃣ Audit & Rollback (SỐNG CÒN)

Mỗi quyết định giá lưu:
- Thời điểm
- Dữ liệu đầu vào
- Lý do
- Người / AI
- Trạng thái (applied / reverted)

> 👉 Rollback 1 click.

---

## IV. DATA LOGIC CHUẨN (KHÓ BẮT BẺ)

### ✅ AI ĐƯỢC HỌC
- Booking OTA
- Inventory
- Giá
- Lead time

### ❌ AI KHÔNG HỌC
- Booking thủ công PMS
- Ops nội bộ
- Margin / payout

> Manual booking chỉ ảnh hưởng gián tiếp qua inventory.
> → Đúng chuẩn RMS quốc tế.

---

## V. UI / UX TỐI ƯU CHO CONTROL HUB

### 📊 Pricing Dashboard

**Calendar view** - Mỗi ngày hiển thị:
- Inventory
- Giá hiện tại
- Giá AI đề xuất
- Confidence
- Action

### 🔔 Pricing Alerts
- Trống phòng sát ngày
- Full sớm bất thường
- Inventory giảm đột ngột

### 🧾 Pricing History
- Timeline thay đổi giá
- Filter theo room / rate plan / ngày

---

## VI. LỘ TRÌNH TRIỂN KHAI (OPTIMAL ROADMAP)

| Giai đoạn | Thời gian | Mô tả |
|-----------|-----------|-------|
| 🟢 **Phase 1 – Insight & Recommendation** | 0–30 ngày | Không auto, Build niềm tin, Validate logic |
| 🟡 **Phase 2 – Controlled Auto** | 30–60 ngày | Auto trong biên độ nhỏ, Confidence > threshold, Freeze rule active |
| 🔴 **Phase 3 – Scale & Optimize** | 60–90 ngày | Auto sâu hơn, Phân tầng host, Chuẩn bị comp set (nếu cần) |

---

## VII. KPI ĐÁNH GIÁ THÀNH CÔNG

| KPI | Mục tiêu |
|-----|----------|
| Occupancy | +5–10% |
| ADR | +3–8% |
| RevPAR | +8–15% |
| Override rate | <20% |
| Pricing error | <1% |

---

## VIII. RỦI RO & CÁCH KHÓA (TÓM TẮT)

| Rủi ro | Cách xử lý |
|--------|------------|
| Inventory giảm bất thường | Confidence ↓ |
| Data lag | Gate pricing |
| Feedback loop | Rate plan authority |
| Ops không tin | Explainable AI |

---

## IX. TUYÊN BỐ CHỐT (DÙNG CHO SALES / INVESTOR)

> **Roomrise AI Smart Pricing** là hệ thống định giá OTA dựa trên **Market Truth từ Channel Manager**, được thiết kế có **kiểm soát, audit và rollback**, giúp **tối ưu doanh thu mà không phá vận hành**.

---

## X. KẾT LUẬN CUỐI

- ✔ Đúng bản chất ngành
- ✔ Không cần booking thủ công PMS
- ✔ Không phá kiến trúc hiện tại
- ✔ Scale được
- ✔ Đủ chặt để auto

---

## BƯỚC TIẾP THEO (CHỌN 1 ĐỂ TRIỂN KHAI)

1. **Spec kỹ thuật chi tiết** (DB + API + rule)
2. **Prompt chuẩn cho Manus / Lovable** build module
3. **Wireframe UI** từng màn hình

---

*Document saved: 2024-12-20*
*Version: 1.0*

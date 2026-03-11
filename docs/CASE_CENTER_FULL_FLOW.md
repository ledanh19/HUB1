# CASE CENTER — Full Flow Documentation

> Roomrise Control Hub — Internal Only  
> Last updated: 2026-02-26 (Optimization Patch)

---

## 1. Tổng Quan

Case Center chuẩn hóa toàn bộ luồng tài chính liên quan OTA/Hotel:

| Loại | Mô tả |
|------|--------|
| DISPUTE | Tranh chấp tiền với OTA hoặc khách |
| REFUND | Yêu cầu hoàn tiền cho khách |

> **Payout-Driven Policy**: Case Center chỉ là **hồ sơ theo dõi**.
> Mọi thắng/thua OTA chỉ được ghi nhận khi làm OTA Payout.
> Case không "đẻ tiền", payout mới "đẻ tiền".

---

## 2. State Machine

```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → SETTLED → CLOSED
                                  → REJECTED → CLOSED
```

| Status | Label | Mô tả |
|--------|-------|--------|
| DRAFT | Nháp | Chưa gửi |
| SUBMITTED | Đã gửi | Yêu cầu đã gửi |
| UNDER_REVIEW | Đang xem xét | Đang xử lý |
| APPROVED | Đã duyệt | Duyệt, chờ quyết toán |
| REJECTED | Từ chối | Bị từ chối |
| SETTLED | Đã quyết toán | Có bằng chứng, quyết toán xong |
| CLOSED | Đã đóng | Case kết thúc |

---

## 3. Settlement Proof Priority (Payout-Driven)

### A) DIRECT_CASH_OUT
- ✅ `cash_out_id` linked & PAID

### B) OTA_DEDUCTION
1. **Primary**: Payout có dòng deduction → `payout_id` set, `ota_payout_deductions` row exists cho cùng `unified_booking_id`
2. **Fallback**: `ota_adjustment_record_id` linked (supporting manual doc khi payout chưa ghi đủ)

### C) OTA_DEBIT_NOTE
- ✅ `ota_debit_note_record_id` linked
- ✅ Debit note `status = PAID`
- ✅ `paid_via_cash_out_id IS NOT NULL`

### D) No-show (OTA)
- Same as OTA_DEDUCTION — settles when payout deduction proves financial impact

---

## 4. Luồng Cụ Thể

### 4.1 Win OTA
```
1. Case DISPUTE → APPROVED (settlement_type=OTA_DEDUCTION)
2. Làm Payout → payout kỳ sau có deduction dương (+bonus/+adjustment)
3. Link payout_id vào case
4. System checks: ota_payout_deductions row exists → eligible to settle
5. SETTLED
```

### 4.2 Lose OTA (deduction)
```
1. Case DISPUTE → APPROVED (settlement_type=OTA_DEDUCTION)
2. Làm Payout → payout có deduction âm (-penalty/-dispute)
3. Link payout_id vào case
4. System checks: ota_payout_deductions row exists → eligible
5. SETTLED
```

### 4.3 Lose OTA (debit note)
```
1. Case DISPUTE → APPROVED (settlement_type=OTA_DEBIT_NOTE)
2. OTA gửi debit note → tạo ota_debit_note_record
3. Trả tiền → cash_out → mark debit_note PAID
4. Link ota_debit_note_record_id vào case
5. SETTLED
```

### 4.4 Refund trực tiếp
```
1. Case REFUND + DIRECT_TO_GUEST → APPROVED
2. Tạo payment_request → cash_out → PAID
3. Link cash_out_id vào case → SETTLED
```

### 4.5 Refund via OTA (deduction)
```
1. Case REFUND + VIA_OTA → APPROVED (settlement_type=OTA_DEDUCTION)
2. Làm Payout → deduction âm cho refund
3. Link payout_id → system checks deduction → SETTLED
```

### 4.6 No-show
```
⚠️ No-show vận hành → Booking Detail (no_show_records)
Case chỉ theo dõi ảnh hưởng tài chính, không đổi booking_status
Same settlement flow as Win/Lose
```

---

## 5. Source of Financial Truth (SOT)

| Component | SOT | Mô tả |
|-----------|-----|--------|
| Payout | `ota_payouts` + `ota_payout_details` | Actual money received |
| Deductions | `ota_payout_deductions` | Signed amounts (âm=trừ, dương=cộng) |
| Direct Refund | `cash_out` via case | Money paid to guest |
| Debit Note | `ota_debit_note_records` | Money owed to OTA |
| **Case Center** | `ota_disputes` | **Tracking only** — NOT financial SOT |
| **Adjustment Records** | `ota_adjustment_records` | **Supporting docs** — fallback proof, NOT in net_position |

---

## 6. Net Position Formula (BookingFinanceView)

```
net_position = payout_recorded          (from ota_payout_details)
             + deductions_total         (from ota_payout_deductions, signed)
             - refund_direct            (from SETTLED cases DIRECT_CASH_OUT)
             - debit_note_paid          (from ota_debit_note_records PAID)
```

> ⚠️ `ota_adjustment_records` are **NOT** included in net_position.
> They are supporting documents shown separately to avoid double-count.

---

## 7. Routes

| Page | URL |
|------|-----|
| Disputes (Case Center) | `/disputes` |
| Case Detail | `/disputes/:id` |
| OTA Adjustments | `/ota-adjustments` |
| OTA Debit Notes | `/ota-debit-notes` |
| Booking Finance | `/reports/booking-finance` |
| OTA Reconciliation | `/reports/ota-reconciliation` |

# OTA Reconciliation Guide

> Roomrise Control Hub — Hướng dẫn đối soát OTA  
> Last updated: 2026-02-26 (Optimization Patch)

---

## 1. Nguyên tắc: Payout-Driven

- **Nguồn tiền thật** (SOT) = `ota_payouts` + `ota_payout_details` + `ota_payout_deductions`
- **Case Center** = hồ sơ theo dõi, không phải nguồn tài chính
- **Adjustment Records** = tài liệu hỗ trợ (fallback), không nằm trong net_position

---

## 2. Link Payout ↔ Case

### Từ Payout → Case
1. Vào Payout Detail
2. Tại booking row hoặc deduction row → "Link to Case"
3. Chọn case mở (cùng booking) → set `payout_id` on case

### Từ Case → Payout
1. Vào Case Detail → Settlement Panel
2. "Link Payout (Primary)" → paste payout UUID
3. System tự kiểm deduction proof

---

## 3. Đối Soát OTA

### Truy cập: `Reports → OTA Reconciliation` (`/reports/ota-reconciliation`)

| Cột | Nguồn | Ý nghĩa |
|-----|-------|----------|
| Payout | `ota_payouts.net_payout_amount` | Tiền OTA chuyển |
| Deductions | `ota_payout_deductions.amount` (signed) | Trừ/cộng trong payout |
| Debit Note | `ota_debit_note_records` | Tổng / đã trả |
| Cases mở | `ota_disputes` | Case chưa SETTLED/CLOSED |
| Unmatched | `ota_payouts.status=PENDING` | Payout chưa đối soát |

---

## 4. Booking Finance View

### Truy cập: `Reports → Booking Finance` (`/reports/booking-finance`)

```
net_position = payout_recorded + deductions_total - refund_direct - debit_note_paid
```

- `deductions_total`: signed (âm = OTA trừ, dương = OTA thêm)
- `refund_direct`: chỉ SETTLED cases DIRECT_CASH_OUT
- `debit_note_paid`: chỉ status=PAID + cash_out

---

## 5. Lưu Ý

- Không auto-sync, không auto-link, không auto-settle
- Case không "đẻ tiền" — payout mới "đẻ tiền"
- Adjustment records = fallback khi payout chưa ghi đủ
- No-show ops = Booking Detail, case chỉ theo dõi tài chính

# OTA CASE CENTER — System Audit

> Generated: 2026-02-26  
> Purpose: Audit toàn bộ schema, flow, và điểm thiếu trước khi triển khai Case Center chuẩn hóa.

---

## 1. Schema Snapshot

### 1.1. `ota_disputes` (bảng tranh chấp hiện tại)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `unified_booking_id` | TEXT | FK logic đến booking |
| `payout_id` | UUID | nullable, added later |
| `dispute_type` | TEXT | Free-text, ko enum |
| `amount_in_dispute` | DECIMAL(12,2) | |
| `status` | `dispute_status` enum | OPEN, IN_REVIEW, WON, LOST, PARTIAL, CLOSED |
| `opened_at` | TIMESTAMPTZ | |
| `closed_at` | TIMESTAMPTZ | nullable |
| `last_activity_at` | TIMESTAMPTZ | nullable, added later |
| `resolution_note` | TEXT | nullable |
| `assigned_to` | UUID | nullable, added later |
| `created_by` | UUID | FK auth.users |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS**: SELECT/INSERT/UPDATE cho authenticated. Không có tenant key, không có org_id.

### 1.2. `ota_payouts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `ota_source` | TEXT | |
| `ota_property_id` | TEXT | nullable |
| `payout_date` | DATE | |
| `payout_period_from` | DATE | nullable |
| `payout_period_to` | DATE | nullable |
| `payout_method` | TEXT | Default 'BANK_TRANSFER' |
| `receiving_bank_account` | TEXT | nullable |
| `payment_gateway` | TEXT | nullable |
| `gross_amount` | NUMERIC | default 0 |
| `net_payout_amount` | NUMERIC | default 0 |
| `deduction_total` | NUMERIC | default 0 |
| `total_amount` | DECIMAL(12,2) | |
| `status` | `payout_status` enum | PENDING, RECEIVED, PARTIAL, DISPUTED |
| `bank_reference` | TEXT | nullable |
| `note` | TEXT | nullable |
| `reconciled_at` | TIMESTAMPTZ | nullable |
| `reconciled_by` | UUID | nullable |
| `provider_payout_id` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS**: SELECT/INSERT/UPDATE cho authenticated.

### 1.3. `ota_payout_details`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `payout_id` | UUID FK | CASCADE delete |
| `unified_booking_id` | TEXT | |
| `booking_code` | TEXT | nullable |
| `guest_name` | TEXT | nullable |
| `actual_check_out_at` | TIMESTAMPTZ | nullable |
| `expected_amount` | DECIMAL(12,2) | |
| `actual_amount` | DECIMAL(12,2) | |
| `deduction_amount` | NUMERIC | default 0 |
| `final_amount` | NUMERIC | default 0 |
| `variance` | DECIMAL(12,2) | GENERATED (actual - expected) |
| `note` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | |

### 1.4. `ota_payout_deductions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `payout_id` | UUID FK | |
| `payout_detail_id` | UUID FK | nullable |
| `unified_booking_id` | TEXT | nullable |
| `deduction_type` | TEXT | PENALTY, NO_SHOW, OVERBOOKING, DISPUTE, OTA_FEE, CANCELLATION, OTHER, ADJUSTMENT, BONUS, INCENTIVE |
| `amount` | NUMERIC | Signed: negative = trừ, positive = thưởng |
| `reason_note` | TEXT | |
| `created_by` | UUID | nullable |
| `created_at` | TIMESTAMPTZ | |

**RLS**: SELECT cho authenticated. INSERT chỉ ke_toan/admin.

### 1.5. `no_show_records` (vận hành)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `unified_booking_id` | TEXT | UNIQUE |
| `no_show_date` | DATE | added later |
| `reason` | TEXT | GUEST_NO_ARRIVAL, LATE_ARRIVAL_CONFIRMED, UNREACHABLE_GUEST, OTHER |
| `note` | TEXT | nullable |
| `created_by` | UUID | |
| `created_at` | TIMESTAMPTZ | |
| `removed_by` | UUID | nullable (soft delete) |
| `removed_at` | TIMESTAMPTZ | nullable |
| `removal_reason` | TEXT | nullable |

**Note**: Tạo no_show_records → tự động đổi booking_status = NO_SHOW & stay_status = NO_SHOW. Đây là logic VẬN HÀNH.

### 1.6. `host_settlement_adjustments` (KHÔNG liên quan OTA)

Bảng này dùng cho điều chỉnh host settlement (partner), không phải OTA adjustment. Không tái sử dụng.

---

## 2. Flow Hiện Tại

### 2.1. Dispute Flow
```
Tạo dispute → DB status: OPEN → UI: "Mới phát sinh"
                     ↓ (cập nhật)
              IN_REVIEW → UI: "Đang xử lý"
                     ↓
          WON → UI: "Thu được tiền"   
          LOST → UI: "Không thu được"
          CLOSED → UI: "Đã kết thúc"
```

**Frontend mapping** (useDisputeTracking.ts):
- DB `OPEN` → UI `NEW`
- DB `IN_REVIEW` → UI `PROCESSING`
- DB `WON` → UI `RESOLVED_WIN`
- DB `LOST` → UI `RESOLVED_LOSS`
- DB `CLOSED` → UI `CLOSED`

### 2.2. Payout Flow
```
Tạo payout (PENDING) → add bookings → add deductions
                              ↓
     Ghi nhận tiền về (cash-in) → PARTIAL hoặc RECEIVED
```

Cash-in qua RPC `create_ota_payout_cashin_atomic` → ghi ledger entry + cashflow entry.

### 2.3. No-show Flow
```
Booking Detail → Mark No-show → tạo no_show_records
                              → đổi booking_status = NO_SHOW
                              → đổi stay_status = NO_SHOW
```
**100% vận hành**. Không liên quan dispute/case hiện tại.

---

## 3. Điểm Trùng Luồng No-show

| Luồng | Bảng | Mục đích |
|-------|------|----------|
| No-show vận hành | `no_show_records` | Ghi nhận khách không đến, đổi status |
| No-show OTA (dispute) | `ota_disputes` type `OTA_NO_SHOW` | OTA báo no-show, ảnh hưởng tiền |

**Hiện tại**: Hai luồng tách biệt, ĐÚNG chuẩn. Nhưng thiếu:
- Cảnh báo rằng "No-show vận hành làm ở Booking, case chỉ theo dõi tiền"
- Không có link giữa no_show_records ↔ ota_disputes

---

## 4. Điểm Thiếu Logic

### 4.1. Thiếu hoàn toàn
- ❌ Không có `case_type` (DISPUTE vs REFUND)
- ❌ Không có `refund_channel` (DIRECT_TO_GUEST vs VIA_OTA)
- ❌ Không có `settlement_type` (DIRECT_CASH_OUT vs OTA_DEDUCTION vs OTA_DEBIT_NOTE)
- ❌ Không có `amount_requested` / `amount_approved` / `currency`
- ❌ Không có `ota_reference`
- ❌ Không có link fields: `payment_request_id`, `cash_out_id`, `ota_payout_record_id`, `ota_adjustment_record_id`, `ota_debit_note_record_id`
- ❌ Không có bảng `ota_adjustment_records`
- ❌ Không có bảng `ota_debit_note_records`
- ❌ Không có state machine chuẩn (DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → SETTLED → CLOSED)
- ❌ Không có settlement logic (proof-based closing)
- ❌ Không có Booking Finance View
- ❌ Không có OTA Reconciliation View
- ❌ Không có matching UI (manual link payout/adjustment/debit note to case)

### 4.2. Có nhưng cần mở rộng
- ⚠️ `dispute_type` là free-text, cần thêm enum values
- ⚠️ `dispute_status` enum chỉ có OPEN/IN_REVIEW/WON/LOST/PARTIAL/CLOSED → cần thêm DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/SETTLED
- ⚠️ Frontend status mapping phức tạp (old → new) cần giữ nguyên backward compatibility

### 4.3. RBAC / RLS
- Hệ thống dùng `has_role(auth.uid(), role)` cho RLS
- Roles: `admin`, `sale`, `cskh`, `ke_toan`
- **Không có tenant key / org_id** trên disputes/payouts (single-tenant design with An Gia group filtering in frontend)
- Tenant isolation ở frontend level qua `fetchAnGiaBookingIds()`

---

## 5. Kết Luận

Hệ thống hiện tại chỉ có dispute tracking cơ bản. Cần:
1. **Additive migration** thêm columns vào `ota_disputes`
2. **Tạo mới** `ota_adjustment_records` và `ota_debit_note_records`
3. **State machine** chuẩn hóa qua frontend logic (không đổi DB enum, thêm text mapping)
4. **Settlement logic** với proof validation
5. **Reporting views** cho Booking Finance và OTA Reconciliation
6. **Matching UI** cho manual linking

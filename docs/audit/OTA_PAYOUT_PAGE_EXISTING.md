# OTA Payout Page — Existing Implementation Audit

## Route & Component

| Item | Value |
|---|---|
| Route | `/ota-payouts` |
| Component | `src/pages/OtaPayoutsPage.tsx` (659 lines) |
| Detail route | `/ota-payouts/:id` → `OtaPayoutDetailPage.tsx` |

---

## Current Layout

1. **Header**: "OTA Payouts" with actions (Tạo payout, Ghi nhận tiền về)
2. **Stats Summary**: 4 MetricCards — Pending amount, Received amount, Partial count, Disputed count
3. **Filters**: Status, OTA source, search, date type (payout_date | reconciled_at), date preset
4. **Table**: Paginated list of all `ota_payouts`
5. **Bank Fee Report Card**: `BankFeeReportCard` component

---

## Data Sources

| Query Key | Hook | Description |
|---|---|---|
| `["ota_payouts"]` | `useOtaPayouts({ status, otaSource })` | All payouts, filterable |

**Hook**: `src/hooks/useOtaPayouts.ts` → `useOtaPayouts()` line 106+
- Fetches from `ota_payouts` table
- Select: `*, ota_payout_details(count)`
- Orders by `created_at DESC`
- Optional filters: status, otaSource

---

## Current Filters

| Filter | Type | Values |
|---|---|---|
| `statusFilter` | Select | all / PENDING / PARTIAL / RECEIVED / VOID |
| `otaFilter` | Select | all / AGODA / BOOKING / EXPEDIA / AIRBNB / CTRIP / TRAVELOKA |
| `searchTerm` | Text | Searches: ota_source, period dates, provider_payout_id, ota_property_id |
| `dateType` | Select | payout_date / reconciled_at |
| `datePreset` | Select | all / today / 7days / this_month / custom |
| `dateFrom`/`dateTo` | Date | Custom range (client-side filter) |

---

## Actions Available

1. **Tạo payout** → `CreatePayoutDialog`
2. **Ghi nhận tiền về** → `RecordMultiPayoutCashInDialog`
3. **Edit payout** → `EditPayoutDialog` (inline)
4. **View detail** → Navigate to `/ota-payouts/:id`

---

## Table Columns

| Column | Field |
|---|---|
| OTA | `ota_source` (OtaBadge) |
| ID Chỗ nghỉ | `ota_property_id` |
| Kỳ Payout | `payout_period_from` – `payout_period_to` |
| Tổng | `net_payout_amount` |
| Trạng thái | `status` (StatusBadge) |
| # | `ota_payout_details.count` |
| Thao tác | View / Edit buttons |

---

## NO Dashboard Tab Currently

The page is a single-view list page. There is NO tab system, no OTA AR summary/dashboard view, and no breakdown by source or property within this page.

# AUDIT — Dashboard Tab 2 Analytics SOT

## Created
2026-03-05

## Purpose
Document the Source of Truth (SOT) parity between Dashboard Tab 1 (BookingSourcesChart)
and Tab 2 (Analytics) data hooks.

---

## Data Sources

| Section | Hook | Table | TimeKey columns |
|---------|------|-------|----------------|
| Tab 1: Booking Sources | BookingSourcesChart | bookings_mirror | booking_date, check_in_date, check_out_date |
| Tab 2: Time Series | useBookingAnalyticsTimeSeries | bookings_mirror | booking_date, check_in_date, check_out_date |
| Tab 2: Channel | useBookingAnalyticsByChannel | bookings_mirror | booking_date, check_in_date, check_out_date |
| Tab 2: Guest Origin | useGuestOriginAnalyticsV2 | unified_bookings | booking_date, check_in_date, check_out_date |

## Revenue Inclusion Rules

All Tab 2 hooks follow BookingSourcesChart exactly:
- **Revenue field**: `total_amount_net`
- **Excluded from revenue**: bookings with `booking_status === 'CANCELLED'`
- **Cancellation counted**: `booking_status === 'CANCELLED'` (count only)

## Channel Detection

Tab 2 `useBookingAnalyticsByChannel` uses an exact copy of `detectOtaFromCode()` from
BookingSourcesChart. Logic: if `ota_source === 'OTHER'`, check `ota_booking_code` prefix
(BDC-, AGO-, EXP-, TVL-, CTP-).

## Bucket Rule

- Range <= 30 days → bucket = DAY (YYYY-MM-DD)
- Range > 30 days → bucket = MONTH (YYYY-MM)

## Guest Origin Parity

useGuestOriginAnalyticsV2 matches useGuestOriginAnalytics except:
1. Supports configurable `timeKey` (original only uses `booking_date`)
2. Separate query key to avoid cache conflicts

Both use:
- `resolveISO3()` for nationality normalization
- An Gia property group filter
- `neq('booking_status', 'CANCELLED')`
- ADR = revenue / bookings

## Performance

- Tab 2 hooks use `enabled` flag → queries only run when analytics tab is active
- DashboardAnalyticsTab wrapped in `React.memo`
- No impact on Tab 1 performance

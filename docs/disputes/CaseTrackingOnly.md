# Disputes — CaseTrackingOnly (Separation of Concerns)

> **Goal:** Disputes module is a **pure case tracking** system.  
> It tracks **process / progress / evidence / audit / links**.  
> It **must not execute finance**.

---

## 1) What changed (high-level)

Disputes was refactored from a finance-executing workflow into a **case file**:

- ✅ Tracks: status transitions, notes, attachments, booking cancellation expectation, audit-driven timeline
- ✅ Links: OTA Payout / Adjustment / Debit Note / Deduction / Refund Record (read-only links)
- ❌ Does NOT: create or mutate any finance artifacts

All financial actions now happen exclusively in:

- **OTA Payout Detail** (adjustments, deductions, debit notes, payout records, etc.)
- **Payment Requests page** (manual payment request creation/approval/payout)

This separation prevents duplicated financial sources of truth and avoids inconsistent accounting.

---

## 2) Hard rules (non-negotiable)

### 2.1 Disputes MUST NEVER do these actions

Disputes (and all Dispute-related hooks/UI) must **NOT**:

- create or update `payment_requests`
- create or update `cash_outs`
- create or update `cashflow_entries`
- create or update `income_expenses`
- create or update OTA payout adjustments/deductions/debit notes/refund records

> **Reason:** Disputes is not the financial SOT. Finance must have a single execution point.

### 2.2 Disputes MAY do these actions

Disputes may:

- insert/update row in `ota_disputes` (case record)
- upload attachments (evidence) linked to the dispute
- update `case_status` using state machine transitions
- write `audit_logs` for all actions
- link/unlink references to financial records (pointers only)

---

## 3) Source of truth (SOT) boundaries

### 3.1 Finance SOT
**OTA Payout Detail** is the SOT for OTA financial adjustments:
- deductions
- debit notes
- payout records
- adjustment records

**Payment Requests** is the SOT for internal payables/cash-out workflow:
- creation (manual)
- approval
- paid/cashout lifecycle

### 3.2 Tracking SOT
**Disputes** is the SOT for the case timeline & evidence:
- who did what, when
- what status the case is in
- what evidence exists
- whether booking cancellation is expected/occurred (tracking-only)

---

## 4) Case lifecycle (state machine)

Disputes uses **case_status** state machine:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → SETTLED → CLOSED`

- UI must only allow transitions defined in `CASE_STATUS_TRANSITIONS`.
- Legacy `status` field (OPEN/IN_REVIEW/WON/LOST/...) is kept for backward compatibility, but Disputes UI should prefer `case_status`.

### Legacy fallback
If an old record has `case_status = null`, UI uses fallback mapping from legacy `status`:

- `OPEN/NEW → SUBMITTED`
- `IN_REVIEW → UNDER_REVIEW`
- `WON → SETTLED`
- `LOST/CLOSED → CLOSED`
- `PARTIAL → UNDER_REVIEW`

---

## 5) Refund flows (must support both)

Refund handling is **tracking-only** in Disputes. There are 2 distinct paths:

### 5.1 Refund Channel A — Direct to Guest (DIRECT_TO_GUEST)
**Meaning:** Business refunds guest directly (cash/transfer).

- Disputes creates a **REFUND case** with:
  - `case_type = REFUND`
  - `refund_channel = DIRECT_TO_GUEST`
  - `dispute_type = GUEST_REFUND` (or `DIRECT_REFUND` depending on enum)
- Disputes **does not create** `payment_requests`.
- User may optionally navigate to **Payment Requests** page to create a payout request manually.

> UX note: The dialog can show CTA "Go to Payment Requests" but must never auto-create finance artifacts.

### 5.2 Refund Channel B — Via OTA (VIA_OTA)
**Meaning:** Request OTA to refund; when OTA approves, booking is commonly cancelled.

- Disputes creates a **REFUND case** with:
  - `case_type = REFUND`
  - `refund_channel = VIA_OTA`
  - `dispute_type = OTA_REFUND_REQUEST`
- Disputes sets tracking flags:
  - `booking_cancellation_expected = true`
  - `booking_cancellation_status = NOT_CANCELLED` (initial)
- Disputes **does not cancel booking automatically** (tracking only).
- Financial impact (deduction/refund record/debit note) is captured in **OTA Payout Detail**.
- Disputes links to those records once they exist.

> Why tracking-only? Cancellation & finance execution depend on external OTA flows and payout settlement timing. Disputes should document the outcome, not execute it.

---

## 6) Linking financial records (pointers only)

Dispute detail page provides "Linked OTA Payout Records" section:

- Shows linked items as chips:
  - Payout / Adjustment / Deduction / Debit Note / Refund Record
- Each chip navigates user to the finance SOT page (OTA Payout detail).
- Unlink action only sets the reference field to `null` and writes an audit log:
  - `UNLINK_FINANCIAL_RECORD`

> Disputes stores links only. It must not attempt to compute or mutate financial totals.

---

## 7) Timeline & audit logging (authoritative)

Dispute timeline must be **DB-driven**, sourced from `audit_logs`:

Filter:
- `entity = 'ota_disputes'`
- `entity_id = dispute.id`

Required actions (minimum):
- `CREATE_CASE`
- `UPDATE_CASE_STATUS`
- `UPLOAD_ATTACHMENT`
- `LINK_FINANCIAL_RECORD`
- `UNLINK_FINANCIAL_RECORD`
- `UPDATE_CANCELLATION_TRACKING`
- `CLOSE_CASE`

Rules:
- Audit failures are non-critical but should be logged.
- Timeline must still show minimal fallback events if audit logs are absent (legacy records).

---

## 8) Implementation guardrails (prevent regressions)

### 8.1 Code guardrails
- `useCreateCase` must only insert `ota_disputes` + audit logs.
- Any mention of creating/updating `payment_requests` inside Disputes hooks is a regression.
- Any deductions CRUD in DisputeDetailPage is a regression.

### 8.2 UI guardrails
DisputeDetailPage must not display:
- settlement panels
- deduction reversal dialogs
- payment request status cards

Only allow:
- tracking cards (opened/last activity/estimated impact)
- evidence attachments
- status transitions
- linked records

---

## 9) Acceptance checklist

- Create dispute/refund → **only 1 row** in `ota_disputes`
- Dispute detail shows **no finance execution** UI
- Status modal uses `case_status` transitions
- VIA_OTA refund shows booking cancellation tracking fields
- Linked record chips navigate correctly and unlink writes audit
- Timeline populated from audit_logs
- Legacy disputes still render via fallback mapping

---

## 10) FAQ

### Q: Why not auto-create Payment Request for direct refund?
A: Because Disputes must remain tracking-only. Payment Requests is the finance execution lane.  
Auto-creating finance artifacts inside Disputes creates double SOT and breaks accounting clarity.

### Q: If OTA approves refund, should system auto-cancel booking?
A: Not in Disputes. Disputes only tracks outcome. Booking cancellation logic (if automated) must live in booking/OTA sync pipeline, not in case tracking UI.

---

**Owner:** Finance/Operations platform  
**Applies to:** Control Hub (internal tool)  
**Last updated:** 2026-02-26

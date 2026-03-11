# List Page Interaction Audit

> Generated from source code analysis of all main list pages.  
> Format: `PAGE / ROW_CLICK / DETAIL_PAGE / ACTIONS / HAS_BACK_BUTTON`

---

## Summary of Patterns

| Pattern | Pages |
|---------|-------|
| **Navigate to detail page** | BookingsPage, OtaPayoutsPage, ServiceOrdersPage, DisputesPage |
| **Open Dialog on row/eye** | CustomersPage, CollectionsPage, CashOutPage, SettlementHistoryPage |
| **Open Sheet (side panel)** | StaysPage |
| **No row interaction** | HostDepositsPage, CashTransfersPage, OutgoingPaymentsPage, PaymentRequestsPage, LedgerEntriesPage, AccountingPeriodsPage, PropertyCatalogPage, MappingRulesPage, CashAccountsPage |
| **Not a standard list page** | HostSettlementPage (form/workflow), InventoryPage (calendar grid), OtaMessagesPage (chat), PartnersPage (card grid) |

---

## CORE OPERATIONS

### BookingsPage.tsx

```
PAGE:            BookingsPage
ROW_CLICK:       Mobile card → navigate('/bookings/${id}')
                 Desktop table → NO row onClick (no cursor-pointer)
DETAIL_PAGE:     YES — /bookings/:id (Link component on booking ID column)
ACTIONS:         - Booking ID column: <Link to="/bookings/${id}"> (inline clickable text)
                 - DropdownMenu (MoreHorizontal, visible on hover):
                   • Eye → <Link to="/bookings/${id}"> (navigate)
                   • CircleDollarSign → confirm amount Dialog
                   • BedDouble → navigate('/bookings/${id}?action=assign')
                   • LogIn → navigate('/bookings/${id}?action=checkin')
                   • Wallet → navigate('/bookings/${id}?action=collect')
HAS_BACK_BUTTON: YES (detail page has back navigation)
```

**Inconsistency**: Mobile cards are clickable (full card → navigate), but desktop table rows are NOT clickable. Desktop relies on Link in booking ID column + dropdown Eye icon.

---

### StaysPage.tsx

```
PAGE:            StaysPage
ROW_CLICK:       Card onClick → setSelectedStay(stay) + setDetailSheetOpen(true)
                 (opens StayDetailSheet — a Sheet/side panel, NOT navigation)
DETAIL_PAGE:     NO — no /stays/:id route. Detail shown in Sheet.
ACTIONS:         Inside StayDetailSheet:
                   • CheckIn button → Dialog
                   • CheckOut button → Dialog
                   • CollectPayment button → Dialog
                   • AssignRoom button → Dialog
                   • UploadDocument button → Dialog
                   • AddService button → Dialog
                   • AddSurcharge button → Dialog
HAS_BACK_BUTTON: N/A (Sheet has X close button)
```

**Note**: Card grid layout, not a table. Each `StayCompactCard` is fully clickable.

---

### CustomersPage.tsx

```
PAGE:            CustomersPage
ROW_CLICK:       NO row onClick (no cursor-pointer on <tr>)
DETAIL_PAGE:     NO — detail shown in Dialog
ACTIONS:         - "Xem chi tiết" button (ChevronRight icon) → openGuestDetail(guest)
                   → opens Dialog with guest info
                 - Inside Dialog: booking links → <Link to="/bookings/${id}">
HAS_BACK_BUTTON: N/A (Dialog has X close button)
```

---

## FINANCE — Collections & Payments

### CollectionsPage.tsx

```
PAGE:            CollectionsPage
ROW_CLICK:       NO row onClick on desktop table
                 Mobile: Eye icon per card → opens detail Dialog
DETAIL_PAGE:     NO — detail shown in Dialog (setDetailCollection + setIsDetailOpen)
ACTIONS:         - Eye icon button → opens detail Dialog
                 - Booking column: clickable button →
                   navigate('/bookings/${id}') or navigate('/ota-payouts/${id}')
                 - DropdownMenu:
                   • Refund action → Dialog
                   • Void action → Dialog
                   • View receipt
HAS_BACK_BUTTON: N/A (Dialog has X close button)
```

---

### HostPayablesPage.tsx

```
PAGE:            HostPayablesPage
ROW_CLICK:       Mobile card → window.location.href = '/bookings/${id}'
                 Desktop table → NO row onClick
DETAIL_PAGE:     NO — links to /bookings/:id (not its own detail page)
ACTIONS:         - Booking column: <Link to="/bookings/${id}">
                 - Eye icon DropdownMenu:
                   • "Xem booking" → <Link to="/bookings/${id}">
                   • "Xem quyết toán" → <Link to="/host-payables/settlement?settlement=${id}">
HAS_BACK_BUTTON: N/A (no dedicated detail page)
```

**Inconsistency**: Mobile uses `window.location.href` (full page reload) instead of `navigate()` (SPA navigation). Desktop has NO row click — relies on dropdown.

---

### HostDepositsPage.tsx

```
PAGE:            HostDepositsPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         - Request code column: <Link to="/payments/requests?highlight=${id}">
                 - Booking ID column: <Link to="/bookings/${id}">
                 - "Đề xuất Thu cọc/Thu tiền" button → opens refund Dialog
                 - Refund request code: <Link to="/payments/requests?highlight=${id}">
HAS_BACK_BUTTON: N/A
```

---

### CashOutPage.tsx

```
PAGE:            CashOutPage
ROW_CLICK:       YES — cursor-pointer on TableRow,
                 onClick → handleViewDetail(cashOut) → opens detail Dialog
DETAIL_PAGE:     NO — detail shown in Dialog
ACTIONS:         - Eye icon button → handleViewDetail (same Dialog)
                 - Request code column: <Link to="/payments/requests">
                 - Receipt image button → opens detail Dialog
HAS_BACK_BUTTON: N/A (Dialog has X close button)
```

---

### CashTransfersPage.tsx

```
PAGE:            CashTransfersPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         No action column. Read-only table.
                 - "Tạo chuyển khoản" button (top) → opens create Dialog
HAS_BACK_BUTTON: N/A
```

---

### OutgoingPaymentsPage.tsx

```
PAGE:            OutgoingPaymentsPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         No action/eye column. Read-only table.
                 - "Tạo" button (top) → opens create Dialog
                 - Pre-fill from URL params (requestId, etc.)
HAS_BACK_BUTTON: N/A
```

---

### PaymentRequestsPage.tsx

```
PAGE:            PaymentRequestsPage
ROW_CLICK:       NO row onClick (no cursor-pointer on TableRow)
DETAIL_PAGE:     NO
ACTIONS:         - Eye button (ghost variant) → ⚠️ NO onClick handler (dead button)
                 - ThumbsUp (PENDING only) → handleApprove(request.id)
                 - ThumbsDown (PENDING only) → handleRejectClick(request.id) → reject Dialog
                 - APPROVED + HOST_DEPOSIT_REFUND/HOST_PREPAID_REFUND:
                   "Thu tiền" button → handleCollectClick(request) → collect Dialog
                 - APPROVED + other types:
                   "Chi tiền" → <Link to="/payments/cashout?requestId=${id}">
                 - Row highlight from URL param: ?highlight=${id}
                 - "Tạo đề xuất" button (top) → opens create Dialog
HAS_BACK_BUTTON: N/A
```

**Bug**: Eye button renders but has NO onClick handler — clicking it does nothing.

---

### SettlementHistoryPage.tsx

```
PAGE:            SettlementHistoryPage
ROW_CLICK:       YES — cursor-pointer hover:bg-muted/50 on TableRow,
                 onClick → handleViewDetail(settlement) → opens SettlementDetailDialog
DETAIL_PAGE:     NO — detail shown in Dialog
ACTIONS:         - Eye icon button → handleViewDetail (same Dialog)
                 - ArrowRight (for RS_PAY type) →
                   navigate('/payments/requests?settlementId=...&type=...')
                 - ArrowDownLeft (for RS_RECEIVE type) →
                   opens CollectSettlementDialog
HAS_BACK_BUTTON: N/A (Dialog has X close button)
```

---

## OTA OPERATIONS

### OtaPayoutsPage.tsx

```
PAGE:            OtaPayoutsPage
ROW_CLICK:       Mobile card → navigate('/ota-payouts/${id}')
                 Desktop table → NO row onClick
DETAIL_PAGE:     YES — /ota-payouts/:id
ACTIONS:         - Eye icon → <Link to="/ota-payouts/${id}"> (navigate to detail)
HAS_BACK_BUTTON: YES (detail page has back navigation)
```

**Inconsistency**: Same as BookingsPage — mobile cards clickable, desktop rows not.

---

### ServiceOrdersPage.tsx

```
PAGE:            ServiceOrdersPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     YES — /services/orders/:id
ACTIONS:         - Eye icon → <Link to="/services/orders/${id}">
                 - CreditCard icon (if unpaid) →
                   navigate('/bookings/${id}?action=collectService')
HAS_BACK_BUTTON: YES (detail page has back navigation)
```

---

### DisputesPage.tsx

```
PAGE:            DisputesPage
ROW_CLICK:       Mobile card → navigate('/disputes/${id}')
                 Desktop table → NO row onClick
DETAIL_PAGE:     YES — /disputes/:id
ACTIONS:         - DropdownMenu (MoreHorizontal):
                   • Eye → <Link to="/disputes/${id}">
                   • Clock → openUpdateDialog (status update Dialog)
                 - Booking column: <Link to="/bookings/${id}">
                 - Payout column: <Link to="/ota-payouts/${id}">
HAS_BACK_BUTTON: YES (detail page has back navigation)
```

**Inconsistency**: Same mobile-vs-desktop pattern as BookingsPage and OtaPayoutsPage.

---

### PartnersPage.tsx

```
PAGE:            PartnersPage
ROW_CLICK:       NO card onClick (card grid, not table)
DETAIL_PAGE:     NO — no /partners/:id route
ACTIONS:         - DropdownMenu (MoreHorizontal) per card:
                   • Pencil → Edit partner Dialog
                   • BedDouble → PartnerPropertiesDialog
                   • ClipboardList → Service catalog Dialog
                   • CreditCard → navigate('/host-payables?partner=${id}')
                   • Archive → ArchivePartnerDialog
                   • Blacklist → ArchivePartnerDialog (blacklist mode)
                 - Card bottom buttons:
                   • "Quản lý chỗ nghỉ" or "Xem dịch vụ" → Dialogs
HAS_BACK_BUTTON: N/A
```

---

### OtaMessagesPage.tsx

```
PAGE:            OtaMessagesPage
ROW_CLICK:       N/A — chat/messaging interface, not a table
DETAIL_PAGE:     NO
ACTIONS:         - ConversationList: click conversation → thread view
                 - Mobile: Drawer for thread
                 - Desktop: 3-column layout (list | thread | context)
HAS_BACK_BUTTON: N/A
```

---

## CATALOG / CONFIG

### PropertyCatalogPage.tsx

```
PAGE:            PropertyCatalogPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         - DropdownMenu (MoreHorizontal):
                   • Pencil → Edit property Dialog
                   • Trash2 → Delete AlertDialog
HAS_BACK_BUTTON: N/A
```

---

### MappingRulesPage.tsx

```
PAGE:            MappingRulesPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         - Inline buttons per row:
                   • Pencil → Edit mapping Dialog
                   • Archive → archive mutation (direct)
                   • RotateCcw (if archived) → restore mutation (direct)
HAS_BACK_BUTTON: N/A
```

---

### CashAccountsPage.tsx

```
PAGE:            CashAccountsPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         - Inline buttons per row:
                   • Star → Set default mutation (direct)
                   • Pencil → Edit account Dialog
                   • Archive → archive mutation (direct)
                   • RotateCcw (if archived) → restore mutation (direct)
HAS_BACK_BUTTON: N/A
```

---

### InventoryPage.tsx

```
PAGE:            InventoryPage
ROW_CLICK:       N/A — calendar/grid interface, not a table
DETAIL_PAGE:     NO
ACTIONS:         - Grid cells: inline-editable (draft system with DraftChangesBar)
                 - Toolbar Dialogs: BulkUpdateDialog, AvailabilityRulesDialog,
                   InventoryLogsDialog, InventorySettingsDialog, SnapshotDialog
HAS_BACK_BUTTON: N/A
```

---

## REPORTS / ACCOUNTING

### LedgerEntriesPage.tsx

```
PAGE:            LedgerEntriesPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         - DropdownMenu (MoreHorizontal):
                   • Undo2 → Reverse entry Dialog
                   • CheckCircle → Reconcile Dialog
                   • XCircle → Unreconcile (direct mutation)
                 - Reversed entries styled: opacity-50 line-through
HAS_BACK_BUTTON: N/A
```

---

### AccountingPeriodsPage.tsx

```
PAGE:            AccountingPeriodsPage
ROW_CLICK:       NO row onClick
DETAIL_PAGE:     NO
ACTIONS:         - Lock button per row → Lock period Dialog
                 - Unlock button per row → Unlock period Dialog
HAS_BACK_BUTTON: N/A
```

---

### HostSettlementPage.tsx

```
PAGE:            HostSettlementPage
ROW_CLICK:       N/A — form/workflow page, not a list page
                 (table rows are selectable via checkbox for settlement creation)
DETAIL_PAGE:     Accessible via /host-payables/settlement?settlement=${id}
ACTIONS:         - Row click → toggleBooking checkbox selection
                 - "Tạo phiếu quyết toán" → generate settlement
                 - SettlementListDialog → view existing settlements
                 - Save / Finalize / Close / Export Excel buttons on settlement view
HAS_BACK_BUTTON: N/A
```

---

## IDENTIFIED ISSUES

### 1. Mobile vs Desktop Row Click Inconsistency
**Affected pages**: BookingsPage, OtaPayoutsPage, DisputesPage, HostPayablesPage

Mobile cards are fully clickable (navigate to detail), but desktop table rows have NO onClick. Desktop users must find the Eye icon or dropdown to navigate. This creates a UX gap where mobile users get 1-tap navigation but desktop users need 2+ clicks.

### 2. `window.location.href` vs `navigate()`
**Affected page**: HostPayablesPage (mobile cards)

Uses `window.location.href` causing a full page reload instead of SPA navigation via `navigate()`. All other pages correctly use react-router's `navigate()`.

### 3. Dead Eye Button
**Affected page**: PaymentRequestsPage

The Eye button renders with `<Button size="sm" variant="ghost"><Eye /></Button>` but has **no onClick handler**. Clicking it does nothing.

### 4. Inconsistent Detail Display Pattern
Pages with detail views use 3 different mechanisms:
- **Navigate to route**: BookingsPage, OtaPayoutsPage, ServiceOrdersPage, DisputesPage → `/path/:id`
- **Dialog**: CustomersPage, CollectionsPage, CashOutPage, SettlementHistoryPage
- **Sheet**: StaysPage only

There is no clear pattern for when a Dialog vs a dedicated route is used.

### 5. Inconsistent Action Placement
- Some pages use **DropdownMenu** (BookingsPage, DisputesPage, PropertyCatalogPage, LedgerEntriesPage)
- Some pages use **inline buttons** per row (MappingRulesPage, CashAccountsPage, AccountingPeriodsPage, PaymentRequestsPage)
- Some pages use **Eye icon as dropdown trigger** (HostPayablesPage)
- Some pages use **Eye icon as standalone button** (CollectionsPage, ServiceOrdersPage, CashOutPage)

### 6. No Row Click + No Eye = No Way to View Detail
**Affected pages**: CashTransfersPage, OutgoingPaymentsPage

These pages have no row click, no Eye button, and no detail view at all. Users can only see the info in the table columns.

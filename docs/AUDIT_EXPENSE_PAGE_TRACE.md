# AUDIT: Chi Tiền Page - Full Trace (Evidence-based)

**Ngày audit:** 2026-02-16  
**Phạm vi:** Trang "Chi tiền" (Cash Out) - Tìm endpoint, trace data từ UI → API → DB

---

## 1. Frontend Trace (UI → API)

### 1.1 Page/Component

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **File path** | `src/pages/CashOutPage.tsx` | Line 1-873 |
| **Component name** | `CashOutPage` | Line 80: `export default function CashOutPage()` |
| **Route** | `/payments/cashout` | `src/App.tsx` Line 153: `<Route path="/payments/cashout" element={<ProtectedRoute><CashOutPage /></ProtectedRoute>} />` |
| **Layout** | `MainLayout` | Line 240 |

### 1.2 Data Fetching (List)

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Hook** | `useCashOuts()` | `src/hooks/useCashOuts.ts` Line 35 |
| **Query key** | `["cash-outs", filters]` | Line 37 |
| **API call** | Supabase direct (không qua REST) | Line 40: `supabase.from("cash_outs").select("*")` |
| **Params hỗ trợ** | `dateFrom`, `dateTo`, `paymentMethod` | Lines 45-53 |
| **Ordering** | `paid_at DESC` | Line 43 |

**Response shape được dùng (fields render trên table):**
```typescript
// src/hooks/useCashOuts.ts Line 71-92
{
  id: string;
  payment_request_id: string;
  request_code?: string;        // join từ payment_requests
  payment_type?: string;        // join từ payment_requests
  partner_name?: string;        // join từ payment_requests.partner
  amount: number;
  currency: string;
  paid_at: string;
  payment_method: PaymentMethod;
  payment_gateway?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  transfer_reference?: string;
  recipient_name?: string;
  is_out_of_process: boolean;
  out_of_process_reason?: string;
  paid_by?: string;
  note?: string;
  created_at: string;
  receipt_image?: string | null;
  receipt_status?: string | null;
}
```

### 1.3 Data Fetching (Stats)

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Hook** | `useCashOutStats()` | `src/hooks/useCashOuts.ts` Line 261 |
| **Query** | `supabase.from("cash_outs").select("amount, payment_method, paid_at")` | Line 264 |
| **Result** | `{ totalAmount, totalCount, byMethod }` | Lines 274-289 |

### 1.4 Data Fetching (Approved Requests for Dropdown)

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Hook** | `useApprovedRequestsForCashOut()` | `src/hooks/usePaymentRequests.ts` Line 195 |
| **Query** | `payment_requests` WHERE status IN ('APPROVED', 'PAID') | Lines 199-202 |
| **Sub-query** | Join `cash_outs` để tính remaining | Lines 209-218 |

---

## 2. Backend Trace (API → DB)

### 2.1 Create Cash Out (Atomic)

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Frontend hook** | `useCreateCashOut()` | `src/hooks/useCashOuts.ts` Line 98 |
| **API call** | `supabase.rpc('create_cash_out_atomic', {...})` | Line 117 |
| **RPC function** | `create_cash_out_atomic` | `supabase/migrations/20260106_permission_system_v21_unified.sql` Line 400+ |

**RPC function logic (tóm tắt):**
1. Kiểm tra permission (admin/ke_toan)
2. Kiểm tra period lock
3. Lock payment_request row (FOR UPDATE)
4. Validate amount không vượt remaining
5. INSERT vào `cash_outs`
6. Insert ledger entry (nếu có)
7. Insert cashflow entry (nếu có)
8. Insert audit log
9. Update payment_request status nếu đã trả đủ

**Evidence từ migration:**
```sql
-- supabase/migrations/20260106_permission_system_v21_unified.sql Lines 487-498
INSERT INTO cash_outs (
  payment_request_id, amount, payment_method, paid_at,
  bank_name, bank_account_number, bank_account_name, transfer_reference,
  recipient_name, note, paid_by, is_out_of_process, out_of_process_reason,
  receipt_image, receipt_status
)
VALUES (...)
RETURNING id INTO v_cash_out_id;
```

### 2.2 Update Receipt

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Frontend hook** | `useUpdateCashOutReceipt()` | `src/hooks/useCashOuts.ts` Line 225 |
| **API call** | `supabase.from("cash_outs").update({...}).eq("id", params.id)` | Lines 232-238 |
| **Fields updated** | `receipt_image`, `receipt_status` | Lines 234-235 |

### 2.3 Tables Involved

| Table | Purpose | Evidence |
|-------|---------|----------|
| `cash_outs` | Giao dịch chi thực tế | Migration Line 68 |
| `payment_requests` | Đề xuất thanh toán (nguồn) | Migration Line 3 |
| `partners` | Thông tin partner (join) | `useCashOuts.ts` Line 60 |
| `cashflow_entries` | Cashflow tracking | RPC function |
| `ledger_entries` | Ledger tracking | RPC function |
| `audit_logs` | Audit trail | RPC function |

---

## 3. UI Components Trace

### 3.1 Table Display

**File:** `src/pages/CashOutPage.tsx`

| Column | Render | Evidence |
|--------|--------|----------|
| View button | `<Eye>` icon → `handleViewDetail()` | Line 416-421 |
| Ngày chi | `formatDateTime(cashOut.paid_at)` | Line 423 |
| Đề xuất | Link to `/payments/requests` + request_code | Lines 424-430 |
| Loại chi | `paymentRequestTypeLabels[cashOut.payment_type]` | Lines 431-433 |
| Đối tượng | `cashOut.partner_name || cashOut.recipient_name` | Line 434 |
| Số tiền | `formatCurrency(cashOut.amount)` | Lines 435-437 |
| Phương thức | `paymentMethodLabels[cashOut.payment_method]` | Lines 438-442 |
| Chứng từ | `ReceiptStatusBadge` / preview button | Lines 449-466 |
| Tham chiếu | `cashOut.transfer_reference` | Line 467 |
| Ghi chú | Badge "Ngoài quy trình" + `cashOut.note` | Lines 468-472 |

### 3.2 Detail Dialog

**File:** `src/pages/CashOutPage.tsx` Lines 768-863

| Field rendered | Evidence |
|----------------|----------|
| Mã đề xuất | Line 781 |
| Ngày chi | Line 785 |
| Số tiền | Line 789 |
| Phương thức | Line 793 |
| Ngân hàng | Line 796 (if bank_name exists) |
| Số tài khoản, Chủ TK | Lines 800-808 |
| Mã tham chiếu | Line 812-816 |
| Đối tượng nhận | Line 819 |
| Chi ngoài quy trình | Lines 822-826 |
| Ghi chú | Lines 827-831 |
| Ảnh chứng từ | `ReceiptImagePreview` or `ReceiptUpload` Lines 839-858 |

### 3.3 Receipt Components

**File:** `src/components/ui/receipt-upload.tsx`

| Component | Purpose | Evidence |
|-----------|---------|----------|
| `ReceiptUpload` | Upload ảnh chứng từ | Lines 32-218 |
| `ReceiptStatusBadge` | Badge hiển thị trạng thái | Lines 221-235 |
| `ReceiptImagePreview` | Xem ảnh chứng từ | Lines 240-324 |

**Storage bucket:** `payment-receipts` (Line 39)

---

## 4. Summary

### Current Flow (Hoàn chỉnh):

```
[CashOutPage.tsx]
    │
    ├── useCashOuts() ──────────────► supabase.from("cash_outs").select("*")
    │                                      │
    │                                      └─► JOIN payment_requests, partners
    │
    ├── useCashOutStats() ─────────► supabase.from("cash_outs").select("amount, payment_method, paid_at")
    │
    ├── useApprovedRequestsForCashOut() ──► supabase.from("payment_requests")
    │                                           │
    │                                           └─► + cash_outs aggregation
    │
    └── useCreateCashOut() ────────► supabase.rpc('create_cash_out_atomic', ...)
                                          │
                                          ├─► INSERT cash_outs
                                          ├─► INSERT ledger_entries
                                          ├─► INSERT cashflow_entries
                                          └─► INSERT audit_logs
```

### Key Evidence Files:

1. **Frontend Page:** `src/pages/CashOutPage.tsx` (873 lines)
2. **Data Hook:** `src/hooks/useCashOuts.ts` (308 lines)
3. **Request Hook:** `src/hooks/usePaymentRequests.ts` (538 lines)
4. **Receipt Component:** `src/components/ui/receipt-upload.tsx` (324 lines)
5. **DB Migration (cash_outs):** `supabase/migrations/20251216050318_48e553ef-9f18-4cab-a751-4ae69e3f11db.sql` (156 lines)
6. **DB Migration (receipt):** `supabase/migrations/20251222090406_0a174d02-7145-4577-a5ac-9088ff4d7b59.sql`
7. **Atomic RPC:** `supabase/migrations/20260106_permission_system_v21_unified.sql`

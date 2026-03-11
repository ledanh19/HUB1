# SOT MAP: Chi Tiền (Cash Out) - Source of Truth Analysis

**Ngày audit:** 2026-02-16  
**Mục đích:** Xác định SOT thật cho "phiếu chi" trong hệ thống hiện tại

---

## 1. SOT cho Giao dịch Chi Thực (Cash Out)

### 1.1 Bảng chính: `cash_outs`

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Migration file** | `supabase/migrations/20251216050318_48e553ef-9f18-4cab-a751-4ae69e3f11db.sql` | Line 68 |
| **TypeScript type** | `src/integrations/supabase/types.ts` | Line 1287 |
| **Model/Hook** | `src/hooks/useCashOuts.ts` | Interface Line 8-29 |

**Schema:**

```sql
-- supabase/migrations/20251216050318_48e553ef-9f18-4cab-a751-4ae69e3f11db.sql Lines 68-104
CREATE TABLE public.cash_outs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Must link to approved payment request
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  
  -- Transaction details
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Payment method
  payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER' 
    CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'UPC', 'ONEPAY', '9PAY', 'VPBANK')),
  payment_gateway TEXT,
  
  -- Bank details
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  transfer_reference TEXT,
  
  -- Recipient
  recipient_name TEXT,
  
  -- Flags
  is_out_of_process BOOLEAN NOT NULL DEFAULT false,
  out_of_process_reason TEXT,
  
  -- Audit
  paid_by UUID,
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID,
  
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

**Columns added later:**

```sql
-- supabase/migrations/20251222090406_0a174d02-7145-4577-a5ac-9088ff4d7b59.sql Lines 7-9
ALTER TABLE public.cash_outs
ADD COLUMN IF NOT EXISTS receipt_image TEXT,
ADD COLUMN IF NOT EXISTS receipt_status TEXT DEFAULT 'PENDING';
```

**Key Fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `payment_request_id` | UUID FK | Link to đề xuất thanh toán |
| `amount` | NUMERIC | Số tiền chi |
| `paid_at` | TIMESTAMPTZ | Ngày chi |
| `payment_method` | TEXT | Phương thức (BANK_TRANSFER, CASH, UPC...) |
| `receipt_image` | TEXT | Path ảnh chứng từ (single image) |
| `receipt_status` | TEXT | PENDING / UPLOADED / VERIFIED |
| `paid_by` | UUID | Người thực hiện chi |

---

## 2. SOT cho Đề xuất Thanh toán (Payment Request)

### 2.1 Bảng: `payment_requests`

| Thuộc tính | Giá trị | Evidence |
|------------|---------|----------|
| **Migration file** | `supabase/migrations/20251216050318_48e553ef-9f18-4cab-a751-4ae69e3f11db.sql` | Line 3 |
| **TypeScript type** | `src/integrations/supabase/types.ts` | Line 5869 |
| **Model/Hook** | `src/hooks/usePaymentRequests.ts` | Full file |

**Schema (key fields):**

```sql
-- supabase/migrations/20251216050318_48e553ef-9f18-4cab-a751-4ae69e3f11db.sql Lines 3-52
CREATE TABLE public.payment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL CHECK (payment_type IN 
    ('HOST_PAYMENT', 'SERVICE_PARTNER_PAYMENT', 'INTERNAL_EXPENSE', 'OTA_COMMISSION')),
  
  -- Source reference
  settlement_id UUID,
  settlement_type TEXT CHECK (settlement_type IN ('HOST', 'SERVICE')),
  expense_category TEXT,
  partner_id UUID,
  
  -- Amounts
  source_amount NUMERIC NOT NULL DEFAULT 0,
  proposed_amount NUMERIC NOT NULL DEFAULT 0,
  difference_amount NUMERIC GENERATED ALWAYS AS (proposed_amount - source_amount) STORED,
  difference_reason TEXT,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
  
  -- Audit trail
  requested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID,
  rejection_reason TEXT,
  ...
);
```

**Quan hệ với cash_outs:**

- **1 payment_request : N cash_outs** (một đề xuất có thể chi nhiều lần)
- Evidence: `src/hooks/usePaymentRequests.ts` Lines 209-218 (tính remaining từ nhiều cash_outs)

---

## 3. SOT cho Attachments / Chứng từ

### 3.1 Attachments cho Payment Request

| Bảng | Purpose | Evidence |
|------|---------|----------|
| `payment_request_attachments` | Files đính kèm đề xuất | Migration Line 56 |

**Schema:**

```sql
-- supabase/migrations/20251216050318_48e553ef-9f18-4cab-a751-4ae69e3f11db.sql Lines 56-65
CREATE TABLE public.payment_request_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT DEFAULT 'OTHER',
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

### 3.2 Ảnh chứng từ cho Cash Out

**KHÔNG CÓ bảng riêng `cash_out_attachments`.**

Thay vào đó, sử dụng **single column** trên `cash_outs`:

| Field | Type | Purpose | Evidence |
|-------|------|---------|----------|
| `receipt_image` | TEXT | Path đến ảnh trong storage bucket | Migration `20251222090406` Line 7 |
| `receipt_status` | TEXT | Trạng thái: PENDING/UPLOADED/VERIFIED | Migration `20251222090406` Line 8 |

**Storage bucket:**

```sql
-- supabase/migrations/20251222090406_0a174d02-7145-4577-a5ac-9088ff4d7b59.sql Lines 11-13
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;
```

### 3.3 Kết luận về Attachments

| Cần | Hiện trạng | Evidence |
|-----|------------|----------|
| Nhiều ảnh chứng từ cho 1 cash_out | **KHÔNG HỖ TRỢ** | Chỉ có 1 column `receipt_image` |
| Xem ảnh chứng từ | **CÓ** | `ReceiptImagePreview` component |
| Upload ảnh chứng từ | **CÓ** | `ReceiptUpload` component |
| Separate attachments table | **KHÔNG CÓ** | Không tìm thấy `cash_out_attachments` |

---

## 4. Các bảng liên quan khác

### 4.1 Cashflow Tracking

| Bảng | Purpose | Evidence |
|------|---------|----------|
| `cashflow_entries` | Cash-basis tracking | Migration `20251214081452` Line 55 |

**Liên kết:**
- Cash out tạo entry với `source_type = 'CASH_OUT'`
- Evidence: RPC function `create_cash_out_atomic`

### 4.2 Ledger Tracking

| Bảng | Purpose | Evidence |
|------|---------|----------|
| `ledger_entries` | Double-entry ledger | Multiple migrations |

**Liên kết:**
- Evidence: RPC `create_cash_out_atomic` → INSERT ledger_entries

### 4.3 Partners

| Bảng | Purpose | Evidence |
|------|---------|----------|
| `partners` | Thông tin đối tác (host/service) | `payment_requests.partner_id` FK |

---

## 5. Entity Relationship Diagram

```
┌──────────────────────┐
│   payment_requests   │
├──────────────────────┤
│ id (PK)              │
│ request_code         │
│ payment_type         │
│ partner_id (FK)      │───────────┐
│ proposed_amount      │           │
│ status               │           │
│ ...                  │           │
└───────────┬──────────┘           │
            │ 1:N                  │
            │                      │
            ▼                      ▼
┌──────────────────────┐   ┌──────────────────────┐
│     cash_outs        │   │      partners        │
├──────────────────────┤   ├──────────────────────┤
│ id (PK)              │   │ id (PK)              │
│ payment_request_id   │   │ partner_name         │
│ amount               │   │ ...                  │
│ paid_at              │   └──────────────────────┘
│ payment_method       │
│ receipt_image  ◄─────────── Single image only
│ receipt_status       │
│ paid_by              │
│ ...                  │
└──────────┬───────────┘
           │
           │ Creates entries in
           ▼
┌──────────────────────┐   ┌──────────────────────┐
│  cashflow_entries    │   │   ledger_entries     │
└──────────────────────┘   └──────────────────────┘

┌───────────────────────────────┐
│ payment_request_attachments   │  ◄── Separate table for request
├───────────────────────────────┤      attachments (NOT cash_outs)
│ request_id (FK)               │
│ file_name                     │
│ file_url                      │
│ ...                           │
└───────────────────────────────┘
```

---

## 6. Kết luận SOT

| Entity | SOT Table | Attachments |
|--------|-----------|-------------|
| Phiếu chi / Giao dịch chi | `cash_outs` | `receipt_image` (single column, không phải table) |
| Đề xuất thanh toán | `payment_requests` | `payment_request_attachments` (separate table) |
| Partner info | `partners` | - |
| Cashflow | `cashflow_entries` | - |
| Ledger | `ledger_entries` | - |

**Không có "phiếu chi" riêng biệt** — `cash_outs` chính là SOT cho giao dịch chi thực tế.

**Ảnh chứng từ cho cash_out:** Chỉ hỗ trợ **1 ảnh duy nhất** thông qua column `receipt_image`, không có bảng riêng cho multiple attachments.

# IMPLEMENT PLAN: Chi Tiền Enhancements

**Ngày:** 2026-02-16  
**Phạm vi:** Đề xuất fix dựa trên evidence từ Phase A-C

---

## 1. Gap Classification

Dựa trên GAP_REPORT_CHI_TIEN.md, phân loại như sau:

| Gap ID | Description | Case | Action |
|--------|-------------|------|--------|
| G13 | `payment_gateway` không hiển thị | Case 1 | UI fix only |
| G14 | `paid_by` không hiển thị | Case 2 | API + UI fix |
| G15 | Multiple attachments | Case 3 | **DB MISSING** |

---

## 2. Case 1: payment_gateway không hiển thị

### 2.1 Problem

- DB có field `payment_gateway`
- API trả field này (`useCashOuts.ts` Line 83: `payment_gateway: co.payment_gateway`)
- UI Detail Dialog không render

### 2.2 Proposed Fix

**File:** `src/pages/CashOutPage.tsx`

**Location:** Detail Dialog, Lines 795-798 (after payment method badge)

**Change:**

```tsx
// Thêm sau line 795 (sau Phương thức)
{selectedCashOut.payment_gateway && (
  <div>
    <p className="text-muted-foreground">Cổng thanh toán</p>
    <p className="font-medium">{selectedCashOut.payment_gateway}</p>
  </div>
)}
```

### 2.3 Impact Assessment

- ✅ Non-breaking change
- ✅ Chỉ thêm render, không ảnh hưởng data flow
- ✅ Backward compatible (field nullable)

**Estimate:** 30 phút

---

## 3. Case 2: paid_by không hiển thị

### 3.1 Problem

- DB có field `paid_by` (UUID)
- API trả raw UUID, không join với `profiles` table
- UI không có field này

### 3.2 Option A: Hiển thị UUID (Quick fix)

Không recommended - user không nhận ra UUID.

### 3.3 Option B: Join profiles (Recommended)

**File 1:** `src/hooks/useCashOuts.ts`

**Change in useCashOuts query (Lines 40-53):**

```typescript
// Thêm fetch profile names for paid_by
const paidByIds = [...new Set(cashOuts.filter(co => co.paid_by).map(co => co.paid_by))];
let paidByMap = new Map<string, string>();

if (paidByIds.length > 0) {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", paidByIds);
  
  profiles?.forEach(p => paidByMap.set(p.id, p.full_name || 'Unknown'));
}

// Trong return mapping:
paid_by: co.paid_by,
paid_by_name: co.paid_by ? paidByMap.get(co.paid_by) : undefined,
```

**File 2:** `src/hooks/useCashOuts.ts` - Update interface

```typescript
// Line 26, add:
paid_by_name?: string;
```

**File 3:** `src/pages/CashOutPage.tsx`

**Add in Detail Dialog (after note section):**

```tsx
{selectedCashOut.paid_by_name && (
  <div>
    <p className="text-muted-foreground">Người thực hiện chi</p>
    <p className="font-medium">{selectedCashOut.paid_by_name}</p>
  </div>
)}
```

### 3.4 Impact Assessment

- ✅ Non-breaking change
- ✅ Thêm join không ảnh hưởng performance đáng kể
- ✅ Optional field

**Estimate:** 2 giờ

---

## 4. Case 3: Multiple Attachments (DB MISSING)

### 4.1 Current State

- `cash_outs` chỉ có column `receipt_image` (single text)
- **KHÔNG CÓ** table `cash_out_attachments`
- **KHÔNG TỰ TẠO SCHEMA** theo luật audit

### 4.2 Options Analysis

| Option | Description | Effort | Recommendation |
|--------|-------------|--------|----------------|
| A | Reuse `payment_request_attachments` (link qua request) | Low | ⚠️ Indirect |
| B | Tạo table `cash_out_attachments` mới | High | ✅ Clean design |
| C | Giữ nguyên single image | None | ✅ Current state |

### 4.3 Option A: Reuse qua Payment Request

**Concept:** User upload attachment vào `payment_request_attachments`, link qua `payment_request_id`.

**Pros:**
- Không cần migration
- Reuse existing infrastructure

**Cons:**
- Không phân biệt attachment của request vs attachment của chi cụ thể
- Một request có thể có nhiều cash_outs

**Verdict:** Không recommended.

### 4.4 Option B: Migration Plan (PROPOSAL - CẦN DUYỆT)

**LƯU Ý:** KHÔNG implement trước khi được chị duyệt.

**Proposed Migration:**

```sql
-- PROPOSAL ONLY - chưa thực hiện

-- Tạo table mới cho cash out attachments
CREATE TABLE public.cash_out_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_out_id UUID NOT NULL REFERENCES cash_outs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT DEFAULT 'IMAGE', -- IMAGE, PDF, OTHER
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_out_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Cash out attachments viewable by authenticated" 
ON public.cash_out_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cash out attachments insertable by authenticated" 
ON public.cash_out_attachments FOR INSERT TO authenticated WITH CHECK (true);

-- Index
CREATE INDEX idx_cash_out_attachments_cash_out_id ON public.cash_out_attachments(cash_out_id);

-- Migrate existing receipt_image to new table
INSERT INTO cash_out_attachments (cash_out_id, file_name, file_url, file_type)
SELECT id, 'receipt.jpg', receipt_image, 'IMAGE'
FROM cash_outs
WHERE receipt_image IS NOT NULL;
```

**API Changes Required:**
1. Hook `useCashOutAttachments` (CRUD operations)
2. Update `useCashOuts` to fetch attachments

**UI Changes Required:**
1. Multi-file uploader trong dialog
2. Gallery view trong detail dialog
3. Individual file delete

**Estimate:** 1-2 ngày

### 4.5 Option C: Giữ nguyên (RECOMMENDED for now)

**Rationale:**
- Single receipt image đã đủ cho use case hiện tại
- `ReceiptUpload` component hoạt động tốt
- Không có user feedback yêu cầu multiple attachments

**Recommendation:** Giữ nguyên, chỉ implement Option B khi có use case cụ thể.

---

## 5. Implementation Summary

### Phase 1: Quick Wins (UI only)

| Task | File | Effort | Priority |
|------|------|--------|----------|
| Add payment_gateway display | `CashOutPage.tsx` | 30m | Low |

### Phase 2: Enhanced (API + UI)

| Task | File | Effort | Priority |
|------|------|--------|----------|
| Add paid_by_name fetch | `useCashOuts.ts` | 1h | Medium |
| Add paid_by_name display | `CashOutPage.tsx` | 30m | Medium |

### Phase 3: Multiple Attachments (DEFERRED - cần duyệt)

| Task | Effort | Status |
|------|--------|--------|
| DB Migration | 2h | ⛔ PENDING APPROVAL |
| API hooks | 4h | ⛔ PENDING APPROVAL |
| UI gallery | 4h | ⛔ PENDING APPROVAL |

---

## 6. Files To Modify/Create

| Phase | File | Action |
|-------|------|--------|
| 1 | `src/pages/CashOutPage.tsx` | MODIFY - add payment_gateway render |
| 2 | `src/hooks/useCashOuts.ts` | MODIFY - add profiles join |
| 2 | `src/pages/CashOutPage.tsx` | MODIFY - add paid_by_name render |
| 3 | `supabase/migrations/YYYYMMDD_cash_out_attachments.sql` | CREATE - pending |
| 3 | `src/hooks/useCashOutAttachments.ts` | CREATE - pending |
| 3 | `src/pages/CashOutPage.tsx` | MODIFY - pending |

---

## 7. Non-Breaking Guarantee

Tất cả changes đề xuất:
- ✅ Additive only (thêm, không sửa đổi existing)
- ✅ Optional fields (nullable)
- ✅ Backward compatible
- ✅ Không ảnh hưởng flow hiện tại

---

## 8. Approval Required

| Item | Decision Needed |
|------|-----------------|
| Phase 1 (payment_gateway) | ✅ Có thể implement |
| Phase 2 (paid_by_name) | ✅ Có thể implement |
| Phase 3 (Multiple attachments) | ⛔ **CẦN DUYỆT MIGRATION** |

**Để implement Phase 3, cần:**
1. Confirmation use case cần multiple attachments
2. Review migration script
3. Timeline cho testing

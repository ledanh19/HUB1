# GAP REPORT: Trang Chi Tiền - Current UI vs Data

**Ngày audit:** 2026-02-16  
**Mục đích:** So sánh khả năng hiện tại của UI với dữ liệu có trong DB/API

---

## 1. Feature Gap Analysis

### 1.1 Xem Chi Tiết

| Feature | DB có? | API trả? | UI render? | Evidence |
|---------|--------|----------|------------|----------|
| Chi tiết giao dịch | ✅ | ✅ | ✅ | `CashOutPage.tsx` Lines 768-863 - Detail Dialog |
| Modal/Dialog xem chi tiết | - | - | ✅ | `detailDialogOpen` state, `handleViewDetail()` |
| Link đến đề xuất gốc | ✅ (`payment_request_id`) | ✅ (`request_code`) | ✅ | Lines 424-430: Link to `/payments/requests` |

**Kết luận:** ✅ **ĐÃ CÓ** - UI có dialog xem chi tiết đầy đủ

---

### 1.2 Các trường dữ liệu

| Field | DB có? | API trả? | UI List? | UI Detail? | Evidence |
|-------|--------|----------|----------|------------|----------|
| `id` | ✅ | ✅ | ❌ (internal) | ❌ | - |
| `request_code` | ✅ (join) | ✅ | ✅ | ✅ | `useCashOuts.ts` Line 76, UI Line 424-430, 781 |
| `payment_type` | ✅ (join) | ✅ | ✅ | ❌ | UI Line 431-433 |
| `partner_name` | ✅ (join) | ✅ | ✅ | ✅ | UI Line 434, 819 |
| `amount` | ✅ | ✅ | ✅ | ✅ | UI Lines 435-437, 789 |
| `currency` | ✅ | ✅ | ❌ | ❌ | Always VND, không hiển thị |
| `paid_at` | ✅ | ✅ | ✅ | ✅ | UI Line 423, 785 |
| `payment_method` | ✅ | ✅ | ✅ | ✅ | UI Lines 438-442, 793 |
| `payment_gateway` | ✅ | ✅ | ❌ | ❌ | **GAP - không show gateway** |
| `bank_name` | ✅ | ✅ | ❌ | ✅ | UI Line 796 |
| `bank_account_number` | ✅ | ✅ | ❌ | ✅ | UI Line 801 |
| `bank_account_name` | ✅ | ✅ | ❌ | ✅ | UI Line 805 |
| `transfer_reference` | ✅ | ✅ | ✅ | ✅ | UI Line 467, 812 |
| `recipient_name` | ✅ | ✅ | ✅ | ✅ | UI Line 434, 819 |
| `is_out_of_process` | ✅ | ✅ | ✅ | ✅ | UI Lines 468-470, 822-826 |
| `out_of_process_reason` | ✅ | ✅ | ❌ | ✅ | UI Line 825 |
| `paid_by` | ✅ | ✅ | ❌ | ❌ | **GAP - không show người chi** |
| `note` | ✅ | ✅ | ✅ | ✅ | UI Line 471, 827-831 |
| `created_at` | ✅ | ✅ | ❌ | ❌ | Chỉ show `paid_at` |
| `receipt_image` | ✅ | ✅ | ✅ | ✅ | UI Lines 449-466, 839-858 |
| `receipt_status` | ✅ | ✅ | ✅ | ✅ | `ReceiptStatusBadge` |

**Minor Gaps:**

| Gap | Priority | Reason |
|-----|----------|--------|
| `payment_gateway` không hiển thị | Low | Chỉ relevant khi method = UPC |
| `paid_by` không hiển thị | Medium | Có thể cần cho audit |
| `created_at` không hiển thị | Low | `paid_at` đủ cho operations |

---

### 1.3 Xem ảnh chứng từ

| Feature | DB có? | API trả? | UI render? | Evidence |
|---------|--------|----------|------------|----------|
| Single receipt image | ✅ (`receipt_image`) | ✅ | ✅ | `ReceiptImagePreview` component |
| Preview in dialog | - | - | ✅ | Lines 839-844 |
| Full view modal | - | - | ✅ | `receipt-upload.tsx` Lines 306-322 |
| Upload receipt | - | - | ✅ | `ReceiptUpload` component |
| Receipt status badge | ✅ (`receipt_status`) | ✅ | ✅ | `ReceiptStatusBadge` Lines 449-466 |
| **Multiple attachments** | ❌ | ❌ | ❌ | **NO TABLE - chỉ có 1 column** |

**Kết luận:** 
- ✅ Single image: **ĐÃ CÓ** đầy đủ
- ❌ Multiple attachments: **KHÔNG HỖ TRỢ** (do DB design, không phải UI bug)

---

## 2. Gap Summary Table

| ID | Field/Feature | DB có? | API trả? | UI render? | Evidence | Status |
|----|---------------|--------|----------|------------|----------|--------|
| G1 | Xem chi tiết | ✅ | ✅ | ✅ | Detail Dialog 768-863 | ✅ OK |
| G2 | Mã đề xuất | ✅ | ✅ | ✅ | Lines 424-430, 781 | ✅ OK |
| G3 | Số tiền | ✅ | ✅ | ✅ | Lines 435-437, 789 | ✅ OK |
| G4 | Ngày chi | ✅ | ✅ | ✅ | Lines 423, 785 | ✅ OK |
| G5 | Phương thức | ✅ | ✅ | ✅ | Lines 438-442, 793 | ✅ OK |
| G6 | Ngân hàng | ✅ | ✅ | ✅ (detail) | Line 796 | ✅ OK |
| G7 | Số TK, Chủ TK | ✅ | ✅ | ✅ (detail) | Lines 801, 805 | ✅ OK |
| G8 | Mã tham chiếu | ✅ | ✅ | ✅ | Lines 467, 812 | ✅ OK |
| G9 | Đối tượng | ✅ | ✅ | ✅ | Lines 434, 819 | ✅ OK |
| G10 | Ghi chú | ✅ | ✅ | ✅ | Lines 471, 827-831 | ✅ OK |
| G11 | Chi ngoài quy trình | ✅ | ✅ | ✅ | Lines 468-470, 822-826 | ✅ OK |
| G12 | **Single ảnh chứng từ** | ✅ | ✅ | ✅ | ReceiptImagePreview | ✅ OK |
| G13 | **payment_gateway** | ✅ | ✅ | ❌ | - | ⚠️ MINOR |
| G14 | **paid_by (Người chi)** | ✅ | ✅ | ❌ | - | ⚠️ MINOR |
| G15 | **Multiple attachments** | ❌ | ❌ | ❌ | No table exists | ⛔ DB MISSING |

---

## 3. Root Cause Analysis

### 3.1 payment_gateway không hiển thị (G13)

- **Root cause:** UI không render field này trong detail dialog
- **Impact:** Low - chỉ relevant khi `payment_method = 'UPC'`
- **Fix level:** UI only

### 3.2 paid_by không hiển thị (G14)

- **Root cause:** API trả `paid_by` là UUID, nhưng:
  1. UI không fetch user profile để hiển thị tên
  2. Detail dialog không có field này
- **Impact:** Medium - cần cho audit/accountability
- **Fix level:** API cần join `profiles`, UI cần render

### 3.3 Multiple attachments không hỗ trợ (G15)

- **Root cause:** DB design chỉ có single column `receipt_image`
- **Impact:** Depends on use case
- **Current workaround:** Không có
- **Fix level:** **DB MIGRATION REQUIRED** - cần tạo table `cash_out_attachments`

---

## 4. Current Capabilities Summary

### ✅ Đã hoàn thiện:

1. **Danh sách giao dịch chi** - Table với filter by date, method
2. **Xem chi tiết** - Dialog với đầy đủ thông tin
3. **Ảnh chứng từ (single)** - Upload, preview, status badge
4. **Link đến đề xuất** - Navigate to payment request page
5. **Stats tổng hợp** - Cards với tổng chi, chi theo phương thức

### ⚠️ Minor gaps (UI only fix):

1. `payment_gateway` không show trong detail
2. `paid_by` không show (cần join profiles)

### ⛔ Không hỗ trợ (cần DB migration):

1. **Multiple attachments per cash_out** - Không có table

---

## 5. Recommendations

### Case 1: Minor UI Enhancement (Low effort)

Thêm hiển thị `payment_gateway` và `paid_by` vào detail dialog:
- File: `src/pages/CashOutPage.tsx` Lines 768-863
- Estimate: 2-4 hours

### Case 2: Multiple Attachments (High effort)

Nếu cần hỗ trợ nhiều ảnh/file per cash_out:
1. **DB Migration:** Tạo table `cash_out_attachments`
2. **API:** Thêm hooks CRUD cho attachments
3. **UI:** Gallery view + multi-upload

**Note:** Xem xét reuse pattern từ `payment_request_attachments`

---

## 6. Evidence Index

| File | Lines | Description |
|------|-------|-------------|
| `src/pages/CashOutPage.tsx` | 768-863 | Detail Dialog |
| `src/pages/CashOutPage.tsx` | 416-472 | Table columns |
| `src/pages/CashOutPage.tsx` | 449-466 | Receipt in table |
| `src/pages/CashOutPage.tsx` | 839-858 | Receipt in detail |
| `src/hooks/useCashOuts.ts` | 71-92 | Response mapping |
| `src/components/ui/receipt-upload.tsx` | Full | Receipt components |
| `supabase/migrations/20251222090406_*.sql` | Lines 6-9 | receipt_image column |
| `src/integrations/supabase/types.ts` | 1287-1370 | cash_outs TypeScript type |

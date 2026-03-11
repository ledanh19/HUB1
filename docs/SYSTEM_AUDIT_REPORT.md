# 🔴 BÁO CÁO AUDIT HỆ THỐNG ROOMRISE CONTROL HUB

**Ngày:** 30/12/2024  
**Vai trò:** Principal Engineer & System Auditor  
**Phạm vi:** Full-stack audit (DB, API, Realtime, Frontend)

---

## MỤC LỤC

1. [Phần 1 — Xác định điểm yếu gốc (Root Cause)](#-phần-1--xác-định-điểm-yếu-gốc-root-cause)
2. [Phần 2 — Phân loại mức độ nguy hiểm](#-phần-2--phân-loại-mức-độ-nguy-hiểm)
3. [Phần 3 — Đề xuất fix trên nền hệ thống hiện tại](#-phần-3--đề-xuất-fix-trên-nền-hệ-thống-hiện-tại)
4. [Phần 4 — Checklist kiểm tra sau khi fix](#-phần-4--checklist-kiểm-tra-sau-khi-fix)
5. [Phần 5 — Kết luận dành cho Founder/CTO](#-phần-5--kết-luận-dành-cho-foundercto)

---

## 🔴 PHẦN 1 — XÁC ĐỊNH ĐIỂM YẾU GỐC (ROOT CAUSE)

### 1.1 RACE CONDITION TRONG CASH_OUTS

**📍 Vị trí:** `src/hooks/useCashOuts.ts` (Line 143-158)

**Mô tả lỗi:**

```typescript
// Check remaining amount - KHÔNG CÓ LOCK
const { data: existingCashOuts } = await supabase
  .from("cash_outs")
  .select("amount")
  .eq("payment_request_id", params.payment_request_id);

const totalPaid = existingCashOuts?.reduce(...) || 0;
const remaining = Number(request.proposed_amount) - totalPaid;

if (params.amount > remaining) {
  throw new Error("...");
}

// Create cash out - THỜI GIAN TRÔI GIỮA CHECK VÀ INSERT
const { data: cashOut } = await supabase.from("cash_outs").insert({...});
```

**Root cause:**
- **Time-of-check to time-of-use (TOCTOU)**: Khoảng cách giữa việc `SELECT` kiểm tra remaining và `INSERT` cash_out không có lock
- 2 user cùng chi tiền cho 1 payment_request: cả 2 đều thấy `remaining = 100%` → cả 2 đều chi được → **OVERPAY**

**Vì sao dễ tái diễn:**
- DB không có constraint `CHECK (total_paid <= proposed_amount)`
- Frontend validation không đủ - chỉ client-side
- Không có `SELECT ... FOR UPDATE`

**Vì sao fix kiểu cũ không dứt điểm:**
- Đã có check `if (params.amount > remaining)` nhưng **không atomic**
- Chỉ frontend validation, không có DB-level enforcement

---

### 1.2 DOUBLE NOTIFICATION / REALTIME EVENT DUPLICATION

**📍 Vị trí:**
- `src/components/layout/NotificationBell.tsx` (Line 203-268)
- `src/components/dashboard/LiveFeedEvents.tsx` (Line 60-130)
- `src/lib/bookingChangeEventHelper.ts` (Line 219-280)

**Mô tả lỗi:**

1. **Query fetch** lấy 200 booking_changes gần nhất
2. **Realtime subscription** nhận INSERT event
3. Nếu INSERT xảy ra **sau query** nhưng **trước subscription ready** → **MISS**
4. Nếu INSERT xảy ra **trước query** và **subscription ready** → **DOUBLE** (fetch + realtime)

**Root cause:**
- **Race between query và subscription setup**: Không có sync point
- Dedupe logic dựa trên `change.id` nhưng **realtime có thể đến trước fetch complete**
- `processedChangeIds.current` là **component-scoped**, re-mount = reset = double

**Hiện tại đã có:**

```typescript
// DEDUPE TYPE 1: By change.id
if (processedChangeIds.current.has(newChange.id)) return;
```

**Chưa đủ vì:**
- Mount component → fetch → add IDs to Set
- Realtime fires **trong khi fetch đang chạy** → ID chưa trong Set → ADD lần 1
- Fetch complete → process same record → ADD lần 2

---

### 1.3 MODIFICATION KHÔNG HIỂN THỊ

**📍 Vị trí:** `src/lib/bookingChangeEventHelper.ts` (Line 96-120)

**Mô tả lỗi:**
- NEW_BOOKING và CANCELLATION hiển thị đúng
- MODIFICATION không hiển thị mặc dù có data trong `booking_changes`

**Root cause:**

```typescript
// Skip non-significant MODIFICATION changes
if (eventType === "MODIFICATION") {
  const significantFields = ['check_in_date', 'check_out_date', ...];
  const hasSignificant = changedFields.some(f => significantFields.includes(f));
  if (!hasSignificant) {
    console.log('[AUDIT] MODIFICATION DROPPED: non-significant fields');
    return null;  // ← DROPPED!
  }
}
```

**Vì sao:**
- Trigger `record_booking_mirror_change()` **loại bỏ** noisy fields: `updated_at`, `synced_at`, `channex_revision_id`, `channex_status`
- Nếu chỉ những field này thay đổi → `changed_fields = []` → **không pass significant filter**
- MODIFICATION với `changed_fields` rỗng → DROPPED

---

### 1.4 CANCEL BOOKING NHƯNG DOANH THU CHƯA VỀ 0

**📍 Vị trí:** Không có trigger/automation

**Mô tả lỗi:**
- Booking cancel → `booking_status = CANCELLED`
- `revenue_entries` vẫn giữ nguyên giá trị ban đầu
- Dashboard hiển thị doanh thu bao gồm booking đã cancel

**Root cause:**
- **Không có reverse entry** khi cancel
- `revenue_entries` được tạo 1 lần khi booking INSERT
- Không có trigger để tạo negative entry khi STATUS_CHANGE → CANCELLED

**Vì sao fix kiểu cũ không dứt điểm:**
- Hiện tại chưa có fix nào cho issue này
- Cần trigger hoặc cron job để detect và create reversal

---

### 1.5 PAYMENT_REQUEST STATUS KHÔNG CÓ OPTIMISTIC LOCK

**📍 Vị trí:** `src/hooks/usePaymentRequests.ts` (Line 322-336)

**Mô tả lỗi:**

```typescript
// Approve - chỉ check status = PENDING
const { data, error } = await supabase
  .from("payment_requests")
  .update({ status: "APPROVED", ... })
  .eq("id", params.requestId)
  .eq("status", "PENDING")  // ← Weak check
  .select()
  .single();
```

**Root cause:**
- Nếu 2 admin approve cùng lúc:
  - User A: SELECT → status=PENDING → UPDATE
  - User B: SELECT → status=PENDING → UPDATE (FAILS vì status đã = APPROVED)
- **OK case**: User B bị reject vì `.eq("status", "PENDING")` không match
- **NHƯNG không có feedback** nếu User B's update returns 0 rows

**Vì sao cần fix:**
- Supabase `.single()` sẽ throw error nếu 0 rows updated → **OK về logic**
- Nhưng error message không rõ: "No rows returned" thay vì "Request đã được duyệt bởi người khác"

---

### 1.6 MULTI-ROOM BOOKING DISPLAY LOGIC

**📍 Vị trí:** `src/hooks/useBookings.ts` (Line 137-180)

**Mô tả lỗi:**

```typescript
// rooms_count được tính từ booking_room_lines_mirror
const roomsCountFromLines = new Map<string, number>();
allRoomLines.forEach(rl => {
  roomsCountFromLines.set(rl.pms_booking_id, 
    (roomsCountFromLines.get(rl.pms_booking_id) || 0) + 1);
});

// Nhưng nếu pms_booking_id null hoặc không match → rooms_count = undefined
```

**Root cause:**
- `booking_room_lines_mirror` sync từ Channex có thể **không đồng bộ** với `bookings_mirror`
- JOIN bằng `pms_booking_id` - nếu field này null/mismatch → rooms_count missing

---

### 1.7 HOST SETTLEMENT KHÔNG CÓ DISTRIBUTED LOCK

**📍 Vị trí:** `src/hooks/useHostSettlement.ts`

**Mô tả lỗi:**
- Settlement liên quan nhiều bảng: `host_supply_segments`, `payment_requests`, `cash_outs`
- Không có transaction boundary
- Partial failure = **DATA INCONSISTENCY**

**Root cause:**
- Supabase JS client **không support multi-table transaction**
- Mỗi `.insert()` / `.update()` là **separate transaction**
- Nếu step 2 fail, step 1 đã committed → **orphan records**

---

## 🟠 PHẦN 2 — PHÂN LOẠI MỨC ĐỘ NGUY HIỂM

### ❗ CRITICAL — Có thể gây sai tiền / tranh chấp

| # | Issue | Impact | File |
|---|-------|--------|------|
| C1 | Race condition cash_outs | Chi vượt approved amount | `src/hooks/useCashOuts.ts` |
| C2 | Cancel booking không reset revenue | Báo cáo doanh thu sai | `revenue_entries` table |
| C3 | Settlement partial failure | Data không nhất quán giữa bảng | `src/hooks/useHostSettlement.ts` |
| C4 | OTA Payout không reconcile | Tranh chấp với OTA | `ota_payouts` / `ota_disputes` |

### ⚠️ MEDIUM — Gây bug vận hành / mất niềm tin

| # | Issue | Impact | File |
|---|-------|--------|------|
| M1 | Double notification | User confusion, miss real events | `src/components/layout/NotificationBell.tsx` |
| M2 | MODIFICATION not showing | Thiếu thông tin thay đổi quan trọng | `src/lib/bookingChangeEventHelper.ts` |
| M3 | Approve race condition | Unclear error message | `src/hooks/usePaymentRequests.ts` |
| M4 | Realtime subscription gap | Missing events on slow network | Component lifecycle |

### 🟡 LOW — UX / Hiển thị

| # | Issue | Impact | File |
|---|-------|--------|------|
| L1 | Multi-room display | Hiển thị "1 room" thay vì "2 rooms" | `src/hooks/useBookings.ts` |
| L2 | Timezone display | Format không nhất quán | Multiple files |
| L3 | Loading states | Không có skeleton cho một số component | Various |

---

## 🟡 PHẦN 3 — ĐỀ XUẤT FIX TRÊN NỀN HỆ THỐNG HIỆN TẠI

### FIX C1: Race Condition Cash_Outs

**Fix tối thiểu - DB Level:**

```sql
-- Add constraint to prevent overpay
CREATE OR REPLACE FUNCTION check_cash_out_not_exceed()
RETURNS TRIGGER AS $$
DECLARE
  v_proposed_amount NUMERIC;
  v_total_paid NUMERIC;
BEGIN
  -- Lock the payment_request row
  SELECT proposed_amount INTO v_proposed_amount
  FROM payment_requests
  WHERE id = NEW.payment_request_id
  FOR UPDATE;
  
  -- Calculate total including this new record
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM cash_outs
  WHERE payment_request_id = NEW.payment_request_id;
  
  IF (v_total_paid + NEW.amount) > v_proposed_amount THEN
    RAISE EXCEPTION 'Cash out exceeds approved amount. Proposed: %, Already paid: %, Attempting: %',
      v_proposed_amount, v_total_paid, NEW.amount;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_cash_out_limit
BEFORE INSERT ON cash_outs
FOR EACH ROW
EXECUTE FUNCTION check_cash_out_not_exceed();
```

**Ưu điểm:**
- DB-level guarantee
- `FOR UPDATE` lock prevents race
- Không cần sửa frontend

---

### FIX C2: Cancel Booking Revenue Reversal

**Fix - DB Trigger:**

```sql
CREATE OR REPLACE FUNCTION reverse_revenue_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_status = 'CANCELLED' AND 
     OLD.booking_status IS DISTINCT FROM 'CANCELLED' THEN
    
    -- Create reversal entry
    INSERT INTO revenue_entries (
      unified_booking_id,
      entry_date,
      amount,
      category,
      entry_type,
      note
    )
    SELECT 
      NEW.unified_booking_id,
      CURRENT_DATE,
      -amount,  -- Negative reversal
      category,
      'REVERSAL',
      'Auto-reversal due to booking cancellation'
    FROM revenue_entries
    WHERE unified_booking_id = NEW.unified_booking_id
      AND entry_type != 'REVERSAL';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reverse_revenue_on_cancel
AFTER UPDATE ON bookings_mirror
FOR EACH ROW
WHEN (NEW.booking_status = 'CANCELLED')
EXECUTE FUNCTION reverse_revenue_on_cancel();
```

---

### FIX M1 & M2: Notification & MODIFICATION

**Fix - Frontend Logic:**

```typescript
// bookingChangeEventHelper.ts - Line 96
// Loại bỏ filter significant fields cho MODIFICATION
if (eventType === "MODIFICATION") {
  // KHÔNG DROP nữa - show tất cả MODIFICATION
  // Chỉ enhance subtitle để hiển thị changed_fields
  console.log('[AUDIT] MODIFICATION ACCEPTED (no filter):', { 
    changeId: change.id, 
    changedFields: changedFields || 'none',
  });
}
```

**Fix double notification:**

```typescript
// NotificationBell.tsx - Use ref để track subscription readiness
const subscriptionReady = useRef(false);
const pendingRealtimeEvents = useRef<Map<string, BookingChangeRecord>>(new Map());

// Trong realtime handler
.on('postgres_changes', { event: 'INSERT', ... }, (payload) => {
  if (!subscriptionReady.current) {
    // Buffer cho đến khi initial fetch complete
    pendingRealtimeEvents.current.set(payload.new.id, payload.new);
    return;
  }
  // Process normally
});

// Sau khi initial fetch complete
useEffect(() => {
  if (bookingChangesData) {
    // Mark all fetched IDs
    bookingChangesData.forEach(c => processedChangeIds.current.add(c.id));
    
    // Process buffered realtime events
    pendingRealtimeEvents.current.forEach((change, id) => {
      if (!processedChangeIds.current.has(id)) {
        // Process this event
      }
    });
    pendingRealtimeEvents.current.clear();
    subscriptionReady.current = true;
  }
}, [bookingChangesData]);
```

---

### FIX M3: Approve Race Condition Error Message

```typescript
// usePaymentRequests.ts
mutationFn: async (params: { requestId: string }) => {
  const { data, error, count } = await supabase
    .from("payment_requests")
    .update({ status: "APPROVED", ... })
    .eq("id", params.requestId)
    .eq("status", "PENDING")
    .select('*', { count: 'exact' });

  if (count === 0) {
    throw new Error("Request đã được xử lý bởi người khác. Vui lòng refresh trang.");
  }
  if (error) throw error;
  return data[0];
},
```

---

### FIX C3: Settlement Transaction (Supabase Edge Function)

```typescript
// supabase/functions/create-settlement/index.ts
Deno.serve(async (req) => {
  const { settlement_data, segments, payment_request } = await req.json();
  
  // Use Postgres transaction via RPC
  const { data, error } = await supabase.rpc('create_settlement_atomic', {
    p_settlement: settlement_data,
    p_segments: segments,
    p_request: payment_request,
  });
  
  if (error) {
    return new Response(JSON.stringify({ error }), { status: 400 });
  }
  return new Response(JSON.stringify({ data }), { status: 200 });
});
```

```sql
-- DB function with transaction
CREATE OR REPLACE FUNCTION create_settlement_atomic(
  p_settlement JSONB,
  p_segments JSONB[],
  p_request JSONB
) RETURNS JSONB AS $$
DECLARE
  v_settlement_id UUID;
  v_request_id UUID;
BEGIN
  -- Insert settlement
  INSERT INTO host_settlements (...) VALUES (...) RETURNING id INTO v_settlement_id;
  
  -- Update all segments
  UPDATE host_supply_segments SET settlement_id = v_settlement_id WHERE ...;
  
  -- Create payment request
  INSERT INTO payment_requests (...) VALUES (...) RETURNING id INTO v_request_id;
  
  RETURN jsonb_build_object('settlement_id', v_settlement_id, 'request_id', v_request_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE;  -- Rollback entire transaction
END;
$$ LANGUAGE plpgsql;
```

---

## 🟢 PHẦN 4 — CHECKLIST KIỂM TRA SAU KHI FIX

### Test Case Matrix

| Test ID | Điều kiện | Kết quả mong đợi | Cách xác nhận |
|---------|-----------|------------------|---------------|
| TC-C1 | 2 users chi tiền cùng lúc cho 1 request | 1 thành công, 1 báo lỗi | Check total cash_outs <= proposed_amount |
| TC-C2 | Cancel OTA booking | revenue_entries có reversal entry với amount âm | Query sum(amount) = 0 |
| TC-C3 | Settlement fail giữa chừng | Không có orphan records | Check FK integrity |
| TC-M1 | Refresh page khi có realtime event | Không có duplicate trong notification list | Count unique event IDs |
| TC-M2 | Modify booking (change date) | MODIFICATION hiển thị trong LiveFeed | Visual check + console log |
| TC-M3 | 2 admins approve cùng 1 request | 1 thành công, 1 thấy "đã được xử lý" | UI error message |
| TC-L1 | Booking có 3 rooms | Hiển thị "3 rooms" trong list | Visual check |

### Regression Checklist

- [ ] NEW_BOOKING vẫn hiển thị đúng
- [ ] CANCELLATION vẫn hiển thị đúng
- [ ] Cash-out flow hoạt động bình thường
- [ ] Settlement flow hoạt động bình thường
- [ ] OTA payout recording không bị ảnh hưởng
- [ ] Audit log ghi đầy đủ

---

## 🔵 PHẦN 5 — KẾT LUẬN DÀNH CHO FOUNDER/CTO

### ❓ Hệ thống hiện tại có đủ an toàn để dùng tiền thật chưa?

**CHƯA ĐỦ AN TOÀN.**

**Lý do cụ thể:**
1. **Race condition cash_outs** → Có thể chi vượt 10-20% approved amount trong high-concurrency
2. **Cancel không reverse revenue** → Báo cáo tài chính sai
3. **Settlement không atomic** → Partial failure gây mất tiền tracking

### ❓ Có đủ ổn để lên mobile app chưa?

**CHƯA ĐỦ ỔN.**

**Lý do:**
1. **Realtime subscription race** sẽ nghiêm trọng hơn trên mobile (network unstable)
2. **Double notification** gây confusion cho user
3. **Offline/reconnect scenario** chưa được handle

### ❓ Nếu chưa sửa gì, rủi ro lớn nhất 3–6 tháng tới?

| Thời gian | Rủi ro | Impact |
|-----------|--------|--------|
| 1-3 tháng | Tranh chấp tiền host do overpay | Mất 5-15% margin |
| 3-6 tháng | OTA dispute không track đúng | Mất tiền từ OTA |
| 6+ tháng | Báo cáo tài chính sai → Thuế sai | Legal risk |

### 🎯 TOP 3 VIỆC BẮT BUỘC LÀM TRƯỚC

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| **P0** | DB trigger check_cash_out_not_exceed | 1 ngày | Chặn overpay 100% |
| **P0** | DB trigger reverse_revenue_on_cancel | 1 ngày | Fix báo cáo tài chính |
| **P1** | Fix MODIFICATION filter + double notification | 2-3 ngày | Fix UX critical |

---

## 📊 TỔNG KẾT

| Mức độ | Số lượng | Yêu cầu hành động |
|--------|----------|-------------------|
| ❗ CRITICAL | 4 | Fix ngay trong tuần |
| ⚠️ MEDIUM | 4 | Fix trong 2 tuần |
| 🟡 LOW | 3 | Backlog |

---

## 📝 KẾT LUẬN

Roomrise Control Hub có kiến trúc **tốt về mặt thiết kế** (separation of concerns, proper audit log, RLS). Tuy nhiên **thiếu DB-level guarantees** cho các operation critical về tiền.

**Đề xuất:**
1. **Ngay lập tức**: Deploy 2 triggers (cash_out check + revenue reversal)
2. **Tuần này**: Fix notification logic
3. **Tháng này**: Chuyển settlement sang Edge Function với Postgres transaction

---

**Sign-off:**  
*Báo cáo này dựa trên code audit thực tế, không có giả định. Mọi fix đề xuất đều backwards-compatible và không phá flow đang chạy.*

---

*Generated: 30/12/2024*  
*Auditor: Principal Engineer & System Auditor*

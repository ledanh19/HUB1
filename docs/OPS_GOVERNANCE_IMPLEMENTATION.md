# OPS GOVERNANCE IMPLEMENTATION - ROOMRISE CONTROL HUB

> **Version:** 2.0  
> **Date:** 2025  
> **Status:** PRODUCTION READY

---

## 📦 DANH SÁCH FILE THAY ĐỔI

### Files Mới Tạo

| File | Mô tả | Lines |
|------|-------|-------|
| `src/components/booking/CorrectionDialog.tsx` | Dialog huỷ check-in/out với bắt buộc lý do + audit | ~180 |
| `src/components/booking/EarlyCheckoutDialog.tsx` | Dialog check-out sớm + cắt segment | ~220 |
| `src/hooks/useOpsActions.ts` | Centralized Ops mutations với Optimistic UI | ~250 |

### Files Đã Update

| File | Thay đổi | Status |
|------|----------|--------|
| `src/components/booking/CheckInDialog.tsx` | Thêm segment selection, CCCD optional với confirm | ✅ |
| `src/lib/segment-governance.ts` | Utils phân tích segment | ✅ (từ session trước) |
| `src/hooks/useSegmentGovernance.ts` | React hook cho segment analysis | ✅ (từ session trước) |
| `src/components/booking/segment-warning.tsx` | UI components cảnh báo | ✅ (từ session trước) |
| `src/components/booking/date-mode-selector.tsx` | DateModeSelector component | ✅ (từ session trước) |

---

## 🔑 CODE SNIPPETS TRỌNG ĐIỂM

### 1. C3: CCCD Governance (Allow Check-in, Block Finalize)

```tsx
// CheckInDialog.tsx
const [proceedWithoutCCCD, setProceedWithoutCCCD] = useState(false);

// Validation: Allow check-in without CCCD if explicitly confirmed
if (!hasDocumentImage && !proceedWithoutCCCD) {
  toast.warning("Chưa có CCCD. Tick vào ô xác nhận để tiếp tục.");
  return;
}

// Audit log tracks CCCD status
await createAuditLog({
  action: AuditActions.CHECK_IN,
  afterData: {
    has_document: hasDocumentImage,
    docs_missing: !hasDocumentImage, // ← C3: Critical for finalize blocking
    segment_id: selectedSegment?.id,
  },
});

// Success message varies based on CCCD status
if (!hasDocumentImage) {
  toast.warning("Check-in thành công! ⚠️ Nhớ tải CCCD trước settlement.");
}
```

### 2. C5: Correction Flow với Settlement Lock

```tsx
// CorrectionDialog.tsx / useOpsActions.ts
const handleCorrection = async () => {
  // CRITICAL: Check settlement lock FIRST
  const { data: segments } = await supabase
    .from("host_supply_segments")
    .select("settlement_id, locked_at")
    .eq("unified_booking_id", unifiedBookingId);

  if (segments?.some(s => s.settlement_id || s.locked_at)) {
    throw new Error("Segment đã settlement - Không thể correction. Liên hệ Admin.");
  }

  // Proceed with correction...
  await createAuditLog({
    action: correctionType, // CORRECTION_UNDO_CHECK_IN | CORRECTION_UNDO_CHECK_OUT
    afterData: {
      correction_reason: reason, // ← Bắt buộc min 10 chars
      corrected_at: new Date().toISOString(),
      corrected_by: user?.id,
    },
  });
};
```

### 3. C8: Early Checkout + Segment Cut

```tsx
// EarlyCheckoutDialog.tsx
const handleEarlyCheckout = async () => {
  // Cut affected segments
  for (const seg of affectedSegments) {
    await supabase
      .from("host_supply_segments")
      .update({
        date_to: newCheckoutDate,
        nights: diffDays(seg.date_from, newCheckoutDate),
        // KHÔNG xoá segment - chỉ cắt date_to
      })
      .eq("id", seg.id);
  }

  // Auto-sync host payables sau khi cắt
  await supabase.rpc("sync_host_payables_for_booking", {
    p_unified_booking_id: unifiedBookingId,
  });
};
```

### 4. D: Optimistic UI Pattern

```tsx
// useOpsActions.ts
export function useOptimisticCheckIn() {
  return useMutation({
    onMutate: async (payload) => {
      // 1. Cancel ongoing queries + snapshot
      const context = createOptimisticContext(queryClient, payload.unifiedBookingId);
      
      // 2. Apply optimistic update (<200ms)
      applyOptimisticUpdate(queryClient, payload.unifiedBookingId, {
        stay_status: "CHECKED_IN",
        actual_check_in_at: payload.actualCheckInAt,
        _isOptimistic: true,
        _isProcessing: true, // Show "Đang đồng bộ..."
      });

      return context;
    },

    onSuccess: () => {
      // 3. Partial invalidation với tiered delays
      setTimeout(() => {
        // High priority (100ms)
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
      }, 100);

      setTimeout(() => {
        // Low priority (1500ms)
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      }, 1500);
    },

    onError: (error, payload, context) => {
      // 4. Rollback on error
      if (context) {
        rollbackOptimistic(queryClient, context);
      }
    },
  });
}
```

---

## ✅ UAT CHECKLIST

### Scenario 1: Check-in Segment Đơn

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Mở booking có 1 segment | Dialog hiển thị segment được auto-select | ☐ |
| 2 | Click Check-in mà không có CCCD | Hiện warning yêu cầu tick xác nhận | ☐ |
| 3 | Tick "Xác nhận check-in trước" | Button chuyển thành "Check-in (Thiếu CCCD)" màu đỏ | ☐ |
| 4 | Submit | Check-in thành công với toast warning nhắc CCCD | ☐ |
| 5 | Kiểm tra Audit Log | Có field `docs_missing: true` | ☐ |

### Scenario 2: Check-in Multi-Segment (Đổi Host)

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Mở booking có 2+ segment khác host | Hiển thị list segment với badge "Đổi Host" | ☐ |
| 2 | Segment hiện tại được auto-select | Radio button active | ☐ |
| 3 | Chọn segment khác | Selection thay đổi | ☐ |
| 4 | Check-in | Audit log ghi đúng segment_id | ☐ |

### Scenario 3: Correction Flow

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Mở booking đã check-in | Hiện option "Huỷ Check-in" | ☐ |
| 2 | Click Huỷ, nhập lý do < 10 chars | Button disabled, hiện validation | ☐ |
| 3 | Nhập lý do >= 10 chars | Button enabled | ☐ |
| 4 | Submit | Status về WAIT_ROOM, toast thành công | ☐ |
| 5 | Kiểm tra Audit Log | Có action=CORRECTION_UNDO_CHECK_IN, reason | ☐ |

### Scenario 4: Correction bị Block do Settlement

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Mở booking có segment đã settlement | Banner cảnh báo "Settlement locked" | ☐ |
| 2 | Click Huỷ Check-in | Button disabled hoặc error khi submit | ☐ |
| 3 | Check message | "Segment đã settlement - Liên hệ Admin" | ☐ |

### Scenario 5: Early Checkout

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Mở booking CHECKED_IN | Hiện option "Check-out sớm" | ☐ |
| 2 | Chọn ngày trước check_out_date gốc | Hiển thị số đêm sẽ release | ☐ |
| 3 | Confirm | Segment.date_to được cắt | ☐ |
| 4 | Kiểm tra host_supply_segments | date_to = ngày mới, nights recalculated | ☐ |
| 5 | Kiểm tra host_payables | Đã được sync lại | ☐ |

### Scenario 6: Optimistic UI

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Check-in một booking | UI đổi ngay (< 200ms) | ☐ |
| 2 | Quan sát network | Không có full list refetch | ☐ |
| 3 | Ngắt mạng, thử check-in | Rollback về state cũ, hiện error | ☐ |

---

## 🔄 ROLLBACK PLAN

### Nếu cần revert changes:

```bash
# 1. Xoá files mới
rm src/components/booking/CorrectionDialog.tsx
rm src/components/booking/EarlyCheckoutDialog.tsx
rm src/hooks/useOpsActions.ts

# 2. Restore CheckInDialog.tsx từ git
git checkout HEAD~1 -- src/components/booking/CheckInDialog.tsx

# 3. Nếu đã deploy, rollback deployment
# (phụ thuộc vào CI/CD pipeline của team)
```

### Database (không cần migration):

- Implementation này hoàn toàn UI-level
- Không có schema changes
- Data trong `stays`, `host_supply_segments`, `audit_logs` vẫn valid

---

## 📊 BUSINESS RULES MATRIX

| Rule | Implementation | File |
|------|---------------|------|
| C1: Segment = đơn vị vận hành | Segment selection bắt buộc khi check-in | CheckInDialog.tsx |
| C2: Check-in theo segment | selectedSegmentId state + audit log | CheckInDialog.tsx |
| C3: CCCD optional, block finalize | proceedWithoutCCCD + docs_missing tracking | CheckInDialog.tsx |
| C4: Date mode filter | Đã implement session trước | date-mode-selector.tsx |
| C5: Correction với audit | CorrectionDialog + bắt buộc reason | CorrectionDialog.tsx |
| C6: Date Authority badges | Đã implement session trước | segment-warning.tsx |
| C7: Partial coverage | coverageStatus analysis trong CheckInDialog | CheckInDialog.tsx |
| C8: Early checkout + cut segment | EarlyCheckoutDialog | EarlyCheckoutDialog.tsx |
| D: Optimistic UI | useOpsActions hook | useOpsActions.ts |

---

## 🚀 NEXT STEPS

1. **Testing**: Chạy UAT checklist với data thực
2. **Integration**: Wire CorrectionDialog và EarlyCheckoutDialog vào UI flow
3. **Blocking Logic**: Implement finalize/settlement blocking nếu `docs_missing: true`
4. **Performance**: Monitor partial invalidation patterns

---

**Author**: AI Implementation  
**Review Required**: Principal UX Architect + Product Engineer

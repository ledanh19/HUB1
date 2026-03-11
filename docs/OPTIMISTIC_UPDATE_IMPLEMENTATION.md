# OPTIMISTIC UPDATE IMPLEMENTATION

## Vấn đề đã xác định

**Triệu chứng**: Sau khi Confirm action (check-in/check-out/approve/...), UI phải đợi 3-5 giây mới thấy trạng thái mới.

**Nguyên nhân gốc**: Tất cả dialogs sử dụng `invalidateQueries` → trigger full refetch → chờ network + DB round-trip → UI chậm.

```typescript
// TRƯỚC: Chậm 3-5s
queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
queryClient.invalidateQueries({ queryKey: ["stays"] });
// ... 8-15 invalidateQueries calls
```

## Giải pháp: Optimistic Update Pattern

```typescript
// SAU: <100ms perceived response
// 1. Update UI immediately
queryClient.setQueryData(["stays_with_bookings"], (old) => {
  return old.map((item) =>
    item.unified_booking_id === id
      ? { ...item, stay_status: "CHECKED_IN", _isOptimistic: true }
      : item
  );
});

// 2. Close dialog immediately
onOpenChange(false);

// 3. Show loading toast
toast.loading("Đang ghi nhận...", { id: "action-toast" });

// 4. Perform actual mutation
await supabase.from("stays").update(...);

// 5. Replace loading toast with success
toast.success("Thành công!", { id: "action-toast" });

// 6. Background sync for dashboard/totals
setTimeout(() => {
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}, 1500);
```

## Components đã cập nhật

| Component | File | Optimistic Fields |
|-----------|------|-------------------|
| CheckInDialog | `src/components/booking/CheckInDialog.tsx` | `stay_status`, `actual_check_in_at` |
| CheckOutDialog | `src/components/booking/CheckOutDialog.tsx` | `stay_status`, `actual_check_out_at` |
| CorrectionDialog | `src/components/booking/CorrectionDialog.tsx` | `stay_status`, dates |
| EarlyCheckoutDialog | `src/components/booking/EarlyCheckoutDialog.tsx` | `stay_status`, `actual_check_out_at` |
| CollectPaymentStayDialog | `src/components/booking/CollectPaymentStayDialog.tsx` | `amount_collected` |
| AssignHostRoomDialog | `src/components/booking/AssignHostRoomDialog.tsx` | `host_property_name`, `host_room_type` |

## Hooks đã có optimistic (useOpsActions.ts)

- `useOptimisticCheckIn` ✅
- `useOptimisticCheckOut` ✅

**Lưu ý**: Hooks này đã có nhưng CHƯA ĐƯỢC SỬ DỤNG trong dialogs. Dialogs sử dụng inline mutation.

## Pattern chuẩn

```typescript
// Helper function trong mỗi component
const applyOptimisticUpdate = useCallback((updates: Record<string, unknown>) => {
  const updateInList = (oldData: unknown) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    return oldData.map((item: Record<string, unknown>) =>
      item.unified_booking_id === stay.unified_booking_id
        ? { ...item, ...updates, _isOptimistic: true }
        : item
    );
  };

  // Update all list queries
  queryClient.setQueryData(["stays_with_bookings"], updateInList);
  queryClient.setQueryData(["stays_operations"], updateInList);
  queryClient.setQueryData(["stays"], updateInList);
  queryClient.setQueryData(["unified_bookings"], updateInList);
}, [queryClient, stay.unified_booking_id]);
```

## Flow mới

```
User Click Action
       │
       ▼
┌─────────────────────────────┐
│  1. Apply optimistic update │  <── UI cập nhật NGAY (<100ms)
│     setQueryData(...)       │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  2. Close dialog            │  <── UX mượt, không block
│     onOpenChange(false)     │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  3. Show loading toast      │  <── "Đang ghi nhận..."
│     toast.loading(...)      │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  4. Actual DB mutation      │  <── Backend authoritative
│     supabase.update(...)    │
└─────────────────────────────┘
       │
   ┌───┴───┐
   │       │
  ✅       ❌
Success   Error
   │       │
   ▼       ▼
┌──────┐  ┌──────────────────────┐
│Toast │  │ Rollback optimistic  │
│✓     │  │ invalidateQueries    │
└──────┘  │ Toast error          │
          └──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  5. Background sync         │  <── Dashboard/totals update sau
│     setTimeout(1500ms)      │
│     invalidateQueries(...)  │
└─────────────────────────────┘
```

## Checklist Test

### 1. Check-in
- [ ] Click Check-in → Dialog đóng ngay
- [ ] Trạng thái row đổi thành "CHECKED_IN" ngay (<500ms)
- [ ] Toast hiện "Đang ghi nhận..." → "Thành công!"
- [ ] Refresh page → Trạng thái vẫn đúng

### 2. Check-out
- [ ] Click Check-out → Dialog đóng ngay
- [ ] Trạng thái row đổi thành "CHECKED_OUT" ngay
- [ ] Nếu backend fail → Row revert về trạng thái cũ

### 3. Correction
- [ ] Click Huỷ Check-in → Dialog đóng ngay
- [ ] Trạng thái đổi ngay
- [ ] Audit log được ghi (kiểm tra sau)

### 4. Thu tiền
- [ ] Nhập số tiền + Submit
- [ ] Dialog đóng ngay
- [ ] Số tiền "Đã thu" tăng ngay trong row

### 5. Gán phòng Host
- [ ] Chọn phòng + Submit
- [ ] Dialog đóng ngay
- [ ] Thông tin host hiển thị ngay trong row

### 6. Error Handling
- [ ] Tắt mạng
- [ ] Thực hiện action
- [ ] UI rollback về trạng thái cũ
- [ ] Toast báo lỗi

## Rollback Plan

Nếu optimistic update gây inconsistency:

1. Revert các file về commit trước
2. Hoặc thêm `await` trước mỗi mutation và di chuyển `onOpenChange(false)` xuống sau mutation
3. Hoặc tăng staleTime của queries để giảm refetch

## Performance Metrics (Mục tiêu)

| Metric | Trước | Sau |
|--------|-------|-----|
| Perceived Response Time | 3-5s | <200ms |
| Dialog Close | Sau DB response | Ngay lập tức |
| Network Requests | 8-15 parallel | 1 main + 3-5 background |
| User Feedback | Chờ im lặng | Loading → Success |

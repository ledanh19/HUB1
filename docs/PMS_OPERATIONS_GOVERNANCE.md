# ROOMRISE CONTROL HUB - PMS OPERATIONS GOVERNANCE

> **Version**: 1.0  
> **Created**: 2024-12-31  
> **Author**: Principal PMS / Hospitality Operations Architect  
> **Scope**: Date Authority, Multi-Segment Check-in, Responsibility Model, Ops Module Sync

---

## NGUYÊN TẮC KHÓA CỨNG

| # | Nguyên tắc | Mô tả |
|---|-----------|-------|
| 1 | **KHÔNG thay đổi DB schema** | Chỉ thay đổi logic phân loại, UI, popup rules |
| 2 | **KHÔNG phá logic OTA/Finance/Reconciliation/Audit** | Các flow tài chính giữ nguyên |
| 3 | **KHÔNG tạo dữ liệu dư thừa** | Không duplicate data |
| 4 | **Segment là đơn vị vận hành + pháp lý** | Source of truth cho ops |

---

## PHASE 1: DATE AUTHORITY & OPS MODEL

### 1.1 Định nghĩa nguồn ngày

| Loại ngày | Bảng nguồn | Field | Mục đích sử dụng |
|-----------|-----------|-------|------------------|
| **OTA Booking Date** | `unified_bookings` | `check_in_date`, `check_out_date` | Thương mại, hiển thị cho khách, tham chiếu |
| **Segment Supply Date** | `host_supply_segments` | `date_from`, `date_to` | **VẬN HÀNH + PHÁP LÝ** - Single Source of Truth |
| **Actual Operation Date** | `stays` | `actual_check_in_at`, `actual_check_out_at` | Ghi nhận thực tế đã xảy ra |
| **Derived Date** | Computed | `selectedDate` trong StaysPage | UI filter only |

### 1.2 Mapping Module → Date Authority

| Module | KPI/List dùng | Detail dùng | Ghi chú |
|--------|--------------|-------------|---------|
| **Dashboard** | `unified_bookings.check_in_date` | - | Overview, không cần chi tiết segment |
| **Booking Center** | `unified_bookings.check_in_date` | `host_supply_segments.date_from/to` | List = booking date, Detail = segment date |
| **Bảng Điều Khiển (Stays)** | **`host_supply_segments.date_from`** | **`host_supply_segments.*`** | **100% segment-based** |
| **Khai báo lưu trú** | `stays.actual_check_in_at` | `host_supply_segments.*` | Pháp lý = segment |
| **Host Payables** | `host_supply_segments.date_from/to` | `host_supply_segments.*` | Settlement = segment |
| **Finance Reports** | `host_supply_segments.date_from/to` | - | Cashflow gắn segment |

### 1.3 Công thức lọc chuẩn

```typescript
// ❌ SAI - Dùng booking date cho vận hành
.eq("check_in_date", selectedDate)

// ✅ ĐÚNG - Dùng segment date cho vận hành
.lte("date_from", selectedDate)
.gt("date_to", selectedDate)
// hoặc
.eq("date_from", selectedDate) // cho check-in today
```

### 1.4 UI hiển thị nhãn nguồn ngày

```tsx
// Badge nhỏ cho từng ngày hiển thị
<span className="text-xs text-muted-foreground">
  {dateSource === 'SEGMENT' ? '📍 Ops' : '📅 OTA'}
</span>

// Hoặc tooltip
<Tooltip>
  <TooltipTrigger>{formatDate(date)}</TooltipTrigger>
  <TooltipContent>
    {dateSource === 'SEGMENT' 
      ? 'Ngày từ Host Supply Segment (vận hành)' 
      : 'Ngày từ OTA Booking (thương mại)'}
  </TooltipContent>
</Tooltip>
```

---

## PHASE 2: MULTI-SEGMENT CHECK-IN GOVERNANCE

### 2.1 Entity Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         BOOKING                                 │
│  (unified_booking_id) = Đơn vị THƯƠNG MẠI                       │
│  - guest_name, total_amount, source, payment_type              │
│  - 1 booking có thể có NHIỀU segments                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:1
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                           STAY                                  │
│  (unified_booking_id) = Đơn vị LƯU TRÚ LOGICAL                 │
│  - stay_status, actual_check_in_at, actual_check_out_at        │
│  - Chứa trạng thái tổng của chuyến lưu trú                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SEGMENT                                  │
│  (host_supply_segments) = Đơn vị VẬN HÀNH + PHÁP LÝ            │
│  - partner_id, host_property_name, room_code                   │
│  - date_from, date_to, nightly_rate                            │
│  - settlement_id (lock khi quyết toán)                         │
│  ⚠️ MỖI SEGMENT = 1 ĐỊA ĐIỂM PHÁP LÝ                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Quy tắc Check-in theo Segment

| Tình huống | Cần Check-in lại? | Lý do |
|-----------|-------------------|-------|
| 1 booking, 1 segment, 1 host | ❌ Không | Đơn giản nhất |
| 1 booking, 2 segment liên tục, **CÙNG host** | ❌ Không | Kế thừa được |
| 1 booking, 2 segment liên tục, **KHÁC host** | ✅ **BẮT BUỘC** | Đổi địa điểm pháp lý |
| 1 booking, 2 segment **đứt đoạn** (có gap) | ✅ **BẮT BUỘC** | Gián đoạn lưu trú |
| Multi-room cùng booking, cùng host | ❌ Không | 1 khai báo cho tất cả phòng |
| Multi-room cùng booking, khác host | ✅ **BẮT BUỘC** mỗi host | Mỗi host = 1 khai báo |

### 2.3 State Machine cho Segment

```
                    ┌──────────────────┐
                    │     CREATED      │
                    │  (Segment mới)   │
                    └────────┬─────────┘
                             │
                             │ Gán phòng
                             ▼
                    ┌──────────────────┐
                    │   WAIT_CHECKIN   │
                    │ (Chờ check-in)   │
                    └────────┬─────────┘
                             │
                             │ Check-in (nếu cần)
                             ▼
                    ┌──────────────────┐
                    │    CHECKED_IN    │
                    │  (Đang lưu trú)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ CHECKED_OUT  │ │   NO_SHOW    │ │  CANCELLED   │
    │ (Trả phòng)  │ │ (Không đến)  │ │   (Huỷ)      │
    └──────────────┘ └──────────────┘ └──────────────┘
```

### 2.4 Logic xác định cần Check-in lại

```typescript
interface SegmentCheckInResult {
  needsCheckIn: boolean;
  reason?: string;
  warningLevel: 'none' | 'info' | 'warning' | 'critical';
}

function determineCheckInRequirement(
  currentSegment: Segment,
  previousSegment: Segment | null,
  stay: Stay
): SegmentCheckInResult {
  // Segment đầu tiên - luôn cần check-in
  if (!previousSegment) {
    return { needsCheckIn: true, reason: 'Segment đầu tiên', warningLevel: 'none' };
  }
  
  // Khác host = bắt buộc check-in lại
  if (currentSegment.partner_id !== previousSegment.partner_id) {
    return { 
      needsCheckIn: true, 
      reason: `Đổi Host: ${previousSegment.host_property_name} → ${currentSegment.host_property_name}`,
      warningLevel: 'critical'
    };
  }
  
  // Không liên tục (có gap) = bắt buộc check-in lại
  const prevEnd = new Date(previousSegment.date_to);
  const currStart = new Date(currentSegment.date_from);
  if (currStart > prevEnd) {
    return {
      needsCheckIn: true,
      reason: `Gián đoạn: ${previousSegment.date_to} → ${currentSegment.date_from}`,
      warningLevel: 'warning'
    };
  }
  
  // Cùng host, liên tục = kế thừa
  return { needsCheckIn: false, warningLevel: 'none' };
}
```

### 2.5 UI cảnh báo Multi-Segment

```tsx
// Badge trên row trong Stays list
function SegmentWarningBadge({ segments }: { segments: Segment[] }) {
  const hasMultiHost = new Set(segments.map(s => s.partner_id)).size > 1;
  const hasGap = checkForGaps(segments);
  
  if (hasMultiHost) {
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Đổi Host - Cần check-in lại
      </Badge>
    );
  }
  
  if (hasGap) {
    return (
      <Badge variant="warning" className="text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Gián đoạn - Cần check-in lại
      </Badge>
    );
  }
  
  if (segments.length > 1) {
    return (
      <Badge variant="outline" className="text-xs">
        {segments.length} segments
      </Badge>
    );
  }
  
  return null;
}
```

---

## PHASE 3: RESPONSIBILITY MODEL (NO SHIFT)

### 3.1 Phân loại vai trò

| Vai trò | Scope | Thay đổi khi | Stored in |
|---------|-------|-------------|-----------|
| **RESPONSIBLE OWNER** | Booking-level | Action explicit (assign/transfer) | `bookings.assigned_to` hoặc `stays.responsible_user_id` |
| **ACTIVE HANDLER** | Session-level | Tự động khi thao tác | Memory only (không persist) |
| **AUDIT ACTOR** | Action-level | Mỗi action | `audit_logs.user_id` |

### 3.2 Quy tắc Owner

```typescript
// Quy tắc gán owner
const OWNER_ASSIGNMENT_RULES = {
  // Gán owner khi:
  ASSIGN_ON: [
    'FIRST_STATUS_CHANGE',     // Thay đổi trạng thái đầu tiên
    'EXPLICIT_ASSIGN',          // Gán explicit qua UI
    'CHECK_IN',                 // Check-in (nếu chưa có owner)
    'CREATE_SEGMENT',           // Tạo segment (nếu chưa có owner)
  ],
  
  // KHÔNG đổi owner khi:
  KEEP_OWNER_ON: [
    'VIEW_ONLY',               // Chỉ xem
    'ADD_NOTE',                // Thêm ghi chú
    'COLLECT_PAYMENT',         // Thu tiền (audit ghi người thu)
    'UPLOAD_DOCUMENT',         // Upload CCCD
  ],
  
  // Đổi owner khi:
  CHANGE_OWNER_ON: [
    'EXPLICIT_TRANSFER',       // Chuyển explicit qua UI
    'ESCALATE',                // Escalate lên cấp cao hơn
  ],
};
```

### 3.3 Freshness tracking (thay cho shift)

```typescript
interface ActivityFreshness {
  booking_id: string;
  last_activity_at: string;       // Timestamp hoạt động gần nhất
  last_activity_type: string;     // Loại action
  last_activity_by: string;       // User thực hiện
  is_stale: boolean;              // > 24h không hoạt động
}

// Tính toán freshness
function getActivityFreshness(booking: Booking): ActivityFreshness {
  const lastActivity = booking.updated_at;
  const hoursSinceActivity = differenceInHours(new Date(), new Date(lastActivity));
  
  return {
    booking_id: booking.unified_booking_id,
    last_activity_at: lastActivity,
    last_activity_type: booking.last_action_type || 'CREATED',
    last_activity_by: booking.updated_by || booking.created_by,
    is_stale: hoursSinceActivity > 24,
  };
}
```

### 3.4 UI hiển thị Owner + Freshness

```tsx
// Component hiển thị trong Booking Detail / Stays list
function OwnershipBadge({ booking }: { booking: Booking }) {
  const freshness = getActivityFreshness(booking);
  
  return (
    <div className="flex items-center gap-2">
      {/* Owner */}
      <div className="flex items-center gap-1">
        <User className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {booking.owner?.full_name || 'Chưa gán'}
        </span>
        {booking.owner?.department && (
          <Badge variant="outline" className="text-xs">
            {booking.owner.department}
          </Badge>
        )}
      </div>
      
      {/* Freshness indicator */}
      <Tooltip>
        <TooltipTrigger>
          <div className={cn(
            "w-2 h-2 rounded-full",
            freshness.is_stale ? "bg-yellow-500" : "bg-green-500"
          )} />
        </TooltipTrigger>
        <TooltipContent>
          <p>Hoạt động gần nhất: {formatDistanceToNow(new Date(freshness.last_activity_at))}</p>
          <p>Bởi: {freshness.last_activity_by}</p>
          <p>Action: {freshness.last_activity_type}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
```

---

## PHASE 4: ĐỒNG BỘ MODULE VẬN HÀNH LƯU TRÚ

### 4.1 Popup & Action Mapping

| Popup/Action | Entity Authority | Ảnh hưởng Owner? | Cần hiển thị Segment? |
|--------------|------------------|------------------|----------------------|
| **Check-in Dialog** | Stay + Segment | ✅ Gán owner nếu chưa có | ✅ Phải hiển thị segment đang check-in |
| **Check-out Dialog** | Stay + Segment | ❌ Giữ owner | ✅ Hiển thị segment đang check-out |
| **Assign Host Room** | Segment | ✅ Gán owner nếu chưa có | ✅ Core function |
| **Upload CCCD** | Booking | ❌ Giữ owner | ❌ Không cần |
| **Collect Payment** | Booking | ❌ Giữ owner | ❌ Không cần |
| **Add Surcharge** | Segment | ❌ Giữ owner | ✅ Gắn với segment nào |
| **No-Show** | Stay | ✅ Gán owner | ✅ Hiển thị tất cả segments |

### 4.2 UI Spec cho Check-in Dialog

```tsx
// Cấu trúc chuẩn CheckInDialog
interface CheckInDialogProps {
  // ... existing props
  segments: Segment[];              // Tất cả segments của booking
  currentSegmentIndex: number;      // Segment đang xử lý
}

// UI phải hiển thị:
// 1. Thông tin Segment đang check-in (host, room, dates)
// 2. Cảnh báo nếu đổi host so với segment trước
// 3. Timeline các segment (past/current/future)
// 4. Xác nhận segment coverage đủ chưa

function CheckInDialogContent({ segments, currentSegmentIndex }: CheckInDialogProps) {
  const currentSegment = segments[currentSegmentIndex];
  const previousSegment = segments[currentSegmentIndex - 1];
  const checkInRequirement = determineCheckInRequirement(currentSegment, previousSegment);
  
  return (
    <>
      {/* Segment Info Card */}
      <Card className="border-primary">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Đang Check-in: Segment {currentSegmentIndex + 1}/{segments.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Host: <strong>{currentSegment.host_property_name}</strong></div>
            <div>Phòng: <strong>{currentSegment.room_code}</strong></div>
            <div>Từ: <strong>{formatDate(currentSegment.date_from)}</strong></div>
            <div>Đến: <strong>{formatDate(currentSegment.date_to)}</strong></div>
          </div>
        </CardContent>
      </Card>
      
      {/* Warning nếu đổi host */}
      {checkInRequirement.needsCheckIn && checkInRequirement.warningLevel === 'critical' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bắt buộc Check-in mới</AlertTitle>
          <AlertDescription>
            {checkInRequirement.reason}
            <br />
            <strong>Cần tải lại CCCD/Passport cho địa điểm mới.</strong>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Segment timeline */}
      <SegmentTimeline 
        segments={segments} 
        currentIndex={currentSegmentIndex}
      />
    </>
  );
}
```

### 4.3 UI Spec cho Stays Page (Bảng Điều Khiển)

```tsx
// List item phải hiển thị:
// 1. Timeline status (Upcoming/Check-in Today/In-house/Check-out Today/Completed)
// 2. Segment info (host, room) - không phải OTA info
// 3. Warning badges (multi-host, gap, no-room, no-document)
// 4. Quick actions phù hợp với timeline

function StayListItem({ stay }: { stay: StayWithBooking }) {
  const timelineStatus = getTimelineStatus(...);
  const operationalStatus = getOperationalStatus(...);
  
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      {/* Left: Guest + Timeline */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{stay.booking?.guest_name}</span>
          <StatusBadge variant={getTimelineVariant(timelineStatus)}>
            {getTimelineLabel(timelineStatus)}
          </StatusBadge>
        </div>
        
        {/* Segment info - PRIMARY */}
        <div className="text-sm text-muted-foreground mt-1">
          <Building2 className="w-3 h-3 inline mr-1" />
          {stay.segment?.host_property_name || 'Chưa gán'} 
          {stay.segment?.room_code && ` • ${stay.segment.room_code}`}
        </div>
        
        {/* OTA info - SECONDARY */}
        <div className="text-xs text-muted-foreground mt-1">
          OTA: {stay.booking?.source} • {formatDate(stay.booking?.check_in_date)} → {formatDate(stay.booking?.check_out_date)}
        </div>
      </div>
      
      {/* Right: Warnings + Actions */}
      <div className="flex items-center gap-2">
        {/* Warnings */}
        {operationalStatus === 'ROOM_UNASSIGNED' && (
          <Badge variant="destructive">Chưa gán phòng</Badge>
        )}
        {operationalStatus === 'DOCUMENT_MISSING' && (
          <Badge variant="warning">Thiếu CCCD</Badge>
        )}
        {stay.hasRoomChange && (
          <Badge variant="warning">Đổi Host</Badge>
        )}
        
        {/* Context-aware actions */}
        <StayQuickActions stay={stay} timelineStatus={timelineStatus} />
      </div>
    </div>
  );
}
```

### 4.4 Post-Action Behavior

```typescript
// Standard pattern cho tất cả mutations trong module vận hành
const useStayAction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params) => {
      // ... API call
    },
    
    // OPTIMISTIC UPDATE - UI đổi ngay
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["stays_operations"] });
      
      const previousData = queryClient.getQueryData(["stays_operations"]);
      
      queryClient.setQueryData(["stays_operations"], (old) => {
        // Update optimistically
        return old?.map(stay => 
          stay.unified_booking_id === params.bookingId
            ? { ...stay, ...params.updates, _isOptimistic: true }
            : stay
        );
      });
      
      return { previousData };
    },
    
    // ROLLBACK nếu lỗi
    onError: (error, params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["stays_operations"], context.previousData);
      }
      toast.error("Lỗi: " + error.message);
    },
    
    // PARTIAL INVALIDATION - không refetch toàn bộ
    onSuccess: (data, params) => {
      toast.success("Thành công");
      
      // Immediate: chỉ row liên quan
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ["stay_record", params.bookingId] 
        });
        queryClient.invalidateQueries({ 
          queryKey: ["host-supply-segments", params.bookingId] 
        });
      }, 100);
      
      // Delayed: KPIs
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
  });
};
```

---

## CHECKLIST TEST

### Test 1: Booking nhiều segment

```
□ Tạo booking 5 đêm
□ Gán 2 segment: 3 đêm Host A, 2 đêm Host B
□ Check-in segment 1 (Host A) → thành công
□ Verify: cần check-in lại khi chuyển Host B
□ Check-out Host A → verify warning
□ Check-in Host B → yêu cầu CCCD mới
□ Check-out Host B → booking hoàn tất
```

### Test 2: Đổi host giữa chừng

```
□ Booking đang in-house tại Host A
□ Thêm segment mới chuyển sang Host B
□ Verify: UI hiện cảnh báo "Đổi Host - Cần check-in lại"
□ Check-out Host A
□ Check-in Host B → yêu cầu documents
```

### Test 3: Nhiều nhân viên thao tác

```
□ User A tạo booking → trở thành owner
□ User B xem booking → owner KHÔNG đổi
□ User B check-in → audit ghi User B, owner giữ User A
□ User C transfer owner → owner = User C
□ Verify audit log đầy đủ
```

### Test 4: Không ảnh hưởng module khác

```
□ Sau check-in → Host Payables vẫn đúng
□ Sau thêm segment → Settlement calculation đúng
□ Sau check-out → Finance reports đúng
□ Audit logs không bị duplicate
```

---

## TÓM TẮT QUYẾT ĐỊNH KIẾN TRÚC

| Quyết định | Giá trị | Lý do |
|-----------|---------|-------|
| Date Authority cho Ops | `host_supply_segments.date_from/to` | Segment = đơn vị pháp lý |
| Check-in scope | Per-Segment (khi đổi host) | Tuân thủ quy định lưu trú |
| Owner persistence | Booking-level | Đơn giản, không cần shift |
| Shift replacement | `last_activity_at` freshness | Lightweight, đủ dùng |
| Post-action behavior | Optimistic + Partial invalidation | UX responsive |

---

**END OF DOCUMENT**

> Tài liệu này là source of truth cho vận hành lưu trú trong Roomrise Control Hub.
> Mọi thay đổi ops logic phải được review và cập nhật vào đây.

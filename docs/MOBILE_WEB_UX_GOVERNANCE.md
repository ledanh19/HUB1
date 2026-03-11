# ROOMRISE CONTROL HUB - MOBILE WEB UX GOVERNANCE

> **Version**: 1.0  
> **Created**: 2024-12-31  
> **Author**: Principal UX Architect  
> **Scope**: Mobile Browser Interface cho hệ thống vận hành nội bộ

---

## 1. TRIẾT LÝ MOBILE WEB UX CHO CONTROL HUB

### 1.1 Định nghĩa vai trò Mobile Web

| Mobile Web dùng để | Mobile Web KHÔNG dùng để |
|-------------------|-------------------------|
| ✅ Kiểm tra nhanh trạng thái | ❌ Làm việc chính (nhập liệu nhiều) |
| ✅ Duyệt/Approve yêu cầu gấp | ❌ Tạo booking mới phức tạp |
| ✅ Xem dashboard overview | ❌ Chỉnh sửa settings hệ thống |
| ✅ Check-in đơn giản (1-tap) | ❌ Quyết toán tài chính phức tạp |
| ✅ Xác nhận thao tác đã chuẩn bị sẵn | ❌ Tạo báo cáo chi tiết |
| ✅ Nhận notification → action ngay | ❌ Mapping OTA / Channel Manager |

### 1.2 Nguyên tắc thiết kế

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOBILE WEB = COMPANION                       │
│                                                                 │
│   Desktop: Làm việc chính, nhập liệu, phân tích, báo cáo       │
│   Mobile:  Kiểm tra nhanh, duyệt gấp, xác nhận, giám sát       │
│                                                                 │
│   ⚠️ KHÔNG nhét toàn bộ desktop xuống mobile                   │
│   ⚠️ KHÔNG mở tab mới trên mobile browser                      │
│   ⚠️ KHÔNG dùng UX kiểu native app (swipe gestures, etc.)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. PHÂN LOẠI MODULE THEO MỨC ĐỘ HỖ TRỢ MOBILE

### 2.1 Bảng phân loại

| Module | Mức độ | Lý do | Actions cho phép trên Mobile |
|--------|--------|-------|------------------------------|
| **Dashboard** | 🟢 FULL | Overview, số liệu KPI | View all |
| **Bảng Điều Khiển (Stays)** | 🟢 FULL | Core ops, cần mobile | Check-in, Check-out, View |
| **Booking Center** | 🟡 VIEW+APPROVE | Xem list, approve từ detail | View, Simple status change |
| **Đề xuất Thanh toán** | 🟡 VIEW+APPROVE | Approve/Reject nhanh | Approve, Reject |
| **Thu tiền (Collections)** | 🟡 VIEW+APPROVE | Xác nhận đã thu | View, Confirm receipt |
| **Tranh chấp OTA** | 🟡 VIEW+APPROVE | Xem + escalate | View, Escalate |
| **OTA Payout** | 🟡 VIEW ONLY | Chỉ xem, không thao tác | View only |
| **Host Payables** | 🟡 VIEW ONLY | Xem công nợ | View only |
| **Host Settlement** | 🔴 DESKTOP ONLY | Phức tạp, cần màn hình lớn | ❌ Chặn |
| **Inventory Management** | 🔴 DESKTOP ONLY | Grid phức tạp | ❌ Chặn |
| **Channel Manager** | 🔴 DESKTOP ONLY | Mapping phức tạp | ❌ Chặn |
| **Settings** | 🔴 DESKTOP ONLY | Cấu hình quan trọng | ❌ Chặn |
| **Audit Logs** | 🟡 VIEW ONLY | Tra cứu | View, Search |
| **Reports** | 🟡 VIEW ONLY | Xem số liệu | View only |

### 2.2 Chi tiết từng nhóm

#### 🟢 FULLY ALLOWED (View + All Actions)

**Dashboard**
- Mục tiêu: Nắm tình hình nhanh
- Hiển thị: KPI cards, recent activities
- Actions: Navigate to details

**Bảng Điều Khiển (Stays)**
- Mục tiêu: Vận hành hàng ngày
- Hiển thị: Card list (không table)
- Actions: Check-in, Check-out, View detail
- Giới hạn: Không cho gán phòng phức tạp

#### 🟡 VIEW + APPROVE (Read + Confirm only)

**Booking Center**
- Mục tiêu: Xem booking, approve từ detail
- Hiển thị: Card list với status badge
- Actions: View detail, Simple status change
- Chặn: Tạo booking mới, Edit phức tạp

**Đề xuất Thanh toán**
- Mục tiêu: Duyệt đề xuất gấp
- Hiển thị: Card list với amount + requester
- Actions: Approve, Reject (với confirm)
- Chặn: Tạo đề xuất mới

**Thu tiền**
- Mục tiêu: Xác nhận đã thu
- Hiển thị: Card list với booking + amount
- Actions: View, Confirm receipt
- Chặn: Tạo collection mới (cần nhập liệu)

#### 🔴 DESKTOP ONLY (Chặn hoàn toàn)

**Lý do chặn:**
- Host Settlement: Multi-step workflow, cần review chi tiết
- Inventory: Grid UI không thể responsive tốt
- Channel Manager: Mapping phức tạp, dễ sai
- Settings: Thay đổi ảnh hưởng toàn hệ thống

---

## 3. QUY CHUẨN GIAO DIỆN MOBILE WEB THEO MODULE

### 3.1 Standard Card Layout

```tsx
// Mobile-optimized card for list views
function MobileBookingCard({ booking }: { booking: Booking }) {
  return (
    <div className="p-4 border-b">
      {/* Row 1: Primary info */}
      <div className="flex justify-between items-start">
        <div>
          <span className="font-medium">{booking.guest_name}</span>
          <StatusBadge variant={...} className="ml-2">
            {booking.status}
          </StatusBadge>
        </div>
        <span className="text-sm text-muted-foreground">
          {formatCurrency(booking.total_amount)}
        </span>
      </div>
      
      {/* Row 2: Secondary info */}
      <div className="text-sm text-muted-foreground mt-1">
        {formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}
        <span className="ml-2">{booking.source}</span>
      </div>
      
      {/* Row 3: Action (single, prominent) */}
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline">
          Xem chi tiết →
        </Button>
      </div>
    </div>
  );
}
```

### 3.2 Module-specific UI Rules

| Module | List Format | Info hiển thị | Max Actions | Page vs Modal |
|--------|-------------|---------------|-------------|---------------|
| Dashboard | KPI cards | 4 KPIs max | 0 (navigate only) | Page |
| Stays | Card list | Guest, Status, Host, Dates | 2 (Check-in/out, View) | Page + Bottom Sheet |
| Bookings | Card list | Guest, Status, Amount, Dates | 1 (View) | Page |
| Payment Requests | Card list | Amount, Requester, Status | 2 (Approve, Reject) | Page + Bottom Sheet |
| Collections | Card list | Booking, Amount, Status | 1 (Confirm) | Page |

### 3.3 Responsive Breakpoints

```scss
// Mobile Web breakpoints (trình duyệt, không phải app)
$mobile-sm: 320px;   // iPhone SE
$mobile-md: 375px;   // iPhone standard
$mobile-lg: 428px;   // iPhone Pro Max
$tablet: 768px;      // iPad portrait → redirect to desktop

// Rule: >= 768px → Show desktop UI, không cần mobile optimization
@media (min-width: 768px) {
  .mobile-only { display: none; }
  .desktop-only { display: block; }
}

@media (max-width: 767px) {
  .mobile-only { display: block; }
  .desktop-only { display: none; }
}
```

### 3.4 Bottom Sheet Pattern (cho actions)

```tsx
// Thay Modal bằng Bottom Sheet trên mobile
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function MobileActionSheet({ 
  open, 
  onOpenChange, 
  title, 
  children 
}: MobileActionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="py-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

## 4. QUY CHUẨN ĐIỀU HƯỚNG & QUAY LẠI (MOBILE)

### 4.1 Navigation Rules

```
┌─────────────────────────────────────────────────────────────────┐
│                     MOBILE NAVIGATION                           │
│                                                                 │
│   1. Chỉ dùng 1 tab (KHÔNG mở tab mới)                         │
│   2. Back button PHẢI có trong UI (không rely browser back)    │
│   3. List → Detail → Back giữ filter                           │
│   4. Deep link phải hoạt động                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Back Behavior Matrix

| Từ | Về | Giữ state? | Cách implement |
|----|-----|-----------|----------------|
| Detail → List | ✅ Giữ filter, sort, scroll | `sessionStorage` + `navigate(-1)` |
| Action Sheet → Page | ✅ Giữ page state | Sheet tự close |
| Search → List | ✅ Giữ search term | URL params |
| Dashboard → Module | ❌ Fresh load | Direct navigate |

### 4.3 Back Button Component (Mobile)

```tsx
// Bắt buộc có trên MỌI detail page / sub-page
function MobileBackButton({ fallbackPath = "/" }: { fallbackPath?: string }) {
  const navigate = useNavigate();
  
  const handleBack = () => {
    // Kiểm tra có history không
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };
  
  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={handleBack}
      className="pl-0"
    >
      <ArrowLeft className="w-4 h-4 mr-1" />
      Quay lại
    </Button>
  );
}
```

### 4.4 State Persistence

```tsx
// Hook cho mobile navigation với state preservation
function useMobileNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Lưu scroll position trước khi navigate
  useEffect(() => {
    const handleBeforeNavigate = () => {
      sessionStorage.setItem(
        `scroll_${location.pathname}`,
        String(window.scrollY)
      );
    };
    
    window.addEventListener('beforeunload', handleBeforeNavigate);
    return () => window.removeEventListener('beforeunload', handleBeforeNavigate);
  }, [location.pathname]);
  
  // Restore scroll khi back
  useEffect(() => {
    const savedScroll = sessionStorage.getItem(`scroll_${location.pathname}`);
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll));
      sessionStorage.removeItem(`scroll_${location.pathname}`);
    }
  }, [location.pathname]);
  
  return { navigate };
}
```

---

## 5. QUY CHUẨN THAO TÁC (INTERACTION RULES) TRÊN MOBILE

### 5.1 Action Permission Matrix

| Action | Mobile Allowed? | Max Steps | Confirm Required? | Notes |
|--------|----------------|-----------|-------------------|-------|
| **View** | ✅ Yes | 1 | No | Tap → navigate |
| **Search** | ✅ Yes | 1 | No | Input → instant filter |
| **Filter** | ✅ Yes (simplified) | 2 | No | Tap filter → select → apply |
| **Check-in** | ✅ Yes | 2 | Yes | Tap → Confirm sheet |
| **Check-out** | ✅ Yes | 2 | Yes | Tap → Confirm sheet |
| **Approve** | ✅ Yes | 2 | Yes | Tap → Confirm sheet |
| **Reject** | ✅ Yes | 3 | Yes + Reason | Tap → Reason input → Confirm |
| **Collect Payment** | 🟡 Limited | 3 | Yes | Chỉ confirm, không nhập mới |
| **Create** | ❌ No | - | - | Desktop only |
| **Edit Complex** | ❌ No | - | - | Desktop only |
| **Delete** | ❌ No | - | - | Desktop only |

### 5.2 Confirm Pattern

```tsx
// Mobile confirmation bottom sheet
function MobileConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Xác nhận",
  destructive = false,
  loading = false,
}: MobileConfirmActionProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <div className="py-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-muted-foreground mt-2">{description}</p>
          
          <div className="flex gap-3 mt-6">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button 
              variant={destructive ? "destructive" : "default"}
              className="flex-1"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : confirmLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### 5.3 Chặn Action không cho phép

```tsx
// Component wrapper để chặn action trên mobile
function MobileRestricted({ 
  children, 
  allowedActions,
  currentAction,
}: MobileRestrictedProps) {
  const isMobile = useIsMobile();
  
  if (isMobile && !allowedActions.includes(currentAction)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="opacity-50 pointer-events-none">
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          Vui lòng thao tác trên Desktop
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return <>{children}</>;
}

// Usage
<MobileRestricted 
  allowedActions={['VIEW', 'APPROVE', 'REJECT']} 
  currentAction="CREATE"
>
  <Button>Tạo mới</Button>
</MobileRestricted>
```

### 5.4 Desktop-only Page Redirect

```tsx
// Redirect desktop-only pages trên mobile
function DesktopOnlyGuard({ 
  children, 
  redirectTo = "/",
  message = "Trang này chỉ khả dụng trên Desktop"
}: DesktopOnlyGuardProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (isMobile) {
      toast.info(message, {
        description: "Đang chuyển hướng...",
        duration: 2000,
      });
      setTimeout(() => navigate(redirectTo), 2000);
    }
  }, [isMobile, navigate, redirectTo, message]);
  
  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
        <Monitor className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="font-semibold text-lg text-center">{message}</h2>
        <p className="text-muted-foreground text-center mt-2">
          Đang chuyển hướng...
        </p>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

---

## 6. POST-ACTION BEHAVIOR TRÊN MOBILE

### 6.1 Feedback Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST-ACTION FLOW                             │
│                                                                 │
│   1. User tap action button                                    │
│   2. Show loading indicator NGAY (< 50ms)                      │
│   3. Optimistic update UI (status badge đổi màu)               │
│   4. API call background                                       │
│   5. On success: Toast + Stay on page (không navigate)         │
│   6. On error: Rollback UI + Toast error + Option retry        │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Standard Toast Messages (Mobile)

```typescript
const MOBILE_TOAST_CONFIG = {
  success: {
    duration: 2000,  // Ngắn hơn desktop
    position: 'bottom-center',
  },
  error: {
    duration: 4000,  // Đủ đọc
    position: 'bottom-center',
    action: {
      label: 'Thử lại',
      onClick: () => {},
    },
  },
  info: {
    duration: 2000,
    position: 'bottom-center',
  },
};

// Usage
toast.success("Check-in thành công", MOBILE_TOAST_CONFIG.success);
toast.error("Lỗi: " + error.message, MOBILE_TOAST_CONFIG.error);
```

### 6.3 Loading States

```tsx
// Button loading state
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      Đang xử lý...
    </>
  ) : (
    'Check-in'
  )}
</Button>

// Card loading overlay
{isUpdating && (
  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin" />
  </div>
)}
```

### 6.4 Stay vs Navigate After Action

| Action | After Success | Lý do |
|--------|--------------|-------|
| Check-in | Stay on list, scroll to updated item | Có thể check-in tiếp |
| Check-out | Stay on list | Có thể xử lý booking khác |
| Approve | Stay on list, remove item | Duyệt tiếp các pending |
| Reject | Stay on list, remove item | Duyệt tiếp các pending |
| View Detail | Navigate to detail | Expected behavior |

---

## 7. NHỮNG LỖI PHỔ BIẾN CẦN TRÁNH

| # | Lỗi | Tại sao sai | Cách đúng |
|---|-----|-------------|-----------|
| 1 | Mở tab mới | Mobile browser tab switching tệ | Cùng tab, dùng back |
| 2 | Table trên mobile | Không scroll ngang tốt | Card list |
| 3 | Modal to full screen | Khó dismiss | Bottom sheet |
| 4 | Form dài trên mobile | User mệt, dễ sai | Desktop only hoặc wizard |
| 5 | Confirm quá nhiều step | Friction cao | Max 2 steps |
| 6 | Không có loading | User tap nhiều lần | Loading ngay < 50ms |
| 7 | Navigate after action | Mất context | Stay + Toast |
| 8 | Filter quá nhiều option | Không fit | Filter drawer + max 4 options |
| 9 | Rely browser back | Inconsistent | UI back button |
| 10 | Desktop feature trên mobile | UX tệ | Block + redirect |

---

## 8. CHECKLIST DEV ÁP DỤNG

### 8.1 Checklist mỗi page/component mới

```
□ Xác định module thuộc nhóm nào (Full/View+Approve/Desktop-only)
□ Nếu Desktop-only → implement DesktopOnlyGuard
□ Nếu Mobile-allowed:
  □ List view dùng Card, không Table
  □ Max 2 actions per item
  □ Actions có loading state
  □ Actions có confirm (nếu destructive)
  □ Back button trong UI
  □ Filter đơn giản (max 4 options)
  □ Toast feedback sau action
  □ Không navigate sau action (trừ View)
```

### 8.2 Checklist test mobile

```
□ Test trên Safari iOS (iPhone)
□ Test trên Chrome Android
□ Test portrait mode (không landscape)
□ Test với network slow (3G)
□ Test tap → loading → success/error
□ Test back button giữ state
□ Test scroll position restore
□ Test deep link hoạt động
```

### 8.3 QA checklist

```
□ Không có action desktop-only hiện trên mobile
□ Không có table horizontal scroll
□ Không có modal full screen
□ Toast hiện đúng vị trí (bottom-center)
□ Loading indicator < 50ms
□ Error có option retry
□ Filter có nút clear
```

---

## TÓM TẮT QUYẾT ĐỊNH

| Quyết định | Giá trị | Lý do |
|-----------|---------|-------|
| Mobile role | Companion (phụ) | Không thay thế desktop |
| Navigation | Same tab only | Mobile tab switch tệ |
| List format | Cards | Table không responsive |
| Action container | Bottom Sheet | Easier dismiss than modal |
| Max actions per item | 2 | Touch target + simplicity |
| Confirm steps | Max 2 | Reduce friction |
| Post-action | Stay + Toast | Keep context |
| Desktop-only handling | Redirect + Toast | Clear communication |

---

**END OF DOCUMENT**

> Mobile Web là giao diện phụ trợ cho ops xử lý nhanh.
> Desktop vẫn là nơi làm việc chính.

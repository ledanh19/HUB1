# ROOMRISE CONTROL HUB - UX GOVERNANCE STANDARD

> **Version**: 1.1 (Implemented)  
> **Created**: 2024-12-31  
> **Updated**: 2025-01-XX (Implementation Complete)  
> **Author**: Principal UX Architect + Product Engineer  
> **Scope**: Navigation, Interaction, Back Behavior, State Persistence, Post-Action Performance

---

## ✅ IMPLEMENTATION STATUS

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ **COMPLETE** | Optimistic Updates + Partial Invalidation |
| **Phase 2** | ✅ **COMPLETE** | Navigation + State Persistence |
| **Phase 3** | ✅ **COMPLETE** | UI Components + Action Contracts |

### Files Created:
- `src/components/ui/BackButton.tsx` - Standardized back navigation
- `src/components/ui/ConfirmDialog.tsx` - Confirmation modal with variants
- `src/components/ui/RowActions.tsx` - Quick action dropdown for tables
- `src/components/ui/ProcessingOverlay.tsx` - Visual feedback for async ops
- `src/hooks/useScrollPreservation.ts` - Scroll position persistence

### Hooks Modified with Optimistic Updates:
- `src/hooks/useDisputes.ts` - useUpdateDispute, useCreateDispute
- `src/hooks/useOtaPayouts.ts` - useRecordCashIn, useUpdatePayoutStatus
- `src/hooks/useServiceOrders.ts` - useUpdateServiceOrder
- `src/hooks/useHostPayments.ts` - useCreateHostPayment (partial invalidation)
- `src/hooks/useBookings.ts` - useCreateHotelCollect (partial invalidation)
- `src/hooks/useCollections.ts` - Already had optimistic updates (verified)

---

## 1. TÓM TẮT VẤN ĐỀ & NGUYÊN NHÂN GỐC

### 1.1 Vấn đề đã xác nhận

| # | Vấn đề | Mô tả | Mức độ |
|---|--------|-------|--------|
| 1 | **Navigation không nhất quán** | Module A mở tab mới, module B dùng cùng tab | 🔴 High |
| 2 | **Container rules không rõ** | Có chỗ dùng Modal, có chỗ dùng Page cho cùng loại tác vụ | 🟡 Medium |
| 3 | **State không persist** | Quay lại trang mất filter/sort/page/scroll | 🔴 High |
| 4 | **Back behavior lộn xộn** | Có nơi có nút Back, có nơi không, phải dùng browser back | 🟡 Medium |
| 5 | **Post-action delay 3-5s** | Sau khi Approve/Cashout/Complete phải đợi 3-5s mới thấy UI cập nhật | 🔴 Critical |

### 1.2 Nguyên nhân gốc (Root Cause)

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST-ACTION DELAY (3-5s)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Click → [Mutation] → [Wait for Response] → [Invalidate]  │
│                    ↓              ↓                    ↓        │
│               Network RTT    DB Processing      Full Refetch    │
│               (~500ms)        (~500-1000ms)     (~2000-3000ms)  │
│                                                                 │
│  PROBLEM: 60+ mutations KHÔNG dùng Optimistic Update            │
│  PROBLEM: invalidateQueries() → refetch TOÀN BỘ list            │
│  PROBLEM: Dashboard KPIs refetch cùng lúc → cascade delay       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Phân tích codebase:**
- Chỉ **4-6 mutations** có `onMutate` (optimistic update)
- **60+ mutations** dùng pattern cũ: `invalidateQueries()` sau success
- `usePaymentRequests.ts` invalidate 4-5 query keys cùng lúc
- Dashboard/KPIs refetch cascade khi list thay đổi

### 1.3 Phân loại modules trong Control Hub

| Loại | Pages | Thao tác chính |
|------|-------|----------------|
| **List Page** | BookingsPage, OtaPayoutsPage, DisputesPage, HostPayablesPage, PaymentRequestsPage, CollectionsPage | View, Search, Filter, Sort, Paginate |
| **Detail Page** | BookingDetailPage, OtaPayoutDetailPage, DisputeDetailPage, HostPayableDetailPage | View, Edit fields, Quick actions, Navigate sub-entities |
| **Create/Edit Form** | CreateManualBookingDialog, AddServiceDialog, EditHostDepositDialog | Input, Validate, Submit |
| **Approval Workflow** | ApprovalsPage, PaymentRequestsPage | View queue, Approve, Reject, Escalate |
| **Finance Flow** | CashOutPage, HostSettlementPage, CollectionsPage | Record payment, Verify, Finalize, Export |
| **Reports** | ReportsPnlPage, ReportsCashflowPage, NoShowReportPage | Filter, View, Export, Drill-down |
| **Audit** | AuditLogsPage | Search, Filter, View history |
| **Settings** | SettingsPage | Configure, Toggle, Save |

---

## 2. BỘ NAVIGATION STRATEGY CHUẨN

### 2.1 Quy tắc mở Tab

| Hành vi | Mở TAB MỚI | Dùng CÙNG TAB |
|---------|------------|---------------|
| **Khi nào** | Chỉ khi cần **so sánh/tham khảo** song song | Mọi luồng nghiệp vụ cần hoàn tất liền mạch |
| **Ví dụ** | External OTA portal, Audit compare, PDF export | List→Detail→Back, Create form, Quick actions |

**Rules cứng:**

```typescript
// ✅ ĐÚNG - Cùng tab cho internal navigation
<Link to={`/bookings/${id}`}>View Detail</Link>
navigate(`/ota-payouts/${id}`);

// ✅ ĐÚNG - Tab mới chỉ cho external/compare
<a href={externalOtaUrl} target="_blank" rel="noopener noreferrer">
  Mở OTA Portal ↗
</a>

// ❌ SAI - Không mở tab mới cho detail page
<Link to="/bookings/123" target="_blank">  // WRONG!
```

### 2.2 Deep Link Standard

URL phải phản ánh đúng trạng thái để có thể share/bookmark:

```
/bookings?status=CONFIRMED&source=Booking.com&page=2&sort=created_at:desc
          ↑               ↑                    ↑      ↑
       Filter          Filter               Page   Sort
```

**Query params đã implement:**
- `q` - Search term
- `status`, `source`, `type`, `payment` - Filters
- `from`, `to`, `dateType` - Date range
- `page`, `size` - Pagination

### 2.3 Navigation Flow Diagram

```
                          ┌─────────────────┐
                          │    Dashboard    │
                          │  (Entry Point)  │
                          └───────┬─────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
    │ List Page   │       │ List Page   │       │ List Page   │
    │ (Bookings)  │       │ (OTA Payout)│       │ (Host Pay.) │
    └─────┬───────┘       └─────┬───────┘       └─────┬───────┘
          │                     │                     │
          │ [Same Tab]          │ [Same Tab]          │ [Same Tab]
          ▼                     ▼                     ▼
    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
    │ Detail Page │       │ Detail Page │       │ Detail Page │
    │(with Actions│       │(with Actions│       │(with Actions│
    └─────────────┘       └─────────────┘       └─────────────┘
          │                     │                     │
          │ [Modal]             │ [Modal]             │ [Modal]
          ▼                     ▼                     ▼
    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
    │ Confirm Act │       │ Confirm Act │       │ Confirm Act │
    │   (Modal)   │       │   (Modal)   │       │   (Modal)   │
    └─────────────┘       └─────────────┘       └─────────────┘
```

---

## 3. BỘ CONTAINER RULES (Page/Modal/Drawer/Popover)

### 3.1 Decision Matrix

| Container | Khi nào dùng | Ví dụ | Không dùng khi |
|-----------|--------------|-------|----------------|
| **PAGE** | - Nhiều bước (>3 fields)<br>- Cần ngữ cảnh rộng<br>- Cần URL bookmark/share<br>- Duration >30s | BookingDetailPage, HostSettlementPage | Xác nhận nhanh, form đơn giản |
| **DRAWER** | - Xem chi tiết không rời list<br>- Edit inline<br>- Preview trước navigate | AI Insights Panel, Filter settings | Form dài, multi-step |
| **MODAL** | - Xác nhận hành động<br>- Form ngắn (1-5 fields)<br>- Interrupt flow có ý<br>- Duration <30s | ConfirmApprove, AddService, CheckIn | Nhiều data, cần scroll nhiều |
| **POPOVER** | - Quick action menu<br>- Tooltip với action<br>- Date picker<br>- Duration <5s | Row actions, Filter dropdown | Form input, confirm quan trọng |

### 3.2 Control Hub Container Audit (Current vs Standard)

| Component | Current | Standard | Action Needed |
|-----------|---------|----------|---------------|
| `AddServiceDialog` | Modal ✅ | Modal | None |
| `CheckInDialog` | Modal ✅ | Modal | None |
| `ConfirmAmountDialog` | Modal ✅ | Modal | None |
| `AIPricingInsightsPage` | Page + Sheet ✅ | Page + Drawer | None |
| `CollectionActionsMenu` | DropdownMenu ✅ | Popover/Dropdown | None |
| Row Quick Actions | Inline buttons | **→ Popover** | Refactor needed |
| Filter Panel | Inline cards | **→ Drawer (mobile)** | Responsive refactor |

### 3.3 Container Usage Example

```tsx
// ✅ MODAL - Confirm action (short, interruptive)
<Dialog open={showConfirm}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Xác nhận phê duyệt?</DialogTitle>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowConfirm(false)}>Huỷ</Button>
      <Button onClick={handleApprove}>Phê duyệt</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// ✅ DRAWER - Detail preview without leaving list
<Sheet open={!!selectedItem}>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Chi tiết #{selectedItem?.code}</SheetTitle>
    </SheetHeader>
    <div className="space-y-4">
      {/* Detail content */}
    </div>
  </SheetContent>
</Sheet>

// ✅ POPOVER - Quick actions menu
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => handleAction('approve')}>Duyệt</DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleAction('reject')}>Từ chối</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## 4. BỘ BACK BEHAVIOR + STATE PERSISTENCE

### 4.1 Back Behavior Standard

#### Rule 1: Luôn có nút Back trong UI

```tsx
// ✅ CHUẨN - Mọi detail page phải có back button
function DetailPageHeader({ backTo, title }: { backTo: string; title: string }) {
  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" asChild>
        <Link to={backTo}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );
}
```

#### Rule 2: Back destination theo context

| From | To | Back Behavior |
|------|----|---------------|
| List → Detail | Detail Page | Back to List (giữ filter/page) |
| Dashboard → Detail | Detail Page | Back to Dashboard |
| Notification → Detail | Detail Page | Back to **referring page** (not notification) |
| Tab mới → Detail | Detail Page | Close tab hoặc về List nếu referrer trống |

#### Rule 3: Xử lý referrer

```tsx
// Lưu referrer khi navigate
function useBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const goBack = useCallback(() => {
    // Check if we have a referrer in state
    const referrer = location.state?.from;
    if (referrer) {
      navigate(referrer);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Fallback to parent route
      navigate(getParentRoute(location.pathname));
    }
  }, [location, navigate]);
  
  return { goBack };
}
```

### 4.2 State Persistence Rules

#### Cái gì phải giữ vs reset

| State | Persist | Scope | Kỹ thuật |
|-------|---------|-------|----------|
| **Filter** | ✅ Yes | Session + Route | URL params + localStorage |
| **Search term** | ✅ Yes | Session | URL params |
| **Sort** | ✅ Yes | Session + Route | URL params + localStorage |
| **Pagination** | ✅ Yes | Route only | URL params |
| **Scroll position** | ✅ Yes | Route only | In-memory (sessionStorage backup) |
| **Selected rows** | ❌ No | - | Reset on navigate |
| **Expanded rows** | ❌ No | - | Reset on navigate |
| **Modal state** | ❌ No | - | Reset on navigate |

#### Implementation (đã có trong codebase)

```typescript
// src/hooks/useFilterPersistence.ts - ĐÃ IMPLEMENT

/**
 * Priority: URL query params > localStorage > default
 * 
 * Features:
 * - Preserves filter state when navigating to detail and back
 * - URL is source of truth for sharing links
 * - localStorage per module for persistence across sessions
 */
export function useFilterPersistence(moduleKey: string) {
  // ... implementation
}
```

### 4.3 Scroll Position Preservation

```tsx
// Component cần implement
function useScrollPreservation(key: string) {
  const scrollKey = `scroll_${key}`;
  
  // Save before navigate
  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    
    return () => {
      handleBeforeUnload();
    };
  }, [scrollKey]);
  
  // Restore on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      window.scrollTo(0, parseInt(saved, 10));
      sessionStorage.removeItem(scrollKey);
    }
  }, [scrollKey]);
}
```

---

## 5. INTERACTION CONTRACT (Action Taxonomy)

### 5.1 Action Contract Table

| Action | Vị trí ưu tiên | Xác nhận | Feedback sau thao tác | Xử lý lỗi | Undo |
|--------|---------------|----------|----------------------|-----------|------|
| **VIEW** | Row click / Eye icon | Không | Navigate to detail | Toast error | - |
| **SEARCH** | Header/Filter bar | Không (instant) | List updates | Toast "Không tìm thấy" | Clear search |
| **FILTER** | Header/Filter bar | Không (instant) | List updates + badge count | - | Reset button |
| **EDIT** | Detail page / Inline | Modal confirm nếu critical | Toast + Row highlight | Toast + Show original | Undo toast (5s) |
| **CREATE** | Header button / FAB | Modal form | Toast + Navigate to detail | Modal stays open + error msg | - |
| **APPROVE** | Row action / Bulk action | Modal confirm | **Optimistic UI** + Toast | Rollback + Toast error | Reject flow |
| **REJECT** | Row action | Modal + Reason input | **Optimistic UI** + Toast | Rollback + Toast error | - |
| **FINALIZE** | Detail action | Modal confirm | **Optimistic UI** + Toast | Rollback + Toast error | ❌ Không có |
| **PAY/CASHOUT** | Dedicated page | Modal confirm + Idempotency | **Optimistic UI** + Toast + Receipt | Rollback + Toast + Retry option | ❌ Không có |
| **EXPORT** | Header action | Không | Download + Toast | Toast error + Retry | - |
| **DELETE** | Row action (hidden) | Modal confirm (strict) | Toast + Remove from list | Toast error | ❌ Không có (soft delete) |

### 5.2 Critical Actions Protection

Các action liên quan đến **tiền** phải có:

```typescript
// 1. Idempotency Key (đã implement trong useRealtimeSystem.ts)
export function generateIdempotencyKey(action: string, entityId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${action}_${entityId}_${timestamp}_${random}`;
}

// 2. Double-click Guard (đã implement trong useMutationWrapper.ts)
const safeMutate = useCallback((variables: TVariables) => {
  if (isInCooldown || mutation.isPending) {
    toast.info("Đang xử lý...", {
      description: "Vui lòng đợi thao tác trước hoàn tất",
    });
    return;
  }
  mutation.mutate(variables);
}, [isInCooldown, mutation]);

// 3. Status Guard (kiểm tra trạng thái trước mutation)
.eq("status", "PENDING") // Only allow if status is PENDING
```

---

## 6. GIẢI QUYẾT POST-ACTION DELAY (3-5s)

### 6.1 Before vs After Flow

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         TRƯỚC (CURRENT - 3-5s delay)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User Click     Network      DB Update     Invalidate    UI Update
      │             │             │              │             │
      ▼             ▼             ▼              ▼             ▼
  ┌───────┐    ┌───────┐    ┌───────┐    ┌───────────┐    ┌───────┐
  │Click  │───▶│ POST  │───▶│UPDATE │───▶│invalidate │───▶│Refetch│
  │Approve│    │/patch │    │row    │    │Queries()  │    │ALL    │
  └───────┘    └───────┘    └───────┘    └───────────┘    └───────┘
                                               │
                                               ▼
                                    ┌─────────────────┐
                                    │ REFETCH:        │
                                    │ - payment-req   │
                                    │ - approved-req  │
                                    │ - req-stats     │
                                    │ - dashboard     │
                                    │ - dashboard-kpi │
                                    └─────────────────┘
                                               │
                                         ~3000-5000ms
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ UI Finally  │
                                        │ Updates     │
                                        └─────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                       SAU (OPTIMISTIC - <200ms perceived)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User Click    UI Update     Toast        Network      Background
      │             │           │             │              │
      ▼             ▼           ▼             ▼              ▼
  ┌───────┐    ┌───────┐   ┌───────┐    ┌───────┐    ┌───────────┐
  │Click  │───▶│setQuery│──▶│"Đang  │───▶│ POST  │───▶│ Partial   │
  │Approve│    │Data()  │   │xử lý" │    │/patch │    │ Invalidate│
  └───────┘    └───────┘   └───────┘    └───────┘    └───────────┘
                   │                          │              │
               <50ms                      Background    Only affected
                   │                          │           queries
                   ▼                          ▼              │
            ┌─────────────┐            ┌─────────────┐       │
            │ Row status  │            │ On Error:   │       │
            │ = APPROVED  │            │ ROLLBACK    │       │
            │ + Disabled  │            │ + Toast err │       │
            └─────────────┘            └─────────────┘       │
                                                             ▼
                                                    ┌───────────────┐
                                                    │ Dashboard KPIs│
                                                    │ update later  │
                                                    │ (~500ms)      │
                                                    └───────────────┘
```

### 6.2 Optimistic UI Implementation Standard

```typescript
// CHUẨN cho tất cả mutations liên quan state change

export function useApproveRequest() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { requestId: string }) => {
      // Actual API call
      const { data, error } = await supabase
        .from("payment_requests")
        .update({ status: "APPROVED", approved_at: new Date().toISOString() })
        .eq("id", params.requestId)
        .eq("status", "PENDING")
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    
    // === OPTIMISTIC UPDATE ===
    onMutate: async (params) => {
      // 1. Cancel in-flight refetches
      await queryClient.cancelQueries({ queryKey: ["payment-requests"] });
      
      // 2. Snapshot current data
      const previousData = queryClient.getQueryData(["payment-requests"]);
      
      // 3. Optimistically update cache
      queryClient.setQueryData(["payment-requests"], (old: Request[] | undefined) => {
        if (!old) return old;
        return old.map(req => 
          req.id === params.requestId 
            ? { 
                ...req, 
                status: "APPROVED",
                _isOptimistic: true,  // Mark for UI indicator
                _isProcessing: true   // Disable actions
              }
            : req
        );
      });
      
      // 4. Return context for rollback
      return { previousData };
    },
    
    // === ROLLBACK ON ERROR ===
    onError: (error, params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["payment-requests"], context.previousData);
      }
      toast.error("Lỗi: " + error.message);
    },
    
    // === PARTIAL INVALIDATION (not full refetch) ===
    onSuccess: () => {
      toast.success("Đã phê duyệt");
      
      // Immediate: Only current list (already updated optimistically)
      // No need to refetch!
      
      // Delayed: Stats & dashboard (low priority)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      }, 500);
      
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 1000);
    },
  });
}
```

### 6.3 Feedback Microcopy Standard

| State | Message | Duration | Style |
|-------|---------|----------|-------|
| Processing | "Đang xử lý..." | While pending | Toast info (spinner) |
| Success | "Đã [action]" | 3s | Toast success (check icon) |
| Error | "Lỗi [action]: [reason]" | 5s | Toast error (x icon) |
| Conflict | "Dữ liệu đã thay đổi. Đang cập nhật..." | 4s | Toast warning |
| Blocked (double-click) | "Vui lòng đợi thao tác trước hoàn tất" | 2s | Toast info |

### 6.4 UI Indicator During Optimistic Update

```tsx
// Row component
function PaymentRequestRow({ request }) {
  const isProcessing = request._isOptimistic || request._isProcessing;
  
  return (
    <TableRow className={cn(
      isProcessing && "opacity-70 pointer-events-none"
    )}>
      <TableCell>
        <StatusBadge 
          status={request.status}
          isProcessing={isProcessing}
        />
      </TableCell>
      <TableCell>
        {isProcessing && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Đang đồng bộ...
          </span>
        )}
      </TableCell>
      {/* ... */}
    </TableRow>
  );
}
```

---

## 7. PLAN TRIỂN KHAI THEO PHA

### Phase 1: Critical Performance Fix (1-2 tuần)

**Mục tiêu**: Giảm post-action delay từ 3-5s → <500ms

| Task | File | Priority | Est. |
|------|------|----------|------|
| Add optimistic update to `useApprovePaymentRequest` | usePaymentRequests.ts | P0 | 2h |
| Add optimistic update to `useRejectPaymentRequest` | usePaymentRequests.ts | P0 | 2h |
| Add optimistic update to `useCreateCashOut` | useCashOuts.ts | P0 | 3h |
| Add optimistic update to `useCompleteSettlement` | useHostSettlement.ts | P0 | 3h |
| Add optimistic update to `useMarkCollection` | useCollections.ts | P0 | 2h |
| Implement partial invalidation pattern | All above | P0 | 4h |
| Add `_isProcessing` UI indicators | Components | P1 | 4h |
| Test rollback scenarios | - | P0 | 4h |

**Deliverables**:
- [ ] 10+ critical mutations có optimistic update
- [ ] Partial invalidation cho tất cả mutations
- [ ] Processing indicators trên UI
- [ ] Test pass cho rollback

### Phase 2: Navigation & State Consistency (1-2 tuần)

| Task | File | Priority | Est. |
|------|------|----------|------|
| Audit all detail pages có back button | All *DetailPage.tsx | P1 | 2h |
| Standardize back button component | components/ui/BackButton.tsx | P1 | 2h |
| Implement scroll preservation hook | hooks/useScrollPreservation.ts | P2 | 3h |
| Add referrer tracking | useBackNavigation.ts | P2 | 3h |
| Mobile filter drawer | components/ui/FilterDrawer.tsx | P2 | 4h |

**Deliverables**:
- [ ] Back button trên tất cả detail pages
- [ ] Scroll position preserved khi back
- [ ] Filter drawer cho mobile
- [ ] Deep link test pass

### Phase 3: Action Contract Enforcement (1 tuần)

| Task | File | Priority | Est. |
|------|------|----------|------|
| Create row action popover component | components/ui/RowActions.tsx | P2 | 4h |
| Standardize confirmation modals | components/ui/ConfirmDialog.tsx | P2 | 3h |
| Add undo toast for edit actions | hooks/useUndoableAction.ts | P3 | 4h |
| Audit all actions follow contract | - | P2 | 4h |

**Deliverables**:
- [ ] RowActions component chuẩn
- [ ] ConfirmDialog chuẩn
- [ ] Edit có undo (optional)

---

## 8. CHECKLIST TEST

### 8.1 Navigation Test

```
□ Mở detail từ list → back giữ filter/sort/page
□ Mở detail từ dashboard → back về dashboard
□ Mở detail từ notification → back về referring page
□ Deep link share → load đúng filter state
□ Browser back → hoạt động như nút back
□ External link → mở tab mới
```

### 8.2 Action Test

```
□ Single click → action execute
□ Double click rapid → chỉ execute 1 lần
□ Backend fail → rollback UI + toast error
□ Network slow → UI vẫn responsive (optimistic)
□ Status guard → chỉ PENDING mới approve được
□ Concurrent edit → conflict detection
```

### 8.3 Data Consistency Test

```
□ List status = Detail status sau action
□ Stats/totals = Sum of list items
□ Audit log ghi đủ (action, before, after, user, time)
□ Optimistic update match server response
□ Rollback restore đúng previous state
```

### 8.4 Performance Test

```
□ Action → UI update < 200ms (optimistic)
□ Stats update < 1000ms (background)
□ Dashboard KPIs update < 2000ms (low priority)
□ No duplicate refetch calls
□ No cascade invalidation
```

---

## 9. RỦI RO & CÁCH KHÓA

| Rủi ro | Xác suất | Impact | Mitigation |
|--------|----------|--------|------------|
| Optimistic update sai state | Medium | High | Luôn có rollback + server authoritative |
| Double mutation (tiền) | Low | Critical | Idempotency key + status guard + cooldown |
| Lost scroll position | Low | Low | SessionStorage backup |
| Filter state conflict với URL | Low | Medium | URL là source of truth |
| User confuse optimistic vs real | Medium | Medium | Clear processing indicator |

### Rollback Plan

Nếu Phase 1 gây regression:

1. **Feature flag** cho optimistic updates (đã có `FEATURE_FLAGS.SAFE_PAY_GUARD`)
2. **Revert** mutations về pattern cũ (invalidateQueries)
3. **Monitor** Supabase logs cho duplicate entries
4. **Notify** users nếu có data issue

---

## 10. FILES CẦN KIỂM TRA/SỬA

### Hooks cần thêm Optimistic Update

```
src/hooks/usePaymentRequests.ts     ✅ ALREADY HAD - Approve, Reject
src/hooks/useCashOuts.ts            ✅ ALREADY HAD - Create, Complete
src/hooks/useHostSettlement.ts      # Complex query-only hook (no mutations)
src/hooks/useCollections.ts         ✅ ALREADY HAD - Refund, Void with optimistic
src/hooks/useDisputes.ts            ✅ UPDATED - useUpdateDispute, useCreateDispute
src/hooks/useOtaPayouts.ts          ✅ UPDATED - useRecordCashIn, useUpdatePayoutStatus
src/hooks/useBookings.ts            ✅ UPDATED - useCreateHotelCollect (partial invalidation)
src/hooks/useServiceOrders.ts       ✅ UPDATED - useUpdateServiceOrder
src/hooks/useHostPayments.ts        ✅ UPDATED - useCreateHostPayment (partial invalidation)
```

### Pages cần audit Back button

```
src/pages/BookingDetailPage.tsx     ✅ Có
src/pages/OtaPayoutDetailPage.tsx   ✅ Có
src/pages/DisputeDetailPage.tsx     ✅ Có
src/pages/HostPayableDetailPage.tsx ✅ Có (verified)
src/pages/ServiceOrderDetailPage.tsx ✅ Có (verified)
```

### Components cần tạo mới

```
src/components/ui/BackButton.tsx        ✅ CREATED - Standardized back button
src/components/ui/RowActions.tsx        ✅ CREATED - Quick action popover
src/components/ui/ConfirmDialog.tsx     ✅ CREATED - Standardized confirm modal
src/components/ui/ProcessingOverlay.tsx ✅ CREATED - Optimistic update indicator
src/hooks/useScrollPreservation.ts      ✅ CREATED - Scroll position hook
```

---

**END OF DOCUMENT**

> Tài liệu này là source of truth cho UX behavior trong Roomrise Control Hub.  
> Mọi thay đổi UX phải được review và cập nhật vào đây.

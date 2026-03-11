# MULTI-ROOM CHECK-IN/CHECK-OUT QA CHECKLIST

## 📋 Overview

This document provides QA checklist for the multi-room check-in/check-out feature implementation.

**Date**: January 25, 2026  
**Feature**: Multi-room booking check-in/check-out with partial support  
**Ticket**: Multi-room SEGMENT-based check-in/out  

---

## 🏗️ Architecture Changes

### New Files Created

| File | Purpose |
|------|---------|
| `src/hooks/useMultiRoomCheckInOut.ts` | Hook with `useMultiRoomCheckIn`, `useMultiRoomCheckOut`, helpers |
| `src/components/booking/MultiRoomCheckInDialog.tsx` | Dialog for multi-room check-in with room line selection |
| `src/components/booking/MultiRoomCheckOutDialog.tsx` | Dialog for multi-room check-out with partial support |
| `src/hooks/__tests__/useMultiRoomCheckInOut.test.ts` | Unit tests for T1-T5 |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/StaysPage.tsx` | Import new dialogs, auto-detect multi-room, open appropriate dialog |

### SOT (Source of Truth)

| Table | Field | Purpose |
|-------|-------|---------|
| `host_supply_segments` | `actual_check_in_at` | Per-room line check-in timestamp |
| `host_supply_segments` | `actual_check_out_at` | Per-room line check-out timestamp |
| `host_supply_segments` | `checked_in_by` | User who performed check-in |
| `host_supply_segments` | `checked_out_by` | User who performed check-out |
| `stays` | `stay_status` | Aggregated status (CHECKED_IN, IN_HOUSE, CHECKED_OUT) |
| `stays` | `actual_check_in_at` | First check-in timestamp |
| `stays` | `actual_check_out_at` | Final check-out timestamp (when all rooms out) |

---

## ✅ Test Cases

### T1: Check-in 2/3 rooms (Partial Check-in)

**Scenario**: Booking 3 rooms, 2 segments (Partner A: 2 rooms, Partner B: 1 room), check-in only Partner A rooms

**Steps**:
1. [ ] Create booking with 3 room lines
2. [ ] Assign 3 host supply segments (2 for Partner A, 1 for Partner B)
3. [ ] Open Check-in action for booking
4. [ ] Verify MultiRoomCheckInDialog opens (not single CheckInDialog)
5. [ ] Verify all 3 room lines displayed with checkboxes
6. [ ] Select only 2 room lines (Partner A)
7. [ ] Click "Check-in 2 phòng (Partial)"
8. [ ] **Verify DB**: Only 2 segments have `actual_check_in_at` populated
9. [ ] **Verify DB**: 1 segment remains `actual_check_in_at = NULL`
10. [ ] **Verify DB**: `stays.stay_status = 'CHECKED_IN'`
11. [ ] **Verify UI**: Toast shows "Check-in thành công 2/3 phòng (Partial)"
12. [ ] **Verify UI**: Booking shows "Partial" badge

**Expected Result**: ✅ Only selected room lines update, others unchanged

---

### T2: Partial Check-out (1/2 rooms)

**Scenario**: From T1, check out 1 of 2 checked-in rooms

**Steps**:
1. [ ] Start with 2 rooms checked in from T1
2. [ ] Open Check-out action for booking
3. [ ] Verify MultiRoomCheckOutDialog opens
4. [ ] Verify 2 room lines shown as "Đang lưu trú" with checkboxes
5. [ ] Verify 1 room line shown as "Chưa check-in" (disabled)
6. [ ] Select only 1 of 2 checked-in room lines
7. [ ] Handle financial prompts (if any)
8. [ ] Click "Check-out 1 phòng (Partial)"
9. [ ] **Verify DB**: Selected segment has `actual_check_out_at` populated
10. [ ] **Verify DB**: Other checked-in segment remains `actual_check_out_at = NULL`
11. [ ] **Verify DB**: `stays.stay_status = 'IN_HOUSE'` (not CHECKED_OUT)
12. [ ] **Verify UI**: Toast shows "Check-out thành công 1/3 phòng (Partial)"
13. [ ] **Verify UI**: "Còn 1 phòng đang lưu trú" message

**Expected Result**: ✅ Partial check-out, booking stays IN_HOUSE

---

### T3: Block Check-in for Unassigned Room

**Scenario**: Room line without host assignment cannot check-in

**Steps**:
1. [ ] Create booking with 2 room lines
2. [ ] Assign host supply segment to only 1 room line
3. [ ] Open Check-in action
4. [ ] **Verify UI**: Unassigned room line shows:
   - Red "Chưa gán phòng" badge
   - Disabled checkbox
   - Message "Chưa gán phòng Host cho room line này"
5. [ ] Attempt to programmatically check-in unassigned line
6. [ ] **Verify**: Error thrown with message about unassigned room
7. [ ] Assigned room line CAN be selected and checked in

**Expected Result**: ✅ Unassigned rooms blocked, assigned rooms can proceed

---

### T4: RBAC/Tenant Scope

**Scenario**: User can only see/modify segments for their property

**Steps**:
1. [ ] Login as User A (Property A)
2. [ ] Create booking for Property A
3. [ ] Assign host segments
4. [ ] Check-in successful
5. [ ] Login as User B (Property B)
6. [ ] **Verify**: Cannot see Property A booking in StaysPage
7. [ ] **Verify**: Direct API call with Property A segment ID fails (RLS)
8. [ ] **Verify**: Audit log shows correct `user_id` for all actions

**Expected Result**: ✅ RLS enforced, cross-tenant blocked

---

### T5: Data Persistence After Refresh

**Scenario**: Partial check-in state persists after page refresh

**Steps**:
1. [ ] Perform partial check-in (T1)
2. [ ] Note the state: 2 checked in, 1 pending
3. [ ] Press F5 to refresh page
4. [ ] Navigate back to same booking
5. [ ] **Verify**: Room line statuses correctly loaded from `host_supply_segments`
6. [ ] **Verify**: UI shows same partial state
7. [ ] **Verify**: "Partial" badge still displayed
8. [ ] Open Check-in dialog again
9. [ ] **Verify**: Already checked-in rooms show "Đã check-in" status
10. [ ] **Verify**: Pending room still selectable for check-in

**Expected Result**: ✅ SOT preserved, UI consistent

---

## 🔄 Rollback Instructions

### If Feature Needs Rollback

1. **Revert StaysPage.tsx changes**:
   ```bash
   git checkout HEAD~1 -- src/pages/StaysPage.tsx
   ```

2. **Remove new files** (optional, they won't be used if not imported):
   ```bash
   rm src/hooks/useMultiRoomCheckInOut.ts
   rm src/components/booking/MultiRoomCheckInDialog.tsx
   rm src/components/booking/MultiRoomCheckOutDialog.tsx
   rm src/hooks/__tests__/useMultiRoomCheckInOut.test.ts
   ```

3. **No database migration needed** - feature uses existing columns:
   - `host_supply_segments.actual_check_in_at` (existing)
   - `host_supply_segments.actual_check_out_at` (existing)
   - `host_supply_segments.checked_in_by` (existing)
   - `host_supply_segments.checked_out_by` (existing)

4. **Verify rollback**:
   - Single-room bookings should still work with original CheckInDialog
   - Multi-room bookings will use original (single-segment) flow
   - No data loss - segment timestamps remain in DB

### Feature Flags (Optional)

Add to `src/config/features.ts`:
```typescript
export const FEATURES = {
  MULTI_ROOM_CHECK_IN_OUT: true, // Set to false to disable
};
```

Then in StaysPage.tsx:
```typescript
const openCheckIn = (stay: StayWithBooking) => {
  if (FEATURES.MULTI_ROOM_CHECK_IN_OUT && stay.totalSegments > 1) {
    setMultiRoomCheckInDialogOpen(true);
  } else {
    setCheckInDialogOpen(true);
  }
};
```

---

## 📊 Metrics to Monitor

| Metric | Expected | Alert Threshold |
|--------|----------|-----------------|
| Check-in success rate | >99% | <95% |
| Partial check-in usage | Track | N/A |
| Error rate for unassigned rooms | 0 blocked correctly | Any uncaught errors |
| Query performance | <200ms | >500ms |

---

## 🐛 Known Limitations

1. **Optimistic Updates**: Multi-room dialogs don't have full optimistic update like single-room (intentional - complexity vs value)
2. **Audit Log**: Multi-room actions logged as single entry with `targets[]` array
3. **P&L Impact**: Revenue only recognized when ALL rooms checked out (final `stays.actual_check_out_at`)

---

## ✍️ Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | | | |
| QA | | | |
| Product | | | |

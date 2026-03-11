# SPRINT 2 - PHASE A: VERIFICATION REPORT

**Generated**: 2026-01-10  
**Status**: ✅ COMPLETE

---

## 📋 VERIFICATION MATRIX

### A1. TaskSidePanel - Field Controls Hiện Có

| Field | UI Control | Inline Edit | Hook Tồn Tại | Status |
|-------|------------|-------------|--------------|--------|
| `status` | ✅ Dropdown Select | ✅ Có | `useUpdateOtaTaskStatus` | ✅ HOẠT ĐỘNG |
| `priority` | ❌ Không có | ❌ Không | `useUpdateOtaTaskPriority` | ⚠️ HOOK CÓ, UI CHƯA WIRE |
| `due_date` | ❌ READ-ONLY badge | ❌ Không | ❌ KHÔNG CÓ HOOK | 🔴 THIẾU HOOK + UI |
| `assignee` | ✅ Display + "Thay đổi" button | ⚠️ Button không hoạt động | `useUpdateOtaTaskAssignee` | ⚠️ HOOK CÓ, UI CHƯA WIRE |
| `actual_hours` | ❌ Không có UI | ❌ Không | ❌ Không có mutation riêng | 🔴 THIẾU |
| `expected_effort_minutes` | ✅ READ-ONLY (nếu có data) | ❌ Không | ❌ Không có mutation | ⚠️ CHỈ DISPLAY |
| `actual_effort_minutes` | ✅ READ-ONLY (nếu có data) | ❌ Không | ❌ Không có mutation | ⚠️ CHỈ DISPLAY |

### A2. CreateTaskDialog / QuickTaskDialog - Classification Helper

| Dialog | Classification Field | Helper Text | Evidence Hint | Status |
|--------|---------------------|-------------|---------------|--------|
| **QuickTaskDialog** | ✅ Có dropdown | ✅ Tooltip | ✅ `evidenceInfo.message` dynamic | ✅ HOẠT ĐỘNG TỐT |
| **CreateTaskDialog** | ❌ Không có | N/A | N/A | ⚠️ THIẾU CLASSIFICATION |

### A3. Hooks/RPCs - Verification

| Hook | RPC/Method | Callable | RLS | Status |
|------|------------|----------|-----|--------|
| `useUpdateOtaTaskStatus` | `ota_update_task_status` | ✅ | ✅ Project RLS | ✅ HOẠT ĐỘNG |
| `useUpdateOtaTaskPriority` | Direct `ota_tasks.update()` | ✅ | ⚠️ Table RLS | ✅ HOẠT ĐỘNG (TaskQuickViewDrawer dùng) |
| `useUpdateOtaTaskAssignee` | Direct `ota_tasks.update()` | ✅ | ⚠️ Table RLS | ✅ CÓ NHƯNG UI KHÔNG WIRE |
| ~~`useUpdateOtaTaskDueDate`~~ | ❌ KHÔNG TỒN TẠI | N/A | N/A | 🔴 THIẾU |

### A4. Feature Chết/Trùng

| Item | File | Import Status | Route Status | Verdict |
|------|------|---------------|--------------|---------|
| `MyTasksPageEnhanced.tsx` | `src/pages/ota-operations/` | ❌ Không export từ `index.ts` | ❌ Không có route | 🗑️ **DELETE** |
| `TaskQuickViewDrawer` | `src/components/ota-operations/` | ✅ Import từ `ProjectDetailPage` | ✅ Dùng trong Drawer state | ✅ GIỮU (dùng cho Project view) |

---

## 📊 SUMMARY: ĐÃ CÓ / CHƯA WIRE / KHÔNG TỒN TẠI

### ✅ ĐÃ CÓ & DÙNG ĐƯỢC

| Item | Location | Notes |
|------|----------|-------|
| Status dropdown inline | `TaskSidePanel/PanelHeader.tsx` | Full integration với DONE guard |
| Priority hook | `useOtaOperations.ts:699` | Hook direct update |
| Assignee hook | `useOtaOperations.ts:733` | Hook direct update |
| Effort display (read-only) | `OverviewTab.tsx:178-195` | Shows when data exists |
| Classification + helper | `QuickTaskDialog.tsx:214-263` | Full với tooltip + dynamic text |
| TaskQuickViewDrawer | `TaskQuickViewDrawer.tsx` | Dùng trong ProjectDetailPage |

### ⚠️ ĐÃ CÓ NHƯNG KHÔNG WIRE

| Item | Issue | Fix Needed |
|------|-------|------------|
| `useUpdateOtaTaskPriority` | Không có dropdown trong TaskSidePanel | Add Select control to PanelHeader |
| `useUpdateOtaTaskAssignee` | "Thay đổi" button không hook mutation | Wire mutation to button |
| `due_date` display | Badge chỉ display, không edit | Add DatePicker + mutation |
| `expected/actual_effort` display | Read-only section | Add optional "Log effort" action |
| DropdownMenuItem "Đổi deadline" | Line 319 PanelHeader - button chỉ display | Wire mutation or open picker |
| DropdownMenuItem "Đổi ưu tiên" | Line 322 PanelHeader - button chỉ display | Wire mutation or show dialog |

### 🔴 KHÔNG TỒN TẠI THẬT

| Item | Required Action |
|------|-----------------|
| `useUpdateOtaTaskDueDate` | **CREATE** new hook (direct update like priority) |
| `useUpdateTaskEffort` | **CREATE** hook for effort update |
| Classification trong CreateTaskDialog | **ADD** field (đang có trong QuickTaskDialog) |
| Unassigned warning badge | **ADD** UI indicator |
| Project completion indicator | **ADD** banner khi all tasks DONE |

---

## 🎯 PHASE B - IMPLEMENTATION PLAN

Based on verification, thứ tự implementation:

### B0. Prerequisites (Must do first)
1. ✅ Create `useUpdateOtaTaskDueDate` hook
2. ✅ Create `useUpdateTaskEffort` hook (combined expected + actual)

### B1. TaskSidePanel Inline Controls (P1)
- Wire priority dropdown → `useUpdateOtaTaskPriority`
- Wire due_date picker → new `useUpdateOtaTaskDueDate`
- Wire "Thay đổi" assignee button → `useUpdateOtaTaskAssignee`

### B2. Effort Capture (P1)
- Add "Log effort" action trong OverviewTab
- Capture both `expected_effort_minutes` và `actual_effort_minutes`

### B3. Unassigned Warning (P1)
- TaskCard: Badge "⚠️ Chưa gán" khi `assignee_id = null`
- CreateTaskDialog: Soft warning text

### B4. Project Completion Indicator (P1)
- ProjectDetailPage: Banner khi all tasks DONE/CANCELLED

### B5. Cleanup (P2)
- Delete `MyTasksPageEnhanced.tsx`

---

## ✅ VERIFICATION SIGN-OFF

| Check | Result |
|-------|--------|
| UI fields verified | ✅ Complete |
| Hooks verified | ✅ Complete |
| Dead features identified | ✅ Complete |
| Implementation plan ready | ✅ Ready for PHASE B |

**Proceed to PHASE B: Implementation**

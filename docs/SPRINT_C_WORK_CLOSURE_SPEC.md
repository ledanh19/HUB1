# SPRINT C - WORK CLOSURE STANDARDIZATION

**Generated**: 2026-01-10  
**Author**: Principal Ops Architect  
**Module**: OTA Operations  
**Status**: ✅ IMPLEMENTED

---

## 📦 IMPLEMENTATION SUMMARY

| Deliverable | Status | Files |
|-------------|--------|-------|
| Risk Table | ✅ Done | This document |
| HANDOVER Task Template | ✅ Done | CreateTaskDialog.tsx |
| Project Completion Indicator | ✅ Done | ProjectCompletionStatus.tsx |
| Read-only UI Guard | ✅ Done | TaskSidePanel/* |
| Migration (classification) | ✅ Done | 20260110_031_sprint_c_task_classification.sql |
| Acceptance Checklist | ✅ Done | This document |

### Files Modified/Created:
```
NEW:
- supabase/migrations/20260110_031_sprint_c_task_classification.sql
- src/components/ota-operations/ProjectCompletionStatus.tsx

MODIFIED:
- src/hooks/useOtaOperations.ts (added OtaTaskClassification, updated useCreateOtaTask)
- src/components/ota-operations/CreateTaskDialog.tsx (HANDOVER mode)
- src/pages/ota-operations/ProjectDetailPage.tsx (wire completion indicator)
- src/components/ota-operations/TaskSidePanel/index.tsx (readOnly prop)
- src/components/ota-operations/TaskSidePanel/PanelHeader.tsx (readOnly prop)
- src/components/ota-operations/TaskSidePanel/tabs/OverviewTab.tsx (readOnly prop)
- src/components/ota-operations/TaskSidePanel/tabs/EvidenceTab.tsx (readOnly prop)
- src/components/ota-operations/TaskSidePanel/TodoSection.tsx (readOnly prop)
```

---

## 📋 PHASE 0 — VERIFICATION REPORT

### Câu hỏi Mandatory & Trả lời

| Câu hỏi | Trạng thái | Phát hiện |
|---------|-----------|-----------|
| Khi task DONE → ai chịu trách nhiệm cuối? | ⚠️ KHÔNG RÕ | `completed_at` + `updated_by` ghi log, nhưng **không có xác nhận của Lead** |
| Lead có biết task này "đã bàn giao hay chưa"? | ❌ KHÔNG | Không có field/indicator nào cho "đã bàn giao" |
| Project COMPLETED hiện tại có tiêu chí gì? | ⚠️ CHỦ QUAN | Lead click menu → "Hoàn thành" mà **không có checklist** |
| Có task nào DONE nhưng "không ai nhớ trạng thái cuối"? | ✅ CÓ | Task DONE có thể không có note cuối, không có handover note |

---

### 🔍 CURRENT STATE ANALYSIS

#### 1. Task Status Lifecycle (Hiện tại)
```
TODO → IN_PROGRESS → REVIEW → DONE
                          ↓
                   (requires 1 approved evidence)
```

**Guard hiện có:**
- `ota_task_done_guard.sql`: Task chỉ DONE khi có ≥1 approved evidence
- `completed_at`: Auto set khi status = DONE

**Thiếu:**
- Không có "handover note" bắt buộc
- Không có confirmation từ Lead/Reviewer
- Không có final checklist

#### 2. Project Status Lifecycle (Hiện tại)
```
PLANNING → IN_PROGRESS → COMPLETED/ARCHIVED
                ↓
        (manual click by Lead)
```

**Indicator hiện có:**
- [ProjectDetailPage.tsx#L363](src/pages/ota-operations/ProjectDetailPage.tsx#L363): Alert khi tất cả task đã DONE
- Button "Đánh dấu hoàn thành" hiện lên

**Thiếu:**
- Không check có HANDOVER task hay không
- Không có mandatory completion checklist
- Completed project vẫn cho edit (chỉ disable nút status)

#### 3. Classification Available
```sql
-- ota_task_classification enum
EXECUTION  -- Tác vụ thực thi
PREP       -- Chuẩn bị  
AUTO       -- Tự động hóa
OPS        -- Vận hành nội bộ
```

→ **Có thể dùng `OPS` classification cho HANDOVER task mà KHÔNG cần thêm enum/status mới!**

---

## ⚠️ BẢNG RỦI RO SAU KHI DONE

| Rủi ro | Mức độ | Tình huống thực tế | Hậu quả |
|--------|--------|-------------------|---------|
| **Task DONE không có note cuối** | 🔴 CAO | Staff hoàn thành nhưng không ghi "đã làm gì, kết quả ra sao" | 3 tháng sau không ai nhớ task này làm gì |
| **Project COMPLETED không có HANDOVER** | 🔴 CAO | Lead click "Hoàn thành" vội vàng | Không có tài liệu bàn giao, OTA mới không biết context |
| **HANDOVER task thiếu output format** | 🟡 TRUNG BÌNH | Có tạo task bàn giao nhưng content tùy tiện | Bàn giao thiếu thông tin quan trọng |
| **Completed project vẫn bị edit** | 🟡 TRUNG BÌNH | Ai đó upload evidence mới sau khi project closed | Data integrity bị phá, audit trail rối |
| **Không có người chịu trách nhiệm final** | 🔴 CAO | Task DONE nhưng không ai confirm "đã nhận bàn giao" | Blame game khi có issue |

---

## ✅ PHASE 1 — HANDOVER TASK STANDARD

### Nguyên tắc
> **BÀN GIAO = 1 TASK CUỐI, KHÔNG PHẢI 1 MODULE MỚI**

### Chuẩn Task HANDOVER

| Field | Giá trị | Bắt buộc |
|-------|---------|----------|
| `title` | "[HANDOVER] Bàn giao Project {name}" | ✅ |
| `classification` | `OPS` | ✅ |
| `description` | Template 4 dòng (xem bên dưới) | ✅ |
| `assignee_id` | Lead/Người bàn giao | ✅ |
| Evidence | Link/Screenshot/Log | ✅ (ít nhất 1) |

### Output Format Chuẩn (4 dòng)

```markdown
## TRẠNG THÁI HIỆN TẠI
[Mô tả ngắn gọn trạng thái cuối của project]

## ĐÃ HOÀN TẤT
- Item 1
- Item 2
- Item 3

## CHƯA HOÀN TẤT / CẦN THEO DÕI
- Item A (lý do)
- Item B (deadline theo dõi)

## NEXT ACTION / LƯU Ý
- Hành động tiếp theo cho người nhận bàn giao
- Lưu ý quan trọng
```

### Implementation (UI Only)

**File**: `src/components/ota-operations/CreateTaskDialog.tsx`

Thêm option "Tạo task HANDOVER" với:
- Pre-fill title: `[HANDOVER] Bàn giao Project {projectName}`
- Pre-fill classification: `OPS`
- Pre-fill description: Template 4 dòng
- Highlight: "Task bàn giao phải có ít nhất 1 evidence"

---

## ✅ PHASE 2 — PROJECT COMPLETION INDICATOR

### Logic Hiển thị

```typescript
// Tình huống 1: Chưa có HANDOVER task
const hasHandoverTask = tasks.some(t => 
  t.title.includes('[HANDOVER]') && t.classification === 'OPS'
);

if (allTasksDone && !hasHandoverTask) {
  // Show warning
  "⚠️ Tất cả task đã DONE nhưng chưa có task HANDOVER"
  "Tạo task [HANDOVER] trước khi đóng project"
}

// Tình huống 2: Có HANDOVER nhưng chưa DONE
const handoverTask = tasks.find(t => t.title.includes('[HANDOVER]'));
if (handoverTask && handoverTask.status !== 'DONE') {
  // Show info
  "ℹ️ Task HANDOVER chưa hoàn thành"
  "Hoàn thành task HANDOVER trước khi đóng project"
}

// Tình huống 3: HANDOVER đã DONE
if (handoverTask && handoverTask.status === 'DONE') {
  // Show success - Allow close
  "✅ Có task HANDOVER và đã DONE"
  "👉 Có thể đóng project này"
}
```

### UI Changes

**File**: `src/pages/ota-operations/ProjectDetailPage.tsx`

Cập nhật completion indicator (line ~363):

```tsx
{/* Enhanced Project Completion Indicator */}
{task_stats && task_stats.total > 0 && (
  <ProjectCompletionStatus 
    tasks={tasks}
    taskStats={task_stats}
    projectStatus={project.status}
    onMarkComplete={() => handleStatusChange('COMPLETED')}
  />
)}
```

---

## ✅ PHASE 3 — READ-ONLY WHEN COMPLETED (UI Guard)

### Quy tắc

Khi `project.status === 'COMPLETED'`:

| Action | Allowed | UI Behavior |
|--------|---------|-------------|
| View task | ✅ | Normal |
| View evidence | ✅ | Normal |
| View audit log | ✅ | Normal |
| Edit task content | ❌ | Disable form, show message |
| Upload new evidence | ❌ | Hide button, show message |
| Change task status | ❌ | Disable buttons |
| Add comment | ⚠️ Optional | Có thể cho phép |

### Implementation

**Approach**: Pass `isProjectCompleted` prop xuống các component

```tsx
// ProjectDetailPage.tsx
const isProjectCompleted = project.status === 'COMPLETED' || project.status === 'ARCHIVED';

// Pass to children
<TaskSidePanel 
  taskId={selectedTaskId} 
  readOnly={isProjectCompleted}
/>
```

**Components cần update:**
- `TaskSidePanel/index.tsx` - Nhận prop `readOnly`
- `EvidenceTab.tsx` - Ẩn upload button
- `OverviewTab.tsx` - Disable edit fields
- `CommentsTab.tsx` - Optional: vẫn cho comment hoặc không

---

## 🚫 NHỮNG THỨ CỐ TÌNH KHÔNG LÀM

| Item | Lý do |
|------|-------|
| Thêm status HANDOVER | Phức tạp, dùng task + classification đủ rồi |
| Thêm table handover | Overkill, task + evidence đủ |
| Auto-close project | Dễ lỗi, Lead phải chủ động |
| Thêm field "verified_by" | Quá phức tạp cho workflow hiện tại |
| Dashboard handover | Out of scope Sprint C |
| AI suggestion | Sprint D+ |

---

## 🧪 PHASE 4 — ACCEPTANCE CHECKLIST

### Case 1: Lead mở project có task HANDOVER
```
Given: Project có task [HANDOVER] đã DONE
When: Lead mở ProjectDetailPage
Then: 
  - ✅ Hiện "Có task HANDOVER và đã DONE"
  - ✅ Hiện nút "Đánh dấu hoàn thành"
```

### Case 2: Lead mở project CHƯA có HANDOVER
```
Given: Project có tất cả task DONE, không có [HANDOVER]
When: Lead mở ProjectDetailPage  
Then:
  - ⚠️ Hiện "Chưa có task HANDOVER"
  - ⚠️ Hiện nút "Tạo task HANDOVER"
  - ❌ KHÔNG hiện nút "Đánh dấu hoàn thành"
```

### Case 3: Lead tạo task HANDOVER
```
Given: Lead click "Tạo task HANDOVER"
When: Dialog mở
Then:
  - Title pre-fill: [HANDOVER] Bàn giao Project X
  - Classification pre-fill: OPS
  - Description có template 4 dòng
```

### Case 4: Project COMPLETED - Read-only
```
Given: Project status = COMPLETED
When: User mở TaskSidePanel bất kỳ
Then:
  - ❌ Không thể edit task content
  - ❌ Không thể upload evidence mới
  - ✅ Có thể xem history/audit
```

### Case 5: Lead hiểu ngay trạng thái
```
Given: Lead vào project
When: Nhìn header/indicator
Then:
  - Lead hiểu ngay "Project này đã bàn giao xong chưa?"
  - ❌ Không cần đọc log
  - ❌ Không cần hỏi nhân viên
```

---

## 📊 METRICS (ACTUAL)

| Metric | Value |
|--------|-------|
| Files modified | 9 |
| New components | 1 (ProjectCompletionStatus) |
| New migrations | 1 (classification support in RPC) |
| New tables | 0 |
| New RPCs | 0 (updated existing) |
| Breaking changes | 0 |
| TypeScript errors | 0 |

---

## 🎯 TƯ DUY CHỦ ĐẠO

> **Hệ thống tốt không phải là hệ thống làm được nhiều,**  
> **mà là hệ thống kết thúc công việc một cách có trách nhiệm.**

---

## 🚦 IMPLEMENTATION COMPLETED

- [x] PHASE 1: CreateTaskDialog - HANDOVER mode with template
- [x] PHASE 2: ProjectCompletionStatus component  
- [x] PHASE 2: ProjectDetailPage - Enhanced completion indicator
- [x] PHASE 3: TaskSidePanel - readOnly prop + banner
- [x] PHASE 3: Child components - Respect readOnly
- [x] PHASE 4: Acceptance checklist documented

---

## 🔧 DEPLOYMENT STEPS

1. **Run migration**:
   ```bash
   supabase db push
   # or apply: 20260110_031_sprint_c_task_classification.sql
   ```

2. **Deploy frontend** (changes are backward compatible)

3. **Test manually**:
   - Create project with tasks
   - Complete all tasks → See HANDOVER warning
   - Create HANDOVER task with template
   - Complete HANDOVER → See "Ready to close"
   - Mark project COMPLETED
   - Open any task → See read-only banner

---

**SPRINT C COMPLETE** ✅


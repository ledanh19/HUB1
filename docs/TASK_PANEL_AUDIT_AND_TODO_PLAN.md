# TASK PANEL AUDIT & TODO IMPLEMENTATION PLAN

**Generated**: 2026-01-10  
**Phase**: Principal Product Engineer Audit  
**Scope**: Task Panel (TaskSidePanel) trong OTA Operations  
**Status**: ✅ IMPLEMENTED

---

## 📊 IMPLEMENTATION SUMMARY

### What Was Done:

| Phase | Status | Description |
|-------|--------|-------------|
| PHASE 0 | ✅ | Inventory all Task Panel features |
| PHASE 1 | ✅ | Revert Sprint 3A (PendingReviewsPage) - already done |
| PHASE 2 | ✅ | Todo (Việc cần làm) feature - NEW |
| PHASE 3 | ✅ | Board optimization - pending evidence badge |
| PHASE 4 | ✅ | Wire existing fields (assignee, due date) |
| PHASE 5 | ✅ | Acceptance checklist |

### Files Created/Modified:

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260110_030_ota_task_todos.sql` | **NEW** | Todo table + RPCs |
| `src/components/ota-operations/TaskSidePanel/TodoSection.tsx` | **NEW** | Todo UI component |
| `src/hooks/useOtaOperations.ts` | **MODIFIED** | +160 lines (todo hooks) |
| `src/components/ota-operations/TaskSidePanel/index.tsx` | **MODIFIED** | Wire TodoSection, hide Nhãn |
| `src/components/ota-operations/TaskSidePanel/tabs/OverviewTab.tsx` | **MODIFIED** | Wire assignee dropdown, due date picker |
| `src/components/ota-operations/TaskCard.tsx` | **MODIFIED** | Add todo/pending badges |

## 📊 PHASE 0: INVENTORY - HIỆN TRẠNG TASK PANEL

### A. Quick Action Buttons (trong TaskSidePanel)

| Feature | UI Component | Hook/RPC | DB Table | Status | Action |
|---------|--------------|----------|----------|--------|--------|
| **Đính kèm** | `index.tsx` → `setActiveTab('evidence')` | N/A (switch tab) | — | ✅ **WORKING** | — |
| **Nhãn** | `index.tsx` → Button (no onClick) | **NONE** | **NONE** | 🔴 **UI_ONLY** | HIDE or BUILD |
| **Việc cần làm** | `index.tsx` → Button (no onClick) | **NONE** | **NONE** | 🔴 **UI_ONLY** | **BUILD** (Priority 1) |
| **Thành viên** | `index.tsx` → Button (no onClick) | `useUpdateOtaTaskAssignee` EXISTS | `ota_tasks.assignee_id` | ⚠️ **NOT WIRED** | WIRE |
| **Ảnh bìa** | `index.tsx` → `setActiveTab('evidence')` | N/A (use first image) | — | ✅ **WORKING** | — |
| **Mở rộng** | `index.tsx` → `window.open(taskDetailUrl)` | N/A | — | ✅ **WORKING** | — |

### B. OverviewTab Fields

| Feature | UI Component | Hook/RPC | DB Table | Status | Action |
|---------|--------------|----------|----------|--------|--------|
| **Mô tả** | `OverviewTab.tsx` → Display + "Chỉnh sửa" button | **Button stub** | `ota_tasks.description` | ⚠️ **PARTIAL** | Wire inline edit |
| **Người thực hiện** | `OverviewTab.tsx` → Display + "Thay đổi" button | `useUpdateOtaTaskAssignee` EXISTS | `ota_tasks.assignee_id` | ⚠️ **NOT WIRED** | WIRE |
| **Phân loại tác vụ** | `OverviewTab.tsx` → Badge + "Thay đổi" button | **Button stub** | `ota_tasks.classification` | ⚠️ **NOT WIRED** | WIRE |
| **Nhãn vấn đề** | `OverviewTab.tsx` → Badge (read-only) | **NONE** | `ota_tasks.issue_tag` | ⚠️ **READ ONLY** | Wire dropdown |
| **Thời gian** | `OverviewTab.tsx` → "Log effort" popover | `useUpdateTaskEffort` | `ota_tasks.expected/actual_effort` | ✅ **WORKING** | — |
| **Loại công việc** | `OverviewTab.tsx` → Badge + "+ Thêm nhãn" | **Button stub** | `ota_tasks.work_type` | ⚠️ **PARTIAL** | Wire edit |
| **Hạn hoàn thành** | `OverviewTab.tsx` → Display only | `useUpdateOtaTaskDueDate` EXISTS | `ota_tasks.due_date` | ⚠️ **NOT WIRED** | Wire date picker |
| **Dự án** | `OverviewTab.tsx` → Display only | N/A | `ota_projects` | ✅ **WORKING** | — |

### C. EvidenceTab (Kết quả)

| Feature | UI Component | Hook/RPC | DB Table | Status |
|---------|--------------|----------|----------|--------|
| Evidence List | `EvidenceTab.tsx` | `useTaskEvidence` → `ota_get_task_evidence` | `ota_task_evidence` | ✅ **WORKING** |
| Upload File | `EvidenceTab.tsx` | `useUploadEvidence` | Storage + `ota_task_evidence` | ✅ **WORKING** |
| Upload URL | `EvidenceTab.tsx` | `useUploadEvidence` | `ota_task_evidence` | ✅ **WORKING** |
| Review (Approve/Reject) | `EvidenceTab.tsx` | `useReviewEvidence` → `ota_review_evidence` | `ota_task_evidence` | ✅ **WORKING** |
| Delete | `EvidenceTab.tsx` | `useDeleteEvidence` | `ota_task_evidence` | ✅ **WORKING** |

### D. CommentsTab (Bình luận)

| Feature | Hook/RPC | DB Table | Status |
|---------|----------|----------|--------|
| List | `useTaskComments` → `ota_get_task_comments` | `ota_task_comments` | ✅ **WORKING** |
| Add | `useAddTaskComment` → `ota_add_task_comment` | `ota_task_comments` | ✅ **WORKING** |
| Edit | `useEditTaskComment` → `ota_edit_task_comment` | `ota_task_comments` | ✅ **WORKING** |
| Delete | `useDeleteTaskComment` → `ota_delete_task_comment` | `ota_task_comments` | ✅ **WORKING** |

### E. HistoryTab (Lịch sử)

| Feature | Hook/RPC | DB Table | Status |
|---------|----------|----------|--------|
| Timeline | `useTaskHistory` | `ota_audit_log` | ✅ **WORKING** |

### F. Status Workflow

| Feature | Hook/RPC | Guard | Status |
|---------|----------|-------|--------|
| BACKLOG → IN_PROGRESS | `useUpdateOtaTaskStatus` | — | ✅ **WORKING** |
| IN_PROGRESS → REVIEW | `useUpdateOtaTaskStatus` | — | ✅ **WORKING** |
| REVIEW → DONE | `useUpdateOtaTaskStatus` | DONE guard (EXECUTION cần approved evidence) | ✅ **WORKING** |

---

## 🧹 PHASE 1: REVERT/CLEAN PHẦN THỪA

### Đã thực hiện (Sprint 3A Revert):
| Item | Status | Notes |
|------|--------|-------|
| `/ota-operations/reviews` route | ✅ REMOVED | Review trong panel đủ rồi |
| Sidebar "Duyệt minh chứng" | ✅ REMOVED | Không cần page riêng |
| `usePendingReviews` hook | ✅ REMOVED | RPCs giữ lại cho EvidenceTab |
| `PendingReviewsPage.tsx` | ✅ STUB (marked delete) | Manual `git rm` sau |

### Cần xử lý thêm:

| Item | Decision | Reason |
|------|----------|--------|
| **Nhãn** button | 🔴 **HIDE** | Không có DB `ota_task_labels`, không xây cho phase này |
| **"+ Thêm nhãn"** in OverviewTab | 🔴 **HIDE** | Chưa có system, gây confusion |
| **TaskQuickViewDrawer** | ⚠️ **KEEP** nhưng kiểm tra | Có dùng assignee/priority mutation |

---

## ✅ PHASE 2: TODO (VIỆC CẦN LÀM) - CORE FEATURE

### 2.1 Data Model

**Cần tạo table mới (tối giản):**

```sql
-- Migration: 20260110_030_ota_task_todos.sql

CREATE TABLE IF NOT EXISTS public.ota_task_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES ota_tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE public.ota_task_todos ENABLE ROW LEVEL SECURITY;

-- Policy: Same as task access (through project membership)
CREATE POLICY "Todo inherits task access" ON public.ota_task_todos
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = ota_task_todos.task_id
    AND pm.user_id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_task_todos_task_id ON public.ota_task_todos(task_id);
CREATE INDEX idx_task_todos_sort ON public.ota_task_todos(task_id, sort_order);
```

### 2.2 RPCs (CRUD tối giản)

```sql
-- Get todos for task
CREATE OR REPLACE FUNCTION ota_get_task_todos(p_task_id UUID)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  content TEXT,
  is_done BOOLEAN,
  sort_order INTEGER,
  created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.task_id, t.content, t.is_done, t.sort_order, t.created_at
  FROM ota_task_todos t
  WHERE t.task_id = p_task_id
  ORDER BY t.sort_order, t.created_at;
END;
$$;

-- Add todo
CREATE OR REPLACE FUNCTION ota_add_task_todo(
  p_task_id UUID,
  p_content TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_max_sort INTEGER;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) INTO v_max_sort
  FROM ota_task_todos WHERE task_id = p_task_id;

  INSERT INTO ota_task_todos (task_id, content, sort_order, created_by)
  VALUES (p_task_id, p_content, v_max_sort + 1, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Toggle todo
CREATE OR REPLACE FUNCTION ota_toggle_task_todo(p_todo_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_done BOOLEAN;
BEGIN
  UPDATE ota_task_todos
  SET is_done = NOT is_done
  WHERE id = p_todo_id
  RETURNING is_done INTO v_is_done;

  RETURN v_is_done;
END;
$$;

-- Delete todo
CREATE OR REPLACE FUNCTION ota_delete_task_todo(p_todo_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM ota_task_todos WHERE id = p_todo_id;
END;
$$;

-- Update todo content
CREATE OR REPLACE FUNCTION ota_update_task_todo(
  p_todo_id UUID,
  p_content TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE ota_task_todos SET content = p_content WHERE id = p_todo_id;
END;
$$;
```

### 2.3 Hooks (trong useOtaOperations.ts)

```typescript
// useTaskTodos - Fetch todos
export function useTaskTodos(taskId: string | undefined) {
  return useQuery({
    queryKey: ['ota-task-todos', taskId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ota_get_task_todos', {
        p_task_id: taskId,
      });
      if (error) throw error;
      return data as TaskTodo[];
    },
    enabled: !!taskId,
  });
}

// useAddTaskTodo
export function useAddTaskTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, content }: { taskId: string; content: string }) => {
      const { data, error } = await supabase.rpc('ota_add_task_todo', {
        p_task_id: taskId,
        p_content: content,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', taskId] });
    },
  });
}

// useToggleTaskTodo
export function useToggleTaskTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ todoId, taskId }: { todoId: string; taskId: string }) => {
      const { data, error } = await supabase.rpc('ota_toggle_task_todo', {
        p_todo_id: todoId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', taskId] });
    },
  });
}

// useDeleteTaskTodo
export function useDeleteTaskTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ todoId, taskId }: { todoId: string; taskId: string }) => {
      const { error } = await supabase.rpc('ota_delete_task_todo', {
        p_todo_id: todoId,
      });
      if (error) throw error;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', taskId] });
    },
  });
}
```

### 2.4 UI Component: TodoSection

```tsx
// src/components/ota-operations/TaskSidePanel/TodoSection.tsx

import React, { useState } from 'react';
import { CheckSquare, Plus, X, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTaskTodos, useAddTaskTodo, useToggleTaskTodo, useDeleteTaskTodo } from '@/hooks/useOtaOperations';
import { toast } from 'sonner';

interface TodoSectionProps {
  taskId: string;
}

export function TodoSection({ taskId }: TodoSectionProps) {
  const [newTodo, setNewTodo] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const { data: todos = [], isLoading } = useTaskTodos(taskId);
  const addTodo = useAddTaskTodo();
  const toggleTodo = useToggleTaskTodo();
  const deleteTodo = useDeleteTaskTodo();
  
  const completedCount = todos.filter(t => t.is_done).length;
  const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0;
  
  const handleAdd = async () => {
    if (!newTodo.trim()) return;
    try {
      await addTodo.mutateAsync({ taskId, content: newTodo.trim() });
      setNewTodo('');
      setIsAdding(false);
    } catch (err) {
      toast.error('Lỗi thêm việc cần làm');
    }
  };
  
  const handleToggle = async (todoId: string) => {
    try {
      await toggleTodo.mutateAsync({ todoId, taskId });
    } catch (err) {
      toast.error('Lỗi cập nhật');
    }
  };
  
  const handleDelete = async (todoId: string) => {
    try {
      await deleteTodo.mutateAsync({ todoId, taskId });
    } catch (err) {
      toast.error('Lỗi xóa');
    }
  };
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Việc cần làm</h3>
          {todos.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {completedCount}/{todos.length}
            </span>
          )}
        </div>
      </div>
      
      {/* Progress */}
      {todos.length > 0 && (
        <Progress value={progress} className="h-2" />
      )}
      
      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-2 group p-1.5 rounded hover:bg-muted/50">
              <Checkbox
                checked={todo.is_done}
                onCheckedChange={() => handleToggle(todo.id)}
              />
              <span className={`flex-1 text-sm ${todo.is_done ? 'line-through text-muted-foreground' : ''}`}>
                {todo.content}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => handleDelete(todo.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {/* Add new */}
      {isAdding ? (
        <div className="flex gap-2">
          <Input
            placeholder="Nhập việc cần làm..."
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleAdd} disabled={addTodo.isPending}>
            {addTodo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Thêm'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
            Hủy
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Thêm việc cần làm
        </Button>
      )}
    </div>
  );
}
```

### 2.5 Wire vào TaskSidePanel

Trong `index.tsx`, thay button "Việc cần làm" bằng:
- Click → toggle hiển thị `TodoSection` inline
- HOẶC: Hiển thị `TodoSection` luôn trong OverviewTab

### 2.6 TaskCard Badge

```tsx
// Trong TaskCard.tsx - thêm badge hiển thị todo progress
{task.todo_count > 0 && (
  <Badge variant="outline" className="text-xs gap-1">
    <CheckSquare className="h-3 w-3" />
    {task.todo_done_count}/{task.todo_count}
  </Badge>
)}
```

---

## 🔗 PHASE 3: BOARD OPTIMIZATION (Evidence Pending Badge)

### Đã có:
- Evidence review trong EvidenceTab ✅
- `useReviewEvidence` hook ✅
- `ota_review_evidence` RPC ✅

### Cần thêm vào TaskCard:

```tsx
// Trong TaskCard.tsx - thêm badge "Chờ duyệt"
{task.pending_evidence_count > 0 && (
  <Badge variant="warning" className="text-xs gap-1 bg-amber-100 text-amber-700">
    <Clock className="h-3 w-3" />
    {task.pending_evidence_count} chờ duyệt
  </Badge>
)}
```

### Cập nhật query để fetch pending count:
- Thêm field `pending_evidence_count` vào `ota_get_tasks_v2` hoặc compute client-side

---

## 🔧 PHASE 4: WIRE EXISTING FIELDS

### 4.1 Priority Dropdown (trong PanelHeader)

**Hook exists:** `useUpdateOtaTaskPriority`

```tsx
// Wire vào PanelHeader.tsx
const updatePriority = useUpdateOtaTaskPriority();

<Select 
  value={task.priority} 
  onValueChange={(val) => updatePriority.mutate({ taskId: task.id, priority: val })}
>
  <SelectTrigger className="w-[120px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="low">Thấp</SelectItem>
    <SelectItem value="medium">Trung bình</SelectItem>
    <SelectItem value="high">Cao</SelectItem>
    <SelectItem value="urgent">Khẩn cấp</SelectItem>
  </SelectContent>
</Select>
```

### 4.2 Due Date Picker (trong OverviewTab)

**Hook exists:** `useUpdateOtaTaskDueDate`

```tsx
// Wire vào OverviewTab.tsx
const updateDueDate = useUpdateOtaTaskDueDate();

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">
      <Calendar className="h-4 w-4 mr-2" />
      {task.due_date ? formatDate(task.due_date) : 'Chọn ngày'}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Calendar
      mode="single"
      selected={task.due_date ? new Date(task.due_date) : undefined}
      onSelect={(date) => updateDueDate.mutate({ taskId: task.id, dueDate: date?.toISOString() })}
    />
  </PopoverContent>
</Popover>
```

### 4.3 Assignee Change (trong OverviewTab)

**Hook exists:** `useUpdateOtaTaskAssignee`

```tsx
// Wire button "Thay đổi" assignee
const updateAssignee = useUpdateOtaTaskAssignee();
const { data: members } = useOtaProjectMembers(task.project_id);

<Select 
  value={task.assignee_id || ''} 
  onValueChange={(val) => updateAssignee.mutate({ taskId: task.id, assigneeId: val || null })}
>
  <SelectTrigger>
    <SelectValue placeholder="Chọn người thực hiện" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">Chưa gán</SelectItem>
    {members?.map(m => (
      <SelectItem key={m.user_id} value={m.user_id}>
        {m.full_name || m.email}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 4.4 Issue Tag Dropdown (trong OverviewTab)

**DB field exists:** `ota_tasks.issue_tag`  
**Need:** Simple direct update

```tsx
// Wire dropdown for issue_tag
const { data: commonTags } = COMMON_ISSUE_TAGS; // from otaOps.ts

<Select 
  value={task.issue_tag || ''} 
  onValueChange={(val) => updateIssueTag({ taskId: task.id, issueTag: val || null })}
>
  <SelectTrigger>
    <SelectValue placeholder="Chọn nhãn vấn đề" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">Không có</SelectItem>
    {commonTags.map(tag => (
      <SelectItem key={tag.value} value={tag.value}>
        {tag.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 4.5 Hide/Disable Nhãn Button

```tsx
// Trong index.tsx - comment out hoặc disable
{/* 
<Button variant="outline" size="sm" className="h-8 gap-1.5" disabled title="Tính năng đang phát triển">
  <Tag className="h-3.5 w-3.5" />
  Nhãn
</Button>
*/}
```

---

## 🧪 PHASE 5: ACCEPTANCE CHECKLIST

### User Flow Tests

| Flow | Steps | Expected | Status |
|------|-------|----------|--------|
| **Nhân viên tạo todo** | Mở task → Click "Việc cần làm" → Thêm item | Item xuất hiện, có thể check | ⬜ |
| **Nhân viên check todo** | Click checkbox | Line-through, counter update | ⬜ |
| **Nhân viên upload evidence** | EvidenceTab → Upload file | Evidence appear với PENDING badge | ⬜ |
| **Lead approve evidence** | Click ✓ trên evidence | Status → APPROVED, toast | ⬜ |
| **Lead approve từ board** | Thấy badge "Chờ duyệt" → Click task → Approve | DONE unlock nếu EXECUTION | ⬜ |
| **Change priority** | Dropdown → chọn High | Lưu thành công, badge update | ⬜ |
| **Change due date** | Date picker → chọn ngày | Lưu thành công, hiển thị | ⬜ |
| **Change assignee** | Dropdown → chọn user | Lưu thành công, avatar update | ⬜ |
| **DONE guard test** | EXECUTION task không có approved evidence → DONE | Block với message | ⬜ |
| **DONE success** | EXECUTION task có approved evidence → DONE | Success | ⬜ |

### Non-functional Tests

| Test | Expected | Status |
|------|----------|--------|
| Dead button check | Không có button không làm gì | ⬜ |
| No extra page navigation | Mọi thứ trong panel/board | ⬜ |
| RLS check | User chỉ thấy task mình có quyền | ⬜ |
| Performance | Panel load < 1s | ⬜ |

---

## 📋 IMPLEMENTATION ORDER

### Phase A: Foundation (Immediate)
1. ✅ Sprint 3A revert (done)
2. Hide "Nhãn" button (UI only, no backend)
3. Hide "+ Thêm nhãn" in OverviewTab

### Phase B: Todo Feature (Priority 1)
1. Create migration `20260110_030_ota_task_todos.sql`
2. Add hooks to `useOtaOperations.ts`
3. Create `TodoSection.tsx` component
4. Wire "Việc cần làm" button
5. Add todo count badge to TaskCard

### Phase C: Wire Existing Fields (Priority 2)
1. Wire priority dropdown in PanelHeader
2. Wire due date picker in OverviewTab
3. Wire assignee change in OverviewTab
4. Wire issue tag dropdown

### Phase D: Board Enhancement (Priority 3)
1. Add pending evidence count to task query
2. Add "Chờ duyệt" badge to TaskCard

---

## 🔒 CONSTRAINTS CONFIRMED

| Constraint | Status |
|------------|--------|
| ❌ Không tạo page mới | ✅ All features in Panel/Board |
| ❌ Không đổi nghĩa DONE | ✅ DONE guard unchanged |
| ❌ Không tạo layer task mới | ✅ Todo = simple checklist, no status |
| ❌ Không build trùng | ✅ Reuse existing hooks |
| ⚠️ Verify UI trước khi build | ✅ Inventory completed |

---

## 📊 METRICS

| Metric | Value |
|--------|-------|
| New tables | 1 (`ota_task_todos`) |
| New RPCs | 5 (CRUD for todos) |
| New hooks | 4 (todo hooks) |
| New components | 1 (`TodoSection.tsx`) |
| Files to modify | 4 (TaskSidePanel/index.tsx, OverviewTab.tsx, PanelHeader.tsx, TaskCard.tsx) |
| Breaking changes | 0 |

---

**END OF AUDIT & PLAN**

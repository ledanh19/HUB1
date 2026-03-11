/**
 * TodoSection - Task checklist component (Việc cần làm)
 * 
 * BEHAVIOR:
 * - Simple checklist - check/uncheck items
 * - Add/edit/delete items
 * - Progress bar showing completion
 * - Does NOT affect task DONE status (just helper for team)
 */

import React, { useState, useRef, useEffect } from 'react';
import { CheckSquare, Plus, X, Loader2, GripVertical, Pencil } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  useTaskTodos, 
  useAddTaskTodo, 
  useToggleTaskTodo, 
  useDeleteTaskTodo,
  useUpdateTaskTodo 
} from '@/hooks/useOtaOperations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TodoSectionProps {
  taskId: string;
  className?: string;
  readOnly?: boolean; // Sprint C: disable editing for completed projects
}

interface TaskTodo {
  id: string;
  task_id: string;
  content: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
}

export function TodoSection({ taskId, className, readOnly = false }: TodoSectionProps) {
  const [newTodo, setNewTodo] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  
  const { data: todos = [], isLoading } = useTaskTodos(taskId);
  const addTodo = useAddTaskTodo();
  const toggleTodo = useToggleTaskTodo();
  const deleteTodo = useDeleteTaskTodo();
  const updateTodo = useUpdateTaskTodo();
  
  // Focus input when adding
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);
  
  // Focus edit input
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);
  
  const completedCount = todos.filter((t: TaskTodo) => t.is_done).length;
  const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0;
  
  const handleAdd = async () => {
    if (!newTodo.trim()) return;
    try {
      await addTodo.mutateAsync({ taskId, content: newTodo.trim() });
      setNewTodo('');
      // Keep input open for adding more
      if (inputRef.current) {
        inputRef.current.focus();
      }
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
  
  const handleStartEdit = (todo: TaskTodo) => {
    setEditingId(todo.id);
    setEditContent(todo.content);
  };
  
  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateTodo.mutateAsync({ 
        todoId: editingId, 
        taskId, 
        content: editContent.trim() 
      });
      setEditingId(null);
      setEditContent('');
    } catch (err) {
      toast.error('Lỗi cập nhật');
    }
  };
  
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Việc cần làm</h3>
          {todos.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {completedCount}/{todos.length}
            </span>
          )}
        </div>
        {!isAdding && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3 w-3" />
            Thêm
          </Button>
        )}
      </div>
      
      {/* Progress bar */}
      {todos.length > 0 && (
        <div className="space-y-1">
          <Progress 
            value={progress} 
            className={cn(
              "h-2 transition-all",
              progress === 100 && "bg-success/10 [&>div]:bg-success/100"
            )} 
          />
          {progress === 100 && (
            <p className="text-xs text-success font-medium">
              ✓ Hoàn thành tất cả!
            </p>
          )}
        </div>
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      
      {/* Todo list */}
      {!isLoading && (
        <div className="space-y-1">
          {todos.map((todo: TaskTodo) => (
            <div 
              key={todo.id} 
              className={cn(
                "flex items-center gap-2 group p-2 rounded-lg transition-colors",
                "hover:bg-muted/50",
                todo.is_done && "opacity-60"
              )}
            >
              {/* Drag handle (future: drag-drop reorder) */}
              <GripVertical className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 cursor-grab" />
              
              {/* Checkbox */}
              <Checkbox
                checked={todo.is_done}
                onCheckedChange={() => !readOnly && handleToggle(todo.id)}
                disabled={readOnly}
                className={cn(
                  "transition-colors",
                  todo.is_done && "data-[state=checked]:bg-success/100 data-[state=checked]:border-success"
                )}
              />
              
              {/* Content or Edit input */}
              {editingId === todo.id ? (
                <div className="flex-1 flex gap-2">
                  <Input
                    ref={editInputRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="h-7 text-sm flex-1"
                  />
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2"
                    onClick={handleSaveEdit}
                    disabled={updateTodo.isPending}
                  >
                    {updateTodo.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Lưu'
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2"
                    onClick={handleCancelEdit}
                  >
                    Hủy
                  </Button>
                </div>
              ) : (
                <>
                  <span 
                    className={cn(
                      "flex-1 text-sm cursor-pointer",
                      todo.is_done && "line-through text-muted-foreground"
                    )}
                    onClick={() => !readOnly && handleStartEdit(todo)}
                    title={readOnly ? "Chế độ chỉ xem" : "Click để sửa"}
                  >
                    {todo.content}
                  </span>
                  
                  {/* Actions - hidden in readOnly mode */}
                  {!readOnly && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => handleStartEdit(todo)}
                      title="Sửa"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(todo.id)}
                      disabled={deleteTodo.isPending}
                      title="Xóa"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Empty state */}
      {!isLoading && todos.length === 0 && !isAdding && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <p>Chưa có việc cần làm</p>
          <Button
            variant="link"
            size="sm"
            className="mt-1 h-auto p-0"
            onClick={() => setIsAdding(true)}
          >
            + Thêm việc đầu tiên
          </Button>
        </div>
      )}
      
      {/* Add new input */}
      {isAdding && (
        <div className="flex gap-2 items-center bg-muted/30 p-2 rounded-lg">
          <Checkbox disabled className="opacity-50" />
          <Input
            ref={inputRef}
            placeholder="Nhập việc cần làm..."
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTodo.trim()) handleAdd();
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewTodo('');
              }
            }}
            className="h-8 text-sm flex-1 bg-transparent border-0 focus-visible:ring-0 px-0"
          />
          <div className="flex gap-1">
            <Button 
              size="sm" 
              onClick={handleAdd} 
              disabled={!newTodo.trim() || addTodo.isPending}
              className="h-7 px-2"
            >
              {addTodo.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Thêm'
              )}
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => {
                setIsAdding(false);
                setNewTodo('');
              }}
              className="h-7 px-2"
            >
              Hủy
            </Button>
          </div>
        </div>
      )}
      
      {/* Helper text */}
      {todos.length > 0 && (
        <p className="text-xs text-muted-foreground">
          💡 Todo chỉ là checklist giúp không sót việc. Không ảnh hưởng trạng thái task.
        </p>
      )}
    </div>
  );
}

export default TodoSection;

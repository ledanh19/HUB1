/**
 * OTA Operations - Project Edit Dialog
 * 
 * Phase B: Edit project details (name, description, dates, status)
 * Only Lead/Admin can edit
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

import { useUpdateOtaProject, OtaProjectStatus } from '@/hooks/useOtaOperations';
import { toast } from "sonner";

// ============================================================
// TYPES
// ============================================================

interface ProjectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
    description: string | null;
    status: OtaProjectStatus;
    start_date: string | null;
    due_date: string | null;
  };
}

interface FormData {
  name: string;
  description: string;
  status: OtaProjectStatus;
  startDate: Date | undefined;
  dueDate: Date | undefined;
}

// ============================================================
// CONSTANTS
// ============================================================

const STATUS_OPTIONS: { value: OtaProjectStatus; label: string }[] = [
  { value: 'PLANNING', label: 'Lên kế hoạch' },
  { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
  { value: 'ON_HOLD', label: 'Tạm dừng' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'ARCHIVED', label: 'Lưu trữ' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ProjectEditDialog({ open, onOpenChange, project }: ProjectEditDialogProps) {
  const updateProject = useUpdateOtaProject();
  
  const form = useForm<FormData>({
    defaultValues: {
      name: project.name,
      description: project.description || '',
      status: project.status,
      startDate: project.start_date ? new Date(project.start_date) : undefined,
      dueDate: project.due_date ? new Date(project.due_date) : undefined,
    },
  });
  
  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = form;
  const startDate = watch('startDate');
  const dueDate = watch('dueDate');
  const status = watch('status');
  
  // ============================================================
  // HANDLERS
  // ============================================================
  
  const onSubmit = async (data: FormData) => {
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        name: data.name,
        description: data.description || undefined,
        status: data.status,
        startDate: data.startDate ? format(data.startDate, 'yyyy-MM-dd') : undefined,
        dueDate: data.dueDate ? format(data.dueDate, 'yyyy-MM-dd') : undefined,
      });
      
      toast.success("Đã cập nhật project", { description: "Thông tin project đã được lưu" });
      
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message || "Không thể cập nhật project" });
    }
  };
  
  // ============================================================
  // RENDER
  // ============================================================
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa Project</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin cho project "{project.name}"
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Tên project *</Label>
            <Input
              id="name"
              {...register('name', { required: 'Tên project là bắt buộc' })}
              placeholder="Nhập tên project"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Mô tả chi tiết về project..."
              rows={3}
            />
          </div>
          
          {/* Status */}
          <div className="space-y-2">
            <Label>Trạng thái</Label>
            <Select
              value={status}
              onValueChange={(value) => setValue('status', value as OtaProjectStatus, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Ngày bắt đầu</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Chọn ngày'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => setValue('startDate', date, { shouldDirty: true })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Due Date */}
            <div className="space-y-2">
              <Label>Deadline</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'dd/MM/yyyy') : 'Chọn ngày'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dueDate}
                    onSelect={(date) => setValue('dueDate', date, { shouldDirty: true })}
                    initialFocus
                    disabled={(date) => startDate ? date < startDate : false}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button 
              type="submit" 
              disabled={!isDirty || updateProject.isPending}
            >
              {updateProject.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

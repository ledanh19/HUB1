/**
 * QuickTaskDialog - Lightning-fast task creation (≤10 seconds)
 * 
 * Sprint 2 Feature:
 * - Minimal 5-field form (no project selection needed)
 * - Auto-creates/uses Daily Ops Bucket
 * - Applies classification rules from Sprint 1
 * 
 * Fields:
 * 1. Title (required)
 * 2. Assignee
 * 3. Due date
 * 4. Classification
 * 5. Issue tag (optional)
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Zap, Loader2, AlertCircle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
import { 
  CLASSIFICATION_OPTIONS, 
  COMMON_ISSUE_TAGS,
  OtaTaskClassification,
} from "@/lib/otaOps";

// ============================================================
// FORM SCHEMA
// ============================================================

const quickTaskSchema = z.object({
  title: z.string().min(3, "Tiêu đề phải có ít nhất 3 ký tự").max(200),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  classification: z.enum(["EXECUTION", "PREP", "AUTO", "OPS"]),
  issueTag: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

type QuickTaskFormValues = z.infer<typeof quickTaskSchema>;

// ============================================================
// COMPONENT
// ============================================================

interface QuickTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickTaskDialog({ open, onOpenChange }: QuickTaskDialogProps) {
  const queryClient = useQueryClient();
  
  // Fetch OTA staff for assignee dropdown
  const { data: otaStaff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['ota-staff-users'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Array<{id: string; email: string; name: string}>> => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_staff_list' as any));
      if (error) throw error;
      const result = data as unknown as { success: boolean; staff?: Array<{id: string; email: string; name: string}> };
      if (!result.success || !result.staff) return [];
      return result.staff;
    },
    enabled: open,
  });
  
  // Form setup - DEFAULT TO OPS (no evidence required for quick daily tasks)
  const form = useForm<QuickTaskFormValues>({
    resolver: zodResolver(quickTaskSchema),
    defaultValues: {
      title: "",
      assigneeId: "",
      dueDate: "",
      classification: "OPS", // Changed from EXECUTION - Quick Tasks typically don't need evidence
      issueTag: "",
      priority: "MEDIUM",
    },
  });
  
  const selectedClassification = form.watch("classification");
  
  // Create quick task mutation
  const createQuickTask = useMutation({
    mutationFn: async (values: QuickTaskFormValues) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_create_quick_task' as any, {
        p_title: values.title,
        p_assignee_id: values.assigneeId && values.assigneeId !== '_self' ? values.assigneeId : null,
        p_due_date: values.dueDate ? new Date(values.dueDate).toISOString() : null,
        p_classification: values.classification,
        p_issue_tag: values.issueTag && values.issueTag !== '_none' ? values.issueTag : null,
        p_priority: values.priority || 'MEDIUM',
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; task_id?: string; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.message || result.error || 'Failed to create quick task');
      }
      
      return result;
    },
    onSuccess: (result) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-projects'] });
      
      toast.success("⚡ Quick Task đã tạo!", {
        description: `Task đã được thêm vào Ops Bucket hôm nay`,
      });
      
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
  
  const onSubmit = (values: QuickTaskFormValues) => {
    createQuickTask.mutate(values);
  };
  
  // Get evidence requirement info based on classification
  const getEvidenceInfo = (classification: OtaTaskClassification) => {
    if (classification === 'EXECUTION') {
      return { 
        required: true, 
        message: 'Task EXECUTION cần ≥1 minh chứng được duyệt trước khi DONE.',
        warning: true,
      };
    }
    return { 
      required: false, 
      message: 'OPS/PREP/AUTO không bắt buộc minh chứng.',
      warning: false,
    };
  };
  
  const evidenceInfo = getEvidenceInfo(selectedClassification);
  
  // Default due date to tomorrow
  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            Quick Task
          </DialogTitle>
          <DialogDescription>
            Tạo task nhanh trong 10 giây • Tự động vào Ops Bucket hôm nay
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Title - Required */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tiêu đề *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="VD: Reply guest complaint #12345"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Classification + Evidence Info */}
            <FormField
              control={form.control}
              name="classification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Phân loại
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[250px]">
                        <p className="text-xs">
                          <strong>EXECUTION:</strong> Cần minh chứng<br/>
                          <strong>PREP/AUTO/OPS:</strong> Không cần minh chứng
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phân loại" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CLASSIFICATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    {evidenceInfo.required ? (
                      <span className="text-warning flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {evidenceInfo.message}
                      </span>
                    ) : (
                      <span className="text-success">✓ {evidenceInfo.message}</span>
                    )}
                  </FormDescription>
                </FormItem>
              )}
            />
            
            {/* Row: Assignee + Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gán cho</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn người" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_self">Tự gán cho mình</SelectItem>
                        {otaStaff.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name || staff.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            
            {/* Issue Tag - Optional */}
            <FormField
              control={form.control}
              name="issueTag"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Issue Tag (tùy chọn)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn tag" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none">Không có</SelectItem>
                      {COMMON_ISSUE_TAGS.map((tag) => (
                        <SelectItem key={tag.value} value={tag.value}>
                          <Badge variant="outline" className={tag.color}>
                            {tag.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            
            {/* Priority - Hidden but settable */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Độ ưu tiên</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="LOW">Thấp</SelectItem>
                      <SelectItem value="MEDIUM">Trung bình</SelectItem>
                      <SelectItem value="HIGH">Cao</SelectItem>
                      <SelectItem value="URGENT">Khẩn cấp</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={createQuickTask.isPending}
                className="gap-2"
              >
                {createQuickTask.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Tạo Quick Task
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

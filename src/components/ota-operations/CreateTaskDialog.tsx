import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, FileCheck } from "lucide-react";
import { useOtaProjects, useCreateOtaTask, OtaTaskClassification } from "@/hooks/useOtaOperations";
import { useQuery } from "@tanstack/react-query";
import { supabase, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";

// Sprint C: HANDOVER task description template
const HANDOVER_TEMPLATE = `## TRẠNG THÁI HIỆN TẠI
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
- Lưu ý quan trọng`;

const formSchema = z.object({
  title: z.string().min(3, "Tiêu đề task phải có ít nhất 3 ký tự").max(200),
  description: z.string().optional(),
  projectId: z.string().min(1, "Vui lòng chọn project"),
  assigneeId: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.string().optional(),
  classification: z.enum(["EXECUTION", "PREP", "AUTO", "OPS"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  mode?: 'normal' | 'handover'; // Sprint C: Support HANDOVER mode
  projectName?: string; // Sprint C: For HANDOVER title pre-fill
}

export function CreateTaskDialog({ 
  open, 
  onOpenChange, 
  defaultProjectId,
  mode = 'normal',
  projectName,
}: CreateTaskDialogProps) {
  const createTask = useCreateOtaTask();
  const { data: projects = [], isLoading: loadingProjects } = useOtaProjects();
  
  const isHandoverMode = mode === 'handover';
  
  // Fetch OTA staff for assignee dropdown using RPC
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
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: isHandoverMode && projectName ? `[HANDOVER] Bàn giao Project ${projectName}` : "",
      description: isHandoverMode ? HANDOVER_TEMPLATE : "",
      projectId: defaultProjectId || "",
      assigneeId: "",
      priority: "MEDIUM",
      dueDate: "",
      classification: isHandoverMode ? "OPS" : "EXECUTION",
    },
  });
  
  // Sprint C: Reset form when mode changes
  useEffect(() => {
    if (open) {
      form.reset({
        title: isHandoverMode && projectName ? `[HANDOVER] Bàn giao Project ${projectName}` : "",
        description: isHandoverMode ? HANDOVER_TEMPLATE : "",
        projectId: defaultProjectId || "",
        assigneeId: "",
        priority: "MEDIUM",
        dueDate: "",
        classification: isHandoverMode ? "OPS" : "EXECUTION",
      });
    }
  }, [open, isHandoverMode, projectName, defaultProjectId]);
  
  const onSubmit = async (values: FormValues) => {
    try {
      await createTask.mutateAsync({
        projectId: values.projectId,
        title: values.title,
        description: values.description,
        assigneeId: values.assigneeId || undefined,
        priority: values.priority,
        dueDate: values.dueDate || undefined,
        classification: (values.classification as OtaTaskClassification) || 'EXECUTION',
      });
      
      toast.success(
        isHandoverMode ? "Đã tạo task HANDOVER!" : "Đã tạo task thành công!",
        isHandoverMode ? { description: "Hãy upload evidence sau khi hoàn thành bàn giao." } : undefined
      );
      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };
  
  const priorityOptions = [
    { value: "LOW", label: "Thấp" },
    { value: "MEDIUM", label: "Trung bình" },
    { value: "HIGH", label: "Cao" },
    { value: "URGENT", label: "Khẩn cấp" },
  ];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isHandoverMode && <FileCheck className="h-5 w-5 text-success" />}
            {isHandoverMode ? "Tạo Task HANDOVER" : "Tạo Task Mới"}
          </DialogTitle>
          <DialogDescription>
            {isHandoverMode 
              ? "Task bàn giao project - Chuẩn hóa việc kết thúc công việc"
              : "Tạo task mới trong project OTA Operations"
            }
          </DialogDescription>
        </DialogHeader>
        
        {/* Sprint C: HANDOVER mode alert */}
        {isHandoverMode && (
          <Alert className="bg-success/10 border-success/20">
            <FileCheck className="h-4 w-4 text-success" />
            <AlertDescription className="text-success text-sm">
              Task HANDOVER cần có <strong>ít nhất 1 evidence</strong> (link, screenshot, log) 
              trước khi đánh dấu DONE.
            </AlertDescription>
          </Alert>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tiêu đề *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={isHandoverMode ? "[HANDOVER] Bàn giao Project..." : "VD: Cập nhật hình ảnh listing"} 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingProjects ? "Đang tải..." : "Chọn project"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects.map((proj) => (
                        <SelectItem key={proj.id} value={proj.id}>
                          {proj.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isHandoverMode ? "Nội dung bàn giao *" : "Mô tả"}
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={isHandoverMode 
                        ? "Điền theo template 4 mục..." 
                        : "Mô tả chi tiết về task..."
                      }
                      className="resize-none font-mono text-sm"
                      rows={isHandoverMode ? 12 : 3}
                      {...field} 
                    />
                  </FormControl>
                  {isHandoverMode && (
                    <FormDescription className="text-xs">
                      Template gồm: Trạng thái hiện tại, Đã hoàn tất, Chưa hoàn tất, Next action
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Người thực hiện</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} value={field.value || "_none"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingStaff ? "Đang tải..." : "Chọn người"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">Chưa gán</SelectItem>
                        {otaStaff.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Sprint 2: Soft warning for unassigned */}
                    {(!field.value || field.value === "_none") && (
                      <FormDescription className="text-warning flex items-center gap-1 text-xs">
                        <AlertCircle className="h-3 w-3" />
                        Nên gán để tránh task mồ côi
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Độ ưu tiên</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn độ ưu tiên" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priorityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deadline</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button 
                type="submit" 
                disabled={createTask.isPending}
                className={isHandoverMode ? "bg-success hover:bg-success" : ""}
              >
                {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHandoverMode ? "Tạo Task HANDOVER" : "Tạo Task"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

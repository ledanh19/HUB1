import { useState, useEffect, useMemo } from "react";
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
import { Loader2 } from "lucide-react";
import { useCreateOtaProject } from "@/hooks/useOtaOperations";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  OtaWorkType, 
  WORK_TYPE_CONFIG, 
  WORK_TYPE_OPTIONS 
} from "@/lib/otaOps";

// Dynamic schema based on work_type
const createFormSchema = (workType: OtaWorkType | null) => {
  const config = workType ? WORK_TYPE_CONFIG[workType] : null;
  
  return z.object({
    workType: z.enum([
      'ONBOARDING',
      'CONTENT_UPDATE', 
      'PROMOTION',
      'ISSUE_RESOLUTION',
      'OPTIMIZATION',
      'MAINTENANCE',
      'OTHER'
    ] as const, {
      required_error: "Vui lòng chọn loại công việc",
    }),
    name: z.string().min(3, "Tên project phải có ít nhất 3 ký tự").max(200),
    description: z.string().optional(),
    propertyId: config?.propertyMode === 'REQUIRED' 
      ? z.string().min(1, "Vui lòng chọn property")
      : z.string().optional(),
    startDate: z.string().optional(),
    dueDate: config?.deadlineRequired 
      ? z.string().min(1, "Vui lòng chọn deadline")
      : z.string().optional(),
  });
};

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const createProject = useCreateOtaProject();
  const [selectedWorkType, setSelectedWorkType] = useState<OtaWorkType | null>(null);
  
  // Get config for selected work type
  const workTypeConfig = selectedWorkType ? WORK_TYPE_CONFIG[selectedWorkType] : null;
  
  // Dynamic schema based on selected work type
  const formSchema = useMemo(() => createFormSchema(selectedWorkType), [selectedWorkType]);
  
  // Fetch properties for dropdown
  const { data: properties = [], isLoading: loadingProperties } = useQuery({
    queryKey: ['properties-for-project'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties_mirror')
        .select('id, property_name')
        .order('property_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      workType: undefined,
      name: "",
      description: "",
      propertyId: "",
      startDate: "",
      dueDate: "",
    },
  });
  
  // Watch work type changes
  const watchedWorkType = form.watch('workType');
  
  useEffect(() => {
    if (watchedWorkType && watchedWorkType !== selectedWorkType) {
      setSelectedWorkType(watchedWorkType);
      
      // Clear property if switching to DISABLED mode
      const newConfig = WORK_TYPE_CONFIG[watchedWorkType];
      if (newConfig.propertyMode === 'DISABLED') {
        form.setValue('propertyId', '');
      }
    }
  }, [watchedWorkType, selectedWorkType, form]);
  
  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedWorkType(null);
    }
  }, [open, form]);
  
  const onSubmit = async (values: FormValues) => {
    try {
      // Determine property_id based on propertyMode
      let propertyId: string | null = null;
      if (workTypeConfig?.propertyMode === 'DISABLED') {
        propertyId = null; // Explicitly null for MAINTENANCE, OTHER
      } else if (workTypeConfig?.propertyMode === 'REQUIRED') {
        propertyId = values.propertyId!; // Must be valid UUID (validated by zod)
      } else {
        // OPTIONAL: use value if provided, else null
        // Handle __none__ as null
        propertyId = (values.propertyId && values.propertyId !== '__none__') ? values.propertyId : null;
      }
      
      await createProject.mutateAsync({
        name: values.name,
        description: values.description,
        propertyId,
        workType: values.workType,
        startDate: values.startDate || undefined,
        dueDate: values.dueDate || undefined,
      });
      
      toast.success("Đã tạo project thành công!");
      form.reset();
      setSelectedWorkType(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };
  
  // Determine if property field should show
  const showPropertyField = workTypeConfig?.propertyMode !== 'DISABLED';
  const propertyRequired = workTypeConfig?.propertyMode === 'REQUIRED';
  const deadlineRequired = workTypeConfig?.deadlineRequired || false;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tạo Project Mới</DialogTitle>
          <DialogDescription>
            Tạo project OTA Operations mới để quản lý công việc
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Work Type - First field */}
            <FormField
              control={form.control}
              name="workType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại công việc *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn loại công việc" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {WORK_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center gap-2">
                            <span>{option.icon}</span>
                            <span>{option.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {workTypeConfig && (
                    <FormDescription className="text-xs text-muted-foreground">
                      {workTypeConfig.helperText}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Project Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên Project *</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: Tối ưu listing Booking.com Q1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Property - Conditional based on work type */}
            {showPropertyField && (
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Property {propertyRequired ? '*' : '(không bắt buộc)'}
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingProperties ? "Đang tải..." : "Chọn property"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!propertyRequired && (
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground">Không chọn</span>
                          </SelectItem>
                        )}
                        {properties.map((prop) => (
                          <SelectItem key={prop.id} value={prop.id}>
                            {prop.property_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mô tả</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Mô tả chi tiết về project..."
                      className="resize-none"
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngày bắt đầu</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Deadline {deadlineRequired ? '*' : ''}
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    {deadlineRequired && (
                      <FormDescription className="text-xs text-warning">
                        Bắt buộc cho loại công việc này
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Tạo Project
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ProjectInputsTab - Manage project input data
 * Features:
 * - JSONB data form for project inputs
 * - Optimistic locking conflict detection
 * - Auto-save or manual save
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Link as LinkIcon,
  Mail,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useProjectIO,
  useUpsertProjectInputs,
  ProjectInputData,
  ProjectInputRecord,
} from '@/hooks/useOtaOperations';
import { OtaWorkType, WORK_TYPE_CONFIG } from '@/lib/otaOps';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface ProjectInputsTabProps {
  projectId: string;
  workType: OtaWorkType;
}

const inputSchema = z.object({
  ota_account_email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  ota_extranet_login_url: z.string().url('URL không hợp lệ').optional().or(z.literal('')),
  listing_url: z.string().url('URL không hợp lệ').optional().or(z.literal('')),
  property_notes: z.string().optional(),
  priority_notes: z.string().optional(),
  attachments_links: z.array(z.string()).optional(),
});

type InputFormData = z.infer<typeof inputSchema>;

export function ProjectInputsTab({ projectId, workType }: ProjectInputsTabProps) {
  const { data: projectIO, isLoading, error, refetch } = useProjectIO(projectId);
  const upsertMutation = useUpsertProjectInputs();
  
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [newLink, setNewLink] = useState('');
  
  const config = WORK_TYPE_CONFIG[workType];
  const isOtaOptimization = workType === 'OPTIMIZATION';
  
  const form = useForm<InputFormData>({
    resolver: zodResolver(inputSchema),
    defaultValues: {
      ota_account_email: '',
      ota_extranet_login_url: '',
      listing_url: '',
      property_notes: '',
      priority_notes: '',
      attachments_links: [],
    },
  });
  
  // Load data into form when fetched
  useEffect(() => {
    if (projectIO?.inputs) {
      const data = projectIO.inputs.data as ProjectInputData;
      form.reset({
        ota_account_email: data.ota_account_email || '',
        ota_extranet_login_url: data.ota_extranet_login_url || '',
        listing_url: data.listing_url || '',
        property_notes: data.property_notes || '',
        priority_notes: data.priority_notes || '',
        attachments_links: data.attachments_links || [],
      });
      setExpectedUpdatedAt(projectIO.inputs.updated_at);
      setHasConflict(false);
    }
  }, [projectIO?.inputs, form]);
  
  const onSubmit = async (formData: InputFormData) => {
    try {
      const result = await upsertMutation.mutateAsync({
        projectId,
        data: formData as ProjectInputData,
        expectedUpdatedAt,
      });
      
      setExpectedUpdatedAt(result.updated_at || null);
      setHasConflict(false);
      toast.success('Đã lưu dữ liệu đầu vào');
    } catch (err: any) {
      if (err.message?.includes('CONFLICT_INPUTS_UPDATED')) {
        setHasConflict(true);
        toast.error('Dữ liệu đã được cập nhật bởi người khác');
      } else {
        toast.error(`Lỗi: ${err.message}`);
      }
    }
  };
  
  const handleReload = () => {
    refetch();
    setHasConflict(false);
    toast.info('Đã tải lại dữ liệu');
  };
  
  const handleAddLink = () => {
    if (!newLink.trim()) return;
    const current = form.getValues('attachments_links') || [];
    form.setValue('attachments_links', [...current, newLink.trim()]);
    setNewLink('');
  };
  
  const handleRemoveLink = (index: number) => {
    const current = form.getValues('attachments_links') || [];
    form.setValue('attachments_links', current.filter((_, i) => i !== index));
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Lỗi</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  
  const inputs = projectIO?.inputs;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Dữ liệu đầu vào</h3>
          <p className="text-sm text-muted-foreground">
            Thông tin cần thiết để thực hiện project
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inputs?.updated_at && (
            <span className="text-xs text-muted-foreground">
              Cập nhật: {format(new Date(inputs.updated_at), 'HH:mm dd/MM/yyyy', { locale: vi })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleReload}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Conflict Warning */}
      {hasConflict && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Xung đột dữ liệu</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Dữ liệu đã được cập nhật bởi người khác. Vui lòng tải lại.</span>
            <Button variant="outline" size="sm" onClick={handleReload}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {config.icon}
                Thông tin {config.label}
              </CardTitle>
              <CardDescription>{config.helperText}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* OTA-specific fields */}
              {isOtaOptimization && (
                <>
                  <FormField
                    control={form.control}
                    name="ota_account_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email tài khoản OTA
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="account@example.com" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Email đăng nhập extranet OTA (Booking.com, Agoda, etc.)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="ota_extranet_login_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          URL Extranet
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="url" 
                            placeholder="https://admin.booking.com/..." 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Link đăng nhập trang quản lý OTA
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="listing_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          URL Listing
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="url" 
                            placeholder="https://www.booking.com/hotel/..." 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Link công khai của property trên OTA
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              
              <Separator />
              
              {/* Common fields */}
              <FormField
                control={form.control}
                name="property_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Ghi chú về property
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Thông tin đặc biệt về property cần lưu ý..."
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="priority_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Ưu tiên / Yêu cầu đặc biệt
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Các yêu cầu ưu tiên, deadline, ràng buộc..."
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Attachments Links */}
              <div className="space-y-2">
                <FormLabel className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Links tài liệu đính kèm
                </FormLabel>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddLink}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(form.watch('attachments_links') || []).map((link, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      <a 
                        href={link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline max-w-[200px] truncate"
                      >
                        {link}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Submit */}
          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              disabled={upsertMutation.isPending || hasConflict}
            >
              {upsertMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Lưu dữ liệu đầu vào
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default ProjectInputsTab;

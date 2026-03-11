import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileText, Image, Video, Link as LinkIcon, MessageSquare } from "lucide-react";
import { useSubmitEvidence } from "@/hooks/useOtaOperations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EVIDENCE_TYPES = [
  { value: "SCREENSHOT", label: "Screenshot", icon: Image, needsFile: true },
  { value: "DOCUMENT", label: "Document (PDF, Word)", icon: FileText, needsFile: true },
  { value: "SPREADSHEET", label: "Spreadsheet (Excel, CSV)", icon: FileText, needsFile: true },
  { value: "IMAGE", label: "Image", icon: Image, needsFile: true },
  { value: "VIDEO", label: "Video", icon: Video, needsFile: true },
  { value: "LINK", label: "External Link", icon: LinkIcon, needsFile: true },
  { value: "NOTE", label: "Text Note", icon: MessageSquare, needsFile: false },
];

const formSchema = z.object({
  evidenceType: z.string().min(1, "Vui lòng chọn loại evidence"),
  description: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
}).refine((data) => {
  const typeConfig = EVIDENCE_TYPES.find(t => t.value === data.evidenceType);
  if (typeConfig?.needsFile && data.evidenceType !== 'LINK') {
    // For file types, we validate after upload
    return true;
  }
  if (data.evidenceType === 'LINK' && !data.fileUrl) {
    return false;
  }
  if (data.evidenceType === 'NOTE' && !data.description) {
    return false;
  }
  return true;
}, {
  message: "Vui lòng nhập URL cho Link hoặc mô tả cho Note",
  path: ["fileUrl"],
});

type FormValues = z.infer<typeof formSchema>;

interface EvidenceUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  onSuccess: () => void;
}

export function EvidenceUploadDialog({ 
  open, 
  onOpenChange, 
  taskId,
  onSuccess 
}: EvidenceUploadDialogProps) {
  const submitEvidence = useSubmitEvidence();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    name: string;
    size: number;
    mimeType: string;
  } | null>(null);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      evidenceType: "",
      description: "",
      fileUrl: "",
      fileName: "",
    },
  });
  
  const selectedType = form.watch("evidenceType");
  const typeConfig = EVIDENCE_TYPES.find(t => t.value === selectedType);
  const needsFileUpload = typeConfig?.needsFile && selectedType !== 'LINK';
  const isLink = selectedType === 'LINK';
  const isNote = selectedType === 'NOTE';
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File quá lớn. Tối đa 10MB.");
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${taskId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('ota-evidence')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        // If bucket doesn't exist, show helpful message
        if (error.message?.includes('Bucket not found')) {
          toast.error("Storage bucket 'ota-evidence' chưa được tạo. Vui lòng liên hệ admin.");
          return;
        }
        throw error;
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('ota-evidence')
        .getPublicUrl(fileName);
      
      setUploadedFile({
        url: urlData.publicUrl,
        name: file.name,
        size: file.size,
        mimeType: file.type,
      });
      
      form.setValue('fileUrl', urlData.publicUrl);
      form.setValue('fileName', file.name);
      
      toast.success("Upload file thành công!");
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Lỗi upload: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  const onSubmit = async (values: FormValues) => {
    try {
      // Validate based on type
      if (needsFileUpload && !uploadedFile) {
        toast.error("Vui lòng upload file trước khi submit");
        return;
      }
      
      if (isLink && !values.fileUrl) {
        toast.error("Vui lòng nhập URL");
        return;
      }
      
      if (isNote && !values.description) {
        toast.error("Vui lòng nhập nội dung note");
        return;
      }
      
      await submitEvidence.mutateAsync({
        taskId,
        evidenceType: values.evidenceType,
        fileUrl: needsFileUpload ? uploadedFile?.url : (isLink ? values.fileUrl : undefined),
        fileName: needsFileUpload ? uploadedFile?.name : (isLink ? values.fileUrl : undefined),
        fileSizeBytes: uploadedFile?.size,
        mimeType: uploadedFile?.mimeType,
        description: values.description,
      });
      
      toast.success("Đã submit evidence thành công!");
      form.reset();
      setUploadedFile(null);
      onSuccess();
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };
  
  const handleClose = () => {
    form.reset();
    setUploadedFile(null);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Thêm Evidence</DialogTitle>
          <DialogDescription>
            Upload minh chứng hoàn thành công việc
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="evidenceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại Evidence *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn loại evidence" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EVIDENCE_TYPES.map((type) => {
                        const Icon = type.icon;
                        return (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* File Upload for file types */}
            {needsFileUpload && (
              <div className="space-y-2">
                <FormLabel>Upload File *</FormLabel>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {uploadedFile ? (
                    <div className="space-y-2">
                      <FileText className="h-8 w-8 mx-auto text-success" />
                      <p className="text-sm font-medium">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024).toFixed(1)} KB
                      </p>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => setUploadedFile(null)}
                      >
                        Chọn file khác
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {isUploading ? (
                        <>
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Đang upload...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Kéo thả file hoặc click để chọn
                          </p>
                          <p className="text-xs text-muted-foreground">Tối đa 10MB</p>
                          <Input
                            type="file"
                            className="mt-2"
                            onChange={handleFileUpload}
                            accept={
                              selectedType === 'IMAGE' || selectedType === 'SCREENSHOT' 
                                ? 'image/*' 
                                : selectedType === 'VIDEO' 
                                  ? 'video/*'
                                  : selectedType === 'SPREADSHEET'
                                    ? '.xlsx,.xls,.csv'
                                    : selectedType === 'DOCUMENT'
                                      ? '.pdf,.doc,.docx'
                                      : '*'
                            }
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* URL input for Link type */}
            {isLink && (
              <FormField
                control={form.control}
                name="fileUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL *</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormDescription>
                      Link đến tài liệu hoặc trang web minh chứng
                    </FormDescription>
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
                  <FormLabel>{isNote ? 'Nội dung Note *' : 'Mô tả'}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={isNote ? "Nhập nội dung ghi chú..." : "Mô tả về evidence này..."}
                      className="resize-none"
                      rows={isNote ? 5 : 3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Hủy
              </Button>
              <Button 
                type="submit" 
                disabled={submitEvidence.isPending || isUploading}
              >
                {submitEvidence.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Evidence
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Image, Loader2, X, Eye, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReceiptUploadProps {
  value?: string | null;
  status?: string | null;
  onChange: (imagePath: string | null) => void;
  onStatusChange?: (status: string) => void;
  disabled?: boolean;
  bucketName?: string;
  folderPath?: string;
}

export type ReceiptStatus = "PENDING" | "UPLOADED" | "VERIFIED";

export const receiptStatusConfig: Record<ReceiptStatus, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" | "pending" | "approved" }> = {
  PENDING: { label: "Chưa có", icon: Clock, variant: "pending" },
  UPLOADED: { label: "Đã tải", icon: Image, variant: "secondary" },
  VERIFIED: { label: "Đã xác minh", icon: CheckCircle2, variant: "approved" },
};

export function ReceiptUpload({
  value,
  status = "PENDING",
  onChange,
  onStatusChange,
  disabled = false,
  bucketName = "payment-receipts",
  folderPath = "receipts",
}: ReceiptUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File không được vượt quá 5MB");
      return;
    }

    setIsUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${folderPath}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      onChange(data.path);
      onStatusChange?.("UPLOADED");
      toast.success("Đã tải ảnh chứng từ thành công");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Lỗi tải ảnh: " + error.message);
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      const { error } = await supabase.storage
        .from(bucketName)
        .remove([value]);

      if (error) throw error;

      onChange(null);
      onStatusChange?.("PENDING");
      toast.success("Đã xóa ảnh chứng từ");
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Lỗi xóa ảnh: " + error.message);
    }
  };

  const handlePreview = async () => {
    if (!value) return;

    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(value, 3600);

      if (error) throw error;

      setPreviewUrl(data.signedUrl);
      setIsPreviewOpen(true);
    } catch (error: any) {
      console.error("Preview error:", error);
      toast.error("Lỗi xem ảnh: " + error.message);
    }
  };

  const currentStatus = (status as ReceiptStatus) || "PENDING";
  const statusInfo = receiptStatusConfig[currentStatus] || receiptStatusConfig.PENDING;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {value ? (
        <div className="flex items-center gap-2">
          <Badge variant={statusInfo.variant} className="gap-1">
            <StatusIcon className="h-3 w-3" />
            {statusInfo.label}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={disabled}
          >
            <Eye className="h-4 w-4 mr-1" />
            Xem
          </Button>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            Chưa có chứng từ
          </Badge>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Tải ảnh
            </Button>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ảnh chứng từ</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Receipt"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Badge component for displaying receipt status (read-only)
export function ReceiptStatusBadge({ 
  status, 
  hasImage 
}: { 
  status?: string | null; 
  hasImage?: boolean;
}) {
  const currentStatus = (status as ReceiptStatus) || (hasImage ? "UPLOADED" : "PENDING");
  const statusInfo = receiptStatusConfig[currentStatus] || receiptStatusConfig.PENDING;
  const StatusIcon = statusInfo.icon;

  return (
    <Badge variant={statusInfo.variant} className="gap-1 text-xs">
      <StatusIcon className="h-3 w-3" />
      {statusInfo.label}
    </Badge>
  );
}

// Compact clickable thumbnail for table cells - opens full image directly
export function ReceiptThumbnailButton({
  imagePath,
  bucketName = "payment-receipts",
}: {
  imagePath: string;
  bucketName?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isFullViewOpen, setIsFullViewOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(imagePath, 3600);
      if (data) setImageUrl(data.signedUrl);
    };
    load();
  }, [imagePath, bucketName]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 h-7 px-2"
        onClick={(e) => {
          e.stopPropagation();
          setIsFullViewOpen(true);
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="Chứng từ" className="h-5 w-5 rounded object-cover" />
        ) : (
          <Image className="h-4 w-4 text-primary" />
        )}
        <span className="text-xs text-primary">Xem</span>
      </Button>

      <Dialog open={isFullViewOpen} onOpenChange={setIsFullViewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ảnh chứng từ</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Receipt"
                className="max-h-[75vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Component to preview receipt image in detail dialogs
export function ReceiptImagePreview({ 
  imagePath, 
  status,
  bucketName = "payment-receipts"
}: { 
  imagePath: string; 
  status?: string | null;
  bucketName?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullViewOpen, setIsFullViewOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadImage = async () => {
      setLoadError(null);
      // Phase 2 debug: log input params
      console.log('[ReceiptImagePreview] Loading image:', { imagePath, bucketName });
      
      try {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(imagePath, 3600);

        if (error) {
          // Phase 2 debug: log signed URL error
          console.error('[ReceiptImagePreview] createSignedUrl error:', error.message, { imagePath, bucketName });
          setLoadError(error.message);
          throw error;
        }
        console.log('[ReceiptImagePreview] Signed URL generated successfully');
        setImageUrl(data.signedUrl);
      } catch (error: any) {
        console.error("Error loading receipt image:", error);
        setLoadError(error?.message || 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [imagePath, bucketName]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ReceiptStatusBadge status={status} hasImage={true} />
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-32 bg-muted rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : imageUrl ? (
        <div className="relative group">
          <img 
            src={imageUrl} 
            alt="Receipt" 
            className="max-h-48 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setIsFullViewOpen(true)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsFullViewOpen(true)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Xem lớn
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground italic">Không thể tải ảnh chứng từ</p>
          {loadError && (
            <p className="text-xs text-destructive/70">[Debug] {loadError}</p>
          )}
        </div>
      )}

      {/* Full View Dialog */}
      <Dialog open={isFullViewOpen} onOpenChange={setIsFullViewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ảnh chứng từ</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Receipt"
                className="max-h-[75vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

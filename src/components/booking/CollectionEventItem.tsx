import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Banknote, Eye, Upload, Loader2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptStatusBadge } from "@/components/ui/receipt-upload";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { getPaymentMethodLabel, getProviderLabel } from "@/constants/paymentMethods";
import { useUpdateCollectionReceipt } from "@/hooks/useCollections";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Using a more generic type to avoid conflict between useBookings.HotelCollect and useCollections.HotelCollect
interface CollectionItem {
  id: string;
  amount_collected: number | null;
  collected_at: string | null;
  payment_method: string | null;
  payee_type: string | null;
  note: string | null;
  receipt_image?: string | null;
  receipt_status?: string | null;
  collection_type?: string;
  voided_at?: string | null;
}

interface CollectionEventItemProps {
  collect: CollectionItem;
  isVoided: boolean;
  isRefund: boolean;
  hasReceipt: boolean;
  receiptStatus: string | null;
  formatCurrency: (amount: number | null) => string;
  formatDateTime: (dateStr: string | null) => string;
}

export function CollectionEventItem({
  collect,
  isVoided,
  isRefund,
  hasReceipt,
  receiptStatus,
  formatCurrency,
  formatDateTime,
}: CollectionEventItemProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateReceiptMutation = useUpdateCollectionReceipt();

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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
      const fileName = `receipts/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from("payment-receipts")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      // Update collection with receipt image
      await updateReceiptMutation.mutateAsync({
        id: collect.id,
        receipt_image: data.path,
        receipt_status: "UPLOADED",
      });

      toast.success("Đã bổ sung ảnh chứng từ");
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

  const handlePreview = async () => {
    const imagePath = (collect as any).receipt_image;
    if (!imagePath) return;

    try {
      const { data, error } = await supabase.storage
        .from("payment-receipts")
        .createSignedUrl(imagePath, 3600);

      if (error) throw error;

      setPreviewUrl(data.signedUrl);
      setPreviewOpen(true);
    } catch (error: any) {
      console.error("Preview error:", error);
      toast.error("Lỗi xem ảnh: " + error.message);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      <div className={`flex items-start gap-3 p-3 rounded-lg ${isVoided ? "bg-muted/30 opacity-60" : isRefund ? "bg-warning/100/10" : "bg-success/100/10"}`}>
        <PaymentMethodIcon code={collect.payment_method || 'CASH'} className={`h-4 w-4 mt-0.5 ${isVoided ? "text-muted-foreground" : isRefund ? "text-warning" : "text-success"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${isVoided ? "text-muted-foreground line-through" : isRefund ? "text-warning" : "text-success"}`}>
              {isRefund ? "Hoàn tiền" : isVoided ? "Thu tiền (đã hủy)" : "Thu tiền"} - {formatCurrency(collect.amount_collected)}
            </p>
            <StatusBadge variant={isVoided ? "default" : isRefund ? "warning" : "success"} size="sm">
              {collect.payee_type}
            </StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateTime(collect.collected_at)} • {getPaymentMethodLabel(collect.payment_method || '')}
            {collect.payment_method === 'PAYMENT_LINK' && (collect as any).payment_provider && (
              <> ({getProviderLabel((collect as any).payment_provider)})</>
            )}
            {collect.note && ` • ${collect.note}`}
          </p>
          {collect.payment_method === 'PAYMENT_LINK' && (collect as any).payment_link_url && (
            <a
              href={(collect as any).payment_link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-primary hover:underline"
              title={(collect as any).payment_link_url}
            >
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[200px]">{(collect as any).payment_link_url.replace(/^https?:\/\//, '')}</span>
            </a>
          )}

          {/* Receipt status and actions */}
          {!isVoided && !isRefund && (
            <div className="flex items-center gap-2 mt-2">
              <ReceiptStatusBadge status={receiptStatus} hasImage={hasReceipt} />
              {hasReceipt ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handlePreview}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Xem ảnh
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleUploadClick}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  Bổ sung chứng từ
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
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
    </>
  );
}
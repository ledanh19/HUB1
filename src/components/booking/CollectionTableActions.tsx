import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoreHorizontal, RotateCcw, XCircle, Upload, Eye, Loader2 } from "lucide-react";
import { RefundDialog } from "@/components/collection/RefundDialog";
import { VoidDialog } from "@/components/collection/VoidDialog";
import { ReceiptStatusBadge } from "@/components/ui/receipt-upload";
import {
  useCanRefund,
  useCanVoid,
  useCollectionWithRelated,
  canRefundCollection,
  canVoidCollection,
  useUpdateCollectionReceipt,
  HotelCollect,
} from "@/hooks/useCollections";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CollectionTableActionsProps {
  collection: HotelCollect;
  onActionComplete?: () => void;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function CollectionTableActions({ collection, onActionComplete }: CollectionTableActionsProps) {
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: canRefund } = useCanRefund();
  const { data: canVoid } = useCanVoid();
  const { data: collectionWithRelated } = useCollectionWithRelated(collection.id);
  const updateReceiptMutation = useUpdateCollectionReceipt();

  const relatedCollections = collectionWithRelated?.relatedCollections || [];
  
  const refundCheck = canRefundCollection(collection, relatedCollections);
  const voidCheck = canVoidCollection(collection, relatedCollections);

  // Check receipt status
  const hasReceipt = !!(collection as any).receipt_image;
  const receiptStatus = (collection as any).receipt_status;

  // Skip rendering for non-COLLECT types
  if (collection.collection_type !== "COLLECT") {
    return null;
  }

  // Check if voided
  const isVoided = relatedCollections.some(c => c.collection_type === "VOID");
  if (isVoided) {
    return null;
  }

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
        id: collection.id,
        receipt_image: data.path,
        receipt_status: "UPLOADED",
      });

      toast.success("Đã bổ sung ảnh chứng từ");
      onActionComplete?.();
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
    const imagePath = (collection as any).receipt_image;
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

      <div className="flex items-center justify-center gap-1">
        {/* Receipt status badge */}
        <ReceiptStatusBadge status={receiptStatus} hasImage={hasReceipt} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUploading}>
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Receipt actions */}
            {hasReceipt ? (
              <DropdownMenuItem onClick={handlePreview}>
                <Eye className="mr-2 h-4 w-4" />
                Xem chứng từ
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleUploadClick}>
                <Upload className="mr-2 h-4 w-4" />
                Bổ sung chứng từ
              </DropdownMenuItem>
            )}

            {/* Separator if there are more actions */}
            {(refundCheck.canRefund || voidCheck.canVoid) && <DropdownMenuSeparator />}

            {/* Refund action */}
            {canRefund && refundCheck.canRefund && (
              <DropdownMenuItem onClick={() => setRefundDialogOpen(true)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Hoàn tiền
                <span className="ml-auto text-xs text-muted-foreground">
                  Tối đa: {formatCurrency(refundCheck.maxRefundAmount)}
                </span>
              </DropdownMenuItem>
            )}

            {/* Void action */}
            {canVoid && voidCheck.canVoid && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem onClick={() => setVoidDialogOpen(true)}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Hủy thu
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Chỉ dùng khi tiền chưa thực thu</p>
                </TooltipContent>
              </Tooltip>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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

      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        collection={collection}
        maxRefundAmount={refundCheck.maxRefundAmount}
        onSuccess={onActionComplete}
      />

      <VoidDialog
        open={voidDialogOpen}
        onOpenChange={setVoidDialogOpen}
        collection={collection}
        onSuccess={onActionComplete}
      />
    </>
  );
}
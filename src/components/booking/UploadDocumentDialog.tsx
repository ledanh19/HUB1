import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GuestDocumentUpload } from "./GuestDocumentUpload";
import { useGuestDocuments, useSendDocumentsToHost } from "@/hooks/useGuestDocuments";
import { StatusBadge } from "@/components/ui/status-badge";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { Send, FileImage, Trash2, Loader2, Eye, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  guestName?: string;
  nationality?: string;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  guestName,
  nationality,
}: UploadDocumentDialogProps) {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(false);

  const { data: documents = [], refetch } = useGuestDocuments(unifiedBookingId);
  const sendToHostMutation = useSendDocumentsToHost();

  const hasUnsent = documents.some(d => d.document_image && d.sent_to_host_status === "NOT_SENT");
  const allSent = documents.length > 0 && documents.every(d => d.sent_to_host_status === "SENT");

  // Generate signed URLs for all documents (60 min expiry)
  const generateSignedUrls = useCallback(async () => {
    const paths = documents
      .filter(d => d.document_image)
      .map(d => d.document_image!);
    
    if (paths.length === 0) return;
    
    setLoadingUrls(true);
    const urls: Record<string, string> = {};
    
    for (const path of paths) {
      const { data, error } = await supabase.storage
        .from("guest-documents")
        .createSignedUrl(path, 3600); // 60 minutes
      
      if (data && !error) {
        urls[path] = data.signedUrl;
      }
    }
    
    setSignedUrls(urls);
    setLoadingUrls(false);
  }, [documents]);

  useEffect(() => {
    if (open && documents.length > 0) {
      generateSignedUrls();
    }
  }, [open, documents, generateSignedUrls]);

  const handleUploadComplete = () => {
    refetch();
    setShowUpload(false);
    queryClient.invalidateQueries({ queryKey: ["batch_document_status"] });
    queryClient.invalidateQueries({ queryKey: ["document_status", unifiedBookingId] });
  };

  const handleSendToHost = () => {
    sendToHostMutation.mutate(unifiedBookingId, {
      onSuccess: () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["batch_document_status"] });
        queryClient.invalidateQueries({ queryKey: ["document_status", unifiedBookingId] });
      },
    });
  };

  const handleDelete = async (docId: string, imagePath: string | null) => {
    try {
      // Delete from storage if image exists
      if (imagePath) {
        await supabase.storage.from("guest-documents").remove([imagePath]);
      }
      // Delete from database
      const { error } = await safeMutation(() => supabase.from("guest_documents").delete().eq("id", docId));
      if (error) throw error;
      
      toast.success("Đã xoá giấy tờ");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["batch_document_status"] });
    } catch (err: any) {
      toast.error("Lỗi xoá: " + err.message);
    }
  };

  const getImageUrl = (path: string) => {
    return signedUrls[path] || "";
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Giấy tờ lưu trú</DialogTitle>
            <DialogDescription>
              Quản lý ảnh CCCD / Passport của khách
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Document List */}
            {documents.length > 0 && (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-4 p-3 rounded-lg border bg-card"
                  >
                    {/* Thumbnail */}
                    {doc.document_image ? (
                      <div 
                        className="w-20 h-20 rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                        onClick={() => setViewingImage(getImageUrl(doc.document_image!))}
                      >
                        <img
                          src={getImageUrl(doc.document_image)}
                          alt="Document"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <FileImage className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge
                          variant={doc.document_type === "CCCD" ? "default" : "info"}
                          size="sm"
                        >
                          {doc.document_type}
                        </StatusBadge>
                        <StatusBadge
                          variant={doc.sent_to_host_status === "SENT" ? "success" : "warning"}
                          size="sm"
                        >
                          {doc.sent_to_host_status === "SENT" ? "Đã gửi Host" : "Chưa gửi Host"}
                        </StatusBadge>
                      </div>
                      {doc.document_number && (
                        <p className="text-sm font-medium">{doc.document_number}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Tải lên: {formatDateTime(doc.uploaded_at)}
                      </p>
                      {doc.sent_to_host_at && (
                        <p className="text-xs text-muted-foreground">
                          Gửi Host: {formatDateTime(doc.sent_to_host_at)}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      {doc.document_image && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingImage(getImageUrl(doc.document_image!))}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                          >
                            <a
                              href={getImageUrl(doc.document_image)}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Xoá giấy tờ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Hành động này không thể hoàn tác.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Huỷ</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(doc.id, doc.document_image)}>
                              Xoá
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {documents.length === 0 && !showUpload && (
              <div className="text-center py-8 text-muted-foreground">
                <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Chưa có giấy tờ</p>
                <p className="text-sm">Tải ảnh CCCD hoặc Passport của khách</p>
              </div>
            )}

            {/* Upload Form */}
            {showUpload ? (
              <div className="p-4 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-medium mb-3">Tải ảnh giấy tờ mới</h4>
                <GuestDocumentUpload
                  unifiedBookingId={unifiedBookingId}
                  guestName={guestName}
                  nationality={nationality}
                  onUploadComplete={handleUploadComplete}
                  onCancel={() => setShowUpload(false)}
                />
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowUpload(true)}
              >
                + Thêm ảnh giấy tờ
              </Button>
            )}

            {/* Send to Host */}
            {hasUnsent && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/30">
                <div>
                  <p className="text-sm font-medium text-warning">Có ảnh chưa gửi cho Host</p>
                  <p className="text-xs text-muted-foreground">
                    Nhấn gửi để chuyển ảnh cho Host lưu trữ
                  </p>
                </div>
                <Button
                  onClick={handleSendToHost}
                  disabled={sendToHostMutation.isPending}
                >
                  {sendToHostMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Send className="mr-2 h-4 w-4" />
                  Gửi cho Host
                </Button>
              </div>
            )}

            {allSent && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/100/10 border border-success/30">
                <StatusBadge variant="success" size="sm">✓ Đã gửi Host</StatusBadge>
                <span className="text-sm text-muted-foreground">
                  Tất cả ảnh đã được gửi cho Host
                </span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Viewer */}
      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {viewingImage && (
            <img
              src={viewingImage}
              alt="Document"
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

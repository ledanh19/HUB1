import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface GuestDocumentUploadProps {
  unifiedBookingId: string;
  guestName?: string;
  nationality?: string;
  onUploadComplete: () => void;
  onCancel?: () => void;
  required?: boolean;
  // DEBUG ONLY: disable Radix Select to isolate Maximum update depth issue
  debugDisableSelect?: boolean;
}

const documentTypes = [
  { value: "CCCD", label: "Căn cước công dân (CCCD)" },
  { value: "PASSPORT", label: "Hộ chiếu (Passport)" },
];

export function GuestDocumentUpload({
  unifiedBookingId,
  guestName,
  nationality,
  onUploadComplete,
  onCancel,
  required = false,
  debugDisableSelect = false,
}: GuestDocumentUploadProps) {
  const { user } = useAuth();
  const [documentType, setDocumentType] = useState<"CCCD" | "PASSPORT">("CCCD");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Chỉ chấp nhận file ảnh");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File không được lớn hơn 10MB");
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
    } catch (err) {
      toast.error("Không thể truy cập camera. Vui lòng cho phép quyền truy cập.");
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `document-${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            setSelectedFile(file);
            setPreview(canvas.toDataURL("image/jpeg"));
            stopCamera();
          }
        },
        "image/jpeg",
        0.9
      );
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Vui lòng chọn ảnh giấy tờ");
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const fileName = `${unifiedBookingId}/${documentType}-${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("guest-documents")
        .upload(fileName, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Save to database
      const { error: dbError } = await safeMutation(() => supabase.from("guest_documents").insert({
        unified_booking_id: unifiedBookingId,
        document_type: documentType,
        document_image: uploadData.path,
        guest_name: guestName || null,
        nationality: nationality || null,
        uploaded_by: user?.id,
        uploaded_at: new Date().toISOString(),
        sent_to_host_status: "NOT_SENT",
      }));

      if (dbError) throw dbError;

      toast.success("Tải ảnh giấy tờ thành công!");
      onUploadComplete();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Lỗi tải ảnh: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Document Type Selection */}
      <div className="space-y-2">
        <Label>Loại giấy tờ *</Label>
        {debugDisableSelect ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            [DEBUG] Select disabled • {documentTypes.find((d) => d.value === documentType)?.label}
          </div>
        ) : (
          <Select
            value={documentType}
            onValueChange={(v: "CCCD" | "PASSPORT") => {
              if (v === documentType) return;
              setDocumentType(v);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {documentTypes.map((dt) => (
                <SelectItem key={dt.value} value={dt.value}>
                  {dt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Camera View */}
      {showCamera && (
        <div className="relative rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full max-h-[300px] object-contain"
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={capturePhoto}
            >
              <Camera className="h-5 w-5 mr-2" />
              Chụp ảnh
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={stopCamera}
            >
              <X className="h-4 w-4 mr-2" />
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && !showCamera && (
        <div className="relative rounded-lg overflow-hidden border">
          <img
            src={preview}
            alt="Preview"
            className="w-full max-h-[300px] object-contain bg-muted"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={clearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Upload Actions */}
      {!preview && !showCamera && (
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full h-24 border-dashed"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Chọn ảnh từ thiết bị
              </span>
            </div>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={startCamera}
          >
            <Camera className="h-4 w-4 mr-2" />
            Chụp ảnh bằng camera
          </Button>
        </div>
      )}

      {/* Action Buttons */}
      {preview && (
        <div className="flex gap-2 pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Huỷ
            </Button>
          )}
          <Button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="flex-1"
          >
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <ImageIcon className="mr-2 h-4 w-4" />
            Lưu ảnh giấy tờ
          </Button>
        </div>
      )}

      {required && !preview && (
        <p className="text-sm text-destructive">
          * Bắt buộc tải ảnh CCCD hoặc Passport để hoàn tất check-in
        </p>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { useCreateHostDepositRequest, HostDepositPurpose } from "@/hooks/useHostDepositRequests";
import { HostSupplySegment } from "@/hooks/useHostSupplySegments";

interface HostOption {
  partner_id: string;
  partner_name: string;
  total_amount: number;
  segment_count: number;
  segments: HostSupplySegment[];
}

interface CreateHostDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: HostDepositPurpose;
  segments: HostSupplySegment[];
  unifiedBookingId: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
};

export function CreateHostDepositDialog({
  open,
  onOpenChange,
  purpose,
  segments,
  unifiedBookingId,
}: CreateHostDepositDialogProps) {
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  
  const createMutation = useCreateHostDepositRequest();
  
  // Group segments by partner (host)
  const hostOptions = useMemo((): HostOption[] => {
    const map = new Map<string, HostOption>();
    segments.forEach((seg) => {
      const existing = map.get(seg.partner_id);
      if (existing) {
        existing.total_amount += seg.total_amount;
        existing.segment_count += 1;
        existing.segments.push(seg);
      } else {
        map.set(seg.partner_id, {
          partner_id: seg.partner_id,
          partner_name: seg.partner?.partner_name || "Unknown Host",
          total_amount: seg.total_amount,
          segment_count: 1,
          segments: [seg],
        });
      }
    });
    return Array.from(map.values());
  }, [segments]);

  // Get segments for selected host
  const selectedHost = hostOptions.find(h => h.partner_id === selectedPartnerId);
  const hostSegments = selectedHost?.segments || [];
  const needsSegmentSelection = hostSegments.length > 1;

  // Auto-select if only one host
  useEffect(() => {
    if (open && hostOptions.length === 1) {
      setSelectedPartnerId(hostOptions[0].partner_id);
    }
  }, [open, hostOptions]);

  // Auto-select segment if only one for this host
  useEffect(() => {
    if (selectedPartnerId && hostSegments.length === 1) {
      setSelectedSegmentId(hostSegments[0].id);
    } else if (!selectedPartnerId) {
      setSelectedSegmentId("");
    }
  }, [selectedPartnerId, hostSegments]);

  // Reset segment when host changes
  useEffect(() => {
    setSelectedSegmentId("");
  }, [selectedPartnerId]);

  const selectedSegment = hostSegments.find(s => s.id === selectedSegmentId);
  
  const isDeposit = purpose === "HOST_DEPOSIT";
  const title = isDeposit 
    ? "Tạo đề xuất đặt cọc Host (chờ duyệt)" 
    : "Tạo đề xuất trả trước Host (chờ duyệt)";
  const description = isDeposit
    ? "Tạo đề xuất đặt cọc cho Host – sẽ qua quy trình duyệt trước khi chi tiền"
    : "Tạo đề xuất trả trước cho Host – sẽ qua quy trình duyệt trước khi chi tiền";
  const notePlaceholder = isDeposit
    ? "VD: Cọc giữ phòng cho booking #123, hoàn nếu hủy trước 3 ngày..."
    : "VD: Trả trước tiền phòng tháng 12...";

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount.replace(/[^\d]/g, ""));
    if (!parsedAmount || parsedAmount <= 0 || !selectedPartnerId) return;

    await createMutation.mutateAsync({
      purpose,
      partner_id: selectedPartnerId,
      unified_booking_id: unifiedBookingId,
      proposed_amount: parsedAmount,
      note: note || undefined,
    });

    // Reset form and close
    setSelectedPartnerId("");
    setSelectedSegmentId("");
    setAmount("");
    setNote("");
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedPartnerId("");
    setSelectedSegmentId("");
    setAmount("");
    setNote("");
    onOpenChange(false);
  };

  const parsedAmount = parseFloat(amount.replace(/[^\d]/g, "")) || 0;
  const isValid = parsedAmount > 0 && !!selectedPartnerId && (needsSegmentSelection ? !!selectedSegmentId : true);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="border-warning/20 bg-warning/10 text-warning">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Lưu ý:</strong> Đây chỉ là ĐỀ XUẤT chi tiền, CHƯA PHẢI tiền đã chuyển. 
            Cần Finance/Manager duyệt → xác nhận chi tiền để hoàn tất.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-2">
          {/* Host Selection */}
          <div className="space-y-2">
            <Label>Host <span className="text-destructive">*</span></Label>
            {hostOptions.length === 1 ? (
              <Input 
                value={hostOptions[0].partner_name} 
                disabled 
                className="bg-muted"
              />
            ) : (
              <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn Host..." />
                </SelectTrigger>
                <SelectContent>
                  {hostOptions.map((host) => (
                    <SelectItem key={host.partner_id} value={host.partner_id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{host.partner_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {host.segment_count} segment · {formatCurrency(host.total_amount)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hostOptions.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Booking có {hostOptions.length} Host, vui lòng chọn Host cần {isDeposit ? "đặt cọc" : "trả trước"}
              </p>
            )}
          </div>

          {/* Show segment info for selected host */}
          {selectedHost && (
            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng tiền phòng (từ segments):</span>
                <span className="font-medium">{formatCurrency(selectedHost.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số segment:</span>
                <span>{selectedHost.segment_count}</span>
              </div>
            </div>
          )}

          {/* Segment Selection - when host has multiple segments */}
          {selectedHost && needsSegmentSelection && (
            <div className="space-y-2">
              <Label>Phòng / Segment <span className="text-destructive">*</span></Label>
              <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn phòng cần cọc/thanh toán..." />
                </SelectTrigger>
                <SelectContent>
                  {hostSegments.map((seg) => (
                    <SelectItem key={seg.id} value={seg.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{seg.host_room_type || seg.host_property_name || 'Phòng'}</span>
                        {seg.room_code && <span className="text-muted-foreground">({seg.room_code})</span>}
                        <span className="text-xs text-muted-foreground ml-2">
                          {seg.date_from} → {seg.date_to} · {formatCurrency(seg.total_amount)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Host này có {hostSegments.length} phòng, vui lòng chọn phòng cần {isDeposit ? "đặt cọc" : "trả trước"}
              </p>
            </div>
          )}

          {/* Show selected segment details */}
          {selectedSegment && (
            <div className="p-3 bg-info/10 border border-info/20 rounded-lg text-sm space-y-1">
              <div className="font-medium text-info">Phòng đã chọn:</div>
              <div className="flex justify-between text-info">
                <span>{selectedSegment.host_room_type || selectedSegment.host_property_name}</span>
                <span>{selectedSegment.room_code}</span>
              </div>
              <div className="flex justify-between text-info">
                <span>{selectedSegment.date_from} → {selectedSegment.date_to}</span>
                <span className="font-medium">{formatCurrency(selectedSegment.total_amount)}</span>
              </div>
            </div>
          )}

          {/* Booking - readonly */}
          <div className="space-y-2">
            <Label>Booking <span className="text-destructive">*</span></Label>
            <Input 
              value={unifiedBookingId} 
              disabled 
              className="bg-muted"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền đề xuất (VND) <span className="text-destructive">*</span></Label>
            <Input
              id="amount"
              type="text"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d]/g, "");
                setAmount(val ? parseInt(val).toLocaleString("vi-VN") : "");
              }}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">
              {isDeposit ? "Ghi chú (điều kiện cần trừ/hoàn)" : "Ghi chú"}
            </Label>
            <Textarea
              id="note"
              placeholder={notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Tạo đề xuất (chờ duyệt)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

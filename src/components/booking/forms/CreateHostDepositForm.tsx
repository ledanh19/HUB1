import { useState, useEffect, useMemo } from "react";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useCreateHostDepositRequest, HostDepositPurpose } from "@/hooks/useHostDepositRequests";
import { HostSupplySegment } from "@/hooks/useHostSupplySegments";

interface HostOption {
  partner_id: string;
  partner_name: string;
  total_amount: number;
  segment_count: number;
  segments: HostSupplySegment[];
}

interface CreateHostDepositFormProps {
  purpose: HostDepositPurpose;
  segments: HostSupplySegment[];
  unifiedBookingId: string;
  onComplete: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

export function CreateHostDepositForm({ purpose, segments, unifiedBookingId, onComplete }: CreateHostDepositFormProps) {
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const createMutation = useCreateHostDepositRequest();

  const isDeposit = purpose === "HOST_DEPOSIT";
  const title = isDeposit ? "Tạo đề xuất đặt cọc" : "Tạo đề xuất trả trước";

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

  const selectedHost = hostOptions.find(h => h.partner_id === selectedPartnerId);
  const hostSegments = selectedHost?.segments || [];
  const needsSegmentSelection = hostSegments.length > 1;

  useEffect(() => {
    if (hostOptions.length === 1) setSelectedPartnerId(hostOptions[0].partner_id);
  }, [hostOptions]);

  useEffect(() => {
    if (selectedPartnerId && hostSegments.length === 1) setSelectedSegmentId(hostSegments[0].id);
    else if (!selectedPartnerId) setSelectedSegmentId("");
  }, [selectedPartnerId, hostSegments]);

  useEffect(() => { setSelectedSegmentId(""); }, [selectedPartnerId]);

  const selectedSegment = hostSegments.find(s => s.id === selectedSegmentId);
  const parsedAmount = parseFloat(amount.replace(/[^\d]/g, "")) || 0;
  const isValid = parsedAmount > 0 && !!selectedPartnerId && (needsSegmentSelection ? !!selectedSegmentId : true);

  const handleSubmit = async () => {
    if (!isValid) return;
    await createMutation.mutateAsync({
      purpose,
      partner_id: selectedPartnerId,
      unified_booking_id: unifiedBookingId,
      proposed_amount: parsedAmount,
      note: note || undefined,
    });
    onComplete();
  };

  return (
    <MobileTaskPage
      title={title}
      onBack={onComplete}
      onSubmit={handleSubmit}
      submitLabel="Tạo đề xuất"
      submitDisabled={!isValid}
      isSubmitting={createMutation.isPending}
    >
      <Alert variant="default" className="border-warning/20 bg-warning/10 text-warning">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Lưu ý:</strong> Đây chỉ là ĐỀ XUẤT chi tiền, CHƯA PHẢI tiền đã chuyển.
          Cần Finance/Manager duyệt → xác nhận chi tiền để hoàn tất.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {/* Host Selection */}
        <div className="space-y-2">
          <Label>Host <span className="text-destructive">*</span></Label>
          {hostOptions.length === 1 ? (
            <Input value={hostOptions[0].partner_name} disabled className="bg-muted" />
          ) : (
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger><SelectValue placeholder="Chọn Host..." /></SelectTrigger>
              <SelectContent>
                {hostOptions.map((host) => (
                  <SelectItem key={host.partner_id} value={host.partner_id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{host.partner_name}</span>
                      <span className="text-xs text-muted-foreground">{host.segment_count} segment · {formatCurrency(host.total_amount)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Host info */}
        {selectedHost && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Tổng tiền phòng:</span>
              <span className="font-medium">{formatCurrency(selectedHost.total_amount)}</span>
              <span className="text-muted-foreground">Số segment:</span>
              <span>{selectedHost.segment_count}</span>
            </div>
          </div>
        )}

        {/* Segment Selection */}
        {selectedHost && needsSegmentSelection && (
          <div className="space-y-2">
            <Label>Phòng / Segment <span className="text-destructive">*</span></Label>
            <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
              <SelectTrigger><SelectValue placeholder="Chọn phòng..." /></SelectTrigger>
              <SelectContent>
                {hostSegments.map((seg) => (
                  <SelectItem key={seg.id} value={seg.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{seg.host_room_type || seg.host_property_name || 'Phòng'}</span>
                      {seg.room_code && <span className="text-muted-foreground">({seg.room_code})</span>}
                      <span className="text-xs text-muted-foreground ml-2">{seg.date_from} → {seg.date_to} · {formatCurrency(seg.total_amount)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Selected segment details */}
        {selectedSegment && (
          <div className="p-3 bg-info/10 border border-info/20 rounded-lg text-sm space-y-1">
            <div className="font-medium text-info">Phòng đã chọn:</div>
            <div className="flex justify-between text-info"><span>{selectedSegment.host_room_type || selectedSegment.host_property_name}</span><span>{selectedSegment.room_code}</span></div>
            <div className="flex justify-between text-info"><span>{selectedSegment.date_from} → {selectedSegment.date_to}</span><span className="font-medium">{formatCurrency(selectedSegment.total_amount)}</span></div>
          </div>
        )}

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
          <Label htmlFor="note">{isDeposit ? "Ghi chú (điều kiện cần trừ/hoàn)" : "Ghi chú"}</Label>
          <Textarea
            id="note"
            placeholder={isDeposit ? "VD: Cọc giữ phòng, hoàn nếu hủy trước 3 ngày..." : "VD: Trả trước tiền phòng tháng 12..."}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </MobileTaskPage>
  );
}

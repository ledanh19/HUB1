import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  AlertCircle,
  CreditCard,
  Building,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  OTA_DISPUTE_TYPE_DISPLAY,
  HOTEL_DISPUTE_TYPE_DISPLAY,
  type DisputeCategory,
  type DisputeType,
} from "@/hooks/useDisputeTracking";
import { useCreateCase } from "@/hooks/useCaseCenter";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";

interface BookingOption {
  unified_booking_id: string;
  ota_booking_code: string | null;
  ota_source: string | null;
  guest_name: string | null;
  payment_type: string | null;
  booking_status: string | null;
  check_in_date: string;
  check_out_date: string;
  host_property_name: string | null;
  pms_property_name: string | null;
  total_amount_net: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDisputeDialog({ open, onOpenChange }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<BookingOption | null>(null);
  const [disputeCategory, setDisputeCategory] = useState<DisputeCategory | "">("");
  const [disputeType, setDisputeType] = useState<DisputeType | "">("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const createCaseMutation = useCreateCase();

  // Search bookings from bookings_mirror (includes ALL bookings, including CANCELLED)
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: bookings = [], isFetching: isSearching } = useQuery({
    queryKey: ["bookings-for-dispute", debouncedSearch],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const search = debouncedSearch.trim();

      let query = supabase
        .from("bookings_mirror")
        .select("unified_booking_id, ota_booking_code, ota_source, guest_name, payment_type, booking_status, check_in_date, check_out_date, pms_property_name, total_amount_net")
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(
          `unified_booking_id.ilike.%${search}%,ota_booking_code.ilike.%${search}%,guest_name.ilike.%${search}%`
        );
      }

      query = query.limit(20);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(b => ({
        ...b,
        host_property_name: b.pms_property_name,
      })) as BookingOption[];
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  // Use server results directly
  const filteredBookings = bookings.slice(0, 10);

  // Helper to get display booking code (numeric format)
  const getDisplayBookingCode = (booking: BookingOption) => {
    return formatBookingCode(booking.unified_booking_id, booking.ota_booking_code, booking.ota_source, booking.check_in_date);
  };

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setSelectedBooking(null);
      setDisputeCategory("");
      setDisputeType("");
      setAmount("");
      setNote("");
    }
  }, [open]);

  // Auto-select category based on booking payment_type
  useEffect(() => {
    if (selectedBooking) {
      if (selectedBooking.payment_type === "OTA_COLLECT") {
        setDisputeCategory("OTA_COLLECT");
      } else {
        setDisputeCategory("HOTEL_COLLECT");
      }
      setDisputeType("");
    }
  }, [selectedBooking]);

  const getTypeOptions = () => {
    if (disputeCategory === "OTA_COLLECT") {
      return OTA_DISPUTE_TYPE_DISPLAY;
    } else if (disputeCategory === "HOTEL_COLLECT") {
      return HOTEL_DISPUTE_TYPE_DISPLAY;
    }
    return {};
  };

  // Determine case_type from dispute_type
  const isRefundCase = disputeType === "OTA_REFUND" || disputeType === "GUEST_REFUND";

  const handleSubmit = async () => {
    if (!selectedBooking || !disputeType || !amount) return;

    // Create via Case Center hook for better tracking
    await createCaseMutation.mutateAsync({
      unified_booking_id: selectedBooking.unified_booking_id,
      dispute_type: disputeType as DisputeType,
      case_type: isRefundCase ? "REFUND" : "DISPUTE",
      amount_requested: parseFloat(amount),
      refund_channel: isRefundCase && disputeType === "OTA_REFUND" ? "VIA_OTA" : undefined,
      note: note || undefined,
    });

    onOpenChange(false);
  };

  const canSubmit = selectedBooking && disputeType && parseFloat(amount) > 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Tạo tranh chấp / Hoàn tiền</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info banner */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Tạo tranh chấp khi có vấn đề ảnh hưởng đến tiền (OTA giữ tiền, khách không trả, chargeback...).
            </span>
          </div>

          {/* Booking Selection */}
          <div className="space-y-2">
            <Label>Chọn Booking *</Label>
            {selectedBooking ? (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{getDisplayBookingCode(selectedBooking)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedBooking(null);
                      setDisputeCategory("");
                      setDisputeType("");
                    }}
                  >
                    Đổi
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedBooking.guest_name} • {selectedBooking.host_property_name || selectedBooking.pms_property_name || "N/A"}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{selectedBooking.check_in_date} → {selectedBooking.check_out_date}</span>
                  {selectedBooking.booking_status === "CANCELLED" && (
                    <Badge variant="destructive" className="text-xs">Đã hủy</Badge>
                  )}
                  <Badge variant={selectedBooking.payment_type === "OTA_COLLECT" ? "secondary" : "outline"} className="text-xs">
                    {selectedBooking.payment_type === "OTA_COLLECT" ? "OTA thu" : "Thu tại KS"}
                  </Badge>
                  {selectedBooking.total_amount_net && (
                    <span className="font-medium">{formatCurrency(selectedBooking.total_amount_net)}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo booking ID hoặc tên khách..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {searchTerm && searchTerm.length < 2 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nhập ít nhất 2 ký tự để tìm kiếm
                  </p>
                )}
                {isSearching && searchTerm.length >= 2 && (
                  <div className="flex items-center justify-center gap-2 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Đang tìm...</span>
                  </div>
                )}
                {searchTerm.length >= 2 && !isSearching && filteredBookings.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                    {filteredBookings.map((b) => (
                      <button
                        key={b.unified_booking_id}
                        type="button"
                        onClick={() => {
                          setSelectedBooking(b);
                          setSearchTerm("");
                        }}
                        className="w-full p-2.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{getDisplayBookingCode(b)}</span>
                          <div className="flex items-center gap-1">
                            {b.booking_status === "CANCELLED" && (
                              <Badge variant="destructive" className="text-xs">Đã hủy</Badge>
                            )}
                            <Badge variant={b.payment_type === "OTA_COLLECT" ? "secondary" : "outline"} className="text-xs">
                              {b.payment_type === "OTA_COLLECT" ? "OTA" : "Hotel"}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {b.guest_name} • {b.host_property_name || b.pms_property_name || "N/A"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchTerm.length >= 2 && !isSearching && filteredBookings.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    Không tìm thấy booking
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Category is auto-selected based on booking payment_type (via useEffect) — no UI needed */}

          {/* Dispute Type */}
          {disputeCategory && (
            <div className="space-y-2">
              <Label>Loại tranh chấp *</Label>
              <Select
                value={disputeType}
                onValueChange={(v) => setDisputeType(v as DisputeType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(getTypeOptions()).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      <div>
                        <div>{(value as { label: string }).label}</div>
                        <div className="text-xs text-muted-foreground">
                          {(value as { description: string }).description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* No-show warning */}
          {disputeType === "OTA_NO_SHOW" && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                No-show đã có thao tác riêng ở Booking Detail. Case này chỉ dùng để <strong>theo dõi vấn đề tiền</strong> với OTA.
              </span>
            </div>
          )}
          {/* Refund auto-detect info */}
          {(disputeType === "OTA_REFUND" || disputeType === "GUEST_REFUND") && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-sm text-primary flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Case này sẽ được tạo dạng <strong>Hoàn tiền</strong>{disputeType === "OTA_REFUND" ? " qua OTA" : " trực tiếp"}.
              </span>
            </div>
          )}

          {/* Amount */}
          {disputeType && (
            <div className="space-y-2">
              <Label>Số tiền tranh chấp *</Label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                placeholder="Nhập số tiền..."
              />
              {selectedBooking?.total_amount_net && (
                <p className="text-xs text-muted-foreground">
                  Tổng tiền booking: {formatCurrency(selectedBooking.total_amount_net)}
                </p>
              )}
            </div>
          )}

          {/* Note */}
          {disputeType && (
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Mô tả chi tiết tình huống..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createCaseMutation.isPending}
          >
            {createCaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isRefundCase ? "Tạo yêu cầu hoàn tiền" : "Tạo tranh chấp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

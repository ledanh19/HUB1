import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Info, Home, Receipt, Plane, Search, Paperclip, Upload, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCreateCollectionAtomic } from "@/hooks/useCollections";
import { HOTEL_COLLECT_OPTIONS } from "@/constants/paymentMethods";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BookingOption {
  unified_booking_id: string;
  guest_name: string;
  payment_type: string;
  check_in_date: string;
  check_out_date: string;
  host_property_name: string | null;
  pms_property_name: string | null;
  total_amount_net: number | null;
}

const BUCKETS = {
  ROOM: {
    value: "ROOM",
    label: "Tiền phòng (Room charge)",
    icon: Home,
    description: "Thu tiền lưu trú theo booking",
  },
  EXTRA: {
    value: "EXTRA",
    label: "Phụ phí (Fees)",
    icon: Receipt,
    description: "Điện, nước, dọn phòng, card fee...",
  },
  SERVICE: {
    value: "SERVICE",
    label: "Dịch vụ (Services)",
    icon: Plane,
    description: "Đưa đón, tour, giặt ủi...",
  },
};

type CollectorType = "ROOMRISE" | "HOST" | "SERVICE_PARTNER";

export function CreateCollectionDialog({ open, onOpenChange }: CreateCollectionDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<BookingOption | null>(null);
  const [bucket, setBucket] = useState<"ROOM" | "EXTRA" | "SERVICE">("ROOM");
  const [itemDescription, setItemDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [collectorType, setCollectorType] = useState<CollectorType>("ROOMRISE");
  const [selectedHostId, setSelectedHostId] = useState("");
  const [selectedServicePartnerId, setSelectedServicePartnerId] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch bookings for search
  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings-for-collection"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, guest_name, payment_type, check_in_date, check_out_date, host_property_name, pms_property_name, total_amount_net")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as BookingOption[];
    },
  });

  // Filter bookings by search
  const filteredBookings = bookings.filter((b) =>
    b.unified_booking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.guest_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 10);

  // Check if OTA_COLLECT
  const isOtaCollect = selectedBooking?.payment_type === "OTA_COLLECT";

  // Fetch related hosts from segments
  const { data: relatedHosts = [] } = useQuery({
    queryKey: ["booking_related_hosts", selectedBooking?.unified_booking_id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedBooking) return [];
      const { data, error } = await supabase
        .from("host_supply_segments")
        .select("partner_id, partners:partner_id(id, partner_name)")
        .eq("unified_booking_id", selectedBooking.unified_booking_id);
      if (error) throw error;

      const uniqueHosts = new Map<string, { id: string; partner_name: string }>();
      data?.forEach((seg: any) => {
        if (seg.partners && !uniqueHosts.has(seg.partners.id)) {
          uniqueHosts.set(seg.partners.id, seg.partners);
        }
      });
      return Array.from(uniqueHosts.values());
    },
    enabled: !!selectedBooking && collectorType === "HOST",
  });

  // Fetch related service partners from service orders
  const { data: relatedServicePartners = [] } = useQuery({
    queryKey: ["booking_related_service_partners", selectedBooking?.unified_booking_id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedBooking) return [];
      const { data, error } = await supabase
        .from("service_orders")
        .select("service_partner_id, partners:service_partner_id(id, partner_name)")
        .eq("unified_booking_id", selectedBooking.unified_booking_id)
        .not("service_partner_id", "is", null);
      if (error) throw error;

      const uniquePartners = new Map<string, { id: string; partner_name: string }>();
      data?.forEach((so: any) => {
        if (so.partners && !uniquePartners.has(so.partners.id)) {
          uniquePartners.set(so.partners.id, so.partners);
        }
      });
      return Array.from(uniquePartners.values());
    },
    enabled: !!selectedBooking && collectorType === "SERVICE_PARTNER",
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setSelectedBooking(null);
      setBucket("ROOM");
      setItemDescription("");
      setAmount("");
      setPaymentMethod("CASH");
      setCollectorType("ROOMRISE");
      setSelectedHostId("");
      setSelectedServicePartnerId("");
      setNote("");
      setReference("");
      setAttachments([]);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Force bucket to EXTRA when OTA_COLLECT
  useEffect(() => {
    if (isOtaCollect && bucket === "ROOM") {
      setBucket("EXTRA");
    }
  }, [isOtaCollect, bucket]);

  // Handle collector type change
  const handleCollectorTypeChange = (value: CollectorType) => {
    // ROOM cannot select SERVICE_PARTNER
    if (bucket === "ROOM" && value === "SERVICE_PARTNER") {
      toast.error("Không hợp lệ", { description: "Tiền phòng không thể chọn Đối tác dịch vụ làm người thu" });
      return;
    }
    setCollectorType(value);
    setSelectedHostId("");
    setSelectedServicePartnerId("");
  };

  // Handle bucket change
  const handleBucketChange = (value: "ROOM" | "EXTRA" | "SERVICE") => {
    setBucket(value);
    // Reset SERVICE_PARTNER if switching to ROOM
    if (value === "ROOM" && collectorType === "SERVICE_PARTNER") {
      setCollectorType("ROOMRISE");
      setSelectedServicePartnerId("");
    }
  };

  // Determine payee_type based on collector
  const getPayeeType = (): string => {
    switch (collectorType) {
      case "HOST":
        return "HOST";
      case "SERVICE_PARTNER":
        return "SERVICE_PARTNER";
      default:
        return "ROOMRISE";
    }
  };

  // Validation
  const isCollectorValid = () => {
    if (collectorType === "ROOMRISE") return true;
    if (collectorType === "HOST") return !!selectedHostId;
    if (collectorType === "SERVICE_PARTNER") return !!selectedServicePartnerId;
    return false;
  };

  // PHASE II: Use atomic RPC for ledger + cashflow atomicity
  const createCollectionMutation = useCreateCollectionAtomic();

  const handleCreate = () => {
    if (!selectedBooking) {
      toast.error("Lỗi", { description: "Chưa chọn booking" });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Lỗi", { description: "Số tiền phải lớn hơn 0" });
      return;
    }

    if (!isCollectorValid()) {
      toast.error("Lỗi", { description: "Vui lòng chọn người thu tiền cụ thể" });
      return;
    }

    createCollectionMutation.mutate({
      unified_booking_id: selectedBooking.unified_booking_id,
      amount: parsedAmount,
      payment_method: paymentMethod,
      collection_type: 'COLLECT',
      related_type: bucket,
      payer_type: 'GUEST',
      payee_type: getPayeeType(),
      related_id: null,
      note: [itemDescription, note].filter(Boolean).join(" - ") || null,
    }, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  const canSubmit =
    selectedBooking &&
    parseFloat(amount) > 0 &&
    isCollectorValid() &&
    (bucket !== "EXTRA" && bucket !== "SERVICE" || itemDescription.trim().length > 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const isNotRoomrise = collectorType !== "ROOMRISE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thu tiền từ khách</DialogTitle>
          <DialogDescription>
            Ghi nhận khoản thu trực tiếp từ khách (KHÔNG bao gồm tiền phòng OTA Collect)
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Booking Selection */}
          <div className="space-y-2">
            <Label>Booking *</Label>
            {selectedBooking ? (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedBooking.unified_booking_id}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedBooking(null);
                      setCollectorType("ROOMRISE");
                      setSelectedHostId("");
                      setSelectedServicePartnerId("");
                    }}
                  >
                    Đổi
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedBooking.guest_name} • {selectedBooking.host_property_name || selectedBooking.pms_property_name || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedBooking.check_in_date} → {selectedBooking.check_out_date} •
                  {selectedBooking.payment_type === "OTA_COLLECT" ? " OTA thu" : " Thu tại KS"}
                </p>
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
                {searchTerm && filteredBookings.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                    {filteredBookings.map((b) => (
                      <button
                        key={b.unified_booking_id}
                        type="button"
                        onClick={() => {
                          setSelectedBooking(b);
                          setSearchTerm("");
                        }}
                        className="w-full p-2 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="font-medium text-sm">{b.unified_booking_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.guest_name} • {b.host_property_name || b.pms_property_name || "N/A"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OTA Collect Warning */}
          {isOtaCollect && (
            <Alert className="bg-info/10 border-info/20 dark:bg-info/10 dark:border-info">
              <Info className="h-4 w-4 text-info" />
              <AlertDescription className="text-info">
                <strong>Booking OTA COLLECT:</strong> Tiền phòng do OTA thanh toán qua Payout.
                <br />Chỉ được thu <strong>Phụ phí</strong> hoặc <strong>Dịch vụ</strong> tại đây.
              </AlertDescription>
            </Alert>
          )}

          {/* Bucket Selection */}
          {selectedBooking && (
            <div className="space-y-2">
              <Label>Loại khoản thu (Bucket) *</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(BUCKETS).map((b) => {
                  const Icon = b.icon;
                  const isDisabled = isOtaCollect && b.value === "ROOM";
                  const isSelected = bucket === b.value;

                  return (
                    <button
                      key={b.value}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleBucketChange(b.value as "ROOM" | "EXTRA" | "SERVICE")}
                      className={`
                        flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all
                        ${isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/50"
                        }
                        ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                      `}
                    >
                      <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${isSelected ? "text-primary" : ""}`}>
                        {b.label.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isOtaCollect && (
                <p className="text-xs text-muted-foreground">
                  * Tiền phòng (Room) bị khóa với booking OTA Collect
                </p>
              )}
            </div>
          )}

          {/* Item Description for EXTRA/SERVICE */}
          {selectedBooking && (bucket === "EXTRA" || bucket === "SERVICE") && (
            <div className="space-y-2">
              <Label>
                Khoản thu cụ thể *
                <span className="text-xs text-muted-foreground ml-2">
                  ({bucket === "EXTRA" ? "Tên phụ phí" : "Tên dịch vụ"})
                </span>
              </Label>
              <Input
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder={bucket === "EXTRA" ? "VD: Điện phụ thu, Card fee..." : "VD: Airport pickup, Tour..."}
              />
            </div>
          )}

          {/* Amount */}
          {selectedBooking && (
            <div className="space-y-2">
              <Label>Số tiền *</Label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                placeholder="0"
              />
              {bucket === "ROOM" && selectedBooking.total_amount_net && (
                <p className="text-xs text-muted-foreground">
                  Tổng booking: {formatCurrency(selectedBooking.total_amount_net)}
                </p>
              )}
            </div>
          )}

          {/* Payment Method & Collector Type */}
          {selectedBooking && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phương thức thanh toán *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOTEL_COLLECT_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex items-center gap-2">
                          <PaymentMethodIcon code={m.value} className="h-4 w-4 text-muted-foreground" />
                          {m.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Người thu tiền *</Label>
                <Select value={collectorType} onValueChange={handleCollectorTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROOMRISE">Roomrise</SelectItem>
                    <SelectItem value="HOST">Host (Chủ nhà)</SelectItem>
                    {bucket !== "ROOM" && (
                      <SelectItem value="SERVICE_PARTNER">Đối tác dịch vụ</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Host Selection */}
          {selectedBooking && collectorType === "HOST" && (
            <div className="space-y-2">
              <Label>Chọn Chủ nhà *</Label>
              {relatedHosts.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Không có Host liên quan đến booking này
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedHostId} onValueChange={setSelectedHostId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn Host..." />
                  </SelectTrigger>
                  <SelectContent>
                    {relatedHosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>
                        {host.partner_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Service Partner Selection */}
          {selectedBooking && collectorType === "SERVICE_PARTNER" && (
            <div className="space-y-2">
              <Label>Chọn Đối tác dịch vụ *</Label>
              {relatedServicePartners.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Không có Đối tác dịch vụ liên quan đến booking này
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedServicePartnerId} onValueChange={setSelectedServicePartnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn Đối tác..." />
                  </SelectTrigger>
                  <SelectContent>
                    {relatedServicePartners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.partner_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Warning if NOT Roomrise */}
          {selectedBooking && isNotRoomrise && (
            <Alert className="bg-warning/10 border-warning/20 dark:bg-warning/10 dark:border-warning">
              <Info className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Khoản thu này <strong>KHÔNG</strong> ghi nhận doanh thu về Roomrise.
                Tiền được ghi nhận là khách trả trực tiếp cho{" "}
                {collectorType === "HOST" ? "Host" : "Đối tác dịch vụ"}.
              </AlertDescription>
            </Alert>
          )}

          {/* Reference & Note */}
          {selectedBooking && (
            <>
              <div className="space-y-2">
                <Label>Reference giao dịch</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Mã giao dịch ngân hàng (nếu có)"
                />
              </div>

              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú thêm (tuỳ chọn)"
                  rows={2}
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Tài liệu đính kèm
                </Label>
                <div className="border border-dashed rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-center">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <Upload className="h-4 w-4" />
                        <span>Nhấn để tải lên hoặc kéo thả file</span>
                      </div>
                    </label>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Hỗ trợ: Hình ảnh, PDF, Word, Excel (tối đa 10MB/file)
                  </p>

                  {attachments.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate max-w-[200px]">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit || createCollectionMutation.isPending}
          >
            {createCollectionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Thu tiền
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

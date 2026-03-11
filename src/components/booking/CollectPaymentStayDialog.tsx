import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Receipt, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCreateCollectionAtomic } from "@/hooks/useCollections";
import { HOTEL_COLLECT_OPTIONS } from "@/constants/paymentMethods";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";

interface CollectPaymentStayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  guestName: string;
  totalAmount: number;
  amountCollected: number;
  paymentType?: string;
}

type CollectorType = "ROOMRISE" | "HOST" | "SERVICE_PARTNER";

export function CollectPaymentStayDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  guestName,
  totalAmount,
  amountCollected,
  paymentType,
}: CollectPaymentStayDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // HARD RULE: OTA_COLLECT không được thu ROOM
  const isOtaCollect = paymentType === "OTA_COLLECT";
  const remainingAmount = totalAmount - amountCollected;

  // For OTA_COLLECT, default to EXTRA (cannot collect ROOM)
  const [relatedType, setRelatedType] = useState<"ROOM" | "EXTRA" | "SERVICE">(
    isOtaCollect ? "EXTRA" : "ROOM"
  );

  const [collectorType, setCollectorType] = useState<CollectorType>("ROOMRISE");
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [selectedServicePartnerId, setSelectedServicePartnerId] = useState<string>("");
  const [selectedServiceOrderId, setSelectedServiceOrderId] = useState<string>("");

  const [formData, setFormData] = useState({
    amount: isOtaCollect ? "" : remainingAmount.toString(),
    payment_method: "CASH",
    note: "",
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setRelatedType(isOtaCollect ? "EXTRA" : "ROOM");
      setCollectorType("ROOMRISE");
      setSelectedHostId("");
      setSelectedServicePartnerId("");
      setSelectedServiceOrderId("");
      setFormData({
        amount: isOtaCollect ? "" : remainingAmount.toString(),
        payment_method: "CASH",
        note: "",
      });
    }
  }, [open, isOtaCollect, remainingAmount]);

  // Fetch related hosts from segments
  const { data: relatedHosts = [] } = useQuery({
    queryKey: ["booking_related_hosts", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_supply_segments")
        .select("partner_id, partners:partner_id(id, partner_name)")
        .eq("unified_booking_id", unifiedBookingId);
      if (error) throw error;

      const uniqueHosts = new Map<string, { id: string; partner_name: string }>();
      data?.forEach((seg: any) => {
        if (seg.partners && !uniqueHosts.has(seg.partners.id)) {
          uniqueHosts.set(seg.partners.id, seg.partners);
        }
      });
      return Array.from(uniqueHosts.values());
    },
    enabled: open && collectorType === "HOST",
  });

  // Fetch related service orders (for mapping SERVICE collections to correct order)
  const { data: serviceOrdersForPayment = [] } = useQuery({
    queryKey: ["booking-service-orders-for-payment", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, sale_price, service_date_time, status, service_catalog(service_name, service_type), partners(partner_name)")
        .eq("unified_booking_id", unifiedBookingId)
        .order("service_date_time", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch related service partners from service orders
  const { data: relatedServicePartners = [] } = useQuery({
    queryKey: ["booking_related_service_partners", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("partner_id, partners:partner_id(id, partner_name)")
        .eq("unified_booking_id", unifiedBookingId)
        .not("partner_id", "is", null);
      if (error) throw error;

      const uniquePartners = new Map<string, { id: string; partner_name: string }>();
      data?.forEach((so: any) => {
        if (so.partners && !uniquePartners.has(so.partners.id)) {
          uniquePartners.set(so.partners.id, so.partners);
        }
      });
      return Array.from(uniquePartners.values());
    },
    enabled: open && collectorType === "SERVICE_PARTNER",
  });

  // Handle collector type change
  const handleCollectorTypeChange = (value: CollectorType) => {
    // ROOM cannot select SERVICE_PARTNER
    if (relatedType === "ROOM" && value === "SERVICE_PARTNER") {
      toast.error("Tiền phòng không thể chọn Đối tác dịch vụ làm người thu");
      return;
    }
    setCollectorType(value);
    setSelectedHostId("");
    setSelectedServicePartnerId("");
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

  const isServiceOrderValid = () => {
    if (relatedType !== "SERVICE") return true;
    return !!selectedServiceOrderId;
  };

  // PHASE II: Use atomic RPC for ledger + cashflow atomicity
  const createCollectionMutation = useCreateCollectionAtomic();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (createCollectionMutation.isPending) return;

    const amount = parseFloat(formData.amount) || 0;
    if (amount <= 0) {
      toast.error("Số tiền phải lớn hơn 0");
      return;
    }

    if (!isCollectorValid()) {
      toast.error("Vui lòng chọn người thu tiền cụ thể");
      return;
    }

    if (!isServiceOrderValid()) {
      toast.error("Vui lòng chọn đơn dịch vụ cần ghi nhận thu tiền");
      return;
    }

    const finalRelatedType = isOtaCollect ? "EXTRA" : relatedType;

    // OPTIMISTIC UPDATE: Update amount_collected in list immediately
    const optimisticUpdateLists = (oldData: unknown) => {
      if (!oldData || !Array.isArray(oldData)) return oldData;
      return oldData.map((item: Record<string, unknown>) =>
        item.unified_booking_id === unifiedBookingId
          ? {
            ...item,
            amount_collected: (Number(item.amount_collected) || 0) + amount,
            _isOptimistic: true
          }
          : item
      );
    };

    queryClient.setQueryData(["stays"], optimisticUpdateLists);
    queryClient.setQueryData(["stays_operations"], optimisticUpdateLists);
    queryClient.setQueryData(["stays_with_bookings"], optimisticUpdateLists);

    createCollectionMutation.mutate({
      unified_booking_id: unifiedBookingId,
      amount,
      payment_method: formData.payment_method,
      collection_type: 'COLLECT',
      related_type: finalRelatedType,
      payer_type: 'GUEST',
      payee_type: getPayeeType(),
      related_id: finalRelatedType === "SERVICE" ? selectedServiceOrderId : null,
      note: formData.note || null,
    }, {
      onSuccess: () => {
        toast.success(`Thu ${amount.toLocaleString("vi-VN")} VND thành công!`);
        onOpenChange(false);
      },
      onError: () => {
        // Rollback optimistic update
        queryClient.invalidateQueries({ queryKey: ["stays"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
      },
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const isNotRoomrise = collectorType !== "ROOMRISE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thu tiền tại KS</DialogTitle>
          <DialogDescription>Thu tiền từ khách {guestName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* HARD BLOCK for OTA_COLLECT */}
          {isOtaCollect && (
            <div className="p-4 rounded-lg bg-info/10 border border-info/20 dark:bg-info/10 dark:border-info">
              <div className="flex items-start gap-3">
                <Receipt className="h-5 w-5 text-info mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-info">
                    Booking OTA COLLECT
                  </p>
                  <p className="text-xs text-info">
                    Tiền phòng do OTA thanh toán. Chỉ thu phụ phí phát sinh tại đây.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Financial Summary - only show for HOTEL_COLLECT */}
          {!isOtaCollect && (
            <div className="p-4 rounded-lg bg-muted/30 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Tổng quan tiền phòng</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tổng tiền:</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Đã thu:</span>
                <span className="text-success">{formatCurrency(amountCollected)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t border-border pt-2 mt-2">
                <span>Còn lại:</span>
                <span className="text-primary">{formatCurrency(remainingAmount)}</span>
              </div>
            </div>
          )}

          {/* Bucket Selection */}
          <div className="space-y-2">
            <Label>Loại khoản thu *</Label>
            <Select
              value={relatedType}
              onValueChange={(v) => {
                setRelatedType(v as "ROOM" | "EXTRA" | "SERVICE");
                // Reset SERVICE_PARTNER if switching to ROOM
                if (v === "ROOM" && collectorType === "SERVICE_PARTNER") {
                  setCollectorType("ROOMRISE");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!isOtaCollect && <SelectItem value="ROOM">Tiền phòng</SelectItem>}
                <SelectItem value="EXTRA">Phụ phí</SelectItem>
                <SelectItem value="SERVICE">Dịch vụ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Service Order Selection (required for SERVICE) */}
          {relatedType === "SERVICE" && (
            <div className="space-y-2">
              <Label>
                Đơn dịch vụ <span className="text-destructive">*</span>
              </Label>
              {serviceOrdersForPayment.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Chưa có đơn dịch vụ nào trong booking này. Vui lòng tạo đơn dịch vụ trước.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedServiceOrderId} onValueChange={setSelectedServiceOrderId}>
                  <SelectTrigger className={!selectedServiceOrderId ? "border-warning" : ""}>
                    <SelectValue placeholder="Chọn đơn dịch vụ..." />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceOrdersForPayment.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {o.service_catalog?.service_name || "Dịch vụ"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {new Date(o.service_date_time).toLocaleString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {o.partners?.partner_name ? ` • ${o.partners.partner_name}` : ""}
                            </p>
                          </div>
                          <span className="text-sm">{formatCurrency(o.sale_price || 0)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label>Số tiền thu *</Label>
            <CurrencyInput
              value={formData.amount}
              onChange={(v) => setFormData({ ...formData, amount: v })}
              placeholder="0"
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Phương thức *</Label>
            <Select
              value={formData.payment_method}
              onValueChange={(v) => setFormData({ ...formData, payment_method: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_COLLECT_OPTIONS.map((pm) => (
                  <SelectItem key={pm.value} value={pm.value}>
                    <div className="flex items-center gap-2">
                      <PaymentMethodIcon code={pm.value} className="h-4 w-4 text-muted-foreground" />
                      {pm.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Collector Type */}
          <div className="space-y-2">
            <Label>Người thu tiền *</Label>
            <Select value={collectorType} onValueChange={handleCollectorTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ROOMRISE">Roomrise</SelectItem>
                <SelectItem value="HOST">Host (Chủ nhà)</SelectItem>
                {relatedType !== "ROOM" && (
                  <SelectItem value="SERVICE_PARTNER">Đối tác dịch vụ</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Host Selection */}
          {collectorType === "HOST" && (
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
          {collectorType === "SERVICE_PARTNER" && (
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
                <Select
                  value={selectedServicePartnerId}
                  onValueChange={setSelectedServicePartnerId}
                >
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
          {isNotRoomrise && (
            <Alert className="bg-warning/10 border-warning/20 dark:bg-warning/10 dark:border-warning">
              <Info className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Khoản thu này <strong>KHÔNG</strong> ghi nhận doanh thu về Roomrise.
                Tiền được ghi nhận là khách trả trực tiếp cho{" "}
                {collectorType === "HOST" ? "Host" : "Đối tác dịch vụ"}.
              </AlertDescription>
            </Alert>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={createCollectionMutation.isPending || !isCollectorValid()}>
              {createCollectionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Thu tiền
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

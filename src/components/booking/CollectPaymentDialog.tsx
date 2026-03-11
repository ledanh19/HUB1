import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Info, Home, Receipt, Plane, User, Building, ExternalLink } from "lucide-react";
import { useCreateCollectionAtomic } from "@/hooks/useCollections";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { supabase } from "@/integrations/supabase/client";
import { ReceiptUpload } from "@/components/ui/receipt-upload";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { HOTEL_COLLECT_OPTIONS, LINK_PROVIDER_OPTIONS } from "@/constants/paymentMethods";

interface CollectPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  remainingAmount: number;
  bookingStatus?: string;
  stayStatus?: string;
  paymentType?: string;
  defaultCategory?: "ROOM" | "EXTRA" | "SERVICE";
  lockCategory?: boolean;
}

// RULE: OTA_COLLECT → chỉ cho thu EXTRA và ADVANCE
// HOTEL_COLLECT → cho thu ROOM, EXTRA, ADVANCE
const COLLECTION_CATEGORIES = {
  ROOM: {
    label: "Tiền phòng",
    icon: Home,
    description: "Thu tiền lưu trú theo booking",
    allowedPaymentTypes: ["HOTEL_COLLECT"] as const,
  },
  EXTRA: {
    label: "Phụ phí khác",
    icon: Receipt,
    description: "Thu phụ phí phát sinh (điện, nước, dọn phòng...)",
    allowedPaymentTypes: ["HOTEL_COLLECT", "OTA_COLLECT"] as const,
  },
  SERVICE: {
    label: "Dịch vụ",
    icon: Plane,
    description: "Thu tiền dịch vụ (đưa đón, tour, giặt ủi...)",
    allowedPaymentTypes: ["HOTEL_COLLECT", "OTA_COLLECT"] as const,
  },
};

type CollectorType = "ROOMRISE" | "HOST" | "SERVICE_PARTNER";

export function CollectPaymentDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  remainingAmount,
  bookingStatus,
  stayStatus,
  paymentType,
  defaultCategory,
  lockCategory = false,
}: CollectPaymentDialogProps) {
  const isOtaCollect = paymentType === "OTA_COLLECT";

  const resolvedDefaultCategory: "ROOM" | "EXTRA" | "SERVICE" =
    defaultCategory ?? (isOtaCollect ? "EXTRA" : "ROOM");

  const [collectionCategory, setCollectionCategory] = useState<"ROOM" | "EXTRA" | "SERVICE">(
    resolvedDefaultCategory
  );
  const [selectedServiceOrderId, setSelectedServiceOrderId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [collectorType, setCollectorType] = useState<CollectorType>("ROOMRISE");
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [linkProvider, setLinkProvider] = useState<string>("");
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string>("");
  const [note, setNote] = useState("");
  const [confirmOverpay, setConfirmOverpay] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const createCollectionMutation = useCreateCollectionAtomic();

  // Fetch hosts from booking segments
  const { data: bookingHosts = [] } = useQuery({
    queryKey: ["booking-hosts", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_supply_segments")
        .select(`
          partner_id,
          partners:partner_id (
            id,
            partner_name
          )
        `)
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;

      // Get unique hosts
      const hostsMap = new Map<string, { id: string; name: string }>();
      data?.forEach((segment: any) => {
        if (segment.partners) {
          hostsMap.set(segment.partners.id, {
            id: segment.partners.id,
            name: segment.partners.partner_name,
          });
        }
      });

      return Array.from(hostsMap.values());
    },
    enabled: open,
  });

  // Fetch service orders for mapping service collections to the correct order
  const { data: serviceOrdersForPayment = [] } = useQuery({
    queryKey: ["booking-service-orders-for-payment", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`
          id,
          sale_price,
          service_date_time,
          status,
          service_catalog(service_name, service_type),
          partners(partner_name)
        `)
        .eq("unified_booking_id", unifiedBookingId)
        .order("service_date_time", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch service partners from service orders
  const { data: servicePartners = [] } = useQuery({
    queryKey: ["booking-service-partners", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`
          partner_id,
          partners:partner_id (
            id,
            partner_name
          )
        `)
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;

      // Get unique partners
      const partnersMap = new Map<string, { id: string; name: string }>();
      data?.forEach((order: any) => {
        if (order.partners) {
          partnersMap.set(order.partners.id, {
            id: order.partners.id,
            name: order.partners.partner_name,
          });
        }
      });

      return Array.from(partnersMap.values());
    },
    enabled: open,
  });

  // Update default amount based on category
  useEffect(() => {
    if (collectionCategory === "ROOM" && remainingAmount > 0) {
      setAmount(remainingAmount.toString());
    } else if (collectionCategory === "EXTRA" || collectionCategory === "SERVICE") {
      setAmount("");
    }
  }, [collectionCategory, remainingAmount]);

  // Reset states when dialog opens
  useEffect(() => {
    if (open) {
      setCollectionCategory(resolvedDefaultCategory);
      setSelectedServiceOrderId("");
      setAmount(
        resolvedDefaultCategory === "ROOM"
          ? remainingAmount > 0
            ? remainingAmount.toString()
            : ""
          : ""
      );
      setPaymentMethod("CASH");
      setCollectorType("ROOMRISE");
      setSelectedHostId("");
      setSelectedPartnerId("");
      setLinkProvider("");
      setPaymentLinkUrl("");
      setNote("");
      setConfirmOverpay(false);
      setConfirmNoShow(false);
      setReceiptImage(null);
    }
  }, [open, resolvedDefaultCategory, remainingAmount]);

  // Reset collector selection when type changes
  useEffect(() => {
    setSelectedHostId("");
    setSelectedPartnerId("");
  }, [collectorType]);

  // Reset link provider when payment method changes
  useEffect(() => {
    if (paymentMethod !== "PAYMENT_LINK") {
      setLinkProvider("");
      setPaymentLinkUrl("");
    }
  }, [paymentMethod]);

  // Reset service order selection when category changes
  useEffect(() => {
    if (collectionCategory !== "SERVICE") {
      setSelectedServiceOrderId("");
    }
  }, [collectionCategory]);

  // Validation: SERVICE_PARTNER cannot collect ROOM
  useEffect(() => {
    if (collectionCategory === "ROOM" && collectorType === "SERVICE_PARTNER") {
      setCollectorType("ROOMRISE");
    }
  }, [collectionCategory, collectorType]);

  const parsedAmount = parseFloat(amount) || 0;
  const isOverpaying = collectionCategory === "ROOM" && parsedAmount > remainingAmount && remainingAmount > 0;
  const overpayPercent = remainingAmount > 0 ? ((parsedAmount - remainingAmount) / remainingAmount) * 100 : 0;
  const isNoShow = bookingStatus === "NO_SHOW" || stayStatus === "NO_SHOW";
  const isNegativeRemaining = remainingAmount < 0;

  // Validation: require note if overpaying, no-show, or EXTRA/SERVICE type
  const requiresNote = isOverpaying || isNoShow || collectionCategory === "EXTRA" || collectionCategory === "SERVICE";

  // Validation: require specific selection for HOST/SERVICE_PARTNER
  const collectorValid =
    collectorType === "ROOMRISE" ||
    (collectorType === "HOST" && selectedHostId) ||
    (collectorType === "SERVICE_PARTNER" && selectedPartnerId);

  // Validation: require link provider when PAYMENT_LINK selected and collector is ROOMRISE
  const linkProviderValid =
    paymentMethod !== "PAYMENT_LINK" ||
    collectorType !== "ROOMRISE" ||
    !!linkProvider;

  const serviceOrderValid = collectionCategory !== "SERVICE" || !!selectedServiceOrderId;

  const canSubmit =
    parsedAmount > 0 &&
    collectorValid &&
    linkProviderValid &&
    serviceOrderValid &&
    (!isOverpaying || confirmOverpay) &&
    (!isNoShow || confirmNoShow) &&
    (!requiresNote || note.trim().length > 0);

  const selectedServiceOrder =
    collectionCategory === "SERVICE"
      ? serviceOrdersForPayment.find((o: any) => o.id === selectedServiceOrderId) || null
      : null;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    // Determine payee_type based on collector
    const payeeType = collectorType === "ROOMRISE" ? "ROOMRISE" :
      collectorType === "HOST" ? "HOST" : "SERVICE_PARTNER";

    // Determine collector_id
    const collectorId = collectorType === "HOST" ? selectedHostId :
      collectorType === "SERVICE_PARTNER" ? selectedPartnerId : null;

    // Use atomic RPC to create collection + ledger entry in single transaction
    // Include receipt_image if uploaded during collection
    await createCollectionMutation.mutateAsync({
      unified_booking_id: unifiedBookingId,
      amount: parsedAmount,
      payment_method: paymentMethod,
      collection_type: "COLLECT",
      related_type: collectionCategory,
      payer_type: "GUEST",
      payee_type: payeeType,
      related_id: collectionCategory === "SERVICE" ? selectedServiceOrderId : undefined,
      note: note || undefined,
      receipt_image: receiptImage || undefined,
      payment_link_url: paymentMethod === "PAYMENT_LINK" ? (paymentLinkUrl || undefined) : undefined,
      payment_provider: paymentMethod === "PAYMENT_LINK" ? (linkProvider || undefined) : undefined,
    });

    // Create audit log with warnings captured
    await createAuditLog({
      action: AuditActions.PAYMENT_COLLECTED,
      entity: "booking",
      entityId: unifiedBookingId,
      afterData: {
        amount_collected: parsedAmount,
        payment_method: paymentMethod,
        payment_provider: paymentMethod === "PAYMENT_LINK" ? linkProvider : null,
        collector_type: collectorType,
        collector_id: collectorId,
        collection_category: collectionCategory,
        service_order_id: collectionCategory === "SERVICE" ? selectedServiceOrderId : null,
        service_name: collectionCategory === "SERVICE" ? selectedServiceOrder?.service_catalog?.service_name : null,
        warnings: {
          overpay: isOverpaying ? `Vượt ${overpayPercent.toFixed(1)}%` : null,
          no_show: isNoShow ? "Thu tiền booking No-Show" : null,
        },
      },
    });

    onOpenChange(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Get available collector options based on category
  const getCollectorOptions = () => {
    const options: { value: CollectorType; label: string; icon: React.ElementType }[] = [
      { value: "ROOMRISE", label: "Roomrise", icon: Building },
      { value: "HOST", label: "Host (Chủ nhà)", icon: Home },
    ];

    // SERVICE_PARTNER only available for SERVICE category
    if (collectionCategory === "SERVICE") {
      options.push({ value: "SERVICE_PARTNER", label: "Đối tác dịch vụ", icon: User });
    }

    return options;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Thu tiền tại khách sạn</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0 pr-1">
          {/* Category selection */}
          {isOtaCollect || lockCategory ? (
            <div className="space-y-3">
              {isOtaCollect && (
                <Alert className="bg-info/10 border-info/20 dark:bg-info/10 dark:border-info">
                  <Info className="h-4 w-4 text-info" />
                  <AlertDescription className="text-info">
                    <strong>Booking OTA COLLECT:</strong> Tiền phòng do OTA thanh toán qua Payout.
                    <br />Chỉ được thu <strong>phụ phí phát sinh</strong> tại khách sạn.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                {defaultCategory === "SERVICE" ? (
                  <>
                    <Plane className="h-5 w-5 text-info" />
                    <div>
                      <p className="font-medium text-sm">Thu tiền dịch vụ</p>
                      <p className="text-xs text-muted-foreground">Đưa đón, tour, giặt ủi, v.v.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Receipt className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Thu phụ phí khác</p>
                      <p className="text-xs text-muted-foreground">Điện, nước, dọn phòng sớm, v.v.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Loại thu tiền</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(COLLECTION_CATEGORIES) as [
                  keyof typeof COLLECTION_CATEGORIES,
                  typeof COLLECTION_CATEGORIES.ROOM,
                ][]).map(([key, cat]) => {
                  const Icon = cat.icon;
                  const isSelected = collectionCategory === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCollectionCategory(key)}
                      className={`
                        relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all cursor-pointer
                        ${isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-muted-foreground/50"
                        }
                      `}
                    >
                      <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${isSelected ? "text-primary" : ""}`}>
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No-Show Warning */}
          {isNoShow && (
            <Alert className="bg-warning/10 border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                <strong>Cảnh báo:</strong> Booking đã được đánh dấu NO-SHOW.
              </AlertDescription>
            </Alert>
          )}

          {/* Show remaining for ROOM type only */}
          {collectionCategory === "ROOM" && (
            <>
              {isNegativeRemaining && (
                <Alert className="bg-destructive/10 border-destructive/30">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-destructive">
                    <strong>Cảnh báo:</strong> Booking đã thu vượt {formatCurrency(Math.abs(remainingAmount))}.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                <Label>Còn phải thu (tiền phòng)</Label>
                <p className={`text-lg font-semibold ${remainingAmount < 0 ? "text-destructive" : remainingAmount === 0 ? "text-success" : "text-primary"}`}>
                  {formatCurrency(remainingAmount)}
                </p>
              </div>
            </>
          )}

          {/* Service Order Selection (required for SERVICE) */}
          {collectionCategory === "SERVICE" && (
            <div className="grid gap-2">
              <Label>
                Đơn dịch vụ <span className="text-destructive">*</span>
              </Label>
              {serviceOrdersForPayment.length === 0 ? (
                <Alert className="bg-muted">
                  <Info className="h-4 w-4" />
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
              <p className="text-xs text-muted-foreground">
                Thu tiền dịch vụ sẽ được gán đúng vào đơn dịch vụ đã chọn.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="amount">Số tiền thu</Label>
            <CurrencyInput
              id="amount"
              value={amount}
              onChange={setAmount}
              placeholder="Nhập số tiền"
            />
          </div>

          {/* Overpay Warning - only for ROOM */}
          {isOverpaying && (
            <Alert className="bg-warning/10 border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                <strong>Cảnh báo:</strong> Thu vượt {formatCurrency(parsedAmount - remainingAmount)} ({overpayPercent.toFixed(1)}%).
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="paymentMethod">Phương thức thanh toán</Label>
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

          {/* Link Provider Selection - only when PAYMENT_LINK and ROOMRISE */}
          {paymentMethod === "PAYMENT_LINK" && collectorType === "ROOMRISE" && (
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label>
                  Đơn vị cung cấp link <span className="text-destructive">*</span>
                </Label>
                <Select value={linkProvider} onValueChange={setLinkProvider}>
                  <SelectTrigger className={!linkProvider ? "border-warning" : ""}>
                    <SelectValue placeholder="Chọn đơn vị..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_PROVIDER_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex items-center gap-2">
                          <PaymentMethodIcon code={p.value} className="h-4 w-4 text-muted-foreground" />
                          {p.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Chọn đơn vị cung cấp link thanh toán để hệ thống mapping đúng tài khoản nhận tiền.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentLinkUrl">
                  Link thanh toán
                </Label>
                <div className="relative">
                  <ExternalLink className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="paymentLinkUrl"
                    type="url"
                    value={paymentLinkUrl}
                    onChange={(e) => setPaymentLinkUrl(e.target.value)}
                    placeholder="https://pay.onepay.vn/..."
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Dán link thanh toán đã gửi cho khách để lưu lịch sử đối soát.
                </p>
              </div>
            </div>
          )}

          {/* Collector Type Selection */}
          <div className="grid gap-2">
            <Label>Người thu tiền</Label>
            <Select
              value={collectorType}
              onValueChange={(value: CollectorType) => setCollectorType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getCollectorOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conditional: Select specific Host */}
          {collectorType === "HOST" && (
            <div className="grid gap-2">
              <Label>
                Chọn Chủ nhà <span className="text-destructive">*</span>
              </Label>
              {bookingHosts.length === 0 ? (
                <Alert className="bg-muted">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Chưa có Host nào liên quan đến booking này. Vui lòng phân bổ phòng trước.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedHostId} onValueChange={setSelectedHostId}>
                  <SelectTrigger className={!selectedHostId ? "border-warning" : ""}>
                    <SelectValue placeholder="Chọn Host..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bookingHosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>
                        <div className="flex items-center gap-2">
                          <Home className="h-4 w-4 text-muted-foreground" />
                          {host.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Chỉ hiển thị Host đã gán trong Segment của booking này.
              </p>
            </div>
          )}

          {/* Conditional: Select specific Service Partner */}
          {collectorType === "SERVICE_PARTNER" && (
            <div className="grid gap-2">
              <Label>
                Chọn Đối tác dịch vụ <span className="text-destructive">*</span>
              </Label>
              {servicePartners.length === 0 ? (
                <Alert className="bg-muted">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Chưa có Đối tác dịch vụ nào liên quan đến booking này. Vui lòng tạo Đơn dịch vụ trước.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  <SelectTrigger className={!selectedPartnerId ? "border-warning" : ""}>
                    <SelectValue placeholder="Chọn Đối tác..." />
                  </SelectTrigger>
                  <SelectContent>
                    {servicePartners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {partner.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Chỉ hiển thị Đối tác có Đơn dịch vụ trong booking này.
              </p>
            </div>
          )}

          {/* Info alert for non-Roomrise collectors */}
          {collectorType !== "ROOMRISE" && (
            <Alert className="bg-info/100/10 border-info/20">
              <Info className="h-4 w-4 text-info" />
              <AlertDescription className="text-sm">
                Khoản thu này sẽ <strong>KHÔNG</strong> ghi nhận tiền về Roomrise.
                {collectorType === "HOST" && " Tiền được ghi nhận là khách trả trực tiếp cho Host."}
                {collectorType === "SERVICE_PARTNER" && " Tiền được ghi nhận là khách trả trực tiếp cho Đối tác dịch vụ."}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="note">
              Ghi chú {requiresNote && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                collectionCategory === "EXTRA"
                  ? "Mô tả phụ phí (bắt buộc)"
                  : collectionCategory === "SERVICE"
                    ? "Mô tả dịch vụ thu tiền (bắt buộc)"
                    : requiresNote
                      ? "Bắt buộc ghi chú khi thu vượt hoặc No-Show"
                      : "Ghi chú (tuỳ chọn)"
              }
              className={requiresNote && !note.trim() ? "border-warning" : ""}
            />
          </div>

          {/* Receipt Upload */}
          <div className="grid gap-2">
            <Label>Ảnh chứng từ</Label>
            <ReceiptUpload
              value={receiptImage}
              onChange={setReceiptImage}
              folderPath={`collections/${unifiedBookingId}`}
            />
          </div>

          {/* Confirmation checkboxes */}
          {isOverpaying && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="confirmOverpay"
                checked={confirmOverpay}
                onCheckedChange={(checked) => setConfirmOverpay(checked === true)}
              />
              <Label htmlFor="confirmOverpay" className="text-sm font-normal cursor-pointer">
                Tôi xác nhận thu vượt số tiền còn phải thu
              </Label>
            </div>
          )}

          {isNoShow && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="confirmNoShow"
                checked={confirmNoShow}
                onCheckedChange={(checked) => setConfirmNoShow(checked === true)}
              />
              <Label htmlFor="confirmNoShow" className="text-sm font-normal cursor-pointer">
                Tôi xác nhận thu tiền cho booking No-Show
              </Label>
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createCollectionMutation.isPending || !canSubmit}
          >
            {createCollectionMutation.isPending ? "Đang xử lý..." : "Xác nhận thu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

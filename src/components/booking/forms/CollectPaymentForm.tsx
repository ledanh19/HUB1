import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
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

interface CollectPaymentFormProps {
  unifiedBookingId: string;
  remainingAmount: number;
  bookingStatus?: string;
  stayStatus?: string;
  paymentType?: string;
  defaultCategory?: "ROOM" | "EXTRA" | "SERVICE";
  lockCategory?: boolean;
  onComplete: () => void;
}

const COLLECTION_CATEGORIES = {
  ROOM: { label: "Tiền phòng", icon: Home, description: "Thu tiền lưu trú theo booking" },
  EXTRA: { label: "Phụ phí khác", icon: Receipt, description: "Thu phụ phí phát sinh" },
  SERVICE: { label: "Dịch vụ", icon: Plane, description: "Thu tiền dịch vụ" },
};

type CollectorType = "ROOMRISE" | "HOST" | "SERVICE_PARTNER";

export function CollectPaymentForm({
  unifiedBookingId,
  remainingAmount,
  bookingStatus,
  stayStatus,
  paymentType,
  defaultCategory,
  lockCategory = false,
  onComplete,
}: CollectPaymentFormProps) {
  const isOtaCollect = paymentType === "OTA_COLLECT";
  const resolvedDefaultCategory: "ROOM" | "EXTRA" | "SERVICE" = defaultCategory ?? (isOtaCollect ? "EXTRA" : "ROOM");

  const [collectionCategory, setCollectionCategory] = useState<"ROOM" | "EXTRA" | "SERVICE">(resolvedDefaultCategory);
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
  const isInitialized = useRef(false);

  // Fetch hosts from booking segments
  const { data: bookingHosts = [] } = useQuery({
    queryKey: ["booking-hosts", unifiedBookingId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_supply_segments")
        .select(`partner_id, partners:partner_id (id, partner_name)`)
        .eq("unified_booking_id", unifiedBookingId);
      if (error) throw error;
      const hostsMap = new Map<string, { id: string; name: string }>();
      data?.forEach((segment: any) => {
        if (segment.partners) {
          hostsMap.set(segment.partners.id, { id: segment.partners.id, name: segment.partners.partner_name });
        }
      });
      return Array.from(hostsMap.values());
    },
  });

  const { data: serviceOrdersForPayment = [] } = useQuery({
    queryKey: ["booking-service-orders-for-payment", unifiedBookingId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`id, sale_price, service_date_time, status, service_catalog(service_name, service_type), partners(partner_name)`)
        .eq("unified_booking_id", unifiedBookingId)
        .order("service_date_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: servicePartners = [] } = useQuery({
    queryKey: ["booking-service-partners", unifiedBookingId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`partner_id, partners:partner_id (id, partner_name)`)
        .eq("unified_booking_id", unifiedBookingId);
      if (error) throw error;
      const partnersMap = new Map<string, { id: string; name: string }>();
      data?.forEach((order: any) => {
        if (order.partners) {
          partnersMap.set(order.partners.id, { id: order.partners.id, name: order.partners.partner_name });
        }
      });
      return Array.from(partnersMap.values());
    },
  });

  // Initialize amount
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      if (resolvedDefaultCategory === "ROOM" && remainingAmount > 0) {
        setAmount(remainingAmount.toString());
      }
    }
  }, []);

  useEffect(() => {
    if (collectionCategory === "ROOM" && remainingAmount > 0) {
      setAmount(remainingAmount.toString());
    } else if (collectionCategory === "EXTRA" || collectionCategory === "SERVICE") {
      setAmount("");
    }
  }, [collectionCategory, remainingAmount]);

  useEffect(() => { setSelectedHostId(""); setSelectedPartnerId(""); }, [collectorType]);
  useEffect(() => { if (paymentMethod !== "PAYMENT_LINK") { setLinkProvider(""); setPaymentLinkUrl(""); } }, [paymentMethod]);
  useEffect(() => { if (collectionCategory !== "SERVICE") setSelectedServiceOrderId(""); }, [collectionCategory]);
  useEffect(() => { if (collectionCategory === "ROOM" && collectorType === "SERVICE_PARTNER") setCollectorType("ROOMRISE"); }, [collectionCategory, collectorType]);

  const parsedAmount = parseFloat(amount) || 0;
  const isOverpaying = collectionCategory === "ROOM" && parsedAmount > remainingAmount && remainingAmount > 0;
  const overpayPercent = remainingAmount > 0 ? ((parsedAmount - remainingAmount) / remainingAmount) * 100 : 0;
  const isNoShow = bookingStatus === "NO_SHOW" || stayStatus === "NO_SHOW";
  const isNegativeRemaining = remainingAmount < 0;
  const requiresNote = isOverpaying || isNoShow || collectionCategory === "EXTRA" || collectionCategory === "SERVICE";

  const collectorValid = collectorType === "ROOMRISE" || (collectorType === "HOST" && selectedHostId) || (collectorType === "SERVICE_PARTNER" && selectedPartnerId);
  const linkProviderValid = paymentMethod !== "PAYMENT_LINK" || collectorType !== "ROOMRISE" || !!linkProvider;
  const serviceOrderValid = collectionCategory !== "SERVICE" || !!selectedServiceOrderId;

  const canSubmit = parsedAmount > 0 && collectorValid && linkProviderValid && serviceOrderValid &&
    (!isOverpaying || confirmOverpay) && (!isNoShow || confirmNoShow) && (!requiresNote || note.trim().length > 0);

  const selectedServiceOrder = collectionCategory === "SERVICE"
    ? serviceOrdersForPayment.find((o: any) => o.id === selectedServiceOrderId) || null : null;

  const formatCurrency = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payeeType = collectorType === "ROOMRISE" ? "ROOMRISE" : collectorType === "HOST" ? "HOST" : "SERVICE_PARTNER";
    const collectorId = collectorType === "HOST" ? selectedHostId : collectorType === "SERVICE_PARTNER" ? selectedPartnerId : null;

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

    onComplete();
  };

  const getCollectorOptions = () => {
    const options: { value: CollectorType; label: string; icon: React.ElementType }[] = [
      { value: "ROOMRISE", label: "Roomrise", icon: Building },
      { value: "HOST", label: "Host (Chủ nhà)", icon: Home },
    ];
    if (collectionCategory === "SERVICE") {
      options.push({ value: "SERVICE_PARTNER", label: "Đối tác dịch vụ", icon: User });
    }
    return options;
  };

  return (
    <MobileTaskPage
      title="Thu tiền"
      onBack={onComplete}
      onSubmit={handleSubmit}
      submitLabel="Xác nhận thu"
      submitDisabled={!canSubmit}
      isSubmitting={createCollectionMutation.isPending}
    >
      {/* Category selection */}
      {isOtaCollect || lockCategory ? (
        <div className="space-y-3">
          {isOtaCollect && (
            <Alert className="bg-info/10 border-info/20">
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
            {(Object.entries(COLLECTION_CATEGORIES) as [keyof typeof COLLECTION_CATEGORIES, typeof COLLECTION_CATEGORIES.ROOM][]).map(([key, cat]) => {
              const Icon = cat.icon;
              const isSelected = collectionCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCollectionCategory(key)}
                  className={`relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all cursor-pointer
                    ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-muted-foreground/50"}`}
                >
                  <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${isSelected ? "text-primary" : ""}`}>{cat.label}</span>
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

      {/* Remaining for ROOM */}
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

      {/* Service Order Selection */}
      {collectionCategory === "SERVICE" && (
        <div className="grid gap-2">
          <Label>Đơn dịch vụ <span className="text-destructive">*</span></Label>
          {serviceOrdersForPayment.length === 0 ? (
            <Alert className="bg-muted"><Info className="h-4 w-4" /><AlertDescription>Chưa có đơn dịch vụ nào.</AlertDescription></Alert>
          ) : (
            <Select value={selectedServiceOrderId} onValueChange={setSelectedServiceOrderId}>
              <SelectTrigger className={!selectedServiceOrderId ? "border-warning" : ""}><SelectValue placeholder="Chọn đơn dịch vụ..." /></SelectTrigger>
              <SelectContent>
                {serviceOrdersForPayment.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.service_catalog?.service_name || "Dịch vụ"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(o.service_date_time).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
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
      <div className="grid gap-2">
        <Label htmlFor="amount">Số tiền thu</Label>
        <CurrencyInput id="amount" value={amount} onChange={setAmount} placeholder="Nhập số tiền" />
      </div>

      {/* Overpay Warning */}
      {isOverpaying && (
        <Alert className="bg-warning/10 border-warning/30">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Cảnh báo:</strong> Thu vượt {formatCurrency(parsedAmount - remainingAmount)} ({overpayPercent.toFixed(1)}%).
          </AlertDescription>
        </Alert>
      )}

      {/* Payment method */}
      <div className="grid gap-2">
        <Label>Phương thức thanh toán</Label>
        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {HOTEL_COLLECT_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <div className="flex items-center gap-2">
                  <PaymentMethodIcon code={m.value} className="h-4 w-4 text-muted-foreground" />{m.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Link Provider */}
      {paymentMethod === "PAYMENT_LINK" && collectorType === "ROOMRISE" && (
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Đơn vị cung cấp link <span className="text-destructive">*</span></Label>
            <Select value={linkProvider} onValueChange={setLinkProvider}>
              <SelectTrigger className={!linkProvider ? "border-warning" : ""}><SelectValue placeholder="Chọn đơn vị..." /></SelectTrigger>
              <SelectContent>
                {LINK_PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2"><PaymentMethodIcon code={p.value} className="h-4 w-4 text-muted-foreground" />{p.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="paymentLinkUrl">Link thanh toán</Label>
            <div className="relative">
              <ExternalLink className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="paymentLinkUrl" type="url" value={paymentLinkUrl} onChange={(e) => setPaymentLinkUrl(e.target.value)} placeholder="https://pay.onepay.vn/..." className="pl-10" />
            </div>
          </div>
        </div>
      )}

      {/* Collector type */}
      <div className="grid gap-2">
        <Label>Người thu tiền</Label>
        <Select value={collectorType} onValueChange={(value: CollectorType) => setCollectorType(value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {getCollectorOptions().map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2"><option.icon className="h-4 w-4" />{option.label}</div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Select specific Host */}
      {collectorType === "HOST" && (
        <div className="grid gap-2">
          <Label>Chọn Chủ nhà <span className="text-destructive">*</span></Label>
          {bookingHosts.length === 0 ? (
            <Alert className="bg-muted"><Info className="h-4 w-4" /><AlertDescription>Chưa có Host nào. Phân bổ phòng trước.</AlertDescription></Alert>
          ) : (
            <Select value={selectedHostId} onValueChange={setSelectedHostId}>
              <SelectTrigger className={!selectedHostId ? "border-warning" : ""}><SelectValue placeholder="Chọn Host..." /></SelectTrigger>
              <SelectContent>
                {bookingHosts.map((host) => (
                  <SelectItem key={host.id} value={host.id}>
                    <div className="flex items-center gap-2"><Home className="h-4 w-4 text-muted-foreground" />{host.name}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Select specific Service Partner */}
      {collectorType === "SERVICE_PARTNER" && (
        <div className="grid gap-2">
          <Label>Chọn Đối tác dịch vụ <span className="text-destructive">*</span></Label>
          {servicePartners.length === 0 ? (
            <Alert className="bg-muted"><Info className="h-4 w-4" /><AlertDescription>Chưa có đối tác.</AlertDescription></Alert>
          ) : (
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger className={!selectedPartnerId ? "border-warning" : ""}><SelectValue placeholder="Chọn Đối tác..." /></SelectTrigger>
              <SelectContent>
                {servicePartners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{partner.name}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Info for non-Roomrise */}
      {collectorType !== "ROOMRISE" && (
        <Alert className="bg-info/10 border-info/20">
          <Info className="h-4 w-4 text-info" />
          <AlertDescription className="text-sm">
            Khoản thu này sẽ <strong>KHÔNG</strong> ghi nhận tiền về Roomrise.
            {collectorType === "HOST" && " Tiền được ghi nhận là khách trả trực tiếp cho Host."}
            {collectorType === "SERVICE_PARTNER" && " Tiền được ghi nhận là khách trả trực tiếp cho Đối tác dịch vụ."}
          </AlertDescription>
        </Alert>
      )}

      {/* Note */}
      <div className="grid gap-2">
        <Label htmlFor="note">Ghi chú {requiresNote && <span className="text-destructive">*</span>}</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            collectionCategory === "EXTRA" ? "Mô tả phụ phí (bắt buộc)" :
            collectionCategory === "SERVICE" ? "Mô tả dịch vụ thu tiền (bắt buộc)" :
            requiresNote ? "Bắt buộc ghi chú khi thu vượt hoặc No-Show" : "Ghi chú (tuỳ chọn)"
          }
          className={requiresNote && !note.trim() ? "border-warning" : ""}
        />
      </div>

      {/* Receipt Upload */}
      <div className="grid gap-2">
        <Label>Ảnh chứng từ</Label>
        <ReceiptUpload value={receiptImage} onChange={setReceiptImage} folderPath={`collections/${unifiedBookingId}`} />
      </div>

      {/* Confirmations */}
      {isOverpaying && (
        <div className="flex items-center space-x-2">
          <Checkbox id="confirmOverpay" checked={confirmOverpay} onCheckedChange={(checked) => setConfirmOverpay(checked === true)} />
          <Label htmlFor="confirmOverpay" className="text-sm font-normal cursor-pointer">Tôi xác nhận thu vượt số tiền còn phải thu</Label>
        </div>
      )}
      {isNoShow && (
        <div className="flex items-center space-x-2">
          <Checkbox id="confirmNoShow" checked={confirmNoShow} onCheckedChange={(checked) => setConfirmNoShow(checked === true)} />
          <Label htmlFor="confirmNoShow" className="text-sm font-normal cursor-pointer">Tôi xác nhận thu tiền cho booking No-Show</Label>
        </div>
      )}
    </MobileTaskPage>
  );
}

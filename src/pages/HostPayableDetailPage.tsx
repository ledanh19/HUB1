import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getHostPayableStatusVariant } from "@/constants/status-config";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/BackButton";
import { HostPayableDetailSection } from "@/components/host-payables/HostPayableDetailSection";
import { RecordPaymentDialog } from "@/components/host-payables/RecordPaymentDialog";
import { useHostPayments } from "@/hooks/useHostPayments";
import { useCanManageDeposits } from "@/hooks/useHostDeposits";
import { supabase } from "@/integrations/supabase/client";
import { fetchPayablePaymentTruth } from "@/hooks/useHostPayablesEnhanced";
import { Loader2, ExternalLink, Calendar, Building2, Banknote, Plus, CreditCard } from "lucide-react";
import { format } from "date-fns";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "PAID": return "Đã thanh toán";
    case "PENDING": return "Chờ thanh toán";
    case "OVERDUE": return "Quá hạn";
    case "PARTIAL": return "Thanh toán một phần";
    default: return status;
  }
};

const getPaymentMethodLabel = (method: string) => {
  switch (method) {
    case "BANK_TRANSFER": return "Chuyển khoản";
    case "CASH": return "Tiền mặt";
    case "OTHER": return "Khác";
    default: return method;
  }
};

export default function HostPayableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const { data: payable, isLoading } = useQuery({
    queryKey: ["host-payable-detail", id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_payables")
        .select("*, partners(partner_name)")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: stay } = useQuery({
    queryKey: ["stay-for-payable", payable?.unified_booking_id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stays")
        .select("*")
        .eq("unified_booking_id", payable?.unified_booking_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!payable?.unified_booking_id,
  });

  // Fetch segments breakdown for this booking + partner
  const { data: segments = [] } = useQuery({
    queryKey: ["segments-for-payable", payable?.unified_booking_id, payable?.partner_id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_supply_segments")
        .select("*")
        .eq("unified_booking_id", payable?.unified_booking_id)
        .eq("partner_id", payable?.partner_id)
        .order("date_from");

      if (error) throw error;
      return data || [];
    },
    enabled: !!payable?.unified_booking_id && !!payable?.partner_id,
  });

  // Fetch extra charges for this booking + partner
  const { data: extraCharges = [] } = useQuery({
    queryKey: ["extra-charges-for-payable", payable?.unified_booking_id, payable?.partner_id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_extra_charges")
        .select("*")
        .eq("unified_booking_id", payable?.unified_booking_id)
        .eq("partner_id", payable?.partner_id)
        .order("created_at");

      if (error) throw error;
      return data || [];
    },
    enabled: !!payable?.unified_booking_id && !!payable?.partner_id,
  });

  // Fetch surcharges for this booking + partner
  const { data: surcharges = [] } = useQuery({
    queryKey: ["surcharges-for-payable", payable?.unified_booking_id, payable?.partner_id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_surcharges")
        .select("*")
        .eq("unified_booking_id", payable?.unified_booking_id)
        .eq("host_partner_id", payable?.partner_id)
        .order("created_at");

      if (error) throw error;
      return data || [];
    },
    enabled: !!payable?.unified_booking_id && !!payable?.partner_id,
  });

  const { data: payments = [] } = useHostPayments(id);
  const { data: canManage } = useCanManageDeposits();

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!payable) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-muted-foreground">Không tìm thấy công nợ</p>
          <BackButton to="/host-payables" label="Quay lại" size="default" />
        </div>
      </>
    );
  }

  // PHASE A FIX: Derive payment truth from source tables, not dead stored fields
  const { data: paymentTruth } = useQuery({
    queryKey: ["host-payable-payment-truth", id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchPayablePaymentTruth(id ? [id] : []),
    enabled: !!id,
  });

  const hasCheckedOut = !!stay?.actual_check_out_at;
  const totalAmount = Number(payable.amount) || 0;
  const paidAmount = paymentTruth?.paidMap.get(id!) || 0;
  const appliedDeposit = paymentTruth?.depositMap.get(id!) || 0;
  const appliedPrepaid = paymentTruth?.prepaidMap.get(id!) || 0;
  const totalApplied = appliedDeposit + appliedPrepaid;
  const remainingAmount = totalAmount - paidAmount - totalApplied;
  const computedStatus = remainingAmount <= 0 ? "PAID" : (paidAmount > 0 || totalApplied > 0) ? "PARTIAL" : "PENDING";

  return (
    <>
      <Header
        title="Chi tiết công nợ Host"
        subtitle={`Booking: ${payable.unified_booking_id}`}
      />

      <PageContainer><SectionCard>
        <div className="flex gap-2">
          <BackButton to="/host-payables" label="Quay lại" size="default" />
          <Button asChild variant="outline">
            <Link to={`/bookings/${payable.unified_booking_id}`}>
              <ExternalLink className="h-4 w-4 mr-2" /> Xem Booking
            </Link>
          </Button>
          {canManage && remainingAmount > 0 && (
            <Button onClick={() => setShowPaymentDialog(true)}>
              <Banknote className="h-4 w-4 mr-2" /> Ghi nhận thanh toán
            </Button>
          )}
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin công nợ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Host</p>
                <p className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {payable.partners?.partner_name || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Số tiền phải trả</p>
                <p className="text-kpi font-semibold tabular-nums tracking-tight text-primary">{formatCurrency(totalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã thanh toán</p>
                <p className="text-base font-semibold text-success">{formatCurrency(paidAmount + totalApplied)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Còn lại</p>
                <p className={`text-base font-semibold ${remainingAmount > 0 ? "text-warning" : "text-success"}`}>
                  {formatCurrency(remainingAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trạng thái</p>
                {/* PHASE A FIX: Use computed status, not dead stored field */}
                <StatusBadge variant={getHostPayableStatusVariant(computedStatus) as any} dot>
                  {getStatusLabel(computedStatus)}
                </StatusBadge>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Hạn thanh toán</p>
                <p className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {payable.due_date ? format(new Date(payable.due_date), "dd/MM/yyyy") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã cấn trừ Deposit</p>
                <p className="font-medium text-info">{formatCurrency(appliedDeposit)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã cấn trừ Prepaid</p>
                <p className="font-medium text-info">{formatCurrency(appliedPrepaid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã thanh toán trực tiếp</p>
                <p className="font-medium text-success">{formatCurrency(paidAmount)}</p>
              </div>
            </div>

            {payable.note && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground">Ghi chú</p>
                <p className="text-xs">{payable.note}</p>
              </div>
            )}

            {!hasCheckedOut && (
              <div className="mt-4 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                <p className="text-xs text-warning">
                  ⚠ Booking chưa check-out. Deposit/Prepaid chỉ có thể cấn trừ sau khi khách check-out.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEGMENT BREAKDOWN - Accounting Grade Detail */}
        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              📐 Chi tiết cấu thành công nợ (Segments + Phụ phí)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Segments Table */}
            {segments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">🛏️ Host Supply Segments</p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="px-3 py-2 text-left">Ngày</th>
                        <th className="px-3 py-2 text-left">Chỗ nghỉ</th>
                        <th className="px-3 py-2 text-left">Phòng</th>
                        <th className="px-3 py-2 text-center">Số đêm</th>
                        <th className="px-3 py-2 text-right">Đơn giá/đêm</th>
                        <th className="px-3 py-2 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {segments.map((seg: any) => (
                        <tr key={seg.id} className="hover:bg-muted/10">
                          <td className="px-3 py-2">
                            {format(new Date(seg.date_from), "dd/MM")} → {format(new Date(seg.date_to), "dd/MM")}
                          </td>
                          <td className="px-3 py-2">{seg.host_property_name || "—"}</td>
                          <td className="px-3 py-2 font-mono">{seg.room_code || "—"}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant="secondary">{seg.nights}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(Number(seg.nightly_rate))}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(seg.total_amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 bg-muted/20">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right font-medium">Tổng tiền phòng</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">
                          {formatCurrency(segments.reduce((sum: number, seg: any) => sum + Number(seg.total_amount), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Extra Charges */}
            {extraCharges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">💵 Phụ phí Host</p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="px-3 py-2 text-left">Loại phụ phí</th>
                        <th className="px-3 py-2 text-left">Ghi chú</th>
                        <th className="px-3 py-2 text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {extraCharges.map((charge: any) => (
                        <tr key={charge.id} className="hover:bg-muted/10">
                          <td className="px-3 py-2">
                            <Badge variant="outline">{charge.charge_type}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{charge.note || "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(charge.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 bg-warning/10">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-right font-medium text-warning">Tổng phụ phí</td>
                        <td className="px-3 py-2 text-right font-bold text-warning">
                          {formatCurrency(extraCharges.reduce((sum: number, c: any) => sum + Number(c.amount), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Surcharges */}
            {surcharges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">🏷️ Phụ thu Host</p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="px-3 py-2 text-left">Loại phụ thu</th>
                        <th className="px-3 py-2 text-left">Mô tả</th>
                        <th className="px-3 py-2 text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {surcharges.map((sur: any) => (
                        <tr key={sur.id} className="hover:bg-muted/10">
                          <td className="px-3 py-2">
                            <Badge variant="outline">{sur.surcharge_type}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{sur.description || "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(sur.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 bg-warning/10">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-right font-medium text-warning">Tổng phụ thu</td>
                        <td className="px-3 py-2 text-right font-bold text-warning">
                          {formatCurrency(surcharges.reduce((sum: number, s: any) => sum + Number(s.amount), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* GRAND TOTAL Formula */}
            <div className="p-4 bg-muted border-2 border-border rounded-lg font-mono text-xs">
              <p className="font-semibold text-foreground mb-2">📐 TỔNG CÔNG NỢ PHẢI TRẢ:</p>
              <div className="flex flex-wrap items-center gap-2 text-foreground">
                <span className="px-2 py-1 bg-white rounded border">
                  Segments: {formatCurrency(segments.reduce((sum: number, seg: any) => sum + Number(seg.total_amount), 0))}
                </span>
                <span>+</span>
                <span className="px-2 py-1 bg-warning/5 rounded border border-warning/20">
                  Phụ phí: {formatCurrency(extraCharges.reduce((sum: number, c: any) => sum + Number(c.amount), 0))}
                </span>
                <span>+</span>
                <span className="px-2 py-1 bg-warning/5 rounded border border-warning/20">
                  Phụ thu: {formatCurrency(surcharges.reduce((sum: number, s: any) => sum + Number(s.amount), 0))}
                </span>
                <span>=</span>
                <span className="px-3 py-1 bg-primary text-primary-foreground rounded font-bold text-base">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Lịch sử thanh toán
              </CardTitle>
              {canManage && remainingAmount > 0 && (
                <Button size="sm" variant="outline" onClick={() => setShowPaymentDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Thanh toán
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Chưa có thanh toán nào</p>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline">
                        {getPaymentMethodLabel(payment.payment_method)}
                      </Badge>
                      <div>
                        <p className="font-medium">{formatCurrency(Number(payment.amount))}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(payment.paid_at), "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                    {payment.payment_method === "BANK_TRANSFER" && (
                      <div className="text-right text-xs">
                        <p className="text-muted-foreground">{payment.bank_name}</p>
                        <p className="font-mono text-xs">{payment.transfer_reference}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deposit/Prepaid Section */}
        <HostPayableDetailSection
          payableId={payable.id}
          partnerId={payable.partner_id}
          unifiedBookingId={payable.unified_booking_id}
          totalAmount={totalAmount}
          paidAmount={paidAmount}
          appliedDepositAmount={appliedDeposit}
          appliedPrepaidAmount={appliedPrepaid}
          hasCheckedOut={hasCheckedOut}
        />
      </SectionCard></PageContainer>

      {/* Payment Dialog */}
      <RecordPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        payableId={payable.id}
        partnerId={payable.partner_id}
        unifiedBookingId={payable.unified_booking_id}
        remainingAmount={remainingAmount}
        partnerName={payable.partners?.partner_name}
      />
    </>
  );
}

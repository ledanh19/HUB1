import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Plus,
  Building2,
  Plane,
  Wallet,
  CircleDollarSign,
  AlertCircle,
  Info,
  FileText,
} from "lucide-react";
import {
  useOutgoingPayments,
  useHostPartnersForPayment,
  useServicePartnersForPayment,
  useHostSettlementsForPayment,
  useServiceSettlementsForPayment,
  useCreateHostSettlementPayment,
  useCreateServiceSettlementPayment,
  useCreateInternalExpense,
  usePaymentStats,
  PaymentType,
  ExpenseCategory,
  PaymentMethod,
  PaymentStatus,
} from "@/hooks/useOutgoingPayments";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { getPaymentStatusVariant } from "@/constants/status-config";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDateTime = (dateString: string) => {
  return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: vi });
};

const paymentTypeLabels: Record<string, string> = {
  HOST_PAYMENT: "Thanh toán Host",
  SERVICE_PARTNER_PAYMENT: "Thanh toán Đối tác DV",
  INTERNAL_EXPENSE: "Chi phí nội bộ",
  GUEST_REFUND: "Hoàn tiền khách",
  OTHER: "Khác",
};

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  SALARY: "Lương nhân sự",
  BHXH_EMPLOYER: "BHXH – Phần doanh nghiệp",
  BHXH_EMPLOYEE: "BHXH – Phần người lao động",
  OTA_COMMISSION: "Hoa hồng OTA",
  OFFICE: "Văn phòng",
  MARKETING: "Marketing",
  BANK_FEE: "Phí ngân hàng",
  TECHNOLOGY: "Công nghệ",
  OTHER: "Khác",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  UPC: "UPC",
  ONEPAY: "OnePay",
  "9PAY": "9Pay",
  VPBANK: "VPBank",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
};



export default function OutgoingPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [filterType, setFilterType] = useState<PaymentType | "ALL">("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<PaymentType>("HOST_PAYMENT");

  // Form state
  const [partnerId, setPartnerId] = useState("");
  const [settlementId, setSettlementId] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("SALARY");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paymentGateway, setPaymentGateway] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  // New fields for internal expense
  const [expensePeriod, setExpensePeriod] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<PaymentStatus>("PAID");

  // URL params for pre-fill
  const urlSettlementId = searchParams.get("settlementId");
  const urlType = searchParams.get("type");

  // Queries
  const { data: payments, isLoading } = useOutgoingPayments({
    paymentType: filterType === "ALL" ? undefined : filterType,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
  });

  const { data: stats } = usePaymentStats(filterDateFrom, filterDateTo);
  const { data: hostPartners } = useHostPartnersForPayment();
  const { data: servicePartners } = useServicePartnersForPayment();
  const { data: hostSettlements } = useHostSettlementsForPayment(partnerId || undefined);
  const { data: serviceSettlements } = useServiceSettlementsForPayment(partnerId || undefined);

  // Also fetch settlements without partner filter for URL pre-fill
  const { data: allHostSettlements } = useHostSettlementsForPayment();
  const { data: allServiceSettlements } = useServiceSettlementsForPayment();

  // Mutations
  const createHostPayment = useCreateHostSettlementPayment();
  const createServicePayment = useCreateServiceSettlementPayment();
  const createInternalExpense = useCreateInternalExpense();

  // Get selected settlement details
  const selectedHostSettlement = hostSettlements?.find((s) => s.id === settlementId);
  const selectedServiceSettlement = serviceSettlements?.find((s) => s.id === settlementId);

  // Handle URL params to auto-open and pre-fill
  useEffect(() => {
    if (urlSettlementId && urlType) {
      // Set payment type based on URL
      if (urlType === "HOST") {
        setPaymentType("HOST_PAYMENT");
        // Find settlement and its partner
        const settlement = allHostSettlements?.find(s => s.id === urlSettlementId);
        if (settlement) {
          setPartnerId(settlement.partner_id);
          setSettlementId(urlSettlementId);
        }
      } else if (urlType === "SERVICE") {
        setPaymentType("SERVICE_PARTNER_PAYMENT");
        const settlement = allServiceSettlements?.find(s => s.id === urlSettlementId);
        if (settlement) {
          setPartnerId(settlement.partner_id);
          setSettlementId(urlSettlementId);
        }
      }
      // Open dialog
      setDialogOpen(true);
      // Clear URL params after processing
      setSearchParams({});
    }
  }, [urlSettlementId, urlType, allHostSettlements, allServiceSettlements, setSearchParams]);

  const resetForm = () => {
    setPartnerId("");
    setSettlementId("");
    setExpenseCategory("SALARY");
    setRecipientName("");
    setAmount("");
    setPaymentMethod("BANK_TRANSFER");
    setPaymentGateway("");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountName("");
    setTransferReference("");
    setPaidAt(new Date().toISOString().split("T")[0]);
    setNote("");
    // Reset new fields
    setExpensePeriod("");
    setConfirmedAt("");
    setExpenseStatus("PAID");
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      return;
    }

    // Validate BHXH requires expense_period
    if (paymentType === "INTERNAL_EXPENSE" &&
      (expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE") &&
      !expensePeriod) {
      toast.error("Vui lòng nhập kỳ BHXH");
      return;
    }

    try {
      if (paymentType === "HOST_PAYMENT") {
        if (!partnerId || !settlementId) return;
        await createHostPayment.mutateAsync({
          partner_id: partnerId,
          settlement_id: settlementId,
          amount: amountNum,
          payment_method: paymentMethod,
          payment_gateway: paymentMethod === "UPC" ? paymentGateway : undefined,
          bank_name: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
          bank_account_number: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
          bank_account_name: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
          transfer_reference: transferReference,
          paid_at: paidAt,
          note,
        });
      } else if (paymentType === "SERVICE_PARTNER_PAYMENT") {
        if (!partnerId || !settlementId) return;
        await createServicePayment.mutateAsync({
          partner_id: partnerId,
          settlement_id: settlementId,
          amount: amountNum,
          payment_method: paymentMethod,
          payment_gateway: paymentMethod === "UPC" ? paymentGateway : undefined,
          bank_name: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
          bank_account_number: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
          bank_account_name: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
          transfer_reference: transferReference,
          paid_at: paidAt,
          note,
        });
      } else if (paymentType === "INTERNAL_EXPENSE") {
        await createInternalExpense.mutateAsync({
          expense_category: expenseCategory,
          recipient_name: recipientName || undefined,
          amount: amountNum,
          payment_method: paymentMethod,
          payment_gateway: paymentMethod === "UPC" ? paymentGateway : undefined,
          bank_name: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
          bank_account_number: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
          bank_account_name: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
          transfer_reference: transferReference,
          paid_at: paidAt,
          note,
          // New fields
          expense_period: expensePeriod || undefined,
          confirmed_at: confirmedAt || undefined,
          status: expenseStatus,
        });
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error handled in mutation
    }
  };

  const isSubmitting = createHostPayment.isPending || createServicePayment.isPending || createInternalExpense.isPending;

  // Validation for max amount - use COMPUTED remaining amounts
  const maxAmount = paymentType === "HOST_PAYMENT" && selectedHostSettlement
    ? Number(selectedHostSettlement.computed_remaining_amount || 0)
    : paymentType === "SERVICE_PARTNER_PAYMENT" && selectedServiceSettlement
      ? Number(selectedServiceSettlement.computed_remaining_amount || 0)
      : Infinity;

  const amountExceedsMax = parseFloat(amount) > maxAmount;

  return (
    <>
      <Header title="Outgoing Payments" subtitle="Quản lý thanh toán đi" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Ghi nhận thanh toán
              </Button>
            </div>

            {/* Warning Banner */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Trang Chi tiền chỉ ghi nhận các <strong>giao dịch tiền Roomrise chi ra</strong>.
                Thanh toán cho Host hoặc Đối tác dịch vụ <strong>bắt buộc gắn Phiếu quyết toán đã chốt</strong>;
                Chi phí nội bộ (bao gồm Lương và BHXH) <strong>không gắn quyết toán</strong> và cần có kỳ chốt để đối soát.
                Trang này không tính công nợ, không tự sinh số tiền và không cập nhật ngược dữ liệu sang các trang khác.
              </AlertDescription>
            </Alert>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard
                title="Thanh toán Host"
                value={formatCurrency(stats?.totalHost || 0)}
                subtitle={`${stats?.countHost || 0} giao dịch`}
                icon={Building2}
              />
              <MetricCard
                title="Thanh toán Đối tác DV"
                value={formatCurrency(stats?.totalServicePartner || 0)}
                subtitle="0 giao dịch"
                icon={Plane}
              />
              <MetricCard
                title="Chi phí nội bộ"
                value={formatCurrency(stats?.totalInternal || 0)}
                subtitle={`${stats?.countInternal || 0} giao dịch`}
                icon={Wallet}
              />
              <MetricCard
                title="Tổng chi"
                value={formatCurrency(stats?.totalAll || 0)}
                icon={CircleDollarSign}
              />
            </div>

            {/* Filters */}
            <FilterBar
              title="Bộ lọc"
              subtitle="Lọc giao dịch chi tiền theo loại và ngày"
              hasActiveFilters={filterType !== "ALL" || !!filterDateFrom || !!filterDateTo}
              onClearFilters={() => { setFilterType("ALL"); setFilterDateFrom(""); setFilterDateTo(""); }}
            >
              <FilterBar.Field label="Loại chi">
                <Select value={filterType} onValueChange={(v) => setFilterType(v as PaymentType | "ALL")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    <SelectItem value="HOST_PAYMENT">Thanh toán Host</SelectItem>
                    <SelectItem value="SERVICE_PARTNER_PAYMENT">Thanh toán Đối tác DV</SelectItem>
                    <SelectItem value="INTERNAL_EXPENSE">Chi phí nội bộ</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>
              <FilterBar.Field label="Từ ngày">
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </FilterBar.Field>
              <FilterBar.Field label="Đến ngày">
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </FilterBar.Field>
            </FilterBar>

            {/* Payments Table */}
            <Card>
              <CardHeader>
                <CardTitle>Danh sách giao dịch chi tiền</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : payments && payments.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ngày TT</TableHead>
                          <TableHead>Loại chi</TableHead>
                          <TableHead>Danh mục</TableHead>
                          <TableHead>Đối tượng nhận</TableHead>
                          <TableHead>Kỳ chi phí</TableHead>
                          <TableHead>Phiếu QT</TableHead>
                          <TableHead className="text-right">Số tiền</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Tham chiếu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((payment) => (
                          <TableRow key={`${payment.source_table}-${payment.id}`}>
                            <TableCell className="whitespace-nowrap">
                              {formatDateTime(payment.paid_at)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  payment.payment_type === "HOST_PAYMENT"
                                    ? "default"
                                    : payment.payment_type === "SERVICE_PARTNER_PAYMENT"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {paymentTypeLabels[payment.payment_type]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {payment.payment_type === "INTERNAL_EXPENSE" && payment.expense_category ? (
                                <Badge variant="outline" className={
                                  payment.expense_category === "BHXH_EMPLOYER" || payment.expense_category === "BHXH_EMPLOYEE"
                                    ? "border-primary/30 text-primary"
                                    : payment.expense_category === "OTA_COMMISSION"
                                      ? "border-warning/30 text-warning"
                                      : ""
                                }>
                                  {expenseCategoryLabels[payment.expense_category]}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {payment.payment_type === "INTERNAL_EXPENSE" ? (
                                <span className="text-sm">{payment.recipient_name || "-"}</span>
                              ) : (
                                <span className="font-medium">{payment.partner_name || "-"}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {payment.expense_period ? (
                                <span className="text-sm">{payment.expense_period}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {payment.settlement_code ? (
                                <Badge variant="outline" className="font-mono">
                                  <FileText className="h-3 w-3 mr-1" />
                                  {payment.settlement_code}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium text-destructive">
                              {formatCurrency(payment.amount)}
                            </TableCell>
                            <TableCell>
                              {payment.payment_type === "INTERNAL_EXPENSE" ? (
                                <StatusBadge variant={getPaymentStatusVariant(payment.status || "PAID") as any}>
                                  {paymentStatusLabels[payment.status || "PAID"]}
                                </StatusBadge>
                              ) : (
                                <StatusBadge variant="success">Đã thanh toán</StatusBadge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {payment.transfer_reference || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Chưa có giao dịch chi tiền nào
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </SectionCard>
      </PageContainer>

      {/* Create Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán / chi tiền</DialogTitle>
            <DialogDescription>
              Chọn loại thanh toán và điền thông tin chi tiết
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Payment Type Selection */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Loại thanh toán *</Label>
              <Select
                value={paymentType}
                onValueChange={(v) => {
                  setPaymentType(v as PaymentType);
                  setPartnerId("");
                  setSettlementId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOST_PAYMENT">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Thanh toán Host
                    </div>
                  </SelectItem>
                  <SelectItem value="SERVICE_PARTNER_PAYMENT">
                    <div className="flex items-center gap-2">
                      <Plane className="h-4 w-4" />
                      Thanh toán Đối tác dịch vụ
                    </div>
                  </SelectItem>
                  <SelectItem value="INTERNAL_EXPENSE">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Chi phí nội bộ
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Fields based on Payment Type */}
            {paymentType === "HOST_PAYMENT" && (
              <>
                <div className="space-y-2">
                  <Label>Host *</Label>
                  <Select value={partnerId} onValueChange={(v) => { setPartnerId(v); setSettlementId(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn Host" />
                    </SelectTrigger>
                    <SelectContent>
                      {hostPartners?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.partner_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {partnerId && (
                  <div className="space-y-2">
                    <Label>Phiếu quyết toán Host *</Label>
                    <Select value={settlementId} onValueChange={setSettlementId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phiếu quyết toán" />
                      </SelectTrigger>
                      <SelectContent>
                        {hostSettlements?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.settlement_code} - Còn lại: {formatCurrency(Number(s.computed_remaining_amount || 0))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedHostSettlement && (
                      <Alert className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Tổng NET: </span>
                              <span className="font-medium">
                                {formatCurrency(Number(selectedHostSettlement.computed_net_amount || 0))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Đã TT (computed): </span>
                              <span className="font-medium text-success">
                                {formatCurrency(Number(selectedHostSettlement.computed_paid_amount || 0))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Còn lại: </span>
                              <span className="font-medium text-destructive">
                                {formatCurrency(Number(selectedHostSettlement.computed_remaining_amount || 0))}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            * Đã TT được tính từ các giao dịch chi tiền liên kết
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </>
            )}

            {paymentType === "SERVICE_PARTNER_PAYMENT" && (
              <>
                <div className="space-y-2">
                  <Label>Đối tác cung cấp dịch vụ *</Label>
                  <Select value={partnerId} onValueChange={(v) => { setPartnerId(v); setSettlementId(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn đối tác" />
                    </SelectTrigger>
                    <SelectContent>
                      {servicePartners?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.partner_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {partnerId && (
                  <div className="space-y-2">
                    <Label>Phiếu quyết toán dịch vụ *</Label>
                    <Select value={settlementId} onValueChange={setSettlementId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phiếu quyết toán" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceSettlements?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.settlement_code} - Còn lại:{" "}
                            {formatCurrency(Number(s.computed_remaining_amount || 0))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedServiceSettlement && (
                      <Alert className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Tổng NET: </span>
                              <span className="font-medium">
                                {formatCurrency(Number(selectedServiceSettlement.computed_net_amount || 0))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Đã TT (computed): </span>
                              <span className="font-medium text-success">
                                {formatCurrency(Number(selectedServiceSettlement.computed_paid_amount || 0))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Còn lại: </span>
                              <span className="font-medium text-destructive">
                                {formatCurrency(Number(selectedServiceSettlement.computed_remaining_amount || 0))}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            * Đã TT được tính từ các giao dịch chi tiền liên kết
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </>
            )}

            {paymentType === "INTERNAL_EXPENSE" && (
              <>
                <Alert variant="default" className="bg-muted">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Chi phí nội bộ <strong>KHÔNG</strong> liên kết với phiếu quyết toán. Cần có kỳ chi phí và ngày chốt để làm căn cứ duyệt chi.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nhóm chi phí *</Label>
                    <Select
                      value={expenseCategory}
                      onValueChange={(v) => setExpenseCategory(v as ExpenseCategory)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SALARY">Lương nhân sự</SelectItem>
                        <SelectItem value="BHXH_EMPLOYER">BHXH – Phần doanh nghiệp</SelectItem>
                        <SelectItem value="BHXH_EMPLOYEE">BHXH – Phần người lao động</SelectItem>
                        <SelectItem value="OTA_COMMISSION">Hoa hồng OTA</SelectItem>
                        <SelectItem value="OFFICE">Văn phòng</SelectItem>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="BANK_FEE">Phí ngân hàng</SelectItem>
                        <SelectItem value="TECHNOLOGY">Công nghệ</SelectItem>
                        <SelectItem value="OTHER">Khác</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Kỳ chi phí {(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE") ? "*" : ""}</Label>
                    <Input
                      type="month"
                      value={expensePeriod}
                      onChange={(e) => setExpensePeriod(e.target.value)}
                      placeholder="VD: 2024-12"
                    />
                    {(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE") && (
                      <p className="text-xs text-muted-foreground">
                        Kỳ BHXH bắt buộc nhập
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    {(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE")
                      ? "Đơn vị nhận (Cơ quan BHXH) *"
                      : "Người nhận / Nhà cung cấp"}
                  </Label>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder={(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE")
                      ? "VD: BHXH Quận 1, Kho bạc Nhà nước..."
                      : "VD: Nguyễn Văn A, Công ty XYZ..."}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      {(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE")
                        ? "Ngày chốt BHXH"
                        : "Ngày chốt (ngày khóa số liệu)"}
                    </Label>
                    <Input
                      type="date"
                      value={confirmedAt}
                      onChange={(e) => setConfirmedAt(e.target.value)}
                    />
                    {(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE") && (
                      <p className="text-xs text-muted-foreground">
                        Ngày xác nhận số phải nộp BHXH
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Trạng thái *</Label>
                    <Select
                      value={expenseStatus}
                      onValueChange={(v) => setExpenseStatus(v as PaymentStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNPAID">Chưa thanh toán</SelectItem>
                        <SelectItem value="PAID">Đã thanh toán</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      * Chỉ "Đã thanh toán" mới ghi nhận vào dòng tiền
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Số tiền *</Label>
                <CurrencyInput
                  value={amount}
                  onChange={setAmount}
                  placeholder="0"
                />
                {amountExceedsMax && (
                  <p className="text-sm text-destructive">
                    Số tiền vượt quá số còn lại ({formatCurrency(maxAmount)})
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ngày thanh toán *</Label>
                <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Phương thức thanh toán *</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Chuyển khoản</SelectItem>
                  <SelectItem value="CASH">Tiền mặt</SelectItem>
                  <SelectItem value="UPC">UPC</SelectItem>
                  <SelectItem value="ONEPAY">OnePay</SelectItem>
                  <SelectItem value="9PAY">9Pay</SelectItem>
                  <SelectItem value="VPBANK">VPBank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "BANK_TRANSFER" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ngân hàng</Label>
                  <Input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="VD: Vietcombank"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Số tài khoản</Label>
                  <Input
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="Số TK người nhận"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Tên tài khoản</Label>
                  <Input
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="Tên chủ TK"
                  />
                </div>
              </div>
            )}

            {paymentMethod === "UPC" && (
              <div className="space-y-2">
                <Label>Cổng thanh toán</Label>
                <Select value={paymentGateway} onValueChange={setPaymentGateway}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cổng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONEPAY">OnePay</SelectItem>
                    <SelectItem value="9PAY">9Pay</SelectItem>
                    <SelectItem value="VPBANK">VPBank</SelectItem>
                    <SelectItem value="OTHER">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Mã tham chiếu (Ref ngân hàng)</Label>
              <Input
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
                placeholder="Mã ủy nhiệm chi, ref..."
              />
            </div>

            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú thêm..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !amount ||
                parseFloat(amount) <= 0 ||
                amountExceedsMax ||
                (paymentType !== "INTERNAL_EXPENSE" && (!partnerId || !settlementId))
              }
            >
              {isSubmitting ? "Đang xử lý..." : "Ghi nhận thanh toán"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

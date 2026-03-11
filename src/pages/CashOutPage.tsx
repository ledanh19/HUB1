import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { FilterBar } from "@/components/ui/filter-bar";
import { PermissionGate } from "@/components/ui/PermissionGate";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  CircleDollarSign,
  Wallet,
  CreditCard,
  Banknote,
  Info,
  ExternalLink,
  AlertTriangle,
  Paperclip,
  Eye,
  X,
  Upload,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReceiptStatusBadge, ReceiptImagePreview, ReceiptUpload, ReceiptThumbnailButton } from "@/components/ui/receipt-upload";
import {
  useCashOuts,
  useCreateCashOut,
  useCashOutStats,
  useUpdateCashOutReceipt,
  PaymentMethod,
  paymentMethodLabels,
} from "@/hooks/useCashOuts";
import { useApprovedRequestsForCashOut, paymentRequestTypeLabels } from "@/hooks/usePaymentRequests";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";

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


function DetailField({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      <p className="font-medium">{value || <span className="text-muted-foreground italic">—</span>}</p>
    </div>
  );
}

export default function CashOutPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRequestId = searchParams.get("requestId");

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | "ALL">("ALL");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paymentGateway, setPaymentGateway] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [isOutOfProcess, setIsOutOfProcess] = useState(false);
  const [outOfProcessReason, setOutOfProcessReason] = useState("");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  // Detail view state
  const [selectedCashOut, setSelectedCashOut] = useState<typeof cashOuts extends (infer T)[] | undefined ? T : never | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Queries
  const cashOutsQuery = useCashOuts({
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    paymentMethod: filterMethod === "ALL" ? undefined : filterMethod,
  });
  const { data: cashOuts, isLoading } = cashOutsQuery;

  usePrefetchMountLog('CashOutPage', [
    { key: ['cash-outs'], query: cashOutsQuery },
  ]);

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(cashOuts ?? [], { defaultPageSize: 10, resetDeps: [filterDateFrom, filterDateTo, filterMethod] });

  const { data: stats } = useCashOutStats(filterDateFrom, filterDateTo);
  const { data: approvedRequests } = useApprovedRequestsForCashOut();

  // Mutations
  const createCashOut = useCreateCashOut();
  const updateReceipt = useUpdateCashOutReceipt();

  // Handle URL params to auto-open dialog with pre-selected request
  useEffect(() => {
    if (urlRequestId && approvedRequests) {
      const request = approvedRequests.find(r => r.id === urlRequestId);
      if (request) {
        setSelectedRequestId(urlRequestId);
        setAmount(String(request.remaining || 0));
        setDialogOpen(true);
        // Clear URL params after processing
        setSearchParams({});
      }
    }
  }, [urlRequestId, approvedRequests, setSearchParams]);

  // Auto-fill amount when selecting a request from dropdown
  useEffect(() => {
    if (selectedRequestId && approvedRequests && !urlRequestId) {
      const request = approvedRequests.find(r => r.id === selectedRequestId);
      if (request) {
        setAmount(String(request.remaining || 0));
      }
    }
  }, [selectedRequestId, approvedRequests, urlRequestId]);

  // Get selected request for amount validation
  const selectedRequest = approvedRequests?.find(r => r.id === selectedRequestId);
  const maxAmount = selectedRequest?.remaining || 0;
  const amountNum = parseFloat(amount) || 0;
  const exceedsMax = !isOutOfProcess && amountNum > maxAmount;

  const resetForm = () => {
    setSelectedRequestId("");
    setAmount("");
    setPaidAt(new Date().toISOString().split("T")[0]);
    setPaymentMethod("BANK_TRANSFER");
    setPaymentGateway("");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountName("");
    setTransferReference("");
    setRecipientName("");
    setIsOutOfProcess(false);
    setOutOfProcessReason("");
    setNote("");
    setAttachments([]);
  };

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

  const handleViewDetail = (cashOut: NonNullable<typeof cashOuts>[number]) => {
    setSelectedCashOut(cashOut);
    setDetailDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedRequestId) {
      toast.error("Vui lòng chọn đề xuất thanh toán");
      return;
    }

    if (amountNum <= 0) {
      toast.error("Vui lòng nhập số tiền chi");
      return;
    }

    if (exceedsMax) {
      toast.error("Số tiền chi vượt quá số còn lại");
      return;
    }

    if (isOutOfProcess && !outOfProcessReason) {
      toast.error("Vui lòng nhập lý do chi ngoài quy trình");
      return;
    }

    try {
      // Upload first image attachment to Storage (receipt_image is single column)
      let receiptImagePath: string | undefined;
      const imageFile = attachments.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `receipts/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('payment-receipts')
          .upload(fileName, imageFile, { cacheControl: '3600', upsert: false });
        if (uploadError) {
          toast.error('Lỗi tải ảnh chứng từ: ' + uploadError.message);
          return;
        }
        receiptImagePath = uploadData.path;
      }

      await createCashOut.mutateAsync({
        payment_request_id: selectedRequestId,
        amount: amountNum,
        paid_at: paidAt,
        payment_method: paymentMethod,
        payment_gateway: paymentMethod === "UPC" ? paymentGateway : undefined,
        bank_name: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
        bank_account_number: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
        bank_account_name: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
        transfer_reference: transferReference || undefined,
        recipient_name: recipientName || undefined,
        is_out_of_process: isOutOfProcess,
        out_of_process_reason: isOutOfProcess ? outOfProcessReason : undefined,
        note: note || undefined,
        receipt_image: receiptImagePath,
        receipt_status: receiptImagePath ? 'UPLOADED' : undefined,
      });

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error handled in mutation
    }
  };

  const isSubmitting = createCashOut.isPending;

  return (
    <>
      <Header
        title="Chi tiền"
        subtitle="Ghi nhận các giao dịch tiền đã chi ra thực tế"
        actions={
          <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
            <Wallet className="h-4 w-4" />
            Ghi nhận chi tiền
          </Button>
        }
      />

      <PageContainer>
        <SectionCard>

          {/* Warning Banner */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Trang Chi tiền <strong>chỉ ghi nhận các giao dịch tiền đã chi ra thực tế</strong>.
              Mỗi giao dịch <strong>bắt buộc liên kết với Đề xuất thanh toán đã duyệt</strong>.
              Không cho nhập vượt số tiền đã duyệt (trừ trường hợp chi ngoài quy trình).
            </AlertDescription>
          </Alert>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Tổng đã chi"
              value={formatCurrency(stats?.totalAmount || 0)}
              subtitle={`${stats?.totalCount || 0} giao dịch`}
              icon={CircleDollarSign}
              valueClassName="text-destructive"
            />
            <MetricCard
              title="Chuyển khoản"
              value={formatCurrency(stats?.byMethod?.BANK_TRANSFER?.amount || 0)}
              subtitle={`${stats?.byMethod?.BANK_TRANSFER?.count || 0} giao dịch`}
              icon={CreditCard}
              valueClassName="text-primary"
            />
            <MetricCard
              title="Tiền mặt"
              value={formatCurrency(stats?.byMethod?.CASH?.amount || 0)}
              subtitle={`${stats?.byMethod?.CASH?.count || 0} giao dịch`}
              icon={Banknote}
              valueClassName="text-success"
            />
            <MetricCard
              title="Ví điện tử"
              value={formatCurrency(
                (stats?.byMethod?.UPC?.amount || 0) +
                (stats?.byMethod?.ONEPAY?.amount || 0) +
                (stats?.byMethod?.["9PAY"]?.amount || 0) +
                (stats?.byMethod?.VPBANK?.amount || 0)
              )}
              icon={Wallet}
              valueClassName="text-primary"
            />
          </div>

          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Lọc giao dịch chi tiền"
            hasActiveFilters={filterDateFrom !== "" || filterDateTo !== "" || filterMethod !== "ALL"}
            onClearFilters={() => {
              setFilterDateFrom("");
              setFilterDateTo("");
              setFilterMethod("ALL");
            }}
          >
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
            <FilterBar.Field label="Phương thức">
              <Select value={filterMethod} onValueChange={(v) => setFilterMethod(v as PaymentMethod | "ALL")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  {Object.entries(paymentMethodLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>

          {/* Cash Outs Table */}
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
              ) : cashOuts && cashOuts.length > 0 ? (
                <div>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-2">
                    {paginatedData.map((cashOut) => (
                      <div
                        key={cashOut.id}
                        className="rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors"
                        onClick={() => handleViewDetail(cashOut)}
                      >
                        {/* Row 1: Type + Amount */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {cashOut.payment_type ? paymentRequestTypeLabels[cashOut.payment_type as keyof typeof paymentRequestTypeLabels] : "-"}
                          </span>
                          <span className="font-bold text-sm tabular-nums text-destructive">
                            {formatCurrency(cashOut.amount)}
                          </span>
                        </div>
                        {/* Row 2: Partner + Method */}
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                          <span className="truncate">{cashOut.partner_name || cashOut.recipient_name || "-"}</span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {paymentMethodLabels[cashOut.payment_method]}
                          </Badge>
                        </div>
                        {/* Row 3: Request code + Date */}
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{cashOut.request_code || "—"}</span>
                          <span>{formatDateTime(cashOut.paid_at)}</span>
                        </div>
                        {/* Row 4: Flags */}
                        {(cashOut.is_out_of_process || cashOut.note) && (
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            {cashOut.is_out_of_process && (
                              <Badge variant="destructive" className="text-[10px]">Ngoài QT</Badge>
                            )}
                            {cashOut.note && (
                              <span className="text-muted-foreground truncate">{cashOut.note}</span>
                            )}
                          </div>
                        )}
                        {/* Row 5: Actions */}
                        <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                            onClick={(e) => { e.stopPropagation(); handleViewDetail(cashOut); }}>
                            <Eye className="h-3 w-3" /> Chi tiết
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px] sticky left-0 bg-background z-10"></TableHead>
                          <TableHead className="w-[140px]">Ngày chi</TableHead>
                          <TableHead className="w-[120px]">Đề xuất</TableHead>
                          <TableHead className="w-[120px]">Loại chi</TableHead>
                          <TableHead className="w-[140px]">Đối tượng</TableHead>
                          <TableHead className="text-right w-[130px]">Số tiền</TableHead>
                          <TableHead className="w-[120px]">Phương thức</TableHead>
                          <TableHead className="w-[100px]">Chứng từ</TableHead>
                          <TableHead className="w-[120px]">Tham chiếu</TableHead>
                          <TableHead className="w-[160px]">Ghi chú</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedData.map((cashOut) => (
                          <TableRow
                            key={cashOut.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleViewDetail(cashOut)}
                          >
                            <TableCell className="sticky left-0 bg-background z-10">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewDetail(cashOut);
                                      }}
                                    >
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Xem chi tiết</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>{formatDateTime(cashOut.paid_at)}</TableCell>
                            <TableCell>
                              {cashOut.request_code ? (
                                <Link
                                  to="/payments/requests"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cashOut.request_code}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {cashOut.payment_type ? paymentRequestTypeLabels[cashOut.payment_type as keyof typeof paymentRequestTypeLabels] : "-"}
                            </TableCell>
                            <TableCell>{cashOut.partner_name || cashOut.recipient_name || "-"}</TableCell>
                            <TableCell className="text-right font-medium text-destructive">
                              {formatCurrency(cashOut.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {paymentMethodLabels[cashOut.payment_method]}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {cashOut.receipt_image ? (
                                <ReceiptThumbnailButton imagePath={cashOut.receipt_image} />
                              ) : (
                                <ReceiptStatusBadge status={cashOut.receipt_status} hasImage={false} />
                              )}
                            </TableCell>
                            <TableCell>{cashOut.transfer_reference || "-"}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {cashOut.is_out_of_process && (
                                <Badge variant="destructive" className="mr-2">Ngoài quy trình</Badge>
                              )}
                              {cashOut.note || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <DataTablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    displayedItems={displayedCount}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="phiếu chi"
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CircleDollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có giao dịch chi tiền nào</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Create Dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ghi nhận chi tiền</DialogTitle>
                <DialogDescription>
                  Ghi nhận giao dịch tiền đã chi ra thực tế, liên kết với đề xuất đã duyệt
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Select Payment Request */}
                <div className="space-y-2">
                  <Label>Chọn đề xuất thanh toán *</Label>
                  <Select value={selectedRequestId} onValueChange={setSelectedRequestId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn đề xuất đã duyệt" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedRequests?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.request_code} - {r.partner_name || paymentRequestTypeLabels[r.payment_type as keyof typeof paymentRequestTypeLabels]} - Còn lại: {formatCurrency(r.remaining)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRequest && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Số tiền đề xuất</p>
                        <p className="font-medium">{formatCurrency(selectedRequest.proposed_amount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Đã chi</p>
                        <p className="font-medium">{formatCurrency(selectedRequest.total_paid)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Còn lại</p>
                        <p className="font-medium text-primary">{formatCurrency(selectedRequest.remaining)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div className="space-y-2">
                  <Label>Số tiền chi *</Label>
                  <CurrencyInput
                    placeholder="0"
                    value={amount}
                    onChange={setAmount}
                    disabled={!!selectedRequest && !isOutOfProcess}
                    className={!!selectedRequest && !isOutOfProcess ? "bg-muted" : ""}
                  />
                  {!!selectedRequest && !isOutOfProcess && (
                    <p className="text-xs text-muted-foreground">
                      Số tiền được khóa theo đề xuất. Bật "Chi ngoài quy trình" nếu cần thay đổi.
                    </p>
                  )}
                  {exceedsMax && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Số tiền vượt quá số còn lại ({formatCurrency(maxAmount)})
                    </p>
                  )}
                </div>

                {/* Out of Process Flag */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="outOfProcess"
                    checked={isOutOfProcess}
                    onCheckedChange={(checked) => setIsOutOfProcess(checked === true)}
                  />
                  <label
                    htmlFor="outOfProcess"
                    className="text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Chi ngoài quy trình (vượt số đã duyệt)
                  </label>
                </div>

                {isOutOfProcess && (
                  <div className="space-y-2">
                    <Label>Lý do chi ngoài quy trình *</Label>
                    <Textarea
                      placeholder="Nhập lý do chi vượt số tiền đã duyệt"
                      value={outOfProcessReason}
                      onChange={(e) => setOutOfProcessReason(e.target.value)}
                    />
                  </div>
                )}

                {/* Payment Date */}
                <div className="space-y-2">
                  <Label>Ngày chi *</Label>
                  <Input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                  />
                </div>

                {/* Payment Method */}
                <div className="space-y-2">
                  <Label>Phương thức thanh toán *</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(paymentMethodLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Bank Details for Bank Transfer */}
                {paymentMethod === "BANK_TRANSFER" && (
                  <>
                    <div className="space-y-2">
                      <Label>Tên ngân hàng</Label>
                      <Input
                        placeholder="VD: Vietcombank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Số tài khoản</Label>
                        <Input
                          placeholder="Số tài khoản"
                          value={bankAccountNumber}
                          onChange={(e) => setBankAccountNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tên chủ tài khoản</Label>
                        <Input
                          placeholder="Tên chủ tài khoản"
                          value={bankAccountName}
                          onChange={(e) => setBankAccountName(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Gateway for UPC */}
                {paymentMethod === "UPC" && (
                  <div className="space-y-2">
                    <Label>Cổng thanh toán</Label>
                    <Select value={paymentGateway} onValueChange={setPaymentGateway}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn cổng" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9PAY">9Pay</SelectItem>
                        <SelectItem value="ONEPAY">OnePay</SelectItem>
                        <SelectItem value="VPBANK">VPBank</SelectItem>
                        <SelectItem value="OTHER">Khác</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Transfer Reference */}
                <div className="space-y-2">
                  <Label>Mã tham chiếu / UNC</Label>
                  <Input
                    placeholder="Mã giao dịch / Số UNC"
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                  />
                </div>

                {/* Recipient */}
                <div className="space-y-2">
                  <Label>Người nhận tiền</Label>
                  <Input
                    placeholder="Tên người/đơn vị nhận"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label>Ghi chú</Label>
                  <Textarea
                    placeholder="Ghi chú thêm (không bắt buộc)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
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
                              <span className="truncate max-w-xs">{file.name}</span>
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
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Hủy
                </Button>
                <PermissionGate
                  page="/payments/cashout"
                  require="can_use"
                  fallback="disable"
                  disabledMessage="Bạn không có quyền ghi nhận chi tiền"
                >
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || (!isOutOfProcess && exceedsMax)}
                  >
                    {isSubmitting ? "Đang ghi nhận..." : "Ghi nhận chi tiền"}
                  </Button>
                </PermissionGate>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Detail Dialog */}
          <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
            <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Chi tiết giao dịch chi tiền
                </DialogTitle>
                {selectedCashOut && (
                  <DialogDescription>
                    Mã đề xuất: {selectedCashOut.request_code || "—"}
                  </DialogDescription>
                )}
              </DialogHeader>

              {selectedCashOut && (
                <div className="space-y-5">
                  {/* Summary card */}
                  <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Số tiền chi</p>
                      <p className="text-2xl font-bold text-destructive">{formatCurrency(selectedCashOut.amount)}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant="outline">{paymentMethodLabels[selectedCashOut.payment_method]}</Badge>
                      {selectedCashOut.is_out_of_process && (
                        <div><Badge variant="destructive">Ngoài quy trình</Badge></div>
                      )}
                    </div>
                  </div>

                  {/* Section: Thông tin chung */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Thông tin chung</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <DetailField label="Mã đề xuất" value={selectedCashOut.request_code} />
                      <DetailField label="Loại thanh toán" value={selectedCashOut.payment_type ? paymentRequestTypeLabels[selectedCashOut.payment_type as keyof typeof paymentRequestTypeLabels] || selectedCashOut.payment_type : undefined} />
                      <DetailField label="Ngày chi" value={formatDateTime(selectedCashOut.paid_at)} />
                      <DetailField label="Ngày tạo" value={formatDateTime(selectedCashOut.created_at)} />
                      <DetailField label="Đối tác / Người nhận" value={selectedCashOut.partner_name || selectedCashOut.recipient_name} className="col-span-2" />
                    </div>
                  </div>

                  {/* Section: Thanh toán */}
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Thông tin thanh toán</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <DetailField label="Phương thức" value={paymentMethodLabels[selectedCashOut.payment_method]} />
                      <DetailField label="Cổng thanh toán" value={selectedCashOut.payment_gateway} />
                      {selectedCashOut.payment_method === "BANK_TRANSFER" && (
                        <>
                          <DetailField label="Ngân hàng" value={selectedCashOut.bank_name} />
                          <DetailField label="Số tài khoản" value={selectedCashOut.bank_account_number} />
                          <DetailField label="Tên chủ tài khoản" value={selectedCashOut.bank_account_name} className="col-span-2" />
                        </>
                      )}
                      <DetailField label="Mã tham chiếu / UNC" value={selectedCashOut.transfer_reference} className="col-span-2" />
                    </div>
                  </div>

                  {/* Section: Chi ngoài quy trình */}
                  {selectedCashOut.is_out_of_process && (
                    <div className="space-y-2 border-t pt-4">
                      <h4 className="text-sm font-semibold text-destructive uppercase tracking-wide">Chi ngoài quy trình</h4>
                      <p className="text-sm bg-destructive/10 text-destructive rounded-md p-3">
                        {selectedCashOut.out_of_process_reason || "Không có lý do"}
                      </p>
                    </div>
                  )}

                  {/* Section: Ghi chú */}
                  <div className="space-y-2 border-t pt-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ghi chú</h4>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3 min-h-[40px]">
                      {selectedCashOut.note || <span className="text-muted-foreground italic">Không có ghi chú</span>}
                    </p>
                  </div>

                  {/* Section: Người thực hiện */}
                  {selectedCashOut.paid_by && (
                    <div className="space-y-2 border-t pt-4">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Người thực hiện</h4>
                      <p className="text-sm text-muted-foreground">{selectedCashOut.paid_by}</p>
                    </div>
                  )}

                  {/* Section: Chứng từ */}
                  <div className="space-y-2 border-t pt-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Ảnh chứng từ
                    </h4>
                    {selectedCashOut.receipt_image ? (
                      <ReceiptImagePreview
                        imagePath={selectedCashOut.receipt_image}
                        status={selectedCashOut.receipt_status}
                      />
                    ) : (
                      <ReceiptUpload
                        value={null}
                        status="PENDING"
                        onChange={(imagePath) => {
                          if (imagePath) {
                            updateReceipt.mutate({
                              id: selectedCashOut.id,
                              receipt_image: imagePath,
                              receipt_status: "UPLOADED",
                            }, {
                              onSuccess: () => {
                                setSelectedCashOut({
                                  ...selectedCashOut,
                                  receipt_image: imagePath,
                                  receipt_status: "UPLOADED",
                                });
                              },
                            });
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  Đóng
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SectionCard>
      </PageContainer>
    </>
  );
}

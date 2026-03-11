import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Building2,
  Plane,
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Eye,
  Pencil,
  ThumbsUp,
  User,
  ThumbsDown,
  CalendarIcon,
  ArrowDownLeft,
  Upload,
  Search,
  FileText,
  ExternalLink,
} from "lucide-react";
import { ReceiptUpload } from "@/components/ui/receipt-upload";
import {
  usePaymentRequests,
  useCreatePaymentRequest,
  useApprovePaymentRequest,
  useRejectPaymentRequest,
  useCancelPaymentRequest,
  usePaymentRequestStats,
  PaymentRequestType,
  PaymentRequestStatus,
  ExpenseCategory,
  paymentRequestTypeLabels,
  paymentRequestStatusLabels,
  expenseCategoryLabels,
} from "@/hooks/usePaymentRequests";
import { useCollectRefund } from "@/hooks/useHostDepositRefund";
import { useHostSettlementsForPayment, useServiceSettlementsForPayment, useHostPartnersForPayment, useServicePartnersForPayment } from "@/hooks/useOutgoingPayments";
import { format, setMonth, setYear } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getApprovalStatusVariant } from "@/constants/status-config";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { MetricCard } from "@/components/ui/metric-card";
import { EditPaymentRequestDialog } from "@/components/payment-request/EditPaymentRequestDialog";
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

export default function PaymentRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL params
  const urlSettlementId = searchParams.get("settlementId");
  const urlType = searchParams.get("type");
  const highlightId = searchParams.get("highlight");
  const openCreateType = searchParams.get("openCreate") as PaymentRequestType | null;
  const prefillPartnerId = searchParams.get("partnerId");
  const prefillBookingId = searchParams.get("bookingId");

  // Filters
  const [filterType, setFilterType] = useState<PaymentRequestType | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<PaymentRequestStatus | "ALL">("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Advanced filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterExpenseCategory, setFilterExpenseCategory] = useState<ExpenseCategory | "ALL">("ALL");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [filterSourceAmountMin, setFilterSourceAmountMin] = useState("");
  const [filterSourceAmountMax, setFilterSourceAmountMax] = useState("");
  const [filterDiffMin, setFilterDiffMin] = useState("");
  const [filterDiffMax, setFilterDiffMax] = useState("");

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [collectPaymentMethod, setCollectPaymentMethod] = useState("BANK_TRANSFER");
  const [collectReference, setCollectReference] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [collectReceiptImage, setCollectReceiptImage] = useState<string | null>(null);
  const [collectReceiptStatus, setCollectReceiptStatus] = useState<string>("PENDING");

  // Detail sheet state
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<any>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);

  // Form state
  const [paymentType, setPaymentType] = useState<PaymentRequestType>("HOST_PAYMENT");
  const [partnerId, setPartnerId] = useState("");
  const [settlementId, setSettlementId] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("SALARY");
  const [proposedAmount, setProposedAmount] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [expensePeriodDate, setExpensePeriodDate] = useState<Date | undefined>(undefined);
  const [confirmedAt, setConfirmedAt] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientUnit, setRecipientUnit] = useState("");
  const [note, setNote] = useState("");

  // Queries
  const paymentRequestsQuery = usePaymentRequests({
    paymentType: filterType === "ALL" ? undefined : filterType,
    status: filterStatus === "ALL" ? undefined : filterStatus,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
  });
  const { data: requests, isLoading } = paymentRequestsQuery;

  usePrefetchMountLog('PaymentRequestsPage', [
    { key: ['payment-requests'], query: paymentRequestsQuery },
  ]);

  // Client-side advanced filtering
  const hasAdvancedFilters = filterSearch !== "" || filterExpenseCategory !== "ALL" ||
    filterAmountMin !== "" || filterAmountMax !== "" ||
    filterSourceAmountMin !== "" || filterSourceAmountMax !== "" ||
    filterDiffMin !== "" || filterDiffMax !== "";

  const advancedFilterCount = [
    filterSearch !== "",
    filterExpenseCategory !== "ALL",
    filterAmountMin !== "" || filterAmountMax !== "",
    filterSourceAmountMin !== "" || filterSourceAmountMax !== "",
    filterDiffMin !== "" || filterDiffMax !== "",
  ].filter(Boolean).length;

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    if (!hasAdvancedFilters) return requests;

    return requests.filter((r) => {
      // Search filter: match request_code or partner_name or recipient_name
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const matchCode = r.request_code?.toLowerCase().includes(q);
        const matchPartner = r.partner_name?.toLowerCase().includes(q);
        const matchRecipient = r.recipient_name?.toLowerCase().includes(q);
        const matchCategory = r.expense_category ? expenseCategoryLabels[r.expense_category]?.toLowerCase().includes(q) : false;
        if (!matchCode && !matchPartner && !matchRecipient && !matchCategory) return false;
      }

      // Expense category filter
      if (filterExpenseCategory !== "ALL" && r.expense_category !== filterExpenseCategory) return false;

      // Proposed amount range
      const amountMin = filterAmountMin ? parseFloat(filterAmountMin) : null;
      const amountMax = filterAmountMax ? parseFloat(filterAmountMax) : null;
      if (amountMin !== null && r.proposed_amount < amountMin) return false;
      if (amountMax !== null && r.proposed_amount > amountMax) return false;

      // Source amount range
      const srcMin = filterSourceAmountMin ? parseFloat(filterSourceAmountMin) : null;
      const srcMax = filterSourceAmountMax ? parseFloat(filterSourceAmountMax) : null;
      if (srcMin !== null && r.source_amount < srcMin) return false;
      if (srcMax !== null && r.source_amount > srcMax) return false;

      // Difference range
      const diffMin = filterDiffMin ? parseFloat(filterDiffMin) : null;
      const diffMax = filterDiffMax ? parseFloat(filterDiffMax) : null;
      if (diffMin !== null && r.difference_amount < diffMin) return false;
      if (diffMax !== null && r.difference_amount > diffMax) return false;

      return true;
    });
  }, [requests, filterSearch, filterExpenseCategory, filterAmountMin, filterAmountMax, filterSourceAmountMin, filterSourceAmountMax, filterDiffMin, filterDiffMax, hasAdvancedFilters]);

  // Pagination — uses filteredRequests instead of raw requests
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredRequests, { defaultPageSize: 10, resetDeps: [filterType, filterStatus, filterDateFrom, filterDateTo, filterSearch, filterExpenseCategory, filterAmountMin, filterAmountMax, filterSourceAmountMin, filterSourceAmountMax, filterDiffMin, filterDiffMax] });

  const { data: stats } = usePaymentRequestStats();
  const { data: hostPartners } = useHostPartnersForPayment();
  const { data: servicePartners } = useServicePartnersForPayment();
  const { data: hostSettlements } = useHostSettlementsForPayment(partnerId || undefined);
  const { data: serviceSettlements } = useServiceSettlementsForPayment(partnerId || undefined);

  // Fetch all settlements for URL pre-fill
  const { data: allHostSettlements } = useHostSettlementsForPayment();
  const { data: allServiceSettlements } = useServiceSettlementsForPayment();

  // Mutations
  const createRequest = useCreatePaymentRequest();
  const approveRequest = useApprovePaymentRequest();
  const rejectRequest = useRejectPaymentRequest();
  const cancelRequest = useCancelPaymentRequest();
  const collectRefund = useCollectRefund();

  // Handle URL params to auto-open and pre-fill from Settlement History
  useEffect(() => {
    if (!urlSettlementId || !urlType) return;

    if (urlType === "HOST") {
      setPaymentType("HOST_PAYMENT");
      // Wait for data to load before pre-filling
      if (!allHostSettlements) return;
      const settlement = allHostSettlements.find(s => s.id === urlSettlementId);
      if (settlement) {
        setPartnerId(settlement.partner_id);
        setSettlementId(urlSettlementId);
        setProposedAmount(String(settlement.computed_remaining_amount || 0));
      }
    } else if (urlType === "SERVICE") {
      setPaymentType("SERVICE_PARTNER_PAYMENT");
      if (!allServiceSettlements) return;
      const settlement = allServiceSettlements.find(s => s.id === urlSettlementId);
      if (settlement) {
        setPartnerId(settlement.partner_id);
        setSettlementId(urlSettlementId);
        setProposedAmount(String(settlement.computed_remaining_amount || 0));
      }
    }
    // Open dialog and clear URL params only after data is ready
    setCreateDialogOpen(true);
    setSearchParams({});
  }, [urlSettlementId, urlType, allHostSettlements, allServiceSettlements, setSearchParams]);

  // Reset form when dialog is closed (prevents stale pre-filled data)
  const handleDialogOpenChange = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  // If coming from Deposit/Prepaid page, use ?type=HOST_DEPOSIT|HOST_PREPAID to pre-filter
  useEffect(() => {
    const allowedTypes: PaymentRequestType[] = [
      "HOST_PAYMENT",
      "SERVICE_PARTNER_PAYMENT",
      "INTERNAL_EXPENSE",
      "OTA_COMMISSION",
      "HOST_DEPOSIT",
      "HOST_PREPAID",
      "GUEST_REFUND",
    ];

    if (urlType && allowedTypes.includes(urlType as PaymentRequestType)) {
      setFilterType(urlType as PaymentRequestType);
    }
  }, [urlType]);

  // Handle openCreate param - open dialog with pre-filled type/partner/booking
  useEffect(() => {
    if (openCreateType && ["HOST_DEPOSIT", "HOST_PREPAID"].includes(openCreateType)) {
      setPaymentType(openCreateType);
      if (prefillPartnerId) setPartnerId(prefillPartnerId);
      if (prefillBookingId) setNote(`Booking: ${prefillBookingId}`);
      setCreateDialogOpen(true);
      // Clear URL params
      setSearchParams({});
    }
  }, [openCreateType, prefillPartnerId, prefillBookingId, setSearchParams]);

  // Scroll + highlight a specific request row (from ?highlight=<id>)
  useEffect(() => {
    if (!highlightId || !requests || requests.length === 0) return;

    const el = document.getElementById(`request-row-${highlightId}`);
    if (!el) return;

    // Delay to ensure layout is ready
    window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [highlightId, requests]);

  // Get selected settlement for source amount
  const selectedHostSettlement = hostSettlements?.find(s => s.id === settlementId);
  const selectedServiceSettlement = serviceSettlements?.find(s => s.id === settlementId);

  const sourceAmount = paymentType === "HOST_PAYMENT" && selectedHostSettlement
    ? Number(selectedHostSettlement.computed_remaining_amount || 0)
    : paymentType === "SERVICE_PARTNER_PAYMENT" && selectedServiceSettlement
      ? Number(selectedServiceSettlement.computed_remaining_amount || 0)
      : 0;

  const proposedAmountNum = parseFloat(proposedAmount) || 0;
  const differenceAmount = proposedAmountNum - sourceAmount;

  const resetForm = () => {
    setPaymentType("HOST_PAYMENT");
    setPartnerId("");
    setSettlementId("");
    setExpenseCategory("SALARY");
    setProposedAmount("");
    setDifferenceReason("");
    setExpensePeriodDate(undefined);
    setConfirmedAt("");
    setRecipientName("");
    setRecipientUnit("");
    setNote("");
  };

  const handleSubmit = async () => {
    if (proposedAmountNum <= 0) {
      toast.error("Vui lòng nhập số tiền đề xuất");
      return;
    }

    if ((paymentType === "HOST_PAYMENT" || paymentType === "SERVICE_PARTNER_PAYMENT") && !settlementId) {
      toast.error("Vui lòng chọn phiếu quyết toán");
      return;
    }

    // Only require variance reason for settlement-based payments when there's actual difference
    const hasSettlement = paymentType === "HOST_PAYMENT" || paymentType === "SERVICE_PARTNER_PAYMENT";
    if (hasSettlement && sourceAmount > 0 && differenceAmount !== 0 && !differenceReason) {
      toast.error("Vui lòng nhập lý do chênh lệch");
      return;
    }

    const isBHXH = expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE";
    if (paymentType === "INTERNAL_EXPENSE" && isBHXH && !expensePeriodDate) {
      toast.error("Vui lòng chọn kỳ BHXH");
      return;
    }

    // OTA Commission validation
    if (paymentType === "OTA_COMMISSION") {
      if (!recipientUnit) {
        toast.error("Vui lòng chọn kênh OTA");
        return;
      }
      if (!expensePeriodDate) {
        toast.error("Vui lòng chọn kỳ thanh toán");
        return;
      }
    }

    // Format expense period as "Tháng MM/YYYY" for database
    const expensePeriodFormatted = expensePeriodDate
      ? format(expensePeriodDate, "'Tháng' MM/yyyy", { locale: vi })
      : undefined;

    try {
      await createRequest.mutateAsync({
        payment_type: paymentType,
        settlement_id: settlementId || undefined,
        settlement_type: paymentType === "HOST_PAYMENT" ? "HOST" : paymentType === "SERVICE_PARTNER_PAYMENT" ? "SERVICE" : undefined,
        expense_category: paymentType === "INTERNAL_EXPENSE" ? expenseCategory : paymentType === "OTA_COMMISSION" ? "OTA_COMMISSION" : undefined,
        partner_id: partnerId || undefined,
        source_amount: sourceAmount,
        proposed_amount: proposedAmountNum,
        difference_reason: differenceReason || undefined,
        expense_period: expensePeriodFormatted,
        confirmed_at: confirmedAt || undefined,
        recipient_name: recipientName || undefined,
        recipient_unit: recipientUnit || undefined,
        note: note || undefined,
      });

      setCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error handled in mutation
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest.mutateAsync({ requestId });
    } catch (error) {
      // Error handled in mutation
    }
  };

  const handleRejectClick = (requestId: string) => {
    setSelectedRequestId(requestId);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequestId || !rejectionReason) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }

    try {
      await rejectRequest.mutateAsync({
        requestId: selectedRequestId,
        rejectionReason,
      });
      setRejectDialogOpen(false);
      setSelectedRequestId(null);
      setRejectionReason("");
    } catch (error) {
      // Error handled in mutation
    }
  };

  const handleCancelClick = (requestId: string) => {
    setSelectedRequestId(requestId);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const handleCancelSubmit = async () => {
    if (!selectedRequestId || !cancelReason.trim()) {
      toast.error("Vui lòng nhập lý do hủy đề xuất");
      return;
    }

    try {
      await cancelRequest.mutateAsync({
        requestId: selectedRequestId,
        reason: cancelReason.trim(),
      });
      setCancelDialogOpen(false);
      setSelectedRequestId(null);
      setCancelReason("");
    } catch (error) {
      // Error handled in mutation
    }
  };

  const handleCollectClick = (request: any) => {
    setSelectedRequest(request);
    setCollectPaymentMethod("BANK_TRANSFER");
    setCollectReference("");
    setCollectNote("");
    setCollectReceiptImage(null);
    setCollectReceiptStatus("PENDING");
    setCollectDialogOpen(true);
  };

  const handleCollectSubmit = async () => {
    if (!selectedRequest) return;

    try {
      await collectRefund.mutateAsync({
        requestId: selectedRequest.id,
        amount: selectedRequest.proposed_amount,
        paymentMethod: collectPaymentMethod,
        reference: collectReference,
        note: collectNote,
      });
      setCollectDialogOpen(false);
      setSelectedRequest(null);
    } catch (error) {
      // Error handled in mutation
    }
  };

  const handleViewDetail = (request: any) => {
    setDetailRequest(request);
    setDetailSheetOpen(true);
  };

  const isSubmitting = createRequest.isPending;

  return (
    <>
      <Header
        title="Đề xuất thanh toán"
        subtitle="Kiểm soát và phê duyệt các khoản cần chi trước khi tiền đi"
        actions={
          <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Tạo đề xuất
          </Button>
        }
      />

      <PageContainer><SectionCard>

        {/* Warning Banner */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Trang Đề xuất thanh toán dùng để kế toán <strong>tổng hợp và đề xuất các khoản cần chi</strong>,
            dựa trên dữ liệu tài chính đã có (Quyết toán Host/Dịch vụ, Chi phí nội bộ).
            Trang này <strong>không ghi nhận tiền đã chi</strong>, không ảnh hưởng cashflow,
            chỉ là điểm kiểm soát bắt buộc trước khi chi.
          </AlertDescription>
        </Alert>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="Chờ duyệt"
            value={formatCurrency(stats?.pending.amount || 0)}
            subtitle={`${stats?.pending.count || 0} đề xuất`}
            icon={Clock}
          />
          <MetricCard
            title="Đã duyệt – Chưa chi"
            value={formatCurrency(stats?.approved.amount || 0)}
            subtitle={`${stats?.approved.count || 0} đề xuất`}
            icon={CheckCircle}
          />
          <MetricCard
            title="Đã chi"
            value={formatCurrency(stats?.paid.amount || 0)}
            subtitle={`${stats?.paid.count || 0} đề xuất`}
            icon={Wallet}
          />
          <MetricCard
            title="Từ chối"
            value={formatCurrency(stats?.rejected.amount || 0)}
            subtitle={`${stats?.rejected.count || 0} đề xuất`}
            icon={XCircle}
          />
        </div>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc đề xuất thanh toán"
          hasActiveFilters={filterType !== "ALL" || filterStatus !== "ALL" || filterDateFrom !== "" || filterDateTo !== "" || hasAdvancedFilters}
          onClearFilters={() => {
            setFilterType("ALL");
            setFilterStatus("ALL");
            setFilterDateFrom("");
            setFilterDateTo("");
            setFilterSearch("");
            setFilterExpenseCategory("ALL");
            setFilterAmountMin("");
            setFilterAmountMax("");
            setFilterSourceAmountMin("");
            setFilterSourceAmountMax("");
            setFilterDiffMin("");
            setFilterDiffMax("");
          }}
        >
          <FilterBar.Field label="Loại chi">
            <Select value={filterType} onValueChange={(v) => setFilterType(v as PaymentRequestType | "ALL")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                <SelectItem value="HOST_PAYMENT">Thanh toán Host</SelectItem>
                <SelectItem value="SERVICE_PARTNER_PAYMENT">Thanh toán Đối tác DV</SelectItem>
                <SelectItem value="INTERNAL_EXPENSE">Chi phí nội bộ</SelectItem>
                <SelectItem value="OTA_COMMISSION">Hoa hồng OTA</SelectItem>
                <SelectItem value="HOST_DEPOSIT">Đặt cọc Host</SelectItem>
                <SelectItem value="HOST_PREPAID">Trả trước Host</SelectItem>
                <SelectItem value="HOST_DEPOSIT_REFUND">Thu hoàn cọc Host</SelectItem>
                <SelectItem value="HOST_PREPAID_REFUND">Thu hoàn trả trước Host</SelectItem>
                <SelectItem value="GUEST_REFUND">Hoàn tiền khách</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field label="Trạng thái">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as PaymentRequestStatus | "ALL")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                <SelectItem value="PENDING">Chờ duyệt</SelectItem>
                <SelectItem value="APPROVED">Đã duyệt – Chưa chi</SelectItem>
                <SelectItem value="REJECTED">Từ chối</SelectItem>
                <SelectItem value="PAID">Đã chi</SelectItem>
                <SelectItem value="CANCELLED">Đã hủy</SelectItem>
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

          {/* Advanced Filters */}
          <FilterBar.AdvancedSection activeCount={advancedFilterCount}>
            <FilterBar.Field label="Tìm kiếm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Mã đề xuất, đối tượng..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </FilterBar.Field>
            <FilterBar.Field label="Danh mục chi phí">
              <Select value={filterExpenseCategory} onValueChange={(v) => setFilterExpenseCategory(v as ExpenseCategory | "ALL")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  {Object.entries(expenseCategoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>
            <FilterBar.Field label="Số tiền đề xuất">
              <div className="flex items-center gap-1.5">
                <CurrencyInput
                  value={filterAmountMin}
                  onChange={setFilterAmountMin}
                  placeholder="Từ"
                />
                <span className="text-muted-foreground shrink-0">–</span>
                <CurrencyInput
                  value={filterAmountMax}
                  onChange={setFilterAmountMax}
                  placeholder="Đến"
                />
              </div>
            </FilterBar.Field>
            <FilterBar.Field label="Số tiền gốc">
              <div className="flex items-center gap-1.5">
                <CurrencyInput
                  value={filterSourceAmountMin}
                  onChange={setFilterSourceAmountMin}
                  placeholder="Từ"
                />
                <span className="text-muted-foreground shrink-0">–</span>
                <CurrencyInput
                  value={filterSourceAmountMax}
                  onChange={setFilterSourceAmountMax}
                  placeholder="Đến"
                />
              </div>
            </FilterBar.Field>
            <FilterBar.Field label="Chênh lệch">
              <div className="flex items-center gap-1.5">
                <CurrencyInput
                  value={filterDiffMin}
                  onChange={setFilterDiffMin}
                  placeholder="Từ"
                  allowNegative
                />
                <span className="text-muted-foreground shrink-0">–</span>
                <CurrencyInput
                  value={filterDiffMax}
                  onChange={setFilterDiffMax}
                  placeholder="Đến"
                  allowNegative
                />
              </div>
            </FilterBar.Field>
          </FilterBar.AdvancedSection>
        </FilterBar>

        {/* Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách đề xuất thanh toán</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredRequests && filteredRequests.length > 0 ? (
              <div>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {paginatedData.map((request) => (
                    <div
                      key={request.id}
                      className={cn(
                        "rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors",
                        highlightId === request.id && "bg-primary/5 ring-1 ring-primary/20"
                      )}
                      onClick={() => handleViewDetail(request)}
                    >
                      {/* Row 1: Code + Status */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-mono font-medium text-foreground truncate">{request.request_code}</span>
                        <StatusBadge variant={getApprovalStatusVariant(request.status) as any} size="sm">
                          {request.status === "PAID" &&
                            (request.payment_type === "HOST_DEPOSIT_REFUND" || request.payment_type === "HOST_PREPAID_REFUND")
                            ? "Đã thu"
                            : request.status === "APPROVED" &&
                              (request.payment_type === "HOST_DEPOSIT_REFUND" || request.payment_type === "HOST_PREPAID_REFUND")
                              ? "Chờ thu"
                              : paymentRequestStatusLabels[request.status]}
                        </StatusBadge>
                      </div>
                      {/* Row 2: Type + Partner */}
                      <div className="text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">{paymentRequestTypeLabels[request.payment_type]}</span>
                        {" · "}
                        {request.payment_type === "GUEST_REFUND"
                          ? (request.recipient_name || "Khách")
                          : (request.partner_name ||
                            (request.expense_category ? expenseCategoryLabels[request.expense_category] : "-"))}
                      </div>
                      {/* Row 3: Amount */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">Đề xuất:</span>
                        <span className="font-bold text-sm tabular-nums">{formatCurrency(request.proposed_amount)}</span>
                      </div>
                      {/* Row 3b: Source + Diff (if applicable) */}
                      {(request.payment_type === "HOST_PAYMENT" || request.payment_type === "SERVICE_PARTNER_PAYMENT") && (
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Gốc: {formatCurrency(request.source_amount)}</span>
                          {request.difference_amount !== 0 && (
                            <span className={request.difference_amount > 0 ? "text-destructive" : "text-success"}>
                              {request.difference_amount > 0 ? "+" : ""}{formatCurrency(request.difference_amount)}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Row 4: Proposer + Date */}
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-1">
                        <span className="truncate">{request.requested_by_name || "-"}</span>
                        <span className="shrink-0">{formatDateTime(request.requested_at)}</span>
                      </div>
                      {/* Row 5: Actions */}
                      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30 flex-wrap">
                        {request.status === "PENDING" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-success gap-1"
                              onClick={(e) => { e.stopPropagation(); handleApprove(request.id); }}
                              disabled={approveRequest.isPending}>
                              <ThumbsUp className="h-3 w-3" /> Duyệt
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive gap-1"
                              onClick={(e) => { e.stopPropagation(); handleRejectClick(request.id); }}
                              disabled={rejectRequest.isPending}>
                              <ThumbsDown className="h-3 w-3" /> Từ chối
                            </Button>
                          </>
                        )}
                        {request.status === "APPROVED" && (
                          (request.payment_type === "HOST_DEPOSIT_REFUND" || request.payment_type === "HOST_PREPAID_REFUND") ? (
                            <Button size="sm" variant="default" className="h-7 text-xs bg-success hover:bg-success gap-1"
                              onClick={(e) => { e.stopPropagation(); handleCollectClick(request); }}>
                              <ArrowDownLeft className="h-3 w-3" /> Thu tiền
                            </Button>
                          ) : (
                            <Link to={`/payments/cashout?requestId=${request.id}`} onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="default" className="h-7 text-xs gap-1">
                                <Wallet className="h-3 w-3" /> Chi tiền
                              </Button>
                            </Link>
                          )
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); handleViewDetail(request); }}>
                          <Eye className="h-3 w-3" /> Xem
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Mã đề xuất</TableHead>
                        <TableHead className="w-[120px]">Loại chi</TableHead>
                        <TableHead className="w-[140px]">Đối tượng</TableHead>
                        <TableHead className="text-right w-[130px]">Số tiền gốc</TableHead>
                        <TableHead className="text-right w-[130px]">Số tiền đề xuất</TableHead>
                        <TableHead className="text-right w-[130px]">Chênh lệch</TableHead>
                        <TableHead className="w-[100px]">Trạng thái</TableHead>
                        <TableHead className="w-[120px]">Người đề xuất</TableHead>
                        <TableHead className="w-[140px]">Ngày đề xuất</TableHead>
                        <TableHead className="text-right w-[100px]">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((request) => (
                        <TableRow
                          key={request.id}
                          id={`request-row-${request.id}`}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50 transition-colors",
                            highlightId === request.id &&
                            "bg-primary/5 ring-1 ring-primary/20"
                          )}
                          onClick={() => handleViewDetail(request)}
                        >
                          <TableCell className="font-medium">{request.request_code}</TableCell>
                          <TableCell>{paymentRequestTypeLabels[request.payment_type]}</TableCell>
                          <TableCell>
                            {request.payment_type === "GUEST_REFUND"
                              ? (request.recipient_name || "Khách")
                              : (request.partner_name ||
                                (request.expense_category ? expenseCategoryLabels[request.expense_category] : "-"))}
                          </TableCell>
                          <TableCell className="text-right">
                            {(request.payment_type === "HOST_PAYMENT" || request.payment_type === "SERVICE_PARTNER_PAYMENT")
                              ? formatCurrency(request.source_amount)
                              : <span className="text-muted-foreground">-</span>
                            }
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(request.proposed_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {(request.payment_type === "HOST_PAYMENT" || request.payment_type === "SERVICE_PARTNER_PAYMENT") && request.difference_amount !== 0 ? (
                              <span className={request.difference_amount > 0 ? "text-destructive" : "text-success"}>
                                {request.difference_amount > 0 ? "+" : ""}
                                {formatCurrency(request.difference_amount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge variant={getApprovalStatusVariant(request.status) as any}>
                              {request.status === "PAID" &&
                                (request.payment_type === "HOST_DEPOSIT_REFUND" || request.payment_type === "HOST_PREPAID_REFUND")
                                ? "Đã thu"
                                : request.status === "APPROVED" &&
                                  (request.payment_type === "HOST_DEPOSIT_REFUND" || request.payment_type === "HOST_PREPAID_REFUND")
                                  ? "Đã duyệt – Chờ thu"
                                  : paymentRequestStatusLabels[request.status]}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[100px]" title={request.requested_by_name || "-"}>
                                {request.requested_by_name || "-"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{formatDateTime(request.requested_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {request.status === "PENDING" && (
                                <>
                                  <PermissionGate
                                    page="/payments/requests"
                                    require="can_use"
                                    fallback="disable"
                                    disabledMessage="Bạn không có quyền phê duyệt đề xuất"
                                  >
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-success"
                                      onClick={(e) => { e.stopPropagation(); handleApprove(request.id); }}
                                      disabled={approveRequest.isPending}
                                    >
                                      <ThumbsUp className="h-4 w-4" />
                                    </Button>
                                  </PermissionGate>
                                  <PermissionGate
                                    page="/payments/requests"
                                    require="can_use"
                                    fallback="disable"
                                    disabledMessage="Bạn không có quyền từ chối đề xuất"
                                  >
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive"
                                      onClick={(e) => { e.stopPropagation(); handleRejectClick(request.id); }}
                                      disabled={rejectRequest.isPending}
                                    >
                                      <ThumbsDown className="h-4 w-4" />
                                    </Button>
                                  </PermissionGate>
                                </>
                              )}
                              {(request.status === "PENDING" || request.status === "APPROVED") && (
                                <PermissionGate
                                  page="/payments/requests"
                                  require="can_use"
                                  fallback="disable"
                                  disabledMessage="Bạn không có quyền hủy đề xuất"
                                >
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-muted-foreground"
                                    onClick={(e) => { e.stopPropagation(); handleCancelClick(request.id); }}
                                    disabled={cancelRequest.isPending}
                                    title={request.status === "APPROVED" ? "Hủy đề xuất đã duyệt (chưa chi)" : "Hủy đề xuất"}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </PermissionGate>
                              )}
                              {request.status === "APPROVED" && (
                                request.payment_type === "HOST_DEPOSIT_REFUND" || request.payment_type === "HOST_PREPAID_REFUND" ? (
                                  <PermissionGate
                                    page="/payments/requests"
                                    require="can_use"
                                    fallback="disable"
                                    disabledMessage="Bạn không có quyền thu tiền"
                                  >
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="bg-success hover:bg-success"
                                      onClick={(e) => { e.stopPropagation(); handleCollectClick(request); }}
                                    >
                                      <ArrowDownLeft className="mr-1 h-4 w-4" />
                                      Thu tiền
                                    </Button>
                                  </PermissionGate>
                                ) : (
                                  <Link to={`/payments/cashout?requestId=${request.id}`} onClick={(e) => e.stopPropagation()}>
                                    <Button size="sm" variant="default">
                                      <Wallet className="mr-1 h-4 w-4" />
                                      Chi tiền
                                    </Button>
                                  </Link>
                                )
                              )}
                              {(request.status === "PENDING" || request.status === "APPROVED") && (
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingRequest(request); setEditDialogOpen(true); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleViewDetail(request); }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Total summary — calculated from ALL filtered results */}
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                  <span className="text-sm text-muted-foreground">
                    Tổng {filteredRequests.length} đề xuất (theo bộ lọc)
                  </span>
                  <span className="text-sm font-semibold">
                    Tổng đề xuất: {formatCurrency(filteredRequests.reduce((sum, r) => sum + Number(r.proposed_amount || 0), 0))}
                  </span>
                </div>
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  displayedItems={displayedCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="yêu cầu"
                />
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Chưa có đề xuất thanh toán nào</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tạo đề xuất thanh toán</DialogTitle>
              <DialogDescription>
                Tạo đề xuất chi tiền dựa trên dữ liệu quyết toán hoặc chi phí nội bộ
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Payment Type */}
              <div className="space-y-2">
                <Label>Loại chi *</Label>
                <Select value={paymentType} onValueChange={(v) => {
                  setPaymentType(v as PaymentRequestType);
                  setPartnerId("");
                  setSettlementId("");
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOST_PAYMENT">Thanh toán Host</SelectItem>
                    <SelectItem value="SERVICE_PARTNER_PAYMENT">Thanh toán Đối tác dịch vụ</SelectItem>
                    <SelectItem value="HOST_DEPOSIT">Đặt cọc Host</SelectItem>
                    <SelectItem value="HOST_PREPAID">Trả trước Host</SelectItem>
                    <SelectItem value="INTERNAL_EXPENSE">Chi phí nội bộ</SelectItem>
                    <SelectItem value="OTA_COMMISSION">Hoa hồng OTA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Host Deposit/Prepaid Fields */}
              {(paymentType === "HOST_DEPOSIT" || paymentType === "HOST_PREPAID") && (
                <>
                  <div className="space-y-2">
                    <Label>Chọn Host *</Label>
                    <Select value={partnerId} onValueChange={setPartnerId}>
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
                  <div className="space-y-2">
                    <Label>Số tiền đề xuất *</Label>
                    <CurrencyInput
                      value={proposedAmount}
                      onChange={setProposedAmount}
                      placeholder="Nhập số tiền"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ghi chú</Label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Ghi chú thêm..."
                    />
                  </div>
                </>
              )}

              {/* Host/Service Payment Fields */}
              {(paymentType === "HOST_PAYMENT" || paymentType === "SERVICE_PARTNER_PAYMENT") && (
                <>
                  <div className="space-y-2">
                    <Label>Chọn đối tác *</Label>
                    <Select value={partnerId} onValueChange={(v) => {
                      setPartnerId(v);
                      setSettlementId("");
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn đối tác" />
                      </SelectTrigger>
                      <SelectContent>
                        {(paymentType === "HOST_PAYMENT" ? hostPartners : servicePartners)?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.partner_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {partnerId && (
                    <div className="space-y-2">
                      <Label>Chọn phiếu quyết toán *</Label>
                      <Select value={settlementId} onValueChange={setSettlementId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn phiếu quyết toán" />
                        </SelectTrigger>
                        <SelectContent>
                          {(paymentType === "HOST_PAYMENT" ? hostSettlements : serviceSettlements)?.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.settlement_code} - Còn lại: {formatCurrency(s.computed_remaining_amount || 0)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {settlementId && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Số tiền theo căn cứ (còn lại chưa chi):</p>
                      <p className="text-kpi tabular-nums font-semibold tracking-tight">{formatCurrency(sourceAmount)}</p>
                    </div>
                  )}
                </>
              )}

              {/* Internal Expense Fields */}
              {paymentType === "INTERNAL_EXPENSE" && (
                <>
                  <div className="space-y-2">
                    <Label>Danh mục chi *</Label>
                    <Select value={expenseCategory} onValueChange={(v) => setExpenseCategory(v as ExpenseCategory)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Exclude OTA_COMMISSION from internal expense - it has separate type */}
                        {Object.entries(expenseCategoryLabels)
                          .filter(([key]) => key !== "OTA_COMMISSION")
                          .map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(expenseCategory === "BHXH_EMPLOYER" || expenseCategory === "BHXH_EMPLOYEE") && (
                    <>
                      <div className="space-y-2">
                        <Label>Kỳ BHXH *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !expensePeriodDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {expensePeriodDate ? format(expensePeriodDate, "'Tháng' MM/yyyy", { locale: vi }) : "Chọn tháng/năm"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={expensePeriodDate}
                              onSelect={(date) => setExpensePeriodDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Ngày chốt BHXH</Label>
                        <Input
                          type="date"
                          value={confirmedAt}
                          onChange={(e) => setConfirmedAt(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Đơn vị nhận</Label>
                        <Input
                          placeholder="VD: Cơ quan BHXH / Kho bạc"
                          value={recipientUnit}
                          onChange={(e) => setRecipientUnit(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {expenseCategory !== "BHXH_EMPLOYER" && expenseCategory !== "BHXH_EMPLOYEE" && (
                    <>
                      <div className="space-y-2">
                        <Label>Kỳ chi phí</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !expensePeriodDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {expensePeriodDate ? format(expensePeriodDate, "'Tháng' MM/yyyy", { locale: vi }) : "Chọn tháng/năm"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={expensePeriodDate}
                              onSelect={(date) => setExpensePeriodDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Người nhận tiền</Label>
                        <Input
                          placeholder="Tên người/đơn vị nhận"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* OTA Commission Fields */}
              {paymentType === "OTA_COMMISSION" && (
                <>
                  <div className="space-y-2">
                    <Label>Kênh OTA *</Label>
                    <Select value={recipientUnit} onValueChange={setRecipientUnit}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn kênh OTA" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Agoda">Agoda</SelectItem>
                        <SelectItem value="Booking.com">Booking.com</SelectItem>
                        <SelectItem value="Airbnb">Airbnb</SelectItem>
                        <SelectItem value="Expedia">Expedia</SelectItem>
                        <SelectItem value="Traveloka">Traveloka</SelectItem>
                        <SelectItem value="Trip.com">Trip.com</SelectItem>
                        <SelectItem value="Khác">Khác</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Kỳ thanh toán *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !expensePeriodDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expensePeriodDate ? format(expensePeriodDate, "'Tháng' MM/yyyy", { locale: vi }) : "Chọn tháng/năm"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={expensePeriodDate}
                          onSelect={(date) => setExpensePeriodDate(date)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Hoa hồng OTA thường được OTA tự khấu trừ từ payout.
                      Chỉ tạo đề xuất này khi cần chi thêm hoặc ghi nhận riêng.
                    </p>
                  </div>
                </>
              )}

              {/* Proposed Amount */}
              <div className="space-y-2">
                <Label>Số tiền đề xuất chi *</Label>
                <CurrencyInput
                  placeholder="0"
                  value={proposedAmount}
                  onChange={setProposedAmount}
                />
              </div>

              {/* Difference Display */}
              {sourceAmount > 0 && proposedAmountNum > 0 && differenceAmount !== 0 && (
                <div className="p-3 border rounded-lg border-warning/30 bg-warning/5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    <span className="font-medium text-warning">Chênh lệch phát hiện</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Số tiền gốc</p>
                      <p className="font-medium">{formatCurrency(sourceAmount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Số tiền đề xuất</p>
                      <p className="font-medium">{formatCurrency(proposedAmountNum)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Chênh lệch</p>
                      <p className={`font-medium ${differenceAmount > 0 ? "text-destructive" : "text-success"}`}>
                        {differenceAmount > 0 ? "+" : ""}{formatCurrency(differenceAmount)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label>Lý do chênh lệch *</Label>
                    <Textarea
                      placeholder="Nhập lý do tại sao số tiền đề xuất khác với số tiền theo căn cứ"
                      value={differenceReason}
                      onChange={(e) => setDifferenceReason(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Note */}
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  placeholder="Ghi chú thêm (không bắt buộc)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Đang tạo..." : "Tạo đề xuất"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Từ chối đề xuất</DialogTitle>
              <DialogDescription>
                Vui lòng nhập lý do từ chối đề xuất thanh toán này
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Lý do từ chối *</Label>
                <Textarea
                  placeholder="Nhập lý do từ chối"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Hủy
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectSubmit}
                disabled={rejectRequest.isPending || !rejectionReason}
              >
                {rejectRequest.isPending ? "Đang xử lý..." : "Từ chối"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hủy đề xuất thanh toán</DialogTitle>
              <DialogDescription>
                Đề xuất sẽ chuyển sang trạng thái "Đã hủy". Hành động này được ghi log.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Lý do hủy *</Label>
                <Textarea
                  placeholder="Nhập lý do hủy đề xuất"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSubmit}
                disabled={cancelRequest.isPending || !cancelReason.trim()}
              >
                {cancelRequest.isPending ? "Đang xử lý..." : "Xác nhận hủy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Sheet */}
        <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
          <SheetContent className="sm:max-w-lg overflow-y-auto bg-background">
            <SheetHeader>
              <SheetTitle>Chi tiết đề xuất thanh toán</SheetTitle>
            </SheetHeader>
            {detailRequest && (
              <div className="mt-4 space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Trạng thái</span>
                  <StatusBadge variant={getApprovalStatusVariant(detailRequest.status) as any}>
                    {detailRequest.status === "PAID" &&
                      (detailRequest.payment_type === "HOST_DEPOSIT_REFUND" || detailRequest.payment_type === "HOST_PREPAID_REFUND")
                      ? "Đã thu"
                      : detailRequest.status === "APPROVED" &&
                        (detailRequest.payment_type === "HOST_DEPOSIT_REFUND" || detailRequest.payment_type === "HOST_PREPAID_REFUND")
                        ? "Đã duyệt – Chờ thu"
                        : paymentRequestStatusLabels[detailRequest.status as PaymentRequestStatus]}
                  </StatusBadge>
                </div>

                {/* Basic Info */}
                <div className="space-y-3 rounded-lg border p-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Thông tin chung</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Mã đề xuất</span>
                      <p className="font-medium">{detailRequest.request_code}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Loại chi</span>
                      <p className="font-medium">{paymentRequestTypeLabels[detailRequest.payment_type as PaymentRequestType]}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Đối tượng</span>
                      <p className="font-medium">
                        {detailRequest.payment_type === "GUEST_REFUND"
                          ? (detailRequest.recipient_name || "Khách")
                          : (detailRequest.partner_name ||
                            (detailRequest.expense_category ? expenseCategoryLabels[detailRequest.expense_category as ExpenseCategory] : "-"))}
                      </p>
                    </div>
                    {detailRequest.recipient_name && (
                      <div>
                        <span className="text-muted-foreground">Người nhận</span>
                        <p className="font-medium">{detailRequest.recipient_name}</p>
                      </div>
                    )}
                    {detailRequest.recipient_unit && (
                      <div>
                        <span className="text-muted-foreground">Đơn vị nhận</span>
                        <p className="font-medium">{detailRequest.recipient_unit}</p>
                      </div>
                    )}
                    {detailRequest.expense_period && (
                      <div>
                        <span className="text-muted-foreground">Kỳ chi phí</span>
                        <p className="font-medium">{detailRequest.expense_period}</p>
                      </div>
                    )}
                    {detailRequest.unified_booking_id && ["HOST_DEPOSIT", "HOST_PREPAID", "HOST_DEPOSIT_REFUND", "HOST_PREPAID_REFUND"].includes(detailRequest.payment_type) && (
                      <div>
                        <span className="text-muted-foreground">Mã đặt phòng</span>
                        <p className="font-medium">
                          <Link
                            to={`/bookings/${detailRequest.unified_booking_id}`}
                            className="text-primary hover:underline font-mono"
                            target="_blank"
                          >
                            {(detailRequest.booking_code || detailRequest.unified_booking_id.slice(-8)).replace(/^[A-Za-z]+-/, "")}
                          </Link>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Info */}
                <div className="space-y-3 rounded-lg border p-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Thông tin tài chính</h4>
                  <div className="space-y-2 text-sm">
                    {(detailRequest.payment_type === "HOST_PAYMENT" || detailRequest.payment_type === "SERVICE_PARTNER_PAYMENT") && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Số tiền gốc (theo căn cứ)</span>
                        <span className="font-medium">{formatCurrency(detailRequest.source_amount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số tiền đề xuất</span>
                      <span className="font-bold text-base">{formatCurrency(detailRequest.proposed_amount || 0)}</span>
                    </div>
                    {(detailRequest.payment_type === "HOST_PAYMENT" || detailRequest.payment_type === "SERVICE_PARTNER_PAYMENT") &&
                      detailRequest.difference_amount !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Chênh lệch</span>
                          <span className={cn("font-medium", detailRequest.difference_amount > 0 ? "text-destructive" : "text-success")}>
                            {detailRequest.difference_amount > 0 ? "+" : ""}
                            {formatCurrency(detailRequest.difference_amount || 0)}
                          </span>
                        </div>
                      )}
                    {detailRequest.difference_reason && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground">Lý do chênh lệch</span>
                        <p className="font-medium mt-1">{detailRequest.difference_reason}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-3 rounded-lg border p-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lịch sử</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground">Người đề xuất</span>
                      <div className="text-right">
                        <span className="font-medium flex items-center gap-1.5 justify-end">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {detailRequest.requested_by_name || "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(detailRequest.requested_at)}</span>
                      </div>
                    </div>
                    {detailRequest.approved_at && (
                      <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Người duyệt</span>
                        <div className="text-right">
                          <span className="font-medium text-success flex items-center gap-1.5 justify-end">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {detailRequest.approved_by_name || "-"}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(detailRequest.approved_at)}</span>
                        </div>
                      </div>
                    )}
                    {detailRequest.rejected_at && (
                      <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Người từ chối</span>
                        <div className="text-right">
                          <span className="font-medium text-destructive flex items-center gap-1.5 justify-end">
                            <XCircle className="h-3.5 w-3.5" />
                            {detailRequest.rejected_by_name || "-"}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(detailRequest.rejected_at)}</span>
                        </div>
                      </div>
                    )}
                    {detailRequest.paid_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ngày chi</span>
                        <span className="font-medium text-success">{formatDateTime(detailRequest.paid_at)}</span>
                      </div>
                    )}
                    {detailRequest.confirmed_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ngày chốt</span>
                        <span className="font-medium">{formatDateTime(detailRequest.confirmed_at)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rejection reason */}
                {detailRequest.rejection_reason && (
                  <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="text-sm font-semibold text-destructive">Lý do từ chối</h4>
                    <p className="text-sm">{detailRequest.rejection_reason}</p>
                  </div>
                )}

                {/* Notes */}
                {detailRequest.note && (() => {
                  // Parse refund trace metadata from note
                  const noteText = detailRequest.note as string;
                  const traceIdx = noteText.indexOf("---TRACE---");
                  if (traceIdx !== -1) {
                    const humanNote = noteText.slice(0, traceIdx).trim();
                    try {
                      const traceJson = JSON.parse(noteText.slice(traceIdx + 11).trim());
                      return (
                        <div className="space-y-3">
                          {/* Booking context card */}
                          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">Thông tin hoàn tiền</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              {traceJson.guest_name && (
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground text-xs">Khách</span>
                                  <span className="font-medium">{traceJson.guest_name}</span>
                                </div>
                              )}
                              {traceJson.booking_code && (
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground text-xs">Mã đặt phòng</span>
                                  <span className="font-mono font-medium">{traceJson.booking_code}</span>
                                </div>
                              )}
                              {traceJson.ota_source && (
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground text-xs">Kênh OTA</span>
                                  <span className="font-medium">{traceJson.ota_source}</span>
                                </div>
                              )}
                              {traceJson.refund_channel && (
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground text-xs">Kênh hoàn</span>
                                  <span className="font-medium">
                                    {traceJson.refund_channel === "DIRECT_TO_GUEST" ? "Trực tiếp cho khách" : "Qua OTA"}
                                  </span>
                                </div>
                              )}
                              {traceJson.collector_party && (
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground text-xs">Bên thu tiền</span>
                                  <span className="font-medium">{traceJson.collector_party}</span>
                                </div>
                              )}
                              {traceJson.purpose && (
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground text-xs">Phân loại</span>
                                  <span className="font-medium">
                                    {traceJson.purpose === "DIRECT_REFUND" ? "Hoàn tiền trực tiếp" : traceJson.purpose}
                                  </span>
                                </div>
                              )}
                            </div>
                            {traceJson.reason && (
                              <div className="pt-2 border-t border-primary/10">
                                <span className="text-muted-foreground text-xs">Lý do</span>
                                <p className="text-sm">{traceJson.reason}</p>
                              </div>
                            )}
                          </div>
                          {/* Human-readable note part */}
                          {humanNote && (
                            <div className="space-y-2 rounded-lg border p-4">
                              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ghi chú</h4>
                              <p className="text-sm">{humanNote}</p>
                            </div>
                          )}
                        </div>
                      );
                    } catch {
                      // fallback to raw note
                    }
                  }
                  return (
                    <div className="space-y-2 rounded-lg border p-4">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ghi chú</h4>
                      <p className="text-sm">{noteText}</p>
                    </div>
                  );
                })()}

                {/* Settlement reference */}
                {detailRequest.settlement_id && (
                  <div className="space-y-2 rounded-lg border p-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Phiếu quyết toán</h4>
                    <a
                      href={`/settlements/history?open=${detailRequest.settlement_id}&type=${detailRequest.settlement_type || "HOST"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-mono font-medium text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {detailRequest.settlement_code || detailRequest.settlement_id}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Collect Refund Dialog */}
        <Dialog open={collectDialogOpen} onOpenChange={setCollectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thu tiền hoàn cọc/trả trước từ Host</DialogTitle>
              <DialogDescription>
                Xác nhận thu tiền từ Host và ghi nhận phiếu thu
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm bg-muted p-4 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Mã đề xuất:</span>
                    <p className="font-medium">{selectedRequest.request_code}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Host:</span>
                    <p className="font-medium">{selectedRequest.partner_name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Loại:</span>
                    <p className="font-medium">{paymentRequestTypeLabels[selectedRequest.payment_type as PaymentRequestType]}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Số tiền thu:</span>
                    <p className="font-bold text-success">{formatCurrency(selectedRequest.proposed_amount)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Phương thức thu tiền</Label>
                  <Select value={collectPaymentMethod} onValueChange={setCollectPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BANK_TRANSFER">Chuyển khoản</SelectItem>
                      <SelectItem value="CASH">Tiền mặt</SelectItem>
                      <SelectItem value="OTHER">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Reference giao dịch</Label>
                  <Input
                    placeholder="Mã giao dịch ngân hàng (nếu có)"
                    value={collectReference}
                    onChange={(e) => setCollectReference(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ghi chú</Label>
                  <Textarea
                    placeholder="Ghi chú thêm (không bắt buộc)"
                    value={collectNote}
                    onChange={(e) => setCollectNote(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Ảnh chứng từ
                  </Label>
                  <ReceiptUpload
                    value={collectReceiptImage}
                    status={collectReceiptStatus}
                    onChange={setCollectReceiptImage}
                    onStatusChange={setCollectReceiptStatus}
                    folderPath="collect-receipts"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setCollectDialogOpen(false)}>
                Hủy
              </Button>
              <Button
                className="bg-success hover:bg-success"
                onClick={handleCollectSubmit}
                disabled={collectRefund.isPending}
              >
                {collectRefund.isPending ? "Đang xử lý..." : "Xác nhận thu tiền"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Payment Request Dialog */}
        <EditPaymentRequestDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          request={editingRequest}
        />
      </SectionCard></PageContainer>
    </>
  );
}

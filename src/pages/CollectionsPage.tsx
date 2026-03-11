import { useState, useEffect, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCollectionsView } from "@/components/collection/MobileCollectionsView";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  Wallet,
  Plus,
  MoreHorizontal,
  Loader2,
  Receipt,
  CreditCard,
  Banknote,
  Calendar,
  ExternalLink,
  RotateCcw,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Home,
  Plane,
  Info,
  Database,
  CheckCircle2,
  Eye,
  Paperclip,
  Image,
  Upload,
  Building2,
  QrCode,
  Link2,
  Globe,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { ReceiptStatusBadge, ReceiptImagePreview, ReceiptUpload } from "@/components/ui/receipt-upload";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { FilterBar } from "@/components/ui/filter-bar";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { RefundDialog } from "@/components/collection/RefundDialog";
import { VoidDialog } from "@/components/collection/VoidDialog";
import { CreateCollectionDialog } from "@/components/collection/CreateCollectionDialog";
import {
  HotelCollect,
  useCanRefund,
  useCanVoid,
  canRefundCollection,
  canVoidCollection,
  useAllCollections,
  useUpdateCollectionReceipt,
} from "@/hooks/useCollections";
import {
  // Legacy sync tools — DEPRECATED Sprint 3.2
  // useOtaPayoutsNeedingSync,
  // useSyncOtaPayoutsToCashIn,
} from "@/hooks/useOtaPayoutCashIn";
import { FILTER_OPTIONS, getPaymentMethodLabel, getProviderLabel } from "@/constants/paymentMethods";

import { supabase } from "@/integrations/supabase/client";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";

// Cached formatter — avoids creating new Intl.NumberFormat on every call
const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const formatCurrency = (amount: number) => currencyFormatter.format(amount);

const bucketConfig = {
  ROOM: { label: "Tiền phòng", icon: Home, color: "text-info" },
  EXTRA: { label: "Phụ phí", icon: Receipt, color: "text-warning" },
  SERVICE: { label: "Dịch vụ", icon: Plane, color: "text-primary" },
  OTA_PAYOUT: { label: "OTA Payout", icon: ArrowDownLeft, color: "text-success" },
  HOST_DEPOSIT_REFUND: { label: "Thu hoàn cọc Host", icon: RotateCcw, color: "text-info" },
  HOST_PREPAID_REFUND: { label: "Thu hoàn trả trước Host", icon: RotateCcw, color: "text-info" },
};

// Booking source display - determines if OTA or Direct
const getBookingSource = (booking: any): { label: string; isOta: boolean } => {
  if (!booking) return { label: "N/A", isOta: false };

  const source = booking.source || "";
  const pmsPropertyName = booking.pms_property_name;

  // OTA sources list
  const otaSources = ["Agoda", "Booking.com", "Airbnb", "Expedia", "Traveloka"];
  const isOtaBySource = otaSources.some(ota => source.toLowerCase().includes(ota.toLowerCase()));

  // If has pms_property_name, it's likely from OTA/PMS
  const isOtaByPms = !!pmsPropertyName;

  const isOta = isOtaBySource || isOtaByPms;

  // Display label
  let label = source;
  if (!label && pmsPropertyName) {
    label = "OTA";
  } else if (!label) {
    label = "Direct";
  }

  return { label, isOta };
};

// Collector display based on payment_type and payee_type
const getCollectorDisplay = (collection: any): { label: string; variant: "success" | "info" | "warning" | "default" } => {
  const paymentType = collection.booking?.payment_type;
  const payeeType = collection.payee_type;

  // If booking is OTA_COLLECT and this record doesn't exist in hotel_collects for ROOM
  // it means OTA collected - but since we're ON Collections page, we only see HOTEL collections
  // So here we show who actually collected this specific transaction

  if (payeeType === "HOST") {
    return { label: "Host thu", variant: "warning" };
  }
  if (payeeType === "SERVICE_PARTNER") {
    return { label: "NCC thu", variant: "default" };
  }
  // Roomrise collected
  return { label: "Roomrise thu", variant: "info" };
};

interface CollectionWithBooking extends HotelCollect {
  booking?: {
    guest_name: string;
    host_property_name: string | null;
    pms_property_name: string | null;
    payment_type: string;
    check_in_date: string;
    check_out_date: string;
    total_amount_net: number | null;
    source?: string;
    ota_booking_code?: string | null;
  } | null;
}

export default function CollectionsPage() {
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/collections');
  const isMobile = useIsMobile();

  const [searchTerm, setSearchTerm] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [payeeFilter, setPayeeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showLegacySync, setShowLegacySync] = useState(false);

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (periodFilter) {
      case "today":
        return { start: today, end: today };
      case "week":
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: weekAgo, end: today };
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart, end: today };
      case "custom":
        return { start: customDateFrom, end: customDateTo };
      default:
        return { start: undefined, end: undefined };
    }
  }, [periodFilter, customDateFrom, customDateTo]);

  // Refund/Void state
  const [selectedCollection, setSelectedCollection] = useState<HotelCollect | null>(null);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailCollection, setDetailCollection] = useState<CollectionWithBooking | null>(null);

  // Receipt upload state
  const [uploadingCollectionId, setUploadingCollectionId] = useState<string | null>(null);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  const { data: canRefund = false } = useCanRefund();
  const { data: canVoid = false } = useCanVoid();

  // Use the centralized hook for data consistency with Booking Center
  const collectionsQuery = useAllCollections();
  const { data: collections = [], isLoading, refetch } = collectionsQuery;
  const updateReceipt = useUpdateCollectionReceipt();

  usePrefetchMountLog('CollectionsPage', [
    { key: ['collections'], query: collectionsQuery },
  ]);

  // Legacy sync — DEPRECATED Sprint 3.2 (use "Ghi nhận tiền về" in OTA Payouts instead)
  // const { data: payoutsNeedingSync = [], isLoading: isLoadingSync } = useOtaPayoutsNeedingSync();
  // const syncMutation = useSyncOtaPayoutsToCashIn();

  // Count legacy sync rows for badge
  const legacySyncCount = useMemo(() => {
    return collections.filter((c: any) => c.is_legacy_sync === true).length;
  }, [collections]);

  // ── FIX #4: Precompute voidedSet — O(n) once instead of O(n²) ──
  const voidedSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of collections) {
      if (c.collection_type === "VOID" && c.related_collection_id) {
        set.add(c.related_collection_id);
      }
    }
    return set;
  }, [collections]);

  const isCollectionVoided = (collectionId: string): boolean => voidedSet.has(collectionId);

  // Precompute related-collections map — O(n) once instead of O(n) per row
  const relatedCollectionsMap = useMemo(() => {
    const map = new Map<string, HotelCollect[]>();
    for (const c of collections) {
      if (c.related_collection_id) {
        const arr = map.get(c.related_collection_id) || [];
        arr.push(c);
        map.set(c.related_collection_id, arr);
      }
    }
    return map;
  }, [collections]);

  const getRelatedCollections = (collectionId: string): HotelCollect[] => {
    return relatedCollectionsMap.get(collectionId) || [];
  };

  // ── Memoize all derived arrays to avoid recalculating on every render ──
  const { todayCollections, monthCollections, todayNet, monthNet, totalRoom, totalExtra, totalService, totalOtaPayout, otaPayoutCount, totalRefunds } = useMemo(() => {
    const today = new Date().toDateString();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const todayArr: typeof collections = [];
    const monthArr: typeof collections = [];
    let collectTotalToday = 0, refundTotalToday = 0;
    let collectTotalMonth = 0, refundTotalMonth = 0;
    let room = 0, extra = 0, service = 0, otaPayout = 0, otaPayoutCnt = 0, refunds = 0;

    for (const c of collections) {
      // Exclude legacy sync rows from KPI metrics
      if ((c as any).is_legacy_sync === true) continue;

      const date = new Date(c.collected_at || c.created_at);
      const isToday = date.toDateString() === today;
      const isMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      const isCollect = c.collection_type === "COLLECT";
      const isRefund = c.collection_type === "REFUND";
      const isVoided = voidedSet.has(c.id);
      const amount = Number(c.amount_collected);

      if (isToday) {
        todayArr.push(c);
        if (isCollect && !isVoided) collectTotalToday += amount;
        if (isRefund) refundTotalToday += Math.abs(amount);
      }
      if (isMonth) {
        monthArr.push(c);
        if (isCollect && !isVoided) collectTotalMonth += amount;
        if (isRefund) refundTotalMonth += Math.abs(amount);
      }
      if (isCollect && !isVoided) {
        switch (c.related_type) {
          case "ROOM": room += amount; break;
          case "EXTRA": extra += amount; break;
          case "SERVICE": service += amount; break;
          case "OTA_PAYOUT": otaPayout += amount; otaPayoutCnt++; break;
        }
      }
      if (isRefund) refunds += Math.abs(amount);
    }

    return {
      todayCollections: todayArr,
      monthCollections: monthArr,
      todayNet: collectTotalToday - refundTotalToday,
      monthNet: collectTotalMonth - refundTotalMonth,
      totalRoom: room,
      totalExtra: extra,
      totalService: service,
      totalOtaPayout: otaPayout,
      otaPayoutCount: otaPayoutCnt,
      totalRefunds: refunds,
    };
  }, [collections, voidedSet]);

  // ── Memoize filtered collections ──
  const filteredCollections = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return collections.filter((collection: any) => {
      // Hide legacy sync rows by default
      if (!showLegacySync && collection.is_legacy_sync === true) return false;

      const matchesSearch =
        collection.unified_booking_id.toLowerCase().includes(searchLower) ||
        collection.booking?.guest_name?.toLowerCase().includes(searchLower);

      const matchesBucket = bucketFilter === "all" || collection.related_type === bucketFilter;
      const matchesPayee = payeeFilter === "all" || collection.payee_type === payeeFilter;
      const matchesType = typeFilter === "all" || collection.collection_type === typeFilter;
      const matchesMethod = paymentMethodFilter === "all" || collection.payment_method === paymentMethodFilter;

      let matchesDate = true;
      if (dateRange.start || dateRange.end) {
        const collectionDate = new Date(collection.collected_at || collection.created_at);
        collectionDate.setHours(0, 0, 0, 0);

        if (dateRange.start) {
          const startDate = new Date(dateRange.start);
          startDate.setHours(0, 0, 0, 0);
          if (collectionDate < startDate) matchesDate = false;
        }
        if (dateRange.end) {
          const endDate = new Date(dateRange.end);
          endDate.setHours(23, 59, 59, 999);
          if (collectionDate > endDate) matchesDate = false;
        }
      }

      return matchesSearch && matchesBucket && matchesPayee && matchesType && matchesMethod && matchesDate;
    });
  }, [collections, searchTerm, bucketFilter, payeeFilter, typeFilter, paymentMethodFilter, dateRange, showLegacySync]);

  // ── FIX #2: Client-side pagination — cap rendered rows at PAGE_SIZE ──
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredCollections.length / PAGE_SIZE));
  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, bucketFilter, payeeFilter, typeFilter, paymentMethodFilter, dateRange]);
  const paginatedCollections = useMemo(
    () => filteredCollections.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredCollections, currentPage]
  );

  const clearFilters = () => {
    setSearchTerm("");
    setBucketFilter("all");
    setPayeeFilter("all");
    setTypeFilter("all");
    setPaymentMethodFilter("all");
    setPeriodFilter("all");
    setCustomDateFrom(undefined);
    setCustomDateTo(undefined);
  };

  const hasFilters = searchTerm || bucketFilter !== "all" || payeeFilter !== "all" ||
    typeFilter !== "all" || paymentMethodFilter !== "all" || periodFilter !== "all";

  // Handle receipt upload
  const handleReceiptUpload = async (collectionId: string, file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Lỗi", { description: "Vui lòng chọn file ảnh" });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Lỗi", { description: "File không được vượt quá 5MB" });
      return;
    }

    setUploadingCollectionId(collectionId);
    try {
      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `receipts/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from("payment-receipts")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      // Update collection with receipt image
      await updateReceipt.mutateAsync({
        id: collectionId,
        receipt_image: data.path,
        receipt_status: "UPLOADED",
      });

      toast.success("Thành công", { description: "Đã bổ sung ảnh chứng từ" });
      refetch();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Lỗi tải ảnh", { description: error.message });
    } finally {
      setUploadingCollectionId(null);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, collectionId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      handleReceiptUpload(collectionId, file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle preview receipt
  const handlePreviewReceipt = async (imagePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("payment-receipts")
        .createSignedUrl(imagePath, 3600);

      if (error) throw error;

      setReceiptPreviewUrl(data.signedUrl);
      setReceiptPreviewOpen(true);
    } catch (error: any) {
      console.error("Preview error:", error);
      toast.error("Lỗi xem ảnh", { description: error.message });
    }
  };

  // Mini thumbnail component for receipt images in the table
  const ReceiptThumbnail = ({ imagePath, onClick }: { imagePath: string; onClick: () => void }) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    useEffect(() => {
      let cancelled = false;
      supabase.storage.from("payment-receipts").createSignedUrl(imagePath, 3600)
        .then(({ data }) => { if (!cancelled && data) setThumbUrl(data.signedUrl); });
      return () => { cancelled = true; };
    }, [imagePath]);

    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="h-8 w-8 rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer shrink-0"
        title="Nhấn để xem chứng từ"
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="Receipt" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-muted flex items-center justify-center">
            <Image className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </button>
    );
  };

  if (isLoading) return <><PageSkeleton cards={7} rows={6} columns={11} /></>;

  // ═══ MOBILE VIEW ═══
  // Renders a native-feel task flow: list → detail → action sheet
  // Desktop behavior below remains completely unchanged.
  if (isMobile) {
    return (
      <>
        <MobileCollectionsView
          collections={collections}
          filteredCollections={filteredCollections}
          isLoading={isLoading}
          voidedSet={voidedSet}
          todayNet={todayNet}
          monthNet={monthNet}
          canPerformActions={canPerformActions}
          canRefund={canRefund}
          canVoid={canVoid}
          onCreateOpen={() => setIsCreateOpen(true)}
          onRefundOpen={(c) => { setSelectedCollection(c); setIsRefundOpen(true); }}
          onVoidOpen={(c) => { setSelectedCollection(c); setIsVoidOpen(true); }}
          getRelatedCollections={getRelatedCollections}
        />

        {/* Reuse existing dialogs — they work on both mobile and desktop */}
        <CreateCollectionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        {selectedCollection && (
          <RefundDialog
            open={isRefundOpen}
            onOpenChange={(open) => { setIsRefundOpen(open); if (!open) setSelectedCollection(null); }}
            collection={selectedCollection}
            maxRefundAmount={canRefundCollection(selectedCollection, getRelatedCollections(selectedCollection.id)).maxRefundAmount}
          />
        )}
        {selectedCollection && (
          <VoidDialog
            open={isVoidOpen}
            onOpenChange={(open) => { setIsVoidOpen(open); if (!open) setSelectedCollection(null); }}
            collection={selectedCollection}
          />
        )}
      </>
    );
  }

  // ═══ DESKTOP VIEW ═══ (unchanged)
  return (
    <>
      <Header
        title="Thu tiền"
        subtitle=""
      />

      <PageContainer>
        <SectionCard>
          {/* Legacy sync deprecation notice */}
          {legacySyncCount > 0 && !showLegacySync && (
            <Alert className="bg-muted/50 border-border py-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-muted-foreground text-xs md:text-sm flex items-center justify-between gap-2 flex-wrap">
                <span>Có {legacySyncCount} dòng SYNC legacy đã được ẩn mặc định.</span>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowLegacySync(true)}>
                  Hiện dữ liệu legacy
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {showLegacySync && legacySyncCount > 0 && (
            <Alert className="bg-warning/10 border-warning/20 py-2">
              <Database className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning text-xs md:text-sm flex items-center justify-between gap-2 flex-wrap">
                <span>Đang hiện {legacySyncCount} dòng SYNC legacy (công cụ cũ, đã ngừng).</span>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowLegacySync(false)}>
                  Ẩn lại
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Important Notice - Hidden on mobile, compact on tablet */}
          <Alert className="hidden md:flex bg-info/10 border-info/20 dark:bg-info/10 dark:border-info">
            <Info className="h-4 w-4 text-info" />
            <AlertDescription className="text-info">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm">
                  <strong>Thu tiền = SOURCE OF TRUTH</strong> cho tất cả tiền vào tài khoản Roomrise.
                </div>
                {otaPayoutCount > 0 && bucketFilter !== "OTA_PAYOUT" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setSearchTerm("");
                      setPayeeFilter("all");
                      setTypeFilter("all");
                      setPaymentMethodFilter("all");
                      setPeriodFilter("all");
                      setCustomDateFrom(undefined);
                      setCustomDateTo(undefined);
                      setBucketFilter("OTA_PAYOUT");
                    }}
                  >
                    Xem OTA Payout ({otaPayoutCount})
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {/* KPI Stats - Mobile scroll */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 lg:grid-cols-7 md:overflow-visible scrollbar-hide">
            <div className="flex-shrink-0 w-[130px] md:w-auto rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-success" />
                <span className="text-micro md:text-xs text-muted-foreground">Hôm nay</span>
              </div>
              <p className="text-lg md:text-kpi font-semibold tabular-nums tracking-tight text-success truncate">{formatCurrency(todayNet)}</p>
            </div>

            <div className="flex-shrink-0 w-[130px] md:w-auto rounded-lg border border-primary/30 bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-primary" />
                <span className="text-micro md:text-xs text-muted-foreground">Tháng</span>
              </div>
              <p className="text-lg md:text-kpi font-semibold tabular-nums tracking-tight truncate">{formatCurrency(monthNet)}</p>
            </div>

            <div className="flex-shrink-0 w-[110px] md:w-auto rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <Home className="h-4 w-4 text-info" />
                <span className="text-micro md:text-xs text-muted-foreground">Phòng</span>
              </div>
              <p className="text-base md:text-kpi font-semibold tabular-nums tracking-tight truncate">{formatCurrency(totalRoom)}</p>
            </div>

            <div className="flex-shrink-0 w-[100px] md:w-auto rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-warning" />
                <span className="text-micro md:text-xs text-muted-foreground">Phụ phí</span>
              </div>
              <p className="text-base md:text-kpi font-semibold tabular-nums tracking-tight truncate">{formatCurrency(totalExtra)}</p>
            </div>

            <div className="flex-shrink-0 w-[100px] md:w-auto rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <Plane className="h-4 w-4 text-primary" />
                <span className="text-micro md:text-xs text-muted-foreground">Dịch vụ</span>
              </div>
              <p className="text-base md:text-kpi font-semibold tabular-nums tracking-tight truncate">{formatCurrency(totalService)}</p>
            </div>

            <div className="flex-shrink-0 w-[110px] md:w-auto rounded-lg border border-success/30 bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownLeft className="h-4 w-4 text-success" />
                <span className="text-micro md:text-xs text-muted-foreground">OTA</span>
              </div>
              <p className="text-base md:text-kpi font-semibold tabular-nums tracking-tight text-success truncate">{formatCurrency(totalOtaPayout)}</p>
            </div>

            <div className="flex-shrink-0 w-[100px] md:w-auto rounded-lg border border-warning/30 bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw className="h-4 w-4 text-warning" />
                <span className="text-micro md:text-xs text-muted-foreground">Hoàn</span>
              </div>
              <p className="text-base md:text-kpi font-semibold tabular-nums tracking-tight text-warning truncate">{formatCurrency(totalRefunds)}</p>
            </div>
          </div>

          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Tìm kiếm và lọc thu tiền"
            hasActiveFilters={!!hasFilters}
            onClearFilters={clearFilters}
          >
            <FilterBar.Field label="Tìm kiếm" colSpan={2}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm booking, khách..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </FilterBar.Field>

            <FilterBar.Field label="Loại">
              <Select value={bucketFilter} onValueChange={setBucketFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Loại" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="ROOM">Phòng</SelectItem>
                  <SelectItem value="EXTRA">Phụ phí</SelectItem>
                  <SelectItem value="SERVICE">Dịch vụ</SelectItem>
                  <SelectItem value="OTA_PAYOUT">OTA</SelectItem>
                  <SelectItem value="HOST_DEPOSIT_REFUND">Cọc Host</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Phương thức TT">
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Phương thức" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((m) => (
                    <SelectItem key={m.value || "all"} value={m.value || "all"}>
                      <div className="flex items-center gap-2">
                        {m.value && <PaymentMethodIcon code={m.value} className="h-3.5 w-3.5 text-muted-foreground" />}
                        {m.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Loại giao dịch">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Loại GD" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="COLLECT">Thu</SelectItem>
                  <SelectItem value="REFUND">Hoàn</SelectItem>
                  <SelectItem value="VOID">Hủy</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Khoảng thời gian">
              <Select value={periodFilter} onValueChange={(v) => {
                setPeriodFilter(v);
                if (v !== "custom") {
                  setCustomDateFrom(undefined);
                  setCustomDateTo(undefined);
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Ngày" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="week">Tuần</SelectItem>
                  <SelectItem value="month">Tháng</SelectItem>
                  <SelectItem value="custom">Chọn ngày</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Người thu">
              <Select value={payeeFilter} onValueChange={setPayeeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Người thu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="ROOMRISE">Roomrise</SelectItem>
                  <SelectItem value="HOST">Host</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            {periodFilter === "custom" && (
              <FilterBar.Field label="Từ ngày — Đến ngày" colSpan={2}>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[130px] justify-start text-left font-normal h-9 text-sm",
                          !customDateFrom && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {customDateFrom ? format(customDateFrom, "dd/MM/yy") : "Từ ngày"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customDateFrom}
                        onSelect={setCustomDateFrom}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground text-xs">—</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[130px] justify-start text-left font-normal h-9 text-sm",
                          !customDateTo && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {customDateTo ? format(customDateTo, "dd/MM/yy") : "Đến ngày"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customDateTo}
                        onSelect={setCustomDateTo}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </FilterBar.Field>
            )}
          </FilterBar>

          {/* Collections List */}
          {filteredCollections.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Chưa có giao dịch</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {paginatedCollections.map((collection) => {
                  const isVoided = isCollectionVoided(collection.id);
                  const bucket = bucketConfig[collection.related_type as keyof typeof bucketConfig] ||
                    { label: collection.related_type || "N/A", icon: Receipt, color: "text-muted-foreground" };
                  const BucketIcon = bucket.icon;

                  const getStatusDisplay = () => {
                    if (collection.collection_type === "VOID") return { label: "VOID", variant: "default" as const };
                    if (collection.collection_type === "REFUND") return { label: "REFUND", variant: "warning" as const };
                    if (isVoided) return { label: "Hủy", variant: "default" as const };
                    return { label: "Đã thu", variant: "success" as const };
                  };
                  const statusDisplay = getStatusDisplay();

                  return (
                    <div
                      key={collection.id}
                      className={`rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors ${isVoided ? "opacity-50" : ""}`}
                      onClick={() => {
                        setDetailCollection(collection);
                        setIsDetailOpen(true);
                      }}
                    >
                      {/* Row 1: Bucket + Amount */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <BucketIcon className={`h-4 w-4 flex-shrink-0 ${bucket.color}`} />
                          <span className="text-xs font-medium truncate">{bucket.label}</span>
                          <StatusBadge variant={statusDisplay.variant} size="sm">
                            {statusDisplay.label}
                          </StatusBadge>
                        </div>
                        <span className={`font-bold text-sm flex-shrink-0 ${collection.collection_type === "REFUND" ? "text-warning" :
                          isVoided ? "text-muted-foreground line-through" : "text-success"
                          }`}>
                          {collection.collection_type === "REFUND" ? "-" : "+"}
                          {formatCurrency(Math.abs(Number(collection.amount_collected)))}
                        </span>
                      </div>

                      {/* Row 2: Guest/Property + Date */}
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">
                          {collection.related_type === "OTA_PAYOUT" ? "OTA Payout" : (collection.booking?.guest_name || "—")}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span>{getPaymentMethodLabel(collection.payment_method || '')}</span>
                          <span>{new Date(collection.collected_at || collection.created_at).toLocaleDateString("vi-VN")}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 w-10"></th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Ngày thu
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Booking
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Khách
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Chỗ nghỉ
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Nguồn đặt
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Loại thu
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Ghi chú
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Số tiền
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Phương thức
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Chứng từ
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Người thu
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Trạng thái
                        </th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedCollections.map((collection) => {
                        const isVoided = isCollectionVoided(collection.id);
                        const relatedCols = getRelatedCollections(collection.id);
                        const refundCheck = canRefundCollection(collection, relatedCols);
                        const voidCheck = canVoidCollection(collection, relatedCols);

                        const bucket = bucketConfig[collection.related_type as keyof typeof bucketConfig] ||
                          { label: collection.related_type || "N/A", icon: Receipt, color: "text-muted-foreground" };
                        const BucketIcon = bucket.icon;

                        // Booking source display
                        const bookingSource = getBookingSource(collection.booking);

                        // Collector display
                        const collectorDisplay = getCollectorDisplay(collection);

                        // Status display
                        const getStatusDisplay = () => {
                          if (collection.collection_type === "VOID") {
                            return { label: "VOID", variant: "default" as const };
                          }
                          if (collection.collection_type === "REFUND") {
                            return { label: "REFUND", variant: "warning" as const };
                          }
                          if (isVoided) {
                            return { label: "Bị hủy", variant: "default" as const };
                          }
                          return { label: "Đã thu", variant: "success" as const };
                        };
                        const statusDisplay = getStatusDisplay();

                        const isLegacySync = (collection as any).is_legacy_sync === true;

                        return (
                          <tr
                            key={collection.id}
                            className={`hover:bg-muted/30 transition-colors cursor-pointer ${isVoided ? "opacity-50" : ""} ${isLegacySync ? "opacity-60 bg-muted/20" : ""}`}
                            onClick={() => {
                              setDetailCollection(collection);
                              setIsDetailOpen(true);
                            }}
                          >
                            {/* Detail Icon */}
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailCollection(collection);
                                  setIsDetailOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </td>

                            {/* Date */}
                            <td className="px-4 py-3 text-sm">
                              {new Date(collection.collected_at || collection.created_at).toLocaleDateString("vi-VN")}
                              <span className="block text-xs text-muted-foreground">
                                {new Date(collection.collected_at || collection.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>

                            {/* Booking / Source */}
                            <td className="px-4 py-3">
                              {collection.related_type === "OTA_PAYOUT" ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-success text-sm">
                                    {(collection as any).allocations?.length > 1
                                      ? `OTA Payout (${(collection as any).allocations.length})`
                                      : "OTA Payout"}
                                  </span>
                                  {isLegacySync && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <StatusBadge variant="default" size="sm">LEGACY</StatusBadge>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="text-xs">Dòng này được tạo bởi công cụ SYNC cũ (đã ngừng). Dữ liệu vẫn chính xác, không ảnh hưởng cashflow.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/bookings/${collection.unified_booking_id}`); }}
                                  className="font-medium text-primary hover:underline flex items-center gap-1"
                                >
                                  {formatBookingCode(
                                    collection.unified_booking_id,
                                    collection.booking?.ota_booking_code,
                                    collection.booking?.source,
                                    collection.booking?.check_in_date
                                  )}
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              )}
                            </td>

                            {/* Guest Name */}
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium truncate max-w-[160px]">
                                {collection.related_type === "OTA_PAYOUT"
                                  ? "Tiền OTA về"
                                  : (collection.booking?.guest_name || "—")}
                              </p>
                            </td>

                            {/* Property */}
                            <td className="px-4 py-3">
                              <p className="text-sm text-muted-foreground truncate max-w-[160px]">
                                {collection.related_type === "OTA_PAYOUT"
                                  ? (collection.note?.replace("[SYNC] ", "")?.match(/Tiền OTA .+ về (.+)/)?.[1] || "OTA")
                                  : (collection.booking?.host_property_name || collection.booking?.pms_property_name || "—")}
                              </p>
                            </td>

                            {/* Booking Source */}
                            <td className="px-4 py-3">
                              {collection.related_type === "OTA_PAYOUT" ? (
                                <StatusBadge variant="success" size="sm">
                                  OTA Payout
                                </StatusBadge>
                              ) : (
                                <StatusBadge
                                  variant={bookingSource.isOta ? "success" : "default"}
                                  size="sm"
                                >
                                  {bookingSource.label}
                                </StatusBadge>
                              )}
                            </td>

                            {/* Collection Type (Bucket) */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <BucketIcon className={`h-4 w-4 ${bucket.color}`} />
                                <span className="text-sm">{bucket.label}</span>
                              </div>
                            </td>

                            {/* Notes */}
                            <td className="px-4 py-3">
                              {collection.note ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-xs text-muted-foreground truncate max-w-[120px] cursor-help">
                                        <StickyNote className="inline h-3 w-3 mr-1 opacity-50" />
                                        {collection.note}
                                      </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                      <p className="text-sm">{collection.note}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-medium ${collection.collection_type === "REFUND"
                                  ? "text-warning"
                                  : collection.collection_type === "VOID" || isVoided
                                    ? "text-muted-foreground line-through"
                                    : "text-success"
                                  }`}
                              >
                                {collection.collection_type === "REFUND" ? "-" : "+"}
                                {formatCurrency(Math.abs(Number(collection.amount_collected)))}
                              </span>
                            </td>

                            {/* Payment Method */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 text-sm">
                                <PaymentMethodIcon code={collection.payment_method || ''} className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="truncate">{getPaymentMethodLabel(collection.payment_method || '')}</span>
                              </div>
                              {collection.payment_method === 'PAYMENT_LINK' && (collection as any).payment_provider && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <PaymentMethodIcon code={(collection as any).payment_provider} className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                                  <span className="text-[10px] text-muted-foreground">{getProviderLabel((collection as any).payment_provider)}</span>
                                </div>
                              )}
                              {collection.payment_method === 'PAYMENT_LINK' && (collection as any).payment_link_url && (
                                <a
                                  href={(collection as any).payment_link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 mt-0.5 text-[10px] text-primary hover:underline truncate max-w-[140px]"
                                  title={(collection as any).payment_link_url}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{(collection as any).payment_link_url.replace(/^https?:\/\//, '')}</span>
                                </a>
                              )}
                            </td>

                            {/* Receipt Status — clickable thumbnail if image exists */}
                            <td className="px-4 py-3">
                              {collection.receipt_image ? (
                                <div className="flex items-center gap-2">
                                  <ReceiptThumbnail
                                    imagePath={collection.receipt_image}
                                    onClick={() => handlePreviewReceipt(collection.receipt_image!)}
                                  />
                                  <ReceiptStatusBadge status={collection.receipt_status} hasImage={!!collection.receipt_image} />
                                </div>
                              ) : (
                                <ReceiptStatusBadge status={collection.receipt_status} hasImage={false} />
                              )}
                            </td>

                            {/* Collector (Người thu) */}
                            <td className="px-4 py-3">
                              <StatusBadge
                                variant={collectorDisplay.variant}
                                size="sm"
                              >
                                {collectorDisplay.label}
                              </StatusBadge>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <StatusBadge variant={statusDisplay.variant} size="sm">
                                {statusDisplay.label}
                              </StatusBadge>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              {collection.collection_type === "COLLECT" && !isVoided && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {/* Receipt actions */}
                                    {collection.receipt_image ? (
                                      <DropdownMenuItem onClick={() => handlePreviewReceipt(collection.receipt_image!)}>
                                        <Eye className="h-4 w-4 mr-2" />
                                        Xem chứng từ
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedCollection(collection);
                                          fileInputRef.current?.click();
                                        }}
                                        disabled={uploadingCollectionId === collection.id}
                                      >
                                        {uploadingCollectionId === collection.id ? (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                          <Upload className="h-4 w-4 mr-2" />
                                        )}
                                        Bổ sung chứng từ
                                      </DropdownMenuItem>
                                    )}

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={() => window.print()}>
                                      In biên lai
                                    </DropdownMenuItem>
                                    {collection.related_type === "OTA_PAYOUT" ? (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          const payoutId = (collection as any).allocations?.[0]?.payout_id;
                                          if (payoutId) navigate(`/ota-payouts/${payoutId}`);
                                        }}
                                      >
                                        Xem OTA Payout
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => navigate(`/bookings/${collection.unified_booking_id}`)}
                                      >
                                        Xem booking
                                      </DropdownMenuItem>
                                    )}

                                    {canPerformActions && (canRefund || canVoid) && <DropdownMenuSeparator />}

                                    {canPerformActions && canRefund && refundCheck.canRefund && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedCollection(collection);
                                          setIsRefundOpen(true);
                                        }}
                                        className="text-warning"
                                      >
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        Hoàn tiền
                                      </DropdownMenuItem>
                                    )}

                                    {canPerformActions && canVoid && voidCheck.canVoid && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedCollection(collection);
                                          setIsVoidOpen(true);
                                        }}
                                      >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Hủy thu (VOID)
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">
                    Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCollections.length)} / {filteredCollections.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      ← Trước
                    </Button>
                    <span className="text-sm px-3">{currentPage} / {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Sau →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard >
      </PageContainer >

      {/* Create Collection Dialog */}
      < CreateCollectionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* Refund Dialog */}
      {
        selectedCollection && (
          <RefundDialog
            open={isRefundOpen}
            onOpenChange={(open) => {
              setIsRefundOpen(open);
              if (!open) setSelectedCollection(null);
            }}
            collection={selectedCollection}
            maxRefundAmount={
              canRefundCollection(selectedCollection, getRelatedCollections(selectedCollection.id))
                .maxRefundAmount
            }
          />
        )
      }

      {/* Void Dialog */}
      {
        selectedCollection && (
          <VoidDialog
            open={isVoidOpen}
            onOpenChange={(open) => {
              setIsVoidOpen(open);
              if (!open) setSelectedCollection(null);
            }}
            collection={selectedCollection}
          />
        )
      }

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Chi tiết giao dịch thu tiền</DialogTitle>
          </DialogHeader>

          {detailCollection && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Booking ID</p>
                  <p className="font-medium">{detailCollection.unified_booking_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ngày thu</p>
                  <p className="font-medium">
                    {new Date(detailCollection.collected_at || detailCollection.created_at).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Khách hàng</p>
                  <p className="font-medium">{detailCollection.booking?.guest_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chỗ nghỉ</p>
                  <p className="font-medium">
                    {detailCollection.booking?.host_property_name || detailCollection.booking?.pms_property_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Số tiền</p>
                  <p className="font-medium text-success">
                    {detailCollection.collection_type === "REFUND" ? "-" : "+"}
                    {formatCurrency(Math.abs(Number(detailCollection.amount_collected)))}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phương thức</p>
                  <p className="font-medium flex items-center gap-1.5">
                    <PaymentMethodIcon code={detailCollection.payment_method || ''} className="h-4 w-4 text-muted-foreground" />
                    {getPaymentMethodLabel(detailCollection.payment_method || '')}
                  </p>
                  {detailCollection.payment_method === 'PAYMENT_LINK' && (detailCollection as any).payment_provider && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <PaymentMethodIcon code={(detailCollection as any).payment_provider} className="h-3 w-3" />
                      {getProviderLabel((detailCollection as any).payment_provider)}
                    </p>
                  )}
                </div>
                {detailCollection.payment_method === 'PAYMENT_LINK' && (detailCollection as any).payment_link_url && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Link thanh toán</p>
                    <a
                      href={(detailCollection as any).payment_link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline flex items-center gap-1.5 break-all"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {(detailCollection as any).payment_link_url}
                    </a>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Loại thu</p>
                  <p className="font-medium">
                    {bucketConfig[detailCollection.related_type as keyof typeof bucketConfig]?.label || detailCollection.related_type}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Người thu</p>
                  <StatusBadge variant={getCollectorDisplay(detailCollection).variant} size="sm">
                    {getCollectorDisplay(detailCollection).label}
                  </StatusBadge>
                </div>
                {detailCollection.receipt && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Reference giao dịch</p>
                    <p className="font-medium">{detailCollection.receipt}</p>
                  </div>
                )}
                {detailCollection.note && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Ghi chú</p>
                    <p className="font-medium">{detailCollection.note}</p>
                  </div>
                )}
              </div>

              {/* OTA Payout links — clickable cards with rich info */}
              {detailCollection.related_type === "OTA_PAYOUT" && (detailCollection as any).allocations?.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    Payout liên quan ({(detailCollection as any).allocations.length})
                  </p>
                  <div className="space-y-2">
                    {(detailCollection as any).allocations.map((alloc: any, idx: number) => {
                      const payout = alloc.payout;
                      const otaSource = payout?.ota_source || "OTA";
                      const payoutDate = payout?.payout_date
                        ? new Date(payout.payout_date).toLocaleDateString("vi-VN")
                        : "—";
                      return (
                        <button
                          key={idx}
                          onClick={() => window.open(`/ota-payouts/${alloc.payout_id}`, '_blank')}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/30 transition-colors text-left group"
                          title={`Mở chi tiết payout ${alloc.payout_id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex items-center justify-center h-8 w-8 rounded-md bg-success/10 text-success shrink-0">
                              <ArrowDownLeft className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{otaSource}</span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{payoutDate}</span>
                              </div>
                              <span className="text-micro font-mono text-muted-foreground">
                                ID: {alloc.payout_id?.slice(0, 12)}…
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold tabular-nums text-success">
                              {formatCurrency(alloc.allocated_amount || 0)}
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                  <Paperclip className="h-4 w-4" />
                  Ảnh chứng từ
                </p>
                {detailCollection.receipt_image ? (
                  <ReceiptImagePreview
                    imagePath={detailCollection.receipt_image}
                    status={detailCollection.receipt_status}
                  />
                ) : (
                  <ReceiptUpload
                    value={null}
                    status="PENDING"
                    onChange={(imagePath) => {
                      if (imagePath) {
                        updateReceipt.mutate({
                          id: detailCollection.id,
                          receipt_image: imagePath,
                          receipt_status: "UPLOADED",
                        });
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for receipt upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (selectedCollection) {
            handleFileChange(e, selectedCollection.id);
          }
        }}
      />

      {/* Receipt Preview Dialog */}
      <Dialog open={receiptPreviewOpen} onOpenChange={setReceiptPreviewOpen}>
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle>Ảnh chứng từ</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {receiptPreviewUrl && (
              <img
                src={receiptPreviewUrl}
                alt="Receipt"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

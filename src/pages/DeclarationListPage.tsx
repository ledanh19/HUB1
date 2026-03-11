import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Download,
  Send,
  Loader2,
  Eye,
  CalendarDays,
  FileImage,
  Building2,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Home,
} from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import { supabase } from "@/integrations/supabase/client";
import { useSendDocumentsToHost } from "@/hooks/useGuestDocuments";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { toast } from "sonner";
import JSZip from "jszip";

interface DeclarationItem {
  unified_booking_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number | null;
  pms_property_name: string | null;
  actual_check_in_at: string | null;
  partner_id: string | null;
  partner_name: string | null;
  host_property_name: string | null;
  document_count: number;
  sent_to_host_status: "NOT_SENT" | "SENT" | "NO_DOCUMENT";
  documents: Array<{
    id: string;
    document_type: string;
    document_image: string | null;
    sent_to_host_status: string;
    uploaded_at: string | null;
  }>;
  // New fields from segment
  segment_check_in_date: string | null;
  host_room_type: string | null;
  room_code: string | null;
  ota_source: string | null;
  ota_booking_code: string | null;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Date filter options for segment check-in date
const SEGMENT_DATE_OPTIONS = {
  all: { label: "Tất cả ngày", offset: null },
  today: { label: "Hôm nay", offset: 0 },
  yesterday: { label: "Hôm qua", offset: -1 },
  tomorrow: { label: "Ngày mai", offset: 1 },
  custom: { label: "Tùy chỉnh", offset: null },
} as const;

const getDateString = (offset: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function DeclarationListPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Segment check-in date filter
  const [segmentDateFilter, setSegmentDateFilter] = useState<keyof typeof SEGMENT_DATE_OPTIONS>("all");
  const [customDate, setCustomDate] = useState<string>("");

  // Image viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<Array<{ url: string; type: string }>>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerGuestName, setViewerGuestName] = useState("");

  const sendToHostMutation = useSendDocumentsToHost();

  // Open image viewer
  const openImageViewer = async (item: DeclarationItem) => {
    if (item.document_count === 0) {
      toast.error("Không có ảnh để xem");
      return;
    }

    setViewerLoading(true);
    setViewerGuestName(item.guest_name);
    setViewerOpen(true);
    setViewerIndex(0);

    try {
      const images: Array<{ url: string; type: string }> = [];

      for (const doc of item.documents) {
        if (!doc.document_image) continue;

        const { data } = await supabase.storage
          .from("guest-documents")
          .createSignedUrl(doc.document_image, 3600);

        if (data?.signedUrl) {
          images.push({
            url: data.signedUrl,
            type: doc.document_type,
          });
        }
      }

      setViewerImages(images);
    } catch (err) {
      console.error("Failed to load images:", err);
      toast.error("Lỗi tải ảnh");
    } finally {
      setViewerLoading(false);
    }
  };

  const nextImage = () => {
    setViewerIndex((prev) => (prev + 1) % viewerImages.length);
  };

  const prevImage = () => {
    setViewerIndex((prev) => (prev - 1 + viewerImages.length) % viewerImages.length);
  };

  // Fetch declarations data
  const { data: declarations = [], isLoading, refetch } = useQuery({
    queryKey: ["declaration_list"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get stays with actual_check_in_at
      const { data: staysData, error: staysError } = await supabase
        .from("stays")
        .select("unified_booking_id, actual_check_in_at")
        .not("actual_check_in_at", "is", null);

      if (staysError) throw staysError;
      if (!staysData?.length) return [];

      const bookingIds = staysData.map(s => s.unified_booking_id);

      // Parallel fetch: bookings, segments, documents
      const [bookingsRes, segmentsRes, documentsRes] = await Promise.all([
        supabase
          .from("bookings_mirror")
          .select("unified_booking_id, guest_name, guest_phone, check_in_date, check_out_date, nights, pms_property_name, ota_source, ota_booking_code")
          .in("unified_booking_id", bookingIds),
        supabase
          .from("host_supply_segments")
          .select("unified_booking_id, partner_id, host_property_name, host_room_type, room_code, date_from, partners(partner_name)")
          .in("unified_booking_id", bookingIds),
        supabase
          .from("guest_documents")
          .select("id, unified_booking_id, document_type, document_image, sent_to_host_status, uploaded_at")
          .in("unified_booking_id", bookingIds),
      ]);

      // Build maps
      const staysMap = new Map(staysData.map(s => [s.unified_booking_id, s]));
      const segmentsMap = new Map<string, {
        partner_id: string;
        partner_name: string | null;
        host_property_name: string | null;
        host_room_type: string | null;
        room_code: string | null;
        date_from: string | null;
      }>();
      segmentsRes.data?.forEach(seg => {
        const partnersData = seg.partners;
        const partnerInfo = Array.isArray(partnersData) ? partnersData[0] : partnersData;
        if (!segmentsMap.has(seg.unified_booking_id)) {
          segmentsMap.set(seg.unified_booking_id, {
            partner_id: seg.partner_id,
            partner_name: partnerInfo?.partner_name || null,
            host_property_name: seg.host_property_name,
            host_room_type: seg.host_room_type || null,
            room_code: seg.room_code || null,
            date_from: seg.date_from || null,
          });
        }
      });

      // Group documents by booking
      const documentsMap = new Map<string, DeclarationItem["documents"]>();
      documentsRes.data?.forEach(doc => {
        const existing = documentsMap.get(doc.unified_booking_id) || [];
        existing.push({
          id: doc.id,
          document_type: doc.document_type,
          document_image: doc.document_image,
          sent_to_host_status: doc.sent_to_host_status,
          uploaded_at: doc.uploaded_at,
        });
        documentsMap.set(doc.unified_booking_id, existing);
      });

      // Build result
      return bookingsRes.data?.map(booking => {
        const stay = staysMap.get(booking.unified_booking_id);
        const segment = segmentsMap.get(booking.unified_booking_id);
        const docs = documentsMap.get(booking.unified_booking_id) || [];

        const hasImages = docs.some(d => d.document_image);
        const allSent = docs.length > 0 && docs.every(d => d.sent_to_host_status === "SENT");

        let status: DeclarationItem["sent_to_host_status"] = "NO_DOCUMENT";
        if (hasImages) {
          status = allSent ? "SENT" : "NOT_SENT";
        }

        return {
          unified_booking_id: booking.unified_booking_id,
          guest_name: booking.guest_name,
          guest_phone: booking.guest_phone,
          check_in_date: booking.check_in_date,
          check_out_date: booking.check_out_date,
          nights: booking.nights,
          pms_property_name: booking.pms_property_name,
          actual_check_in_at: stay?.actual_check_in_at || null,
          partner_id: segment?.partner_id || null,
          partner_name: segment?.partner_name || null,
          host_property_name: segment?.host_property_name || null,
          document_count: docs.filter(d => d.document_image).length,
          sent_to_host_status: status,
          documents: docs,
          // New segment fields
          segment_check_in_date: segment?.date_from || null,
          host_room_type: segment?.host_room_type || null,
          room_code: segment?.room_code || null,
          ota_source: booking.ota_source || null,
          ota_booking_code: booking.ota_booking_code || null,
        } as DeclarationItem;
      }).filter(Boolean) || [];
    },
  });

  // Get unique hosts for filter
  const hosts = useMemo(() => {
    const hostSet = new Map<string, string>();
    declarations.forEach(d => {
      if (d.partner_id && d.partner_name) {
        hostSet.set(d.partner_id, d.partner_name);
      }
    });
    return Array.from(hostSet.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [declarations]);

  // Get unique properties for filter (segment-based)
  const properties = useMemo(() => {
    const propertySet = new Set<string>();
    declarations.forEach(d => {
      if (d.host_property_name) {
        propertySet.add(d.host_property_name);
      }
    });
    return Array.from(propertySet).sort();
  }, [declarations]);

  // Filter data
  const filteredData = useMemo(() => {
    let result = [...declarations];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(d =>
        d.unified_booking_id.toLowerCase().includes(term) ||
        d.guest_name?.toLowerCase().includes(term) ||
        d.guest_phone?.includes(term)
      );
    }

    // Host filter
    if (hostFilter !== "all") {
      result = result.filter(d => d.partner_id === hostFilter);
    }

    // Property filter (segment-based)
    if (propertyFilter !== "all") {
      result = result.filter(d => d.host_property_name === propertyFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter(d => d.sent_to_host_status === statusFilter);
    }

    // Segment check-in date filter
    if (segmentDateFilter !== "all") {
      let targetDate: string | null = null;

      if (segmentDateFilter === "custom" && customDate) {
        targetDate = customDate;
      } else if (segmentDateFilter !== "custom") {
        const offset = SEGMENT_DATE_OPTIONS[segmentDateFilter].offset;
        if (offset !== null) {
          targetDate = getDateString(offset);
        }
      }

      if (targetDate) {
        result = result.filter(d => {
          const segmentDate = d.segment_check_in_date?.split("T")[0];
          return segmentDate === targetDate;
        });
      }
    }

    // Sort by check-in date desc
    result.sort((a, b) => new Date(b.check_in_date).getTime() - new Date(a.check_in_date).getTime());

    return result;
  }, [declarations, searchTerm, hostFilter, propertyFilter, statusFilter, segmentDateFilter, customDate]);

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredData, { defaultPageSize: 10, resetDeps: [searchTerm, hostFilter, propertyFilter, statusFilter, segmentDateFilter, customDate] });

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const total = declarations.length;
    const sent = declarations.filter(d => d.sent_to_host_status === "SENT").length;
    const notSent = declarations.filter(d => d.sent_to_host_status === "NOT_SENT").length;
    const noDoc = declarations.filter(d => d.sent_to_host_status === "NO_DOCUMENT").length;
    // Count NOT_SENT where actual_check_in_at is today
    const notSentToday = declarations.filter(d => {
      if (d.sent_to_host_status !== "NOT_SENT") return false;
      if (!d.actual_check_in_at) return false;
      return d.actual_check_in_at.slice(0, 10) === today;
    }).length;
    return { total, sent, notSent, noDoc, notSentToday };
  }, [declarations]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  // Select all filtered
  const toggleSelectAll = () => {
    if (selectedItems.size === filteredData.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredData.map(d => d.unified_booking_id)));
    }
  };

  // Export images
  const handleExport = async () => {
    if (selectedItems.size === 0) {
      toast.error("Vui lòng chọn ít nhất một booking");
      return;
    }

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const selectedData = filteredData.filter(d => selectedItems.has(d.unified_booking_id));

      for (const item of selectedData) {
        if (item.documents.length === 0) continue;

        // Create folder for each guest
        const folderName = `${item.guest_name}_${item.check_in_date}`.replace(/[/\\:*?"<>|]/g, "_");
        const folder = zip.folder(folderName);

        for (const doc of item.documents) {
          if (!doc.document_image) continue;

          try {
            // Get signed URL
            const { data: signedData } = await supabase.storage
              .from("guest-documents")
              .createSignedUrl(doc.document_image, 3600);

            if (signedData?.signedUrl) {
              const response = await fetch(signedData.signedUrl);
              const blob = await response.blob();
              const ext = doc.document_type === "PASSPORT" ? "passport" : "cccd";
              folder?.file(`${ext}_${doc.id.slice(0, 8)}.jpg`, blob);
            }
          } catch (err) {
            console.error("Failed to download image:", err);
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `khai_bao_luu_tru_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Đã xuất ${selectedItems.size} booking`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Lỗi khi xuất file");
    } finally {
      setIsExporting(false);
    }
  };

  // Send to host
  const handleSendToHost = async () => {
    if (selectedItems.size === 0) {
      toast.error("Vui lòng chọn ít nhất một booking");
      return;
    }

    setIsSending(true);
    try {
      const selectedData = filteredData.filter(d =>
        selectedItems.has(d.unified_booking_id) && d.sent_to_host_status === "NOT_SENT"
      );

      for (const item of selectedData) {
        await supabase
          .from("guest_documents")
          .update({
            sent_to_host_status: "SENT",
            sent_to_host_at: new Date().toISOString(),
          })
          .eq("unified_booking_id", item.unified_booking_id)
          .eq("sent_to_host_status", "NOT_SENT");
      }

      // Invalidate queries and refetch
      await queryClient.invalidateQueries({ queryKey: ["declaration_list"] });
      await queryClient.invalidateQueries({ queryKey: ["batch_document_status"] });
      await queryClient.invalidateQueries({ queryKey: ["guest_documents"] });
      await refetch();

      toast.success(`Đã cập nhật ${selectedData.length} booking thành "Đã gửi Host"`);
      setSelectedItems(new Set());
    } catch (err) {
      console.error("Send error:", err);
      toast.error("Lỗi khi cập nhật trạng thái");
    } finally {
      setIsSending(false);
    }
  };

  const canSendToHost = Array.from(selectedItems).some(id => {
    const item = filteredData.find(d => d.unified_booking_id === id);
    return item?.sent_to_host_status === "NOT_SENT";
  });

  return (
    <>
      <Header
        title="Danh sách khai báo lưu trú"
        subtitle="Quản lý thông tin CCCD/Passport của khách đã nhận phòng"
      />

      <PageContainer>
        <SectionCard>
          {/* Warning: Not sent today */}
          {stats.notSentToday > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30">
              <Clock className="h-5 w-5 text-warning shrink-0" />
              <div>
                <p className="font-medium text-warning">Chưa gửi thông tin khai báo lưu trú hôm nay</p>
                <p className="text-sm text-muted-foreground">
                  Có <span className="font-semibold text-warning">{stats.notSentToday}</span> khách nhận phòng hôm nay chưa được gửi thông tin khai báo đến Host
                </p>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Tổng cộng</p>
              <p className="text-hero-kpi font-bold tabular-nums tracking-tight">{stats.total}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-success/30">
              <p className="text-xs font-medium text-success uppercase">Đã gửi Host</p>
              <p className="text-hero-kpi font-bold tabular-nums tracking-tight text-success">{stats.sent}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-warning/30">
              <p className="text-xs font-medium text-warning uppercase">Chưa gửi Host</p>
              <p className="text-hero-kpi font-bold tabular-nums tracking-tight text-warning">{stats.notSent}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-destructive/30">
              <p className="text-xs font-medium text-destructive uppercase">Chưa có ảnh</p>
              <p className="text-hero-kpi font-bold tabular-nums tracking-tight text-destructive">{stats.noDoc}</p>
            </div>
          </div>

          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Tìm kiếm và lọc khai báo lưu trú"
            hasActiveFilters={!!(searchTerm || hostFilter !== "all" || propertyFilter !== "all" || segmentDateFilter !== "all" || statusFilter !== "all")}
            onClearFilters={() => {
              setSearchTerm("");
              setHostFilter("all");
              setPropertyFilter("all");
              setSegmentDateFilter("all");
              setCustomDate("");
              setStatusFilter("all");
            }}
          >
            <FilterBar.Field label="Tìm kiếm" colSpan={2}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm khách, booking, SĐT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </FilterBar.Field>

            <FilterBar.Field label="Host">
              <Select value={hostFilter} onValueChange={setHostFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả Host" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả Host</SelectItem>
                  {hosts.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Chỗ nghỉ">
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả chỗ nghỉ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả chỗ nghỉ</SelectItem>
                  {properties.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Ngày nhận phòng">
              <Select value={segmentDateFilter} onValueChange={(v: keyof typeof SEGMENT_DATE_OPTIONS) => setSegmentDateFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Ngày nhận phòng" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_DATE_OPTIONS).map(([key, opt]) => (
                    <SelectItem key={key} value={key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>

            {segmentDateFilter === "custom" && (
              <FilterBar.Field label="Ngày tuỳ chỉnh">
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              </FilterBar.Field>
            )}

            <FilterBar.Field label="Trạng thái">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="SENT">Đã gửi Host</SelectItem>
                  <SelectItem value="NOT_SENT">Chưa gửi Host</SelectItem>
                  <SelectItem value="NO_DOCUMENT">Chưa có ảnh</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>

          {/* Actions */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border">
              <span className="text-sm font-medium">Đã chọn {selectedItems.size} booking</span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Xuất ảnh ZIP
              </Button>
              {canSendToHost && (
                <Button
                  size="sm"
                  onClick={handleSendToHost}
                  disabled={isSending}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Đánh dấu đã gửi Host
                </Button>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Table */}
          {!isLoading && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedItems.size === filteredData.length && filteredData.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[150px]">Mã đặt phòng</TableHead>
                    <TableHead className="w-[160px]">Khách</TableHead>
                    <TableHead className="w-[120px]">Ngày nhận phòng</TableHead>
                    <TableHead className="w-[130px]">Host</TableHead>
                    <TableHead className="w-[180px]">Chỗ nghỉ / Phòng</TableHead>
                    <TableHead className="w-[70px]">Số ảnh</TableHead>
                    <TableHead className="w-[120px]">Trạng thái</TableHead>
                    <TableHead className="w-[120px]">Nhận phòng lúc</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        Không có dữ liệu
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((item) => (
                      <TableRow key={item.unified_booking_id} className="hover:bg-muted/30">
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.has(item.unified_booking_id)}
                            onCheckedChange={() => toggleSelect(item.unified_booking_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/bookings/${item.unified_booking_id}`}
                            className="font-mono text-sm text-primary hover:underline"
                          >
                            {formatBookingCode(
                              item.unified_booking_id,
                              item.ota_booking_code,
                              item.ota_source,
                              item.check_in_date
                            )}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.guest_name}</p>
                            <p className="text-xs text-muted-foreground">{item.guest_phone || "—"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{formatDate(item.segment_check_in_date || item.check_in_date)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{item.partner_name || "—"}</p>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{item.host_property_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.host_room_type || "—"} {item.room_code ? `• ${item.room_code}` : ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <FileImage className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{item.document_count}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.sent_to_host_status === "SENT" && (
                            <StatusBadge variant="success" size="sm">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Đã gửi Host
                            </StatusBadge>
                          )}
                          {item.sent_to_host_status === "NOT_SENT" && (
                            <StatusBadge variant="warning" size="sm">
                              <Clock className="h-3 w-3 mr-1" />
                              Chưa gửi Host
                            </StatusBadge>
                          )}
                          {item.sent_to_host_status === "NO_DOCUMENT" && (
                            <StatusBadge variant="danger" size="sm">
                              Chưa có ảnh
                            </StatusBadge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(item.actual_check_in_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {item.document_count > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openImageViewer(item)}
                                title="Xem ảnh"
                              >
                                <ImageIcon className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" asChild title="Xem chi tiết booking">
                              <Link to={`/bookings/${item.unified_booking_id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="khai báo"
              />
            </div>
          )}
        </SectionCard>
      </PageContainer>

      {/* Image Viewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent size="4xl" className="p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center justify-between">
              <span>Ảnh giấy tờ - {viewerGuestName}</span>
              {viewerImages.length > 1 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {viewerIndex + 1} / {viewerImages.length}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="relative min-h-[400px] flex items-center justify-center bg-muted/30">
            {viewerLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : viewerImages.length > 0 ? (
              <>
                <img
                  src={viewerImages[viewerIndex]?.url}
                  alt={viewerImages[viewerIndex]?.type}
                  className="max-h-[70vh] max-w-full object-contain"
                />

                {viewerImages.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={nextImage}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}

                {/* Image type badge */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-background/90 text-sm font-medium">
                    {viewerImages[viewerIndex]?.type === "PASSPORT" ? "Passport" : "CCCD"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Không có ảnh</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

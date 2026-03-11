import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { Search, Users, Phone, Mail, Globe, Loader2, CalendarCheck, Wallet, ChevronRight, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/ui/status-badge";
import { getBookingStatusVariant } from "@/constants/status-config";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

type Guest = Tables<"guests">;

interface GuestWithStats extends Guest {
  booking_count: number;
}

interface GuestBooking {
  unified_booking_id: string;
  check_in_date: string;
  check_out_date: string;
  ota_source: string;
  booking_status: string;
  total_amount_net: number | null;
  guest_name: string;
}

interface GuestPayment {
  id: string;
  amount_collected: number;
  payment_method: string;
  collected_at: string | null;
  unified_booking_id: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "CONFIRMED": return "Đã xác nhận";
    case "CHECKED_IN": return "Đã nhận phòng";
    case "CHECKED_OUT": return "Đã trả phòng";
    case "CANCELLED": return "Đã huỷ";
    case "NO_SHOW": return "No-show";
    default: return status;
  }
};

const getConfidenceBadge = (level: string) => {
  switch (level) {
    case "HIGH":
      return <Badge variant="default" className="bg-success/20 text-success border-success/30">Cao</Badge>;
    case "MED":
      return <Badge variant="default" className="bg-warning/20 text-warning border-warning/30">Trung bình</Badge>;
    default:
      return <Badge variant="default" className="bg-muted text-muted-foreground border-border">Thấp</Badge>;
  }
};

export default function CustomersPage() {
  const [guests, setGuests] = useState<GuestWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Detail dialog state
  const [selectedGuest, setSelectedGuest] = useState<GuestWithStats | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [guestBookings, setGuestBookings] = useState<GuestBooking[]>([]);
  const [guestPayments, setGuestPayments] = useState<GuestPayment[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    fetchGuests();
  }, []);

  const fetchGuests = async () => {
    setLoading(true);
    try {
      // Fetch guests
      const { data: guestsData, error: guestsError } = await supabase
        .from("guests")
        .select("*")
        .order("updated_at", { ascending: false });

      if (guestsError) throw guestsError;

      // Fetch booking counts per guest
      const { data: linksData, error: linksError } = await supabase
        .from("booking_guest_links")
        .select("guest_id");

      if (linksError) throw linksError;

      // Count bookings per guest
      const countMap = new Map<string, number>();
      linksData?.forEach((link) => {
        const count = countMap.get(link.guest_id) || 0;
        countMap.set(link.guest_id, count + 1);
      });

      // Combine data
      const guestsWithStats: GuestWithStats[] = (guestsData || []).map((guest) => ({
        ...guest,
        booking_count: countMap.get(guest.id) || 0,
      }));

      // Sort by booking count (most bookings first), then by updated_at
      guestsWithStats.sort((a, b) => {
        if (b.booking_count !== a.booking_count) {
          return b.booking_count - a.booking_count;
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

      setGuests(guestsWithStats);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const openGuestDetail = async (guest: GuestWithStats) => {
    setSelectedGuest(guest);
    setDetailOpen(true);
    setLoadingDetail(true);
    setGuestBookings([]);
    setGuestPayments([]);

    try {
      // Fetch booking links for this guest
      const { data: linksData, error: linksError } = await supabase
        .from("booking_guest_links")
        .select("unified_booking_id")
        .eq("guest_id", guest.id);

      if (linksError) throw linksError;

      if (linksData && linksData.length > 0) {
        const bookingIds = linksData.map(l => l.unified_booking_id);

        // Fetch bookings details
        const { data: bookingsData, error: bookingsError } = await supabase
          .from("bookings_mirror")
          .select("unified_booking_id, check_in_date, check_out_date, ota_source, booking_status, total_amount_net, guest_name")
          .in("unified_booking_id", bookingIds)
          .order("check_in_date", { ascending: false });

        if (bookingsError) throw bookingsError;
        setGuestBookings(bookingsData || []);

        // Fetch payments for these bookings
        const { data: paymentsData, error: paymentsError } = await supabase
          .from("hotel_collects")
          .select("id, amount_collected, payment_method, collected_at, unified_booking_id")
          .in("unified_booking_id", bookingIds)
          .order("collected_at", { ascending: false });

        if (paymentsError) throw paymentsError;
        setGuestPayments(paymentsData || []);
      }
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredGuests = guests.filter(
    (guest) =>
      guest.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guest.primary_phone?.includes(searchTerm) ||
      guest.primary_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedGuests = filteredGuests.slice(0, rowsPerPage);

  const totalBookings = guestBookings.length;
  const totalSpent = guestPayments.reduce((sum, p) => sum + Number(p.amount_collected), 0);

  return (
    <>
      <Header
        title="Khách hàng"
        subtitle={`${guests.length} khách hàng • Dữ liệu từ booking`}
      />

      <PageContainer>
        <SectionCard>
          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            hasActiveFilters={searchTerm !== ""}
            onClearFilters={() => setSearchTerm("")}
          >
            <FilterBar.Field label="Tìm kiếm" colSpan={2}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm khách hàng..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </FilterBar.Field>
            <FilterBar.Field label="Số dòng">
              <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>
          <div className="text-sm text-muted-foreground">
            Hiển thị {Math.min(rowsPerPage, filteredGuests.length)} / {filteredGuests.length} khách
          </div>

          {/* Guests Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? "Không tìm thấy khách hàng" : "Chưa có khách hàng nào"}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      Khách hàng
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      Liên hệ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      Quốc tịch
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      Số booking
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      Độ tin cậy
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedGuests.map((guest) => (
                    <tr
                      key={guest.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                            {guest.full_name
                              .split(" ")
                              .slice(-2)
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <span className="font-medium">{guest.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          {guest.primary_phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {guest.primary_phone}
                            </div>
                          )}
                          {guest.primary_email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {guest.primary_email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="h-3 w-3 text-muted-foreground" />
                          {guest.nationality || "Vietnam"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Badge variant="outline" className="font-medium">
                          {guest.booking_count}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getConfidenceBadge(guest.confidence_level)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openGuestDetail(guest)}
                        >
                          Xem chi tiết
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageContainer>

      {/* Guest Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent size="3xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedGuest && (
                <>
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                    {selectedGuest.full_name
                      .split(" ")
                      .slice(-2)
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p>{selectedGuest.full_name}</p>
                      {getConfidenceBadge(selectedGuest.confidence_level)}
                    </div>
                    <p className="text-sm font-normal text-muted-foreground">
                      {selectedGuest.primary_phone || selectedGuest.primary_email || ""}
                    </p>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <CalendarCheck className="h-4 w-4" />
                    Tổng số booking
                  </div>
                  <p className="text-2xl font-semibold">{totalBookings}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Wallet className="h-4 w-4" />
                    Tổng đã thanh toán
                  </div>
                  <p className="text-2xl font-semibold">{formatCurrency(totalSpent)}</p>
                </div>
              </div>

              {/* Bookings */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4" />
                  Lịch sử đặt phòng ({guestBookings.length})
                </h3>
                {guestBookings.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Chưa có booking nào</p>
                ) : (
                  <div className="space-y-2">
                    {guestBookings.map((booking) => (
                      <Link
                        key={booking.unified_booking_id}
                        to={`/bookings/${booking.unified_booking_id}`}
                        className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                        onClick={() => setDetailOpen(false)}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-sm">{booking.unified_booking_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(booking.check_in_date).toLocaleDateString("vi-VN")} → {new Date(booking.check_out_date).toLocaleDateString("vi-VN")}
                              <span className="ml-2 text-primary">{booking.ota_source}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">
                            {formatCurrency(booking.total_amount_net || 0)}
                          </span>
                          <StatusBadge
                            variant={getBookingStatusVariant(booking.booking_status) as any}
                            size="sm"
                          >
                            {getStatusLabel(booking.booking_status)}
                          </StatusBadge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Lịch sử thanh toán ({guestPayments.length})
                </h3>
                {guestPayments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Chưa có thanh toán nào</p>
                ) : (
                  <div className="space-y-2">
                    {guestPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border"
                      >
                        <div>
                          <p className="font-medium text-sm">{formatCurrency(payment.amount_collected)}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.payment_method} • {payment.collected_at ? new Date(payment.collected_at).toLocaleString("en-GB") : "—"}
                          </p>
                        </div>
                        <Link
                          to={`/bookings/${payment.unified_booking_id}`}
                          className="text-sm text-primary hover:underline"
                          onClick={() => setDetailOpen(false)}
                        >
                          {payment.unified_booking_id}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

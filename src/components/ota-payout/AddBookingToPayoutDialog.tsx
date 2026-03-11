import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, Search, AlertCircle, CheckCircle, AlertTriangle, CalendarDays, X } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useEligibleBookingsForPayout, useAddBookingToPayout, useSearchBookingDirect } from "@/hooks/useOtaPayouts";

interface AddBookingToPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payoutId: string;
  otaSource: string;
  otaPropertyId: string | null;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN");
};

export function AddBookingToPayoutDialog({
  open,
  onOpenChange,
  payoutId,
  otaSource,
  otaPropertyId,
}: AddBookingToPayoutDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "before" | "after">("all");
  const [dateFilterValue, setDateFilterValue] = useState<Date | undefined>(undefined);

  const { data: eligibleBookings = [], isLoading } = useEligibleBookingsForPayout(otaSource);
  const { data: directSearchResults = [], isFetching: isSearching } = useSearchBookingDirect(searchTerm, otaSource);
  const addMutation = useAddBookingToPayout();

  const isLegacyPayout = !otaPropertyId;

  // Filter bookings: property + search + checkout date
  const filteredEligible = eligibleBookings.filter((b) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesTerm =
      !term ||
      b.guest_name?.toLowerCase().includes(term) ||
      b.unified_booking_id?.toLowerCase().includes(term) ||
      (b.ota_booking_code || "").toLowerCase().includes(term);

    // Property filter — always enforce when payout has property ID
    let matchesProperty = true;
    if (!isLegacyPayout) {
      matchesProperty = b.ota_property_id === otaPropertyId;
    }

    // Checkout date filter
    let matchesDate = true;
    if (dateFilterMode !== "all" && dateFilterValue && b.check_out_date) {
      const checkoutDate = new Date(b.check_out_date);
      const filterDate = new Date(dateFilterValue);
      // Normalize to date only (no time)
      checkoutDate.setHours(0, 0, 0, 0);
      filterDate.setHours(0, 0, 0, 0);
      if (dateFilterMode === "before") {
        matchesDate = checkoutDate <= filterDate;
      } else {
        matchesDate = checkoutDate >= filterDate;
      }
    }

    return matchesTerm && matchesProperty && matchesDate;
  });

  // Merge: use eligible list + direct search results (dedup by unified_booking_id)
  const eligibleIds = new Set(filteredEligible.map(b => b.unified_booking_id));
  const extraFromSearch = directSearchResults.filter(b => !eligibleIds.has(b.unified_booking_id));
  const filteredBookings = [...filteredEligible, ...extraFromSearch];

  const handleToggleBooking = (bookingId: string) => {
    const newSelected = new Set(selectedBookings);
    if (newSelected.has(bookingId)) {
      newSelected.delete(bookingId);
    } else {
      newSelected.add(bookingId);
    }
    setSelectedBookings(newSelected);
  };

  const handleAddBookings = async () => {
    for (const bookingId of selectedBookings) {
      // Search in both eligible list and direct search results
      const booking = filteredBookings.find((b) => b.unified_booking_id === bookingId);
      if (!booking) continue;

      const isCancelled = booking.booking_status === "CANCELLED";
      const effectiveAmount = isCancelled ? 0 : (booking.total_amount_net || 0);

      await addMutation.mutateAsync({
        payout_id: payoutId,
        unified_booking_id: booking.unified_booking_id,
        booking_code: booking.ota_booking_code || booking.unified_booking_id,
        guest_name: booking.guest_name || "",
        actual_check_out_at: booking.actual_check_out_at || booking.check_out_date || "",
        expected_amount: effectiveAmount,
        booking_status: booking.booking_status,
      });
    }

    setSelectedBookings(new Set());
    onOpenChange(false);
  };

  const totalSelected = selectedBookings.size;
  const totalAmount = [...selectedBookings].reduce((sum, id) => {
    const booking = filteredBookings.find((b) => b.unified_booking_id === id);
    if (!booking) return sum;
    const isCancelled = booking.booking_status === "CANCELLED";
    return sum + (isCancelled ? 0 : (booking.total_amount_net || 0));
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Thêm booking vào payout ({otaSource})</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên khách hoặc mã booking..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Property ID info — locked to payout's property */}
          {!isLegacyPayout ? (
            <div className="flex items-center gap-2 text-sm bg-success/5 border border-success/20 p-3 rounded-lg">
              <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
              <span>
                Lọc theo ID chỗ nghỉ: <strong className="font-mono">{otaPropertyId}</strong>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/30 p-3 rounded-lg">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Payout cũ chưa có ID chỗ nghỉ OTA — hiển thị tất cả booking.</span>
            </div>
          )}

          {/* Checkout Date Filter */}
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={dateFilterMode}
              onValueChange={(v) => setDateFilterMode(v as "all" | "before" | "after")}
            >
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả ngày checkout</SelectItem>
                <SelectItem value="before">Trước ngày checkout</SelectItem>
                <SelectItem value="after">Sau ngày checkout</SelectItem>
              </SelectContent>
            </Select>

            {dateFilterMode !== "all" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-normal">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {dateFilterValue ? format(dateFilterValue, "dd/MM/yyyy", { locale: vi }) : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFilterValue}
                      onSelect={setDateFilterValue}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {dateFilterValue && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => { setDateFilterMode("all"); setDateFilterValue(undefined); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>Booking OTA_COLLECT có ngày trả phòng đã qua hoặc đã hủy sẽ hiển thị</span>
          </div>

          {/* Bookings List */}
          <div className="flex-1 overflow-auto border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {isSearching ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm">Đang tìm trực tiếp...</span>
                  </div>
                ) : (
                  "Không có booking đủ điều kiện"
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-muted">
                  <tr className="border-b">
                    <th className="p-3 w-10"></th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Booking
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Mã booking
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Trả phòng
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Giá phải thu
                    </th>
                    <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                      Đặt phòng
                    </th>
                    <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                      Lưu trú
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredBookings.map((booking) => {
                    const isSelected = selectedBookings.has(booking.unified_booking_id);

                    return (
                      <tr
                        key={booking.unified_booking_id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => handleToggleBooking(booking.unified_booking_id)}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              handleToggleBooking(booking.unified_booking_id)
                            }
                          />
                        </td>
                        <td className="p-3">
                          <p className="font-medium text-sm">{booking.guest_name}</p>
                        </td>
                        <td className="p-3">
                          <p className="text-sm font-medium">
                            {(booking.ota_booking_code || "—").replace(/^[A-Za-z]+-/, "")}
                          </p>
                        </td>
                        <td className="p-3 text-sm">
                          {formatDate(booking.check_out_date)}
                        </td>
                        <td className="p-3 text-right font-medium text-sm">
                          {formatCurrency(booking.booking_status === "CANCELLED" ? 0 : booking.total_amount_net)}
                        </td>
                        <td className="p-3 text-center">
                          {booking.booking_status === "CANCELLED" ? (
                            <StatusBadge variant="danger" size="sm">
                              Đã hủy
                            </StatusBadge>
                          ) : booking.booking_status === "NO_SHOW" ? (
                            <StatusBadge variant="warning" size="sm">
                              No-show
                            </StatusBadge>
                          ) : (
                            <StatusBadge variant="success" size="sm">
                              Confirmed
                            </StatusBadge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {booking.stay_status === "CHECKED_OUT" ? (
                            <StatusBadge variant="success" size="sm">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Đã C/O
                            </StatusBadge>
                          ) : booking.stay_status === "CHECKED_IN" ? (
                            <StatusBadge variant="info" size="sm">
                              Đang ở
                            </StatusBadge>
                          ) : booking.stay_status === "NO_SHOW" ? (
                            <StatusBadge variant="warning" size="sm">
                              No-show
                            </StatusBadge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Summary */}
          {totalSelected > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm">
                Đã chọn <strong>{totalSelected}</strong> booking
              </span>
              <span className="font-semibold text-primary">{formatCurrency(totalAmount)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleAddBookings}
            disabled={totalSelected === 0 || addMutation.isPending}
          >
            {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Thêm {totalSelected} booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

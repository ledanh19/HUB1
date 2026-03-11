import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Calendar, Loader2, RefreshCw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, subMonths, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// OTA logos
import expediaLogo from "@/assets/ota-logos/expedia.png";
import agodaLogo from "@/assets/ota-logos/agoda.png";
import ctripLogo from "@/assets/ota-logos/ctrip.png";
import bookingLogo from "@/assets/ota-logos/booking.png";
import travelokaLogo from "@/assets/ota-logos/traveloka.png";

const OTA_CONFIG: Record<string, { logo: string; color: string; label: string }> = {
  EXPEDIA: { logo: expediaLogo, color: "#1a365d", label: "Expedia" },
  AGODA: { logo: agodaLogo, color: "#e53935", label: "Agoda" },
  CTRIP: { logo: ctripLogo, color: "#2e7d32", label: "CTrip" },
  "BOOKING.COM": { logo: bookingLogo, color: "#003580", label: "Booking.com" },
  BOOKING: { logo: bookingLogo, color: "#003580", label: "Booking.com" },
  TRAVELOKA: { logo: travelokaLogo, color: "#0194f3", label: "Traveloka" },
  OTHER: { logo: "", color: "#f59e0b", label: "Khác" },
  DIRECT: { logo: "", color: "#10b981", label: "Trực tiếp" },
};

// Helper to detect actual OTA from booking code prefix
const detectOtaFromCode = (otaSource: string, otaBookingCode: string | null): string => {
  let source = (otaSource || "OTHER").toUpperCase();
  if (source === "OTHER" && otaBookingCode) {
    const code = otaBookingCode.toUpperCase();
    if (code.startsWith("BDC-") || code.includes("BOOKING")) {
      source = "BOOKING.COM";
    } else if (code.startsWith("AGO-") || code.includes("AGODA")) {
      source = "AGODA";
    } else if (code.startsWith("EXP-") || code.includes("EXPEDIA")) {
      source = "EXPEDIA";
    } else if (code.startsWith("TVL-") || code.includes("TRAVELOKA")) {
      source = "TRAVELOKA";
    } else if (code.startsWith("CTP-") || code.includes("CTRIP")) {
      source = "CTRIP";
    }
  }
  return source;
};

const formatCurrency = (amount: number) => {
  return "₫" + new Intl.NumberFormat("vi-VN").format(Math.round(amount));
};

type DateFilterType = "booking_date" | "check_in_date" | "check_out_date";

export function BookingSourcesChart() {
  const yesterday = subDays(new Date(), 1);
  const oneMonthAgo = subMonths(yesterday, 1);

  const [dateFilterType, setDateFilterType] = useState<DateFilterType>("booking_date");
  const [fromDate, setFromDate] = useState<Date>(oneMonthAgo);
  const [toDate, setToDate] = useState<Date>(yesterday);
  const [fromCalendarOpen, setFromCalendarOpen] = useState(false);
  const [toCalendarOpen, setToCalendarOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Fetch properties for filter - only from An Gia group
  const { data: properties } = useQuery({
    queryKey: ["booking-sources-properties"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get An Gia properties channex IDs
      const { data: groupData } = await supabase
        .from("channex_groups")
        .select("channex_group_id")
        .eq("title", "An Gia Residences")
        .maybeSingle();

      let propertyIds: string[] = [];
      if (groupData?.channex_group_id) {
        const { data: propertyGroups } = await supabase
          .from("channex_property_groups")
          .select("channex_property_id")
          .eq("channex_group_id", groupData.channex_group_id);

        propertyIds = propertyGroups?.map(p => p.channex_property_id) || [];
      }

      // Use RPC or manual aggregation to get distinct properties
      // Query with large limit to ensure we get all unique properties
      const allProperties: string[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      // Fetch in batches to overcome default limit, but cap at 10 iterations for safety
      while (hasMore && offset < 10000) {
        let query = supabase
          .from("bookings_mirror")
          .select("pms_property_name, channex_property_id")
          .not("pms_property_name", "is", null)
          .range(offset, offset + batchSize - 1);

        if (propertyIds.length > 0) {
          query = query.in("channex_property_id", propertyIds);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          const names = data.map(b => b.pms_property_name).filter(Boolean) as string[];
          allProperties.push(...names);
          offset += batchSize;
          if (data.length < batchSize) hasMore = false;
        }
      }

      const uniqueProperties = [...new Set(allProperties)];
      return uniqueProperties.sort() as string[];
    },
  });

  const { data: sourcesData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["booking-sources-chart", fromDate, toDate, dateFilterType, selectedProperty],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get An Gia properties
      const { data: groupData } = await supabase
        .from("channex_groups")
        .select("channex_group_id")
        .eq("title", "An Gia Residences")
        .maybeSingle();

      let propertyIds: string[] = [];
      if (groupData?.channex_group_id) {
        const { data: propertyGroups } = await supabase
          .from("channex_property_groups")
          .select("channex_property_id")
          .eq("channex_group_id", groupData.channex_group_id);

        propertyIds = propertyGroups?.map(p => p.channex_property_id) || [];
      }

      const dateField = dateFilterType === "booking_date" ? "booking_date" : dateFilterType === "check_in_date" ? "check_in_date" : "check_out_date";

      let query = supabase
        .from("bookings_mirror")
        .select("ota_source, ota_booking_code, total_amount_net, nights, booking_date, check_in_date, booking_status, pms_property_name, channex_property_id")
        .gte(dateField, format(fromDate, "yyyy-MM-dd"))
        .lte(dateField, format(toDate, "yyyy-MM-dd"));

      // Filter by An Gia properties
      if (propertyIds.length > 0) {
        query = query.in("channex_property_id", propertyIds);
      }

      if (selectedProperty !== "all") {
        query = query.eq("pms_property_name", selectedProperty);
      }

      const { data: allBookings, error: allError } = await query;

      if (allError) throw allError;

      // Group by source with extended metrics
      const bySource: Record<string, {
        count: number;
        amount: number;
        roomNights: number;
        cancellations: number;
        totalLeadTime: number;
        leadTimeCount: number;
      }> = {};

      allBookings?.forEach((booking) => {
        const source = detectOtaFromCode(booking.ota_source, booking.ota_booking_code);
        if (!bySource[source]) {
          bySource[source] = {
            count: 0,
            amount: 0,
            roomNights: 0,
            cancellations: 0,
            totalLeadTime: 0,
            leadTimeCount: 0
          };
        }

        const isCancelled = booking.booking_status === "CANCELLED";

        if (isCancelled) {
          bySource[source].cancellations += 1;
        } else {
          bySource[source].count += 1;
          bySource[source].amount += Number(booking.total_amount_net) || 0;
          bySource[source].roomNights += Number(booking.nights) || 0;

          // Calculate lead time (days between booking_date and check_in_date)
          if (booking.booking_date && booking.check_in_date) {
            const bookingDate = new Date(booking.booking_date);
            const checkInDate = new Date(booking.check_in_date);
            const leadTime = differenceInDays(checkInDate, bookingDate);
            if (leadTime >= 0) {
              bySource[source].totalLeadTime += leadTime;
              bySource[source].leadTimeCount += 1;
            }
          }
        }
      });

      // Convert to array and sort by amount
      const result = Object.entries(bySource)
        .map(([source, data]) => {
          const avgLengthOfStay = data.count > 0 ? data.roomNights / data.count : 0;
          const avgLeadTime = data.leadTimeCount > 0 ? data.totalLeadTime / data.leadTimeCount : 0;
          const avgDailyRate = data.roomNights > 0 ? data.amount / data.roomNights : 0;

          return {
            source,
            count: data.count,
            amount: data.amount,
            roomNights: data.roomNights,
            cancellations: data.cancellations,
            avgLengthOfStay,
            avgLeadTime,
            avgDailyRate,
            config: OTA_CONFIG[source] || OTA_CONFIG.OTHER,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const total = result.reduce((sum, item) => sum + item.count, 0);
      const totalAmount = result.reduce((sum, item) => sum + item.amount, 0);
      const totalRoomNights = result.reduce((sum, item) => sum + item.roomNights, 0);
      const totalCancellations = result.reduce((sum, item) => sum + item.cancellations, 0);

      return { sources: result, total, totalAmount, totalRoomNights, totalCancellations };
    },
  });

  const chartData = useMemo(() => {
    return sourcesData?.sources.map((item) => ({
      name: item.config.label,
      value: item.count,
      color: item.config.color,
    })) || [];
  }, [sourcesData]);

  // Determine which source to show in center (hovered > active > top)
  const displayIndex = hoveredIndex ?? activeIndex;
  const displaySource = displayIndex !== null ? sourcesData?.sources[displayIndex] : sourcesData?.sources[0];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-semibold">Booking Sources</h3>

        <div className="flex flex-wrap items-center gap-2">
          {/* Property Filter */}
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-[200px] h-9">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Tất cả chỗ nghỉ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chỗ nghỉ</SelectItem>
              {properties?.map((property) => (
                <SelectItem key={property} value={property}>
                  {property}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Type Toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setDateFilterType("booking_date")}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                dateFilterType === "booking_date"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Booked-on date
            </button>
            <button
              onClick={() => setDateFilterType("check_in_date")}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                dateFilterType === "check_in_date"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Ngày nhận phòng
            </button>
            <button
              onClick={() => setDateFilterType("check_out_date")}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                dateFilterType === "check_out_date"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Ngày trả phòng
            </button>
          </div>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 gap-2 text-primary"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Range Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* From Date */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Từ ngày</span>
          <Popover open={fromCalendarOpen} onOpenChange={setFromCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                {format(fromDate, "dd/MM/yyyy")}
                <Calendar className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={fromDate}
                onSelect={(date) => {
                  if (date) {
                    setFromDate(date);
                    setFromCalendarOpen(false);
                  }
                }}
                locale={vi}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* To Date */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Đến ngày</span>
          <Popover open={toCalendarOpen} onOpenChange={setToCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                {format(toDate, "dd/MM/yyyy")}
                <Calendar className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={toDate}
                onSelect={(date) => {
                  if (date) {
                    setToDate(date);
                    setToCalendarOpen(false);
                  }
                }}
                locale={vi}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm text-primary">Revenue (VND)</div>
              <div className="text-lg sm:text-2xl font-bold truncate">{formatCurrency(sourcesData?.totalAmount || 0)}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm text-primary">Reservations</div>
              <div className="text-lg sm:text-2xl font-bold">{sourcesData?.total || 0}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm text-primary">Room Nights</div>
              <div className="text-lg sm:text-2xl font-bold">{sourcesData?.totalRoomNights || 0}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm text-primary">Cancellations</div>
              <div className="text-lg sm:text-2xl font-bold">{sourcesData?.totalCancellations || 0}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
            {/* Donut Chart */}
            <div className="relative w-[160px] h-[160px] flex-shrink-0 mx-auto sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    {chartData.map((entry, index) => {
                      const isHovered = hoveredIndex === index;
                      const isActive = activeIndex === index;
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          style={{
                            transform: isHovered || isActive ? 'scale(1.08)' : 'scale(1)',
                            transformOrigin: 'center',
                            transition: 'transform 0.2s ease-out, filter 0.2s ease-out',
                            filter: isHovered ? 'brightness(1.15) drop-shadow(0 4px 8px rgba(0,0,0,0.3))' : isActive ? 'brightness(1.1)' : 'brightness(1)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onClick={() => setActiveIndex(activeIndex === index ? null : index)}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground">{displaySource?.config.label || ""}</span>
                <span className="text-2xl font-bold">{displaySource?.count || 0}</span>
              </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-xs sm:text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Channel</th>
                    <th className="pb-2 font-medium text-right">
                      <span className="hidden sm:inline">Revenue (VND)</span>
                      <span className="sm:hidden">Rev</span>
                    </th>
                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Reservations</th>
                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Room Nights</th>
                    <th className="pb-2 font-medium text-right hidden md:table-cell">Avg Length Of Stay</th>
                    <th className="pb-2 font-medium text-right hidden md:table-cell">Avg Lead Time</th>
                    <th className="pb-2 font-medium text-right hidden lg:table-cell">Avg Daily Rate (VND)</th>
                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Cancellations</th>
                  </tr>
                </thead>
                <tbody>
                  {sourcesData?.sources.map((item, index) => {
                    const isHovered = hoveredIndex === index;
                    const isActive = activeIndex === index;
                    return (
                      <tr
                        key={item.source}
                        className={cn(
                          "border-b border-border/50 last:border-0 transition-all duration-200 cursor-pointer",
                          (isHovered || isActive) && "bg-primary/10"
                        )}
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        onClick={() => setActiveIndex(activeIndex === index ? null : index)}
                      >
                        <td className="py-2 sm:py-3">
                          <div className="flex items-center gap-2">
                            {item.config.logo ? (
                              <img src={item.config.logo} alt={item.config.label} className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />
                            ) : (
                              <div
                                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-white text-micro sm:text-xs font-bold"
                                style={{ backgroundColor: item.config.color }}
                              >
                                {item.config.label.charAt(0)}
                              </div>
                            )}
                            <span className={cn("truncate max-w-[80px] sm:max-w-none", (isHovered || isActive) && "font-semibold")}>{item.config.label}</span>
                          </div>
                        </td>
                        <td className="py-2 sm:py-3 text-right">{formatCurrency(item.amount)}</td>
                        <td className="py-2 sm:py-3 text-right hidden sm:table-cell">{item.count}</td>
                        <td className="py-2 sm:py-3 text-right hidden sm:table-cell">{item.roomNights}</td>
                        <td className="py-2 sm:py-3 text-right hidden md:table-cell">{item.avgLengthOfStay.toFixed(2)}</td>
                        <td className="py-2 sm:py-3 text-right hidden md:table-cell">{item.avgLeadTime.toFixed(2)}</td>
                        <td className="py-2 sm:py-3 text-right hidden lg:table-cell">{formatCurrency(item.avgDailyRate)}</td>
                        <td className="py-2 sm:py-3 text-right hidden sm:table-cell">{item.cancellations}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <Link to="/bookings" className="text-sm text-primary hover:underline">
              Details →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

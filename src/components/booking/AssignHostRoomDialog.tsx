import { useState, useEffect, useMemo } from "react";
import { format, parseISO, differenceInDays, eachDayOfInterval, isSameDay } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CalendarIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { syncHostPayables } from "@/hooks/useHostPayableSync";
import { StatusBadge } from "@/components/ui/status-badge";

interface AssignHostRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  onSuccess?: () => void;
}

interface Partner {
  id: string;
  partner_name: string;
}

interface HostProperty {
  id: string;
  host_property_name: string;
}

interface RoomType {
  id: string;
  room_type_name: string;
}

interface ExistingSegment {
  date_from: string;
  date_to: string;
  nights: number;
  host_property_name: string | null;
  room_code: string | null;
}

export function AssignHostRoomDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  checkInDate,
  checkOutDate,
  nights: bookingNights,
  onSuccess,
}: AssignHostRoomDialogProps) {
  const queryClient = useQueryClient();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [properties, setProperties] = useState<HostProperty[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");
  const [nightlyRate, setNightlyRate] = useState<number>(0);

  // Date range for segment
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch existing segments for coverage calculation
  const { data: existingSegments = [] } = useQuery({
    queryKey: ['host-supply-segments-dialog', unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!unifiedBookingId) return [];
      const { data, error } = await supabase
        .from('host_supply_segments')
        .select('date_from, date_to, nights, host_property_name, room_code')
        .eq('unified_booking_id', unifiedBookingId);
      if (error) throw error;
      return (data || []) as ExistingSegment[];
    },
    enabled: open && !!unifiedBookingId,
  });

  // Calculate coverage status
  const coverageInfo = useMemo(() => {
    const bookingStart = parseISO(checkInDate);
    const bookingEnd = parseISO(checkOutDate);

    // All nights in booking (check-in to check-out - 1 day)
    const allDates = eachDayOfInterval({ start: bookingStart, end: new Date(bookingEnd.getTime() - 86400000) });

    // Assigned dates from existing segments
    const assignedDates = new Set<string>();
    existingSegments.forEach(seg => {
      const segStart = parseISO(seg.date_from);
      const segEnd = parseISO(seg.date_to);
      const segDates = eachDayOfInterval({ start: segStart, end: new Date(segEnd.getTime() - 86400000) });
      segDates.forEach(d => assignedDates.add(format(d, 'yyyy-MM-dd')));
    });

    // Missing dates
    const missingDates = allDates.filter(d => !assignedDates.has(format(d, 'yyyy-MM-dd')));

    const totalNights = bookingNights;
    const assignedNights = existingSegments.reduce((sum, s) => sum + s.nights, 0);
    const missingNights = Math.max(0, totalNights - assignedNights);

    return {
      totalNights,
      assignedNights,
      missingNights,
      missingDates,
      isComplete: missingNights === 0 && assignedNights > 0,
    };
  }, [existingSegments, checkInDate, checkOutDate, bookingNights]);

  // Calculate nights based on selected dates
  const segmentNights = useMemo(() => {
    if (dateFrom && dateTo) {
      return differenceInDays(dateTo, dateFrom);
    }
    return 0;
  }, [dateFrom, dateTo]);

  const totalAmount = nightlyRate * segmentNights;

  // Load HOST partners
  useEffect(() => {
    if (open) {
      fetchPartners();
      // Reset form
      setSelectedPartnerId("");
      setSelectedPropertyId("");
      setSelectedRoomType("");
      setRoomCode("");
      setNightlyRate(0);
      // Set default dates: if there are missing dates, use first missing range; otherwise use booking dates
      if (coverageInfo.missingDates.length > 0) {
        setDateFrom(coverageInfo.missingDates[0]);
        // Find consecutive end date
        let endIdx = 0;
        for (let i = 1; i < coverageInfo.missingDates.length; i++) {
          const prevDate = coverageInfo.missingDates[i - 1];
          const currDate = coverageInfo.missingDates[i];
          if (differenceInDays(currDate, prevDate) === 1) {
            endIdx = i;
          } else {
            break;
          }
        }
        // dateTo is the day after the last night
        const lastNight = coverageInfo.missingDates[endIdx];
        setDateTo(new Date(lastNight.getTime() + 86400000));
      } else {
        setDateFrom(parseISO(checkInDate));
        setDateTo(parseISO(checkOutDate));
      }
    }
  }, [open, checkInDate, checkOutDate, coverageInfo.missingDates.length]);

  // Load properties when partner changes
  useEffect(() => {
    if (selectedPartnerId) {
      fetchProperties(selectedPartnerId);
      setSelectedPropertyId("");
      setSelectedRoomType("");
      setRoomTypes([]);
    } else {
      setProperties([]);
      setSelectedPropertyId("");
    }
  }, [selectedPartnerId]);

  // Load room types when property changes
  useEffect(() => {
    if (selectedPropertyId) {
      fetchRoomTypes(selectedPropertyId);
      setSelectedRoomType("");
    } else {
      setRoomTypes([]);
    }
  }, [selectedPropertyId]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["HOST_LANDLORD", "HOST_OPERATOR"])
        .eq("status", "active")
        .order("partner_name");

      if (error) throw error;
      setPartners(data || []);
    } catch (err: any) {
      toast.error("Lỗi tải danh sách đối tác: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async (partnerId: string) => {
    try {
      const { data, error } = await supabase
        .from("host_properties")
        .select("id, host_property_name")
        .eq("partner_id", partnerId)
        .eq("status", "active")
        .order("host_property_name");

      if (error) throw error;
      setProperties(data || []);
    } catch (err: any) {
      toast.error("Lỗi tải chỗ nghỉ: " + err.message);
    }
  };

  const fetchRoomTypes = async (propertyId: string) => {
    try {
      const { data, error } = await supabase
        .from("host_room_types")
        .select("id, room_type_name")
        .eq("host_property_id", propertyId)
        .eq("status", "active")
        .order("room_type_name");

      if (error) throw error;
      setRoomTypes(data || []);
    } catch (err: any) {
      toast.error("Lỗi tải loại phòng: " + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPartnerId || !selectedPropertyId || !selectedRoomType || !roomCode) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }

    if (nightlyRate <= 0) {
      toast.error("Đơn giá phải lớn hơn 0");
      return;
    }

    if (!dateFrom || !dateTo || segmentNights <= 0) {
      toast.error("Vui lòng chọn ngày hợp lệ");
      return;
    }

    setSaving(true);
    try {
      const selectedPartner = partners.find((p) => p.id === selectedPartnerId);
      const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

      // Create a segment for the selected date range
      const { data: segmentData, error: segmentError } = await supabase
        .from("host_supply_segments")
        .insert({
          unified_booking_id: unifiedBookingId,
          partner_id: selectedPartnerId,
          host_property_name: selectedProperty?.host_property_name,
          host_room_type: selectedRoomType,
          room_code: roomCode,
          date_from: format(dateFrom, 'yyyy-MM-dd'),
          date_to: format(dateTo, 'yyyy-MM-dd'),
          nights: segmentNights,
          nightly_rate: nightlyRate,
          total_amount: totalAmount,
        })
        .select()
        .single();

      if (segmentError) {
        console.error('[AssignHostRoomDialog] Segment insert error:', segmentError);
        throw segmentError;
      }
      console.log('[AssignHostRoomDialog] Segment created:', segmentData);

      // Update stays table with room info
      const { error: stayError } = await supabase
        .from("stays")
        .update({
          host_property_name: selectedProperty?.host_property_name,
          host_room_type: selectedRoomType,
          host_cost: totalAmount,
          assigned_at: new Date().toISOString(),
        })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      // Sync host payables (background)
      syncHostPayables(unifiedBookingId).catch(console.error);

      // Fire-and-forget audit log
      createAuditLog({
        action: AuditActions.ROOM_ASSIGNED,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          partner_id: selectedPartnerId,
          partner_name: selectedPartner?.partner_name,
          host_property_name: selectedProperty?.host_property_name,
          host_room_type: selectedRoomType,
          room_code: roomCode,
          date_from: format(dateFrom, 'yyyy-MM-dd'),
          date_to: format(dateTo, 'yyyy-MM-dd'),
          nightly_rate: nightlyRate,
          total_amount: totalAmount,
          nights: segmentNights,
        },
      }).catch(console.error);

      // OPTIMISTIC UPDATE: Update stays list immediately
      const optimisticUpdateLists = (oldData: unknown) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.map((item: Record<string, unknown>) =>
          item.unified_booking_id === unifiedBookingId
            ? {
              ...item,
              host_property_name: selectedProperty?.host_property_name,
              host_room_type: selectedRoomType,
              host_cost: totalAmount,
              // Add segment info to fix "no room" status
              segment: {
                segment_id: 'optimistic-' + Date.now(),
                partner_id: selectedPartnerId,
                host_property_name: selectedProperty?.host_property_name,
                host_room_type: selectedRoomType,
                room_code: roomCode,
                date_from: format(dateFrom, 'yyyy-MM-dd'),
                date_to: format(dateTo, 'yyyy-MM-dd'),
                nights: segmentNights,
                partners: { partner_name: selectedPartner?.partner_name || '' },
                actual_check_in_at: null,
                actual_check_out_at: null,
              },
              _isOptimistic: true
            }
            : item
        );
      };

      queryClient.setQueryData(["stays"], optimisticUpdateLists);
      queryClient.setQueryData(["stays_with_bookings"], optimisticUpdateLists);

      toast.success("Phân bổ phòng thành công");

      // Close dialog immediately
      onOpenChange(false);
      onSuccess?.();

      // IMPORTANT: await invalidate to ensure refetch completes before UI updates
      await queryClient.invalidateQueries({ queryKey: ["stays_operations"], refetchType: "all" });

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["host_supply_segments", unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments-dialog", unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      }, 500);

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 1500);

    } catch (err: any) {
      toast.error("Lỗi phân bổ phòng: " + err.message);
      // Rollback: refetch
      queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const bookingStart = parseISO(checkInDate);
  const bookingEnd = parseISO(checkOutDate);

  // Check if selected date overlaps with already assigned dates
  const hasOverlap = useMemo(() => {
    if (!dateFrom || !dateTo) return false;
    const selectedDates = eachDayOfInterval({ start: dateFrom, end: new Date(dateTo.getTime() - 86400000) });
    const assignedSet = new Set<string>();
    existingSegments.forEach(seg => {
      const segStart = parseISO(seg.date_from);
      const segEnd = parseISO(seg.date_to);
      const segDates = eachDayOfInterval({ start: segStart, end: new Date(segEnd.getTime() - 86400000) });
      segDates.forEach(d => assignedSet.add(format(d, 'yyyy-MM-dd')));
    });
    return selectedDates.some(d => assignedSet.has(format(d, 'yyyy-MM-dd')));
  }, [dateFrom, dateTo, existingSegments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Phân bổ phòng</DialogTitle>
          <DialogDescription>
            Phân bổ phòng Host cho booking
          </DialogDescription>
        </DialogHeader>

        {/* Coverage Status Banner */}
        <div className={cn(
          "p-3 rounded-lg border flex items-center gap-3",
          coverageInfo.isComplete
            ? "bg-success/100/10 border-success/30"
            : "bg-warning/10 border-warning/30"
        )}>
          {coverageInfo.isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          )}
          <div className="flex-1">
            <div className="font-medium text-sm">
              {coverageInfo.isComplete
                ? "Đã gán đủ phòng"
                : `Thiếu ${coverageInfo.missingNights} đêm`
              }
            </div>
            <div className="text-xs text-muted-foreground">
              Đã gán: {coverageInfo.assignedNights}/{coverageInfo.totalNights} đêm
              {existingSegments.length > 0 && (
                <span className="ml-2">({existingSegments.length} segment)</span>
              )}
            </div>
          </div>
          {!coverageInfo.isComplete && coverageInfo.missingDates.length > 0 && (
            <StatusBadge variant="warning" size="sm">
              {format(coverageInfo.missingDates[0], 'dd/MM')}
              {coverageInfo.missingDates.length > 1 && ` → ${format(coverageInfo.missingDates[coverageInfo.missingDates.length - 1], 'dd/MM')}`}
            </StatusBadge>
          )}
        </div>

        {/* Existing Segments */}
        {existingSegments.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Segments đã gán:</Label>
            <div className="space-y-1">
              {existingSegments.map((seg, idx) => (
                <div key={idx} className="text-xs bg-muted/50 rounded px-2 py-1 flex justify-between">
                  <span>{seg.host_property_name} • {seg.room_code}</span>
                  <span className="text-muted-foreground">
                    {format(parseISO(seg.date_from), 'dd/MM')} → {format(parseISO(seg.date_to), 'dd/MM')} ({seg.nights} đêm)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Partner Selection */}
          <div className="space-y-2">
            <Label>Host *</Label>
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Đang tải..." : "Chọn Host"} />
              </SelectTrigger>
              <SelectContent>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.partner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Property Selection */}
          {selectedPartnerId && (
            <div className="space-y-2">
              <Label>Chỗ nghỉ *</Label>
              <Select
                value={selectedPropertyId}
                onValueChange={setSelectedPropertyId}
                disabled={properties.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      properties.length === 0
                        ? "Không có chỗ nghỉ"
                        : "Chọn chỗ nghỉ"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.host_property_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Room Type Selection */}
          {selectedPartnerId && (
            <div className="space-y-2">
              <Label>Loại phòng *</Label>
              <Select
                value={selectedRoomType}
                onValueChange={setSelectedRoomType}
                disabled={!selectedPropertyId || roomTypes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedPropertyId
                        ? "Chọn chỗ nghỉ trước"
                        : roomTypes.length === 0
                          ? "Không có loại phòng"
                          : "Chọn loại phòng"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.room_type_name}>
                      {rt.room_type_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Room Code */}
          {selectedPartnerId && (
            <div className="space-y-2">
              <Label>Mã phòng *</Label>
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="VD: A101, P201..."
              />
            </div>
          )}

          {/* Date Range Selection */}
          {selectedPartnerId && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Từ ngày *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      disabled={(date) =>
                        date < bookingStart || date >= bookingEnd
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Đến ngày *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      disabled={(date) =>
                        date <= bookingStart || date > bookingEnd || (dateFrom && date <= dateFrom)
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Nightly Rate */}
          {selectedPartnerId && (
            <div className="space-y-2">
              <Label>Đơn giá / đêm (VND) *</Label>
              <CurrencyInput
                value={String(nightlyRate)}
                onChange={(v) => setNightlyRate(parseFloat(v) || 0)}
                placeholder="500000"
              />
            </div>
          )}

          {/* Overlap Warning */}
          {hasOverlap && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm text-destructive">
                Khoảng ngày đã chọn trùng với segment đã gán. Vui lòng chọn ngày khác.
              </span>
            </div>
          )}

          {/* Summary */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ngày:</span>
              <span>
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : checkInDate} → {dateTo ? format(dateTo, "dd/MM/yyyy") : checkOutDate}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số đêm:</span>
              <span>{segmentNights} đêm</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Tổng chi phí Host:</span>
              <span className="text-primary">{formatCurrency(totalAmount)}</span>
            </div>
            {/* After adding this segment */}
            {segmentNights > 0 && (
              <div className="flex justify-between pt-2 border-t border-border/50">
                <span className="text-muted-foreground">Sau khi thêm:</span>
                <span className={cn(
                  "font-medium",
                  coverageInfo.assignedNights + segmentNights >= coverageInfo.totalNights
                    ? "text-success"
                    : "text-warning"
                )}>
                  {coverageInfo.assignedNights + segmentNights}/{coverageInfo.totalNights} đêm
                  {coverageInfo.assignedNights + segmentNights >= coverageInfo.totalNights && " ✓"}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={saving || hasOverlap || !selectedPartnerId || !selectedPropertyId || !selectedRoomType || !roomCode || nightlyRate <= 0 || segmentNights <= 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận phân bổ phòng
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

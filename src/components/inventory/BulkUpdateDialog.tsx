import { useState, useMemo } from "react";
import { format, addDays, eachDayOfInterval, getDay, isBefore, startOfDay, differenceInDays } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Plus, Trash2, AlertTriangle, ShieldAlert, Info, CheckCircle, Clock, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLegacyBulkUpdateInventory, RatePlan, Channel, RoomType } from "@/hooks/useInventory";
import { useInventoryPermissions, useInventoryFreeze, BULK_UPDATE_THRESHOLDS } from "@/hooks/useInventoryPermissions";
import { calculateRate, resolveBaseRate, mapLegacyChangeType, type RateChangeType } from "@/lib/rateCalculator";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  channels: Channel[];
}

interface DateRange {
  id: string;
  start?: Date;
  end?: Date;
}

interface BulkPreview {
  affectedCells: number;
  affectedDates: number;
  affectedDatesList: Date[];
  dateRange: { start: Date; end: Date };
  roomTypes: string[];
  ratePlans: string[];
  channels: string[];
  roomTypeCount: number;
  ratePlanCount: number;
  channelCount: number;
  changes: {
    field: string;
    value: string | number | boolean;
    isRisky: boolean;
    riskLevel?: 'warning' | 'danger';
  }[];
  requiresSecondConfirm: boolean;
  riskReasons: string[];
  warnings: {
    type: 'info' | 'warning' | 'danger';
    message: string;
  }[];
  isLongRunning: boolean;
  totalDays: number;
}

// Intent types for audit/tracking
const INTENT_OPTIONS = [
  { value: 'holiday', label: 'Lễ / Tết', icon: '🎉' },
  { value: 'peak_season', label: 'Mùa cao điểm', icon: '📈' },
  { value: 'promotion', label: 'Khuyến mãi', icon: '🏷️' },
  { value: 'manual_fix', label: 'Sửa thủ công', icon: '🔧' },
  { value: 'event', label: 'Sự kiện đặc biệt', icon: '🎪' },
  { value: 'other', label: 'Khác', icon: '📝' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'Su' },
];

// Thresholds for guardrails
const GUARDRAIL_THRESHOLDS = {
  DAYS_WARNING: 30,
  DAYS_MANAGER_ONLY: 90,
  STOP_SELL_CONSECUTIVE_CONFIRM: 7,
  RATE_DECREASE_PERCENT_WARNING: 15,
};

export function BulkUpdateDialog({
  open,
  onOpenChange,
  propertyId,
  roomTypes,
  ratePlans,
  channels,
}: BulkUpdateDialogProps) {
  const bulkUpdate = useLegacyBulkUpdateInventory();
  const permissions = useInventoryPermissions();
  const { isFrozen } = useInventoryFreeze(propertyId);

  // UI State
  const [step, setStep] = useState<'form' | 'preview' | 'confirm'>('form');
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [stopSellConfirmCount, setStopSellConfirmCount] = useState(0);

  // Date ranges
  const [dateRanges, setDateRanges] = useState<DateRange[]>([
    { id: '1', start: undefined, end: undefined },
  ]);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [pastDatesRemoved, setPastDatesRemoved] = useState<Date[]>([]);

  // Keep only one datepicker popover open at a time
  const [openDatePicker, setOpenDatePicker] = useState<
    { rangeId: string; field: 'start' | 'end' } | null
  >(null);

  // If a range is already complete, the next click should start a fresh selection
  const [resetNextClickRangeId, setResetNextClickRangeId] = useState<string | null>(null);

  // Intent tagging
  const [selectedIntent, setSelectedIntent] = useState<string>('');
  const [intentNote, setIntentNote] = useState('');

  // Restrictions to update
  const [updateRate, setUpdateRate] = useState(false);
  const [rateValue, setRateValue] = useState('');
  const [rateChangeType, setRateChangeType] = useState<'set' | 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent'>('set');
  const [updateStopSell, setUpdateStopSell] = useState(false);
  const [stopSellValue, setStopSellValue] = useState(false);
  const [updateCTA, setUpdateCTA] = useState(false);
  const [ctaValue, setCtaValue] = useState(false);
  const [updateCTD, setUpdateCTD] = useState(false);
  const [ctdValue, setCtdValue] = useState(false);
  const [updateMinStayArrival, setUpdateMinStayArrival] = useState(false);
  const [minStayArrivalValue, setMinStayArrivalValue] = useState('');
  const [updateMinStayThrough, setUpdateMinStayThrough] = useState(false);
  const [minStayThroughValue, setMinStayThroughValue] = useState('');
  const [updateMaxStay, setUpdateMaxStay] = useState(false);
  const [maxStayValue, setMaxStayValue] = useState('');

  // Selected rooms/rates
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedRatePlans, setSelectedRatePlans] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  // Filter rate plans by selected room types
  const filteredRatePlans = selectedRoomTypes.length > 0
    ? ratePlans.filter(rp => {
      const roomType = roomTypes.find(rt => rt.provider_room_type_id === rp.provider_room_type_id);
      return roomType && selectedRoomTypes.includes(roomType.id);
    })
    : ratePlans;

  // Calculate affected dates in real-time for visual preview
  const affectedDatesPreview = useMemo(() => {
    const today = startOfDay(new Date());
    const allDates: Date[] = [];
    const pastDates: Date[] = [];

    dateRanges.forEach((range) => {
      if (!range.start || !range.end) return;
      const days = eachDayOfInterval({ start: range.start, end: range.end });
      days.forEach((day) => {
        if (selectedDays.includes(getDay(day))) {
          if (isBefore(day, today)) {
            pastDates.push(day);
          } else {
            allDates.push(day);
          }
        }
      });
    });

    return { validDates: allDates, pastDates };
  }, [dateRanges, selectedDays]);

  const addDateRange = () => {
    setDateRanges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), start: undefined, end: undefined },
    ]);
  };

  const removeDateRange = (id: string) => {
    setDateRanges(prev => prev.filter(r => r.id !== id));
  };

  const updateDateRange = (id: string, field: 'start' | 'end', value?: Date) => {
    setDateRanges((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Calculate preview with full guardrails
  const calculatePreview = (): BulkPreview => {
    const today = startOfDay(new Date());
    const changes: BulkPreview['changes'] = [];
    const riskReasons: string[] = [];
    const warnings: BulkPreview['warnings'] = [];

    // Build changes list
    if (updateRate && rateValue) {
      const rateNum = parseFloat(rateValue);
      let isRisky = false;
      let riskLevel: 'warning' | 'danger' | undefined;

      if ((rateChangeType === 'decrease_percent' || rateChangeType === 'decrease_amount') && rateNum >= GUARDRAIL_THRESHOLDS.RATE_DECREASE_PERCENT_WARNING) {
        isRisky = true;
        riskLevel = 'danger';
        riskReasons.push(`Giảm giá ${rateNum}% (> ${GUARDRAIL_THRESHOLDS.RATE_DECREASE_PERCENT_WARNING}%)`);
        warnings.push({ type: 'danger', message: `Giảm giá ${rateNum}% có thể ảnh hưởng lớn đến doanh thu` });
      }

      const displayValue = rateChangeType === 'set'
        ? `${rateNum.toLocaleString()} VND`
        : (rateChangeType === 'increase_amount' || rateChangeType === 'increase_percent')
          ? `+${rateNum}${rateChangeType.includes('percent') ? '%' : ' VND'}`
          : `-${rateNum}${rateChangeType.includes('percent') ? '%' : ' VND'}`;

      changes.push({ field: 'Rate', value: displayValue, isRisky, riskLevel });
    }

    if (updateStopSell) {
      changes.push({
        field: 'Stop Sell',
        value: stopSellValue,
        isRisky: stopSellValue,
        riskLevel: stopSellValue ? 'danger' : undefined
      });
      if (stopSellValue) {
        riskReasons.push('Stop Sell sẽ được BẬT');
      }
    }

    if (updateCTA) {
      changes.push({
        field: 'Closed To Arrival (CTA)',
        value: ctaValue,
        isRisky: ctaValue,
        riskLevel: ctaValue ? 'warning' : undefined
      });
    }

    if (updateCTD) {
      changes.push({
        field: 'Closed To Departure (CTD)',
        value: ctdValue,
        isRisky: ctdValue,
        riskLevel: ctdValue ? 'warning' : undefined
      });
    }

    if (updateMinStayArrival && minStayArrivalValue) {
      changes.push({ field: 'Min Stay Arrival', value: parseInt(minStayArrivalValue), isRisky: false });
    }
    if (updateMinStayThrough && minStayThroughValue) {
      changes.push({ field: 'Min Stay Through', value: parseInt(minStayThroughValue), isRisky: false });
    }
    if (updateMaxStay && maxStayValue) {
      changes.push({ field: 'Max Stay', value: parseInt(maxStayValue), isRisky: false });
    }

    // Count affected dates (exclude past dates)
    const allDates: Date[] = [];
    const validRanges = dateRanges.filter((r): r is { id: string; start: Date; end: Date } =>
      Boolean(r.start && r.end)
    );

    validRanges.forEach((range) => {
      const days = eachDayOfInterval({ start: range.start, end: range.end });
      days.forEach((day) => {
        if (selectedDays.includes(getDay(day)) && !isBefore(day, today)) {
          allDates.push(day);
        }
      });
    });

    const totalDates = allDates.length;

    // Calculate total days span (based on selected ranges; fallback to today)
    const minDate = validRanges.length
      ? validRanges.reduce((min, r) => (r.start < min ? r.start : min), validRanges[0].start)
      : today;
    const maxDate = validRanges.length
      ? validRanges.reduce((max, r) => (r.end > max ? r.end : max), validRanges[0].end)
      : today;
    const totalDaysSpan = differenceInDays(maxDate, minDate) + 1;

    // Check long-running
    const isLongRunning = totalDaysSpan > GUARDRAIL_THRESHOLDS.DAYS_WARNING;

    if (isLongRunning) {
      warnings.push({
        type: 'warning',
        message: `Range kéo dài ${totalDaysSpan} ngày. Nhớ review và cleanup sau khi hết hạn.`
      });
    }

    // Check 90 days threshold
    if (totalDaysSpan > GUARDRAIL_THRESHOLDS.DAYS_MANAGER_ONLY) {
      warnings.push({
        type: 'danger',
        message: `Range > ${GUARDRAIL_THRESHOLDS.DAYS_MANAGER_ONLY} ngày. Cần quyền Manager.`
      });
      riskReasons.push(`Range kéo dài ${totalDaysSpan} ngày`);
    }

    // Check stop sell consecutive days
    if (updateStopSell && stopSellValue && totalDates > GUARDRAIL_THRESHOLDS.STOP_SELL_CONSECUTIVE_CONFIRM) {
      riskReasons.push(`Stop Sell ${totalDates} ngày liên tiếp (> ${GUARDRAIL_THRESHOLDS.STOP_SELL_CONSECUTIVE_CONFIRM})`);
      warnings.push({
        type: 'danger',
        message: `Stop Sell nhiều ngày có thể làm mất booking. Yêu cầu xác nhận 2 lần.`
      });
    }

    const selectedRoomCount = selectedRoomTypes.length || roomTypes.length || 1;
    const selectedRatePlanCount = selectedRatePlans.length || filteredRatePlans.length || 1;
    const selectedChannelCount = selectedChannels.length || channels.length || 1;

    const affectedCells = totalDates * selectedRoomCount * selectedRatePlanCount * selectedChannelCount;

    // Check cells threshold
    if (affectedCells > BULK_UPDATE_THRESHOLDS.CELLS_REQUIRE_CONFIRM) {
      riskReasons.push(`Ảnh hưởng ${affectedCells.toLocaleString()} cells`);
    }

    // Get selected names
    const selectedRoomNames = selectedRoomTypes.length > 0
      ? roomTypes.filter(rt => selectedRoomTypes.includes(rt.id)).map(rt => rt.room_type_name)
      : ['Tất cả'];
    const selectedRatePlanNames = selectedRatePlans.length > 0
      ? ratePlans.filter(rp => selectedRatePlans.includes(rp.id)).map(rp => rp.rate_plan_name)
      : ['Tất cả'];
    const selectedChannelNames = selectedChannels.length > 0
      ? channels.filter(ch => selectedChannels.includes(ch.id)).map(ch => ch.name)
      : ['Tất cả'];

    return {
      affectedCells,
      affectedDates: totalDates,
      affectedDatesList: allDates,
      dateRange: { start: minDate, end: maxDate },
      roomTypes: selectedRoomNames,
      ratePlans: selectedRatePlanNames,
      channels: selectedChannelNames,
      roomTypeCount: selectedRoomCount,
      ratePlanCount: selectedRatePlanCount,
      channelCount: selectedChannelCount,
      changes,
      requiresSecondConfirm: riskReasons.length > 0,
      riskReasons,
      warnings,
      isLongRunning,
      totalDays: totalDaysSpan,
    };
  };

  const handlePreview = () => {
    // Check and warn about past dates
    if (affectedDatesPreview.pastDates.length > 0) {
      setPastDatesRemoved(affectedDatesPreview.pastDates);
      toast.warning(`${affectedDatesPreview.pastDates.length} ngày trong quá khứ đã được loại bỏ`, {
        description: 'Chỉ các ngày từ hôm nay trở đi mới được áp dụng.',
      });
    }

    const previewData = calculatePreview();
    setPreview(previewData);
    setStep('preview');
  };

  const handleConfirmFirst = () => {
    if (preview?.requiresSecondConfirm) {
      // Check if Stop Sell > 7 days needs double confirm
      if (updateStopSell && stopSellValue && preview.affectedDates > GUARDRAIL_THRESHOLDS.STOP_SELL_CONSECUTIVE_CONFIRM) {
        if (stopSellConfirmCount < 1) {
          setStopSellConfirmCount(1);
          toast.warning('Stop Sell nhiều ngày liên tiếp. Xác nhận lần nữa để tiếp tục.');
          return;
        }
      }
      setStep('confirm');
    } else {
      handleSave();
    }
  };

  const handleSave = async () => {
    if (!propertyId) return;

    // §8.8 Hard limit: 20,000 cells max
    if (preview && preview.affectedCells > 20_000) {
      toast.error(`Vượt quá giới hạn: ${preview.affectedCells.toLocaleString()} cells (tối đa 20.000)`);
      return;
    }

    const updates: Record<string, unknown> = {};
    const needsRateCalc = updateRate && rateValue && rateChangeType !== 'set';

    if (updateRate && rateValue) {
      if (rateChangeType === 'set') {
        updates.rate = parseFloat(rateValue);
      }
      // For non-exact types, we compute per-cell rates below
    }
    if (updateStopSell) updates.stop_sell = stopSellValue;
    if (updateCTA) updates.closed_to_arrival = ctaValue;
    if (updateCTD) updates.closed_to_departure = ctdValue;
    if (updateMinStayArrival && minStayArrivalValue) updates.min_stay_arrival = parseInt(minStayArrivalValue);
    if (updateMinStayThrough && minStayThroughValue) updates.min_stay_through = parseInt(minStayThroughValue);
    if (updateMaxStay && maxStayValue) updates.max_stay = parseInt(maxStayValue);

    // Add intent metadata
    if (selectedIntent) {
      updates.intent = selectedIntent;
      updates.intent_note = intentNote;
    }

    if (Object.keys(updates).length === 0 && !needsRateCalc) return;

    try {
      // SOT §6.3: For percent / amount rate changes, resolve base rates and compute per-cell
      if (needsRateCalc) {
        const changeType = mapLegacyChangeType(rateChangeType);
        const value = parseFloat(rateValue);
        const validRanges = dateRanges.filter(
          (r): r is { id: string; start: Date; end: Date } => Boolean(r.start && r.end)
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const allDates: string[] = [];
        for (const range of validRanges) {
          const { eachDayOfInterval } = await import('date-fns');
          const days = eachDayOfInterval({ start: range.start, end: range.end });
          for (const day of days) {
            if (selectedDays.includes(day.getDay()) && day >= today) {
              allDates.push(format(day, 'yyyy-MM-dd'));
            }
          }
        }

        // Fetch existing rates for affected cells
        const targetRatePlanIds = selectedRatePlans.length > 0 ? selectedRatePlans : ratePlans.map(rp => rp.id);
        const { data: existingCells } = await supabase
          .from('inventory_cells')
          .select('rate_plan_id, cell_date, rate')
          .eq('property_id', propertyId)
          .in('cell_date', allDates)
          .in('rate_plan_id', targetRatePlanIds);

        // Build lookup: ratePlanId_date → rate
        const cellRateMap = new Map<string, number | null>();
        (existingCells ?? []).forEach((c: { rate_plan_id: string | null; cell_date: string; rate: number | null }) => {
          cellRateMap.set(`${c.rate_plan_id}_${c.cell_date}`, c.rate);
        });

        // Build lookup: ratePlanId → base_rate from mirror
        const mirrorBaseRates = new Map<string, number | null>();
        ratePlans.forEach(rp => mirrorBaseRates.set(rp.id, rp.base_rate));

        // Compute per-cell rate updates
        let skippedCount = 0;
        const perCellUpdates: Array<{ ratePlanId: string; date: string; rate: number }> = [];

        for (const rpId of targetRatePlanIds) {
          for (const date of allDates) {
            const cellRate = cellRateMap.get(`${rpId}_${date}`) ?? null;
            const baseRate = resolveBaseRate(cellRate, mirrorBaseRates.get(rpId) ?? null);
            const result = calculateRate(baseRate, changeType, value);

            if (result.skipped) {
              skippedCount++;
              continue;
            }
            if (result.afterValue !== null) {
              perCellUpdates.push({ ratePlanId: rpId, date, rate: result.afterValue });
            }
          }
        }

        if (skippedCount > 0) {
          toast.warning(`${skippedCount} ô bị bỏ qua (không có giá gốc cho phép tính %)`);
        }

        // Write per-cell computed rates  
        if (perCellUpdates.length > 0) {
          const batchId = crypto.randomUUID();
          const upserts = perCellUpdates.map(u => ({
            property_id: propertyId,
            room_type_id: selectedRoomTypes[0] || '',
            rate_plan_id: u.ratePlanId,
            channel_id: null,
            cell_date: u.date,
            rate: u.rate,
            ...Object.fromEntries(
              Object.entries(updates).filter(([k]) => k !== 'rate' && k !== 'intent' && k !== 'intent_note')
            ),
            source: 'manual',
            source_layer: 'OVERRIDE',
            sync_status: 'PENDING',
          }));

          const { error } = await supabase
            .from('inventory_cells')
            .upsert(upserts as any, {
              onConflict: 'property_id,room_type_id,rate_plan_id,channel_id,cell_date',
            });

          if (error) throw error;

          await safeMutation(() => supabase.from('inventory_logs').insert({
            property_id: propertyId,
            action: 'bulk_rate_calc',
            after_data: {
              change_type: rateChangeType,
              value,
              affected_cells: perCellUpdates.length,
              skipped_cells: skippedCount,
              intent: selectedIntent,
            },
            batch_id: batchId,
          }));
        }
      } else {
        // Original path for 'set' (exact) and non-rate changes
        await bulkUpdate.mutateAsync({
          propertyId,
          dateRanges: dateRanges
            .filter((r): r is { id: string; start: Date; end: Date } => Boolean(r.start && r.end))
            .map((r) => ({ start: r.start, end: r.end })),
          daysOfWeek: selectedDays,
          roomTypeIds: selectedRoomTypes,
          ratePlanIds: selectedRatePlans.length > 0 ? selectedRatePlans : [''],
          channelIds: selectedChannels.length > 0 ? selectedChannels : [''],
          updates: updates as Record<string, unknown>,
        });
      }

      // After-action feedback
      const channelCount = selectedChannels.length || channels.length;
      toast.success(
        <div className="flex items-start gap-2">
          <CheckCircle className="h-5 w-5 text-success mt-0.5" />
          <div>
            <p className="font-medium">Cập nhật thành công!</p>
            <p className="text-sm text-muted-foreground">
              Đã áp dụng cho {preview?.affectedDates} ngày · Đang sync tới {channelCount} channels
            </p>
          </div>
        </div>,
        { duration: 5000 }
      );

      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error('Lỗi khi cập nhật inventory');
    }
  };

  const resetForm = () => {
    setStep('form');
    setPreview(null);
    setOpenDatePicker(null);
    setResetNextClickRangeId(null);
    setStopSellConfirmCount(0);
    setPastDatesRemoved([]);
    setSelectedIntent('');
    setIntentNote('');
    setUpdateRate(false);
    setRateValue('');
    setRateChangeType('set');
    setUpdateStopSell(false);
    setStopSellValue(false);
    setUpdateCTA(false);
    setCtaValue(false);
    setUpdateCTD(false);
    setCtdValue(false);
    setUpdateMinStayArrival(false);
    setMinStayArrivalValue('');
    setUpdateMinStayThrough(false);
    setMinStayThroughValue('');
    setUpdateMaxStay(false);
    setMaxStayValue('');
    setSelectedRoomTypes([]);
    setSelectedRatePlans([]);
    setSelectedChannels([]);
    setDateRanges([{ id: '1', start: undefined, end: undefined }]);
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const handleClose = () => {
    // Warn if there are unsaved changes
    const hasChanges = updateRate || updateStopSell || updateCTA || updateCTD ||
      updateMinStayArrival || updateMinStayThrough || updateMaxStay;
    if (hasChanges && step !== 'form') {
      if (!window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?')) {
        return;
      }
    }
    resetForm();
    onOpenChange(false);
  };

  // Check permissions
  if (!permissions.canBulkUpdate) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-[500px] sm:max-w-[500px]">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Không có quyền</AlertTitle>
            <AlertDescription>Bạn không có quyền bulk update inventory.</AlertDescription>
          </Alert>
        </SheetContent>
      </Sheet>
    );
  }

  // Check if frozen
  if (isFrozen) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-[500px] sm:max-w-[500px]">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Hệ thống tạm khóa</AlertTitle>
            <AlertDescription>
              Bulk update đã bị tạm khóa do hệ thống đang gặp sự cố. Vui lòng liên hệ admin.
            </AlertDescription>
          </Alert>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] flex flex-col h-full p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {step === 'form' && 'Cài đặt giá'}
            {step === 'preview' && 'Xem trước thay đổi'}
            {step === 'confirm' && 'Xác nhận thay đổi'}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {step === 'form' && (
            <div className="space-y-6">
              {/* Date Range & Settings */}
              {/* Date Range Section */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Khoảng ngày áp dụng</Label>

                {dateRanges.map((range, idx) => (
                  <div key={range.id} className="space-y-3 p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Khoảng ngày {idx + 1}:</span>
                      {dateRanges.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDateRange(range.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-sm text-muted-foreground">Từ ngày</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                              <span className={cn(!range.start && "text-muted-foreground")}>
                                {range.start ? format(range.start, "dd/MM/yyyy") : "Chọn ngày bắt đầu"}
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={range.start}
                              onSelect={(date) => updateDateRange(range.id, 'start', date)}
                              disabled={(date) => isBefore(date, startOfDay(new Date()))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-sm text-muted-foreground">Đến ngày</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                              <span className={cn(!range.end && "text-muted-foreground")}>
                                {range.end ? format(range.end, "dd/MM/yyyy") : "Chọn ngày kết thúc"}
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={range.end}
                              onSelect={(date) => updateDateRange(range.id, 'end', date)}
                              disabled={(date) => range.start ? isBefore(date, range.start) : isBefore(date, startOfDay(new Date()))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Days of week */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Chọn ngày trong tuần:</Label>
                      <div className="flex gap-1">
                        {[
                          { value: 1, label: 'T2' },
                          { value: 2, label: 'T3' },
                          { value: 3, label: 'T4' },
                          { value: 4, label: 'T5' },
                          { value: 5, label: 'T6' },
                          { value: 6, label: 'T7' },
                          { value: 0, label: 'CN' },
                        ].map(day => (
                          <Button
                            key={day.value}
                            variant={selectedDays.includes(day.value) ? 'default' : 'outline'}
                            size="sm"
                            className="w-10 h-10 p-0"
                            onClick={() => toggleDay(day.value)}
                          >
                            {day.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="link" className="text-primary p-0 h-auto" onClick={addDateRange}>
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm Khoảng Ngày
                </Button>
              </div>

              {/* Settings Section */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Cài đặt</Label>

                {/* Rate */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={updateRate} onCheckedChange={setUpdateRate} />
                    <Label className="font-medium">Giá phòng</Label>
                  </div>
                  {updateRate && (
                    <div className="flex gap-2 pl-10">
                      <Select value={rateChangeType} onValueChange={(v: 'set' | 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent') => setRateChangeType(v)}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="set">Đặt giá cố định</SelectItem>
                          <SelectItem value="increase_amount">Tăng (VND)</SelectItem>
                          <SelectItem value="decrease_amount">Giảm (VND)</SelectItem>
                          <SelectItem value="increase_percent">Tăng (%)</SelectItem>
                          <SelectItem value="decrease_percent">Giảm (%)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={rateValue}
                        onChange={(e) => setRateValue(e.target.value)}
                        className="w-32"
                        placeholder={
                          rateChangeType === 'set' || rateChangeType === 'increase_amount' || rateChangeType === 'decrease_amount'
                            ? 'VND'
                            : '%'
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Stop Sell */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={updateStopSell} onCheckedChange={setUpdateStopSell} />
                      <div>
                        <Label className="font-medium">Mở/Ngừng bán</Label>
                        <p className="text-xs text-muted-foreground">Cập nhật trạng thái mở/ngừng bán trên các kênh</p>
                      </div>
                    </div>
                    {updateStopSell && (
                      <Switch checked={stopSellValue} onCheckedChange={setStopSellValue} />
                    )}
                  </div>
                </div>

                {/* Min Stay Arrival */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={updateMinStayArrival} onCheckedChange={setUpdateMinStayArrival} />
                      <Label className="font-medium">Lưu trú tối thiểu khi đến</Label>
                    </div>
                    {updateMinStayArrival && (
                      <Input
                        type="number"
                        value={minStayArrivalValue}
                        onChange={(e) => setMinStayArrivalValue(e.target.value)}
                        className="w-20"
                        placeholder="Đêm"
                      />
                    )}
                  </div>
                </div>

                {/* Min Stay Through */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={updateMinStayThrough} onCheckedChange={setUpdateMinStayThrough} />
                      <Label className="font-medium">Lưu trú tối thiểu xuyên suốt</Label>
                    </div>
                    {updateMinStayThrough && (
                      <Input
                        type="number"
                        value={minStayThroughValue}
                        onChange={(e) => setMinStayThroughValue(e.target.value)}
                        className="w-20"
                        placeholder="Đêm"
                      />
                    )}
                  </div>
                </div>

                {/* Max Stay */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={updateMaxStay} onCheckedChange={setUpdateMaxStay} />
                      <Label className="font-medium">Lưu trú tối đa</Label>
                    </div>
                    {updateMaxStay && (
                      <Input
                        type="number"
                        value={maxStayValue}
                        onChange={(e) => setMaxStayValue(e.target.value)}
                        className="w-20"
                        placeholder="Đêm"
                      />
                    )}
                  </div>
                </div>

                {/* CTA */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={updateCTA} onCheckedChange={setUpdateCTA} />
                      <Label className="font-medium">Đóng cửa nhận phòng</Label>
                    </div>
                    {updateCTA && (
                      <Switch checked={ctaValue} onCheckedChange={setCtaValue} />
                    )}
                  </div>
                </div>

                {/* CTD */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch checked={updateCTD} onCheckedChange={setUpdateCTD} />
                      <Label className="font-medium">Đóng cửa trả phòng</Label>
                    </div>
                    {updateCTD && (
                      <Switch checked={ctdValue} onCheckedChange={setCtdValue} />
                    )}
                  </div>
                </div>
              </div>

              {/* Room Types with Channels */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Áp dụng cho</Label>

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {roomTypes.map((rt) => {
                    const rtRatePlans = ratePlans.filter(rp => rp.provider_room_type_id === rt.provider_room_type_id);
                    const isRoomSelected = selectedRoomTypes.includes(rt.id);

                    // Group rate plans by channel
                    const channelGroups = channels.map(ch => {
                      const matchingRatePlans = rtRatePlans.filter(rp =>
                        rp.rate_plan_name?.toLowerCase().includes(ch.name.toLowerCase())
                      );
                      return { channel: ch, ratePlans: matchingRatePlans };
                    }).filter(g => g.ratePlans.length > 0);

                    const allRatePlanIds = rtRatePlans.map(rp => rp.id);
                    const allRoomTypeSelected = allRatePlanIds.every(id => selectedRatePlans.includes(id));

                    const toggleAllRoomType = () => {
                      if (allRoomTypeSelected) {
                        // Deselect all rate plans for this room type
                        setSelectedRatePlans(prev => prev.filter(id => !allRatePlanIds.includes(id)));
                        // Also remove room type if no rate plans left
                        setSelectedRoomTypes(prev => prev.filter(id => id !== rt.id));
                      } else {
                        // Select all
                        if (!isRoomSelected) {
                          setSelectedRoomTypes(prev => [...prev, rt.id]);
                        }
                        setSelectedRatePlans(prev => {
                          const existing = prev.filter(id => !allRatePlanIds.includes(id));
                          return [...existing, ...allRatePlanIds];
                        });
                      }
                    };

                    return (
                      <div key={rt.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-primary">{rt.room_type_name}</span>
                          <Button variant="link" className="text-primary p-0 h-auto text-sm" onClick={toggleAllRoomType}>
                            {allRoomTypeSelected ? 'Bỏ Chọn' : 'Chọn Tất Cả'}
                          </Button>
                        </div>

                        <div className="space-y-3 pl-2">
                          {channelGroups.map(({ channel, ratePlans: chRatePlans }) => {
                            const chRatePlanIds = chRatePlans.map(rp => rp.id);
                            const allChannelSelected = chRatePlanIds.every(id => selectedRatePlans.includes(id));

                            const toggleAllChannel = () => {
                              if (allChannelSelected) {
                                // Deselect all rate plans for this channel
                                setSelectedRatePlans(prev => prev.filter(id => !chRatePlanIds.includes(id)));
                              } else {
                                // Select all
                                if (!isRoomSelected) {
                                  setSelectedRoomTypes(prev => [...prev, rt.id]);
                                }
                                setSelectedRatePlans(prev => {
                                  const existing = prev.filter(id => !chRatePlanIds.includes(id));
                                  return [...existing, ...chRatePlanIds];
                                });
                              }
                            };

                            return (
                              <div key={channel.id} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">{channel.name}</span>
                                  <Button variant="link" className="text-primary p-0 h-auto text-xs" onClick={toggleAllChannel}>
                                    {allChannelSelected ? 'Bỏ Chọn' : 'Chọn Tất Cả'}
                                  </Button>
                                </div>
                                <div className="space-y-1">
                                  {chRatePlans.map(rp => {
                                    const isSelected = selectedRatePlans.includes(rp.id);
                                    return (
                                      <button
                                        key={rp.id}
                                        type="button"
                                        className={cn(
                                          "w-full text-left px-3 py-2 border rounded-md text-sm transition-colors",
                                          isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                                        )}
                                        onClick={() => {
                                          if (!isRoomSelected) {
                                            setSelectedRoomTypes(prev => [...prev, rt.id]);
                                          }
                                          setSelectedRatePlans(prev =>
                                            isSelected ? prev.filter(id => id !== rp.id) : [...prev, rp.id]
                                          );
                                        }}
                                      >
                                        {rp.rate_plan_name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Rate plans without channel match */}
                          {rtRatePlans.filter(rp => !channels.some(ch => rp.rate_plan_name?.toLowerCase().includes(ch.name.toLowerCase()))).length > 0 && (
                            <div className="space-y-1">
                              {rtRatePlans
                                .filter(rp => !channels.some(ch => rp.rate_plan_name?.toLowerCase().includes(ch.name.toLowerCase())))
                                .map(rp => {
                                  const isSelected = selectedRatePlans.includes(rp.id);
                                  return (
                                    <button
                                      key={rp.id}
                                      type="button"
                                      className={cn(
                                        "w-full text-left px-3 py-2 border rounded-md text-sm transition-colors",
                                        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                                      )}
                                      onClick={() => {
                                        if (!isRoomSelected) {
                                          setSelectedRoomTypes(prev => [...prev, rt.id]);
                                        }
                                        setSelectedRatePlans(prev =>
                                          isSelected ? prev.filter(id => id !== rp.id) : [...prev, rp.id]
                                        );
                                      }}
                                    >
                                      {rp.rate_plan_name}
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && preview && (
            <div className="space-y-6">
              {/* Blast Radius Summary - Per ABSOLUTE SPEC */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Blast Radius
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Room Types:</span>
                    <span className="font-bold">{preview.roomTypeCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rate Plans:</span>
                    <span className="font-bold">{preview.ratePlanCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channels:</span>
                    <span className="font-bold">{preview.channelCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ngày:</span>
                    <span className="font-bold">{preview.affectedDates}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">TOTAL CELLS</span>
                    <span className="text-2xl font-bold text-primary">{preview.affectedCells.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    = {preview.roomTypeCount} RoomTypes × {preview.ratePlanCount} RatePlans × {preview.channelCount} Channels × {preview.affectedDates} Ngày
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="space-y-2">
                  {preview.warnings.map((w, i) => (
                    <Alert key={i} variant={w.type === 'danger' ? 'destructive' : 'default'}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{w.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Changes to apply */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Thay đổi sẽ áp dụng</Label>
                <div className="space-y-2">
                  {preview.changes.map((change, i) => (
                    <div key={i} className={cn(
                      "flex justify-between items-center p-3 rounded-lg border",
                      change.riskLevel === 'danger' && "bg-destructive/10 border-destructive/30",
                      change.riskLevel === 'warning' && "bg-warning/10/50 border-warning"
                    )}>
                      <span className="flex items-center gap-2">
                        {change.isRisky && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        {change.field}
                      </span>
                      <Badge variant={change.isRisky ? 'destructive' : 'secondary'}>
                        {typeof change.value === 'boolean' ? (change.value ? 'BẬT' : 'TẮT') : change.value}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Affected Dates Preview */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Các ngày sẽ áp dụng</Label>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 border rounded-lg bg-muted/30">
                  {preview.affectedDatesList.slice(0, 30).map((d, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{format(d, 'dd/MM')}</Badge>
                  ))}
                  {preview.affectedDatesList.length > 30 && (
                    <Badge variant="secondary" className="text-xs">+{preview.affectedDatesList.length - 30} ngày khác</Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="border-t px-6 py-4 mt-auto">
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={handleClose}>Huỷ Bỏ</Button>
              <Button
                onClick={handlePreview}
                disabled={
                  selectedRatePlans.length === 0 ||
                  dateRanges.some((r) => !r.start || !r.end) ||
                  affectedDatesPreview.validDates.length === 0 ||
                  !(updateRate || updateStopSell || updateCTA || updateCTD || updateMinStayArrival || updateMinStayThrough || updateMaxStay)
                }
              >
                Xem trước
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Quay lại</Button>
              <Button onClick={handleSave} disabled={bulkUpdate.isPending}>
                {bulkUpdate.isPending ? 'Đang cập nhật...' : 'Xác nhận & Lưu'}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

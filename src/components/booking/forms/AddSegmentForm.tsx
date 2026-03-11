import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, addDays } from 'date-fns';
import { MobileTaskPage } from '@/components/booking-detail/mobile/MobileTaskPage';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, AlertTriangle, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResponsibleOwner } from '@/hooks/useResponsibleOwner';
import {
  useCreateSegment, useUpdateSegment, HostSupplySegment,
  calculateNights, findOverlaps, getMissingDates, getBookingDates, getAssignedDates,
} from '@/hooks/useHostSupplySegments';

const formSchema = z.object({
  partner_id: z.string().min(1, 'Chọn Host'),
  host_property_name: z.string().min(1, 'Chọn chỗ nghỉ'),
  host_room_type: z.string().min(1, 'Chọn loại phòng'),
  room_code: z.string().min(1, 'Nhập mã phòng'),
  date_from: z.date({ required_error: 'Chọn ngày bắt đầu' }),
  date_to: z.date({ required_error: 'Chọn ngày kết thúc' }),
  nightly_rate: z.coerce.number().min(1, 'Đơn giá phải > 0'),
  note: z.string().optional(),
  reason: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddSegmentFormProps {
  unifiedBookingId: string;
  checkInDate: string;
  checkOutDate: string;
  existingSegments: HostSupplySegment[];
  onComplete: () => void;
}

export function AddSegmentForm({
  unifiedBookingId,
  checkInDate,
  checkOutDate,
  existingSegments,
  onComplete,
}: AddSegmentFormProps) {
  const createSegment = useCreateSegment();
  const [overlapWarning, setOverlapWarning] = useState<string[]>([]);
  const [hostSearchOpen, setHostSearchOpen] = useState(false);
  const { isOwnerAssigned, assignOwner } = useResponsibleOwner(unifiedBookingId);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedPartnerPropertyId, setSelectedPartnerPropertyId] = useState<string>('');

  const { data: hosts = [] } = useQuery({
    queryKey: ['host-partners'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('partners').select('id, partner_name')
        .in('partner_type', ['HOST_LANDLORD', 'HOST_OPERATOR']).eq('status', 'active')
        .or('partner_status.is.null,partner_status.eq.ACTIVE').order('partner_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: hostRooms = [] } = useQuery({
    queryKey: ['host-rooms', selectedPartnerId],
    staleTime: 30_000,
    queryFn: async () => {
      if (!selectedPartnerId) return [];
      const { data, error } = await supabase.from('host_rooms').select('id, room_code, room_type, cost_per_night')
        .eq('partner_id', selectedPartnerId).eq('active_status', true).order('room_code');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPartnerId,
  });

  const { data: hostRoomTypes = [] } = useQuery({
    queryKey: ['partner-property-room-types-segment', selectedPartnerPropertyId],
    staleTime: 30_000,
    queryFn: async () => {
      if (!selectedPartnerPropertyId) return [];
      const { data, error } = await supabase.from('partner_property_room_types')
        .select(`id, display_name_override, room_type:room_type_catalog(id, code, name_vi)`)
        .eq('partner_property_id', selectedPartnerPropertyId).eq('is_active', true);
      if (error) throw error;
      return (data || []).map((rt: any) => ({
        id: rt.id,
        room_type_name: rt.display_name_override || rt.room_type?.name_vi || rt.room_type?.code || 'Unknown'
      }));
    },
    enabled: !!selectedPartnerPropertyId,
  });

  const { data: hostProperties = [] } = useQuery({
    queryKey: ['partner-properties-segment', selectedPartnerId],
    staleTime: 30_000,
    queryFn: async () => {
      if (!selectedPartnerId) return [];
      const { data, error } = await supabase.from('partner_property_mapping')
        .select(`id, property_id, property:property_catalog(id, property_name)`)
        .eq('partner_id', selectedPartnerId).eq('is_active', true);
      if (error) throw error;
      return (data || []).map((pm: any) => ({
        id: pm.property_id,
        mapping_id: pm.id,
        host_property_name: pm.property?.property_name || 'Unknown'
      }));
    },
    enabled: !!selectedPartnerId,
  });

  const bookingDates = getBookingDates(checkInDate, checkOutDate);
  const assignedDates = getAssignedDates(existingSegments);
  const missingDates = getMissingDates(bookingDates, assignedDates);

  const defaultFrom = missingDates.length > 0 ? parseISO(missingDates[0]) : parseISO(checkInDate);
  const defaultTo = missingDates.length > 0 ? addDays(defaultFrom, 1) : parseISO(checkOutDate);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partner_id: '', host_property_name: '', host_room_type: '', room_code: '',
      date_from: defaultFrom, date_to: defaultTo, nightly_rate: 0, note: '', reason: '',
    },
  });

  const watchDateFrom = form.watch('date_from');
  const watchDateTo = form.watch('date_to');

  useEffect(() => {
    if (watchDateFrom && watchDateTo) {
      const newSegment = { date_from: format(watchDateFrom, 'yyyy-MM-dd'), date_to: format(watchDateTo, 'yyyy-MM-dd'), id: undefined };
      const otherSegments = existingSegments.map(s => ({ date_from: s.date_from, date_to: s.date_to, id: s.id }));
      const overlaps = findOverlaps([...otherSegments, newSegment]);
      setOverlapWarning(overlaps);
    }
  }, [watchDateFrom, watchDateTo, existingSegments]);

  const nightsPreview = useMemo(() => {
    if (watchDateFrom && watchDateTo) return calculateNights(format(watchDateFrom, 'yyyy-MM-dd'), format(watchDateTo, 'yyyy-MM-dd'));
    return 0;
  }, [watchDateFrom, watchDateTo]);

  const watchNightlyRate = form.watch('nightly_rate');
  const totalPreview = nightsPreview * (watchNightlyRate || 0);

  const onSubmit = async (values: FormValues) => {
    if (overlapWarning.length > 0) return;
    const data = {
      partner_id: values.partner_id,
      host_property_name: values.host_property_name,
      host_room_type: values.host_room_type,
      room_code: values.room_code,
      date_from: format(values.date_from, 'yyyy-MM-dd'),
      date_to: format(values.date_to, 'yyyy-MM-dd'),
      nightly_rate: values.nightly_rate,
      note: values.note,
      room_line_index: 0,
    };
    await createSegment.mutateAsync({ unifiedBookingId, data });
    if (!isOwnerAssigned) await assignOwner("Segment created");
    onComplete();
  };

  const handleFormSubmit = () => form.handleSubmit(onSubmit)();

  return (
    <MobileTaskPage
      title="Phân bổ phòng mới"
      onBack={onComplete}
      onSubmit={handleFormSubmit}
      submitLabel="Thêm"
      submitDisabled={createSegment.isPending || overlapWarning.length > 0}
      isSubmitting={createSegment.isPending}
    >
      <Form {...form}>
        <div className="space-y-4">
          {/* Host Selection */}
          <FormField control={form.control} name="partner_id" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Host *</FormLabel>
              <Popover open={hostSearchOpen} onOpenChange={setHostSearchOpen} modal={true}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button variant="outline" role="combobox" aria-expanded={hostSearchOpen}
                      className={cn("w-full justify-between", !field.value && "text-muted-foreground")}>
                      {field.value ? hosts.find((h) => h.id === field.value)?.partner_name : "Chọn Host..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]" align="start" sideOffset={4}>
                  <Command>
                    <CommandInput placeholder="Tìm Host..." />
                    <CommandList>
                      <CommandEmpty>Không tìm thấy Host</CommandEmpty>
                      <CommandGroup>
                        {hosts.map((host) => (
                          <CommandItem key={host.id} value={host.partner_name} onSelect={() => {
                            field.onChange(host.id);
                            setSelectedPartnerId(host.id);
                            setSelectedPropertyId('');
                            setSelectedPartnerPropertyId('');
                            form.setValue('host_property_name', '');
                            form.setValue('host_room_type', '');
                            form.setValue('room_code', '');
                            form.setValue('nightly_rate', 0);
                            setHostSearchOpen(false);
                          }}>
                            <Check className={cn("mr-2 h-4 w-4", field.value === host.id ? "opacity-100" : "opacity-0")} />
                            {host.partner_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )} />

          {/* Property & Room */}
          {selectedPartnerId && (
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="host_property_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Chỗ nghỉ *</FormLabel>
                  <Select value={field.value} onValueChange={(value) => {
                    field.onChange(value);
                    const prop = hostProperties.find(p => p.host_property_name === value);
                    if (prop) { setSelectedPropertyId(prop.id); setSelectedPartnerPropertyId(prop.mapping_id); }
                    form.setValue('host_room_type', '');
                  }}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Chọn chỗ nghỉ" /></SelectTrigger></FormControl>
                    <SelectContent position="popper">
                      {hostProperties.length === 0 ? (
                        <SelectItem value="__empty__" disabled>Không có chỗ nghỉ</SelectItem>
                      ) : hostProperties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.host_property_name}>{prop.host_property_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="host_room_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại phòng *</FormLabel>
                  <Select value={field.value} onValueChange={(value) => {
                    field.onChange(value);
                    const room = hostRooms.find(r => r.room_type === value);
                    if (room && room.cost_per_night) form.setValue('nightly_rate', room.cost_per_night);
                  }} disabled={!selectedPropertyId}>
                    <FormControl><SelectTrigger><SelectValue placeholder={selectedPropertyId ? "Chọn loại phòng" : "Chọn chỗ nghỉ trước"} /></SelectTrigger></FormControl>
                    <SelectContent position="popper">
                      {hostRoomTypes.length === 0 ? (
                        <SelectItem value="__empty__" disabled>Không có loại phòng</SelectItem>
                      ) : hostRoomTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.room_type_name}>{rt.room_type_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          <FormField control={form.control} name="room_code" render={({ field }) => (
            <FormItem>
              <FormLabel>Mã phòng *</FormLabel>
              <FormControl><Input {...field} placeholder="VD: A101" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="date_from" render={({ field }) => (
              <FormItem>
                <FormLabel>Từ ngày *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} defaultMonth={field.value ?? parseISO(checkInDate)}
                      onSelect={(date) => { if (date) field.onChange(date); }}
                      fromDate={parseISO(checkInDate)} toDate={addDays(parseISO(checkOutDate), -1)} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="date_to" render={({ field }) => (
              <FormItem>
                <FormLabel>Đến ngày *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} defaultMonth={field.value ?? addDays(parseISO(checkInDate), 1)}
                      onSelect={(date) => { if (date) field.onChange(date); }}
                      fromDate={addDays(parseISO(checkInDate), 1)} toDate={parseISO(checkOutDate)} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* Overlap Warning */}
          {overlapWarning.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Ngày bị chồng lấn: {overlapWarning.join(', ')}. Không thể lưu.</AlertDescription>
            </Alert>
          )}

          {/* Nightly Rate */}
          <FormField control={form.control} name="nightly_rate" render={({ field }) => (
            <FormItem>
              <FormLabel>Đơn giá/đêm (VND) *</FormLabel>
              <FormControl>
                <CurrencyInput value={String(field.value || 0)} onChange={(v) => form.setValue('nightly_rate', parseFloat(v) || 0, { shouldValidate: true })} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Preview */}
          {nightsPreview > 0 && watchNightlyRate > 0 && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex justify-between"><span>Số đêm:</span><span className="font-medium">{nightsPreview} đêm</span></div>
              <div className="flex justify-between"><span>Thành tiền:</span><span className="font-medium">{totalPreview.toLocaleString()}đ</span></div>
            </div>
          )}

          {/* Note */}
          <FormField control={form.control} name="note" render={({ field }) => (
            <FormItem>
              <FormLabel>Ghi chú</FormLabel>
              <FormControl><Textarea {...field} placeholder="Ghi chú thêm..." /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
      </Form>
    </MobileTaskPage>
  );
}

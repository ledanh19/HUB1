import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, addDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  useCreateSegment,
  useUpdateSegment,
  HostSupplySegment,
  calculateNights,
  findOverlaps,
  getMissingDates,
  getBookingDates,
  getAssignedDates
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  checkInDate: string;
  checkOutDate: string;
  existingSegments: HostSupplySegment[];
  editSegment?: HostSupplySegment | null;
  copyFromSegment?: HostSupplySegment | null;
  requiresReason?: boolean;
  roomLineIndex?: number;
  isMultiRoom?: boolean;
}

export function AddSegmentDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  checkInDate,
  checkOutDate,
  existingSegments,
  editSegment,
  copyFromSegment,
  requiresReason = false,
  roomLineIndex = 0,
  isMultiRoom = false,
}: Props) {
  const createSegment = useCreateSegment();
  const updateSegment = useUpdateSegment();
  const [overlapWarning, setOverlapWarning] = useState<string[]>([]);
  const [hostSearchOpen, setHostSearchOpen] = useState(false);

  // Responsible Owner tracking - assign on segment creation
  const { isOwnerAssigned, assignOwner } = useResponsibleOwner(unifiedBookingId);

  // Fetch hosts
  const { data: hosts = [] } = useQuery({
    queryKey: ['host-partners'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('id, partner_name')
        .in('partner_type', ['HOST_LANDLORD', 'HOST_OPERATOR'])
        .eq('status', 'active')
        .or('partner_status.is.null,partner_status.eq.ACTIVE')
        .order('partner_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch host rooms for selected partner
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  const { data: hostRooms = [] } = useQuery({
    queryKey: ['host-rooms', selectedPartnerId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedPartnerId) return [];
      const { data, error } = await supabase
        .from('host_rooms')
        .select('id, room_code, room_type, cost_per_night')
        .eq('partner_id', selectedPartnerId)
        .eq('active_status', true)
        .order('room_code');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPartnerId,
  });

  // State for partner_property_mapping_id (từ partner + property)
  const [selectedPartnerPropertyId, setSelectedPartnerPropertyId] = useState<string>('');

  // Fetch room types for selected partner-property mapping (từ partner_property_room_types - mỗi host có room types riêng)
  const { data: hostRoomTypes = [] } = useQuery({
    queryKey: ['partner-property-room-types-segment', selectedPartnerPropertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedPartnerPropertyId) return [];
      const { data, error } = await supabase
        .from('partner_property_room_types')
        .select(`
          id,
          display_name_override,
          room_type:room_type_catalog(id, code, name_vi)
        `)
        .eq('partner_property_id', selectedPartnerPropertyId)
        .eq('is_active', true);
      if (error) throw error;
      // Transform to expected format
      return (data || []).map((rt: any) => ({
        id: rt.id,
        room_type_name: rt.display_name_override || rt.room_type?.name_vi || rt.room_type?.code || 'Unknown'
      }));
    },
    enabled: !!selectedPartnerPropertyId,
  });

  // Fetch host properties for selected partner (from partner_property_mapping + property_catalog)
  // Also get the mapping ID to fetch room types
  const { data: hostProperties = [] } = useQuery({
    queryKey: ['partner-properties-segment', selectedPartnerId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedPartnerId) return [];
      const { data, error } = await supabase
        .from('partner_property_mapping')
        .select(`
          id,
          property_id,
          property:property_catalog(id, property_name)
        `)
        .eq('partner_id', selectedPartnerId)
        .eq('is_active', true);
      if (error) throw error;
      // Transform to expected format - include mapping id for room types lookup
      return (data || []).map((pm: any) => ({
        id: pm.property_id,
        mapping_id: pm.id, // partner_property_mapping.id để query room types
        host_property_name: pm.property?.property_name || 'Unknown'
      }));
    },
    enabled: !!selectedPartnerId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partner_id: '',
      host_property_name: '',
      host_room_type: '',
      room_code: '',
      nightly_rate: 0,
      note: '',
      reason: '',
    },
  });

  // Track if dialog was just opened to prevent re-initialization on data refetch
  const prevOpenRef = useRef(open);
  const hasInitializedRef = useRef(false);

  // Initialize form ONLY when dialog opens (not on every existingSegments refetch)
  useEffect(() => {
    const wasJustOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    // Only initialize when dialog opens, not on subsequent data refreshes
    if (!open) {
      hasInitializedRef.current = false;
      return;
    }

    // Skip if already initialized while dialog is open
    if (hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;

    const initPropertyMapping = async (partnerId: string, propertyName: string) => {
      // Find partner_property_mapping.id for the given partner + property name
      const { data } = await supabase
        .from('partner_property_mapping')
        .select(`
          id,
          property_id,
          property:property_catalog(property_name)
        `)
        .eq('partner_id', partnerId)
        .eq('is_active', true);

      if (data) {
        const mapping = data.find((m: any) => m.property?.property_name === propertyName);
        if (mapping) {
          setSelectedPropertyId(mapping.property_id);
          setSelectedPartnerPropertyId(mapping.id);
        }
      }
    };

    if (editSegment) {
      setSelectedPartnerId(editSegment.partner_id);
      if (editSegment.host_property_name) {
        initPropertyMapping(editSegment.partner_id, editSegment.host_property_name);
      }
      form.reset({
        partner_id: editSegment.partner_id,
        host_property_name: editSegment.host_property_name || '',
        host_room_type: editSegment.host_room_type || '',
        room_code: editSegment.room_code || '',
        date_from: parseISO(editSegment.date_from),
        date_to: parseISO(editSegment.date_to),
        nightly_rate: editSegment.nightly_rate,
        note: editSegment.note || '',
        reason: '',
      });
    } else if (copyFromSegment) {
      setSelectedPartnerId(copyFromSegment.partner_id);
      if (copyFromSegment.host_property_name) {
        initPropertyMapping(copyFromSegment.partner_id, copyFromSegment.host_property_name);
      }
      // Find next available date - use current existingSegments snapshot
      const bookingDates = getBookingDates(checkInDate, checkOutDate);
      const assignedDates = getAssignedDates(existingSegments);
      const missingDates = getMissingDates(bookingDates, assignedDates);

      const nextFrom = missingDates.length > 0 ? parseISO(missingDates[0]) : parseISO(checkInDate);
      const nextTo = missingDates.length > 0 ? addDays(nextFrom, 1) : parseISO(checkOutDate);

      form.reset({
        partner_id: copyFromSegment.partner_id,
        host_property_name: copyFromSegment.host_property_name || '',
        host_room_type: copyFromSegment.host_room_type || '',
        room_code: copyFromSegment.room_code || '',
        date_from: nextFrom,
        date_to: nextTo,
        nightly_rate: copyFromSegment.nightly_rate,
        note: '',
        reason: '',
      });
    } else {
      // Default to first missing date range - use current existingSegments snapshot
      const bookingDates = getBookingDates(checkInDate, checkOutDate);
      const assignedDates = getAssignedDates(existingSegments);
      const missingDates = getMissingDates(bookingDates, assignedDates);

      const defaultFrom = missingDates.length > 0 ? parseISO(missingDates[0]) : parseISO(checkInDate);
      const defaultTo = missingDates.length > 0 ? addDays(defaultFrom, 1) : parseISO(checkOutDate);

      form.reset({
        partner_id: '',
        host_property_name: '',
        host_room_type: '',
        room_code: '',
        date_from: defaultFrom,
        date_to: defaultTo,
        nightly_rate: 0,
        note: '',
        reason: '',
      });
      setSelectedPartnerId('');
      setSelectedPropertyId('');
      setSelectedPartnerPropertyId('');
    }
  }, [open, editSegment, copyFromSegment, checkInDate, checkOutDate]);

  // Check for overlaps when dates change
  const watchDateFrom = form.watch('date_from');
  const watchDateTo = form.watch('date_to');

  useEffect(() => {
    if (watchDateFrom && watchDateTo) {
      const newSegment = {
        date_from: format(watchDateFrom, 'yyyy-MM-dd'),
        date_to: format(watchDateTo, 'yyyy-MM-dd'),
        id: editSegment?.id,
      };

      const otherSegments = existingSegments
        .filter(s => s.id !== editSegment?.id)
        .map(s => ({ date_from: s.date_from, date_to: s.date_to, id: s.id }));

      const overlaps = findOverlaps([...otherSegments, newSegment]);
      setOverlapWarning(overlaps);
    }
  }, [watchDateFrom, watchDateTo, existingSegments, editSegment]);

  // Calculate nights preview
  const nightsPreview = useMemo(() => {
    if (watchDateFrom && watchDateTo) {
      return calculateNights(
        format(watchDateFrom, 'yyyy-MM-dd'),
        format(watchDateTo, 'yyyy-MM-dd')
      );
    }
    return 0;
  }, [watchDateFrom, watchDateTo]);

  const watchNightlyRate = form.watch('nightly_rate');
  const totalPreview = nightsPreview * (watchNightlyRate || 0);

  const onSubmit = async (values: FormValues) => {
    if (overlapWarning.length > 0) {
      return; // Block if overlap
    }

    const data = {
      partner_id: values.partner_id,
      host_property_name: values.host_property_name,
      host_room_type: values.host_room_type,
      room_code: values.room_code,
      date_from: format(values.date_from, 'yyyy-MM-dd'),
      date_to: format(values.date_to, 'yyyy-MM-dd'),
      nightly_rate: values.nightly_rate,
      note: values.note,
      room_line_index: roomLineIndex,
    };

    if (editSegment) {
      await updateSegment.mutateAsync({
        segmentId: editSegment.id,
        data,
        reason: values.reason,
      });
    } else {
      await createSegment.mutateAsync({
        unifiedBookingId,
        data,
      });
      // Assign responsible owner on first meaningful action (now saves to database)
      if (!isOwnerAssigned) {
        await assignOwner("Segment created");
      }
    }

    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => { if (hostSearchOpen) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>
            {editSegment ? 'Sửa Phân bổ' : copyFromSegment ? 'Sao chép Phân bổ' : 'Phân bổ phòng mới'}
            {isMultiRoom && <span className="text-sm font-normal text-muted-foreground ml-2">(Phòng {roomLineIndex + 1})</span>}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Host Selection with Search */}
            <FormField
              control={form.control}
              name="partner_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Host *</FormLabel>
                  <Popover open={hostSearchOpen} onOpenChange={setHostSearchOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={hostSearchOpen}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? hosts.find((host) => host.id === field.value)?.partner_name
                            : "Chọn Host..."}
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
                              <CommandItem
                                key={host.id}
                                value={host.partner_name}
                                onSelect={() => {
                                  field.onChange(host.id);
                                  setSelectedPartnerId(host.id);
                                  // Reset dependent fields when host changes
                                  setSelectedPropertyId('');
                                  setSelectedPartnerPropertyId('');
                                  form.setValue('host_property_name', '');
                                  form.setValue('host_room_type', '');
                                  form.setValue('room_code', '');
                                  form.setValue('nightly_rate', 0);
                                  setHostSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === host.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
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
              )}
            />

            {/* Property & Room */}
            {selectedPartnerId && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="host_property_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chỗ nghỉ *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Find property mapping ID to fetch room types (per partner)
                          const prop = hostProperties.find(p => p.host_property_name === value);
                          if (prop) {
                            setSelectedPropertyId(prop.id);
                            setSelectedPartnerPropertyId(prop.mapping_id); // partner_property_mapping.id
                          }
                          // Reset room type when property changes
                          form.setValue('host_room_type', '');
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn chỗ nghỉ" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper">
                          {hostProperties.length === 0 ? (
                            <SelectItem value="__empty__" disabled>
                              Không có chỗ nghỉ
                            </SelectItem>
                          ) : (
                            hostProperties.map((prop) => (
                              <SelectItem key={prop.id} value={prop.host_property_name}>
                                {prop.host_property_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="host_room_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loại phòng *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Auto-fill rate from host_rooms if available
                          const room = hostRooms.find(r => r.room_type === value);
                          if (room && room.cost_per_night) {
                            form.setValue('nightly_rate', room.cost_per_night);
                          }
                        }}
                        disabled={!selectedPropertyId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={selectedPropertyId ? "Chọn loại phòng" : "Chọn chỗ nghỉ trước"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper">
                          {hostRoomTypes.length === 0 ? (
                            <SelectItem value="__empty__" disabled>
                              Không có loại phòng
                            </SelectItem>
                          ) : (
                            hostRoomTypes.map((rt) => (
                              <SelectItem key={rt.id} value={rt.room_type_name}>
                                {rt.room_type_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="room_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mã phòng *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="VD: A101" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Từ ngày *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Chọn ngày</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          defaultMonth={field.value ?? parseISO(checkInDate)}
                          onSelect={(date) => {
                            // Only update if a date is selected (not unselected)
                            if (date) {
                              field.onChange(date);
                            }
                          }}
                          fromDate={parseISO(checkInDate)}
                          toDate={addDays(parseISO(checkOutDate), -1)}
                          initialFocus
                          className=""
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Đến ngày *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Chọn ngày</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          defaultMonth={field.value ?? addDays(parseISO(checkInDate), 1)}
                          onSelect={(date) => {
                            // Only update if a date is selected (not unselected)
                            if (date) {
                              field.onChange(date);
                            }
                          }}
                          fromDate={addDays(parseISO(checkInDate), 1)}
                          toDate={parseISO(checkOutDate)}
                          initialFocus
                          className=""
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Overlap Warning */}
            {overlapWarning.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Ngày bị chồng lấn: {overlapWarning.join(', ')}. Không thể lưu.
                </AlertDescription>
              </Alert>
            )}

            {/* Nightly Rate */}
            <FormField
              control={form.control}
              name="nightly_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Đơn giá/đêm (VND) *</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={String(field.value || 0)}
                      onChange={(v) => form.setValue('nightly_rate', parseFloat(v) || 0, { shouldValidate: true })}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preview */}
            {nightsPreview > 0 && watchNightlyRate > 0 && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="flex justify-between">
                  <span>Số đêm:</span>
                  <span className="font-medium">{nightsPreview} đêm</span>
                </div>
                <div className="flex justify-between">
                  <span>Thành tiền:</span>
                  <span className="font-medium">{totalPreview.toLocaleString()}đ</span>
                </div>
              </div>
            )}

            {/* Note */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Ghi chú thêm..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reason (required after check-in) */}
            {requiresReason && editSegment && (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lý do sửa (bắt buộc) *</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Nhập lý do sửa segment..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={
                  createSegment.isPending ||
                  updateSegment.isPending ||
                  overlapWarning.length > 0 ||
                  (requiresReason && editSegment && !form.watch('reason'))
                }
              >
                {editSegment ? 'Cập nhật' : 'Thêm'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

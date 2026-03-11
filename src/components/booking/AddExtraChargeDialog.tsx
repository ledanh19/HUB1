import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCreateExtraCharge, useUpdateExtraCharge, HostSupplySegment, HostExtraCharge } from '@/hooks/useHostSupplySegments';

const CHARGE_TYPES = [
  { value: 'EARLY_CHECKIN', label: 'Nhận phòng sớm' },
  { value: 'LATE_CHECKOUT', label: 'Trả phòng muộn' },
  { value: 'CLEANING', label: 'Phí dọn phòng' },
  { value: 'CARD_FEE', label: 'Phí thẻ' },
  { value: 'OTHER', label: 'Khác' },
];

const formSchema = z.object({
  partner_id: z.string().min(1, 'Chọn Host'),
  segment_id: z.string().optional(),
  charge_type: z.string().min(1, 'Chọn loại phụ phí'),
  amount: z.coerce.number().min(1, 'Số tiền phải > 0'),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  segments: HostSupplySegment[];
  editCharge?: HostExtraCharge | null; // NEW: for edit mode
}

export function AddExtraChargeDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  segments,
  editCharge,
}: Props) {
  const createCharge = useCreateExtraCharge();
  const updateCharge = useUpdateExtraCharge();

  // Get unique hosts from segments
  const uniqueHosts = [...new Map(
    segments.map(s => [s.partner_id, { id: s.partner_id, name: s.partner?.partner_name || 'Host' }])
  ).values()];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partner_id: uniqueHosts.length === 1 ? uniqueHosts[0].id : '',
      segment_id: '',
      charge_type: '',
      amount: 0,
      note: '',
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (editCharge) {
      form.reset({
        partner_id: editCharge.partner_id,
        segment_id: editCharge.segment_id || '',
        charge_type: editCharge.charge_type,
        amount: editCharge.amount,
        note: editCharge.note || '',
      });
    } else {
      form.reset({
        partner_id: uniqueHosts.length === 1 ? uniqueHosts[0].id : '',
        segment_id: '',
        charge_type: '',
        amount: 0,
        note: '',
      });
    }
  }, [editCharge, form, uniqueHosts.length]);

  const selectedPartnerId = form.watch('partner_id');
  const selectedSegmentId = form.watch('segment_id');
  const partnerSegments = segments.filter(s => s.partner_id === selectedPartnerId);

  // Detect post-settlement: check if selected segment is already settled
  const settledSegmentIds = useMemo(
    () => new Set(segments.filter(s => s.settlement_id).map(s => s.id)),
    [segments]
  );
  const isPostSettlement = !!(selectedSegmentId && selectedSegmentId !== 'none' && settledSegmentIds.has(selectedSegmentId));

  const onSubmit = async (values: FormValues) => {
    if (editCharge) {
      await updateCharge.mutateAsync({
        chargeId: editCharge.id,
        unifiedBookingId,
        data: {
          partner_id: values.partner_id,
          segment_id: values.segment_id && values.segment_id !== 'none' ? values.segment_id : undefined,
          charge_type: values.charge_type,
          amount: values.amount,
          note: values.note,
        },
      });
    } else {
      await createCharge.mutateAsync({
        unifiedBookingId,
        data: {
          partner_id: values.partner_id,
          segment_id: values.segment_id && values.segment_id !== 'none' ? values.segment_id : undefined,
          charge_type: values.charge_type,
          amount: values.amount,
          note: values.note,
        },
      });
    }

    form.reset();
    onOpenChange(false);
  };

  const isLoading = createCharge.isPending || updateCharge.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editCharge ? 'Sửa phụ phí Host' : 'Thêm phụ phí Host'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Post-settlement warning */}
            {isPostSettlement && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
                <span className="mt-0.5">⚠️</span>
                <span>Segment đã quyết toán. Phụ phí sẽ được tính vào <strong>kỳ quyết toán tiếp theo</strong>, không ảnh hưởng settlement cũ.</span>
              </div>
            )}
            {/* Host Selection */}
            <FormField
              control={form.control}
              name="partner_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn Host" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {uniqueHosts.map((host) => (
                        <SelectItem key={host.id} value={host.id}>
                          {host.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Segment (Optional) */}
            {partnerSegments.length > 0 && (
              <FormField
                control={form.control}
                name="segment_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Liên kết Segment (tùy chọn)</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Không liên kết" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Không liên kết</SelectItem>
                        {partnerSegments.map((segment) => (
                          <SelectItem key={segment.id} value={segment.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {segment.room_code || 'Chưa có mã'} - {segment.host_room_type || 'N/A'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {segment.date_from} → {segment.date_to} ({segment.nights} đêm) • {segment.nightly_rate?.toLocaleString('vi-VN')}đ/đêm
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Charge Type */}
            <FormField
              control={form.control}
              name="charge_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại phụ phí *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn loại phụ phí" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CHARGE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số tiền (VND) *</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={String(field.value || 0)}
                      onChange={(v) => form.setValue('amount', parseFloat(v) || 0, { shouldValidate: true })}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isLoading}>
                {editCharge ? 'Cập nhật' : 'Thêm phụ phí'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

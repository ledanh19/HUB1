import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createAuditLog } from './useAuditLog';
import { syncHostPayables } from './useHostPayableSync';
export interface HostSupplySegment {
  id: string;
  unified_booking_id: string;
  partner_id: string;
  host_room_id: string | null;
  host_property_name: string | null;
  host_room_type: string | null;
  room_code: string | null;
  date_from: string;
  date_to: string;
  nights: number;
  nightly_rate: number;
  total_amount: number;
  note: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  // Multi-room support
  room_line_index: number;
  // Settlement lock fields
  settlement_id: string | null;
  locked_at: string | null;
  // Segment-level check-in/check-out tracking
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
  checked_in_by: string | null;
  checked_out_by: string | null;
  partner?: {
    partner_name: string;
  };
  // Settlement status — enriched join for badge defense-in-depth
  settlement?: {
    status: string;
  } | null;
}

export interface HostExtraCharge {
  id: string;
  unified_booking_id: string;
  partner_id: string;
  segment_id: string | null;
  charge_type: string;
  amount: number;
  note: string | null;
  created_at: string;
  created_by: string | null;
  // Settlement lock fields
  settlement_id: string | null;
  locked_at: string | null;
  partner?: {
    partner_name: string;
  };
  // Settlement status — enriched join for badge defense-in-depth
  settlement?: {
    status: string;
  } | null;
}

export interface SegmentFormData {
  partner_id: string;
  host_room_id?: string;
  host_property_name?: string;
  host_room_type?: string;
  room_code?: string;
  date_from: string;
  date_to: string;
  nightly_rate: number;
  note?: string;
  room_line_index?: number;
}

export interface ExtraChargeFormData {
  partner_id: string;
  segment_id?: string;
  charge_type: string;
  amount: number;
  note?: string;
}

// Calculate nights between two dates (date_from inclusive, date_to exclusive)
export function calculateNights(dateFrom: string, dateTo: string): number {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diffTime = to.getTime() - from.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

// Check for overlapping segments
export function findOverlaps(segments: { date_from: string; date_to: string; id?: string }[]): string[] {
  const overlappingDates: Set<string> = new Set();

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];

      const aFrom = new Date(a.date_from);
      const aTo = new Date(a.date_to);
      const bFrom = new Date(b.date_from);
      const bTo = new Date(b.date_to);

      // Check if ranges overlap (date_to is exclusive)
      if (aFrom < bTo && bFrom < aTo) {
        // Find overlapping dates
        const overlapStart = aFrom > bFrom ? aFrom : bFrom;
        const overlapEnd = aTo < bTo ? aTo : bTo;

        let current = new Date(overlapStart);
        while (current < overlapEnd) {
          overlappingDates.add(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      }
    }
  }

  return Array.from(overlappingDates);
}

// Get all dates in a booking range
export function getBookingDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const current = new Date(checkIn);
  const end = new Date(checkOut);

  while (current < end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// Get assigned dates from segments
export function getAssignedDates(segments: { date_from: string; date_to: string }[]): string[] {
  const dates: Set<string> = new Set();

  segments.forEach(segment => {
    const current = new Date(segment.date_from);
    const end = new Date(segment.date_to);

    while (current < end) {
      dates.add(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
  });

  return Array.from(dates);
}

// Get missing dates
export function getMissingDates(bookingDates: string[], assignedDates: string[]): string[] {
  const assignedSet = new Set(assignedDates);
  return bookingDates.filter(date => !assignedSet.has(date));
}

export function useHostSupplySegments(unifiedBookingId: string | null) {
  return useQuery({
    queryKey: ['host-supply-segments', unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from('host_supply_segments')
        .select(`
          *,
          partner:partners(partner_name),
          settlement:host_settlements!settlement_id(status)
        `)
        .eq('unified_booking_id', unifiedBookingId)
        .order('date_from', { ascending: true });

      if (error) throw error;
      // Cast through unknown to handle type mismatch until Supabase types regenerate
      return data as unknown as HostSupplySegment[];
    },
    enabled: !!unifiedBookingId,
  });
}

export function useHostExtraCharges(unifiedBookingId: string | null) {
  return useQuery({
    queryKey: ['host-extra-charges', unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from('host_extra_charges')
        .select(`
          *,
          partner:partners(partner_name),
          settlement:host_settlements!settlement_id(status)
        `)
        .eq('unified_booking_id', unifiedBookingId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as unknown as HostExtraCharge[];
    },
    enabled: !!unifiedBookingId,
  });
}

export function useCreateSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      unifiedBookingId,
      data
    }: {
      unifiedBookingId: string;
      data: SegmentFormData
    }) => {
      const nights = calculateNights(data.date_from, data.date_to);
      const total_amount = nights * data.nightly_rate;

      const { data: user } = await supabase.auth.getUser();

      const { data: segment, error } = await supabase
        .from('host_supply_segments')
        .insert({
          unified_booking_id: unifiedBookingId,
          partner_id: data.partner_id,
          host_room_id: data.host_room_id || null,
          host_property_name: data.host_property_name || null,
          host_room_type: data.host_room_type || null,
          room_code: data.room_code || null,
          date_from: data.date_from,
          date_to: data.date_to,
          nights,
          nightly_rate: data.nightly_rate,
          total_amount,
          note: data.note || null,
          created_by: user.user?.id,
          room_line_index: data.room_line_index ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return segment;
    },
    onSuccess: (segment, { unifiedBookingId }) => {
      toast.success('Đã phân bổ phòng');

      // Fire-and-forget: Sync host_payables (non-blocking)
      syncHostPayables(unifiedBookingId).catch(e => console.error('Error syncing payables:', e));

      // Fire-and-forget: Update stays table with the first segment's room info
      supabase
        .from('stays')
        .update({
          host_property_name: segment.host_property_name,
          host_room_type: segment.host_room_type,
          host_cost: segment.total_amount,
          assigned_at: new Date().toISOString(),
        })
        .eq('unified_booking_id', unifiedBookingId)
        .then(() => { }, e => console.error('Error syncing stays:', e));

      // High priority invalidations - immediate (essential UI updates)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['host-supply-segments', unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ['stays'] });
        queryClient.invalidateQueries({ queryKey: ['stays_operations'] });
        queryClient.invalidateQueries({ queryKey: ['stay_record', unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ['booking_detail', unifiedBookingId] });
      }, 100);

      // Low priority invalidations - delayed (background sync)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['enhanced-host-payables'] });
        queryClient.invalidateQueries({ queryKey: ['host_payables'] });
        queryClient.invalidateQueries({ queryKey: ['stays_with_bookings'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 500);

      // Audit log - fire-and-forget
      createAuditLog({ action: 'CREATE', entity: 'host_supply_segments', entityId: segment.id, beforeData: null, afterData: segment }).catch(console.error);
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

export function useUpdateSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      segmentId,
      data,
      reason
    }: {
      segmentId: string;
      data: Partial<SegmentFormData>;
      reason?: string;
    }) => {
      // Get current segment for audit + settlement lock check
      const { data: currentSegment, error: fetchError } = await supabase
        .from('host_supply_segments')
        .select('*')
        .eq('id', segmentId)
        .single();

      if (fetchError) throw fetchError;

      // SETTLEMENT HARD LOCK CHECK
      // Per user spec: After settlement, segments become READ ONLY
      if (currentSegment?.locked_at || currentSegment?.settlement_id) {
        throw new Error('SETTLEMENT_LOCKED: Segment đã được quyết toán, không thể sửa. Vui lòng tạo bản ghi điều chỉnh.');
      }

      const updates: Record<string, unknown> = { ...data };

      if (data.date_from && data.date_to) {
        const nights = calculateNights(data.date_from, data.date_to);
        updates.nights = nights;
        if (data.nightly_rate !== undefined) {
          updates.total_amount = nights * data.nightly_rate;
        } else if (currentSegment?.nightly_rate) {
          updates.total_amount = nights * currentSegment.nightly_rate;
        }
      }

      const { data: user } = await supabase.auth.getUser();
      updates.updated_by = user.user?.id;

      if (reason) {
        updates.note = `${currentSegment?.note || ''}\n[Sửa: ${reason}]`.trim();
      }

      const { data: segment, error } = await supabase
        .from('host_supply_segments')
        .update(updates)
        .eq('id', segmentId)
        .select()
        .single();

      if (error) throw error;
      return { before: currentSegment, after: segment };
    },
    onSuccess: ({ before, after }) => {
      toast.success('Đã cập nhật segment');

      // Fire-and-forget: Sync host_payables (non-blocking)
      syncHostPayables(after.unified_booking_id).catch(e => console.error('Error syncing payables:', e));

      // High priority invalidations - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['host-supply-segments', after.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ['booking_detail', after.unified_booking_id] });
      }, 100);

      // Low priority invalidations - delayed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['enhanced-host-payables'] });
        queryClient.invalidateQueries({ queryKey: ['host_payables'] });
      }, 500);

      // Audit log - fire-and-forget
      createAuditLog({ action: 'UPDATE', entity: 'host_supply_segments', entityId: after.id, beforeData: before, afterData: after }).catch(console.error);
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

export function useDeleteSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      segmentId,
      unifiedBookingId
    }: {
      segmentId: string;
      unifiedBookingId: string;
    }) => {
      // Get segment before delete for audit + settlement lock check
      const { data: segment, error: fetchError } = await supabase
        .from('host_supply_segments')
        .select('*')
        .eq('id', segmentId)
        .single();

      if (fetchError) throw fetchError;

      // SETTLEMENT HARD LOCK CHECK
      if (segment?.locked_at || segment?.settlement_id) {
        throw new Error('SETTLEMENT_LOCKED: Segment đã được quyết toán, không thể xóa.');
      }

      const { error } = await supabase
        .from('host_supply_segments')
        .delete()
        .eq('id', segmentId);

      if (error) throw error;
      return { segment, unifiedBookingId };
    },
    onSuccess: ({ segment, unifiedBookingId }) => {
      toast.success('Đã xóa segment');

      // Fire-and-forget: Sync host_payables (non-blocking)
      syncHostPayables(unifiedBookingId).catch(e => console.error('Error syncing payables:', e));

      // High priority invalidations - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['host-supply-segments', unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ['booking_detail', unifiedBookingId] });
      }, 100);

      // Low priority invalidations - delayed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['enhanced-host-payables'] });
        queryClient.invalidateQueries({ queryKey: ['host_payables'] });
      }, 500);

      // Audit log - fire-and-forget
      createAuditLog({ action: 'DELETE', entity: 'host_supply_segments', entityId: segment.id, beforeData: segment, afterData: null }).catch(console.error);
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

export function useCreateExtraCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      unifiedBookingId,
      data
    }: {
      unifiedBookingId: string;
      data: ExtraChargeFormData
    }) => {
      const { data: user } = await supabase.auth.getUser();

      // Detect post-settlement: check if the segment is already settled
      let isPostSettlement = false;
      let referenceSettlementId: string | null = null;
      if (data.segment_id) {
        const { data: segment } = await supabase
          .from('host_supply_segments')
          .select('settlement_id')
          .eq('id', data.segment_id)
          .maybeSingle();
        if (segment?.settlement_id) {
          isPostSettlement = true;
          referenceSettlementId = segment.settlement_id;
        }
      }

      // Build note with POST_SETTLEMENT tag if applicable
      const notePrefix = isPostSettlement && referenceSettlementId
        ? `[POST_SETTLEMENT::${referenceSettlementId}] `
        : '';
      const finalNote = `${notePrefix}${data.note || ''}`.trim() || null;

      const { data: charge, error } = await supabase
        .from('host_extra_charges')
        .insert({
          unified_booking_id: unifiedBookingId,
          partner_id: data.partner_id,
          segment_id: data.segment_id || null,
          charge_type: data.charge_type,
          amount: data.amount,
          note: finalNote,
          created_by: user.user?.id,
          // settlement_id is ALWAYS NULL — charge flows to next settlement
        })
        .select()
        .single();

      if (error) throw error;
      return { charge, isPostSettlement, referenceSettlementId };
    },
    onSuccess: ({ charge, isPostSettlement, referenceSettlementId }, { unifiedBookingId }) => {
      toast.success(isPostSettlement ? 'Đã thêm phụ phí sau quyết toán' : 'Đã thêm phụ phí');

      // Fire-and-forget: Sync host_payables (non-blocking)
      syncHostPayables(unifiedBookingId).catch(e => console.error('Error syncing payables:', e));

      // High priority invalidations - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['host-extra-charges', unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ['booking_detail', unifiedBookingId] });
      }, 100);

      // Low priority invalidations - delayed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['enhanced-host-payables'] });
        queryClient.invalidateQueries({ queryKey: ['host_payables'] });
      }, 500);

      // Audit log - use specific action for post-settlement
      createAuditLog({
        action: isPostSettlement ? 'POST_SETTLEMENT_CHARGE_CREATED' : 'CREATE',
        entity: 'host_extra_charges',
        entityId: charge.id,
        beforeData: null,
        afterData: {
          ...charge,
          ...(isPostSettlement && { reference_settlement_id: referenceSettlementId }),
        },
      }).catch(console.error);
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

// NEW: Update an extra charge
export function useUpdateExtraCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chargeId,
      unifiedBookingId,
      data
    }: {
      chargeId: string;
      unifiedBookingId: string;
      data: Partial<ExtraChargeFormData>;
    }) => {
      const { data: oldCharge } = await supabase
        .from('host_extra_charges')
        .select('*')
        .eq('id', chargeId)
        .single();

      // Check if locked by settlement
      if (oldCharge?.locked_at || oldCharge?.settlement_id) {
        throw new Error('SETTLEMENT_LOCKED: Phụ phí đã được quyết toán, không thể sửa.');
      }

      const { data: charge, error } = await supabase
        .from('host_extra_charges')
        .update({
          partner_id: data.partner_id,
          segment_id: data.segment_id || null,
          charge_type: data.charge_type,
          amount: data.amount,
          note: data.note || null,
        })
        .eq('id', chargeId)
        .select()
        .single();

      if (error) throw error;
      return { oldCharge, charge, unifiedBookingId };
    },
    onSuccess: ({ oldCharge, charge, unifiedBookingId }) => {
      toast.success('Đã cập nhật phụ phí');

      // Fire-and-forget: Sync host_payables (non-blocking)
      syncHostPayables(unifiedBookingId).catch(e => console.error('Error syncing payables:', e));

      // High priority invalidations - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['host-extra-charges', unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ['booking_detail', unifiedBookingId] });
      }, 100);

      // Low priority invalidations - delayed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['enhanced-host-payables'] });
        queryClient.invalidateQueries({ queryKey: ['host_payables'] });
      }, 500);

      // Audit log - fire-and-forget
      createAuditLog({ action: 'UPDATE', entity: 'host_extra_charges', entityId: charge.id, beforeData: oldCharge, afterData: charge }).catch(console.error);
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

export function useDeleteExtraCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chargeId,
      unifiedBookingId
    }: {
      chargeId: string;
      unifiedBookingId: string;
    }) => {
      const { data: charge } = await supabase
        .from('host_extra_charges')
        .select('*')
        .eq('id', chargeId)
        .single();

      // SETTLEMENT LOCK CHECK — prevent deleting settled charges
      if (charge?.locked_at || charge?.settlement_id) {
        throw new Error('SETTLEMENT_LOCKED: Không thể xóa: khoản phụ phí đã được khóa/quyết toán.');
      }

      const { error } = await supabase
        .from('host_extra_charges')
        .delete()
        .eq('id', chargeId);

      if (error) throw error;
      return { charge, unifiedBookingId };
    },
    onSuccess: ({ charge, unifiedBookingId }) => {
      toast.success('Đã xóa phụ phí');

      // Fire-and-forget: Sync host_payables (non-blocking)
      syncHostPayables(unifiedBookingId).catch(e => console.error('Error syncing payables:', e));

      // High priority invalidations - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['host-extra-charges', unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ['booking_detail', unifiedBookingId] });
      }, 100);

      // Low priority invalidations - delayed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['enhanced-host-payables'] });
        queryClient.invalidateQueries({ queryKey: ['host_payables'] });
      }, 500);

      // Audit log - fire-and-forget
      createAuditLog({ action: 'DELETE', entity: 'host_extra_charges', entityId: charge.id, beforeData: charge, afterData: null }).catch(console.error);
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

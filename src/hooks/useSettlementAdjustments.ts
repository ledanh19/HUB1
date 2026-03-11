import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createAuditLog } from './useAuditLog';

/**
 * ADJUSTMENT RECORDS SYSTEM
 * Per user spec: After Settlement = HARD LOCK
 * Only allow Adjustment Records for post-settlement changes
 * Never modify original records
 */

export interface SettlementAdjustment {
  id: string;
  settlement_id: string;
  unified_booking_id: string;
  partner_id: string;
  adjustment_type: 'SEGMENT_CHANGE' | 'EXTRA_CHARGE' | 'SURCHARGE' | 'CORRECTION' | 'OTHER';
  delta_amount: number;
  original_amount: number | null;
  new_amount: number | null;
  reason: string;
  created_at: string;
  created_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  // Joined data
  partner?: {
    partner_name: string;
  };
  settlement?: {
    settlement_code: string;
  };
}

export interface CreateAdjustmentParams {
  settlementId: string;
  unifiedBookingId: string;
  partnerId: string;
  adjustmentType: SettlementAdjustment['adjustment_type'];
  deltaAmount: number;
  originalAmount?: number;
  newAmount?: number;
  reason: string;
}

export function useSettlementAdjustments(settlementId?: string) {
  return useQuery({
    queryKey: ['settlement-adjustments', settlementId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('host_settlement_adjustments')
        .select(`
          *,
          partner:partners(partner_name),
          settlement:host_settlements(settlement_code)
        `)
        .order('created_at', { ascending: false });

      if (settlementId) {
        query = query.eq('settlement_id', settlementId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SettlementAdjustment[];
    },
    enabled: !!settlementId,
  });
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateAdjustmentParams) => {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('host_settlement_adjustments')
        .insert({
          settlement_id: params.settlementId,
          unified_booking_id: params.unifiedBookingId,
          partner_id: params.partnerId,
          adjustment_type: params.adjustmentType,
          delta_amount: params.deltaAmount,
          original_amount: params.originalAmount || null,
          new_amount: params.newAmount || null,
          reason: params.reason,
          created_by: user.user?.id,
          status: 'PENDING',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlement-adjustments'] });
      createAuditLog({
        action: 'CREATE',
        entity: 'host_settlement_adjustments',
        entityId: data.id,
        afterData: data,
      });
      toast.success('Đã tạo bản ghi điều chỉnh');
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

export function useApproveAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      adjustmentId, 
      approved 
    }: { 
      adjustmentId: string; 
      approved: boolean;
    }) => {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('host_settlement_adjustments')
        .update({
          status: approved ? 'APPROVED' : 'REJECTED',
          approved_at: new Date().toISOString(),
          approved_by: user.user?.id,
        })
        .eq('id', adjustmentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlement-adjustments'] });
      createAuditLog({
        action: 'UPDATE',
        entity: 'host_settlement_adjustments',
        entityId: data.id,
        afterData: { status: data.status },
      });
      toast.success(data.status === 'APPROVED' ? 'Đã duyệt điều chỉnh' : 'Đã từ chối điều chỉnh');
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message);
    },
  });
}

// Helper to check if a segment is locked
export async function isSegmentLocked(segmentId: string): Promise<boolean> {
  const { data } = await supabase
    .from('host_supply_segments')
    .select('locked_at, settlement_id')
    .eq('id', segmentId)
    .single();

  return !!(data?.locked_at || data?.settlement_id);
}

// Helper to check if booking's segments are locked
export async function areBookingSegmentsLocked(unifiedBookingId: string, partnerId?: string): Promise<boolean> {
  let query = supabase
    .from('host_supply_segments')
    .select('locked_at, settlement_id')
    .eq('unified_booking_id', unifiedBookingId);

  if (partnerId) {
    query = query.eq('partner_id', partnerId);
  }

  const { data } = await query;

  // If any segment is locked, return true
  return data?.some(s => s.locked_at || s.settlement_id) || false;
}

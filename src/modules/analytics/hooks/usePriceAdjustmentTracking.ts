/**
 * usePriceAdjustmentTracking Hook
 * 
 * Manages price adjustment logging and retrieval for closed-loop feedback.
 * 
 * KEY FEATURES:
 * 1. Log adjustments when user clicks "Đã điều chỉnh"
 * 2. Fetch latest adjustment for each property/room/period
 * 3. Calculate "days since adjustment" for "Needs Review" filter
 * 4. Get adjustment history for tooltip display
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

export interface PriceAdjustment {
  id: string;
  property_id: string;
  property_name: string;
  room_type: string;
  period_key: string;
  day_type: string;
  adjusted_at: string;
  adjustment_percent: number;
  adjustment_type: string;
  pre_margin_percent: number | null;
  pre_velocity_ratio: number | null;
  pre_volume_score: number | null;
  pre_ota_adr: number | null;
  pre_host_adr: number | null;
  notes: string | null;
  days_since_adjustment?: number;
}

export interface LogAdjustmentParams {
  propertyId: string;
  propertyName: string;
  roomType: string;
  periodKey: string;
  dayType?: string;
  adjustmentPercent: number;
  adjustmentType?: 'MANUAL' | 'AUTO' | 'BULK';
  preMarginPercent?: number | null;
  preVelocityRatio?: number | null;
  preVolumeScore?: number | null;
  preOtaAdr?: number | null;
  preHostAdr?: number | null;
  notes?: string;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

/**
 * Fetch latest adjustment for each property/room/period
 * NOTE: Requires migration 20260129_price_adjustment_tracking.sql to be applied
 */
async function fetchLatestAdjustments(): Promise<Map<string, PriceAdjustment>> {
  // Cast to any to bypass Supabase type checking (view not in generated types yet)
  const { data, error } = await (supabase as any)
    .from('latest_price_adjustments')
    .select('*');
  
  if (error) {
    console.error('[fetchLatestAdjustments] Error:', error);
    // Return empty map if table doesn't exist yet
    return new Map();
  }
  
  const map = new Map<string, PriceAdjustment>();
  (data as PriceAdjustment[] | null)?.forEach(adj => {
    // Key format matches forecast groupKey
    const key = `${adj.property_id}|||${adj.room_type}|||${adj.period_key}`;
    map.set(key, adj);
  });
  
  return map;
}

/**
 * Fetch adjustment history for specific property/room/period
 * NOTE: Requires migration 20260129_price_adjustment_tracking.sql to be applied
 */
async function fetchAdjustmentHistory(
  propertyId: string,
  roomType: string,
  periodKey: string
): Promise<PriceAdjustment[]> {
  // Cast to any to bypass Supabase type checking (RPC not in generated types yet)
  const { data, error } = await (supabase as any).rpc('get_adjustment_history', {
    p_property_id: propertyId,
    p_room_type: roomType,
    p_period_key: periodKey,
  });
  
  if (error) {
    console.error('[fetchAdjustmentHistory] Error:', error);
    return [];
  }
  
  return (data as PriceAdjustment[]) || [];
}

/**
 * Log a new price adjustment
 * NOTE: Requires migration 20260129_price_adjustment_tracking.sql to be applied
 */
async function logAdjustment(params: LogAdjustmentParams): Promise<string> {
  // Cast to any to bypass Supabase type checking (RPC not in generated types yet)
  const { data, error } = await (supabase as any).rpc('log_price_adjustment', {
    p_property_id: params.propertyId,
    p_property_name: params.propertyName,
    p_room_type: params.roomType,
    p_period_key: params.periodKey,
    p_day_type: params.dayType || 'ALL',
    p_adjustment_percent: params.adjustmentPercent,
    p_adjustment_type: params.adjustmentType || 'MANUAL',
    p_pre_margin_percent: params.preMarginPercent,
    p_pre_velocity_ratio: params.preVelocityRatio,
    p_pre_volume_score: params.preVolumeScore,
    p_pre_ota_adr: params.preOtaAdr,
    p_pre_host_adr: params.preHostAdr,
    p_notes: params.notes,
  });
  
  if (error) {
    console.error('[logAdjustment] Error:', error);
    throw error;
  }
  
  return data as string;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to get all latest adjustments
 */
export function useLatestAdjustments() {
  return useQuery({
    queryKey: ['price-adjustments', 'latest'],
    queryFn: fetchLatestAdjustments,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get adjustment history for specific row
 */
export function useAdjustmentHistory(
  propertyId: string | null,
  roomType: string | null,
  periodKey: string | null
) {
  return useQuery({
    queryKey: ['price-adjustments', 'history', propertyId, roomType, periodKey],
    queryFn: () => fetchAdjustmentHistory(propertyId!, roomType!, periodKey!),
    enabled: !!(propertyId && roomType && periodKey),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to log new adjustment
 */
export function useLogAdjustment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: logAdjustment,
    onSuccess: () => {
      // Invalidate latest adjustments cache
      queryClient.invalidateQueries({ queryKey: ['price-adjustments', 'latest'] });
      toast.success('Đã ghi nhận điều chỉnh giá');
    },
    onError: (error) => {
      console.error('[useLogAdjustment] Error:', error);
      toast.error('Không thể ghi nhận điều chỉnh');
    },
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a row needs review (not adjusted in >14 days)
 */
export function needsReview(lastAdjustment: PriceAdjustment | undefined): boolean {
  if (!lastAdjustment) return true; // Never adjusted
  return (lastAdjustment.days_since_adjustment ?? 999) > 14;
}

/**
 * Get review urgency level
 */
export function getReviewUrgency(lastAdjustment: PriceAdjustment | undefined): 'new' | 'due' | 'overdue' | 'ok' {
  if (!lastAdjustment) return 'new';
  const days = lastAdjustment.days_since_adjustment ?? 999;
  if (days > 21) return 'overdue';
  if (days > 14) return 'due';
  return 'ok';
}

/**
 * Format adjustment for display
 */
export function formatAdjustment(percent: number): string {
  if (percent === 0) return 'Giữ nguyên';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

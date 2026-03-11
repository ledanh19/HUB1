import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CalendarDay } from './useAIPricingInsights';

// Types for Shadow Signal Logging
export interface ShadowSignalInput {
  propertyId: string;
  roomTypeId?: string;
  calendarDay: CalendarDay;
  currentRate?: number;
  velocityMetrics?: {
    velocity24h: number;
    velocity7d: number;
    baselinePace: number;
    leadTimeMedian: number;
  };
  dataFreshnessMinutes?: number;
  explanationText?: string;
}

interface ShadowSignal {
  id: string;
  property_id: string;
  room_type_id: string | null;
  stay_date: string;
  signal_class: string;
  advisory_direction: string;
  data_confidence: number;
  remaining_inventory: number;
  total_inventory: number;
  current_rate: number | null;
  days_to_checkin: number;
  signal_timestamp: string;
}

// Map CalendarDay signals to database format
function mapSignalClass(day: CalendarDay): string {
  if (day.warning === 'sellout_risk') return 'SELL_OUT_RISK';
  if (day.warning === 'vacancy_risk') return 'VACANCY_RISK';
  // Use dataConfidence (0-1 scale) for comparison
  if (day.dataConfidence < 0.3) return 'DATA_INSUFFICIENT';
  return 'HOLD';
}

function mapAdvisoryDirection(pricingSignal: string): string {
  switch (pricingSignal) {
    case 'increase':
      return 'INCREASE_CANDIDATE';
    case 'decrease':
      return 'DECREASE_CANDIDATE';
    case 'inactive':
      return 'INACTIVE';
    default:
      return 'HOLD';
  }
}

// Use baselineReliability from CalendarDay directly
function mapBaselineReliability(day: CalendarDay): string {
  return day.baselineReliability || 'MEDIUM';
}

export function useAIPricingShadowLog() {
  const queryClient = useQueryClient();

  // Log a single signal
  const logSignalMutation = useMutation({
    mutationFn: async (input: ShadowSignalInput) => {
      const { calendarDay, propertyId, roomTypeId, currentRate, velocityMetrics, dataFreshnessMinutes, explanationText } = input;
      
      // Use new property names with backward-compatible fallback
      const remainingInventory = calendarDay.remainingInventory ?? calendarDay.inventory;
      const totalInventory = calendarDay.totalInventory ?? calendarDay.maxInventory;
      
      const signalData = {
        property_id: propertyId,
        room_type_id: roomTypeId || null,
        stay_date: calendarDay.dateStr,
        signal_class: mapSignalClass(calendarDay),
        advisory_direction: mapAdvisoryDirection(calendarDay.pricingSignal),
        data_confidence: calendarDay.dataConfidence ?? (calendarDay.confidence / 100), // Use dataConfidence (0-1)
        remaining_inventory: remainingInventory,
        total_inventory: totalInventory,
        current_rate: currentRate || calendarDay.currentRate || null,
        days_to_checkin: calendarDay.leadTime,
        booking_velocity_24h: velocityMetrics?.velocity24h ?? calendarDay.velocity24h ?? null,
        booking_velocity_7d: velocityMetrics?.velocity7d ?? calendarDay.velocity7d ?? null,
        baseline_pace: velocityMetrics?.baselinePace ?? calendarDay.baselineOccupancy ?? null,
        lead_time_median: velocityMetrics?.leadTimeMedian ?? calendarDay.leadTime ?? null,
        data_freshness_minutes: dataFreshnessMinutes ?? calendarDay.dataFreshnessMinutes ?? null,
        has_data_lag: calendarDay.flags?.DATA_LAG ?? calendarDay.warning === 'data_lag',
        has_inventory_anomaly: calendarDay.flags?.INVENTORY_BOOKING_MISMATCH ?? calendarDay.warning === 'inventory_anomaly',
        baseline_reliability: mapBaselineReliability(calendarDay),
        explanation_text: explanationText || null,
        confidence_factors: calendarDay.confidenceReasons || calendarDay.confidenceFactors || null,
      };

      const { data, error } = await supabase
        .from('ai_pricing_shadow_signals')
        .insert(signalData)
        .select()
        .single();

      if (error) throw error;
      return data as ShadowSignal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-pricing-shadow-signals'] });
    },
  });

  // Log multiple signals (batch)
  const logBatchSignalsMutation = useMutation({
    mutationFn: async (inputs: ShadowSignalInput[]) => {
      const signalsData = inputs.map(input => {
        const { calendarDay, propertyId, roomTypeId, currentRate, velocityMetrics, dataFreshnessMinutes } = input;
        
        // Use new property names with backward-compatible fallback
        const remainingInventory = calendarDay.remainingInventory ?? calendarDay.inventory;
        const totalInventory = calendarDay.totalInventory ?? calendarDay.maxInventory;
        
        return {
          property_id: propertyId,
          room_type_id: roomTypeId || null,
          stay_date: calendarDay.dateStr,
          signal_class: mapSignalClass(calendarDay),
          advisory_direction: mapAdvisoryDirection(calendarDay.pricingSignal),
          data_confidence: calendarDay.dataConfidence ?? (calendarDay.confidence / 100),
          remaining_inventory: remainingInventory,
          total_inventory: totalInventory,
          current_rate: currentRate || calendarDay.currentRate || null,
          days_to_checkin: calendarDay.leadTime,
          booking_velocity_24h: velocityMetrics?.velocity24h ?? calendarDay.velocity24h ?? null,
          booking_velocity_7d: velocityMetrics?.velocity7d ?? calendarDay.velocity7d ?? null,
          baseline_pace: velocityMetrics?.baselinePace ?? calendarDay.baselineOccupancy ?? null,
          lead_time_median: velocityMetrics?.leadTimeMedian ?? calendarDay.leadTime ?? null,
          data_freshness_minutes: dataFreshnessMinutes ?? calendarDay.dataFreshnessMinutes ?? null,
          has_data_lag: calendarDay.flags?.DATA_LAG ?? calendarDay.warning === 'data_lag',
          has_inventory_anomaly: calendarDay.flags?.INVENTORY_BOOKING_MISMATCH ?? calendarDay.warning === 'inventory_anomaly',
          baseline_reliability: mapBaselineReliability(calendarDay),
          confidence_factors: calendarDay.confidenceReasons || calendarDay.confidenceFactors || null,
        };
      });

      const { data, error } = await supabase
        .from('ai_pricing_shadow_signals')
        .insert(signalsData)
        .select();

      if (error) throw error;
      return data as ShadowSignal[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-pricing-shadow-signals'] });
    },
  });

  // Check if signal already logged for this property/date today
  const checkExistingSignal = async (propertyId: string, stayDate: string): Promise<boolean> => {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('ai_pricing_shadow_signals')
      .select('id')
      .eq('property_id', propertyId)
      .eq('stay_date', stayDate)
      .gte('signal_timestamp', `${today}T00:00:00`)
      .limit(1);

    if (error) throw error;
    return (data?.length || 0) > 0;
  };

  return {
    logSignal: logSignalMutation.mutate,
    logSignalAsync: logSignalMutation.mutateAsync,
    logBatchSignals: logBatchSignalsMutation.mutate,
    logBatchSignalsAsync: logBatchSignalsMutation.mutateAsync,
    checkExistingSignal,
    isLogging: logSignalMutation.isPending || logBatchSignalsMutation.isPending,
  };
}

// Hook to fetch shadow signals for validation
export function useAIPricingShadowSignals(propertyId?: string, dateRange?: { start: string; end: string }) {
  const queryKey = ['ai-pricing-shadow-signals', propertyId, dateRange?.start, dateRange?.end];

  return {
    queryKey,
    fetchSignals: async () => {
      let query = supabase
        .from('ai_pricing_shadow_signals')
        .select(`
          *,
          ai_pricing_validation_outcomes (*)
        `)
        .order('stay_date', { ascending: true });

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      if (dateRange?.start) {
        query = query.gte('stay_date', dateRange.start);
      }

      if (dateRange?.end) {
        query = query.lte('stay_date', dateRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  };
}

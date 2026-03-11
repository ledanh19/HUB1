import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { format, eachDayOfInterval, addDays, startOfWeek } from "date-fns";
import { useEffect, useCallback, useState } from "react";
import type { Json } from "@/integrations/supabase/types";
import { generateIdempotencyKey, hashPayload } from "@/lib/dateHelpers";

// Helper function to generate week dates
export function getWeekDates(startDate: Date, days = 7): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
}

// ============ TYPES ============

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export type SourceLayer = 'BASE' | 'OVERRIDE' | 'RULE' | 'SYNC';
export type CellState = 'DRAFT' | 'SAVED' | 'SYNCING' | 'FAILED';

export interface InventoryCell {
  id: string;
  property_id: string;
  room_type_id: string;
  rate_plan_id: string | null;
  channel_id: string | null;
  cell_date: string;
  availability: number;
  rate: number | null;
  stop_sell: boolean;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  min_stay_arrival: number | null;
  min_stay_through: number | null;
  max_stay: number | null;
  max_availability: number | null;
  availability_offset: number | null;
  source: string;
  source_layer: SourceLayer;
  sync_status: SyncStatus;
  cell_state: CellState;
  sync_error: string | null;
  version: number;
  updated_at: string;
  updated_by: string | null;
  editing_by: string | null;
  editing_expires_at: string | null;
  // New fields per ABSOLUTE SPEC
  applied_rule_id: string | null;
  applied_override_id: string | null;
  batch_id: string | null;
  timezone: string;
}

export interface RatePlan {
  id: string;
  provider_property_id: string;
  provider_room_type_id: string;
  provider_rate_plan_id: string;
  rate_plan_name: string;
  rate_plan_code: string | null;
  base_rate: number | null;
  currency: string;
  sell_mode: string | null;
  channels: string[];
}

export interface Channel {
  id: string;
  name: string;
  logo_url: string | null;
  color: string | null;
  is_active: boolean;
}

export interface RoomType {
  id: string;
  room_type_name: string;
  provider_room_type_id: string;
  provider_property_id: string;
}

export interface AvailabilityRule {
  id: string;
  property_id: string;
  title: string;
  rule_type: string;
  start_date: string | null;
  end_date: string | null;
  days_of_week: number[];
  channels: string[];
  room_type_ids: string[];
  rate_plan_ids: string[];
  rule_value: Json | null;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// Draft change for local editing
export interface DraftChange {
  cellKey: string; // `${room_type_id}|${rate_plan_id}|${channel_id}|${date}`
  room_type_id: string;
  rate_plan_id: string | null;
  channel_id: string | null;
  cell_date: string;
  changes: Partial<InventoryCell>;
  originalVersion?: number;
}

// Bulk update result
export interface BulkUpdateResult {
  updated_cells: InventoryCell[];
  failed_cells: Array<{
    cellKey: string;
    reason: string;
    current_version?: number;
  }>;
}

export type InventoryViewMode = 
  | 'all_restrictions'
  | 'only_availability'
  | 'rate_and_availability'
  | 'availability_offset'
  | 'availability_per_rate'
  | 'cta'
  | 'ctd'
  | 'max_availability'
  | 'max_stay'
  | 'min_stay_arrival'
  | 'min_stay_through'
  | 'rate'
  | 'stop_sell';

export const VIEW_MODE_LABELS: Record<InventoryViewMode, string> = {
  all_restrictions: 'All Restrictions',
  only_availability: 'Only Availability',
  rate_and_availability: 'Rate And Availability',
  availability_offset: 'Availability Offset',
  availability_per_rate: 'Availability Per Rate',
  cta: 'Closed To Arrival (CTA)',
  ctd: 'Closed To Departure (CTD)',
  max_availability: 'Max Availability',
  max_stay: 'Max Stay',
  min_stay_arrival: 'Min Stay Arrival',
  min_stay_through: 'Min Stay Through',
  rate: 'Rate',
  stop_sell: 'Stop Sell',
};

export const SOURCE_LAYER_LABELS: Record<SourceLayer, string> = {
  BASE: 'Base Default',
  OVERRIDE: 'Manual Override',
  RULE: 'Availability Rule',
  SYNC: 'Channel Sync',
};

// ============ HOOKS ============

// Fetch channels
export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Channel[];
    },
  });
}

// Fetch room types from mirror
export function useRoomTypes(propertyId?: string) {
  return useQuery({
    queryKey: ['room_types', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('room_types_mirror')
        .select('*')
        .order('room_type_name');
      
      if (propertyId) {
        query = query.eq('provider_property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as RoomType[];
    },
  });
}

// Fetch rate plans from mirror
// Show ALL rate plans as Channex returns them — each rate plan (including
// per-channel variants) appears as its own row in the inventory grid,
// matching Channex's Inventory UI exactly.
export function useRatePlans(propertyId?: string) {
  return useQuery({
    queryKey: ['rate_plans_mirror', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('rate_plans_mirror')
        .select('*')
        .order('rate_plan_name');
      
      if (propertyId) {
        query = query.eq('provider_property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map(rp => ({
        id: rp.id,
        provider_property_id: rp.provider_property_id,
        provider_room_type_id: rp.provider_room_type_id,
        provider_rate_plan_id: rp.provider_rate_plan_id,
        rate_plan_name: rp.rate_plan_name,
        rate_plan_code: rp.rate_plan_code,
        base_rate: rp.base_rate,
        currency: rp.currency,
        sell_mode: rp.sell_mode,
        channels: rp.channels || [],
      })) as RatePlan[];
    },
  });
}

// Fetch inventory cells for a date range with realtime subscription
export function useInventoryCells(
  propertyId: string | undefined,
  startDate: Date,
  endDate: Date,
  roomTypeIds?: string[],
  channelIds?: string[]
) {
  const queryClient = useQueryClient();
  const queryKey = ['inventory_cells', propertyId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'), roomTypeIds, channelIds];

  // Subscribe to realtime updates
  useEffect(() => {
    if (!propertyId) return;

    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_cells',
          filter: `property_id=eq.${propertyId}`,
        },
        (payload) => {
          // Invalidate and refetch on any change
          queryClient.invalidateQueries({ queryKey: ['inventory_cells', propertyId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, queryClient]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!propertyId) return [];
      
      let query = supabase
        .from('inventory_cells')
        .select('*')
        .eq('property_id', propertyId)
        .gte('cell_date', format(startDate, 'yyyy-MM-dd'))
        .lte('cell_date', format(endDate, 'yyyy-MM-dd'));
      
      if (roomTypeIds && roomTypeIds.length > 0) {
        query = query.in('room_type_id', roomTypeIds);
      }
      
      if (channelIds && channelIds.length > 0) {
        query = query.in('channel_id', channelIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as InventoryCell[];
    },
    enabled: !!propertyId,
  });
}

// Draft mode state management hook
export function useInventoryDraft() {
  const [drafts, setDrafts] = useState<Map<string, DraftChange>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  const generateCellKey = useCallback((
    roomTypeId: string,
    ratePlanId: string | null,
    channelId: string | null,
    date: string
  ) => {
    return `${roomTypeId}|${ratePlanId || 'null'}|${channelId || 'null'}|${date}`;
  }, []);

  const addDraft = useCallback((
    roomTypeId: string,
    ratePlanId: string | null,
    channelId: string | null,
    cellDate: string,
    changes: Partial<InventoryCell>,
    originalVersion?: number
  ) => {
    const key = generateCellKey(roomTypeId, ratePlanId, channelId, cellDate);
    setDrafts(prev => {
      const newDrafts = new Map(prev);
      const existing = newDrafts.get(key);
      newDrafts.set(key, {
        cellKey: key,
        room_type_id: roomTypeId,
        rate_plan_id: ratePlanId,
        channel_id: channelId,
        cell_date: cellDate,
        changes: existing ? { ...existing.changes, ...changes } : changes,
        originalVersion: existing?.originalVersion ?? originalVersion,
      });
      return newDrafts;
    });
  }, [generateCellKey]);

  const removeDraft = useCallback((key: string) => {
    setDrafts(prev => {
      const newDrafts = new Map(prev);
      newDrafts.delete(key);
      return newDrafts;
    });
  }, []);

  const clearDrafts = useCallback(() => {
    setDrafts(new Map());
  }, []);

  const hasDrafts = drafts.size > 0;

  const getDraftChanges = useCallback((key: string) => {
    return drafts.get(key)?.changes;
  }, [drafts]);

  return {
    drafts,
    isSaving,
    setIsSaving,
    addDraft,
    removeDraft,
    clearDrafts,
    hasDrafts,
    getDraftChanges,
    generateCellKey,
    draftCount: drafts.size,
  };
}

// Bulk update with optimistic locking and lenient mode
export function useBulkUpdateInventory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      propertyId,
      drafts,
      idempotencyKey,
      userId,
    }: {
      propertyId: string;
      drafts: DraftChange[];
      idempotencyKey: string;
      userId?: string;
    }): Promise<BulkUpdateResult> => {
      const updatedCells: InventoryCell[] = [];
      const failedCells: BulkUpdateResult['failed_cells'] = [];
      const beforeSnapshots: Record<string, Record<string, unknown>> = {};
      let rateChanges = 0;
      let avlChanges = 0;
      let restrictionChanges = 0;
      
      // Process each draft
      for (const draft of drafts) {
        try {
          // Check if cell exists
          const { data: existing } = await supabase
            .from('inventory_cells')
            .select('*')
            .eq('property_id', propertyId)
            .eq('room_type_id', draft.room_type_id)
            .eq('rate_plan_id', draft.rate_plan_id)
            .eq('channel_id', draft.channel_id)
            .eq('cell_date', draft.cell_date)
            .maybeSingle();

          if (existing) {
            // Capture before-state for audit trail
            beforeSnapshots[draft.cellKey] = {
              rate: existing.rate,
              availability: existing.availability,
              stop_sell: existing.stop_sell,
              closed_to_arrival: existing.closed_to_arrival,
              closed_to_departure: existing.closed_to_departure,
              min_stay_arrival: existing.min_stay_arrival,
              min_stay_through: existing.min_stay_through,
              max_stay: existing.max_stay,
              version: existing.version,
            };

            // Track change categories for summary
            if (draft.changes.rate !== undefined) rateChanges++;
            if (draft.changes.availability !== undefined) avlChanges++;
            if (draft.changes.stop_sell !== undefined || draft.changes.closed_to_arrival !== undefined ||
                draft.changes.closed_to_departure !== undefined || draft.changes.min_stay_arrival !== undefined ||
                draft.changes.min_stay_through !== undefined || draft.changes.max_stay !== undefined) {
              restrictionChanges++;
            }

            // Check version for conflict (lenient mode - report but continue)
            if (draft.originalVersion !== undefined && existing.version !== draft.originalVersion) {
              failedCells.push({
                cellKey: draft.cellKey,
                reason: `Version conflict: expected ${draft.originalVersion}, found ${existing.version}`,
                current_version: existing.version,
              });
              continue;
            }

            // Update existing cell
            const { data: updated, error } = await supabase
              .from('inventory_cells')
              .update({
                ...draft.changes,
                source: 'manual',
                source_layer: 'OVERRIDE' as SourceLayer,
                sync_status: 'PENDING' as SyncStatus,
                version: existing.version + 1,
                updated_at: new Date().toISOString(),
                updated_by: userId ?? null,
                idempotency_key: idempotencyKey,
              })
              .eq('id', existing.id)
              .select()
              .single();

            if (error) {
              failedCells.push({ cellKey: draft.cellKey, reason: error.message });
            } else if (updated) {
              updatedCells.push(updated as InventoryCell);
            }
          } else {
            // Insert new cell
            const { data: inserted, error } = await supabase
              .from('inventory_cells')
              .insert({
                property_id: propertyId,
                room_type_id: draft.room_type_id,
                rate_plan_id: draft.rate_plan_id,
                channel_id: draft.channel_id,
                cell_date: draft.cell_date,
                availability: 0,
                stop_sell: false,
                closed_to_arrival: false,
                closed_to_departure: false,
                ...draft.changes,
                source: 'manual',
                source_layer: 'OVERRIDE' as SourceLayer,
                sync_status: 'PENDING' as SyncStatus,
                version: 1,
                idempotency_key: idempotencyKey,
              })
              .select()
              .single();

            if (error) {
              failedCells.push({ cellKey: draft.cellKey, reason: error.message });
            } else if (inserted) {
              updatedCells.push(inserted as InventoryCell);
            }
          }
        } catch (err) {
          failedCells.push({
            cellKey: draft.cellKey,
            reason: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      // Create sync job for updated cells
      if (updatedCells.length > 0) {
        await safeMutation(() => supabase.from('inventory_sync_jobs').insert({
          property_id: propertyId,
          cell_ids: updatedCells.map(c => c.id),
          status: 'PENDING',
          idempotency_key: idempotencyKey,
        }));

        // Log the bulk update with before/after audit trail
        await safeMutation(() => supabase.from('inventory_logs').insert({
          property_id: propertyId,
          action: 'bulk_update',
          before_data: beforeSnapshots as unknown as Json,
          after_data: {
            updated_count: updatedCells.length,
            failed_count: failedCells.length,
            idempotency_key: idempotencyKey,
            change_summary: {
              rate_changes: rateChanges,
              avl_changes: avlChanges,
              restriction_changes: restrictionChanges,
              skipped_cells: failedCells.length,
            },
          },
          batch_id: idempotencyKey,
          changed_by: userId ?? null,
        }));
      }

      return { updated_cells: updatedCells, failed_cells: failedCells };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cells'] });
      
      if (result.failed_cells.length > 0) {
        toast.warning(`Saved ${result.updated_cells.length} cells`, {
          description: `${result.failed_cells.length} cells had conflicts`,
        });
      } else {
        toast.success(`Saved ${result.updated_cells.length} cells`, {
          description: 'Syncing to channels...',
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Bulk update failed', { description: error.message });
    },
  });
}

// Legacy bulk update for dialogs
export function useLegacyBulkUpdateInventory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      propertyId,
      dateRanges,
      daysOfWeek,
      roomTypeIds,
      ratePlanIds,
      channelIds,
      updates,
    }: {
      propertyId: string;
      dateRanges: { start: Date; end: Date }[];
      daysOfWeek: number[];
      roomTypeIds: string[];
      ratePlanIds: string[];
      channelIds: string[];
      updates: Partial<InventoryCell>;
    }) => {
      const allDates: string[] = [];
      for (const range of dateRanges) {
        const days = eachDayOfInterval({ start: range.start, end: range.end });
        for (const day of days) {
          if (daysOfWeek.includes(day.getDay())) {
            allDates.push(format(day, 'yyyy-MM-dd'));
          }
        }
      }
      
      if (allDates.length === 0) throw new Error('No dates selected');
      
      const upserts: Array<{
        property_id: string;
        room_type_id: string;
        rate_plan_id: string | null;
        channel_id: string | null;
        cell_date: string;
        source: string;
        source_layer: string;
        sync_status: string;
        [key: string]: unknown;
      }> = [];
      const batchId = crypto.randomUUID();
      
      for (const date of allDates) {
        for (const roomTypeId of roomTypeIds) {
          for (const ratePlanId of ratePlanIds) {
            for (const channelId of channelIds) {
              upserts.push({
                property_id: propertyId,
                room_type_id: roomTypeId,
                rate_plan_id: ratePlanId || null,
                channel_id: channelId || null,
                cell_date: date,
                ...updates,
                source: 'manual',
                source_layer: 'OVERRIDE',
                sync_status: 'PENDING',
              });
            }
          }
        }
      }
      
      const { data, error } = await supabase
        .from('inventory_cells')
        .upsert(upserts as any, {
          onConflict: 'property_id,room_type_id,rate_plan_id,channel_id,cell_date',
        })
        .select();
      
      if (error) throw error;
      
      await safeMutation(() => supabase.from('inventory_logs').insert({
        property_id: propertyId,
        action: 'bulk_update',
        after_data: { updates, dates: allDates, roomTypeIds, ratePlanIds, channelIds },
        batch_id: batchId,
      }));
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cells'] });
      toast.success(`Updated ${data?.length || 0} cells`);
    },
    onError: (error: Error) => {
      toast.error('Bulk update failed', { description: error.message });
    },
  });
}

// Availability Rules
export function useAvailabilityRules(propertyId?: string) {
  return useQuery({
    queryKey: ['availability_rules', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('availability_rules')
        .select('*')
        .order('priority', { ascending: false });
      
      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as AvailabilityRule[];
    },
  });
}

export function useCreateAvailabilityRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rule: Omit<AvailabilityRule, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('availability_rules')
        .insert([rule])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability_rules'] });
      toast.success('Rule created');
    },
    onError: (error: Error) => {
      toast.error('Failed to create rule', { description: error.message });
    },
  });
}

export function useToggleAvailabilityRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('availability_rules')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability_rules'] });
      toast.success('Rule updated');
    },
  });
}

export function useDeleteAvailabilityRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('availability_rules')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability_rules'] });
      toast.success('Rule deleted');
    },
  });
}

// Apply availability rules via edge function
// PMS SOT §4.5 — evaluates active rules and generates BASE-layer cells
export function useApplyAvailabilityRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (propertyId?: string) => {
      const { data, error } = await supabase.functions.invoke('inventory-apply-rules', {
        body: propertyId ? { property_id: propertyId } : {},
      });

      if (error) throw error;
      return data as {
        success: boolean;
        duration_ms: number;
        counts: {
          rules_processed: number;
          cells_created: number;
          cells_updated: number;
          cells_skipped: number;
          errors: number;
        };
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cells'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_sync_status'] });

      if (data.counts.errors > 0) {
        toast.warning(
          `Đã áp dụng ${data.counts.rules_processed} rules, ${data.counts.errors} lỗi`
        );
      } else if (data.counts.cells_created > 0) {
        toast.success(
          `Đã áp dụng rules: ${data.counts.cells_created} cells tạo/cập nhật`
        );
      } else {
        toast.info('Không có rules nào cần áp dụng');
      }
    },
    onError: (error: Error) => {
      toast.error('Áp dụng rules thất bại', { description: error.message });
    },
  });
}

// Inventory Logs
export function useInventoryLogs(propertyId?: string, limit = 50) {
  return useQuery({
    queryKey: ['inventory_logs', propertyId, limit],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('inventory_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

// Room Order
export function useInventoryRoomOrder(propertyId?: string) {
  return useQuery({
    queryKey: ['inventory_room_order', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];
      
      const { data, error } = await supabase
        .from('inventory_room_order')
        .select('*')
        .eq('property_id', propertyId)
        .order('display_order');
      
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });
}

export function useUpdateRoomOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ propertyId, orders }: { propertyId: string; orders: { room_type_id: string; display_order: number }[] }) => {
      const upserts = orders.map(o => ({
        property_id: propertyId,
        room_type_id: o.room_type_id,
        display_order: o.display_order,
        updated_at: new Date().toISOString(),
      }));
      
      const { error } = await supabase
        .from('inventory_room_order')
        .upsert(upserts, { onConflict: 'property_id,room_type_id' });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_room_order'] });
      toast.success('Room order saved');
    },
  });
}

// Sync status helpers - using count aggregation to avoid 1000 row limit
export function useSyncStatusCounts(propertyId?: string, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ['inventory_sync_status', propertyId, startDate?.toISOString(), endDate?.toISOString()],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return { pending: 0, failed: 0, synced: 0 };
      
      // Build base query with date filters
      let baseQuery = supabase
        .from('inventory_cells')
        .select('sync_status', { count: 'exact', head: false })
        .eq('property_id', propertyId);
      
      if (startDate) {
        baseQuery = baseQuery.gte('cell_date', format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        baseQuery = baseQuery.lte('cell_date', format(endDate, 'yyyy-MM-dd'));
      }
      
      // Count each status separately to avoid fetching all rows
      const [pendingResult, failedResult, syncedResult] = await Promise.all([
        supabase
          .from('inventory_cells')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .eq('sync_status', 'PENDING')
          .gte('cell_date', startDate ? format(startDate, 'yyyy-MM-dd') : '1900-01-01')
          .lte('cell_date', endDate ? format(endDate, 'yyyy-MM-dd') : '2100-12-31'),
        
        supabase
          .from('inventory_cells')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .eq('sync_status', 'FAILED')
          .gte('cell_date', startDate ? format(startDate, 'yyyy-MM-dd') : '1900-01-01')
          .lte('cell_date', endDate ? format(endDate, 'yyyy-MM-dd') : '2100-12-31'),
        
        supabase
          .from('inventory_cells')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .eq('sync_status', 'SYNCED')
          .gte('cell_date', startDate ? format(startDate, 'yyyy-MM-dd') : '1900-01-01')
          .lte('cell_date', endDate ? format(endDate, 'yyyy-MM-dd') : '2100-12-31'),
      ]);
      
      return {
        pending: pendingResult.count || 0,
        failed: failedResult.count || 0,
        synced: syncedResult.count || 0,
      };
    },
    enabled: !!propertyId,
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

// Retry failed syncs
export function useRetryFailedSyncs() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (propertyId: string) => {
      const { data: failedCells, error: fetchError } = await supabase
        .from('inventory_cells')
        .select('id')
        .eq('property_id', propertyId)
        .eq('sync_status', 'FAILED');
      
      if (fetchError) throw fetchError;
      if (!failedCells || failedCells.length === 0) return { count: 0 };
      
      // Reset to pending
      const { error: updateError } = await supabase
        .from('inventory_cells')
        .update({ sync_status: 'PENDING', sync_error: null })
        .eq('property_id', propertyId)
        .eq('sync_status', 'FAILED');
      
      if (updateError) throw updateError;
      
      // Create new sync job
      await safeMutation(() => supabase.from('inventory_sync_jobs').insert({
        property_id: propertyId,
        cell_ids: failedCells.map(c => c.id),
        status: 'PENDING',
        idempotency_key: `retry-${Date.now()}`,
      }));
      
      return { count: failedCells.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cells'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_sync_status'] });
      toast.success(`Retrying ${result.count} failed syncs`);
    },
  });
}

// Trigger outbound push to Channex
// Calls the channex-inventory-push edge function to process PENDING sync jobs
export function useTriggerChannexPush() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (propertyId?: string) => {
      const { data, error } = await supabase.functions.invoke('channex-inventory-push', {
        body: propertyId ? { property_id: propertyId } : {},
      });

      if (error) throw error;
      return data as {
        success: boolean;
        duration_ms: number;
        results: {
          processed: number;
          succeeded: number;
          failed: number;
          cells_pushed: number;
          dead_lettered: number;
          errors: string[];
        };
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_cells'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_sync_status'] });

      if (data.results.failed > 0) {
        toast.warning(`Đồng bộ: ${data.results.cells_pushed} cells thành công, ${data.results.failed} jobs thất bại`);
      } else if (data.results.cells_pushed > 0) {
        toast.success(`Đã đẩy ${data.results.cells_pushed} cells lên kênh OTA`);
      }
      // If nothing to push, stay silent
    },
    onError: (error: Error) => {
      // Don't toast on error — push will retry automatically
      console.error('[useTriggerChannexPush]', error.message);
    },
  });
}

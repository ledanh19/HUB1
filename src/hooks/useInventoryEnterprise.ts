import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useCallback, useRef } from "react";

// ============ TYPES ============

export interface InventoryVersion {
  id: string;
  version: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventorySnapshot {
  id: string;
  sync_job_id: string | null;
  property_mapping_id: string | null;
  snapshot_time: string;
  snapshot_type: string;
  snapshot_data: Record<string, unknown>;
  created_at: string;
}

export interface InventoryEditLock {
  id: string;
  property_id: string;
  cell_key: string;
  locked_by: string;
  locked_at: string;
  expires_at: string;
  created_at: string;
}

export interface InventorySyncMetrics {
  id: string;
  property_id: string;
  metric_date: string;
  total_syncs: number;
  successful_syncs: number;
  failed_syncs: number;
  avg_sync_duration_ms: number | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  cells_updated: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryAlert {
  id: string;
  property_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, unknown>;
  is_acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

// ============ VERSION TRACKING ============

export function useInventoryVersion() {
  return useQuery({
    queryKey: ['inventory_version'],
    queryFn: async () => {
      // Use raw SQL since types are not yet regenerated
      const { data, error } = await supabase
        .from('inventory_system_version' as any)
        .select('*')
        .eq('is_active', true)
        .single();
      
      if (error) throw error;
      return data as unknown as InventoryVersion;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - version rarely changes
  });
}

// ============ SNAPSHOTS ============

// propertyId here can be either property_id or property_mapping_id
// The function queries by property_mapping_id as that's the actual column name
export function useInventorySnapshots(propertyMappingId?: string, limit = 30) {
  return useQuery({
    queryKey: ['inventory_snapshots', propertyMappingId, limit],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyMappingId) return [];
      
      // Try to find by property_mapping_id first
      const { data, error } = await supabase
        .from('inventory_snapshots' as any)
        .select('*')
        .order('snapshot_time', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      // Filter by property_mapping_id if provided (since it might match channex_property_id)
      const filtered = (data || []).filter((s: any) => 
        s.property_mapping_id === propertyMappingId || 
        !s.property_mapping_id // include snapshots without property_mapping_id
      );
      
      return filtered as unknown as InventorySnapshot[];
    },
    enabled: !!propertyMappingId,
  });
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (propertyId: string) => {
      const { data, error } = await safeRpc(() => supabase.rpc('create_inventory_snapshot' as any, {
        p_property_id: propertyId,
        p_user_id: user?.id || null,
      }));
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, propertyId) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_snapshots', propertyId] });
      toast.success('Snapshot created', { description: 'Daily inventory snapshot saved for audit.' });
    },
    onError: (error: Error) => {
      toast.error('Failed to create snapshot', { description: error.message });
    },
  });
}

export function useSnapshotDetail(snapshotId?: string) {
  return useQuery({
    queryKey: ['inventory_snapshot', snapshotId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!snapshotId) return null;
      
      const { data, error } = await supabase
        .from('inventory_snapshots' as any)
        .select('*')
        .eq('id', snapshotId)
        .single();
      
      if (error) throw error;
      return data as unknown as InventorySnapshot;
    },
    enabled: !!snapshotId,
  });
}

// ============ MULTI-USER EDIT LOCKS ============

export function useEditLocks(propertyId?: string) {
  return useQuery({
    queryKey: ['inventory_edit_locks', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];
      
      const { data, error } = await supabase
        .from('inventory_edit_locks' as any)
        .select('*')
        .eq('property_id', propertyId)
        .gt('expires_at', new Date().toISOString());
      
      if (error) throw error;
      return (data || []) as unknown as InventoryEditLock[];
    },
    enabled: !!propertyId,
    refetchInterval: 5000, // Check every 5 seconds
  });
}

export function useAcquireLock() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ propertyId, cellKey }: { propertyId: string; cellKey: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('acquire_inventory_lock', {
        p_property_id: propertyId,
        p_cell_key: cellKey,
        p_user_id: user?.id,
        p_duration_minutes: 5,
      }));
      
      if (error) throw error;
      const result = data as unknown as Array<{ success: boolean; locked_by: string; locked_at: string; message: string }>;
      return result?.[0];
    },
    onSuccess: (result, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_edit_locks', propertyId] });
      if (!result?.success) {
        toast.warning('Cell is being edited', { 
          description: result?.message || 'Another user is editing this cell' 
        });
      }
    },
  });
}

export function useReleaseLock() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ propertyId, cellKey }: { propertyId: string; cellKey: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('release_inventory_lock', {
        p_property_id: propertyId,
        p_cell_key: cellKey,
        p_user_id: user?.id,
      }));
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { propertyId }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_edit_locks', propertyId] });
    },
  });
}

// Hook for auto-refreshing locks while editing
export function useLockKeepAlive(propertyId?: string, cellKey?: string, isEditing = false) {
  const acquireLock = useAcquireLock();
  const releaseLock = useReleaseLock();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!propertyId || !cellKey || !isEditing) {
      // Release lock when not editing
      if (propertyId && cellKey) {
        releaseLock.mutate({ propertyId, cellKey });
      }
      return;
    }
    
    // Acquire lock immediately
    acquireLock.mutate({ propertyId, cellKey });
    
    // Refresh lock every 2 minutes
    intervalRef.current = setInterval(() => {
      acquireLock.mutate({ propertyId, cellKey });
    }, 2 * 60 * 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Release lock on cleanup
      releaseLock.mutate({ propertyId, cellKey });
    };
  }, [propertyId, cellKey, isEditing]);
}

// ============ SYNC METRICS & MONITORING ============

export function useSyncMetrics(propertyId?: string, days = 7) {
  return useQuery({
    queryKey: ['inventory_sync_metrics', propertyId, days],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('inventory_sync_metrics' as any)
        .select('*')
        .eq('property_id', propertyId)
        .gte('metric_date', startDate.toISOString().split('T')[0])
        .order('metric_date', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as InventorySyncMetrics[];
    },
    enabled: !!propertyId,
    refetchInterval: 30000, // Every 30 seconds
  });
}

// ============ ALERTS ============

export function useInventoryAlerts(propertyId?: string, unacknowledgedOnly = true) {
  return useQuery({
    queryKey: ['inventory_alerts', propertyId, unacknowledgedOnly],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];
      
      let query = supabase
        .from('inventory_alerts' as any)
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (unacknowledgedOnly) {
        query = query.eq('is_acknowledged', false);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as InventoryAlert[];
    },
    enabled: !!propertyId,
    refetchInterval: 10000, // Every 10 seconds
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('inventory_alerts' as any)
        .update({
          is_acknowledged: true,
          acknowledged_by: user?.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_alerts'] });
      toast.success('Alert acknowledged');
    },
  });
}

// ============ CONFLICT DETECTION ============

export function useConflictDetection(propertyId?: string) {
  const { data: locks = [] } = useEditLocks(propertyId);
  const { user } = useAuth();
  
  const checkConflict = useCallback((cellKey: string) => {
    const lock = locks.find(l => l.cell_key === cellKey);
    if (!lock) return null;
    if (lock.locked_by === user?.id) return null;
    
    return {
      lockedBy: lock.locked_by,
      lockedAt: lock.locked_at,
    };
  }, [locks, user?.id]);
  
  const getLockedCellKeys = useCallback(() => {
    return locks
      .filter(l => l.locked_by !== user?.id)
      .map(l => l.cell_key);
  }, [locks, user?.id]);
  
  return {
    locks,
    checkConflict,
    getLockedCellKeys,
    hasConflicts: locks.some(l => l.locked_by !== user?.id),
  };
}

// ============ HEALTH CHECK ============

export function useInventoryHealth(propertyId?: string) {
  const { data: metrics = [] } = useSyncMetrics(propertyId, 1);
  const { data: alerts = [] } = useInventoryAlerts(propertyId);
  
  const latestMetrics = metrics[0];
  
  const healthStatus = (() => {
    if (!latestMetrics) return 'unknown';
    
    const failRate = latestMetrics.total_syncs > 0 
      ? (latestMetrics.failed_syncs / latestMetrics.total_syncs) * 100 
      : 0;
    
    if (failRate > 25) return 'critical';
    if (failRate > 10) return 'warning';
    if (alerts.some(a => a.severity === 'critical')) return 'critical';
    if (alerts.some(a => a.severity === 'warning')) return 'warning';
    
    return 'healthy';
  })();
  
  return {
    status: healthStatus as 'healthy' | 'warning' | 'critical' | 'unknown',
    metrics: latestMetrics,
    activeAlerts: alerts,
    failRate: latestMetrics?.total_syncs 
      ? Math.round((latestMetrics.failed_syncs / latestMetrics.total_syncs) * 100) 
      : 0,
  };
}

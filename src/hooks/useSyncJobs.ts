import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

// ============ TYPES ============

export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'PARTIAL_FAIL' | 'FAILED' | 'SUCCESS';

export interface SyncJob {
  id: string;
  property_id: string;
  channel_id: string | null;
  status: SyncJobStatus;
  cell_ids: string[];
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  retry_count: number;
  idempotency_key: string | null;
  created_at: string;
}

export interface SyncJobFailedCell {
  id: string;
  sync_job_id: string;
  cell_key: string;
  error_message: string;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
}

export interface InventorySnapshot {
  id: string;
  sync_job_id: string | null;
  property_mapping_id: string;
  snapshot_time: string;
  snapshot_type: string | null;
  snapshot_data: Record<string, unknown>;
  created_at: string;
}

// ============ HOOKS ============

// Fetch sync jobs with pagination
export function useSyncJobs(propertyId?: string, limit = 50) {
  return useQuery({
    queryKey: ['sync_jobs', propertyId, limit],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('inventory_sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SyncJob[];
    },
  });
}

// Fetch single sync job with failed cells
export function useSyncJobDetail(jobId?: string) {
  return useQuery({
    queryKey: ['sync_job_detail', jobId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!jobId) return null;
      
      const { data: job, error: jobError } = await supabase
        .from('inventory_sync_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (jobError) throw jobError;
      
      const { data: failedCells, error: cellsError } = await supabase
        .from('sync_job_failed_cells')
        .select('*')
        .eq('sync_job_id', jobId)
        .order('created_at', { ascending: false });
      
      if (cellsError) throw cellsError;
      
      return {
        job: job as SyncJob,
        failedCells: (failedCells || []) as SyncJobFailedCell[],
      };
    },
    enabled: !!jobId,
  });
}

// Get sync jobs statistics
export function useSyncJobStats(propertyId?: string) {
  return useQuery({
    queryKey: ['sync_job_stats', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('inventory_sync_jobs')
        .select('status');
      
      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const stats = {
        total: 0,
        pending: 0,
        running: 0,
        success: 0,
        failed: 0,
        partial_fail: 0,
      };
      
      for (const job of data || []) {
        stats.total++;
        if (job.status === 'PENDING') stats.pending++;
        else if (job.status === 'RUNNING') stats.running++;
        else if (job.status === 'SUCCESS') stats.success++;
        else if (job.status === 'FAILED') stats.failed++;
        else if (job.status === 'PARTIAL_FAIL') stats.partial_fail++;
      }
      
      return stats;
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

// Check if system is degraded (too many failures)
export function useSystemHealth(propertyId?: string) {
  return useQuery({
    queryKey: ['system_health', propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Check jobs from last 24 hours
      const since = new Date();
      since.setHours(since.getHours() - 24);
      
      let query = supabase
        .from('inventory_sync_jobs')
        .select('status')
        .gte('created_at', since.toISOString());
      
      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const total = data?.length || 0;
      const failed = data?.filter(j => j.status === 'FAILED' || j.status === 'PARTIAL_FAIL').length || 0;
      const failRate = total > 0 ? (failed / total) * 100 : 0;
      
      // Degraded if fail rate > 30% or > 5 stuck jobs
      const stuck = data?.filter(j => j.status === 'PENDING' || j.status === 'RUNNING').length || 0;
      const isDegraded = failRate > 30 || stuck > 5;
      
      return {
        isDegraded,
        failRate: Math.round(failRate * 10) / 10,
        totalJobs: total,
        failedJobs: failed,
        stuckJobs: stuck,
      };
    },
    refetchInterval: 10000,
  });
}

// Retry failed cells in a job
export function useRetrySyncJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      // Get the job
      const { data: job, error: jobError } = await supabase
        .from('inventory_sync_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (jobError) throw jobError;
      
      // Reset status and retry
      const { error: updateError } = await supabase
        .from('inventory_sync_jobs')
        .update({ 
          status: 'PENDING', 
          error: null,
          retry_count: (job.retry_count || 0) + 1,
        })
        .eq('id', jobId);
      
      if (updateError) throw updateError;
      
      // Also reset the cells
      if (job.cell_ids && job.cell_ids.length > 0) {
        await supabase
          .from('inventory_cells')
          .update({ sync_status: 'PENDING', sync_error: null })
          .in('id', job.cell_ids);
      }
      
      return { jobId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync_jobs'] });
      queryClient.invalidateQueries({ queryKey: ['sync_job_stats'] });
      toast.success('Job queued for retry');
    },
    onError: (error: Error) => {
      toast.error('Failed to retry job', { description: error.message });
    },
  });
}

// Retry specific failed cells
export function useRetryFailedCells() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ jobId, cellKeys }: { jobId: string; cellKeys: string[] }) => {
      // Create new sync job for failed cells
      const { data: newJob, error } = await supabase
        .from('inventory_sync_jobs')
        .insert({
          property_id: '', // Will be filled from original job
          cell_ids: cellKeys,
          status: 'PENDING',
          idempotency_key: `retry-cells-${Date.now()}`,
        })
        .select()
        .single();
      
      if (error) throw error;
      return newJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync_jobs'] });
      toast.success('Failed cells queued for retry');
    },
  });
}

// Export sync job logs as CSV
export function exportSyncJobLogs(jobs: SyncJob[]): void {
  const headers = ['ID', 'Property ID', 'Status', 'Cells', 'Started', 'Completed', 'Error', 'Retries'];
  const rows = jobs.map(job => [
    job.id,
    job.property_id,
    job.status,
    job.cell_ids?.length || 0,
    job.started_at ? format(new Date(job.started_at), 'yyyy-MM-dd HH:mm:ss') : '',
    job.completed_at ? format(new Date(job.completed_at), 'yyyy-MM-dd HH:mm:ss') : '',
    job.error || '',
    job.retry_count || 0,
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sync-jobs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ RECONCILIATION ============

// Create snapshot
export function useCreateSnapshot() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ propertyId, syncJobId }: { propertyId: string; syncJobId?: string }) => {
      // Get current inventory state
      const { data: cells, error: cellsError } = await supabase
        .from('inventory_cells')
        .select('*')
        .eq('property_id', propertyId);
      
      if (cellsError) throw cellsError;
      
      // Create snapshot - need a property_mapping_id
      const { data: mapping } = await supabase
        .from('property_mappings')
        .select('id')
        .limit(1)
        .single();
      
      const { data: snapshot, error } = await supabase
        .from('inventory_snapshots')
        .insert({
          property_mapping_id: mapping?.id || propertyId,
          sync_job_id: syncJobId || null,
          snapshot_time: new Date().toISOString(),
          snapshot_type: 'manual',
          snapshot_data: { cells },
        })
        .select()
        .single();
      
      if (error) throw error;
      return snapshot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_snapshots'] });
      toast.success('Snapshot created');
    },
  });
}

// Fetch snapshots
export function useInventorySnapshots(propertyId?: string, limit = 20) {
  return useQuery({
    queryKey: ['inventory_snapshots', propertyId, limit],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_snapshots')
        .select('id, property_mapping_id, sync_job_id, snapshot_time, snapshot_type, created_at')
        .order('snapshot_time', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as Array<Omit<InventorySnapshot, 'snapshot_data'>>;
    },
  });
}

// Export reconciliation report
export function useExportReconciliationReport() {
  return useMutation({
    mutationFn: async ({ snapshotId }: { snapshotId: string }) => {
      const { data: snapshot, error } = await supabase
        .from('inventory_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();
      
      if (error) throw error;
      
      // Get current state - use property_mapping_id to find property
      const { data: mapping } = await supabase
        .from('property_mappings')
        .select('channex_property_id')
        .eq('id', snapshot.property_mapping_id)
        .single();
      
      const { data: currentCells } = await supabase
        .from('inventory_cells')
        .select('*')
        .eq('property_id', mapping?.channex_property_id || '');
      
      // Compare and generate report
      const snapshotData = (snapshot.snapshot_data as { cells?: Array<Record<string, unknown>> })?.cells || [];
      const snapshotMap = new Map(snapshotData.map((c: Record<string, unknown>) => [c.id, c]));
      
      const mismatches: Array<{
        cell_id: string;
        field: string;
        expected: unknown;
        actual: unknown;
      }> = [];
      
      for (const current of currentCells || []) {
        const expected = snapshotMap.get(current.id);
        if (!expected) continue;
        
        const fieldsToCheck = ['rate', 'availability', 'stop_sell', 'closed_to_arrival', 'closed_to_departure'];
        for (const field of fieldsToCheck) {
          if ((current as Record<string, unknown>)[field] !== (expected as Record<string, unknown>)[field]) {
            mismatches.push({
              cell_id: current.id,
              field,
              expected: (expected as Record<string, unknown>)[field],
              actual: (current as Record<string, unknown>)[field],
            });
          }
        }
      }
      
      // Export as CSV
      const headers = ['Cell ID', 'Field', 'Expected', 'Actual'];
      const rows = mismatches.map(m => [m.cell_id, m.field, String(m.expected), String(m.actual)]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconciliation-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      return { mismatches: mismatches.length };
    },
    onSuccess: (result) => {
      toast.success(`Report exported with ${result.mismatches} mismatches`);
    },
  });
}

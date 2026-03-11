/**
 * OTA Operations Hooks
 * 
 * CRITICAL: KPI data MUST use RPC only - no direct table access
 * Per spec v3.1: OTA roles cannot SELECT from bookings_mirror directly
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, safeRpc } from "@/integrations/supabase";
import { useAuth } from './useAuth';
import type { 
  OtaWorkType, 
  OtaProjectStatus, 
  OtaTaskStatus, 
  OtaTaskPriority,
  OtaProject,
  OtaTask 
} from '@/lib/otaOps';

// Re-export types from SSOT (src/lib/otaOps.ts)
export type { 
  OtaWorkType, 
  OtaProjectStatus, 
  OtaTaskStatus, 
  OtaTaskPriority,
  OtaProject,
  OtaTask 
};

// ============================================================
// KPI TYPES (hooks-specific)
// ============================================================

export interface KpiData {
  channel: string;
  booking_count: number;
  total_revenue: number;
  avg_booking_value: number;
  total_nights: number;
}

export interface KpiSummary {
  total_bookings: number;
  total_revenue: number;
  avg_booking_value: number;
  total_nights: number;
  active_channels: number;
  active_properties: number;
}

export interface KpiResponse {
  success: boolean;
  error?: string;
  message?: string;
  meta?: {
    start_date: string;
    end_date: string;
    date_clamped: boolean;
    group_by: string;
  };
  data?: KpiData[];
  summary?: KpiSummary;
}

// ============================================================
// PROPERTY LOOKUP HELPER
// ============================================================

async function fetchPropertyNames(propertyIds: string[]): Promise<Record<string, string>> {
  if (propertyIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('properties_mirror')
    .select('id, property_name')
    .in('id', propertyIds);
  
  if (error) {
    console.warn('[OTA] Failed to fetch property names:', error.message);
    return {};
  }
  
  return (data || []).reduce((acc, p) => {
    acc[p.id] = p.property_name || 'Unknown';
    return acc;
  }, {} as Record<string, string>);
}

// ============================================================
// PROJECTS HOOKS
// ============================================================

export interface UseOtaProjectsOptions {
  includeOpsBucket?: boolean;  // Default: false - hide ops bucket from project list
}

export function useOtaProjects(options: UseOtaProjectsOptions = {}) {
  const { user } = useAuth();
  const { includeOpsBucket = false } = options;
  
  return useQuery({
    queryKey: ['ota-projects', user?.id, includeOpsBucket],
    queryFn: async () => {
      // Step 1: Fetch projects (no nested join)
      let query = supabase
        .from('ota_projects')
        .select('*')
        .neq('status', 'ARCHIVED')
        .order('created_at', { ascending: false });
      
      // Sprint 2: Hide ops buckets by default
      if (!includeOpsBucket) {
        query = query.or('is_ops_bucket.is.null,is_ops_bucket.eq.false');
      }
      
      const { data: projects, error } = await query;
      
      if (error) throw error;
      if (!projects || projects.length === 0) return [];
      
      // Step 2: Fetch property names for all projects (filter out null property_ids)
      const propertyIds = [...new Set(projects.map(p => p.property_id).filter((id): id is string => !!id))];
      const propertyNames = await fetchPropertyNames(propertyIds);
      
      // Step 3: Map property names to projects
      return projects.map((project: any) => ({
        ...project,
        property_name: project.property_id ? (propertyNames[project.property_id] || 'Unknown Property') : null,
      })) as OtaProject[];
    },
    enabled: !!user,
  });
}

export function useOtaProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['ota-project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      
      // Step 1: Fetch project - use maybeSingle to avoid error when no rows
      const { data: project, error } = await supabase
        .from('ota_projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      
      if (error) throw error;
      if (!project) return null;
      
      // Step 2: Fetch property name (only if property_id exists)
      let propertyName: string | null = null;
      if (project.property_id) {
        const propertyNames = await fetchPropertyNames([project.property_id]);
        propertyName = propertyNames[project.property_id] || 'Unknown Property';
      }
      
      return {
        ...project,
        property_name: propertyName,
      } as OtaProject;
    },
    enabled: !!projectId,
  });
}

// ============================================================
// TASKS HOOKS
// ============================================================

/**
 * Batch fetch evidence counts for tasks
 */
async function fetchEvidenceCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('ota_task_evidence')
    .select('task_id')
    .in('task_id', taskIds);
  
  if (error) {
    console.warn('[OTA] Failed to fetch evidence counts:', error.message);
    return {};
  }
  
  // Count occurrences per task_id
  return (data || []).reduce((acc, row) => {
    acc[row.task_id] = (acc[row.task_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Batch fetch approved evidence counts for tasks
 */
async function fetchApprovedEvidenceCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('ota_task_evidence')
    .select('task_id')
    .in('task_id', taskIds)
    .eq('review_status', 'APPROVED');
  
  if (error) {
    console.warn('[OTA] Failed to fetch approved evidence counts:', error.message);
    return {};
  }
  
  return (data || []).reduce((acc, row) => {
    acc[row.task_id] = (acc[row.task_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Batch fetch pending evidence counts for tasks (Lead needs this for review badge)
 */
async function fetchPendingEvidenceCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('ota_task_evidence')
    .select('task_id')
    .in('task_id', taskIds)
    .eq('review_status', 'PENDING');
  
  if (error) {
    console.warn('[OTA] Failed to fetch pending evidence counts:', error.message);
    return {};
  }
  
  return (data || []).reduce((acc, row) => {
    acc[row.task_id] = (acc[row.task_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Batch fetch cover images (first image evidence) for tasks - Trello style
 */
async function fetchCoverImages(taskIds: string[]): Promise<Record<string, string | null>> {
  if (taskIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('ota_task_evidence')
    .select('task_id, file_url, mime_type')
    .in('task_id', taskIds)
    .like('mime_type', 'image/%')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.warn('[OTA] Failed to fetch cover images:', error.message);
    return {};
  }
  
  // Get first image for each task
  const coverImages: Record<string, string | null> = {};
  (data || []).forEach((row) => {
    if (!coverImages[row.task_id] && row.file_url) {
      coverImages[row.task_id] = row.file_url;
    }
  });
  
  return coverImages;
}

/**
 * Batch fetch comment counts for tasks
 */
async function fetchCommentCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('ota_task_comments')
    .select('task_id')
    .in('task_id', taskIds);
  
  if (error) {
    console.warn('[OTA] Failed to fetch comment counts:', error.message);
    return {};
  }
  
  // Count occurrences per task_id
  return (data || []).reduce((acc, row) => {
    acc[row.task_id] = (acc[row.task_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function useOtaTasks(filters?: {
  projectId?: string;
  status?: OtaTaskStatus;
  assigneeId?: string;
}) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-tasks', user?.id, filters],
    queryFn: async () => {
      // Step 1: Fetch tasks with project info INCLUDING work_type
      let query = supabase
        .from('ota_tasks')
        .select(`*, ota_projects(id, name, property_id, work_type)`)
        .neq('status', 'CANCELLED')
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      
      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }
      
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters?.assigneeId) {
        query = query.eq('assignee_id', filters.assigneeId);
      }
      
      const { data: tasks, error } = await query;
      
      if (error) throw error;
      if (!tasks || tasks.length === 0) return [];
      
      // Step 2: Collect unique property IDs from projects (filter nulls)
      const propertyIds = [...new Set(
        tasks
          .map((t: any) => t.ota_projects?.property_id)
          .filter((id): id is string => !!id)
      )];
      
      // Step 3: Fetch property names
      const propertyNames = await fetchPropertyNames(propertyIds);
      
      // Step 4: Batch fetch evidence + comment counts + cover images (NO N+1!)
      const taskIds = tasks.map((t: any) => t.id);
      const [evidenceCounts, approvedCounts, pendingCounts, commentCounts, coverImages] = await Promise.all([
        fetchEvidenceCounts(taskIds),
        fetchApprovedEvidenceCounts(taskIds),
        fetchPendingEvidenceCounts(taskIds),
        fetchCommentCounts(taskIds),
        fetchCoverImages(taskIds),
      ]);
      
      // Step 5: Map data with extended fields
      return tasks.map((task: any) => ({
        ...task,
        project_name: task.ota_projects?.name || 'Unknown Project',
        property_name: task.ota_projects?.property_id 
          ? (propertyNames[task.ota_projects.property_id] || 'Unknown Property')
          : null,
        // Extended fields for Task Card Intelligence
        work_type: task.ota_projects?.work_type || null,
        evidence_count: evidenceCounts[task.id] || 0,
        approved_evidence_count: approvedCounts[task.id] || 0,
        pending_evidence_count: pendingCounts[task.id] || 0,
        comment_count: commentCounts[task.id] || 0,
        // Trello-style cover image
        cover_image_url: coverImages[task.id] || null,
      })) as OtaTask[];
    },
    enabled: !!user,
  });
}

export function useMyOtaTasks() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-my-tasks', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_my_tasks' as any));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; tasks?: OtaTask[]; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tasks');
      }
      
      return result.tasks || [];
    },
    enabled: !!user,
  });
}

// ============================================================
// TASKS WITH ASSIGNEE NAMES (Phase C)
// ============================================================

export interface OtaTaskWithAssignee extends OtaTask {
  assignee_name?: string;
  evidence_summary?: {
    total: number;
    approved: number;
    pending: number;
  };
}

export function useOtaTasksWithAssignees(filters?: {
  projectId?: string;
  status?: OtaTaskStatus;
  assigneeId?: string;
}) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-tasks-with-assignees', user?.id, filters],
    queryFn: async (): Promise<OtaTaskWithAssignee[]> => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_tasks_with_assignees' as any, {
        p_project_id: filters?.projectId || null,
        p_status: filters?.status || null,
        p_assignee_id: filters?.assigneeId || null,
      }));
      
      if (error) {
        // Fallback to regular tasks if RPC not available
        if (error.message?.includes('Could not find the function')) {
          console.warn('[OTA] RPC ota_get_tasks_with_assignees not found, falling back');
          return [];
        }
        throw error;
      }
      
      const result = data as unknown as { success: boolean; tasks?: OtaTaskWithAssignee[]; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tasks');
      }
      
      return result.tasks || [];
    },
    enabled: !!user,
  });
}

export interface AvailableAssignee {
  id: string;
  role: string;
  display_name: string;
  email: string;
}

export function useAvailableAssignees(projectId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-available-assignees', projectId],
    queryFn: async (): Promise<AvailableAssignee[]> => {
      if (!projectId) return [];
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_available_assignees' as any, {
        p_project_id: projectId,
      }));
      
      if (error) {
        if (error.message?.includes('Could not find the function')) {
          console.warn('[OTA] RPC ota_get_available_assignees not found');
          return [];
        }
        throw error;
      }
      
      const result = data as unknown as { success: boolean; assignees?: AvailableAssignee[]; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch assignees');
      }
      
      return result.assignees || [];
    },
    enabled: !!user && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================
// KPI HOOKS - CRITICAL: RPC ONLY
// ============================================================

export function useOtaKpi(params: {
  startDate: string;
  endDate: string;
  propertyIds?: string[];
  groupBy?: 'channel' | 'property' | 'daily' | 'monthly';
}) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-kpi', params],
    queryFn: async (): Promise<KpiResponse> => {
      try {
        const { data, error } = await safeRpc(() => supabase.rpc('ota_get_kpi' as any, {
          p_start_date: params.startDate,
          p_end_date: params.endDate,
          p_property_ids: params.propertyIds || null,
          p_group_by: params.groupBy || 'channel',
        }));
        
        if (error) {
          // Check if RPC doesn't exist yet
          if (error.message?.includes('Could not find the function')) {
            console.warn('[OTA KPI] RPC ota_get_kpi not found. Migrations may not have been applied.');
            return {
              success: false,
              error: 'RPC_NOT_FOUND',
              message: 'KPI function chưa được cài đặt. Vui lòng liên hệ admin để chạy migrations.',
              data: [],
              summary: {
                total_bookings: 0,
                total_revenue: 0,
                avg_booking_value: 0,
                total_nights: 0,
                active_channels: 0,
                active_properties: 0,
              },
            };
          }
          throw error;
        }
        
        const result = data as unknown as KpiResponse;
        
        if (!result.success) {
          throw new Error(result.error || result.message || 'KPI fetch failed');
        }
        
        return result;
      } catch (err: any) {
        console.error('[OTA KPI] Error:', err);
        throw err;
      }
    },
    enabled: !!user && !!params.startDate && !!params.endDate,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false, // Don't retry if RPC doesn't exist
  });
}

export function useOtaKpiSummary(params: {
  startDate: string;
  endDate: string;
  propertyIds?: string[];
}) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-kpi-summary', params],
    queryFn: async (): Promise<KpiResponse> => {
      try {
        const { data, error } = await safeRpc(() => supabase.rpc('ota_get_kpi_summary' as any, {
          p_start_date: params.startDate,
          p_end_date: params.endDate,
          p_property_ids: params.propertyIds || null,
        }));
        
        if (error) {
          // Check if RPC doesn't exist yet
          if (error.message?.includes('Could not find the function')) {
            console.warn('[OTA KPI] RPC ota_get_kpi_summary not found. Migrations may not have been applied.');
            return {
              success: false,
              error: 'RPC_NOT_FOUND',
              message: 'KPI Summary function chưa được cài đặt. Vui lòng liên hệ admin để chạy migrations.',
              summary: {
                total_bookings: 0,
                total_revenue: 0,
                avg_booking_value: 0,
                total_nights: 0,
                active_channels: 0,
                active_properties: 0,
              },
            };
          }
          throw error;
        }
        
        const result = data as unknown as KpiResponse;
        
        if (!result.success) {
          throw new Error(result.error || result.message || 'KPI summary fetch failed');
        }
        
        return result;
      } catch (err: any) {
        console.error('[OTA KPI Summary] Error:', err);
        throw err;
      }
    },
    enabled: !!user && !!params.startDate && !!params.endDate,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

export function useCreateOtaProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      propertyId?: string | null;
      workType: OtaWorkType;
      startDate?: string;
      dueDate?: string;
    }) => {
      // Direct insert since RPC may not exist yet
      const { data, error } = await supabase
        .from('ota_projects')
        .insert({
          name: params.name,
          description: params.description || null,
          property_id: params.propertyId || null,
          work_type: params.workType,
          status: 'PLANNING',
          start_date: params.startDate || null,
          due_date: params.dueDate || null,
          created_by: user?.id,
          updated_by: user?.id,
        })
        .select('id');
      
      if (error) throw error;
      
      // Handle case where no data returned or multiple rows
      if (!data || data.length === 0) {
        throw new Error('Không thể tạo project');
      }
      
      return { success: true, project_id: data[0].id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-projects'] });
    },
  });
}

// Sprint C: Classification type for task creation
export type OtaTaskClassification = 'EXECUTION' | 'PREP' | 'AUTO' | 'OPS';

export function useCreateOtaTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      title: string;
      description?: string;
      assigneeId?: string;
      priority?: OtaTaskPriority;
      dueDate?: string;
      estimatedHours?: number;
      tags?: string[];
      classification?: OtaTaskClassification; // Sprint C: Added
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_create_task' as any, {
        p_project_id: params.projectId,
        p_title: params.title,
        p_description: params.description || null,
        p_assignee_id: params.assigneeId || null,
        p_priority: params.priority || 'MEDIUM',
        p_due_date: params.dueDate || null,
        p_estimated_hours: params.estimatedHours || null,
        p_tags: params.tags || [],
        p_classification: params.classification || 'EXECUTION', // Sprint C: Added
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; task_id?: string; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to create task');
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
    },
  });
}

export function useUpdateOtaTaskStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      newStatus: OtaTaskStatus;
      actualHours?: number;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_update_task_status' as any, {
        p_task_id: params.taskId,
        p_new_status: params.newStatus,
        p_actual_hours: params.actualHours || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to update task');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
    },
  });
}

export function useUpdateOtaTaskPriority() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      newPriority: OtaTaskPriority;
    }) => {
      // Direct update since RPC may not exist
      const { data, error } = await supabase
        .from('ota_tasks')
        .update({ 
          priority: params.newPriority,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.taskId)
        .select();
      
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Không tìm thấy task để cập nhật');
      }
      
      return { success: true, task: data[0] };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks-with-assignees'] });
    },
  });
}

export function useUpdateOtaTaskAssignee() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      assigneeId: string | null;
    }) => {
      // Direct update since RPC may not exist
      const { data, error } = await supabase
        .from('ota_tasks')
        .update({ 
          assignee_id: params.assigneeId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.taskId)
        .select();
      
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Không tìm thấy task để cập nhật');
      }
      
      return { success: true, task: data[0] };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks-with-assignees'] });
    },
  });
}

// ============================================================
// SPRINT 2: ADDITIONAL TASK UPDATE HOOKS
// ============================================================

export function useUpdateOtaTaskDueDate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      dueDate: string | null;
    }) => {
      const { data, error } = await supabase
        .from('ota_tasks')
        .update({ 
          due_date: params.dueDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.taskId)
        .select();
      
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Không tìm thấy task để cập nhật');
      }
      
      return { success: true, task: data[0] };
    },
    onSuccess: (_, variables) => {
      // Force refetch by removing cache first, then invalidating
      queryClient.removeQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks-with-assignees'] });
    },
  });
}

export function useUpdateTaskEffort() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      expectedEffortMinutes?: number | null;
      actualEffortMinutes?: number | null;
    }) => {
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      if (params.expectedEffortMinutes !== undefined) {
        updatePayload.expected_effort_minutes = params.expectedEffortMinutes;
      }
      if (params.actualEffortMinutes !== undefined) {
        updatePayload.actual_effort_minutes = params.actualEffortMinutes;
      }
      
      const { data, error } = await supabase
        .from('ota_tasks')
        .update(updatePayload)
        .eq('id', params.taskId)
        .select();
      
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Không tìm thấy task để cập nhật');
      }
      
      return { success: true, task: data[0] };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
    },
  });
}

/**
 * Update task description
 */
export function useUpdateOtaTaskDescription() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      description: string | null;
    }) => {
      const { data, error } = await supabase
        .from('ota_tasks')
        .update({ 
          description: params.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.taskId)
        .select();
      
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Không tìm thấy task để cập nhật');
      }
      
      return { success: true, task: data[0] };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks-with-assignees'] });
    },
  });
}

/**
 * Update task classification with audit logging
 * Changes require_evidence based on classification type
 */
export function useUpdateTaskClassification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      newClassification: 'EXECUTION' | 'PREP' | 'AUTO' | 'OPS';
      reason?: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_update_task_classification' as any, {
        p_task_id: params.taskId,
        p_new_classification: params.newClassification,
        p_reason: params.reason || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { 
        success: boolean; 
        error?: string; 
        message?: string;
        old_classification?: string;
        new_classification?: string;
        require_evidence?: boolean;
      };
      
      if (!result.success) {
        throw new Error(result.message || result.error || 'Failed to update classification');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks-with-assignees'] });
    },
  });
}

// ============================================================
// TASK TODO HOOKS (Checklist / Việc cần làm)
// ============================================================

export interface TaskTodo {
  id: string;
  task_id: string;
  content: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Fetch todos for a task
 */
export function useTaskTodos(taskId: string | undefined) {
  return useQuery({
    queryKey: ['ota-task-todos', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      
      const { data, error } = await (supabase.rpc as any)('ota_get_task_todos', {
        p_task_id: taskId,
      });
      
      if (error) throw error;
      return (data || []) as TaskTodo[];
    },
    enabled: !!taskId,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Add a new todo item
 */
export function useAddTaskTodo() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, content }: { taskId: string; content: string }) => {
      const { data, error } = await (supabase.rpc as any)('ota_add_task_todo', {
        p_task_id: taskId,
        p_content: content,
      });
      
      if (error) throw error;
      return data as string; // Returns new todo ID
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', variables.taskId] });
    },
  });
}

/**
 * Toggle todo done state
 */
export function useToggleTaskTodo() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ todoId, taskId }: { todoId: string; taskId: string }) => {
      const { data, error } = await (supabase.rpc as any)('ota_toggle_task_todo', {
        p_todo_id: todoId,
      });
      
      if (error) throw error;
      return data as boolean; // Returns new is_done state
    },
    onMutate: async ({ todoId, taskId }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['ota-task-todos', taskId] });
      
      const previousTodos = queryClient.getQueryData<TaskTodo[]>(['ota-task-todos', taskId]);
      
      if (previousTodos) {
        queryClient.setQueryData<TaskTodo[]>(['ota-task-todos', taskId], 
          previousTodos.map(t => t.id === todoId ? { ...t, is_done: !t.is_done } : t)
        );
      }
      
      return { previousTodos };
    },
    onError: (_, variables, context) => {
      // Rollback on error
      if (context?.previousTodos) {
        queryClient.setQueryData(['ota-task-todos', variables.taskId], context.previousTodos);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', variables.taskId] });
    },
  });
}

/**
 * Update todo content
 */
export function useUpdateTaskTodo() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ todoId, taskId, content }: { todoId: string; taskId: string; content: string }) => {
      const { error } = await (supabase.rpc as any)('ota_update_task_todo', {
        p_todo_id: todoId,
        p_content: content,
      });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', variables.taskId] });
    },
  });
}

/**
 * Delete a todo item
 */
export function useDeleteTaskTodo() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ todoId, taskId }: { todoId: string; taskId: string }) => {
      const { error } = await (supabase.rpc as any)('ota_delete_task_todo', {
        p_todo_id: todoId,
      });
      
      if (error) throw error;
    },
    onMutate: async ({ todoId, taskId }) => {
      // Optimistic update - remove from list
      await queryClient.cancelQueries({ queryKey: ['ota-task-todos', taskId] });
      
      const previousTodos = queryClient.getQueryData<TaskTodo[]>(['ota-task-todos', taskId]);
      
      if (previousTodos) {
        queryClient.setQueryData<TaskTodo[]>(['ota-task-todos', taskId], 
          previousTodos.filter(t => t.id !== todoId)
        );
      }
      
      return { previousTodos };
    },
    onError: (_, variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['ota-task-todos', variables.taskId], context.previousTodos);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-todos', variables.taskId] });
    },
  });
}

// ============================================================
// TASK DETAIL HOOKS
// ============================================================

export interface TaskEvidence {
  id: string;
  evidence_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  description: string | null;
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string;
  reviewed_by_name: string | null;
}

export interface TaskDetailResponse {
  success: boolean;
  error?: string;
  message?: string;
  task?: {
    id: string;
    title: string;
    description: string | null;
    status: OtaTaskStatus;
    priority: OtaTaskPriority;
    due_date: string | null;
    started_at: string | null;
    completed_at: string | null;
    estimated_hours: number | null;
    actual_hours: number | null;
    tags: string[];
    created_at: string;
    // Nested assignee from RPC
    assignee: {
      id: string;
      email: string;
      full_name: string;
    } | null;
    // Flat assignee fields (legacy - TasksPage uses these)
    assignee_id?: string | null;
    assignee_name?: string | null;
    assignee_email?: string | null;
    // Created by info from RPC
    created_by_info?: {
      id: string;
      email: string;
      full_name: string;
    } | null;
    // Flat created_by fields
    created_by?: string | null;
    created_by_name?: string | null;
    created_by_email?: string | null;
    // Sprint 1/2 extended fields
    classification?: string | null;
    issue_tag?: string | null;
    expected_effort_minutes?: number | null;
    actual_effort_minutes?: number | null;
    require_evidence?: boolean | null;
    min_evidence_count?: number | null;
    is_quick_task?: boolean | null;
    project_name?: string;
    property_name?: string;
    is_ops_bucket?: boolean;
  };
  project?: {
    id: string;
    name: string;
    status: string;
    property_id: string;
    property_name: string;
    is_ops_bucket?: boolean;
    bucket_date?: string;
  };
  evidence?: TaskEvidence[];
  evidence_summary?: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    needs_revision: number;
  };
  can_complete?: boolean;
}

export function useOtaTaskDetail(taskId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-task-detail', taskId],
    queryFn: async (): Promise<TaskDetailResponse> => {
      if (!taskId) throw new Error('Task ID required');
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_task_detail' as any, {
        p_task_id: taskId,
      }));
      
      if (error) {
        if (error.message?.includes('Could not find the function')) {
          return {
            success: false,
            error: 'RPC_NOT_FOUND',
            message: 'Task detail function not available. Please run migrations.',
          };
        }
        throw error;
      }
      
      const result = data as unknown as TaskDetailResponse;
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to fetch task detail');
      }
      
      return result;
    },
    enabled: !!user && !!taskId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ============================================================
// SUPER ADMIN OVERRIDE
// ============================================================

export type OverrideType = 'REOPEN' | 'FORCE_DONE' | 'CANCEL';

export interface OverrideResult {
  success: boolean;
  task_id?: string;
  old_status?: string;
  new_status?: string;
  override_type?: string;
  error?: string;
  message?: string;
}

export function useSuperAdminOverride() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      overrideType: OverrideType;
      reason: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_super_admin_override_task_status' as any, {
        p_task_id: params.taskId,
        p_override_type: params.overrideType,
        p_reason: params.reason,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as OverrideResult;
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Override failed');
      }
      
      return result;
    },
    onSuccess: (result, variables) => {
      // Invalidate all affected queries
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-project-detail'] });
      queryClient.invalidateQueries({ queryKey: ['ota-projects'] });
    },
  });
}

// ============================================================
// PROJECT INPUTS/OUTPUTS
// ============================================================

export interface ProjectInputData {
  ota_account_email?: string;
  ota_extranet_login_url?: string;
  listing_url?: string;
  property_notes?: string;
  priority_notes?: string;
  attachments_links?: string[];
}

export interface ProjectOutputData {
  summary?: string;
  before_links?: string[];
  after_links?: string[];
  kpi_notes?: string;
  final_checklist?: string[];
  handover_notes?: string;
}

export type OutputStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ProjectInputRecord {
  id: string;
  project_id: string;
  data: ProjectInputData;
  schema_version: number;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ProjectOutputRecord {
  id: string;
  project_id: string;
  version: number;
  status: OutputStatus;
  data: ProjectOutputData;
  schema_version: number;
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_reason: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ProjectOutputSummary {
  id: string;
  version: number;
  status: OutputStatus;
  created_at: string;
  created_by: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_reason: string | null;
}

export interface ProjectIOResult {
  success: boolean;
  inputs: ProjectInputRecord | null;
  latest_output: ProjectOutputRecord | null;
  outputs_list: ProjectOutputSummary[];
  error?: string;
}

/**
 * Fetch project inputs and outputs
 */
export function useProjectIO(projectId: string | undefined) {
  return useQuery({
    queryKey: ['ota-project-io', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_project_io' as any, {
        p_project_id: projectId,
      }));
      
      if (error) throw error;
      
      return data as ProjectIOResult;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Upsert project inputs with optimistic locking
 */
export function useUpsertProjectInputs() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      data: ProjectInputData;
      expectedUpdatedAt: string | null;
      schemaVersion?: number;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_upsert_project_inputs' as any, {
        p_project_id: params.projectId,
        p_data: params.data,
        p_expected_updated_at: params.expectedUpdatedAt,
        p_schema_version: params.schemaVersion || 1,
      }));
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string; id?: string; updated_at?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to save inputs');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-io', variables.projectId] });
    },
  });
}

/**
 * Create new output draft
 */
export function useCreateOutputDraft() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_create_output_draft' as any, {
        p_project_id: projectId,
      }));
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; id?: string; version?: number };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create draft');
      }
      
      return result;
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-io', projectId] });
    },
  });
}

/**
 * Update output draft
 */
export function useUpdateOutputDraft() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      outputId: string;
      data: ProjectOutputData;
      projectId: string;
      schemaVersion?: number;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_update_output_draft' as any, {
        p_output_id: params.outputId,
        p_data: params.data,
        p_schema_version: params.schemaVersion || 1,
      }));
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to update draft');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-io', variables.projectId] });
    },
  });
}

/**
 * Submit output for review
 */
export function useSubmitOutput() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { outputId: string; projectId: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_submit_output' as any, {
        p_output_id: params.outputId,
      }));
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to submit output');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-io', variables.projectId] });
    },
  });
}

/**
 * Review output (approve/reject)
 */
export function useReviewOutput() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      outputId: string;
      projectId: string;
      decision: 'APPROVE' | 'REJECT';
      reason: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_review_output' as any, {
        p_output_id: params.outputId,
        p_decision: params.decision,
        p_reason: params.reason,
      }));
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to review output');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-io', variables.projectId] });
    },
  });
}

// ============================================================
// EVIDENCE MUTATIONS
// ============================================================

export function useSubmitEvidence() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      evidenceType: string;
      fileUrl?: string;
      fileName?: string;
      fileSizeBytes?: number;
      mimeType?: string;
      description?: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_submit_evidence' as any, {
        p_task_id: params.taskId,
        p_evidence_type: params.evidenceType,
        p_file_url: params.fileUrl || null,
        p_file_name: params.fileName || null,
        p_file_size_bytes: params.fileSizeBytes || null,
        p_mime_type: params.mimeType || null,
        p_description: params.description || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; evidence_id?: string; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to submit evidence');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
    },
  });
}

export function useReviewEvidence() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      evidenceId: string;
      taskId: string; // for cache invalidation
      reviewStatus: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
      reviewNotes?: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_review_evidence' as any, {
        p_evidence_id: params.evidenceId,
        p_review_status: params.reviewStatus,
        p_review_notes: params.reviewNotes || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to review evidence');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
    },
  });
}

// ============================================================
// BULK APPROVE EVIDENCE (Sprint 1 - Migration 027)
// ============================================================

export interface BulkApproveResult {
  success: boolean;
  approved_count?: number;
  task_count?: number;
  results?: Array<{ task_id: string; approved: number }>;
  error?: string;
  message?: string;
}

export function useBulkApproveEvidence() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskIds: string[];
      comment?: string;
    }): Promise<BulkApproveResult> => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_bulk_approve_evidence' as any, {
        p_task_ids: params.taskIds,
        p_comment: params.comment || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as BulkApproveResult;
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to bulk approve evidence');
      }
      
      return result;
    },
    onSuccess: (result) => {
      // Invalidate all task queries to refresh evidence counts
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail'] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-evidence'] });
      
      // Optionally invalidate specific tasks
      result.results?.forEach(r => {
        queryClient.invalidateQueries({ queryKey: ['ota-task-detail', r.task_id] });
      });
    },
  });
}

// ============================================================
// PROJECT DETAIL HOOKS (Phase B)
// ============================================================

export interface ProjectDetailResponse {
  success: boolean;
  error?: string;
  message?: string;
  project?: {
    id: string;
    name: string;
    description: string | null;
    property_id: string | null;
    property_name: string | null;
    work_type: OtaWorkType | null;
    status: OtaProjectStatus;
    start_date: string | null;
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
  };
  task_stats?: {
    total: number;
    todo: number;
    in_progress: number;
    review: number;
    done: number;
    blocked: number;
    overdue: number;
  };
  member_stats?: {
    total: number;
    active: number;
  };
}

export interface ProjectMember {
  user_id: string;
  role: 'STAFF' | 'LEAD' | 'ADMIN';
  is_active: boolean;
  assigned_at: string;
  display_name: string;
  email: string;
  assigned_by_name: string | null;
}

export interface ProjectMembersResponse {
  success: boolean;
  error?: string;
  message?: string;
  members?: ProjectMember[];
}

export function useOtaProjectDetail(projectId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-project-detail', projectId],
    queryFn: async (): Promise<ProjectDetailResponse> => {
      if (!projectId) throw new Error('Project ID required');
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_project_detail' as any, {
        p_project_id: projectId,
      }));
      
      if (error) {
        if (error.message?.includes('Could not find the function')) {
          return {
            success: false,
            error: 'RPC_NOT_FOUND',
            message: 'Project detail function not available. Please run migrations.',
          };
        }
        throw error;
      }
      
      const result = data as unknown as ProjectDetailResponse;
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to fetch project detail');
      }
      
      return result;
    },
    enabled: !!user && !!projectId,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useOtaProjectMembers(projectId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-project-members', projectId],
    queryFn: async (): Promise<ProjectMembersResponse> => {
      if (!projectId) throw new Error('Project ID required');
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_project_members' as any, {
        p_project_id: projectId,
      }));
      
      if (error) {
        if (error.message?.includes('Could not find the function')) {
          return {
            success: false,
            error: 'RPC_NOT_FOUND',
            message: 'Project members function not available. Please run migrations.',
          };
        }
        throw error;
      }
      
      const result = data as unknown as ProjectMembersResponse;
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to fetch project members');
      }
      
      return result;
    },
    enabled: !!user && !!projectId,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ============================================================
// PROJECT MUTATIONS (Phase B)
// ============================================================

export function useUpdateOtaProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      name?: string;
      description?: string;
      status?: OtaProjectStatus;
      startDate?: string;
      dueDate?: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_update_project' as any, {
        p_project_id: params.projectId,
        p_name: params.name || null,
        p_description: params.description || null,
        p_status: params.status || null,
        p_start_date: params.startDate || null,
        p_due_date: params.dueDate || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to update project');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-projects'] });
      queryClient.invalidateQueries({ queryKey: ['ota-project-detail', variables.projectId] });
    },
  });
}

export function useAddProjectMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      userId: string;
      role?: 'STAFF' | 'LEAD' | 'ADMIN';
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_add_project_member' as any, {
        p_project_id: params.projectId,
        p_user_id: params.userId,
        p_project_role: params.role || 'STAFF',
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to add member');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-members', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['ota-project-detail', variables.projectId] });
    },
  });
}

export function useRemoveProjectMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      userId: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_remove_project_member' as any, {
        p_project_id: params.projectId,
        p_user_id: params.userId,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to remove member');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-members', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['ota-project-detail', variables.projectId] });
    },
  });
}

export function useUpdateProjectMemberRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      userId: string;
      newRole: 'STAFF' | 'LEAD' | 'ADMIN';
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_update_project_member_role' as any, {
        p_project_id: params.projectId,
        p_user_id: params.userId,
        p_new_role: params.newRole,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to update member role');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-project-members', variables.projectId] });
    },
  });
}

// ============================================================
// TASK COMMENTS HOOKS (Phase D)
// ============================================================

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  author_name: string;
  author_email: string;
}

export interface TaskCommentsResponse {
  success: boolean;
  error?: string;
  message?: string;
  comments?: TaskComment[];
}

export function useTaskComments(taskId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-task-comments', taskId],
    queryFn: async (): Promise<TaskCommentsResponse> => {
      if (!taskId) throw new Error('Task ID required');
      
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_task_comments' as any, {
        p_task_id: taskId,
      }));
      
      if (error) {
        if (error.message?.includes('Could not find the function')) {
          return {
            success: false,
            error: 'RPC_NOT_FOUND',
            message: 'Comments feature not available. Please run migrations.',
          };
        }
        throw error;
      }
      
      const result = data as unknown as TaskCommentsResponse;
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to fetch comments');
      }
      
      return result;
    },
    enabled: !!user && !!taskId,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useAddTaskComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      content: string;
      parentId?: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_add_task_comment' as any, {
        p_task_id: params.taskId,
        p_content: params.content,
        p_parent_id: params.parentId || null,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; comment_id?: string; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to add comment');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-comments', variables.taskId] });
    },
  });
}

export function useEditTaskComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      commentId: string;
      taskId: string; // for cache invalidation
      content: string;
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_edit_task_comment' as any, {
        p_comment_id: params.commentId,
        p_content: params.content,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to edit comment');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-comments', variables.taskId] });
    },
  });
}

export function useDeleteTaskComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      commentId: string;
      taskId: string; // for cache invalidation
    }) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_delete_task_comment' as any, {
        p_comment_id: params.commentId,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to delete comment');
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-comments', variables.taskId] });
    },
  });
}

// ============================================================
// PROJECT MEMBERSHIP & ROLE
// ============================================================

export type OtaProjectRole = 'STAFF' | 'LEAD' | 'ADMIN';

/**
 * Get user's role in a specific project
 * Returns null if user is not a member of the project
 * 
 * CRITICAL: This determines drag & drop permissions
 */
export function useOtaProjectRole(projectId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-project-role', projectId, user?.id],
    queryFn: async () => {
      if (!projectId || !user?.id) return null;
      
      const { data, error } = await safeRpc(() => supabase.rpc('get_ota_project_role' as any, {
        p_project_id: projectId,
      }));
      
      if (error) {
        console.error('Error fetching project role:', error);
        return null;
      }
      
      // RPC returns string or null
      return data as OtaProjectRole | null;
    },
    enabled: !!projectId && !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Get user's roles for multiple projects at once
 * Useful for board view with tasks from different projects
 * 
 * IMPORTANT: Admin/super_admin get ADMIN role for ALL projects
 * IMPORTANT: ota_lead gets LEAD role for ALL projects (if not explicit member)
 * IMPORTANT: ota_staff gets STAFF role for ALL projects (if not explicit member)
 */
export function useOtaProjectRoles(projectIds: string[]) {
  const { user, userRole } = useAuth();
  
  return useQuery({
    queryKey: ['ota-project-roles', projectIds.join(','), user?.id, userRole],
    queryFn: async () => {
      if (projectIds.length === 0 || !user?.id) return {};
      
      // Admin/super_admin get ADMIN role for all projects
      const isAdmin = userRole === 'admin' || userRole === 'super_admin';
      if (isAdmin) {
        const roleMap: Record<string, OtaProjectRole> = {};
        projectIds.forEach(projectId => {
          roleMap[projectId] = 'ADMIN';
        });
        return roleMap;
      }
      
      // Fetch project memberships for all projects
      const { data, error } = await supabase
        .from('ota_project_members')
        .select('project_id, role, is_active')
        .in('project_id', projectIds)
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (error) {
        console.error('Error fetching project roles:', error);
        // Fallback based on global role
      }
      
      // Convert to map: projectId -> role
      const roleMap: Record<string, OtaProjectRole> = {};
      data?.forEach(member => {
        roleMap[member.project_id] = member.role as OtaProjectRole;
      });
      
      // For OTA roles without explicit project membership, use default role
      // This allows ota_staff/ota_lead to interact with tasks they're assigned to
      const isOtaLead = userRole === 'ota_lead';
      const isOtaStaff = userRole === 'ota_staff';
      
      if (isOtaLead || isOtaStaff) {
        projectIds.forEach(projectId => {
          // Only set default if not already a member
          if (!roleMap[projectId]) {
            roleMap[projectId] = isOtaLead ? 'LEAD' : 'STAFF';
          }
        });
      }
      
      return roleMap;
    },
    enabled: projectIds.length > 0 && !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// ============================================================
// EVIDENCE HOOKS - PHASE 2 REAL CRUD
// ============================================================

export type EvidenceReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';

export interface TaskEvidenceDetail {
  id: string;
  task_id: string;
  evidence_type: 'FILE' | 'URL' | 'TEXT';
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  external_url: string | null;
  description: string | null;
  review_status: EvidenceReviewStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  created_by: string | null;
  // Joined fields
  author_name?: string;
  author_email?: string;
  reviewer_name?: string;
}

export interface TaskEvidenceListResponse {
  success: boolean;
  error?: string;
  message?: string;
  evidence?: TaskEvidenceDetail[];
  summary?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
}

/**
 * Fetch evidence for a task with author names
 */
export function useTaskEvidence(taskId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-task-evidence', taskId],
    queryFn: async (): Promise<TaskEvidenceListResponse> => {
      if (!taskId) throw new Error('Task ID required');
      
      // Try RPC first
      const { data: rpcData, error: rpcError } = await safeRpc(() => supabase.rpc('ota_get_task_evidence' as any, {
        p_task_id: taskId,
      }));
      
      if (!rpcError && rpcData) {
        const result = rpcData as unknown as TaskEvidenceListResponse;
        if (result.success) return result;
      }
      
      // Fallback to direct query
      const { data, error } = await supabase
        .from('ota_task_evidence')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const evidence = (data || []) as unknown as TaskEvidenceDetail[];
      const summary = {
        total: evidence.length,
        approved: evidence.filter(e => e.review_status === 'APPROVED').length,
        pending: evidence.filter(e => e.review_status === 'PENDING').length,
        rejected: evidence.filter(e => e.review_status === 'REJECTED' || e.review_status === 'NEEDS_REVISION').length,
      };
      
      return { success: true, evidence, summary };
    },
    enabled: !!user && !!taskId,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Upload file evidence to Supabase Storage + create record
 */
export function useUploadEvidence() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      file?: File;
      externalUrl?: string;
      description?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');
      
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;
      let mimeType: string | null = null;
      let evidenceType: 'DOCUMENT' | 'IMAGE' | 'SCREENSHOT' | 'VIDEO' | 'LINK' | 'OTHER' = 'LINK';
      
      // If file provided, upload to Storage
      if (params.file) {
        // Determine evidence type from MIME type
        if (params.file.type.startsWith('image/')) {
          evidenceType = params.file.type.includes('screenshot') ? 'SCREENSHOT' : 'IMAGE';
        } else if (params.file.type.startsWith('video/')) {
          evidenceType = 'VIDEO';
        } else {
          evidenceType = 'DOCUMENT';
        }
        fileName = params.file.name;
        fileSize = params.file.size;
        mimeType = params.file.type;
        
        // Create unique path: task-evidence/{task_id}/{timestamp}_{filename}
        const timestamp = Date.now();
        const safeName = params.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `task-evidence/${params.taskId}/${timestamp}_${safeName}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('ota-evidence')
          .upload(filePath, params.file, {
            cacheControl: '3600',
            upsert: false,
          });
        
        if (uploadError) {
          // Check if bucket exists
          if (uploadError.message?.includes('Bucket not found')) {
            throw new Error('Storage bucket not configured. Please contact admin.');
          }
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('ota-evidence')
          .getPublicUrl(uploadData.path);
        
        fileUrl = urlData.publicUrl;
      }
      
      // Insert evidence record
      const { data, error } = await supabase
        .from('ota_task_evidence')
        .insert([{
          task_id: params.taskId,
          evidence_type: evidenceType as any,
          file_url: fileUrl,
          file_name: fileName,
          file_size_bytes: fileSize,
          mime_type: mimeType,
          external_url: params.externalUrl || null,
          description: params.description || null,
          review_status: 'PENDING' as any,
          created_by: user.id,
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      return { success: true, evidence_id: data.id };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-evidence', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
    },
  });
}

// NOTE: useReviewEvidence is defined earlier in the file (around line 1147)

/**
 * Delete evidence - only author can delete pending evidence
 */
export function useDeleteEvidence() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      evidenceId: string;
      taskId: string;
      fileUrl?: string;
    }) => {
      // Delete from storage if file exists
      if (params.fileUrl) {
        const path = params.fileUrl.split('/ota-evidence/')[1];
        if (path) {
          await supabase.storage.from('ota-evidence').remove([path]);
        }
      }
      
      // Delete record
      const { error } = await supabase
        .from('ota_task_evidence')
        .delete()
        .eq('id', params.evidenceId);
      
      if (error) throw error;
      
      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ota-task-evidence', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['ota-task-detail', variables.taskId] });
    },
  });
}

// ============================================================
// TASK CONTEXT - PHASE 3 (Context Panel)
// ============================================================

/**
 * Comprehensive task context for Context Panel
 * Fetches task + project + evidence + comments in optimized queries
 */
export interface TaskContextData {
  task: OtaTask | null;
  project: OtaProject | null;
  evidence: TaskEvidence[];
  comments: TaskComment[];
  isLoading: boolean;
  error: Error | null;
}

export interface TaskEvidence {
  id: string;
  task_id: string;
  evidence_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  description: string | null;
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  created_by: string | null;
  author_name?: string;
  reviewer_name?: string;
}

export function useTaskContext(taskId: string | null) {
  const { user } = useAuth();
  
  // Fetch task details
  const taskQuery = useQuery({
    queryKey: ['ota-task-context', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      
      const { data, error } = await supabase
        .from('ota_tasks')
        .select(`
          *,
          ota_projects(id, name, description, property_id, work_type, status, start_date, due_date)
        `)
        .eq('id', taskId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!taskId && !!user,
  });

  // Fetch evidence
  const evidenceQuery = useQuery({
    queryKey: ['ota-task-evidence', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      
      const { data, error } = await supabase
        .from('ota_task_evidence')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as TaskEvidence[];
    },
    enabled: !!taskId && !!user,
  });

  // Fetch comments
  const commentsQuery = useTaskComments(taskId || '');

  return {
    task: taskQuery.data ? {
      ...taskQuery.data,
      project_name: taskQuery.data.ota_projects?.name,
      work_type: taskQuery.data.ota_projects?.work_type,
    } as OtaTask : null,
    project: taskQuery.data?.ota_projects as OtaProject | null,
    evidence: evidenceQuery.data || [],
    comments: commentsQuery.data?.comments || [],
    isLoading: taskQuery.isLoading || evidenceQuery.isLoading || commentsQuery.isLoading,
    error: taskQuery.error || evidenceQuery.error || commentsQuery.error,
  };
}

// ============================================================
// TASK TIMELINE - PHASE 3 (Audit Log → Story)
// ============================================================

export interface TimelineEvent {
  id: string;
  timestamp: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  override_type: string | null;
  description: string; // Human-readable story
  icon: string;
  color: string;
}

/**
 * Fetch and transform audit log into story-style timeline
 */
export function useTaskTimeline(taskId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['ota-task-timeline', taskId],
    queryFn: async (): Promise<TimelineEvent[]> => {
      if (!taskId) return [];
      
      // Fetch audit logs for this task
      const { data: logs, error } = await supabase
        .from('ota_audit_log')
        .select('*')
        .eq('entity_type', 'TASK')
        .eq('entity_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.warn('[Timeline] Failed to fetch audit logs:', error.message);
        return [];
      }
      
      if (!logs || logs.length === 0) return [];
      
      // Fetch user names for actors
      const actorIds = [...new Set(logs.map(l => l.performed_by).filter(Boolean))];
      const userNames: Record<string, string> = {};
      
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', actorIds);
        
        profiles?.forEach(p => {
          userNames[p.id] = p.full_name || p.email || 'Unknown';
        });
      }
      
      // Transform to timeline events
      return logs.map(log => ({
        id: log.id,
        timestamp: log.performed_at,
        actor_id: log.performed_by,
        actor_name: log.performed_by ? (userNames[log.performed_by] || 'Unknown') : 'Hệ thống',
        action: log.action,
        old_value: (log.old_data as any)?.status || null,
        new_value: (log.new_data as any)?.status || null,
        reason: (log.new_data as any)?.reason || null,
        override_type: (log.new_data as any)?.override_type || null,
        description: formatTimelineDescription(log, userNames),
        icon: getTimelineIcon(log.action),
        color: getTimelineColor(log.action),
      }));
    },
    enabled: !!taskId && !!user,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

function formatTimelineDescription(
  log: any,
  userNames: Record<string, string>
): string {
  const actorName = log.actor_id ? (userNames[log.actor_id] || 'Ai đó') : 'Hệ thống';
  
  switch (log.action) {
    case 'TASK_CREATED':
      return `${actorName} tạo task`;
    
    case 'STATUS_CHANGED': {
      const statusLabels: Record<string, string> = {
        TODO: 'Chờ xử lý',
        IN_PROGRESS: 'Đang làm',
        REVIEW: 'Chờ duyệt',
        DONE: 'Hoàn thành',
        BLOCKED: 'Bị chặn',
        CANCELLED: 'Đã hủy',
      };
      return `${actorName} chuyển trạng thái từ "${statusLabels[log.old_value] || log.old_value}" sang "${statusLabels[log.new_value] || log.new_value}"${log.reason ? ` - Lý do: ${log.reason}` : ''}`;
    }
    
    case 'ASSIGNEE_CHANGED':
      return `${actorName} gán task cho ${log.new_value || 'người khác'}`;
    
    case 'EVIDENCE_SUBMITTED':
      return `${actorName} nộp kết quả: ${log.new_value || 'file'}`;
    
    case 'EVIDENCE_REVIEWED':
      return `${actorName} duyệt kết quả: ${log.new_value}${log.reason ? ` - ${log.reason}` : ''}`;
    
    case 'COMMENT_ADDED':
      return `${actorName} bình luận`;
    
    case 'PRIORITY_CHANGED':
      return `${actorName} đổi ưu tiên: ${log.old_value} → ${log.new_value}`;
    
    case 'SUPER_ADMIN_OVERRIDE':
      return `⚡ ${actorName} override: ${log.override_type}${log.reason ? ` - ${log.reason}` : ''}`;
    
    default:
      return `${actorName} thực hiện: ${log.action}`;
  }
}

function getTimelineIcon(action: string): string {
  switch (action) {
    case 'TASK_CREATED': return '➕';
    case 'STATUS_CHANGED': return '🔄';
    case 'ASSIGNEE_CHANGED': return '👤';
    case 'EVIDENCE_SUBMITTED': return '📎';
    case 'EVIDENCE_REVIEWED': return '✅';
    case 'COMMENT_ADDED': return '💬';
    case 'PRIORITY_CHANGED': return '🔥';
    case 'SUPER_ADMIN_OVERRIDE': return '⚡';
    default: return '📝';
  }
}

function getTimelineColor(action: string): string {
  switch (action) {
    case 'TASK_CREATED': return 'text-info';
    case 'STATUS_CHANGED': return 'text-primary';
    case 'ASSIGNEE_CHANGED': return 'text-info';
    case 'EVIDENCE_SUBMITTED': return 'text-warning';
    case 'EVIDENCE_REVIEWED': return 'text-success';
    case 'COMMENT_ADDED': return 'text-muted-foreground';
    case 'PRIORITY_CHANGED': return 'text-warning';
    case 'SUPER_ADMIN_OVERRIDE': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
}

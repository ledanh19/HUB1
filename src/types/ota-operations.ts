// ============================================================
// OTA OPERATIONS MODULE - TypeScript Types
// ============================================================
// Generated: 2026-01-07
// Purpose: Frontend type definitions for OTA Operations module
// ============================================================

// ============================================================
// ENUMS
// ============================================================

export type OtaProjectStatus = 
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'ARCHIVED';

export type OtaProjectRole = 
  | 'STAFF'
  | 'LEAD'
  | 'ADMIN';

export type OtaTaskStatus = 
  | 'TODO'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'DONE'
  | 'BLOCKED'
  | 'CANCELLED';

export type OtaTaskPriority = 
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT';

export type OtaEvidenceType = 
  | 'SCREENSHOT'
  | 'DOCUMENT'
  | 'SPREADSHEET'
  | 'IMAGE'
  | 'VIDEO'
  | 'LINK'
  | 'NOTE'
  | 'OTHER';

export type OtaEvidenceReviewStatus = 
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_REVISION';

// ============================================================
// CORE TYPES
// ============================================================

export interface OtaProject {
  id: string;
  name: string;
  description: string | null;
  property_id: string;  // FK to properties_mirror.id
  status: OtaProjectStatus;
  start_date: string | null;  // ISO date
  due_date: string | null;    // ISO date
  completed_at: string | null; // ISO timestamp
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface OtaProjectMember {
  project_id: string;
  user_id: string;
  role: OtaProjectRole;
  assigned_at: string;
  assigned_by: string;
  is_active: boolean;
  deactivated_at: string | null;
  deactivated_by: string | null;
}

export interface OtaTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  status: OtaTaskStatus;
  priority: OtaTaskPriority;
  due_date: string | null;     // ISO date
  started_at: string | null;   // ISO timestamp
  completed_at: string | null; // ISO timestamp
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface OtaTaskEvidence {
  id: string;
  task_id: string;
  evidence_type: OtaEvidenceType;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  description: string | null;
  review_status: OtaEvidenceReviewStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
  created_by: string;
}

// ============================================================
// RPC REQUEST TYPES
// ============================================================

export interface CreateTaskRequest {
  p_project_id: string;
  p_title: string;
  p_description?: string;
  p_assignee_id?: string;
  p_priority?: OtaTaskPriority;
  p_due_date?: string;
  p_estimated_hours?: number;
  p_tags?: string[];
}

export interface UpdateTaskStatusRequest {
  p_task_id: string;
  p_new_status: OtaTaskStatus;
  p_actual_hours?: number;
}

export interface AssignTaskRequest {
  p_task_id: string;
  p_assignee_id: string | null;
}

export interface GetMyTasksRequest {
  p_status?: OtaTaskStatus;
  p_project_id?: string;
}

export interface SubmitEvidenceRequest {
  p_task_id: string;
  p_evidence_type: OtaEvidenceType;
  p_file_url?: string;
  p_file_name?: string;
  p_file_size_bytes?: number;
  p_mime_type?: string;
  p_description?: string;
}

export interface ReviewEvidenceRequest {
  p_evidence_id: string;
  p_review_status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  p_review_notes?: string;
}

export interface GetKpiRequest {
  p_start_date: string;  // ISO date
  p_end_date: string;    // ISO date
  p_property_ids?: string[];
  p_group_by?: 'channel' | 'property' | 'daily' | 'monthly';
}

// ============================================================
// RPC RESPONSE TYPES
// ============================================================

export interface RpcBaseResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export interface CreateTaskResponse extends RpcBaseResponse {
  task_id?: string;
}

export interface UpdateTaskStatusResponse extends RpcBaseResponse {
  task_id?: string;
  old_status?: OtaTaskStatus;
  new_status?: OtaTaskStatus;
}

export interface AssignTaskResponse extends RpcBaseResponse {
  task_id?: string;
  assignee_id?: string | null;
}

export interface GetMyTasksResponse extends RpcBaseResponse {
  tasks?: OtaTaskWithProject[];
}

export interface SubmitEvidenceResponse extends RpcBaseResponse {
  evidence_id?: string;
}

export interface ReviewEvidenceResponse extends RpcBaseResponse {
  evidence_id?: string;
  old_status?: OtaEvidenceReviewStatus;
  new_status?: OtaEvidenceReviewStatus;
}

export interface GetTaskEvidenceResponse extends RpcBaseResponse {
  task_id?: string;
  evidence?: OtaEvidenceWithUsers[];
}

export interface GetPendingReviewsResponse extends RpcBaseResponse {
  pending_reviews?: OtaPendingReview[];
}

// ============================================================
// KPI RESPONSE TYPES
// ============================================================

export interface KpiMeta {
  start_date: string;
  end_date: string;
  requested_start: string;
  requested_end: string;
  date_clamped: boolean;
  group_by: string;
  property_filter: string[] | null;
}

export interface KpiChannelData {
  channel: string;
  booking_count: number;
  total_revenue: number;
  avg_booking_value: number;
  total_nights: number;
  first_booking: string;
  last_booking: string;
}

export interface KpiPropertyData {
  property_id: string;
  property_name: string;
  booking_count: number;
  total_revenue: number;
  avg_booking_value: number;
  total_nights: number;
}

export interface KpiDailyData {
  date: string;
  booking_count: number;
  total_revenue: number;
  total_nights: number;
}

export interface KpiMonthlyData {
  month: string;
  booking_count: number;
  total_revenue: number;
  avg_booking_value: number;
  total_nights: number;
}

export interface GetKpiResponse extends RpcBaseResponse {
  meta?: KpiMeta;
  data?: KpiChannelData[] | KpiPropertyData[] | KpiDailyData[] | KpiMonthlyData[];
}

export interface KpiSummary {
  total_bookings: number;
  total_revenue: number;
  avg_booking_value: number;
  total_nights: number;
  active_channels: number;
  active_properties: number;
}

export interface GetKpiSummaryResponse extends RpcBaseResponse {
  meta?: Pick<KpiMeta, 'start_date' | 'end_date' | 'date_clamped'>;
  summary?: KpiSummary;
}

export interface ChannelComparison {
  channel: string;
  booking_count: number;
  booking_share_pct: number;
  revenue: number;
  revenue_share_pct: number;
  avg_booking_value: number;
  avg_nights: number;
}

export interface GetChannelComparisonResponse extends RpcBaseResponse {
  meta?: Pick<KpiMeta, 'start_date' | 'end_date'>;
  channels?: ChannelComparison[];
}

// ============================================================
// EXTENDED TYPES (with joins)
// ============================================================

export interface OtaTaskWithProject extends OtaTask {
  project_name: string;
  property_name: string;
}

export interface OtaEvidenceWithUsers extends OtaTaskEvidence {
  created_by_email: string;
  reviewed_by_email: string | null;
}

export interface OtaPendingReview {
  evidence_id: string;
  evidence_type: OtaEvidenceType;
  file_url: string | null;
  file_name: string | null;
  description: string | null;
  created_at: string;
  task_id: string;
  task_title: string;
  project_id: string;
  project_name: string;
  property_name: string;
  submitted_by: string;
}

export interface OtaTeamMember {
  user_id: string;
  email: string;
  role: 'ota_staff' | 'ota_lead';
  role_assigned_at: string;
  active_projects: number;
  active_tasks: number;
}

export interface GetTeamMembersResponse extends RpcBaseResponse {
  team_members?: OtaTeamMember[];
}

// ============================================================
// FORM TYPES (for UI components)
// ============================================================

export interface CreateProjectForm {
  name: string;
  description?: string;
  property_id: string;
  start_date?: string;
  due_date?: string;
}

export interface CreateTaskForm {
  project_id: string;
  title: string;
  description?: string;
  assignee_id?: string;
  priority: OtaTaskPriority;
  due_date?: string;
  estimated_hours?: number;
  tags?: string[];
}

export interface SubmitEvidenceForm {
  task_id: string;
  evidence_type: OtaEvidenceType;
  description?: string;
  file?: File;  // For upload handling
}

export interface ReviewEvidenceForm {
  evidence_id: string;
  review_status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  review_notes?: string;
}

// ============================================================
// FILTER/SORT TYPES
// ============================================================

export interface TaskFilters {
  status?: OtaTaskStatus[];
  priority?: OtaTaskPriority[];
  assignee_id?: string;
  project_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  tags?: string[];
}

export interface TaskSortOptions {
  field: 'priority' | 'due_date' | 'created_at' | 'status';
  direction: 'asc' | 'desc';
}

export interface ProjectFilters {
  status?: OtaProjectStatus[];
  property_id?: string;
}

export interface KpiFilters {
  start_date: string;
  end_date: string;
  property_ids?: string[];
  group_by: 'channel' | 'property' | 'daily' | 'monthly';
}

// ============================================================
// UTILITY TYPES
// ============================================================

export type OtaRole = 'ota_staff' | 'ota_lead';

export interface OtaUserContext {
  user_id: string;
  roles: OtaRole[];
  is_ota_role: boolean;
  is_ota_lead_or_admin: boolean;
}

// Priority color mapping
export const PRIORITY_COLORS: Record<OtaTaskPriority, string> = {
  LOW: '#6B7280',      // gray-500
  MEDIUM: '#3B82F6',   // blue-500
  HIGH: '#F59E0B',     // amber-500
  URGENT: '#EF4444',   // red-500
};

// Status color mapping
export const STATUS_COLORS: Record<OtaTaskStatus, string> = {
  TODO: '#6B7280',        // gray-500
  IN_PROGRESS: '#3B82F6', // blue-500
  REVIEW: '#8B5CF6',      // violet-500
  DONE: '#10B981',        // emerald-500
  BLOCKED: '#EF4444',     // red-500
  CANCELLED: '#9CA3AF',   // gray-400
};

// Evidence type icons (for UI)
export const EVIDENCE_TYPE_ICONS: Record<OtaEvidenceType, string> = {
  SCREENSHOT: '📸',
  DOCUMENT: '📄',
  SPREADSHEET: '📊',
  IMAGE: '🖼️',
  VIDEO: '🎬',
  LINK: '🔗',
  NOTE: '📝',
  OTHER: '📎',
};

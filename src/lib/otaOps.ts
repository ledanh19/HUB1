/**
 * OTA Operations Utilities
 * Client-side logic for task bucketing, health calculation, and date proximity
 * NO backend changes - all calculations in-memory
 */

import { differenceInDays, differenceInHours, isToday, isBefore, parseISO } from 'date-fns';

// ============================================================
// TYPES (mirror from useOtaOperations)
// ============================================================

export type OtaTaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED' | 'CANCELLED';
export type OtaTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type OtaProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

// ============================================================
// TASK CLASSIFICATION (Sprint 1 - Migration 025)
// ============================================================
export type OtaTaskClassification = 'EXECUTION' | 'PREP' | 'AUTO' | 'OPS';

export interface ClassificationConfig {
  label: string;
  labelVi: string;
  description: string;
  badgeColor: string;
  icon: string;
}

export const CLASSIFICATION_CONFIG: Record<OtaTaskClassification, ClassificationConfig> = {
  EXECUTION: {
    label: 'Execution',
    labelVi: 'Thực thi',
    description: 'Tác vụ thực thi trực tiếp (upload content, reply guest...)',
    badgeColor: 'bg-info/10 text-info border-info/20',
    icon: '⚡',
  },
  PREP: {
    label: 'Preparation',
    labelVi: 'Chuẩn bị',
    description: 'Chuẩn bị thông tin, chờ input từ bên khác',
    badgeColor: 'bg-warning/10 text-warning border-warning/20',
    icon: '📋',
  },
  AUTO: {
    label: 'Automation',
    labelVi: 'Tự động',
    description: 'Tác vụ tự động hóa (script, bot...)',
    badgeColor: 'bg-primary/10 text-primary border-primary/20',
    icon: '🤖',
  },
  OPS: {
    label: 'Operations',
    labelVi: 'Vận hành',
    description: 'Công việc vận hành nội bộ (meeting, report...)',
    badgeColor: 'bg-muted text-muted-foreground border-border',
    icon: '📊',
  },
};

export const CLASSIFICATION_OPTIONS = Object.entries(CLASSIFICATION_CONFIG).map(([value, config]) => ({
  value: value as OtaTaskClassification,
  label: config.labelVi,
  description: config.description,
  icon: config.icon,
}));

// ============================================================
// COMMON ISSUE TAGS for Ops Insight
// ============================================================
export const COMMON_ISSUE_TAGS = [
  { value: 'PRICE_MISMATCH', label: 'Sai giá', color: 'bg-destructive/10 text-destructive' },
  { value: 'NO_SHOW', label: 'No-show', color: 'bg-warning/10 text-warning' },
  { value: 'OVERBOOKING', label: 'Overbooking', color: 'bg-destructive/10 text-destructive' },
  { value: 'CONTENT_ERROR', label: 'Lỗi nội dung', color: 'bg-warning/10 text-warning' },
  { value: 'GUEST_COMPLAINT', label: 'Khiếu nại khách', color: 'bg-destructive/10 text-destructive' },
  { value: 'PAYMENT_ISSUE', label: 'Vấn đề thanh toán', color: 'bg-primary/10 text-primary' },
  { value: 'INVENTORY_SYNC', label: 'Đồng bộ inventory', color: 'bg-info/10 text-info' },
  { value: 'PROMOTION_ERROR', label: 'Lỗi promotion', color: 'bg-success/10 text-success' },
  { value: 'OTHER', label: 'Khác', color: 'bg-muted text-muted-foreground' },
];

// ============================================================
// WORK TYPE CONFIG
// ============================================================

// Sync with DB enum ota_work_type (Migration 018)
export type OtaWorkType = 
  | 'ONBOARDING'
  | 'CONTENT_UPDATE'
  | 'PROMOTION'
  | 'ISSUE_RESOLUTION'
  | 'OPTIMIZATION'
  | 'MAINTENANCE'
  | 'OTHER';

export type PropertyMode = 'REQUIRED' | 'OPTIONAL' | 'DISABLED';

export interface WorkTypeConfig {
  label: string;
  labelVi: string;
  propertyMode: PropertyMode;
  kpiEnabled: boolean;
  deadlineRequired: boolean;
  defaultPriority?: OtaTaskPriority;
  helperText?: string;
  badgeColor: string;
  icon: string;
}

export const WORK_TYPE_CONFIG: Record<OtaWorkType, WorkTypeConfig> = {
  ONBOARDING: {
    label: 'Onboarding',
    labelVi: 'Onboarding',
    propertyMode: 'OPTIONAL',
    kpiEnabled: false,
    deadlineRequired: false,
    defaultPriority: 'HIGH',
    helperText: 'Onboard property mới lên các kênh OTA',
    badgeColor: 'bg-primary/10 text-primary border border-primary/20',
    icon: '',
  },
  CONTENT_UPDATE: {
    label: 'Content Update',
    labelVi: 'Content',
    propertyMode: 'REQUIRED',
    kpiEnabled: true,
    deadlineRequired: false,
    defaultPriority: 'MEDIUM',
    helperText: 'Cập nhật ảnh, mô tả, tiện ích trên OTA',
    badgeColor: 'bg-info/10 text-info border border-info/20',
    icon: '',
  },
  PROMOTION: {
    label: 'Promotion',
    labelVi: 'Promotion',
    propertyMode: 'REQUIRED',
    kpiEnabled: true,
    deadlineRequired: true,
    defaultPriority: 'HIGH',
    helperText: 'Tạo/quản lý promotion, deal trên OTA',
    badgeColor: 'bg-success/10 text-success border border-success/20',
    icon: '',
  },
  ISSUE_RESOLUTION: {
    label: 'Issue Resolution',
    labelVi: 'Issue',
    propertyMode: 'REQUIRED',
    kpiEnabled: false,
    deadlineRequired: true,
    defaultPriority: 'URGENT',
    helperText: 'Xử lý complaint, sự cố, tranh chấp OTA',
    badgeColor: 'bg-destructive/10 text-destructive border border-destructive/20',
    icon: '',
  },
  OPTIMIZATION: {
    label: 'Optimization',
    labelVi: 'Optimize',
    propertyMode: 'REQUIRED',
    kpiEnabled: true,
    deadlineRequired: false,
    defaultPriority: 'MEDIUM',
    helperText: 'Tối ưu ranking, giá, availability',
    badgeColor: 'bg-warning/10 text-warning border border-warning/20',
    icon: '',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    labelVi: 'Maintenance',
    propertyMode: 'OPTIONAL',
    kpiEnabled: false,
    deadlineRequired: false,
    defaultPriority: 'LOW',
    helperText: 'Kiểm tra, audit chất lượng định kỳ',
    badgeColor: 'bg-muted text-muted-foreground border border-border',
    icon: '',
  },
  OTHER: {
    label: 'Other',
    labelVi: 'Other',
    propertyMode: 'OPTIONAL',
    kpiEnabled: false,
    deadlineRequired: false,
    defaultPriority: 'MEDIUM',
    helperText: 'Công việc khác không thuộc nhóm trên',
    badgeColor: 'bg-muted/60 text-muted-foreground border border-border',
    icon: '',
  },
};

export const WORK_TYPE_OPTIONS = Object.entries(WORK_TYPE_CONFIG).map(([value, config]) => ({
  value: value as OtaWorkType,
  label: config.labelVi,
  icon: config.icon,
}));

export interface OtaTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: OtaTaskStatus;
  priority: OtaTaskPriority;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  project_name?: string;
  property_name?: string;
  assignee_email?: string;
  assignee_name?: string;
  // Creator info for audit trail
  created_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  // Extended fields for Task Card Intelligence (Phase 1)
  work_type?: OtaWorkType | null;
  evidence_count?: number;
  comment_count?: number;
  // Trello-style fields (Phase 2)
  cover_image_url?: string | null;
  approved_evidence_count?: number;
  // Sprint 1 - Classification & Issue Tag (Migration 025/026/028)
  classification?: OtaTaskClassification | null;
  issue_tag?: string | null;
  expected_effort_minutes?: number | null;
  actual_effort_minutes?: number | null;
  min_evidence_count?: number | null;
  // Sprint 1 Fix - Evidence requirement flag (Migration 028)
  require_evidence?: boolean | null;
  // Sprint 2 - Quick Task (Migration 029)
  is_quick_task?: boolean | null;
}

export interface OtaProject {
  id: string;
  name: string;
  description: string | null;
  property_id: string | null;
  work_type: OtaWorkType;
  status: OtaProjectStatus;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  property_name?: string;
  task_count?: number;
  completed_task_count?: number;
  // Sprint 2 - Ops Bucket (Migration 029)
  is_ops_bucket?: boolean | null;
  bucket_date?: string | null;
}

// ============================================================
// TASK BUCKETS (for My Tasks view)
// ============================================================

export interface TaskBuckets {
  // Group 1: Assigned Tasks (from projects)
  urgent: OtaTask[];      // 🔥 CẦN LÀM NGAY
  review: OtaTask[];      // ⏳ ĐANG CHỜ REVIEW
  blocked: OtaTask[];     // 🚫 BỊ BLOCK
  later: OtaTask[];       // 🧠 CÓ THỂ LÀM SAU
  // Group 2: Quick Tasks - Today (Ops Bucket)
  quickTasksToday: OtaTask[];  // ⚡ QUICK TASKS HÔM NAY
}

/**
 * Calculate task buckets based on action priority (not just dates)
 * Separates Quick Tasks into their own bucket
 */
export function calculateTaskBuckets(tasks: OtaTask[]): TaskBuckets {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  const urgent: OtaTask[] = [];
  const review: OtaTask[] = [];
  const blocked: OtaTask[] = [];
  const later: OtaTask[] = [];
  const quickTasksToday: OtaTask[] = [];
  
  tasks.forEach(task => {
    // Skip completed/cancelled
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      return;
    }
    
    // Quick Tasks go to separate bucket
    if (task.is_quick_task) {
      // Check if created today or due today
      const createdDate = task.created_at?.split('T')[0];
      const dueDate = task.due_date?.split('T')[0];
      
      if (createdDate === todayStr || dueDate === todayStr || !task.due_date) {
        quickTasksToday.push(task);
      } else {
        // Quick tasks from other days go to urgent/later based on date
        const dueDateParsed = task.due_date ? parseISO(task.due_date) : null;
        if (dueDateParsed && (isBefore(dueDateParsed, now) || isToday(dueDateParsed))) {
          urgent.push(task);
        } else {
          later.push(task);
        }
      }
      return;
    }
    
    // Regular tasks - BLOCKED bucket
    if (task.status === 'BLOCKED') {
      blocked.push(task);
      return;
    }
    
    // REVIEW bucket
    if (task.status === 'REVIEW') {
      review.push(task);
      return;
    }
    
    // URGENT bucket (overdue or due today)
    if (task.due_date) {
      const dueDate = parseISO(task.due_date);
      const isOverdue = isBefore(dueDate, now) && !isToday(dueDate);
      const isDueToday = isToday(dueDate);
      
      if (isOverdue || isDueToday) {
        urgent.push(task);
        return;
      }
    }
    
    // LATER bucket (upcoming)
    later.push(task);
  });
  
  // Sort each bucket
  // Urgent: priority DESC, due date ASC
  urgent.sort((a, b) => {
    const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
  });
  
  // Review: created at DESC (newest first)
  review.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime());
  
  // Blocked: updated at DESC (most recently blocked first)
  blocked.sort((a, b) => parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime());
  
  // Later: due date ASC (soonest first)
  later.sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
  });
  
  // Quick Tasks Today: priority DESC, created at DESC
  quickTasksToday.sort((a, b) => {
    const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime();
  });
  
  return { urgent, review, blocked, later, quickTasksToday };
}

// ============================================================
// PROJECT HEALTH CALCULATION
// ============================================================

export type ProjectHealth = 'RED' | 'YELLOW' | 'GREEN';

export interface ProjectHealthData {
  health: ProjectHealth;
  overdueCount: number;
  blockedCount: number;
  maxBlockedHours: number;
  completionPercent: number;
  totalTasks: number;
  completedTasks: number;
}

/**
 * Calculate project health based on task status
 * RED: >20% overdue OR any blocked >48h
 * YELLOW: 1-20% overdue
 * GREEN: no overdue
 */
export function calculateProjectHealth(
  projectId: string,
  allTasks: OtaTask[]
): ProjectHealthData {
  const now = new Date();
  const projectTasks = allTasks.filter(t => t.project_id === projectId);
  
  if (projectTasks.length === 0) {
    return {
      health: 'GREEN',
      overdueCount: 0,
      blockedCount: 0,
      maxBlockedHours: 0,
      completionPercent: 0,
      totalTasks: 0,
      completedTasks: 0,
    };
  }
  
  // Count overdue tasks
  const overdueTasks = projectTasks.filter(t => {
    if (t.status === 'DONE' || t.status === 'CANCELLED') return false;
    if (!t.due_date) return false;
    const dueDate = parseISO(t.due_date);
    return isBefore(dueDate, now) && !isToday(dueDate);
  });
  
  // Count blocked tasks and max duration
  const blockedTasks = projectTasks.filter(t => t.status === 'BLOCKED');
  const maxBlockedHours = blockedTasks.reduce((max, task) => {
    const blockedSince = parseISO(task.updated_at); // Approximation
    const hours = differenceInHours(now, blockedSince);
    return Math.max(max, hours);
  }, 0);
  
  // Completion stats
  const completedTasks = projectTasks.filter(t => t.status === 'DONE').length;
  const completionPercent = Math.round((completedTasks / projectTasks.length) * 100);
  
  // Overdue percentage
  const overduePercent = overdueTasks.length / projectTasks.length;
  
  // Determine health
  let health: ProjectHealth = 'GREEN';
  
  if (overduePercent > 0.2 || maxBlockedHours > 48) {
    health = 'RED';
  } else if (overduePercent > 0) {
    health = 'YELLOW';
  }
  
  return {
    health,
    overdueCount: overdueTasks.length,
    blockedCount: blockedTasks.length,
    maxBlockedHours,
    completionPercent,
    totalTasks: projectTasks.length,
    completedTasks,
  };
}

// ============================================================
// DUE DATE PROXIMITY
// ============================================================

export interface DueDateProximity {
  label: string;
  color: string;
  isOverdue: boolean;
  isToday: boolean;
  daysRemaining: number;
}

/**
 * Get due date proximity info for visual indicators
 */
export function getDueDateProximity(dueDate: string | null): DueDateProximity {
  if (!dueDate) {
    return {
      label: 'Chưa có deadline',
      color: 'text-muted-foreground',
      isOverdue: false,
      isToday: false,
      daysRemaining: Infinity,
    };
  }
  
  const now = new Date();
  const due = parseISO(dueDate);
  const days = differenceInDays(due, now);
  
  // Overdue
  if (isBefore(due, now) && !isToday(due)) {
    const overdueDays = Math.abs(days);
    return {
      label: `Trễ ${overdueDays} ngày`,
      color: 'text-destructive',
      isOverdue: true,
      isToday: false,
      daysRemaining: days,
    };
  }
  
  // Due today
  if (isToday(due)) {
    return {
      label: 'Hôm nay',
      color: 'text-warning',
      isOverdue: false,
      isToday: true,
      daysRemaining: 0,
    };
  }
  
  // Due soon (1-3 days)
  if (days >= 0 && days <= 3) {
    return {
      label: `Còn ${days} ngày`,
      color: 'text-warning',
      isOverdue: false,
      isToday: false,
      daysRemaining: days,
    };
  }
  
  // Future
  return {
    label: `Còn ${days} ngày`,
    color: 'text-muted-foreground',
    isOverdue: false,
    isToday: false,
    daysRemaining: days,
  };
}

// ============================================================
// BOARD VIEW GROUPING
// ============================================================

export interface BoardColumn {
  status: OtaTaskStatus;
  label: string;
  tasks: OtaTask[];
  overdueCount: number;
}

/**
 * Group tasks by status for Kanban board view
 */
export function groupTasksByStatus(tasks: OtaTask[]): BoardColumn[] {
  const now = new Date();
  
  const columns: BoardColumn[] = [
    { status: 'TODO', label: 'Chờ xử lý', tasks: [], overdueCount: 0 },
    { status: 'IN_PROGRESS', label: 'Đang làm', tasks: [], overdueCount: 0 },
    { status: 'REVIEW', label: 'Chờ duyệt', tasks: [], overdueCount: 0 },
    { status: 'DONE', label: 'Hoàn thành', tasks: [], overdueCount: 0 },
    { status: 'BLOCKED', label: 'Bị chặn', tasks: [], overdueCount: 0 },
    { status: 'CANCELLED', label: 'Đã hủy', tasks: [], overdueCount: 0 },
  ];
  
  tasks.forEach(task => {
    const column = columns.find(c => c.status === task.status);
    if (!column) return;
    
    column.tasks.push(task);
    
    // Count overdue
    if (task.due_date && task.status !== 'DONE' && task.status !== 'CANCELLED') {
      const dueDate = parseISO(task.due_date);
      if (isBefore(dueDate, now) && !isToday(dueDate)) {
        column.overdueCount++;
      }
    }
  });
  
  // Sort tasks within each column by priority then due date
  columns.forEach(column => {
    column.tasks.sort((a, b) => {
      const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
    });
  });
  
  return columns;
}

// ============================================================
// BLOCKED DURATION
// ============================================================

/**
 * Calculate how long a task has been blocked (in hours)
 */
export function getBlockedDuration(task: OtaTask): number {
  if (task.status !== 'BLOCKED') return 0;
  const blockedSince = parseISO(task.updated_at);
  return differenceInHours(new Date(), blockedSince);
}

/**
 * Format blocked duration in human-readable format
 */
export function formatBlockedDuration(hours: number): string {
  if (hours < 24) {
    return `${Math.round(hours)} giờ`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ngày`;
}

// ============================================================
// DRAG & DROP PERMISSIONS
// ============================================================

export type OtaProjectRole = 'STAFF' | 'LEAD' | 'ADMIN';

export interface DragDropContext {
  projectRole: OtaProjectRole; // CHANGED: Use project role instead of global role
  userId: string;
  task: OtaTask;
  fromStatus: OtaTaskStatus;
  toStatus: OtaTaskStatus;
  isProjectMember: boolean; // NEW: Must be project member
}

export interface DragDropBehavior {
  allowed: boolean;
  requiresReason: boolean;
  requiresConfirm: boolean;
  denyMessage?: string;
}

/**
 * State machine for allowed task status transitions
 */
const STATUS_TRANSITIONS: Record<OtaTaskStatus, OtaTaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED', 'CANCELLED', 'TODO'], // TODO requires confirmation
  REVIEW: ['DONE', 'IN_PROGRESS', 'BLOCKED'],
  DONE: [], // Cannot move from DONE
  BLOCKED: ['IN_PROGRESS'],
  CANCELLED: [], // Cannot move from CANCELLED
};

/**
 * Check if a status transition is valid in the state machine
 */
function isValidTransition(from: OtaTaskStatus, to: OtaTaskStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Determine drag & drop behavior based on PROJECT-BASED RBAC rules
 * 
 * CRITICAL: User MUST be project member (ota_project_members) to perform ANY action
 * Permissions based on project_role (STAFF/LEAD/ADMIN), NOT global role
 */
export function getDropBehavior(context: DragDropContext): DragDropBehavior {
  const { projectRole, userId, task, fromStatus, toStatus, isProjectMember } = context;

  // RULE 0: Must be project member
  if (!isProjectMember) {
    return {
      allowed: false,
      requiresReason: false,
      requiresConfirm: false,
      denyMessage: 'Bạn không thuộc dự án này',
    };
  }

  // Deny if same status
  if (fromStatus === toStatus) {
    return { allowed: false, requiresReason: false, requiresConfirm: false };
  }

  // Deny if not a valid transition
  if (!isValidTransition(fromStatus, toStatus)) {
    return {
      allowed: false,
      requiresReason: false,
      requiresConfirm: false,
      denyMessage: 'Không thể chuyển trạng thái này',
    };
  }

  // Check if user is assignee
  const isAssignee = task.assignee_id === userId;

  // ================ PROJECT ROLE: STAFF ================
  if (projectRole === 'STAFF') {
    // STAFF: Must be assignee to do ANYTHING
    if (!isAssignee) {
      return {
        allowed: false,
        requiresReason: false,
        requiresConfirm: false,
        denyMessage: 'Staff chỉ có thể thao tác task được giao cho mình',
      };
    }

    // Allowed transitions for STAFF (only on own tasks)
    const staffAllowed = [
      { from: 'TODO', to: 'IN_PROGRESS' },
      { from: 'IN_PROGRESS', to: 'REVIEW' },
      { from: 'BLOCKED', to: 'IN_PROGRESS' },
    ];

    // ANY → BLOCKED (requires reason)
    if (toStatus === 'BLOCKED') {
      return { allowed: true, requiresReason: true, requiresConfirm: false };
    }

    // Check if transition is in allowed list
    const isAllowed = staffAllowed.some(t => t.from === fromStatus && t.to === toStatus);
    if (isAllowed) {
      return { allowed: true, requiresReason: false, requiresConfirm: false };
    }

    // REVIEW → DONE: explicitly denied for STAFF
    if (fromStatus === 'REVIEW' && toStatus === 'DONE') {
      return {
        allowed: false,
        requiresReason: false,
        requiresConfirm: false,
        denyMessage: 'Cần Lead/Admin duyệt hoàn thành',
      };
    }

    // All other transitions denied
    return {
      allowed: false,
      requiresReason: false,
      requiresConfirm: false,
      denyMessage: 'Bạn không có quyền thực hiện thao tác này',
    };
  }

  // ================ PROJECT ROLE: LEAD ================
  if (projectRole === 'LEAD') {
    // LEAD: Can operate on ANY task in project

    // TO BLOCKED: always requires reason
    if (toStatus === 'BLOCKED') {
      return { allowed: true, requiresReason: true, requiresConfirm: false };
    }

    // TO CANCELLED: requires reason (Phase 2)
    if (toStatus === 'CANCELLED') {
      return { allowed: true, requiresReason: true, requiresConfirm: false };
    }

    // Revert (IN_PROGRESS → TODO): requires confirmation + reason (Phase 2)
    if (fromStatus === 'IN_PROGRESS' && toStatus === 'TODO') {
      return { allowed: true, requiresReason: true, requiresConfirm: true };
    }

    // REVIEW → DONE: allowed without extra steps (LEAD can approve)
    if (fromStatus === 'REVIEW' && toStatus === 'DONE') {
      return { allowed: true, requiresReason: false, requiresConfirm: false };
    }

    // All other valid transitions allowed
    return { allowed: true, requiresReason: false, requiresConfirm: false };
  }

  // ================ PROJECT ROLE: ADMIN ================
  if (projectRole === 'ADMIN') {
    // ADMIN: Like LEAD + more control

    // TO BLOCKED: requires reason
    if (toStatus === 'BLOCKED') {
      return { allowed: true, requiresReason: true, requiresConfirm: false };
    }

    // TO CANCELLED: requires reason
    if (toStatus === 'CANCELLED') {
      return { allowed: true, requiresReason: true, requiresConfirm: false };
    }

    // Revert (IN_PROGRESS → TODO): requires confirmation + reason
    if (fromStatus === 'IN_PROGRESS' && toStatus === 'TODO') {
      return { allowed: true, requiresReason: true, requiresConfirm: true };
    }

    // Reopen (DONE → REVIEW): requires confirmation + reason (Phase 2)
    if (fromStatus === 'DONE' && toStatus === 'REVIEW') {
      return { allowed: true, requiresReason: true, requiresConfirm: true };
    }

    // All other valid transitions allowed (including REVIEW → DONE)
    return { allowed: true, requiresReason: false, requiresConfirm: false };
  }

  // Default deny (should not reach here)
  return {
    allowed: false,
    requiresReason: false,
    requiresConfirm: false,
    denyMessage: 'Không có quyền thực hiện thao tác này',
  };
}

/**
 * Simple check if user can drag a task at all (based on project role)
 * 
 * @param projectRole - User's role in the project (STAFF/LEAD/ADMIN)
 * @param userId - Current user ID
 * @param task - Task to check
 * @param isProjectMember - Whether user is member of task's project
 */
export function canDragTask(
  projectRole: OtaProjectRole | null,
  userId: string,
  task: OtaTask,
  isProjectMember: boolean
): boolean {
  // Cannot drag if not project member
  if (!isProjectMember) {
    return false;
  }

  // Cannot drag DONE or CANCELLED
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    return false;
  }

  // No project role = cannot drag
  if (!projectRole) {
    return false;
  }

  // STAFF can only drag their own tasks
  if (projectRole === 'STAFF') {
    return task.assignee_id === userId;
  }

  // LEAD/ADMIN can drag any task in project
  return true;
}

/**
 * Evidence & Task Panel Types
 * Core types for Trello-style side panel workflow
 */

// === EVIDENCE ===

export type EvidenceStatus = 'pending' | 'approved' | 'rejected';

export interface Evidence {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_type: 'image' | 'pdf' | 'document' | 'other';
  file_size: number;
  thumbnail_url?: string;
  status: EvidenceStatus;
  uploaded_by: string;
  uploaded_by_name?: string;
  uploaded_at: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export const EVIDENCE_STATUS_CONFIG: Record<EvidenceStatus, {
  label: string;
  variant: 'outline' | 'success' | 'destructive';
}> = {
  pending: { label: 'Chờ duyệt', variant: 'outline' },
  approved: { label: 'Đã duyệt', variant: 'success' },
  rejected: { label: 'Từ chối', variant: 'destructive' },
};

// === COMMENTS ===

export interface CommentAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  thumbnail_url?: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  content: string;
  attachments: CommentAttachment[];
  author_id: string;
  author_name: string;
  author_avatar?: string;
  created_at: string;
  updated_at?: string;
  is_deleted: boolean;
}

// === HISTORY ===

export type HistoryEventType =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'reassigned'
  | 'evidence_uploaded'
  | 'evidence_approved'
  | 'evidence_rejected'
  | 'comment_added'
  | 'deadline_changed'
  | 'priority_changed';

export interface TaskHistoryEvent {
  id: string;
  task_id: string;
  event_type: HistoryEventType;
  description: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
  metadata?: Record<string, any>;
}

// === PANEL STATE ===

export type PanelTab = 'overview' | 'evidence' | 'comments' | 'history';

export const PANEL_TABS: { key: PanelTab; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'evidence', label: 'Kết quả' },
  { key: 'comments', label: 'Bình luận' },
  { key: 'history', label: 'Lịch sử' },
];

// === FILE PREVIEW ===

export type PreviewableFileType = 'image' | 'pdf' | 'document' | 'other';

export const ACCEPTED_FILE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function getFileType(mimeType: string): PreviewableFileType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('excel')) {
    return 'document';
  }
  return 'other';
}

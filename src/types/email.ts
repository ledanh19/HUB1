/**
 * Email Module Types
 * ═══════════════════════════════════════════════════════════
 */

// ─── Account ────────────────────────────────────────────────
export type EmailProvider = 'gmail';
export type EmailAccountStatus = 'ACTIVE' | 'REVOKED' | 'ERROR' | 'REAUTH_REQUIRED';
export type EmailScopeLevel = 'READ_ONLY' | 'REPLY' | 'FULL_MODIFY';

export interface EmailAccount {
  id: string;
  tenant_id: string;
  created_by: string;
  provider: EmailProvider;
  email_address: string;
  status: EmailAccountStatus;
  scope_level: EmailScopeLevel;
  visibility: 'TEAM' | 'PRIVATE';
  last_sync_at: string | null;
  error_code: string | null;
  error_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Thread ─────────────────────────────────────────────────
export interface EmailParticipant {
  name: string;
  email: string;
}

export interface EmailThread {
  id: string;
  tenant_id: string;
  email_account_id: string;
  provider_thread_id: string;
  subject: string | null;
  snippet: string | null;
  participants: EmailParticipant[];
  last_message_at: string | null;
  unread_count: number;
  labels: string[];
  created_at: string;
  updated_at: string;
  // Joined from email_accounts
  email_accounts?: {
    email_address: string;
    provider: EmailProvider;
  };
  // Joined from email_thread_workflow (list query)
  email_thread_workflow?: {
    status: EmailWorkflowStatus;
    assigned_to: string | null;
    booking_unified_id: string | null;
  } | null;
}

// ─── Message ────────────────────────────────────────────────
export type EmailDirection = 'INBOUND' | 'OUTBOUND';

export interface EmailAttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  tenant_id: string;
  email_account_id: string;
  thread_id: string;
  provider_message_id: string;
  direction: EmailDirection;
  from_json: EmailParticipant[];
  to_json: EmailParticipant[];
  cc_json: EmailParticipant[];
  bcc_json: EmailParticipant[];
  date: string;
  sent_at?: string;
  subject: string | null;
  headers: Record<string, string>;
  // V2 canonical names
  body_text: string | null;
  body_html: string | null;
  // V1 backward-compat aliases (overlay view may still return these)
  body_plain?: string | null;
  body_html_sanitized?: string | null;
  has_attachments: boolean;
  attachments_json: EmailAttachmentMeta[];
  created_at: string;
  updated_at: string;
  // V2 operational fields
  sender?: string;
  recipients?: EmailParticipant[];
  status?: string;
  message_id?: string;
  in_reply_to?: string;
}

// ─── Audit ──────────────────────────────────────────────────
export interface EmailAuditEntry {
  id: string;
  tenant_id: string;
  actor_user_id: string;
  action: string;
  email_account_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

// ─── Workflow ───────────────────────────────────────────────
export type EmailWorkflowStatus = 'OPEN' | 'IN_PROGRESS' | 'NEED_FOLLOWUP' | 'DONE';

export interface EmailThreadWorkflow {
  id: string;
  thread_id: string;
  status: EmailWorkflowStatus;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  booking_unified_id: string | null;
  booking_linked_by: string | null;
  booking_linked_at: string | null;
  status_updated_by: string | null;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailThreadNote {
  id: string;
  thread_id: string;
  note: string;
  created_by: string;
  created_at: string;
}

// ─── API Response Types ─────────────────────────────────────
export interface EmailAccountsResponse {
  accounts: EmailAccount[];
}

export interface EmailThreadsResponse {
  threads: EmailThread[];
  total: number;
}

export interface EmailThreadDetailResponse {
  thread: EmailThread;
  messages: EmailMessage[];
  workflow: EmailThreadWorkflow | null;
  notes: EmailThreadNote[];
}

export interface EmailReplyRequest {
  body: string;
  bodyHtml?: string;
  to: string;
  cc?: string;
  bcc?: string;
  reply_all?: boolean;
  isForward?: boolean;
  attachments?: Array<{ name: string; mimeType: string; base64: string }>;
  /** Auto-generated UUID per send attempt for idempotency (prevents double-send) */
  client_request_id?: string;
}

// ─── Filter State ───────────────────────────────────────────
export interface EmailInboxFilters {
  accountId: string;  // 'all' or specific account UUID
  label: string;      // 'INBOX' | 'SENT' | 'STARRED' | ''
  search: string;
  page: number;
}

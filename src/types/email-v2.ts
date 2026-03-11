/**
 * Email Operational Inbox V2 Types
 * ═══════════════════════════════════════════════════════════
 * Types based on the brand new `email_threads` and `email_messages`
 * unified tables created in the 20260227000000 migration.
 */

export type EmailTagV2 =
    | 'GUEST_REPLY'
    | 'DISPUTE'
    | 'FINANCE_ALERT'
    | 'BOOKING_EXCEPTION'
    | 'VIP_PARTNER'
    | 'SILENT'
    | 'OTHER'
    // AI Classification Taxonomy (Sprint 16)
    | 'BOOKING_SYSTEM'
    | 'GUEST_MESSAGE'
    | 'DISPUTE_REFUND'
    | 'FINANCE_PAYOUT'
    | 'ADS_SPAM'
    | 'INTERNAL_OTHER';

export type EmailWorkflowStatusV2 =
    | 'OPEN'
    | 'WAITING_GUEST'
    | 'INTERNAL_PENDING'
    | 'DONE';

export type EmailPriorityV2 =
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'CRITICAL';

export interface EmailThreadV2 {
    id: string;
    tenant_id: string;
    email_account_id: string;
    provider_thread_id: string;
    subject: string | null;
    primary_participant: string | null;
    last_message_at: string | null;
    workflow_status: EmailWorkflowStatusV2;
    priority: EmailPriorityV2;
    owner_id: string | null;
    tag: EmailTagV2;
    /** SYSTEM = auto-classified, MANUAL = user override, AI_RULES/AI_HEURISTIC/AI_MODEL = AI sources */
    tag_source: 'SYSTEM' | 'MANUAL' | 'AI_RULES' | 'AI_HEURISTIC' | 'AI_MODEL';
    is_muted: boolean;
    /** When true, AI auto-apply is blocked. Only human can change tag. */
    manual_override: boolean;
    status_updated_by: string | null;
    status_updated_at: string | null;
    /** Thread snippet from Gmail — used as body fallback when messages lack body */
    snippet?: string | null;
    created_at: string;
    updated_at: string;

    // AI Suggestion fields (from overlay view LATERAL join)
    ai_suggested_tag?: string | null;
    ai_confidence?: number | null;
    ai_apply_status?: 'SUGGESTED' | 'APPLIED' | 'IGNORED' | null;
    ai_reasons?: string[] | null;
    ai_model?: string | null;
    ai_scored_at?: string | null;
}

export type EmailMessageDirectionV2 = 'INBOUND' | 'OUTBOUND';

export interface EmailMessageV2 {
    id: string;
    tenant_id: string;
    email_account_id: string;
    thread_id: string;
    provider_message_id: string;
    direction: EmailMessageDirectionV2;
    sender: string | null;
    recipients: Array<{ name: string; email: string }>;
    body_html: string | null;
    body_text: string | null;
    /** Actual send timestamp from Gmail internalDate. Use over created_at. */
    sent_at: string | null;
    gmail_internal_date: number | null;
    message_id: string | null;
    in_reply_to: string | null;
    created_at: string;
}

export type EmailParticipantRoleV2 = 'GUEST' | 'OTA' | 'INTERNAL';

export interface EmailThreadParticipantV2 {
    id: string;
    thread_id: string;
    email: string;
    role: EmailParticipantRoleV2;
}

export type EmailAuditActionV2 =
    | 'MARK_DONE'
    | 'REOPEN'
    | 'ASSIGN'
    | 'UNASSIGN'
    | 'CHANGE_PRIORITY'
    | 'CHANGE_TAG'
    | 'SEND_REPLY'
    | 'SEND_FORWARD'
    // AI Classification actions (Sprint 16)
    | 'AI_SUGGESTED'
    | 'AI_APPLIED_TAG'
    | 'AI_IGNORED'
    | 'AI_RERUN';

export interface EmailAuditLogV2 {
    id: string;
    tenant_id: string;
    thread_id: string;
    user_id: string;
    action: EmailAuditActionV2;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
    created_at: string;
}

// ─── API Response Types (RPC / Custom Hooks) ────────────────

export interface EmailAnalyticsV1 {
    total_action_required: number;
    threads_open_gt_8h: number;
    threads_per_tag: Record<string, number>;
    threads_per_owner: Record<string, number>;
}

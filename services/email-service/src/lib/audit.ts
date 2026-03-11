/**
 * Audit Logger – writes to email_actions_audit table
 * ═══════════════════════════════════════════════════════════
 * NEVER log tokens, credentials, or PII that isn't strictly needed.
 */
import { serviceSupabase } from './supabase';

export type AuditAction =
  | 'ACCOUNT_CONNECT'
  | 'ACCOUNT_DISCONNECT'
  | 'ACCOUNT_ERROR'
  | 'TOKEN_REFRESH'
  | 'TOKEN_REFRESH_FAILED'
  | 'SYNC_START'
  | 'SYNC_COMPLETE'
  | 'SYNC_ERROR'
  | 'THREAD_BODY_FETCH'
  | 'REPLY_SEND'
  | 'REPLY_ERROR';

interface AuditParams {
  action: AuditAction;
  actorUserId: string;
  tenantId?: string;         // Optional – backward compat, defaults to actorUserId
  emailAccountId?: string;
  threadId?: string;
  messageId?: string;
  meta?: Record<string, unknown>;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    await serviceSupabase.from('email_actions_audit').insert({
      tenant_id: params.tenantId ?? params.actorUserId,  // NOT NULL fallback
      actor_user_id: params.actorUserId,
      action: params.action,
      email_account_id: params.emailAccountId ?? null,
      thread_id: params.threadId ?? null,
      message_id: params.messageId ?? null,
      meta: params.meta ?? {},
    });
  } catch (err) {
    // Audit failures must not crash the service – log to stderr only
    console.error('[AUDIT_WRITE_ERROR]', params.action, err);
  }
}

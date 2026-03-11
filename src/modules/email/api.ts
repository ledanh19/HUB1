/**
 * Email Service API client
 * ═══════════════════════════════════════════════════════════
 * Calls Lovable Cloud Edge Functions instead of external service.
 * NEVER stores or logs tokens client-side.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  EmailAccountsResponse,
  EmailThreadsResponse,
  EmailThreadDetailResponse,
  EmailReplyRequest,
  EmailInboxFilters,
  EmailThreadWorkflow,
  EmailThreadNote,
} from '@/types/email';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

async function fnFetch<T>(fnName: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `API error ${res.status}`);
  }

  return res.json();
}

// ─── Accounts ───────────────────────────────────────────────
export async function fetchEmailAccounts(): Promise<EmailAccountsResponse> {
  return fnFetch('email-accounts');
}

export async function connectGmailAccount(scopeLevel: string = 'READ_ONLY'): Promise<{ url: string }> {
  return fnFetch(`email-gmail-connect?scope_level=${scopeLevel}`);
}

export async function disconnectEmailAccount(accountId: string): Promise<{ success: boolean }> {
  return fnFetch('email-accounts-disconnect', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

// ─── Threads ────────────────────────────────────────────────
export async function fetchEmailThreads(filters: EmailInboxFilters): Promise<EmailThreadsResponse> {
  const params = new URLSearchParams();
  params.set('mode', 'list');
  if (filters.accountId && filters.accountId !== 'all') params.set('account_id', filters.accountId);
  if (filters.label) params.set('label', filters.label);
  if (filters.search) params.set('search', filters.search);
  params.set('page', String(filters.page));
  return fnFetch(`email-threads?${params.toString()}`);
}

export async function fetchEmailThreadDetail(threadId: string): Promise<EmailThreadDetailResponse> {
  return fnFetch(`email-threads?mode=detail&id=${threadId}`);
}

// ─── Reply ──────────────────────────────────────────────────
export async function sendEmailReply(
  threadId: string,
  body: EmailReplyRequest
): Promise<{ success: boolean }> {
  // Auto-generate idempotency key if not provided
  const requestWithIdempotency = {
    threadId,
    ...body,
    client_request_id: body.client_request_id ?? crypto.randomUUID(),
  };
  console.log('[EMAIL_REPLY] Sending:', { threadId, to: body.to, bodyLen: body.body?.length });
  return fnFetch('email-reply', {
    method: 'POST',
    body: JSON.stringify(requestWithIdempotency),
  });
}

// ─── Sync ───────────────────────────────────────────────────
export async function triggerSync(accountId: string): Promise<{
  success: boolean;
  locked?: boolean;
  syncedThreads?: number;
  syncedMessages?: number;
  threadsSeenFromGmail?: number;
  startedAt?: string;
  finishedAt?: string;
}> {
  return fnFetch('email-sync-trigger', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

// ─── Workflow ───────────────────────────────────────────────
export async function updateThreadWorkflow(params: {
  threadId: string;
  status?: string;
  assignedTo?: string | null;
  bookingUnifiedId?: string | null;
}): Promise<{ success: boolean; workflow: EmailThreadWorkflow }> {
  return fnFetch('email-thread-workflow-update', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function addThreadNote(params: {
  threadId: string;
  note: string;
}): Promise<{ success: boolean; note: EmailThreadNote }> {
  return fnFetch('email-thread-note-add', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

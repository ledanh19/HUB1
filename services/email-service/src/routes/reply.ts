/**
 * Reply Route – Send reply within a thread
 * ═══════════════════════════════════════════════════════════
 * Preserves threading headers (In-Reply-To, References).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireEmailReply } from '../middleware/auth';
import { serviceSupabase } from '../lib/supabase';
import { getGmailClient, sendReply, parseEmailHeader } from '../lib/gmail';
import { audit } from '../lib/audit';

const router = Router();

const replySchema = z.object({
  body: z.string().min(1).max(50000),
  to: z.string().email(),
  cc: z.string().optional(),
  reply_all: z.boolean().optional().default(false),
});

/**
 * POST /email/threads/:threadId/reply
 */
router.post('/:threadId/reply', requireAuth, requireEmailReply, async (req: Request, res: Response) => {
  const { threadId } = req.params;

  // Validate body
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const { body: replyBody, to, cc } = parsed.data;

  // Fetch thread (shared workspace – no tenant filter)
  const { data: thread, error: threadErr } = await serviceSupabase
    .from('email_threads')
    .select('*')
    .eq('id', threadId)
    .single();

  if (threadErr || !thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  // Verify account is ACTIVE and has REPLY scope (shared – no tenant filter)
  const { data: account, error: accErr } = await serviceSupabase
    .from('email_accounts')
    .select('id, status, scope_level, email_address')
    .eq('id', thread.email_account_id)
    .single();

  if (accErr || !account) {
    return res.status(404).json({ error: 'Email account not found' });
  }
  if (account.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'Email account is not active' });
  }
  if (account.scope_level === 'READ_ONLY') {
    return res.status(403).json({ error: 'Account has READ_ONLY scope. Reconnect with REPLY scope.' });
  }

  // Get the last message in thread for threading headers
  const { data: lastMessage } = await serviceSupabase
    .from('email_messages')
    .select('headers, subject, provider_message_id')
    .eq('thread_id', threadId)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  const messageId = lastMessage?.headers?.['Message-ID'] ?? '';
  const existingRefs = lastMessage?.headers?.['References'] ?? '';
  const references = existingRefs ? `${existingRefs} ${messageId}` : messageId;
  const subject = lastMessage?.subject?.startsWith('Re:')
    ? lastMessage.subject
    : `Re: ${lastMessage?.subject ?? thread.subject ?? ''}`;

  try {
    const gmail = await getGmailClient(thread.email_account_id);

    const sent = await sendReply(gmail, {
      threadId: thread.provider_thread_id,
      to,
      cc,
      subject,
      bodyPlain: replyBody,
      inReplyTo: messageId,
      references,
      from: account.email_address,
    });

    // Store outbound message in mirror
    const { data: savedMsg } = await serviceSupabase
      .from('email_messages')
      .insert({
        tenant_id: req.auth!.userId,  // backward compat: NOT NULL, set to actor
        email_account_id: thread.email_account_id,
        thread_id: threadId,
        provider_message_id: sent.id ?? `local-${Date.now()}`,
        direction: 'OUTBOUND',
        from_json: [{ email: account.email_address }],
        to_json: [{ email: to }],
        cc_json: cc ? [{ email: cc }] : [],
        date: new Date().toISOString(),
        subject,
        headers: {
          'Message-ID': sent.id,
          'In-Reply-To': messageId,
          'References': references,
        },
        body_plain: replyBody,
        body_html_sanitized: null,
        has_attachments: false,
      })
      .select()
      .single();

    // Update thread last_message_at
    await serviceSupabase
      .from('email_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);

    await audit({
      action: 'REPLY_SEND',
      actorUserId: req.auth!.userId,
      emailAccountId: thread.email_account_id,
      threadId,
      messageId: savedMsg?.id,
      meta: {
        to,
        cc: cc ?? null,
        subject,
        provider_message_id: sent.id,
      },
    });

    res.json({ success: true, message: savedMsg });
  } catch (err: any) {
    console.error('[REPLY_SEND_ERROR]', err);

    await audit({
      action: 'REPLY_ERROR',
      actorUserId: req.auth!.userId,
      emailAccountId: thread.email_account_id,
      threadId,
      meta: { error: err.message ?? 'Unknown error' },
    });

    res.status(500).json({ error: 'Failed to send reply' });
  }
});

export default router;

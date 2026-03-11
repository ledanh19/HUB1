/**
 * Thread & Message Routes
 * ═══════════════════════════════════════════════════════════
 * Lazy-load body on thread detail open.
 * SECURITY FIX v2:
 *   - Search input is escaped to prevent PostgREST filter injection
 *   - DOMPurify: `style` attribute removed (CSS data-exfil risk)
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requireEmailView } from '../middleware/auth';
import { serviceSupabase } from '../lib/supabase';
import { getGmailClient, getMessage, extractBody, parseEmailHeader } from '../lib/gmail';
import { audit } from '../lib/audit';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const router = Router();

// DOMPurify for server-side HTML sanitization
const jsdomWindow = new JSDOM('').window;
const DOMPurify = createDOMPurify(jsdomWindow as any);

// Hook: force rel="noopener noreferrer" on links + block data: URIs on images
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    // Ensure external links open in new tab
    if (node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') ?? '';
    // Block data: URIs (XSS vector via SVG/HTML data URIs) and javascript:
    if (/^(data:|javascript:)/i.test(src)) {
      node.removeAttribute('src');
    }
  }
});

/**
 * Escape special characters that PostgREST interprets in filter values.
 * Prevents injection like: `%,id.eq.other-tenant-uuid)` into .or() calls.
 */
function escapePostgrestValue(input: string): string {
  return input
    .replace(/\\/g, '\\\\')   // backslash first
    .replace(/%/g, '\\%')     // literal percent
    .replace(/_/g, '\\_')     // literal underscore (LIKE wildcard)
    .replace(/,/g, '\\,')     // comma (PostgREST filter separator)
    .replace(/\(/g, '\\(')    // parens (PostgREST filter syntax)
    .replace(/\)/g, '\\)');
}

/**
 * GET /email/threads
 * List threads for current tenant. Supports account filter, label filter, search.
 */
router.get('/', requireAuth, requireEmailView, async (req: Request, res: Response) => {
  const { account_id, label, search, page = '1', limit = '50' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = serviceSupabase
    .from('email_threads')
    .select('*, email_accounts!inner(email_address, provider)', { count: 'exact' })
    .order('last_message_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (account_id && account_id !== 'all') {
    query = query.eq('email_account_id', account_id as string);
  }

  if (label) {
    query = query.contains('labels', [label]);
  }

  if (search) {
    const safe = escapePostgrestValue(String(search));
    query = query.or(`subject.ilike.%${safe}%,snippet.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch threads' });
  }

  res.json({ threads: data, total: count ?? 0 });
});

/**
 * GET /email/threads/:id
 * Get thread detail with all messages. Lazy-load body if not yet fetched.
 */
router.get('/:id', requireAuth, requireEmailView, async (req: Request, res: Response) => {
  const { id } = req.params;

  // Fetch thread (shared workspace – no tenant filter)
  const { data: thread, error: threadErr } = await serviceSupabase
    .from('email_threads')
    .select('*')
    .eq('id', id)
    .single();

  if (threadErr || !thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  // Fetch messages (shared workspace – no tenant filter)
  const { data: messages, error: msgErr } = await serviceSupabase
    .from('email_messages')
    .select('*')
    .eq('thread_id', id)
    .order('date', { ascending: true });

  if (msgErr) {
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }

  // Lazy-load body for messages that don't have it yet
  const messagesToFetch = (messages ?? []).filter(
    (m) => m.body_plain === null && m.body_html_sanitized === null
  );

  if (messagesToFetch.length > 0) {
    try {
      const gmail = await getGmailClient(thread.email_account_id);

      for (const msg of messagesToFetch) {
        try {
          const fullMsg = await getMessage(gmail, msg.provider_message_id, 'full');
          const body = extractBody(fullMsg.payload);

          // Sanitize HTML – remove scripts, iframes, event handlers
          const sanitizedHtml = body.html
            ? DOMPurify.sanitize(body.html, {
              ALLOWED_TAGS: [
                'p', 'br', 'div', 'span', 'a', 'b', 'i', 'u', 'strong', 'em',
                'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'table', 'thead', 'tbody', 'tr', 'td', 'th',
                'img', 'blockquote', 'pre', 'code', 'hr',
              ],
              ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target'],
              ALLOW_DATA_ATTR: false,
            })
            : null;

          await serviceSupabase
            .from('email_messages')
            .update({
              body_plain: body.plain || null,
              body_html_sanitized: sanitizedHtml || null,
            })
            .eq('id', msg.id);

          // Update in-memory for response
          msg.body_plain = body.plain || null;
          msg.body_html_sanitized = sanitizedHtml || null;
        } catch (fetchErr) {
          console.error(`[BODY_FETCH_ERROR] message=${msg.id}`, fetchErr);
        }
      }

      await audit({
        action: 'THREAD_BODY_FETCH',
        actorUserId: req.auth!.userId,
        emailAccountId: thread.email_account_id,
        threadId: id,
        meta: { messages_fetched: messagesToFetch.length },
      });
    } catch (err) {
      console.error('[THREAD_BODY_FETCH_GMAIL_ERROR]', err);
      // Continue with whatever we have
    }
  }

  res.json({ thread, messages });
});

export default router;

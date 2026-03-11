# Email V2 Audit Report

## 1. Route Map

| Route | Page Component | Data Source |
|---|---|---|
| `/email/inbox` | `EmailInboxPage` | V2 hooks → **V1 mirror** (`email_threads_mirror`, `email_messages_mirror`) |
| `/email/thread/:id` | `EmailThreadDetailPage` | V1 api.ts → Edge Fn `email-threads?mode=detail` |
| `/email/accounts` | `EmailAccountsPage` | V1 api.ts → Edge Fn `email-accounts` |

## 2. Data Map — V2 Inbox (Current)

### Thread List (`useOperationalThreads`)
- **Table**: `email_threads_mirror` (V1 mirror — NOT V2 `email_threads`)
- **Sender**: `participants[0].name || participants[0].email` → often "Booking.com" system name, not actual guest
- **Subject**: `row.subject`
- **Snippet**: `row.snippet`
- **Tag**: client-side `classifyTag()` using subject/snippet/labels/participant email
- **Time**: `row.last_message_at`
- **Unread**: NOT available (V1 mirror has no unread_count field)

### Message Detail (`useOperationalMessages`)
- **Table**: `email_messages_mirror` (V1 mirror — NOT V2 `email_messages`)
- **Sender**: `from_json.name || from_json.email` — sometimes null → "Không rõ"
- **Body**: `body_plain` → fallback `body_html_sanitized` text extract → fallback thread snippet
- **Direction**: `row.direction`

### Reply
- V2 inbox page has **NO reply composer**. `ThreadDetailV2` only shows messages + workflow actions.
- V1 route (`/email/thread/:id`) has full `ReplyComposer` (614 lines) with attachments.

## 3. Why Mapping Is Wrong

1. **sender = participants[0]** picks the FIRST participant which is often the OTA system (e.g., "Booking.com") not the actual guest.
2. **from_json** in mirror may be `null` for some synced messages → "Không rõ"
3. **V1 mirror tables have different column names** than V2 schema:
   - V1: `body_plain`, `body_html_sanitized`, `from_json`, `to_json`
   - V2: `body_text`, `body_html`, `sender`, `recipients`

## 4. Why UI Overflows

1. `ThreadDetailV2` header selects had fixed width (`w-[120px]`) too narrow for long labels like "Trung bình"
2. Missing `overflow-hidden` on column 3 container
3. Missing `min-w-0` on flex text containers
4. `SectionCard` backgrounds used `bg-background` / `bg-muted` instead of `bg-white`

> [!NOTE]
> UI overflow issues were partially fixed in commit `6803faf` (previous session).

## 5. Missing Features

| Feature | Status |
|---|---|
| Reply composer in V2 inbox | ❌ Missing |
| Attachment upload (Supabase Storage) | ❌ Missing |
| Attachment display in messages | ❌ Missing |
| From-address / mailbox selector | ❌ Missing |
| Outbound message status (PENDING/SENT/FAILED) | ❌ Missing |
| `email_attachments` table | ❌ Missing |
| `sent_at`, `status` on `email_messages` | ❌ Missing |
| `mailbox_id` on `email_threads` | ❌ Missing |
| Audit log for SEND_REPLY / SEND_FORWARD | ❌ Not in V2 audit_logs CHECK constraint |
| Idempotent send (client_request_id) | ❌ Missing |

## 6. Existing V1 Assets (Reusable)

| Asset | Path | Reuse Strategy |
|---|---|---|
| `ReplyComposer` | `modules/email/components/ReplyComposer.tsx` (614 lines) | Adapt for V2 — change props to V2 types |
| `email-reply` Edge Fn | `supabase/functions/email-reply/index.ts` (303 lines) | Extend to write V2 tables + audit |
| `email-attachments` Edge Fn | `supabase/functions/email-attachments/index.ts` (72 lines) | Reuse as-is for download |
| `email-sync-trigger` | `supabase/functions/email-sync-trigger/index.ts` (385 lines) | Already writes V1 mirror |
| `email-helpers` | `supabase/functions/_shared/email-helpers.ts` | Reuse auth/RBAC/Gmail utils |

## 7. V2 DB Schema (Current)

```
email_threads — 4 tables created in 20260227000000
├── email_threads (id, tenant_id, email_account_id, provider_thread_id, subject, primary_participant, last_message_at, workflow_status, priority, owner_id, tag, is_muted, created_at, updated_at)
├── email_messages (id, tenant_id, email_account_id, thread_id, provider_message_id, direction, sender, recipients, body_html, body_text, message_id, in_reply_to, created_at)
├── email_thread_participants (id, thread_id, email, role)
└── email_audit_logs (id, tenant_id, thread_id, user_id, action, before_data, after_data, created_at)
```

**Missing columns**: `sent_at`, `status`, `error_code`, `client_request_id` on `email_messages`
**Missing tables**: `email_attachments`
**Missing column**: `tag_source` on `email_threads`

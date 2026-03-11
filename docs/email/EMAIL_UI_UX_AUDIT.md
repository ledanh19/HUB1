# Email Module — UI/UX Audit Report

> **Generated**: 2026-02-27 | **Scope**: Roomrise Control Hub

---

## 1. Route Map

| Route | Page | Notes |
|-------|------|-------|
| `/email` | Redirect → `/email/inbox` | — |
| `/email/inbox` | `EmailInboxPage` | Main inbox, thread list |
| `/email/thread/:id` | `EmailThreadDetailPage` | Thread detail + reply + workflow |
| `/email/accounts` | `EmailAccountsPage` | Gmail OAuth management |

## 2. File Map

### Module: `src/modules/email/`
```
api.ts                    — Edge Function client (email-threads, email-accounts, email-reply, etc.)
hooks/
  useEmailAccounts.ts     — Gmail accounts CRUD + sync
  useEmailThreads.ts      — Thread list query (filters: accountId, label, search, page)
  useEmailThreadDetail.ts — Single thread + messages + workflow + notes
  useEmailReply.ts        — Send reply mutation
  useThreadWorkflow.ts    — Update status/assignedTo/bookingLink + add notes
components/
  EmailFilters.tsx        — Label/account/search filters, toolbar
  ThreadList.tsx           — Thread list container
  ThreadListItem.tsx       — Single row (desktop + mobile layouts)
  ThreadDetail.tsx         — Thread messages viewer
  ReplyComposer.tsx        — Reply/Forward compose box
  WorkflowPanel.tsx        — Right sidebar: status, assignment, booking link, notes
  EmailAccountCard.tsx     — Account management card
  AttachmentList.tsx       — Attachment rendering
  MessageAttachments.tsx   — Message-level attachments
  RecipientChipInput.tsx   — To/CC/BCC chip input
  RichTextEditor.tsx       — HTML editor for compose
utils/
  rfc2047.ts              — RFC2047 header decoding
```

### Pages: `src/pages/email/`
- `EmailInboxPage.tsx` (113 lines)
- `EmailThreadDetailPage.tsx` (154 lines)
- `EmailAccountsPage.tsx` (125 lines)

### Types: `src/types/email.ts` (166 lines)

## 3. Data Model

### EmailThread
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | Multi-tenant |
| `email_account_id` | uuid | FK → email_accounts |
| `provider_thread_id` | string | Gmail thread ID |
| `subject` | string? | Thread subject |
| `snippet` | string? | Last message preview |
| `participants` | EmailParticipant[] | `[{name, email}]` |
| `last_message_at` | timestamp? | For sorting/aging |
| `unread_count` | number | Read/unread |
| `labels` | string[] | **Gmail labels** (INBOX, SENT, STARRED, IMPORTANT, CATEGORY_PROMOTIONS, etc.) |
| `created_at` / `updated_at` | timestamp | — |
| `email_thread_workflow` | join | Status, assignment, booking link |

### EmailMessage
| Field | Type | Tagging Use |
|-------|------|-------------|
| `from_json` | Participant[] | Sender classification |
| `to_json`, `cc_json` | Participant[] | — |
| `headers` | Record<string,string> | `In-Reply-To`, `X-Mailer` detection |
| `body_plain` | string? | Keyword classification |
| `direction` | INBOUND/OUTBOUND | — |
| `date` | timestamp | SLA aging |
| `subject` | string? | Keyword classification |

### EmailThreadWorkflow (**"Handled" state exists!**)
| Field | Type | Notes |
|-------|------|-------|
| `status` | `OPEN / IN_PROGRESS / NEED_FOLLOWUP / DONE` | **DONE = Handled** |
| `assigned_to` | uuid? | User assignment |
| `booking_unified_id` | string? | Booking link |
| `status_updated_by` / `status_updated_at` | — | Audit trail |

### EmailInboxFilters (current)
| Field | Values |
|-------|--------|
| `accountId` | `'all'` or specific UUID |
| `label` | `INBOX`, `SENT`, `STARRED`, `IMPORTANT`, `_all` |
| `search` | Free text |
| `page` | Number |

## 4. API Architecture

All data flows through **Supabase Edge Functions** (not direct DB queries):
- `email-accounts` — list accounts
- `email-threads?mode=list` — list threads (server-side filtering + pagination)
- `email-threads?mode=detail&id=X` — thread detail + messages + workflow + notes
- `email-reply` — send reply
- `email-thread-workflow-update` — update status/assignment/booking
- `email-thread-note-add` — add note
- `email-sync-trigger` — manual sync
- `email-gmail-connect` — OAuth flow

> **Implication**: Tagging/filtering MUST be client-side OR we add new Edge Function params. Client-side first.

## 5. RBAC & Multi-Tenant

| Check | Status |
|-------|--------|
| `tenant_id` on all tables | ✅ Present |
| RLS on Supabase | ✅ Managed by Edge Functions (auth header → tenant_id) |
| Reply permissions | ✅ Role-based: admin, super_admin, cskh |
| Account management | ✅ Admin-only via `usePermissions()` |

## 6. Notification System

| Component | Location | Notes |
|-----------|----------|-------|
| `NotificationBell` | `src/components/layout/NotificationBell.tsx` | Global bell in header |
| `useNotificationCenter` | `src/hooks/useNotificationCenter.ts` | Manages notification queries + realtime |
| `renderNotification` | `src/modules/notifications/renderNotification.ts` | Renders notification items |
| `notificationConfig.json` | `src/modules/notifications/` | Configuration |
| `filterNotifications` | `src/modules/notifications/utils/` | Filter logic |

> **Reuse**: Can add an "Email" source category to existing NotificationBell.

## 7. Key Constraints

| Constraint | Impact |
|-----------|--------|
| API is Edge Functions (not direct DB) | Cannot add new server-side filters without Edge Function changes |
| Thread data already paginated server-side | Tag classification must work on loaded dataset |
| `labels[]` available per thread | Can use Gmail categories (CATEGORY_PROMOTIONS = SILENT) |
| `WorkflowPanel` has DONE status | No new "handled" storage needed |
| `email_thread_workflow` joined on list query | Can filter by workflow status client-side |

## 8. Reusable Assets for Operational Inbox

| Asset | Reuse |
|-------|-------|
| `WorkflowPanel` + `WorkflowStatusBadge` | ✅ DONE = Handled, no new DB |
| `labels[]` array on threads | ✅ Gmail categories for SILENT classification |
| `subject` + `snippet` on threads | ✅ Keyword classification for tags |
| `participants` on threads | ✅ Sender classification |
| `last_message_at` | ✅ SLA aging |
| `unread_count` | ✅ Bell count |
| Existing ThreadDetail + ReplyComposer | ✅ Thread panel |
| NotificationBell infrastructure | ✅ Email bell integration |

---

## 9. Conclusion

The existing Email module has a **solid foundation** for the Operational Inbox upgrade:
- Thread-first architecture ✅
- Workflow status (DONE = handled) ✅
- Gmail labels for classification ✅
- Subject/snippet for keyword tagging ✅
- NotificationBell for integration ✅

**Primary gap**: No smart folder / tag-driven views. All filtering is label-based (INBOX/SENT/STARRED). The upgrade adds a client-side `TagClassifier` that operates on loaded thread data, plus a new 3-panel layout with Smart Folders sidebar.

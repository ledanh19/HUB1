# WhatsApp Integration — Phase 0 SOT Audit Report

> Generated: 2026-02-19
> Status: **COMPLETE** — Ready for Phase 1+

---

## 1. Inbox Module File Inventory

### 1.1 Pages

| File | Route | Description |
|------|-------|-------------|
| `src/pages/OtaMessagesPage.tsx` (920 lines) | `/ota-messages` | Main Inbox — 3-column layout (conversation list, message thread, context panel). Mobile-responsive single-column navigation. |

### 1.2 Components (`src/components/messages/`)

| File | Role |
|------|------|
| `ConversationList.tsx` (338 lines) | Scrollable thread list with SLA badges, stay status, unread count, message preview |
| `MessageThread.tsx` | Chat bubbles — groups by date, auto-scroll, INBOUND/OUTBOUND/SYSTEM sender types |
| `ReplyInput.tsx` (393 lines) | Composer — 2000 char limit, 3s cooldown, 5 attachments (10MB), Shift+Enter, quick-reply |
| `ContextPanel.tsx` | Right panel — guest info, booking details, stay status, tags, cases, ownership |
| `ContextStrip.tsx` | Compact horizontal context strip above thread |
| `ConversationOwnership.tsx` | Claim/release/resolve/escalate — 4 teams (CSKH, OPS, FINANCE, TECH) |
| `ChannelBadge.tsx` | ✅ **Already handles WHATSAPP** — green badge with MessageCircle icon |
| `QuickReplyDropdown.tsx` | Predefined reply templates |
| `MobileThreadHeader.tsx` | Mobile back button + guest name |
| `ConversationTags.tsx` | Tag CRUD per conversation |

### 1.3 Hooks / Data Layer

| File | Exports | Lines |
|------|---------|-------|
| `useConversations.ts` | `useConversations()`, `useMessages()`, `useMessagesPaginated()`, `useSendMessage()`, `useSyncMessages()`, `useMarkConversationRead()`, `useCloseConversation()`, `useRetryMessage()`, `useOutboundMessageStatus()`, `useClaimConversation()`, `useReleaseConversation()`, `useResolveConversation()`, `useEscalateConversation()`, `useConversationCases()`, `useCreateCase()`, `useResolveCase()` | 1656 |
| `useBackgroundMessagesSync.ts` | `useBackgroundMessagesSync()` — 60s polling + realtime invalidation | 171 |
| `useMobileMessagesNav.ts` | `useMobileMessagesNav()` — URL state `?c=` / `?conversation=` | 154 |

### 1.4 Edge Functions (`supabase/functions/`)

| Function | Purpose |
|----------|---------|
| `channex-messages-sync/index.ts` | Polls Channex API → upserts conversations + messages |
| `channex-messages-webhook/index.ts` (631 lines) | Receives Channex webhook → HMAC verify → upsert → push |
| `channex-send-message/index.ts` (281 lines) | Send outbound via Channex API → idempotent upsert |

---

## 2. Database Schema (Current Production)

### 2.1 `conversations` table

```
id                         UUID PK DEFAULT gen_random_uuid()
channel_type               TEXT NOT NULL DEFAULT 'OTA'    -- ✅ 'OTA'|'EMAIL'|'WHATSAPP'|'WEB_CHAT'
channel_provider           TEXT NOT NULL DEFAULT 'channex' -- 'channex'|'gmail'|'meta'|'internal'
external_conversation_id   TEXT NOT NULL
property_id                TEXT NOT NULL
unified_booking_id         TEXT                            -- Channex booking UUID
guest_name                 TEXT
guest_email                TEXT
guest_phone                TEXT
last_message_at            TIMESTAMPTZ
last_inbound_at            TIMESTAMPTZ
last_outbound_at           TIMESTAMPTZ
unread_count               INT DEFAULT 0
status                     TEXT DEFAULT 'OPEN'             -- 'OPEN'|'CLOSED'
is_messaging_supported     BOOLEAN DEFAULT true
metadata                   JSONB DEFAULT '{}'
synced_at                  TIMESTAMPTZ
created_at                 TIMESTAMPTZ DEFAULT now()
updated_at                 TIMESTAMPTZ DEFAULT now()
-- OPS-GRADE OWNERSHIP:
assigned_to_user_id        UUID FK → auth.users
assigned_team              TEXT                            -- 'CSKH'|'OPS'|'FINANCE'|'TECH'
assignment_status          TEXT DEFAULT 'UNASSIGNED'       -- 'UNASSIGNED'|'ASSIGNED'|'ESCALATED'|'RESOLVED'
assigned_at                TIMESTAMPTZ
priority                   TEXT DEFAULT 'NORMAL'           -- 'URGENT'|'HIGH'|'NORMAL'|'LOW'
first_response_at          TIMESTAMPTZ
resolved_at                TIMESTAMPTZ
resolved_by_user_id        UUID FK → auth.users
```

**Unique Constraints:**
- `UNIQUE(channel_provider, external_conversation_id)` — per migration 20251217193820
- Additional unique on `external_conversation_id` — per migration 20251218040326

**Indexes:**
- `idx_conversations_property_id` on `property_id`
- `idx_conversations_status` on `status`
- `idx_conversations_assignment` on `(assignment_status, assigned_team)`

### 2.2 `messages` table

```
id                      UUID PK DEFAULT gen_random_uuid()
conversation_id         UUID FK → conversations(id)   -- was TEXT, migrated to UUID
external_message_id     TEXT UNIQUE
direction               TEXT NOT NULL                   -- 'INBOUND'|'OUTBOUND'
sender_type             TEXT NOT NULL                   -- 'GUEST'|'AGENT'|'SYSTEM'
body                    TEXT
attachments             JSONB DEFAULT '[]'
sent_at                 TIMESTAMPTZ DEFAULT now()
synced_at               TIMESTAMPTZ
created_at              TIMESTAMPTZ DEFAULT now()
sender_id               UUID FK → profiles(id)         -- added migration 20251218054502
sender_display_name     TEXT                            -- added migration 20260101100001
```

**Unique Constraints:**
- `UNIQUE(external_message_id)` — global uniqueness
- `UNIQUE(conversation_id, external_message_id)` — composite (ops-grade migration)

**Indexes:**
- `idx_messages_conversation_id` on `conversation_id`
- `idx_messages_sent_at` on `sent_at DESC`
- `idx_messages_sender_id` on `sender_id`

**Realtime:** ✅ Published via `supabase_realtime`

### 2.3 `messages_mirror` table (staging)

```
id                      UUID PK
conversation_id         UUID FK → conversations(id)
external_message_id     TEXT
direction               TEXT
sender_type             TEXT
body                    TEXT
attachments             JSONB
sent_at                 TIMESTAMPTZ
source_updated_at       TIMESTAMPTZ
synced_at               TIMESTAMPTZ
created_at              TIMESTAMPTZ
```

**Unique:** `(conversation_id, external_message_id)`

### 2.4 `outbound_messages` table

```
id                      UUID PK
client_message_id       TEXT UNIQUE                     -- idempotency key
conversation_id         UUID FK → conversations(id)
channel_provider        TEXT DEFAULT 'channex'          -- ✅ 'channex'|'meta'|...
body                    TEXT
attachments             JSONB
status                  TEXT DEFAULT 'QUEUED'           -- 'QUEUED'|'SENDING'|'SENT'|'FAILED'
error                   TEXT
external_message_id     TEXT
provider_delivery_id    TEXT
linked_mirror_message_id TEXT
retry_count             INT DEFAULT 0
created_by              UUID FK → auth.users
sender_display_name     TEXT
created_at              TIMESTAMPTZ
sent_at                 TIMESTAMPTZ
```

### 2.5 `message_events` table (observability)

```
id                UUID PK
request_id        TEXT
conversation_id   UUID FK → conversations(id)
message_id        UUID FK → messages(id)
outbound_id       UUID FK → outbound_messages(id)
event_type        TEXT                                  -- SEND_*, SYNC_*, WEBHOOK_*, ASSIGNMENT_*, etc.
payload           JSONB
created_at        TIMESTAMPTZ
```

### 2.6 Supporting Tables

| Table | Purpose |
|-------|---------|
| `conversation_cases` | Structured issue tracking (DISPUTE/REFUND/etc.) |
| `conversation_tags` | Free-form tagging |
| `rate_limit_buckets` | Server-side send rate limiting |

### 2.7 RPC Functions

| Function | Purpose |
|----------|---------|
| `claim_conversation()` | Atomic ownership claim (SELECT FOR UPDATE) |
| `release_conversation()` | Release/reassign |
| `resolve_conversation()` | Mark resolved |
| `get_messages_paginated()` | Cursor-based pagination `(sent_at DESC, id DESC)` |
| `check_rate_limit()` | Server rate limiting |
| `update_conversation_timestamps_safe()` | GREATEST-based safe timestamp update |

---

## 3. Message Flow — OTA (Current Production)

### 3.1 Inbound (Guest → Agent)

```
Channex Webhook
  → POST channex-messages-webhook
  → Verify HMAC X-Hub-Signature
  → Parse payload (3 Channex formats)
  → Detect direction via sender type (guest/traveler → INBOUND)
  → Find/create conversation (external_conversation_id = thread_id)
  → UPDATE conversation timestamps (update_conversation_timestamps_safe RPC)
  → UPSERT message ON CONFLICT (external_message_id)
  → Send push notification (send-push edge function)
  → Log to message_events (WEBHOOK_MESSAGE_RECEIVED)
  → Return 200 immediately
```

### 3.2 Outbound (Agent → Guest)

```
UI ReplyInput → useSendMessage()
  → POST channex-send-message
  → Auth (Bearer token → userId)
  → Sanitize body (2000 chars, strip control chars)
  → check_rate_limit (1 msg / 5 sec per conversation+user)
  → Idempotency check (client_message_id)
  → UPSERT outbound_messages (status: SENDING)
  → POST Channex API /message_threads/{threadId}/messages
  → On success:
    → Update outbound → SENT
    → UPSERT into messages (direction: OUTBOUND, sender_type: AGENT)
    → Update conversation timestamps
    → Reset unread_count = 0
  → Log to message_events (SEND_SUCCESS/SEND_FAILED)
```

### 3.3 Background Sync

```
useBackgroundMessagesSync (app-level)
  → 60s interval: channex-messages-sync edge function
  → Realtime postgres_changes on conversations + messages → invalidateQueries
```

---

## 4. Direction Field

| Value | Meaning | Source |
|-------|---------|--------|
| `INBOUND` | Guest → Agent | Webhook determines via `isGuestSender()` |
| `OUTBOUND` | Agent → Guest | Send function sets explicitly |

Stored on both `messages.direction` and `outbound_messages` (implicit OUTBOUND).

---

## 5. Unique Constraints Summary

| Table | Constraint | Purpose |
|-------|-----------|---------|
| `conversations` | `UNIQUE(channel_provider, external_conversation_id)` | Prevent duplicate conversations per provider |
| `conversations` | `UNIQUE(external_conversation_id)` | Global conversation dedup |
| `messages` | `UNIQUE(external_message_id)` | Global message dedup — ✅ wamid fits here |
| `messages` | `UNIQUE(conversation_id, external_message_id)` | Composite dedup |
| `messages_mirror` | `UNIQUE(conversation_id, external_message_id)` | Mirror dedup |
| `outbound_messages` | `UNIQUE(client_message_id)` | Idempotency key |

---

## 6. Realtime Subscription Logic

| Channel Name | Table | Events | Location |
|-------------|-------|--------|----------|
| `conversations-changes` | `conversations` | * | `useConversations()` — setQueryData for instant update |
| `messages-global-changes` | `messages` | INSERT | `useConversations()` — update unread/last_message/sort |
| `messages-{conversationId}` | `messages` | INSERT, UPDATE | `useMessages()` — per-thread live updates |
| `outbound-{conversationId}` | `outbound_messages` | * | `useOutboundMessageStatus()` |
| `messages-paginated-{conversationId}` | `messages` | INSERT, UPDATE | `useMessagesPaginated()` |
| `global-conversations` | `conversations` + `messages` | * / INSERT | `useBackgroundMessagesSync()` |
| `notification-center-messages` | `messages` | INSERT | `useNotificationCenter()` |

**Key insight:** ALL subscriptions are **channel-agnostic** — they subscribe to table-level changes, not filtered by channel_type. WhatsApp messages inserted into `messages` table will automatically trigger all existing realtime flows.

---

## 7. Notification / Deep Link Flow

| Component | Behavior |
|-----------|----------|
| `channex-messages-webhook` | Sends push via `send-push` for INBOUND messages |
| `notificationConfig.json` | `MESSAGE_INBOUND` event — emoji 💬, label "TIN NHẮN MỚI" |
| `renderNotification.ts` | Deep link → `/ota-messages?thread=` or `?conversation=` |
| `useNotificationCenter.ts` | In-app toast for MESSAGE_INBOUND |
| `NotificationBell.tsx` | Badge count from recent inbound messages |

**For WhatsApp:** Push notification will require same `send-push` call from WhatsApp webhook handler. Deep link pattern → `/ota-messages?conversation={id}` (same route).

---

## 8. Extension Points for WhatsApp (`channel_type`)

### 8.1 Already Extensible (NO changes needed)

| Area | Why |
|------|-----|
| `conversations.channel_type` | ✅ Already supports `'WHATSAPP'` value |
| `conversations.channel_provider` | ✅ Already supports `'meta'` value |
| `ChannelBadge.tsx` | ✅ Already renders WhatsApp badge (green, MessageCircle icon) |
| `CHANNEL_INFO` constant | ✅ Already has WHATSAPP entry |
| `PROVIDER_INFO` constant | ✅ Already has `meta` entry |
| `useConversations(filters)` | ✅ Already supports `channelType` filter |
| Realtime subscriptions | ✅ Channel-agnostic — table-level |
| `messages` table | ✅ `external_message_id` can store wamid |
| `outbound_messages` | ✅ `channel_provider` can be `'meta'` |
| Notification flow | ✅ Same `MESSAGE_INBOUND` event type |

### 8.2 Needs ADD-ONLY Changes

| Area | What to Add |
|------|-------------|
| DB | `whatsapp_integrations` table (tenant phone config) |
| DB | `webhook_events_log` table (raw webhook audit) |
| DB | Optional: Add `wamid` nullable to `messages` for direct lookup |
| Edge Functions | New `whatsapp-webhook` function (GET verify + POST receive) |
| Edge Functions | New `whatsapp-send-message` function (outbound via Graph API) |
| UI — OtaMessagesPage | Channel filter tabs: All \| OTA \| WhatsApp |
| UI — ConversationList | WhatsApp icon + phone number display |
| UI — ReplyInput | 24h window warning + template selector |

### 8.3 Blast Radius Analysis

| Change | Risk | Justification |
|--------|------|---------------|
| New `whatsapp_integrations` table | **ZERO** | New table, no existing code touches it |
| New `webhook_events_log` table | **ZERO** | New table, no existing code touches it |
| Add nullable `wamid` to `messages` | **ZERO** | Nullable column, no existing queries break |
| New edge functions | **ZERO** | Separate endpoints, OTA functions untouched |
| UI channel filter | **LOW** | Add-only filter tab, default "All" preserves current behavior |
| ConversationList item rendering | **LOW** | Conditional rendering based on channel_type |
| ReplyInput 24h warning | **LOW** | Conditional block, OTA path unchanged |

---

## 9. RBAC Current State

- **Route access:** `/ota-messages` in `ProtectedRoute.tsx` allowed routes
- **DB RLS:** Permissive policies — authenticated users can SELECT, service_role can ALL
- **Send:** Auth via Bearer token → userId
- **Ownership:** `claim_conversation` / `release_conversation` / `resolve_conversation` RPCs use `p_user_id`
- **Rate limit:** `check_rate_limit` per (conversation, user)

---

## 10. Decision: Extend vs. Separate Table

**DECISION: EXTEND existing tables (ADD-ONLY)**

Rationale:
1. `conversations` already has `channel_type = 'WHATSAPP'` and `channel_provider = 'meta'`
2. `messages` already has `external_message_id` (can store wamid) and `direction`
3. `outbound_messages` already has `channel_provider`
4. ALL UI components, hooks, and realtime are channel-agnostic
5. Creating separate WhatsApp tables would duplicate ALL the unified logic

Only new tables needed: `whatsapp_integrations` (tenant config) and `webhook_events_log` (audit).

---

## 11. Conclusion

The existing Inbox module was **designed from day one as a multi-channel architecture**. The migration from legacy `ota_*` tables to unified `conversations` + `messages` tables (migration 20251217193820) explicitly included WhatsApp as a first-class channel_type.

**WhatsApp integration is purely additive:**
- New tables for WhatsApp-specific config (integrations, webhook log)
- New edge functions for WhatsApp API (webhook + send)
- Minimal UI additions (channel filter, 24h window warning)
- Zero changes to existing OTA flow, schema, or realtime logic

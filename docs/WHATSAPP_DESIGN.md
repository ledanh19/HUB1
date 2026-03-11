# WhatsApp Business (Cloud API) Integration — Design Document

> Created: 2026-02-19
> Based on: WHATSAPP_PHASE0_SOT_AUDIT.md
> Approach: **ADD-ONLY** — zero changes to existing OTA flow

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│ EXISTING (UNTOUCHED)                                         │
│                                                              │
│  Channex Webhook ──► channex-messages-webhook                │
│  Channex API     ◄── channex-send-message                    │
│                       │                                      │
│  ┌────────────────────▼──────────────────────────────┐       │
│  │          conversations (channel_type=OTA)          │       │
│  │          messages (external_message_id=channex)    │       │
│  └───────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ NEW (ADD-ONLY)                                               │
│                                                              │
│  Meta Webhook ───► whatsapp-webhook (Edge Function)          │
│  Graph API    ◄─── whatsapp-send-message (Edge Function)     │
│                       │                                      │
│  ┌────────────────────▼──────────────────────────────┐       │
│  │          conversations (channel_type=WHATSAPP)     │       │
│  │          messages (external_message_id=wamid)      │       │
│  └───────────────────────────────────────────────────┘       │
│                                                              │
│  ┌─────────────────────────────────────────────────┐         │
│  │  whatsapp_integrations (tenant phone config)     │         │
│  │  webhook_events_log (raw payload audit)          │         │
│  └─────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ UNIFIED UI (minor additions)                                 │
│                                                              │
│  OtaMessagesPage ← channel filter [All | OTA | WhatsApp]    │
│  ConversationList ← WhatsApp icon + phone number             │
│  ReplyInput ← 24h window warning                             │
│  Realtime ← NO CHANGES (channel-agnostic)                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Database Design

### 2.1 NEW: `whatsapp_integrations`

```sql
CREATE TABLE whatsapp_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES auth.users(id),
  phone_number_id TEXT NOT NULL,         -- Meta phone number ID
  waba_id         TEXT NOT NULL,         -- WhatsApp Business Account ID
  display_phone   TEXT,                  -- Display phone number (+84...)
  verify_token    TEXT NOT NULL,         -- Webhook verification token
  app_secret_ref  TEXT NOT NULL,         -- Vault reference (NOT plain text)
  access_token_ref TEXT NOT NULL,        -- Vault reference (NOT plain text)
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, phone_number_id)
);
```

### 2.2 NEW: `webhook_events_log`

```sql
CREATE TABLE webhook_events_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  channel         TEXT NOT NULL DEFAULT 'whatsapp',
  phone_number_id TEXT,
  payload_json    JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  processing_status TEXT DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'failed', 'duplicate')),
  error_message   TEXT,
  received_at     TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 EXTEND: `messages` (ADD nullable columns)

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wamid TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT;

-- Index for WhatsApp-specific lookups
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON messages(wamid) WHERE wamid IS NOT NULL;

-- Idempotent unique for WhatsApp
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_idempotent 
  ON messages(wamid) WHERE wamid IS NOT NULL;
```

**Blast radius:** ZERO — all new columns are nullable. Existing OTA messages have NULL values. No existing queries break.

---

## 3. Webhook Design (Edge Function: `whatsapp-webhook`)

### 3.1 GET — Verification

```
GET /functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
  → Lookup verify_token in whatsapp_integrations
  → If match → Return hub.challenge (200)
  → If no match → 403
```

### 3.2 POST — Receive Messages

```
POST /functions/v1/whatsapp-webhook
  Headers: X-Hub-Signature-256

  Flow:
  1. Log raw payload to webhook_events_log
  2. Verify X-Hub-Signature-256 using APP_SECRET
  3. Parse entry[].changes[].value:
     - messages[] → inbound messages
     - statuses[] → delivery status updates
  4. For each message:
     a. Resolve tenant via phone_number_id → whatsapp_integrations
     b. Build external_conversation_id = "wa:{phone_number_id}:{from}"
     c. UPSERT conversation (channel_type=WHATSAPP, channel_provider=meta)
     d. INSERT message (external_message_id=wamid, direction=INBOUND)
        ON CONFLICT DO NOTHING (idempotent)
     e. Update conversation timestamps (reuse update_conversation_timestamps_safe RPC)
     f. Send push notification (reuse send-push)
  5. For each status:
     a. UPDATE outbound_messages matching wamid
     b. Log to message_events
  6. Return 200 immediately
```

### 3.3 Conversation ID Schema

```
WhatsApp: external_conversation_id = "wa:{phone_number_id}:{customer_wa_id}"
OTA:      external_conversation_id = "{channex_thread_id}"
```

No collision possible due to `wa:` prefix.

---

## 4. Outbound Send API (Edge Function: `whatsapp-send-message`)

```
POST /functions/v1/whatsapp-send-message
Body: { conversation_id, body, client_message_id, template_name?, template_language? }

Flow:
1. Auth (Bearer token → userId)
2. Lookup conversation → get channel_type, metadata
3. Validate conversation.channel_type === 'WHATSAPP'
4. Get WhatsApp integration config (phone_number_id, access_token via Vault)
5. Check 24h window:
   - If last_inbound_at within 24h → send free-form text
   - If outside 24h → require template_name (return 400 if missing)
6. Rate limit check (reuse check_rate_limit RPC)
7. Idempotency check (client_message_id)
8. UPSERT outbound_messages (status: SENDING, channel_provider: 'meta')
9. Call Graph API:
   POST https://graph.facebook.com/v22.0/{phone_number_id}/messages
   Authorization: Bearer {access_token}
   Body: { messaging_product: "whatsapp", to: customer_phone, type: "text", text: { body } }
10. On success:
    - Update outbound → SENT, store wamid
    - UPSERT into messages (direction: OUTBOUND, wamid: response.messages[0].id)
    - Update conversation timestamps
11. On failure:
    - Update outbound → FAILED with error
    - Retry up to 3 times (exponential backoff: 1s, 2s, 4s)
12. Log to message_events
13. Return { success, message_id, wamid }
```

---

## 5. UI Changes (ADD-ONLY, no design token changes)

### 5.1 OtaMessagesPage — Channel Filter

Add channel filter tabs above conversation list:
- **Tất cả** (default) — shows all channels
- **OTA** — `channel_type = 'OTA'`
- **WhatsApp** — `channel_type = 'WHATSAPP'`

### 5.2 ConversationList — WhatsApp Items

When `conversation.channel_type === 'WHATSAPP'`:
- Show WhatsApp icon (green MessageCircle) instead of OTA badge
- Show phone number instead of OTA source
- Show "WhatsApp" badge instead of OTA source badge

### 5.3 ReplyInput — 24h Window Warning

When conversation is WhatsApp:
- Check if `last_inbound_at` is within 24h
- If outside 24h: show warning banner + disable free-text + show template selector
- If within 24h: normal text input

### 5.4 MessageThread — Status Ticks

For WhatsApp outbound messages, show delivery status:
- ✓ Sent
- ✓✓ Delivered
- ✓✓ (blue) Read

---

## 6. Realtime — NO CHANGES NEEDED

All existing realtime subscriptions are on `conversations` and `messages` tables without channel_type filter. WhatsApp data inserted into these tables automatically triggers:
- Conversation list updates
- Message thread updates
- Unread count updates
- Notification bell updates
- Background sync invalidation

---

## 7. Security

| Control | Implementation |
|---------|---------------|
| Access token storage | Vault references only (`access_token_ref`), never plain text in DB |
| Webhook signature | X-Hub-Signature-256 verified with APP_SECRET from Vault |
| Token rotation | Update `access_token_ref` → new Vault entry, old one retained for audit |
| Phone mapping | Validated via `whatsapp_integrations.phone_number_id` |
| RBAC | Same as OTA — Bearer token auth, RLS policies |
| Rate limiting | Reuse existing `check_rate_limit` RPC |
| Idempotency | `wamid` UNIQUE on messages, `client_message_id` on outbound |

---

## 8. Observability

| What | How |
|------|-----|
| Webhook failures | `webhook_events_log.signature_valid = false` |
| Webhook processing | `webhook_events_log.processing_status` |
| Send failures | `message_events.event_type = 'SEND_FAILED'` |
| Retry tracking | `outbound_messages.retry_count` |
| Status updates | `message_events.event_type = 'WEBHOOK_STATUS_UPDATE'` |

---

## 9. Migration Strategy

All migrations are ADD-ONLY and backward-compatible:
1. Create `whatsapp_integrations` table
2. Create `webhook_events_log` table
3. Add nullable columns to `messages`
4. Add indexes
5. No existing data is modified
6. No existing constraints are changed

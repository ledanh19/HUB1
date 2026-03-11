# WhatsApp Integration — Test Plan (Phase 8)

> Generated from Phase 8 of `WHATSAPP_DESIGN.md`.  
> Run these tests before deploying each edge function and after any schema migration.

---

## 1. Webhook Verification (GET)

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1.1 | Valid challenge | `hub.mode=subscribe`, `hub.verify_token` matches DB row, `hub.challenge=abc123` | 200, body = `abc123` |
| 1.2 | Wrong token | `hub.verify_token=bad` | 403 Forbidden |
| 1.3 | Missing params | No `hub.mode` | 400 Bad Request |
| 1.4 | Unknown phone_number_id | `hub.verify_token` not found in any integration | 403 Forbidden |

---

## 2. Webhook Inbound Message (POST)

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 2.1 | Text message | Valid payload with `messages[0].type=text` | 200; new row in `messages` (direction=INBOUND, channel_type=WHATSAPP), new/updated `conversations` |
| 2.2 | Duplicate wamid | Same payload replayed | 200; **no** duplicate row (idempotent on `external_message_id`) |
| 2.3 | Invalid signature | `X-Hub-Signature-256` doesn't match HMAC | 401 Unauthorized; `webhook_events_log.signature_valid = false` |
| 2.4 | Missing signature header | No `X-Hub-Signature-256` | 401 Unauthorized |
| 2.5 | Unknown phone_number_id | Payload references a number not in `whatsapp_integrations` | 200 (ack but skip); logged in `webhook_events_log` |
| 2.6 | Image message | `messages[0].type=image` with media id | 200; `messages.attachments` populated with media URL |
| 2.7 | Multi-tenant isolation | Payload for tenant A → check tenant B cannot read the message | RLS blocks cross-tenant access |

---

## 3. Status Updates (POST)

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 3.1 | sent status | `statuses[0].status=sent`, matching wamid | `messages.wa_status = 'SENT'`, `outbound_messages.status = 'SENT'` |
| 3.2 | delivered status | `statuses[0].status=delivered` | `messages.wa_status = 'DELIVERED'` |
| 3.3 | read status | `statuses[0].status=read` | `messages.wa_status = 'READ'` |
| 3.4 | failed status | `statuses[0].status=failed` with errors[] | `messages.wa_status = 'FAILED'`, `outbound_messages.status = 'FAILED'`, error payload logged |
| 3.5 | Unknown wamid | Status for a wamid not in DB | 200 (ack but no-op) |

---

## 4. Send Message (POST `/whatsapp-send-message`)

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 4.1 | Text within 24h | `conversation_id`, `body`, conversation has recent inbound | 200; `outbound_messages` created, Graph API called, `messages` row with `wa_status=SENT` |
| 4.2 | Text outside 24h, no template | `body` only, no inbound in 24h | 400 `OUTSIDE_24H_WINDOW` |
| 4.3 | Template outside 24h | `template_name`, `template_language` provided | 200; Graph API called with `type=template` payload |
| 4.4 | Body > 4096 chars | Long body text | 400 validation error |
| 4.5 | Idempotent retry | Same `client_message_id` sent twice | Second call returns existing `message_id`, no duplicate |
| 4.6 | Rate limit exceeded | > 60 calls/min for same tenant | 429 Too Many Requests |
| 4.7 | Graph API 5xx | Mock Graph API returning 500 | Retry 3x with exponential backoff; final FAILED status |
| 4.8 | Invalid conversation | Non-existent `conversation_id` | 404 Not Found |
| 4.9 | Non-WhatsApp conversation | `channel_type = 'OTA'` conversation_id | 400 `NOT_WHATSAPP_CONVERSATION` |

---

## 5. UI Tests

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 5.1 | Channel filter – All | Click "Tất cả" tab | All conversations shown |
| 5.2 | Channel filter – OTA | Click "OTA" filter | Only OTA conversations shown |
| 5.3 | Channel filter – WhatsApp | Click "WhatsApp" filter | Only WhatsApp conversations shown |
| 5.4 | WhatsApp conversation list | Open Inbox with WhatsApp conversations | Green MessageCircle icon, phone number displayed, "WhatsApp" badge |
| 5.5 | Send message (WhatsApp) | Type & send in WhatsApp conversation | Message sent via `whatsapp-send-message`, optimistic update appears |
| 5.6 | Delivery ticks | Send message, observe status updates | ✓ sent → ✓✓ delivered → ✓✓ blue read |
| 5.7 | 24h window warning | Open WhatsApp conv with no inbound in 24h | Amber warning banner visible |
| 5.8 | 24h window open | Open WhatsApp conv with recent inbound | Green "Cửa sổ nhắn tin WhatsApp đang mở" indicator |
| 5.9 | Realtime inbound | Receive WhatsApp message while Inbox open | New message appears in < 2 seconds, conversation moves to top |
| 5.10 | Navigation label | Check sidebar | Label reads "Tin nhắn" (not "Tin nhắn OTA") |
| 5.11 | Empty state | No conversations | Text says "Tin nhắn từ OTA và WhatsApp sẽ xuất hiện ở đây" |

---

## 6. Realtime (Phase 6 Verification)

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | New WhatsApp message | Realtime subscription fires (table=messages, event=INSERT), UI updates via `setQueryData` |
| 6.2 | Conversation update | Realtime subscription fires (table=conversations, event=UPDATE), conversation list re-sorts |
| 6.3 | Status update | `wa_status` change triggers realtime UPDATE on messages table, delivery ticks update in MessageThread |
| 6.4 | Cross-browser sync | Open Inbox in two tabs; send message — both tabs update |

---

## 7. Observability Checklist (Phase 7)

All observability is **already built into the edge functions**:

- [x] `webhook_events_log` — every incoming webhook payload logged with `signature_valid`, `processing_status`
- [x] `message_events` — every inbound/outbound message logged with `event_type`, `metadata` JSONB
- [x] Console logging — structured `console.log` with `[WhatsApp Webhook]` / `[WhatsApp Send]` prefixes
- [x] Error tracking — failed Graph API calls logged with status code and response body
- [x] Rate limit tracking — `check_rate_limit` RPC with per-tenant counters

### Future Enhancements (not blocking launch)
- [ ] Admin UI dashboard for `webhook_events_log` (filter by processing_status)
- [ ] Supabase pg_cron job to clean old webhook_events_log rows (> 90 days)
- [ ] Alerting on `processing_status = 'FAILED'` count threshold

---

## 8. Security Checklist (Phase 9)

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 8.1 | Webhook signature verification | ✅ Implemented | HMAC-SHA256 via `WHATSAPP_APP_SECRET` env var |
| 8.2 | Access token storage | ✅ Implemented | `access_token_ref` column stores env var name, not raw token |
| 8.3 | No plain-text tokens in DB | ✅ By design | `whatsapp_integrations.access_token_ref` is a reference, actual token in Supabase secrets/env |
| 8.4 | No hard-coded tenant_id | ✅ Verified | All functions resolve tenant from DB lookup (phone_number_id → tenant) |
| 8.5 | RLS on all tables | ✅ Applied | `whatsapp_integrations`, `webhook_events_log` have RLS with tenant isolation |
| 8.6 | Input validation | ✅ Implemented | Body max 4096 chars, phone format validation, required field checks |
| 8.7 | Rate limiting | ✅ Implemented | 60 req/min per tenant via `check_rate_limit` RPC |
| 8.8 | Idempotent webhook processing | ✅ Implemented | Duplicate `wamid` → `ON CONFLICT DO NOTHING` |
| 8.9 | CORS | ✅ Default | Edge functions use Supabase default CORS (same-origin for webhook) |
| 8.10 | Auth on send endpoint | ✅ Implemented | Bearer token required, Supabase `getUser()` validation |

### Token Rotation Procedure
1. Generate new token in Meta Business Manager
2. Update Supabase secret: `supabase secrets set WHATSAPP_ACCESS_TOKEN_<id>=new_token`
3. No code deploy needed — edge function reads from env at runtime
4. Old token auto-invalidated by Meta after rotation

---

## Test Execution Matrix

| Phase | Tests | Requires | Blocker |
|-------|-------|----------|---------|
| DB Migration | Run migration, verify tables exist | Supabase CLI | — |
| Webhook GET | curl with verify_token | Deployed function + DB row | Migration |
| Webhook POST | curl with signed payload | Deployed function + app_secret | Migration |
| Send API | curl with auth token | Deployed function + access_token | Migration + Integration row |
| UI | Manual browser testing | Frontend running + backend deployed | All above |
| Realtime | Open 2 browser tabs, send webhook | Full stack running | All above |

---

*Last updated: Phase 8/9 combined test plan*

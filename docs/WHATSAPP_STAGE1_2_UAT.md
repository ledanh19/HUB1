# WhatsApp Stage 1.2 — UAT Test Plan

> **Date**: 2026-02-19  
> **Scope**: End-to-End WhatsApp bidirectional (inbound + outbound + status)  
> **Pre-requisites**:
> - Migration `20260219100001_whatsapp_integration.sql` applied
> - Migration `20260219200001_whatsapp_settings_health.sql` applied
> - Edge functions deployed: `whatsapp-webhook`, `whatsapp-send-message`, `whatsapp-test-send`
> - Secrets set: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`
> - Meta Webhook configured: Callback URL + Verify Token + `messages` subscribed

---

## T1: Verify Webhook (Meta GET Challenge)

| # | Step | Expected |
|---|------|----------|
| 1 | From Meta WhatsApp Configuration, paste Callback URL: `https://<REF>.supabase.co/functions/v1/whatsapp-webhook` | URL pasted |
| 2 | Paste Verify Token (from Control Hub Settings page) | Token pasted |
| 3 | Click **Verify and Save** | ✅ Meta shows "Webhook verified" |
| 4 | Check Supabase Edge Function logs | Log line: `Verification succeeded for phone_number_id: <ID>` |

**Manual curl test:**
```bash
curl -X GET "https://<REF>.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=<YOUR_TOKEN>&hub.challenge=test123"
# Expected: 200, body = "test123"
```

**Fail case:**
```bash
curl -X GET "https://<REF>.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test123"
# Expected: 403 Forbidden
```

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T2: Inbound Message — Phone → Control Hub

| # | Step | Expected |
|---|------|----------|
| 1 | From a personal phone, send a text message via WhatsApp to the business number | Message sent |
| 2 | Check Supabase `webhook_events_log` | New row: `channel='whatsapp'`, `signature_valid=true`, `processing_status='processed'` |
| 3 | Check `conversations` table | Row with `external_conversation_id = 'wa:{phone_number_id}:{sender_phone}'`, `channel_type='WHATSAPP'`, `last_inbound_at` = recent |
| 4 | Check `messages` table | Row with `wamid = 'wamid.xxx'`, `direction='INBOUND'`, `body='<text sent>'`, `channel_type='WHATSAPP'` |
| 5 | Check Control Hub Inbox (`/inbox`) | New WhatsApp conversation visible, filter by WhatsApp shows it |
| 6 | Check `whatsapp_integrations` | `last_webhook_received_at` updated to recent timestamp, `last_error` = NULL |

**Verify idempotency:**
| 7 | Replay the same webhook payload (Meta retry) | `messages` table: no duplicate row (same wamid = upsert skip) |

**Test with different message types:**
| 8 | Send an image from phone | `body = '[Hình ảnh]'` or caption, `attachments` contains image metadata |
| 9 | Send a document from phone | `body = '[Tài liệu: filename]'`, `attachments` contains document metadata |
| 10 | Send a voice message | `body = '[Tin nhắn thoại]'` |

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T3: Outbound + Status — Control Hub → Phone → Status Ticks

| # | Step | Expected |
|---|------|----------|
| 1 | Open the WhatsApp conversation in Control Hub Inbox | Conversation visible with inbound messages from T2 |
| 2 | Type a reply and send | Loading state, then message appears as "sent" |
| 3 | Check `outbound_messages` | Row: `status='SENT'`, `external_message_id='wamid.xxx'` |
| 4 | Check `messages` | Mirror row: `direction='OUTBOUND'`, `wa_status='SENT'`, `wamid` set |
| 5 | Wait for Meta delivery webhook (~seconds) | `outbound_messages.status` → `DELIVERED` |
| 6 | Check `messages.wa_status` | Updated to `DELIVERED` |
| 7 | Recipient reads the message on phone | Status → `READ` |
| 8 | Check `outbound_messages.status` | `READ` |
| 9 | Check UI delivery ticks | ✓ sent → ✓✓ delivered → 👁 read (blue ticks) |

**Status forward-only check:**
| 10 | Simulate a "sent" webhook AFTER "delivered" was set | Status should NOT go backward. Log: "Skipping backward status" |

**Error case:**
| 11 | Send to invalid phone number → Meta returns error | `outbound_messages.status = 'FAILED'`, `error` field populated |
| 12 | Webhook delivers `failed` status | `outbound_messages.status = 'FAILED'` |

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T4: 24h Window Enforcement

| # | Step | Expected |
|---|------|----------|
| 1 | Conversation with `last_inbound_at` > 24h ago (or NULL) | |
| 2 | Try to send a free-form text reply | Error 400: "Outside 24-hour messaging window. A template message is required." |
| 3 | Try to send with `template_name = 'hello_world'` | ✅ Template sent successfully |
| 4 | Conversation with `last_inbound_at` < 24h ago | |
| 5 | Send a free-form text reply | ✅ Sent successfully (no template required) |

**DB verification:**
```sql
SELECT id, last_inbound_at,
       CASE WHEN last_inbound_at > now() - interval '24 hours' THEN 'WITHIN' ELSE 'OUTSIDE' END as window
FROM conversations
WHERE channel_type = 'WHATSAPP';
```

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T5: Multi-Tenant Isolation

| # | Step | Expected |
|---|------|----------|
| 1 | Login as **Tenant A** (admin) → Settings → WhatsApp | Integration A visible |
| 2 | Send test message from Tenant A's Settings | ✅ Works, uses Tenant A's phone_number_id |
| 3 | Tenant A's phone receives inbound | Conversation created with Tenant A's phone_number_id as tenant context |
| 4 | Logout → Login as **Tenant B** (admin) → Settings → WhatsApp | Tenant A's integration NOT visible. Badge: "Chưa kết nối" |
| 5 | Check Inbox as Tenant B | Tenant A's conversations NOT visible |
| 6 | Tenant B creates their own integration | ✅ Success, separate row in `whatsapp_integrations` |

**DB verification:**
```sql
-- Each tenant only sees their own data
SELECT tenant_id, phone_number_id, waba_id
FROM whatsapp_integrations
WHERE status = 'active'
ORDER BY tenant_id;

-- Conversations are scoped by phone_number_id → tenant
SELECT wa_phone_number_id, count(*)
FROM conversations
WHERE channel_type = 'WHATSAPP'
GROUP BY wa_phone_number_id;
```

**RLS verification (as authenticated user):**
```sql
-- This should only return current user's integration
SELECT * FROM whatsapp_integrations;
```

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T6: Signature Verification

| # | Step | Expected |
|---|------|----------|
| 1 | Send valid webhook with correct signature | 200 OK, `signature_valid = true` in logs |
| 2 | Send webhook with wrong/missing signature | 401 Rejected |
| 3 | Check `webhook_events_log` for rejected event | `signature_valid = false`, `processing_status = 'failed'`, `error_message = 'Invalid signature'` |

**Manual test with curl:**
```bash
# Compute HMAC
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')

# Valid signature
curl -X POST "https://<REF>.supabase.co/functions/v1/whatsapp-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$BODY"
# Expected: 200

# Invalid signature
curl -X POST "https://<REF>.supabase.co/functions/v1/whatsapp-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=invalid" \
  -d "$BODY"
# Expected: 401
```

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T7: Rate Limiting

| # | Step | Expected |
|---|------|----------|
| 1 | Send > 60 webhook POSTs from same IP within 10 seconds | After threshold: 429 Too Many Requests |
| 2 | Check `webhook_events_log` | Rate-limited events: `processing_status = 'failed'`, `error_message = 'Rate limited'` |
| 3 | Wait 10 seconds, send again | 200 OK — rate limit window expired |

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## T8: Webhook Health Dashboard

| # | Step | Expected |
|---|------|----------|
| 1 | After T2 (inbound received), go to Settings → WhatsApp | |
| 2 | Card "Kiểm tra" → Webhook Health | "Webhooks (24h)" > 0 |
| 3 | "Signature errors (24h)" | 0 (unless T6 was run) |
| 4 | "Last webhook" | Shows recent timestamp |
| 5 | Wait ~60 seconds → auto refresh | Values update without manual reload |

| Result | ☐ PASS / ☐ FAIL |
|--------|-----------------|

---

## Summary Checklist

| Test | Description | Status |
|------|------------|--------|
| T1 | Webhook Verification (GET) | ☐ |
| T2 | Inbound Message (phone → hub) | ☐ |
| T3 | Outbound + Status (hub → phone → ticks) | ☐ |
| T4 | 24h Window Enforcement | ☐ |
| T5 | Multi-Tenant Isolation | ☐ |
| T6 | Signature Verification | ☐ |
| T7 | Rate Limiting | ☐ |
| T8 | Webhook Health Dashboard | ☐ |

---

## Error Reporting

If any test fails, document:

| Field | Value |
|-------|-------|
| Test ID | T? |
| Error message | |
| HTTP status | |
| Relevant payload (sanitized) | |
| Edge function logs | |
| DB state | |
| Fix applied | |

# WhatsApp Stage 1.2 — Webhook End-to-End

> **Date**: 2026-02-19  
> **Scope**: Full bidirectional WhatsApp (inbound + status) via Supabase Edge Function  
> **Status**: IMPLEMENTATION COMPLETE

---

## 1. Webhook URL

```
POST https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook
GET  https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook
```

**Paste this URL into Meta WhatsApp Configuration → Callback URL.**

---

## 2. Architecture Flow

```
                          ┌──────────────────────────────────┐
  Meta Cloud API ──POST──▶│  whatsapp-webhook (Edge Function) │
                          └──────┬──────────┬────────────────┘
                                 │          │
                     ┌───────────┘          └──────────┐
                     ▼                                 ▼
            INBOUND messages                   STATUS updates
            (text/image/doc/...)               (sent/delivered/read/failed)
                     │                                 │
                     ▼                                 ▼
          ┌─────────────────┐               ┌───────────────────┐
          │ conversations   │               │ outbound_messages  │
          │ (find or create)│               │ (status forward)   │
          └────────┬────────┘               └────────┬──────────┘
                   │                                  │
                   ▼                                  ▼
          ┌─────────────────┐               ┌─────────────────┐
          │  messages       │               │  messages        │
          │  (upsert wamid) │               │  (wa_status)     │
          └────────┬────────┘               └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  send-push      │
          │  (notification) │
          └─────────────────┘
```

### Observability trail:
- `webhook_events_log` — raw event audit (payload_json, signature_valid, processing_status)
- `message_events` — per-message/per-status granular events
- `whatsapp_integrations.last_webhook_received_at` — health pulse

---

## 3. GET — Webhook Verification

Meta sends a GET to verify ownership:

```
GET /functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=<CHALLENGE>
```

**Flow**:
1. Check `hub.mode === "subscribe"`, `hub.verify_token` present, `hub.challenge` present
2. Query `whatsapp_integrations` for matching `verify_token` + `status = 'active'`
3. If found → return `hub.challenge` as `text/plain` 200
4. If not found → return 403

---

## 4. POST — Inbound Messages

### Cloud API Payload Structure:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "84901234567",
          "phone_number_id": "123456789"
        },
        "contacts": [{ "profile": { "name": "Customer Name" }, "wa_id": "84987654321" }],
        "messages": [{
          "from": "84987654321",
          "id": "wamid.xxx",
          "timestamp": "1708300000",
          "type": "text",
          "text": { "body": "Hello!" }
        }]
      }
    }]
  }]
}
```

### Processing Steps:
1. **Log raw** → `webhook_events_log` (before any parsing)
2. **Verify signature** → HMAC-SHA256 with `WHATSAPP_APP_SECRET`, constant-time compare
3. **Rate limit** → `check_rate_limit` RPC (60 req/10s per IP)
4. **Parse** → extract `entry[].changes[].value`
5. **Resolve tenant** → `whatsapp_integrations.phone_number_id → tenant_id`
6. **Find/create conversation** → key: `wa:{phone_number_id}:{from_phone}`
7. **Upsert message** → idempotent on `external_message_id = wamid`
8. **Update conversation** → `last_message_at`, `last_inbound_at`, `unread_count++`
9. **Push notification** → via `send-push` edge function
10. **Update health** → `whatsapp_integrations.last_webhook_received_at = now()`

### Supported message types:
| Type | Body Mapping |
|------|-------------|
| text | `msg.text.body` |
| image | `msg.image.caption` or `[Hình ảnh]` |
| document | `msg.document.caption` or `[Tài liệu: filename]` |
| audio | `[Tin nhắn thoại]` |
| video | `msg.video.caption` or `[Video]` |
| location | `[Vị trí: lat, lng]` |
| contacts | `[Danh bạ]` |
| sticker | `[Sticker]` |
| reaction | `[Reaction: emoji]` |

---

## 5. POST — Status Updates

### Payload:
```json
{
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "statuses": [{
          "id": "wamid.xxx",
          "status": "delivered",
          "timestamp": "1708300100",
          "recipient_id": "84987654321"
        }]
      }
    }]
  }]
}
```

### Processing:
1. Map status: `sent → SENT`, `delivered → DELIVERED`, `read → READ`, `failed → FAILED`
2. Find `outbound_messages` by `external_message_id = wamid`
3. **Forward-only** update: `SENT → DELIVERED → READ` (no backward)
4. `FAILED` always accepted
5. Update `messages.wa_status` for UI ticks

---

## 6. Signature Verification (MANDATORY)

```
X-Hub-Signature-256: sha256=<hex_digest>
```

- Algorithm: HMAC-SHA256 (raw body, APP_SECRET)
- Comparison: constant-time (XOR-based, not `===`)
- On failure: 401 + log to `webhook_events_log` with `signature_valid=false`

**Multi-tenant note**: In SaaS model, all tenants share the platform's Meta App → one `WHATSAPP_APP_SECRET`. Per-tenant BYOA (Bring Your Own App) with separate app_secret_ref is Stage 2 scope.

---

## 7. Rate Limiting

| Layer | Key | Window | Max |
|-------|-----|--------|-----|
| Webhook inbound | `wa_webhook:{IP}` | 10s | 60 |
| Message send | `send_message:{conv_id}:{user_id}` | 5s | 1 |

Both use the existing `check_rate_limit` RPC (DB-backed, survives restarts).

---

## 8. Idempotency

| Operation | Key | Mechanism |
|-----------|-----|-----------|
| Inbound message | `wamid` on `messages.external_message_id` | `onConflict: 'external_message_id', ignoreDuplicates: true` |
| Outbound message | `client_message_id` on `outbound_messages` | `onConflict: 'client_message_id'` |
| Status update | Forward-only check | `statusOrder[new] > statusOrder[current]` |

---

## 9. Operator Checklist (Non-Technical)

### Bước 1: Lấy thông tin từ Meta

| Nơi lấy | Thông tin | Ví dụ |
|----------|----------|-------|
| Meta > WhatsApp > API Setup | **Phone Number ID** | `123456789012345` |
| Meta > WhatsApp > API Setup | **WABA ID** | `987654321098765` |
| Meta > WhatsApp > API Setup | **Temporary Access Token** | (dev only, expires 24h) |
| Meta > App Settings > Basic | **App Secret** | (hệ thống cần, KHÔNG chia sẻ) |

### Bước 2: Cài đặt trên Control Hub

1. Vào **Cài đặt → WhatsApp** (`/settings/whatsapp`)
2. Nhập: **WABA ID**, **Phone Number ID**
3. Bấm **Tạo tự động** cho Verify Token (hoặc tự nhập)
4. Nhập **Access Token Ref** = `WHATSAPP_ACCESS_TOKEN` (tên biến ENV)
5. Nhập **App Secret Ref** = `WHATSAPP_APP_SECRET` (tên biến ENV)
6. Bấm **Lưu cấu hình**

### Bước 3: Cấu hình Meta Webhook

1. Vào Meta > WhatsApp > **Configuration**
2. Paste **Callback URL**: `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`
3. Paste **Verify Token**: (copy từ Control Hub)
4. Bấm **Verify and Save**
5. Subscribe webhook fields: ✅ `messages`

### Bước 4: Set Environment Variables (DevOps)

| Key | Nơi set | Giá trị |
|-----|---------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Supabase Edge Function Secrets | Permanent token từ Meta |
| `WHATSAPP_APP_SECRET` | Supabase Edge Function Secrets | App Secret từ Meta App Basic |

```bash
supabase secrets set WHATSAPP_ACCESS_TOKEN=EAAxxxx...
supabase secrets set WHATSAPP_APP_SECRET=abc123...
```

### Bước 5: Test

1. Bấm **Gửi test** trên Settings page (hello_world template)
2. Nhắn tin từ điện thoại → kiểm tra Control Hub nhận
3. Trả lời từ Control Hub → kiểm tra điện thoại nhận

---

## 10. Secrets Required (Key Names Only)

| Secret Name | Purpose | Set Where |
|------------|---------|-----------|
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API access token | Supabase Edge Function Secrets |
| `WHATSAPP_APP_SECRET` | Webhook signature verification | Supabase Edge Function Secrets |
| `SUPABASE_URL` | Auto-set by Supabase | (built-in) |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase | (built-in) |

---

## 11. Multi-Tenant Secret Storage Roadmap

**Current (Stage 1.2)**: All tenants share platform's Meta App →  
- One `WHATSAPP_APP_SECRET` ENV var  
- One `WHATSAPP_ACCESS_TOKEN` ENV var (or per-tenant via `access_token_ref`)  
- `access_token_ref` / `app_secret_ref` in DB store ENV var names, resolved at runtime

**Future (Stage 2.1)**: Per-tenant BYOA (Bring Your Own App) →  
- Each tenant has their own Meta App with separate App Secret  
- `app_secret_ref` resolves to tenant-specific Vault key  
- Signature verification: parse body first (unsigned), resolve tenant, then verify with tenant secret  
- Requires Supabase Vault integration or dedicated secrets manager

---

## 12. Files Involved

| File | Role |
|------|------|
| `supabase/functions/whatsapp-webhook/index.ts` | Webhook handler (GET verify + POST inbound/status) |
| `supabase/functions/whatsapp-send-message/index.ts` | Outbound send (free-form + template) |
| `supabase/functions/whatsapp-test-send/index.ts` | Lightweight test send from Settings page |
| `supabase/migrations/20260219100001_whatsapp_integration.sql` | Core schema (integrations, webhook_events_log, message/conv columns) |
| `supabase/migrations/20260219200001_whatsapp_settings_health.sql` | Health columns + RLS policies |
| `src/pages/settings/WhatsAppSettingsPage.tsx` | Settings UI |
| `src/hooks/useWhatsAppIntegration.ts` | Data hooks |

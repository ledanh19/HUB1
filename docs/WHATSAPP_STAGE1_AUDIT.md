# WhatsApp Stage 1 — Settings & Onboarding Audit

## 1. DB Tables (whatsapp_integrations)

Migration: `supabase/migrations/20260219100001_whatsapp_integration.sql`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| tenant_id | UUID NOT NULL | FK auth.users(id) |
| phone_number_id | TEXT NOT NULL | Meta phone number ID |
| waba_id | TEXT NOT NULL | WABA ID |
| display_phone | TEXT | Human-readable |
| verify_token | TEXT NOT NULL | For hub.verify_token challenge |
| app_secret_ref | TEXT NOT NULL | ENV var name (NOT plaintext) |
| access_token_ref | TEXT NOT NULL | ENV var name (NOT plaintext) |
| status | TEXT | 'active' / 'inactive' |
| webhook_url | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| **UNIQUE** | (tenant_id, phone_number_id) | |

### Missing for Settings health:
- `last_webhook_received_at` — NOT present
- `last_error` — NOT present
- `last_health_check_at` — NOT present

**Action:** Add migration for these 3 nullable columns.

## 2. webhook_events_log

Already exists with: id, tenant_id, channel, phone_number_id, payload_json, signature_valid, processing_status, error_message, received_at.

Can query for health: `SELECT MAX(received_at), COUNT(*) FILTER (WHERE NOT signature_valid AND received_at > now() - '24h') FROM webhook_events_log WHERE phone_number_id = ?`.

## 3. Edge Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `whatsapp-webhook` | GET | Meta verify challenge (looks up verify_token in DB) |
| `whatsapp-webhook` | POST | Inbound messages + status updates |
| `whatsapp-send-message` | POST | Send text/template via Graph API |

### Secret handling pattern:
- `access_token_ref` stores ENV var name (e.g. `WHATSAPP_ACCESS_TOKEN_xxxxx`)
- Edge function reads `Deno.env.get(integration.access_token_ref)` at runtime
- Fallback: `Deno.env.get("WHATSAPP_ACCESS_TOKEN")`
- `app_secret_ref` stores ENV var name; webhook reads `Deno.env.get("WHATSAPP_APP_SECRET")`

**Implication for Settings UI:** UI cannot accept raw tokens and store them directly in DB. The flow is:
1. User provides ENV var name references (or admin sets `supabase secrets set`)
2. UI stores the _ref key name_ in DB
3. For simpler UX: UI can store a generic ref name and admin sets the corresponding env var via CLI

## 4. Frontend patterns

- Auth: `useAuth()` → `user.id` is the tenant_id
- API calls: `supabase.functions.invoke('function-name', { body })` with auto Bearer token
- Direct Supabase table queries: `supabase.from('table').select/insert/update`
- RBAC: `userRole` from `useAuth()` (admin/super_admin for settings)
- Routes: `/settings/*` pattern exists, `ProtectedRoute` wrapper
- Navigation: `sidebarBottomNavigation` has "Cài đặt" group

## 5. Extension points for Stage 1

| Need | Solution |
|------|----------|
| Settings page | New `WhatsAppSettingsPage.tsx` at `/settings/whatsapp` |
| Nav item | Add to `sidebarBottomNavigation[0].children` |
| Route | Add to `App.tsx` under `/settings/whatsapp` |
| Data hook | New `useWhatsAppIntegration.ts` |
| Test send | New edge function `whatsapp-test-send` (lightweight, no conversation needed) |
| Health | Query `webhook_events_log` + new columns on `whatsapp_integrations` |
| Migration | Add `last_webhook_received_at`, `last_error` columns |

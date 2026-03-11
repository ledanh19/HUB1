# Realtime + Push Notifications Implementation Summary

## Overview

This implementation adds comprehensive push notification support for Roomrise Control Hub, enabling background notifications for mobile web/PWA users when the app is closed or in the background.

## Files Created

### Database Migrations
- [supabase/migrations/20250615000001_push_subscriptions.sql](../supabase/migrations/20250615000001_push_subscriptions.sql) - Push subscription storage
- [supabase/migrations/20250615000002_push_deliveries.sql](../supabase/migrations/20250615000002_push_deliveries.sql) - Idempotent delivery tracking

### PWA Infrastructure
- [public/manifest.webmanifest](../public/manifest.webmanifest) - PWA manifest for installability
- [public/sw.js](../public/sw.js) - Service Worker for push handling
- [src/pwa/registerSW.ts](../src/pwa/registerSW.ts) - SW registration and subscription management
- [src/pwa/index.ts](../src/pwa/index.ts) - Module exports

### Edge Functions
- [supabase/functions/push-subscribe/index.ts](../supabase/functions/push-subscribe/index.ts) - Subscription management API
- [supabase/functions/send-push/index.ts](../supabase/functions/send-push/index.ts) - Push delivery with idempotency

### Frontend Components
- [src/hooks/useNotificationCenter.ts](../src/hooks/useNotificationCenter.ts) - Comprehensive notification hook
- [src/components/settings/NotificationSettings.tsx](../src/components/settings/NotificationSettings.tsx) - Settings UI with iOS guide

### Types
- [src/types/push.ts](../src/types/push.ts) - TypeScript types for push notifications

### Documentation
- [docs/PWA_PUSH_SETUP.md](../docs/PWA_PUSH_SETUP.md) - Environment setup guide

## Files Modified

### Settings Page
- [src/pages/SettingsPage.tsx](../src/pages/SettingsPage.tsx) - Added Notifications tab

### Webhooks (Push Triggers)
- [supabase/functions/channex-webhook/index.ts](../supabase/functions/channex-webhook/index.ts) - Added push for booking events
- [supabase/functions/channex-messages-webhook/index.ts](../supabase/functions/channex-messages-webhook/index.ts) - Added push for inbound messages

### HTML
- [index.html](../index.html) - Already had PWA meta tags

## Event Types Supported

| Event Type | Trigger | Description |
|------------|---------|-------------|
| `BOOKING_NEW` | Channex webhook INSERT | New booking created |
| `BOOKING_MODIFIED` | Channex webhook UPDATE | Booking modified |
| `BOOKING_CANCELLED` | Channex webhook CANCELLED status | Booking cancelled |
| `MESSAGE_INBOUND` | Channex messages webhook INBOUND | Guest message received |

## Deduplication Strategy

### Idempotency Keys
- **Bookings**: `channex:{booking_id}:{event_type}:{change_id}`
- **Messages**: `channex:{message_id}:MESSAGE_INBOUND`

### Database Constraint
```sql
CONSTRAINT unique_push_delivery 
UNIQUE (event_type, idempotency_key, recipient_user_id)
```

INSERT with ON CONFLICT DO NOTHING ensures no duplicate pushes.

## Routing Logic

1. **Explicit Recipients**: If `recipient_user_ids` provided, send to those users
2. **Assigned User**: If `assigned_to_user_id` provided, send to that user
3. **Triage Group**: If `use_triage_group: true`, send to users with role from `TRIAGE_ROLE` env (default: `cskh`)

## Deep Link Navigation

| Event Type | Deep Link |
|------------|-----------|
| `BOOKING_*` | `/bookings?highlight={booking_id}` |
| `MESSAGE_INBOUND` | `/messages?conversation={conversation_id}` |

## iOS PWA Support

The implementation includes:
1. iOS Safari detection
2. PWA installation check
3. Step-by-step installation guide in Settings
4. Support for iOS 16.4+ Web Push

## Deployment Checklist

1. **Run Database Migrations**
   ```bash
   supabase db push
   ```

2. **Generate VAPID Keys**
   ```bash
   npx web-push generate-vapid-keys
   ```

3. **Configure Environment Variables**
   - Frontend: `VITE_VAPID_PUBLIC_KEY`
   - Supabase Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

4. **Deploy Edge Functions**
   ```bash
   supabase functions deploy push-subscribe
   supabase functions deploy send-push
   supabase functions deploy channex-webhook
   supabase functions deploy channex-messages-webhook
   ```

5. **Regenerate Types** (optional)
   ```bash
   supabase gen types typescript --local > src/integrations/supabase/types.ts
   ```

## Testing

1. Go to Settings > Thông báo
2. Enable push notifications
3. Create a test booking via Channex
4. Verify push notification received (foreground toast + background push)

## Future Enhancements

- [ ] Per-user notification preferences
- [ ] Notification muting/scheduling
- [ ] Push notification analytics
- [ ] Email fallback for failed pushes
- [ ] Team assignment routing

# PWA Push Notifications - Environment Variables

## Required Environment Variables

### Frontend (.env)
```env
# VAPID Public Key for Web Push
# Generate with: npx web-push generate-vapid-keys
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key_here
```

### Supabase Edge Functions (supabase/functions/.env)
```env
# VAPID Keys for Web Push
# Generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your_vapid_public_key_here
VAPID_PRIVATE_KEY=your_vapid_private_key_here
VAPID_SUBJECT=mailto:admin@roomrise.vn

# Triage team role for routing notifications
# Default: cskh
TRIAGE_ROLE=cskh
```

## Generating VAPID Keys

Run this command to generate new VAPID keys:

```bash
npx web-push generate-vapid-keys
```

This will output:
```
=======================================

Public Key:
BNbxv...your_public_key

Private Key:
gX7j...your_private_key

=======================================
```

**IMPORTANT:**
- Use the SAME public key in both frontend and backend
- The private key should ONLY be in the backend (never expose to frontend)
- The subject should be a mailto: URL with a valid email

## Setting Up in Supabase

1. Go to your Supabase dashboard
2. Navigate to Edge Functions > Secrets
3. Add the following secrets:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

## Setting Up in Vercel/Frontend Host

1. Add environment variable:
   - `VITE_VAPID_PUBLIC_KEY` = your public key

## Database Migrations

Run the migrations to create the push notification tables:

```bash
supabase db push
```

This will create:
- `push_subscriptions` - Stores user push subscription endpoints
- `push_deliveries` - Idempotency tracking for sent notifications

## Testing

1. Enable notifications in Settings > Notifications
2. Create a test booking via Channex webhook
3. Verify push notification is received

## Troubleshooting

### No notifications received
1. Check browser console for errors
2. Verify VAPID keys match between frontend and backend
3. Check Edge Function logs in Supabase dashboard
4. Ensure push_subscriptions has active subscriptions

### "VAPID keys not configured" error
- Ensure VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set in Edge Function secrets

### iOS PWA not receiving notifications
- User must install PWA from Safari using "Add to Home Screen"
- Notifications must be enabled from within the installed PWA
- iOS 16.4+ required for Web Push support

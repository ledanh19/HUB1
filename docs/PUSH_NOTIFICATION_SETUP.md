# 🔔 Push Notification Setup Guide

## Tổng quan

Hệ thống push notification của Roomrise đã được xây dựng hoàn chỉnh với:

| Component | Status | Location |
|-----------|--------|----------|
| Service Worker | ✅ Ready | `public/sw.js` |
| SW Registration | ✅ Ready | `src/pwa/registerSW.ts` |
| Edge Function: Subscribe | ✅ Ready | `supabase/functions/push-subscribe/` |
| Edge Function: Send Push | ✅ Ready | `supabase/functions/send-push/` |
| Migration: push_subscriptions | ✅ Ready | `supabase/migrations/20250615000001_push_subscriptions.sql` |
| Migration: push_deliveries | ✅ Ready | `supabase/migrations/20250615000002_push_deliveries.sql` |
| Settings UI | ✅ Ready | `src/components/settings/NotificationSettings.tsx` |

## 🔑 Step 1: Generate VAPID Keys

```bash
# Option 1: Using npx (recommended)
npx web-push generate-vapid-keys

# Option 2: Using installed package
npm install -g web-push
web-push generate-vapid-keys
```

Output sẽ như sau:
```
=======================================

Public Key:
BNjAaTWKpH... (65-87 characters)

Private Key:
your-private-key... (43 characters)

=======================================
```

**⚠️ QUAN TRỌNG**: Lưu giữ cả 2 key này! Private key không thể khôi phục.

## 🌐 Step 2: Configure Frontend (.env)

Thêm vào file `.env` hoặc `.env.local`:

```env
# VAPID Public Key (MUST match backend)
VITE_VAPID_PUBLIC_KEY=BNjAaTWKpH...your-full-public-key...
```

**⚠️ Lưu ý**: 
- Key phải là URL-safe base64 format
- KHÔNG có dấu `=` ở cuối
- Phải restart dev server sau khi thay đổi .env

## ☁️ Step 3: Configure Supabase Edge Function Secrets

Vào Supabase Dashboard > Project Settings > Edge Functions > Secrets:

| Secret Name | Value |
|-------------|-------|
| `VAPID_PUBLIC_KEY` | `BNjAaTWKpH...` (same as frontend) |
| `VAPID_PRIVATE_KEY` | `your-private-key...` |
| `VAPID_SUBJECT` | `mailto:admin@roomrise.vn` |

Hoặc dùng CLI:

```bash
# Set secrets via CLI
supabase secrets set VAPID_PUBLIC_KEY="BNjAaTWKpH..."
supabase secrets set VAPID_PRIVATE_KEY="your-private-key..."
supabase secrets set VAPID_SUBJECT="mailto:admin@roomrise.vn"
```

## 🚀 Step 4: Deploy Edge Functions

```bash
# Deploy push-subscribe function
supabase functions deploy push-subscribe

# Deploy send-push function
supabase functions deploy send-push
```

## 🗄️ Step 5: Run Migrations

```bash
# Apply migrations if not already done
supabase db push
```

Hoặc chạy SQL trực tiếp trong Supabase SQL Editor:
1. `20250615000001_push_subscriptions.sql`
2. `20250615000002_push_deliveries.sql`

## ✅ Step 6: Verify Setup

### 6.1 Check Frontend Config
Mở browser console (F12) và tìm:
```
[PWA] VAPID config status: { hasKey: true, keyLength: 87, keyPreview: 'BNjAaTWKp...' }
```

### 6.2 Check Settings Page
Vào **Settings > Notifications**, kiểm tra:
- ✅ VAPID Key: Đã cấu hình
- ✅ Push hỗ trợ: Có
- ✅ Quyền thông báo: Đã cấp
- ✅ Đăng ký push: Đã đăng ký

### 6.3 Test Push Subscription
1. Bật "Thông báo đẩy" trong Settings
2. Browser sẽ hỏi quyền notification
3. Cho phép → Check console log:
   ```
   [PWA] Push subscription created: https://fcm.googleapis.com/...
   [PWA] Subscription saved to backend: { success: true }
   ```

### 6.4 Test Push Delivery
1. Tạo booking mới từ Channex webhook
2. Kiểm tra console log của Edge Function
3. Notification sẽ hiển thị trên browser/mobile

## 📱 iOS Requirements

iOS yêu cầu điều kiện đặc biệt:

| Requirement | Description |
|-------------|-------------|
| iOS 16.4+ | Phiên bản iOS tối thiểu |
| Safari only | KHÔNG dùng Chrome/Firefox |
| Installed PWA | PHẢI cài app lên Home Screen |
| In-app enable | Bật notification từ trong app đã cài |

### Hướng dẫn iOS:
1. Mở Safari → Navigate to app
2. Tap Share button (□↑)
3. "Add to Home Screen"
4. Mở app từ Home Screen
5. Settings > Notifications > Bật

## 🔍 Troubleshooting

### ❌ "VAPID key chưa cấu hình"
- Check `.env` file có `VITE_VAPID_PUBLIC_KEY`
- Restart dev server
- Hard refresh browser (Ctrl+Shift+R)

### ❌ "Push subscription failed"
- Check browser supports Push API
- Check VAPID key format (no trailing `=`)
- Check Service Worker registered

### ❌ "Backend sync error"
- Check Supabase Edge Function secrets
- Check push-subscribe function deployed
- Check auth token valid

### ❌ "Notification not showing"
- Check browser notification permission
- Check notification not blocked by OS
- For iOS: Check PWA installed from Safari

### ❌ "Push works on desktop, not mobile"
- iOS: Must be installed PWA from Safari
- Android: Check notification channel settings
- Check battery optimization not blocking

## 📊 Database Tables

### push_subscriptions
```sql
SELECT * FROM push_subscriptions WHERE user_id = auth.uid();
```

### push_deliveries
```sql
SELECT * FROM push_deliveries 
WHERE recipient_user_id = auth.uid() 
ORDER BY delivered_at DESC 
LIMIT 10;
```

## 🔗 Related Files

- [registerSW.ts](../src/pwa/registerSW.ts) - SW registration & push subscription
- [NotificationSettings.tsx](../src/components/settings/NotificationSettings.tsx) - UI settings
- [push-subscribe/index.ts](../supabase/functions/push-subscribe/index.ts) - Save subscription
- [send-push/index.ts](../supabase/functions/send-push/index.ts) - Send notification
- [sw.js](../public/sw.js) - Service worker push handler

## 📝 Checklist

```
□ Generate VAPID keys
□ Add VITE_VAPID_PUBLIC_KEY to .env
□ Add VAPID secrets to Supabase
□ Deploy push-subscribe function
□ Deploy send-push function
□ Run migrations (push_subscriptions, push_deliveries)
□ Test in Settings > Notifications
□ Test with real booking from Channex
```

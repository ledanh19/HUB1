# WhatsApp Stage 1 – Settings & QR Onboarding UAT

> **Scope**: `/settings/whatsapp` page – manual connect, save config, QR link, test send, webhook health.
> **Pre-requisites**: Migration `20260219200001_whatsapp_settings_health.sql` applied. Edge function `whatsapp-test-send` deployed. User logged in as `admin` or `super_admin`.

---

## UAT-1: Tạo mới Integration (Create)

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Login admin → Sidebar → Cài đặt → **WhatsApp** | Trang `/settings/whatsapp` hiển thị. Badge **"Chưa kết nối"** (đỏ). |
| 2 | Card "Thông tin cấu hình" hiển thị form rỗng | Tất cả input trống. Verify Token có nút **Tạo tự động**. |
| 3 | Bấm **Tạo tự động** | Trường verify_token được điền `rr_verify_` + 24 ký tự random. |
| 4 | Chỉ nhập WABA ID, để trống Phone Number ID → bấm **Lưu cấu hình** | Toast lỗi: validation chặn do thiếu trường bắt buộc. |
| 5 | Nhập đầy đủ: WABA ID, Phone Number ID, verify_token, Access Token Ref = `WHATSAPP_ACCESS_TOKEN`, App Secret Ref = `WHATSAPP_APP_SECRET` → **Lưu** | Toast thành công "Đã lưu cấu hình WhatsApp". |
| 6 | Trang tự reload dữ liệu | Badge chuyển **"Đã kết nối"** (xanh). WABA ID + Phone Number ID hiển thị ở card trạng thái. |
| 7 | Kiểm tra DB | `select * from whatsapp_integrations where tenant_id = '<user_id>'` trả 1 row, `status = 'active'`. |

---

## UAT-2: Cập nhật Integration (Update – giữ secret refs)

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Đã có integration từ UAT-1. Thay đổi **Display Phone** → `+84 123 456 789`. Để trống cả Access Token Ref lẫn App Secret Ref. → **Lưu** | Toast thành công. |
| 2 | Kiểm tra DB | `display_phone = '+84 123 456 789'`. `access_token_ref` và `app_secret_ref` GIỮ NGUYÊN giá trị cũ (không bị null/empty). |
| 3 | Đổi Phone Number ID sang giá trị mới → **Lưu** | Update thành công, phone_number_id chỉ chứa digits. |

---

## UAT-3: Gửi Test Template

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Card "Kiểm tra" chỉ hiển thị khi integration connected | Card hiển thị input số điện thoại + nút **Gửi test**. |
| 2 | Nhập invalid phone (< 8 digits) → bấm **Gửi test** | Toast lỗi: "Số điện thoại không hợp lệ". |
| 3 | Nhập valid test phone (sandbox number hoặc số thật đã đăng ký) → **Gửi test** | Loading spinner hiển thị. Toast thành công "Tin nhắn test đã được gửi thành công!". |
| 4 | Kiểm tra WhatsApp trên điện thoại test | Nhận được message template `hello_world`. |
| 5 | Kiểm tra DB `message_events` | 1 row: `direction = 'outbound'`, `channel = 'whatsapp'`, `template_name = 'hello_world'`, `delivery_status = 'sent'`. |

> **Nếu không có sandbox number**: Verify trả về HTTP 200 từ Meta Graph API (check qua logs edge function).

---

## UAT-4: Webhook Health

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Sau khi gửi test ở UAT-3, chờ ~1 phút (hoặc bấm refresh) | Card "Webhook Health" hiển thị 3 metric cards. |
| 2 | Gửi tin nhắn từ WhatsApp phone → webhook fires | `webhook_events_log` có 1 row mới. |
| 3 | Đợi trang auto-refresh (60s) hoặc reload | "Webhooks (24h)" tăng đếm. "Last webhook" hiển thị thời gian mới nhất. |
| 4 | Nếu chưa có webhook | "Webhooks (24h)" = 0. "Last webhook" = "Chưa nhận". Badge vẫn "Đã kết nối" (based on integration existence). |

---

## UAT-5: Multi-tenant Isolation

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Login với **Tenant A** (admin) → tạo integration ở UAT-1 | Integration hiển thị bình thường. |
| 2 | Logout → Login với **Tenant B** (admin) → vào `/settings/whatsapp` | Badge "Chưa kết nối". KHÔNG thấy integration của Tenant A. |
| 3 | Tenant B tạo integration riêng | Thành công. DB có 2 rows với `tenant_id` khác nhau. |
| 4 | Kiểm tra RLS | `select * from whatsapp_integrations` (via client) chỉ trả row của user đang login. |

---

## UAT-6: QR Code & Connect Link

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Card "Kết nối bằng QR" hiển thị QR image | QR hiển thị (200×200 px). |
| 2 | Bấm **Sao chép link** | Link `https://<domain>/settings/whatsapp?tenant=<userId>` copied to clipboard. Toast xác nhận. |
| 3 | Bấm **Mở link mới** | Browser mở tab mới chứa URL trên. |
| 4 | Quét QR bằng điện thoại | Mở URL kết nối đúng. |

---

## UAT-7: Role Restriction

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Login với role `sale` hoặc `cskh` → vào `/settings/whatsapp` | Hiển thị "Bạn không có quyền truy cập trang này." |
| 2 | Login với role `admin` | Trang hiển thị bình thường. |
| 3 | Login với role `super_admin` | Trang hiển thị bình thường. |

---

## UAT-8: Non-Breaking Check

| # | Bước | Kỳ vọng |
|---|------|---------|
| 1 | Vào `/inbox` (OTA Messages) | Trang Inbox vẫn hoạt động bình thường. Channel filter WhatsApp vẫn có. |
| 2 | Gửi/nhận tin nhắn qua webhook cũ | Hoạt động không thay đổi. |
| 3 | Sidebar navigation | Tất cả menu items hiển thị đúng. WhatsApp nằm trong section "Cài đặt". |
| 4 | `npx tsc --noEmit` | Zero errors. |

---

## Summary Checklist

| Test | Status |
|------|--------|
| UAT-1 Create Integration | ☐ |
| UAT-2 Update (keep secrets) | ☐ |
| UAT-3 Test Send | ☐ |
| UAT-4 Webhook Health Display | ☐ |
| UAT-5 Multi-tenant Isolation | ☐ |
| UAT-6 QR Code & Link | ☐ |
| UAT-7 Role Restriction | ☐ |
| UAT-8 Non-Breaking Check | ☐ |

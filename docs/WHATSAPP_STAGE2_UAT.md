# WhatsApp Stage 2 + 2.1 — UAT Checklist
> Inbox CSKH UX Upgrade + Booking Context Matching

## Pre-requisites
- [ ] WhatsApp send/receive working (Stage 1 confirmed OK)
- [ ] At least 1 WhatsApp conversation exists in `conversations` table
- [ ] At least 1 booking in `bookings_mirror` has `guest_phone` matching a WA conversation's `wa_customer_phone`

---

## Phase A: Inbox UX (already existed — verify regression-free)

### A1. Sort order
- [ ] Open Inbox → WhatsApp filter → conversations sort by:
  1. NEW (unread_count > 0) first
  2. UNANSWERED (inbound newer than outbound) second
  3. Newest `last_message_at` DESC within each tier
- [ ] Send a message to a conversation → it moves to top

### A2. Message preview
- [ ] Each conversation item shows truncated last message (≤ 50 chars)
- [ ] Preview updates in real-time when new message arrives

### A3. Unread badge
- [ ] New inbound message → red badge with count on conversation icon
- [ ] "Chưa đọc" label appears in badges row
- [ ] Header shows total unread count

### A4. Mark-as-read
- [ ] Click/tap a conversation → `unread_count` resets to 0 immediately
- [ ] Red badge disappears
- [ ] "Chưa đọc" label disappears

### A5. Auto-scroll
- [ ] Open a conversation → thread scrolls to bottom instantly
- [ ] New message arrives while at bottom → auto-scrolls
- [ ] Scroll up to read old messages → "N tin nhắn mới" floating button appears
- [ ] Click floating button → scrolls to bottom + clears badge

### A6. WhatsApp delivery ticks
- [ ] Send a WhatsApp message → shows ✓ (single check, gray) = SENT
- [ ] Message delivered → shows ✓✓ (double check, gray) = DELIVERED
- [ ] Message read → shows ✓✓ (double check, blue) = READ
- [ ] Message failed → shows ✗ (red circle) = FAILED

### A7. Sender labels
- [ ] Inbound messages show guest name below bubble (left side, cyan avatar)
- [ ] Outbound messages show "Roomrise" or sender_name below bubble (right side, logo)
- [ ] System messages centered with muted style

### A8. Search filter (enhanced)
- [ ] Search by guest name → filters conversations
- [ ] Search by phone number → filters WhatsApp conversations
- [ ] Search by booking code → filters conversations
- [ ] Search by message preview text → filters conversations
- [ ] Clear search → shows all conversations again

---

## Phase B: Booking Context Matching (NEW)

### B1. Auto phone→booking match
- [ ] WhatsApp conversation with `wa_customer_phone` matching a booking's `guest_phone`
  - [ ] ContextPanel shows "Booking" section with booking details
  - [ ] "phone match" badge appears next to "Booking" header
  - [ ] Booking code links to `/bookings/{id}`
  - [ ] Check-in/check-out dates displayed
  - [ ] Property name displayed
  - [ ] OTA source displayed
  - [ ] Stay status badge shown (Chờ check-in / Đang ở / etc.)

### B2. No booking match
- [ ] WhatsApp conversation with `wa_customer_phone` NOT in any booking
  - [ ] ContextPanel shows "Chưa tìm thấy booking" with dashed border
  - [ ] "Liên kết booking thủ công" button visible

### B3. Manual "Link Booking" dialog
- [ ] Click "Liên kết booking thủ công" → dialog opens
- [ ] Dialog shows search input + conversation phone number
- [ ] Search by guest name → results appear
- [ ] Search by booking code → results appear
- [ ] Search by phone → results appear
- [ ] Click a booking result → conversation.unified_booking_id updated
- [ ] Dialog closes + toast success
- [ ] ContextPanel refreshes to show linked booking info

### B4. WhatsApp channel section in ContextPanel
- [ ] WhatsApp conversations show "WhatsApp" section at top of ContextPanel
- [ ] Phone number displayed with WhatsApp deep link (wa.me/...)
- [ ] 24h window indicator shows:
  - [ ] "Chưa có tin nhắn đến" if no inbound messages
  - [ ] "Còn Xh" (green) if window >4h remaining
  - [ ] "Còn Xh" (amber) if window <4h remaining
  - [ ] "Đã hết hạn" (red) if window expired (>24h since last inbound)

---

## Phase C: Cross-cutting

### C1. Mobile responsive
- [ ] All Phase A features work on mobile viewport
- [ ] ContextPanel accessible via drawer on mobile
- [ ] Link Booking dialog usable on mobile

### C2. OTA conversations unaffected
- [ ] OTA filter still works as before
- [ ] OTA conversations still show booking info (via unified_booking_id)
- [ ] OTA conversations do NOT show WhatsApp section in ContextPanel
- [ ] OTA conversations do NOT show 24h window indicator

### C3. Performance
- [ ] Page loads in <3s with 50+ conversations
- [ ] No waterfall queries visible in Network tab
- [ ] Realtime updates don't cause full page re-render

---

## Sign-off
| Area | Tester | Status | Date |
|------|--------|--------|------|
| Phase A (sort/preview/unread) | | ☐ | |
| Phase A (scroll/ticks/labels) | | ☐ | |
| Phase A (search filter) | | ☐ | |
| Phase B (auto phone match) | | ☐ | |
| Phase B (link booking dialog) | | ☐ | |
| Phase B (24h window) | | ☐ | |
| Phase C (mobile + perf) | | ☐ | |

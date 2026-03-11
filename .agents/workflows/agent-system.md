---
description: Multi-Agent System - Quy trình phối hợp đội ngũ AI Agent cho dự án Roomrise PMS
---

# 🤖 Hệ Thống Multi-Agent — Roomrise Control Hub

## Tổng Quan

Dự án sử dụng 4 AI Agent chuyên biệt, phối hợp qua tài liệu chung (`docs/`, `.agents/`) và quy trình chuẩn.

---

## Danh Sách Agent

| Agent | Vai Trò | Khi Nào Gọi |
|-------|---------|-------------|
| **Agent 1: Architect & Backend** | Thiết kế hệ thống, Supabase schema, Edge Functions, RLS, triggers | Khi cần thay đổi database, API, logic nghiệp vụ |
| **Agent 2: Frontend UI/UX** | React components, pages, hooks, styling, animations | Khi cần tạo/sửa giao diện, tích hợp API |
| **Agent 3: QA & Testing** | Test plans, E2E tests, bug reports, regression | Khi cần kiểm thử, xác nhận tính năng hoạt động |
| **Agent 4: UX Evaluator** | Đánh giá trải nghiệm, accessibility, responsive | Khi cần review UX trước/sau thay đổi |

---

## Quy Trình Phối Hợp

### Bước 1: Tiếp nhận yêu cầu
```
User → Mô tả tính năng/bug → Chọn Agent phù hợp
```

### Bước 2: Planning
- Agent được chọn đọc context từ `docs/` và các file liên quan
- Tạo implementation plan
- User review & approve

### Bước 3: Execution
- Agent thực hiện code changes
- Commit message format: `[Agent-N] <type>: <description>`

### Bước 4: Verification
- Agent 3 (QA) chạy test plan
- Agent 4 (UX) review nếu có thay đổi UI

### Bước 5: Closure
- Cập nhật `docs/PROJECT_STATUS.md`
- Log vào walkthrough

---

## Cách Gọi Từng Agent

### 🏗️ /architect — Agent 1
Sử dụng khi cần:
- Thiết kế database schema mới
- Tạo Supabase Edge Functions
- Fix race conditions, triggers, RLS
- Review kiến trúc hệ thống
- Tối ưu query performance

**Ví dụ:**
```
/architect Tạo trigger chặn cash_out vượt approved amount
/architect Review và fix race condition trong useHostPayableSync
/architect Thiết kế schema cho tính năng mới X
```

### 🎨 /frontend — Agent 2
Sử dụng khi cần:
- Tạo page/component mới
- Sửa UI bugs, responsive issues
- Thêm animations, loading states
- Tích hợp API mới vào frontend
- Cải thiện UX flow

**Ví dụ:**
```
/frontend Thêm skeleton loading cho Dashboard
/frontend Tạo page quản lý Staff mới
/frontend Fix responsive trên mobile cho BookingsPage
```

### 🧪 /qa — Agent 3
Sử dụng khi cần:
- Chạy test suite
- Tạo test plan cho tính năng mới
- Kiểm tra regression sau thay đổi
- Audit bảo mật

**Ví dụ:**
```
/qa Tạo test plan cho module Booking
/qa Chạy E2E test toàn bộ luồng thanh toán
/qa Audit bảo mật cho các Edge Functions
```

### 👁️ /ux-review — Agent 4
Sử dụng khi cần:
- Đánh giá thiết kế trước khi ship
- Review accessibility (WCAG)
- Kiểm tra consistency across pages
- Đề xuất cải thiện UX

**Ví dụ:**
```
/ux-review Review toàn bộ flow đặt phòng
/ux-review Đánh giá dark mode consistency
/ux-review Kiểm tra responsive trên tablet
```

---

## Tham Chiếu Nhanh

| File | Mô Tả |
|------|--------|
| `docs/COMPREHENSIVE_SYSTEM_AUDIT_REPORT.md` | Báo cáo audit toàn hệ thống |
| `docs/GAPS.md` | Các gap cần fix (G1-G10) |
| `docs/PROJECT_STATUS.md` | Trạng thái dự án hiện tại |
| `.agents/agent-architect.md` | Chi tiết Agent 1 |
| `.agents/agent-frontend.md` | Chi tiết Agent 2 |
| `.agents/agent-qa.md` | Chi tiết Agent 3 |
| `.agents/agent-ux-reviewer.md` | Chi tiết Agent 4 |

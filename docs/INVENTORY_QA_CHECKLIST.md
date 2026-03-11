# INVENTORY API - QA PASS/FAIL CHECKLIST

> **Version**: 1.0.0  
> **Last Updated**: 2024-12-19  
> **Status**: LOCKED SPEC

## Overview

Checklist này dùng để kiểm tra API Inventory đạt chuẩn Zero-Error Spec.  
Mỗi item phải PASS để hệ thống được phê duyệt go-live.

---

## I. NGUYÊN TẮC CỐT LÕI

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 1.1 | API chỉ trả dữ liệu đã resolve (final_value) | ☐ | ☐ | Không trả raw rule/override |
| 1.2 | Frontend không suy đoán logic | ☐ | ☐ | UI chỉ render, không tính toán |
| 1.3 | Mọi thay đổi có truy vết theo thời gian | ☐ | ☐ | applied_at, applied_by bắt buộc |
| 1.4 | Không ghi trùng (idempotency) | ☐ | ☐ | Gửi lại cùng key = không duplicate |
| 1.5 | Audit được tại thời điểm T | ☐ | ☐ | Snapshot immutable |

---

## II. ATOMIC CELL

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 2.1 | Cell = RoomType × RatePlan × Channel × StayDate × Restriction | ☐ | ☐ | 5 chiều đầy đủ |
| 2.2 | Mỗi cell có `final_value` | ☐ | ☐ | Không null/undefined |
| 2.3 | Mỗi cell có `source_layer` ∈ {BASE, SYNC, RULE, OVERRIDE} | ☐ | ☐ | |
| 2.4 | Mỗi cell có `applied_at` (ISO timestamp) | ☐ | ☐ | |
| 2.5 | Mỗi cell có `applied_by` (user UUID hoặc system) | ☐ | ☐ | |
| 2.6 | Mỗi cell có `data_version` (snapshot id) | ☐ | ☐ | |
| 2.7 | Không tồn tại cell "không rõ nguồn" | ☐ | ☐ | |

---

## III. RESTRICTIONS

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 3.1 | RATE (giá) hoạt động độc lập | ☐ | ☐ | |
| 3.2 | AVL (tồn kho) hoạt động độc lập | ☐ | ☐ | |
| 3.3 | SS (Stop Sell) hoạt động độc lập | ☐ | ☐ | |
| 3.4 | CTA (Closed to Arrival) hoạt động độc lập | ☐ | ☐ | |
| 3.5 | CTD (Closed to Departure) hoạt động độc lập | ☐ | ☐ | |
| 3.6 | MSA (Min Stay Arrival) hoạt động độc lập | ☐ | ☐ | |
| 3.7 | MST (Min Stay Through) hoạt động độc lập | ☐ | ☐ | |
| 3.8 | MXS (Max Stay) hoạt động độc lập | ☐ | ☐ | |
| 3.9 | MAL (Min Advance) hoạt động độc lập | ☐ | ☐ | |
| 3.10 | Các restriction không ảnh hưởng lẫn nhau | ☐ | ☐ | Sửa RATE không đổi AVL |

---

## IV. THỨ TỰ ƯU TIÊN (PRIORITY)

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 4.1 | Draft (UI-only) có priority cao nhất | ☐ | ☐ | Chỉ hiện trên UI |
| 4.2 | Manual Override thắng Rules | ☐ | ☐ | |
| 4.3 | Rule priority cao thắng priority thấp | ☐ | ☐ | |
| 4.4 | Rule thắng Synced OTA Snapshot | ☐ | ☐ | |
| 4.5 | Synced OTA thắng Base Default | ☐ | ☐ | |
| 4.6 | Cell Explain trả `precedence_reason` đúng | ☐ | ☐ | |

---

## V. DATE LOGIC

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 5.1 | Date = Stay Date (không phải booking date) | ☐ | ☐ | |
| 5.2 | Start/End date inclusive | ☐ | ☐ | 01/01 - 03/01 = 3 ngày |
| 5.3 | Weekday filter hoạt động đúng | ☐ | ☐ | Chọn T2-T6 chỉ áp dụng T2-T6 |
| 5.4 | Timezone đúng (Asia/Ho_Chi_Minh) | ☐ | ☐ | |
| 5.5 | Không cho chỉnh ngày quá khứ | ☐ | ☐ | API reject hoặc warning |
| 5.6 | Không lệch 1 ngày so với OTA | ☐ | ☐ | **Critical** |

---

## VI. API READ - GRID

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 6.1 | Response chứa `meta.timezone` | ☐ | ☐ | |
| 6.2 | Response chứa `meta.last_synced_at` | ☐ | ☐ | |
| 6.3 | Response chứa `meta.data_version` | ☐ | ☐ | |
| 6.4 | Response chứa `meta.scope_hash` | ☐ | ☐ | Dùng cho conflict detection |
| 6.5 | Grid cells đều có final_value | ☐ | ☐ | |
| 6.6 | Grid cells đều có source_layer | ☐ | ☐ | |
| 6.7 | Grid cells đều có state (SYNCED/PENDING/FAILED) | ☐ | ☐ | |
| 6.8 | Pagination hoạt động đúng | ☐ | ☐ | |
| 6.9 | Filter by room_type_ids hoạt động | ☐ | ☐ | |
| 6.10 | Filter by channel_ids hoạt động | ☐ | ☐ | |
| 6.11 | Filter by restrictions hoạt động | ☐ | ☐ | |

---

## VII. API EXPLAIN

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 7.1 | Trả final_value đúng | ☐ | ☐ | |
| 7.2 | Trả source_layer đúng | ☐ | ☐ | |
| 7.3 | Trả rule_id nếu từ Rule | ☐ | ☐ | |
| 7.4 | Trả rule_priority nếu từ Rule | ☐ | ☐ | |
| 7.5 | Trả override_id nếu từ Override | ☐ | ☐ | |
| 7.6 | Trả precedence_reason | ☐ | ☐ | Giải thích tại sao thắng |
| 7.7 | Trả resolution_chain (optional) | ☐ | ☐ | Các layer đã xét |

---

## VIII. DRY-RUN (PREVIEW)

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 8.1 | Dry-run không ghi database | ☐ | ☐ | Chỉ simulate |
| 8.2 | Trả affected_cells count | ☐ | ☐ | |
| 8.3 | Trả before_value và after_value | ☐ | ☐ | |
| 8.4 | Trả blast_radius | ☐ | ☐ | room_types, channels, dates, total |
| 8.5 | Trả warnings nếu có | ☐ | ☐ | |
| 8.6 | UI hiển thị kết quả dry-run | ☐ | ☐ | Không tự tính |
| 8.7 | Bulk operation bắt buộc dry-run trước | ☐ | ☐ | |

---

## IX. API WRITE - BATCH UPDATE

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 9.1 | Yêu cầu batch_id | ☐ | ☐ | |
| 9.2 | Yêu cầu idempotency_key | ☐ | ☐ | |
| 9.3 | Yêu cầu scope_hash | ☐ | ☐ | |
| 9.4 | Idempotent: gửi lại key = không ghi trùng | ☐ | ☐ | **Critical** |
| 9.5 | Scope hash mismatch → reject 409 | ☐ | ☐ | |
| 9.6 | Mỗi Save tạo snapshot mới | ☐ | ☐ | Immutable |
| 9.7 | Response chứa snapshot_id | ☐ | ☐ | |
| 9.8 | Response chứa affected_cells | ☐ | ☐ | |

---

## X. SYNC STATUS

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 10.1 | Trả status: PENDING/PROCESSING/SUCCESS/PARTIAL_FAILED/FAILED | ☐ | ☐ | |
| 10.2 | Trả synced_cells count | ☐ | ☐ | |
| 10.3 | Trả failed_cells count | ☐ | ☐ | |
| 10.4 | Trả failures với error detail | ☐ | ☐ | |
| 10.5 | Không cần F5 để cập nhật status | ☐ | ☐ | Realtime hoặc polling |

---

## XI. SNAPSHOT & AUDIT

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 11.1 | Snapshot là read-only | ☐ | ☐ | |
| 11.2 | Snapshot immutable (không thể sửa) | ☐ | ☐ | |
| 11.3 | Có thể query snapshot by version | ☐ | ☐ | |
| 11.4 | Có thể query snapshot by as_of (point-in-time) | ☐ | ☐ | |
| 11.5 | Snapshot chứa đủ data cho audit | ☐ | ☐ | |
| 11.6 | Dùng được cho dispute OTA | ☐ | ☐ | **Critical** |

---

## XII. MULTI-USER & CONFLICT

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 12.1 | Phát hiện concurrent edit | ☐ | ☐ | |
| 12.2 | Trả conflicting_cells khi conflict | ☐ | ☐ | |
| 12.3 | Không overwrite âm thầm | ☐ | ☐ | **Critical** |
| 12.4 | Hiển thị "User A edited this X minutes ago" | ☐ | ☐ | |
| 12.5 | Soft-lock vùng đang chỉnh | ☐ | ☐ | |

---

## XIII. NUMERIC & DISPLAY

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 13.1 | Backend trả numeric chuẩn | ☐ | ☐ | Không string |
| 13.2 | Frontend format theo locale | ☐ | ☐ | |
| 13.3 | Không làm tròn ngầm | ☐ | ☐ | |
| 13.4 | Currency đúng (VND) | ☐ | ☐ | |

---

## XIV. LIMITS & GUARDRAILS

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 14.1 | Max cells/batch được enforce | ☐ | ☐ | |
| 14.2 | Max date range được enforce | ☐ | ☐ | |
| 14.3 | Role-based bulk permission | ☐ | ☐ | |
| 14.4 | Rate delta threshold warning | ☐ | ☐ | Thay đổi > 50% |
| 14.5 | Blast radius warning | ☐ | ☐ | > 100 cells |

---

## XV. UX SAFETY

| # | Tiêu chí | PASS | FAIL | Ghi chú |
|---|----------|------|------|---------|
| 15.1 | Double confirm cho bulk lớn | ☐ | ☐ | |
| 15.2 | Preview bắt buộc trước Save | ☐ | ☐ | |
| 15.3 | Disable Save khi chưa Preview | ☐ | ☐ | |
| 15.4 | Hiển thị blast radius warning | ☐ | ☐ | |
| 15.5 | Không có thao tác "nhanh cho xong" | ☐ | ☐ | |

---

## TỔNG KẾT

| Section | Items | PASS | FAIL |
|---------|-------|------|------|
| I. Nguyên tắc cốt lõi | 5 | ☐ | ☐ |
| II. Atomic Cell | 7 | ☐ | ☐ |
| III. Restrictions | 10 | ☐ | ☐ |
| IV. Priority | 6 | ☐ | ☐ |
| V. Date Logic | 6 | ☐ | ☐ |
| VI. API Grid | 11 | ☐ | ☐ |
| VII. API Explain | 7 | ☐ | ☐ |
| VIII. Dry-Run | 7 | ☐ | ☐ |
| IX. Batch Update | 8 | ☐ | ☐ |
| X. Sync Status | 5 | ☐ | ☐ |
| XI. Snapshot | 6 | ☐ | ☐ |
| XII. Multi-User | 5 | ☐ | ☐ |
| XIII. Numeric | 4 | ☐ | ☐ |
| XIV. Limits | 5 | ☐ | ☐ |
| XV. UX Safety | 5 | ☐ | ☐ |
| **TOTAL** | **97** | ☐ | ☐ |

---

## KẾT LUẬN

### ✅ PASS TOÀN BỘ
- Hệ thống đạt chuẩn Zero-Error Spec
- Sẵn sàng go-live
- Có thể dùng cho audit và dispute OTA

### ❌ CÓ ITEM FAIL
- Liệt kê các item FAIL
- Đánh giá severity (Critical / High / Medium / Low)
- Lên kế hoạch fix trước go-live

---

## NGƯỜI KIỂM TRA

| Role | Tên | Ngày | Chữ ký |
|------|-----|------|--------|
| QA Lead | | | |
| Tech Lead | | | |
| Product Owner | | | |

---

*Document này là source of truth duy nhất cho QA Inventory API.*

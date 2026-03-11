# ACCEPTANCE CRITERIA - Partner & Property Catalog System

## ✅ ACCEPTANCE CHECKLIST

### 1. Đối tác (Partners)

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 1.1 | Tạo đối tác Host mới | Tạo thành công, audit log ghi nhận | ☐ |
| 1.2 | Sửa thông tin đối tác | Cập nhật thành công, audit ghi before/after | ☐ |
| 1.3 | Vô hiệu hóa đối tác | Status = inactive, không xóa record | ☐ |
| 1.4 | Xóa đối tác còn property | Báo lỗi, không cho xóa | ☐ |
| 1.5 | Xóa đối tác không còn reference | Xóa thành công | ☐ |

### 2. Chỗ nghỉ (Properties)

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 2.1 | Thêm chỗ nghỉ KHÔNG chọn loại hình | Báo lỗi validation | ☐ |
| 2.2 | Thêm chỗ nghỉ CÓ chọn loại hình từ dropdown | Tạo thành công với property_type_id | ☐ |
| 2.3 | Sửa chỗ nghỉ | Cập nhật thành công | ☐ |
| 2.4 | Xóa chỗ nghỉ đang dùng trong segment | Báo lỗi reference | ☐ |
| 2.5 | Xóa chỗ nghỉ không dùng | Xóa thành công | ☐ |

### 3. Loại phòng (Room Types)

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 3.1 | Dropdown hiển thị room types từ catalog | Danh sách đúng theo property type | ☐ |
| 3.2 | Thêm loại phòng đã tồn tại | Báo lỗi trùng | ☐ |
| 3.3 | Thêm loại phòng mới từ dropdown | Tạo mapping thành công | ☐ |
| 3.4 | Xóa loại phòng đang dùng trong segment | Báo lỗi reference | ☐ |
| 3.5 | Xóa loại phòng không dùng | Xóa thành công | ☐ |
| 3.6 | Không thể nhập tay loại phòng | Chỉ có dropdown, không có input | ☐ |

### 4. Catalog (Admin Only)

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 4.1 | User thường không thể thêm catalog | RLS block | ☐ |
| 4.2 | Admin thêm property type mới | Tạo thành công + audit | ☐ |
| 4.3 | Admin thêm room type mới | Tạo thành công + audit | ☐ |
| 4.4 | Vô hiệu hóa catalog item | is_active = false, không xóa | ☐ |
| 4.5 | Không thể hard delete catalog | RLS không có DELETE policy | ☐ |

### 5. Regression Tests

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 5.1 | Tạo booking với segment cũ | Hoạt động bình thường | ☐ |
| 5.2 | AddSegmentDialog hiển thị property dropdown | Load từ host_properties | ☐ |
| 5.3 | AssignHostRoomDialog hoạt động | Chọn Host, Property, Room | ☐ |
| 5.4 | Segment snapshot giữ đúng data | host_property_name, host_room_type TEXT | ☐ |
| 5.5 | Finance/Settlement không bị ảnh hưởng | Tính toán đúng | ☐ |
| 5.6 | Dashboard/Reports hoạt động | Không lỗi | ☐ |

### 6. Performance Tests

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 6.1 | Load catalog lần đầu | < 500ms | ☐ |
| 6.2 | Catalog cache hoạt động | staleTime 30min | ☐ |
| 6.3 | Thêm loại phòng không reload toàn modal | Optimistic update | ☐ |
| 6.4 | Chuyển property không lag | < 200ms | ☐ |

---

## 🔒 SECURITY TESTS

| # | Test | Expected | Status |
|---|------|----------|--------|
| S1 | Catalog INSERT với user không phải admin | RLS reject | ☐ |
| S2 | Catalog UPDATE với user không phải admin | RLS reject | ☐ |
| S3 | Catalog DELETE | Không có policy, reject | ☐ |
| S4 | Audit logs không thể UPDATE | RLS reject | ☐ |
| S5 | Audit logs không thể DELETE | RLS reject | ☐ |

---

## 📊 DATA INTEGRITY TESTS

| # | Test | Expected | Status |
|---|------|----------|--------|
| D1 | Duplicate property_type code | UNIQUE constraint reject | ☐ |
| D2 | Duplicate room_type code | UNIQUE constraint reject | ☐ |
| D3 | Duplicate property_room mapping | UNIQUE constraint reject | ☐ |
| D4 | Delete property with CASCADE | Room mappings deleted | ☐ |
| D5 | Delete room_type_catalog với RESTRICT | Reject if mapping exists | ☐ |

---

## 🚀 DEPLOYMENT CHECKLIST

| # | Step | Status |
|---|------|--------|
| 1 | Run migration `20260101000001_partner_property_catalog.sql` | ☐ |
| 2 | Verify seed data created | ☐ |
| 3 | Test RLS policies | ☐ |
| 4 | Deploy frontend changes | ☐ |
| 5 | Smoke test in production | ☐ |
| 6 | Monitor error logs 24h | ☐ |

---

## 📝 MANUAL QA SCRIPT

### Scenario 1: Thêm chỗ nghỉ mới

```
1. Vào trang Partners
2. Chọn đối tác Host (Chủ nhà hoặc Đơn vị vận hành)
3. Click "Quản lý chỗ nghỉ"
4. Click "Thêm" chỗ nghỉ
5. VERIFY: Bắt buộc chọn loại hình từ dropdown
6. Nhập tên, chọn loại hình (VD: Apartment)
7. Click Thêm
8. VERIFY: Chỗ nghỉ xuất hiện trong danh sách với badge loại hình
```

### Scenario 2: Thêm loại phòng từ catalog

```
1. Chọn chỗ nghỉ vừa tạo
2. Click "Thêm" loại phòng
3. VERIFY: Dropdown searchable hiển thị, KHÔNG có input tự do
4. Tìm "Studio"
5. Click chọn
6. VERIFY: Studio xuất hiện trong danh sách
7. Thử thêm Studio lần nữa
8. VERIFY: Báo lỗi trùng
```

### Scenario 3: Delete protection

```
1. Tạo booking mới với segment sử dụng chỗ nghỉ vừa tạo
2. Quay lại Partners > Quản lý chỗ nghỉ
3. Thử xóa chỗ nghỉ đó
4. VERIFY: Báo lỗi không cho xóa vì còn reference
```

---

*Document generated: 2026-01-01*
*Author: AI Assistant*

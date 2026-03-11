# Partner Lifecycle Management - QA Checklist

## Version: 1.0
## Date: 2025-01-01

---

## 📋 TỔNG QUAN HỆ THỐNG

### Partner Status Lifecycle
```
ACTIVE ─────┬────► INACTIVE ──────► ARCHIVED
            │                           │
            └─────────────────────────► BLACKLISTED
            
Reactivate: ARCHIVED/BLACKLISTED ─────► ACTIVE
```

### Nguyên tắc chính
1. **KHÔNG BAO GIỜ HARD DELETE** - Đối tác có tham chiếu sẽ được ARCHIVE thay vì xóa
2. **BẢO TOÀN LỊCH SỬ** - Tất cả booking, công nợ, thanh toán được giữ nguyên
3. **SNAPSHOT IMMUTABLE** - host_supply_segments luôn giữ nguyên dữ liệu gốc
4. **AUDIT TRAIL** - Mọi hành động được ghi log

---

## 🧪 TEST CASES

### TC-001: Archive Partner có tham chiếu
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chọn partner có supply segments | Partner hiển thị trong danh sách |
| 2 | Click menu ••• → "Lưu trữ" | Mở dialog Archive với Impact Summary |
| 3 | Xác nhận segment_count > 0 | Hiển thị số lượng segments |
| 4 | Click "Lưu trữ" | Partner chuyển status ARCHIVED |
| 5 | Kiểm tra partner_status = 'ARCHIVED' | ✓ Status đã đổi |
| 6 | Kiểm tra supply segments còn nguyên | ✓ Dữ liệu booking không mất |
| 7 | Partner ẩn khỏi danh sách mặc định | ✓ Không hiện khi showArchived = false |

### TC-002: Archive Partner không có tham chiếu
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tạo partner mới (chưa có giao dịch) | Partner created |
| 2 | Click menu ••• → "Lưu trữ" | Dialog hiện total_references = 0 |
| 3 | Click "Lưu trữ" | Partner ARCHIVED thành công |
| 4 | Trigger database convert DELETE → ARCHIVE | ✓ Nếu có trigger |

### TC-003: Blacklist Partner
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chọn partner | Partner hiển thị |
| 2 | Click menu ••• → "Đưa vào danh sách đen" | Dialog yêu cầu lý do |
| 3 | Để trống lý do, click submit | ❌ Error "Lý do bắt buộc" |
| 4 | Nhập lý do, click submit | ✓ Partner BLACKLISTED |
| 5 | Kiểm tra blacklist_reason được lưu | ✓ Lý do có trong DB |

### TC-004: Reactivate Partner
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Bật "Hiển thị lưu trữ" toggle | Hiển thị partner ARCHIVED |
| 2 | Click menu ••• → "Kích hoạt lại" | Dialog xác nhận |
| 3 | Click "Kích hoạt lại" | Partner chuyển ACTIVE |
| 4 | Kiểm tra archived_at = NULL | ✓ Cleared |
| 5 | Partner hiện lại trong danh sách mặc định | ✓ Visible |

### TC-005: Toggle Show Archived
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mặc định showArchived = false | Chỉ hiện ACTIVE/INACTIVE |
| 2 | Click "Hiển thị lưu trữ" | Button đổi style |
| 3 | Kiểm tra danh sách | Hiện thêm ARCHIVED/BLACKLISTED |
| 4 | Click lại để tắt | Trở về chỉ ACTIVE/INACTIVE |

### TC-006: Impact Summary hiển thị chính xác
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chọn partner có nhiều loại tham chiếu | Partner selected |
| 2 | Mở Archive dialog | Dialog hiện |
| 3 | Kiểm tra segment_count | = COUNT từ host_supply_segments |
| 4 | Kiểm tra payable_count | = COUNT từ host_payables |
| 5 | Kiểm tra payment_count | = COUNT từ host_payments |
| 6 | Kiểm tra deposit_count | = COUNT từ host_deposits |
| 7 | Kiểm tra commission_count | = COUNT từ commission_receivables |
| 8 | Kiểm tra property_count | = COUNT từ host_properties |
| 9 | Kiểm tra room_count | = COUNT từ host_rooms |
| 10 | Kiểm tra total_references | = SUM tất cả |

### TC-007: Database Trigger DELETE → ARCHIVE
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Thử DELETE partner có tham chiếu via SQL | Trigger chặn |
| 2 | Partner không bị xóa | ✓ Vẫn tồn tại |
| 3 | Partner được ARCHIVE tự động | ✓ partner_status = 'ARCHIVED' |
| 4 | Audit log được tạo | ✓ action = 'DELETE_TO_ARCHIVE' |

### TC-008: RPC Functions
| Function | Test | Expected |
|----------|------|----------|
| `archive_partner(id, reason)` | Call với partner_id hợp lệ | Return success + impact_summary |
| `reactivate_partner(id, status)` | Call với archived partner | Return success |
| `blacklist_partner(id, reason)` | Call với reason | Return success |
| `blacklist_partner(id, NULL)` | Call không reason | Return error |
| `check_partner_can_delete(id)` | Partner có references | Return can_delete = false |
| `check_partner_can_delete(id)` | Partner không references | Return can_delete = true |

---

## 🔍 SQL VERIFICATION QUERIES

### Check partner_status distribution
```sql
SELECT partner_status, COUNT(*) 
FROM partners 
GROUP BY partner_status;
```

### Verify reference summary view
```sql
SELECT * FROM partner_reference_summary 
WHERE partner_id = '<partner_id>';
```

### Check audit logs
```sql
SELECT * FROM audit_logs 
WHERE table_name = 'partners' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Verify supply segments integrity
```sql
SELECT p.partner_name, COUNT(s.id) as segment_count
FROM partners p
LEFT JOIN host_supply_segments s ON s.partner_id = p.id
WHERE p.partner_status = 'ARCHIVED'
GROUP BY p.id, p.partner_name;
```

---

## ⚠️ EDGE CASES

1. **Partner đang trong giao dịch chưa hoàn thành**
   - Không cho archive nếu có payable_status = 'PENDING'
   - Hiện warning trong Impact Summary

2. **Admin vs User permissions**
   - Chỉ admin có thể reactivate BLACKLISTED partner
   - RPC function kiểm tra role

3. **Concurrent modifications**
   - Sử dụng transaction trong RPC functions
   - Handle optimistic locking conflicts

4. **Migration từ legacy status**
   - status = 'active' → partner_status = 'ACTIVE'
   - status = 'inactive' → partner_status = 'INACTIVE'

---

## 📁 FILES CHANGED

| File | Changes |
|------|---------|
| `supabase/migrations/20260101000004_partner_lifecycle_archive.sql` | NEW - Lifecycle schema |
| `src/hooks/useCatalog.ts` | ADD - Partner lifecycle hooks |
| `src/components/settings/ArchivePartnerDialog.tsx` | NEW - Archive UI |
| `src/pages/PartnersPage.tsx` | UPDATE - Integrate archive flow |

---

## ✅ SIGN-OFF

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | | | |
| QA | | | |
| Product | | | |
| DBA | | | |

---

## 📝 NOTES

- Migration cần được review bởi DBA trước khi deploy production
- Backup database trước khi chạy migration
- Test trên staging environment trước
- Monitor audit_logs sau deploy để detect issues

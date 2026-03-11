# OTA Operations Module v3.1 - Release Notes

**Release Date:** January 8, 2026  
**Version:** 3.1.0

---

## Overview

OTA Operations Module v3.1 introduces Work Type classification, Super Admin Override capabilities, and a structured Project Inputs/Outputs system with versioning and review workflow.

---

## New Features

### 1. Work Type Classification

Projects can now be classified by work type for better organization:

| Work Type | Description |
|-----------|-------------|
| OTA_OPTIMIZATION | Tối ưu OTA - Core optimization work |
| CONTENT_UPDATE | Cập nhật nội dung - Content/media updates |
| PRICING_ADJUSTMENT | Điều chỉnh giá - Pricing strategy changes |
| PROMOTION_SETUP | Cài đặt khuyến mãi - Promotion configuration |
| TECHNICAL_INTEGRATION | Tích hợp kỹ thuật - API/system integrations |
| OTHER | Khác - Other project types |

**UI:** Work type badge displayed on project cards and detail pages.

---

### 2. Super Admin Override

Super Admins can now perform emergency task status changes:

- **REOPEN**: Reopen completed/cancelled tasks
- **FORCE_DONE**: Force complete blocked tasks  
- **CANCEL**: Cancel stuck tasks

**Requirements:**
- User must have `super_admin` role
- Mandatory reason (min 10 characters)
- Full audit trail with `performed_via='RPC'`

**Access:** Via "Super Admin Actions" dropdown in TaskDetailPage (visible only to super_admins).

---

### 3. Project Inputs Tab

Structured input data collection for projects:

**Fields:**
- OTA Account Email
- Extranet Login URL
- Listing URL
- Property Notes
- Priority Notes
- Attachment Links (array)

**Features:**
- Optimistic locking prevents concurrent edit conflicts
- Auto-conflict detection with "Reload" option
- Schema versioning for future migrations

---

### 4. Project Outputs Tab

Versioned output management with review workflow:

**Status Flow:**
```
DRAFT → SUBMITTED → APPROVED
                  ↘ REJECTED → (new DRAFT)
```

**Capabilities:**
- Create Output Draft (any project member)
- Edit Draft (creator or admin only)
- Submit for Review (creator only)
- Approve/Reject (LEAD/ADMIN/SUPER_ADMIN only)
- Version history viewer

**Output Fields:**
- Summary (tóm tắt kết quả)
- Before/After Links
- KPI Notes
- Final Checklist
- Handover Notes

---

## Security Enhancements

### RLS Policies
- Outputs UPDATE restricted to DRAFT status + creator only
- Status changes (SUBMIT/REVIEW) enforced via SECURITY DEFINER RPCs
- Project access verified on all operations

### Race Condition Protection
- Advisory locks prevent duplicate version numbers
- Unique constraint as backup safety

### Audit Logging
All operations logged with:
- `performed_via = 'RPC'`
- Full old_data/new_data snapshots
- Review reason required (min 5 chars)

---

## Database Migrations

| Migration | Purpose |
|-----------|---------|
| 018_ota_work_type | work_type enum + column |
| 019_ota_audit_log_override | Audit extensions (reason, override_type, performed_via) |
| 020_ota_super_admin_override | Super admin override RPC |
| 021_ota_project_inputs_outputs | Tables + RLS |
| 022_ota_project_io_rpcs | 6 RPC functions |
| 023_ota_create_draft_race_fix | Race-condition fix |

---

## API Changes

### New RPC Functions

```typescript
// Fetch inputs + outputs for a project
ota_get_project_io(p_project_id: UUID) → JSONB

// Create/update inputs with optimistic locking
ota_upsert_project_inputs(
  p_project_id: UUID,
  p_data: JSONB,
  p_expected_updated_at: TIMESTAMPTZ,
  p_schema_version: INT
) → JSONB

// Create new output draft
ota_create_output_draft(p_project_id: UUID) → JSONB

// Update draft output
ota_update_output_draft(
  p_output_id: UUID,
  p_data: JSONB,
  p_schema_version: INT
) → JSONB

// Submit output for review
ota_submit_output(p_output_id: UUID) → JSONB

// Review output (approve/reject)
ota_review_output(
  p_output_id: UUID,
  p_decision: TEXT,  // 'APPROVE' or 'REJECT'
  p_reason: TEXT     // min 5 chars
) → JSONB
```

---

## UI Components

### New Components
- `ProjectInputsTab` - Input form with conflict handling
- `ProjectOutputsTab` - Output management with review workflow
- `WorkTypeBadge` - Visual work type indicator
- `SuperAdminOverrideModal` - Emergency override dialog

### Updated Pages
- `ProjectDetailPage` - Added Inputs and Outputs tabs
- `TaskDetailPage` - Added Super Admin Override dropdown

---

## Known Limitations

1. **Template Library** - Not implemented in v3.1 (deferred)
2. **Bulk Operations** - Single project/output operations only
3. **Offline Support** - Requires active connection

---

## Upgrade Instructions

1. Apply migrations in order (018 → 023)
2. Clear browser cache
3. Verify user roles are correctly assigned
4. Test on staging before production

---

## Support

For issues or questions:
- Check audit logs: `SELECT * FROM ota_audit_log WHERE ...`
- Review RLS policies: `SELECT * FROM pg_policies WHERE tablename LIKE 'ota_%'`
- Contact: dev-team@roomrise.com

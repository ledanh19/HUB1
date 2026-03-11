# OTA Operations v3.1 - How to Reproduce Tests

## Test 1: Optimistic Locking Conflict (Inputs)

### Steps:
1. Open project detail page in Browser Tab A
2. Go to "Đầu vào" (Inputs) tab
3. Open same project in Browser Tab B (same user or different user with access)
4. In Tab A: Edit any field (e.g., `property_notes`) and click Save
5. In Tab B: Edit the same field with different value and click Save

### Expected Result:
- Tab A: Success toast "Đã lưu dữ liệu đầu vào"
- Tab B: Error toast "Dữ liệu đã được cập nhật bởi người khác"
- Tab B: Yellow conflict warning appears with "Tải lại" button
- After reload, Tab B shows data saved by Tab A

### Verification:
```sql
-- Check audit log shows both attempts
SELECT action, old_data, new_data, performed_at
FROM ota_audit_log
WHERE entity_type = 'PROJECT_INPUT'
AND project_id = '<project-id>'
ORDER BY performed_at DESC
LIMIT 5;
```

---

## Test 2: Draft Version Race Condition

### Prerequisites:
- Two browser sessions (can be same user)
- A project with no outputs OR with latest output APPROVED/REJECTED

### Steps:
1. Open project in Browser Tab A, go to "Đầu ra" (Outputs) tab
2. Open project in Browser Tab B, go to "Đầu ra" (Outputs) tab
3. **Simultaneously** click "Tạo Output" in both tabs (try to click within 1 second)

### Expected Result:
- One tab succeeds with "Đã tạo bản nháp mới"
- Second tab either:
  - Waits briefly then succeeds with next version (N+2)
  - OR shows error "Phiên bản bị trùng, vui lòng thử lại" (rare, safety fallback)

### Verification:
```sql
-- Check versions are sequential, no gaps/duplicates
SELECT version, status, created_at, created_by
FROM ota_project_outputs
WHERE project_id = '<project-id>'
ORDER BY version ASC;

-- Result should show: v1, v2, v3... (no duplicates)
```

---

## Test 3: RLS Bypass Attempt (Direct Status UPDATE)

### Prerequisites:
- Supabase SQL Editor access
- An existing output in DRAFT status

### Steps:
1. Get an output ID that is in DRAFT status
2. Run this SQL as the authenticated user (simulating client bypass):

```sql
-- Simulate client trying to bypass RLS
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '<user-uuid>';

UPDATE ota_project_outputs 
SET status = 'APPROVED'
WHERE id = '<output-id>';

-- Check rows affected
```

### Expected Result:
- 0 rows affected (blocked by RLS)
- RLS policy only allows:
  - status = 'DRAFT'
  - created_by = auth.uid()
  - has_ota_project_access(project_id)

### Alternative Client Test:
```typescript
// In browser console (as authenticated user)
const { data, error } = await supabase
  .from('ota_project_outputs')
  .update({ status: 'APPROVED' })
  .eq('id', '<output-id>');

console.log(error); // Should show permission error
console.log(data);  // Should be null or empty
```

---

## Test 4: Review Permission Check

### Prerequisites:
- User A: ota_staff role (NOT lead/admin)
- User B: ota_lead role
- An output in SUBMITTED status

### Steps (User A - should fail):
1. Login as User A
2. Open project with SUBMITTED output
3. Try to click Approve/Reject buttons

### Expected:
- Approve/Reject buttons should NOT be visible (UI hides them)
- If manually called via RPC:
```typescript
const { data, error } = await supabase.rpc('ota_review_output', {
  p_output_id: '<output-id>',
  p_decision: 'APPROVE',
  p_reason: 'Test approval'
});
// error.message should include 'PERMISSION_DENIED'
```

### Steps (User B - should succeed):
1. Login as User B (ota_lead)
2. Open same project
3. Click "Duyệt" button
4. Enter reason (min 5 chars)
5. Confirm

### Expected:
- Success toast "Đã duyệt output"
- Output status changes to APPROVED

---

## Test 5: Audit Log Verification

### After running tests above, verify audit coverage:
```sql
SELECT 
  action,
  entity_type,
  entity_id,
  project_id,
  performed_by,
  performed_via,
  reason,
  performed_at
FROM ota_audit_log
WHERE project_id = '<project-id>'
AND action IN (
  'CREATE_PROJECT_INPUTS',
  'UPDATE_PROJECT_INPUTS', 
  'CREATE_OUTPUT_DRAFT',
  'UPDATE_OUTPUT_DRAFT',
  'SUBMIT_OUTPUT',
  'REVIEW_OUTPUT'
)
ORDER BY performed_at DESC;
```

### Expected columns:
- `performed_via` = 'RPC' for all rows
- `reason` populated for REVIEW_OUTPUT
- `project_id` matches the test project
- `performed_by` shows correct user UUIDs

---

## Automated Test Script (Optional)

```typescript
// test-ota-ops-v31.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testOptimisticLocking() {
  // ... implementation
}

async function testRaceCondition() {
  // ... implementation  
}

async function testRLSBypass() {
  // ... implementation
}

async function testReviewPermission() {
  // ... implementation
}

// Run all tests
async function main() {
  console.log('Testing OTA Ops v3.1...');
  await testOptimisticLocking();
  await testRaceCondition();
  await testRLSBypass();
  await testReviewPermission();
  console.log('All tests completed');
}

main().catch(console.error);
```

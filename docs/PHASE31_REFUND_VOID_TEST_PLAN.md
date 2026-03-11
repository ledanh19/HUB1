# PHASE 3.1 - Refund + Void Ledger Integration

## Test Plan

### Overview
This phase ensures that REFUND and VOID operations create proper ledger entries for financial integrity.

---

## Test Cases

### 1. REFUND Creates Ledger CREDIT Entry

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Create a new COLLECT for a booking | Ledger entry created with direction=DEBIT |
| 1.2 | Open Refund dialog for the collection | Dialog shows server-side max refund amount |
| 1.3 | Enter refund amount (< max) | Amount validated |
| 1.4 | Submit refund | RPC `create_collection_ledger_atomic` called with collection_type='REFUND' |
| 1.5 | Check hotel_collects | New record with collection_type='REFUND', negative amount, ledger_entry_id populated |
| 1.6 | Check ledger_entries | New entry with direction='CREDIT', entry_type='REFUND', source_type='HOTEL_COLLECT' |
| 1.7 | Check cashflow_entries | New entry with direction='OUT' |

### 2. VOID Creates REVERSAL Ledger Entry

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Create a new COLLECT for a booking | Ledger entry created with direction=DEBIT |
| 2.2 | Open Void dialog for the collection | Dialog shows server-side validation |
| 2.3 | Enter void reason | Reason validated |
| 2.4 | Submit void | RPC `void_collection_atomic` called |
| 2.5 | Check original hotel_collects | status='VOIDED', voided_at set, voided_by set |
| 2.6 | Check new VOID record in hotel_collects | collection_type='VOID', related_collection_id points to original |
| 2.7 | Check ledger_entries | New REVERSAL entry with opposite direction (CREDIT), reversal_of_id points to original |
| 2.8 | Check original ledger_entry | is_reversed=true, reversed_by_id set |

### 3. Period Lock Enforcement - REFUND

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Lock accounting period for current month | Period marked as locked |
| 3.2 | Try to create REFUND for collection in locked period | Error: "Kỳ kế toán đã khóa" |
| 3.3 | UI shows error message | Server-side validation displays reason |
| 3.4 | Unlock period | Period unlocked |
| 3.5 | Retry REFUND | Success |

### 4. Period Lock Enforcement - VOID

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Lock accounting period for current month | Period marked as locked |
| 4.2 | Try to VOID collection in locked period | Error: "Kỳ kế toán đã khóa" |
| 4.3 | UI shows "Không thể hủy" message | can_void=false with reason |
| 4.4 | Unlock period | Period unlocked |
| 4.5 | Retry VOID | Success |

### 5. Void Blocked When Reconciled

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Create COLLECT → ledger entry created | ledger_entry_id populated |
| 5.2 | Reconcile the ledger entry | reconciliation record created |
| 5.3 | Try to VOID the collection | Error: "Không thể hủy: bút toán đã được đối soát" |
| 5.4 | UI shows "Ledger entry is reconciled" | can_void=false |
| 5.5 | Unreconcile the ledger entry | reconciliation removed |
| 5.6 | Retry VOID | Success |

### 6. Void Blocked When Has Refunds

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Create COLLECT (100,000 VND) | collection created |
| 6.2 | Create partial REFUND (30,000 VND) | refund created with ledger CREDIT |
| 6.3 | Try to VOID original collection | Error: "Không thể hủy collection đã có hoàn tiền" |
| 6.4 | UI shows cannot void message | can_void=false |

### 7. Idempotency - No Duplicate Entries

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Create COLLECT | Single ledger entry |
| 7.2 | Call RPC again with same idempotency key | Should return existing entry (via idempotent function) |
| 7.3 | REFUND same collection twice rapidly | Should not create duplicates |

### 8. Ledger Entry Link (ledger_entry_id)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.1 | Create COLLECT | hotel_collects.ledger_entry_id populated |
| 8.2 | Query ledger by source_id | Can find ledger entry |
| 8.3 | Existing collections backfilled | Migration updates existing records |

---

## Regression Tests

### Ensure No Breaking Changes

| Area | Test |
|------|------|
| Booking payments | Creating collection from booking still works |
| Collection summary | Net amount calculation correct with refunds |
| Dashboard KPIs | Today/Month collections accurate |
| Host payables | Calculations unaffected |
| Cashflow report | Shows both COLLECT and REFUND entries |

---

## SQL Verification Queries

```sql
-- Verify REFUND creates ledger CREDIT
SELECT hc.id, hc.collection_type, hc.amount_collected, 
       le.direction, le.entry_type, le.amount
FROM hotel_collects hc
JOIN ledger_entries le ON le.id = hc.ledger_entry_id
WHERE hc.collection_type = 'REFUND';

-- Verify VOID creates REVERSAL
SELECT 
  orig.id AS original_id,
  orig.status AS orig_status,
  orig.voided_at,
  void_rec.id AS void_record_id,
  le_orig.id AS orig_ledger,
  le_orig.is_reversed,
  le_rev.id AS reversal_ledger,
  le_rev.entry_type
FROM hotel_collects orig
JOIN hotel_collects void_rec ON void_rec.related_collection_id = orig.id AND void_rec.collection_type = 'VOID'
LEFT JOIN ledger_entries le_orig ON le_orig.id = orig.ledger_entry_id
LEFT JOIN ledger_entries le_rev ON le_rev.reversal_of_id = le_orig.id
WHERE orig.status = 'VOIDED';

-- Check period lock enforcement
SELECT * FROM accounting_periods WHERE is_locked = true;

-- Verify backfill worked
SELECT COUNT(*) AS orphan_collections
FROM hotel_collects hc
LEFT JOIN ledger_entries le ON le.source_type = 'HOTEL_COLLECT' AND le.source_id = hc.id
WHERE hc.ledger_entry_id IS NULL AND le.id IS NOT NULL;
```

---

## Files Changed

| File | Changes |
|------|---------|
| `supabase/migrations/20260103_phase31_refund_void_ledger.sql` | New migration: adds ledger_entry_id, voided_by columns, RPCs |
| `src/hooks/useCollections.ts` | Updated useCreateRefund (atomic RPC), useCreateVoid (atomic RPC), added server-side validation hooks |
| `src/components/collection/RefundDialog.tsx` | Added server-side validation display |
| `src/components/collection/VoidDialog.tsx` | Added server-side validation display |

---

## New RPCs

| RPC | Purpose |
|-----|---------|
| `void_collection_atomic` | Atomically void a collection with reversal ledger entry |
| `can_void_collection` | Check if collection can be voided (server-side validation) |
| `can_refund_collection` | Check if collection can be refunded with max amount |

---

## Acceptance Criteria

- [ ] REFUND creates ledger entry with direction=CREDIT
- [ ] VOID creates REVERSAL ledger entry
- [ ] Original collection marked as VOIDED (not deleted)
- [ ] Period lock blocks both REFUND and VOID
- [ ] Reconciled entries cannot be voided
- [ ] UI shows server-side validation errors
- [ ] Audit logs created for all operations
- [ ] No breaking changes to existing flows

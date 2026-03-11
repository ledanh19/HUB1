-- Allow cash_account_id to be NULL for accrual entries (adjustments, bank fees)
-- Cash-related entries (CASH_OUT, OTA_PAYOUT_CASH_IN, HOTEL_COLLECT) still enforce via coupling trigger
ALTER TABLE public.ledger_entries ALTER COLUMN cash_account_id DROP NOT NULL;
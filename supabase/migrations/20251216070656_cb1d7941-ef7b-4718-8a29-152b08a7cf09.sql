
-- Drop existing check constraint and add new one with HOTEL_COLLECT support
ALTER TABLE cashflow_entries DROP CONSTRAINT IF EXISTS cashflow_entries_source_type_check;

-- Add new check constraint with all valid source types
ALTER TABLE cashflow_entries ADD CONSTRAINT cashflow_entries_source_type_check 
CHECK (source_type IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT', 'HOTEL_COLLECT', 'OTA_PAYOUT_CASH_IN', 'CASH_OUT', 'REFUND', 'VOID'));


-- Recalculate payout header for d8272f93 after detail fix
UPDATE public.ota_payouts
SET gross_amount = 5570560,
    net_payout_amount = 5570560 + COALESCE(deduction_total, 0),
    total_amount = 5570560 + COALESCE(deduction_total, 0)
WHERE id = 'd8272f93-8c42-4a2e-99db-9d61a67cd9e9';


UPDATE ota_payouts op
SET received_at = sub.first_collected_at
FROM (
  SELECT cpa.payout_id, MIN(hc.collected_at) as first_collected_at
  FROM collection_payout_allocations cpa
  JOIN hotel_collects hc ON hc.id = cpa.collection_id
  WHERE hc.status != 'VOID'
  GROUP BY cpa.payout_id
) sub
WHERE op.id = sub.payout_id
  AND op.received_at IS NULL;

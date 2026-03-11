-- Fix data inconsistency: sync partner_status with status for blacklisted partners
UPDATE partners 
SET partner_status = 'BLACKLISTED' 
WHERE status = 'blacklisted' AND (partner_status IS NULL OR partner_status = 'ACTIVE');

-- Also sync archived
UPDATE partners 
SET partner_status = 'ARCHIVED' 
WHERE status = 'archived' AND (partner_status IS NULL OR partner_status = 'ACTIVE');

-- Also sync inactive
UPDATE partners 
SET partner_status = 'INACTIVE' 
WHERE status = 'inactive' AND (partner_status IS NULL OR partner_status = 'ACTIVE');
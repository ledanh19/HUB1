-- ============================================
-- PUSH DELIVERIES TABLE (IDEMPOTENCY / DEDUPE)
-- ============================================
-- Tracks every push notification sent to prevent duplicates
-- Core mechanism: INSERT with ON CONFLICT DO NOTHING
-- If insert succeeds → send push. If conflict → skip (already sent)

CREATE TABLE IF NOT EXISTS push_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification (for traceability)
    event_type TEXT NOT NULL, -- 'BOOKING_NEW', 'BOOKING_MODIFIED', 'BOOKING_CANCELLED', 'MESSAGE_INBOUND'
    
    -- IDEMPOTENCY KEY COMPONENTS
    -- For bookings: (source, booking_id, event_type, change_hash)
    -- For messages: (provider, provider_message_id, event_type)
    idempotency_key TEXT NOT NULL,
    
    -- Who received this notification
    recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
    
    -- Source event reference
    source_table TEXT,           -- 'booking_changes', 'messages', etc.
    source_record_id TEXT,       -- ID of the source record
    
    -- Delivery metadata
    delivered_at TIMESTAMPTZ DEFAULT now(),
    ttl_seconds INTEGER DEFAULT 86400, -- 24h TTL for push
    
    -- Payload hash (for debugging)
    payload_hash TEXT,
    
    -- UNIQUE CONSTRAINT: This is the magic for idempotent push
    -- Same event_type + same idempotency_key + same recipient = only ONE push
    CONSTRAINT unique_push_delivery UNIQUE (event_type, idempotency_key, recipient_user_id)
);

-- Index for looking up deliveries by recipient
CREATE INDEX IF NOT EXISTS idx_push_deliveries_recipient 
ON push_deliveries(recipient_user_id, delivered_at DESC);

-- Index for cleanup/TTL queries
CREATE INDEX IF NOT EXISTS idx_push_deliveries_delivered_at 
ON push_deliveries(delivered_at);

-- Index for idempotency check (covered by unique constraint, but useful for lookups)
CREATE INDEX IF NOT EXISTS idx_push_deliveries_idempotency 
ON push_deliveries(event_type, idempotency_key);

-- Index for source tracing
CREATE INDEX IF NOT EXISTS idx_push_deliveries_source 
ON push_deliveries(source_table, source_record_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can view their own delivery history
CREATE POLICY "Users can view own deliveries"
ON push_deliveries FOR SELECT
TO authenticated
USING (recipient_user_id = auth.uid());

-- Only service role can insert (Edge Functions)
CREATE POLICY "Service role can insert deliveries"
ON push_deliveries FOR INSERT
TO service_role
WITH CHECK (true);

-- Service role full access
CREATE POLICY "Service role full access to push_deliveries"
ON push_deliveries FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- IDEMPOTENT DELIVERY FUNCTION
-- ============================================
-- Returns: 
--   'SENT' if this is a new delivery (push should be sent)
--   'DUPLICATE' if already delivered (push should be skipped)

CREATE OR REPLACE FUNCTION try_record_push_delivery(
    p_event_type TEXT,
    p_idempotency_key TEXT,
    p_recipient_user_id UUID,
    p_subscription_id UUID DEFAULT NULL,
    p_source_table TEXT DEFAULT NULL,
    p_source_record_id TEXT DEFAULT NULL,
    p_payload_hash TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_inserted BOOLEAN;
BEGIN
    -- Attempt insert, ON CONFLICT DO NOTHING
    INSERT INTO push_deliveries (
        event_type, idempotency_key, recipient_user_id,
        subscription_id, source_table, source_record_id, payload_hash
    )
    VALUES (
        p_event_type, p_idempotency_key, p_recipient_user_id,
        p_subscription_id, p_source_table, p_source_record_id, p_payload_hash
    )
    ON CONFLICT (event_type, idempotency_key, recipient_user_id) DO NOTHING;
    
    -- Check if row was inserted
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    
    IF v_inserted > 0 THEN
        RETURN 'SENT';
    ELSE
        RETURN 'DUPLICATE';
    END IF;
END;
$$;

-- ============================================
-- BATCH DELIVERY FUNCTION
-- ============================================
-- For sending to multiple recipients in one transaction
-- Returns array of {user_id, status} objects

CREATE OR REPLACE FUNCTION try_record_push_deliveries_batch(
    p_event_type TEXT,
    p_idempotency_key TEXT,
    p_recipient_user_ids UUID[],
    p_source_table TEXT DEFAULT NULL,
    p_source_record_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    user_id UUID,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_status TEXT;
BEGIN
    FOREACH v_user_id IN ARRAY p_recipient_user_ids
    LOOP
        -- Try to insert for each user
        v_status := try_record_push_delivery(
            p_event_type,
            p_idempotency_key,
            v_user_id,
            NULL,
            p_source_table,
            p_source_record_id,
            NULL
        );
        
        user_id := v_user_id;
        status := v_status;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- ============================================
-- CLEANUP FUNCTION (for scheduled job)
-- ============================================
-- Remove old delivery records to prevent table bloat
-- Keep 30 days for audit trail

CREATE OR REPLACE FUNCTION cleanup_old_push_deliveries(
    p_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM push_deliveries
    WHERE delivered_at < now() - (p_retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- ============================================
-- HELPER VIEWS
-- ============================================

-- View: Recent deliveries by event type (for monitoring)
CREATE OR REPLACE VIEW push_delivery_stats AS
SELECT 
    event_type,
    DATE_TRUNC('hour', delivered_at) as hour,
    COUNT(*) as delivery_count,
    COUNT(DISTINCT recipient_user_id) as unique_recipients
FROM push_deliveries
WHERE delivered_at > now() - INTERVAL '24 hours'
GROUP BY event_type, DATE_TRUNC('hour', delivered_at)
ORDER BY hour DESC, event_type;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE push_deliveries IS 'Idempotent push delivery tracking - prevents duplicate notifications';
COMMENT ON COLUMN push_deliveries.idempotency_key IS 'Unique identifier for the event. For bookings: source:booking_id:event:hash. For messages: provider:msg_id:event';
COMMENT ON COLUMN push_deliveries.event_type IS 'Type of notification: BOOKING_NEW, BOOKING_MODIFIED, BOOKING_CANCELLED, MESSAGE_INBOUND';
COMMENT ON FUNCTION try_record_push_delivery IS 'Atomically try to record a push delivery. Returns SENT or DUPLICATE.';
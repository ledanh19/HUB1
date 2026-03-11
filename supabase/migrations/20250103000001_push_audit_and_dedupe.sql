-- ============================================
-- PUSH NOTIFICATION AUDIT & DEDUPE MIGRATION
-- Created: 2026-01-03
-- Purpose: Add audit logging, dedupe mechanism, and anti-loop guardrails
-- ============================================

-- ============================================
-- 1. CREATE AUDIT LOGS TABLE (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Index for querying by entity
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- RLS for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert (from Edge Functions)
CREATE POLICY IF NOT EXISTS "Service role can manage audit_logs"
ON audit_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can view their own audit logs
CREATE POLICY IF NOT EXISTS "Users can view own audit_logs"
ON audit_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- 2. ADD endpoint_host COLUMN TO push_subscriptions
-- ============================================
-- This helps with debugging and identifying push service
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'push_subscriptions' AND column_name = 'endpoint_host'
    ) THEN
        ALTER TABLE push_subscriptions ADD COLUMN endpoint_host TEXT;
    END IF;
END $$;

-- ============================================
-- 3. DEDUPE SCRIPT - Keep only newest subscription per endpoint
-- ============================================
-- This runs once to clean up any existing duplicates
-- (Should be safe due to unique constraint, but run as preventive measure)

-- First, identify and mark duplicates (keeping the most recent)
WITH ranked_subs AS (
    SELECT 
        id,
        endpoint,
        ROW_NUMBER() OVER (
            PARTITION BY endpoint 
            ORDER BY updated_at DESC NULLS LAST, created_at DESC
        ) as rn
    FROM push_subscriptions
)
UPDATE push_subscriptions ps
SET is_active = false
FROM ranked_subs rs
WHERE ps.id = rs.id AND rs.rn > 1;

-- Log the dedupe action
INSERT INTO audit_logs (action, entity_type, details)
SELECT 
    'SUBSCRIPTION_DEDUPE_BATCH',
    'push_subscription',
    jsonb_build_object(
        'deduped_count', (
            SELECT COUNT(*) 
            FROM push_subscriptions 
            WHERE is_active = false 
            AND updated_at > now() - interval '1 minute'
        ),
        'timestamp', now()
    )
WHERE EXISTS (
    SELECT 1 FROM push_subscriptions 
    WHERE is_active = false 
    AND updated_at > now() - interval '1 minute'
);

-- ============================================
-- 4. UPDATE upsert_push_subscription TO POPULATE endpoint_host
-- ============================================
CREATE OR REPLACE FUNCTION upsert_push_subscription(
    p_user_id UUID,
    p_endpoint TEXT,
    p_p256dh TEXT,
    p_auth TEXT,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_id UUID;
    v_endpoint_host TEXT;
BEGIN
    -- Extract host from endpoint URL
    v_endpoint_host := (SELECT (regexp_matches(p_endpoint, 'https?://([^/]+)'))[1]);
    
    -- Insert or update based on endpoint (unique constraint)
    INSERT INTO push_subscriptions (
        user_id, endpoint, p256dh, auth, user_agent, endpoint_host,
        is_active, updated_at, consecutive_failures
    )
    VALUES (
        p_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, v_endpoint_host,
        true, now(), 0
    )
    ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        endpoint_host = EXCLUDED.endpoint_host,
        is_active = true,
        updated_at = now(),
        consecutive_failures = 0,
        last_failure_at = NULL,
        last_failure_reason = NULL
    RETURNING id INTO v_subscription_id;
    
    -- Audit log the upsert
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, details)
    VALUES (
        'SUBSCRIPTION_UPSERT',
        'push_subscription',
        v_subscription_id::text,
        p_user_id,
        jsonb_build_object(
            'endpoint_host', v_endpoint_host,
            'user_agent', p_user_agent
        )
    );
    
    RETURN v_subscription_id;
END;
$$;

-- ============================================
-- 5. ADD FUNCTION TO DELETE SUBSCRIPTION WITH AUDIT
-- ============================================
CREATE OR REPLACE FUNCTION delete_push_subscription_with_audit(
    p_subscription_id UUID,
    p_user_id UUID,
    p_reason TEXT,
    p_endpoint_host TEXT DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Soft delete the subscription
    UPDATE push_subscriptions
    SET 
        is_active = false,
        updated_at = now(),
        last_failure_reason = p_reason,
        last_failure_at = now()
    WHERE id = p_subscription_id;
    
    -- Audit log
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, details)
    VALUES (
        'SUBSCRIPTION_DELETED',
        'push_subscription',
        p_subscription_id::text,
        p_user_id,
        jsonb_build_object(
            'reason', p_reason,
            'endpoint_host', p_endpoint_host,
            'request_id', p_request_id,
            'deleted_at', now()
        )
    );
END;
$$;

-- ============================================
-- 6. CREATE debug_push_logs TABLE (separate from notification feed)
-- ============================================
CREATE TABLE IF NOT EXISTS debug_push_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    endpoint_host TEXT,
    status_code INTEGER,
    response_body TEXT,
    vapid_fingerprint TEXT,
    ttl TEXT,
    encoding TEXT,
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_debug_push_logs_user ON debug_push_logs(user_id, created_at DESC);

-- Index for querying by request_id
CREATE INDEX IF NOT EXISTS idx_debug_push_logs_request ON debug_push_logs(request_id);

-- RLS for debug_push_logs
ALTER TABLE debug_push_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert
CREATE POLICY IF NOT EXISTS "Service role can manage debug_push_logs"
ON debug_push_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own debug logs
CREATE POLICY IF NOT EXISTS "Users can view own debug_push_logs"
ON debug_push_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- 7. CLEANUP OLD DEBUG LOGS (retention: 7 days)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_debug_push_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM debug_push_logs
    WHERE created_at < now() - interval '7 days';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

-- ============================================
-- 8. COMMENTS
-- ============================================
COMMENT ON TABLE audit_logs IS 'Audit trail for push subscription lifecycle events';
COMMENT ON TABLE debug_push_logs IS 'Debug logs for push notification delivery - NOT shown in notification feed';
COMMENT ON FUNCTION delete_push_subscription_with_audit IS 'Soft-delete a push subscription with audit logging';
COMMENT ON FUNCTION cleanup_old_debug_push_logs IS 'Clean up debug logs older than 7 days';

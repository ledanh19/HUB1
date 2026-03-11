-- ============================================
-- PUSH SUBSCRIPTIONS TABLE
-- ============================================
-- Stores Web Push subscription endpoints per user/device
-- Enables background push notifications for PWA

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Web Push subscription object (from pushManager.subscribe)
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,  -- Public key for encryption
    auth TEXT NOT NULL,     -- Auth secret for encryption
    
    -- Device/browser identification
    user_agent TEXT,
    device_fingerprint TEXT, -- Optional: for device-level dedup
    
    -- Subscription metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    
    -- Failure tracking
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,
    
    -- Unique constraint: one active subscription per endpoint
    CONSTRAINT unique_active_endpoint UNIQUE (endpoint)
);

-- Index for looking up subscriptions by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id 
ON push_subscriptions(user_id) WHERE is_active = true;

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_failures 
ON push_subscriptions(consecutive_failures) WHERE is_active = true;

-- Index for last_used_at for pruning stale subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used 
ON push_subscriptions(last_used_at) WHERE is_active = true;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own subscriptions
CREATE POLICY "Users can view own subscriptions"
ON push_subscriptions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own subscriptions"
ON push_subscriptions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own subscriptions"
ON push_subscriptions FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own subscriptions"
ON push_subscriptions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access to push_subscriptions"
ON push_subscriptions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to upsert subscription (handles re-subscribe scenarios)
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
BEGIN
    -- Insert or update based on endpoint
    INSERT INTO push_subscriptions (
        user_id, endpoint, p256dh, auth, user_agent, 
        is_active, updated_at, consecutive_failures
    )
    VALUES (
        p_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent,
        true, now(), 0
    )
    ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        is_active = true,
        updated_at = now(),
        consecutive_failures = 0,
        last_failure_at = NULL,
        last_failure_reason = NULL
    RETURNING id INTO v_subscription_id;
    
    RETURN v_subscription_id;
END;
$$;

-- Function to mark subscription failure
CREATE OR REPLACE FUNCTION mark_push_subscription_failure(
    p_subscription_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE push_subscriptions
    SET 
        consecutive_failures = consecutive_failures + 1,
        last_failure_at = now(),
        last_failure_reason = p_reason,
        -- Deactivate after 3 consecutive failures
        is_active = CASE WHEN consecutive_failures >= 2 THEN false ELSE is_active END
    WHERE id = p_subscription_id;
END;
$$;

-- Function to mark subscription success
CREATE OR REPLACE FUNCTION mark_push_subscription_success(
    p_subscription_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE push_subscriptions
    SET 
        consecutive_failures = 0,
        last_used_at = now(),
        last_failure_at = NULL,
        last_failure_reason = NULL
    WHERE id = p_subscription_id;
END;
$$;

-- Function to get active subscriptions for a user
CREATE OR REPLACE FUNCTION get_user_push_subscriptions(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    endpoint TEXT,
    p256dh TEXT,
    auth TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT id, endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE user_id = p_user_id
    AND is_active = true
    AND (consecutive_failures < 3 OR consecutive_failures IS NULL);
$$;

-- Function to get subscriptions for multiple users (batch send)
CREATE OR REPLACE FUNCTION get_users_push_subscriptions(p_user_ids UUID[])
RETURNS TABLE (
    user_id UUID,
    subscription_id UUID,
    endpoint TEXT,
    p256dh TEXT,
    auth TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT user_id, id as subscription_id, endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE user_id = ANY(p_user_ids)
    AND is_active = true
    AND (consecutive_failures < 3 OR consecutive_failures IS NULL);
$$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE push_subscriptions IS 'Web Push subscription storage for PWA notifications';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL from pushManager.subscribe()';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'P-256 ECDH public key for message encryption';
COMMENT ON COLUMN push_subscriptions.auth IS 'Auth secret for HMAC signature';
COMMENT ON COLUMN push_subscriptions.consecutive_failures IS 'Count of failed delivery attempts; auto-deactivate after 3';

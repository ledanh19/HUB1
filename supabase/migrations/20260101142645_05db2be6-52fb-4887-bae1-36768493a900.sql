-- ============================================================================
-- CHAT MODULE OPS-GRADE MIGRATION (Fixed - removed now() predicate)
-- ============================================================================

-- PART 1: CONVERSATION OWNERSHIP & ASSIGNMENT
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_team TEXT CHECK (assigned_team IN ('CSKH', 'OPS', 'FINANCE', 'TECH')),
  ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'UNASSIGNED' 
    CHECK (assignment_status IN ('UNASSIGNED', 'ASSIGNED', 'ESCALATED', 'RESOLVED')),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'NORMAL' 
    CHECK (priority IN ('URGENT', 'HIGH', 'NORMAL', 'LOW'));

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to 
  ON conversations(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_assignment_status 
  ON conversations(assignment_status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_team 
  ON conversations(assigned_team) WHERE assigned_team IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_priority_status 
  ON conversations(priority, assignment_status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_conversations_inbox_sort 
  ON conversations(assignment_status, priority DESC, last_inbound_at DESC NULLS LAST)
  WHERE status = 'OPEN';

-- PART 2: MESSAGE SENDER TRACKING
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_display_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'outbound_messages' AND column_name = 'sender_display_name'
  ) THEN
    ALTER TABLE outbound_messages ADD COLUMN sender_display_name TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_sender_user 
  ON messages(sender_id) WHERE sender_id IS NOT NULL;

-- PART 3: MESSAGE_EVENTS TABLE
CREATE TABLE IF NOT EXISTS message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  outbound_id UUID REFERENCES outbound_messages(id),
  message_id UUID REFERENCES messages(id),
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_event_type CHECK (event_type IN (
    'SEND_REQUESTED', 'SEND_IDEMPOTENT_HIT', 'SEND_FAILED', 'SEND_SUCCESS',
    'SEND_RATE_LIMITED', 'SYNC_COMPLETED', 'WEBHOOK_MESSAGE_RECEIVED',
    'WEBHOOK_DUPLICATE_SKIPPED', 'ASSIGNMENT_CLAIMED', 'ASSIGNMENT_RELEASED',
    'ASSIGNMENT_ESCALATED', 'CONVERSATION_RESOLVED', 'CONVERSATION_REOPENED',
    'TAG_ADDED', 'TAG_REMOVED', 'CASE_CREATED', 'CASE_RESOLVED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_message_events_conversation 
  ON message_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_events_request ON message_events(request_id);
CREATE INDEX IF NOT EXISTS idx_message_events_type ON message_events(event_type, created_at DESC);

-- PART 4: CONVERSATION CASES
CREATE TABLE IF NOT EXISTS conversation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  booking_id TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'DISPUTE', 'RELOCATE', 'REFUND', 'NO_SHOW', 'OVERBOOK', 
    'COMPLAINT', 'SPECIAL_REQUEST', 'MODIFICATION', 'CANCELLATION', 'OTHER'
  )),
  summary TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED')),
  priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('URGENT', 'HIGH', 'NORMAL', 'LOW')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cases_conversation ON conversation_cases(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cases_booking ON conversation_cases(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_status ON conversation_cases(status, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON conversation_cases(assigned_to) WHERE assigned_to IS NOT NULL;

-- PART 5: RATE LIMITING TABLE
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key TEXT NOT NULL,
  bucket_type TEXT NOT NULL DEFAULT 'SEND_MESSAGE',
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_bucket_window UNIQUE (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON rate_limit_buckets(bucket_key, window_start DESC);
-- Removed: idx_rate_limit_cleanup with now() predicate (not allowed)

-- PART 6: IDEMPOTENCY & DUPLICATE PREVENTION
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'messages_external_message_id_key'
  ) THEN
    CREATE UNIQUE INDEX messages_external_message_id_key 
      ON messages(external_message_id) WHERE external_message_id IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'outbound_messages_client_message_id_key'
  ) THEN
    ALTER TABLE outbound_messages 
      ADD CONSTRAINT outbound_messages_client_message_id_key UNIQUE (client_message_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_external 
  ON messages(conversation_id, external_message_id) WHERE external_message_id IS NOT NULL;

-- PART 7: RACE CONDITION PROTECTION FUNCTIONS
CREATE OR REPLACE FUNCTION update_conversation_timestamps_safe(
  p_conversation_id UUID,
  p_last_message_at TIMESTAMPTZ,
  p_last_inbound_at TIMESTAMPTZ DEFAULT NULL,
  p_last_outbound_at TIMESTAMPTZ DEFAULT NULL,
  p_increment_unread BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message_at = GREATEST(last_message_at, p_last_message_at),
    last_inbound_at = CASE 
      WHEN p_last_inbound_at IS NOT NULL 
      THEN GREATEST(COALESCE(last_inbound_at, '1970-01-01'::timestamptz), p_last_inbound_at)
      ELSE last_inbound_at
    END,
    last_outbound_at = CASE 
      WHEN p_last_outbound_at IS NOT NULL 
      THEN GREATEST(COALESCE(last_outbound_at, '1970-01-01'::timestamptz), p_last_outbound_at)
      ELSE last_outbound_at
    END,
    unread_count = CASE 
      WHEN p_increment_unread THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION claim_conversation(
  p_conversation_id UUID,
  p_user_id UUID,
  p_team TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT, current_assignee UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_assignee UUID;
  v_current_status TEXT;
BEGIN
  SELECT assigned_to_user_id, assignment_status 
  INTO v_current_assignee, v_current_status
  FROM conversations
  WHERE id = p_conversation_id
  FOR UPDATE;
  
  IF v_current_assignee IS NOT NULL AND v_current_assignee != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Conversation already assigned to another user'::TEXT, v_current_assignee;
    RETURN;
  END IF;
  
  IF v_current_status = 'RESOLVED' THEN
    RETURN QUERY SELECT FALSE, 'Conversation is already resolved'::TEXT, v_current_assignee;
    RETURN;
  END IF;
  
  UPDATE conversations
  SET 
    assigned_to_user_id = p_user_id,
    assigned_team = COALESCE(p_team, assigned_team),
    assignment_status = 'ASSIGNED',
    assigned_at = now(),
    updated_at = now()
  WHERE id = p_conversation_id;
  
  INSERT INTO message_events (request_id, conversation_id, event_type, payload)
  VALUES (gen_random_uuid()::text, p_conversation_id, 'ASSIGNMENT_CLAIMED',
    jsonb_build_object('user_id', p_user_id, 'team', p_team));
  
  RETURN QUERY SELECT TRUE, 'Conversation claimed successfully'::TEXT, p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_conversation(
  p_conversation_id UUID,
  p_user_id UUID,
  p_new_assignee UUID DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_assignee UUID;
BEGIN
  SELECT assigned_to_user_id INTO v_current_assignee
  FROM conversations WHERE id = p_conversation_id FOR UPDATE;
  
  IF v_current_assignee IS NULL OR v_current_assignee != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'You are not the current assignee'::TEXT;
    RETURN;
  END IF;
  
  UPDATE conversations
  SET 
    assigned_to_user_id = p_new_assignee,
    assignment_status = CASE WHEN p_new_assignee IS NULL THEN 'UNASSIGNED' ELSE 'ASSIGNED' END,
    assigned_at = CASE WHEN p_new_assignee IS NOT NULL THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_conversation_id;
  
  INSERT INTO message_events (request_id, conversation_id, event_type, payload)
  VALUES (gen_random_uuid()::text, p_conversation_id, 'ASSIGNMENT_RELEASED',
    jsonb_build_object('released_by', p_user_id, 'new_assignee', p_new_assignee));
  
  RETURN QUERY SELECT TRUE, 'Conversation released successfully'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_conversation(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE conversations
  SET 
    assignment_status = 'RESOLVED',
    resolved_at = now(),
    resolved_by_user_id = p_user_id,
    status = 'CLOSED',
    updated_at = now()
  WHERE id = p_conversation_id;
  
  INSERT INTO message_events (request_id, conversation_id, event_type, payload)
  VALUES (gen_random_uuid()::text, p_conversation_id, 'CONVERSATION_RESOLVED',
    jsonb_build_object('resolved_by', p_user_id));
  
  RETURN QUERY SELECT TRUE, 'Conversation resolved successfully'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_bucket_key TEXT,
  p_window_seconds INTEGER DEFAULT 5,
  p_max_requests INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  v_window_start := date_trunc('second', now()) - (
    (EXTRACT(EPOCH FROM now())::integer % p_window_seconds) * interval '1 second'
  );
  
  INSERT INTO rate_limit_buckets (bucket_key, window_start, request_count)
  VALUES (p_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start) 
  DO UPDATE SET request_count = rate_limit_buckets.request_count + 1
  RETURNING request_count INTO v_current_count;
  
  RETURN v_current_count <= p_max_requests;
END;
$$;

-- PART 8: PAGINATION
CREATE INDEX IF NOT EXISTS idx_messages_cursor_pagination 
  ON messages(conversation_id, sent_at DESC, id DESC);

CREATE OR REPLACE FUNCTION get_messages_paginated(
  p_conversation_id UUID,
  p_cursor_sent_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID, external_message_id TEXT, conversation_id UUID, direction TEXT,
  sender_type TEXT, sender_id UUID, sender_display_name TEXT, body TEXT,
  attachments JSONB, sent_at TIMESTAMPTZ, synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF p_cursor_sent_at IS NULL THEN
    RETURN QUERY
    SELECT m.id, m.external_message_id, m.conversation_id, m.direction, m.sender_type,
      m.sender_id, m.sender_display_name, m.body, m.attachments, m.sent_at, m.synced_at, m.created_at
    FROM messages m
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT m.id, m.external_message_id, m.conversation_id, m.direction, m.sender_type,
      m.sender_id, m.sender_display_name, m.body, m.attachments, m.sent_at, m.synced_at, m.created_at
    FROM messages m
    WHERE m.conversation_id = p_conversation_id
      AND (m.sent_at, m.id) < (p_cursor_sent_at, p_cursor_id)
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- PART 9: CONVERSATION TAGS
CREATE TABLE IF NOT EXISTS conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_conversation_tag UNIQUE (conversation_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_name ON conversation_tags(tag_name);

-- PART 10: CLEANUP FUNCTIONS
CREATE OR REPLACE FUNCTION cleanup_rate_limit_buckets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limit_buckets WHERE created_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION set_first_response_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.direction = 'OUTBOUND' AND NEW.sender_type = 'AGENT' THEN
    UPDATE conversations
    SET first_response_at = COALESCE(first_response_at, NEW.sent_at)
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_first_response ON messages;
CREATE TRIGGER trg_set_first_response
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION set_first_response_at();

-- PART 11: RLS
ALTER TABLE message_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read message_events" ON message_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert message_events" ON message_events
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can read conversation_cases" ON conversation_cases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage conversation_cases" ON conversation_cases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage conversation_tags" ON conversation_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage rate_limits" ON rate_limit_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PART 12: GRANTS
GRANT EXECUTE ON FUNCTION update_conversation_timestamps_safe TO authenticated;
GRANT EXECUTE ON FUNCTION claim_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION release_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION get_messages_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_rate_limit_buckets TO service_role;

GRANT SELECT, INSERT ON message_events TO authenticated;
GRANT ALL ON conversation_cases TO authenticated;
GRANT ALL ON conversation_tags TO authenticated;
GRANT ALL ON rate_limit_buckets TO service_role;
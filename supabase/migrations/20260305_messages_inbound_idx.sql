-- ================================================================
-- Patch B: Add index for NotificationBell messages query
-- Fixes seq scan on messages table (4-12.5s TTFB → <100ms)
-- ================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_messages_direction_sent_at
  ON public.messages (direction, sent_at DESC);

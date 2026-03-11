/**
 * Push Notification Types
 * 
 * Types for push subscription and delivery tables
 * These will be merged into types.ts after running migrations
 */

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_fingerprint: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
}

export interface PushSubscriptionInsert {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  device_fingerprint?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string | null;
  consecutive_failures?: number;
  last_failure_at?: string | null;
  last_failure_reason?: string | null;
}

export interface PushDelivery {
  id: string;
  event_type: PushEventType;
  idempotency_key: string;
  recipient_user_id: string;
  subscription_id: string | null;
  source_table: string | null;
  source_record_id: string | null;
  delivered_at: string;
  ttl_seconds: number;
  payload_hash: string | null;
}

export interface PushDeliveryInsert {
  id?: string;
  event_type: PushEventType;
  idempotency_key: string;
  recipient_user_id: string;
  subscription_id?: string | null;
  source_table?: string | null;
  source_record_id?: string | null;
  delivered_at?: string;
  ttl_seconds?: number;
  payload_hash?: string | null;
}

export type PushEventType = 
  | 'BOOKING_NEW'
  | 'BOOKING_MODIFIED'
  | 'BOOKING_CANCELLED'
  | 'MESSAGE_INBOUND';

export interface SendPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  deep_link?: string;
  entity_id?: string;
  data?: Record<string, unknown>;
}

export interface SendPushRequest {
  event_type: PushEventType;
  idempotency_key: string;
  recipient_user_ids?: string[];
  assigned_to_user_id?: string;
  use_triage_group?: boolean;
  payload: SendPushPayload;
  source_table?: string;
  source_record_id?: string;
}

export interface SendPushResponse {
  success: boolean;
  sent: number;
  duplicates: number;
  failed: number;
  expired: number;
  total_subscriptions: number;
}

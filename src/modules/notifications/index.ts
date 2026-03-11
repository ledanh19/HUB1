/**
 * Notifications Module - Smart Dedup/Hide
 * 
 * Exports the filter functions for hiding technical UPDATE notifications
 * that accompany NEW_BOOKING or CANCELLED events.
 */

export {
  // Main filter functions
  filterNotifications,
  filterNotificationsSimple,
  filterBookingChanges,
  
  // Adapters
  bookingChangeToNotificationItem,
  
  // Type guards
  isNotificationItem,
  validateNotifications,
  
  // Constants (for testing/extension)
  TECH_FIELDS,
  OPS_FIELDS,
  WINDOW_SECONDS,
  
  // Types
  type NotificationItem,
  type NotificationEventType,
  type ChangeSet,
  type FilterResult,
  type BookingChangeRecord,
} from './utils/filterNotifications';

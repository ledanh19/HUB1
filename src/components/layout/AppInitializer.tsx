import { useBackgroundMessagesSync } from '@/hooks/useBackgroundMessagesSync';
import { usePushSubscription } from '@/hooks/usePushSubscription';

/**
 * App-level initializer component
 * Runs background tasks like message syncing for logged-in users
 * Should be placed inside AuthProvider but outside BrowserRouter
 *
 * Note: Both hooks internally guard with `if (!user) return`, so
 * they safely no-op on public pages (/about, /privacy-policy, /terms).
 */
export function AppInitializer({ children }: { children: React.ReactNode }) {
  // Initialize background messages sync
  // This runs every 60s and on tab visibility change to keep messages up-to-date
  useBackgroundMessagesSync();

  // Initialize push notification subscription
  // Auto-subscribes when user logs in and permission is granted
  usePushSubscription();

  return <>{children}</>;
}

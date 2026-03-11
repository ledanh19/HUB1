/**
 * PUSH RESUBSCRIBE ANTI-LOOP GUARDRAILS
 * 
 * Prevents infinite resubscribe loops with:
 * 1. Cooldown timer (10 minutes)
 * 2. Single-tab lock (BroadcastChannel + localStorage fallback)
 * 3. Resubscribe attempt counter
 * 
 * Rules:
 * - Only resubscribe when backend returns {needResubscribe: true}
 * - Respect 10-minute cooldown between attempts
 * - Only 1 tab can perform resubscribe at a time
 * - Never resubscribe on vapidMismatch or badRequest
 */

// ============================================
// CONSTANTS
// ============================================

const COOLDOWN_KEY = 'push_resubscribe_cooldown_until';
const LOCK_KEY = 'push_subscribe_lock';
const ATTEMPT_COUNT_KEY = 'push_resubscribe_attempts';
const LAST_ATTEMPT_KEY = 'push_resubscribe_last_attempt';
const VAPID_VERSION_KEY = 'push_vapid_version';

// Cooldown duration in milliseconds (10 minutes)
const COOLDOWN_MS = 10 * 60 * 1000;

// Max attempts within 1 hour before long cooldown
const MAX_ATTEMPTS_PER_HOUR = 3;

// Long cooldown after max attempts (1 hour)
const LONG_COOLDOWN_MS = 60 * 60 * 1000;

// Lock timeout (30 seconds)
const LOCK_TIMEOUT_MS = 30 * 1000;

// BroadcastChannel name
const BROADCAST_CHANNEL = 'push_subscription_channel';

// ============================================
// TYPES
// ============================================

export interface ResubscribeCheckResult {
  canResubscribe: boolean;
  reason: string;
  cooldownUntil?: Date;
  waitMs?: number;
}

export interface PushResponseFlags {
  needResubscribe?: boolean;
  vapidMismatch?: boolean;
  badRequest?: boolean;
  reason?: string;
}

// ============================================
// COOLDOWN MANAGEMENT
// ============================================

/**
 * Check if currently in cooldown period
 */
export function isInCooldown(): boolean {
  const cooldownUntil = localStorage.getItem(COOLDOWN_KEY);
  if (!cooldownUntil) return false;
  
  const until = parseInt(cooldownUntil, 10);
  return Date.now() < until;
}

/**
 * Get remaining cooldown time in milliseconds
 */
export function getCooldownRemaining(): number {
  const cooldownUntil = localStorage.getItem(COOLDOWN_KEY);
  if (!cooldownUntil) return 0;
  
  const until = parseInt(cooldownUntil, 10);
  const remaining = until - Date.now();
  return Math.max(0, remaining);
}

/**
 * Set cooldown period
 */
export function setCooldown(durationMs: number = COOLDOWN_MS): void {
  const until = Date.now() + durationMs;
  localStorage.setItem(COOLDOWN_KEY, until.toString());
  console.log(`[PushAntiLoop] Cooldown set until: ${new Date(until).toISOString()}`);
}

/**
 * Clear cooldown (for testing/admin)
 */
export function clearCooldown(): void {
  localStorage.removeItem(COOLDOWN_KEY);
  console.log('[PushAntiLoop] Cooldown cleared');
}

// ============================================
// ATTEMPT TRACKING
// ============================================

/**
 * Get number of resubscribe attempts in the last hour
 */
export function getRecentAttemptCount(): number {
  const attempts = localStorage.getItem(ATTEMPT_COUNT_KEY);
  const lastAttempt = localStorage.getItem(LAST_ATTEMPT_KEY);
  
  if (!attempts || !lastAttempt) return 0;
  
  const lastAttemptTime = parseInt(lastAttempt, 10);
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  // Reset counter if last attempt was more than 1 hour ago
  if (lastAttemptTime < oneHourAgo) {
    localStorage.setItem(ATTEMPT_COUNT_KEY, '0');
    return 0;
  }
  
  return parseInt(attempts, 10);
}

/**
 * Increment attempt counter
 */
export function incrementAttemptCount(): number {
  const current = getRecentAttemptCount();
  const newCount = current + 1;
  
  localStorage.setItem(ATTEMPT_COUNT_KEY, newCount.toString());
  localStorage.setItem(LAST_ATTEMPT_KEY, Date.now().toString());
  
  console.log(`[PushAntiLoop] Attempt count: ${newCount}`);
  
  return newCount;
}

/**
 * Reset attempt counter
 */
export function resetAttemptCount(): void {
  localStorage.setItem(ATTEMPT_COUNT_KEY, '0');
  console.log('[PushAntiLoop] Attempt count reset');
}

// ============================================
// SINGLE-TAB LOCK
// ============================================

let broadcastChannel: BroadcastChannel | null = null;

/**
 * Initialize BroadcastChannel for cross-tab communication
 */
export function initBroadcastChannel(): void {
  if (typeof BroadcastChannel === 'undefined') {
    console.log('[PushAntiLoop] BroadcastChannel not supported, using localStorage fallback');
    return;
  }
  
  if (broadcastChannel) return;
  
  broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
  
  broadcastChannel.onmessage = (event) => {
    if (event.data.type === 'LOCK_ACQUIRED') {
      console.log('[PushAntiLoop] Another tab acquired lock');
    } else if (event.data.type === 'LOCK_RELEASED') {
      console.log('[PushAntiLoop] Lock released by another tab');
    } else if (event.data.type === 'RESUBSCRIBE_SUCCESS') {
      console.log('[PushAntiLoop] Resubscribe succeeded in another tab');
      // Clear local cooldown since another tab succeeded
    }
  };
}

/**
 * Try to acquire single-tab lock
 */
export function tryAcquireLock(): boolean {
  const lockData = localStorage.getItem(LOCK_KEY);
  
  if (lockData) {
    const { timestamp, tabId } = JSON.parse(lockData);
    const lockAge = Date.now() - timestamp;
    
    // Check if lock is stale (older than timeout)
    if (lockAge < LOCK_TIMEOUT_MS) {
      console.log(`[PushAntiLoop] Lock held by tab ${tabId}, age: ${lockAge}ms`);
      return false;
    }
    
    console.log('[PushAntiLoop] Lock expired, taking over');
  }
  
  // Acquire lock
  const myTabId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem(LOCK_KEY, JSON.stringify({
    timestamp: Date.now(),
    tabId: myTabId,
  }));
  
  // Notify other tabs
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'LOCK_ACQUIRED', tabId: myTabId });
  }
  
  console.log(`[PushAntiLoop] Lock acquired by tab ${myTabId}`);
  return true;
}

/**
 * Release single-tab lock
 */
export function releaseLock(): void {
  localStorage.removeItem(LOCK_KEY);
  
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'LOCK_RELEASED' });
  }
  
  console.log('[PushAntiLoop] Lock released');
}

/**
 * Check if any tab has the lock
 */
export function isLocked(): boolean {
  const lockData = localStorage.getItem(LOCK_KEY);
  if (!lockData) return false;
  
  const { timestamp } = JSON.parse(lockData);
  return (Date.now() - timestamp) < LOCK_TIMEOUT_MS;
}

// ============================================
// MAIN CHECK FUNCTION
// ============================================

/**
 * Check if resubscribe is allowed based on all guardrails
 */
export function canPerformResubscribe(response: PushResponseFlags): ResubscribeCheckResult {
  // Rule 1: Never resubscribe on VAPID mismatch
  if (response.vapidMismatch) {
    return {
      canResubscribe: false,
      reason: 'VAPID_MISMATCH - Cannot fix with resubscribe. Check VAPID key configuration.',
    };
  }
  
  // Rule 2: Never resubscribe on bad request
  if (response.badRequest) {
    return {
      canResubscribe: false,
      reason: 'BAD_REQUEST - Cannot fix with resubscribe. Check payload/headers.',
    };
  }
  
  // Rule 3: Only resubscribe if backend explicitly says so
  if (!response.needResubscribe) {
    return {
      canResubscribe: false,
      reason: 'Backend did not request resubscribe',
    };
  }
  
  // Rule 4: Check cooldown
  if (isInCooldown()) {
    const remaining = getCooldownRemaining();
    return {
      canResubscribe: false,
      reason: `In cooldown period. Wait ${Math.ceil(remaining / 1000)} seconds.`,
      waitMs: remaining,
      cooldownUntil: new Date(Date.now() + remaining),
    };
  }
  
  // Rule 5: Check attempt count
  const attempts = getRecentAttemptCount();
  if (attempts >= MAX_ATTEMPTS_PER_HOUR) {
    // Apply long cooldown
    setCooldown(LONG_COOLDOWN_MS);
    return {
      canResubscribe: false,
      reason: `Too many attempts (${attempts}). Long cooldown applied (1 hour).`,
      waitMs: LONG_COOLDOWN_MS,
      cooldownUntil: new Date(Date.now() + LONG_COOLDOWN_MS),
    };
  }
  
  // Rule 6: Check single-tab lock
  if (isLocked() && !tryAcquireLock()) {
    return {
      canResubscribe: false,
      reason: 'Another tab is performing resubscribe',
    };
  }
  
  // All checks passed
  return {
    canResubscribe: true,
    reason: 'OK',
  };
}

/**
 * Record a resubscribe attempt (call before attempting)
 */
export function recordResubscribeAttempt(): void {
  incrementAttemptCount();
  setCooldown();
}

/**
 * Record resubscribe success (call after success)
 */
export function recordResubscribeSuccess(): void {
  resetAttemptCount();
  releaseLock();
  
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'RESUBSCRIBE_SUCCESS' });
  }
  
  console.log('[PushAntiLoop] Resubscribe success recorded');
}

/**
 * Record resubscribe failure (call after failure)
 */
export function recordResubscribeFailure(reason: string): void {
  releaseLock();
  console.log(`[PushAntiLoop] Resubscribe failure: ${reason}`);
}

// ============================================
// VAPID VERSION TRACKING
// ============================================

/**
 * Get stored VAPID version
 */
export function getStoredVapidVersion(): string | null {
  return localStorage.getItem(VAPID_VERSION_KEY);
}

/**
 * Set VAPID version
 */
export function setVapidVersion(version: string): void {
  localStorage.setItem(VAPID_VERSION_KEY, version);
}

/**
 * Check if VAPID version changed (may need resubscribe)
 */
export function hasVapidVersionChanged(currentVersion: string): boolean {
  const stored = getStoredVapidVersion();
  if (!stored) {
    setVapidVersion(currentVersion);
    return false;
  }
  return stored !== currentVersion;
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize BroadcastChannel on module load
if (typeof window !== 'undefined') {
  initBroadcastChannel();
}

// ============================================
// DEBUG HELPERS
// ============================================

export function getAntiLoopState(): {
  inCooldown: boolean;
  cooldownRemaining: number;
  attemptCount: number;
  isLocked: boolean;
  vapidVersion: string | null;
} {
  return {
    inCooldown: isInCooldown(),
    cooldownRemaining: getCooldownRemaining(),
    attemptCount: getRecentAttemptCount(),
    isLocked: isLocked(),
    vapidVersion: getStoredVapidVersion(),
  };
}

export function resetAllAntiLoopState(): void {
  clearCooldown();
  resetAttemptCount();
  releaseLock();
  localStorage.removeItem(VAPID_VERSION_KEY);
  console.log('[PushAntiLoop] All state reset');
}

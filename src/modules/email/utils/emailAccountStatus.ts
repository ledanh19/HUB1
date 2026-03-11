/**
 * Email Account Status Normalization
 * ═══════════════════════════════════
 * Single source of truth for deriving UI state from raw account data.
 */
import type { EmailAccount } from '@/types/email';

export type EmailAccountUiStatus = 'CONNECTED' | 'EXPIRED' | 'SYNC_ERROR' | 'DISCONNECTED' | 'PENDING';
export type StatusTone = 'success' | 'warning' | 'error' | 'muted' | 'info';
export type AccountAction = 'disconnect' | 'reconnect' | 'retry_sync' | 'none';

export interface EmailAccountUiState {
  rawStatus: string;
  uiStatus: EmailAccountUiStatus;
  isStale: boolean;
  staleSeverity: 'none' | 'mild' | 'moderate' | 'severe';
  statusLabel: string;
  statusTone: StatusTone;
  description: string | null;
  primaryAction: AccountAction;
  secondaryAction: AccountAction;
}

// ─── Token-related error patterns ──────────────────────────
const TOKEN_ERROR_PATTERNS = [
  'invalid_grant',
  'token has been expired',
  'token has been revoked',
  'token expired',
  'token revoked',
  'refresh token',
  'reauth_required',
  'expired_or_revoked',
  'unauthorized',
  'invalid_credentials',
];

function isTokenError(errorCode: string | null): boolean {
  if (!errorCode) return false;
  const lower = errorCode.toLowerCase();
  return TOKEN_ERROR_PATTERNS.some((p) => lower.includes(p));
}

// ─── Stale sync detection ──────────────────────────────────
const STALE_THRESHOLDS = {
  mild: 6 * 60 * 60 * 1000,     // 6 hours
  moderate: 24 * 60 * 60 * 1000, // 24 hours
  severe: 3 * 24 * 60 * 60 * 1000, // 3 days
};

function getStaleSeverity(lastSyncAt: string | null): 'none' | 'mild' | 'moderate' | 'severe' {
  if (!lastSyncAt) return 'none';
  const elapsed = Date.now() - new Date(lastSyncAt).getTime();
  if (elapsed >= STALE_THRESHOLDS.severe) return 'severe';
  if (elapsed >= STALE_THRESHOLDS.moderate) return 'moderate';
  if (elapsed >= STALE_THRESHOLDS.mild) return 'mild';
  return 'none';
}

// ─── Main normalization function ───────────────────────────
export function normalizeEmailAccountStatus(account: EmailAccount): EmailAccountUiState {
  const staleSeverity = getStaleSeverity(account.last_sync_at);
  const isStale = staleSeverity !== 'none';

  // 1. DISCONNECTED — explicitly revoked by user
  if (account.status === 'REVOKED') {
    return {
      rawStatus: account.status,
      uiStatus: 'DISCONNECTED',
      isStale: false,
      staleSeverity: 'none',
      statusLabel: 'Đã ngắt kết nối',
      statusTone: 'muted',
      description: null,
      primaryAction: 'reconnect',
      secondaryAction: 'none',
    };
  }

  // 2. EXPIRED — REAUTH_REQUIRED or ERROR with token-related error
  if (account.status === 'REAUTH_REQUIRED' || (account.status === 'ERROR' && isTokenError(account.error_code))) {
    return {
      rawStatus: account.status,
      uiStatus: 'EXPIRED',
      isStale,
      staleSeverity,
      statusLabel: 'Token hết hạn',
      statusTone: 'error',
      description: account.error_code
        ? `Token đã hết hạn hoặc bị thu hồi (${account.error_code})`
        : 'Token đã hết hạn hoặc bị thu hồi. Cần kết nối lại.',
      primaryAction: 'reconnect',
      secondaryAction: 'none',
    };
  }

  // 3. SYNC_ERROR — ERROR but not token-related
  if (account.status === 'ERROR') {
    return {
      rawStatus: account.status,
      uiStatus: 'SYNC_ERROR',
      isStale,
      staleSeverity,
      statusLabel: 'Lỗi đồng bộ',
      statusTone: 'warning',
      description: account.error_code
        ? `Lỗi đồng bộ: ${account.error_code}`
        : 'Đồng bộ gặp lỗi tạm thời.',
      primaryAction: 'retry_sync',
      secondaryAction: 'disconnect',
    };
  }

  // 4. CONNECTED (ACTIVE)
  let description: string | null = null;
  let statusTone: StatusTone = 'success';

  if (staleSeverity === 'severe') {
    description = 'Chưa đồng bộ gần đây. Kiểm tra lại kết nối.';
    statusTone = 'warning';
  } else if (staleSeverity === 'moderate') {
    description = 'Chưa đồng bộ hơn 24 giờ.';
  } else if (staleSeverity === 'mild') {
    description = 'Chưa đồng bộ hơn 6 giờ.';
  }

  return {
    rawStatus: account.status,
    uiStatus: 'CONNECTED',
    isStale,
    staleSeverity,
    statusLabel: 'Đang hoạt động',
    statusTone,
    description,
    primaryAction: 'disconnect',
    secondaryAction: 'retry_sync',
  };
}

// ─── Deduplicate accounts by email_address ─────────────────
// Keep the "best" record per email: ACTIVE > REAUTH > ERROR > REVOKED, then newest updated_at
const STATUS_PRIORITY: Record<string, number> = {
  ACTIVE: 0,
  REAUTH_REQUIRED: 1,
  ERROR: 2,
  REVOKED: 3,
};

export function deduplicateEmailAccounts(accounts: EmailAccount[]): EmailAccount[] {
  const map = new Map<string, EmailAccount>();

  for (const acc of accounts) {
    const existing = map.get(acc.email_address);
    if (!existing) {
      map.set(acc.email_address, acc);
      continue;
    }

    const existingPri = STATUS_PRIORITY[existing.status] ?? 99;
    const accPri = STATUS_PRIORITY[acc.status] ?? 99;

    if (accPri < existingPri) {
      map.set(acc.email_address, acc);
    } else if (accPri === existingPri) {
      // Same status priority → pick newest updated_at
      if (new Date(acc.updated_at) > new Date(existing.updated_at)) {
        map.set(acc.email_address, acc);
      }
    }
  }

  return Array.from(map.values());
}

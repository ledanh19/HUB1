/**
 * STRUCTURED LOGGER — Consistent logging across Session Recovery V1.1
 * 
 * - Dev: full console output with prefixed namespaces
 * - Prod: no-op (minimal overhead)
 * - Supports request_id propagation
 * 
 * @author Session Reliability V1.1
 */

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  /** Module namespace, e.g. 'SessionManager', 'SafeQuery', 'Realtime' */
  ns: string;
  /** Human-readable message */
  msg: string;
  /** Optional request ID for tracing */
  request_id?: string;
  /** Optional extra data */
  data?: Record<string, any>;
}

function _format(payload: LogPayload): [string, ...any[]] {
  const prefix = `[${payload.ns}]`;
  const parts: any[] = [prefix, payload.msg];
  if (payload.request_id) {
    parts.push(`[${payload.request_id}]`);
  }
  if (payload.data) {
    parts.push(payload.data);
  }
  return parts as [string, ...any[]];
}

export function logDebug(payload: LogPayload): void {
  if (!IS_DEV) return;
  console.log(..._format(payload));
}

export function logInfo(payload: LogPayload): void {
  if (!IS_DEV) return;
  console.log(..._format(payload));
}

export function logWarn(payload: LogPayload): void {
  if (!IS_DEV) return;
  console.warn(..._format(payload));
}

export function logError(payload: LogPayload): void {
  // Always log errors even in prod (they matter)
  console.error(..._format(payload));
}

/**
 * Create a scoped logger for a specific module.
 * Usage:
 * ```ts
 * const log = createLogger('SessionManager');
 * log.info('Tab resumed');
 * log.warn('Refresh failed', { request_id: '123', data: { error: 'xyz' } });
 * ```
 */
export function createLogger(ns: string) {
  return {
    debug: (msg: string, extra?: Partial<Omit<LogPayload, 'ns' | 'msg'>>) =>
      logDebug({ ns, msg, ...extra }),
    info: (msg: string, extra?: Partial<Omit<LogPayload, 'ns' | 'msg'>>) =>
      logInfo({ ns, msg, ...extra }),
    warn: (msg: string, extra?: Partial<Omit<LogPayload, 'ns' | 'msg'>>) =>
      logWarn({ ns, msg, ...extra }),
    error: (msg: string, extra?: Partial<Omit<LogPayload, 'ns' | 'msg'>>) =>
      logError({ ns, msg, ...extra }),
  };
}

// ── Global Request ID Store ──
// Used by wrappedFetch to propagate request_id to error UIs

let _lastRequestId: string | null = null;

export function setLastRequestId(id: string): void {
  _lastRequestId = id;
}

export function getLastRequestId(): string | null {
  return _lastRequestId;
}

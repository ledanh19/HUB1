// Supabase client — SINGLETON instance.
// SESSION_RECOVERY_V1: adds global fetch timeout (15s) + structured logging.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const REQUEST_TIMEOUT_MS = 15_000; // 15 seconds
const IS_DEV = import.meta.env.DEV;

// NOTE: logger.ts uses dynamic import.meta.env so it's safe to import here
import { createLogger, setLastRequestId } from '@/lib/logger';

const _fetchLog = createLogger('Supabase');
let _requestCounter = 0;

/**
 * Global fetch wrapper with:
 * 1. AbortController timeout (15s) — prevents hanging requests
 * 2. Structured logging via logger.ts
 * 3. Request ID propagation for error tracing
 */
function wrappedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestId = `req_${++_requestCounter}_${Date.now().toString(36)}`;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method || 'GET';
  const start = performance.now();

  // Store last request ID for error UIs
  setLastRequestId(requestId);

  // Create timeout AbortController
  const timeoutController = new AbortController();
  const existingSignal = init?.signal;

  // Merge signals: respect existing signal AND add timeout
  let combinedSignal: AbortSignal;
  if (existingSignal) {
    if (existingSignal.aborted) {
      timeoutController.abort(existingSignal.reason);
    } else {
      existingSignal.addEventListener('abort', () => {
        timeoutController.abort(existingSignal.reason);
      }, { once: true });
    }
    combinedSignal = timeoutController.signal;
  } else {
    combinedSignal = timeoutController.signal;
  }

  const timeoutId = setTimeout(() => {
    timeoutController.abort(new DOMException('Request timeout (15s)', 'TimeoutError'));
  }, REQUEST_TIMEOUT_MS);

  return fetch(input, { ...init, signal: combinedSignal })
    .then((response) => {
      clearTimeout(timeoutId);
      const duration = Math.round(performance.now() - start);
      const shortUrl = url.replace(SUPABASE_URL, '');
      _fetchLog.debug(`${method} ${shortUrl} → ${response.status} (${duration}ms)`, {
        request_id: requestId,
      });
      return response;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      const duration = Math.round(performance.now() - start);
      const shortUrl = url.replace(SUPABASE_URL, '');
      const errorType = error.name === 'TimeoutError' ? 'TIMEOUT'
        : error.name === 'AbortError' ? 'ABORTED'
          : 'NETWORK';
      _fetchLog.warn(`${method} ${shortUrl} → ${errorType} (${duration}ms)`, {
        request_id: requestId,
        data: { error: error.message },
      });
      throw error;
    });
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: wrappedFetch,
  },
});
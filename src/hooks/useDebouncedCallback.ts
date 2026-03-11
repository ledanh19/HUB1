import { useRef, useCallback, useEffect } from 'react';

/**
 * Generic debounce hook. Returns a stable debounced version of the callback.
 * Cancels pending invocations on unmount.
 *
 * @param callback The function to debounce
 * @param delay    Delay in ms (default 300)
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay = 300
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Always reference the latest callback without re-creating the debounced fn
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const debounced = useCallback(
    (...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as unknown as T;

  return debounced;
}

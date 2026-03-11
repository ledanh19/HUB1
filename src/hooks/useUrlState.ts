/**
 * useUrlState Hook
 * 
 * UX Governance: Synchronize filter/pagination state with URL query params.
 * 
 * Benefits:
 * - Shareable URLs with filters
 * - Browser back/forward preserves filters
 * - Refresh doesn't lose state
 * - Deep linking support
 * 
 * Usage:
 * const [status, setStatus] = useUrlState("status", "all");
 * const [page, setPage] = useUrlState("page", 1, { type: "number" });
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type ValueType = "string" | "number" | "boolean" | "array";

interface UseUrlStateOptions<T> {
  /** Type of the value for proper serialization */
  type?: ValueType;
  /** Custom serializer (value to URL string) */
  serialize?: (value: T) => string;
  /** Custom deserializer (URL string to value) */
  deserialize?: (str: string) => T;
  /** Whether to replace history instead of push */
  replace?: boolean;
  /** Debounce delay in ms (useful for search inputs) */
  debounceMs?: number;
}

/**
 * Serialize value to URL-safe string
 */
function defaultSerialize<T>(value: T, type: ValueType): string {
  switch (type) {
    case "array":
      return Array.isArray(value) ? value.join(",") : String(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
    case "string":
    default:
      return String(value);
  }
}

/**
 * Deserialize URL string to typed value
 */
function defaultDeserialize<T>(str: string | null, defaultValue: T, type: ValueType): T {
  if (str === null || str === undefined || str === "") {
    return defaultValue;
  }

  switch (type) {
    case "number": {
      const num = parseInt(str, 10);
      return (isNaN(num) ? defaultValue : num) as T;
    }
    case "boolean":
      return (str === "true") as T;
    case "array":
      return str.split(",").filter(Boolean) as T;
    case "string":
    default:
      return str as T;
  }
}

/**
 * Hook to sync state with URL query parameters
 */
export function useUrlState<T>(
  key: string,
  defaultValue: T,
  options: UseUrlStateOptions<T> = {}
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const {
    type = typeof defaultValue === "number" 
      ? "number" 
      : typeof defaultValue === "boolean"
        ? "boolean"
        : Array.isArray(defaultValue)
          ? "array"
          : "string",
    serialize = (v: T) => defaultSerialize(v, type),
    deserialize = (s: string | null) => defaultDeserialize(s, defaultValue, type),
    replace = false,
  } = options;

  // Get current value from URL
  const value = useMemo(() => {
    const urlValue = searchParams.get(key);
    return deserialize(urlValue);
  }, [searchParams, key, deserialize]);

  // Set value to URL
  const setValue = useCallback(
    (newValueOrUpdater: T | ((prev: T) => T)) => {
      setSearchParams(
        (prev) => {
          const currentValue = deserialize(prev.get(key));
          const newValue =
            typeof newValueOrUpdater === "function"
              ? (newValueOrUpdater as (prev: T) => T)(currentValue)
              : newValueOrUpdater;

          const newParams = new URLSearchParams(prev);

          // Remove param if value equals default (cleaner URLs)
          if (
            newValue === defaultValue ||
            (Array.isArray(newValue) &&
              Array.isArray(defaultValue) &&
              newValue.length === 0)
          ) {
            newParams.delete(key);
          } else {
            newParams.set(key, serialize(newValue));
          }

          return newParams;
        },
        { replace }
      );
    },
    [key, setSearchParams, serialize, deserialize, defaultValue, replace]
  );

  // Reset to default
  const resetValue = useCallback(() => {
    setSearchParams(
      (prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.delete(key);
        return newParams;
      },
      { replace }
    );
  }, [key, setSearchParams, replace]);

  return [value, setValue, resetValue];
}

// === Convenience Hooks ===

/**
 * String URL state
 */
export function useUrlString(
  key: string,
  defaultValue: string = ""
): [string, (value: string) => void, () => void] {
  return useUrlState(key, defaultValue, { type: "string" });
}

/**
 * Number URL state (for pagination, etc.)
 */
export function useUrlNumber(
  key: string,
  defaultValue: number = 1
): [number, (value: number) => void, () => void] {
  return useUrlState(key, defaultValue, { type: "number" });
}

/**
 * Boolean URL state (for toggles)
 */
export function useUrlBoolean(
  key: string,
  defaultValue: boolean = false
): [boolean, (value: boolean) => void, () => void] {
  return useUrlState(key, defaultValue, { type: "boolean" });
}

/**
 * Array URL state (for multi-select filters)
 */
export function useUrlArray(
  key: string,
  defaultValue: string[] = []
): [string[], (value: string[]) => void, () => void] {
  return useUrlState(key, defaultValue, { type: "array" });
}

// === Filter Persistence Helpers ===

interface FilterState {
  [key: string]: string | number | boolean | string[];
}

/**
 * Hook to manage multiple URL filter params at once
 */
export function useUrlFilters<T extends FilterState>(
  defaults: T
): [T, (updates: Partial<T>) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse all values from URL
  const filters = useMemo(() => {
    const result = { ...defaults };
    
    Object.keys(defaults).forEach((key) => {
      const urlValue = searchParams.get(key);
      const defaultValue = defaults[key];
      
      if (urlValue !== null) {
        if (typeof defaultValue === "number") {
          const num = parseInt(urlValue, 10);
          (result as Record<string, unknown>)[key] = isNaN(num) ? defaultValue : num;
        } else if (typeof defaultValue === "boolean") {
          (result as Record<string, unknown>)[key] = urlValue === "true";
        } else if (Array.isArray(defaultValue)) {
          (result as Record<string, unknown>)[key] = urlValue.split(",").filter(Boolean);
        } else {
          (result as Record<string, unknown>)[key] = urlValue;
        }
      }
    });
    
    return result as T;
  }, [searchParams, defaults]);

  // Update multiple filters at once
  const setFilters = useCallback(
    (updates: Partial<T>) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        
        Object.entries(updates).forEach(([key, value]) => {
          const defaultValue = defaults[key];
          
          // Remove if matches default
          if (
            value === defaultValue ||
            (Array.isArray(value) && value.length === 0)
          ) {
            newParams.delete(key);
          } else if (Array.isArray(value)) {
            newParams.set(key, value.join(","));
          } else {
            newParams.set(key, String(value));
          }
        });
        
        return newParams;
      });
    },
    [setSearchParams, defaults]
  );

  // Reset all filters to defaults
  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.keys(defaults).forEach((key) => {
        newParams.delete(key);
      });
      return newParams;
    });
  }, [setSearchParams, defaults]);

  return [filters, setFilters, resetFilters];
}

export default useUrlState;

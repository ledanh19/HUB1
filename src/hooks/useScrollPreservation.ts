import { useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";

const SCROLL_STORAGE_PREFIX = "roomrise_scroll_";

/**
 * Hook for preserving and restoring scroll position
 * 
 * UX Governance Rules:
 * - Saves scroll position before navigating away
 * - Restores on back navigation
 * - Uses sessionStorage (cleared on tab close)
 * 
 * Usage:
 * function BookingsPage() {
 *   useScrollPreservation("bookings");
 *   // ... rest of component
 * }
 */
export function useScrollPreservation(key: string) {
  const location = useLocation();
  const storageKey = `${SCROLL_STORAGE_PREFIX}${key}`;
  const isRestoringRef = useRef(false);
  
  // Save scroll position
  const saveScrollPosition = useCallback(() => {
    if (isRestoringRef.current) return;
    const scrollY = window.scrollY;
    if (scrollY > 0) {
      sessionStorage.setItem(storageKey, String(scrollY));
    }
  }, [storageKey]);
  
  // Restore scroll position
  const restoreScrollPosition = useCallback(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      isRestoringRef.current = true;
      const scrollY = parseInt(saved, 10);
      
      // Use requestAnimationFrame for smooth restoration after render
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
        // Clear after restoration
        sessionStorage.removeItem(storageKey);
        // Reset flag after a short delay
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 100);
      });
    }
  }, [storageKey]);
  
  // Save on navigation/unmount
  useEffect(() => {
    // Save before unload
    const handleBeforeUnload = () => {
      saveScrollPosition();
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    // Save on visibility change (tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveScrollPosition();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      // Save on unmount
      saveScrollPosition();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveScrollPosition]);
  
  // Restore on mount
  useEffect(() => {
    // Only restore if navigating back (check navigation type)
    const navType = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming)?.type;
    const isBackNavigation = navType === "back_forward" || location.state?.from;
    
    if (isBackNavigation) {
      // Small delay to ensure content is rendered
      setTimeout(restoreScrollPosition, 50);
    }
  }, [restoreScrollPosition, location.state]);
  
  return {
    saveScrollPosition,
    restoreScrollPosition,
  };
}

/**
 * Hook to save scroll position before navigating to detail
 * 
 * Usage:
 * const { prepareNavigation } = useNavigationWithScroll("bookings");
 * 
 * <Link 
 *   to={`/bookings/${id}`} 
 *   onClick={() => prepareNavigation()}
 *   state={{ from: location.pathname + location.search }}
 * >
 */
export function useNavigationWithScroll(key: string) {
  const storageKey = `${SCROLL_STORAGE_PREFIX}${key}`;
  
  const prepareNavigation = useCallback(() => {
    sessionStorage.setItem(storageKey, String(window.scrollY));
  }, [storageKey]);
  
  return { prepareNavigation };
}

export default useScrollPreservation;

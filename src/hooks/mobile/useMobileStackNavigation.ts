import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

export type MobileStackView = "list" | "detail";

interface UseMobileStackNavigationOptions {
    /** URL param name for the selected item ID (default: "id") */
    paramName?: string;
}

interface UseMobileStackNavigationReturn {
    /** Current view on mobile */
    currentView: MobileStackView;
    /** Whether on mobile viewport */
    isMobile: boolean;
    /** Selected item ID from URL params */
    selectedId: string | null;
    /** Navigate to list (clear selection) */
    goToList: () => void;
    /** Navigate to detail with item ID */
    goToDetail: (id: string) => void;
    /** Smart back: detail→list, preserves other params */
    goBack: () => void;
}

/**
 * Shared mobile stack navigation hook.
 *
 * URL-driven list→detail navigation model.
 * Generalizes the pattern from useMobileMessagesNav for any module.
 *
 * On mobile:
 *  - Shows ONE view at a time (list or detail)
 *  - URL param controls which view is active
 *  - Browser back button works correctly
 *
 * On desktop:
 *  - Always returns "list" view
 *  - selectedId is still available for split-pane usage
 */
export function useMobileStackNavigation(
    options?: UseMobileStackNavigationOptions
): UseMobileStackNavigationReturn {
    const { paramName = "id" } = options || {};
    const isMobile = useIsMobile();
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentView, setCurrentView] = useState<MobileStackView>("list");

    // Get selected ID from URL
    const selectedId = searchParams.get(paramName);

    // Sync view with URL on mobile
    useEffect(() => {
        if (isMobile) {
            setCurrentView(selectedId ? "detail" : "list");
        } else {
            setCurrentView("list");
        }
    }, [isMobile, selectedId]);

    // Navigate to list
    const goToList = useCallback(() => {
        setCurrentView("list");
        const newParams = new URLSearchParams(searchParams);
        newParams.delete(paramName);
        setSearchParams(newParams, { replace: true });
    }, [searchParams, setSearchParams, paramName]);

    // Navigate to detail
    const goToDetail = useCallback(
        (id: string) => {
            setCurrentView("detail");
            const newParams = new URLSearchParams(searchParams);
            newParams.set(paramName, id);
            setSearchParams(newParams, { replace: false }); // Push to history for back button
        },
        [searchParams, setSearchParams, paramName]
    );

    // Smart back
    const goBack = useCallback(() => {
        if (currentView === "detail") {
            goToList();
        }
    }, [currentView, goToList]);

    // Handle browser back button on mobile
    useEffect(() => {
        if (!isMobile) return;

        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const id = params.get(paramName);
            setCurrentView(id ? "detail" : "list");
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [isMobile, paramName]);

    return {
        currentView,
        isMobile,
        selectedId,
        goToList,
        goToDetail,
        goBack,
    };
}

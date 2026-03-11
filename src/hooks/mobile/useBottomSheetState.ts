import { useState, useCallback } from "react";

interface UseBottomSheetStateReturn {
    /** Whether the sheet is open */
    isOpen: boolean;
    /** Data/content key passed when opening */
    sheetData: any;
    /** Open the sheet with optional data */
    open: (data?: any) => void;
    /** Close the sheet */
    close: () => void;
    /** Toggle the sheet */
    toggle: () => void;
}

/**
 * Minimal hook for managing bottom sheet open/close state.
 * Pairs with MobileSheet component.
 *
 * Usage:
 * ```tsx
 * const sheet = useBottomSheetState();
 *
 * // Open with data
 * sheet.open({ collectionId: "123", action: "void" });
 *
 * // In render
 * <MobileSheet open={sheet.isOpen} onClose={sheet.close}>
 *   <VoidForm data={sheet.sheetData} />
 * </MobileSheet>
 * ```
 */
export function useBottomSheetState(): UseBottomSheetStateReturn {
    const [isOpen, setIsOpen] = useState(false);
    const [sheetData, setSheetData] = useState<any>(null);

    const open = useCallback((data?: any) => {
        setSheetData(data ?? null);
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        // Keep sheetData until next open to prevent flash during exit animation
    }, []);

    const toggle = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    return {
        isOpen,
        sheetData,
        open,
        close,
        toggle,
    };
}

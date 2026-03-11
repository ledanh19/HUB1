/**
 * useContextMode Hook
 * 
 * Derives the current analytics context mode from filter state.
 * 
 * RULES (HARD CONSTRAINTS):
 * - Portfolio Mode: 0 or >1 properties selected → aggregated view
 * - Property Mode: Exactly 1 property selected → property-specific view
 * - NO third mode. Room Type is a drilldown inside Property Mode only (Phase 4).
 * 
 * Decision Table:
 * ┌─────────────────────────┬──────────────┐
 * │ selectedIds.length      │ Context Mode │
 * ├─────────────────────────┼──────────────┤
 * │ 0                       │ portfolio    │
 * │ 1                       │ property     │
 * │ >1                      │ portfolio    │
 * └─────────────────────────┴──────────────┘
 * 
 * Property name is resolved from the filter options hook.
 */

import { useMemo } from 'react';
import type { AnalyticsFilters, ContextMode } from '../types';
import { useAnalyticsFilterOptions } from './useAnalyticsData';

interface ContextModeResult {
    /** Current context mode */
    mode: ContextMode;
    /** Property name when in property mode, null otherwise */
    propertyName: string | null;
    /** Property ID when in property mode, null otherwise */
    propertyId: string | null;
    /** Whether the current mode is property-specific */
    isPropertyMode: boolean;
    /** Whether the current mode is portfolio-level */
    isPortfolioMode: boolean;
}

export function useContextMode(filters: AnalyticsFilters): ContextModeResult {
    // Fetch property options to resolve names
    const { data: propertyOptions } = useAnalyticsFilterOptions('property');

    return useMemo(() => {
        const { selectedIds } = filters;

        // HARD CONSTRAINT: Exactly 1 property = Property Mode
        if (selectedIds.length === 1) {
            const propertyId = selectedIds[0];
            const propertyName = propertyOptions?.find(
                (o) => o.id === propertyId
            )?.name ?? null;

            return {
                mode: 'property' as ContextMode,
                propertyName,
                propertyId,
                isPropertyMode: true,
                isPortfolioMode: false,
            };
        }

        // 0 or >1 properties = Portfolio Mode
        return {
            mode: 'portfolio' as ContextMode,
            propertyName: null,
            propertyId: null,
            isPropertyMode: false,
            isPortfolioMode: true,
        };
    }, [filters.selectedIds, propertyOptions]);
}

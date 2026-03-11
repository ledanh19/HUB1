/**
 * usePrefetchMountLog — DEV-only hook for heavy pages.
 *
 * Logs the status of every critical query on first mount so we can
 * verify that the prefetcher warmed the cache correctly.
 *
 * Usage in a heavy page:
 *   const bookingsQuery = useBookingsPaginated(params);
 *   const filterQuery   = useBookingFilterOptions();
 *   usePrefetchMountLog('BookingsPage', [
 *     { key: ['unified_bookings_paginated', params], query: bookingsQuery },
 *     { key: ['booking_filter_options'],              query: filterQuery },
 *   ]);
 */

import { useEffect, useRef } from 'react';

interface QueryEntry {
    key: unknown[];
    query: {
        status: string;
        isFetching: boolean;
        dataUpdatedAt: number;
        isStale?: boolean;
    };
}

const isDev = import.meta.env.DEV;

export function usePrefetchMountLog(pageName: string, queries: QueryEntry[]) {
    const didLog = useRef(false);
    useEffect(() => {
        if (!isDev || didLog.current) return;
        didLog.current = true;

        const now = Date.now();
        console.group(`[MOUNT] ${pageName}`);
        for (const { key, query } of queries) {
            const age = query.dataUpdatedAt ? now - query.dataUpdatedAt : '∞';
            const icon = query.isFetching ? '🔄' : query.status === 'success' ? '✅' : '⏳';
            console.log(
                `${icon} ${JSON.stringify(key)}`,
                `| status=${query.status}`,
                `| isFetching=${query.isFetching}`,
                `| age=${age}ms`,
            );
        }
        console.groupEnd();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

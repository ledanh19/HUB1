/**
 * Route Prefetchers — Critical data prefetch registry.
 *
 * Each prefetcher warms the React Query cache with the SAME queryKeys
 * used by the page's useQuery() calls. When the page mounts after navigation,
 * it finds warm cache → no loading state, no double-fetch.
 *
 * RULES:
 * 1. queryKey MUST exactly match what the page's useQuery() uses.
 * 2. queryFn MUST be the SAME function the page uses (import it, don't duplicate).
 * 3. staleTime/refetchOnMount come from HEAVY_QUERY_OPTIONS (never ad-hoc).
 * 4. NO no-op prefetchers — every heavy route MUST prefetch real data.
 * 5. Params are built from the `to` URL using the SAME parsing logic as the page.
 */

import { queryClient, queryKeys } from '@/lib/queryClient';
import { supabase, safeFrom } from "@/integrations/supabase";
import { HEAVY_QUERY_OPTIONS, HEAVY_SECONDARY_OPTIONS } from './heavyQueryOptions';
import { fetchBookingsPaginated, type BookingQueryParams } from '@/hooks/useBookings';
import { fetchStaysOperations } from '@/lib/stays/fetchStaysOperations';

export type PrefetchFn = (opts: { signal: AbortSignal; to: string }) => Promise<void>;

const isDev = import.meta.env.DEV;

// ── Internal registry ──
const prefetcherRegistry = new Map<string, PrefetchFn>();

/**
 * Register a data prefetcher for a route.
 */
export function registerRoutePrefetcher(path: string, fn: PrefetchFn) {
    prefetcherRegistry.set(path, fn);
}

/**
 * Get the data prefetcher for a given pathname.
 * Tries exact match first, then prefix match (most specific wins).
 */
export function getRoutePrefetcher(pathname: string): PrefetchFn | null {
    // Exact match
    if (prefetcherRegistry.has(pathname)) return prefetcherRegistry.get(pathname)!;
    // Prefix match
    const match = Array.from(prefetcherRegistry.keys())
        .filter(route => route !== '/' && pathname.startsWith(route))
        .sort((a, b) => b.length - a.length)[0];
    return match ? prefetcherRegistry.get(match)! : null;
}

// ═══════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════

/** Parse URL search params into partial FilterState (same logic as useFilterPersistence) */
function parseUrlSearchParams(urlSearch: string) {
    const params = new URLSearchParams(urlSearch);
    return {
        searchTerm: params.get('q') || '',
        statusFilter: params.get('status') || 'all',
        sourceFilter: params.get('source') || 'all',
        typeFilter: params.get('type') || 'all',
        paymentTypeFilter: params.get('payment') || 'all',
        dateFrom: params.get('from') || '',
        dateTo: params.get('to') || '',
        dateFilterType: (params.get('dateType') || 'check_in') as 'check_in' | 'check_out' | 'booking',
        currentPage: parseInt(params.get('page') || '1', 10) || 1,
        pageSize: params.get('size') === 'all' ? 10000 : parseInt(params.get('size') || '10', 10) || 10,
    };
}

/** Build BookingQueryParams from URL (same logic as BookingsPage useMemo) */
function buildBookingQueryParamsFromUrl(to: string): BookingQueryParams {
    const url = new URL(to, window.location.origin);
    const f = parseUrlSearchParams(url.search);
    return {
        page: f.currentPage,
        pageSize: f.pageSize,
        search: f.searchTerm || undefined,
        status: f.statusFilter !== 'all' ? f.statusFilter : undefined,
        source: f.sourceFilter !== 'all' ? f.sourceFilter : undefined,
        bookingType: f.typeFilter !== 'all' ? f.typeFilter : undefined,
        paymentType: f.paymentTypeFilter !== 'all' ? f.paymentTypeFilter : undefined,
        dateFrom: f.dateFrom || undefined,
        dateTo: f.dateTo || undefined,
        dateFilterType: f.dateFilterType || undefined,
    };
}

/** Today's date key (YYYY-MM-DD) in local timezone */
const getTodayDateKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ═══════════════════════════════════════════════════════════
// Instrumented prefetchQuery wrapper (DEV only)
// ═══════════════════════════════════════════════════════════
async function instrumentedPrefetch(
    label: string,
    opts: Parameters<typeof queryClient.prefetchQuery>[0]
) {
    if (isDev) {
        const t0 = performance.now();
        try {
            await queryClient.prefetchQuery(opts);
            console.log(`  ✅ ${label}: ${Math.round(performance.now() - t0)}ms | key=${JSON.stringify(opts.queryKey)}`);
        } catch (e) {
            console.error(`  ❌ ${label}: ${Math.round(performance.now() - t0)}ms | key=${JSON.stringify(opts.queryKey)}`, e);
            throw e;
        }
    } else {
        await queryClient.prefetchQuery(opts);
    }
}


// ═══════════════════════════════════════════════════════════
// DASHBOARD — KPIs + today's collections
// Page: Dashboard.tsx → dashboard-kpis, dashboard-today-collections
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/', async ({ signal: _signal }) => {
    await Promise.allSettled([
        instrumentedPrefetch('dashboard-kpis', {
            queryKey: queryKeys.dashboard.kpis,
            queryFn: async ({ signal }) => {
                const { count } = await supabase
                    .from('bookings_mirror')
                    .select('*', { count: 'exact', head: true })
                    .abortSignal(signal);
                return { totalBookings: count };
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
        instrumentedPrefetch('dashboard-collections', {
            queryKey: queryKeys.dashboard.todayCollections,
            queryFn: async ({ signal }) => {
                const today = new Date().toISOString().slice(0, 10);
                const { data } = await supabase
                    .from('hotel_collects')
                    .select('amount, payment_method')
                    .gte('collected_at', today)
                    .abortSignal(signal);
                return data || [];
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// BOOKINGS — main paginated query + secondary queries
// Uses shared fetchBookingsPaginated from useBookings.ts
// Params derived from URL (same logic as BookingsPage)
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/bookings', async ({ signal: _signal, to }) => {
    const params = buildBookingQueryParamsFromUrl(to);

    await Promise.allSettled([
        // Main bookings query — shared queryFn from useBookings
        instrumentedPrefetch('bookings-paginated', {
            queryKey: ['unified_bookings_paginated', params],
            queryFn: () => fetchBookingsPaginated(params),
            ...HEAVY_QUERY_OPTIONS,
        }),

        // Filter options — key: ["booking_filter_options"]
        instrumentedPrefetch('booking-filter-options', {
            queryKey: ['booking_filter_options'],
            queryFn: async () => {
                const [sourcesRes, propsRes, roomTypesRes] = await Promise.all([
                    safeFrom('unified_bookings' as any).select('source').limit(2000),
                    safeFrom('unified_bookings' as any).select('pms_property_name').limit(2000),
                    safeFrom('unified_bookings' as any).select('ota_room_type_sold, pms_property_name').limit(2000),
                ]);
                const sources = [...new Set((sourcesRes.data || []).map((r: any) => r.source).filter(Boolean))].sort();
                const propertyNames = [...new Set((propsRes.data || []).map((r: any) => r.pms_property_name).filter(Boolean))].sort();
                const roomTypesByProperty = new Map<string, Set<string>>();
                const allRoomTypes = new Set<string>();
                for (const r of (roomTypesRes.data || []) as any[]) {
                    if ((r as any).ota_room_type_sold) {
                        allRoomTypes.add((r as any).ota_room_type_sold);
                        if ((r as any).pms_property_name) {
                            if (!roomTypesByProperty.has((r as any).pms_property_name)) {
                                roomTypesByProperty.set((r as any).pms_property_name, new Set());
                            }
                            roomTypesByProperty.get((r as any).pms_property_name)!.add((r as any).ota_room_type_sold);
                        }
                    }
                }
                return {
                    sources: sources as string[],
                    propertyNames: propertyNames as string[],
                    allRoomTypes: [...allRoomTypes].sort() as string[],
                    roomTypesByProperty: Object.fromEntries(
                        [...roomTypesByProperty.entries()].map(([k, v]) => [k, [...v].sort()])
                    ) as Record<string, string[]>,
                };
            },
            ...HEAVY_SECONDARY_OPTIONS,
        }),

        // Type counts — key: ["booking_type_counts"]
        instrumentedPrefetch('booking-type-counts', {
            queryKey: ['booking_type_counts'],
            queryFn: async () => {
                const [totalRes, typesRes] = await Promise.all([
                    safeFrom('unified_bookings' as any).select('*', { count: 'exact', head: true }),
                    safeFrom('unified_bookings' as any).select('booking_type').limit(10000),
                ]);
                const total = (totalRes as any).count ?? 0;
                let pms = 0, imported = 0, manual = 0;
                for (const r of (typesRes.data || []) as any[]) {
                    switch ((r as any).booking_type) {
                        case 'PMS': case 'SYNCED': pms++; break;
                        case 'IMPORTED': imported++; break;
                        case 'MANUAL': manual++; break;
                    }
                }
                return { pms, imported, manual, total };
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// STAYS — declaration warning + main stays query
// StaysPage: ["stays_operations", selectedDate] where
//   selectedDate = today by default (no URL param for date)
//   + ["declaration_warning", today]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/stays', async ({ signal: _signal }) => {
    const today = getTodayDateKey();

    await Promise.allSettled([
        // Declaration warning
        instrumentedPrefetch('declaration-warning', {
            queryKey: ['declaration_warning', today],
            queryFn: async ({ signal }) => {
                const { data: staysData } = await supabase
                    .from('stays')
                    .select('unified_booking_id, actual_check_in_at')
                    .not('actual_check_in_at', 'is', null)
                    .abortSignal(signal);
                if (!staysData?.length) return { count: 0 };
                const todayCheckIns = staysData.filter(s =>
                    s.actual_check_in_at && s.actual_check_in_at.slice(0, 10) === today
                );
                return { count: todayCheckIns.length };
            },
            ...HEAVY_QUERY_OPTIONS,
        }),

        // stays_operations — uses shared fetchStaysOperations for identical data shape
        instrumentedPrefetch('stays-operations', {
            queryKey: ['stays_operations', today],
            queryFn: () => fetchStaysOperations(today),
            ...HEAVY_QUERY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// DISPUTES — ["dispute_tracking", filters]
// DisputesPage mounts with filters = { status, category, type } or undefined
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/disputes', async ({ signal: _signal }) => {
    await instrumentedPrefetch('dispute-tracking', {
        queryKey: ['dispute_tracking', undefined],
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('ota_disputes')
                .select('*')
                .order('opened_at', { ascending: false })
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// HOST PAYABLES — ["host-debt-items", hostFilter, settlementFilter]
// + ["hosts-for-filter"]
// Defaults: hostFilter="all", settlementFilter="UNSETTLED"
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/host-payables', async ({ signal: _signal, to }) => {
    // Parse URL ?partner= if present
    const url = new URL(to, window.location.origin);
    const hostFilter = url.searchParams.get('partner') || 'all';

    await Promise.allSettled([
        // Hosts filter options
        instrumentedPrefetch('hosts-for-filter', {
            queryKey: ['hosts-for-filter'],
            queryFn: async ({ signal }) => {
                const { data } = await supabase
                    .from('partners')
                    .select('id, partner_name')
                    .in('partner_type', ['HOST_LANDLORD', 'HOST_OPERATOR'])
                    .eq('status', 'active')
                    .order('partner_name')
                    .abortSignal(signal);
                return data || [];
            },
            ...HEAVY_SECONDARY_OPTIONS,
        }),

        // Main debt items — default filters
        instrumentedPrefetch('host-debt-items', {
            queryKey: ['host-debt-items', hostFilter, 'UNSETTLED'],
            queryFn: async ({ signal }) => {
                let query = (supabase
                    .from('host_supply_segments') as any)
                    .select('*, partners!inner(partner_name)')
                    .eq('settlement_status', 'UNSETTLED')
                    .order('date_from', { ascending: false })
                    .abortSignal(signal);

                if (hostFilter !== 'all') {
                    query = query.eq('partner_id', hostFilter);
                }

                const { data } = await query;
                return data || [];
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// COLLECTIONS — ["collections"] + ["ota_payouts_needing_sync"]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/collections', async ({ signal: _signal }) => {
    await Promise.allSettled([
        instrumentedPrefetch('collections', {
            queryKey: ['collections'],
            queryFn: async ({ signal }) => {
                const { data } = await supabase
                    .from('hotel_collects')
                    .select('*')
                    .order('collected_at', { ascending: false })
                    .limit(1000)
                    .abortSignal(signal);
                return data || [];
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
        instrumentedPrefetch('ota-payouts-needing-sync', {
            queryKey: ['ota_payouts_needing_sync'],
            queryFn: async ({ signal }) => {
                const { data } = await supabase
                    .from('ota_payouts')
                    .select('*')
                    .eq('status', 'RECEIVED')
                    .abortSignal(signal);
                return data || [];
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// OTA PAYOUTS — ["ota_payouts", undefined]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/ota-payouts', async ({ signal: _signal }) => {
    await instrumentedPrefetch('ota-payouts', {
        queryKey: ['ota_payouts', undefined],
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('ota_payouts')
                .select('*')
                .order('payout_date', { ascending: false })
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// HOST DEPOSITS — queryKeys.hostPayables.deposits
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/host-deposits', async ({ signal: _signal }) => {
    await instrumentedPrefetch('host-deposits', {
        queryKey: queryKeys.hostPayables.deposits,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('host_deposits')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// SERVICE ORDERS — queryKeys.serviceOrders.all
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/services/orders', async ({ signal: _signal }) => {
    await instrumentedPrefetch('service-orders', {
        queryKey: queryKeys.serviceOrders.all,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('service_orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// APPROVALS — queryKeys.approvals.pending
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/approvals', async ({ signal: _signal }) => {
    await instrumentedPrefetch('approvals', {
        queryKey: queryKeys.approvals.pending,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('approvals')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// PAYMENT REQUESTS — queryKeys.payments.requests()
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/payments/requests', async ({ signal: _signal }) => {
    await instrumentedPrefetch('payment-requests', {
        queryKey: queryKeys.payments.requests(),
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('payment_requests')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// CASH OUTS — queryKeys.cashOuts.all()
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/payments/cashout', async ({ signal: _signal }) => {
    await instrumentedPrefetch('cash-outs', {
        queryKey: queryKeys.cashOuts.all(),
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('cash_outs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// REPORTS — P&L
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/reports/pnl', async ({ signal: _signal }) => {
    await instrumentedPrefetch('cashflow-entries', {
        queryKey: queryKeys.cashflow.entries,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('cashflow_entries')
                .select('*')
                .order('entry_date', { ascending: false })
                .limit(50)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// REPORTS — Cashflow
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/reports/cashflow', async ({ signal: _signal }) => {
    await instrumentedPrefetch('cashflow-entries', {
        queryKey: queryKeys.cashflow.entries,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('cashflow_entries')
                .select('*')
                .order('entry_date', { ascending: false })
                .limit(50)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// REPORTS — Collections
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/reports/collections', async ({ signal: _signal }) => {
    await instrumentedPrefetch('report-collections', {
        queryKey: queryKeys.collections.all,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('hotel_collects')
                .select('*')
                .order('collected_at', { ascending: false })
                .limit(100)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS — overview
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/analytics', async ({ signal: _signal }) => {
    await instrumentedPrefetch('analytics-bookings', {
        queryKey: queryKeys.bookings.all,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('bookings_mirror')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// OTA MESSAGES — conversations
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/ota-messages', async ({ signal: _signal }) => {
    await instrumentedPrefetch('conversations', {
        queryKey: queryKeys.conversations.all,
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('conversations')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(100)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// PARTNERS — ["partners", false]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/partners', async ({ signal: _signal }) => {
    await instrumentedPrefetch('partners', {
        queryKey: ['partners', false],
        queryFn: async ({ signal }) => {
            const { data, error } = await supabase
                .from('partners')
                .select('id, partner_name, partner_type, phone, email, status, partner_status, region, priority_level, archived_at, blacklisted_at, created_at')
                .or('partner_status.is.null,partner_status.in.(ACTIVE,INACTIVE)')
                .order('created_at', { ascending: false })
                .limit(100)
                .abortSignal(signal);
            if (error) {
                // Fallback if partner_status column doesn't exist
                const { data: fb } = await supabase
                    .from('partners')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .abortSignal(signal);
                return fb || [];
            }
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// CUSTOMERS — ["guests-with-stats"]
// CustomersPage uses useEffect but we prefetch the data shape
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/customers', async ({ signal: _signal }) => {
    await instrumentedPrefetch('guests-with-stats', {
        queryKey: ['guests-with-stats'],
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('guests')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// DECLARATIONS — ["declaration_list"]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/declarations', async ({ signal: _signal }) => {
    await instrumentedPrefetch('declaration-list', {
        queryKey: ['declaration_list'],
        queryFn: async ({ signal }) => {
            const { data: staysData } = await supabase
                .from('stays')
                .select('unified_booking_id, actual_check_in_at')
                .not('actual_check_in_at', 'is', null)
                .abortSignal(signal);
            if (!staysData?.length) return [];

            const bookingIds = staysData.map(s => s.unified_booking_id);
            const [bookingsRes, segmentsRes, documentsRes] = await Promise.all([
                supabase
                    .from('bookings_mirror')
                    .select('unified_booking_id, guest_name, guest_phone, check_in_date, check_out_date, nights, pms_property_name, ota_source, ota_booking_code')
                    .in('unified_booking_id', bookingIds),
                supabase
                    .from('host_supply_segments')
                    .select('unified_booking_id, partner_id, host_property_name, host_room_type, room_code, date_from, partners(partner_name)')
                    .in('unified_booking_id', bookingIds),
                supabase
                    .from('guest_documents')
                    .select('id, unified_booking_id, document_type, document_image, sent_to_host_status, uploaded_at')
                    .in('unified_booking_id', bookingIds),
            ]);

            const staysMap = new Map(staysData.map(s => [s.unified_booking_id, s]));
            const segmentsMap = new Map<string, any>();
            segmentsRes.data?.forEach(seg => {
                const partnersData = seg.partners;
                const partnerInfo = Array.isArray(partnersData) ? partnersData[0] : partnersData;
                if (!segmentsMap.has(seg.unified_booking_id)) {
                    segmentsMap.set(seg.unified_booking_id, {
                        partner_id: seg.partner_id,
                        partner_name: partnerInfo?.partner_name || null,
                        host_property_name: seg.host_property_name,
                        host_room_type: seg.host_room_type || null,
                        room_code: seg.room_code || null,
                        date_from: seg.date_from || null,
                    });
                }
            });

            const documentsMap = new Map<string, any[]>();
            documentsRes.data?.forEach(doc => {
                const existing = documentsMap.get(doc.unified_booking_id) || [];
                existing.push(doc);
                documentsMap.set(doc.unified_booking_id, existing);
            });

            return bookingsRes.data?.map(booking => {
                const stay = staysMap.get(booking.unified_booking_id);
                const segment = segmentsMap.get(booking.unified_booking_id);
                const docs = documentsMap.get(booking.unified_booking_id) || [];
                const hasImages = docs.some((d: any) => d.document_image);
                const allSent = docs.length > 0 && docs.every((d: any) => d.sent_to_host_status === 'SENT');
                return {
                    unified_booking_id: booking.unified_booking_id,
                    guest_name: booking.guest_name,
                    guest_phone: booking.guest_phone,
                    check_in_date: booking.check_in_date,
                    check_out_date: booking.check_out_date,
                    nights: booking.nights,
                    pms_property_name: booking.pms_property_name,
                    actual_check_in_at: stay?.actual_check_in_at || null,
                    partner_id: segment?.partner_id || null,
                    partner_name: segment?.partner_name || null,
                    host_property_name: segment?.host_property_name || null,
                    document_count: docs.filter((d: any) => d.document_image).length,
                    sent_to_host_status: hasImages ? (allSent ? 'SENT' : 'NOT_SENT') : 'NO_DOCUMENT',
                    documents: docs,
                    segment_check_in_date: segment?.date_from || null,
                    host_room_type: segment?.host_room_type || null,
                    room_code: segment?.room_code || null,
                    ota_source: booking.ota_source || null,
                    ota_booking_code: booking.ota_booking_code || null,
                };
            }).filter(Boolean) || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// HOST PAYABLES AGING — ["host-settlement-aging"] + hosts filter
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/host-payables/aging', async ({ signal: _signal }) => {
    await Promise.allSettled([
        instrumentedPrefetch('host-settlement-aging', {
            queryKey: ['host-settlement-aging'],
            queryFn: async ({ signal }) => {
                const query = supabase
                    .from('host_supply_segments' as any)
                    .select('*, partners!inner(partner_name)')
                    .eq('settlement_status', 'UNSETTLED')
                    .order('date_from', { ascending: false });
                const { data } = await (query as any).abortSignal(signal);
                return data || [];
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
        instrumentedPrefetch('hosts-for-aging-filter', {
            queryKey: ['hosts-for-filter'],
            queryFn: async ({ signal }) => {
                const { data } = await supabase
                    .from('partners')
                    .select('id, partner_name')
                    .in('partner_type', ['HOST_LANDLORD', 'HOST_OPERATOR'])
                    .eq('status', 'active')
                    .order('partner_name')
                    .abortSignal(signal);
                return data || [];
            },
            ...HEAVY_SECONDARY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// HOST SETTLEMENT — ["host-settlement", filters]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/host-payables/settlement', async ({ signal: _signal }) => {
    await instrumentedPrefetch('host-settlement', {
        queryKey: ['host-settlement', undefined],
        queryFn: async ({ signal }) => {
            const { data } = await (supabase
                .from('host_supply_segments')
                .select('*, partners!inner(partner_name)')
                .order('date_from', { ascending: false })
                .limit(200) as any)
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// SETTINGS — ["system-config"] + ["users-with-roles"]
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/settings', async ({ signal: _signal }) => {
    await Promise.allSettled([
        instrumentedPrefetch('system-config', {
            queryKey: ['system-config'],
            queryFn: async ({ signal }) => {
                const { data } = await (supabase
                    .from('app_config' as any)
                    .select('*') as any)
                    .abortSignal(signal);
                return data || [];
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
        instrumentedPrefetch('users-with-roles', {
            queryKey: ['users-with-roles'],
            queryFn: async ({ signal }) => {
                const [profilesRes, rolesRes] = await Promise.all([
                    safeFrom('profiles').select('id, email, full_name, created_at').abortSignal(signal),
                    safeFrom('user_roles').select('user_id, role').abortSignal(signal),
                ]);
                return (profilesRes.data || []).map((p: any) => {
                    const userRoles = (rolesRes.data as any[])?.filter((r: any) => r.user_id === p.id) || [];
                    return { ...p, role: userRoles[0]?.role || 'user' };
                });
            },
            ...HEAVY_QUERY_OPTIONS,
        }),
    ]);
});

// ═══════════════════════════════════════════════════════════
// INVENTORY — channex user + properties (lightweight initial prefetch)
// Full inventory data depends on selected property, so we prefetch
// the first step (channex user identity) to speed up cascade.
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/inventory', async ({ signal: _signal }) => {
    await instrumentedPrefetch('channex-current-user', {
        queryKey: ['channex-current-user'],
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('channex_users')
                .select('*')
                .limit(1)
                .maybeSingle();
            return data;
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// OTA OPERATIONS — Projects
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/ota-operations/projects', async ({ signal: _signal }) => {
    await instrumentedPrefetch('ota-projects', {
        queryKey: ['ota-projects'],
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('ota_projects')
                .select('*')
                .order('created_at', { ascending: false })
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// OTA OPERATIONS — My Tasks
// ═══════════════════════════════════════════════════════════
registerRoutePrefetcher('/ota-operations/my-tasks', async ({ signal: _signal }) => {
    await instrumentedPrefetch('ota-my-tasks', {
        queryKey: ['ota-my-tasks'],
        queryFn: async ({ signal }) => {
            const { data } = await supabase
                .from('ota_tasks')
                .select('*')
                .order('created_at', { ascending: false })
                .abortSignal(signal);
            return data || [];
        },
        ...HEAVY_QUERY_OPTIONS,
    });
});

// ═══════════════════════════════════════════════════════════
// PATH ALIASES — sidebar uses different paths than old registrations
// These re-use the prefetcher from the original path.
// ═══════════════════════════════════════════════════════════

// Sidebar uses /stays/declarations, prefetcher registered at /declarations
registerRoutePrefetcher('/stays/declarations', async (opts) => {
    const fn = getRoutePrefetcher('/declarations');
    if (fn) await fn(opts);
});

// Sidebar uses /channel-manager/inventory, prefetcher registered at /inventory
registerRoutePrefetcher('/channel-manager/inventory', async (opts) => {
    const fn = getRoutePrefetcher('/inventory');
    if (fn) await fn(opts);
});

// /settings/permissions uses same page as /settings
registerRoutePrefetcher('/settings/permissions', async (opts) => {
    const fn = getRoutePrefetcher('/settings');
    if (fn) await fn(opts);
});

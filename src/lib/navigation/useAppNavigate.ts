/**
 * useAppNavigate — Central navigation hook for the entire app.
 *
 * Replaces direct useNavigate() usage everywhere.
 * ALL routes go through navigateHoldAndPrefetch() which:
 *   - Routes with preloader/prefetcher → hold + loading bar + prefetch + swap
 *   - Routes without either → navigate immediately (same as before)
 *
 * Usage:
 *   const { appNavigate, navigate } = useAppNavigate();
 *   appNavigate('/bookings');     // has prefetcher → hold + prefetch + swap
 *   appNavigate('/customers');    // has preloader → hold + chunk load + swap
 *   navigate(-1);                 // back button (raw navigate)
 */

import { useNavigate } from 'react-router-dom';
import { useRouteTransition } from '@/contexts/RouteTransitionContext';
import { navigateHoldAndPrefetch } from './navigateHoldAndPrefetch';

export function useAppNavigate() {
    const navigate = useNavigate();
    const { actions } = useRouteTransition();

    /**
     * Smart navigate: all routes go through the prefetch pipeline.
     * navigateHoldAndPrefetch handles fallback for routes without handlers.
     */
    const appNavigate = (to: string) => {
        navigateHoldAndPrefetch({ to, navigate, actions });
    };

    return { appNavigate, navigate };
}

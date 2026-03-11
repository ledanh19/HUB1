/**
 * AppLink — Drop-in replacement for react-router-dom's <Link>.
 *
 * ALL routes are intercepted and routed through navigateHoldAndPrefetch()
 * for hold+prefetch+swap behavior. Routes without registered preloaders/
 * prefetchers will navigate immediately (handled inside navigateHoldAndPrefetch).
 *
 * Usage:
 *   <AppLink to="/bookings">Go to Bookings</AppLink>
 *   // Same API as <Link>, just import AppLink instead
 */

import { forwardRef, type MouseEvent } from 'react';
import { Link, type LinkProps, useNavigate } from 'react-router-dom';
import { useRouteTransition } from '@/contexts/RouteTransitionContext';
import { navigateHoldAndPrefetch } from '@/lib/navigation/navigateHoldAndPrefetch';

export const AppLink = forwardRef<HTMLAnchorElement, LinkProps>(
    function AppLink({ to, onClick, ...rest }, ref) {
        const navigate = useNavigate();
        const { actions } = useRouteTransition();

        const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
            // Call original onClick if provided
            onClick?.(e);
            if (e.defaultPrevented) return;

            const target = typeof to === 'string' ? to : to.pathname || '';

            // All routes go through prefix pipeline
            // (navigateHoldAndPrefetch falls back to instant navigate if no handlers)
            e.preventDefault();
            navigateHoldAndPrefetch({ to: target, navigate, actions });
        };

        return <Link ref={ref} to={to} onClick={handleClick} {...rest} />;
    }
);

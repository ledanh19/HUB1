import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUserPagePermissions, ALL_PAGES } from '@/hooks/useUserPagePermissions';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Priority order for redirect - most common landing pages first
const REDIRECT_PRIORITY = [
  '/',           // Dashboard
  '/stays',      // Bảng điều khiển vận hành
  '/bookings',   // Booking Center
  '/partners',   // Đối tác
  '/collections', // Thu tiền
  '/ota-payouts', // OTA Payout
];

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, userRole, loading } = useAuth();
  const { hasPageAccess, permissions, loading: permissionsLoading } = useCurrentUserPagePermissions();
  const location = useLocation();

  // IMPORTANT: Wait for BOTH auth loading AND userRole to be resolved
  // userRole is fetched via separate RPC call and may not be ready when loading=false
  const isRoleLoading = loading || (user && userRole === null);

  if (isRoleLoading || permissionsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Super admin and admin always have full access
  if (userRole === 'super_admin' || userRole === 'admin') {
    return <>{children}</>;
  }

  const currentPath = location.pathname;

  // Normalize path for checking (handle detail pages like /bookings/:id)
  const normalizedPath = getNormalizedPath(currentPath);

  if (!hasPageAccess(normalizedPath)) {
    // If user doesn't have access to current page, redirect to first accessible page
    // Try priority pages first, then fall back to any permitted page
    const firstAccessiblePage = 
      REDIRECT_PRIORITY.find(p => hasPageAccess(p)) ||
      permissions.find(p => ALL_PAGES.some(ap => ap.path === p));
    
    if (firstAccessiblePage && firstAccessiblePage !== currentPath) {
      return <Navigate to={firstAccessiblePage} replace />;
    }
    
    // No accessible page found - show 403
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}

// Helper to normalize paths for permission checking
function getNormalizedPath(path: string): string {
  // Path aliases - map redirect routes to their permission paths
  const PATH_ALIASES: Record<string, string> = {
    '/dashboard': '/',  // /dashboard maps to root permission path
    '/partners/hosts': '/partners',
    '/services/orders': '/services',
    '/deposits-prepaids': '/payments/requests',
    '/host-payables/deposits-prepaids': '/payments/requests',
    '/integrations/channex': '/channel-manager/channex',
    '/integrations/inventory': '/channel-manager/inventory',
  };
  
  // Detail route patterns - these routes have :id/:orderId params
  const DETAIL_ROUTES: Array<{ prefix: string; segments: number }> = [
    { prefix: '/bookings', segments: 2 },           // /bookings/:id
    { prefix: '/services/orders', segments: 3 },    // /services/orders/:orderId
    { prefix: '/ota-payouts', segments: 2 },        // /ota-payouts/:id
    { prefix: '/disputes', segments: 2 },           // /disputes/:id
    { prefix: '/host-payables', segments: 2 },      // /host-payables/:id (but NOT /host-payables/aging)
    { prefix: '/ota-operations/projects', segments: 3 }, // /ota-operations/projects/:projectId
    { prefix: '/ota-operations/tasks', segments: 3 },    // /ota-operations/tasks/:taskId
  ];
  
  // Registered pages that should NOT be normalized (from ALL_PAGES)
  const REGISTERED_PATHS = new Set([
    '/', '/partners', '/stays', '/bookings', '/customers', '/settings/properties',
    '/stays/declarations', '/services', '/services/reports', '/ota-messages',
    '/ota-payouts', '/disputes', '/host-deposits', '/host-payables',
    '/host-payables/aging', '/host-payables/settlement', '/services/payables',
    '/settlements/history', '/payments/requests', '/collections', '/payments/cashout',
    '/settings/cash-transfers', '/settings/cash-accounts', '/settings/mapping-rules',
    '/settings/ledger-entries', '/settings/accounting-periods',
    '/reports/pnl', '/reports/cashflow', '/reports/no-show',
    '/channel-manager/channex', '/channel-manager/channex-embed', '/channel-manager/inventory',
    '/ai-pricing/insights', '/ai-pricing/recommendations', '/ai-pricing/validation',
    '/ota-operations/my-tasks', '/ota-operations/projects', '/ota-operations/tasks', '/ota-operations/kpi',
    '/approvals', '/audit-logs',
    '/settings/permissions', '/settings',
  ]);
  
  // Step 1: Remove query string and hash fragment
  let normalized = path.split('?')[0].split('#')[0];
  
  // Step 2: Remove trailing slash (except for root)
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  
  // Step 3: Apply alias mapping FIRST (redirect route → permission path)
  if (PATH_ALIASES[normalized]) {
    return PATH_ALIASES[normalized];
  }
  
  // Step 4: If path is a REGISTERED page, return as-is (no normalization)
  if (REGISTERED_PATHS.has(normalized)) {
    return normalized;
  }
  
  // Step 5: Check if this is a detail route and normalize to parent
  const pathParts = normalized.split('/').filter(Boolean);
  
  for (const route of DETAIL_ROUTES) {
    const routeParts = route.prefix.split('/').filter(Boolean);
    
    if (pathParts.length === route.segments) {
      const prefixMatches = routeParts.every((part, idx) => pathParts[idx] === part);
      
      if (prefixMatches) {
        // This is a detail route - return the parent path
        const parentPath = '/' + routeParts.join('/');
        return PATH_ALIASES[parentPath] ?? parentPath;
      }
    }
  }
  
  return normalized || '/';
}

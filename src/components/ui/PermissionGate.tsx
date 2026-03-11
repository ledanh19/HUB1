import { ReactNode } from 'react';
import { useCurrentUserPagePermissions } from '@/hooks/useUserPagePermissions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PermissionGateProps {
  /**
   * The page path to check permission for (e.g., '/payments/requests')
   */
  page: string;
  
  /**
   * What permission level is required
   * - 'can_view': User must have view access (default)
   * - 'can_use': User must have action/mutation access
   */
  require?: 'can_view' | 'can_use';
  
  /**
   * What to do when permission is denied
   * - 'hide': Don't render children at all
   * - 'disable': Render children but disabled with tooltip
   */
  fallback?: 'hide' | 'disable';
  
  /**
   * Custom message to show in tooltip when disabled
   */
  disabledMessage?: string;
  
  /**
   * Children to render (usually a button or action component)
   */
  children: ReactNode;
  
  /**
   * Additional class name for the wrapper
   */
  className?: string;
}

/**
 * PermissionGate - Wrap sensitive UI elements to control access
 * 
 * Usage:
 * ```tsx
 * <PermissionGate page="/payments/requests" require="can_use" fallback="disable">
 *   <Button onClick={handleApprove}>Phê duyệt</Button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  page,
  require = 'can_view',
  fallback = 'hide',
  disabledMessage = 'Bạn không có quyền thực hiện thao tác này',
  children,
  className,
}: PermissionGateProps) {
  const { hasPageAccess, canUsePage, loading } = useCurrentUserPagePermissions();
  
  // While loading, show nothing to prevent flash
  if (loading) {
    return null;
  }
  
  // Check permission based on requirement
  const hasPermission = require === 'can_use' 
    ? canUsePage(page) 
    : hasPageAccess(page);
  
  // If user has permission, render children normally
  if (hasPermission) {
    return <>{children}</>;
  }
  
  // Permission denied - handle based on fallback mode
  if (fallback === 'hide') {
    return null;
  }
  
  // Disable mode - wrap children in disabled state with tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className={cn(
            "inline-flex cursor-not-allowed",
            className
          )}
        >
          <div className="pointer-events-none opacity-50">
            {children}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{disabledMessage}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Hook version for programmatic checks
 * Useful when you need to check permission in code, not JSX
 */
export function usePermissionCheck(page: string) {
  const { hasPageAccess, canUsePage, loading } = useCurrentUserPagePermissions();
  
  return {
    loading,
    canView: hasPageAccess(page),
    canUse: canUsePage(page),
  };
}

/**
 * Higher-order component for class components or complex scenarios
 */
export function withPermissionGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  page: string,
  require: 'can_view' | 'can_use' = 'can_use',
  fallback: 'hide' | 'disable' = 'disable'
) {
  return function PermissionGatedComponent(props: P) {
    return (
      <PermissionGate page={page} require={require} fallback={fallback}>
        <WrappedComponent {...props} />
      </PermissionGate>
    );
  };
}

export default PermissionGate;

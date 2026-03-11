import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface OtaRoleGateProps {
  /**
   * Required role(s) - user must have at least one of these
   */
  requireRole: 'ota_staff' | 'ota_lead' | 'admin' | 'super_admin' | ('ota_staff' | 'ota_lead' | 'admin' | 'super_admin')[];
  
  /**
   * What to do when permission is denied
   * - 'hide': Don't render children at all (default)
   * - 'disable': Render children but disabled with tooltip
   */
  fallback?: 'hide' | 'disable';
  
  /**
   * Custom message to show in tooltip when disabled
   */
  disabledMessage?: string;
  
  /**
   * Children to render
   */
  children: ReactNode;
  
  /**
   * Additional class name for the wrapper
   */
  className?: string;
}

/**
 * OtaRoleGate - Control access based on OTA roles
 * 
 * Usage:
 * ```tsx
 * <OtaRoleGate requireRole="ota_lead">
 *   <Button onClick={handleApprove}>Phê duyệt</Button>
 * </OtaRoleGate>
 * ```
 */
export function OtaRoleGate({
  requireRole,
  fallback = 'hide',
  disabledMessage = 'Bạn không có quyền thực hiện thao tác này',
  children,
  className,
}: OtaRoleGateProps) {
  const { user } = useAuth();
  
  const { data: roles, isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      return (data || []).map((r) => r.role);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // While loading, show nothing to prevent flash
  if (isLoading) {
    return null;
  }
  
  // Check if user has required role
  const requiredRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
  const hasPermission = requiredRoles.some((r) => roles?.includes(r));
  
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
 */
export function useOtaRoleCheck() {
  const { user } = useAuth();
  
  const { data: roles, isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      return (data || []).map((r) => r.role);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  
  const hasRole = (role: string | string[]) => {
    const requiredRoles = Array.isArray(role) ? role : [role];
    return requiredRoles.some((r) => roles?.includes(r as any));
  };
  
  return {
    loading: isLoading,
    roles: roles || [],
    hasRole,
    isOtaStaff: hasRole(['ota_staff', 'ota_lead', 'admin']),
    isOtaLead: hasRole(['ota_lead', 'admin']),
    isAdmin: hasRole(['admin']),
  };
}

export default OtaRoleGate;

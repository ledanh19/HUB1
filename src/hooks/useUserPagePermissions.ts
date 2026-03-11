import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, safeRpc } from "@/integrations/supabase";
import { useAuth } from './useAuth';
import { createAuditLog } from './useAuditLog';

// Permission structure returned from DB
export interface PagePermission {
  page_path: string;
  can_use: boolean;
}

// All available pages in the system - MUST match sidebar navigation exactly
export const ALL_PAGES = [
  // Dashboard (standalone - top level)
  { path: '/', label: 'Dashboard', category: 'Dashboard' },
  
  // Đối tác (standalone - outside any group in sidebar)
  { path: '/partners', label: 'Đối tác', category: 'Đối tác' },
  
  // Vận hành lưu trú (match sidebar group)
  { path: '/stays', label: 'Bảng Điều Khiển', category: 'Vận hành lưu trú' },
  { path: '/bookings', label: 'Booking Center', category: 'Vận hành lưu trú' },
  { path: '/customers', label: 'Khách hàng', category: 'Vận hành lưu trú' },
  { path: '/settings/properties', label: 'Danh mục Chỗ nghỉ', category: 'Vận hành lưu trú' },
  { path: '/stays/declarations', label: 'Khai báo lưu trú', category: 'Vận hành lưu trú' },
  
  // Dịch vụ (match sidebar group)
  { path: '/services', label: 'Đơn dịch vụ', category: 'Dịch vụ' },
  { path: '/services/reports', label: 'Báo cáo dịch vụ', category: 'Dịch vụ' },
  
  // Tin nhắn OTA (standalone in sidebar)
  { path: '/ota-messages', label: 'Tin nhắn OTA', category: 'Tin nhắn OTA' },
  
  // OTA & Đối soát (match sidebar group)
  { path: '/ota-payouts', label: 'OTA Payout', category: 'OTA & Đối soát' },
  { path: '/disputes', label: 'Tranh chấp OTA', category: 'OTA & Đối soát' },
  
  // Công nợ (match sidebar group)
  { path: '/host-deposits', label: 'Đặt cọc & Trả trước', category: 'Công nợ' },
  { path: '/host-payables', label: 'Host - Danh sách', category: 'Công nợ' },
  { path: '/host-payables/aging', label: 'Host - Báo cáo tuổi nợ', category: 'Công nợ' },
  { path: '/host-payables/settlement', label: 'Host - Quyết toán', category: 'Công nợ' },
  { path: '/services/payables', label: 'Dịch vụ - Quyết toán', category: 'Công nợ' },
  
  // Tài chính & Dòng tiền (match sidebar group)
  { path: '/settlements/history', label: 'Lịch sử quyết toán', category: 'Tài chính & Dòng tiền' },
  { path: '/payments/requests', label: 'Đề xuất thanh toán', category: 'Tài chính & Dòng tiền' },
  { path: '/collections', label: 'Thu tiền', category: 'Tài chính & Dòng tiền' },
  { path: '/payments/cashout', label: 'Chi tiền', category: 'Tài chính & Dòng tiền' },
  { path: '/settings/cash-transfers', label: 'Chuyển khoản nội bộ', category: 'Tài chính & Dòng tiền' },
  { path: '/settings/cash-accounts', label: 'Tài khoản tiền', category: 'Tài chính & Dòng tiền' },
  { path: '/settings/mapping-rules', label: 'Quy tắc mapping', category: 'Tài chính & Dòng tiền' },
  { path: '/settings/ledger-entries', label: 'Sổ cái', category: 'Tài chính & Dòng tiền' },
  { path: '/settings/ledger-debug', label: '🔧 Debug Sổ cái', category: 'Tài chính & Dòng tiền' },
  { path: '/settings/accounting-periods', label: 'Kỳ kế toán', category: 'Tài chính & Dòng tiền' },
  
  // Báo cáo (match sidebar group)
  { path: '/reports/pnl', label: 'P&L', category: 'Báo cáo' },
  { path: '/reports/cashflow', label: 'Cashflow', category: 'Báo cáo' },
  { path: '/reports/no-show', label: 'No-Show', category: 'Báo cáo' },
  
  // Channel Manager (match sidebar group)
  { path: '/channel-manager/channex', label: 'Channex Integration', category: 'Channel Manager' },
  { path: '/channel-manager/channex-embed', label: 'Channex', category: 'Channel Manager' },
  { path: '/channel-manager/inventory', label: 'Inventory', category: 'Channel Manager' },
  
  // AI Smart Pricing (match sidebar group)
  { path: '/ai-pricing/insights', label: 'Insights', category: 'AI Smart Pricing' },
  { path: '/ai-pricing/recommendations', label: 'Recommendations', category: 'AI Smart Pricing' },
  { path: '/ai-pricing/validation', label: 'Validation', category: 'AI Smart Pricing' },
  
  // Analytics (hub-and-spoke analytics module)
  { path: '/analytics/overview', label: 'Tổng quan', category: 'Analytics' },
  { path: '/analytics/revenue', label: 'Doanh thu', category: 'Analytics' },
  { path: '/analytics/host-cost', label: 'Chi phí Host', category: 'Analytics' },
  { path: '/analytics/price-spread', label: 'Chênh lệch giá', category: 'Analytics' },
  
  // OTA Operations (task management for OTA team)
  { path: '/ota-operations/my-tasks', label: 'My Tasks', category: 'OTA Operations' },
  { path: '/ota-operations/projects', label: 'Projects', category: 'OTA Operations' },
  { path: '/ota-operations/tasks', label: 'All Tasks', category: 'OTA Operations' },
  { path: '/ota-operations/kpi', label: 'KPI', category: 'OTA Operations' },
  
  // Kiểm soát & Hệ thống (match sidebar group)
  { path: '/approvals', label: 'Phê duyệt', category: 'Kiểm soát & Hệ thống' },
  { path: '/audit-logs', label: 'Audit Logs', category: 'Kiểm soát & Hệ thống' },
  { path: '/test-lab', label: 'Test Lab', category: 'Kiểm soát & Hệ thống' },
  { path: '/test-center-live', label: 'Test Center Live', category: 'Kiểm soát & Hệ thống' },
  
  // Cài đặt (separate group in sidebar)
  { path: '/settings/permissions', label: 'Phân quyền người dùng', category: 'Cài đặt' },
  { path: '/settings', label: 'Cấu hình hệ thống', category: 'Cài đặt' },
];

type AppRole = 'admin' | 'sale' | 'cskh' | 'ke_toan' | 'super_admin' | string | null | undefined;

// Legacy/alias paths that may exist in DB but should behave as canonical routes
const PATH_ALIASES: Record<string, string> = {
  // Dashboard alias - /dashboard maps to / (root)
  '/dashboard': '/',
  
  // Legacy deposits-prepaids screen was replaced by payment requests flow
  '/deposits-prepaids': '/payments/requests',
  '/host-payables/deposits-prepaids': '/payments/requests',

  // Optional legacy integrations paths
  '/integrations/channex': '/channel-manager/channex',
  '/integrations/inventory': '/channel-manager/inventory',
  
  // Redirect paths - map actual route to permission path
  // When user visits /partners/hosts, check permission for /partners
  '/partners/hosts': '/partners',
  '/services/orders': '/services',
};

// Detail route patterns - these routes have :id/:orderId params
// Pattern: [routePrefix, numberOfSegments]
const DETAIL_ROUTES: Array<{ prefix: string; segments: number }> = [
  { prefix: '/bookings', segments: 2 },           // /bookings/:id
  { prefix: '/services/orders', segments: 3 },    // /services/orders/:orderId
  { prefix: '/ota-payouts', segments: 2 },        // /ota-payouts/:id
  { prefix: '/disputes', segments: 2 },           // /disputes/:id
  { prefix: '/host-payables', segments: 2 },      // /host-payables/:id (but NOT /host-payables/aging, /host-payables/settlement)
  { prefix: '/ota-operations/projects', segments: 3 }, // /ota-operations/projects/:projectId
  { prefix: '/ota-operations/tasks', segments: 3 },    // /ota-operations/tasks/:taskId
];

// Pre-compute registered paths set for fast lookup
const REGISTERED_PATHS = new Set(ALL_PAGES.map(p => p.path));

function normalizePathForPermission(path: string): string {
  // Step 1: Remove query string and hash fragment (e.g., ?tab=1, #section)
  let normalized = path.split('?')[0].split('#')[0];
  
  // Step 2: Remove trailing slash (except for root "/")
  normalized = normalized.replace(/\/$/, '') || '/';

  // Step 3: Apply alias mapping (legacy -> canonical)
  normalized = PATH_ALIASES[normalized] ?? normalized;
  
  // Step 4: If path is a REGISTERED page, return as-is (no normalization)
  // This prevents /host-payables/aging from being normalized to /host-payables
  if (REGISTERED_PATHS.has(normalized)) {
    return normalized;
  }

  // Step 5: Check if this is a detail route and normalize to parent
  const pathParts = normalized.split('/').filter(Boolean);
  
  for (const route of DETAIL_ROUTES) {
    const routeParts = route.prefix.split('/').filter(Boolean);
    
    // Check if path matches the detail route pattern
    if (pathParts.length === route.segments) {
      const prefixMatches = routeParts.every((part, idx) => pathParts[idx] === part);
      
      if (prefixMatches) {
        // This is a detail route - return the parent path
        const parentPath = '/' + routeParts.join('/');
        return PATH_ALIASES[parentPath] ?? parentPath;
      }
    }
  }

  return PATH_ALIASES[normalized] ?? normalized;
}

function matchesAnyPermission(path: string, perms: string[]) {
  const normalizedPath = normalizePathForPermission(path);

  // Get all registered page paths for strict checking
  const registeredPaths = new Set(ALL_PAGES.map(p => p.path));

  return perms.some((p) => {
    const normalizedPerm = normalizePathForPermission(p);

    // Exact match after normalization (includes detail routes normalized to parent)
    if (normalizedPath === normalizedPerm) return true;

    // IMPORTANT: If the target path is a REGISTERED page, require exact match
    // This prevents /services permission from granting access to /services/payables
    if (registeredPaths.has(normalizedPath)) {
      return false; // Must be exact match only
    }

    return false;
  });
}

export function getDefaultPagesForRole(role: AppRole): string[] {
  // NOTE: Default presets keep current behavior sensible, but admins can override
  // by explicitly setting page permissions for a user.
  switch (role) {
    case 'super_admin':
      return ALL_PAGES.map((p) => p.path);
    case 'admin':
      // Full access except Test Lab/Test Center Live
      return ALL_PAGES.filter((p) => 
        p.path !== '/test-lab' && p.path !== '/test-center-live'
      ).map((p) => p.path);
    case 'ke_toan':
      return [
        '/',
        '/bookings',
        '/collections',
        '/ota-payouts',
        '/disputes',
        '/host-deposits',
        '/host-payables',
        '/host-payables/aging',
        '/host-payables/settlement',
        '/services/payables',
        '/settlements/history',
        '/payments/requests',
        '/payments/cashout',
        '/settings/cash-transfers',
        '/settings/cash-accounts',
        '/settings/mapping-rules',
        '/settings/ledger-entries',
        '/reports/pnl',
        '/reports/cashflow',
        '/audit-logs',
        // Analytics module - financial visibility
        '/analytics/overview',
        '/analytics/revenue',
        '/analytics/host-cost',
        '/analytics/price-spread',
      ];
    case 'cskh':
      return [
        '/', 
        '/stays',
        '/stays/declarations',
        '/bookings', 
        '/customers',
        '/partners',
        '/ota-messages',
        '/services', 
        '/services/reports',
        '/collections', 
        '/disputes'
      ];
    case 'sale':
    default:
      return [
        '/', 
        '/stays',
        '/stays/declarations', 
        '/bookings', 
        '/customers',
        '/partners',
        '/ota-messages',
        '/services', 
        '/collections'
      ];
    // OTA Operations roles
    case 'ota_lead':
      return [
        '/',
        '/ota-operations/my-tasks',
        '/ota-operations/projects',
        '/ota-operations/tasks',
        '/ota-operations/kpi',
        '/ota-messages',
      ];
    case 'ota_staff':
      return [
        '/',
        '/ota-operations/my-tasks',
        '/ota-operations/tasks',
        '/ota-messages',
      ];
  }
}

export function useUserPagePermissions(targetUserId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const userId = targetUserId || user?.id;

  // Fetch permissions with can_use flag
  const { data: rawPermissions = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['user-page-permissions', userId],
    queryFn: async (): Promise<PagePermission[]> => {
      if (!userId) return [];

      const { data, error } = await safeRpc(() => supabase.rpc('get_user_page_permissions', {
        _user_id: userId,
      }));

      if (error) {
        console.error('Error fetching page permissions:', error);
        return [];
      }

      // Handle both old format (string[]) and new format ({page_path, can_use}[])
      if (!data || data.length === 0) return [];
      
      // Check if data is in old format (array of strings)
      if (typeof data[0] === 'string') {
        return (data as unknown as string[]).map(path => ({ page_path: path, can_use: true }));
      }
      
      return data as unknown as PagePermission[];
    },
    enabled: !!userId,
    // Permissions are security-critical: always treat as fresh.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Extract page paths for backward compatibility
  const permissions = useMemo(() => 
    rawPermissions.map(p => p.page_path), 
    [rawPermissions]
  );

  // Map for quick can_use lookup
  const canUseMap = useMemo(() => {
    const map = new Map<string, boolean>();
    rawPermissions.forEach(p => map.set(p.page_path, p.can_use));
    return map;
  }, [rawPermissions]);

  const updatePermissionsMutation = useMutation({
    mutationFn: async (newPermissions: Array<{ path: string; can_use: boolean }>) => {
      if (!userId) throw new Error('No user ID');

      // Get old permissions for audit log
      const oldPerms = rawPermissions.map(p => ({ path: p.page_path, can_use: p.can_use }));

      // Delete all existing permissions for this user
      const { error: deleteError } = await supabase
        .from('user_page_permissions')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new permissions
      if (newPermissions.length > 0) {
        const { error: insertError } = await supabase
          .from('user_page_permissions')
          .insert(
            newPermissions.map((perm) => ({
              user_id: userId,
              page_path: perm.path,
              can_use: perm.can_use,
              created_by: user?.id,
            }))
          );

        if (insertError) {
          throw insertError;
        }
      }

      // Create audit log for permission change - don't swallow error
      try {
        await createAuditLog({
          action: 'PERMISSION_UPDATE',
          entity: 'user_page_permissions',
          entityId: userId,
          beforeData: { permissions: oldPerms },
          afterData: { permissions: newPermissions },
        });
      } catch (auditError) {
        console.error('Audit log failed for permission update:', auditError);
        // Re-throw to show warning to user
        throw new Error('Permissions saved but audit log failed. Please notify admin.');
      }

      return newPermissions;
    },
    onSuccess: () => {
      // Invalidate ALL permission queries to ensure sidebar/protected route refresh
      queryClient.invalidateQueries({ queryKey: ['user-page-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-page-permissions'] });
    },
  });

  // Legacy update function for backward compatibility (can_view only)
  const updatePermissions = async (newPermissions: string[]) => {
    try {
      await updatePermissionsMutation.mutateAsync(
        newPermissions.map(path => ({ path, can_use: true }))
      );
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  // New update function with can_use support
  const updatePermissionsWithCanUse = async (newPermissions: Array<{ path: string; can_use: boolean }>) => {
    try {
      await updatePermissionsMutation.mutateAsync(newPermissions);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  // Check if user has VIEW access to a page
  const hasPageAccess = (path: string): boolean => {
    return matchesAnyPermission(path, permissions);
  };

  // Check if user has USE access to a page (can perform actions)
  const canUsePage = (path: string): boolean => {
    const normalizedPath = normalizePathForPermission(path);
    
    // Check exact match (detail routes are already normalized to parent)
    if (canUseMap.has(normalizedPath)) {
      return canUseMap.get(normalizedPath) ?? false;
    }
    
    return false;
  };

  return {
    permissions,
    rawPermissions,
    loading,
    updatePermissions,
    updatePermissionsWithCanUse,
    hasPageAccess,
    canUsePage,
    refetch,
  };
}

// Hook for current user's permissions (used in Sidebar/ProtectedRoute)
export function useCurrentUserPagePermissions() {
  const { user, userRole } = useAuth();

  const { data: rawPermissions = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['current-user-page-permissions', user?.id],
    queryFn: async (): Promise<PagePermission[]> => {
      if (!user?.id) return [];

      const { data, error } = await safeRpc(() => supabase.rpc('get_user_page_permissions', {
        _user_id: user.id,
      }));

      if (error) {
        console.error('Error fetching page permissions:', error);
        return [];
      }

      // Handle both old format (string[]) and new format ({page_path, can_use}[])
      if (!data || data.length === 0) return [];
      
      // Check if data is in old format (array of strings)
      if (typeof data[0] === 'string') {
        return (data as unknown as string[]).map(path => ({ page_path: path, can_use: true }));
      }
      
      return data as unknown as PagePermission[];
    },
    enabled: !!user?.id,
    // Keep sidebar/protected-route in sync immediately after changes / logins.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Extract page paths from raw permissions
  const explicitPermissions = useMemo(() => 
    rawPermissions.map(p => p.page_path), 
    [rawPermissions]
  );

  // Build can_use map from explicit permissions
  const explicitCanUseMap = useMemo(() => {
    const map = new Map<string, boolean>();
    rawPermissions.forEach(p => map.set(p.page_path, p.can_use));
    return map;
  }, [rawPermissions]);

  const effectivePermissions = useMemo(() => {
    // If admin has explicitly configured pages for this account, use them.
    // Otherwise, fall back to role preset.
    if (explicitPermissions.length > 0) return explicitPermissions;
    return getDefaultPagesForRole(userRole);
  }, [explicitPermissions, userRole]);

  // Check if user has VIEW access to a page
  const hasPageAccess = (path: string): boolean => {
    if (userRole === 'super_admin' || userRole === 'admin') return true;
    return matchesAnyPermission(path, effectivePermissions);
  };

  // Check if user has USE access (can perform actions) on a page
  const canUsePage = (path: string): boolean => {
    // Super admin always has full access
    if (userRole === 'super_admin') return true;
    
    // Admin role has full use access by default
    if (userRole === 'admin') return true;
    
    const normalizedPath = normalizePathForPermission(path);
    
    // If using explicit permissions, check can_use flag
    if (explicitPermissions.length > 0) {
      // Check exact match (detail routes are already normalized to parent)
      if (explicitCanUseMap.has(normalizedPath)) {
        return explicitCanUseMap.get(normalizedPath) ?? false;
      }
      
      return false;
    }
    
    // Default role-based: ke_toan has use access, others view-only for finance
    const financePages = [
      '/payments/requests',
      '/payments/cashout', 
      '/host-payables/settlement',
      '/host-deposits',
      '/approvals',
    ];
    
    if (financePages.some(fp => normalizedPath.startsWith(fp))) {
      return userRole === 'ke_toan';
    }
    
    // For non-finance pages, if user has view access, they have use access
    return hasPageAccess(path);
  };

  return {
    // Expose both for UI/debuggability
    permissions: effectivePermissions,
    explicitPermissions,
    rawPermissions,
    loading,
    hasPageAccess,
    canUsePage,
    refetch,
  };
}


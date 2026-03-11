import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";

// ============ TYPES ============

export type InventoryPermission =
  | 'VIEW_INVENTORY'
  | 'EDIT_INVENTORY'
  | 'BULK_UPDATE_INVENTORY'
  | 'MANAGE_MAPPINGS'
  | 'VIEW_SYNC_JOBS'
  | 'RETRY_SYNC'
  | 'MANAGE_RULES'
  | 'VIEW_AUDIT_LOGS'
  | 'CREATE_SNAPSHOT'
  | 'EXPORT_REPORTS';

// Role-based permission mapping
const ROLE_PERMISSIONS: Record<string, InventoryPermission[]> = {
  super_admin: [
    'VIEW_INVENTORY',
    'EDIT_INVENTORY',
    'BULK_UPDATE_INVENTORY',
    'MANAGE_MAPPINGS',
    'VIEW_SYNC_JOBS',
    'RETRY_SYNC',
    'MANAGE_RULES',
    'VIEW_AUDIT_LOGS',
    'CREATE_SNAPSHOT',
    'EXPORT_REPORTS',
  ],
  admin: [
    'VIEW_INVENTORY',
    'EDIT_INVENTORY',
    'BULK_UPDATE_INVENTORY',
    'MANAGE_MAPPINGS',
    'VIEW_SYNC_JOBS',
    'RETRY_SYNC',
    'MANAGE_RULES',
    'VIEW_AUDIT_LOGS',
    'CREATE_SNAPSHOT',
    'EXPORT_REPORTS',
  ],
  ke_toan: [
    'VIEW_INVENTORY',
    'VIEW_SYNC_JOBS',
    'VIEW_AUDIT_LOGS',
    'EXPORT_REPORTS',
  ],
  cskh: [
    'VIEW_INVENTORY',
    'EDIT_INVENTORY', // Limited edit
    'VIEW_SYNC_JOBS',
  ],
  sale: [
    'VIEW_INVENTORY',
    'VIEW_SYNC_JOBS',
  ],
};

// Bulk update thresholds - require higher permissions
export const BULK_UPDATE_THRESHOLDS = {
  CELLS_REQUIRE_CONFIRM: 300,        // > 300 cells requires confirmation
  PRICE_DECREASE_PERCENT: 15,        // > 15% price decrease requires confirmation
  STOP_SELL_DAYS: 7,                 // > 7 days stop sell requires confirmation
};

// ============ HOOK ============

export function useInventoryPermissions() {
  const { userRole } = useAuth();
  
  const permissions = useMemo(() => {
    const rolePerms = ROLE_PERMISSIONS[userRole || ''] || [];
    
    return {
      // Basic view
      canViewInventory: rolePerms.includes('VIEW_INVENTORY'),
      
      // Edit capabilities
      canEditInventory: rolePerms.includes('EDIT_INVENTORY'),
      canBulkUpdate: rolePerms.includes('BULK_UPDATE_INVENTORY'),
      
      // Mappings
      canManageMappings: rolePerms.includes('MANAGE_MAPPINGS'),
      
      // Sync operations
      canViewSyncJobs: rolePerms.includes('VIEW_SYNC_JOBS'),
      canRetrySync: rolePerms.includes('RETRY_SYNC'),
      
      // Rules
      canManageRules: rolePerms.includes('MANAGE_RULES'),
      
      // Audit
      canViewAuditLogs: rolePerms.includes('VIEW_AUDIT_LOGS'),
      
      // Snapshots & Reports
      canCreateSnapshot: rolePerms.includes('CREATE_SNAPSHOT'),
      canExportReports: rolePerms.includes('EXPORT_REPORTS'),
      
      // Helper function
      hasPermission: (permission: InventoryPermission) => rolePerms.includes(permission),
      
      // Bulk update validation
      requiresBulkConfirmation: (
        cellCount: number,
        priceDecreasePercent?: number,
        stopSellDays?: number
      ) => {
        if (cellCount > BULK_UPDATE_THRESHOLDS.CELLS_REQUIRE_CONFIRM) return true;
        if (priceDecreasePercent && priceDecreasePercent > BULK_UPDATE_THRESHOLDS.PRICE_DECREASE_PERCENT) return true;
        if (stopSellDays && stopSellDays > BULK_UPDATE_THRESHOLDS.STOP_SELL_DAYS) return true;
        return false;
      },
      
      // Role info
      userRole,
      isAdmin: userRole === 'super_admin' || userRole === 'admin',
    };
  }, [userRole]);
  
  return permissions;
}

// ============ FREEZE CHECK ============

export function useInventoryFreeze(propertyId?: string) {
  // In a real implementation, this would check a database flag
  // For now, we'll use the system health check from useSyncJobs
  // Import is done at top of file to avoid circular dependency issues
  
  // Simple freeze check - returns false for now since system health 
  // would need to be checked via separate hook to avoid circular deps
  return {
    isFrozen: false,
    reason: null as string | null,
  };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// TYPES
// ============================================================================

export interface PropertyTypeCatalog {
  id: string;
  code: string;
  name_vi: string;
  name_en: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface RoomTypeCatalog {
  id: string;
  code: string;
  name_vi: string;
  name_en: string | null;
  applicable_property_types: string[] | null;
  is_active: boolean;
  sort_order: number;
}

export interface PropertyRoomTypeMapping {
  id: string;
  property_id: string;
  room_type_catalog_id: string;
  display_name_override: string | null;
  is_active: boolean;
  room_type?: RoomTypeCatalog;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch all active property types from catalog
 * @returns Array of property types for dropdown
 */
export function usePropertyTypeCatalog() {
  return useQuery({
    queryKey: ["property-type-catalog"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase
          .from("property_type_catalog" as any)
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }) as any);

        if (error) {
          console.warn("property_type_catalog table not found, using empty array");
          return [] as PropertyTypeCatalog[];
        }
        return (data || []) as PropertyTypeCatalog[];
      } catch (e) {
        console.warn("Error fetching property types:", e);
        return [] as PropertyTypeCatalog[];
      }
    },
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes - catalog rarely changes
    gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
  });
}

/**
 * Hook to fetch all active room types from catalog
 * @param propertyTypeCode - Optional filter by property type code
 * @returns Array of room types for dropdown
 */
export function useRoomTypeCatalog(propertyTypeCode?: string) {
  return useQuery({
    queryKey: ["room-type-catalog", propertyTypeCode],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase
          .from("room_type_catalog" as any)
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }) as any);

        if (error) {
          console.warn("room_type_catalog table not found, using empty array");
          return [] as RoomTypeCatalog[];
        }
        
        let roomTypes = (data || []) as RoomTypeCatalog[];
        
        // Filter by applicable property types if specified
        if (propertyTypeCode) {
          roomTypes = roomTypes.filter(rt => 
            !rt.applicable_property_types || 
            rt.applicable_property_types.length === 0 ||
            rt.applicable_property_types.includes(propertyTypeCode)
          );
        }
        
        return roomTypes;
      } catch (e) {
        console.warn("Error fetching room types:", e);
        return [] as RoomTypeCatalog[];
      }
    },
    staleTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 60,
  });
}

/**
 * Hook to fetch room type mappings for a specific property
 * @param propertyId - The property UUID
 * @returns Array of room type mappings with catalog details
 */
export function usePropertyRoomTypes(propertyId: string | null) {
  return useQuery({
    queryKey: ["property-room-types", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      
      const { data, error } = await (supabase
        .from("property_room_types" as any)
        .select(`
          id,
          property_id,
          room_type_catalog_id,
          display_name_override,
          is_active,
          room_type:room_type_catalog(
            id,
            code,
            name_vi,
            name_en,
            sort_order
          )
        `)
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }) as any);

      if (error) throw error;
      return (data || []) as PropertyRoomTypeMapping[];
    },
    enabled: !!propertyId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Hook to get property type by ID (for display)
 * @param propertyTypeId - The property type catalog UUID
 */
export function usePropertyTypeById(propertyTypeId: string | null) {
  const { data: catalog } = usePropertyTypeCatalog();
  
  if (!propertyTypeId || !catalog) return null;
  return catalog.find(pt => pt.id === propertyTypeId) || null;
}

/**
 * Helper to get display name for a room type mapping
 */
export function getRoomTypeDisplayName(mapping: PropertyRoomTypeMapping): string {
  if (mapping.display_name_override) {
    return mapping.display_name_override;
  }
  if (mapping.room_type) {
    return mapping.room_type.name_vi;
  }
  return "Unknown";
}

// ============================================================================
// PARTNER LIFECYCLE TYPES & HOOKS
// ============================================================================

export type PartnerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'BLACKLISTED';

export interface PartnerReferenceSummary {
  partner_id: string;
  partner_name: string;
  partner_status: PartnerStatus;
  segment_count: number;
  payable_count: number;
  payment_count: number;
  deposit_count: number;
  prepaid_count: number;
  commission_count: number;
  property_count: number;
  room_count: number;
  surcharge_count: number;
  total_references: number;
  can_hard_delete: boolean;
}

export interface ArchiveResult {
  success: boolean;
  partner_id?: string;
  partner_name?: string;
  archived_at?: string;
  impact_summary?: {
    segments: number;
    payables: number;
    payments: number;
    deposits: number;
    commissions: number;
    properties: number;
    rooms: number;
    total: number;
  };
  error?: string;
}

export interface ReactivateResult {
  success: boolean;
  partner_id?: string;
  old_status?: PartnerStatus;
  new_status?: PartnerStatus;
  reactivated_at?: string;
  error?: string;
}

/**
 * Hook to fetch partner reference summary for archive impact preview
 * @param partnerId - The partner UUID
 * @returns Partner reference summary with counts
 */
export function usePartnerReferenceSummary(partnerId: string | null) {
  return useQuery({
    queryKey: ["partner-reference-summary", partnerId],
    queryFn: async () => {
      if (!partnerId) return null;
      
      try {
        const { data, error } = await (supabase
          .from("partner_reference_summary" as any)
          .select("*")
          .eq("partner_id", partnerId)
          .single() as any);

        if (error) {
          // View doesn't exist yet, return mock data
          console.warn("partner_reference_summary view not found, using fallback");
          return {
            partner_id: partnerId,
            partner_name: "Unknown",
            partner_status: "ACTIVE" as PartnerStatus,
            segment_count: 0,
            payable_count: 0,
            payment_count: 0,
            deposit_count: 0,
            prepaid_count: 0,
            commission_count: 0,
            property_count: 0,
            room_count: 0,
            surcharge_count: 0,
            total_references: 0,
            can_hard_delete: true,
          } as PartnerReferenceSummary;
        }
        return data as PartnerReferenceSummary;
      } catch (e) {
        console.warn("Error fetching partner reference summary:", e);
        return null;
      }
    },
    enabled: !!partnerId,
    staleTime: 1000 * 60 * 1, // Cache for 1 minute - reference counts can change
  });
}

/**
 * Hook to fetch all partners with their status (for admin view)
 * @param includeArchived - Whether to include archived partners
 * @returns Array of partners with reference counts
 */
export function usePartnersWithStatus(includeArchived: boolean = false) {
  return useQuery({
    queryKey: ["partners-with-status", includeArchived],
    queryFn: async () => {
      const viewName = includeArchived ? "all_partners_with_status" : "active_partners";
      
      const { data, error } = await (supabase
        .from(viewName as any)
        .select("*")
        .order("partner_name", { ascending: true }) as any);

      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
  });
}

/**
 * Archive a partner using the database function
 * @param partnerId - The partner UUID
 * @param reason - Optional reason for archiving
 * @returns Archive result with impact summary
 */
export async function archivePartner(partnerId: string, reason?: string): Promise<ArchiveResult> {
  try {
    const { data, error } = await (supabase as any)
      .rpc("archive_partner", {
        p_partner_id: partnerId,
        p_reason: reason || null
      });

    if (error) {
      // Function doesn't exist, fallback to direct update
      console.warn("archive_partner RPC not found, using direct update");
      const { error: updateError } = await supabase
        .from("partners")
        .update({ 
          partner_status: "ARCHIVED",
          status: "archived",
          archived_at: new Date().toISOString(),
          archive_reason: reason || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", partnerId);
      
      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true, partner_id: partnerId };
    }
    
    return data as ArchiveResult;
  } catch (e: any) {
    console.error("Error archiving partner:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Reactivate an archived partner
 * @param partnerId - The partner UUID
 * @param newStatus - New status (ACTIVE or INACTIVE)
 * @returns Reactivate result
 */
export async function reactivatePartner(
  partnerId: string, 
  newStatus: PartnerStatus = 'ACTIVE'
): Promise<ReactivateResult> {
  try {
    const { data, error } = await (supabase as any)
      .rpc("reactivate_partner", {
        p_partner_id: partnerId,
        p_new_status: newStatus
      });

    if (error) {
      // Function doesn't exist, fallback to direct update
      console.warn("reactivate_partner RPC not found, using direct update");
      const { error: updateError } = await supabase
        .from("partners")
        .update({ 
          partner_status: newStatus,
          status: "active",
          archived_at: null,
          archive_reason: null,
          blacklisted_at: null,
          blacklist_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", partnerId);
      
      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true, partner_id: partnerId, new_status: newStatus };
    }
    
    return data as ReactivateResult;
  } catch (e: any) {
    console.error("Error reactivating partner:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Blacklist a partner
 * @param partnerId - The partner UUID
 * @param reason - Required reason for blacklisting
 * @returns Blacklist result
 */
export async function blacklistPartner(
  partnerId: string, 
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason || reason.trim() === '') {
    return { success: false, error: 'Blacklist reason is required' };
  }
  
  try {
    const { data, error } = await (supabase as any)
      .rpc("blacklist_partner", {
        p_partner_id: partnerId,
        p_reason: reason
      });

    if (error) {
      // Function doesn't exist, fallback to direct update
      console.warn("blacklist_partner RPC not found, using direct update");
      const { error: updateError } = await supabase
        .from("partners")
        .update({ 
          partner_status: "BLACKLISTED",
          status: "blacklisted",
          blacklisted_at: new Date().toISOString(),
          blacklist_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq("id", partnerId);
      
      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true };
    }
    
    return data;
  } catch (e: any) {
    console.error("Error blacklisting partner:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Check if a partner can be hard deleted
 * @param partnerId - The partner UUID
 * @returns Whether partner can be deleted and blocker info
 */
export async function checkPartnerCanDelete(partnerId: string): Promise<{
  can_delete: boolean;
  blocker_table?: string;
  blocker_count?: number;
}> {
  const { data, error } = await (supabase as any)
    .rpc("check_partner_can_delete", {
      p_partner_id: partnerId
    });

  if (error) {
    console.error("Error checking partner delete status:", error);
    return { can_delete: false, blocker_table: 'unknown', blocker_count: 0 };
  }
  
  return data?.[0] || { can_delete: true };
}

// Partner status display helpers
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Tạm ngưng',
  ARCHIVED: 'Đã lưu trữ',
  BLACKLISTED: 'Danh sách đen'
};

export const PARTNER_STATUS_COLORS: Record<PartnerStatus, string> = {
  ACTIVE: 'bg-success/10 text-success',
  INACTIVE: 'bg-warning/10 text-warning',
  ARCHIVED: 'bg-muted text-muted-foreground',
  BLACKLISTED: 'bg-destructive/10 text-destructive'
};

/**
 * useResponsibleOwner Hook
 * 
 * Implementation for Responsible Owner tracking using:
 * 1. audit_logs as PRIMARY source (database-backed, synced across all users)
 * 2. User profile cache to avoid N+1 queries
 * 
 * NOTE: localStorage is now DEPRECATED - all data comes from database
 * 
 * @see docs/PMS_OPERATIONS_GOVERNANCE.md for specification
 */

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { useAuth } from "./useAuth";
import {
  type ResponsibleOwner,
  type LastHandler,
  type OwnershipInfo,
  type UserProfile,
  type DepartmentType,
  shouldAssignOwner,
  roleToDepartment,
  ASSIGN_OWNER_ACTIONS,
} from "@/lib/responsible-owner-types";

// === USER PROFILE CACHE ===

/**
 * Hook to fetch and cache user profiles with their roles/departments
 * Prevents N+1 queries when displaying owner info in lists
 */
export function useUserProfileCache() {
  return useQuery({
    queryKey: ["user_profiles_cache"],
    queryFn: async () => {
      // Fetch profiles with their roles
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email");

      if (profileError) throw profileError;

      // Fetch user roles to determine department
      const { data: userRoles, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      
      // Create role map for O(1) lookup
      const roleMap = new Map<string, string>();
      if (!roleError && userRoles) {
        userRoles.forEach((ur) => {
          // Keep highest priority role (admin > ke_toan > cskh > sale)
          const existing = roleMap.get(ur.user_id);
          if (!existing || getPriorityRole(ur.role) > getPriorityRole(existing)) {
            roleMap.set(ur.user_id, ur.role);
          }
        });
      }

      // Create map for O(1) lookup
      const profileMap = new Map<string, UserProfile>();
      profiles?.forEach((profile) => {
        const role = roleMap.get(profile.id);
        profileMap.set(profile.id, {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          department: roleToDepartment(role || null),
        });
      });

      return profileMap;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

// Helper to get role priority (higher = more important)
function getPriorityRole(role: string): number {
  switch (role) {
    case "super_admin": return 6;
    case "admin": return 5;
    case "ke_toan": return 4;
    case "cskh": return 3;
    case "sale": return 2;
    case "ota_lead": return 1;
    case "ota_staff": return 0;
    case "foh": return 0;
    default: return -1;
  }
}

/**
 * Get user profile from cache or fetch single
 */
export function useUserProfile(userId: string | null | undefined) {
  const { data: cache } = useUserProfileCache();
  
  return useQuery({
    queryKey: ["user_profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      // Check cache first
      if (cache?.has(userId)) {
        return cache.get(userId) || null;
      }

      // Fetch single profile
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        department: "UNKNOWN" as DepartmentType,
      } as UserProfile;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

// === LAST HANDLER FROM AUDIT LOGS ===

interface AuditLogEntry {
  id: string;
  action: string;
  event_time: string;
  user_id: string | null;
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
}

/**
 * Derive owner from audit_logs - find LATEST user who did a qualifying action
 * This is the primary source of owner data (database-backed)
 * Uses LATEST (not first) because transfer/reassign creates newer records
 * 
 * Includes direct realtime subscription for instant updates across browsers
 */
export function useDerivedOwner(unifiedBookingId: string | null | undefined) {
  const { data: profileCache } = useUserProfileCache();
  const queryClient = useQueryClient();
  
  // Direct realtime subscription for this specific booking
  React.useEffect(() => {
    if (!unifiedBookingId) return;
    
    const channel = supabase
      .channel(`owner-${unifiedBookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: `entity_id=eq.${unifiedBookingId}`,
        },
        (payload) => {
          console.log('[ResponsibleOwner] Realtime event for:', unifiedBookingId, payload);
          // Invalidate query to refetch fresh data
          queryClient.invalidateQueries({ queryKey: ["derived_owner", unifiedBookingId] });
          queryClient.invalidateQueries({ queryKey: ["last_handler", unifiedBookingId] });
        }
      )
      .subscribe((status) => {
        console.log(`[ResponsibleOwner] Subscription status for ${unifiedBookingId}:`, status);
      });
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [unifiedBookingId, queryClient]);
  
  return useQuery({
    queryKey: ["derived_owner", unifiedBookingId],
    queryFn: async (): Promise<ResponsibleOwner | null> => {
      if (!unifiedBookingId) return null;

      try {
        // Include REMOVE_OWNER_ACTION in the query to properly handle unassignment
        const allRelevantActions = [...ASSIGN_OWNER_ACTIONS, "Gỡ người phụ trách"];
        
        // Find LATEST qualifying action for this booking (newest = current owner)
        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, action, event_time, user_id")
          .eq("entity_id", unifiedBookingId)
          .in("action", allRelevantActions)
          .order("event_time", { ascending: false }) // Newest first = current owner
          .limit(1)
          .maybeSingle();

        if (error || !data || !data.user_id) return null;

        // If the latest action is "remove owner", return null (no owner assigned)
        if (data.action === "Gỡ người phụ trách") {
          return null;
        }

        // Get user profile
        const profile = profileCache?.get(data.user_id);
        const userName = profile?.full_name || profile?.email || "Unknown";

        return {
          userId: data.user_id,
          userName,
          department: profile?.department || "UNKNOWN",
          assignedAt: data.event_time,
          assignedBy: "SYSTEM",
          assignmentReason: data.action,
        };
      } catch (err) {
        console.warn("Error deriving owner:", err);
        return null;
      }
    },
    enabled: !!unifiedBookingId,
    staleTime: 10 * 1000, // Short cache - 10 seconds for fresher data
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 15000, // Poll every 15 seconds as fallback when realtime doesn't work
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook to get all unique owners for filter dropdown
 * Fetches user names directly from profiles to avoid cache timing issues
 */
export function useOwnerFilterOptions() {
  return useQuery({
    queryKey: ["owner_filter_options"],
    queryFn: async (): Promise<Array<{ userId: string; userName: string }>> => {
      try {
        // Get distinct user_ids from audit_logs with owner actions
        const { data: auditData, error: auditError } = await supabase
          .from("audit_logs")
          .select("user_id")
          .in("action", ASSIGN_OWNER_ACTIONS as unknown as string[])
          .not("user_id", "is", null);
          
        if (auditError) {
          console.warn("Error fetching owner options:", auditError);
          return [];
        }
        
        // Deduplicate user_ids
        const uniqueUserIds = [...new Set(auditData?.map(r => r.user_id).filter(Boolean) || [])];
        
        if (uniqueUserIds.length === 0) return [];
        
        // Fetch profiles for these users directly
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", uniqueUserIds);
          
        if (profileError) {
          console.warn("Error fetching profiles for filter:", profileError);
          return [];
        }
        
        // Create profile map for O(1) lookup
        const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
        profiles?.forEach(p => profileMap.set(p.id, { full_name: p.full_name, email: p.email }));
        
        // Map to owner info with proper names
        const owners = uniqueUserIds.map(userId => {
          const profile = profileMap.get(userId);
          return {
            userId,
            userName: profile?.full_name || profile?.email || "Unknown"
          };
        });
        
        return owners.sort((a, b) => a.userName.localeCompare(b.userName));
      } catch (err) {
        console.warn("Error in useOwnerFilterOptions:", err);
        return [];
      }
    },
    staleTime: 60 * 1000, // 1 minute cache
    refetchOnMount: true, // Ensure fresh data on page load
  });
}

/**
 * Batch derive owners from audit_logs for multiple bookings
 * Uses LATEST (newest) action per booking as current owner
 * 
 * SCALABLE APPROACH:
 * - Fetches ALL bookings in the list to ensure consistent display
 * - Uses per-booking caching to accumulate results over time
 * - Fetches in batches of 50 to avoid URL too long
 * - Supports databases with thousands of bookings
 */
export function useDerivedOwnersBatch(bookingIds: string[]) {
  const queryClient = useQueryClient();
  
  // Fetch enough bookings for list views (Booking Center can exceed 500 rows).
  // We cap to 2500 for performance and to avoid excessive requests.
  const idsToFetch = React.useMemo(() => bookingIds.slice(0, 2500), [bookingIds]);
  
  const idsKey = React.useMemo(() => {
    if (idsToFetch.length === 0) return "empty";
    const sortedIds = [...idsToFetch].sort();

    // Stable short key to avoid cache collisions in large lists.
    // (Using only first/last IDs can collide and make list view show "Chưa gán".)
    const joined = sortedIds.join(",");
    let hash = 5381;
    for (let i = 0; i < joined.length; i++) {
      hash = ((hash << 5) + hash) + joined.charCodeAt(i); // djb2
      hash = hash >>> 0;
    }

    return `count:${sortedIds.length}|h:${hash.toString(16)}`;
  }, [idsToFetch]);
  
  // Realtime subscription for audit_logs changes affecting any of these bookings
  React.useEffect(() => {
    if (bookingIds.length === 0) return;
    
    // Subscribe to ALL audit_logs changes with owner-related actions
    const channel = supabase
      .channel(`owners-batch-${idsKey.slice(0, 30)}`) // Truncate key for channel name
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
        },
        (payload) => {
          const newRecord = payload.new as { entity_id?: string; action?: string };
          // Check if this is an owner-related action for one of our bookings
          const isOwnerAction = newRecord?.action && 
            (ASSIGN_OWNER_ACTIONS as readonly string[]).includes(newRecord.action);
          
          if (newRecord?.entity_id && isOwnerAction) {
            console.log('[ResponsibleOwner] Batch realtime event for:', newRecord.entity_id, 'action:', newRecord.action);
            
            // Invalidate ALL batch queries
            queryClient.invalidateQueries({ 
              predicate: (query) => query.queryKey[0] === "derived_owners_batch",
              refetchType: 'all',
            });
            // Also invalidate per-booking cache
            queryClient.invalidateQueries({ 
              queryKey: ["derived_owner", newRecord.entity_id],
              refetchType: 'all',
            });
            // Force immediate refetch for active queries
            queryClient.refetchQueries({
              predicate: (query) => query.queryKey[0] === "derived_owners_batch",
              type: 'active',
            });
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [idsKey, bookingIds, queryClient]);
  
  const fetchQuery = useQuery({
    queryKey: ["derived_owners_batch", idsKey],
    queryFn: async (): Promise<Map<string, ResponsibleOwner>> => {
      if (idsToFetch.length === 0) return new Map();

      console.log(`[ResponsibleOwner] Fetching owners for ${idsToFetch.length} bookings...`);
      
      try {
        // Include REMOVE_OWNER_ACTION in the query to properly handle unassignment
        const allRelevantActions = [...ASSIGN_OWNER_ACTIONS, "Gỡ người phụ trách"];
        
        // Split into batches of 50 to avoid URL too long
        const batches: string[][] = [];
        for (let i = 0; i < idsToFetch.length; i += 50) {
          batches.push(idsToFetch.slice(i, i + 50));
        }
        
        // Fetch batches with limited concurrency to avoid hammering the backend
        const allData: any[] = [];
        const concurrency = 8;

        for (let i = 0; i < batches.length; i += concurrency) {
          const chunk = batches.slice(i, i + concurrency);
          const results = await Promise.all(
            chunk.map(async (batchIds) => {
              const { data, error } = await supabase
                .from("audit_logs")
                .select("id, entity_id, action, event_time, user_id")
                .in("entity_id", batchIds)
                .in("action", allRelevantActions)
                .order("event_time", { ascending: false }); // Newest first

              if (!error && data) return data;
              return [];
            })
          );

          results.forEach((rows) => allData.push(...rows));
        }

        if (allData.length === 0) {
          console.log('[ResponsibleOwner] No owner data found in audit_logs');
          return new Map();
        }

        // Sort all results by event_time DESC
        allData.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime());
        
        // Collect unique user_ids to fetch profiles
        const userIds = [...new Set(allData.map(e => e.user_id).filter(Boolean))];
        
        // Fetch profiles directly (avoid cache timing issues)
        let profileMap = new Map<string, { full_name: string | null; email: string | null; department?: string }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);
          
          // Also fetch user_roles for department - handle multiple roles per user
          const { data: userRoles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", userIds);
          
          // Build role map with PRIORITY (user may have multiple roles)
          const roleMap = new Map<string, string>();
          userRoles?.forEach(ur => {
            const existing = roleMap.get(ur.user_id);
            // Keep highest priority role
            if (!existing || getPriorityRole(ur.role) > getPriorityRole(existing)) {
              roleMap.set(ur.user_id, ur.role);
            }
          });
          
          profiles?.forEach(p => {
            const role = roleMap.get(p.id);
            profileMap.set(p.id, { 
              full_name: p.full_name, 
              email: p.email,
              department: roleToDepartment(role || null)
            });
          });
        }

        // Group by entity_id, keep only LATEST (newest) per booking = current owner
        const ownerMap = new Map<string, ResponsibleOwner>();
        
        allData.forEach((entry) => {
          const entityId = entry.entity_id;
          // Only keep first occurrence (which is newest due to desc order)
          if (!ownerMap.has(entityId) && entry.user_id) {
            // If the latest action is "remove owner", skip this booking (no owner assigned)
            if (entry.action === "Gỡ người phụ trách") {
              // Mark as processed but with no owner
              ownerMap.set(entityId, null as any); // Placeholder to prevent re-processing
              // Also clear per-booking cache
              queryClient.setQueryData(["derived_owner", entityId], null);
              return;
            }
            
            const profile = profileMap.get(entry.user_id);
            const userName = profile?.full_name || profile?.email || "Unknown";
            
            const owner: ResponsibleOwner = {
              userId: entry.user_id,
              userName,
              department: (profile?.department as any) || "UNKNOWN",
              assignedAt: entry.event_time,
              assignedBy: "SYSTEM",
              assignmentReason: entry.action,
            };
            
            ownerMap.set(entityId, owner);
            
            // Also cache per-booking for future use
            queryClient.setQueryData(["derived_owner", entityId], owner);
          }
        });

        // Remove null placeholders (unassigned bookings) from the map
        const cleanMap = new Map<string, ResponsibleOwner>();
        ownerMap.forEach((owner, entityId) => {
          if (owner !== null) {
            cleanMap.set(entityId, owner);
          }
        });

        console.log(`[ResponsibleOwner] Batch loaded ${cleanMap.size} owners for ${idsToFetch.length} bookings`);
        return cleanMap;
      } catch (err) {
        console.warn("Error deriving owners batch:", err);
        return new Map();
      }
    },
    enabled: idsToFetch.length > 0,
    staleTime: 10 * 1000, // 10 seconds cache - shorter for fresher data
    gcTime: 60 * 1000, // Keep in cache for 1 minute for navigation
    refetchOnMount: 'always', // ALWAYS refetch on mount to ensure fresh data
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 20000, // Poll every 20 seconds as fallback (faster than before)
    refetchIntervalInBackground: false, // Don't poll when tab is not visible
  });
  
  return fetchQuery;
}

/**
 * Get last handler for a booking from audit_logs
 */
export function useLastHandler(unifiedBookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["last_handler", unifiedBookingId],
    queryFn: async (): Promise<LastHandler | null> => {
      if (!unifiedBookingId) return null;

      try {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, action, event_time, user_id")
          .eq("entity_id", unifiedBookingId)
          .order("event_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !data) return null;

        const entry = data as unknown as AuditLogEntry;
        
        return {
          userId: entry.user_id || "",
          userName: "—",
          action: entry.action,
          timestamp: entry.event_time,
        };
      } catch (err) {
        console.warn("Error fetching last handler:", err);
        return null;
      }
    },
    enabled: !!unifiedBookingId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Batch fetch last handlers for multiple bookings (for list views)
 * Limits to 50 bookings to avoid URL too long errors
 */
export function useLastHandlersBatch(bookingIds: string[]) {
  // Limit to 50 to avoid 400 error from URL too long
  const limitedIds = bookingIds.slice(0, 50);
  
  return useQuery({
    queryKey: ["last_handlers_batch", limitedIds.sort().join(",")],
    queryFn: async (): Promise<Map<string, LastHandler>> => {
      if (limitedIds.length === 0) return new Map();

      try {
        // Get most recent audit log per booking (without profile join to avoid 400 error)
        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, entity_id, action, event_time, user_id")
          .in("entity_id", limitedIds)
          .order("event_time", { ascending: false });

        if (error || !data) return new Map();

        // Group by entity_id, keep only first (most recent)
        const handlerMap = new Map<string, LastHandler>();
        
        (data as unknown as (AuditLogEntry & { entity_id: string })[]).forEach((entry) => {
          if (!handlerMap.has(entry.entity_id)) {
            handlerMap.set(entry.entity_id, {
              userId: entry.user_id || "",
              userName: "—", // Profile info not available in batch query
              action: entry.action,
              timestamp: entry.event_time,
            });
          }
        });

        return handlerMap;
      } catch (err) {
        console.warn("Error fetching last handlers batch:", err);
        return new Map();
      }
    },
    enabled: limitedIds.length > 0,
    staleTime: 30 * 1000,
  });
}

// === DEPRECATED: localStorage cleanup ===
const OWNER_STORAGE_KEY = "roomrise_booking_owners";

/**
 * Clear localStorage owner data - called once to migrate to database-only
 */
function clearLocalStorageOwners(): void {
  try {
    if (localStorage.getItem(OWNER_STORAGE_KEY)) {
      localStorage.removeItem(OWNER_STORAGE_KEY);
      console.log("[ResponsibleOwner] Cleared old localStorage data - now using database only");
    }
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Save owner assignment to database via audit_logs
 * This makes the assignment visible to ALL users across all browsers
 */
async function saveOwnerToDatabase(
  bookingId: string, 
  userId: string, 
  action: string
): Promise<boolean> {
  try {
    console.log("[ResponsibleOwner] Saving to database:", { bookingId, userId, action });
    
    const { error } = await safeMutation(() => supabase.from("audit_logs").insert({
      entity: "booking",
      entity_id: bookingId,
      action: action,
      user_id: userId,
      event_time: new Date().toISOString(),
      after_data: { assigned_by: "MANUAL", source: "responsible_owner_assignment" },
    }));
    
    if (error) {
      console.error("Failed to save owner to database:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Failed to save owner to database:", e);
    return false;
  }
}

// === MAIN HOOK ===

interface UseResponsibleOwnerOptions {
  /** Auto-assign owner on qualifying actions */
  autoAssign?: boolean;
}

/**
 * Main hook to get ownership info for a booking
 * Priority: localStorage override (manual) > audit_logs derived (automatic)
 */
export function useResponsibleOwner(
  unifiedBookingId: string | null | undefined,
  options: UseResponsibleOwnerOptions = {}
) {
  const { autoAssign = false } = options;
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();

  // Get last handler from audit logs
  const { data: lastHandler, isLoading: loadingHandler } = useLastHandler(unifiedBookingId);

  // Get derived owner from audit_logs (database-backed) - PRIMARY SOURCE
  const { data: derivedOwner, isLoading: loadingDerived } = useDerivedOwner(unifiedBookingId);

  // NOTE: localStorage is now DEPRECATED - database is the only source of truth
  // Clear any old localStorage data on first use
  React.useEffect(() => {
    clearLocalStorageOwners();
  }, []);

  // Effective owner: ONLY from database (audit_logs)
  const effectiveOwner = derivedOwner || null;

  /**
   * Assign owner to this booking
   * IMPORTANT: Now saves to DATABASE (audit_logs) so all users can see
   */
  const assignOwner = async (
    action: string,
    customUserId?: string,
    customUserName?: string,
    customDepartment?: DepartmentType
  ): Promise<ResponsibleOwner | null> => {
    if (!unifiedBookingId || !user) return null;

    // For manual assignment, always allow override
    const isManualAssignment = !!customUserId;
    
    // For system assignment, check if already has owner (from any source)
    if (!isManualAssignment) {
      if (effectiveOwner) return effectiveOwner;
      if (!shouldAssignOwner(action)) return null;
    }

    const targetUserId = customUserId || user.id;
    const newOwner: ResponsibleOwner = {
      userId: targetUserId,
      userName: customUserName || user.email || "Unknown",
      department: customDepartment || roleToDepartment(userRole),
      assignedAt: new Date().toISOString(),
      assignedBy: isManualAssignment ? "MANUAL" : "SYSTEM",
      assignmentReason: action,
    };

    // CRITICAL: Save to database so ALL users can see
    const saved = await saveOwnerToDatabase(unifiedBookingId, targetUserId, action);
    if (!saved) {
      console.error("[ResponsibleOwner] Failed to save to database");
    }

    // Optimistic update: Immediately update single query cache
    queryClient.setQueryData(["derived_owner", unifiedBookingId], newOwner);
    
    // Optimistic update: Update ALL batch query caches that contain this booking
    queryClient.setQueriesData<Map<string, ResponsibleOwner>>(
      { predicate: (query) => query.queryKey[0] === "derived_owners_batch" },
      (oldData) => {
        if (!oldData) return oldData;
        const newData = new Map(oldData);
        newData.set(unifiedBookingId, newOwner);
        return newData;
      }
    );

    // Invalidate all owner queries to refetch from database
    queryClient.invalidateQueries({ 
      queryKey: ["derived_owner", unifiedBookingId],
      refetchType: 'all',
    });
    // Invalidate ALL batch queries with any idsKey - force immediate refetch
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === "derived_owners_batch" || 
               key === "last_handlers_batch" ||
               key === "owner_filter_options";
      },
      refetchType: 'all',
    });
    // Force immediate refetch of all batch queries (not just invalidate)
    queryClient.refetchQueries({
      predicate: (query) => query.queryKey[0] === "derived_owners_batch",
      type: 'active',
    });
    // Reset stale queries to ensure fresh data on next mount
    queryClient.resetQueries({
      predicate: (query) => query.queryKey[0] === "derived_owners_batch",
      type: 'inactive',
    });

    return newOwner;
  };

  /**
   * Explicitly transfer ownership (manual action)
   * IMPORTANT: Now saves to DATABASE (audit_logs) so all users can see
   */
  const transferOwner = async (
    newUserId: string,
    newUserName: string,
    newDepartment: DepartmentType
  ): Promise<ResponsibleOwner | null> => {
    if (!unifiedBookingId) return null;

    const newOwner: ResponsibleOwner = {
      userId: newUserId,
      userName: newUserName,
      department: newDepartment,
      assignedAt: new Date().toISOString(),
      assignedBy: "MANUAL",
      assignmentReason: "Chuyển giao trách nhiệm",
    };

    // CRITICAL: Save to database so ALL users can see
    const saved = await saveOwnerToDatabase(unifiedBookingId, newUserId, "Chuyển giao trách nhiệm");
    if (!saved) {
      console.error("[ResponsibleOwner] Failed to save transfer to database");
    }

    // Optimistic update: Immediately update single query cache
    queryClient.setQueryData(["derived_owner", unifiedBookingId], newOwner);
    
    // Optimistic update: Update ALL batch query caches that contain this booking
    queryClient.setQueriesData<Map<string, ResponsibleOwner>>(
      { predicate: (query) => query.queryKey[0] === "derived_owners_batch" },
      (oldData) => {
        if (!oldData) return oldData;
        const newData = new Map(oldData);
        newData.set(unifiedBookingId, newOwner);
        return newData;
      }
    );

    // Invalidate ALL owner queries to trigger re-render across all pages
    queryClient.invalidateQueries({ 
      queryKey: ["derived_owner", unifiedBookingId],
      refetchType: 'all',
    });
    // Invalidate ALL batch queries with any idsKey - force immediate refetch
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === "derived_owners_batch" || 
               key === "last_handlers_batch" ||
               key === "owner_filter_options";
      },
      refetchType: 'all',
    });
    // Force immediate refetch of all batch queries (not just invalidate)
    queryClient.refetchQueries({
      predicate: (query) => query.queryKey[0] === "derived_owners_batch",
      type: 'active',
    });
    // Reset stale queries to ensure fresh data on next mount
    queryClient.resetQueries({
      predicate: (query) => query.queryKey[0] === "derived_owners_batch",
      type: 'inactive',
    });

    return newOwner;
  };

  /**
   * Remove owner assignment (unassign)
   * Creates an audit_log with REMOVE_OWNER_ACTION to mark as unassigned
   * Query logic will skip this when finding latest owner
   */
  const removeOwner = async (): Promise<boolean> => {
    if (!unifiedBookingId || !user) return false;

    try {
      console.log("[ResponsibleOwner] Removing owner for:", unifiedBookingId);
      
      // Insert a "remove" action into audit_logs
      // The derive logic will detect this action and return null for owner
      const { error } = await safeMutation(() => supabase.from("audit_logs").insert({
        entity: "booking",
        entity_id: unifiedBookingId,
        action: "Gỡ người phụ trách", // REMOVE_OWNER_ACTION
        user_id: user.id,
        event_time: new Date().toISOString(),
        after_data: { 
          removed_by: user.id,
          removed_by_name: user.email || "Unknown",
          source: "responsible_owner_removal" 
        },
      }));
      
      if (error) {
        console.error("Failed to remove owner from database:", error);
        return false;
      }

      // Optimistic update: Clear single query cache
      queryClient.setQueryData(["derived_owner", unifiedBookingId], null);
      
      // Optimistic update: Clear from ALL batch query caches
      queryClient.setQueriesData<Map<string, ResponsibleOwner>>(
        { predicate: (query) => query.queryKey[0] === "derived_owners_batch" },
        (oldData) => {
          if (!oldData) return oldData;
          const newData = new Map(oldData);
          newData.delete(unifiedBookingId);
          return newData;
        }
      );

      // Invalidate all owner queries to refetch from database
      queryClient.invalidateQueries({ 
        queryKey: ["derived_owner", unifiedBookingId],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "derived_owners_batch" || 
                 key === "last_handlers_batch" ||
                 key === "owner_filter_options";
        },
        refetchType: 'all',
      });

      return true;
    } catch (e) {
      console.error("Failed to remove owner:", e);
      return false;
    }
  };

  // Build ownership info using effective owner (from database only)
  const ownershipInfo: OwnershipInfo = {
    responsibleOwner: effectiveOwner,
    lastHandler: lastHandler || null,
    isOwnerAssigned: !!effectiveOwner,
  };

  return {
    ...ownershipInfo,
    isLoading: loadingHandler || loadingDerived,
    assignOwner,
    transferOwner,
    removeOwner,
  };
}

/**
 * Hook to get ownership info for multiple bookings (list views)
 * Uses ONLY audit_logs database - no localStorage
 */
export function useResponsibleOwnersBatch(bookingIds: string[]) {
  const { data: lastHandlers } = useLastHandlersBatch(bookingIds);

  // Get derived owners from audit_logs (database-backed) - ONLY SOURCE
  const { data: derivedOwners, isLoading: loadingDerived } = useDerivedOwnersBatch(bookingIds);

  // Build batch ownership info - ONLY from database
  const getOwnershipInfo = React.useCallback((bookingId: string): OwnershipInfo => {
    const effectiveOwner = derivedOwners?.get(bookingId) || null;
    
    // Debug logging for troubleshooting owner display issues
    if (!effectiveOwner && derivedOwners && derivedOwners.size > 0) {
      // Check if there's a similar ID in the map (for debugging)
      const allKeys = Array.from(derivedOwners.keys());
      const similarKey = allKeys.find(k => k.includes(bookingId) || bookingId.includes(k));
      if (similarKey) {
        console.warn(`[ResponsibleOwner] Key mismatch? Looking for "${bookingId}", found similar: "${similarKey}"`);
      }
    }
    
    return {
      responsibleOwner: effectiveOwner,
      lastHandler: lastHandlers?.get(bookingId) || null,
      isOwnerAssigned: !!effectiveOwner,
    };
  }, [derivedOwners, lastHandlers]);

  return {
    getOwnershipInfo,
    lastHandlers: lastHandlers || new Map(),
    storedOwners: derivedOwners || new Map(),
    isLoading: loadingDerived,
  };
}

export default useResponsibleOwner;

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useCallback, useRef } from "react";
import { FEATURE_FLAGS, invalidateForAction, QueryImpactAction } from "@/lib/queryClient";

/**
 * UNIFIED MUTATION WRAPPER
 * 
 * Provides standardized mutation handling with:
 * - Optimistic UI updates
 * - Anti-double-click protection
 * - Conflict detection
 * - Automatic query invalidation
 * - Consistent error handling
 */

export interface MutationWrapperOptions<TData, TVariables> {
  /** Mutation function */
  mutationFn: (variables: TVariables) => Promise<TData>;
  
  /** Action name for impact map lookup */
  action?: QueryImpactAction;
  
  /** Additional query keys to invalidate */
  additionalQueryKeys?: readonly string[][];
  
  /** Success message */
  successMessage?: string;
  
  /** Error message prefix */
  errorMessagePrefix?: string;
  
  /** Disable anti-double-click protection */
  disableDoubleClickProtection?: boolean;
  
  /** Cooldown period in ms (default: 1000) */
  cooldownMs?: number;
  
  /** Callback on success */
  onSuccess?: (data: TData, variables: TVariables) => void;
  
  /** Callback on error */
  onError?: (error: Error, variables: TVariables) => void;
  
  /** Callback when blocked by double-click protection */
  onBlocked?: () => void;
}

/**
 * Main mutation wrapper hook
 * Provides all 4 layers of optimization
 */
export function useMutationWrapper<TData, TVariables>(
  options: MutationWrapperOptions<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const {
    mutationFn,
    action,
    additionalQueryKeys,
    successMessage = "Thao tác thành công",
    errorMessagePrefix = "Lỗi",
    disableDoubleClickProtection = false,
    cooldownMs = 1000,
    onSuccess,
    onError,
    onBlocked,
  } = options;
  
  // Anti-double-click state
  const [isInCooldown, setIsInCooldown] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMutationRef = useRef<number>(0);
  
  // Create the mutation
  const mutation = useMutation({
    mutationFn: async (variables: TVariables) => {
      // Check double-click protection
      if (FEATURE_FLAGS.SAFE_PAY_GUARD && !disableDoubleClickProtection) {
        const now = Date.now();
        if (now - lastMutationRef.current < cooldownMs) {
          if (onBlocked) onBlocked();
          throw new Error("Đang xử lý, vui lòng đợi...");
        }
        lastMutationRef.current = now;
      }
      
      return mutationFn(variables);
    },
    onMutate: async () => {
      // Start cooldown
      if (FEATURE_FLAGS.SAFE_PAY_GUARD && !disableDoubleClickProtection) {
        setIsInCooldown(true);
        cooldownRef.current = setTimeout(() => {
          setIsInCooldown(false);
        }, cooldownMs);
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate queries based on action
      if (action) {
        invalidateForAction(action, additionalQueryKeys);
      } else if (additionalQueryKeys) {
        additionalQueryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      
      toast.success(successMessage);
      
      if (onSuccess) {
        onSuccess(data, variables);
      }
    },
    onError: (error: Error, variables) => {
      // Clear cooldown on error
      if (cooldownRef.current) {
        clearTimeout(cooldownRef.current);
        setIsInCooldown(false);
      }
      
      // Handle specific error types
      const errorMessage = error.message || "Unknown error";
      
      if (errorMessage.includes("Đang xử lý")) {
        toast.warning("Đang xử lý", {
          description: "Vui lòng đợi thao tác trước hoàn tất",
        });
      } else if (errorMessage.includes("conflict") || errorMessage.includes("409")) {
        toast.error("Xung đột dữ liệu", {
          description: "Dữ liệu đã được thay đổi bởi người khác. Đang cập nhật lại...",
        });
        // Refetch on conflict
        if (action) {
          invalidateForAction(action, additionalQueryKeys);
        }
      } else if (errorMessage.includes("status") || errorMessage.includes("trạng thái")) {
        toast.error("Trạng thái đã thay đổi", {
          description: "Dữ liệu đã được cập nhật. Đang tải lại...",
        });
        // Refetch on status change
        if (action) {
          invalidateForAction(action, additionalQueryKeys);
        }
      } else {
        toast.error(`${errorMessagePrefix}: ${errorMessage}`);
      }
      
      if (onError) {
        onError(error, variables);
      }
    },
    onSettled: () => {
      // Ensure cooldown is cleared after cooldownMs
      setTimeout(() => {
        setIsInCooldown(false);
      }, cooldownMs);
    },
  });
  
  // Enhanced mutate function with blocking check
  const safeMutate = useCallback(
    (variables: TVariables) => {
      if (isInCooldown || mutation.isPending) {
        toast.info("Đang xử lý...", {
          description: "Vui lòng đợi thao tác trước hoàn tất",
          duration: 2000,
        });
        return;
      }
      
      mutation.mutate(variables);
    },
    [isInCooldown, mutation]
  );
  
  return {
    ...mutation,
    mutate: safeMutate,
    isBlocked: isInCooldown || mutation.isPending,
    isSyncing: mutation.isPending,
  };
}

/**
 * Hook for status update mutations with conflict detection
 */
export interface StatusUpdateOptions<TData> {
  /** Table name */
  table: string;
  
  /** Action for impact map */
  action?: QueryImpactAction;
  
  /** Additional query keys to invalidate */
  additionalQueryKeys?: readonly string[][];
  
  /** Success message */
  successMessage?: string;
  
  /** Error message prefix */
  errorMessagePrefix?: string;
  
  /** Callback on success */
  onSuccess?: (data: TData) => void;
}

export interface StatusUpdateVariables {
  id: string;
  currentStatus: string;
  newStatus: string;
  additionalUpdates?: Record<string, any>;
}

/**
 * Status update mutation with conflict detection
 */
export function useStatusUpdateMutation<TData = any>(
  options: StatusUpdateOptions<TData>
) {
  const {
    table,
    action,
    additionalQueryKeys,
    successMessage = "Cập nhật thành công",
    errorMessagePrefix = "Lỗi cập nhật",
    onSuccess,
  } = options;
  
  return useMutationWrapper<TData, StatusUpdateVariables>({
    action,
    additionalQueryKeys,
    successMessage,
    errorMessagePrefix,
    cooldownMs: 1200, // Longer cooldown for status changes
    mutationFn: async ({ id, currentStatus, newStatus, additionalUpdates }) => {
      // First, check current status to detect conflicts
      const { data: current, error: fetchError } = await supabase
        .from(table as any)
        .select("status, updated_at")
        .eq("id", id)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      if (!current) throw new Error("Record not found");
      
      const currentRecord = current as any;
      
      // Conflict detection
      if (currentRecord.status !== currentStatus) {
        throw new Error(
          `Trạng thái đã thay đổi từ "${currentStatus}" thành "${currentRecord.status}". Vui lòng tải lại trang.`
        );
      }
      
      // Perform update with status check in WHERE clause (double safety)
      const updateData: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...additionalUpdates,
      };
      
      const { data, error } = await supabase
        .from(table as any)
        .update(updateData)
        .eq("id", id)
        .eq("status", currentStatus)
        .select()
        .single();
      
      if (error) throw error;
      
      return data as TData;
    },
    onSuccess,
  });
}

/**
 * Sync indicator state for UI
 */
export interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
}

export function useSyncIndicator() {
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncedAt: null,
    syncError: null,
  });
  
  const startSync = useCallback(() => {
    setSyncState((prev) => ({ ...prev, isSyncing: true, syncError: null }));
  }, []);
  
  const endSync = useCallback((error?: string) => {
    setSyncState({
      isSyncing: false,
      lastSyncedAt: new Date(),
      syncError: error || null,
    });
  }, []);
  
  return {
    ...syncState,
    startSync,
    endSync,
  };
}

/**
 * Format last synced time for display
 */
export function formatLastSyncedAt(date: Date | null): string {
  if (!date) return "Chưa đồng bộ";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  
  if (diffSec < 10) return "Vừa xong";
  if (diffSec < 60) return `${diffSec} giây trước`;
  if (diffMin < 60) return `${diffMin} phút trước`;
  
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

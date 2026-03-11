import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { checkOptimisticLock, generateIdempotencyKey } from "./useRealtimeSystem";

/**
 * OPTIMISTIC LOCKING & CONFLICT DETECTION
 * 
 * Ensures multi-user safety:
 * - Checks version/updated_at before update
 * - Returns 409 Conflict if stale
 * - Provides clear error messages
 */

export interface ConflictError {
  type: "CONFLICT";
  message: string;
  modifiedBy?: string;
  modifiedAt?: string;
  currentRecord?: any;
}

export interface OptimisticUpdateOptions<TData, TVariables> {
  /** Table name for optimistic lock check */
  table: string;
  /** Query keys to invalidate on success */
  queryKeys: string[][];
  /** Mutation function */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Get record ID from variables */
  getRecordId: (variables: TVariables) => string;
  /** Get expected updated_at from variables */
  getExpectedUpdatedAt: (variables: TVariables) => string;
  /** Success message */
  successMessage?: string;
  /** Error message prefix */
  errorMessagePrefix?: string;
  /** Callback on conflict */
  onConflict?: (error: ConflictError, variables: TVariables) => void;
}

/**
 * Hook for mutations with optimistic locking
 * Prevents overwrites when data has been modified by others
 */
export function useOptimisticMutation<TData, TVariables>(
  options: OptimisticUpdateOptions<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const {
    table,
    queryKeys,
    mutationFn,
    getRecordId,
    getExpectedUpdatedAt,
    successMessage = "Cập nhật thành công",
    errorMessagePrefix = "Lỗi cập nhật",
    onConflict,
  } = options;

  return useMutation({
    mutationFn: async (variables: TVariables) => {
      // Check optimistic lock before mutation
      const recordId = getRecordId(variables);
      const expectedUpdatedAt = getExpectedUpdatedAt(variables);

      const { isStale, currentRecord } = await checkOptimisticLock(
        table,
        recordId,
        expectedUpdatedAt
      );

      if (isStale) {
        const conflictError: ConflictError = {
          type: "CONFLICT",
          message: "Dữ liệu đã được cập nhật bởi người khác",
          modifiedAt: currentRecord?.updated_at,
          currentRecord,
        };

        if (onConflict) {
          onConflict(conflictError, variables);
        }

        throw conflictError;
      }

      return mutationFn(variables);
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      toast.success(successMessage);
    },
    onError: (error: any) => {
      if (error?.type === "CONFLICT") {
        toast.error("Xung đột dữ liệu", {
          description: error.message,
        });
      } else {
        toast.error(`${errorMessagePrefix}: ${error.message}`);
      }
    },
  });
}

/**
 * Hook for financial mutations (PESSIMISTIC UI)
 * 
 * - NO optimistic updates
 * - Waits for server confirmation
 * - Idempotency key to prevent double-actions
 */
export interface FinancialMutationOptions<TData, TVariables> {
  /** Mutation function */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Query keys to invalidate on success */
  queryKeys: string[][];
  /** Action name for idempotency key */
  action: string;
  /** Get target ID for idempotency key */
  getTargetId: (variables: TVariables) => string;
  /** Success message */
  successMessage?: string;
  /** Error message prefix */
  errorMessagePrefix?: string;
  /** Callback before mutation starts */
  onMutationStart?: () => void;
  /** Callback on success */
  onSuccess?: (data: TData) => void;
}

/**
 * Hook for financial mutations with pessimistic UI
 * UI only updates AFTER server confirms
 */
export function useFinancialMutation<TData, TVariables>(
  options: FinancialMutationOptions<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const {
    mutationFn,
    queryKeys,
    action,
    getTargetId,
    successMessage = "Thao tác thành công",
    errorMessagePrefix = "Lỗi",
    onMutationStart,
    onSuccess,
  } = options;

  return useMutation({
    mutationFn: async (variables: TVariables) => {
      // Get current user for idempotency key
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "anonymous";
      const targetId = getTargetId(variables);

      // Generate idempotency key
      const idempotencyKey = generateIdempotencyKey(userId, action, targetId);
      console.log(`[Financial] Idempotency key: ${idempotencyKey}`);

      // Trigger start callback
      if (onMutationStart) {
        onMutationStart();
      }

      return mutationFn(variables);
    },
    onSuccess: (data) => {
      // Invalidate all related queries AFTER success
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      toast.success(successMessage);

      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error: any) => {
      // Clear error with specific message
      const errorMessage = error?.message || "Unknown error";

      // Check for specific error types
      if (errorMessage.includes("already processed") || errorMessage.includes("duplicate")) {
        toast.error("Thao tác đã được xử lý", {
          description: "Yêu cầu này đã được xử lý trước đó. Vui lòng tải lại trang.",
        });
      } else if (errorMessage.includes("conflict") || errorMessage.includes("409")) {
        toast.error("Xung đột dữ liệu", {
          description: "Dữ liệu đã được xử lý bởi người khác. Vui lòng tải lại trang.",
        });
      } else if (errorMessage.includes("status")) {
        toast.error("Không thể thực hiện", {
          description: "Trạng thái đã thay đổi. Vui lòng tải lại trang.",
        });
      } else {
        toast.error(`${errorMessagePrefix}: ${errorMessage}`);
      }
    },
  });
}

/**
 * Hook for conditional status updates
 * Only updates if current status matches expected status
 */
export async function conditionalStatusUpdate(
  table: string,
  id: string,
  expectedStatus: string,
  newStatus: string,
  additionalUpdates?: Record<string, any>
): Promise<{ success: boolean; error?: string; currentStatus?: string }> {
  // First, check current status
  const { data: current, error: fetchError } = await supabase
    .from(table as any)
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  if (!current) {
    return { success: false, error: "Record not found" };
  }

  const currentRecord = current as any;

  if (currentRecord.status !== expectedStatus) {
    return {
      success: false,
      error: `Status đã thay đổi từ ${expectedStatus} thành ${currentRecord.status}`,
      currentStatus: currentRecord.status,
    };
  }

  // Perform update
  const updateData: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...additionalUpdates,
  };

  const { error: updateError } = await supabase
    .from(table as any)
    .update(updateData)
    .eq("id", id)
    .eq("status", expectedStatus); // Double-check in WHERE clause

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";

/**
 * STATE MACHINE VALIDATION SYSTEM
 * 
 * Ensures:
 * - Clear status states
 * - Valid transitions only
 * - Server-side validation
 * - Audit trail
 */

// Payment Request State Machine
export const PAYMENT_REQUEST_STATES = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export const PAYMENT_REQUEST_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED"],
  REJECTED: [],
  PAID: [],
  CANCELLED: [],
};

// Host Payable State Machine
export const HOST_PAYABLE_STATES = {
  UNPAID: "UNPAID",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
} as const;

export const HOST_PAYABLE_TRANSITIONS: Record<string, string[]> = {
  UNPAID: ["PARTIAL", "PAID"],
  PARTIAL: ["PAID"],
  PAID: [],
};

// Dispute State Machine
export const DISPUTE_STATES = {
  OPEN: "OPEN",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED_WON: "RESOLVED_WON",
  RESOLVED_LOST: "RESOLVED_LOST",
  CLOSED: "CLOSED",
} as const;

export const DISPUTE_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["UNDER_REVIEW", "CLOSED"],
  UNDER_REVIEW: ["RESOLVED_WON", "RESOLVED_LOST", "OPEN"],
  RESOLVED_WON: ["CLOSED"],
  RESOLVED_LOST: ["CLOSED"],
  CLOSED: [],
};

// Deposit Status State Machine
export const DEPOSIT_STATES = {
  HELD: "HELD",
  APPLIED: "APPLIED",
  REFUNDED: "REFUNDED",
} as const;

export const DEPOSIT_TRANSITIONS: Record<string, string[]> = {
  HELD: ["APPLIED", "REFUNDED"],
  APPLIED: [],
  REFUNDED: [],
};

// Settlement State Machine
export const SETTLEMENT_STATES = {
  DRAFT: "DRAFT",
  FINALIZED: "FINALIZED",
  PAID: "PAID",
} as const;

export const SETTLEMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["FINALIZED"],
  FINALIZED: ["PAID", "DRAFT"],
  PAID: [],
};

/**
 * Validate if a transition is allowed
 */
export function isValidTransition(
  currentStatus: string,
  newStatus: string,
  transitions: Record<string, string[]>
): boolean {
  const allowedTransitions = transitions[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
}

/**
 * Generate correlation ID for tracing operations
 */
export function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Hook for state machine transitions with audit logging
 */
interface UseStateMachineTransitionOptions {
  table: string;
  transitions: Record<string, string[]>;
  queryKeys: string[][];
  entityName: string;
}

export function useStateMachineTransition(options: UseStateMachineTransitionOptions) {
  const queryClient = useQueryClient();
  const { table, transitions, queryKeys, entityName } = options;

  return useMutation({
    mutationFn: async (params: {
      id: string;
      currentStatus: string;
      newStatus: string;
      additionalData?: Record<string, any>;
      reason?: string;
    }) => {
      const { id, currentStatus, newStatus, additionalData, reason } = params;
      const correlationId = generateCorrelationId();

      console.log(`[StateMachine] ${correlationId} | ${table} | ${currentStatus} → ${newStatus}`);

      // Validate transition
      if (!isValidTransition(currentStatus, newStatus, transitions)) {
        throw new Error(
          `Không thể chuyển từ ${currentStatus} sang ${newStatus}. ` +
          `Cho phép: ${transitions[currentStatus]?.join(", ") || "không có"}`
        );
      }

      // Check current status at server
      const { data: current, error: fetchError } = await supabase
        .from(table as any)
        .select("status, updated_at")
        .eq("id", id)
        .single();

      if (fetchError || !current) {
        throw new Error("Không tìm thấy bản ghi");
      }

      const record = current as any;
      
      if (record.status !== currentStatus) {
        throw new Error(
          `Trạng thái đã thay đổi từ ${currentStatus} thành ${record.status}. ` +
          `Vui lòng tải lại trang.`
        );
      }

      // Perform update with WHERE status check
      const updateData: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...additionalData,
      };

      const { data, error } = await supabase
        .from(table as any)
        .update(updateData)
        .eq("id", id)
        .eq("status", currentStatus) // Double-check in WHERE
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // Log audit entry
      const { data: { user } } = await supabase.auth.getUser();
      
      await safeMutation(() => supabase.from("audit_logs").insert({
        entity: entityName,
        entity_id: id,
        action: `STATUS_CHANGE: ${currentStatus} → ${newStatus}`,
        user_id: user?.id,
        before_data: { status: currentStatus },
        after_data: { status: newStatus, reason },
      }));

      return data;
    },
    onSuccess: () => {
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      toast.success("Cập nhật trạng thái thành công");
    },
    onError: (error: any) => {
      toast.error("Lỗi cập nhật trạng thái", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to get allowed transitions for current status
 */
export function useAllowedTransitions(
  currentStatus: string | undefined,
  transitions: Record<string, string[]>
): string[] {
  if (!currentStatus) return [];
  return transitions[currentStatus] || [];
}

/**
 * Status badge config for consistent UI
 */
export const STATUS_BADGE_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
  // Payment Request
  PENDING: { label: "Chờ duyệt", variant: "warning" },
  APPROVED: { label: "Đã duyệt", variant: "success" },
  REJECTED: { label: "Từ chối", variant: "destructive" },
  PAID: { label: "Đã thanh toán", variant: "success" },
  CANCELLED: { label: "Đã hủy", variant: "secondary" },
  
  // Host Payable
  UNPAID: { label: "Chưa thanh toán", variant: "warning" },
  PARTIAL: { label: "Thanh toán một phần", variant: "warning" },
  
  // Dispute
  OPEN: { label: "Mở", variant: "warning" },
  UNDER_REVIEW: { label: "Đang xử lý", variant: "default" },
  RESOLVED_WON: { label: "Đã giải quyết - Thắng", variant: "success" },
  RESOLVED_LOST: { label: "Đã giải quyết - Thua", variant: "destructive" },
  CLOSED: { label: "Đã đóng", variant: "secondary" },
  
  // Deposit
  HELD: { label: "Đang giữ", variant: "warning" },
  APPLIED: { label: "Đã áp dụng", variant: "success" },
  REFUNDED: { label: "Đã hoàn", variant: "secondary" },
  
  // Settlement
  DRAFT: { label: "Nháp", variant: "default" },
  FINALIZED: { label: "Hoàn tất", variant: "success" },
  
  // Booking
  CONFIRMED: { label: "Đã xác nhận", variant: "success" },
  CHECKED_IN: { label: "Đã check-in", variant: "success" },
  CHECKED_OUT: { label: "Đã check-out", variant: "secondary" },
  NO_SHOW: { label: "Không đến", variant: "destructive" },
};

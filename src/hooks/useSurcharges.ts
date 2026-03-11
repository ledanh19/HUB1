import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "./useAuditLog";
import { syncHostPayables } from "./useHostPayableSync";

export interface HostSurcharge {
  id: string;
  unified_booking_id: string;
  host_partner_id: string;
  surcharge_type: "CLEANING" | "EARLY_CHECKIN" | "LATE_CHECKOUT" | "UTILITY" | "OTHER";
  description: string | null;
  amount: number;
  currency: string;
  collector_type: "ROOMRISE" | "HOST";
  status: "PENDING" | "COLLECTED" | "PAID";
  collected_at: string | null;
  collected_by: string | null;
  created_at: string;
  partner?: { partner_name: string } | null;
}

// Fetch host surcharges for a booking
export function useHostSurcharges(unifiedBookingId: string) {
  return useQuery({
    queryKey: ["host_surcharges", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_surcharges")
        .select("*, partner:partners(partner_name)")
        .eq("unified_booking_id", unifiedBookingId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as HostSurcharge[];
    },
    enabled: !!unifiedBookingId,
  });
}

// Add host surcharge
export function useAddHostSurcharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id: string;
      host_partner_id: string;
      surcharge_type: string;
      description?: string;
      amount: number;
      collector_type: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Detect post-settlement: check if any segment for this booking+partner is settled
      let isPostSettlement = false;
      let referenceSettlementId: string | null = null;
      const { data: settledSegments } = await supabase
        .from('host_supply_segments')
        .select('settlement_id')
        .eq('unified_booking_id', data.unified_booking_id)
        .eq('partner_id', data.host_partner_id)
        .not('settlement_id', 'is', null)
        .limit(1);
      if (settledSegments && settledSegments.length > 0) {
        isPostSettlement = true;
        referenceSettlementId = settledSegments[0].settlement_id;
      }

      // Build description with POST_SETTLEMENT tag if applicable
      const descPrefix = isPostSettlement && referenceSettlementId
        ? `[POST_SETTLEMENT::${referenceSettlementId}] `
        : '';
      const finalDesc = `${descPrefix}${data.description || ''}`.trim() || undefined;

      const { error } = await safeMutation(() => supabase.from("host_surcharges").insert({
        ...data,
        description: finalDesc,
        created_by: user?.id,
        // settlement_id is ALWAYS NULL — surcharge flows to next settlement
      }));

      if (error) throw error;

      // Sync host_payables after adding surcharge
      await syncHostPayables(data.unified_booking_id);

      // Audit log - use specific action for post-settlement
      await createAuditLog({
        action: isPostSettlement ? 'POST_SETTLEMENT_SURCHARGE_CREATED' : 'Thêm phụ phí Host',
        entity: 'booking',
        entityId: data.unified_booking_id,
        afterData: {
          ...data,
          ...(isPostSettlement && { reference_settlement_id: referenceSettlementId }),
        },
      });

      return { isPostSettlement };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["host_surcharges", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["surcharge_summary"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["host_payables"] });
      queryClient.invalidateQueries({ queryKey: ["host-payable-detail"] });
      queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success(result?.isPostSettlement ? 'Đã thêm phụ phí Host (sau quyết toán)' : 'Đã thêm phụ phí Host');
    },
    onError: (err: any) => {
      toast.error("Lỗi: " + err.message);
    },
  });
}

// Collect host surcharge
export function useCollectHostSurcharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, unified_booking_id }: { id: string; unified_booking_id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // SETTLEMENT LOCK CHECK — prevent collecting already-settled surcharges
      const { data: surcharge } = await supabase
        .from("host_surcharges")
        .select("settlement_id, locked_at")
        .eq("id", id)
        .maybeSingle();
      if (surcharge?.locked_at || surcharge?.settlement_id) {
        throw new Error('SETTLEMENT_LOCKED: Phụ phí đã được khóa/quyết toán.');
      }

      const { error } = await supabase
        .from("host_surcharges")
        .update({
          status: "COLLECTED",
          collected_at: new Date().toISOString(),
          collected_by: user?.id,
        })
        .eq("id", id);

      if (error) throw error;

      await createAuditLog({
        action: "Thu phụ phí Host",
        entity: "booking",
        entityId: unified_booking_id,
        afterData: { surcharge_id: id, status: "COLLECTED" },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["host_surcharges", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["surcharge_summary"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã thu phụ phí");
    },
    onError: (err: any) => {
      toast.error("Lỗi: " + err.message);
    },
  });
}

// Collect service order payment
export function useCollectServicePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, unified_booking_id }: { id: string; unified_booking_id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("service_orders")
        .update({
          status: "DONE",
          collected_at: new Date().toISOString(),
          collected_by: user?.id,
        })
        .eq("id", id);

      if (error) throw error;

      await createAuditLog({
        action: "Thu tiền dịch vụ",
        entity: "booking",
        entityId: unified_booking_id,
        afterData: { service_order_id: id, status: "DONE" },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["service_orders", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["surcharge_summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã thu tiền dịch vụ");
    },
    onError: (err: any) => {
      toast.error("Lỗi: " + err.message);
    },
  });
}

// Get summary of uncollected surcharges for a booking
export function useSurchargeSummary(unifiedBookingId: string) {
  return useQuery({
    queryKey: ["surcharge_summary", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get host surcharges pending collection by Roomrise
      const { data: hostSurcharges } = await supabase
        .from("host_surcharges")
        .select("amount, collector_type, status")
        .eq("unified_booking_id", unifiedBookingId)
        .eq("collector_type", "ROOMRISE")
        .eq("status", "PENDING");

      // Get service orders pending collection by Roomrise
      const { data: serviceOrders } = await supabase
        .from("service_orders")
        .select("sale_price, collector_type, status")
        .eq("unified_booking_id", unifiedBookingId)
        .eq("collector_type", "ROOMRISE")
        .neq("status", "DONE")
        .neq("status", "CANCELLED");

      const hostPending = hostSurcharges?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
      const servicePending = serviceOrders?.reduce((sum, s) => sum + (s.sale_price || 0), 0) || 0;
      const hostCount = hostSurcharges?.length || 0;
      const serviceCount = serviceOrders?.length || 0;

      return {
        hostPending,
        servicePending,
        totalPending: hostPending + servicePending,
        hostCount,
        serviceCount,
        totalCount: hostCount + serviceCount,
      };
    },
    enabled: !!unifiedBookingId,
  });
}

// Batch fetch surcharge summaries for multiple bookings
export function useBatchSurchargeSummary(unifiedBookingIds: string[]) {
  return useQuery({
    queryKey: ["batch_surcharge_summary", unifiedBookingIds],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (unifiedBookingIds.length === 0) return {};

      // Get host surcharges pending collection by Roomrise
      const { data: hostSurcharges } = await supabase
        .from("host_surcharges")
        .select("unified_booking_id, amount")
        .in("unified_booking_id", unifiedBookingIds)
        .eq("collector_type", "ROOMRISE")
        .eq("status", "PENDING");

      // Get service orders pending collection by Roomrise
      const { data: serviceOrders } = await supabase
        .from("service_orders")
        .select("unified_booking_id, sale_price")
        .in("unified_booking_id", unifiedBookingIds)
        .eq("collector_type", "ROOMRISE")
        .neq("status", "DONE")
        .neq("status", "CANCELLED");

      // Group by booking
      const result: Record<string, { hostPending: number; servicePending: number; total: number; count: number }> = {};

      unifiedBookingIds.forEach((id) => {
        const hostAmount = hostSurcharges?.filter(s => s.unified_booking_id === id).reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
        const serviceAmount = serviceOrders?.filter(s => s.unified_booking_id === id).reduce((sum, s) => sum + (s.sale_price || 0), 0) || 0;
        const hostCount = hostSurcharges?.filter(s => s.unified_booking_id === id).length || 0;
        const serviceCount = serviceOrders?.filter(s => s.unified_booking_id === id).length || 0;

        result[id] = {
          hostPending: hostAmount,
          servicePending: serviceAmount,
          total: hostAmount + serviceAmount,
          count: hostCount + serviceCount,
        };
      });

      return result;
    },
    enabled: unifiedBookingIds.length > 0,
  });
}

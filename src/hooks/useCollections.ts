import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { keepPrevious } from "@/lib/query-helpers";

// =============================================
// ATOMIC COLLECTION CREATION HOOK - PHASE II
// Uses RPC for ledger + cashflow atomicity
// =============================================
export interface CreateCollectionAtomicParams {
  unified_booking_id: string;
  amount: number;
  payment_method: string;
  collection_type: 'COLLECT' | 'REFUND';
  related_type: string;
  payer_type: string;
  payee_type?: string; // ROOMRISE | HOST | SERVICE_PARTNER — defaults to ROOMRISE
  related_id?: string | null;
  note?: string | null;
  service_order_id?: string | null;
  receipt_image?: string | null;
  payment_link_url?: string | null;
  payment_provider?: string | null;
}

export const useCreateCollectionAtomic = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateCollectionAtomicParams) => {
      // Call atomic RPC that handles:
      // 1. Insert hotel_collects
      // 2. Insert ledger_entries (DR Cash, CR Revenue)
      // All in single transaction
      const { data: collectionId, error } = await safeRpc(() => supabase.rpc('create_collection_ledger_atomic', {
        p_unified_booking_id: params.unified_booking_id,
        p_amount: params.amount,
        p_payment_method: params.payment_method,
        p_collection_type: params.collection_type,
        p_related_type: params.related_type,
        p_payer_type: params.payer_type,
        p_related_id: params.related_id || null,
        p_note: params.note || null,
        p_payee_type: params.payee_type || 'ROOMRISE',
      }));

      if (error) {
        // Parse PostgreSQL error messages
        if (error.message.includes('Invalid amount')) {
          throw new Error('Số tiền phải lớn hơn 0');
        }
        throw error;
      }

      // If receipt image or payment link was provided, update the collection with it
      if ((params.receipt_image || params.payment_link_url || params.payment_provider) && collectionId) {
        const updateData: Record<string, any> = {};
        if (params.receipt_image) {
          updateData.receipt_image = params.receipt_image;
          updateData.receipt_status = 'UPLOADED';
        }
        if (params.payment_link_url) {
          updateData.payment_link_url = params.payment_link_url;
        }
        if (params.payment_provider) {
          updateData.payment_provider = params.payment_provider;
        }
        await supabase
          .from('hotel_collects')
          .update(updateData)
          .eq('id', collectionId);
      }

      // Fire-and-forget audit log
      createAuditLog({
        action: AuditActions.PAYMENT_COLLECTED,
        entity: "hotel_collects",
        entityId: collectionId,
        afterData: {
          unified_booking_id: params.unified_booking_id,
          amount: params.amount,
          payment_method: params.payment_method,
          payer_type: params.payer_type,
          related_type: params.related_type,
          receipt_image: params.receipt_image || null,
        },
      }).catch(console.error);

      return collectionId;
    },
    onSuccess: (_, variables) => {
      toast.success("Thành công", { description: "Đã ghi nhận thu tiền" });

      // High priority - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["hotel_collects", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["hotel_collects"] });
        queryClient.invalidateQueries({ queryKey: ["collection-summary", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["collections"] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["booking_payments", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["stays"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
      }, 100);

      // Lower priority - delayed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-month-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow_entries"] });
        queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      }, 500);
    },
    onError: (err: any) => {
      toast.error("Lỗi thu tiền", { description: err.message });
    },
  });
};

export interface HotelCollect {
  id: string;
  unified_booking_id: string;
  amount_collected: number;
  payment_method: string;
  collected_at: string | null;
  collected_by: string | null;
  receipt: string | null;
  status: string | null;
  note: string | null;
  created_at: string;
  payer_type: string;
  payee_type: string;
  related_type: string;
  related_id: string | null;
  collection_type: string;
  related_collection_id: string | null;
  reason_note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  source_payout_id: string | null;
  receipt_image?: string | null;
  receipt_status?: string | null;
  ledger_entry_id?: string | null; // PHASE 3.1: Link to ledger entry
  payment_link_url?: string | null;
  payment_provider?: string | null;
}

// Check if user has permission for refund (admin or ke_toan)
export const useCanRefund = () => {
  return useQuery({
    queryKey: ["can-refund"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data } = await safeRpc(() => supabase.rpc("get_user_role", { _user_id: user.id }));
      return data === "super_admin" || data === "admin" || data === "ke_toan";
    },
  });
};

// Check if user can void (admin, ke_toan, cskh)
export const useCanVoid = () => {
  return useQuery({
    queryKey: ["can-void"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data } = await safeRpc(() => supabase.rpc("get_user_role", { _user_id: user.id }));
      return data === "super_admin" || data === "admin" || data === "ke_toan" || data === "cskh";
    },
  });
};

// Get collections with related collections (refunds/voids)
export const useCollectionWithRelated = (collectionId: string) => {
  return useQuery({
    queryKey: ["collection-with-related", collectionId],
    queryFn: async () => {
      // Get the main collection
      const { data: collection, error } = await supabase
        .from("hotel_collects")
        .select("*")
        .eq("id", collectionId)
        .maybeSingle();

      if (error) throw error;
      if (!collection) return null;

      // Get related collections (refunds/voids for this collection)
      const { data: relatedCollections } = await supabase
        .from("hotel_collects")
        .select("*")
        .eq("related_collection_id", collectionId)
        .order("created_at", { ascending: true });

      return {
        ...collection,
        relatedCollections: relatedCollections || [],
      };
    },
    enabled: !!collectionId,
  });
};

// Calculate net amount for a collection (original - refunds)
export const calculateNetAmount = (
  collection: HotelCollect,
  relatedCollections: HotelCollect[]
): number => {
  if (collection.collection_type !== "COLLECT") {
    return Number(collection.amount_collected);
  }

  const refundTotal = relatedCollections
    .filter((c) => c.collection_type === "REFUND")
    .reduce((sum, c) => sum + Math.abs(Number(c.amount_collected)), 0);

  const isVoided = relatedCollections.some((c) => c.collection_type === "VOID");

  if (isVoided) return 0;

  return Number(collection.amount_collected) - refundTotal;
};

// Check if collection can be refunded
export const canRefundCollection = (
  collection: HotelCollect,
  relatedCollections: HotelCollect[]
): { canRefund: boolean; maxRefundAmount: number; reason?: string } => {
  // Cannot refund if already voided
  if (relatedCollections.some((c) => c.collection_type === "VOID")) {
    return { canRefund: false, maxRefundAmount: 0, reason: "Collection đã bị hủy (VOID)" };
  }

  // Only COLLECT type can be refunded
  if (collection.collection_type !== "COLLECT") {
    return { canRefund: false, maxRefundAmount: 0, reason: "Chỉ có thể hoàn tiền cho collection gốc" };
  }

  const netAmount = calculateNetAmount(collection, relatedCollections);
  if (netAmount <= 0) {
    return { canRefund: false, maxRefundAmount: 0, reason: "Đã hoàn toàn bộ số tiền" };
  }

  return { canRefund: true, maxRefundAmount: netAmount };
};

// Check if collection can be voided
export const canVoidCollection = (
  collection: HotelCollect,
  relatedCollections: HotelCollect[]
): { canVoid: boolean; reason?: string } => {
  // Only COLLECT type can be voided
  if (collection.collection_type !== "COLLECT") {
    return { canVoid: false, reason: "Chỉ có thể hủy collection gốc" };
  }

  // Cannot void if already voided
  if (relatedCollections.some((c) => c.collection_type === "VOID")) {
    return { canVoid: false, reason: "Collection đã bị hủy" };
  }

  // Cannot void if has any refunds
  if (relatedCollections.some((c) => c.collection_type === "REFUND")) {
    return { canVoid: false, reason: "Không thể hủy collection đã có hoàn tiền" };
  }

  return { canVoid: true };
};

// =============================================
// PHASE 3.1: Server-side validation hooks
// Check period lock and reconciliation status
// =============================================
export const useCanVoidServer = (collectionId: string | undefined) => {
  return useQuery({
    queryKey: ["can-void-server", collectionId],
    queryFn: async () => {
      if (!collectionId) return { can_void: false, reason: "No collection ID" };

      const { data, error } = await safeRpc(() => supabase.rpc("can_void_collection", {
        p_collection_id: collectionId,
      }));

      if (error) throw error;
      return data?.[0] || { can_void: false, reason: "Unknown error" };
    },
    enabled: !!collectionId,
    staleTime: 30000, // 30 seconds cache
  });
};

export const useCanRefundServer = (collectionId: string | undefined) => {
  return useQuery({
    queryKey: ["can-refund-server", collectionId],
    queryFn: async () => {
      if (!collectionId) return { can_refund: false, max_refund_amount: 0, reason: "No collection ID" };

      const { data, error } = await safeRpc(() => supabase.rpc("can_refund_collection", {
        p_collection_id: collectionId,
      }));

      if (error) throw error;
      return data?.[0] || { can_refund: false, max_refund_amount: 0, reason: "Unknown error" };
    },
    enabled: !!collectionId,
    staleTime: 30000, // 30 seconds cache
  });
};

// Create refund mutation - PHASE 3.1: Uses atomic RPC with ledger entry
export const useCreateRefund = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalCollectionId,
      unifiedBookingId,
      amount,
      paymentMethod,
      reasonNote,
      relatedType = 'ROOM',
      payerType = 'GUEST',
    }: {
      originalCollectionId: string;
      unifiedBookingId: string;
      amount: number;
      paymentMethod: string;
      reasonNote: string;
      relatedType?: string;
      payerType?: string;
    }) => {
      // *** PHASE 3.1: Use atomic RPC that creates ledger entry ***
      const { data: refundId, error } = await safeRpc(() => supabase.rpc('create_collection_ledger_atomic', {
        p_unified_booking_id: unifiedBookingId,
        p_amount: Math.abs(amount),
        p_payment_method: paymentMethod,
        p_collection_type: 'REFUND',
        p_related_type: relatedType,
        p_payer_type: payerType,
        p_related_id: null,
        p_note: reasonNote,
        p_related_collection_id: originalCollectionId,
        p_reason_note: reasonNote,
      }));

      if (error) {
        // Parse PostgreSQL error messages
        if (error.message.includes('Kỳ kế toán đã khóa')) {
          throw new Error('Kỳ kế toán đã khóa. Không thể hoàn tiền.');
        }
        throw error;
      }

      return { id: refundId };
    },
    // OPTIMISTIC UPDATE
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["collections"] });
      await queryClient.cancelQueries({ queryKey: ["hotel_collects", variables.unifiedBookingId] });

      const previousCollections = queryClient.getQueryData(["collections"]);
      const previousHotelCollects = queryClient.getQueryData(["hotel_collects", variables.unifiedBookingId]);

      return { previousCollections, previousHotelCollects };
    },
    onError: (err: any, variables, context) => {
      // Rollback
      if (context?.previousCollections) {
        queryClient.setQueryData(["collections"], context.previousCollections);
      }
      if (context?.previousHotelCollects) {
        queryClient.setQueryData(["hotel_collects", variables.unifiedBookingId], context.previousHotelCollects);
      }
      toast.error("Lỗi", { description: err.message });
    },
    onSuccess: (_, variables) => {
      toast.success("Thành công", { description: "Đã ghi nhận hoàn tiền" });
      // High priority - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["collections"] });
        queryClient.invalidateQueries({ queryKey: ["hotel_collects", variables.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["collection-summary", variables.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.unifiedBookingId] });
        // PHASE 3.1: Invalidate ledger entries
        queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
        queryClient.invalidateQueries({ queryKey: ["can-refund-server"] });
      }, 100);
      // Low priority - reduced delay (was 1000ms)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["collection-with-related"] });
        queryClient.invalidateQueries({ queryKey: ["hotel-collects"] });
        queryClient.invalidateQueries({ queryKey: ["booking_payments", variables.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-month-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      }, 400);
    },
  });
};

// Create void mutation - PHASE 3.1: Uses atomic RPC with reversal ledger entry
export const useCreateVoid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalCollectionId,
      unifiedBookingId,
      reasonNote,
    }: {
      originalCollectionId: string;
      unifiedBookingId: string;
      reasonNote: string;
    }) => {
      // *** PHASE 3.1: Use atomic RPC that creates reversal ledger entry ***
      const { data: voidRecordId, error } = await safeRpc(() => supabase.rpc('void_collection_atomic', {
        p_collection_id: originalCollectionId,
        p_reason: reasonNote,
      }));

      if (error) {
        // Parse PostgreSQL error messages
        if (error.message.includes('Kỳ kế toán đã khóa')) {
          throw new Error('Kỳ kế toán đã khóa. Không thể hủy thu tiền.');
        }
        if (error.message.includes('already voided')) {
          throw new Error('Thu tiền này đã được hủy trước đó.');
        }
        if (error.message.includes('has refunds')) {
          throw new Error('Không thể hủy thu tiền đã có hoàn tiền. Hãy hoàn số tiền còn lại.');
        }
        if (error.message.includes('reconciled')) {
          throw new Error('Không thể hủy: bút toán đã được đối soát. Hủy đối soát trước.');
        }
        if (error.message.includes('Permission denied')) {
          throw new Error('Bạn không có quyền hủy thu tiền.');
        }
        throw error;
      }

      return { id: voidRecordId };
    },
    // OPTIMISTIC UPDATE
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["collections"] });
      await queryClient.cancelQueries({ queryKey: ["hotel_collects", variables.unifiedBookingId] });

      const previousCollections = queryClient.getQueryData(["collections"]);
      const previousHotelCollects = queryClient.getQueryData(["hotel_collects", variables.unifiedBookingId]);

      return { previousCollections, previousHotelCollects };
    },
    onError: (err: any, variables, context) => {
      // Rollback
      if (context?.previousCollections) {
        queryClient.setQueryData(["collections"], context.previousCollections);
      }
      if (context?.previousHotelCollects) {
        queryClient.setQueryData(["hotel_collects", variables.unifiedBookingId], context.previousHotelCollects);
      }
      toast.error("Lỗi", { description: err.message });
    },
    onSuccess: (_, variables) => {
      toast.success("Thành công", { description: "Đã hủy thu tiền" });
      // High priority - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["collections"] });
        queryClient.invalidateQueries({ queryKey: ["hotel_collects", variables.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["collection-summary", variables.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.unifiedBookingId] });
        // PHASE 3.1: Invalidate ledger entries (reversal was created)
        queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
        queryClient.invalidateQueries({ queryKey: ["can-void-server"] });
      }, 100);
      // Low priority - reduced delay (was 1000ms)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["collection-with-related"] });
        queryClient.invalidateQueries({ queryKey: ["hotel-collects"] });
        queryClient.invalidateQueries({ queryKey: ["booking_payments", variables.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-month-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 400);
    },
  });
};
// Helper to check if a collection is voided
const isVoided = (collectionId: string, allCollections: HotelCollect[]): boolean => {
  return allCollections.some(
    (c) => c.related_collection_id === collectionId && c.collection_type === "VOID"
  );
};

// Get collection summary for a booking - SYNCED with Booking Center
export const useCollectionSummary = (unifiedBookingId: string) => {
  return useQuery({
    queryKey: ["collection-summary", unifiedBookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_collects")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const collections = (data || []) as HotelCollect[];

      // Filter valid collections (COLLECT that are not voided)
      const validCollections = collections.filter(
        (c) => c.collection_type === "COLLECT" && !isVoided(c.id, collections)
      );

      // Calculate totals by bucket (ROOM, EXTRA, SERVICE)
      const roomCollected = validCollections
        .filter((c) => c.related_type === "ROOM")
        .reduce((sum, c) => sum + Number(c.amount_collected), 0);

      const feesCollected = validCollections
        .filter((c) => c.related_type === "EXTRA")
        .reduce((sum, c) => sum + Number(c.amount_collected), 0);

      const servicesCollected = validCollections
        .filter((c) => c.related_type === "SERVICE")
        .reduce((sum, c) => sum + Number(c.amount_collected), 0);

      // Total collected (all buckets)
      const totalCollected = roomCollected + feesCollected + servicesCollected;

      // Total refunded
      const totalRefunded = collections
        .filter((c) => c.collection_type === "REFUND")
        .reduce((sum, c) => sum + Math.abs(Number(c.amount_collected)), 0);

      const netCollected = totalCollected - totalRefunded;

      return {
        collections,
        // By bucket
        roomCollected,
        feesCollected,
        servicesCollected,
        // Totals
        totalCollected,
        totalRefunded,
        netCollected,
      };
    },
    enabled: !!unifiedBookingId,
  });
};

// An Gia Residences group ID - same as useBookings.ts
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

// Get all collections with booking info - for Collections page
// Filtered by An Gia Residences group (same logic as useBookings), includes OTA Payout collections
export const useAllCollections = () => {
  return useQuery({
    queryKey: ["collections"],
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      // Get An Gia group property IDs (same logic as useBookings)
      const { data: propertyLinks } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);

      const groupPropertyIds = propertyLinks?.map(p => p.channex_property_id) || [];

      // Fetch collections with limit to reduce IO
      // Most recent 1000 collections should cover operational needs
      const { data: collects, error } = await supabase
        .from("hotel_collects")
        .select("*")
        .order("collected_at", { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Get all unique booking IDs from collections (except OTA-PAYOUT-xxx)
      const allBookingIds = [...new Set(
        (collects || [])
          .map((c) => c.unified_booking_id)
          .filter((id) => !id.startsWith("OTA-PAYOUT-"))
      )];

      // Fetch booking info from bookings_mirror to get channex_property_id
      // This is the same approach as useBookings for filtering
      let bookingPropertyMap = new Map<string, string | null>();

      if (allBookingIds.length > 0) {
        // Batch query in chunks to avoid API limits
        const chunkSize = 500;
        for (let i = 0; i < allBookingIds.length; i += chunkSize) {
          const chunk = allBookingIds.slice(i, i + chunkSize);
          const { data: mirrorData } = await supabase
            .from("bookings_mirror")
            .select("unified_booking_id, channex_property_id")
            .in("unified_booking_id", chunk);

          mirrorData?.forEach(b => {
            bookingPropertyMap.set(b.unified_booking_id, b.channex_property_id);
          });
        }
      }

      // Filter collections - same logic as useBookings
      // CRITICAL FIX: If no group properties found, return all collections (failsafe)
      const filteredCollects = (collects || []).filter((c) => {
        // Always include OTA Payout collections
        if (c.related_type === "OTA_PAYOUT") return true;

        // Failsafe: if no group properties, include all
        if (groupPropertyIds.length === 0) return true;

        const bookingPropertyId = bookingPropertyMap.get(c.unified_booking_id);

        // Include if booking's channex_property_id is in An Gia group
        if (bookingPropertyId && groupPropertyIds.includes(bookingPropertyId)) return true;

        // Include if booking not found in mirror (manual booking or edge case)
        if (!bookingPropertyMap.has(c.unified_booking_id)) return true;

        // Exclude if has channex_property_id but not in An Gia group
        return false;
      });

      // Fetch booking info for filtered collections
      const bookingIds = [...new Set(
        filteredCollects
          .map((c) => c.unified_booking_id)
          .filter((id) => !id.startsWith("OTA-PAYOUT-"))
      )];

      const { data: bookings } = bookingIds.length > 0
        ? await supabase
          .from("unified_bookings")
          .select("unified_booking_id, guest_name, host_property_name, pms_property_name, payment_type, check_in_date, check_out_date, total_amount_net, source, ota_booking_code")
          .in("unified_booking_id", bookingIds)
        : { data: [] };

      // Get OTA Payout info for OTA_PAYOUT collections via junction table
      const otaCollectionIds = filteredCollects
        .filter((c) => c.related_type === "OTA_PAYOUT")
        .map((c) => c.id);

      const { data: allocations } = otaCollectionIds.length > 0
        ? await supabase
          .from("collection_payout_allocations")
          .select("collection_id, payout_id, allocated_amount")
          .in("collection_id", otaCollectionIds)
        : { data: [] };

      // Build allocation map: collection_id -> allocations[]
      const allocationMap = new Map<string, { payout_id: string; allocated_amount: number }[]>();
      (allocations || []).forEach((a) => {
        const existing = allocationMap.get(a.collection_id) || [];
        existing.push({ payout_id: a.payout_id, allocated_amount: Number(a.allocated_amount) });
        allocationMap.set(a.collection_id, existing);
      });

      // Fetch all payout details
      const allPayoutIds = [...new Set((allocations || []).map((a) => a.payout_id))];

      const { data: payouts } = allPayoutIds.length > 0
        ? await supabase
          .from("ota_payouts")
          .select("id, ota_source, payout_date, total_amount, net_payout_amount")
          .in("id", allPayoutIds)
        : { data: [] };

      const bookingMap = new Map(
        (bookings || []).map((b) => [b.unified_booking_id, b])
      );

      const payoutMap = new Map(
        (payouts || []).map((p) => [p.id, p])
      );

      return filteredCollects.map((c) => {
        if (c.related_type === "OTA_PAYOUT") {
          const collectionAllocations = allocationMap.get(c.id) || [];

          if (collectionAllocations.length > 0) {
            const firstPayout = payoutMap.get(collectionAllocations[0]?.payout_id);
            const otaSource = firstPayout?.ota_source || "OTA";
            const isSingle = collectionAllocations.length === 1;
            return {
              ...c,
              allocations: collectionAllocations.map((a) => ({
                ...a,
                payout: payoutMap.get(a.payout_id) || null,
              })),
              booking: {
                unified_booking_id: c.unified_booking_id,
                guest_name: isSingle
                  ? `OTA Payout - ${otaSource}`
                  : `OTA Payout - ${otaSource} (${collectionAllocations.length} payout)`,
                host_property_name: otaSource,
                pms_property_name: null,
                payment_type: "OTA_COLLECT",
                check_in_date: firstPayout?.payout_date || null,
                check_out_date: firstPayout?.payout_date || null,
                total_amount_net: collectionAllocations.reduce((s, a) => s + a.allocated_amount, 0),
                source: otaSource,
              },
            };
          }
        }
        return {
          ...c,
          booking: bookingMap.get(c.unified_booking_id) || null,
        };
      });
    },
  });
};

// Update collection receipt
export const useUpdateCollectionReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      receipt_image: string | null;
      receipt_status: string;
    }) => {
      const { data, error } = await supabase
        .from("hotel_collects")
        .update({
          receipt_image: params.receipt_image,
          receipt_status: params.receipt_status,
        })
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["hotel_collects"] });
      queryClient.invalidateQueries({ queryKey: ["hotel-collects"] });
      toast.success("Thành công", { description: "Đã cập nhật chứng từ" });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation, safeRpc } from "@/integrations/supabase";
import { normalizeOtaSource } from "@/hooks/useOtaPayouts";
import { toast } from "sonner";
import { createAuditLog } from "@/hooks/useAuditLog";

/**
 * Hook to get OTA payouts available for cash-in (not yet fully received)
 * Uses collection_payout_allocations junction table
 */
export const useOtaPayoutsForCashIn = () => {
  return useQuery({
    queryKey: ["ota_payouts_for_cashin"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: payouts, error } = await supabase
        .from("ota_payouts")
        .select("*")
        .in("status", ["PENDING", "PARTIAL"])
        .order("payout_date", { ascending: false });

      if (error) throw error;

      const payoutIds = (payouts || []).map((p) => p.id);
      if (payoutIds.length === 0) return [];

      // Get allocated amounts from junction table
      const { data: allocations } = await supabase
        .from("collection_payout_allocations")
        .select("payout_id, allocated_amount")
        .in("payout_id", payoutIds);

      // Sum allocated amounts per payout
      const receivedByPayout = new Map<string, number>();
      (allocations || []).forEach((a) => {
        const current = receivedByPayout.get(a.payout_id) || 0;
        receivedByPayout.set(a.payout_id, current + Number(a.allocated_amount));
      });

      return (payouts || []).map((p) => {
        const expectedAmount = Number(p.net_payout_amount || p.total_amount || 0);
        const receivedAmount = receivedByPayout.get(p.id) || 0;
        const bankFee = Number(p.bank_fee_total || 0);
        const adjTotal = Number(p.adjustment_total || 0);
        const reconciledTotal = bankFee + adjTotal;
        const remainingAmount = Math.max(0, expectedAmount - receivedAmount - reconciledTotal);

        return {
          ...p,
          ota_source: normalizeOtaSource(p.ota_source),
          expected_amount: expectedAmount,
          received_amount: receivedAmount,
          remaining_amount: remainingAmount,
          bank_fee_total: bankFee,
          adjustment_total: adjTotal,
        };
      }).filter(p => p.remaining_amount > 0);
    },
  });
};

/**
 * Hook to get cash-in status for a specific OTA payout
 * Uses collection_payout_allocations junction table
 * Status derivation matches DB recalculate_ota_payout_status_v2 logic:
 *   settled = (totalReceived + bankFee + adjustments) >= (expectedAmount - 1)
 */
export const useOtaPayoutCashInStatus = (payoutId: string) => {
  return useQuery({
    queryKey: ["ota_payout_cashin_status", payoutId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get payout expected amount + reconciliation totals
      const { data: payout, error: payoutError } = await supabase
        .from("ota_payouts")
        .select("net_payout_amount, total_amount, bank_fee_total, adjustment_total")
        .eq("id", payoutId)
        .single();

      if (payoutError) throw payoutError;

      const expectedAmount = Number(payout?.net_payout_amount || payout?.total_amount || 0);
      const bankFeeTotal = Number(payout?.bank_fee_total || 0);
      const adjustmentTotal = Number(payout?.adjustment_total || 0);
      const reconciledTotal = bankFeeTotal + adjustmentTotal;

      // Get allocations from junction table
      const { data: allocations } = await supabase
        .from("collection_payout_allocations")
        .select("collection_id, allocated_amount")
        .eq("payout_id", payoutId);

      // Get collection details for these allocations
      const collectionIds = [...new Set((allocations || []).map((a) => a.collection_id))];
      let cashInRecords: any[] = [];
      if (collectionIds.length > 0) {
        const { data } = await supabase
          .from("hotel_collects")
          .select("*")
          .in("id", collectionIds)
          .order("collected_at", { ascending: false });
        cashInRecords = data || [];
      }

      // Get voided collection IDs
      const voidedIds = new Set(
        cashInRecords
          .filter((c) => c.collection_type === "VOID")
          .map((c) => c.related_collection_id)
          .filter(Boolean)
      );

      // Sum allocated amounts (excluding voided) — pure cash-in only
      const totalReceived = (allocations || [])
        .filter((a) => !voidedIds.has(a.collection_id))
        .reduce((sum, a) => sum + Number(a.allocated_amount), 0);

      // remainingAmount = cash still expected to come in (excluding bank fees & adjustments already reconciled)
      const remainingAmount = Math.max(0, expectedAmount - totalReceived - reconciledTotal);

      // Derive status — MUST match DB recalculate_ota_payout_status_v2 logic
      // settled = (totalReceived + bankFee + adjustments) >= (expectedAmount - 1)
      const TOLERANCE = 1;
      const settledAmount = totalReceived + reconciledTotal;
      let derivedStatus: "NOT_RECEIVED" | "PARTIAL" | "RECEIVED" = "NOT_RECEIVED";
      if (totalReceived <= 0) {
        derivedStatus = "NOT_RECEIVED";
      } else if (settledAmount >= expectedAmount - TOLERANCE) {
        derivedStatus = "RECEIVED";
      } else {
        derivedStatus = "PARTIAL";
      }

      return {
        expectedAmount,
        totalReceived,
        remainingAmount,
        reconciledTotal,
        derivedStatus,
        cashInRecords,
      };
    },
    enabled: !!payoutId,
  });
};

/**
 * Hook to record MULTI OTA Payout cash-in via batch RPC (ATOMIC)
 * Creates 1 phiếu thu for N payouts via junction table
 * 
 * 🚨 QUAN TRỌNG: cash_account_id là BẮT BUỘC
 * ✅ Finance/Kế toán PHẢI chọn chính xác tài khoản nhận tiền
 */
export const useRecordMultiPayoutCashIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      allocations: { payout_id: string; amount: number }[];
      total_amount: number;
      cash_account_id: string;
      payment_method: string;
      payment_channel?: string | null;
      reference?: string | null;
      note?: string | null;
      received_date: string;
    }) => {
      if (!data.cash_account_id) {
        throw new Error("Vui lòng chọn tài khoản nhận tiền. Đây là trường bắt buộc.");
      }
      if (data.allocations.length === 0) {
        throw new Error("Phải chọn ít nhất 1 payout.");
      }

      const payoutIds = data.allocations.map((a) => a.payout_id);
      const amounts = data.allocations.map((a) => a.amount);

      // Ensure received_date is YYYY-MM-DD format, with noon UTC to prevent timezone day shift
      // e.g. '2026-02-05' → '2026-02-05T12:00:00' avoids midnight rollback/rollforward
      const rawDate = (data.received_date || new Date().toISOString()).split("T")[0];
      const dateForDb = rawDate + "T12:00:00";

      const { data: collectionId, error: rpcError } = await (supabase.rpc as any)(
        "create_multi_payout_cashin_atomic",
        {
          p_payout_ids: payoutIds,
          p_amounts: amounts,
          p_total_amount: data.total_amount,
          p_cash_account_id: data.cash_account_id,
          p_received_at: dateForDb,
          p_payment_method: data.payment_method,
          p_payment_channel: data.payment_channel || null,
          p_bank_reference: data.reference || null,
          p_note: data.note || null,
        }
      );

      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("AUTH_REQUIRED")) {
          throw new Error("Vui lòng đăng nhập lại để thực hiện thao tác này.");
        }
        if (msg.includes("PERMISSION_DENIED")) {
          throw new Error("Bạn không có quyền ghi nhận tiền OTA. Chỉ Kế toán/Admin mới được phép.");
        }
        if (msg.includes("cash_account_id là bắt buộc")) {
          throw new Error("Vui lòng chọn tài khoản nhận tiền.");
        }
        if (msg.includes("Kỳ kế toán đã khóa") || msg.includes("PERIOD_LOCK") || msg.includes("is_period_locked")) {
          throw new Error(rpcError.message);
        }
        if (msg.includes("STATUS_INVALID")) {
          throw new Error("Payout không ở trạng thái hợp lệ để ghi nhận tiền.");
        }
        if (msg.includes("DUPLICATE") || msg.includes("duplicate")) {
          throw new Error("Giao dịch trùng lặp. Vui lòng kiểm tra lại.");
        }
        throw new Error(rpcError.message || "Lỗi khi ghi nhận tiền OTA");
      }

      return { collectionId };
    },
    onSuccess: (_, variables) => {
      toast.success(`Đã ghi nhận tiền OTA về thành công (${variables.allocations.length} payout, 1 phiếu thu)`);
      variables.allocations.forEach((a) => {
        queryClient.invalidateQueries({ queryKey: ["ota_payout", a.payout_id] });
        queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", a.payout_id] });
      });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts_for_cashin"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      queryClient.invalidateQueries({ queryKey: ["pl-calculator-ota-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["payout_reconciliation_items"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};



/**
 * Hook to reverse OTA Payout cash-in (ATOMIC)
 * Đảo bút toán - cách DUY NHẤT để sửa sai
 */
export const useReverseOtaPayoutCashIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      collection_id: string;
      reason: string;
      payout_id: string; // For cache invalidation
    }) => {
      if (!data.reason?.trim()) {
        throw new Error("Vui lòng nhập lý do đảo bút toán.");
      }

      const { data: reversalId, error: rpcError } = await safeRpc(() => supabase.rpc(
        "reverse_ota_payout_cashin",
        {
          p_collection_id: data.collection_id,
          p_reason: data.reason,
        }
      ));

      if (rpcError) {
        if (rpcError.message.includes("Kỳ kế toán đã khóa")) {
          throw new Error(rpcError.message);
        }
        if (rpcError.message.includes("Permission denied")) {
          throw new Error("Bạn không có quyền đảo bút toán. Chỉ Kế toán/Admin mới được phép.");
        }
        throw new Error(rpcError.message || "Lỗi khi đảo bút toán");
      }

      return { reversalId };
    },
    onSuccess: (_, variables) => {
      toast.success("Đã đảo bút toán thành công");
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

/**
 * Constants for OTA payout payment methods and channels
 */
export const OTA_PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Chuyển khoản ngân hàng" },
  { value: "UPC", label: "Cổng thanh toán (UPC)" },
];

export const UPC_CHANNELS = [
  { value: "ONEPAY", label: "OnePay" },
  { value: "9PAY", label: "9Pay" },
  { value: "VPBANK", label: "VPBank" },
  { value: "OTHER", label: "Khác" },
];

/**
 * Hook to get OTA payouts that need sync (RECEIVED status but no allocation records)
 */
export const useOtaPayoutsNeedingSync = () => {
  return useQuery({
    queryKey: ["ota_payouts_needing_sync"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get all RECEIVED payouts
      const { data: receivedPayouts, error: payoutError } = await supabase
        .from("ota_payouts")
        .select("*")
        .eq("status", "RECEIVED");

      if (payoutError) throw payoutError;
      if (!receivedPayouts || receivedPayouts.length === 0) return [];

      const payoutIds = receivedPayouts.map((p) => p.id);

      // Get existing allocations from junction table
      const { data: allocations } = await supabase
        .from("collection_payout_allocations")
        .select("payout_id, allocated_amount")
        .in("payout_id", payoutIds);

      // Sum allocated per payout
      const cashInByPayout = new Map<string, number>();
      (allocations || []).forEach((a) => {
        const current = cashInByPayout.get(a.payout_id) || 0;
        cashInByPayout.set(a.payout_id, current + Number(a.allocated_amount));
      });

      // Return payouts that have RECEIVED status but no/insufficient cash-in
      return receivedPayouts.filter((p) => {
        const expectedAmount = Number(p.net_payout_amount || p.total_amount || 0);
        const cashInAmount = cashInByPayout.get(p.id) || 0;
        return cashInAmount < expectedAmount;
      });
    },
  });
};

/**
 * Hook to sync existing OTA payouts to hotel_collects
 * Creates cash-in records for payouts that were marked RECEIVED before this system
 */
export const useSyncOtaPayoutsToCashIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();

      // Get RECEIVED payouts
      const { data: receivedPayouts, error: payoutError } = await supabase
        .from("ota_payouts")
        .select("*")
        .eq("status", "RECEIVED");

      if (payoutError) throw payoutError;
      if (!receivedPayouts || receivedPayouts.length === 0) {
        return { synced: 0, errors: [] };
      }

      const payoutIds = receivedPayouts.map((p) => p.id);

      // Get existing allocations from junction table
      const { data: existingAllocations } = await supabase
        .from("collection_payout_allocations")
        .select("payout_id, allocated_amount")
        .in("payout_id", payoutIds);

      const cashInByPayout = new Map<string, number>();
      (existingAllocations || []).forEach((a) => {
        const current = cashInByPayout.get(a.payout_id) || 0;
        cashInByPayout.set(a.payout_id, current + Number(a.allocated_amount));
      });

      const results: { synced: number; errors: string[] } = { synced: 0, errors: [] };

      for (const payout of receivedPayouts) {
        const expectedAmount = Number(payout.net_payout_amount || payout.total_amount || 0);
        const existingCashIn = cashInByPayout.get(payout.id) || 0;
        const missingAmount = expectedAmount - existingCashIn;

        if (missingAmount <= 0) continue;

        try {
          // Create hotel_collects record
          const { data: collection, error: collectionError } = await supabase
            .from("hotel_collects")
            .insert({
              unified_booking_id: `OTA-PAYOUT-${payout.id.substring(0, 8)}`,
              amount_collected: missingAmount,
              payment_method: payout.payout_method || "BANK_TRANSFER",
              payee_type: "ROOMRISE",
              payer_type: "OTA",
              related_type: "OTA_PAYOUT",
              collected_at: payout.reconciled_at || payout.payout_date,
              collected_by: user.user?.id,
              collection_type: "COLLECT",
              receipt: payout.bank_reference || null,
              note: `[SYNC] Tiền OTA ${payout.ota_source} về - Đồng bộ từ payout cũ`,
            })
            .select()
            .single();

          if (collectionError) throw collectionError;

          // Insert junction table record
          await safeMutation(() => supabase.from("collection_payout_allocations").insert({
            collection_id: collection.id,
            payout_id: payout.id,
            allocated_amount: missingAmount,
          }));

          // Create cashflow entry
          await safeMutation(() => supabase.from("cashflow_entries").insert({
            cash_date: payout.payout_date,
            amount: missingAmount,
            direction: "IN",
            source_type: "OTA_PAYOUT",
            source_id: collection.id,
            counterparty_type: "OTA",
            note: `[SYNC] OTA ${payout.ota_source} payout - ${payout.bank_reference || ""}`,
            created_by: user.user?.id,
          }));

          // Audit log
          await createAuditLog({
            action: "OTA_PAYOUT_SYNC",
            entity: "hotel_collects",
            entityId: collection.id,
            afterData: {
              payout_id: payout.id,
              synced_amount: missingAmount,
              payout_date: payout.payout_date,
              ota_source: payout.ota_source,
            },
          });

          results.synced++;
        } catch (error: any) {
          results.errors.push(`Payout ${payout.id}: ${error.message}`);
        }
      }

      return results;
    },
    onSuccess: (results) => {
      if (results.synced > 0) {
        toast.success(`Đã đồng bộ ${results.synced} OTA Payout thành công`);
      } else {
        toast.info("Không có OTA Payout nào cần đồng bộ");
      }
      if (results.errors.length > 0) {
        toast.error(`Có ${results.errors.length} lỗi khi đồng bộ`);
      }
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts_needing_sync"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow_entries"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi đồng bộ: " + error.message);
    },
  });
};

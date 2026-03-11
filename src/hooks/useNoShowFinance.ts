/**
 * useNoShowFinance — Financial tracking for NO_SHOW bookings
 * 
 * Provides:
 * - Snapshot CRUD (auto-created via useCreateNoShow integration)
 * - Confirm Collected → posts ledger via post_ledger_entry_idempotent RPC
 * - Waive → marks charge_status = WAIVED, no ledger
 * - Dashboard KPIs (count, collected, pending, waived, refunded)
 * 
 * INVARIANTS:
 * - One snapshot per unified_booking_id (UNIQUE constraint)
 * - Revenue posted ONLY when charge_status = COLLECTED
 * - Idempotent via RPC (source_type = NO_SHOW_REVENUE, source_id = snapshot.id)
 * - Refund reversal only if revenue_posted = true
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "@/hooks/useAuditLog";

// ─── Types ────────────────────────────────────────────────

export type NoShowChargeStatus = "PENDING" | "COLLECTED" | "WAIVED" | "REFUNDED";
export type NoShowCollectorType = "HOTEL" | "OTA";

export interface NoShowFinancialSnapshot {
    id: string;
    org_id: string;
    unified_booking_id: string;
    collector_type: NoShowCollectorType;
    expected_amount: number;
    collected_amount: number;
    refund_amount: number;
    charge_status: NoShowChargeStatus;
    snapshot_date: string;
    revenue_posted: boolean;
    ledger_entry_id: string | null;
    refund_ledger_entry_id: string | null;
    removed_at: string | null;
    prev_booking_status: string | null;
    prev_stay_status: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Query: Single Snapshot ───────────────────────────────

export function useNoShowSnapshot(unifiedBookingId: string | undefined) {
    return useQuery({
        queryKey: ["no_show_snapshot", unifiedBookingId],
        staleTime: 30_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: !!unifiedBookingId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("no_show_financial_snapshots")
                .select("*")
                .eq("unified_booking_id", unifiedBookingId!)
                .is("removed_at", null)
                .maybeSingle();

            if (error) throw error;
            return data as NoShowFinancialSnapshot | null;
        },
    });
}

// ─── Query: Dashboard KPIs ───────────────────────────────

export interface NoShowKPIs {
    total: number;
    pending: number;
    collected: number;
    waived: number;
    refunded: number;
    collected_amount: number;
    pending_amount: number;
    refunded_amount: number;
}

export function useNoShowDashboardKPIs(dateRange?: { start: string; end: string }) {
    return useQuery({
        queryKey: ["no_show_kpis", dateRange],
        staleTime: 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            let query = supabase
                .from("no_show_financial_snapshots")
                .select("*")
                .is("removed_at", null);

            if (dateRange?.start) query = query.gte("snapshot_date", dateRange.start);
            if (dateRange?.end) query = query.lte("snapshot_date", dateRange.end);

            const { data, error } = await query;
            if (error) throw error;

            const records = (data || []) as NoShowFinancialSnapshot[];
            const kpis: NoShowKPIs = {
                total: records.length,
                pending: 0,
                collected: 0,
                waived: 0,
                refunded: 0,
                collected_amount: 0,
                pending_amount: 0,
                refunded_amount: 0,
            };

            for (const r of records) {
                switch (r.charge_status) {
                    case "PENDING":
                        kpis.pending++;
                        kpis.pending_amount += Number(r.expected_amount || 0);
                        break;
                    case "COLLECTED":
                        kpis.collected++;
                        kpis.collected_amount += Number(r.collected_amount || 0);
                        break;
                    case "WAIVED":
                        kpis.waived++;
                        break;
                    case "REFUNDED":
                        kpis.refunded++;
                        kpis.refunded_amount += Number(r.refund_amount || 0);
                        break;
                }
            }

            return kpis;
        },
    });
}

// ─── Mutation: Create Snapshot (called from useCreateNoShow) ──

export function useCreateNoShowSnapshot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            unified_booking_id: string;
            collector_type: NoShowCollectorType;
            expected_amount: number;
            snapshot_date: string;
        }) => {
            const { data: user } = await supabase.auth.getUser();

            // Upsert — idempotent on (org_id, unified_booking_id)
            const { data: snapshot, error } = await supabase
                .from("no_show_financial_snapshots")
                .upsert({
                    org_id: "00000000-0000-0000-0000-000000000001",
                    unified_booking_id: data.unified_booking_id,
                    collector_type: data.collector_type,
                    expected_amount: data.expected_amount,
                    snapshot_date: data.snapshot_date,
                    charge_status: "PENDING",
                    revenue_posted: false,
                    created_by: user?.user?.id,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: "org_id,unified_booking_id",
                })
                .select()
                .single();

            if (error) throw error;
            return snapshot as NoShowFinancialSnapshot;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", variables.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
        },
    });
}

// ─── Mutation: Confirm Collected (HOTEL_COLLECT or manual) ──

export function useConfirmNoShowCollected() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            unified_booking_id: string;
            collected_amount: number;
        }) => {
            // 1. Get snapshot
            const { data: snapshot, error: snapErr } = await supabase
                .from("no_show_financial_snapshots")
                .select("*")
                .eq("unified_booking_id", data.unified_booking_id)
                .is("removed_at", null)
                .single();

            if (snapErr || !snapshot) throw new Error("Snapshot không tìm thấy");

            if (snapshot.revenue_posted) {
                // Already posted — idempotent skip
                return snapshot as NoShowFinancialSnapshot;
            }

            // 2. Post ledger via RPC (idempotent — uses source_type + source_id unique)
            const { data: ledgerEntryId, error: ledgerErr } = await supabase
                .rpc("post_ledger_entry_idempotent", {
                    p_source_type: "NO_SHOW_REVENUE",
                    p_source_id: snapshot.id,
                    p_cash_account_id: await getDefaultAccountId(),
                    p_direction: "DEBIT",
                    p_amount: data.collected_amount,
                    p_entry_date: snapshot.snapshot_date,
                    p_counterparty_type: snapshot.collector_type === "OTA" ? "OTA" : "GUEST",
                    p_counterparty_id: data.unified_booking_id,
                    p_note: `NO_SHOW revenue: ${data.unified_booking_id}`,
                });

            if (ledgerErr) throw ledgerErr;

            // 3. Update snapshot
            const { data: updated, error: updateErr } = await supabase
                .from("no_show_financial_snapshots")
                .update({
                    collected_amount: data.collected_amount,
                    charge_status: "COLLECTED",
                    revenue_posted: true,
                    ledger_entry_id: ledgerEntryId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", snapshot.id)
                .select()
                .single();

            if (updateErr) throw updateErr;

            // 4. Audit
            await createAuditLog({
                action: "NO_SHOW_REVENUE_POSTED",
                entity: "no_show_financial_snapshots",
                entityId: snapshot.id,
                afterData: {
                    collected_amount: data.collected_amount,
                    ledger_entry_id: ledgerEntryId,
                    unified_booking_id: data.unified_booking_id,
                },
            });

            return updated as NoShowFinancialSnapshot;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", variables.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
            queryClient.invalidateQueries({ queryKey: ["pl-calculator-noshow-revenue"] });
            toast.success("Đã ghi nhận doanh thu NO_SHOW");
        },
        onError: (error: Error) => {
            toast.error("Lỗi ghi nhận doanh thu: " + error.message);
        },
    });
}

// ─── Mutation: Waive NO_SHOW ─────────────────────────────

export function useWaiveNoShow() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (unified_booking_id: string) => {
            const { data: updated, error } = await supabase
                .from("no_show_financial_snapshots")
                .update({
                    charge_status: "WAIVED",
                    updated_at: new Date().toISOString(),
                })
                .eq("unified_booking_id", unified_booking_id)
                .is("removed_at", null)
                .select()
                .single();

            if (error) throw error;

            await createAuditLog({
                action: "NO_SHOW_WAIVED",
                entity: "no_show_financial_snapshots",
                entityId: updated.id,
                afterData: { unified_booking_id },
            });

            return updated as NoShowFinancialSnapshot;
        },
        onSuccess: (_, bookingId) => {
            queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", bookingId] });
            queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
            toast.success("Đã miễn thu no-show");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}

// ─── Mutation: Undo NO_SHOW (3-level financial safety) ───

export type UndoNoShowResult =
    | { success: true; level: 1 | 2 }
    | { success: false; level: 3; reason: string };

export function useUndoNoShow() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (unified_booking_id: string): Promise<UndoNoShowResult> => {
            // 1. Fetch snapshot
            const { data: snapshot, error: snapErr } = await supabase
                .from("no_show_financial_snapshots")
                .select("*")
                .eq("unified_booking_id", unified_booking_id)
                .is("removed_at", null)
                .maybeSingle();

            if (snapErr) throw snapErr;
            if (!snapshot) throw new Error("Không tìm thấy snapshot tài chính cho booking này");

            const refundAmount = Number(snapshot.refund_amount || 0);

            // ──────────────────────────────────────────────
            // CASE C (Level 3): REFUNDED — block undo
            // ──────────────────────────────────────────────
            if (snapshot.charge_status === "REFUNDED" || refundAmount > 0) {
                return {
                    success: false,
                    level: 3,
                    reason: "Đã hoàn tiền. Cần tạo bút toán điều chỉnh.",
                };
            }

            // ──────────────────────────────────────────────
            // CASE B (Level 2): COLLECTED with revenue posted
            // ──────────────────────────────────────────────
            if (snapshot.revenue_posted && snapshot.charge_status === "COLLECTED" && snapshot.ledger_entry_id) {
                // Reverse the ledger entry — idempotent wrapper:
                // reverse_ledger_entry throws if already reversed, catch gracefully
                try {
                    await supabase.rpc("reverse_ledger_entry", {
                        p_original_entry_id: snapshot.ledger_entry_id,
                        p_reason: `Undo NO_SHOW: ${unified_booking_id}`,
                    });
                } catch (reversalErr: any) {
                    // "Entry already reversed" = idempotent OK (double-click safe)
                    const msg = reversalErr?.message || "";
                    if (!msg.includes("already reversed")) {
                        throw reversalErr; // Re-throw only unexpected errors
                    }
                    console.warn("[useUndoNoShow] Reversal already exists (idempotent skip)");
                }

                // Reset snapshot financial state before soft-deleting
                await supabase
                    .from("no_show_financial_snapshots")
                    .update({
                        revenue_posted: false,
                        charge_status: "WAIVED",
                        removed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", snapshot.id);

                // Revert statuses + unvoid
                await revertBookingStatuses(unified_booking_id, snapshot);

                await createAuditLog({
                    action: "NO_SHOW_UNDO_LEVEL_2",
                    entity: "no_show_financial_snapshots",
                    entityId: snapshot.id,
                    afterData: {
                        unified_booking_id,
                        reversed_ledger_entry_id: snapshot.ledger_entry_id,
                        prev_booking_status: snapshot.prev_booking_status,
                        prev_stay_status: snapshot.prev_stay_status,
                    },
                });

                return { success: true, level: 2 };
            }

            // ──────────────────────────────────────────────
            // CASE A (Level 1): PENDING or WAIVED, no revenue
            // ──────────────────────────────────────────────
            // Soft-delete snapshot
            await supabase
                .from("no_show_financial_snapshots")
                .update({
                    removed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", snapshot.id);

            // Revert statuses + unvoid
            await revertBookingStatuses(unified_booking_id, snapshot);

            await createAuditLog({
                action: "NO_SHOW_UNDO_LEVEL_1",
                entity: "no_show_financial_snapshots",
                entityId: snapshot.id,
                afterData: {
                    unified_booking_id,
                    prev_booking_status: snapshot.prev_booking_status,
                    prev_stay_status: snapshot.prev_stay_status,
                },
            });

            return { success: true, level: 1 };
        },
        onSuccess: (result, bookingId) => {
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", bookingId] });
                queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
                queryClient.invalidateQueries({ queryKey: ["no_show_records"] });
                queryClient.invalidateQueries({ queryKey: ["no_show_record", bookingId] });
                queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
                queryClient.invalidateQueries({ queryKey: ["stays"] });
                queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
                queryClient.invalidateQueries({ queryKey: ["pl-calculator-noshow-revenue"] });
                toast.success(
                    result.level === 1
                        ? "Đã hoàn tác No-show"
                        : "Đã hoàn tác No-show + đảo bút toán"
                );
            } else {
                toast.error("Không thể hoàn tác", { description: (result as any).reason });
            }
        },
        onError: (error: Error) => {
            toast.error("Lỗi hoàn tác: " + error.message);
        },
    });
}

/**
 * Helper: Revert booking/stay statuses and unvoid host segments
 * Shared between Level 1 and Level 2 undo flows
 */
async function revertBookingStatuses(
    unified_booking_id: string,
    snapshot: { prev_booking_status: string | null; prev_stay_status: string | null }
) {
    const prevBooking = (snapshot.prev_booking_status || "CONFIRMED") as any;
    const prevStay = (snapshot.prev_stay_status || "WAIT_ROOM") as any;

    // Soft-delete no_show_records
    await supabase
        .from("no_show_records")
        .update({ removed_at: new Date().toISOString() })
        .eq("unified_booking_id", unified_booking_id)
        .is("removed_at", null);

    // Revert booking status
    await supabase
        .from("manual_bookings")
        .update({ booking_status: prevBooking })
        .eq("unified_booking_id", unified_booking_id);

    await supabase
        .from("bookings_mirror")
        .update({ booking_status: prevBooking })
        .eq("unified_booking_id", unified_booking_id);

    // Revert stay status
    await supabase
        .from("stays")
        .update({ stay_status: prevStay })
        .eq("unified_booking_id", unified_booking_id);

    // Check if host payables are already settled (PAID) — block unvoiding if so
    const { data: paidPayables } = await supabase
        .from("host_payables")
        .select("id, status")
        .eq("unified_booking_id", unified_booking_id)
        .eq("status", "PAID");

    if (paidPayables && paidPayables.length > 0) {
        console.warn(`[revertBookingStatuses] ${paidPayables.length} host payable(s) already PAID — segments NOT unvoided`);
        // Still revert statuses but skip segment unvoiding to prevent settlement inconsistency
    } else {
        // Unvoid host supply segments (safe — no settlement has occurred)
        await supabase
            .from("host_supply_segments")
            .update({ is_voided_by_no_show: false })
            .eq("unified_booking_id", unified_booking_id);
    }
}

// ─── Helper: Get default cash account ID ─────────────────

async function getDefaultAccountId(): Promise<string> {
    const { data } = await supabase
        .from("cash_accounts")
        .select("id")
        .eq("is_default", true)
        .eq("is_active", true)
        .eq("is_archived", false)
        .limit(1)
        .single();

    if (!data) throw new Error("No default cash account configured");
    return data.id;
}

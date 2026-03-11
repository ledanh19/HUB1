import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineKpiValue } from "@/components/kpi/InlineKpiValue";
import { KpiIndexBadge } from "@/components/kpi/KpiIndexBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PermissionGate } from "@/components/ui/PermissionGate";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSettlementStatusVariant, getSettlementStatusLabel } from "@/constants/status-config";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  FileSpreadsheet,
  Loader2,
  Building2,
  Calendar,
  User,
  CheckCircle,
  AlertCircle,
  Wallet,
  CreditCard,
  Receipt,
  Save,
  Lock,
  ArrowRight,
  Info,
  ExternalLink,
  BarChart3,
  ClipboardList,
  Lightbulb,
} from "lucide-react";
import { useHostSettlement, useHostPartners, useExistingSettlements, useUnsettledBookings, type SettlementFilters } from "@/hooks/useHostSettlement";
import { supabase, safeRpc } from "@/integrations/supabase";
import { createAuditLog } from "@/hooks/useAuditLog";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { SettlementListDialog } from "@/components/host-payables/SettlementListDialog";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import { Checkbox } from "@/components/ui/checkbox";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN");
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getSettlementStatusBadge = (status: string) => {
  return <StatusBadge variant={getSettlementStatusVariant(status) as any}>{getSettlementStatusLabel(status)}</StatusBadge>;
};

export default function HostSettlementPage() {
  const [searchParams] = useSearchParams();

  const urlPartnerId = searchParams.get("partner");
  const urlBookings = searchParams.get("bookings");
  const urlBookingIds = urlBookings ? urlBookings.split(",").filter(id => id.trim()) : [];

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(urlPartnerId || "");
  const [hostSearchOpen, setHostSearchOpen] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set(urlBookingIds));
  const [filters, setFilters] = useState<SettlementFilters | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [settlementCode, setSettlementCode] = useState<string | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<string>("DRAFT");

  // Deposit & Prepaid: user chọn deposit/prepaid nào để CẤN TRỪ vào settlement
  // Case 1: không chọn → cọc giữ lại, thu sau qua trang Quản lý cọc
  // Case 2: chọn → cấn trừ vào NET
  const [selectedDepositIds, setSelectedDepositIds] = useState<Set<string>>(new Set());
  const [selectedPrepaidIds, setSelectedPrepaidIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (urlPartnerId && !filters) {
      setSelectedPartnerId(urlPartnerId);
      if (urlBookingIds.length > 0) {
        setSelectedBookingIds(new Set(urlBookingIds));
        setFilters({
          partnerId: urlPartnerId,
          bookingIds: urlBookingIds,
        });
      }
    }
  }, [urlPartnerId, urlBookings]);

  const queryClient = useQueryClient();
  const { data: partners, isLoading: partnersLoading } = useHostPartners();
  const { data: unsettledBookings, isLoading: unsettledLoading } = useUnsettledBookings(selectedPartnerId || null);
  const { data: settlement, isLoading, error } = useHostSettlement(filters);
  const { data: existingSettlements, isLoading: settlementsLoading } = useExistingSettlements(selectedPartnerId || undefined);

  // Fetch saved settlement snapshot for non-DRAFT states (SOT for deposit/prepaid/NET after finalize)
  const { data: savedSettlementSnapshot } = useQuery({
    queryKey: ["host-settlement-snapshot", settlementId],
    enabled: !!settlementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_settlements")
        .select("total_deposits_applied, total_prepaids_applied, remaining_amount, status")
        .eq("id", settlementId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ========================================
  // DEPOSIT/PREPAID OFFSET: tính toán dựa trên checkbox user chọn
  // ========================================
  // Chỉ PAID deposits/prepaids mới có thể cấn trừ
  const paidDeposits = useMemo(() =>
    (settlement?.deposits ?? []).filter(d => d.status === "PAID"), [settlement]);
  const paidPrepaids = useMemo(() =>
    (settlement?.prepaids ?? []).filter(p => p.status === "PAID"), [settlement]);

  // Tổng cấn trừ = SUM(total_paid) của các deposit/prepaid được chọn
  // Draft-mode: checkbox-driven computation
  const draftDepositApplied = useMemo(() =>
    paidDeposits
      .filter(d => selectedDepositIds.has(d.id))
      .reduce((sum, d) => sum + d.total_paid, 0),
    [paidDeposits, selectedDepositIds]);
  const draftPrepaidApplied = useMemo(() =>
    paidPrepaids
      .filter(p => selectedPrepaidIds.has(p.id))
      .reduce((sum, p) => sum + p.total_paid, 0),
    [paidPrepaids, selectedPrepaidIds]);

  // SOT switch: DRAFT uses checkbox values, non-DRAFT uses DB snapshot
  const isDraft = settlementStatus === "DRAFT";
  const effectiveDepositApplied = isDraft
    ? draftDepositApplied
    : Number(savedSettlementSnapshot?.total_deposits_applied ?? draftDepositApplied);
  const effectivePrepaidApplied = isDraft
    ? draftPrepaidApplied
    : Number(savedSettlementSnapshot?.total_prepaids_applied ?? draftPrepaidApplied);

  // Recalculated NET POSITION: DRAFT uses live compute, non-DRAFT uses DB snapshot
  const effectiveNetPosition = useMemo(() => {
    if (!isDraft && savedSettlementSnapshot?.remaining_amount != null) {
      return Number(savedSettlementSnapshot.remaining_amount);
    }
    if (!settlement?.summary) return 0;
    const s = settlement.summary;
    return s.totalPayableAmount - s.totalHostCollected - s.totalPaidAmount
      - effectiveDepositApplied - effectivePrepaidApplied - s.totalCollectedFromHost;
  }, [isDraft, savedSettlementSnapshot, settlement, effectiveDepositApplied, effectivePrepaidApplied]);

  // Toggle deposit/prepaid selection
  const toggleDeposit = (depositId: string) => {
    setSelectedDepositIds(prev => {
      const next = new Set(prev);
      if (next.has(depositId)) next.delete(depositId);
      else next.add(depositId);
      return next;
    });
  };
  const togglePrepaid = (prepaidId: string) => {
    setSelectedPrepaidIds(prev => {
      const next = new Set(prev);
      if (next.has(prepaidId)) next.delete(prepaidId);
      else next.add(prepaidId);
      return next;
    });
  };
  const selectAllDeposits = () => {
    setSelectedDepositIds(new Set(paidDeposits.map(d => d.id)));
  };
  const selectAllPrepaids = () => {
    setSelectedPrepaidIds(new Set(paidPrepaids.map(p => p.id)));
  };
  const clearAllDeposits = () => setSelectedDepositIds(new Set());
  const clearAllPrepaids = () => setSelectedPrepaidIds(new Set());

  // Toggle a single booking selection
  const toggleBooking = (bookingId: string) => {
    setSelectedBookingIds(prev => {
      const next = new Set(prev);
      if (next.has(bookingId)) {
        next.delete(bookingId);
      } else {
        next.add(bookingId);
      }
      return next;
    });
  };

  // Toggle all bookings
  const toggleAllBookings = () => {
    if (!unsettledBookings) return;
    if (selectedBookingIds.size === unsettledBookings.length) {
      setSelectedBookingIds(new Set());
    } else {
      setSelectedBookingIds(new Set(unsettledBookings.map(b => b.unified_booking_id)));
    }
  };

  const handleGenerate = () => {
    if (selectedPartnerId && selectedBookingIds.size > 0) {
      setFilters({
        partnerId: selectedPartnerId,
        bookingIds: Array.from(selectedBookingIds),
      });
      setSettlementId(null);
      setSettlementCode(null);
      setSettlementStatus("DRAFT");
    }
  };

  // Reset selections when switching host
  const handleSelectHost = (hostId: string) => {
    setSelectedPartnerId(hostId);
    setHostSearchOpen(false);
    setSelectedBookingIds(new Set());
    setFilters(null);
    setSettlementId(null);
    setSettlementCode(null);
    setSettlementStatus("DRAFT");
  };

  // Save Settlement (DRAFT) with retry logic for duplicate key
  const saveSettlementMutation = useMutation({
    mutationFn: async () => {
      if (!settlement || !filters) throw new Error("No settlement data");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Generate unique code with timestamp suffix on retry
        let code: string;
        if (attempt === 0) {
          const { data: generatedCode } = await safeRpc(() => supabase.rpc("generate_settlement_code"));
          code = generatedCode || `ST${Date.now()}`;
        } else {
          // On retry, use timestamp-based code to avoid collision
          code = `ST${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        }

        // Compute period from/to: derive from bookings
        const periodFrom = settlement.bookings.reduce((min, b) => {
          const d = b.check_in_date || "";
          return d && d < min ? d : min;
        }, "9999-12-31");
        const periodTo = settlement.bookings.reduce((max, b) => {
          const d = b.check_out_date || b.actual_check_out_at || "";
          return d && d > max ? d : max;
        }, "0000-01-01");

        const { data: settlementRecord, error: settlementError } = await supabase
          .from("host_settlements")
          .insert({
            settlement_code: code,
            partner_id: filters.partnerId,
            period_from: periodFrom,
            period_to: periodTo,
            status: "DRAFT",
            total_booking_revenue: settlement.summary.totalBookingRevenue,
            total_payable_amount: settlement.summary.totalPayableAmount,
            total_host_collected: settlement.summary.totalHostCollected,
            total_deposits_applied: effectiveDepositApplied,
            total_prepaids_applied: effectivePrepaidApplied,
            total_paid_amount: settlement.summary.totalPaidAmount,
            remaining_amount: effectiveNetPosition,
            created_by: user.id,
          })
          .select()
          .single();

        if (!settlementError) {
          return settlementRecord;
        }

        // Check if it's a duplicate key error
        if (settlementError.message?.includes("duplicate key") ||
          settlementError.code === "23505") {
          lastError = settlementError;
          continue; // Retry with new code
        }

        // For other errors, throw immediately
        throw settlementError;
      }

      throw lastError || new Error("Không thể tạo mã settlement sau nhiều lần thử");
    },
    onSuccess: (data) => {
      setSettlementId(data.id);
      setSettlementCode(data.settlement_code);
      setSettlementStatus(data.status);
      toast.success(`Đã lưu Settlement: ${data.settlement_code}`);
      queryClient.invalidateQueries({ queryKey: ["host-settlements"] });
    },
    onError: (error) => {
      toast.error("Lỗi lưu Settlement: " + error.message);
    },
  });

  // Finalize Settlement (DRAFT → SETTLED) - Use secure RPC
  const finalizeSettlementMutation = useMutation({
    mutationFn: async () => {
      if (!settlementId) throw new Error("Chưa lưu Settlement");
      if (!settlement || !filters) throw new Error("No settlement data");

      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const bookingIds = settlement.bookings.map(b => b.unified_booking_id);

      // === DEFENSE-IN-DEPTH: Pre-check for already-locked segments ===
      // Prevents race condition where two users finalize same bookings
      const { data: lockedSegments } = await supabase
        .from("host_supply_segments")
        .select("id, settlement_id")
        .eq("partner_id", filters.partnerId)
        .not("settlement_id", "is", null)
        .neq("settlement_id", settlementId)
        .in("unified_booking_id", bookingIds);

      if (lockedSegments && lockedSegments.length > 0) {
        const conflictingIds = [...new Set(lockedSegments.map(s => s.settlement_id))];
        const { data: conflictingSettlements } = await supabase
          .from("host_settlements")
          .select("id, settlement_code, status, total_paid_amount")
          .in("id", conflictingIds);

        // Auto-cleanup: DRAFT blocking settlements are leftovers — void them automatically
        // BUG FIX: Must verify NO financial effects exist before auto-voiding
        const draftBlockers = conflictingSettlements?.filter(s => s.status === "DRAFT") || [];
        const nonDraftBlockers = conflictingSettlements?.filter(s => s.status !== "DRAFT") || [];

        // =============================================
        // SAFE AUTO-VOID: Check actual financial effects before voiding ANY settlement
        // total_paid_amount snapshot may be stale — verify via cashflow_entries
        // =============================================
        const hasFinancialEffects = async (stlId: string): Promise<boolean> => {
          // Check 1: cash_outs linked directly to this settlement
          const { count: cashOutCount, error: coErr } = await supabase
            .from("cash_outs")
            .select("id", { count: "exact", head: true })
            .eq("settlement_id", stlId)
            .eq("settlement_type", "HOST");

          if (coErr) { console.error("[hasFinancialEffects] cash_outs query failed:", coErr); return true; }
          if (cashOutCount && cashOutCount > 0) return true;

          // Check 2: payment_requests linked to this settlement in ANY non-cancelled status
          // BUG FIX: Previously only checked PAID/APPROVED, missed PENDING PRs that could be approved later
          const { data: linkedPRs, error: prErr } = await supabase
            .from("payment_requests")
            .select("id, status")
            .eq("settlement_id", stlId)
            .not("status", "eq", "CANCELLED");

          if (prErr) { console.error("[hasFinancialEffects] payment_requests query failed:", prErr); return true; }
          if (linkedPRs && linkedPRs.length > 0) {
            // Any non-cancelled PR = financial commitment exists
            return true;
          }

          // Check 3: cash_outs linked via payment_request (settlement_id on cash_out may be NULL)
          // Re-check including cancelled PRs that may have cash_outs
          const { data: allPRIds, error: allPrErr } = await supabase
            .from("payment_requests")
            .select("id")
            .eq("settlement_id", stlId);

          if (allPrErr) { console.error("[hasFinancialEffects] all PR ids query failed:", allPrErr); return true; }
          if (allPRIds && allPRIds.length > 0) {
            const { count: coPrCount, error: coPrErr } = await supabase
              .from("cash_outs")
              .select("id", { count: "exact", head: true })
              .in("payment_request_id", allPRIds.map(p => p.id));
            if (coPrErr) { console.error("[hasFinancialEffects] cash_outs via PR query failed:", coPrErr); return true; }
            if (coPrCount && coPrCount > 0) return true;
          }

          // Check 4: cashflow_entries linked directly to this settlement via source_id
          // BUG FIX: Previously this check existed but never returned true based on result
          const { count: cfCount, error: cfErr } = await supabase
            .from("cashflow_entries")
            .select("id", { count: "exact", head: true })
            .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
            .eq("source_id", stlId);

          if (cfErr) { console.error("[hasFinancialEffects] cashflow query failed:", cfErr); return true; }
          if (cfCount && cfCount > 0) return true;

          return false;
        };

        // Auto-void DRAFT blockers: only if truly clean
        for (const draft of draftBlockers) {
          const hasEffects = await hasFinancialEffects(draft.id);
          if (hasEffects) {
            console.warn(`[Settlement] DRAFT ${draft.settlement_code} has financial effects — skipping auto-void`);
            continue;
          }
          await supabase
            .from("host_supply_segments")
            .update({ settlement_id: null, locked_at: null })
            .eq("settlement_id", draft.id);
          await supabase
            .from("host_surcharges")
            .update({ settlement_id: null, locked_at: null })
            .eq("settlement_id", draft.id);
          await supabase
            .from("host_extra_charges")
            .update({ settlement_id: null, locked_at: null })
            .eq("settlement_id", draft.id);
          await supabase
            .from("host_settlements")
            .update({ status: "VOID", voided_at: new Date().toISOString(), voided_by: currentUser?.id ?? null, void_reason: "auto_cleanup_draft_conflict" })
            .eq("id", draft.id);

          // Audit log for auto-void
          await createAuditLog({
            action: "Auto-void DRAFT settlement (conflict cleanup)",
            entity: "host_settlements",
            entityId: draft.id,
            beforeData: { status: draft.status, total_paid_amount: draft.total_paid_amount, settlement_code: draft.settlement_code },
            afterData: { status: "VOID", reason: "auto_cleanup_draft_conflict" },
          });
        }

        const safelyVoidedDrafts = [];
        for (const draft of draftBlockers) {
          const isVoided = await supabase
            .from("host_settlements")
            .select("status")
            .eq("id", draft.id)
            .single();
          if (isVoided.data?.status === "VOID") safelyVoidedDrafts.push(draft);
        }

        if (safelyVoidedDrafts.length > 0) {
          const voidedCodes = safelyVoidedDrafts.map(s => s.settlement_code).join(", ");
          toast.info(`Đã tự động hủy ${safelyVoidedDrafts.length} phiếu nháp cũ: ${voidedCodes}`);
        }

        // If there are still non-DRAFT blockers (SETTLED/CLOSED with payments), error out
        if (nonDraftBlockers.length > 0) {
          // Check which ones can be voided — ONLY if NO financial effects
          const voidableBlockers: typeof nonDraftBlockers = [];
          const nonVoidableBlockers: typeof nonDraftBlockers = [];

          for (const s of nonDraftBlockers) {
            const hasEffects = await hasFinancialEffects(s.id);
            const snapshotPaid = Number(s.total_paid_amount) || 0;

            if (hasEffects || snapshotPaid > 0) {
              nonVoidableBlockers.push(s);
            } else if (s.status === "SETTLED") {
              voidableBlockers.push(s);
            } else {
              nonVoidableBlockers.push(s);
            }
          }

          if (nonVoidableBlockers.length > 0) {
            const conflictInfo = nonVoidableBlockers.map(s =>
              `${s.settlement_code} (${s.status})`
            ).join(", ");
            throw new Error(
              `Segment(s) đã bị khóa bởi settlement đã thanh toán: ${conflictInfo}. Vui lòng liên hệ quản trị để xử lý.`
            );
          }

          // Auto-void SETTLED blockers without any financial effects
          for (const settled of voidableBlockers) {
            await supabase
              .from("host_supply_segments")
              .update({ settlement_id: null, locked_at: null })
              .eq("settlement_id", settled.id);
            await supabase
              .from("host_surcharges")
              .update({ settlement_id: null, locked_at: null })
              .eq("settlement_id", settled.id);
            await supabase
              .from("host_extra_charges")
              .update({ settlement_id: null, locked_at: null })
              .eq("settlement_id", settled.id);
            await supabase
              .from("payment_requests")
              .update({ settlement_id: null })
              .eq("settlement_id", settled.id);
            await supabase
              .from("host_settlements")
              .update({ status: "VOID", voided_at: new Date().toISOString(), voided_by: currentUser?.id ?? null, void_reason: "auto_cleanup_settled_no_payments" })
              .eq("id", settled.id);

            // Audit log for auto-void
            await createAuditLog({
              action: "Auto-void SETTLED settlement (no financial effects, conflict cleanup)",
              entity: "host_settlements",
              entityId: settled.id,
              beforeData: { status: settled.status, total_paid_amount: settled.total_paid_amount, settlement_code: settled.settlement_code },
              afterData: { status: "VOID", reason: "auto_cleanup_settled_no_payments" },
            });
          }

          if (voidableBlockers.length > 0) {
            const voidedCodes = voidableBlockers.map(s => s.settlement_code).join(", ");
            toast.info(`Đã tự động hủy ${voidableBlockers.length} phiếu cũ chưa thanh toán: ${voidedCodes}`);
          }
        }
      }

      // Use secure RPC with server-side permission check
      const { error: rpcError } = await (supabase.rpc as any)('finalize_settlement_secure', {
        p_settlement_id: settlementId,
      });

      if (rpcError) {
        // Map permission error to user-friendly message
        if (rpcError.message.includes('quyền')) {
          throw new Error(rpcError.message);
        }
        throw new Error('Lỗi quyết toán: ' + rpcError.message);
      }

      const now = new Date().toISOString();

      // ====================================================================
      // ROW-LEVEL LOCKING: Lock only the exact rows included in settlement payload.
      // Prevents locking unrelated rows that happen to share the same booking ID.
      // Each item type is locked independently by its row ID.
      // ====================================================================
      const segmentIds = (settlement.segments || []).map(s => s.id);
      const extraChargeIds = (settlement.extraCharges || []).map(e => e.id);
      const surchargeIds = (settlement.surcharges || []).map(s => s.id);

      // Lock segments by exact row IDs
      if (segmentIds.length > 0) {
        await supabase
          .from("host_supply_segments")
          .update({ settlement_id: settlementId, locked_at: now })
          .in("id", segmentIds)
          .is("settlement_id", null);
      }

      // Lock extra charges by exact row IDs
      if (extraChargeIds.length > 0) {
        await supabase
          .from("host_extra_charges")
          .update({ settlement_id: settlementId, locked_at: now })
          .in("id", extraChargeIds)
          .is("settlement_id", null);
      }

      // Lock surcharges by exact row IDs
      if (surchargeIds.length > 0) {
        await supabase
          .from("host_surcharges")
          .update({ settlement_id: settlementId, locked_at: now })
          .in("id", surchargeIds)
          .is("settlement_id", null);
      }

      // === POST-LOCK AUDIT (non-blocking) ===
      // Log any items that remain unlocked for debugging, but do NOT revert.
      // The RPC finalize_settlement_secure is the server-side SOT for validation.
      const [segUnlocked, surUnlocked, extUnlocked] = await Promise.all([
        supabase
          .from("host_supply_segments")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", filters.partnerId)
          .is("settlement_id", null)
          .in("unified_booking_id", bookingIds),
        supabase
          .from("host_surcharges")
          .select("id", { count: "exact", head: true })
          .eq("host_partner_id", filters.partnerId)
          .is("settlement_id", null)
          .in("unified_booking_id", bookingIds),
        supabase
          .from("host_extra_charges")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", filters.partnerId)
          .is("settlement_id", null)
          .in("unified_booking_id", bookingIds),
      ]);

      const totalUnlocked = (segUnlocked.count || 0) + (surUnlocked.count || 0) + (extUnlocked.count || 0);
      if (totalUnlocked > 0) {
        console.warn(
          `[Settlement] ${totalUnlocked} item(s) remain unlocked after locking (seg=${segUnlocked.count}, sur=${surUnlocked.count}, ext=${extUnlocked.count}). This may indicate items added after settlement was generated.`
        );
      }

      // Link ONLY SELECTED deposit/prepaid requests to this settlement (cấn trừ)
      // Deposits/prepaids NOT selected will remain unlinked (giữ cọc - thu sau)
      const selectedDepositRequestIds = Array.from(selectedDepositIds);
      const selectedPrepaidRequestIds = Array.from(selectedPrepaidIds);
      const allSelectedRequestIds = [...selectedDepositRequestIds, ...selectedPrepaidRequestIds];

      if (allSelectedRequestIds.length > 0) {
        await supabase
          .from("payment_requests")
          .update({ settlement_id: settlementId })
          .in("id", allSelectedRequestIds);
      }

      // Also update settlement record with effective deposit/prepaid amounts
      await supabase
        .from("host_settlements")
        .update({
          total_deposits_applied: effectiveDepositApplied,
          total_prepaids_applied: effectivePrepaidApplied,
          remaining_amount: effectiveNetPosition,
        })
        .eq("id", settlementId);

      return "SETTLED";
    },
    onSuccess: () => {
      setSettlementStatus("SETTLED");
      toast.success("Đã quyết toán và khóa dữ liệu. Thay đổi phải tạo Adjustment.");
      queryClient.invalidateQueries({ queryKey: ["host-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["host-settlement-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["host-supply-segments"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Close Settlement (SETTLED → CLOSED) - Use secure RPC
  const closeSettlementMutation = useMutation({
    mutationFn: async () => {
      if (!settlementId) throw new Error("Chưa có Settlement");

      // === DEFENSE-IN-DEPTH: Verify all items are still locked before closing ===
      if (settlement && filters) {
        const bookingIds = settlement.bookings.map(b => b.unified_booking_id);

        const { count: unlockedSegments } = await supabase
          .from("host_supply_segments")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", filters.partnerId)
          .is("settlement_id", null)
          .in("unified_booking_id", bookingIds);

        if (unlockedSegments && unlockedSegments > 0) {
          throw new Error(
            `${unlockedSegments} segment(s) đã bị mở khóa. Không thể đóng kỳ. Vui lòng quyết toán lại.`
          );
        }
      }

      // Use secure RPC with server-side permission check
      const { error } = await (supabase.rpc as any)('close_settlement_secure', {
        p_settlement_id: settlementId,
      });

      if (error) {
        // Map permission error to user-friendly message
        if (error.message.includes('quyền')) {
          throw new Error(error.message);
        }
        throw new Error('Lỗi đóng kỳ: ' + error.message);
      }

      return "CLOSED";
    },
    onSuccess: () => {
      setSettlementStatus("CLOSED");
      toast.success("Đã đóng kỳ quyết toán. Không thể tạo Adjustment.");
      queryClient.invalidateQueries({ queryKey: ["host-settlements"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleExportExcel = () => {
    if (!settlement) return;

    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ["SETTLEMENT STATEMENT - QUYẾT TOÁN HOST"],
      [""],
      ["Thông tin chung"],
      ["Mã quyết toán", settlementCode || "(Chưa lưu)"],
      ["Host", settlement.partner?.partner_name || ""],
      ["Kỳ quyết toán", settlement.bookings.length > 0 ? `${formatDate(settlement.bookings.reduce((min: string, b: any) => { const d = b.check_in_date || ""; return d && d < min ? d : min; }, "9999-12-31"))} - ${formatDate(settlement.bookings.reduce((max: string, b: any) => { const d = b.check_out_date || b.actual_check_out_at || ""; return d && d > max ? d : max; }, "0000-01-01"))}` : "—"],
      ["Trạng thái", settlementStatus],
      [""],
      ["KPI Tổng hợp"],
      ["1. Tổng công nợ phát sinh", settlement.summary.totalPayableAmount],
      ["2. Deposit áp dụng (đã chọn cấn trừ)", effectiveDepositApplied],
      ["3. Prepaid áp dụng (đã chọn cấn trừ)", effectivePrepaidApplied],
      ["4. Đã chi (Roomrise trả Host)", settlement.summary.totalPaidAmount],
      ["5. NET POSITION", effectiveNetPosition],
      [""],
      ["Công thức: NET = Công nợ - Host Thu - Đã chi - Deposit cấn trừ - Prepaid cấn trừ - Thu lại từ Host"],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Tổng hợp");

    // Bookings sheet
    const bookingsData = [
      ["Mã Booking", "Khách", "Chỗ nghỉ", "Nhận phòng", "Trả phòng", "Số đêm", "Đơn giá/đêm", "Phát sinh"],
      ...settlement.bookings.map(b => {
        const checkIn = new Date(b.check_in_date || "");
        const checkOut = new Date(b.actual_check_out_at || b.check_out_date || "");
        const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
        const nightlyRate = b.host_cost ? b.host_cost / nights : 0;
        return [
          formatBookingCode(b.unified_booking_id, b.ota_booking_code, b.source, b.check_in_date),
          b.guest_name || "",
          b.host_property_name || "",
          formatDate(b.check_in_date),
          formatDate(b.actual_check_out_at || b.check_out_date),
          nights,
          nightlyRate,
          b.host_cost || 0,
        ];
      }),
    ];
    const bookingsSheet = XLSX.utils.aoa_to_sheet(bookingsData);
    XLSX.utils.book_append_sheet(workbook, bookingsSheet, "Chi tiết Booking");

    const fileName = `Settlement_${settlementCode || "Draft"}_${settlement.partner?.partner_name?.replace(/\s+/g, "_") || "Host"}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Đã xuất Excel");
  };

  const isLocked = settlementStatus === "SETTLED" || settlementStatus === "CLOSED" || settlementStatus === "VOID";
  const isClosed = settlementStatus === "CLOSED";
  const isVoid = settlementStatus === "VOID";

  return (
    <>
      <Header
        title="Quyết toán Host"
        subtitle="Chốt số công nợ cuối cùng giữa Roomrise và Host"
      />

      <PageContainer><SectionCard>
        {/* A. Chọn Host */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              A. Chọn Host
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[250px] max-w-md">
                <Label>Host</Label>
                <Popover open={hostSearchOpen} onOpenChange={setHostSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={hostSearchOpen}
                      disabled={isLocked}
                      className={cn(
                        "w-full justify-between font-normal",
                        !selectedPartnerId && "text-muted-foreground"
                      )}
                    >
                      {selectedPartnerId
                        ? partners?.find((p) => p.id === selectedPartnerId)?.partner_name
                        : "Chọn Host..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm tên Host..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy Host</CommandEmpty>
                        <CommandGroup>
                          {partnersLoading ? (
                            <CommandItem disabled>Đang tải...</CommandItem>
                          ) : (
                            partners?.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.partner_name}
                                onSelect={() => handleSelectHost(p.id)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedPartnerId === p.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {p.partner_name}
                              </CommandItem>
                            ))
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedPartnerId && (
                <div className="text-sm text-muted-foreground">
                  {unsettledLoading ? (
                    <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Đang tải...</span>
                  ) : (
                    <span>{unsettledBookings?.length || 0} booking chưa quyết toán</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* B. Danh sách booking chưa quyết toán — chọn để tạo phiếu */}
        {selectedPartnerId && !filters && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                B. Chọn booking để quyết toán
                {selectedBookingIds.size > 0 && (
                  <Badge variant="secondary" className="ml-2">{selectedBookingIds.size} đã chọn</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unsettledLoading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2">Đang tải danh sách booking...</span>
                </div>
              ) : !unsettledBookings || unsettledBookings.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success" />
                  <p className="font-medium">Tất cả booking đã được quyết toán</p>
                  <p className="text-sm mt-1">Không có booking nào chưa quyết toán cho host này.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-3 py-2 text-center w-10">
                            <Checkbox
                              checked={unsettledBookings.length > 0 && selectedBookingIds.size === unsettledBookings.length}
                              onCheckedChange={toggleAllBookings}
                            />
                          </th>
                          <th className="px-3 py-2 text-left font-medium">Mã Booking</th>
                          <th className="px-3 py-2 text-left font-medium">Khách</th>
                          <th className="px-3 py-2 text-left font-medium">Chỗ nghỉ</th>
                          <th className="px-3 py-2 text-center font-medium">Nhận phòng</th>
                          <th className="px-3 py-2 text-center font-medium">Trả phòng</th>
                          <th className="px-3 py-2 text-right font-medium">Công nợ Host</th>
                          <th className="px-3 py-2 text-center font-medium">Segments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {unsettledBookings.map(b => (
                          <tr
                            key={b.unified_booking_id}
                            className={cn(
                              "hover:bg-muted/20 cursor-pointer transition-colors",
                              selectedBookingIds.has(b.unified_booking_id) && "bg-primary/5"
                            )}
                            onClick={() => toggleBooking(b.unified_booking_id)}
                          >
                            <td className="px-3 py-2 text-center">
                              <Checkbox
                                checked={selectedBookingIds.has(b.unified_booking_id)}
                                onCheckedChange={() => toggleBooking(b.unified_booking_id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-medium text-primary">
                                {formatBookingCode(b.unified_booking_id, b.ota_booking_code, b.source, b.check_in_date)}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{b.guest_name || "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="text-xs">{b.host_property_name || "—"}</span>
                              {b.host_room_type && (
                                <span className="text-xs text-muted-foreground ml-1">({b.host_room_type})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-sm">{formatDate(b.check_in_date)}</td>
                            <td className="px-3 py-2 text-center text-sm">{formatDate(b.check_out_date)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-primary">
                              {formatCurrency(b.host_cost)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {b.settled_segment_count > 0 ? (
                                <Badge variant="outline" className="text-xs bg-warning/5 text-warning border-warning/30">
                                  {b.segment_count - b.settled_segment_count}/{b.segment_count}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  {b.segment_count}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {selectedBookingIds.size > 0 && (
                        <tfoot className="border-t-2">
                          <tr className="bg-muted/30 font-semibold">
                            <td colSpan={6} className="px-3 py-2 text-right">
                              Tổng công nợ ({selectedBookingIds.size} booking)
                            </td>
                            <td className="px-3 py-2 text-right text-primary text-kpi tabular-nums font-semibold">
                              {formatCurrency(
                                unsettledBookings
                                  .filter(b => selectedBookingIds.has(b.unified_booking_id))
                                  .reduce((sum, b) => sum + b.host_cost, 0)
                              )}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  <div className="flex justify-end mt-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={selectedBookingIds.size === 0 || isLoading}
                      size="lg"
                    >
                      {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Tạo phiếu quyết toán ({selectedBookingIds.size} booking)
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Settlement List Button */}
        {selectedPartnerId && (
          <div className="flex justify-end">
            <SettlementListDialog
              settlements={existingSettlements || []}
              isLoading={settlementsLoading}
              partnerName={partners?.find(p => p.id === selectedPartnerId)?.partner_name}
            />
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-destructive">Lỗi: {(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <Card>
            <CardContent className="py-16 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3">Đang tải dữ liệu...</span>
            </CardContent>
          </Card>
        )}

        {settlement && (
          <div className="space-y-4">
            {/* Settlement Header Info */}
            <Card className="border-2 border-primary/30">
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-heading-3 font-semibold tracking-tight">
                        {settlementCode || "Settlement mới"}
                      </h2>
                      {getSettlementStatusBadge(settlementStatus)}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {settlement.partner?.partner_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {settlement.bookings.length > 0 ? (
                          <>
                            {formatDate(settlement.bookings.reduce((min, b) => {
                              const d = b.check_in_date || "";
                              return d && d < min ? d : min;
                            }, "9999-12-31"))} - {formatDate(settlement.bookings.reduce((max, b) => {
                              const d = b.check_out_date || b.actual_check_out_at || "";
                              return d && d > max ? d : max;
                            }, "0000-01-01"))}
                          </>
                        ) : "—"}
                        <Badge variant="secondary" className="text-xs ml-1">{settlement.bookings.length} booking</Badge>
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        Ngày lập: {formatDate(new Date().toISOString())}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!settlementId && (
                      <PermissionGate
                        page="/host-payables/settlement"
                        require="can_use"
                        fallback="disable"
                        disabledMessage="Bạn không có quyền lưu settlement"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => saveSettlementMutation.mutate()}
                          disabled={saveSettlementMutation.isPending}
                        >
                          {saveSettlementMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Lưu Settlement
                        </Button>
                      </PermissionGate>
                    )}
                    {settlementId && settlementStatus === "DRAFT" && (
                      <PermissionGate
                        page="/host-payables/settlement"
                        require="can_use"
                        fallback="disable"
                        disabledMessage="Bạn không có quyền quyết toán"
                      >
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => finalizeSettlementMutation.mutate()}
                          disabled={finalizeSettlementMutation.isPending}
                        >
                          {finalizeSettlementMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="mr-2 h-4 w-4" />
                          )}
                          Quyết toán
                        </Button>
                      </PermissionGate>
                    )}
                    {settlementId && settlementStatus === "SETTLED" && (
                      <PermissionGate
                        page="/host-payables/settlement"
                        require="can_use"
                        fallback="disable"
                        disabledMessage="Bạn không có quyền đóng kỳ"
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => closeSettlementMutation.mutate()}
                          disabled={closeSettlementMutation.isPending}
                        >
                          {closeSettlementMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Lock className="mr-2 h-4 w-4" />
                          )}
                          Đóng kỳ
                        </Button>
                      </PermissionGate>
                    )}
                    <Button variant="outline" size="sm" onClick={handleExportExcel}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Xuất Excel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* B. KPI Tổng hợp - 7 số chính */}
            <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-muted/30">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />B. KPI Tổng hợp (Chỉ có ở trang này)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 auto-rows-fr">
                  {/* 1. Tổng công nợ phát sinh */}
                  <div className="p-4 rounded-lg bg-warning/10 border-2 border-warning/40 h-full min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={1} variant="warning" />
                      <p className="text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 text-warning">Tổng công nợ phát sinh</p>
                    </div>
                    <InlineKpiValue value={formatCurrency(settlement.summary.totalPayableAmount)} tone="warning" />
                    <p className="text-xs text-warning mt-1 line-clamp-2 min-w-0">SUM(amount_payable)</p>
                  </div>

                  {/* 2. Host Thu (Host đã thu từ khách) - Giảm công nợ */}
                  <div className="p-4 rounded-lg bg-info/10 border-2 border-info/20 h-full min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={2} variant="info" />
                      <p className="text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 text-info">Host Thu (từ khách)</p>
                    </div>
                    <InlineKpiValue value={formatCurrency(settlement.summary.totalHostCollected)} tone="info" />
                    <p className="text-xs text-info mt-1 line-clamp-2 min-w-0">Host thu trực tiếp</p>
                  </div>

                  {/* 3. Deposit cấn trừ (user chọn) */}
                  <div className="p-4 rounded-lg bg-warning/10 border-2 border-warning/40 h-full min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={3} variant="warning" />
                      <p className="text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 text-warning">Deposit cấn trừ</p>
                    </div>
                    <InlineKpiValue value={formatCurrency(effectiveDepositApplied)} tone="warning" />
                    <p className="text-xs text-warning mt-1 line-clamp-2 min-w-0">{selectedDepositIds.size}/{paidDeposits.length} đã chọn</p>
                  </div>

                  {/* 4. Prepaid cấn trừ (user chọn) */}
                  <div className="p-4 rounded-lg bg-warning/10 border-2 border-warning/40 h-full min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={4} variant="warning" />
                      <p className="text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 text-warning">Prepaid cấn trừ</p>
                    </div>
                    <InlineKpiValue value={formatCurrency(effectivePrepaidApplied)} tone="warning" />
                    <p className="text-xs text-warning mt-1 line-clamp-2 min-w-0">{selectedPrepaidIds.size}/{paidPrepaids.length} đã chọn</p>
                  </div>

                  {/* 5. Đã chi (read-only reference) */}
                  <div className="p-4 rounded-lg bg-success/10 border-2 border-success/40 h-full min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={5} variant="success" />
                      <p className="text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 text-success">Đã chi (Read-only)</p>
                    </div>
                    <InlineKpiValue value={formatCurrency(settlement.summary.totalPaidAmount)} tone="success" />
                    <p className="text-xs text-success mt-1 line-clamp-2 min-w-0">SUM(payments.amount)</p>
                  </div>

                  {/* 6. Đã thu lại từ Host - POSITIVE value (Host → Roomrise) */}
                  <div className="p-4 rounded-lg bg-primary/10 border-2 border-primary/20 h-full min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={6} variant="primary" />
                      <p className="text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 text-primary">Thu lại từ Host</p>
                    </div>
                    <InlineKpiValue value={`+${formatCurrency(settlement.summary.totalCollectedFromHost)}`} tone="primary" />
                    <p className="text-xs text-primary mt-1 line-clamp-2 min-w-0">Host → Roomrise</p>
                  </div>

                  {/* 7. NET POSITION */}
                  <div className={`p-4 rounded-lg border-2 h-full min-w-0 overflow-hidden ${effectiveNetPosition > 0
                    ? "bg-destructive/10 border-destructive shadow-lg"
                    : effectiveNetPosition < 0
                      ? "bg-primary/10 border-primary shadow-lg"
                      : "bg-success/10 border-success/40"
                    }`}>
                    <div className="flex items-start gap-2 min-w-0">
                      <KpiIndexBadge index={7} variant={effectiveNetPosition > 0 ? "danger" : effectiveNetPosition < 0 ? "primary" : "success"} />
                      <p className={`text-sm font-semibold leading-5 line-clamp-2 break-words min-w-0 flex-1 ${effectiveNetPosition > 0 ? "text-destructive" :
                        effectiveNetPosition < 0 ? "text-primary" : "text-success"
                        }`}>
                        NET POSITION
                      </p>
                    </div>
                    <InlineKpiValue
                      value={formatCurrency(Math.abs(effectiveNetPosition))}
                      tone={effectiveNetPosition > 0 ? "danger" : effectiveNetPosition < 0 ? "primary" : "success"}
                    />
                    <p className={`text-xs mt-1 font-medium line-clamp-2 min-w-0 ${effectiveNetPosition > 0 ? "text-destructive" :
                      effectiveNetPosition < 0 ? "text-primary" : "text-success"
                      }`}>
                      {effectiveNetPosition > 0
                        ? "→ RR còn nợ Host"
                        : effectiveNetPosition < 0
                          ? "→ Host phải trả RR"
                          : "✓ Đã cân bằng"
                      }
                    </p>
                  </div>
                </div>

                {/* NET Formula - Updated */}
                <div className="mt-4 p-3 bg-muted rounded-lg border border-border font-mono text-sm">
                  <p className="text-foreground">
                    <strong>Công thức:</strong> NET = Công nợ ({formatCurrency(settlement.summary.totalPayableAmount)})
                    − Host thu từ khách ({formatCurrency(settlement.summary.totalHostCollected)})
                    − Deposit cấn trừ ({formatCurrency(effectiveDepositApplied)})
                    − Prepaid cấn trừ ({formatCurrency(effectivePrepaidApplied)})
                    − Đã chi ({formatCurrency(settlement.summary.totalPaidAmount)})
                    − Thu lại từ Host (+{formatCurrency(settlement.summary.totalCollectedFromHost)})
                    = <span className={`font-bold ${effectiveNetPosition > 0 ? "text-destructive" :
                      effectiveNetPosition < 0 ? "text-primary" : "text-success"
                      }`}>{formatCurrency(effectiveNetPosition)}</span>
                  </p>
                </div>

                <Alert variant="default" className="mt-4 border-primary/20 bg-primary/5">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-primary text-sm">
                    <strong>NET POSITION là con số duy nhất dùng cho kế toán.</strong> Deposit/Prepaid chỉ được áp dụng tại trang này.
                  </AlertDescription>
                </Alert>

                {/* Collection Summary Reference */}
                <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
                  <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><FileText className="h-4 w-4 text-muted-foreground" />Tham chiếu: Trạng thái thu tiền từ khách</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded bg-success/5 border border-success/20">
                      <p className="text-xs text-success font-medium">Roomrise đã thu</p>
                      <p className="text-kpi font-semibold tabular-nums tracking-tight text-success">{formatCurrency(settlement.summary.totalRoomriseCollected)}</p>
                    </div>
                    <div className="p-3 rounded bg-warning/5 border border-warning/20">
                      <p className="text-xs text-warning font-medium">Host thu trực tiếp</p>
                      <p className="text-kpi font-semibold tabular-nums tracking-tight text-warning">{formatCurrency(settlement.summary.totalHostCollected)}</p>
                    </div>
                    <div className="p-3 rounded bg-primary/5 border border-primary/20">
                      <p className="text-xs text-primary font-medium">Tổng đã thu từ khách</p>
                      <p className="text-kpi font-semibold tabular-nums tracking-tight text-primary">
                        {formatCurrency(settlement.summary.totalRoomriseCollected + settlement.summary.totalHostCollected)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    * <strong>Host thu trực tiếp</strong> được trừ vào NET vì Host đã nhận tiền từ khách, Roomrise không cần trả khoản đó cho Host.
                    <br />* <strong>Roomrise thu</strong> chỉ là tham chiếu, không ảnh hưởng đến công nợ.
                  </p>
                </div>

                {/* Host Refunds Section - Đã thu lại từ Host */}
                {settlement.summary.totalCollectedFromHost > 0 && (
                  <div className="mt-4 p-4 rounded-lg bg-primary/100/5 border border-primary/20">
                    <p className="text-sm font-semibold text-primary mb-3 flex items-center gap-1.5"><Wallet className="h-4 w-4" />Lịch sử thu lại từ Host ({settlement.hostRefunds.length} giao dịch)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-primary/20 bg-primary/100/10">
                            <th className="px-3 py-2 text-left font-medium text-primary">Ngày thu</th>
                            <th className="px-3 py-2 text-left font-medium text-primary">Booking</th>
                            <th className="px-3 py-2 text-left font-medium text-primary">Loại</th>
                            <th className="px-3 py-2 text-right font-medium text-primary">Số tiền</th>
                            <th className="px-3 py-2 text-left font-medium text-primary">Hình thức</th>
                            <th className="px-3 py-2 text-left font-medium text-primary">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-primary/10">
                          {settlement.hostRefunds.map((refund) => {
                            const refundBooking = settlement.bookings.find(b => b.unified_booking_id === refund.unified_booking_id);
                            return (
                              <tr key={refund.id} className="hover:bg-primary/100/5">
                                <td className="px-3 py-2 text-primary">{formatDateTime(refund.collected_at)}</td>
                                <td className="px-3 py-2">
                                  <Link
                                    to={`/bookings/${refund.unified_booking_id}`}
                                    className="text-primary hover:underline font-medium"
                                  >
                                    {formatBookingCode(refund.unified_booking_id, refundBooking?.ota_booking_code, refundBooking?.source, refundBooking?.check_in_date)}
                                  </Link>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className="bg-primary/100/10 text-primary border-primary/30 text-xs">
                                    {refund.collection_type === "REFUND" ? "Hoàn tiền" : refund.collection_type}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-primary">
                                  {formatCurrency(refund.amount_collected)}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {refund.payment_method === "BANK_TRANSFER" ? "CK" :
                                      refund.payment_method === "CASH" ? "Tiền mặt" : refund.payment_method}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground text-xs">{refund.note || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t-2 border-primary/30">
                          <tr className="bg-primary/100/10 font-semibold">
                            <td colSpan={3} className="px-3 py-2 text-right text-primary">Tổng đã thu lại từ Host</td>
                            <td className="px-3 py-2 text-right text-primary text-kpi tabular-nums font-semibold">
                              {formatCurrency(settlement.summary.totalCollectedFromHost)}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-xs text-primary mt-2">
                      * Số tiền này đã được trừ vào NET POSITION. Host đã hoàn trả cho Roomrise.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* C. Danh sách Segment chi tiết (Read-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />C. Chi tiết Segment trong Settlement ({settlement.segments.length} segment)
                  {isLocked && <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5"><Lock className="h-3 w-3 mr-1" />Read-only</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {settlement.segments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Không có segment trong kỳ này</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium">Mã Booking</th>
                          <th className="px-3 py-2 text-left font-medium">Mã căn hộ</th>
                          <th className="px-3 py-2 text-left font-medium">Loại phòng</th>
                          <th className="px-3 py-2 text-center font-medium">Ngày In</th>
                          <th className="px-3 py-2 text-center font-medium">Ngày Out</th>
                          <th className="px-3 py-2 text-center font-medium">Đêm</th>
                          <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                          <th className="px-3 py-2 text-right font-medium">Phát sinh</th>
                          <th className="px-3 py-2 text-left font-medium">Ai thu tiền</th>
                          <th className="px-3 py-2 text-left font-medium">Ai trả Host</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {settlement.segments.map((segment) => {
                          // Find booking info for this segment
                          const booking = settlement.bookings.find(b => b.unified_booking_id === segment.unified_booking_id);
                          // Find collections for this booking
                          const bookingCollections = settlement.collections.filter(c => c.unified_booking_id === segment.unified_booking_id);
                          const hostCollected = bookingCollections.filter(c => c.payee_type === "HOST").reduce((sum, c) => sum + c.amount_collected, 0);
                          const roomriseCollected = bookingCollections.filter(c => c.payee_type === "ROOMRISE").reduce((sum, c) => sum + c.amount_collected, 0);

                          // Determine who collects money
                          let aiThuTien = "—";
                          if (booking?.payment_type === "OTA_COLLECT") {
                            aiThuTien = "OTA → Roomrise";
                          } else if (hostCollected > 0 && roomriseCollected > 0) {
                            aiThuTien = "Khách → Host + RR";
                          } else if (hostCollected > 0) {
                            aiThuTien = "Khách → Host";
                          } else if (roomriseCollected > 0) {
                            aiThuTien = "Khách → Roomrise";
                          } else {
                            aiThuTien = "Chưa thu";
                          }

                          // Determine who pays host
                          let aiTraHost = "Roomrise → Host";
                          if (hostCollected >= segment.total_amount) {
                            aiTraHost = "Host đã thu đủ";
                          } else if (hostCollected > 0) {
                            aiTraHost = `RR trả ${formatCurrency(segment.total_amount - hostCollected)}`;
                          }

                          return (
                            <tr key={segment.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <Link
                                  to={`/bookings/${segment.unified_booking_id}`}
                                  className="text-primary hover:underline font-medium"
                                >
                                  {formatBookingCode(segment.unified_booking_id, booking?.ota_booking_code, booking?.source, booking?.check_in_date)}
                                </Link>
                                {booking?.guest_name && (
                                  <p className="text-xs text-muted-foreground">{booking.guest_name}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-sm">
                                {segment.room_code || <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="font-medium">{segment.host_room_type || "—"}</span>
                                {segment.host_property_name && (
                                  <span className="text-xs text-muted-foreground ml-1">({segment.host_property_name})</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center text-sm">{formatDate(segment.date_from)}</td>
                              <td className="px-3 py-2 text-center text-sm">{formatDate(segment.date_to)}</td>
                              <td className="px-3 py-2 text-center">
                                <Badge variant="secondary">{segment.nights}</Badge>
                              </td>
                              <td className="px-3 py-2 text-right text-sm">{formatCurrency(segment.nightly_rate)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-primary">
                                {formatCurrency(segment.total_amount)}
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-xs ${aiThuTien.includes("Host") ? "bg-warning/5 text-warning border-warning/30" :
                                  aiThuTien.includes("Roomrise") ? "bg-success/5 text-success border-success/30" :
                                    aiThuTien.includes("OTA") ? "bg-primary/5 text-primary border-primary/30" :
                                      "bg-muted text-muted-foreground border-border"
                                  }`}>
                                  {aiThuTien}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-xs ${aiTraHost.includes("đủ") ? "bg-success/5 text-success border-success/30" :
                                  "bg-primary/5 text-primary border-primary/30"
                                  }`}>
                                  {aiTraHost}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2">
                        <tr className="bg-muted/30 font-semibold">
                          <td colSpan={7} className="px-3 py-2 text-right">Tổng cộng</td>
                          <td className="px-3 py-2 text-right text-primary text-kpi tabular-nums font-semibold">
                            {formatCurrency(settlement.summary.totalSegmentCost)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* C2. Phụ phí & Chi phí bổ sung (Surcharges + Extra Charges) */}
            {(settlement.surcharges.length > 0 || settlement.extraCharges.length > 0) && (
              <Card className="border border-warning/30">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-warning" />C2. Phụ phí &amp; Chi phí bổ sung ({settlement.surcharges.length + settlement.extraCharges.length} khoản)
                    {isLocked && <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5"><Lock className="h-3 w-3 mr-1" />Read-only</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-warning/10">
                          <th className="px-3 py-2 text-left font-medium text-warning">Mã Booking</th>
                          <th className="px-3 py-2 text-left font-medium text-warning">Loại</th>
                          <th className="px-3 py-2 text-left font-medium text-warning">Mô tả</th>
                          <th className="px-3 py-2 text-right font-medium text-warning">Số tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {settlement.surcharges.map((surcharge) => {
                          const booking = settlement.bookings.find(b => b.unified_booking_id === surcharge.unified_booking_id);
                          return (
                            <tr key={surcharge.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <Link
                                  to={`/bookings/${surcharge.unified_booking_id}`}
                                  className="text-primary hover:underline font-medium text-xs"
                                >
                                  {formatBookingCode(surcharge.unified_booking_id, booking?.ota_booking_code, booking?.source, booking?.check_in_date)}
                                </Link>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs bg-warning/5 text-warning border-warning/30">
                                  Phụ thu: {surcharge.surcharge_type}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{surcharge.description || "—"}</td>
                              <td className="px-3 py-2 text-right font-semibold text-warning">{formatCurrency(surcharge.amount)}</td>
                            </tr>
                          );
                        })}
                        {settlement.extraCharges.map((extra) => {
                          const booking = settlement.bookings.find(b => b.unified_booking_id === extra.unified_booking_id);
                          return (
                            <tr key={extra.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <Link
                                  to={`/bookings/${extra.unified_booking_id}`}
                                  className="text-primary hover:underline font-medium text-xs"
                                >
                                  {formatBookingCode(extra.unified_booking_id, booking?.ota_booking_code, booking?.source, booking?.check_in_date)}
                                </Link>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/30">
                                  Chi phí: {extra.charge_type}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{extra.note || "—"}</td>
                              <td className="px-3 py-2 text-right font-semibold text-warning">{formatCurrency(extra.amount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2">
                        <tr className="bg-warning/10 font-semibold">
                          <td colSpan={3} className="px-3 py-2 text-right text-warning">Tổng phụ phí</td>
                          <td className="px-3 py-2 text-right text-warning text-kpi tabular-nums font-semibold">
                            {formatCurrency(settlement.summary.totalSurcharges + settlement.summary.totalExtraCharges)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* D. Deposit & Prepaid — Chọn cấn trừ hoặc giữ lại */}
            <Card className="border border-warning/30 bg-card">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2"><Wallet className="h-5 w-5 text-warning" />D. Deposit & Prepaid — Chọn cấn trừ</span>
                  <AppLink to="/host-deposits" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Quản lý cọc & trả trước
                  </AppLink>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Tick = cấn trừ vào NET &nbsp;&nbsp;|&nbsp;&nbsp; Không tick = giữ cọc, thu lại sau qua trang Quản lý cọc
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Deposits */}
                  <div className="p-4 rounded-lg border border-warning/30 bg-warning/5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-warning flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-warning" />
                        Deposit
                      </h4>
                      {paidDeposits.length > 0 && !isLocked && (
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={selectAllDeposits}>
                            Chọn hết
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={clearAllDeposits}>
                            Bỏ chọn
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="space-y-2 text-sm mb-3">
                      {(settlement.summary.depositsPending + settlement.summary.depositsApproved) > 0 && (
                        <div className="flex justify-between p-2 bg-warning/10 rounded border border-warning/20">
                          <span className="text-warning">Chờ duyệt/Đã duyệt</span>
                          <span className="font-bold text-warning">{formatCurrency(settlement.summary.depositsPending + settlement.summary.depositsApproved)}</span>
                        </div>
                      )}
                      <div className="flex justify-between p-2 bg-success/10 rounded border border-success/20">
                        <span className="text-success">Đã chi (PAID) — có thể cấn trừ</span>
                        <span className="font-bold text-success">{formatCurrency(settlement.summary.depositsPaid)}</span>
                      </div>
                      {effectiveDepositApplied > 0 && (
                        <div className="flex justify-between p-2 bg-primary/10 rounded border border-primary/30">
                          <span className="text-primary font-medium">→ Đã chọn cấn trừ</span>
                          <span className="font-bold text-primary">{formatCurrency(effectiveDepositApplied)}</span>
                        </div>
                      )}
                    </div>

                    {/* Deposit List with checkboxes */}
                    {settlement.deposits.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">Chưa có deposit</p>
                    ) : (
                      <div className="space-y-1.5">
                        {settlement.deposits.map((d) => {
                          const isPaid = d.status === "PAID";
                          const isSelected = selectedDepositIds.has(d.id);
                          return (
                            <div key={d.id} className={`flex items-center gap-2 p-2 rounded text-xs border ${isSelected ? "bg-primary/5 border-primary/30" : "bg-white/80 border-border"
                              }`}>
                              {/* Checkbox — only for PAID, only when not locked */}
                              {isPaid && !isLocked ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleDeposit(d.id)}
                                  className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                                />
                              ) : (
                                <div className="w-4" />
                              )}
                              <div className="flex-1 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`text-micro ${d.status === "PAID" ? "bg-success/5 text-success border-success/30" :
                                    d.status === "APPROVED" ? "bg-primary/5 text-primary border-primary/30" :
                                      d.status === "PENDING" ? "bg-warning/5 text-warning border-warning/30" :
                                        "bg-destructive/5 text-destructive border-destructive/30"
                                    }`}>
                                    {d.status === "PAID" ? "Đã chi" :
                                      d.status === "APPROVED" ? "Đã duyệt" :
                                        d.status === "PENDING" ? "Chờ duyệt" : "Từ chối"}
                                  </Badge>
                                  {isSelected && <Badge className="text-micro bg-primary text-white">Cấn trừ</Badge>}
                                  <span className="font-medium text-warning">{formatCurrency(d.total_paid || d.proposed_amount)}</span>
                                  <span className="text-muted-foreground">{d.request_code}</span>
                                </div>
                                <span className="text-muted-foreground">{formatDate(d.requested_at)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Prepaids */}
                  <div className="p-4 rounded-lg border border-warning/30 bg-warning/5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-warning flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-warning" />
                        Prepaid
                      </h4>
                      {paidPrepaids.length > 0 && !isLocked && (
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={selectAllPrepaids}>
                            Chọn hết
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={clearAllPrepaids}>
                            Bỏ chọn
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="space-y-2 text-sm mb-3">
                      {(settlement.summary.prepaidsPending + settlement.summary.prepaidsApproved) > 0 && (
                        <div className="flex justify-between p-2 bg-warning/10 rounded border border-warning/20">
                          <span className="text-warning">Chờ duyệt/Đã duyệt</span>
                          <span className="font-bold text-warning">{formatCurrency(settlement.summary.prepaidsPending + settlement.summary.prepaidsApproved)}</span>
                        </div>
                      )}
                      <div className="flex justify-between p-2 bg-success/10 rounded border border-success/20">
                        <span className="text-success">Đã chi (PAID) — có thể cấn trừ</span>
                        <span className="font-bold text-success">{formatCurrency(settlement.summary.prepaidsPaid)}</span>
                      </div>
                      {effectivePrepaidApplied > 0 && (
                        <div className="flex justify-between p-2 bg-primary/10 rounded border border-primary/30">
                          <span className="text-primary font-medium">→ Đã chọn cấn trừ</span>
                          <span className="font-bold text-primary">{formatCurrency(effectivePrepaidApplied)}</span>
                        </div>
                      )}
                    </div>

                    {/* Prepaid List with checkboxes */}
                    {settlement.prepaids.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">Chưa có prepaid</p>
                    ) : (
                      <div className="space-y-1.5">
                        {settlement.prepaids.map((p) => {
                          const isPaid = p.status === "PAID";
                          const isSelected = selectedPrepaidIds.has(p.id);
                          return (
                            <div key={p.id} className={`flex items-center gap-2 p-2 rounded text-xs border ${isSelected ? "bg-primary/5 border-primary/30" : "bg-white/80 border-border"
                              }`}>
                              {isPaid && !isLocked ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePrepaid(p.id)}
                                  className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                                />
                              ) : (
                                <div className="w-4" />
                              )}
                              <div className="flex-1 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`text-micro ${p.status === "PAID" ? "bg-success/5 text-success border-success/30" :
                                    p.status === "APPROVED" ? "bg-primary/5 text-primary border-primary/30" :
                                      p.status === "PENDING" ? "bg-warning/5 text-warning border-warning/30" :
                                        "bg-destructive/5 text-destructive border-destructive/30"
                                    }`}>
                                    {p.status === "PAID" ? "Đã chi" :
                                      p.status === "APPROVED" ? "Đã duyệt" :
                                        p.status === "PENDING" ? "Chờ duyệt" : "Từ chối"}
                                  </Badge>
                                  {isSelected && <Badge className="text-micro bg-primary text-white">Cấn trừ</Badge>}
                                  <span className="font-medium text-warning">{formatCurrency(p.total_paid || p.proposed_amount)}</span>
                                  <span className="text-muted-foreground">{p.request_code}</span>
                                </div>
                                <span className="text-muted-foreground">{formatDate(p.requested_at)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* E. Payment Reference (Read-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />E. Lịch sử thanh toán (Read-only - {settlement.payments.length} giao dịch)
                  <AppLink to="/host-payables" className="text-xs text-primary hover:underline flex items-center gap-1 ml-auto">
                    <ExternalLink className="h-3 w-3" />
                    Xem Thanh toán Host
                  </AppLink>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {settlement.payments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">Chưa có thanh toán. Vui lòng thực hiện tại module <strong>Thanh toán Host</strong>.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium">Ngày</th>
                          <th className="px-3 py-2 text-left font-medium">Booking</th>
                          <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                          <th className="px-3 py-2 text-left font-medium">Hình thức</th>
                          <th className="px-3 py-2 text-left font-medium">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {settlement.payments.map((payment) => {
                          const paymentBooking = settlement.bookings.find(b => b.unified_booking_id === payment.unified_booking_id);
                          return (
                            <tr key={payment.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">{formatDateTime(payment.paid_at)}</td>
                              <td className="px-3 py-2">
                                {formatBookingCode(payment.unified_booking_id, paymentBooking?.ota_booking_code, paymentBooking?.source, paymentBooking?.check_in_date)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-success">
                                {formatCurrency(payment.amount)}
                              </td>
                              <td className="px-3 py-2">
                                <StatusBadge variant="info">
                                  {payment.payment_method === "BANK_TRANSFER" ? "CK" : payment.payment_method}
                                </StatusBadge>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{payment.note || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2">
                        <tr className="bg-muted/30 font-semibold">
                          <td colSpan={2} className="px-3 py-2 text-right">Tổng đã chi</td>
                          <td className="px-3 py-2 text-right text-success">
                            {formatCurrency(settlement.payments.reduce((sum, p) => sum + p.amount, 0))}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* F. Audit & Kết luận */}
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {effectiveNetPosition === 0 ? (
                    <CheckCircle className="h-5 w-5 text-success" />
                  ) : effectiveNetPosition > 0 ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-primary" />
                  )}
                  F. Kết luận quyết toán
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`p-4 rounded-lg text-center ${effectiveNetPosition === 0
                  ? "bg-success/5 border-2 border-success/40"
                  : effectiveNetPosition > 0
                    ? "bg-destructive/5 border-2 border-destructive/40"
                    : "bg-primary/100/5 border-2 border-primary/20"
                  }`}>
                  <InlineKpiValue
                    value={
                      effectiveNetPosition === 0
                        ? "ĐÃ CÂN BẰNG"
                        : effectiveNetPosition > 0
                          ? "ROOMRISE CÒN NỢ HOST"
                          : "HOST PHẢI TRẢ LẠI ROOMRISE"
                    }
                    tone={effectiveNetPosition === 0 ? "success" : effectiveNetPosition > 0 ? "danger" : "primary"}
                  />
                  <InlineKpiValue
                    value={formatCurrency(Math.abs(effectiveNetPosition))}
                    tone={effectiveNetPosition === 0 ? "success" : effectiveNetPosition > 0 ? "danger" : "primary"}
                    className="mt-2"
                  />
                </div>

                {/* Deposit chưa cấn trừ reminder */}
                {(paidDeposits.length - selectedDepositIds.size > 0 || paidPrepaids.length - selectedPrepaidIds.size > 0) && (
                  <div className="mt-4 p-3 bg-warning/5 rounded-lg border border-warning/20 text-sm text-warning">
                    <p className="flex items-start gap-1.5"><Lightbulb className="h-4 w-4 shrink-0 mt-0.5" /><span><strong>Lưu ý:</strong> Có {paidDeposits.length - selectedDepositIds.size} deposit và {paidPrepaids.length - selectedPrepaidIds.size} prepaid PAID chưa được chọn cấn trừ.
                      Những khoản này sẽ giữ nguyên để thu lại sau qua trang <AppLink to="/host-deposits" className="underline font-medium">Quản lý cọc & trả trước</AppLink>.</span></p>
                  </div>
                )}

                {isVoid && (
                  <div className="mt-4 p-3 bg-destructive/5 rounded-lg border border-destructive/20 text-sm text-destructive">
                    <p className="flex items-start gap-1.5"><Lock className="h-4 w-4 shrink-0 mt-0.5" /><span><strong>Phiếu quyết toán đã bị hủy.</strong> Các segments đã được mở khóa và có thể quyết toán lại.</span></p>
                  </div>
                )}
                {isLocked && !isVoid && (
                  <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm text-primary">
                    <p className="flex items-start gap-1.5"><Lock className="h-4 w-4 shrink-0 mt-0.5" /><span><strong>Dữ liệu đã khóa.</strong> Mọi thay đổi phải thông qua <strong>Adjustment Settlement</strong>.</span></p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {!settlement && !isLoading && !error && !selectedPartnerId && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-base font-medium mb-2">Chọn Host để bắt đầu</h3>
              <p className="text-muted-foreground">
                Chọn Host ở trên, sau đó chọn các booking cần quyết toán
              </p>
            </CardContent>
          </Card>
        )}
      </SectionCard></PageContainer>
    </>
  );
}

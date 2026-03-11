import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";

export type NoShowReason =
  | "GUEST_NO_ARRIVAL"
  | "LATE_ARRIVAL_CONFIRMED"
  | "UNREACHABLE_GUEST"
  | "OTHER";

export const NO_SHOW_REASON_LABELS: Record<NoShowReason, string> = {
  GUEST_NO_ARRIVAL: "Khách không đến",
  LATE_ARRIVAL_CONFIRMED: "Đến muộn (đã xác nhận)",
  UNREACHABLE_GUEST: "Không liên lạc được",
  OTHER: "Lý do khác",
};

export interface NoShowRecord {
  id: string;
  unified_booking_id: string;
  no_show_date: string;
  reason: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  removed_by: string | null;
  removed_at: string | null;
  removal_reason: string | null;
}

export const useNoShowRecords = (bookingId?: string) => {
  return useQuery({
    queryKey: ["no_show_records", bookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("no_show_records")
        .select("*")
        .is("removed_at", null)
        .order("created_at", { ascending: false });

      if (bookingId) {
        query = query.eq("unified_booking_id", bookingId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NoShowRecord[];
    },
  });
};

export const useNoShowByBooking = (bookingId: string) => {
  return useQuery({
    queryKey: ["no_show_record", bookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("no_show_records")
        .select("*")
        .eq("unified_booking_id", bookingId)
        .is("removed_at", null)
        .maybeSingle();

      if (error) throw error;
      return data as NoShowRecord | null;
    },
    enabled: !!bookingId,
  });
};

export const useCreateNoShow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id: string;
      reason: NoShowReason;
      note: string;
      no_show_date?: string;
    }) => {
      if (!data.note || data.note.trim().length === 0) {
        throw new Error("Ghi chú là bắt buộc");
      }

      const { data: user } = await supabase.auth.getUser();

      // ── Capture previous statuses BEFORE updating (for Undo) ──
      const { data: prevBooking } = await supabase
        .from("bookings_mirror")
        .select("booking_status, payment_type, total_amount_net")
        .eq("unified_booking_id", data.unified_booking_id)
        .maybeSingle();

      const { data: prevStay } = await supabase
        .from("stays")
        .select("stay_status")
        .eq("unified_booking_id", data.unified_booking_id)
        .maybeSingle();

      const prevBookingStatus = prevBooking?.booking_status || "CONFIRMED";
      const prevStayStatus = prevStay?.stay_status || "WAIT_ROOM";

      const { data: noShow, error } = await supabase
        .from("no_show_records")
        .insert({
          unified_booking_id: data.unified_booking_id,
          reason: data.reason,
          note: data.note.trim(),
          no_show_date: data.no_show_date || new Date().toISOString().split("T")[0],
          created_by: user?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Update booking status to NO_SHOW in both tables
      await supabase
        .from("manual_bookings")
        .update({ booking_status: "NO_SHOW" })
        .eq("unified_booking_id", data.unified_booking_id);

      await supabase
        .from("bookings_mirror")
        .update({ booking_status: "NO_SHOW" })
        .eq("unified_booking_id", data.unified_booking_id);

      // Update stay status to NO_SHOW
      await supabase
        .from("stays")
        .update({ stay_status: "NO_SHOW" })
        .eq("unified_booking_id", data.unified_booking_id);

      // ── Financial Snapshot (ADDITIVE) ──
      const collectorType = prevBooking?.payment_type === "HOTEL_COLLECT" ? "HOTEL" : "OTA";
      const expectedAmount = Number(prevBooking?.total_amount_net || 0);
      const snapshotDate = data.no_show_date || new Date().toISOString().split("T")[0];

      // Create financial snapshot with prev statuses (idempotent via UNIQUE constraint)
      await safeMutation(() => supabase
        .from("no_show_financial_snapshots")
        .upsert({
          org_id: "00000000-0000-0000-0000-000000000001",
          unified_booking_id: data.unified_booking_id,
          collector_type: collectorType,
          expected_amount: expectedAmount,
          snapshot_date: snapshotDate,
          charge_status: "PENDING",
          revenue_posted: false,
          prev_booking_status: prevBookingStatus,
          prev_stay_status: prevStayStatus,
          created_by: user?.user?.id,
        }, { onConflict: "org_id,unified_booking_id" })
      );

      // Void host supply segments (prevent settlement of non-existent stay)
      await safeMutation(() => supabase
        .from("host_supply_segments")
        .update({ is_voided_by_no_show: true })
        .eq("unified_booking_id", data.unified_booking_id)
      );

      // Audit log: no_show_records entity
      await safeMutation(() => supabase.from("audit_logs").insert({
        user_id: user?.user?.id,
        action: "NO_SHOW_CREATED",
        entity: "no_show_records",
        entity_id: noShow.id,
        after_data: {
          reason: data.reason,
          note: data.note,
          no_show_date: snapshotDate,
          unified_booking_id: data.unified_booking_id,
          collector_type: collectorType,
          expected_amount: expectedAmount,
        },
      }));

      // Audit log: bookings_mirror entity (for booking history timeline)
      await safeMutation(() => supabase.from("audit_logs").insert({
        user_id: user?.user?.id,
        action: "Ghi nhận No-show",
        entity: "bookings_mirror",
        entity_id: data.unified_booking_id,
        after_data: {
          no_show_record_id: noShow.id,
          reason: data.reason,
          note: data.note,
          no_show_date: snapshotDate,
          booking_status_before: "CONFIRMED",
          booking_status_after: "NO_SHOW",
        },
      }));

      return noShow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["no_show_records"] });
      queryClient.invalidateQueries({ queryKey: ["no_show_record", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["stays"] });
      queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      toast.success("Đã ghi nhận no-show");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

export const useRemoveNoShow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      noShowId: string;
      unified_booking_id: string;
      removal_reason: string;
    }) => {
      if (!data.removal_reason || data.removal_reason.trim().length === 0) {
        throw new Error("Lý do gỡ no-show là bắt buộc");
      }

      const { data: user } = await supabase.auth.getUser();

      // Soft delete the no-show record
      const { error } = await supabase
        .from("no_show_records")
        .update({
          removed_by: user?.user?.id,
          removed_at: new Date().toISOString(),
          removal_reason: data.removal_reason.trim(),
        })
        .eq("id", data.noShowId);

      if (error) throw error;

      // Revert booking status to CONFIRMED
      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CONFIRMED" })
        .eq("unified_booking_id", data.unified_booking_id);

      await supabase
        .from("bookings_mirror")
        .update({ booking_status: "CONFIRMED" })
        .eq("unified_booking_id", data.unified_booking_id);

      // Revert stay status to WAIT_ROOM
      await supabase
        .from("stays")
        .update({ stay_status: "WAIT_ROOM" })
        .eq("unified_booking_id", data.unified_booking_id);

      // ── Financial Snapshot cleanup (ADDITIVE) ──
      // If revenue was posted, reverse the ledger entry first
      const { data: snapshot } = await supabase
        .from("no_show_financial_snapshots")
        .select("id, revenue_posted, ledger_entry_id")
        .eq("unified_booking_id", data.unified_booking_id)
        .is("removed_at", null)
        .maybeSingle();

      if (snapshot) {
        if (snapshot.revenue_posted && snapshot.ledger_entry_id) {
          try {
            await supabase.rpc("reverse_ledger_entry" as any, {
              p_original_entry_id: snapshot.ledger_entry_id,
              p_reason: "NO_SHOW removed — booking restored",
            });
          } catch { /* Non-blocking — ledger reversal is best-effort */ }
        }
        // Soft-delete the snapshot
        await safeMutation(() => supabase
          .from("no_show_financial_snapshots")
          .update({ removed_at: new Date().toISOString() })
          .eq("id", snapshot.id)
        );
      }

      // Unvoid host supply segments
      await safeMutation(() => supabase
        .from("host_supply_segments")
        .update({ is_voided_by_no_show: false })
        .eq("unified_booking_id", data.unified_booking_id)
      );

      // Log to audit
      await safeMutation(() => supabase.from("audit_logs").insert({
        user_id: user?.user?.id,
        action: "REMOVE_NO_SHOW",
        entity: "no_show_records",
        entity_id: data.noShowId,
        after_data: {
          removal_reason: data.removal_reason,
          unified_booking_id: data.unified_booking_id,
          snapshot_reversed: !!snapshot?.revenue_posted,
        },
      }));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["no_show_records"] });
      queryClient.invalidateQueries({ queryKey: ["no_show_record", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["stays"] });
      queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["pl-calculator-noshow-revenue"] });
      toast.success("Đã gỡ trạng thái no-show");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

// Stats for internal reporting
export const useNoShowStats = (filters?: {
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ["no_show_stats", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("no_show_records")
        .select("*, unified_bookings!inner(*)")
        .is("removed_at", null);

      if (filters?.startDate) {
        query = query.gte("no_show_date", filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte("no_show_date", filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Calculate stats
      const total = data?.length || 0;
      const byReason: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      const byMonth: Record<string, number> = {};

      data?.forEach((record: any) => {
        // By reason
        byReason[record.reason] = (byReason[record.reason] || 0) + 1;

        // By source/OTA
        const source = record.unified_bookings?.source || "Unknown";
        bySource[source] = (bySource[source] || 0) + 1;

        // By month
        const month = record.no_show_date?.slice(0, 7) || "Unknown";
        byMonth[month] = (byMonth[month] || 0) + 1;
      });

      return {
        total,
        byReason,
        bySource,
        byMonth,
        records: data,
      };
    },
  });
};

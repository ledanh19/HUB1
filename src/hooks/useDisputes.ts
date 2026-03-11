// TRACKING ONLY: Disputes must never create finance artifacts.
// See docs/disputes/CaseTrackingOnly.md
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { toast } from "sonner";
import { keepPrevious } from "@/lib/query-helpers";

const OVERDUE_DAYS = 5; // Days before showing overdue warning

export const useDisputes = (bookingId?: string) => {
  return useQuery({
    queryKey: ["ota_disputes", bookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      // Get An Gia booking IDs for filtering
      const { fetchAnGiaBookingIds } = await import("./useAnGiaProperties");
      const anGiaBookingIds = await fetchAnGiaBookingIds();

      let query = supabase
        .from("ota_disputes")
        .select("*")
        .order("opened_at", { ascending: false });

      if (bookingId) {
        query = query.eq("unified_booking_id", bookingId);
      } else if (anGiaBookingIds.length > 0) {
        // Only filter by An Gia when not filtering by specific booking
        query = query.in("unified_booking_id", anGiaBookingIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useDisputeAttachments = (disputeId: string) => {
  return useQuery({
    queryKey: ["dispute_attachments", disputeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispute_attachments")
        .select("*")
        .eq("dispute_id", disputeId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!disputeId,
  });
};

// === useOtaDeductions REMOVED (dead code, 0 consumers) ===
// === useCreateDeduction REMOVED (dead code, 0 consumers) ===
// If needed for OTA Payout, recreate in src/hooks/useOtaPayoutDeductions.ts

export const useCreateDispute = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id: string;
      dispute_type: string;
      amount_in_dispute: number;
      assigned_to?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data: dispute, error } = await supabase
        .from("ota_disputes")
        .insert({
          ...data,
          created_by: user?.user?.id,
          opened_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return dispute;
    },
    onSuccess: () => {
      toast.success("Đã tạo tranh chấp OTA");
      // Partial invalidation
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
        queryClient.invalidateQueries({ queryKey: ["disputes"] });
      }, 100);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

export const useUpdateDispute = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      resolution_note,
      assigned_to,
    }: {
      id: string;
      status: string;
      resolution_note?: string;
      assigned_to?: string;
    }) => {
      const updateData: Record<string, unknown> = {
        status,
        resolution_note: resolution_note || null,
        assigned_to: assigned_to || null,
        last_activity_at: new Date().toISOString(),
      };

      if (status === "WON" || status === "LOST" || status === "CLOSED" || status === "PARTIAL") {
        updateData.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("ota_disputes")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    // OPTIMISTIC UPDATE
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["ota_disputes"] });

      const previousData = queryClient.getQueryData(["ota_disputes"]);

      queryClient.setQueryData(["ota_disputes"], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(dispute =>
          dispute.id === variables.id
            ? {
              ...dispute,
              status: variables.status,
              resolution_note: variables.resolution_note,
              assigned_to: variables.assigned_to,
              _isOptimistic: true
            }
            : dispute
        );
      });

      return { previousData };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["ota_disputes"], context.previousData);
      }
      toast.error("Lỗi: " + error.message);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái");
      // Partial invalidation - immediate for related
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
        queryClient.invalidateQueries({ queryKey: ["disputes"] });
      }, 100);
      // Delayed for dashboard
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
  });
};

export const useUploadDisputeAttachment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      disputeId,
      file,
      fileType,
    }: {
      disputeId: string;
      file: File;
      fileType: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const fileExt = file.name.split(".").pop();
      const fileName = `${disputeId}/${Date.now()}.${fileExt}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("dispute-attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("dispute-attachments")
        .getPublicUrl(fileName);

      // Insert attachment record
      const { error: insertError } = await supabase
        .from("dispute_attachments")
        .insert({
          dispute_id: disputeId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: fileType,
          uploaded_by: user?.user?.id,
        });

      if (insertError) throw insertError;

      // Update last_activity_at on dispute
      await supabase
        .from("ota_disputes")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", disputeId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dispute_attachments", variables.disputeId] });
      queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
      toast.success("Đã tải lên file đính kèm");
    },
    onError: (error: Error) => {
      toast.error("Lỗi tải file: " + error.message);
    },
  });
};

// Helper to check if dispute is overdue
export const isDisputeOverdue = (lastActivityAt: string | null): boolean => {
  if (!lastActivityAt) return false;
  const lastActivity = new Date(lastActivityAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > OVERDUE_DAYS;
};

export const getOverdueDays = (lastActivityAt: string | null): number => {
  if (!lastActivityAt) return 0;
  const lastActivity = new Date(lastActivityAt);
  const now = new Date();
  return Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
};

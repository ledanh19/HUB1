import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "./useAuditLog";

export interface GuestDocument {
  id: string;
  unified_booking_id: string;
  document_type: "CCCD" | "PASSPORT";
  document_number: string | null;
  document_image: string | null;
  guest_name: string | null;
  nationality: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  sent_to_host_status: string;
  sent_to_host_at: string | null;
  created_at: string;
}

export function useGuestDocuments(unifiedBookingId: string) {
  return useQuery({
    queryKey: ["guest_documents", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as GuestDocument[];
    },
    enabled: !!unifiedBookingId,
  });
}

export function useHasDocuments(unifiedBookingId: string) {
  return useQuery({
    queryKey: ["has_documents", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("guest_documents")
        .select("*", { count: "exact", head: true })
        .eq("unified_booking_id", unifiedBookingId)
        .not("document_image", "is", null);

      if (error) throw error;
      return (count || 0) > 0;
    },
    enabled: !!unifiedBookingId,
  });
}

export function useSendDocumentsToHost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      // Update all documents for this booking to SENT
      const { error } = await supabase
        .from("guest_documents")
        .update({
          sent_to_host_status: "SENT",
          sent_to_host_at: new Date().toISOString(),
        })
        .eq("unified_booking_id", unifiedBookingId)
        .eq("sent_to_host_status", "NOT_SENT");

      if (error) throw error;

      // Create audit log
      await createAuditLog({
        action: AuditActions.DOCUMENT_SENT_TO_HOST,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          sent_to_host_status: "SENT",
          sent_at: new Date().toISOString(),
        },
      });

      return true;
    },
    onSuccess: (_, unifiedBookingId) => {
      queryClient.invalidateQueries({ queryKey: ["guest_documents", unifiedBookingId] });
      queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
      toast.success("Đã gửi ảnh cho Host!");
    },
    onError: (err: any) => {
      toast.error("Lỗi gửi ảnh: " + err.message);
    },
  });
}

// Get document status for a booking
export function useDocumentStatus(unifiedBookingId: string) {
  return useQuery({
    queryKey: ["document_status", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select("id, document_image, sent_to_host_status")
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;

      const hasImage = data?.some((d) => d.document_image);
      const allSent = data?.length > 0 && data.every((d) => d.sent_to_host_status === "SENT");
      const hasSome = data?.length > 0;

      if (!hasSome || !hasImage) {
        return { status: "NO_DOCUMENT", label: "Chưa có giấy tờ", variant: "danger" as const };
      }
      if (!allSent) {
        return { status: "NOT_SENT", label: "Chưa gửi Host", variant: "warning" as const };
      }
      return { status: "SENT", label: "Đã gửi Host", variant: "success" as const };
    },
    enabled: !!unifiedBookingId,
  });
}

// Batch fetch document status for multiple bookings
// Helper to chunk array into batches to avoid URL length limits
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export function useBatchDocumentStatus(unifiedBookingIds: string[]) {
  // Stable queryKey: use sorted join instead of unstable array reference
  const stableKey = unifiedBookingIds.length > 0 
    ? unifiedBookingIds.length.toString() + ":" + unifiedBookingIds[0]
    : "";
  return useQuery({
    queryKey: ["batch_document_status", stableKey],
    staleTime: 30_000, // 30s — avoid constant refetches
    queryFn: async () => {
      if (unifiedBookingIds.length === 0) return {};

      // Batch into chunks of 50 to avoid URL length limits (520 error)
      const BATCH_SIZE = 50;
      const chunks = chunkArray(unifiedBookingIds, BATCH_SIZE);
      
      // Fetch all chunks in parallel
      const allData: Array<{
        unified_booking_id: string;
        id: string;
        document_image: string | null;
        sent_to_host_status: string;
      }> = [];
      
      await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await supabase
            .from("guest_documents")
            .select("unified_booking_id, id, document_image, sent_to_host_status")
            .in("unified_booking_id", chunk);

          if (error) throw error;
          if (data) allData.push(...data);
        })
      );

      // Group by booking
      const grouped = new Map<string, typeof allData>();
      allData.forEach((doc) => {
        const existing = grouped.get(doc.unified_booking_id) || [];
        existing.push(doc);
        grouped.set(doc.unified_booking_id, existing);
      });

      // Compute status for each booking
      const result: Record<string, { status: string; label: string; variant: "danger" | "warning" | "success" }> = {};
      
      unifiedBookingIds.forEach((id) => {
        const docs = grouped.get(id) || [];
        const hasImage = docs.some((d) => d.document_image);
        const allSent = docs.length > 0 && docs.every((d) => d.sent_to_host_status === "SENT");
        const hasSome = docs.length > 0;

        if (!hasSome || !hasImage) {
          result[id] = { status: "NO_DOCUMENT", label: "Chưa có giấy tờ", variant: "danger" };
        } else if (!allSent) {
          result[id] = { status: "NOT_SENT", label: "Chưa gửi Host", variant: "warning" };
        } else {
          result[id] = { status: "SENT", label: "Đã gửi Host", variant: "success" };
        }
      });

      return result;
    },
    enabled: unifiedBookingIds.length > 0,
  });
}

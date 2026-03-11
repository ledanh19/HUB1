import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Guest {
  id: string;
  full_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  nationality: string | null;
  confidence_level: "LOW" | "MED" | "HIGH";
  is_sample_data: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuestIdentity {
  id: string;
  guest_id: string;
  source_type: "OTA" | "MANUAL" | "CRM";
  source_name: string;
  source_guest_key: string | null;
  email_raw: string | null;
  email_norm: string | null;
  phone_raw: string | null;
  phone_norm: string | null;
  phone_is_proxy: boolean;
  name_raw: string | null;
  name_norm: string | null;
  created_at: string;
}

export interface BookingGuestLink {
  id: string;
  unified_booking_id: string;
  guest_id: string;
  role: "PRIMARY" | "SECONDARY";
  match_method: "SOURCE_KEY" | "EMAIL" | "REAL_PHONE" | "MANUAL" | "CREATED_NEW";
  confidence: "LOW" | "MED" | "HIGH";
  matched_at: string;
  matched_by: string | null;
  created_at: string;
}

export interface GuestMergeSuggestion {
  id: string;
  source_guest_id: string;
  target_guest_id: string;
  suggestion_reason: string;
  confidence_score: number;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface GuestWithStats extends Guest {
  booking_count?: number;
  identity_count?: number;
}

export function useGuests() {
  return useQuery({
    queryKey: ["guests"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guests")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as Guest[];
    },
  });
}

export function useGuestWithDetails(guestId: string | null) {
  return useQuery({
    queryKey: ["guest", guestId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!guestId) return null;

      const { data, error } = await supabase
        .from("guests")
        .select("*")
        .eq("id", guestId)
        .single();

      if (error) throw error;
      return data as Guest;
    },
    enabled: !!guestId,
  });
}

export function useGuestIdentities(guestId: string | null) {
  return useQuery({
    queryKey: ["guest-identities", guestId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!guestId) return [];

      const { data, error } = await supabase
        .from("guest_identities")
        .select("*")
        .eq("guest_id", guestId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as GuestIdentity[];
    },
    enabled: !!guestId,
  });
}

export function useGuestBookingLinks(guestId: string | null) {
  return useQuery({
    queryKey: ["guest-booking-links", guestId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!guestId) return [];

      const { data, error } = await supabase
        .from("booking_guest_links")
        .select("*")
        .eq("guest_id", guestId)
        .order("matched_at", { ascending: false });

      if (error) throw error;
      return data as BookingGuestLink[];
    },
    enabled: !!guestId,
  });
}

export function useGuestMergeSuggestions() {
  return useQuery({
    queryKey: ["guest-merge-suggestions"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_merge_suggestions")
        .select("*")
        .eq("status", "PENDING")
        .order("confidence_score", { ascending: false });

      if (error) throw error;
      return data as GuestMergeSuggestion[];
    },
  });
}

export function useGuestsWithBookingCount() {
  return useQuery({
    queryKey: ["guests-with-stats"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Fetch guests
      const { data: guests, error: guestsError } = await supabase
        .from("guests")
        .select("*")
        .order("updated_at", { ascending: false });

      if (guestsError) throw guestsError;

      // Fetch booking counts
      const { data: bookingCounts, error: countsError } = await supabase
        .from("booking_guest_links")
        .select("guest_id");

      if (countsError) throw countsError;

      // Count bookings per guest
      const countMap = new Map<string, number>();
      bookingCounts?.forEach((link) => {
        const count = countMap.get(link.guest_id) || 0;
        countMap.set(link.guest_id, count + 1);
      });

      // Combine data
      const result: GuestWithStats[] = (guests || []).map((guest) => ({
        ...guest,
        booking_count: countMap.get(guest.id) || 0,
      }));

      return result;
    },
  });
}

export function useSyncAllGuests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("guest-matching", {
        body: { action: "sync_all_existing" },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests"] });
      queryClient.invalidateQueries({ queryKey: ["guests-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["guest-booking-links"] });
      queryClient.invalidateQueries({ queryKey: ["guest-identities"] });
      queryClient.invalidateQueries({ queryKey: ["guest-merge-suggestions"] });
    },
  });
}

export function useApproveMergeSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ suggestionId, action }: { suggestionId: string; action: "approve" | "reject" }) => {
      const { error } = await supabase
        .from("guest_merge_suggestions")
        .update({
          status: action === "approve" ? "APPROVED" : "REJECTED",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", suggestionId);

      if (error) throw error;

      // If approved, we would need to merge the guests
      // This is a placeholder - actual merge logic would go here
      if (action === "approve") {
        // TODO: Implement merge logic
        console.log("Merge approved - implement merge logic");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-merge-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["guests"] });
    },
  });
}

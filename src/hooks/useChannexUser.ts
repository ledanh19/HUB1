import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ChannexUser {
  id: string;
  channex_user_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  company_name: string | null;
  timezone: string | null;
  locale: string | null;
  is_active: boolean;
  subscription_plan: string | null;
  subscription_status: string | null;
  api_key_last_4: string | null;
  permissions: unknown[];
  settings: Record<string, unknown>;
  properties_count: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannexUserProperty {
  id: string;
  channex_user_id: string;
  channex_property_id: string;
  property_name: string | null;
  property_status: string;
  is_primary: boolean;
  permissions: unknown[];
  created_at: string;
  updated_at: string;
}

export function useChannexUsers() {
  return useQuery({
    queryKey: ["channex-users"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channex_users")
        .select("*")
        .order("last_synced_at", { ascending: false });

      if (error) throw error;
      return data as ChannexUser[];
    },
  });
}

export function useChannexUser(channexUserId?: string) {
  return useQuery({
    queryKey: ["channex-user", channexUserId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!channexUserId) return null;

      const { data, error } = await supabase
        .from("channex_users")
        .select("*")
        .eq("channex_user_id", channexUserId)
        .maybeSingle();

      if (error) throw error;
      return data as ChannexUser | null;
    },
    enabled: !!channexUserId,
  });
}

export function useChannexUserProperties(channexUserId?: string) {
  return useQuery({
    queryKey: ["channex-user-properties", channexUserId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("channex_user_properties")
        .select("*")
        .order("property_name", { ascending: true });

      if (channexUserId) {
        query = query.eq("channex_user_id", channexUserId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ChannexUserProperty[];
    },
  });
}

export function useSyncChannexUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { include_properties?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("channex-user-sync", {
        body: {
          include_properties: options?.include_properties ?? true,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["channex-users"] });
      queryClient.invalidateQueries({ queryKey: ["channex-user-properties"] });
      toast.success(`Đồng bộ thành công: ${data.properties_synced} properties`);
    },
    onError: (error) => {
      console.error("Sync error:", error);
      toast.error("Lỗi đồng bộ Channex user");
    },
  });
}

export function useCurrentChannexUser() {
  // Get the most recently synced user (assuming single-user setup)
  return useQuery({
    queryKey: ["channex-current-user"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channex_users")
        .select("*")
        .eq("is_active", true)
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ChannexUser | null;
    },
  });
}

export function useBookingsByChannexUser(channexUserId?: string) {
  return useQuery({
    queryKey: ["bookings-by-channex-user", channexUserId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!channexUserId) return [];

      const { data, error } = await supabase
        .from("bookings_mirror")
        .select("*")
        .eq("channex_user_id", channexUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!channexUserId,
  });
}

export function useChannexUserStats(channexUserId?: string) {
  return useQuery({
    queryKey: ["channex-user-stats", channexUserId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!channexUserId) return null;

      // Get booking count
      const { count: bookingCount, error: bookingError } = await supabase
        .from("bookings_mirror")
        .select("*", { count: "exact", head: true })
        .eq("channex_user_id", channexUserId);

      if (bookingError) throw bookingError;

      // Get properties count
      const { count: propertyCount, error: propertyError } = await supabase
        .from("channex_user_properties")
        .select("*", { count: "exact", head: true })
        .eq("channex_user_id", channexUserId);

      if (propertyError) throw propertyError;

      return {
        bookingCount: bookingCount || 0,
        propertyCount: propertyCount || 0,
      };
    },
    enabled: !!channexUserId,
  });
}

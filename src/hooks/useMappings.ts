import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export type MappingStatus = 'MAPPED' | 'NOT_MAPPED' | 'CONFLICT' | 'INVALID';

export interface PropertyMapping {
  id: string;
  internal_property_id: string | null;
  channex_property_id: string;
  property_name: string | null;
  channex_user_id: string | null;
  status: MappingStatus;
  validation_error: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomTypeMapping {
  id: string;
  property_mapping_id: string;
  internal_room_type_id: string | null;
  channex_room_type_id: string;
  room_type_name: string | null;
  occupancy: number | null;
  status: MappingStatus;
  validation_error: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RatePlanMapping {
  id: string;
  room_type_mapping_id: string;
  internal_rate_plan_id: string | null;
  channex_rate_plan_id: string;
  rate_plan_name: string | null;
  channel_code: string | null;
  currency: string | null;
  sell_mode: string | null;
  status: MappingStatus;
  validation_error: string | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch Property Mappings
export function usePropertyMappings(channexUserId?: string) {
  return useQuery({
    queryKey: ['property-mappings', channexUserId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('property_mappings')
        .select('*')
        .order('property_name', { ascending: true });
      
      if (channexUserId) {
        query = query.eq('channex_user_id', channexUserId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as PropertyMapping[];
    },
    enabled: true,
  });
}

// Fetch Room Type Mappings
export function useRoomTypeMappings(propertyMappingId?: string) {
  return useQuery({
    queryKey: ['room-type-mappings', propertyMappingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('room_type_mappings')
        .select('*')
        .order('room_type_name', { ascending: true });
      
      if (propertyMappingId) {
        query = query.eq('property_mapping_id', propertyMappingId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as RoomTypeMapping[];
    },
    enabled: true,
  });
}

// Fetch Rate Plan Mappings
export function useRatePlanMappings(roomTypeMappingId?: string) {
  return useQuery({
    queryKey: ['rate-plan-mappings', roomTypeMappingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from('rate_plan_mappings')
        .select('*')
        .order('rate_plan_name', { ascending: true });
      
      if (roomTypeMappingId) {
        query = query.eq('room_type_mapping_id', roomTypeMappingId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as RatePlanMapping[];
    },
    enabled: true,
  });
}

// Update Property Mapping
export function useUpdatePropertyMapping() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PropertyMapping> }) => {
      const { data, error } = await supabase
        .from('property_mappings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-mappings'] });
      toast.success('Property mapping updated');
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

// Update Room Type Mapping
export function useUpdateRoomTypeMapping() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RoomTypeMapping> }) => {
      const { data, error } = await supabase
        .from('room_type_mappings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-type-mappings'] });
      toast.success('Room type mapping updated');
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

// Update Rate Plan Mapping
export function useUpdateRatePlanMapping() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RatePlanMapping> }) => {
      const { data, error } = await supabase
        .from('rate_plan_mappings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rate-plan-mappings'] });
      toast.success('Rate plan mapping updated');
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

// Test Mapping validation
export function useTestMapping() {
  return useMutation({
    mutationFn: async (params: {
      type: 'property' | 'room_type' | 'rate_plan';
      channexId: string;
      propertyId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('channex-test-mapping', {
        body: params,
      });
      
      if (error) throw error;
      return data;
    },
  });
}

// Sync mappings from Channex data
export function useSyncMappingsFromChannex() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (channexUserId: string) => {
      // Get all properties for this user
      const { data: properties, error: propError } = await supabase
        .from('channex_user_properties')
        .select('channex_property_id, property_name')
        .eq('channex_user_id', channexUserId);
      
      if (propError) throw propError;
      
      // Upsert property mappings
      for (const prop of properties || []) {
        await supabase
          .from('property_mappings')
          .upsert({
            channex_property_id: prop.channex_property_id,
            property_name: prop.property_name,
            channex_user_id: channexUserId,
            status: 'NOT_MAPPED',
          }, {
            onConflict: 'channex_property_id',
          });
      }
      
      // Get property mappings
      const { data: propMappings } = await supabase
        .from('property_mappings')
        .select('id, channex_property_id')
        .eq('channex_user_id', channexUserId);
      
      // For each property, sync room types
      for (const pm of propMappings || []) {
        const { data: roomTypes } = await supabase
          .from('room_types_mirror')
          .select('provider_room_type_id, room_type_name, occupancy')
          .eq('provider_property_id', pm.channex_property_id);
        
        for (const rt of roomTypes || []) {
          const { data: rtMapping } = await supabase
            .from('room_type_mappings')
            .upsert({
              property_mapping_id: pm.id,
              channex_room_type_id: rt.provider_room_type_id,
              room_type_name: rt.room_type_name,
              occupancy: rt.occupancy,
              status: 'NOT_MAPPED',
            }, {
              onConflict: 'property_mapping_id,channex_room_type_id',
            })
            .select()
            .single();
          
          // Sync rate plans for this room type
          const { data: ratePlans } = await supabase
            .from('rate_plans_mirror')
            .select('provider_rate_plan_id, rate_plan_name, currency, sell_mode')
            .eq('provider_room_type_id', rt.provider_room_type_id);
          
          for (const rp of ratePlans || []) {
            // Extract channel from rate plan name (e.g., "Standard (Agoda)" -> "agoda")
            const channelMatch = rp.rate_plan_name?.match(/\(([^)]+)\)$/);
            const channelCode = channelMatch ? channelMatch[1].toLowerCase() : null;
            
            if (rtMapping) {
              await supabase
                .from('rate_plan_mappings')
                .upsert({
                  room_type_mapping_id: rtMapping.id,
                  channex_rate_plan_id: rp.provider_rate_plan_id,
                  rate_plan_name: rp.rate_plan_name,
                  channel_code: channelCode,
                  currency: rp.currency,
                  sell_mode: rp.sell_mode,
                  status: 'NOT_MAPPED',
                }, {
                  onConflict: 'room_type_mapping_id,channex_rate_plan_id',
                });
            }
          }
        }
      }
      
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['room-type-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['rate-plan-mappings'] });
      toast.success('Mappings synced from Channex');
    },
    onError: (error) => {
      toast.error(`Failed to sync: ${error.message}`);
    },
  });
}

// Get mapping statistics
export function useMappingStats(channexUserId?: string) {
  return useQuery({
    queryKey: ['mapping-stats', channexUserId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Property stats
      const { data: propStats } = await supabase
        .from('property_mappings')
        .select('status');
      
      // Room type stats  
      const { data: rtStats } = await supabase
        .from('room_type_mappings')
        .select('status');
      
      // Rate plan stats
      const { data: rpStats } = await supabase
        .from('rate_plan_mappings')
        .select('status');
      
      const countByStatus = (data: { status: string }[] | null) => {
        const counts = { MAPPED: 0, NOT_MAPPED: 0, CONFLICT: 0, INVALID: 0 };
        data?.forEach(item => {
          if (item.status in counts) {
            counts[item.status as keyof typeof counts]++;
          }
        });
        return counts;
      };
      
      return {
        properties: countByStatus(propStats),
        roomTypes: countByStatus(rtStats),
        ratePlans: countByStatus(rpStats),
      };
    },
  });
}

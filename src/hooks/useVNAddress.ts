// =============================================
// VIETNAM ADMINISTRATIVE ADDRESS HOOKS
// Cascade dropdown: Province → District → Ward
// =============================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types
export interface VNProvince {
  code: string;
  name: string;
  name_en: string | null;
  region: string | null;
  is_active: boolean;
}

export interface VNDistrict {
  code: string;
  province_code: string;
  name: string;
  name_en: string | null;
  district_type: string | null;
  is_active: boolean;
}

export interface VNWard {
  code: string;
  district_code: string;
  name: string;
  name_en: string | null;
  ward_type: string | null;
  is_active: boolean;
}

// =============================================
// PROVINCES HOOK
// =============================================
export function useVNProvinces() {
  return useQuery({
    queryKey: ['vn-provinces'],
    queryFn: async (): Promise<VNProvince[]> => {
      const { data, error } = await (supabase as any)
        .from('vn_provinces')
        .select('code, name, name_en, region, is_active')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return (data || []) as VNProvince[];
    },
    staleTime: 1000 * 60 * 60, // Cache 1 hour - static data
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache 24 hours
  });
}

// =============================================
// DISTRICTS HOOK (by Province)
// =============================================
export function useVNDistricts(provinceCode: string | null | undefined) {
  return useQuery({
    queryKey: ['vn-districts', provinceCode],
    queryFn: async (): Promise<VNDistrict[]> => {
      if (!provinceCode) return [];
      
      const { data, error } = await (supabase as any)
        .from('vn_districts')
        .select('code, province_code, name, name_en, district_type, is_active')
        .eq('province_code', provinceCode)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return (data || []) as VNDistrict[];
    },
    enabled: !!provinceCode,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

// =============================================
// WARDS HOOK (by District) - Lazy loaded
// =============================================
export function useVNWards(districtCode: string | null | undefined) {
  return useQuery({
    queryKey: ['vn-wards', districtCode],
    queryFn: async (): Promise<VNWard[]> => {
      if (!districtCode) return [];
      
      const { data, error } = await (supabase as any)
        .from('vn_wards')
        .select('code, district_code, name, name_en, ward_type, is_active')
        .eq('district_code', districtCode)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return (data || []) as VNWard[];
    },
    enabled: !!districtCode,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

// =============================================
// LOOKUP HOOKS (for display)
// =============================================
export function useVNProvinceName(provinceCode: string | null | undefined) {
  return useQuery({
    queryKey: ['vn-province-name', provinceCode],
    queryFn: async (): Promise<string | null> => {
      if (!provinceCode) return null;
      
      const { data, error } = await (supabase as any)
        .from('vn_provinces')
        .select('name')
        .eq('code', provinceCode)
        .maybeSingle();
      
      if (error) throw error;
      return data?.name || null;
    },
    enabled: !!provinceCode,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useVNDistrictName(districtCode: string | null | undefined) {
  return useQuery({
    queryKey: ['vn-district-name', districtCode],
    queryFn: async (): Promise<string | null> => {
      if (!districtCode) return null;
      
      const { data, error } = await (supabase as any)
        .from('vn_districts')
        .select('name')
        .eq('code', districtCode)
        .maybeSingle();
      
      if (error) throw error;
      return data?.name || null;
    },
    enabled: !!districtCode,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useVNWardName(wardCode: string | null | undefined) {
  return useQuery({
    queryKey: ['vn-ward-name', wardCode],
    queryFn: async (): Promise<string | null> => {
      if (!wardCode) return null;
      
      const { data, error } = await (supabase as any)
        .from('vn_wards')
        .select('name')
        .eq('code', wardCode)
        .maybeSingle();
      
      if (error) throw error;
      return data?.name || null;
    },
    enabled: !!wardCode,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// =============================================
// FULL ADDRESS RESOLVER
// =============================================
export interface FullAddressResult {
  provinceName: string | null;
  districtName: string | null;
  wardName: string | null;
  fullAddress: string;
}

export function useVNFullAddress(
  provinceCode: string | null | undefined,
  districtCode: string | null | undefined,
  wardCode: string | null | undefined,
  streetAddress?: string | null
) {
  return useQuery({
    queryKey: ['vn-full-address', provinceCode, districtCode, wardCode, streetAddress],
    queryFn: async (): Promise<FullAddressResult> => {
      const parts: string[] = [];
      let provinceName: string | null = null;
      let districtName: string | null = null;
      let wardName: string | null = null;

      // Fetch all names in parallel
      const [provinceResult, districtResult, wardResult] = await Promise.all([
        provinceCode
          ? (supabase as any).from('vn_provinces').select('name').eq('code', provinceCode).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        districtCode
          ? (supabase as any).from('vn_districts').select('name').eq('code', districtCode).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        wardCode
          ? (supabase as any).from('vn_wards').select('name').eq('code', wardCode).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      provinceName = provinceResult.data?.name || null;
      districtName = districtResult.data?.name || null;
      wardName = wardResult.data?.name || null;

      // Build full address
      if (streetAddress) parts.push(streetAddress);
      if (wardName) parts.push(wardName);
      if (districtName) parts.push(districtName);
      if (provinceName) parts.push(provinceName);

      return {
        provinceName,
        districtName,
        wardName,
        fullAddress: parts.join(', '),
      };
    },
    enabled: !!(provinceCode || districtCode || wardCode || streetAddress),
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

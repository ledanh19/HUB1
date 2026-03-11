// =============================================
// VIETNAM ADDRESS CASCADE DROPDOWN COMPONENT
// Province → District → Ward
// =============================================

import React, { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import {
  useVNProvinces,
  useVNDistricts,
  useVNWards,
} from '@/hooks/useVNAddress';

export interface VNAddressValue {
  provinceCode: string | null;
  districtCode: string | null;
  wardCode: string | null;
  streetAddress: string | null;
  // Snapshot names for historical integrity
  provinceNameSnapshot: string | null;
  districtNameSnapshot: string | null;
  wardNameSnapshot: string | null;
}

interface VNAddressCascadeProps {
  value: VNAddressValue;
  onChange: (value: VNAddressValue) => void;
  disabled?: boolean;
  required?: boolean;
  showStreetAddress?: boolean;
  className?: string;
}

export function VNAddressCascade({
  value,
  onChange,
  disabled = false,
  required = false,
  showStreetAddress = true,
  className = '',
}: VNAddressCascadeProps) {
  // Fetch data with error handling
  const { data: provinces = [], isLoading: loadingProvinces, error: errorProvinces } = useVNProvinces();
  const { data: districts = [], isLoading: loadingDistricts, error: errorDistricts } = useVNDistricts(value.provinceCode);
  const { data: wards = [], isLoading: loadingWards, error: errorWards } = useVNWards(value.districtCode);

  // Debug log for errors
  if (errorProvinces) console.error('[VNAddress] Province fetch error:', errorProvinces);
  if (errorDistricts) console.error('[VNAddress] District fetch error:', errorDistricts);
  if (errorWards) console.error('[VNAddress] Ward fetch error:', errorWards);

  // Handle province change - reset district and ward
  const handleProvinceChange = useCallback(
    (provinceCode: string) => {
      const province = provinces.find((p) => p.code === provinceCode);
      onChange({
        ...value,
        provinceCode,
        districtCode: null,
        wardCode: null,
        provinceNameSnapshot: province?.name || null,
        districtNameSnapshot: null,
        wardNameSnapshot: null,
      });
    },
    [provinces, value, onChange]
  );

  // Handle district change - reset ward
  const handleDistrictChange = useCallback(
    (districtCode: string) => {
      const district = districts.find((d) => d.code === districtCode);
      onChange({
        ...value,
        districtCode,
        wardCode: null,
        districtNameSnapshot: district?.name || null,
        wardNameSnapshot: null,
      });
    },
    [districts, value, onChange]
  );

  // Handle ward change
  const handleWardChange = useCallback(
    (wardCode: string) => {
      const ward = wards.find((w) => w.code === wardCode);
      onChange({
        ...value,
        wardCode,
        wardNameSnapshot: ward?.name || null,
      });
    },
    [wards, value, onChange]
  );

  // Handle street address change
  const handleStreetAddressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...value,
        streetAddress: e.target.value || null,
      });
    },
    [value, onChange]
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Province Select */}
      <div className="space-y-2">
        <Label htmlFor="province">
          Tỉnh/Thành phố {required && <span className="text-destructive">*</span>}
        </Label>
        <Select
          value={value.provinceCode || ''}
          onValueChange={handleProvinceChange}
          disabled={disabled || loadingProvinces}
        >
          <SelectTrigger id="province" className="w-full">
            {loadingProvinces ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang tải...</span>
              </div>
            ) : (
              <SelectValue placeholder="Chọn Tỉnh/Thành phố" />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {provinces.map((province) => (
              <SelectItem key={province.code} value={province.code}>
                {province.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* District Select */}
      <div className="space-y-2">
        <Label htmlFor="district">
          Quận/Huyện {required && <span className="text-destructive">*</span>}
        </Label>
        <Select
          value={value.districtCode || ''}
          onValueChange={handleDistrictChange}
          disabled={disabled || !value.provinceCode || loadingDistricts}
        >
          <SelectTrigger id="district" className="w-full">
            {loadingDistricts ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang tải...</span>
              </div>
            ) : (
              <SelectValue
                placeholder={
                  value.provinceCode ? 'Chọn Quận/Huyện' : 'Chọn Tỉnh/Thành phố trước'
                }
              />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {districts.map((district) => (
              <SelectItem key={district.code} value={district.code}>
                {district.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ward Select */}
      <div className="space-y-2">
        <Label htmlFor="ward">Phường/Xã</Label>
        <Select
          value={value.wardCode || ''}
          onValueChange={handleWardChange}
          disabled={disabled || !value.districtCode || loadingWards}
        >
          <SelectTrigger id="ward" className="w-full">
            {loadingWards ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang tải...</span>
              </div>
            ) : (
              <SelectValue
                placeholder={value.districtCode ? 'Chọn Phường/Xã' : 'Chọn Quận/Huyện trước'}
              />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {wards.map((ward) => (
              <SelectItem key={ward.code} value={ward.code}>
                {ward.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Street Address */}
      {showStreetAddress && (
        <div className="space-y-2">
          <Label htmlFor="streetAddress">Địa chỉ chi tiết (Số nhà, Đường)</Label>
          <Input
            id="streetAddress"
            value={value.streetAddress || ''}
            onChange={handleStreetAddressChange}
            placeholder="Ví dụ: 123 Nguyễn Huệ"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

// =============================================
// DISPLAY COMPONENT (Read-only)
// =============================================
interface VNAddressDisplayProps {
  provinceCode?: string | null;
  districtCode?: string | null;
  wardCode?: string | null;
  streetAddress?: string | null;
  // Use snapshots if available (for historical data)
  provinceNameSnapshot?: string | null;
  districtNameSnapshot?: string | null;
  wardNameSnapshot?: string | null;
  // Legacy text fields (backward compatible)
  city?: string | null;
  district?: string | null;
  address?: string | null;
  className?: string;
}

export function VNAddressDisplay({
  provinceCode,
  districtCode,
  wardCode,
  streetAddress,
  provinceNameSnapshot,
  districtNameSnapshot,
  wardNameSnapshot,
  city,
  district,
  address,
  className = '',
}: VNAddressDisplayProps) {
  // Build display parts - prefer snapshots, fallback to legacy
  const parts: string[] = [];

  // Street address
  if (streetAddress || address) {
    parts.push(streetAddress || address || '');
  }

  // Ward
  if (wardNameSnapshot) {
    parts.push(wardNameSnapshot);
  }

  // District - prefer snapshot, fallback to legacy
  if (districtNameSnapshot || district) {
    parts.push(districtNameSnapshot || district || '');
  }

  // Province - prefer snapshot, fallback to legacy city
  if (provinceNameSnapshot || city) {
    parts.push(provinceNameSnapshot || city || '');
  }

  const displayText = parts.filter(Boolean).join(', ');

  if (!displayText) {
    return <span className={`text-muted-foreground ${className}`}>Chưa có địa chỉ</span>;
  }

  return <span className={className}>{displayText}</span>;
}

export default VNAddressCascade;

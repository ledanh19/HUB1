/**
 * AnalyticsFilters Component (Phase 1 — Enterprise Rebuild)
 *
 * Filter bar layout:
 * CHỌN NHANH | TỪ NGÀY | ĐẾN NGÀY | LỌC THEO | NHÓM THEO | SO SÁNH | CHỖ NGHỈ | [variant controls] | Lọc
 *
 * Phase 1 enhancements:
 * - MTD / YTD quick presets
 * - Day / Week / Month / Quarter granularity
 * - CompareMode from URL SOT (none / previous / yoy) — NO local state
 * - Date Type on ALL variants
 * - Enhanced Context Summary with all active params
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { format, subDays, startOfMonth, startOfYear } from 'date-fns';
import { Filter, Eye, ChevronDown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useAnalyticsFilters,
  useAnalyticsFilterOptions,
} from '../hooks';
import type { Granularity, PivotType, DateFilterType, CompareMode } from '../types';
import { PIVOT_LABELS, GRANULARITY_LABELS } from '../constants';
import { DATE_FILTER_TYPE_LABELS, COMPARE_MODE_LABELS } from '../types';

// ============================================================================
// QUICK PRESETS (day-based + MTD + YTD)
// ============================================================================

type QuickPreset = '7d' | '30d' | '60d' | '90d' | '365d' | 'mtd' | 'ytd' | 'custom';

interface PresetDef {
  value: QuickPreset;
  label: string;
  getRange: (() => { start: string; end: string }) | null;
}

const QUICK_PRESETS: PresetDef[] = [
  {
    value: 'ytd', label: 'YTD', getRange: () => {
      const now = new Date();
      return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  {
    value: '365d', label: '365 ngày', getRange: () => {
      const now = new Date();
      return { start: format(subDays(now, 365), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  {
    value: '90d', label: '90 ngày', getRange: () => {
      const now = new Date();
      return { start: format(subDays(now, 90), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  {
    value: '60d', label: '60 ngày', getRange: () => {
      const now = new Date();
      return { start: format(subDays(now, 60), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  {
    value: 'mtd', label: 'MTD', getRange: () => {
      const now = new Date();
      return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  {
    value: '30d', label: '30 ngày', getRange: () => {
      const now = new Date();
      return { start: format(subDays(now, 30), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  {
    value: '7d', label: '7 ngày', getRange: () => {
      const now = new Date();
      return { start: format(subDays(now, 7), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    }
  },
  { value: 'custom', label: 'Tuỳ chọn', getRange: null },
];

// ============================================================================
// HELPER: detect active preset from dates
// ============================================================================

function detectPreset(dateStart: string, dateEnd: string): QuickPreset {
  for (const p of QUICK_PRESETS) {
    if (!p.getRange) continue;
    const range = p.getRange();
    if (dateStart === range.start && dateEnd === range.end) return p.value;
  }
  return 'custom';
}

// ============================================================================
// FILTER FIELD WRAPPER
// ============================================================================

function FilterField({ label, children, className }: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
        {label}
      </label>
      {children}
    </div>
  );
}

// ============================================================================
// PROPERTY FILTER (multi-select popover)
// ============================================================================

function PropertyFilter({
  selectedIds,
  onSelectedIdsChange,
}: {
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const { data: options, isLoading } = useAnalyticsFilterOptions('property');

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectedIdsChange([...selectedIds, id]);
    }
  };

  const clearAll = () => onSelectedIdsChange([]);
  const selectAll = () => onSelectedIdsChange(options?.map((o) => o.id) || []);

  const resolvedLabel = useMemo(() => {
    if (selectedIds.length === 0) return 'Tất cả chỗ nghỉ';
    if (!options || options.length === 0) return `${selectedIds.length} chỗ nghỉ`;
    const names = selectedIds.map((id) => options.find((o) => o.id === id)?.name).filter(Boolean);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [selectedIds, options]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 min-w-[160px] justify-between font-normal border-input">
          <span className="truncate max-w-[180px]">{resolvedLabel}</span>
          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">Lọc Chỗ nghỉ</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>Tất cả</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>Bỏ chọn</Button>
              </div>
            </div>
            <ScrollArea className="h-[240px]">
              <div className="p-2 space-y-1">
                {options?.map((option) => (
                  <div key={option.id} className="flex items-center space-x-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer" onClick={() => toggleItem(option.id)}>
                    <Checkbox checked={selectedIds.includes(option.id)} onCheckedChange={() => toggleItem(option.id)} />
                    <span className="text-sm truncate flex-1">{option.name}</span>
                  </div>
                ))}
                {(!options || options.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">Không có dữ liệu</p>}
              </div>
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// PIVOT MULTI-SELECT (for Revenue page)
// ============================================================================

function PivotMultiSelect({ pivot, selectedIds, onSelectedIdsChange }: {
  pivot: PivotType;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const { data: options, isLoading } = useAnalyticsFilterOptions(pivot as 'channel' | 'property' | 'area');

  const label = PIVOT_LABELS[pivot]?.toLowerCase() || 'items';

  const resolvedLabel = useMemo(() => {
    if (selectedIds.length === 0) return `Tất cả ${label}`;
    if (!options || options.length === 0) return `${selectedIds.length} mục`;
    const names = selectedIds.map((id) => options.find((o) => o.id === id)?.name).filter(Boolean);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [selectedIds, options, label]);

  if (pivot === 'all') return null;

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) onSelectedIdsChange(selectedIds.filter((i) => i !== id));
    else onSelectedIdsChange([...selectedIds, id]);
  };
  const clearAll = () => onSelectedIdsChange([]);
  const selectAll = () => onSelectedIdsChange(options?.map((o) => o.id) || []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 min-w-[160px] justify-between font-normal border-input">
          <span className="truncate max-w-[180px]">{resolvedLabel}</span>
          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {isLoading ? (
          <div className="p-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">{PIVOT_LABELS[pivot]}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>Tất cả</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>Bỏ chọn</Button>
              </div>
            </div>
            <ScrollArea className="h-[200px]">
              <div className="p-2 space-y-1">
                {options?.map((option) => (
                  <div key={option.id} className="flex items-center space-x-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer" onClick={() => toggleItem(option.id)}>
                    <Checkbox checked={selectedIds.includes(option.id)} onCheckedChange={() => toggleItem(option.id)} />
                    <span className="text-sm truncate flex-1">{option.name}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// ENHANCED CONTEXT SUMMARY (shows all active filter params)
// ============================================================================

function ContextSummary({ filters, propertyCount }: {
  filters: { dateStart: string; dateEnd: string; dateFilterType: DateFilterType; granularity: Granularity; compareMode: CompareMode; selectedIds: string[] };
  propertyCount: number;
}) {
  const parts: string[] = [];

  // Date range
  parts.push(`${filters.dateStart} – ${filters.dateEnd}`);

  // Date type — Sprint 3: LOCKED to checkout
  parts.push('Ngày trả phòng thực tế');

  // Compare mode
  if (filters.compareMode !== 'none') {
    parts.push(`So với ${COMPARE_MODE_LABELS[filters.compareMode].toLowerCase()}`);
  }

  // Granularity
  parts.push(GRANULARITY_LABELS[filters.granularity] || filters.granularity);

  // Property count
  if (propertyCount === 0) {
    parts.push('Tất cả chỗ nghỉ');
  } else if (propertyCount === 1) {
    parts.push('1 chỗ nghỉ');
  } else {
    parts.push(`${propertyCount} chỗ nghỉ`);
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5 mt-2">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        <span>Đang xem: </span>
        <span className="font-medium text-foreground">{parts.join(' · ')}</span>
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export type FilterVariant = 'overview' | 'revenue' | 'price-spread' | 'host-cost';

interface AnalyticsFiltersProps {
  className?: string;
  variant?: FilterVariant;
  /** @deprecated Use variant instead */
  showPivot?: boolean;
  showDateRange?: boolean;
  showGranularity?: boolean;
  showDateFilterType?: boolean;
}

export function AnalyticsFilters({
  className,
  variant = 'revenue',
  showPivot,
  showDateRange = true,
  showGranularity: showGranularityProp,
  showDateFilterType: showDateFilterTypeProp,
}: AnalyticsFiltersProps) {
  const { filters, setFilters, resetFilters } = useAnalyticsFilters();

  // --- Local state for deferred date apply (Lọc button) ---
  const [localDateStart, setLocalDateStart] = useState(filters.dateStart);
  const [localDateEnd, setLocalDateEnd] = useState(filters.dateEnd);

  // Sync local date state when URL changes externally (navigation)
  useEffect(() => {
    setLocalDateStart(filters.dateStart);
    setLocalDateEnd(filters.dateEnd);
  }, [filters.dateStart, filters.dateEnd]);

  // Detect active preset from local dates
  const activePreset = useMemo(() => detectPreset(localDateStart, localDateEnd), [localDateStart, localDateEnd]);

  // Handle quick preset change → auto-fill dates AND apply immediately
  const handlePresetChange = useCallback((preset: QuickPreset) => {
    const p = QUICK_PRESETS.find((x) => x.value === preset);
    if (p && p.getRange) {
      const range = p.getRange();
      setLocalDateStart(range.start);
      setLocalDateEnd(range.end);
      // Apply immediately for presets
      setFilters({ dateStart: range.start, dateEnd: range.end });
    }
    // 'custom' → user edits dates manually, applied on Lọc click
  }, [setFilters]);

  // Handle "Lọc" click → commit local dates to URL
  const handleApply = useCallback(() => {
    setFilters({ dateStart: localDateStart, dateEnd: localDateEnd });
  }, [localDateStart, localDateEnd, setFilters]);

  // --- Variant config --- (CHỖ NGHỈ + LỌC THEO always visible on all pages)
  const config = useMemo(() => {
    if (showPivot === false) return { showPivotSelector: false, showMultiSelect: false, showPropertyFilter: true, pivotOptions: [] as PivotType[] };
    switch (variant) {
      case 'overview': return { showPivotSelector: false, showMultiSelect: false, showPropertyFilter: true, pivotOptions: [] as PivotType[] };
      case 'revenue': return { showPivotSelector: true, showMultiSelect: true, showPropertyFilter: true, pivotOptions: ['all', 'channel', 'property', 'area'] as PivotType[] };
      case 'price-spread': return { showPivotSelector: false, showMultiSelect: false, showPropertyFilter: true, pivotOptions: [] as PivotType[] };
      case 'host-cost': return { showPivotSelector: false, showMultiSelect: false, showPropertyFilter: true, pivotOptions: [] as PivotType[] };
      default: return { showPivotSelector: true, showMultiSelect: true, showPropertyFilter: true, pivotOptions: ['all', 'channel', 'property', 'area'] as PivotType[] };
    }
  }, [variant, showPivot]);

  // Check if local dates differ from applied (visual indicator)
  const hasUnapplied = localDateStart !== filters.dateStart || localDateEnd !== filters.dateEnd;

  return (
    <div className={cn(
      'sticky top-0 z-10 -mx-6 px-6 -mt-2 pt-3 pb-2',
      'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75',
      'border-b border-border/40',
      className
    )}>
      {/* ========== MAIN FILTER ROW ========== */}
      <div className="flex flex-wrap items-end gap-4">
        {/* CHỌN NHANH */}
        {showDateRange && (
          <FilterField label="CHỌN NHANH">
            <Select value={activePreset} onValueChange={(v) => handlePresetChange(v as QuickPreset)}>
              <SelectTrigger className="w-[130px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUICK_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}

        {/* TỪ NGÀY */}
        {showDateRange && (
          <FilterField label="TỪ NGÀY">
            <Input
              type="date"
              value={localDateStart}
              onChange={(e) => setLocalDateStart(e.target.value)}
              className="w-[150px] h-10"
            />
          </FilterField>
        )}

        {/* ĐẾN NGÀY */}
        {showDateRange && (
          <FilterField label="ĐẾN NGÀY">
            <Input
              type="date"
              value={localDateEnd}
              onChange={(e) => setLocalDateEnd(e.target.value)}
              className="w-[150px] h-10"
            />
          </FilterField>
        )}

        {/* LỌC THEO (Date Type) — Sprint 3: LOCKED to actual checkout.
            dateFilterType field preserved in URL/state for backward compat.
            UI shows locked badge instead of dropdown. */}
        <FilterField label="LỌC THEO">
          <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-muted/50 text-sm min-w-[200px]">
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-foreground font-medium">Ngày trả phòng thực tế</span>
          </div>
        </FilterField>

        {/* NHÓM THEO (Granularity) — Day/Week/Month/Quarter */}
        <FilterField label="NHÓM THEO">
          <Select value={filters.granularity} onValueChange={(v) => setFilters({ granularity: v as Granularity })}>
            <SelectTrigger className="w-[130px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{GRANULARITY_LABELS.day}</SelectItem>
              <SelectItem value="week">{GRANULARITY_LABELS.week}</SelectItem>
              <SelectItem value="month">{GRANULARITY_LABELS.month}</SelectItem>
              <SelectItem value="quarter">{GRANULARITY_LABELS.quarter}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        {/* SO SÁNH (Compare Mode) — None/Previous/YoY, from URL SOT */}
        <FilterField label="SO SÁNH">
          <Select value={filters.compareMode} onValueChange={(v) => setFilters({ compareMode: v as CompareMode })}>
            <SelectTrigger className="w-[140px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{COMPARE_MODE_LABELS.none}</SelectItem>
              <SelectItem value="previous">{COMPARE_MODE_LABELS.previous}</SelectItem>
              <SelectItem value="yoy">{COMPARE_MODE_LABELS.yoy}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        {/* CHỖ NGHỈ (Property Filter) — always visible */}
        {config.showPropertyFilter && (
          <FilterField label="CHỖ NGHỈ">
            <PropertyFilter
              selectedIds={filters.selectedIds}
              onSelectedIdsChange={(ids) => setFilters({ selectedIds: ids })}
            />
          </FilterField>
        )}

        {/* Pivot Selector (Revenue only) */}
        {config.showPivotSelector && (
          <FilterField label="PHÂN TÍCH">
            <Select value={filters.pivot} onValueChange={(v) => setFilters({ pivot: v as PivotType })}>
              <SelectTrigger className="w-[130px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.pivotOptions.map((p) => (
                  <SelectItem key={p} value={p}>{PIVOT_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}

        {/* Pivot Multi-select (Revenue when pivot != all) */}
        {config.showMultiSelect && filters.pivot !== 'all' && (
          <FilterField label={PIVOT_LABELS[filters.pivot]?.toUpperCase() || 'LỌC'}>
            <PivotMultiSelect
              pivot={filters.pivot}
              selectedIds={filters.selectedIds}
              onSelectedIdsChange={(ids) => setFilters({ selectedIds: ids })}
            />
          </FilterField>
        )}

        {/* ========== LỌC BUTTON ========== */}
        <div className="flex flex-col justify-end">
          <Button
            onClick={handleApply}
            className={cn(
              'h-10 px-5 gap-2',
              hasUnapplied
                ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30'
                : 'bg-primary text-primary-foreground'
            )}
          >
            <Filter className="h-4 w-4" />
            Lọc
          </Button>
        </div>
      </div>

      {/* ========== ENHANCED CONTEXT SUMMARY ========== */}
      <ContextSummary
        filters={filters}
        propertyCount={filters.selectedIds.length}
      />
    </div>
  );
}
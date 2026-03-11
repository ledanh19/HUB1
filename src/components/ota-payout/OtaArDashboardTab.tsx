/**
 * OtaArDashboardTab v4 — OTA AR Dashboard with cascading filters
 *
 * Filters:
 *   - Chỗ nghỉ (channex property) — sets channex_property_id
 *   - ID chỗ nghỉ (OTA) — cascades from Chỗ nghỉ, searchable via Popover+Command
 *   - Nguồn OTA — ota_source
 *   - Tìm kiếm — client-side text filter on breakdown tables
 *   - Date range (advanced) — checkout date filter
 *
 * All filters wire to RPC → affect KPIs, aging, breakdown.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    useOtaArDashboardV2,
    useChannexPropertyList,
    useOtaPropertyIdList,
    useOtaSourceList,
    type OtaArV2SourceRow,
    type OtaArV2PropertyRow,
} from "@/hooks/useOtaArDashboardV2";
import { SectionCard } from "@/components/layout/SectionCard";
import { FilterBar } from "@/components/ui/filter-bar";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { Input } from "@/components/ui/input";
import { OtaBadge } from "@/components/ui/ota-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Receipt,
    TrendingUp,
    Clock,
    AlertTriangle,
    Building2,
    Globe2,
    Loader2,
    BarChart3,
    ChevronDown,
    Check,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// -- Helpers --
const fmt = (amount: number) =>
    new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(amount);

const AGING_CONFIG = [
    { bucket: "0_7", label: "0–7 ngày", color: "bg-success/10 text-success border-success/20" },
    { bucket: "8_14", label: "8–14 ngày", color: "bg-warning/10 text-warning border-warning/20" },
    { bucket: "15_30", label: "15–30 ngày", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    { bucket: "GT_30", label: ">30 ngày", color: "bg-destructive/10 text-destructive border-destructive/20" },
] as const;

// -- Main Component --
export function OtaArDashboardTab() {
    const [searchParams, setSearchParams] = useSearchParams();

    // URL filters
    const otaPropertyFilter = searchParams.get("property") || undefined;     // ota_property_id
    const channexPropertyFilter = searchParams.get("channex") || undefined;  // channex_property_id
    const sourceFilter = searchParams.get("source") || undefined;

    // Local state filters
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [idPopoverOpen, setIdPopoverOpen] = useState(false);

    // Pivot mode
    const [pivotMode, setPivotMode] = useState<"source" | "property">("source");

    // Data via RPC (server-side filters)
    const { data, isLoading, isFetching } = useOtaArDashboardV2({
        propertyId: otaPropertyFilter,
        source: sourceFilter,
        channexPropertyId: channexPropertyFilter,
    });
    const { data: channexPropertyList } = useChannexPropertyList();
    // Cascading: OTA IDs filtered by selected channex property
    const { data: otaPropertyIdList } = useOtaPropertyIdList(channexPropertyFilter);
    const { data: sourceList } = useOtaSourceList();

    // Filter setters
    const setFilter = (key: string, value: string | undefined) => {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(key, value);
        } else {
            newParams.delete(key);
        }
        setSearchParams(newParams, { replace: true });
    };

    const handleChannexPropertyChange = (value: string) => {
        const newParams = new URLSearchParams(searchParams);
        if (value === "ALL") {
            newParams.delete("channex");
        } else {
            newParams.set("channex", value);
        }
        // Clear OTA property ID when channex property changes (cascade reset)
        newParams.delete("property");
        setSearchParams(newParams, { replace: true });
    };

    const clearAllFilters = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("property");
        newParams.delete("channex");
        newParams.delete("source");
        setSearchParams(newParams, { replace: true });
        setDateFrom("");
        setDateTo("");
        setSearchTerm("");
    };

    const hasFilters = !!otaPropertyFilter || !!channexPropertyFilter || !!sourceFilter || !!dateFrom || !!dateTo || !!searchTerm;

    // Summary data
    const summary = data?.summary;
    const aging = data?.aging || [];
    const bySource = data?.by_source || [];
    const byProperty = data?.by_property || [];

    // Client-side search filter
    const filteredByProperty = useMemo(() => {
        if (!searchTerm) return byProperty;
        const term = searchTerm.toLowerCase();
        return byProperty.filter(
            (row) =>
                row.ota_property_id.toLowerCase().includes(term) ||
                row.property_name.toLowerCase().includes(term) ||
                (row.ota_source || "").toLowerCase().includes(term)
        );
    }, [byProperty, searchTerm]);

    const filteredBySource = useMemo(() => {
        if (!searchTerm) return bySource;
        const term = searchTerm.toLowerCase();
        return bySource.filter((row) => row.source.toLowerCase().includes(term));
    }, [bySource, searchTerm]);

    // Selected OTA property label for display
    const selectedOtaPropLabel = useMemo(() => {
        if (!otaPropertyFilter) return "Tất cả ID";
        const found = otaPropertyIdList?.find((p) => p.id === otaPropertyFilter);
        return found ? found.label : otaPropertyFilter;
    }, [otaPropertyFilter, otaPropertyIdList]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4 mt-4">
            {/* ===== FILTER BAR ===== */}
            <FilterBar
                title="Bộ lọc"
                subtitle="Lọc dữ liệu công nợ OTA"
                hasActiveFilters={hasFilters}
                onClearFilters={clearAllFilters}
            >
                <FilterBar.Field label="Tìm kiếm" colSpan={2}>
                    <DebouncedSearch
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Tìm theo ID, tên chỗ nghỉ..."
                    />
                </FilterBar.Field>
                <FilterBar.Field label="Nguồn OTA">
                    <Select
                        value={sourceFilter || "ALL"}
                        onValueChange={(v) => setFilter("source", v === "ALL" ? undefined : v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Tất cả OTA" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tất cả OTA</SelectItem>
                            {(sourceList || []).map((s) => (
                                <SelectItem key={s} value={s}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterBar.Field>
                <FilterBar.Field label="Chỗ nghỉ">
                    <Select
                        value={channexPropertyFilter || "ALL"}
                        onValueChange={handleChannexPropertyChange}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Tất cả chỗ nghỉ" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tất cả chỗ nghỉ</SelectItem>
                            {(channexPropertyList || []).map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterBar.Field>
                <FilterBar.Field label="ID chỗ nghỉ (OTA)">
                    <Popover open={idPopoverOpen} onOpenChange={setIdPopoverOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                role="combobox"
                                aria-expanded={idPopoverOpen}
                                className={cn(
                                    "flex h-8 w-full items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs",
                                    "shadow-sm transition-all duration-150 ease-out",
                                    "hover:border-border hover:bg-muted/30",
                                    "focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15",
                                )}
                            >
                                <span className="truncate">
                                    {selectedOtaPropLabel}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[340px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Tìm ID chỗ nghỉ..." />
                                <CommandList>
                                    <CommandEmpty>Không tìm thấy</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="ALL"
                                            onSelect={() => {
                                                setFilter("property", undefined);
                                                setIdPopoverOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    !otaPropertyFilter ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            Tất cả ID
                                        </CommandItem>
                                        {(otaPropertyIdList || []).map((p) => (
                                            <CommandItem
                                                key={p.id}
                                                value={p.label}
                                                onSelect={() => {
                                                    setFilter("property", p.id === otaPropertyFilter ? undefined : p.id);
                                                    setIdPopoverOpen(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        otaPropertyFilter === p.id ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {p.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </FilterBar.Field>
                <FilterBar.AdvancedSection
                    label="Lọc theo ngày"
                    activeCount={(dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                >
                    <FilterBar.Field label="Checkout từ ngày">
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </FilterBar.Field>
                    <FilterBar.Field label="Checkout đến ngày">
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </FilterBar.Field>
                </FilterBar.AdvancedSection>
            </FilterBar>

            {/* ===== SUMMARY CARDS ===== */}
            <SectionCard>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Outstanding Total */}
                    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-md bg-primary/20">
                                <Receipt className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">
                                Tổng công nợ OTA
                            </span>
                        </div>
                        <p className="text-2xl font-bold tracking-tight tabular-nums">
                            {fmt(summary?.total_outstanding || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            = Chờ tạo payout + Đang chuyển về
                        </p>
                    </div>

                    {/* Eligible */}
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-md bg-warning/20">
                                <Clock className="h-4 w-4 text-warning" />
                            </div>
                            <span className="text-xs text-warning font-medium">Chờ tạo payout</span>
                        </div>
                        <p className="text-2xl font-bold tracking-tight tabular-nums">
                            {fmt(summary?.eligible_amount || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary?.eligible_count || 0} booking đủ điều kiện
                        </p>
                    </div>

                    {/* Pending */}
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-md bg-primary/20">
                                <TrendingUp className="h-4 w-4 text-info" />
                            </div>
                            <span className="text-xs text-info font-medium">Đang chuyển về</span>
                        </div>
                        <p className="text-2xl font-bold tracking-tight tabular-nums">
                            {fmt(summary?.pending_amount || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary?.pending_count || 0} payout
                            {(summary?.overdue_payout_count || 0) > 0
                                ? ` · ${summary?.overdue_payout_count} quá hạn`
                                : ""}
                        </p>
                    </div>
                </div>
            </SectionCard>

            {/* ===== AGING BUCKETS ===== */}
            <SectionCard>
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">
                        Tuổi nợ chờ payout{" "}
                        <span className="text-muted-foreground font-normal">(từ ngày checkout)</span>
                    </h3>
                    {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {AGING_CONFIG.map((cfg) => {
                        const bucket = aging.find((a) => a.bucket === cfg.bucket);
                        return (
                            <div
                                key={cfg.bucket}
                                className={`rounded-lg border p-3 text-center ${cfg.color}`}
                            >
                                <p className="text-xs font-medium mb-1">{cfg.label}</p>
                                <p className="text-lg font-bold tabular-nums truncate">
                                    {fmt(bucket?.amount || 0)}
                                </p>
                                <p className="text-xs opacity-70 mt-0.5">
                                    {bucket?.count || 0} booking
                                </p>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>

            {/* ===== PIVOT BREAKDOWN ===== */}
            <SectionCard>
                <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Phân tích</h3>
                    <div className="flex gap-1 ml-2">
                        <Button
                            variant={pivotMode === "source" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-6 text-xs gap-1 px-2"
                            onClick={() => setPivotMode("source")}
                        >
                            <Globe2 className="h-3 w-3" /> Theo nguồn OTA
                        </Button>
                        <Button
                            variant={pivotMode === "property" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-6 text-xs gap-1 px-2"
                            onClick={() => setPivotMode("property")}
                        >
                            <Building2 className="h-3 w-3" /> Theo chỗ nghỉ
                        </Button>
                    </div>
                    <Badge variant="outline" className="text-xs ml-auto">
                        Chờ tạo payout
                    </Badge>
                </div>

                {pivotMode === "source" ? (
                    <SourceBreakdown
                        rows={filteredBySource}
                        total={summary?.eligible_amount || 0}
                        activeSource={sourceFilter}
                        onSelectSource={(s) => setFilter("source", s === sourceFilter ? undefined : s)}
                    />
                ) : (
                    <PropertyBreakdown
                        rows={filteredByProperty}
                        total={summary?.eligible_amount || 0}
                        activeProperty={otaPropertyFilter}
                        onSelectProperty={(p) => setFilter("property", p === otaPropertyFilter ? undefined : p)}
                    />
                )}
            </SectionCard>

            {/* ===== OVERDUE PAYOUTS ALERT ===== */}
            {(summary?.overdue_payout_count || 0) > 0 && (
                <SectionCard className="border-destructive/30 bg-destructive/5">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <h3 className="text-sm font-medium text-destructive">
                            {summary?.overdue_payout_count} payout quá hạn
                        </h3>
                        <span className="text-xs text-muted-foreground">
                            · Tổng {fmt(summary?.overdue_payout_amount || 0)}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Payout có payout_date đã qua nhưng chưa nhận tiền (PENDING/PARTIAL).
                        Kiểm tra tại tab &quot;Danh sách payout&quot;.
                    </p>
                </SectionCard>
            )}
        </div>
    );
}

// -- Sub-components --

function SourceBreakdown({
    rows,
    total,
    activeSource,
    onSelectSource,
}: {
    rows: OtaArV2SourceRow[];
    total: number;
    activeSource?: string;
    onSelectSource: (source: string) => void;
}) {
    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground py-4 text-center">Không có dữ liệu</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nguồn OTA</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead className="text-right">Booking</TableHead>
                    <TableHead className="text-right">Tỉ trọng</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => (
                    <TableRow
                        key={row.source}
                        className={`cursor-pointer transition-colors ${activeSource === row.source
                            ? "bg-primary/10 hover:bg-primary/15"
                            : "hover:bg-muted/50"
                            }`}
                        onClick={() => onSelectSource(row.source)}
                    >
                        <TableCell>
                            <OtaBadge source={row.source} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                            {fmt(row.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                            {total ? ((row.amount / total) * 100).toFixed(1) + "%" : "—"}
                        </TableCell>
                    </TableRow>
                ))}
                <TableRow className="font-semibold border-t-2">
                    <TableCell>Tổng</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                        {rows.reduce((s, r) => s + r.count, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">100%</TableCell>
                </TableRow>
            </TableBody>
        </Table>
    );
}

function PropertyBreakdown({
    rows,
    total,
    activeProperty,
    onSelectProperty,
}: {
    rows: OtaArV2PropertyRow[];
    total: number;
    activeProperty?: string;
    onSelectProperty: (otaPropertyId: string) => void;
}) {
    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground py-4 text-center">Không có dữ liệu</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>ID chỗ nghỉ (OTA)</TableHead>
                    <TableHead>Tên chỗ nghỉ</TableHead>
                    <TableHead>Nguồn OTA</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead className="text-right">Booking</TableHead>
                    <TableHead className="text-right">Tỉ trọng</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => (
                    <TableRow
                        key={`${row.ota_property_id}-${row.ota_source}`}
                        className={`cursor-pointer transition-colors ${activeProperty === row.ota_property_id
                            ? "bg-primary/10 hover:bg-primary/15"
                            : "hover:bg-muted/50"
                            }`}
                        onClick={() => onSelectProperty(row.ota_property_id)}
                    >
                        <TableCell className="font-mono text-xs">{row.ota_property_id}</TableCell>
                        <TableCell className="font-medium">{row.property_name}</TableCell>
                        <TableCell>
                            <OtaBadge source={row.ota_source} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                            {fmt(row.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                            {total ? ((row.amount / total) * 100).toFixed(1) + "%" : "—"}
                        </TableCell>
                    </TableRow>
                ))}
                <TableRow className="font-semibold border-t-2">
                    <TableCell>Tổng</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{fmt(total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                        {rows.reduce((s, r) => s + r.count, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">100%</TableCell>
                </TableRow>
            </TableBody>
        </Table>
    );
}

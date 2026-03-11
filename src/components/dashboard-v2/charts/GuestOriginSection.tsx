/**
 * GuestOriginSection — Wrapper combining the World Map + Country Ranking.
 *
 * Desktop: 2-column grid (map left, ranking right)
 * Mobile: stacked vertically (map on top, ranking below)
 *
 * NON-BREAKING: Standalone section component.
 * Includes error boundary to prevent map crashes from taking down the dashboard.
 */

import { memo, Suspense, lazy, Component, useState } from "react";
import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import type { GuestOriginRow } from "@/hooks/useGuestOriginAnalytics";
import { GuestCountryRanking } from "./GuestCountryRanking";
import { SectionHeaderV2 } from "../ui/SectionHeaderV2";

// Lazy-load the map to isolate any react-simple-maps runtime errors
const GuestOriginMap = lazy(() =>
    import("./GuestOriginMap").then((mod) => ({ default: mod.GuestOriginMap }))
);

// ── Error Boundary for the map ──
interface ErrorBoundaryState {
    hasError: boolean;
}

class MapErrorBoundary extends Component<
    { children: ReactNode; fallback: ReactNode },
    ErrorBoundaryState
> {
    state: ErrorBoundaryState = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: Error) {
        console.error("[GuestOriginMap] Render error:", error);
    }
    render() {
        if (this.state.hasError) return this.props.fallback;
        return this.props.children;
    }
}

interface GuestOriginSectionProps {
    data: GuestOriginRow[];
    totalBookings: number;
    isLoading: boolean;
    isMobile?: boolean;
}

function GuestOriginSectionInner({
    data,
    totalBookings,
    isLoading,
    isMobile = false,
}: GuestOriginSectionProps) {
    const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);
    const mapHeight = isMobile ? 220 : 320;

    const header = (
        <SectionHeaderV2
            icon={Globe}
            title="Nguồn gốc khách"
            badge={
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        Khách đến từ đâu
                    </span>
                    {!isLoading && totalBookings > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {totalBookings.toLocaleString()} đặt phòng
                        </span>
                    )}
                </div>
            }
        />
    );

    if (isLoading) {
        return (
            <div className="space-y-4">
                {header}
                <div
                    className="flex items-center justify-center text-sm text-muted-foreground"
                    style={{ height: mapHeight }}
                >
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        Đang tải bản đồ...
                    </div>
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="space-y-4">
                {header}
                <div
                    className="flex items-center justify-center text-sm text-muted-foreground"
                    style={{ height: mapHeight }}
                >
                    Chưa có dữ liệu quốc tịch khách
                </div>
            </div>
        );
    }

    const mapFallback = (
        <div
            className="flex items-center justify-center text-sm text-muted-foreground rounded-xl border border-border/20 bg-muted/10"
            style={{ height: mapHeight }}
        >
            Không thể hiển thị bản đồ
        </div>
    );

    return (
        <div className="space-y-4">
            {header}

            <div
                className={
                    isMobile
                        ? "space-y-4"
                        : "grid grid-cols-1 lg:grid-cols-2 gap-6"
                }
            >
                {/* Map — wrapped in error boundary + suspense */}
                <MapErrorBoundary fallback={mapFallback}>
                    <Suspense
                        fallback={
                            <div
                                className="flex items-center justify-center text-sm text-muted-foreground rounded-xl border border-border/20 bg-muted/10"
                                style={{ height: mapHeight }}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    Đang tải bản đồ...
                                </div>
                            </div>
                        }
                    >
                        <div className="rounded-xl border border-border/20 overflow-hidden bg-muted/10">
                            <GuestOriginMap
                                data={data}
                                totalBookings={totalBookings}
                                height={mapHeight}
                                hoveredIso3={hoveredIso3}
                                onHoverChange={setHoveredIso3}
                            />
                        </div>
                    </Suspense>
                </MapErrorBoundary>

                {/* Ranking */}
                <div>
                    <GuestCountryRanking
                        data={data}
                        totalBookings={totalBookings}
                        isMobile={isMobile}
                        hoveredIso3={hoveredIso3}
                        onHoverChange={setHoveredIso3}
                    />
                </div>
            </div>
        </div>
    );
}

export const GuestOriginSection = memo(GuestOriginSectionInner);

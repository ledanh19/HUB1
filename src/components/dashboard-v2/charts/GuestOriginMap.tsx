/**
 * GuestOriginMap — World Choropleth Map for guest nationality distribution.
 *
 * Uses react-simple-maps with scaleQuantize color mapping.
 * NON-BREAKING: Standalone component, no side effects.
 */

import { useState, useMemo, memo } from "react";
import {
    ComposableMap,
    Geographies,
    Geography,
    ZoomableGroup,
} from "react-simple-maps";
import type { GuestOriginRow } from "@/hooks/useGuestOriginAnalytics";
import { getCountryName, resolveISO3, getFlag } from "@/lib/countryMapping";

const GEO_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";

// Color palette: light gray → light blue → blue → dark blue
const COLOR_SCALE = ["#E5E7EB", "#93C5FD", "#2563EB", "#1E40AF"];
const DEFAULT_COLOR = "#F3F4F6";

interface GuestOriginMapProps {
    data: GuestOriginRow[];
    totalBookings: number;
    height?: number;
    className?: string;
    hoveredIso3?: string | null;
    onHoverChange?: (iso3: string | null) => void;
}

/** ISO_A3 property name in TopoJSON features or resolve from name */
function getISO3FromGeo(geo: any): string {
    const fromProps =
        geo.properties?.ISO_A3 ||
        geo.properties?.iso_a3 ||
        geo.properties?.ISO_A3_EH;
    if (fromProps) return fromProps;

    // world-atlas@2 usually only provides properties.name
    if (geo.properties?.name) {
        const resolved = resolveISO3(geo.properties.name);
        if (resolved !== "UNKNOWN") return resolved;
    }
    return "";
}

/** Format currency in VND (compact) */
function formatADR(value: number): string {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(value);
}

function GuestOriginMapInner({
    data,
    totalBookings,
    height = 320,
    className,
    hoveredIso3,
    onHoverChange,
}: GuestOriginMapProps) {
    const [tooltip, setTooltip] = useState<{
        x: number;
        y: number;
        row: GuestOriginRow;
    } | null>(null);

    // Build lookup: ISO3 → GuestOriginRow
    const iso3Map = useMemo(() => {
        const m = new Map<string, GuestOriginRow>();
        for (const row of data) {
            m.set(row.iso3, row);
        }
        return m;
    }, [data]);

    // Calculate quantize thresholds from data
    const getColor = useMemo(() => {
        if (data.length === 0) return () => DEFAULT_COLOR;
        const values = data.map((d) => d.bookings).sort((a, b) => a - b);
        const max = values[values.length - 1] || 1;
        const thresholds = [max * 0.1, max * 0.3, max * 0.6];

        return (bookings: number) => {
            if (bookings <= 0) return DEFAULT_COLOR;
            if (bookings < thresholds[0]) return COLOR_SCALE[0];
            if (bookings < thresholds[1]) return COLOR_SCALE[1];
            if (bookings < thresholds[2]) return COLOR_SCALE[2];
            return COLOR_SCALE[3];
        };
    }, [data]);

    return (
        <div className={`relative ${className || ""}`} style={{ height }}>
            <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                    scale: 120,
                    center: [0, 20],
                }}
                width={800}
                height={height}
                style={{ width: "100%", height: "100%" }}
            >
                <ZoomableGroup>
                    <Geographies geography={GEO_URL}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const iso3 = getISO3FromGeo(geo);
                                const row = iso3Map.get(iso3);
                                const fill = row ? getColor(row.bookings) : DEFAULT_COLOR;

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        fill={fill}
                                        stroke="#D1D5DB"
                                        strokeWidth={iso3 === hoveredIso3 ? 1 : 0.4}
                                        style={{
                                            default: { fill: iso3 === hoveredIso3 ? "#1E3A5F" : fill, outline: "none" },
                                            hover: {
                                                fill: row ? "#1E3A5F" : "#E2E8F0",
                                                outline: "none",
                                                cursor: row ? "pointer" : "default",
                                            },
                                            pressed: { fill: row ? "#1E3A5F" : fill, outline: "none" },
                                        }}
                                        onMouseEnter={(evt) => {
                                            if (row) {
                                                const rect = (
                                                    evt.target as SVGElement
                                                ).closest("svg")?.getBoundingClientRect();
                                                setTooltip({
                                                    x: evt.clientX - (rect?.left || 0),
                                                    y: evt.clientY - (rect?.top || 0),
                                                    row,
                                                });
                                                onHoverChange?.(row.iso3);
                                            }
                                        }}
                                        onMouseMove={(evt) => {
                                            if (row) {
                                                const rect = (
                                                    evt.target as SVGElement
                                                ).closest("svg")?.getBoundingClientRect();
                                                setTooltip({
                                                    x: evt.clientX - (rect?.left || 0),
                                                    y: evt.clientY - (rect?.top || 0),
                                                    row,
                                                });
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setTooltip(null);
                                            onHoverChange?.(null);
                                        }}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ZoomableGroup>
            </ComposableMap>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="absolute z-50 pointer-events-none bg-slate-900 text-white rounded-lg px-3 py-2 text-xs shadow-lg"
                    style={{
                        left: Math.min(tooltip.x + 12, 800 - 180),
                        top: tooltip.y - 60,
                    }}
                >
                    <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                        {getFlag(tooltip.row.iso3) ? (
                            <img
                                src={getFlag(tooltip.row.iso3) as string}
                                width={20}
                                alt="flag"
                                className="rounded shadow-sm inline-block"
                            />
                        ) : (
                            "🏳️"
                        )}
                        {getCountryName(tooltip.row.iso3)}
                    </div>
                    <div className="space-y-0.5 text-gray-300">
                        <p>
                            Bookings:{" "}
                            <span className="text-white font-medium">
                                {tooltip.row.bookings.toLocaleString()}
                            </span>
                        </p>
                        <p>
                            Share:{" "}
                            <span className="text-white font-medium">
                                {tooltip.row.share.toFixed(1)}%
                            </span>
                        </p>
                        <p>
                            ADR:{" "}
                            <span className="text-white font-medium">
                                {formatADR(tooltip.row.adr)}
                            </span>
                        </p>
                    </div>
                </div>
            )}

            {/* Color legend */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Ít</span>
                {COLOR_SCALE.map((c, i) => (
                    <div
                        key={i}
                        className="w-4 h-2.5 rounded-sm"
                        style={{ backgroundColor: c }}
                    />
                ))}
                <span>Nhiều</span>
            </div>
        </div>
    );
}

export const GuestOriginMap = memo(GuestOriginMapInner);

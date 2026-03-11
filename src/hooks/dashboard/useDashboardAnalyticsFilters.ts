/**
 * useDashboardAnalyticsFilters — Global filter state for Dashboard Tab 2 (Analytics).
 *
 * Single source of truth for all Tab 2 sections.
 *
 * PRESETS (PMS SaaS standard — calendar-based):
 *   - THIS_YEAR:  Jan 1 → Dec 31 of current year
 *   - LAST_YEAR:  Jan 1 → Dec 31 of previous year
 *   - THIS_MONTH: 1st of current month → last day of current month
 *   - LAST_MONTH: 1st → last day of previous month
 *   - LAST_90D:   today-89 → today
 *   - CUSTOM:     user-picked range
 *
 * BUCKET RULE:
 *   <=  31 days → DAY
 *   >   31 days → MONTH
 *
 * PROPERTY FILTER: Uses channex_property_id (PMS property mapping)
 *
 * NON-BREAKING: New file, does not modify any existing code.
 */

import { useState, useMemo, useCallback } from "react";
import {
    format,
    subDays,
    startOfMonth,
    endOfMonth,
    subMonths,
    startOfYear,
    endOfYear,
} from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Preset =
    | "THIS_YEAR"
    | "LAST_YEAR"
    | "THIS_MONTH"
    | "LAST_MONTH"
    | "LAST_90D"
    | "CUSTOM";

export type TimeKey = "booking_date" | "check_in_date" | "check_out_date";
export type Bucket = "DAY" | "MONTH";

export interface AnalyticsFilters {
    preset: Preset;
    dateFrom: string; // YYYY-MM-DD
    dateTo: string; // YYYY-MM-DD
    timeKey: TimeKey;
    bucket: Bucket; // derived: <=31d → DAY, >31d → MONTH
    propertyId: string | null; // PMS property filter (channex_property_id)
    setPreset: (p: Preset) => void;
    setCustomRange: (from: Date, to: Date) => void;
    setTimeKey: (k: TimeKey) => void;
    setPropertyId: (id: string | null) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeRange(preset: Exclude<Preset, "CUSTOM">): {
    from: string;
    to: string;
} {
    const now = new Date();
    const fmt = (d: Date) => format(d, "yyyy-MM-dd");

    switch (preset) {
        case "THIS_YEAR":
            // Full year: Jan 1 → Dec 31 (shows all 12 months including future)
            return { from: fmt(startOfYear(now)), to: fmt(endOfYear(now)) };

        case "LAST_YEAR": {
            const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
            const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
            return { from: fmt(lastYearStart), to: fmt(lastYearEnd) };
        }

        case "THIS_MONTH":
            return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };

        case "LAST_MONTH": {
            const prev = subMonths(now, 1);
            return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
        }

        case "LAST_90D":
            return { from: fmt(subDays(now, 89)), to: fmt(now) };
    }
}

function deriveBucket(dateFrom: string, dateTo: string): Bucket {
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00");
    const diffMs = to.getTime() - from.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return diffDays <= 31 ? "DAY" : "MONTH";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardAnalyticsFilters(): AnalyticsFilters {
    // Default: current year (PMS SaaS standard)
    const defaultRange = useMemo(() => computeRange("THIS_YEAR"), []);

    const [preset, setPresetState] = useState<Preset>("THIS_YEAR");
    const [dateFrom, setDateFrom] = useState(defaultRange.from);
    const [dateTo, setDateTo] = useState(defaultRange.to);
    const [timeKey, setTimeKeyState] = useState<TimeKey>("check_in_date");
    const [propertyId, setPropertyIdState] = useState<string | null>(null);

    const bucket = useMemo(
        () => deriveBucket(dateFrom, dateTo),
        [dateFrom, dateTo]
    );

    const setPreset = useCallback((p: Preset) => {
        setPresetState(p);
        if (p !== "CUSTOM") {
            const range = computeRange(p);
            setDateFrom(range.from);
            setDateTo(range.to);
        }
    }, []);

    const setCustomRange = useCallback((from: Date, to: Date) => {
        setPresetState("CUSTOM");
        setDateFrom(format(from, "yyyy-MM-dd"));
        setDateTo(format(to, "yyyy-MM-dd"));
    }, []);

    const setTimeKey = useCallback((k: TimeKey) => {
        setTimeKeyState(k);
    }, []);

    const setPropertyId = useCallback((id: string | null) => {
        setPropertyIdState(id);
    }, []);

    return {
        preset,
        dateFrom,
        dateTo,
        timeKey,
        bucket,
        propertyId,
        setPreset,
        setCustomRange,
        setTimeKey,
        setPropertyId,
    };
}

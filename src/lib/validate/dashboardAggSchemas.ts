/**
 * Payload validators for Dashboard aggregated RPC responses.
 *
 * Used for defense-in-depth: if RPC returns invalid shape,
 * the system falls back to Phase 3A client-side logic.
 */

interface ForecastV1Payload {
    committedIn: number;
    likelyIn: number;
    pendingCount: number;
    partialCount: number;
    expectedServiceOut: number;
}

interface HostDebtV1Payload {
    totalPayable: number;
    totalPaid: number;
    remaining: number;
    unpaidCount: number;
    unsettledCount: number;
    actualPayable: number;
    actualUnsettled: number;
    actualRemaining: number;
    actualCount: number;
    expectedPayable: number;
    expectedRemaining: number;
    expectedCount: number;
    /** Expected revenue from future host-debt bookings (optional, Phase 3A only) */
    expectedRevenue?: number;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

/**
 * Validate dashboard_forecast_summary_v1 RPC response.
 * Returns typed payload if valid, null if invalid.
 */
export function validateForecastV1(data: unknown): ForecastV1Payload | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;

    const required: (keyof ForecastV1Payload)[] = [
        "committedIn", "likelyIn", "pendingCount", "partialCount", "expectedServiceOut",
    ];

    for (const key of required) {
        if (!(key in d) || !isFiniteNumber(d[key])) return null;
    }

    return d as unknown as ForecastV1Payload;
}

/**
 * Validate dashboard_host_debt_summary_v1 RPC response.
 * Returns typed payload if valid, null if invalid.
 */
export function validateHostDebtV1(data: unknown): HostDebtV1Payload | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;

    const required: (keyof HostDebtV1Payload)[] = [
        "totalPayable", "totalPaid", "remaining",
        "unpaidCount", "unsettledCount",
        "actualPayable", "actualUnsettled", "actualRemaining", "actualCount",
        "expectedPayable", "expectedRemaining", "expectedCount",
    ];

    for (const key of required) {
        if (!(key in d) || !isFiniteNumber(d[key])) return null;
    }

    return d as unknown as HostDebtV1Payload;
}

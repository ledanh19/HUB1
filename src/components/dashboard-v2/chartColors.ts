/**
 * Centralized chart color palette — Uses SYSTEM CSS variables
 * Maps to the Roomrise Control Hub design system defined in index.css
 *
 * All colors reference system variables for dark mode support
 * and design system consistency.
 *
 * Usage: style={{ color: chartColors.revenue }} or fill={chartColors.revenue}
 */

// ── Semantic chart colors (mapped to system CSS variables) ──
export const chartColors = {
    // Revenue & finance — primary navy
    revenue: "hsl(var(--chart-1))",       // --primary / navy
    expense: "hsl(var(--chart-4))",       // --danger / red
    hostCost: "hsl(var(--chart-4))",       // --danger / red
    upcomingCost: "hsl(var(--chart-3))",       // --warning / amber

    // Cashflow
    cashIn: "hsl(var(--chart-2))",       // --success / green
    cashOut: "hsl(var(--chart-4))",       // --danger / red
    netCash: "hsl(var(--chart-1))",       // --primary / navy

    // Aging risk scale
    agingFresh: "hsl(var(--aging-0-7))",     // navy (normal)
    agingDelayed: "hsl(var(--aging-15-30))",   // amber (warning)
    agingRisk: "hsl(var(--aging-over-30))", // red (danger)

    // Profit
    profit: "hsl(var(--chart-2))",       // --success / green

    // Forecast confidence tiers
    committed: "hsl(var(--chart-2))",       // green (high confidence)
    likely: "hsl(var(--chart-1))",       // navy (medium confidence)
    expected: "hsl(var(--chart-bar-1))",       // teal-blue (low confidence, but still visible)

    // Host settlement lifecycle
    paid: "hsl(var(--chart-2))",       // green
    outstanding: "hsl(var(--chart-4))",       // red
    upcoming: "hsl(var(--chart-3))",       // amber

    // Neutral / service
    service: "hsl(var(--chart-5))",       // gray
} as const;

// ── OTA Channel brand colors (uses system OTA variables) ──
export const channelColors: Record<string, string> = {
    Expedia: "hsl(var(--ota-expedia))",
    "Expedia Group": "hsl(var(--ota-expedia))",
    Agoda: "hsl(var(--ota-agoda))",
    "Booking.com": "hsl(var(--ota-booking))",
    CTrip: "hsl(var(--chart-2))",
    Ctrip: "hsl(var(--chart-2))",
    Traveloka: "hsl(var(--ota-traveloka))",
    Direct: "hsl(var(--chart-2))",
    "Trip.com": "hsl(var(--ota-traveloka))",
    Khác: "hsl(var(--chart-5))",
};

// Desaturated fallback palette for unknown channels
export const FALLBACK_CHANNEL_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-5))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-bar-1))",
    "hsl(var(--chart-bar-2))",
    "hsl(var(--chart-bar-3))",
];

// Global chart fill opacity — prevents flat synthetic look
export const CHART_OPACITY = 0.85;

// Pill-shaped bar radius for soft rounded bars (reference style)
export const BAR_RADIUS: [number, number, number, number] = [20, 20, 20, 20];
export const BAR_RADIUS_TOP: [number, number, number, number] = [20, 20, 0, 0];

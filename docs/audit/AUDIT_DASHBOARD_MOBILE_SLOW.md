# AUDIT: Dashboard Mobile Slower Than Desktop (PWA)

**Date:** 2026-03-05  
**Author:** AI Audit  
**Status:** Code-review based diagnosis (pre-runtime metrics)

---

## 1. Executive Summary

Dashboard on mobile PWA loads slower than desktop due to three root causes:
1. **Serial query chains** — `dashboard-host-debt` (4 sequential Supabase calls) and `dashboard-30d-forecast` (3 sequential calls), each adding 100-300ms RTT on mobile networks
2. **Eager rendering of 13 sections** — All chart components mount immediately regardless of viewport, causing ~8 heavy SVG renders (Recharts) on initial paint
3. **616 lines of CSS animation** — Stagger delays up to 660ms, card hover transforms, and keyframe animations execute on mobile GPUs that are 4-8x slower than desktop

## 2. Architecture Analysis

### Component Tree

```
DashboardV2.tsx (1001 lines)
├─ useDashboardIsMobile() → runtime viewport check
├─ ~10 useQuery hooks (ALL run before isMobile check)
├─ if (isMobile) → DashboardV2Mobile.tsx (516 lines)
│   ├─ 13 sections rendered eagerly
│   └─ useGuestOriginAnalytics() → additional query inside mobile
└─ else → Desktop layout inline
```

### Query Inventory

| # | Query Key | Serial Steps | Est. Payload | Stale Time |
|---|---|---|---|---|
| 1 | `stays_operations` | 1 | ~50-200 rows | 30s |
| 2 | `stays_operations_yesterday` | 1 | ~50-200 rows | 30s |
| 3 | `useNewBookingCount` | 1 | scalar | 30s |
| 4 | `useHistoricalAnalytics` | 1-2 | medium | varies |
| 5 | `usePLCalculator` | 1-2 | medium | 5min |
| 6 | `useOtaArSummary` | 1 | small | 2min |
| 7 | `useOtaPayoutPendingSummary` | 1 | small | 2min |
| 8 | `useGuestOriginAnalytics` | 1 | medium | varies |
| 9 | `dashboard-open-disputes` | 1 | small | 30s |
| 10 | **`dashboard-30d-forecast`** | **3 serial** | medium | 5min |
| 11 | **`dashboard-host-debt`** | **4 serial** | large | 2min |
| 12 | `dashboard-v2-recent-bookings` | 2 | 15 rows | 30s |

### Serial Chain Detail

**`dashboard-host-debt` (4 steps):**
```
Step 1: host_supply_segments → all segments
Step 2: host_extra_charges  → IN(bookingIds)
Step 3: cashflow_entries    → HOST_SETTLEMENT_PAYMENT
Step 4: stays               → fetchWithBatchedIn(bookingIds, batch=200)
```
Estimated mobile latency: **800ms–2.4s** (4 × 200-600ms RTT)

**`dashboard-30d-forecast` (3 steps):**
```
Step 1: ota_payouts (PARTIAL) → date range filter
Step 2: ota_payouts (PENDING) → date range filter
Step 3: service_settlements   → then cashflow_entries for each
```
Estimated mobile latency: **600ms–1.8s** (3 × 200-600ms RTT)

### Bundle Analysis

| Chunk | Contents | Est. Size (gzip) |
|---|---|---|
| `vendor-react` | React, React Query, Zustand, Router | ~80KB |
| `vendor-charts` | Recharts | ~120KB |
| `vendor-ui` | Radix primitives | ~40KB |
| `vendor-data` | Supabase JS | ~30KB |
| `vendor-date` | date-fns | ~20KB |
| Dashboard page chunk | DashboardV2 + 14 chart components | ~60KB |

### CSS Animation Cost

`dashboard-motion.css`: 616 lines, 15+ `@keyframes`, 12 stagger levels:
- Page choreography: 12 children × 60ms stagger = 660ms delay chain
- Card hover-lift: `translateY(-6px) scale(1.01)` + triple box-shadow compositing
- Donut spin-in: `rotate(-90deg) scale(0.85)` → 700ms spring animation
- Progress bar: `max-width: 0 → 100%` with 800ms duration

### Mobile Detection Issue

`useDashboardIsMobile()` used `useState` + `useEffect`:
- First render: `window.innerWidth < 640` in `useState` initializer (sync ✅)
- BUT: `useEffect` runs after paint → potential double-render
- Risk: Desktop layout briefly visible before switching to mobile

## 3. Root Causes (Ranked)

| Priority | Cause | Impact | Evidence |
|---|---|---|---|
| 🔴 P0 | Serial query chains (host-debt + forecast) | +1-4s on mobile | 7 sequential network hops |
| 🔴 P0 | 13 sections mount eagerly (8 Recharts SVGs) | High TBT, long tasks | All chart components in same render |
| 🟡 P1 | CSS animation cost on mobile GPU | Delayed FCP/LCP | 616 lines of @keyframes + stagger |
| 🟡 P1 | useGuestOriginAnalytics in mobile top-level | Unnecessary initial query | Hook called before scroll |
| 🟢 P2 | Mobile detection flash risk | Visual glitch | useEffect timing |

## 4. Patches Applied

### Patch 1 — Query Deferral (sections 6–13)
- Created `useInView` hook (IntersectionObserver, rootMargin 200px)
- `DeferredSection` wrapper blocks component mount until near viewport
- 8 separate `React.memo` section components as component boundaries
- `useGuestOriginAnalytics` moved inside `DeferredGuestOriginSection`
- **Expected improvement:** ~30-50% TBT reduction, 1-2s faster time-to-critical

### Patch 2 — Mobile Detection Fix
- `useDashboardIsMobile` rewritten with `matchMedia` sync init + `useLayoutEffect`
- **Expected improvement:** Zero desktop→mobile layout flash

### Patch 3 — Mobile Motion Reduction
- Added `@media (max-width: 639px)` block disabling choreography, hover-lift, stagger, chart entrances
- Preserved shimmer/skeleton and tooltip for UX feedback
- **Expected improvement:** Reduced composite/paint cost, faster FCP

### Observability
- `useDashboardPerf` hook with performance marks (`dashboard:mount`, `dashboard:firstChartPaint`)
- DEV-only, zero production overhead

## 5. Metrics Template (To Fill After Runtime Testing)

| Metric | Desktop | Mobile Sim (390px) | Mobile Real |
|---|---|---|---|
| FCP | ___ ms | ___ ms | ___ ms |
| LCP | ___ ms | ___ ms | ___ ms |
| TBT | ___ ms | ___ ms | ___ ms |
| CLS | ___ | ___ | ___ |
| Time to Critical (sections 1-5) | ___ ms | ___ ms | ___ ms |
| Time to Full (all 13 sections) | ___ ms | ___ ms | ___ ms |
| JS Transfer Total | ___ KB | ___ KB | ___ KB |
| Supabase Calls (initial) | ___ | ___ | ___ |
| Performance Score | ___/100 | ___/100 | ___/100 |

# Golden Scenarios — Dashboard Mobile Deferred Queries

## Required Perf Marks Order

```
dashboard:mount
  → dashboard:criticalReady       (sections 1–5 data)
  → (user scrolls)
  → dashboard:firstDeferredFire   (first deferred query)
  → dashboard:firstChartPaint     (first chart paint)
```

## Scenarios

### 1. Mobile Initial Load (No Scroll)
- **Expect:** `deferredCount = 0` in budget snapshot
- **Expect:** No `deferred:*` tags bumped
- **Expect:** `totalRequests ≤ 10`
- **Verify:** No red/orange console warnings

### 2. Scroll to Section 6 (P&L)
- **Expect:** `deferred:pl` bumped once
- **Expect:** `firstDeferredFire` mark exists after criticalReady
- **Expect:** Sections 6–8 render with shared PL data
- **Verify:** No duplicate PL requests in Network tab

### 3. Fast Scroll Down → Up → Down
- **Expect:** No additional `deferred:pl` bumps
- **Expect:** React Query cache hit — no refetch on scroll back
- **Verify:** Network tab shows PL queries fired exactly once

### 4. Device Rotate / Window Resize
- **Expect:** No new deferred bumps (useInView `once` guard)
- **Expect:** `isMobile` may flip — desktop re-mounts eagerly, this is intentional
- **Verify:** No premature deferred queries on mobile

### 5. Navigate Away → Back
- **Expect:** Budget resets on re-mount
- **Expect:** Behavior consistent with scenario 1
- **Verify:** `dashboard:mount` timestamp refreshed

### 6. React StrictMode (DEV)
- **Expect:** No premature deferred fires
- **Expect:** `firedRef` guard prevents double observe
- **Verify:** At most React Query's built-in dedupe (same queryKey)

## Budget Thresholds

| Metric | Mobile | Desktop |
|---|---|---|
| Max initial requests | 10 | unlimited |
| Deferred before scroll | 0 | n/a |

## Interpreting Console Output

| Level | Message | Meaning |
|---|---|---|
| `console.error` (red) | "REGRESSION: deferred queries fired on mobile initial load" | A deferred query (`deferred:*`) ran before user scroll — fix required |
| `console.warn` (orange) | "Mobile initial load exceeded budget" | Total requests > threshold — investigate new queries |
| `console.info` | "criticalReady" / "firstDeferredFire" / "summary" | Normal observability — timing data |

## Rollback

Remove the following files (all DEV-only, zero production impact):
- `src/lib/perf/requestBudget.ts`
- `src/lib/perf/dashboardBudgetRules.ts`
- Remove `budgetBump` calls from `DashboardV2.tsx` and `useDashboardPerf.ts`

# UI UNIFIED — Governance Rules

## Enforced Rules

### 1. NO Raw Palette Colors
**❌ Banned**: `bg-green-500`, `text-red-700`, `border-amber-200`, etc.  
**✅ Use**: `bg-success`, `text-destructive`, `border-warning/20`, etc.

| Raw Pattern | Semantic Replacement |
|------------|---------------------|
| `*-green-*` | `*-success*` |
| `*-red-*` | `*-destructive*` |
| `*-amber-*`, `*-yellow-*`, `*-orange-*` | `*-warning*` |
| `*-blue-*` | `*-info*` |
| `*-purple-*`, `*-indigo-*` | `*-primary*` |
| `*-gray-*`, `*-slate-*`, `*-zinc-*` | `*-muted*` / `*-muted-foreground*` |

### 2. NO Raw Typography Sizes
**❌ Banned**: `text-[11px]`, `text-[0.8rem]`, `leading-[16px]`  
**✅ Use**: `text-micro`, `text-caption`, `text-body`, `text-section`, `text-page`, `text-kpi`, `text-heroKpi`

### 3. NO Raw HTML Tables in Pages
**❌ Banned**: `<table>` in `src/pages/**`  
**✅ Use**: `<DataTable>` from `@/components/shared` or `<Table>` from `@/components/ui/table`

### 4. NO Hex Color Classes
**❌ Banned**: `bg-[#0C2347]`, `text-[#ff0000]`  
**✅ Use**: Semantic tokens from the design system

### 5. Dark Mode via Tokens Only
**❌ Banned**: `dark:text-green-400`, `dark:bg-amber-900/30`  
**✅ Use**: Semantic tokens that auto-adapt (e.g., `text-success` has dark mode built in)

## CI Grep Gates

```bash
# Check all gates
npm run ui:check

# Individual gates  
npm run ui:check:colors       # Raw palette ≤ 100 lines
npm run ui:check:typography   # text-[Npx] = 0
npm run ui:check:tables       # Raw <table> in pages = 0
```

## Review Checklist for PRs

- [ ] No new raw palette colors (`bg-green-*`, `text-red-*`, etc.)
- [ ] No new `text-[Npx]` or `leading-[Npx]`
- [ ] No new raw `<table>` in page files
- [ ] No new `bg-[#hex]` classes
- [ ] New KPI cards use `MetricCard`
- [ ] New status indicators use `StatusBadge`
- [ ] New tables use `DataTable` or shadcn `Table`
- [ ] New filters use `FilterBar`
- [ ] New empty states use `EmptyState`
- [ ] `npm run ui:check` passes

## Exception Process

If a raw color is absolutely necessary (e.g., brand-specific OTA logo color):
1. Add `/* ui-check-ignore */` comment on the same line
2. Document the exception in this file
3. Get team lead approval

### Current Exceptions
- `src/theme/colorRules.ts` — Migration cheatsheet comments (20 occurrences, all JSDoc)

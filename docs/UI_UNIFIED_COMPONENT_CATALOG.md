# UI UNIFIED — Shared Component Catalog

## Components Created

### 1. `FilterBar` — `src/components/shared/FilterBar.tsx`
Standard toolbar wrapper for filter controls and action buttons.
- **Props**: `children` (filter slots), `actions` (right-side buttons), `className`
- **Behavior**: Flex-wrap responsive, all controls auto-aligned to `h-10`
- **Usage**: `<FilterBar actions={<Button>Export</Button>}><Select/><Input/></FilterBar>`

### 2. `EmptyState` — `src/components/shared/EmptyState.tsx`
Unified empty/no-data state with icon, title, description, and optional CTA.
- **Props**: `icon` (LucideIcon), `title`, `description`, `action` (ReactNode), `size` ("compact"|"full")
- **Variants**: `compact` = inline card-level, `full` = centered page-level
- **Default**: icon=Inbox, title="Không có dữ liệu"

### 3. `DataTable<T>` — `src/components/shared/DataTable.tsx`
Generic typed table wrapping shadcn Table + EmptyState + loading state.
- **Props**: `columns` (DataTableColumn<T>[]), `data`, `rowKey`, `loading`, `footer`, `onRowClick`, `compact`, `emptyTitle`, `emptyDescription`
- **Column Config**: `header`, `accessor` (keyof T | render fn), `className`, `align`, `hideOnMobile`
- **Features**: Empty state auto-shown, loading shimmer, column alignment, mobile column hiding

### 4. `PageHeader` — `src/components/shared/PageHeader.tsx`
Page-level header with title, description, icon, breadcrumb, and action buttons.
- **Props**: `title` (required), `description`, `icon` (LucideIcon), `actions` (ReactNode), `breadcrumb` (ReactNode)
- **Typography**: `text-page font-bold` for title, `text-body text-muted-foreground` for description

### 5. `StatGroup` — `src/components/shared/StatGroup.tsx`
Responsive grid wrapper for MetricCard arrays.
- **Props**: `children` (MetricCard[]), `columns` (2|3|4|"auto"), `className`
- **Auto-columns**: Detects child count, responsive breakpoints (1-col mobile → N-col desktop)

### 6. `ConfirmDialog` — `src/components/shared/ConfirmDialog.tsx`
Wraps AlertDialog for destructive/confirm actions.
- **Props**: `trigger` (ReactNode), `title`, `description`, `onConfirm`, `confirmText`, `cancelText`, `variant` ("default"|"destructive")
- **Usage**: `<ConfirmDialog trigger={<Button>Delete</Button>} onConfirm={handleDelete} variant="destructive" />`

## Barrel Export
All components exported from `src/components/shared/index.ts`:
```ts
export { FilterBar } from "./FilterBar";
export { EmptyState } from "./EmptyState";
export { DataTable, type DataTableColumn } from "./DataTable";
export { PageHeader } from "./PageHeader";
export { StatGroup } from "./StatGroup";
export { ConfirmDialog } from "./ConfirmDialog";
```

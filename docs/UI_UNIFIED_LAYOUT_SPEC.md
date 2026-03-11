# UI UNIFIED — Layout Specification

## MainLayout (`src/components/layout/MainLayout.tsx`)

### Structure
```
┌─────────────────────────────────────────────┐
│ Sidebar (w-60 / w-16 collapsed)             │
│  ┌─────────────────────────────────────────┐│
│  │ Top Bar (h-14, fixed)                   ││
│  │  [NotificationBell] [ThemeSwitcher]     ││
│  ├─────────────────────────────────────────┤│
│  │ Content Area                            ││
│  │  max-w-[1440px] mx-auto w-full         ││
│  │  p-4 lg:p-5                            ││
│  │  ┌──────────────────────────────┐      ││
│  │  │ PageHeader                   │      ││
│  │  │ PageContainer                │      ││
│  │  │   SectionCard(s)             │      ││
│  │  └──────────────────────────────┘      ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Max Width
- Content area: `max-w-[1440px] mx-auto w-full`
- Prevents content from stretching too wide on ultrawide monitors
- Centers content within the available space

### Mobile Layout
- Header: `pt-[calc(3.5rem+env(safe-area-inset-top))]`
- Bottom nav: `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`
- Content padding: `p-3` (reduced from desktop `p-4 lg:p-5`)

## Page Structure Convention

```tsx
<PageContainer>
  <PageHeader 
    title="Page Title" 
    description="Optional description"
    actions={<Button>Primary Action</Button>}
  />
  
  <FilterBar actions={<Button>Export</Button>}>
    <Select ... />
    <Input ... />
  </FilterBar>
  
  <SectionCard title="Section">
    <StatGroup>
      <MetricCard ... />
      <MetricCard ... />
    </StatGroup>
    
    <DataTable columns={...} data={...} />
  </SectionCard>
</PageContainer>
```

## Control Height Standard

All interactive controls should be `h-10` (40px):
- `<Button>` — h-10 by default (via shadcn)
- `<Select>` — h-10
- `<Input>` — h-10
- `<FilterBar>` — auto-aligns children to h-10 via CSS

## Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `gap-2` | 8px | Inline elements, badges |
| `gap-3` | 12px | Card internal gaps |
| `gap-4` | 16px | Section gaps |
| `gap-6` | 24px | Page section gaps (PageContainer default) |
| `p-3` | 12px | Mobile padding |
| `p-4` | 16px | Desktop padding |
| `p-5` | 20px | Large screen padding |

## Component Nesting

```
MainLayout
  └─ PageContainer (flex-col gap-6)
       ├─ PageHeader
       ├─ FilterBar
       └─ SectionCard (rounded-2xl bg-card)
            ├─ StatGroup (responsive grid)
            │    └─ MetricCard[]
            ├─ DataTable
            └─ EmptyState (when no data)
```

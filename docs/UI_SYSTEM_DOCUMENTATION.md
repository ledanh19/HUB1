# Roomrise Control Hub – UI System Documentation

## 1. Design Tokens (CSS Variables)

### Light Mode (`src/index.css` `:root`)

| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| `--background` | `220 14% 96%` | `#F3F4F6` | Page body background (gray-100) |
| `--foreground` | `222 47% 11%` | `#0F172A` | Default text color |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card / SectionCard background |
| `--card-foreground` | `222 47% 11%` | `#0F172A` | Card text |
| `--primary` | `204 79% 20%` | `#0B3C5D` | Brand navy |
| `--border` | `214 32% 91%` | `#E2E8F0` | Borders |
| `--muted` | `220 14% 96%` | `#F3F4F6` | Muted backgrounds |
| `--sidebar-background` | `216 62% 15%` | `#0F2D5C` | Sidebar background |
| `--sidebar-foreground` | `0 0% 90%` | White 90% | Sidebar text |

### Dark Mode (`.dark`)

| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| `--background` | `222 47% 11%` | `#0F172A` | Page body |
| `--card` | `222 47% 14%` | `#1E293B` | Card background |
| `--border` | `222 47% 18%` | `#1E293B` | Borders |
| `--sidebar-background` | `222 84% 3%` | Very dark | Sidebar |

---

## 2. Layout Architecture

### Component Hierarchy

```
<MainLayout>                    ← root, bg-background, sidebar + top bar
  <Header title="" />           ← navy gradient banner, rounded-2xl, mb-6
  <PageContainer>               ← flex flex-col gap-6
    <SectionCard>               ← white card, rounded-2xl, p-5/p-6, shadow-subtle
      ...content...
    </SectionCard>
    <SectionCard title="...">
      ...more content...
    </SectionCard>
  </PageContainer>
</MainLayout>
```

### MainLayout (`src/components/layout/MainLayout.tsx`)
- Root: `min-h-screen bg-background`
- Desktop sidebar: fixed left, w-16 (collapsed) / w-60 (expanded)
- Desktop top bar: `h-14 bg-card border-b`, right-aligned actions
- Main content: `p-4 lg:p-5`, accounts for sidebar width + top bar height
- Mobile: MobileHeader (top) + MobileSidebar (drawer) + MobileBottomNav

### Sidebar (`src/components/layout/Sidebar.tsx`)
- Background: `linear-gradient(180deg, #0F2D5C 0%, #0C2347 100%)`
- Logo: white (`roomrise-logo-light.png`) with `brightness-0 invert`
- Text: `text-white/90` (label), `text-white/50` (subtitle)
- Icons: `text-white/70`, active: `text-white`
- Active item: `bg-white/[0.12] text-white`
- Hover: `bg-white/[0.08]`
- Borders: `border-white/10`
- Collapse toggle: white circle button on sidebar edge

### Header (`src/components/layout/Header.tsx`)
- Background: `bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0]`
- Border radius: `rounded-2xl` (16px)
- Padding: `px-6 py-5 md:px-8 md:py-6`
- Margin: `mb-6` (24px bottom spacing)
- Text: white
- Decorative circles: `bg-white/5` and `bg-white/[0.03]`
- Props: `title`, `subtitle?`, `actions?`, `icon?` (LucideIcon)

### PageContainer (`src/components/layout/PageContainer.tsx`)
- Wrapper: `flex flex-col gap-6`
- Purpose: consistent 24px vertical spacing between SectionCards

### SectionCard (`src/components/layout/SectionCard.tsx`)
- Background: `bg-card` (white in light mode, dark slate in dark mode)
- Border: `border border-border`
- Shadow: `shadow-subtle`
- Border radius: `rounded-2xl` (16px)
- Padding: `p-5 md:p-6` (default), or `noPadding` for full-bleed tables
- Optional: `title`, `subtitle`, `actions` props for built-in card header

---

## 3. Spacing System (8px Base Grid)

| Name | Size | Tailwind | Usage |
|------|------|----------|-------|
| xs | 4px | `gap-1` | Inline element spacing |
| sm | 8px | `gap-2` | Icon spacing, tight groups |
| md | 12px | `gap-3` | Navigation items |
| base | 16px | `gap-4` | Default component spacing |
| lg | 20px | `gap-5` / `p-5` | Card inner padding |
| xl | 24px | `gap-6` / `p-6` | Section gaps, card padding (desktop) |
| 2xl | 32px | `gap-8` | Major section dividers |

---

## 4. Shadow System (`tailwind.config.ts`)

| Name | Value | Usage |
|------|-------|-------|
| `shadow-subtle` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)` | SectionCard default |
| `shadow-card` | `0 2px 4px rgba(0,0,0,0.04), 0 4px 6px rgba(0,0,0,0.02)` | Elevated cards |
| `shadow-elevated` | `0 4px 6px rgba(0,0,0,0.05), 0 10px 15px rgba(0,0,0,0.04)` | Floating panels |
| `shadow-modal` | `0 20px 25px rgba(0,0,0,0.08), 0 10px 10px rgba(0,0,0,0.04)` | Modals, dialogs |

---

## 5. Motion System (`tailwind.config.ts`)

| Name | Duration | Usage |
|------|----------|-------|
| `duration-micro` | 80ms | Checkbox, toggle |
| `duration-fast` | 120ms | Button hover |
| `duration-normal` | 150ms | Nav item transitions |
| `duration-medium` | 180ms | Card hover |
| `duration-slow` | 240ms | Panel expand/collapse |

Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-smooth)

---

## 6. Page Refactoring Patterns

### Standard Page (Pattern A – 42 pages)
```tsx
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { BarChart3 } from "lucide-react";

export function ExamplePage() {
  return (
    <MainLayout>
      <Header 
        title="Page Title" 
        subtitle="Page description" 
        icon={BarChart3}
        actions={<Button>Action</Button>}
      />
      <PageContainer>
        <SectionCard>
          {/* Filters, tables, content */}
        </SectionCard>
      </PageContainer>

      {/* Dialogs, Sheets go HERE – outside PageContainer */}
      <Dialog>...</Dialog>
    </MainLayout>
  );
}
```

### Multi-Section Page
```tsx
<PageContainer>
  <SectionCard title="Summary">
    <MetricCards />
  </SectionCard>
  <SectionCard title="Data Table" noPadding>
    <Table />
  </SectionCard>
</PageContainer>
```

### Detail Page (with Back Navigation)
```tsx
<MainLayout>
  <Header title="Detail Page Title" />
  <PageContainer>
    <SectionCard>
      <BackButton to="/list" />
      {/* Detail content */}
    </SectionCard>
  </PageContainer>
</MainLayout>
```

---

## 7. Page Audit Summary

| Pattern | Count | Description |
|---------|-------|-------------|
| A – MainLayout + Header | 42 | Standard layout ✅ |
| B – MainLayout, no Header (now added) | 25 | Header added during refactor ✅ |
| C – Standalone (migrated) | 5 | Wrapped in MainLayout ✅ |
| C – Auth/Error pages | 2 | Kept standalone ✅ |
| C – DocumentationPage | 1 | Self-contained, skipped |
| D – Deprecated | 2 | Return null, no changes needed |
| **Total** | **77** | |

---

## 8. File Reference

| Component | Path |
|-----------|------|
| CSS Variables | `src/index.css` |
| Tailwind Config | `tailwind.config.ts` |
| MainLayout | `src/components/layout/MainLayout.tsx` |
| Sidebar | `src/components/layout/Sidebar.tsx` |
| MobileSidebar | `src/components/layout/MobileSidebar.tsx` |
| MobileHeader | `src/components/layout/MobileHeader.tsx` |
| Header | `src/components/layout/Header.tsx` |
| PageContainer | `src/components/layout/PageContainer.tsx` |
| SectionCard | `src/components/layout/SectionCard.tsx` |

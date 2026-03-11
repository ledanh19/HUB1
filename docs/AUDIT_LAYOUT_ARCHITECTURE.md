# AUDIT: Layout Architecture — Roomrise Control Hub

**Date:** 2026-02-21  
**Auditor:** Principal Product UI Architect  
**Scope:** `src/components/layout/`, `src/pages/`, responsive behavior

---

## 1. Layout Stack

### Desktop (≥1024px)

```
┌──────────────────────────────────────────────────────┐
│ html / body   bg-background (#F3F4F6)                │
│ ┌──────────────────────────────────────────────────┐ │
│ │ MainLayout  (flex)                               │ │
│ │ ┌───────┐ ┌────────────────────────────────────┐ │ │
│ │ │Sidebar│ │ <main> flex-1 overflow-y-auto      │ │ │
│ │ │w-16/60│ │ ┌──────────────────────────────────┐│ │ │
│ │ │bg-navy│ │ │ <div> p-4 lg:p-5               ││ │ │
│ │ │       │ │ │ ┌──────────────────────────────┐││ │ │
│ │ │       │ │ │ │ Header (banner)  mb-6       │││ │ │
│ │ │       │ │ │ │ rounded-2xl  bg-gradient    │││ │ │
│ │ │       │ │ │ └──────────────────────────────┘││ │ │
│ │ │       │ │ │ ┌──────────────────────────────┐││ │ │
│ │ │       │ │ │ │ PageContainer               │││ │ │
│ │ │       │ │ │ │ flex-col gap-6              │││ │ │
│ │ │       │ │ │ │ ┌──────────────────────────┐│││ │ │
│ │ │       │ │ │ │ │ SectionCard             ││││ │ │
│ │ │       │ │ │ │ │ p-5 md:p-6  bg-card     ││││ │ │
│ │ │       │ │ │ │ │ rounded-xl  shadow-card  ││││ │ │
│ │ │       │ │ │ │ └──────────────────────────┘│││ │ │
│ │ │       │ │ │ │ ┌──────────────────────────┐│││ │ │
│ │ │       │ │ │ │ │ SectionCard             ││││ │ │
│ │ │       │ │ │ │ └──────────────────────────┘│││ │ │
│ │ │       │ │ │ └──────────────────────────────┘││ │ │
│ │ │       │ │ └──────────────────────────────────┘│ │ │
│ │ └───────┘ └────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Mobile (<1024px)

```
┌───────────────────────┐
│ MobileHeader  h-14    │
│ property switcher     │
├───────────────────────┤
│ <main>                │
│ <div> p-3             │
│ ┌───────────────────┐ │
│ │ PageContainer     │ │
│ │ gap-6             │ │
│ │ ┌───────────────┐ │ │
│ │ │ SectionCard   │ │ │
│ │ │ p-5           │ │ │
│ │ └───────────────┘ │ │
│ │ ┌───────────────┐ │ │
│ │ │ SectionCard   │ │ │
│ │ └───────────────┘ │ │
│ └───────────────────┘ │
│ pb-20 (for bottom nav)│
├───────────────────────┤
│ MobileBottomNav h-16  │
│ fixed bottom-0        │
└───────────────────────┘
```

---

## 2. Sidebar Architecture

### Desktop Sidebar

| Property | Value |
|----------|-------|
| Collapsed width | `w-16` (64px) |
| Expanded width | `w-60` (240px) |
| Background | Navy gradient (`from-[#1e3a5f] via-[#1a365d] to-[#1e3a5f]`) |
| Toggle | Smooth transition `duration-300 ease-in-out` |
| Default state | Expanded |
| Persistence | `localStorage("sidebarExpanded")` |
| Items | Icon + label, label hidden when collapsed |
| Brand | Logo + "RoomRise" text (hidden when collapsed) |
| Active indicator | `bg-sidebar-hover` (white/10 opacity) |

### Mobile Sidebar / Header / Bottom Nav

| Component | Role |
|-----------|------|
| MobileHeader | Top bar — property selector, menu trigger |
| MobileSidebar | Drawer overlay — full navigation |
| MobileBottomNav | Fixed bottom — 5 primary nav items |

**Detection:** `useIsMobile()` hook returns `true` below 1024px. Sidebar hidden; mobile components rendered.

---

## 3. Content Width Strategy

### Current: Fluid (No Max-Width)

**MainLayout does not constrain content width.** Pages expand to fill available space.

On a 2560px monitor with sidebar expanded:
- Available content width = `2560 - 240 - 40 = 2280px`
- Text lines can exceed 200 characters (very poor readability)

### Pages That Self-Constrain (4 total)

| Page | Max Width | How |
|------|-----------|-----|
| AuthPage | `max-w-md mx-auto` | Login form |
| SettingsPage | `max-w-4xl mx-auto` | Settings panels |
| DocumentationPage | `max-w-5xl mx-auto` | Docs content |
| TestLabPage | `max-w-7xl mx-auto` | Lab content |

**⚠ 66 pages have no max-width constraint.** Forms, tables, and especially KPI grids stretch indefinitely.

---

## 4. Grid System Usage

### Distribution

| Grid Pattern | Count | Common Use |
|-------------|------:|------------|
| `grid-cols-1` | 22 | Mobile-first single column |
| `grid-cols-2` | 107 | KPI pairs, form 2-col |
| `grid-cols-3` | 39 | KPI trios, card grids |
| `grid-cols-4` | 46 | KPI quads (most common dashboard) |
| `grid-cols-5` | 5 | 5-item stat row |
| `grid-cols-6` | 3 | Dense settings |
| `grid-cols-7` | 8 | Calendar day headers |
| `grid-cols-12` | 2 | Traditional 12-col grid (rare) |

### Responsive Grid Patterns

| Pattern | Count | Description |
|---------|------:|-------------|
| `grid-cols-1 md:grid-cols-2` | ~20 | Stack → 2-col |
| `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` | ~12 | Stack → 2 → 4 col (KPIs) |
| `grid-cols-2 md:grid-cols-4` | ~8 | 2-col → 4-col |
| `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` | ~5 | Card grids |
| `grid-cols-1 lg:grid-cols-3` | ~4 | Skip md → jump to 3-col |

**No shared grid utility or component.** Each page defines its own grid breakpoints.

---

## 5. Responsive Behavior

### Breakpoint Usage

| Breakpoint | Tailwind | Usage Count | Primary Role |
|-----------|----------|------------:|-------------|
| `sm:` (640px) | `sm:` | ~60 | Minor: text size bump, 2-col start |
| `md:` (768px) | `md:` | ~400 | Primary: tablet layout shifts |
| `lg:` (1024px) | `lg:` | ~150 | Desktop sidebar threshold |
| `xl:` (1280px) | `xl:` | ~25 | Wide desktop refinements |
| `2xl:` (1536px) | `2xl:` | ~3 | Barely used |

**Architecture is primarily 2-breakpoint:** mobile (`default`) → desktop (`md:` / `lg:`).

### Mobile Optimizations

| Pattern | Instances | Purpose |
|---------|----------:|---------|
| `-mx-4 px-4 md:mx-0 md:px-0` | 25 | Table breakout to full width |
| `hidden md:block` / `md:hidden` | ~40 | Show/hide elements |
| Stacked → horizontal flex | ~30 | `flex-col md:flex-row` |
| Safe area insets | 3 | `env(safe-area-inset-*)` for iOS PWA |

---

## 6. Background Layering & Elevation

### Layer Stack

| Layer | Background | Border-Radius | Shadow |
|-------|-----------|---------------|--------|
| html/body | `bg-background` (#F3F4F6 light / #09090b dark) | — | — |
| MainLayout | transparent | — | — |
| Sidebar | Navy gradient | — | subtle right border |
| `<main>` content div | transparent | — | — |
| Header banner | Navy gradient | `rounded-2xl` | custom multi-layer |
| SectionCard | `bg-card` (#FFFFFF / dark card) | `rounded-xl` | `shadow-card` |
| Popover/Dropdown | `bg-popover` | `rounded-md` | `shadow-elevated` |
| Dialog | `bg-background` | `rounded-lg` | `shadow-modal` |

**Clean 4-tier elevation: Page → Card → Popover → Modal.** Correct enterprise SaaS pattern.

---

## 7. Non-Standard Layout Pages

| Page | Deviation | Reason |
|------|-----------|--------|
| AuthPage | No sidebar, centered layout | Login/register flow |
| NotFoundPage | No sidebar, centered | Error page |
| DocumentationPage | No sidebar, custom nav | Standalone docs |
| BookingDetailPage | Full-width header hero | Detail view pattern |
| DisputeDetailPage | Full-width header hero | Detail view pattern |
| OtaInventoryCalendarPage | Custom grid layout | Calendar view |

---

## 8. Performance Observations

| Concern | Status |
|---------|--------|
| Layout shift on sidebar toggle | ✅ Smooth — `duration-300 ease-in-out` transform |
| Scroll performance | ✅ `overflow-y-auto` on `<main>` only |
| Mobile viewport issues | ✅ `dvh` used for viewport height |
| Nested scroll containers | ⚠ Some table pages have double scroll (table in scrollable card in scrollable main) |
| Safe area handling | ✅ iOS PWA insets properly handled |

---

## Answers to Key Questions

| Question | Answer |
|----------|--------|
| Có MainLayout wrapper nhất quán không? | ✅ 92% adoption (70/76 pages) |
| Có max-width constraint không? | ❌ Không global. 4 pages tự thêm |
| Grid system có convention không? | ❌ Không shared. 260 grid-cols with no system |
| Mobile responsive tốt không? | ✅ Tốt. 2-breakpoint approach, mobile detection, safe area |
| Background layering đúng không? | ✅ Clean 4-tier: Page → Card → Popover → Modal |
| Sidebar architecture solid? | ✅ Collapse/expand, persistent state, smooth transitions |

---

## Risk Score: 🟡 MEDIUM

- **Layout architecture is solid** — MainLayout, Sidebar, PageContainer, SectionCard form a coherent stack
- **No max-width** is an accessibility/readability concern on ultra-wide monitors
- **Grid system is ad-hoc** — no shared convention, each page invents breakpoints
- **Mobile support is good** — proper safe area, responsive patterns, dedicated mobile components
- **Elevation system is clean** — correct enterprise SaaS layering

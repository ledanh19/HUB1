# AUDIT: Spacing System — Roomrise Control Hub

**Date:** 2026-02-21  
**Auditor:** Principal Product UI Architect  
**Scope:** `src/pages/` + `src/components/` + `src/index.css` + `tailwind.config.ts`

---

## 1. Spacing Token Infrastructure

| Item | Status |
|------|--------|
| CSS custom properties for spacing | ❌ Not found |
| `tailwind.config.ts` `spacing` extension | ❌ Not found — default 4px base only |
| Shared spacing constants (TS/JS) | ❌ Not found |
| Layout-level spacing tokens | ✅ Implicit: `PageContainer gap-6`, `SectionCard p-5 md:p-6` |

**Verdict: No explicit spacing token system. Spacing conventions are embedded in components.**

---

## 2. Layout Spacing Architecture

### Vertical Stack (Outside → Inside)

```
html/body
 └─ MainLayout
     └─ <main> (no padding)
         └─ <div className="p-4 lg:p-5"> ← Root content padding
             └─ Header.tsx (mb-6 built-in)
                 └─ PageContainer (gap-6)
                     └─ SectionCard (p-5 md:p-6)
                         └─ Content (space-y-* varies)
```

### Canonical Spacing Values

| Token Role | Value | Source |
|-----------|-------|--------|
| Root padding (desktop) | `p-4 lg:p-5` (16→20px) | MainLayout `<div>` |
| Root padding (mobile) | `p-3` (12px) | MainLayout mobile condition |
| Header bottom margin | `mb-6` (24px) | Header.tsx |
| Section gap | `gap-6` (24px) | PageContainer |
| Card padding (mobile) | `p-5` (20px) | SectionCard |
| Card padding (desktop) | `md:p-6` (24px) | SectionCard |
| Shadcn Card header | `p-6 pb-4` (24px top, 16px bottom) | CardHeader |
| Shadcn Card content | `p-6 pt-0` (24px sides, 0 top) | CardContent |

### ⚠ Double-Spacing Risk

Header embeds `mb-6` (24px). PageContainer has `gap-6` (24px). When Header is the first child inside PageContainer's flex-col, the actual gap between banner and first section is **48px** (24 mb + 24 gap). This may be intentional for visual breathing room, but is not documented.

---

## 3. Padding Distribution

### Card / Container Padding

| Class | Count | Where |
|-------|------:|-------|
| `p-2` (8px) | 122 | Badge wrappers, icon containers |
| `p-3` (12px) | 339 | Compact cards, MobileHeader, tab bars |
| `p-4` (16px) | 284 | Dropdowns, dialogs, form sections |
| `p-5` (20px) | 68 | SectionCard mobile |
| `p-6` (24px) | 61 | SectionCard desktop, CardHeader |
| `p-8` (32px) | 11 | Auth page, empty states |

**Dominant: `p-3/p-4` for containers, `p-5`/`p-6` for cards.**

### Horizontal Padding on Specific Elements

| Pattern | Count | Usage |
|---------|------:|-------|
| `px-2` | 267 | Badges, table cells |
| `px-3` | 173 | Select triggers, tab items |
| `px-4` | 189 | Buttons, card headers, toolbar |
| `px-6` | 34 | Card wrappers |
| `px-8` | 6 | Auth, large buttons |

---

## 4. Gap / Space-Between Usage

### `gap-*` (Flexbox/Grid)

| Class | Count | Role |
|-------|------:|------|
| `gap-1` | 165 | Icon–label pairs |
| `gap-1.5` | 53 | Tight icon groups |
| `gap-2` | 1,031 | ⭐ Default inline spacing |
| `gap-3` | 127 | Form rows, compact lists |
| `gap-4` | 250 | Form groups, card sections |
| `gap-6` | 41 | PageContainer, section gaps |
| `gap-8` | 6 | Major section separators |

### `space-y-*` (Vertical Stack)

| Class | Count | Role |
|-------|------:|------|
| `space-y-1` | 145 | Tight stacks (menus, labels) |
| `space-y-1.5` | 30 | Form labels → inputs |
| `space-y-2` | 511 | ⭐ Default intra-section |
| `space-y-3` | 90 | Medium stacks |
| `space-y-4` | 210 | Section stacks |
| `space-y-6` | 63 | Major section stacking |
| `space-y-8` | 10 | Page-level stacking (rare) |

**De-facto scale: 4→8→12→16→24px (1→2→3→4→6 in Tailwind units).**

---

## 5. Table Row Spacing

### Base Component (`table.tsx`)

| Element | Padding |
|---------|---------|
| `TableHead` | `h-10 px-3 text-left` (derived from shadcn) |
| `TableCell` | `py-3.5 px-3` (14px vertical) |

### Per-Page Overrides (16 pages use raw `<td>`)

| File | Row Padding | Notes |
|------|-------------|-------|
| BookingsPage | `py-2 px-3` | 8px vertical (tighter) |
| StaysPage | `py-2 px-4` | Mixed padding |
| HostPayablesPage | `py-3 px-2` | Different pattern |
| TasksPage | `py-2.5 px-3` | 10px vertical |
| Multiple analytics | `py-3 px-4` | Close to base |

**⚠ 5 distinct row padding combos across 16 pages.**

---

## 6. Input / Button Height

| Component | Height | Source |
|-----------|--------|--------|
| Input | `h-10` (40px) | `input.tsx` |
| Button (default) | `h-9` (36px) | `button.tsx` |
| Button (sm) | `h-8` (32px) | `button.tsx` |
| Button (lg) | `h-10` (40px) | `button.tsx` |
| Button (icon) | `h-9 w-9` (36px) | `button.tsx` |
| Select trigger | `h-10` (40px) | `select.tsx` base |

**⚠ Input (40px) and default Button (36px) sit side-by-side in many forms, creating 4px misalignment.** Some pages force `h-9` on Select to match buttons.

---

## 7. Breakout / Bleed Patterns

### Mobile Table Breakout

```
-mx-4 px-4 md:mx-0 md:px-0
```

Used in **25 instances** across 15+ pages. Purpose: allows tables to span full viewport width on mobile by negating `p-4` root padding. **Consistent pattern, good.**

### Full-Width Override in Cards

Some pages apply `p-0` to SectionCard and manage padding internally for edge-to-edge tables:

- CollectionReportsPage
- HostSettlementPage
- StaysPage

---

## 8. Off-Grid / Arbitrary Spacing

**Very clean.** Only ~5 files use arbitrary spacing values:

| Value | File | Reason |
|-------|------|--------|
| `ml-[5px]` | 1 file | nudge alignment |
| `h-[22px] w-[22px]` | 1 file | icon size not on Tailwind grid |
| `h-[18px] w-[18px]` | 2 files | small icon size |
| `w-[42px]` | 1 file | avatar container |
| `h-[57px]` | 1 file | custom element height |

**Not a systemic problem. Negligible.**

---

## Answers to Key Questions

| Question | Answer |
|----------|--------|
| Có spacing token riêng không? | ❌ Không. Dùng default Tailwind 4px base |
| Có consistent card padding không? | ✅ Có. SectionCard `p-5 md:p-6`, Shadcn Card `p-6` |
| Có spacing breakage giữa mobile/desktop? | ⚠ Nhẹ. 25 breakout instances consistent, nhưng MainLayout `p-4 lg:p-5` shift nhẹ |
| Có hardcode spacing lẻ không? | ✅ Không đáng kể (~5 files) |
| double-spacing risk? | ⚠ Header `mb-6` + PageContainer `gap-6` = 48px total |

---

## Risk Score: 🟡 MEDIUM

- **No formal spacing token system** but de-facto conventions are solid
- **Input/Button height mismatch** (40px vs 36px) affects form layouts
- **5 distinct table row paddings** need standardization
- **Arbitrary spacing is negligible** — spacing discipline is decent
- **Double-spacing risk** is the main architectural concern

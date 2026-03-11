# FONT SYSTEM SOT — Roomrise Control Hub

> **Single Source of Truth** for the Vietnamese-optimized font system.  
> Last updated: 2026-02-23

## Font Stack (Official)

```css
:root {
  --font-sans: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
}
```

**Package**: `@fontsource/be-vietnam-pro` (weights: 400, 500, 600, 700)  
**Subsets loaded**: Vietnamese + Latin-ext + Latin (automatic via unicode-range)

## Rules

### ✅ ALLOWED
- `font-family: var(--font-sans)` — in global CSS only
- `font-family: inherit` — in component/heading overrides
- `@fontsource/be-vietnam-pro/*` — the only font import allowed
- `leading-tight` (1.25), `leading-snug` (1.375), `leading-normal` (1.5)

### ❌ FORBIDDEN
- `font-family: "Geist Sans"` or any hardcoded font name
- `@fontsource/geist-sans` or any other font package
- `font-feature-settings: "cv02", "cv03", "cv04", "cv11"` (Geist-specific)
- `leading-none` on text that may contain Vietnamese diacritics
- `letter-spacing` negative values on text smaller than `text-lg`

## Line-Height Guidelines

| Text Size | Min Line-Height | Tailwind Class |
|-----------|----------------|----------------|
| ≤ 10px (micro) | 1.6 (16px) | `text-micro` (built-in) |
| 12px (xs/caption) | 1.33 (16px) | `text-xs` or `text-caption` |
| 14px (sm/body) | 1.43 (20px) | `text-sm` or `text-body` |
| ≥ 16px | 1.375+ | `text-base`+ |

## Component Guidelines

| Component | Font Rule |
|-----------|-----------|
| `<Label>` | `leading-snug` (not `leading-none`) |
| `<AlertTitle>` | `leading-snug` |
| `<DrawerTitle>` | `leading-snug` |
| `<Badge>` | Use `text-micro` (built-in safe line-height) |
| Email iframe | `!important` override: Be Vietnam Pro on body + all children |
| SVG text | Exception: Arial is OK for SVG logos |

## Lint Script

```bash
node scripts/font-audit.mjs
```

Checks: hardcoded fonts, Geist references, leading-none, non-SOT imports.  
Exits with code 1 on errors — add to CI/pre-commit.

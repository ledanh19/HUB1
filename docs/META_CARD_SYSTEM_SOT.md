# META CARD SYSTEM SOT

> Canonical Specification for Meta/Information Cards in Roomrise Control Hub
> **Status:** Enforced
> **Scope:** Owner Info, Processing Info, Payment Info, Booking Meta, Host Info, Settlement Info

## 1. Principles
All contextual metadata cards MUST conform to a single structural pattern.
1. **NON-BREAKING + ADDITIVE ONLY**: This pattern overrides layout, not data-binding.
2. **NO PAGE-LEVEL IMPROVISATION**: Pages must not apply custom `Tailwind` spacing, typography, or padding to meta cards.
3. **ACCESSIBILITY & READABILITY**: Strict adherence to Vietnamese typographic requirements (no `leading-none` on body text).

## 2. MetaCard Container
- **Component**: `<MetaCard>`
- **Internal Wrapper**: Uses `SectionCard` (NEVER raw `Card`).
- **Padding**: `p-4`
- **Internal Spacing**: `space-y-4` (never nested `space-y-6` or arbitrary margins).
- **Background**: Inherited from `SectionCard`.
- **Border**: Inherits `SectionCard` borders; NO custom borders except internal dividers.

## 3. MetaBlock
- **Component**: `<MetaBlock title="...">`
- **Structure**:
  ```tsx
  <MetaBlock>
    <MetaLabel />
    <MetaContent />
  </MetaBlock>
  ```
- **Rules**:
  - Spacing between label and content: `gap-1.5` (hard lock). NO `gap-1` or `gap-3`.

## 4. Typography & Icons
- **MetaLabel**: `text-micro uppercase tracking-wider text-muted-foreground font-medium mb-1.5`. NEVER `text-xs` or `text-sm`.
- **MetaPrimaryText**: `text-sm font-semibold text-foreground`. Normal line-height. NO `tracking-tight`.
- **MetaSecondaryText**: `text-xs text-muted-foreground`. NO `leading-none`.
- **MetaIcon**: `h-4 w-4 shrink-0 text-muted-foreground`. NEVER `h-5` or `h-3`.

## 5. Badges & Dividers
- **MetaBadge**: `h-5 px-1.5 leading-none text-micro` or `text-[10px]`. NO custom padding per page.
- **MetaDivider**: `<div className="border-t border-border/50 my-3" />`. NO custom `<hr>`.

## 6. Drift Guard Enforcement
The CI drift guard (`npm run ui:check`) enforces:
1. MetaCard replaced by raw Card in meta contexts.
2. Icon sizes not `h-4 w-4` inside meta components.
3. `gap-1` used between label and primary text.
4. Uppercase labels using `text-xs`.

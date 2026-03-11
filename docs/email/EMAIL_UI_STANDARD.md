# Email UI Standard

> Canonical patterns for Email V2 UI components. Prevents overflow and ensures responsive display.

## Flex Text Containers

```css
/* Parent flex container */
.flex .min-w-0    /* Allow text to shrink below content width */

/* Text items */
.truncate          /* Single-line truncation */
.line-clamp-2      /* Multi-line truncation */
.break-words       /* Break long words/URLs */
```

## Time Labels & Badges

```css
.shrink-0          /* Never shrink time labels */
.whitespace-nowrap /* Prevent time wrapping */
```

## Message Bubbles

```css
.max-w-[90%]           /* Never full-width */
.whitespace-pre-wrap   /* Preserve formatting */
.break-words           /* Break long content */
.overflow-hidden       /* Clip any overflow */
```

## Responsive (Mobile ≤ 375px)

- Sidebar: hidden on mobile, show as sheet/drawer
- Thread list: full width on mobile
- Thread detail: full width, stacked layout
- No horizontal scroll at any viewport width

## Tag/Badge Colors

| Tag | BG | Text | Border |
|-----|-----|------|--------|
| GUEST_REPLY | blue-50 | blue-600 | blue-200 |
| DISPUTE | rose-50 | rose-600 | rose-200 |
| FINANCE_ALERT | purple-50 | purple-600 | purple-200 |
| BOOKING_EXCEPTION | orange-50 | orange-600 | orange-200 |
| VIP_PARTNER | indigo-50 | indigo-600 | indigo-200 |
| SILENT | slate-50 | slate-500 | slate-200 |

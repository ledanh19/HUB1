# WALKTHROUGH_FONT_VI_SOT.md
> Roomrise Control Hub — Vietnamese Font System SOT  
> Date: 2026-02-23 | Author: Antigravity Principal Frontend Architect

---

## 1. Summary

Replaced **Geist Sans** (Latin-only `@fontsource` subset) with **Be Vietnam Pro** as the Single Source of Truth (SOT) font for Roomrise Control Hub. All Vietnamese diacritics now render natively without system-ui fallback.

---

## 2. Root Causes

| # | Root Cause | Impact |
|---|-----------|--------|
| 1 | `@fontsource/geist-sans` loads **Latin subset only** (`geist-sans-latin-*.woff2`) | All Vietnamese text (ậ ệ ợ ễ ữ) fell back to `system-ui` (Segoe UI on Windows) |
| 2 | `font-feature-settings: "cv02","cv03","cv04","cv11"` applied to fallback font | Unexpected glyph substitutions on system-ui rendering |
| 3 | `leading-none` (line-height: 1.0) on labels/badges | Diacritics clipped on small Vietnamese text |
| 4 | Email iframe used hardcoded `system-ui` font stack | Email body fonts disconnected from app SOT |

---

## 3. Fix Approach

```
Be Vietnam Pro SOT
  ├─ CSS: --font-sans variable (single source)
  ├─ Tailwind: fontFamily.sans → var(--font-sans)
  ├─ Email iframe: Be Vietnam Pro + !important override
  └─ Components: leading-none → leading-snug/tight
```

- **Font**: `@fontsource/be-vietnam-pro` (400/500/600/700, includes Vietnamese + Latin-ext + Latin subsets)
- **CSS Variable**: `:root { --font-sans: "Be Vietnam Pro", system-ui, ... }`
- **Body**: `font-family: var(--font-sans); line-height: 1.5;`
- **Headings**: `font-family: inherit` (no more hardcoded Geist)
- **Email**: `body, body * { font-family: "Be Vietnam Pro" ... !important }`

---

## 4. Files Changed

| File | Purpose | Change | Risk |
|------|---------|--------|------|
| [package.json](file:///f:/RR%20CONTROL/roomrise-control-hub/package.json) | Dependencies | `+@fontsource/be-vietnam-pro` `-@fontsource/geist-sans` | Low |
| [index.css](file:///f:/RR%20CONTROL/roomrise-control-hub/src/index.css) | Global styles | `--font-sans` SOT, Be Vietnam Pro imports, removed Geist cv features, `body { var(--font-sans) }`, headings inherit | Med — core style |
| [tailwind.config.ts](file:///f:/RR%20CONTROL/roomrise-control-hub/tailwind.config.ts) | Tailwind config | `fontFamily.sans: var(--font-sans)`, `micro` 10/14→10/16 | Low |
| [ThreadDetail.tsx](file:///f:/RR%20CONTROL/roomrise-control-hub/src/modules/email/components/ThreadDetail.tsx) | Email iframe | Be Vietnam Pro + `!important` on `body *` | Med — isolated |
| [label.tsx](file:///f:/RR%20CONTROL/roomrise-control-hub/src/components/ui/label.tsx) | Form labels | `leading-none` → `leading-snug` | Low |
| [alert.tsx](file:///f:/RR%20CONTROL/roomrise-control-hub/src/components/ui/alert.tsx) | AlertTitle | `leading-none` → `leading-snug` | Low |
| [drawer.tsx](file:///f:/RR%20CONTROL/roomrise-control-hub/src/components/ui/drawer.tsx) | DrawerTitle | `leading-none` → `leading-snug` | Low |
| [ThreadListItem.tsx](file:///f:/RR%20CONTROL/roomrise-control-hub/src/modules/email/components/ThreadListItem.tsx) | Unread badge | `leading-none` → `leading-tight` | Low |
| [CashOutPage.tsx](file:///f:/RR%20CONTROL/roomrise-control-hub/src/pages/CashOutPage.tsx) | Form label | `leading-none` → `leading-snug` | Low |

**New files:**

| File | Purpose |
|------|---------|
| [scripts/font-audit.mjs](file:///f:/RR%20CONTROL/roomrise-control-hub/scripts/font-audit.mjs) | CI lint — fails on font violations |
| [FONT_SYSTEM_SOT.md](file:///f:/RR%20CONTROL/roomrise-control-hub/FONT_SYSTEM_SOT.md) | Font system documentation |

---

## 5. Before / After Evidence

````carousel
![BEFORE: Geist Sans (Latin-only) — Vietnamese fell back to Segoe UI](C:\Users\jacki\.gemini\antigravity\brain\3d0ad13f-cc51-4d1a-880d-7382929ab7c6\before.png)
<!-- slide -->
![AFTER: Be Vietnam Pro — native Vietnamese rendering, proper diacritics](C:\Users\jacki\.gemini\antigravity\brain\3d0ad13f-cc51-4d1a-880d-7382929ab7c6\bookings_page_vietnamese_font_v2_1771788359441.png)
<!-- slide -->
![Email iframe — Vietnamese in iframe renders with Be Vietnam Pro](C:\Users\jacki\.gemini\antigravity\brain\3d0ad13f-cc51-4d1a-880d-7382929ab7c6\email_thread_1771789290655.png)
````

### DevTools Computed Style Evidence

| Element | `font-family` | `line-height` | `fontSize` | `fontFeatureSettings` |
|---------|-------------|-------------|----------|--------------------|
| `body` | `"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif` | 24px (1.5) | 16px | **`normal`** ✅ |
| `th` (table header) | `"Be Vietnam Pro", ...` | 16px | 12px | — |
| badge (11px) | `"Be Vietnam Pro", ...` | 16.5px (1.5) | 11px | — |
| `input` | `"Be Vietnam Pro", ...` | 16px | 12px | — |
| sidebar nav | `"Be Vietnam Pro", ...` | 16.5px | 11px | — |
| email iframe body | `"Be Vietnam Pro", system-ui, ...` | 21px (1.5) | 14px | — |

> **Confirmation**: `fontFeatureSettings: "normal"` — Geist cv02/cv03/cv04/cv11 completely removed.

---

## 6. Test Matrix

| Page | Elements Tested | Vietnamese Strings | Result |
|------|----------------|-------------------|--------|
| Dashboard | KPI cards, header, sidebar | "Đặt phòng", "Lưu trú", "Dòng tiền" | ✅ PASS |
| Bookings | Table headers, badges, filters, input | "Trạng thái ĐP", "Đã xác nhận", "Đã huỷ", "Chỗ nghỉ", "Khách hàng" | ✅ PASS |
| Email Thread | Iframe body, header, badges | "Chúng tôi đã khôi phục thành công tài khoản của bạn" | ✅ PASS |
| Sidebar | Nav items, section labels | "Vận hành lưu trú", "Tài chính & Dòng tiền", "Kiểm soát & Hệ thống" | ✅ PASS |
| Badges | Status badges (10-11px) | "Đã xác nhận", "Đã huỷ", "Đã gửi" | ✅ PASS |

**Test strings verified** (no missing diacritics, no clipping):
- `"Đặt phòng đã được xác nhận"`
- `"Hủy đặt phòng – khách đổi tên: Nguyễn Thị Ánh"`
- `"Tạm trú – khai báo lưu trú"`
- Complex diacritics: `ậ ệ ợ ễ ữ ồ ố ớ ỳ`

---

## 7. Fix npm Auth Token Issue

```bash
# 1. Remove expired token
npm config delete _auth

# 2. Verify clean config
npm config ls    # should NOT show _auth = (protected)

# 3. (Optional) Re-login if needed
npm login

# 4. Verify
npm whoami

# 5. Test scoped install
npm install @fontsource-variable/be-vietnam-pro --dry-run
```

---

## 8. Known Limitations

| Item | Impact | Mitigation |
|------|--------|-----------|
| Using `@fontsource/be-vietnam-pro` (static, 4 imports) instead of `@fontsource-variable/be-vietnam-pro` | Slightly larger bundle (~4 woff2 per weight vs 1 variable) | Migration plan provided; no impact on Vietnamese rendering |
| npm `_auth` token expired blocks scoped installs | Cannot install any new `@fontsource-variable/*` packages | Fix instructions above; does NOT affect current app |

---

## 9. Lint Guard

```bash
node scripts/font-audit.mjs
# Result: ✅ PASS — 0 errors, 0 warnings
```

---

## 10. Final Acceptance Statement

- ✅ Vietnamese diacritics rendered correctly across app + email iframe
- ✅ No Geist references remain in codebase
- ✅ No Geist-specific `font-feature-settings` remain (`fontFeatureSettings: "normal"`)
- ✅ `line-height` safe for small text — no clipping on badges/labels
- ✅ Email iframe hardened with `!important` font override
- ✅ Lint guard (`font-audit.mjs`) passes with 0 errors
- ⚠️ Variable font pending due to npm auth; migration plan provided in `MIGRATION_VARIABLE_FONT.md`

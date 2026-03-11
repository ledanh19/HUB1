# Variable Font Migration Plan

> 1-step swap: `@fontsource/be-vietnam-pro` (static) → `@fontsource-variable/be-vietnam-pro`  
> Prerequisites: npm auth token must be valid (`npm whoami` succeeds)

---

## Step 1 — Fix npm auth (if needed)

```bash
npm config delete _auth
npm whoami          # should return your username
```

## Step 2 — Swap packages

```bash
npm uninstall @fontsource/be-vietnam-pro
npm install @fontsource-variable/be-vietnam-pro
```

## Step 3 — Update import in `src/index.css`

```diff
-@import "@fontsource/be-vietnam-pro/400.css";
-@import "@fontsource/be-vietnam-pro/500.css";
-@import "@fontsource/be-vietnam-pro/600.css";
-@import "@fontsource/be-vietnam-pro/700.css";
+@import "@fontsource-variable/be-vietnam-pro";
```

## Step 4 — Update `--font-sans` CSS variable

```diff
 :root {
-  --font-sans: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
+  --font-sans: "Be Vietnam Pro Variable", "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
 }
```

## Step 5 — Verify

```bash
npm run dev
```

1. Open http://localhost:8080/bookings → check Vietnamese text renders
2. Open DevTools → Computed → `font-family` should show `"Be Vietnam Pro Variable"`
3. Open http://localhost:8080/email → check iframe renders Be Vietnam Pro
4. Run `node scripts/font-audit.mjs` → should PASS

## Step 6 — Update font-audit.mjs

Add `"Be Vietnam Pro Variable"` to the allowed font names if the lint script checks for it.

Update `FONT_SYSTEM_SOT.md` to reflect the new variable font.

---

## Rollback Plan

If anything breaks:

```bash
npm uninstall @fontsource-variable/be-vietnam-pro
npm install @fontsource/be-vietnam-pro
```

Then revert `src/index.css` imports back to 4 static imports and remove `"Be Vietnam Pro Variable"` from `--font-sans`.

---

## Benefits of Variable Font

| Aspect | Static (current) | Variable |
|--------|-----------------|----------|
| Files | 4 × 3 subsets = 12 woff2 | 1 variable woff2 |
| Bundle | ~120KB | ~60KB |
| Weight range | 400, 500, 600, 700 only | 100–900 continuous |
| Vietnamese | ✅ Full | ✅ Full |

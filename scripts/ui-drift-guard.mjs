/**
 * UI Drift Guard — Roomrise Control Hub
 * Scans src/ for violations of UI standardization SOT.
 * Run: node scripts/ui-drift-guard.mjs
 * CI:  npm run ui:drift-guard
 * Exit 1 on errors; exit 0 on clean.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const SRC_DIR = 'src';
const PAGES_DIR = join(SRC_DIR, 'pages');
const EXTENSIONS = ['.tsx', '.ts'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build'];

// ═══════════════════════════════════════
// RULES
// ═══════════════════════════════════════

const RULES = [
    // ═══════════════════════════════════════
    // SECTION C: Currency / Number Formatting
    // ═══════════════════════════════════════
    {
        id: 'no-ad-hoc-locale-string',
        pattern: /\.toLocaleString\s*\(\s*["']vi-VN["']/,
        message: 'Ad-hoc VND formatting — use formatCurrencyVND() from @/lib/finance-formatters',
        severity: 'error',
        scope: 'pages',
    },
    {
        id: 'no-manual-vnd-symbol',
        pattern: /}\s*₫|"\s*₫|'\s*₫/,
        message: 'Manual ₫ symbol — use formatCurrencyVND() which includes the symbol',
        severity: 'warning',
        scope: 'pages',
        allowFiles: ['finance-formatters.ts', 'currencyHelpers.ts'],
    },

    // ═══════════════════════════════════════
    // SECTION A: Vertical Rhythm Lock
    // ═══════════════════════════════════════
    {
        id: 'rhythm-no-space-y-6',
        pattern: /\bspace-y-6\b/,
        message: 'space-y-6 drift — SOT is gap-4 for page/section spacing',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'rhythm-no-gap-6',
        pattern: /\bgap-6\b/,
        message: 'gap-6 drift — SOT is gap-4 for page/section/form spacing',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'rhythm-no-margin-6',
        pattern: /\b(mt-6|mb-6|pt-6|pb-6)\b/,
        message: 'Spacing-6 margin/padding on page — SOT max is gap-4 / p-4 md:p-5',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION P: Container / Layout
    // ═══════════════════════════════════════
    {
        id: 'no-inline-max-w-override',
        pattern: /max-w-\[\d+px\]|max-w-\[\d+rem\]/,
        message: 'Inline max-width override — MainLayout provides max-w-[1440px]; remove override',
        severity: 'warning',
        scope: 'pages',
        allowFiles: ['MainLayout.tsx', 'MobileSidebar.tsx', 'MobileHeader.tsx'],
    },
    {
        id: 'container-no-ad-hoc-padding',
        pattern: /className=.*max-w-(3xl|4xl|5xl|6xl|7xl).*mx-auto/,
        message: 'Ad-hoc container — MainLayout provides max-w-[1440px]; use PageContainer',
        severity: 'warning',
        scope: 'pages',
        allowFiles: ['MainLayout.tsx'],
    },

    // ═══════════════════════════════════════
    // SECTION Q: Card System
    // ═══════════════════════════════════════
    {
        id: 'no-p6-on-card-sections',
        pattern: /className=.*["'`].*\bp-6\b/,
        message: 'p-6 padding — standard is p-4 md:p-5 per SectionCard SOT',
        severity: 'warning',
        scope: 'pages',
        allowFiles: ['card.tsx', 'dialog.tsx', 'sheet.tsx', 'alert-dialog.tsx', 'command.tsx'],
    },

    // ═══════════════════════════════════════
    // SECTION B + V: Typography Hierarchy Lock
    // ═══════════════════════════════════════
    {
        id: 'typo-no-leading-none',
        pattern: /\bleading-none\b/,
        message: 'leading-none — Vietnamese clipping risk; use semantic font tokens with locked line-height',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'typo-no-leading-tight',
        pattern: /\bleading-tight\b/,
        message: 'leading-tight on text — may clip Vietnamese diacritics; prefer token line-height',
        severity: 'warning',
        scope: 'pages',
        allowFiles: ['button.tsx'],
    },
    {
        id: 'typo-no-custom-px-font',
        pattern: /text-\[\d+px\]/,
        message: 'Custom pixel font size — use semantic scale: text-micro/caption/body/section/page/kpi',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'typo-no-text-lg-font-bold',
        pattern: /text-lg\s+font-bold|font-bold\s+text-lg/,
        message: 'text-lg font-bold → use text-kpi (METRIC) or text-section font-semibold (SECTION)',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'typo-no-text-xl-font-bold',
        pattern: /text-xl\s+font-bold|font-bold\s+text-xl/,
        message: 'text-xl font-bold → use text-kpi font-semibold (METRIC DISPLAY)',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'typo-no-text-3xl-bold',
        pattern: /text-3xl\s+font-bold|font-bold\s+text-3xl/,
        message: 'text-3xl font-bold → use text-heroKpi font-semibold (HERO METRIC)',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'no-ad-hoc-kpi-text',
        pattern: /text-3xl\s+font-bold.*tabular|text-4xl.*font.*tabular/,
        message: 'Ad-hoc KPI typography — use text-kpi or text-heroKpi from semantic scale',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION P: Container Lock
    // ═══════════════════════════════════════
    {
        id: 'container-no-ad-hoc-padding',
        pattern: /max-w-(3xl|4xl|5xl|6xl|7xl).*mx-auto/,
        message: 'Ad-hoc container size on page — use <PageContainer> layout shell',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION R: KPI System
    // ═══════════════════════════════════════
    {
        id: 'kpi-no-ad-hoc-typography',
        pattern: /text-(lg|xl|2xl)\s+font-bold.*text-(success|destructive|warning|info|primary)/,
        message: 'Ad-hoc KPI typography — use MetricCard with text-kpi from semantic scale',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION R2: KPI Structural Rules (Phase K)
    // ═══════════════════════════════════════
    {
        id: 'kpi-raw-tile-text-kpi',
        pattern: /CardContent.*text-kpi|text-kpi.*CardContent/,
        message: 'Raw text-kpi inside CardContent — migrate to <MetricCard> component (Phase K)',
        severity: 'info',
        scope: 'pages',
        allowFiles: ['metric-card.tsx'],
    },
    {
        id: 'kpi-missing-tabular-nums',
        pattern: /text-kpi(?!.*tabular-nums)/,
        message: 'text-kpi without tabular-nums — KPI values must always use tabular-nums',
        severity: 'info',
        scope: 'pages',
    },
    {
        id: 'kpi-raw-tile-hero',
        pattern: /CardContent.*text-hero-kpi|text-hero-kpi.*CardContent/,
        message: 'Raw text-hero-kpi inside CardContent — migrate to <MetricCard> component (Phase K)',
        severity: 'info',
        scope: 'pages',
        allowFiles: ['metric-card.tsx'],
    },

    // ═══════════════════════════════════════
    // SECTION O2: Overlay / Z-index Governance
    // ═══════════════════════════════════════
    {
        id: 'overlay-no-adhoc-zindex',
        pattern: /z-\[\d+\]/,
        message: 'Ad-hoc z-index (z-[...]) — use standard z-0, z-10, z-50 from SOT',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION O4: Button & Icon System
    // ═══════════════════════════════════════
    {
        id: 'icon-no-h2w2-clickable',
        pattern: /onClick=[^>]*className=["'][^"']*\b(h-[1-6]\s+w-[1-6]|w-[1-6]\s+h-[1-6])\b/,
        message: 'Clickable icon hit area too small (< 24px) — minimum is h-8 w-8 (32px)',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION W: Dialog System
    // ═══════════════════════════════════════
    {
        id: 'dialog-no-inline-width',
        pattern: /DialogContent\s+className=["'`].*max-w-/,
        message: 'Inline width on DialogContent — use size prop: size="sm|md|lg|xl"',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'dialog-no-custom-overflow',
        pattern: /DialogContent\s+className=["'`].*overflow-y-auto/,
        message: 'Custom overflow on DialogContent — use <DialogBody> for scrollable content',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'dialog-no-custom-max-h',
        pattern: /DialogContent\s+className=["'`].*max-h-\[/,
        message: 'Custom max-height on DialogContent — DialogContent handles max-h internally (85vh)',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION X: Badge System
    // ═══════════════════════════════════════
    {
        id: 'badge-no-ad-hoc-fontsize-usage',
        pattern: /Badge.*text-\[(9|10|11)px\]|text-\[(9|10|11)px\].*Badge|StatusBadge.*text-\[(9|10|11)px\]/,
        message: 'Ad-hoc font size on Badge — use size="xs|sm|md" (text-micro/caption/body)',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'badge-no-leading-none',
        pattern: /Badge.*leading-none|leading-none.*Badge|StatusBadge.*leading-none/,
        message: 'leading-none on badge — Vietnamese clipping risk',
        severity: 'warning',
        scope: 'all',
        allowFiles: ['ResponsibleOwnerBadge.tsx'],
    },
    {
        id: 'badge-no-rounded-md',
        pattern: /Badge.*rounded-md|rounded-md.*Badge|StatusBadge.*rounded-md/,
        message: 'rounded-md on badge — use rounded-lg (pill) or rounded-full (circle)',
        severity: 'warning',
        scope: 'all',
        allowFiles: ['badge.tsx', 'status-badge.tsx'],
    },

    // ═══════════════════════════════════════
    // SECTION O2: Overlay / Z-index
    // ═══════════════════════════════════════
    {
        id: 'overlay-no-adhoc-zindex',
        pattern: /z-\[\d{3,}\]/,
        message: 'Ad-hoc z-index (≥100) — use semantic z-10/z-50 from overlay ladder SOT',
        severity: 'warning',
        scope: 'pages',
    },

    // ═══════════════════════════════════════
    // SECTION M: Meta Information System
    // ═══════════════════════════════════════
    {
        id: 'meta-no-text-xs-uppercase',
        type: 'file-content',
        pattern: /className=["'][^"']*(text-xs[^"']*uppercase|uppercase[^"']*text-xs)[^"']*["'][^>]*>[\s\S]{0,100}?(Phụ trách|Hoạt động gần nhất|Thông tin xử lý|Chi tiết đặt phòng|Thông tin khách|Thông tin thanh toán|Chi tiết thanh toán|Thông tin đối soát|Chi tiết quyết toán)/i,
        message: 'Uppercase labels should use text-micro (via MetaLabel), not text-xs',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'meta-no-raw-card',
        type: 'file-content',
        pattern: /<Card\b[^>]*>[\s\S]{0,500}?(Phụ trách|Hoạt động gần nhất|Thông tin xử lý|Chi tiết đặt phòng|Thông tin khách|Thông tin thanh toán|Chi tiết thanh toán|Thông tin đối soát|Chi tiết quyết toán)/i,
        message: 'Raw Card used for Meta Information context. Use <MetaCard> system.',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'meta-icon-size',
        pattern: /<MetaIcon[^>]*className=["'][^"']*\b(h-[123568]|w-[123568])\b/,
        message: 'MetaIcon must be strictly h-4 w-4 shrink-0',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'meta-no-gap-1',
        pattern: /<MetaBlock[^>]*className=["'][^"']*\bgap-(1|2|3)\b/,
        message: 'MetaBlock must use gap-1.5, not gap-1, gap-2, or gap-3',
        severity: 'warning',
        scope: 'pages',
    },
    {
        id: 'meta-no-direct-micro-uppercase',
        pattern: /className=["'][^"']*text-micro\s+uppercase[^"']*["']/,
        message: 'Direct usage of text-micro uppercase — use <MetaLabel> component instead',
        severity: 'warning',
        scope: 'pages',
        allowFiles: ['MetaLabel.tsx', 'ResponsibleOwnerBadge.tsx', 'CardHeaderRow.tsx', 'SectionCard.tsx'],
    },

    // ═══════════════════════════════════════
    // SECTION O5: Header Governance (file-level)
    // ═══════════════════════════════════════
    {
        id: 'page-has-header-or-pageheader',
        type: 'file-level',
        severity: 'warning',
        scope: 'pages',
    },
];

// ═══════════════════════════════════════
// FILE WALKER
// ═══════════════════════════════════════

function walk(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (IGNORE_DIRS.includes(entry)) continue;
        if (statSync(path).isDirectory()) {
            files.push(...walk(path));
        } else if (EXTENSIONS.includes(extname(path))) {
            files.push(path);
        }
    }
    return files;
}

function isInPages(filePath) {
    return filePath.replace(/\\/g, '/').includes('/pages/');
}

// ═══════════════════════════════════════
// SCAN
// ═══════════════════════════════════════

let errors = 0;
let warnings = 0;
let infos = 0;

const allFiles = walk(SRC_DIR);

// Line-level rules
for (const file of allFiles) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (const rule of RULES) {
        if (rule.type === 'file-level') continue;
        if (rule.scope === 'pages' && !isInPages(file)) continue;

        if (rule.type === 'file-content') {
            if (rule.pattern && rule.pattern.test(content)) {
                if (rule.allowFiles && rule.allowFiles.some(f => file.includes(f))) continue;

                const sevIcon = rule.severity === 'error' ? '❌' : rule.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
                const sevLabel = rule.severity.toUpperCase();
                console.log(`${sevIcon} ${sevLabel} [${rule.id}] ${file}`);
                console.log(`  → ${rule.message}\n`);

                if (rule.severity === 'error') errors++;
                else if (rule.severity === 'warning') warnings++;
                else infos++;
            }
            continue;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (rule.pattern && rule.pattern.test(line)) {
                if (rule.allowFiles && rule.allowFiles.some(f => file.includes(f))) continue;

                const sevIcon = rule.severity === 'error' ? '❌' : rule.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
                const sevLabel = rule.severity.toUpperCase();
                console.log(`${sevIcon} ${sevLabel} [${rule.id}] ${file}:${i + 1}`);
                console.log(`  ${line.trim().substring(0, 120)}`);
                console.log(`  → ${rule.message}\n`);

                if (rule.severity === 'error') errors++;
                else if (rule.severity === 'warning') warnings++;
                else infos++;
            }
        }
    }
}

// File-level: Check pages for Header/PageHeader import
const pageFiles = allFiles.filter(f => isInPages(f) && f.endsWith('.tsx'));
let pagesWithoutHeader = 0;

for (const file of pageFiles) {
    const content = readFileSync(file, 'utf8');
    const name = basename(file);

    // Skip non-page files (index, layout files, etc)
    if (!name.endsWith('Page.tsx') && name !== 'Dashboard.tsx') continue;

    // Skip specific exempted pages
    if (['AuthPage.tsx', 'AccessDeniedPage.tsx', 'PendingReviewsPage.tsx'].includes(name)) continue;

    const hasHeader = /import.*Header.*from.*layout/i.test(content) ||
        /import.*PageHeader/i.test(content) ||
        /<Header\s/i.test(content);

    if (!hasHeader) {
        pagesWithoutHeader++;
    }
}

// ═══════════════════════════════════════
// REPORT
// ═══════════════════════════════════════

console.log(`${'═'.repeat(55)}`);
console.log(`UI Drift Guard: ${errors} errors, ${warnings} warnings, ${infos} info`);
console.log(`Pages without Header/PageHeader: ${pagesWithoutHeader}/${pageFiles.filter(f => basename(f).endsWith('Page.tsx') || basename(f) === 'Dashboard.tsx').length}`);
console.log(`${'═'.repeat(55)}`);

if (errors > 0) {
    console.log('\n💥 FAIL — Fix all errors before merging.\n');
    process.exit(1);
} else if (warnings > 0) {
    console.log(`\n💥 FAIL — ${warnings} warnings remain. Hard gate: 0 tolerance.\n`);
    process.exit(1);
} else {
    console.log('\n✅ PASS — UI drift clean.\n');
}

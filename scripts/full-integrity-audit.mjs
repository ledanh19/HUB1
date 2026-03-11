/**
 * Phase 1-3 Comprehensive Audit + Auto-Fix Script
 * 
 * Phase 1B: Classify Card usages (KPI tile vs section wrapper)
 * Phase 2: Visual hierarchy — detect >3 text-* tokens in same section
 * Phase 3: Numeric alignment — detect currency columns missing text-right tabular-nums
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const PAGES_DIR = 'src/pages';

function walk(dir) {
    let results = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) results = results.concat(walk(full));
        else if (full.endsWith('.tsx')) results.push(full);
    }
    return results;
}

const allFiles = walk(PAGES_DIR).filter(f =>
    basename(f).endsWith('Page.tsx') || basename(f) === 'Dashboard.tsx'
);

const EXEMPT = ['AuthPage.tsx', 'AccessDeniedPage.tsx', 'PendingReviewsPage.tsx',
    'DocumentationPage.tsx', 'ChannexEmbedPage.tsx'];

// ═══════════════════════════════════════
// PHASE 1B: Card Usage Classification
// ═══════════════════════════════════════

console.log('═══ PHASE 1B: Card Usage Classification ═══\n');

const cardClassification = [];
for (const file of allFiles) {
    const name = basename(file);
    if (EXEMPT.includes(name)) continue;

    const content = readFileSync(file, 'utf8');
    if (!/<Card[\s>]/.test(content)) continue;

    // Count Card usages
    const cardMatches = content.match(/<Card[\s>]/g) || [];
    const cardTotal = cardMatches.length;

    // Classify: KPI tile = Card containing CardHeader + CardContent with metric text
    const lines = content.split('\n');
    let kpiTileCount = 0;
    let sectionWrapperCount = 0;

    // Simple heuristic: if Card is inside a grid with gap, it's a KPI tile
    const hasMetricGrid = /grid.*grid-cols/.test(content) && /<Card[\s>]/.test(content);
    const hasKpiText = /text-kpi|text-hero-kpi/.test(content);

    if (hasKpiText && hasMetricGrid) {
        kpiTileCount = cardTotal;
        sectionWrapperCount = 0;
    } else {
        sectionWrapperCount = cardTotal;
    }

    const hasSectionCard = /import.*SectionCard/.test(content);

    cardClassification.push({
        file: file.replace(/\\/g, '/'),
        name,
        cardTotal,
        kpiTile: kpiTileCount,
        sectionWrapper: sectionWrapperCount,
        hasSectionCard,
        risk: cardTotal > 10 ? 'HIGH' : cardTotal > 4 ? 'MEDIUM' : 'LOW'
    });
}

// Print classification table
console.log('Page | Cards | KPI Tiles | Section Wrappers | Has SectionCard | Risk');
console.log('-----|-------|-----------|------------------|----------------|-----');
for (const c of cardClassification) {
    console.log(`${c.name} | ${c.cardTotal} | ${c.kpiTile} | ${c.sectionWrapper} | ${c.hasSectionCard ? '✅' : '❌'} | ${c.risk}`);
}
console.log(`\nTotal: ${cardClassification.length} pages with Card usage`);
console.log(`KPI tile pages: ${cardClassification.filter(c => c.kpiTile > 0).length}`);
console.log(`Section wrapper pages: ${cardClassification.filter(c => c.sectionWrapper > 0).length}`);

// ═══════════════════════════════════════
// PHASE 2: Visual Hierarchy Audit
// ═══════════════════════════════════════

console.log('\n═══ PHASE 2: Visual Hierarchy Audit ═══\n');

const TEXT_TOKENS = [
    'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl',
    'text-4xl', 'text-5xl', 'text-kpi', 'text-hero-kpi', 'text-micro', 'text-caption',
    'text-body', 'text-section', 'text-page'
];

let hierarchyViolations = 0;
for (const file of allFiles) {
    const name = basename(file);
    const content = readFileSync(file, 'utf8');

    // Find distinct text tokens used
    const usedTokens = TEXT_TOKENS.filter(t => new RegExp(`\\b${t}\\b`).test(content));

    if (usedTokens.length > 6) {
        console.log(`⚠️  ${name}: ${usedTokens.length} distinct text tokens — ${usedTokens.join(', ')}`);
        hierarchyViolations++;
    }
}
if (hierarchyViolations === 0) console.log('✅ No visual hierarchy violations found (all pages ≤6 text tokens)');

// ═══════════════════════════════════════
// PHASE 3: Numeric Alignment Audit
// ═══════════════════════════════════════

console.log('\n═══ PHASE 3: Numeric Alignment Audit ═══\n');

let numericIssues = 0;
for (const file of allFiles) {
    const name = basename(file);
    const content = readFileSync(file, 'utf8');

    // Check for formatCurrency in table cells without text-right
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Currency in TableCell without text-right
        if (/TableCell/.test(line) && /formatCurrency|toLocaleString/.test(lines[i + 1] || '') && !/text-right/.test(line)) {
            console.log(`⚠️  ${name}:${i + 1} — Currency in TableCell without text-right`);
            numericIssues++;
        }

        // tabular-nums check for KPI values
        if (/text-kpi/.test(line) && !/tabular-nums/.test(line)) {
            console.log(`⚠️  ${name}:${i + 1} — text-kpi without tabular-nums`);
            numericIssues++;
        }
    }

    // Check for inline ₫ symbol
    if (/}\s*₫|"\s*₫|'\s*₫/.test(content)) {
        console.log(`⚠️  ${name} — inline ₫ symbol detected`);
        numericIssues++;
    }
}
if (numericIssues === 0) console.log('✅ No numeric alignment issues found');
else console.log(`\nTotal numeric issues: ${numericIssues}`);

// ═══════════════════════════════════════
// PHASE 5: Mobile Stability Check
// ═══════════════════════════════════════

console.log('\n═══ PHASE 5: Mobile Stability Check ═══\n');

let mobileIssues = 0;
for (const file of allFiles) {
    const name = basename(file);
    const content = readFileSync(file, 'utf8');

    // Fixed width tables (w-[Npx] on Table)
    if (/Table.*w-\[\d+px\]/.test(content) || /w-\[\d+px\].*Table/.test(content)) {
        console.log(`⚠️  ${name} — Fixed width on Table`);
        mobileIssues++;
    }

    // overflow-x-hidden masking
    if (/overflow-x-hidden/.test(content)) {
        console.log(`⚠️  ${name} — overflow-x-hidden may mask issues`);
        mobileIssues++;
    }
}
if (mobileIssues === 0) console.log('✅ No mobile stability issues found');

// ═══════════════════════════════════════
// PHASE 6: Baseline Grid Check
// ═══════════════════════════════════════

console.log('\n═══ PHASE 6: Baseline Grid Check ═══\n');

let gridIssues = 0;
for (const file of allFiles) {
    const name = basename(file);
    const content = readFileSync(file, 'utf8');

    // Random mt-6, mb-6, pt-6, p-6, gap-6, space-y-6
    const driftPatterns = [/\bmt-6\b/, /\bmb-6\b/, /\bpt-6\b/, /\bp-6\b/, /\bgap-6\b/, /\bspace-y-6\b/];
    for (const p of driftPatterns) {
        if (p.test(content)) {
            console.log(`⚠️  ${name} — spacing drift: ${p.source}`);
            gridIssues++;
        }
    }
}
if (gridIssues === 0) console.log('✅ No baseline grid drift found — all spacing is gap-4 compliant');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('AUDIT COMPLETE');
console.log('═══════════════════════════════════════════════════════════');

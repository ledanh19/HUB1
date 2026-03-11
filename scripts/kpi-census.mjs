/**
 * KPI Census Script — Step 0
 * Scans all pages to classify every KPI element by type, container, grid, tokens, inconsistency.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

function walk(dir) {
    let files = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) files = files.concat(walk(full));
        else if (full.endsWith('.tsx')) files.push(full);
    }
    return files;
}

const pagesDir = 'src/pages';
const files = walk(pagesDir);

const census = [];

for (const file of files) {
    const name = basename(file, '.tsx');
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    const page = {
        name,
        path: file,
        importsMetricCard: /import.*MetricCard/.test(content),
        importsStatGroup: /import.*StatGroup/.test(content),
        importsCard: /import.*\bCard\b/.test(content),
        usesTextKpi: /text-kpi/.test(content),
        usesTextHeroKpi: /text-hero-kpi/.test(content),
        textKpiCount: (content.match(/text-kpi/g) || []).length,
        textHeroKpiCount: (content.match(/text-hero-kpi/g) || []).length,

        // Detect KPI tile patterns (Card+CardContent with text-kpi or text-hero-kpi)
        kpiTiles: [],
        inlineKpis: [],

        // Grid patterns for KPI areas
        gridPatterns: [],

        // Icon sizes
        iconSizes: new Set(),

        // Padding patterns
        paddings: new Set(),

        // Tone classes
        tones: new Set(),
    };

    // Find all grid patterns near KPI  
    const gridRegex = /grid-cols-(\d+)/g;
    let gridMatch;
    while ((gridMatch = gridRegex.exec(content)) !== null) {
        page.gridPatterns.push(gridMatch[0]);
    }

    // Find icon sizes near KPI contexts
    const iconRegex = /h-(\d+)\s+w-(\d+)/g;
    let iconMatch;
    while ((iconMatch = iconRegex.exec(content)) !== null) {
        page.iconSizes.add(`h-${iconMatch[1]} w-${iconMatch[2]}`);
    }

    // Find padding patterns
    const padRegex = /\bp-(\d+)\b|\bpt-(\d+)\b|\bpx-(\d+)\b/g;
    let padMatch;
    while ((padMatch = padRegex.exec(content)) !== null) {
        page.paddings.add(padMatch[0]);
    }

    // Find tone classes
    const toneRegex = /text-(success|destructive|warning|info|primary)/g;
    let toneMatch;
    while ((toneMatch = toneRegex.exec(content)) !== null) {
        page.tones.add(toneMatch[0]);
    }

    // Classify KPI elements
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/text-kpi|text-hero-kpi/.test(line)) {
            // Check if it's inside a Card tile pattern (look back 5 lines for <Card or CardContent)
            const context = lines.slice(Math.max(0, i - 8), i + 3).join('\n');
            const isInCard = /<Card|CardContent/.test(context);
            const isInTable = /TableCell|<td|<table/.test(context);
            const isInDialog = /Dialog|dialog/.test(context);
            const isInMetricCard = /MetricCard/.test(context);

            const isHero = /text-hero-kpi/.test(line);
            const hasTabularNums = /tabular-nums/.test(line);

            let kpiType;
            if (isInMetricCard) {
                kpiType = 'METRIC_CARD'; // Already migrated
            } else if (isInCard && !isInTable) {
                kpiType = 'TILE'; // Raw Card tile — needs MetricCard migration
            } else if (isInTable) {
                kpiType = 'INLINE_TABLE'; // Inline in table
            } else if (isInDialog) {
                kpiType = 'INLINE_DIALOG'; // Inline in dialog
            } else {
                kpiType = 'INLINE_SUMMARY'; // Inline summary row
            }

            const entry = {
                line: i + 1,
                type: kpiType,
                isHero,
                hasTabularNums,
                token: isHero ? 'text-hero-kpi' : 'text-kpi',
                lineContent: line.trim().slice(0, 120),
            };

            if (kpiType === 'TILE') {
                page.kpiTiles.push(entry);
            } else if (kpiType !== 'METRIC_CARD') {
                page.inlineKpis.push(entry);
            }
        }
    }

    // Inconsistency score
    let score = 0;
    if (page.kpiTiles.length > 0) score += page.kpiTiles.length * 2; // Raw tiles are 2pts each
    if (page.iconSizes.size > 2) score += 1; // Mixed icon sizes
    if (page.usesTextKpi && page.usesTextHeroKpi) score += 1; // Mixed KPI tokens
    if (page.textKpiCount > 5) score += 1; // High count

    page.inconsistencyScore = score;

    if (page.usesTextKpi || page.usesTextHeroKpi || page.importsMetricCard) {
        census.push(page);
    }
}

// Sort by inconsistency score descending
census.sort((a, b) => b.inconsistencyScore - a.inconsistencyScore);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║              KPI CENSUS — STEP 0 RESULTS                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log();

// Summary
const totalTiles = census.reduce((s, p) => s + p.kpiTiles.length, 0);
const totalInline = census.reduce((s, p) => s + p.inlineKpis.length, 0);
const metricCardPages = census.filter(p => p.importsMetricCard).length;
console.log(`Total pages with KPI: ${census.length}`);
console.log(`Pages using MetricCard: ${metricCardPages}`);
console.log(`Raw KPI tiles needing migration: ${totalTiles}`);
console.log(`Inline KPI elements: ${totalInline}`);
console.log();

// Top 10 worst
console.log('═══ TOP 10 WORST PAGES BY INCONSISTENCY SCORE ═══');
console.log('Page | Score | Tiles | Inline | Tokens | Grid Patterns');
console.log('-----|-------|-------|--------|--------|-------------');
for (const p of census.slice(0, 10)) {
    console.log(`${p.name} | ${p.inconsistencyScore} | ${p.kpiTiles.length} | ${p.inlineKpis.length} | kpi:${p.textKpiCount} hero:${p.textHeroKpiCount} | ${[...new Set(p.gridPatterns)].join(',')}`);
}

console.log();
console.log('═══ FULL KPI CLASSIFICATION TABLE ═══');
console.log('Page | KPI Element | Current Type | Target Type | Component | Notes');
console.log('-----|------------|--------------|-------------|-----------|------');

for (const p of census) {
    for (const tile of p.kpiTiles) {
        const targetType = tile.isHero ? 'Type 3: Hero' : 'Type 1: Tile';
        const targetComp = tile.isHero ? 'MetricCard variant=hero' : 'MetricCard in KPIGrid';
        console.log(`${p.name} | L${tile.line} ${tile.token} | TILE (raw Card) | ${targetType} | ${targetComp} | tabular:${tile.hasTabularNums}`);
    }
    for (const inl of p.inlineKpis) {
        let targetType, targetComp;
        if (inl.type === 'INLINE_TABLE') {
            targetType = 'Type 5: Inline Numeric';
            targetComp = 'InlineKpiValue size=body align=right';
        } else {
            targetType = 'Type 4: Inline KPI';
            targetComp = 'InlineKpiValue size=kpi';
        }
        console.log(`${p.name} | L${inl.line} ${inl.token} | ${inl.type} | ${targetType} | ${targetComp} | tabular:${inl.hasTabularNums}`);
    }
}

console.log();
console.log('═══ GRID PATTERNS IN USE ═══');
const allGrids = {};
for (const p of census) {
    for (const g of p.gridPatterns) {
        allGrids[g] = (allGrids[g] || 0) + 1;
    }
}
for (const [pattern, count] of Object.entries(allGrids).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pattern}: ${count} occurrences`);
}

console.log();
console.log('═══ TONE USAGE ═══');
const allTones = {};
for (const p of census) {
    for (const t of p.tones) {
        allTones[t] = (allTones[t] || 0) + 1;
    }
}
for (const [tone, count] of Object.entries(allTones).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tone}: ${count} pages`);
}

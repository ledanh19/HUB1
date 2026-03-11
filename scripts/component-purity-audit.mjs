/**
 * Component Purity Scanner — Phase 1 Audit
 * Generates compliance matrix for SectionCard, MetricCard, PageContainer, and raw Card usage.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const PAGES_DIR = 'src/pages';

function walk(dir) {
    let results = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            results = results.concat(walk(full));
        } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
            results.push(full);
        }
    }
    return results;
}

const allFiles = walk(PAGES_DIR).filter(f =>
    basename(f).endsWith('Page.tsx') || basename(f) === 'Dashboard.tsx'
);

// Results
const report = {
    sectionCard: { using: [], missing: [] },
    pageContainer: { using: [], missing: [] },
    rawCard: { using: [], notUsing: [] },
    rawCardAsSection: [],  // Pages using Card as section wrapper (NOT inside Dialog)
    textKpi: { using: [], notUsing: [] },
    metricCard: { using: [], missing: [] },
    heroKpi: { using: [] },
};

for (const file of allFiles) {
    const content = readFileSync(file, 'utf8');
    const name = file.replace(/\\/g, '/');

    // SectionCard
    if (/import.*SectionCard/.test(content)) {
        report.sectionCard.using.push(name);
    } else {
        report.sectionCard.missing.push(name);
    }

    // PageContainer
    if (/import.*PageContainer/.test(content)) {
        report.pageContainer.using.push(name);
    } else {
        report.pageContainer.missing.push(name);
    }

    // Raw Card import from ui/card
    if (/import.*Card.*from.*@\/components\/ui\/card/.test(content)) {
        report.rawCard.using.push(name);

        // Check if Card is used as page-level section (not inside Dialog)
        // Heuristic: <Card> or <Card className= appears outside of Dialog context
        const cardUsages = (content.match(/<Card[\s>]/g) || []).length;
        const cardInDialog = (content.match(/<Dialog[\s\S]*?<Card/g) || []).length;
        if (cardUsages > cardInDialog) {
            report.rawCardAsSection.push({ name, total: cardUsages, inDialog: cardInDialog });
        }
    } else {
        report.rawCard.notUsing.push(name);
    }

    // text-kpi raw usage (not inside MetricCard)
    if (/text-kpi/.test(content)) {
        report.textKpi.using.push(name);
    }

    // text-hero-kpi usage
    if (/text-hero-kpi/.test(content)) {
        report.heroKpi.using.push(name);
    }

    // MetricCard import
    if (/import.*MetricCard/.test(content)) {
        report.metricCard.using.push(name);
    } else {
        report.metricCard.missing.push(name);
    }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('COMPONENT PURITY AUDIT — Phase 1');
console.log('═══════════════════════════════════════════════════════════');
console.log(`\nTotal Page Files: ${allFiles.length}`);

console.log(`\n── 1. SectionCard Usage ──`);
console.log(`  Using: ${report.sectionCard.using.length}`);
console.log(`  Missing: ${report.sectionCard.missing.length}`);
if (report.sectionCard.missing.length > 0) {
    report.sectionCard.missing.forEach(f => console.log(`    ❌ ${f}`));
}

console.log(`\n── 2. PageContainer Usage ──`);
console.log(`  Using: ${report.pageContainer.using.length}`);
console.log(`  Missing: ${report.pageContainer.missing.length}`);
if (report.pageContainer.missing.length > 0) {
    report.pageContainer.missing.forEach(f => console.log(`    ❌ ${f}`));
}

console.log(`\n── 3. Raw Card from ui/card ──`);
console.log(`  Pages importing Card: ${report.rawCard.using.length}`);
console.log(`  Pages NOT importing Card: ${report.rawCard.notUsing.length}`);
console.log(`  Pages using Card as page-section (outside dialog): ${report.rawCardAsSection.length}`);
if (report.rawCardAsSection.length > 0) {
    report.rawCardAsSection.forEach(r =>
        console.log(`    ⚠️  ${r.name} — ${r.total} <Card> total, ${r.inDialog} inside Dialog`)
    );
}

console.log(`\n── 4. text-kpi Raw Markup in Pages ──`);
console.log(`  Pages with text-kpi: ${report.textKpi.using.length}`);
report.textKpi.using.forEach(f => console.log(`    📊 ${f}`));

console.log(`\n── 5. MetricCard Component Usage ──`);
console.log(`  Pages importing MetricCard: ${report.metricCard.using.length}`);
if (report.metricCard.using.length > 0) {
    report.metricCard.using.forEach(f => console.log(`    ✅ ${f}`));
}

console.log(`\n── 6. text-hero-kpi Usage ──`);
console.log(`  Pages: ${report.heroKpi.using.length}`);
report.heroKpi.using.forEach(f => console.log(`    📊 ${f}`));

console.log('\n═══════════════════════════════════════════════════════════');

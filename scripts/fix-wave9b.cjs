const fs = require('fs');
const path = require('path');

// All pages with warnings from drift guard output
const files = [
    'src/pages/AccessDeniedPage.tsx',
    'src/pages/AccountingPeriodsPage.tsx',
    'src/pages/AIPricingInsightsPage.tsx',
    'src/pages/AIPricingRecommendationsPage.tsx',
    'src/pages/AIPricingValidationPage.tsx',
    'src/pages/analytics/ControlHubPage.tsx',
    'src/pages/analytics/HostCostAnalyticsPage.tsx',
    'src/pages/analytics/OverviewPage.tsx',
    'src/pages/analytics/PriceSpreadAnalyticsPage.tsx',
    'src/pages/analytics/RevenueAnalyticsPage.tsx',
    'src/pages/AuthPage.tsx',
    'src/pages/BookingsPage.tsx',
    'src/pages/CashAccountsPage.tsx',
    'src/pages/CashOutPage.tsx',
    'src/pages/ChannelManagerPage.tsx',
    'src/pages/ChannexEmbedPage.tsx',
    'src/pages/ChannexIntegrationPage.tsx',
    'src/pages/CollectionReportsPage.tsx',
    'src/pages/CollectionsPage.tsx',
    'src/pages/Dashboard.tsx',
    'src/pages/DocumentationPage.tsx',
    'src/pages/HostPayableDetailPage.tsx',
    'src/pages/HostPayablesAgingPage.tsx',
    'src/pages/MappingRulesPage.tsx',
    'src/pages/ota-operations/KpiPage.tsx',
    'src/pages/ota-operations/MyTasksPage.tsx',
    'src/pages/ota-operations/ProjectDetailPage.tsx',
    'src/pages/ota-operations/ProjectsPage.tsx',
    'src/pages/ota-operations/TaskDetailPage.tsx',
    'src/pages/ota-operations/TasksPage.tsx',
    'src/pages/OtaMessagesPage.tsx',
    'src/pages/OtaPayoutsPage.tsx',
    'src/pages/OutgoingPaymentsPage.tsx',
    'src/pages/PartnersPage.tsx',
    'src/pages/ServicePayablesPage.tsx',
    'src/pages/ServiceReportsPage.tsx',
    'src/pages/settings/WhatsAppSettingsPage.tsx',
    'src/pages/SettingsPage.tsx',
    'src/pages/SettlementHistoryPage.tsx',
    'src/pages/StaysPage.tsx',
    'src/pages/SyncJobsPage.tsx',
];

let totalChanges = 0;

files.forEach(p => {
    if (!fs.existsSync(p)) return;
    let c = fs.readFileSync(p, 'utf8');
    const orig = c;

    // ── RHYTHM ──
    // space-y-6 → space-y-4
    c = c.replace(/space-y-6/g, 'space-y-4');
    // gap-6 → gap-4  (but NOT gap-6xl or similar)
    c = c.replace(/\bgap-6\b/g, 'gap-4');
    // p-6 → p-4  (standalone, not p-6xl or sm:p-6)
    c = c.replace(/\bp-6\b/g, 'p-4');
    // pt-6 → pt-4
    c = c.replace(/\bpt-6\b/g, 'pt-4');
    // pb-6 → pb-4
    c = c.replace(/\bpb-6\b/g, 'pb-4');
    // mb-6 → mb-4
    c = c.replace(/\bmb-6\b/g, 'mb-4');
    // mt-6 → mt-4
    c = c.replace(/\bmt-6\b/g, 'mt-4');

    // ── KPI TYPOGRAPHY ──
    // text-xl font-bold → text-kpi font-semibold tabular-nums tracking-tight
    c = c.replace(/text-xl font-bold/g, 'text-kpi font-semibold tabular-nums tracking-tight');
    // text-lg font-bold → text-kpi font-semibold tabular-nums tracking-tight
    c = c.replace(/text-lg font-bold/g, 'text-kpi font-semibold tabular-nums tracking-tight');
    // text-2xl font-bold → text-hero-kpi font-bold tabular-nums tracking-tight
    c = c.replace(/text-2xl font-bold/g, 'text-hero-kpi font-bold tabular-nums tracking-tight');
    // text-3xl font-bold → text-hero-kpi font-bold tabular-nums tracking-tight
    c = c.replace(/text-3xl font-bold/g, 'text-hero-kpi font-bold tabular-nums tracking-tight');

    // ── INLINE MAX-W OVERRIDES ──
    c = c.replace(/max-w-\[120px\]/g, 'max-w-28');
    c = c.replace(/max-w-\[140px\]/g, 'max-w-36');
    c = c.replace(/max-w-\[150px\]/g, 'max-w-40');
    c = c.replace(/max-w-\[160px\]/g, 'max-w-40');
    c = c.replace(/max-w-\[200px\]/g, 'max-w-xs');
    c = c.replace(/max-w-\[250px\]/g, 'max-w-64');
    c = c.replace(/max-w-\[280px\]/g, 'max-w-72');
    c = c.replace(/max-w-\[300px\]/g, 'max-w-xs');
    c = c.replace(/max-w-\[320px\]/g, 'max-w-80');
    c = c.replace(/max-w-\[400px\]/g, 'max-w-sm');

    if (c !== orig) {
        fs.writeFileSync(p, c);
        totalChanges++;
        console.log(`  ✓ ${p}`);
    }
});

console.log(`\nDone. ${totalChanges} files modified.`);

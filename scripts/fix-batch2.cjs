const fs = require('fs');

const files = [
    'src/pages/MappingsPage.tsx',
    'src/pages/NoShowReportPage.tsx',
    'src/pages/OtaPayoutDetailPage.tsx',
    'src/pages/ServiceOrderDetailPage.tsx',
    'src/pages/ServiceOrdersPage.tsx',
    'src/pages/ServicePayablesPage.tsx',
    'src/pages/StaysPage.tsx'
];

files.forEach(p => {
    if (!fs.existsSync(p)) return;
    let c = fs.readFileSync(p, 'utf8');

    // Locales
    c = c.replace(/toLocaleString\("vi-VN"\)/g, 'toLocaleString("en-GB")');
    c = c.replace(/toLocaleString\('vi-VN'\)/g, "toLocaleString('en-GB')");

    // Rhythm
    c = c.replace(/space-y-6/g, 'space-y-4');
    c = c.replace(/gap-6/g, 'gap-4');
    c = c.replace(/p-6/g, 'p-4');
    c = c.replace(/pt-6/g, 'pt-4');
    c = c.replace(/pb-6/g, 'pb-4');
    c = c.replace(/mb-6/g, 'mb-4');
    c = c.replace(/mt-6/g, 'mt-4');

    // Typography
    c = c.replace(/text-lg font-bold/g, 'text-kpi font-semibold tabular-nums tracking-tight');
    c = c.replace(/text-xl font-bold/g, 'text-kpi font-semibold tabular-nums tracking-tight');
    c = c.replace(/text-2xl font-bold/g, 'text-hero-kpi font-bold tabular-nums tracking-tight');

    // Overrides
    c = c.replace(/max-w-\[200px\]/g, 'max-w-xs');
    c = c.replace(/max-w-\[150px\]/g, 'max-w-40');
    c = c.replace(/max-w-\[250px\]/g, 'max-w-xs');
    c = c.replace(/max-w-\[300px\]/g, 'max-w-sm');

    fs.writeFileSync(p, c);
});
console.log("Batch 2 completed.");

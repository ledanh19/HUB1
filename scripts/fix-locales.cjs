const fs = require('fs');

const files = [
    'src/pages/AuditLogsPage.tsx',
    'src/pages/BookingDetailPage.tsx',
    'src/pages/DeclarationListPage.tsx',
    'src/pages/DisputeDetailPage.tsx',
    'src/pages/NoShowReportPage.tsx',
    'src/pages/ServiceOrderDetailPage.tsx',
    'src/pages/ServiceOrdersPage.tsx',
    'src/pages/ServicePayablesPage.tsx',
    'src/pages/StaysPage.tsx'
];

files.forEach(p => {
    if (!fs.existsSync(p)) return;
    let c = fs.readFileSync(p, 'utf8');

    // Locales: Do NOT match the closing parenthesis
    c = c.replace(/toLocaleString\("vi-VN"/g, 'toLocaleString("en-GB"');
    c = c.replace(/toLocaleString\('vi-VN'/g, "toLocaleString('en-GB'");

    fs.writeFileSync(p, c);
});
console.log("Locales fixed.");

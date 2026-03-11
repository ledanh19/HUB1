const fs = require('fs');

const raw = fs.readFileSync('drift_baseline_utf8.txt', 'utf8');
const counts = {};
const errors = {};

raw.split('\n').forEach(line => {
    const m = line.match(/(WARNING|ERROR) \[(.*?)\] (src[\\\/]pages[\\\/].*?\.tsx)/);
    if (m) {
        const type = m[1];
        const file = m[3].replace(/\\/g, '/').replace('src/pages/', '');
        if (type === 'ERROR') {
            errors[file] = (errors[file] || 0) + 1;
        } else {
            counts[file] = (counts[file] || 0) + 1;
        }
    }
});

const sortedWarnings = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
const allErrors = Object.entries(errors).sort((a, b) => b[1] - a[1]);

let md = `# Wave 9: Mobile Responsive Audit (Phase Y)\n\n`;
md += `## Baseline Top Offenders\n\n### Errors\n`;
if (allErrors.length) {
    allErrors.forEach(([f, c]) => md += `- **${f}**: ${c} errors\n`);
} else {
    md += `- None\n`;
}

md += `\n### Top 30 Warnings\n`;
sortedWarnings.forEach(([f, c]) => md += `- **${f}**: ${c} warnings\n`);

md += `\n## Checklists\n`;
md += `*Checklist items for each: overflow-x, header wrap, dialog off-screen, bottom nav overlap, table scroll, KPI grid collapse, form spacing*\n\n`;

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx') && !file.endsWith('index.tsx') && !file.endsWith('index.ts') && !file.endsWith('NotFound.tsx') && !file.endsWith('AccessDeniedPage.tsx')) {
                results.push(file.replace('src/pages/', ''));
            }
        }
    });
    return results;
}
const pages = walk('src/pages').sort();
md += `### Primary Pages (${pages.length})\n`;
pages.forEach(p => md += `- [ ] ${p}\n`);

fs.writeFileSync('C:/Users/jacki/.gemini/antigravity/brain/3d0ad13f-cc51-4d1a-880d-7382929ab7c6/MOBILE_AUDIT_REPORT.md', md, 'utf8');
console.log('MOBILE_AUDIT_REPORT.md generated.');

/**
 * KPI Consistency Audit - checks all MetricCard usages across migrated pages
 * for consistency in: icon, tone, className overrides, valueClassName (deprecated)
 */
import { readFileSync } from "fs";
import { basename } from "path";

const pages = [
    "src/pages/analytics/ControlHubPage.tsx",
    "src/pages/ota-operations/KpiPage.tsx",
    "src/pages/ota-operations/ProjectsPage.tsx",
    "src/pages/ota-operations/TasksPage.tsx",
    "src/pages/ota-operations/MyTasksPage.tsx",
    "src/pages/AIPricingValidationPage.tsx",
    "src/pages/ServicePayablesPage.tsx",
    "src/pages/SyncJobsPage.tsx",
    "src/pages/HostPayablesAgingPage.tsx",
    "src/pages/ServiceReportsPage.tsx",
];

let totalCards = 0;
let totalIssues = 0;
const issuesByType = {};

for (const p of pages) {
    const c = readFileSync(p, "utf8");
    const n = basename(p, ".tsx");
    // Match MetricCard usages (may span multiple lines)
    const cards = c.match(/<MetricCard[\s\S]*?\/>/g) || [];
    totalCards += cards.length;

    console.log(`\n=== ${n} (${cards.length} cards) ===`);

    cards.forEach((card, i) => {
        const hasIcon = card.includes("icon=");
        const hasTone = card.includes('tone=');
        const hasValueCN = card.includes("valueClassName=");
        const hasCN = card.includes("className=");
        const hasOnClick = card.includes("onClick=");
        const hasSub = card.includes("subtitle=");
        const titleMatch = card.match(/title="([^"]*)"/);
        const title = titleMatch ? titleMatch[1] : "?";

        const issues = [];

        // Check: icon missing
        if (!hasIcon) {
            issues.push("NO_ICON");
        }

        // Check: no color specification (no tone AND no valueClassName)
        if (!hasTone && !hasValueCN) {
            issues.push("NO_TONE");
        }

        // Check: deprecated valueClassName
        if (hasValueCN) {
            issues.push("DEPRECATED_valueClassName");
        }

        // Check: className overrides that might break layout consistency
        if (hasCN) {
            const cnMatch = card.match(/className=[{"`]([^"`}]*)/);
            const cn = cnMatch ? cnMatch[1] : "";
            if (/\bp-\d/.test(cn)) issues.push("PADDING_OVERRIDE");
            if (/min-h/.test(cn)) issues.push("HEIGHT_OVERRIDE");
            if (/text-\d/.test(cn)) issues.push("FONT_SIZE_OVERRIDE");
            if (/rounded-/.test(cn) && !cn.includes("rounded-")) {
                // no issue
            }
        }

        for (const issue of issues) {
            issuesByType[issue] = (issuesByType[issue] || 0) + 1;
            totalIssues++;
        }

        const flags = issues.length > 0 ? " ⚠ " + issues.join(", ") : " ✅";
        console.log(`  ${i + 1}. "${title}" | icon:${hasIcon} | tone:${hasTone}${flags}`);
    });
}

console.log("\n" + "=".repeat(60));
console.log(`TOTAL: ${totalCards} MetricCards across ${pages.length} pages`);
console.log(`ISSUES: ${totalIssues} total`);
if (Object.keys(issuesByType).length > 0) {
    console.log("Issue breakdown:");
    for (const [k, v] of Object.entries(issuesByType)) {
        console.log(`  ${k}: ${v}`);
    }
} else {
    console.log("✅ All cards are consistent!");
}

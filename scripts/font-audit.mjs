/**
 * Font System SOT Lint Script
 * Checks for violations of the Be Vietnam Pro font system.
 * Run: node scripts/font-audit.mjs
 * Add to CI: npx node scripts/font-audit.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = 'src';
const EXTENSIONS = ['.tsx', '.ts', '.css'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build'];

// Violations to check
const RULES = [
    {
        id: 'no-geist-font',
        pattern: /geist[\s-]*sans/i,
        message: 'Geist Sans reference found — use Be Vietnam Pro via var(--font-sans)',
        severity: 'error',
    },
    {
        id: 'no-hardcoded-font-family',
        pattern: /font-family:\s*["'][^v]/,
        message: 'Hardcoded font-family — use var(--font-sans) or inherit',
        severity: 'error',
        // Allow: font-family: var(... and font-family: inherit and email iframe srcDoc
        exclude: /font-family:\s*(var\(|inherit)/,
        allowFiles: ['ThreadDetail.tsx'],
    },
    {
        id: 'no-geist-feature-settings',
        pattern: /font-feature-settings.*cv0[234]|cv11/,
        message: 'Geist-specific font-feature-settings (cv02/cv03/cv04/cv11) found',
        severity: 'error',
    },
    {
        id: 'no-leading-none-on-text',
        pattern: /leading-none/,
        message: 'leading-none may clip Vietnamese diacritics — use leading-tight or leading-snug',
        severity: 'warning',
        // Allow in chart.tsx (numbers only), ConversationList (notification count), ReplyComposer (emoji icon)
        allowFiles: ['chart.tsx', 'ConversationList.tsx', 'ReplyComposer.tsx'],
    },
    {
        id: 'no-fontsource-other',
        pattern: /@fontsource\/(?!be-vietnam-pro)/,
        message: 'Non-SOT font import — only @fontsource/be-vietnam-pro is allowed',
        severity: 'error',
    },
];

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

let violations = 0;
let warnings = 0;

for (const file of walk(SRC_DIR)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (const rule of RULES) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (rule.pattern.test(line)) {
                if (rule.exclude && rule.exclude.test(line)) continue;
                if (rule.allowFiles && rule.allowFiles.some((f) => file.includes(f))) continue;

                const sev = rule.severity === 'error' ? '❌ ERROR' : '⚠️  WARN';
                console.log(`${sev} [${rule.id}] ${file}:${i + 1}`);
                console.log(`  ${line.trim()}`);
                console.log(`  → ${rule.message}\n`);

                if (rule.severity === 'error') violations++;
                else warnings++;
            }
        }
    }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Font SOT Audit: ${violations} errors, ${warnings} warnings`);
console.log(`${'═'.repeat(50)}`);

if (violations > 0) {
    console.log('\n💥 FAIL — Fix all errors before committing.\n');
    process.exit(1);
} else if (warnings > 0) {
    console.log('\n⚠️  PASS with warnings — Review recommended.\n');
} else {
    console.log('\n✅ PASS — Font system is clean.\n');
}

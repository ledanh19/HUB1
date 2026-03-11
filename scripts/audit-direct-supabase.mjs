#!/usr/bin/env node

/**
 * Audit Script — Find UNWRAPPED direct supabase.from() / supabase.rpc() usage
 * 
 * Usage:
 *   node scripts/audit-direct-supabase.mjs        (soft warning)
 *   node scripts/audit-direct-supabase.mjs --ci    (hard gate: exit(1) on violations)
 * 
 * npm scripts:
 *   "audit:supabase":     soft warning
 *   "audit:supabase:ci":  hard gate for CI
 * 
 * Scans src/** for patterns that bypass safeQuery/safeMutation/safeRpc.
 * Excludes:
 *   - src/integrations/supabase/** (where wrappers live)
 *   - Lines already using safeQuery/safeMutation/safeRpc wrappers
 * 
 * @author Session Reliability V1.2
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const SRC_DIR = join(process.cwd(), 'src');
const CI_MODE = process.argv.includes('--ci');
const EXCLUDE_DIRS = [
    'src/integrations/supabase',
    'node_modules',
    '.git',
];

// No file-level exclusions — V1.2.1 purity: ALL files must use safe wrappers
const EXCLUDE_FILES = [];

const EXTENSIONS = ['.ts', '.tsx'];

// Patterns that indicate UNWRAPPED direct usage
// We look for supabase.from( or supabase.rpc( that are NOT preceded by safe wrappers
const SAFE_WRAPPERS = ['safeQuery', 'safeMutation', 'safeRpc'];

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(process.cwd(), fullPath).replace(/\\/g, '/');
        if (EXCLUDE_DIRS.some(ex => relPath.startsWith(ex))) continue;
        if (EXCLUDE_FILES.some(ef => relPath === ef)) continue;
        if (entry.isDirectory()) {
            files.push(...await walk(fullPath));
        } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Check if a line's supabase call is properly wrapped
 * A call is "wrapped" if the line (or nearby context) contains safeQuery/safeMutation/safeRpc
 */
function isWrapped(line, linesBefore) {
    const combinedContext = [...linesBefore.slice(-3), line].join(' ');
    return SAFE_WRAPPERS.some(w => combinedContext.includes(w));
}

async function main() {
    const mode = CI_MODE ? 'CI HARD GATE' : 'Soft Warning';
    console.log('╔══════════════════════════════════════════════════╗');
    console.log(`║   Supabase Direct Usage Audit (${mode.padEnd(14)})  ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    const files = await walk(SRC_DIR);
    const violations = [];

    for (const filePath of files) {
        const content = await readFile(filePath, 'utf-8');
        const relPath = relative(process.cwd(), filePath).replace(/\\/g, '/');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for supabase.from( or supabase.rpc(
            const hasFrom = line.includes('supabase.from(');
            const hasRpc = line.includes('supabase.rpc(');

            if (!hasFrom && !hasRpc) continue;

            // Check if this usage is inside a safe wrapper
            const contextLines = lines.slice(Math.max(0, i - 3), i);
            if (isWrapped(line, contextLines)) continue;

            // This is an unwrapped call — violation!
            const pattern = hasFrom ? 'supabase.from()' : 'supabase.rpc()';
            violations.push({
                file: relPath,
                line: i + 1,
                pattern,
                snippet: line.trim().substring(0, 100),
            });
        }
    }

    if (violations.length === 0) {
        console.log('✅ No unwrapped direct supabase usage found!\n');
        console.log('All supabase.from() / supabase.rpc() calls are properly wrapped');
        console.log('with safeQuery() / safeMutation() / safeRpc().\n');
        process.exit(0);
    }

    // Group by file
    const byFile = {};
    for (const v of violations) {
        if (!byFile[v.file]) byFile[v.file] = [];
        byFile[v.file].push(v);
    }

    const totalFiles = Object.keys(byFile).length;
    const totalCalls = violations.length;

    const icon = CI_MODE ? '❌' : '⚠️';
    console.log(`${icon}  Found ${totalCalls} UNWRAPPED direct supabase call(s) in ${totalFiles} file(s):\n`);

    for (const [file, items] of Object.entries(byFile)) {
        console.log(`  📄 ${file}`);
        for (const item of items) {
            console.log(`     L${item.line}: ${item.pattern} — ${item.snippet}`);
        }
    }

    console.log(`\n📊 Summary: ${totalCalls} unwrapped call(s) in ${totalFiles} file(s)`);
    console.log('💡 Wrap with safeQuery() / safeMutation() / safeRpc() from @/integrations/supabase\n');

    if (CI_MODE) {
        console.log('🚫 CI GATE FAILED — fix all violations before merging.\n');
        process.exit(1);
    }
}

main().catch(console.error);

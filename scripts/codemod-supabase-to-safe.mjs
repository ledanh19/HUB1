#!/usr/bin/env node

/**
 * CODEMOD: Wrap direct supabase.from() / supabase.rpc() calls with safe wrappers
 * 
 * This is a SEMI-AUTO codemod. It handles common patterns:
 * 1. Changes imports from '@/integrations/supabase/client' to '@/integrations/supabase'
 * 2. Adds safeQuery/safeMutation/safeRpc imports if not present
 * 3. Wraps supabase.from()...select() with safeQuery()
 * 4. Wraps supabase.from()...insert/update/delete/upsert with safeMutation()
 * 5. Wraps supabase.rpc() with safeRpc()
 * 
 * Run: node scripts/codemod-supabase-to-safe.mjs [--dry-run]
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';

const SRC_DIR = join(process.cwd(), 'src');
const DRY_RUN = process.argv.includes('--dry-run');
const EXTENSIONS = ['.ts', '.tsx'];
const EXCLUDE_DIRS = [
    'src/integrations/supabase',
    'src/auth',
    'node_modules',
    '.git',
];

// Track changes for report
const changes = [];

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(process.cwd(), fullPath).replace(/\\/g, '/');
        if (EXCLUDE_DIRS.some(ex => relPath.startsWith(ex))) continue;
        if (entry.isDirectory()) {
            files.push(...await walk(fullPath));
        } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Determine if a supabase.from() chain is a mutation or query
 * by looking at what follows the .from('table') call
 */
function isMutationChain(afterFrom) {
    // Look for .insert, .update, .delete, .upsert BEFORE any .select
    const mutOps = ['.insert(', '.update(', '.delete(', '.upsert('];
    const selectIdx = afterFrom.indexOf('.select(');

    for (const op of mutOps) {
        const idx = afterFrom.indexOf(op);
        if (idx !== -1 && (selectIdx === -1 || idx < selectIdx)) {
            return true;
        }
    }
    return false;
}

/**
 * Process a single file
 */
async function processFile(filePath) {
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, '/');
    let content = await readFile(filePath, 'utf-8');
    const originalContent = content;
    let fileChanges = { file: relPath, importChanged: false, wraps: 0, details: [] };

    // Skip if no supabase usage
    if (!content.includes('supabase.from(') && !content.includes('supabase.rpc(')) {
        return null;
    }

    // ── Step 1: Fix imports ──
    // Change: import { supabase } from "@/integrations/supabase/client"
    // To: import { supabase, safeQuery, safeMutation, safeRpc } from "@/integrations/supabase"
    const clientImportRegex = /import\s*\{([^}]*)\}\s*from\s*['"]@\/integrations\/supabase\/client['"]/g;
    if (clientImportRegex.test(content)) {
        content = content.replace(
            /import\s*\{([^}]*)\}\s*from\s*['"]@\/integrations\/supabase\/client['"]/g,
            (match, imports) => {
                const existingImports = imports.split(',').map(s => s.trim()).filter(Boolean);
                const needed = ['safeQuery', 'safeMutation', 'safeRpc'];
                const toAdd = needed.filter(n => !existingImports.includes(n));
                const allImports = [...existingImports, ...toAdd];
                return `import { ${allImports.join(', ')} } from "@/integrations/supabase"`;
            }
        );
        fileChanges.importChanged = true;
    }

    // Also handle: import { supabase } from "@/integrations/supabase/client";
    // with semicolons, single quotes, etc.

    // ── Step 2: Ensure safe wrapper imports exist ──
    // If file uses supabase but doesn't import from barrel yet, we need to add imports
    const hasBarrelImport = content.includes('from "@/integrations/supabase"') ||
        content.includes("from '@/integrations/supabase'");
    const hasDirectImport = content.includes('from "@/integrations/supabase/client"') ||
        content.includes("from '@/integrations/supabase/client'");

    if (!hasBarrelImport && !hasDirectImport && !fileChanges.importChanged) {
        // File imports supabase some other way (e.g., relative path)
        // Try to find any supabase import and add safe wrappers
        const supabaseImportMatch = content.match(/import\s*\{[^}]*supabase[^}]*\}\s*from\s*['"][^'"]+['"]/);
        if (supabaseImportMatch) {
            const oldImport = supabaseImportMatch[0];
            // Replace with barrel import
            content = content.replace(oldImport,
                `import { supabase, safeQuery, safeMutation, safeRpc } from "@/integrations/supabase"`
            );
            fileChanges.importChanged = true;
        }
    } else if (hasBarrelImport) {
        // Already imports from barrel, just ensure safe wrappers are included
        content = content.replace(
            /import\s*\{([^}]*)\}\s*from\s*['"]@\/integrations\/supabase['"]/g,
            (match, imports) => {
                const existingImports = imports.split(',').map(s => s.trim()).filter(Boolean);
                const needed = ['safeQuery', 'safeMutation', 'safeRpc'];
                const toAdd = needed.filter(n => !existingImports.includes(n));
                if (toAdd.length === 0) return match;
                const allImports = [...existingImports, ...toAdd];
                return `import { ${allImports.join(', ')} } from "@/integrations/supabase"`;
            }
        );
    }

    // ── Step 3: Wrap supabase.rpc() calls ──
    // Pattern: await supabase.rpc('name', args) or supabase.rpc('name', args) 
    content = content.replace(
        /(\bawait\s+)?(?<!safeRpc\(\(\)\s*=>\s*)(?<!safeQuery\(\(\)\s*=>\s*)supabase\.rpc\(/g,
        (match, awaitPrefix) => {
            fileChanges.wraps++;
            fileChanges.details.push('rpc → safeRpc');
            if (awaitPrefix) {
                return `await safeRpc(() => supabase.rpc(`;
            }
            return `safeRpc(() => supabase.rpc(`;
        }
    );

    // After wrapping rpc, we need to close the safeRpc wrapper
    // This is tricky with regex. For rpc calls, they typically end with a )
    // We'll handle this by looking for the pattern and adding closing paren
    // Actually, this approach is fragile. Let's use a different strategy.

    // Reset and use a line-by-line approach for better accuracy
    content = originalContent; // reset
    fileChanges.wraps = 0;
    fileChanges.details = [];

    // Split into lines and process
    const lines = content.split('\n');
    const newLines = [];
    let i = 0;

    // Track if we need to add barrel import
    let needsImportFix = false;
    let hasSupabaseFrom = false;
    let hasSupabaseRpc = false;

    // First pass: detect what's needed
    for (const line of lines) {
        if (line.includes('supabase.from(')) hasSupabaseFrom = true;
        if (line.includes('supabase.rpc(')) hasSupabaseRpc = true;
    }

    if (!hasSupabaseFrom && !hasSupabaseRpc) return null;

    // Process line by line
    for (i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Fix client import → barrel import
        if (line.match(/from\s*['"]@\/integrations\/supabase\/client['"]/)) {
            const wrappers = [];
            if (hasSupabaseFrom) wrappers.push('safeQuery', 'safeMutation');
            if (hasSupabaseRpc) wrappers.push('safeRpc');
            line = line.replace(
                /import\s*\{([^}]*)\}\s*from\s*['"]@\/integrations\/supabase\/client['"]/,
                (match, imports) => {
                    const existing = imports.split(',').map(s => s.trim()).filter(Boolean);
                    const toAdd = wrappers.filter(w => !existing.includes(w));
                    return `import { ${[...existing, ...toAdd].join(', ')} } from "@/integrations/supabase"`;
                }
            );
            fileChanges.importChanged = true;
            newLines.push(line);
            continue;
        }

        // Ensure barrel import has safe wrappers
        if (line.match(/from\s*['"]@\/integrations\/supabase['"]\s*;?\s*$/)) {
            const wrappers = [];
            if (hasSupabaseFrom) wrappers.push('safeQuery', 'safeMutation');
            if (hasSupabaseRpc) wrappers.push('safeRpc');
            line = line.replace(
                /import\s*\{([^}]*)\}\s*from\s*['"]@\/integrations\/supabase['"]/,
                (match, imports) => {
                    const existing = imports.split(',').map(s => s.trim()).filter(Boolean);
                    const toAdd = wrappers.filter(w => !existing.includes(w));
                    if (toAdd.length === 0) return match;
                    return `import { ${[...existing, ...toAdd].join(', ')} } from "@/integrations/supabase"`;
                }
            );
            newLines.push(line);
            continue;
        }

        // Skip lines that are already wrapped
        if (line.includes('safeQuery(') || line.includes('safeMutation(') || line.includes('safeRpc(')) {
            newLines.push(line);
            continue;
        }

        // Wrap supabase.rpc() — single line
        if (line.includes('supabase.rpc(') && !line.includes('safeRpc')) {
            // Get indentation
            const indent = line.match(/^(\s*)/)[1];
            // Check if line ends with ; or has continuation
            const trimmed = line.trim();

            if (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var ') ||
                trimmed.startsWith('return ') || trimmed.startsWith('await ')) {
                // Variable assignment or return statement
                line = line.replace(
                    /(\bawait\s+)?supabase\.rpc\(/,
                    (match, aw) => `${aw || ''}safeRpc(() => supabase.rpc(`
                );
                // Add closing paren before the semicolon or end
                if (line.trimEnd().endsWith(';')) {
                    line = line.replace(/;\s*$/, ');');
                } else if (line.trimEnd().endsWith(')')) {
                    line = line + ')';
                }
            } else {
                // Standalone / chained
                line = line.replace(
                    'supabase.rpc(',
                    'safeRpc(() => supabase.rpc('
                );
                if (line.trimEnd().endsWith(';')) {
                    line = line.replace(/;\s*$/, ');');
                }
            }
            fileChanges.wraps++;
            fileChanges.details.push('rpc → safeRpc');
        }

        // Wrap supabase.from() — detect if mutation or query
        if (line.includes('supabase.from(') && !line.includes('safeQuery') && !line.includes('safeMutation')) {
            // Look ahead to see if this is a mutation or query
            // Join remaining lines to find the full statement
            let fullStatement = line;
            let j = i + 1;
            let parenDepth = 0;
            // Count parens to find end of statement
            for (const ch of line) {
                if (ch === '(') parenDepth++;
                if (ch === ')') parenDepth--;
            }
            while (parenDepth > 0 && j < lines.length) {
                fullStatement += '\n' + lines[j];
                for (const ch of lines[j]) {
                    if (ch === '(') parenDepth++;
                    if (ch === ')') parenDepth--;
                }
                j++;
            }

            const isMutation = isMutationChain(fullStatement);
            const wrapper = isMutation ? 'safeMutation' : 'safeQuery';

            // Wrap the first line
            line = line.replace(
                /(\bawait\s+)?supabase\.from\(/,
                (match, aw) => `${aw || ''}${wrapper}(() => supabase.from(`
            );

            // Find where the statement ends and add closing paren
            if (j === i + 1) {
                // Single line statement
                if (line.trimEnd().endsWith(';')) {
                    line = line.replace(/;\s*$/, ');');
                } else if (line.trimEnd().endsWith(')')) {
                    line = line + ')';
                }
                fileChanges.wraps++;
                fileChanges.details.push(`from → ${wrapper}`);
            } else {
                // Multi-line statement: close the wrapper on the last line
                newLines.push(line);
                for (let k = i + 1; k < j - 1; k++) {
                    newLines.push(lines[k]);
                }
                // Last line of the statement
                let lastLine = lines[j - 1];
                if (lastLine.trimEnd().endsWith(';')) {
                    lastLine = lastLine.replace(/;\s*$/, ');');
                } else {
                    lastLine = lastLine + ')';
                }
                newLines.push(lastLine);
                i = j - 1; // skip processed lines
                fileChanges.wraps++;
                fileChanges.details.push(`from → ${wrapper} (multi-line)`);
                continue;
            }
        }

        newLines.push(line);
    }

    const newContent = newLines.join('\n');
    if (newContent === originalContent) return null;

    if (!DRY_RUN) {
        await writeFile(filePath, newContent, 'utf-8');
    }

    return fileChanges;
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log(`║   Supabase Codemod${DRY_RUN ? ' (DRY RUN)' : ''}                         ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    const files = await walk(SRC_DIR);
    const results = [];

    for (const filePath of files) {
        try {
            const result = await processFile(filePath);
            if (result) results.push(result);
        } catch (err) {
            console.error(`  ❌ Error processing ${relative(process.cwd(), filePath)}: ${err.message}`);
        }
    }

    if (results.length === 0) {
        console.log('✅ No files needed changes!\n');
        return;
    }

    let totalWraps = 0;
    let totalImports = 0;
    for (const r of results) {
        totalWraps += r.wraps;
        if (r.importChanged) totalImports++;
        console.log(`  📄 ${r.file}`);
        if (r.importChanged) console.log(`     └─ ✅ Import changed to barrel`);
        if (r.wraps > 0) console.log(`     └─ ✅ ${r.wraps} call(s) wrapped: ${r.details.join(', ')}`);
    }

    console.log(`\n📊 Summary: ${totalWraps} calls wrapped, ${totalImports} imports fixed across ${results.length} files`);
    if (DRY_RUN) console.log('⚠️  DRY RUN — no files were modified. Run without --dry-run to apply.');
}

main().catch(console.error);

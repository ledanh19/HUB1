/**
 * UI Governance — Grep Gate: Typography
 *
 * Counts text-[Npx], text-[Nrem], leading-[Npx] raw typography.
 * Exits 1 if count > 0.
 *
 * Usage: node scripts/ui-check-typography.js
 */
import { execSync } from "child_process";

const patterns = [
  "text-\\[\\d+(\\.\\d+)?(px|rem)\\]",
  "leading-\\[\\d+(\\.\\d+)?(px|rem)\\]",
];

let total = 0;
for (const pattern of patterns) {
  try {
    const result = execSync(
      `powershell -Command "(Select-String -Path (Get-ChildItem -Recurse -Include *.tsx,*.ts,*.jsx src) -Pattern '${pattern}' | Measure-Object).Count"`,
      { encoding: "utf-8" }
    ).trim();
    total += parseInt(result, 10) || 0;
  } catch { /* no matches = 0 */ }
}

console.log(`[ui:check:typography] Raw typography usages: ${total}`);
if (total > 0) {
  console.error(`❌ FAIL — ${total} raw typography usages found`);
  process.exit(1);
} else {
  console.log(`✅ PASS`);
}

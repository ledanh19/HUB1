/**
 * UI Governance — Grep Gate: Raw Tables
 *
 * Counts page files that use raw <table> instead of DataTable component.
 * Looks for <table in src/pages/**. Exits 1 if count > 0.
 *
 * Usage: node scripts/ui-check-tables.js
 */
import { execSync } from "child_process";

try {
  const result = execSync(
    `powershell -Command "(Select-String -Path (Get-ChildItem -Recurse -Include *.tsx src\\pages) -Pattern '<table' | Select-Object -ExpandProperty Filename -Unique | Measure-Object).Count"`,
    { encoding: "utf-8" }
  ).trim();
  const count = parseInt(result, 10) || 0;
  console.log(`[ui:check:tables] Pages with raw <table>: ${count}`);
  if (count > 0) {
    // Show which files
    const files = execSync(
      `powershell -Command "Select-String -Path (Get-ChildItem -Recurse -Include *.tsx src\\pages) -Pattern '<table' | Select-Object -ExpandProperty Filename -Unique"`,
      { encoding: "utf-8" }
    ).trim();
    console.error(`Files:\n${files}`);
    console.error(`❌ FAIL — ${count} pages still use raw <table>`);
    process.exit(1);
  } else {
    console.log(`✅ PASS`);
  }
} catch {
  console.log(`[ui:check:tables] 0 pages with raw <table>\n✅ PASS`);
}

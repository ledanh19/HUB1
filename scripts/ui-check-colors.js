/**
 * UI Governance — Grep Gate: Raw Palette Colors
 *
 * Counts raw Tailwind palette usages (bg|text|border)-(green|red|…)-N.
 * Exits 1 if count exceeds threshold.
 *
 * Usage: node scripts/ui-check-colors.js [--threshold 100]
 */
import { execSync } from "child_process";

const threshold = parseInt(process.argv.find((a) => a.startsWith("--threshold="))?.split("=")[1] ?? "100", 10);

const palettes = "green|red|amber|yellow|blue|gray|slate|zinc|neutral|stone|purple|orange|indigo|teal|pink|emerald|rose|sky|cyan|lime|fuchsia|violet";
const prefixes = ["bg", "text", "border", "from", "via", "to", "ring", "divide"];

let total = 0;
for (const prefix of prefixes) {
  const pattern = `${prefix}-(${palettes})-[0-9]`;
  try {
    const result = execSync(
      `powershell -Command "(Select-String -Path (Get-ChildItem -Recurse -Include *.tsx,*.ts,*.jsx src) -Pattern '${pattern}' | Measure-Object).Count"`,
      { encoding: "utf-8" }
    ).trim();
    total += parseInt(result, 10) || 0;
  } catch { /* no matches = 0 */ }
}

console.log(`[ui:check:colors] Raw palette usages: ${total} (threshold: ${threshold})`);
if (total > threshold) {
  console.error(`❌ FAIL — ${total} raw palette usages exceed threshold of ${threshold}`);
  process.exit(1);
} else {
  console.log(`✅ PASS`);
}

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

const SRC_DIR = 'src/pages';
const files = [];

function walkDir(dir) {
    readdirSync(dir).forEach(f => {
        let dirPath = join(dir, f);
        if (statSync(dirPath).isDirectory()) {
            walkDir(dirPath);
        } else if (f.endsWith('Page.tsx') && f !== 'AuthPage.tsx' && f !== 'AccessDeniedPage.tsx') {
            files.push(dirPath);
        }
    });
}
walkDir(SRC_DIR);

let fixed = 0;
files.forEach(file => {
    let content = readFileSync(file, 'utf8');
    const hasHeader = /import.*Header.*from.*layout/i.test(content) || /import.*PageHeader/i.test(content) || /<Header\s/i.test(content);
    if (!hasHeader) {
        const pageName = basename(file).replace('Page.tsx', '').replace(/([A-Z])/g, ' $1').trim();

        // Add import
        const importLine = `import { Header } from "@/components/layout/Header";\n`;
        const lastImportIdx = content.lastIndexOf('import ');
        if (lastImportIdx !== -1) {
            const endOfLastImport = content.indexOf('\n', lastImportIdx) + 1;
            content = content.slice(0, endOfLastImport) + importLine + content.slice(endOfLastImport);
        } else {
            content = importLine + '\n' + content;
        }

        // Wrap return with fragment and add Header if return (<Component>) 
        if (content.match(/return\s*\(\s*<((?!>)[a-zA-Z]+)[^>]*>/)) {
            if (content.match(/return\s*\(\s*<>\s*/)) {
                content = content.replace(/return\s*\(\s*<>\s*/, `return (\n    <>\n      <Header title="${pageName}" />\n      `);
            } else {
                content = content.replace(/return\s*\(\s*(<[a-zA-Z]+[^>]*>)/, `return (\n    <>\n      <Header title="${pageName}" />\n      $1`);
                let lastClosing = content.lastIndexOf(');');
                if (lastClosing > content.length - 200) {
                    content = content.substring(0, lastClosing) + '    </>\n  );' + content.substring(lastClosing + 2);
                }
            }
            writeFileSync(file, content, 'utf8');
            fixed++;
            console.log(`Fixed ${file}`);
        } else {
            console.log(`Skipped ${file} - complex return`);
        }
    }
});

console.log(`Total fixed: ${fixed}`);

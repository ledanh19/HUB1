import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagesDir = path.join(__dirname, '../src/pages');

// Patterns to look for
const META_TITLES = [
    'Thông tin xử lý',
    'Phụ trách',
    'Hoạt động gần nhất',
    'Thông tin khách',
    'Chi tiết đặt phòng',
    'Host Supply',
    'Thông tin thanh toán',
    'Chi tiết thanh toán',
    'Thông tin đối soát',
    'Chi tiết quyết toán',
    'Thông tin Host'
];

function scanDirectory(dir, results) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDirectory(fullPath, results);
        } else if (fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');

            let hasMeta = false;
            for (const title of META_TITLES) {
                if (content.includes(title)) {
                    hasMeta = true;
                    break;
                }
            }

            if (hasMeta || content.includes('BookingOwnerSection') || content.includes('ResponsibleOwnerBadge')) {
                results.push({
                    file: path.relative(pagesDir, fullPath),
                    content
                });
            }
        }
    }
}

const results = [];
scanDirectory(pagesDir, results);

console.log("=== META CARD CENSUS ===");
console.log("Page | Component | Type | Uses raw Card? | Uses SectionCard? | Custom spacing? | Label style | Badge density | Icon size");

results.forEach(({ file, content }) => {
    // Try to determine things heuristically
    const usesRawCard = /<Card[\s>]/g.test(content) ? 'Yes' : 'No';
    const usesSectionCard = /<SectionCard/g.test(content) ? 'Yes' : 'No';

    const customSpacing = /space-y-[^4]|gap-[^34]/g.test(content) ? 'Yes' : 'No';

    // label styles
    const textXsMatch = /text-xs[^"']*uppercase/g.test(content);
    const labelStyle = textXsMatch ? 'text-xs uppercase' : 'mixed';

    // Icon sizes
    const h4w4 = /h-4 w-4/g.test(content);
    const h5w5 = /h-5 w-5/g.test(content);
    const iconSize = h5w5 ? 'Mixed (h-5/h-4)' : h4w4 ? 'h-4 w-4' : 'Unknown';

    let type = 'Mixed';
    if (content.includes('Phụ trách')) type += ' (A)';
    if (content.includes('thanh toán')) type += ' (B)';
    if (content.includes('Chi tiết đặt phòng')) type += ' (C)';
    if (content.includes('Host')) type += ' (D)';

    console.log(`${file} | Inline | ${type} | ${usesRawCard} | ${usesSectionCard} | ${customSpacing} | ${labelStyle} | Mixed | ${iconSize}`);
});

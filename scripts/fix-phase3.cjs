const fs = require('fs');

// ═══ Phase 3 Fixes: Numeric Alignment ═══

// Fix 1: HostSettlementPage — text-kpi without tabular-nums
const hostSettlement = 'src/pages/HostSettlementPage.tsx';
if (fs.existsSync(hostSettlement)) {
    let c = fs.readFileSync(hostSettlement, 'utf8');
    // Add tabular-nums to standalone text-kpi that lacks it
    c = c.replace(/\btext-kpi\b(?!.*tabular-nums)/g, 'text-kpi tabular-nums');
    fs.writeFileSync(hostSettlement, c);
    console.log('✓ HostSettlementPage — text-kpi tabular-nums fixed');
}

// Fix 2: PaymentRequestsPage — text-kpi without tabular-nums
const payReq = 'src/pages/PaymentRequestsPage.tsx';
if (fs.existsSync(payReq)) {
    let c = fs.readFileSync(payReq, 'utf8');
    c = c.replace(/\btext-kpi\b(?!.*tabular-nums)/g, 'text-kpi tabular-nums');
    fs.writeFileSync(payReq, c);
    console.log('✓ PaymentRequestsPage — text-kpi tabular-nums fixed');
}

// Fix 3: HostPayablesAgingPage — currency cells missing text-right
// We'll check the specific lines
const hostAging = 'src/pages/HostPayablesAgingPage.tsx';
if (fs.existsSync(hostAging)) {
    let c = fs.readFileSync(hostAging, 'utf8');
    const lines = c.split('\n');
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        // If this line has TableCell and the NEXT line has formatCurrency
        if (lines[i].includes('TableCell') && !lines[i].includes('text-right') &&
            lines[i + 1] && lines[i + 1].includes('formatCurrency')) {
            // Add text-right to the TableCell
            if (lines[i].includes('className="')) {
                lines[i] = lines[i].replace('className="', 'className="text-right ');
                changed = true;
            } else if (lines[i].includes('className={')) {
                // skip complex classNames
            } else if (lines[i].includes('<TableCell>')) {
                lines[i] = lines[i].replace('<TableCell>', '<TableCell className="text-right">');
                changed = true;
            }
        }
    }

    if (changed) {
        fs.writeFileSync(hostAging, lines.join('\n'));
        console.log('✓ HostPayablesAgingPage — currency text-right fixed');
    }
}

// Fix 4: MappingsPage — currency cell missing text-right
const mappings = 'src/pages/MappingsPage.tsx';
if (fs.existsSync(mappings)) {
    let c = fs.readFileSync(mappings, 'utf8');
    const lines = c.split('\n');
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('TableCell') && !lines[i].includes('text-right') &&
            lines[i + 1] && lines[i + 1].includes('formatCurrency')) {
            if (lines[i].includes('<TableCell>')) {
                lines[i] = lines[i].replace('<TableCell>', '<TableCell className="text-right">');
                changed = true;
            }
        }
    }

    if (changed) {
        fs.writeFileSync(mappings, lines.join('\n'));
        console.log('✓ MappingsPage — currency text-right fixed');
    }
}

// Fix 5: ServicePayablesPage — currency cell missing text-right
const servicePay = 'src/pages/ServicePayablesPage.tsx';
if (fs.existsSync(servicePay)) {
    let c = fs.readFileSync(servicePay, 'utf8');
    const lines = c.split('\n');
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('TableCell') && !lines[i].includes('text-right') &&
            lines[i + 1] && lines[i + 1].includes('formatCurrency')) {
            if (lines[i].includes('<TableCell>')) {
                lines[i] = lines[i].replace('<TableCell>', '<TableCell className="text-right">');
                changed = true;
            }
        }
    }

    if (changed) {
        fs.writeFileSync(servicePay, lines.join('\n'));
        console.log('✓ ServicePayablesPage — currency text-right fixed');
    }
}

console.log('\nPhase 3 numeric fixes complete.');

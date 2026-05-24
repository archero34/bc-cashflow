/* eslint-disable */
/**
 * Generate dummy JSON for a per-project Cash Flow Suitelet mock.
 *
 *   --report=combined  →  emits window.__DUMMY_CF_COMBINED__
 *   --report=cost      →  emits window.__DUMMY_CF_COST__
 *   --report=revenue   →  emits window.__DUMMY_CF_REVENUE__
 *
 * Source-of-truth shapes are `_loadCombined` / `_loadCost` / `_loadRevenue`
 * in bc_cf_data_sl.js:
 *   {
 *     ok: true, mode: 'accrual',
 *     periods: ['Feb 2026', ..., 'Jan 2027'],
 *     categories: {
 *       revenue?: { lines: [{ id, label, source, amounts, total, createdDate }], total: [...], grandTotal },
 *       cost?:    { lines: [...],                                                       total: [...], grandTotal }
 *     },
 *     kpis: { ...report-specific... },
 *     range: { startPeriod: '2026-02', endPeriod: '2027-01' },
 *     availableBounds: { minPeriod, maxPeriod },
 *     projectTotals: { ...report-specific... },
 *     cumulativeBefore?: 0  // combined only
 *   }
 *
 * Demo project: 1807 'Data Airflow — Cash Flow Demo'
 *   $30,000 SO + $12,000 CO = $42,000 contract
 *   PO16240 Phoenix Mech $15,000 + PO16241 Metro Electric $8,000 + CO0023 $10,000 = $33,000 cost
 */

const REPORT = (process.argv.find(a => a.startsWith('--report=')) || '--report=combined').split('=')[1];

const PERIODS_YYYYMM = ['2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function periodLabel(yyyymm) {
    const [y, m] = yyyymm.split('-');
    return MONTHS_SHORT[Number(m) - 1] + ' ' + y;
}
const PERIODS = PERIODS_YYYYMM.map(periodLabel);

// Distribute `total` across 12 months by integer weight vector.
function distribute(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) return weights.map(() => 0);
    const raw = weights.map(w => (w / sum) * total);
    const rounded = raw.map(v => v === 0 ? 0 : Math.round(v / 50) * 50);
    const diff = total - rounded.reduce((a, b) => a + b, 0);
    if (diff) {
        for (let i = rounded.length - 1; i >= 0; i--) {
            if (rounded[i] !== 0) { rounded[i] += diff; break; }
        }
    }
    return rounded;
}

// ── Revenue lines (used by combined + revenue) ───────────────────────────────
// Sort order: createdDate DESC NULLS LAST (see _pivotDirection).
// CO0023 was created later than SO0631 → CO appears first.
const REV_LINES = [
    {
        id: 'CO: CO0023',
        label: 'CO: CO0023',
        source: { id: '88', type: 'cr' },
        weights: [0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0],
        total: 12000,
        createdDate: '2026-05-18'
    },
    {
        id: 'SO0631',
        label: 'SO0631',
        source: { id: '631', type: 'so' },
        weights: [0, 0, 3, 4, 5, 5, 4, 4, 3, 2, 0, 0],
        total: 30000,
        createdDate: '2026-03-26'
    }
];

// ── Cost lines (used by combined + cost) ─────────────────────────────────────
// createdDate DESC NULLS LAST → CR (CO0023) first, then newest PO, then older PO.
const COST_LINES = [
    {
        id: 'CO: CO0023',
        label: 'CO: CO0023',
        source: { id: '88', type: 'cr' },
        weights: [0, 0, 0, 0, 2, 3, 3, 2, 0, 0, 0, 0],
        total: 10000,
        createdDate: '2026-05-18'
    },
    {
        id: 'PO16241',
        label: 'PO16241',
        source: { id: '16241', type: 'po' },
        weights: [0, 0, 0, 2, 2, 2, 1, 1, 0, 0, 0, 0],
        total: 8000,
        createdDate: '2026-04-09'
    },
    {
        id: 'PO16240',
        label: 'PO16240',
        source: { id: '16240', type: 'po' },
        weights: [0, 1, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0],
        total: 15000,
        createdDate: '2026-04-02'
    }
];

// Materialize each line: amounts array + total.
function materialize(lines) {
    return lines.map(L => {
        const amounts = distribute(L.total, L.weights);
        return {
            id: L.id,
            label: L.label,
            source: L.source,
            amounts,
            total: amounts.reduce((a, b) => a + b, 0),
            createdDate: L.createdDate
        };
    });
}

// Build a category object: { lines, total[12], grandTotal }
function buildCategory(materializedLines) {
    const total = PERIODS.map((_, i) => materializedLines.reduce((s, L) => s + (L.amounts[i] || 0), 0));
    const grandTotal = total.reduce((a, b) => a + b, 0);
    return { lines: materializedLines, total, grandTotal };
}

const revMaterial = materialize(REV_LINES);
const costMaterial = materialize(COST_LINES);
const revenueCat = buildCategory(revMaterial);
const costCat    = buildCategory(costMaterial);

const range = { startPeriod: '2026-02', endPeriod: '2027-01' };
const availableBounds = { minPeriod: '2026-02', maxPeriod: '2027-01' };

let dummy;
let varName;

if (REPORT === 'combined') {
    const totalRevenue = revenueCat.grandTotal;
    const totalCost    = costCat.grandTotal;
    const netCashFlow  = totalRevenue - totalCost;
    const margin       = totalRevenue ? (netCashFlow / totalRevenue) * 100 : 0;
    dummy = {
        ok: true,
        mode: 'accrual',
        periods: PERIODS,
        categories: { revenue: revenueCat, cost: costCat },
        kpis: { totalRevenue, totalCost, netCashFlow, margin: Math.round(margin * 10) / 10 },
        range,
        availableBounds,
        projectTotals: { revenue: totalRevenue, cost: totalCost },
        cumulativeBefore: 0
    };
    varName = '__DUMMY_CF_COMBINED__';
} else if (REPORT === 'cost') {
    const totalCost = costCat.grandTotal;
    const peakMonth = Math.max.apply(null, costCat.total);
    // currentMonth — use peak as a stand-in since "today" outside the data window has 0.
    // The mock is showing landing state for May 2026; pick that as "current".
    const curIdx = PERIODS_YYYYMM.indexOf('2026-05');
    const currentMonth = curIdx !== -1 ? (costCat.total[curIdx] || 0) : 0;
    const remaining = PERIODS_YYYYMM.reduce((s, p, i) => p >= '2026-05' ? s + (costCat.total[i] || 0) : s, 0);
    dummy = {
        ok: true,
        mode: 'accrual',
        periods: PERIODS,
        categories: { cost: costCat },
        kpis: { totalCost, currentMonth, peakMonth, remaining },
        range,
        availableBounds,
        projectTotals: { cost: totalCost }
    };
    varName = '__DUMMY_CF_COST__';
} else if (REPORT === 'revenue') {
    const totalRevenue = revenueCat.grandTotal;
    const baseContract = revMaterial.filter(l => !l.id.startsWith('CO: ')).reduce((s, l) => s + l.total, 0);
    const changeOrders = revMaterial.filter(l =>  l.id.startsWith('CO: ')).reduce((s, l) => s + l.total, 0);
    const peakMonth    = Math.max.apply(null, revenueCat.total);
    dummy = {
        ok: true,
        mode: 'accrual',
        periods: PERIODS,
        categories: { revenue: revenueCat },
        kpis: { totalRevenue, baseContract, changeOrders, peakMonth },
        range,
        availableBounds,
        projectTotals: { revenue: totalRevenue, baseContract, changeOrders }
    };
    varName = '__DUMMY_CF_REVENUE__';
} else {
    throw new Error('Unknown --report: ' + REPORT);
}

process.stdout.write('window.' + varName + ' = ' + JSON.stringify(dummy, null, 2) + ';\n');

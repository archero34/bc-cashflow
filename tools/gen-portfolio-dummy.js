/* eslint-disable */
/**
 * Generate window.__DUMMY_PORTFOLIO_DATA__ object as a JSON string so it can
 * be inlined into the mock HTML.
 */

const PERIODS = ['Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026','Jan 2027'];

// Distribute `total` across 12 months using a normalized weight vector.
// Months with weight 0 → exactly 0.
function distribute(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) return weights.map(() => 0);
    // Distribute and round to nearest 50 to look realistic.
    const raw = weights.map(w => (w / sum) * total);
    const rounded = raw.map(v => v === 0 ? 0 : Math.round(v / 50) * 50);
    // Adjust last non-zero entry to make sum exactly total.
    const diff = total - rounded.reduce((a, b) => a + b, 0);
    if (diff) {
        for (let i = rounded.length - 1; i >= 0; i--) {
            if (rounded[i] !== 0) { rounded[i] += diff; break; }
        }
    }
    return rounded;
}

// Project definitions: name, customer, manager, sub, createdDate, in-window revenue total,
// cost ratio (cost/revenue), and a weight vector [w_feb26 ... w_jan27].
const PROJECTS = [
    { id: 1807, name: 'Data Airflow — Cash Flow Demo', cust: 197,  pm: 1752, sub: 1, created: '2026-03-26', rev: 42000,  costR: 0.785, w: [0, 2, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0] },
    { id: 2104, name: 'Brookfield Office Tower — Level 3 TI', cust: 1853, pm: 1752, sub: 1, created: '2025-12-10', rev: 90000, costR: 0.80, w: [3, 4, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0] },
    { id: 2156, name: 'Riverside Medical Plaza Shell & Core', cust: 1853, pm: 1752, sub: 1, created: '2025-10-02', rev: 195000, costR: 0.795, w: [2, 3, 4, 5, 5, 4, 3, 2, 0, 0, 0, 0] },
    { id: 2189, name: 'Metro Tech Campus — Phase 2 Electrical', cust: 1853, pm: 23, sub: 1, created: '2025-11-15', rev: 110000, costR: 0.78, w: [2, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0, 0] },
    { id: 2201, name: 'Willow Creek Estates Phase 1 Framing', cust: 4421, pm: 23, sub: 1, created: '2025-09-20', rev: 175000, costR: 0.80, w: [4, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0] },
    { id: 2233, name: 'Capital One HQ TI', cust: 2857, pm: 1544, sub: 1, created: '2026-01-08', rev: 285000, costR: 0.79, w: [2, 3, 4, 5, 5, 5, 4, 3, 2, 1, 0, 0] },
    { id: 2247, name: 'AAM Manufacturing Plant', cust: 5102, pm: 1752, sub: 3, created: '2025-08-14', rev: 175000, costR: 0.805, w: [3, 4, 4, 3, 3, 2, 1, 0, 0, 0, 0, 0] },
    { id: 2268, name: 'The VUE at Elk Grove Village', cust: 6203, pm: 1302, sub: 1, created: '2025-11-30', rev: 145000, costR: 0.795, w: [2, 3, 3, 3, 3, 2, 1, 1, 0, 0, 0, 0] },
    { id: 2284, name: 'Heartland Industrial Maintenance 2026', cust: 7011, pm: 18, sub: 1, created: '2026-01-02', rev: 75000, costR: 0.80, w: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    { id: 2295, name: 'Consolidated Power — River Bend Substation', cust: 7588, pm: 18, sub: 1, created: '2025-10-18', rev: 245000, costR: 0.795, w: [3, 4, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0] },
    { id: 2307, name: 'Sachse — Taylor HS Athletics', cust: 8120, pm: 1752, sub: 3, created: '2025-12-05', rev: 120000, costR: 0.795, w: [0, 2, 3, 4, 4, 3, 2, 1, 0, 0, 0, 0] },
    { id: 2319, name: 'Estrella Medical Pavilion AV', cust: 8475, pm: 27, sub: 1, created: '2026-02-12', rev: 55000, costR: 0.82, w: [1, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0] },
    { id: 2331, name: 'Walmart Supercenter Remodel — Charlotte NC', cust: 8902, pm: 1752, sub: 1, created: '2025-11-22', rev: 200000, costR: 0.80, w: [3, 4, 4, 4, 3, 2, 1, 0, 0, 0, 0, 0] },
    { id: 2344, name: 'Phoenix Datacenter — Hyperscaler Build', cust: 197,  pm: 1752, sub: 1, created: '2025-06-04', rev: 280000, costR: 0.805, w: [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1] },
    { id: 1505, name: 'Municipal Utility Extension', cust: 3266, pm: 1752, sub: 3, created: '2025-09-12', rev: 553000, costR: 0.78, w: [0, 0, 2, 4, 5, 6, 6, 5, 4, 3, 1, 0] }
];

// Generate per-project revenue/cost/net arrays.
const projects = PROJECTS.map(p => {
    const revenue = distribute(p.rev, p.w);
    const cost = revenue.map(v => Math.round(v * p.costR / 50) * 50);
    const net = revenue.map((r, i) => r - cost[i]);
    return {
        id: p.id,
        name: p.name,
        createdDate: p.created,
        revenue,
        cost,
        net,
        revenueTotal: revenue.reduce((a, b) => a + b, 0),
        costTotal: cost.reduce((a, b) => a + b, 0),
        netTotal: net.reduce((a, b) => a + b, 0),
        recordUrl: '#mock-project-' + p.id
    };
});

// Aggregate per-period portfolio totals across ALL projects (unfiltered context).
const periodCount = PERIODS.length;
const allRevenuePerPeriod = Array(periodCount).fill(0);
const allCostPerPeriod    = Array(periodCount).fill(0);
const allNetPerPeriod     = Array(periodCount).fill(0);
projects.forEach(pr => {
    for (let i = 0; i < periodCount; i++) {
        allRevenuePerPeriod[i] += pr.revenue[i];
        allCostPerPeriod[i]    += pr.cost[i];
        allNetPerPeriod[i]     += pr.net[i];
    }
});

const allTotalRevenue = allRevenuePerPeriod.reduce((a, b) => a + b, 0);
const allTotalCost    = allCostPerPeriod.reduce((a, b) => a + b, 0);
const allNetCashFlow  = allTotalRevenue - allTotalCost;
const allMargin       = (allNetCashFlow / allTotalRevenue) * 100;

// Filtered subset — customer 3266 (State DOT). Matches the FILTERS.customers=[3266] in the mock.
const FILTER_CUST = 3266;
const filteredProjects = projects.filter((p, i) => PROJECTS[i].cust === FILTER_CUST);

const fRevenuePerPeriod = Array(periodCount).fill(0);
const fCostPerPeriod    = Array(periodCount).fill(0);
const fNetPerPeriod     = Array(periodCount).fill(0);
filteredProjects.forEach(pr => {
    for (let i = 0; i < periodCount; i++) {
        fRevenuePerPeriod[i] += pr.revenue[i];
        fCostPerPeriod[i]    += pr.cost[i];
        fNetPerPeriod[i]     += pr.net[i];
    }
});

const fTotalRevenue = fRevenuePerPeriod.reduce((a, b) => a + b, 0);
const fTotalCost    = fCostPerPeriod.reduce((a, b) => a + b, 0);
const fNetCashFlow  = fTotalRevenue - fTotalCost;
const fMargin       = fTotalRevenue ? (fNetCashFlow / fTotalRevenue) * 100 : 0;

// ── Variant selection ───────────────────────────────────────────────────────
// --variant=all   → unfiltered view: all 15 projects, no chips, KPIs == portfolioTotals
// --variant=filtered (default) → original filtered (customer 3266) view
const variantArg = (process.argv.find(a => a.startsWith('--variant=')) || '--variant=filtered').split('=')[1];
const isAll = variantArg === 'all';

const dummy = {
    ok: true,
    periods: PERIODS,
    // Variant controls projects + per-period arrays.
    projects: isAll ? projects : filteredProjects,
    kpis: isAll
        ? {
            totalRevenue: allTotalRevenue,
            totalCost: allTotalCost,
            netCashFlow: allNetCashFlow,
            margin: Math.round(allMargin * 10) / 10
        }
        : {
            totalRevenue: fTotalRevenue,
            totalCost: fTotalCost,
            netCashFlow: fNetCashFlow,
            margin: Math.round(fMargin * 10) / 10
        },
    range: { startPeriod: '2026-02', endPeriod: '2027-01' },
    availableBounds: { minPeriod: '2025-06', maxPeriod: '2028-12' },
    // Portfolio totals = unfiltered all-15-projects sums → subline context.
    portfolioTotals: {
        revenue: allTotalRevenue,
        cost: allTotalCost,
        net: allNetCashFlow,
        margin: Math.round(allMargin * 10) / 10
    },
    // Per-period arrays follow the active view.
    portfolioRevenuePerPeriod: isAll ? allRevenuePerPeriod : fRevenuePerPeriod,
    portfolioCostPerPeriod:    isAll ? allCostPerPeriod    : fCostPerPeriod,
    portfolioNetPerPeriod:     isAll ? allNetPerPeriod     : fNetPerPeriod,
    cumulativeBefore: 0,
    // Available* stays at the full lists so the filter dropdowns still show all options.
    availableProjects: projects.map(p => ({ id: p.id, name: p.name })),
    availableManagers: [
        { id: 1752, name: 'Sarah Chen' },
        { id: 23,   name: 'Mike Donovan' },
        { id: 1302, name: 'Lisa Park' },
        { id: 1544, name: 'Tom Reyes' },
        { id: 27,   name: 'Diego Martinez' },
        { id: 18,   name: 'Jennifer Liu' }
    ],
    availableCustomers: [
        { id: 197,  name: 'Bolder Construction Inc.' },
        { id: 1853, name: 'Brookfield Realty' },
        { id: 3266, name: 'State DOT' },
        { id: 2857, name: 'Capital One HQ Project Office' },
        { id: 4421, name: 'Willow Creek HOA' },
        { id: 5102, name: 'AAM Industries' },
        { id: 6203, name: 'VUE Development Partners' },
        { id: 7011, name: 'Heartland Foods Co.' },
        { id: 7588, name: 'Consolidated Power' },
        { id: 8120, name: 'Sachse Construction' },
        { id: 8475, name: 'Estrella Health Network' },
        { id: 8902, name: 'Walmart Realty' },
        { id: 9101, name: 'Phoenix Hyperscale LLC' },
        { id: 9214, name: 'City of Aurora' },
        { id: 9302, name: 'Greystar Development' }
    ],
    availableSubsidiaries: [
        { id: 1, name: 'BlueCollar Main' },
        { id: 3, name: 'BlueCollar Civil' },
        { id: 4, name: 'BlueCollar Industrial' }
    ]
};

process.stdout.write('window.__DUMMY_PORTFOLIO_DATA__ = ' + JSON.stringify(dummy, null, 2) + ';\n');

/* eslint-disable */
/**
 * Assemble docs/user-guide/mocks/{combined|cost|revenue}.html — self-contained
 * mocks that use the real CSS + real CLIENT_SCRIPT from the per-project Cash
 * Flow Suitelets, with the data fetch stubbed by dummy JSON for Project 1807.
 *
 * Mirror of tools/build-portfolio-mock.js.
 *
 *   node tools/build-cf-project-mock.js --report=combined
 *   node tools/build-cf-project-mock.js --report=cost
 *   node tools/build-cf-project-mock.js --report=revenue
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const REPORT = (process.argv.find(a => a.startsWith('--report=')) || '--report=combined').split('=')[1];

const REPORT_CONFIG = {
    combined: {
        slFile: 'bc_cf_combined_sl.js',
        title: 'Combined Cash Flow — Mock',
        h1: 'Combined Cash Flow',
        kpiLabels: ['Total Revenue', 'Total Cost', 'Net Cash Flow', 'Margin'],
        chartTitle: 'Monthly Cash Flow',
        dummyVar: '__DUMMY_CF_COMBINED__',
        outFile: 'combined.html',
        // Sub-row count for table skeleton — large enough to look real (3 rev + 3 cost groups + totals)
        tableRows: 8
    },
    cost: {
        slFile: 'bc_cf_cost_report_sl.js',
        title: 'Cost Outflows — Mock',
        h1: 'Cost Outflows',
        kpiLabels: ['Total Cost', 'Current Month', 'Peak Month', 'Remaining'],
        chartTitle: 'Monthly Cost Outflow',
        dummyVar: '__DUMMY_CF_COST__',
        outFile: 'cost.html',
        tableRows: 6
    },
    revenue: {
        slFile: 'bc_cf_rev_report_sl.js',
        title: 'Revenue Inflows — Mock',
        h1: 'Revenue Inflows',
        kpiLabels: ['Total Revenue', 'Base Contract', 'Change Orders', 'Peak Month'],
        chartTitle: 'Monthly Revenue Inflow',
        dummyVar: '__DUMMY_CF_REVENUE__',
        outFile: 'revenue.html',
        tableRows: 5
    }
};

const CFG = REPORT_CONFIG[REPORT];
if (!CFG) throw new Error('Unknown --report: ' + REPORT);

const OUT = path.join(ROOT, 'docs', 'user-guide', 'mocks', CFG.outFile);

// ── Extract CSS via the styles helper ────────────────────────────────────────
function getStyles() {
    let mod;
    global.define = function (_deps, factory) { mod = factory(); };
    require(path.join(ROOT, 'FileCabinet', 'SuiteScripts', 'BlueCollar', 'CashFlow', 'modules', 'bc_cf_styles.js'));
    delete global.define;
    return mod.getStyles();
}

// ── Extract CLIENT_SCRIPT verbatim ───────────────────────────────────────────
function getClientScript() {
    const SL = path.join(ROOT, 'FileCabinet', 'SuiteScripts', 'BlueCollar', 'CashFlow', 'entry_points', CFG.slFile);
    const src = fs.readFileSync(SL, 'utf8');
    const startMarker = 'const CLIENT_SCRIPT = `';
    const startIdx = src.indexOf(startMarker);
    if (startIdx === -1) throw new Error('CLIENT_SCRIPT start marker not found in ' + CFG.slFile);
    const bodyStart = startIdx + startMarker.length;
    const endIdx = src.indexOf('\n`;', bodyStart);
    if (endIdx === -1) throw new Error('CLIENT_SCRIPT end marker not found in ' + CFG.slFile);
    const raw = src.slice(bodyStart, endIdx + 1);
    // Template literal collapses '\\X' → '\X' (e.g. \\u2212 source → − → minus sign).
    return raw.replace(/\\\\/g, '\\');
}

// ── Get dummy data ───────────────────────────────────────────────────────────
function getDummyData() {
    return execSync(
        'node ' + JSON.stringify(path.join(__dirname, 'gen-cf-project-dummy.js')) + ' --report=' + REPORT,
        { encoding: 'utf8' }
    );
}

// ── Server-rendered shell (hand-replicated from buildHeader/buildPicker/etc.) ─

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Hard-coded params for the mock landing state.
const MODE = 'accrual';
const RANGE = { startPeriod: '2026-02', endPeriod: '2027-01' };

const modeLabel = MODE === 'accrual' ? 'Accrual' : 'Cash';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function periodLabelShort(yyyymm) {
    const [y, m] = yyyymm.split('-');
    return MONTHS[Number(m) - 1] + ' ' + y;
}
const pickerLabel = `${periodLabelShort(RANGE.startPeriod)} – ${periodLabelShort(RANGE.endPeriod)}`;

// Active preset = 12 months.
function pickerChip(n) {
    const cls = n === 12 ? ' class="active"' : '';
    return `<button type="button" data-preset="${n}"${cls}>${n} months</button>`;
}

const pickerHtml = `
            <div class="bccf-daterange" id="bccf-daterange"
                 data-start="${esc(RANGE.startPeriod)}"
                 data-end="${esc(RANGE.endPeriod)}">
                <button type="button" class="bccf-daterange-trigger" data-action="open-daterange">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span class="bccf-daterange-label">${esc(pickerLabel)}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="bccf-daterange-panel" style="display:none">
                    <h4>Quick ranges</h4>
                    <div class="bccf-daterange-presets">${pickerChip(8)}${pickerChip(12)}${pickerChip(18)}${pickerChip(24)}</div>
                    <h4>Custom range</h4>
                    <div class="bccf-daterange-custom">
                        <div>
                            <label>From</label>
                            <input type="month" data-input="from" value="${esc(RANGE.startPeriod)}" />
                        </div>
                        <div>
                            <label>To</label>
                            <input type="month" data-input="to" value="${esc(RANGE.endPeriod)}" />
                        </div>
                    </div>
                    <div class="bccf-daterange-actions">
                        <span class="bccf-daterange-hint">Limit: 24 months</span>
                        <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-daterange">Apply</button>
                    </div>
                </div>
            </div>`;

const toggleHtml = `<div class="bccf-toggle" data-toggle-id="mode">`
    + `<button type="button" data-value="cash"${MODE === 'cash' ? ' class="active"' : ''}>Cash</button>`
    + `<button type="button" data-value="accrual"${MODE === 'accrual' ? ' class="active"' : ''}>Accrual</button>`
    + `</div>`;

const headerLeft = `
            <div style="display:flex;align-items:center;gap:10px">
                <h1 style="margin:0;font-size:var(--bccf-text-xl);font-weight:700;color:var(--bccf-ink-900)">
                    ${esc(CFG.h1)}
                </h1>
                <span class="bccf-badge brand bccf-title-pill">${esc(modeLabel)} basis</span>
            </div>`;

const headerRight = `
            <div style="display:flex;align-items:center;gap:8px">
                ${pickerHtml}
                ${toggleHtml}
                <button type="button" class="bccf-btn" data-action="refresh" title="Refresh">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>`;

const headerHtml = `<div class="bccf-panel"><div class="bccf-panel-header">${headerLeft}${headerRight}</div></div>`;

// Skeleton regions.
function skeletonKpis() {
    let cards = '';
    CFG.kpiLabels.forEach(label => {
        cards += `<div class="bccf-kpi">
                <div class="bccf-k">${esc(label)}</div>
                <div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>
                <div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>
            </div>`;
    });
    return `<div id="bccf-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">${cards}</div>`;
}

function skeletonChart() {
    const heights = [40, 70, 100, 90, 60, 30];
    let bars = '';
    for (let i = 0; i < 6; i++) {
        bars += `<div class="bccf-skel bar-skel" style="flex:1;height:${heights[i]}px;margin:0 3px;border-radius:3px 3px 0 0"></div>`;
    }
    return `<div id="bccf-chart"><div class="bccf-panel"><div class="bccf-panel-header"><span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">${esc(CFG.chartTitle)}</span></div><div class="bccf-panel-body"><div style="display:flex;align-items:flex-end;height:120px;padding:14px 18px">${bars}</div></div></div></div>`;
}

function skeletonTable() {
    // thead: Source + 6 period cols + Total = 8 cols
    const headerRow = '<tr><th>Source</th>' + Array(6).fill('<th></th>').join('') + '<th>Total</th></tr>';
    const widths = [80, 60, 70, 65, 75, 55, 90];
    let rows = '';
    for (let r = 0; r < CFG.tableRows; r++) {
        rows += '<tr>';
        for (let c = 0; c < 8; c++) {
            const w = widths[(r + c) % widths.length];
            rows += `<td><span class="bccf-skel" style="display:inline-block;width:${w}px;height:12px"></span></td>`;
        }
        rows += '</tr>';
    }
    return `<div id="bccf-table"><div class="bccf-panel"><div class="bccf-panel-body" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:var(--bccf-text-sm)"><thead>${headerRow}</thead><tbody>${rows}</tbody></table></div></div></div>`;
}

// ── Assemble ─────────────────────────────────────────────────────────────────

const styles = getStyles();
const clientScript = getClientScript();
const dummyDataJs = getDummyData();

const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(CFG.title)}</title>
    ${styles}
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { padding: 16px; background: var(--bccf-bg-50); }
        .bccf-layout { display: flex; flex-direction: column; gap: 16px; }
        table tbody tr:hover { background: var(--bccf-bg-50); }
        .bccf-kpi.accent .bccf-v { color: inherit; }
    </style>
</head>
<body data-data-url="mock://${REPORT}">
    <div id="bccf-toast-host"></div>
    <div class="bccf-layout">
        ${headerHtml}
        ${skeletonKpis()}
        ${skeletonChart()}
        ${skeletonTable()}
    </div>
<script>
${dummyDataJs}
</script>
<script>
// Stub fetch BEFORE the client IIFE runs so loadData() resolves with dummy data.
window.fetch = function (url) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve(window.${CFG.dummyVar}); }
    });
};
</script>
<script>${clientScript}</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('Wrote ' + OUT + ' (' + html.length + ' bytes, ' + html.split('\n').length + ' lines)');

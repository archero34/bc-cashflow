/* eslint-disable */
/**
 * Assemble docs/user-guide/mocks/po-schedule.html — a self-contained mock of
 * the BC Cash Flow Purchase Order Schedule editor for the end-user guide.
 *
 * Renders the editor inside a clean container with a small "Purchase Order
 * PO16241 — Schedule" header. Supports 4 visual states selected via the
 * `?state=` URL query param:
 *   - empty       (default) fresh state: toolbar + empty grid
 *   - configured  toolbar populated, preview region populated, grid empty
 *   - generated   8 monthly S-curve rows, ✓ Balanced badge
 *   - dirty       row 3 manually bumped → 104% allocated, Rebalance visible
 *
 * Approach mirrors tools/build-portfolio-mock.js: extract real CSS from the
 * deployed modules, hand-replicate the HTML shell to match what
 * bc_timing_ui.js's template literals output, and render different DOM state
 * per query-param state.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'docs', 'user-guide', 'mocks', 'po-schedule.html');

// ── Extract real CSS (shared + schedule-editor additions) ────────────────────

function getBaseStylesFromTimingUi() {
    const depMap = {};

    global.define = function (_deps, factory) { depMap['_constants'] = factory(); };
    require(path.join(ROOT, 'FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_constants.js'));

    global.define = function (_deps, factory) { depMap['_styles'] = factory(); };
    require(path.join(ROOT, 'FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js'));

    global.define = function (_deps, factory) { depMap['_ui'] = factory(); };
    require(path.join(ROOT, 'FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js'));

    let timingMod;
    global.define = function (deps, factory) {
        const map = {
            './bc_timing_constants': depMap['_constants'],
            './bc_cf_styles':        depMap['_styles'],
            './bc_cf_ui':            depMap['_ui'],
        };
        const resolved = deps.map(d => map[d]);
        timingMod = factory.apply(null, resolved);
    };
    require(path.join(ROOT, 'FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js'));

    delete global.define;
    return timingMod.getBaseStyles();
}

// ── Dummy PO + S-curve schedule data ─────────────────────────────────────────

const PO = {
    docNumber: 'PO16241',
    vendor:    'Phoenix Mechanical Supply',
    project:   'PROJ0142 Lockhart Substation Retrofit',
    amount:    15000.00,
};

// S-curve weights (approx) → 8 monthly rows totalling 100% / $15,000
const SCURVE_PCTS = [4, 9, 16, 21, 21, 16, 9, 4];

// Apr 2026 → Nov 2026 (last day of month per typical month-end stamping)
const MONTH_LABELS = [
    { date: '2026-04-30', display: 'Apr 30, 2026', label: 'April 2026'    },
    { date: '2026-05-31', display: 'May 31, 2026', label: 'May 2026'      },
    { date: '2026-06-30', display: 'Jun 30, 2026', label: 'June 2026'     },
    { date: '2026-07-31', display: 'Jul 31, 2026', label: 'July 2026'     },
    { date: '2026-08-31', display: 'Aug 31, 2026', label: 'August 2026'   },
    { date: '2026-09-30', display: 'Sep 30, 2026', label: 'September 2026' },
    { date: '2026-10-31', display: 'Oct 31, 2026', label: 'October 2026'  },
    { date: '2026-11-30', display: 'Nov 30, 2026', label: 'November 2026' },
];

function buildRows(scenario) {
    // scenario: 'generated' or 'dirty'
    let cumPct = 0;
    let cumAmt = 0;
    return MONTH_LABELS.map((m, idx) => {
        let pct = SCURVE_PCTS[idx];
        let amt = (PO.amount * pct) / 100;
        // Dirty: row 3 (idx=2) bumped from $2,400 → $3,000
        if (scenario === 'dirty' && idx === 2) {
            amt = 3000;
            pct = (amt / PO.amount) * 100; // 20%
        }
        cumPct += pct;
        cumAmt += amt;
        return {
            idx,
            rowNum: idx + 1,
            date:    m.date,
            display: m.display,
            label:   m.label,
            pct,
            amt,
            cumPct,
            cumAmt,
        };
    });
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtCurrency(n) {
    const v = Number(n) || 0;
    return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtPercent(n) {
    return (Number(n) || 0).toFixed(1) + '%';
}
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Inline SVG icons (from bc_timing_ui.js) ──────────────────────────────────

const ICONS = {
    cashFlow: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    chart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
};

// ── Toolbar HTML — mirrors renderCalculatorToolbar() ─────────────────────────

function buildToolbar(state) {
    const isEmpty       = state === 'empty';
    const isConfigured  = state === 'configured';
    const isGenerated   = state === 'generated' || state === 'dirty';

    // Defaults vs configured/generated state
    const periodsVal = isEmpty ? 6 : 8;
    const startVal   = isEmpty ? '2026-05-24' : '2026-04-01';
    const endVal     = isEmpty ? '' : '2026-11-30';
    const distVal    = 's_curve';

    const distOpt = (val, label) => `<option value="${val}"${distVal === val ? ' selected' : ''}>${label}</option>`;

    // Highlight Generate when configured (pre-fire highlight)
    const genHighlightCss = isConfigured ? ' style="box-shadow: 0 0 0 3px var(--bccf-brand-50), 0 4px 12px rgba(60,107,158,0.35); transform: translateY(-1px);"' : '';

    return `
<div class="bccf-toolbar" id="po_sched_calc_toolbar">
    <div class="bccf-field">
        <label for="po_sched_calc_dist">Distribution</label>
        <select id="po_sched_calc_dist">
            ${distOpt('s_curve', 'S-curve')}
            ${distOpt('linear', 'Linear')}
            ${distOpt('front_loaded', 'Front-loaded')}
            ${distOpt('back_loaded', 'Back-loaded')}
        </select>
    </div>
    <div class="bccf-field">
        <label for="po_sched_calc_periods">Periods</label>
        <input type="number" id="po_sched_calc_periods" value="${periodsVal}" min="1" max="36">
    </div>
    <div class="bccf-field">
        <label for="po_sched_calc_interval">Interval</label>
        <select id="po_sched_calc_interval">
            <option value="monthly" selected>Monthly</option>
            <option value="bi_weekly">Bi-weekly</option>
            <option value="weekly">Weekly</option>
        </select>
    </div>
    <div class="bccf-field">
        <label for="po_sched_calc_start">${ICONS.calendar} Start date</label>
        <input type="date" id="po_sched_calc_start" value="${startVal}">
    </div>
    <div class="bccf-field">
        <label for="po_sched_calc_end">End date</label>
        <input type="date" id="po_sched_calc_end" readonly tabindex="-1" value="${endVal}">
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:2px;">
        <button type="button" class="bccf-btn bccf-btn-pri" id="po_sched_calc_generate"${genHighlightCss}>
            Generate
        </button>
        <button type="button" class="bccf-btn" id="po_sched_calc_clear">
            Clear all
        </button>
    </div>
</div>`;
}

// ── Calculator preview region (visible only in "configured" state) ───────────

function buildPreview(state) {
    if (state !== 'configured') {
        return `<div class="bccf-calc-preview" id="po_sched_calc_preview"></div>`;
    }

    // Pre-compute preview rows (same shape as Generate would produce)
    const rows = buildRows('generated');
    const maxPct = Math.max(...rows.map(r => r.pct));

    const bars = rows.map(r => {
        const h = Math.max(2, Math.round((r.pct / maxPct) * 40));
        const shortLabel = r.label.split(' ')[0].slice(0, 3); // "Apr"
        return `<div class="bar-wrap">
            <div class="bar" style="height:${h}px"></div>
            <div class="bar-lbl">${esc(shortLabel)}</div>
        </div>`;
    }).join('');

    let cumPct = 0;
    let cumAmt = 0;
    const previewRows = rows.map(r => {
        cumPct += r.pct;
        cumAmt += r.amt;
        return `<tr>
            <td>${esc(r.display)}</td>
            <td>${esc(r.label)}</td>
            <td class="right">${esc(fmtPercent(r.pct))}</td>
            <td class="right">${esc(fmtCurrency(r.amt))}</td>
            <td class="right">${esc(fmtPercent(cumPct))}</td>
            <td class="right">${esc(fmtCurrency(cumAmt))}</td>
        </tr>`;
    }).join('');

    return `
<div class="bccf-calc-preview visible" id="po_sched_calc_preview">
    <div class="bccf-calc-preview-meta">
        Preview: S-curve · 8 periods · Monthly · Apr 30, 2026 – Nov 30, 2026 · ${esc(fmtCurrency(PO.amount))}
    </div>
    <div class="bccf-calc-preview-bars">${bars}</div>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Label</th>
                <th class="right">%</th>
                <th class="right">Amount</th>
                <th class="right">Total %</th>
                <th class="right">Total Amt</th>
            </tr>
        </thead>
        <tbody>${previewRows}</tbody>
    </table>
    <div class="more-rows"></div>
</div>`;
}

// ── Grid HTML — mirrors renderTimingGrid() ───────────────────────────────────

function buildGrid(state) {
    const editable = true;
    const showCostCode = false; // POs typically don't show cost code in our flow

    // Empty / configured share the empty-grid shell (toolbar drives a re-render
    // post-Generate; before Generate the grid is empty placeholder).
    if (state === 'empty' || state === 'configured') {
        // Mimic an empty editable table: header + empty tbody + helpful placeholder row
        const headerRow = '<tr>'
            + '<th class="center" style="width:40px;">#</th>'
            + '<th>Period Date</th>'
            + '<th>Label</th>'
            + '<th class="right">Percentage</th>'
            + '<th class="right">Amount</th>'
            + '<th class="right">Total %</th>'
            + '<th class="right">Total Amount</th>'
            + '<th class="center" style="width:50px;"></th>'
            + '</tr>';
        const placeholderRow = `<tr><td colspan="8" style="padding:32px 16px;text-align:center;color:var(--bccf-ink-500);font-size:var(--bccf-text-sm);">
            <div style="font-weight:600;color:var(--bccf-ink-700);margin-bottom:4px;">No schedule lines yet</div>
            <div>Configure the calculator above and click <strong>Generate</strong>, or use <strong>Add Line</strong> below.</div>
        </td></tr>`;
        const totalRow = '<tr>'
            + '<td colspan="1"></td>'
            + '<td colspan="2" style="text-align:right;">Total</td>'
            + '<td class="right">0.0%</td>'
            + `<td class="right">${esc(fmtCurrency(0))}</td>`
            + '<td colspan="3" class="right">'
            + `<span class="bccf-badge warn">&#9888; 0.0% allocated</span>`
            + '</td>'
            + '</tr>';

        return `
<div class="bccf-grid-wrapper">
    <table class="bccf-grid" id="po_sched_grid">
        <thead>${headerRow}</thead>
        <tbody id="po_sched_tbody">${placeholderRow}</tbody>
        <tfoot>${totalRow}</tfoot>
    </table>
</div>
<button type="button" class="bccf-add-row-btn">
    ${ICONS.plus} Add Line
</button>`;
    }

    // Generated / Dirty: populate rows
    const rows = buildRows(state);
    const totalPct = rows.reduce((s, r) => s + r.pct, 0);
    const totalAmt = rows.reduce((s, r) => s + r.amt, 0);
    const isBalanced = Math.abs(totalPct - 100) < 0.01 && Math.abs(totalAmt - PO.amount) < 0.01;

    const headerRow = '<tr>'
        + '<th class="center" style="width:40px;">#</th>'
        + '<th>Period Date</th>'
        + '<th>Label</th>'
        + '<th class="right">Percentage</th>'
        + '<th class="right">Amount</th>'
        + '<th class="right">Total %</th>'
        + '<th class="right">Total Amount</th>'
        + '<th class="center" style="width:50px;"></th>'
        + '</tr>';

    const bodyRows = rows.map(r => {
        // Highlight row 3 in dirty state
        const isDirtyRow = state === 'dirty' && r.idx === 2;
        const dirtyHi = isDirtyRow ? ' style="background:#fdf4e3;"' : '';
        return `<tr data-index="${r.idx}"${dirtyHi}>
            <td class="center rownum">${r.rowNum}</td>
            <td><input type="date" value="${esc(r.date)}"></td>
            <td><input type="text" value="${esc(r.label)}"></td>
            <td class="right"><input type="number" value="${r.pct.toFixed(2)}" step="0.01" min="0" max="100"></td>
            <td class="right"><input type="text" value="${esc(fmtCurrency(r.amt))}" style="text-align:right;"></td>
            <td class="right cum">${esc(fmtPercent(r.cumPct))}</td>
            <td class="right cum">${esc(fmtCurrency(r.cumAmt))}</td>
            <td class="center">
                <button type="button" class="bccf-btn bccf-btn-danger-ghost" title="Remove line">${ICONS.trash}</button>
            </td>
        </tr>`;
    }).join('');

    const validationHtml = isBalanced
        ? `<span class="bccf-badge success">&#10003; Balanced</span>`
        : `<span class="bccf-badge warn">&#9888; ${esc(fmtPercent(totalPct))} allocated</span>`;

    const totalRow = '<tr>'
        + '<td colspan="1"></td>'
        + '<td colspan="2" style="text-align:right;">Total</td>'
        + `<td class="right">${esc(fmtPercent(totalPct))}</td>`
        + `<td class="right">${esc(fmtCurrency(totalAmt))}</td>`
        + `<td colspan="3" class="right">${validationHtml}</td>`
        + '</tr>';

    return `
<div class="bccf-grid-wrapper">
    <table class="bccf-grid" id="po_sched_grid">
        <thead>${headerRow}</thead>
        <tbody id="po_sched_tbody">${bodyRows}</tbody>
        <tfoot>${totalRow}</tfoot>
    </table>
</div>
<button type="button" class="bccf-add-row-btn">
    ${ICONS.plus} Add Line
</button>`;
}

// ── KPI bar — mirrors renderKpiBar() ─────────────────────────────────────────

function buildKpi(state) {
    let scheduledAmt = 0;
    if (state === 'generated' || state === 'dirty') {
        const rows = buildRows(state);
        scheduledAmt = rows.reduce((s, r) => s + r.amt, 0);
    }
    const scheduledPct = (scheduledAmt / PO.amount) * 100;
    const remainingAmt = PO.amount - scheduledAmt;
    const remainingPct = (remainingAmt / PO.amount) * 100;
    const isComplete = scheduledPct >= 100;

    return `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 18px;background:var(--bccf-bg-50);border-bottom:1px solid var(--bccf-border);">
    <div class="bccf-kpi">
        <div class="bccf-k">Cash Flow Schedule Total</div>
        <div class="bccf-v">${esc(fmtCurrency(PO.amount))}</div>
    </div>
    <div class="bccf-kpi">
        <div class="bccf-k">Scheduled</div>
        <div class="bccf-v${isComplete ? ' accent' : ''}">${esc(fmtCurrency(scheduledAmt))}</div>
        <div class="bccf-sub">${esc(fmtPercent(scheduledPct))}</div>
    </div>
    <div class="bccf-kpi">
        <div class="bccf-k">Remaining</div>
        <div class="bccf-v">${esc(fmtCurrency(remainingAmt))}</div>
        <div class="bccf-sub">${esc(fmtPercent(remainingPct))}</div>
    </div>
    <div class="bccf-kpi">
        <div class="bccf-k">Completion</div>
        <div style="margin-top:6px;background:var(--bccf-bg-100);border-radius:var(--bccf-r-full);height:8px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(scheduledPct, 100)}%;background:${isComplete ? 'var(--bccf-success-500)' : 'var(--bccf-brand-500)'};border-radius:var(--bccf-r-full);transition:width 0.5s ease;"></div>
        </div>
        <div class="bccf-sub" style="margin-top:4px;">${esc(fmtPercent(scheduledPct))}</div>
    </div>
</div>`;
}

// ── Save bar ─────────────────────────────────────────────────────────────────

function buildSaveBar(state) {
    let statusCls = 'saved';
    let statusText = 'Ready';
    let rebalanceVisible = false;

    if (state === 'generated') {
        statusCls = 'saved';
        statusText = 'Ready';
    } else if (state === 'dirty') {
        statusCls = 'dirty-warn';
        statusText = 'Unsaved changes · 104% allocated';
        rebalanceVisible = true;
    }

    return `
<div class="bccf-save-bar" id="po_sched_save_bar">
    <div class="bccf-save-status ${statusCls}">
        <span class="dot"></span>
        <span class="bccf-save-status-text">${esc(statusText)}</span>
    </div>
    <div class="bccf-save-actions">
        <button type="button" class="bccf-btn">Discard changes</button>
        <button type="button" class="bccf-btn bccf-btn-rebalance" id="po_sched_rebalance"
                style="display:${rebalanceVisible ? 'inline-flex' : 'none'};">Rebalance</button>
        <button type="button" class="bccf-btn bccf-btn-pri">Save schedule</button>
    </div>
</div>`;
}

// ── Render a single state ────────────────────────────────────────────────────

function renderState(state) {
    return `
<div class="bccf-container" id="po_sched_root">

    <!-- Header (mirrors the deployed Schedule subtab banner) -->
    <div class="bccf-header">
        <div class="bccf-header-title">
            ${ICONS.cashFlow}
            Purchase Order ${esc(PO.docNumber)} &mdash; Schedule
        </div>
        <div class="bccf-header-meta">
            <span><strong>Vendor:</strong> ${esc(PO.vendor)}</span>
            <span><strong>Project:</strong> ${esc(PO.project)}</span>
            <span><strong>Amount:</strong> ${esc(fmtCurrency(PO.amount))}</span>
        </div>
    </div>

    <!-- Tab nav (Cash Flow only for POs in this mock) -->
    <div class="bccf-tabs">
        <a class="active cashflow">${ICONS.chart} Cash Flow</a>
    </div>

    <!-- Section -->
    <div class="bccf-section active" data-section-id="po_sched">
        <div class="bccf-section-title">
            Cash Flow Schedule
            <span class="bccf-badge neutral">Cash Flow</span>
            ${(state === 'generated' || state === 'dirty')
                ? '<span class="bccf-badge success">8 lines</span>'
                : ''}
        </div>
        ${buildKpi(state)}
        ${buildToolbar(state)}
        ${buildPreview(state)}
        <div id="po_sched_grid_container">${buildGrid(state)}</div>
    </div>

    <!-- Save Bar -->
    ${buildSaveBar(state)}

</div>
<div id="bccf-toast-host"></div>`;
}

// ── Assemble ─────────────────────────────────────────────────────────────────

const baseStyles = getBaseStylesFromTimingUi();

// Pre-render the four state blocks so the entire mock is server-static — no
// client-side JS needed beyond the trivial query-param state switcher.
const stateMarkup = {
    empty:      renderState('empty'),
    configured: renderState('configured'),
    generated:  renderState('generated'),
    dirty:      renderState('dirty'),
};

const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Purchase Order Schedule — Mock</title>
    ${baseStyles}
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { padding: 16px; background: var(--bccf-bg-50); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .bccf-container { background: var(--bccf-surface); border-radius: var(--bccf-r-lg); box-shadow: var(--bccf-shadow-2); }
        .state-switcher { position: fixed; top: 8px; right: 8px; z-index: 10000; display: flex; gap: 4px; background: rgba(255,255,255,0.95); padding: 4px; border-radius: var(--bccf-r-md); box-shadow: var(--bccf-shadow-2); font-size: 11px; }
        .state-switcher a { padding: 4px 8px; border-radius: 4px; text-decoration: none; color: var(--bccf-ink-700); }
        .state-switcher a.active { background: var(--bccf-brand-500); color: #fff; }
        .state-switcher a:hover:not(.active) { background: var(--bccf-bg-50); }
        @media print { .state-switcher { display: none; } }
    </style>
</head>
<body>
    <div class="state-switcher" id="state-switcher">
        <a href="?state=empty">Empty</a>
        <a href="?state=configured">Configured</a>
        <a href="?state=generated">Generated</a>
        <a href="?state=dirty">Dirty</a>
    </div>

    <div id="state-empty" data-state="empty">${stateMarkup.empty}</div>
    <div id="state-configured" data-state="configured" hidden>${stateMarkup.configured}</div>
    <div id="state-generated" data-state="generated" hidden>${stateMarkup.generated}</div>
    <div id="state-dirty" data-state="dirty" hidden>${stateMarkup.dirty}</div>

<script>
(function () {
    var q = new URLSearchParams(location.search);
    var state = q.get('state') || 'empty';
    var states = ['empty', 'configured', 'generated', 'dirty'];
    if (states.indexOf(state) === -1) state = 'empty';

    states.forEach(function (s) {
        var el = document.getElementById('state-' + s);
        if (el) el.hidden = (s !== state);
    });

    // Highlight active tab in state switcher
    var switcher = document.getElementById('state-switcher');
    if (switcher) {
        switcher.querySelectorAll('a').forEach(function (a) {
            var href = a.getAttribute('href');
            if (href && href.indexOf('state=' + state) !== -1) {
                a.classList.add('active');
            }
        });
    }
})();
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('Wrote ' + OUT + ' (' + html.length + ' bytes, ' + html.split('\n').length + ' lines)');

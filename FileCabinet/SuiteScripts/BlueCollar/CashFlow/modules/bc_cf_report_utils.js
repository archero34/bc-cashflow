/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Shared utilities for BC Cash Flow report Suitelets.
 *              Formatting, data processing, CSS, and HTML builders used by
 *              the cost, revenue, and combined report Suitelets.
 */
define(['../modules/bc_timing_constants'], (Constants) => {

    const { BRAND, TIMING_TYPE } = Constants;

    // ─── Formatting Helpers ──────────────────────────────────────────────────

    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    /** Format number as $X,XXX with negative-parentheses. Zero/null → em-dash. */
    const fmtDollar = (val) => {
        if (val == null || val === 0) return '\u2014';
        const abs = Math.abs(val);
        const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return val < 0 ? '(' + formatted + ')' : formatted;
    };

    /** Format for actual rows — always positive display, zero → em-dash. */
    const fmtActual = (n) => {
        if (n == null || isNaN(n)) return '\u2014';
        const abs = Math.abs(Math.round(n));
        if (abs === 0) return '\u2014';
        return '$' + abs.toLocaleString('en-US');
    };

    /** Compact dollar formatting for chart labels — $3.5K, $1.2M */
    const fmtCompact = (val) => {
        if (val == null || val === 0) return '$0';
        const abs = Math.abs(val);
        let label;
        if (abs >= 1000000) {
            label = '$' + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        } else if (abs >= 1000) {
            label = '$' + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        } else {
            label = '$' + abs.toFixed(0);
        }
        return val < 0 ? '-' + label : label;
    };

    /** Escape HTML entities. */
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    /** Escape for tooltip embedding. */
    const escTooltip = (s) => String(s).replace(/'/g, '&#39;').replace(/\\/g, '&#92;');

    /** 'YYYY-MM' → 'Apr' */
    const monthAbbrev = (yyyymm) => MONTHS_SHORT[Number(yyyymm.split('-')[1]) - 1];

    /** 'YYYY-MM' → 'April 2026' */
    const monthFull = (yyyymm) => {
        const [y, m] = yyyymm.split('-');
        return MONTHS_FULL[Number(m) - 1] + ' ' + y;
    };

    /** 'YYYY-MM' → 'Apr-26' */
    const periodLabel = (yyyymm) => {
        const [y, m] = yyyymm.split('-');
        return MONTHS_SHORT[Number(m) - 1] + '-' + y.slice(2);
    };

    /** Current month as 'YYYY-MM' */
    const currentYYYYMM = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    };

    // ─── Data Processing ─────────────────────────────────────────────────────

    /**
     * Pivot flat query rows into grouped structure.
     * @param {Object[]} rows - [{ cost_group, period, amount, source_id?, source_type? }]
     * @param {string[]} periods - sorted YYYY-MM strings
     * @param {string} [defaultGroup='Other'] - fallback group name
     * @returns {{ groups, totals, grandTotal, groupTotals, groupSourceMap }}
     */
    const pivot = (rows, periods, defaultGroup) => {
        defaultGroup = defaultGroup || 'Other';
        const groups = {};
        const totals = {};
        const groupSourceMap = {};
        let grandTotal = 0;

        periods.forEach((p) => { totals[p] = 0; });

        rows.forEach((r) => {
            const g = r.cost_group || defaultGroup;
            if (!groups[g]) groups[g] = {};
            groups[g][r.period] = (groups[g][r.period] || 0) + Number(r.amount);
            totals[r.period] = (totals[r.period] || 0) + Number(r.amount);
            grandTotal += Number(r.amount);

            if (!groupSourceMap[g] && r.source_id) {
                groupSourceMap[g] = { source_id: r.source_id, source_type: r.source_type };
            }
        });

        const groupTotals = {};
        Object.keys(groups).forEach((g) => {
            groupTotals[g] = Object.values(groups[g]).reduce((s, v) => s + v, 0);
        });

        return { groups, totals, grandTotal, groupTotals, groupSourceMap };
    };

    // ─── CSS ─────────────────────────────────────────────────────────────────

    /** Returns the full <style> block for all report Suitelets. */
    const buildCSS = () => `<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
        font-family: ${BRAND.FONT_FAMILY};
        font-size: 13px;
        color: ${BRAND.NAVY};
        background: ${BRAND.WHITE};
        -webkit-font-smoothing: antialiased;
    }
    .page { max-width: 100%; margin: 0; padding: 16px 12px 32px; }

    /* Header */
    .hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .hdr-left h1 { font-size: 18px; font-weight: 700; color: ${BRAND.NAVY}; letter-spacing: -0.3px; margin-bottom: 3px; }
    .hdr-left .sub { font-size: 12px; color: ${BRAND.GREY_DARK}; }

    /* Pill toggle */
    .pill-toggle { display: inline-flex; background: ${BRAND.GREY_LIGHT}; border-radius: 8px; padding: 3px; border: 1px solid ${BRAND.GREY_MID}; }
    .pill-toggle button { padding: 6px 14px; font-family: inherit; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: ${BRAND.GREY_DARK}; transition: all 0.15s; }
    .pill-toggle button.active { background: ${BRAND.NAVY}; color: ${BRAND.WHITE}; cursor: default; }
    .pill-toggle button:not(.active):hover { color: ${BRAND.NAVY}; }

    /* KPI row */
    .kpi-row { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .kpi-card { flex: 1 1 160px; background: ${BRAND.WHITE}; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; }
    .kpi-card .kpi-label { font-size: 10px; font-weight: 500; color: ${BRAND.GREY_DARK}; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-card .kpi-value { font-size: 20px; font-weight: 700; color: ${BRAND.NAVY}; margin-top: 3px; }
    .kpi-hero { flex: 1.2 1 200px; background: linear-gradient(135deg, ${BRAND.NAVY} 0%, ${BRAND.NAVY_LIGHT} 100%); border: none; border-radius: 8px; padding: 14px 16px; color: ${BRAND.WHITE}; }
    .kpi-hero .kpi-label { color: rgba(255,255,255,0.65); }
    .kpi-hero .kpi-value { font-size: 24px; color: ${BRAND.GOLD}; margin-top: 4px; }
    .kpi-hero .kpi-status { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
    .kpi-hero .kpi-status .dot { width: 8px; height: 8px; border-radius: 50%; }
    .kpi-hero .kpi-status .status-text { font-size: 11px; color: rgba(255,255,255,0.8); }
    .kpi-badge { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
    .kpi-actual { border-left: 3px solid; }

    /* Chart container */
    .chart-wrap { background: ${BRAND.GREY_LIGHT}; border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; }
    .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .chart-title { font-size: 12px; font-weight: 600; color: ${BRAND.NAVY}; }
    .chart-legend { display: flex; gap: 12px; align-items: center; }
    .chart-legend-item { display: flex; align-items: center; gap: 4px; font-size: 9px; color: ${BRAND.GREY_DARK}; }
    .chart-legend-swatch { width: 10px; height: 10px; border-radius: 2px; }
    .chart-legend-line { width: 12px; height: 2px; border-radius: 1px; }

    /* Table */
    .tbl-wrap { background: ${BRAND.WHITE}; border: 1px solid ${BRAND.GREY_MID}; border-radius: ${BRAND.BORDER_RADIUS}; box-shadow: ${BRAND.BOX_SHADOW}; overflow-x: auto; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; min-width: 700px; }
    th { padding: 8px 12px; text-align: right; white-space: nowrap; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: ${BRAND.WHITE}; background: ${BRAND.NAVY}; position: sticky; top: 0; }
    th:first-child { text-align: left; position: sticky; left: 0; z-index: 2; min-width: 180px; }
    th.col-total { background: ${BRAND.NAVY_LIGHT}; }
    th.cur-month { background: ${BRAND.GOLD}; color: ${BRAND.NAVY}; font-weight: 700; }
    td { padding: 7px 12px; text-align: right; white-space: nowrap; font-size: 12px; border-bottom: 1px solid #F0F0F0; font-variant-numeric: tabular-nums; }
    td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; background: inherit; min-width: 180px; }
    td.row-label { font-weight: 600; color: ${BRAND.NAVY}; }
    td.cur-month { background: #FFFDE7; }
    td.col-total { font-weight: 700; background: ${BRAND.GREY_LIGHT}; }
    tr:nth-child(even) td { background: #FAFBFC; }
    tr:nth-child(even) td.cur-month { background: #FFFDE7; }
    tr:nth-child(even) td.col-total { background: ${BRAND.GREY_LIGHT}; }
    tr:hover td { background: ${BRAND.GREY_LIGHT}; }
    tr:hover td.cur-month { background: #FFF8E1; }

    /* Section headers (combined report) */
    tr.sec-hdr td { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND.NAVY}; background: ${BRAND.GREY_LIGHT}; border-bottom: 2px solid ${BRAND.GREY_MID}; }
    tr.detail td:first-child { padding-left: 24px; }

    /* Total rows */
    tr.total-row td { font-weight: 700; border-top: 2px solid ${BRAND.NAVY}; background: ${BRAND.GREY_LIGHT}; font-size: 12.5px; }
    tr.rev-total td { font-weight: 700; background: rgba(255,183,3,0.10); color: ${BRAND.NAVY}; border-top: 2px solid ${BRAND.GOLD}; }
    tr.cost-total td { font-weight: 700; background: ${BRAND.GREY_LIGHT}; color: ${BRAND.NAVY}; border-top: 2px solid ${BRAND.GREY_MID}; }
    tr.net-row td { font-weight: 700; background: ${BRAND.NAVY}; color: ${BRAND.WHITE}; font-size: 13px; border-top: none; }
    tr.net-row td.positive { color: ${BRAND.GOLD}; }
    tr.net-row td.negative { color: ${BRAND.RED}; }
    tr.sep td { padding: 0; height: 6px; border: none; background: ${BRAND.WHITE}; }

    /* Actual rows */
    tr.actual-sec-hdr td { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND.NAVY}; background: #EEF2F7; border-bottom: 2px solid #CBD5E1; }
    .actual-badge { display: inline-block; background: #64748B; color: #fff; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 3px; margin-left: 6px; vertical-align: middle; }
    tr.actual-detail td { color: #64748B; font-style: italic; background: #FAFBFC; }
    tr.actual-detail td:first-child { padding-left: 24px; font-weight: 600; }
    tr.actual-close td { padding: 0; height: 2px; border: none; background: #CBD5E1; }
    tr.net-actual-row td { font-weight: 700; background: #334155; color: ${BRAND.WHITE}; font-size: 13px; font-style: italic; }
    tr.net-actual-row td.positive { color: ${BRAND.GOLD}; }
    tr.net-actual-row td.negative { color: ${BRAND.RED}; }

    /* Drillable links */
    a.drill { color: ${BRAND.NAVY}; text-decoration: none; border-bottom: 1px dashed #D1D5DB; }
    a.drill:hover { border-bottom-color: ${BRAND.NAVY}; }

    /* Tooltip */
    #bcChartTooltip { display: none; position: fixed; background: ${BRAND.NAVY}; color: #fff; padding: 12px 16px; border-radius: 8px; font-size: 12px; font-family: Inter,sans-serif; pointer-events: none; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); line-height: 1.6; min-width: 180px; }

    /* Export buttons */
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-family: inherit; font-size: 11px; font-weight: 600; border: 1px solid ${BRAND.GREY_MID}; border-radius: ${BRAND.BORDER_RADIUS}; background: ${BRAND.WHITE}; color: ${BRAND.NAVY}; cursor: pointer; transition: all 0.15s ease; }
    .btn:hover { background: ${BRAND.GREY_LIGHT}; border-color: ${BRAND.NAVY}; }
    .btn svg { width: 13px; height: 13px; }

    /* Empty state */
    .empty-state { display: flex; align-items: center; justify-content: center; min-height: 400px; text-align: center; }
    .empty-state h2 { color: ${BRAND.NAVY}; font-size: 18px; font-weight: 600; margin: 0 0 12px; }
    .empty-state p { color: ${BRAND.GREY_DARK}; font-size: 14px; line-height: 1.6; margin: 0; }
</style>`;

    // ─── Page Shell ──────────────────────────────────────────────────────────

    /**
     * Full HTML page wrapper with pill toggle and header.
     * @param {Object} config
     * @param {string} config.title - e.g. 'Cost Cash Flow'
     * @param {string} config.projectName
     * @param {number} config.timingType - current timing type ID
     * @param {string} config.bodyContent - inner HTML
     */
    const buildPageShell = (config) => {
        const { title, projectName, timingType, bodyContent } = config;
        const isCashFlow = timingType === TIMING_TYPE.CASH_FLOW.id;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} \u2014 ${esc(projectName)}</title>
${buildCSS()}
</head>
<body>
<div class="page">
    <div class="hdr">
        <div class="hdr-left">
            <h1>${esc(title)}</h1>
            <div class="sub">${esc(projectName)}</div>
        </div>
        <div class="pill-toggle">
            <button type="button" class="${isCashFlow ? 'active' : ''}"
                ${isCashFlow ? 'disabled' : `onclick="switchView(${TIMING_TYPE.CASH_FLOW.id})"`}>Cash Flow</button>
            <button type="button" class="${!isCashFlow ? 'active' : ''}"
                ${!isCashFlow ? 'disabled' : `onclick="switchView(${TIMING_TYPE.ACCRUAL.id})"`}>Accrual</button>
        </div>
    </div>
    ${bodyContent}
</div>
<script>
function switchView(val) {
    var url = new URL(window.location.href);
    url.searchParams.set('timingType', val);
    window.location.href = url.toString();
}
</script>
</body>
</html>`;
    };

    /**
     * Empty state page when no timing data exists.
     * @param {Object} config - same as buildPageShell config (minus bodyContent)
     */
    const buildEmptyState = (config) => {
        const emptyBody = `<div class="empty-state">
            <div style="max-width:480px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${BRAND.GREY_MID}" stroke-width="1.5" style="margin-bottom:16px;">
                    <path d="M3 3v18h18"/>
                    <path d="M7 16l4-8 4 4 4-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <h2>No Timing Data Yet</h2>
                <p>No timing schedules have been configured for this project.
                   Add timing data on Purchase Orders, Sales Orders, or Change
                   Requests to see the cash flow forecast here.</p>
            </div>
        </div>`;
        return buildPageShell({ ...config, bodyContent: emptyBody });
    };

    // ─── KPI Cards ───────────────────────────────────────────────────────────

    /**
     * Render KPI cards row.
     * @param {Object[]} items - array of KPI card configs:
     *   { label, value, hero?, accent?, badge?, badgeColor?, statusDot?, statusText? }
     *   - hero: true → gradient navy card, value color from accent
     *   - badge: percentage string (e.g. '18%'), shown in a circle
     *   - badgeColor: hex color for badge circle background
     *   - accent: hex color for the value and/or left-border
     *   - statusDot/statusText: shown on hero card below value
     * @param {Object[]} [actualsRow] - optional second row of actual KPI cards:
     *   { label, value, accent }
     */
    const buildKPICards = (items, actualsRow) => {
        let html = '<div class="kpi-row">';

        items.forEach((item) => {
            if (item.hero) {
                html += `<div class="kpi-card kpi-hero">
                    <div class="kpi-label">${esc(item.label)}</div>
                    <div class="kpi-value" style="color:${item.accent || BRAND.GOLD};">${fmtDollar(item.value)}</div>`;
                if (item.statusDot) {
                    html += `<div class="kpi-status">
                        <span class="dot" style="background:${item.statusDot};"></span>
                        <span class="status-text">${esc(item.statusText || '')}</span>
                    </div>`;
                }
                html += '</div>';
            } else {
                html += '<div class="kpi-card">';
                if (item.badge) {
                    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
                    html += '<div>';
                }
                html += `<div class="kpi-label">${esc(item.label)}</div>`;
                html += `<div class="kpi-value" style="color:${item.accent || BRAND.NAVY};">${fmtDollar(item.value)}</div>`;
                if (item.badge) {
                    html += '</div>'; // close inner div
                    html += `<div class="kpi-badge" style="background:${item.badgeColor || BRAND.GREY_LIGHT};color:${item.accent || BRAND.NAVY};">${esc(item.badge)}</div>`;
                    html += '</div>'; // close flex wrapper
                }
                html += '</div>';
            }
        });

        html += '</div>';

        // Optional actuals KPI row
        if (actualsRow && actualsRow.length) {
            html += '<div class="kpi-row">';
            actualsRow.forEach((item) => {
                html += `<div class="kpi-card kpi-actual" style="border-left-color:${item.accent || BRAND.GREY_DARK};">
                    <div class="kpi-label">${esc(item.label)}</div>
                    <div class="kpi-value" style="color:${item.accent || BRAND.NAVY};">${fmtDollar(item.value)}</div>
                </div>`;
            });
            html += '</div>';
        }

        return html;
    };

    // ─── Chart Builder ───────────────────────────────────────────────────────

    /**
     * Build SVG bar chart with optional net line overlay.
     * @param {Object} config
     * @param {'single'|'grouped'} config.mode
     * @param {Object[]} config.series - [{ values, color, gradientFrom, gradientTo, label }]
     * @param {Object} [config.netLine] - { values, color }
     * @param {string[]} config.periods
     * @param {string} config.title
     */
    const buildChart = (config) => {
        const { mode, series, netLine, periods, title } = config;
        if (!periods || !periods.length) return '';

        const curMonth = currentYYYYMM();
        const n = periods.length;
        const vbW = 1000;
        const pad = 50;
        const usable = vbW - pad * 2;
        const slotW = usable / n;
        const barAreaH = 120;
        const topM = 28;
        const botM = 28;
        const vbH = topM + barAreaH + botM;
        const baseline = topM + barAreaH;

        // Compute max value across all series
        let maxVal = 1;
        series.forEach((s) => {
            periods.forEach((p) => {
                maxVal = Math.max(maxVal, Math.abs(s.values[p] || 0));
            });
        });

        const isGrouped = mode === 'grouped' && series.length === 2;
        const barW = isGrouped ? Math.min(slotW * 0.3, 36) : Math.min(slotW * 0.45, 48);
        const gap = isGrouped ? Math.min(slotW * 0.04, 4) : 0;

        let svg = '';
        const tooltipArray = [];

        // Gradient defs
        let defs = '<defs>';
        series.forEach((s, idx) => {
            defs += `<linearGradient id="grad${idx}" x1="0" y1="1" x2="0" y2="0">`;
            defs += `<stop offset="0%" stop-color="${s.gradientFrom || s.color}"/>`;
            defs += `<stop offset="100%" stop-color="${s.gradientTo || s.color}"/>`;
            defs += '</linearGradient>';
        });
        defs += '</defs>';
        svg += defs;

        // Baseline
        svg += `<line x1="${pad}" y1="${baseline}" x2="${vbW - pad}" y2="${baseline}" stroke="#D1D5DB" stroke-width="0.75" stroke-dasharray="6,4"/>`;

        // Net line points collector
        const netPoints = [];

        periods.forEach((p, i) => {
            const cx = pad + slotW * i + slotW / 2;
            const isCur = p === curMonth;

            if (isGrouped) {
                // Two bars side by side
                const val0 = Math.abs(series[0].values[p] || 0);
                const val1 = Math.abs(series[1].values[p] || 0);
                const h0 = val0 > 0 ? Math.max(Math.round((val0 / maxVal) * barAreaH), 2) : 0;
                const h1 = val1 > 0 ? Math.max(Math.round((val1 / maxVal) * barAreaH), 2) : 0;
                const x0 = cx - barW - gap / 2;
                const x1 = cx + gap / 2;

                if (isCur) {
                    if (h0 > 0) svg += `<rect x="${x0}" y="${baseline - h0}" width="${barW}" height="${h0}" rx="3" fill="url(#grad0)" filter="drop-shadow(0 0 6px rgba(255,183,3,0.35))"/>`;
                    if (h1 > 0) svg += `<rect x="${x1}" y="${baseline - h1}" width="${barW}" height="${h1}" rx="3" fill="url(#grad1)" filter="drop-shadow(0 0 4px rgba(4,35,61,0.25))"/>`;
                } else {
                    if (h0 > 0) svg += `<rect x="${x0}" y="${baseline - h0}" width="${barW}" height="${h0}" rx="3" fill="url(#grad0)"/>`;
                    if (h1 > 0) svg += `<rect x="${x1}" y="${baseline - h1}" width="${barW}" height="${h1}" rx="3" fill="url(#grad1)"/>`;
                }

                // Net line point
                if (netLine) {
                    const netVal = netLine.values[p] || 0;
                    const netH = maxVal > 0 ? Math.round((Math.abs(netVal) / maxVal) * barAreaH) : 0;
                    const netY = baseline - netH;
                    netPoints.push({ x: cx, y: netY, val: netVal });
                }
            } else {
                // Single bar
                const val = Math.abs(series[0].values[p] || 0);
                const h = val > 0 ? Math.max(Math.round((val / maxVal) * barAreaH), 2) : 0;
                const x = cx - barW / 2;

                if (isCur) {
                    // Gold gradient for current month
                    if (h > 0) svg += `<rect x="${x}" y="${baseline - h}" width="${barW}" height="${h}" rx="3" fill="url(#gradCur)" filter="drop-shadow(0 0 6px rgba(255,183,3,0.35))"/>`;
                } else {
                    if (h > 0) svg += `<rect x="${x}" y="${baseline - h}" width="${barW}" height="${h}" rx="3" fill="url(#grad0)"/>`;
                }

                // Value label above bar
                if (val > 0) {
                    svg += `<text x="${cx}" y="${baseline - h - 6}" text-anchor="middle" fill="${BRAND.NAVY}" font-size="9" font-weight="600" font-family="Inter,sans-serif">${fmtCompact(val)}</text>`;
                }
            }

            // Month label
            const monthStyle = isCur
                ? `font-weight="700" fill="${BRAND.NAVY}"`
                : `font-weight="500" fill="${BRAND.GREY_DARK}"`;
            svg += `<text x="${cx}" y="${vbH - 6}" text-anchor="middle" ${monthStyle} font-size="10" font-family="Inter,sans-serif">${monthAbbrev(p)}</text>`;

            // Tooltip data
            let tip = `<div style="font-weight:700;margin-bottom:6px;">${monthFull(p)}</div>`;
            series.forEach((s) => {
                const v = s.values[p] || 0;
                tip += `<div style="display:flex;justify-content:space-between;gap:24px;"><span style="color:${s.color};">${escTooltip(s.label)}</span><span style="font-weight:600;">${fmtCompact(v)}</span></div>`;
            });
            if (netLine) {
                const nv = netLine.values[p] || 0;
                const nc = nv >= 0 ? '#34D399' : '#F87171';
                tip += '<div style="border-top:1px solid #4B6A88;margin:6px 0 4px;"></div>';
                tip += `<div style="display:flex;justify-content:space-between;gap:24px;font-weight:700;color:${nc};"><span>Net</span><span>${fmtCompact(nv)}</span></div>`;
            }
            tooltipArray.push(tip);

            // Hover overlay
            svg += `<rect x="${pad + slotW * i}" y="0" width="${slotW}" height="${vbH}" fill="transparent" onmouseover="bcShowTooltip(evt,${i})" onmouseout="bcHideTooltip()" style="cursor:pointer;"/>`;
        });

        // Current month gradient def for single mode
        if (mode === 'single') {
            svg = svg.replace('</defs>', `<linearGradient id="gradCur" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="${BRAND.GOLD}"/><stop offset="100%" stop-color="${BRAND.GOLD_LIGHT}"/></linearGradient></defs>`);
        }

        // Net line overlay
        if (netLine && netPoints.length > 1) {
            const pointStr = netPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');
            svg += `<polyline points="${pointStr}" fill="none" stroke="${netLine.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
            netPoints.forEach((pt) => {
                const isCur = periods[netPoints.indexOf(pt)] === curMonth;
                const r = isCur ? 4 : 3.5;
                const extra = isCur ? ` filter="drop-shadow(0 0 4px rgba(16,185,129,0.4))"` : '';
                svg += `<circle cx="${pt.x}" cy="${pt.y}" r="${r}" fill="${netLine.color}" stroke="#fff" stroke-width="1.5"${extra}/>`;
            });
        }

        // Tooltip script
        const tooltipScript = '<script>'
            + 'var bcTTData=' + JSON.stringify(tooltipArray) + ';'
            + 'var bcTTEl=document.getElementById("bcChartTooltip");'
            + 'function bcShowTooltip(evt,idx){bcTTEl.innerHTML=bcTTData[idx];bcTTEl.style.display="block";bcTTEl.style.left=(evt.clientX+12)+"px";bcTTEl.style.top=(evt.clientY-10)+"px";}'
            + 'function bcHideTooltip(){bcTTEl.style.display="none";}'
            + '<\/script>';

        // Legend (for grouped mode)
        let legendHtml = '';
        if (isGrouped) {
            legendHtml = '<div class="chart-legend">';
            series.forEach((s) => {
                legendHtml += `<div class="chart-legend-item"><div class="chart-legend-swatch" style="background:${s.color};"></div>${esc(s.label)}</div>`;
            });
            if (netLine) {
                legendHtml += `<div class="chart-legend-item"><div class="chart-legend-line" style="background:${netLine.color};"></div>Net</div>`;
            }
            legendHtml += '</div>';
        }

        return `<div class="chart-wrap">
            <div class="chart-header">
                <div class="chart-title">${esc(title)}</div>
                ${legendHtml}
            </div>
            <svg width="100%" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
            <div id="bcChartTooltip"></div>
            ${tooltipScript}
        </div>`;
    };

    // ─── Table Builder ───────────────────────────────────────────────────────

    /**
     * Build drillable link HTML.
     * @param {string} name - display text
     * @param {Object} sourceMap - { [name]: { source_id, source_type } }
     */
    const drillLink = (name, sourceMap) => {
        const src = sourceMap && sourceMap[name];
        if (!src || !src.source_id) return esc(name);
        const url = src.source_type === 'cr'
            ? '/app/common/custom/custrecordentry.nl?rectype=495&id=' + src.source_id
            : '/app/accounting/transactions/transaction.nl?id=' + src.source_id;
        return `<a class="drill" href="${url}" target="_top">${esc(name)}</a>`;
    };

    /**
     * Build a single-section data table (cost or revenue report).
     * @param {Object} config
     * @param {string} config.columnHeader - e.g. 'Cost Group'
     * @param {string[]} config.periods
     * @param {Object} config.groups - { groupName: { period: amount } }
     * @param {string[]} config.groupOrder - sorted group names
     * @param {Object} config.groupTotals - { groupName: total }
     * @param {Object} config.totals - { period: total }
     * @param {number} config.grandTotal
     * @param {Object} config.groupSourceMap
     * @param {Object} [config.actuals] - { sectionLabel, groups, groupOrder, groupTotals }
     */
    const buildTable = (config) => {
        const { columnHeader, periods, groups, groupOrder, groupTotals, totals, grandTotal, groupSourceMap, actuals } = config;
        const curMonth = currentYYYYMM();

        // Header row
        let headerCells = `<th>${esc(columnHeader)}</th>`;
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month"' : '';
            headerCells += `<th${cls}>${periodLabel(p)}</th>`;
        });
        headerCells += '<th class="col-total">Total</th>';

        // Data rows
        let bodyRows = '';
        groupOrder.forEach((g) => {
            bodyRows += '<tr>';
            bodyRows += `<td class="row-label">${drillLink(g, groupSourceMap)}</td>`;
            periods.forEach((p) => {
                const val = groups[g] ? groups[g][p] : null;
                const cls = p === curMonth ? ' class="cur-month"' : '';
                bodyRows += `<td${cls}>${val ? fmtDollar(val) : '\u2014'}</td>`;
            });
            bodyRows += `<td class="col-total">${fmtDollar(groupTotals[g])}</td>`;
            bodyRows += '</tr>';
        });

        // Forecast total row
        let totalRow = '<tr class="total-row"><td class="row-label">Total Forecast</td>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month"' : '';
            totalRow += `<td${cls}>${fmtDollar(totals[p])}</td>`;
        });
        totalRow += `<td class="col-total">${fmtDollar(grandTotal)}</td></tr>`;

        // Actuals section (no column total)
        let actualHtml = '';
        if (actuals && actuals.groupOrder && actuals.groupOrder.length) {
            const colSpan = periods.length + 2;
            actualHtml += `<tr class="sep"><td colspan="${colSpan}"></td></tr>`;
            actualHtml += `<tr class="actual-sec-hdr"><td colspan="${colSpan}">${esc(actuals.sectionLabel || 'Actuals')} <span class="actual-badge">ACTUAL</span></td></tr>`;

            actuals.groupOrder.forEach((g) => {
                actualHtml += '<tr class="actual-detail">';
                actualHtml += `<td class="row-label">${esc(g)}</td>`;
                periods.forEach((p) => {
                    const val = actuals.groups[g] ? actuals.groups[g][p] : null;
                    const cls = p === curMonth ? ' class="cur-month"' : '';
                    actualHtml += `<td${cls}>${val ? fmtActual(val) : '\u2014'}</td>`;
                });
                actualHtml += `<td class="col-total">${fmtActual(actuals.groupTotals[g])}</td>`;
                actualHtml += '</tr>';
            });

            // Close with subtle border (no column total row)
            actualHtml += `<tr class="actual-close"><td colspan="${colSpan}"></td></tr>`;
        }

        return `<div class="tbl-wrap"><table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}${totalRow}${actualHtml}</tbody>
        </table></div>`;
    };

    // ─── Export Bar ──────────────────────────────────────────────────────────

    /** Escape a value for CSV. */
    const csvEsc = (v) => {
        const s = String(v == null ? '' : v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? '"' + s.replace(/"/g, '""') + '"'
            : s;
    };

    /**
     * Build CSV content string and export buttons HTML.
     * @param {Object} config
     * @param {string} config.filename - download filename (without .csv)
     * @param {string[][]} config.csvRows - array of row arrays
     */
    const buildExportBar = (config) => {
        const { filename, csvRows } = config;
        const csvString = csvRows.map((r) => r.map(csvEsc).join(',')).join('\\n');

        return `<div class="actions">
            <button class="btn" onclick="exportCSV()" title="Export to CSV">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
            </button>
            <button class="btn" onclick="window.print()" title="Print / Save as PDF">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Export PDF
            </button>
        </div>
        <script>
        function exportCSV() {
            var csv = "${csvString}";
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = '${filename || 'report'}.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        </script>`;
    };

    return {
        BRAND, TIMING_TYPE,
        fmtDollar, fmtActual, fmtCompact, esc, escTooltip,
        monthAbbrev, monthFull, periodLabel, currentYYYYMM,
        pivot, drillLink, csvEsc,
        buildCSS, buildPageShell, buildEmptyState,
        buildKPICards, buildChart, buildTable, buildExportBar
    };
});

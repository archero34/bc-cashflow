/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Combined Cash Flow Report — shell-only Suitelet.
 *              Returns an HTML skeleton immediately; client JS fetches from
 *              bc_cf_data_sl and swaps in real content on resolve.
 *
 * URL Params (passed through to data SL via data-data-url):
 *   projectId – internal ID of the BC Project
 *   mode      – 'cash' (default) | 'accrual'
 *
 * Script ID:  customscript_bc_cf_combined_sl
 * Deploy  ID: customdeploy_bc_cf_combined_sl
 *
 * Spec: §3.4 (layout), §3.5 (no in-iframe nav tabs), §3.6 (KPIs),
 *       §3.7 (color encoding), §3.8 (chart), §3.9 (loading), §3.16 (skeletons)
 *
 * @module  entry_points/bc_cf_combined_sl
 * @author  BlueCollar
 */
define([
    'N/log',
    'N/url',
    '../modules/bc_cf_styles',
    '../modules/bc_cf_ui'
], (log, url, Styles, UI) => {

    const MODULE = 'bc_cf_combined_sl';
    const DATA_SCRIPT_ID  = 'customscript_bc_cf_data_sl';
    const DATA_DEPLOY_ID  = 'customdeploy_bc_cf_data_sl';

    // ─── Date range helpers (mirror of bc_cf_data_sl helpers; intentional duplication per spec §3.2) ────

    const _YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
    const _validateYYYYMM = (s) => typeof s === 'string' && _YYYYMM_RE.test(s);
    const _addMonths = (yyyymm, n) => {
        const [y, m] = yyyymm.split('-').map(Number);
        const d = new Date(Date.UTC(y, (m - 1) + n, 1));
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    };
    const _monthsBetween = (s, e) => {
        const [sy, sm] = s.split('-').map(Number);
        const [ey, em] = e.split('-').map(Number);
        return (ey - sy) * 12 + (em - sm) + 1;
    };
    const _defaultRange = () => {
        const now = new Date();
        const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        return { startPeriod: _addMonths(cur, -3), endPeriod: _addMonths(cur, 8) };
    };
    /**
     * Server-side range resolution for the report SL: if request params are
     * present + valid, use them; otherwise fall back to the default rolling
     * window. Unlike the data SL's _resolveRange, this NEVER errors — bad
     * params just degrade to defaults so the HTML page still renders.
     */
    const _resolveRangeOrDefault = (rawStart, rawEnd) => {
        const hasStart = rawStart && _validateYYYYMM(rawStart);
        const hasEnd   = rawEnd   && _validateYYYYMM(rawEnd);
        if (!hasStart && !hasEnd) return _defaultRange();
        const startPeriod = hasStart ? rawStart : _addMonths(rawEnd, -11);
        const endPeriod   = hasEnd   ? rawEnd   : _addMonths(rawStart, 11);
        if (startPeriod > endPeriod) return _defaultRange();
        if (_monthsBetween(startPeriod, endPeriod) > 24) return _defaultRange();
        return { startPeriod, endPeriod };
    };

    /** 'YYYY-MM' → 'Mar 2026' for the picker pill label. */
    const _periodLabelShort = (yyyymm) => {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [y, m] = yyyymm.split('-');
        return MONTHS[Number(m) - 1] + ' ' + y;
    };

    // ─── Server-side helpers ──────────────────────────────────────────────────

    /**
     * Resolve the data SL URL server-side so the client never hardcodes paths.
     * returnExternalUrl: false → same-domain session cookies flow correctly
     * inside the iframe.
     */
    const resolveDataUrl = (projectId, mode, range) => {
        const base = url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: {
                action:      'combined',
                projectId:   String(projectId),
                mode:        mode || 'cash',
                startPeriod: range.startPeriod,
                endPeriod:   range.endPeriod
            }
        });
        return base;
    };

    // ─── Skeleton regions ─────────────────────────────────────────────────────

    /**
     * Server-render the date range picker with the effective range as initial state.
     * The `min`/`max` attributes on the month inputs are left blank — the client
     * sets them once availableBounds arrives from the JSON fetch. Spec §3.2.
     */
    const buildPicker = (range) => {
        const label = `${_periodLabelShort(range.startPeriod)} – ${_periodLabelShort(range.endPeriod)}`;
        const months = _monthsBetween(range.startPeriod, range.endPeriod);
        const activeChip = (months === 8 || months === 12 || months === 18 || months === 24) ? String(months) : '';
        const chip = (n) => `<button type="button" data-preset="${n}"${activeChip === String(n) ? ' class="active"' : ''}>${n} months</button>`;
        return `
            <div class="bccf-daterange" id="bccf-daterange"
                 data-start="${UI.esc(range.startPeriod)}"
                 data-end="${UI.esc(range.endPeriod)}">
                <button type="button" class="bccf-daterange-trigger" data-action="open-daterange">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span class="bccf-daterange-label">${UI.esc(label)}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="bccf-daterange-panel" style="display:none">
                    <h4>Quick ranges</h4>
                    <div class="bccf-daterange-presets">${chip(8)}${chip(12)}${chip(18)}${chip(24)}</div>
                    <h4>Custom range</h4>
                    <div class="bccf-daterange-custom">
                        <div>
                            <label>From</label>
                            <input type="month" data-input="from" value="${UI.esc(range.startPeriod)}" />
                        </div>
                        <div>
                            <label>To</label>
                            <input type="month" data-input="to" value="${UI.esc(range.endPeriod)}" />
                        </div>
                    </div>
                    <div class="bccf-daterange-actions">
                        <span class="bccf-daterange-hint">Limit: 24 months</span>
                        <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-daterange">Apply</button>
                    </div>
                </div>
            </div>`;
    };

    /**
     * Header panel — fully rendered server-side (cheap chrome, no data needed).
     * No in-iframe nav tabs per spec §3.5 amendment 2026-05-23.
     */
    const buildHeader = (projectId, mode, range) => {
        const modeLabel = mode === 'accrual' ? 'Accrual' : 'Cash';
        const pill = `<span class="bccf-badge brand bccf-title-pill">${UI.esc(modeLabel)} basis</span>`;
        const toggle = UI.toggle({
            id: 'mode',
            options: [
                { value: 'cash',    label: 'Cash' },
                { value: 'accrual', label: 'Accrual' }
            ],
            activeValue: mode || 'cash'
        });

        const headerLeft = `
            <div style="display:flex;align-items:center;gap:10px">
                <h1 style="margin:0;font-size:var(--bccf-text-xl);font-weight:700;color:var(--bccf-ink-900)">
                    Combined Cash Flow
                </h1>
                ${pill}
            </div>`;

        const headerRight = `
            <div style="display:flex;align-items:center;gap:8px">
                ${buildPicker(range)}
                ${toggle}
                <button type="button" class="bccf-btn" data-action="refresh" title="Refresh">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>`;

        return UI.panel({ header: headerLeft + headerRight });
    };

    /** KPI strip: 4 skeleton cards in a grid */
    const buildSkeletonKpis = () => {
        const labels = ['Total Revenue', 'Total Cost', 'Net Cash Flow', 'Margin'];
        let cards = '';
        labels.forEach(label => {
            cards += `<div class="bccf-kpi">
                <div class="bccf-k">${UI.esc(label)}</div>
                <div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>
                <div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>
            </div>`;
        });
        return `<div id="bccf-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
            ${cards}
        </div>`;
    };

    /** Chart panel with skeleton bars — #bccf-chart wraps the whole panel (Bug 1 fix) */
    const buildSkeletonChart = () => {
        return `<div id="bccf-chart">${UI.panel({
            header: `<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Cash Flow</span>`,
            body: UI.skeletonChart(6)
        })}</div>`;
    };

    /** Table panel with skeleton rows — #bccf-table wraps the whole panel (Bug 1 fix) */
    const buildSkeletonTable = () => {
        // thead: Source + 6 period cols + Total = 8 cols
        const headerRow = '<tr><th>Source</th>' + Array(6).fill('<th></th>').join('') + '<th>Total</th></tr>';
        const skelRows = UI.skeletonRows(8, 5);
        return `<div id="bccf-table">${UI.panel({
            body: `<div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:var(--bccf-text-sm)">
                    <thead>${headerRow}</thead>
                    <tbody>${skelRows}</tbody>
                </table>
            </div>`
        })}</div>`;
    };

    // ─── Client-side JS (inlined in <script>) ─────────────────────────────────
    //
    // Designed to run inside the iframe. Uses event delegation, no inline onclick.
    // Double-evaluation guard: if (window.__bccfWiredCombined) return;
    //
    /* eslint-disable */
    const CLIENT_SCRIPT = `
(function () {
    'use strict';

    // ── Double-evaluation guard ──────────────────────────────────────────────
    if (window.__bccfWiredCombined) return;
    window.__bccfWiredCombined = true;

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Format a number as currency.
     *   Positive:  $1,005.00
     *   Negative:  −$1,500.00   (Unicode minus U+2212, not ASCII hyphen)
     */
    function fmtCurrency(n) {
        const abs = Math.abs(n);
        const formatted = abs.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return (n < 0 ? '\\u2212' : '') + '$' + formatted;
    }

    /**
     * Format a percentage.
     *   23.4 → "23.4%"   −4.2 → "−4.2%"
     */
    function fmtPct(n) {
        return (n < 0 ? '\\u2212' : '') + Math.abs(n).toFixed(1) + '%';
    }

    /** Minimal HTML escape for injected text. */
    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Toast ────────────────────────────────────────────────────────────────

    function toast(type, message) {
        var host = document.getElementById('bccf-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'bccf-toast-host';
            document.body.appendChild(host);
        }
        var t = document.createElement('div');
        t.className = 'bccf-toast ' + type;
        t.innerHTML = '<span>' + esc(message) + '</span>'
            + '<button type="button" class="bccf-toast-close" data-action="close-toast">\\u00d7</button>';
        host.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
    }

    // ── Current YYYY-MM ──────────────────────────────────────────────────────

    function currentYYYYMM() {
        var now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    /** Convert a period label "Apr 2026" back to YYYY-MM for comparison */
    function labelToYYYYMM(label) {
        var MONTHS = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
        var parts = label.split(' ');
        if (parts.length < 2) return '';
        return parts[1] + '-' + (MONTHS[parts[0]] || '00');
    }

    // ── Render KPI strip ─────────────────────────────────────────────────────

    /**
     * Build 4 KPI cards:
     *   Total Revenue  — navy value, no accent class
     *   Total Cost     — slate value, no accent class
     *   Net Cash Flow  — accent class, green if positive / red if negative
     *   Margin %       — default ink color
     *
     * Per spec §3.6, §3.7, §3.15.5 — bccf-k / bccf-v / bccf-sub inner classes.
     * No KPI ever colors .bccf-v green/red — only Net uses accent.
     */
    function renderKpis(kpis, projectTotals) {
        projectTotals = projectTotals || { revenue: 0, cost: 0 };

        var projectNet = (projectTotals.revenue || 0) - (projectTotals.cost || 0);
        var projectMargin = projectTotals.revenue
            ? (projectNet / projectTotals.revenue) * 100
            : 0;

        var netColor = kpis.netCashFlow >= 0
            ? 'var(--bccf-success-500)'
            : 'var(--bccf-danger-500)';

        var cards = [
            // 1. Total Revenue (range) — subline shows project total
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(kpis.totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.revenue)) + ' project total</div>'
            + '</div>',

            // 2. Total Cost (range) — subline shows project total
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Cost</div>'
                + '<div class="bccf-v" style="color:var(--bccf-cost-500)">' + esc(fmtCurrency(kpis.totalCost)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.cost)) + ' project total</div>'
            + '</div>',

            // 3. Net Cash Flow (range) — subline shows project net + margin
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Net Cash Flow</div>'
                + '<div class="bccf-v" style="color:' + netColor + '">' + esc(fmtCurrency(kpis.netCashFlow)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectNet)) + ' project / ' + esc(fmtPct(projectMargin)) + ' overall</div>'
            + '</div>',

            // 4. Margin (range) — subline shows project margin
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Margin</div>'
                + '<div class="bccf-v">' + esc(fmtPct(kpis.margin)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtPct(projectMargin)) + ' project overall</div>'
            + '</div>'
        ];

        // Return only the inner cards — the outer #bccf-kpis wrapper stays in the DOM (Bug 1 fix)
        return cards.join('');
    }

    // ── Render Chart ─────────────────────────────────────────────────────────

    /**
     * Paired bars per month: Revenue (navy) + Cost (slate), 2px gap.
     * Net amount label above each pair colored by sign.
     * Current month gets .now class: brand-50 halo + bolded label + ▲ glyph.
     * Heights normalized to largest single-bar amount in the dataset.
     * Spec §3.8.
     */
    function renderChart(periods, categories) {
        var revTotal = categories.revenue.total;
        var costTotal = categories.cost.total;
        var BAR_MAX_H = 140; // px

        // Find max of all individual bars (not net) for normalization
        var allAmounts = revTotal.concat(costTotal);
        var maxAmt = allAmounts.reduce(function(m, v) { return Math.max(m, v); }, 1);

        function barH(v) {
            return Math.max(2, Math.round((v / maxAmt) * BAR_MAX_H));
        }

        var curYYYYMM = currentYYYYMM();

        var cols = periods.map(function(label, i) {
            var rev   = revTotal[i]  || 0;
            var cost  = costTotal[i] || 0;
            var net   = rev - cost;
            var isNow = labelToYYYYMM(label) === curYYYYMM;

            var netColor  = net >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            var netLabel  = fmtCurrency(net);
            var haloStyle = isNow
                ? 'background:var(--bccf-brand-50);border-radius:6px;padding:4px 6px 6px;'
                : '';
            var monthLabel = isNow
                ? '<span style="font-weight:700;color:var(--bccf-brand-500)">&#9650; ' + esc(label) + '</span>'
                : '<span>' + esc(label) + '</span>';

            var revH  = barH(rev);
            var costH = barH(cost);

            return '<div class="' + (isNow ? 'now' : '') + '" style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:48px;' + haloStyle + '">'
                // Net amount label above bars
                + '<div style="font-size:11px;font-weight:600;color:' + netColor + ';margin-bottom:4px;white-space:nowrap;font-variant-numeric:tabular-nums">'
                    + esc(netLabel)
                + '</div>'
                // Paired bars — hover via .bccf-bar:hover CSS rule (spec §3.8: CSS-only, no JS)
                + '<div style="display:flex;align-items:flex-end;gap:2px;height:' + BAR_MAX_H + 'px">'
                    // Revenue bar (navy)
                    + '<div class="bccf-bar" title="Revenue: ' + esc(fmtCurrency(rev)) + '" style="width:16px;height:' + revH + 'px;background:var(--bccf-brand-500);border-radius:3px 3px 0 0"></div>'
                    // Cost bar (coral)
                    + '<div class="bccf-bar" title="Cost: ' + esc(fmtCurrency(cost)) + '" style="width:16px;height:' + costH + 'px;background:var(--bccf-cost-500);border-radius:3px 3px 0 0"></div>'
                + '</div>'
                // Month label below
                + '<div style="font-size:11px;color:var(--bccf-ink-500);margin-top:6px;text-align:center">' + monthLabel + '</div>'
            + '</div>';
        });

        // ── Cumulative net trend line ────────────────────────────────────────
        var net = periods.map(function(_, i) { return (revTotal[i] || 0) - (costTotal[i] || 0); });
        var cumNet = net.reduce(function(acc, n) { acc.push((acc[acc.length - 1] || 0) + n); return acc; }, []);
        var cumMax = Math.max(0, Math.max.apply(null, cumNet));
        var cumMin = Math.min(0, Math.min.apply(null, cumNet));
        var cumRange = (cumMax - cumMin) || 1;
        var trendPoints = cumNet.map(function(v, i) {
            var x = (i + 0.5) / periods.length * 100;
            var y = 100 - ((v - cumMin) / cumRange) * 100;
            return { x: x, y: y, value: v };
        });
        var polyPoints = trendPoints.map(function(p) { return p.x + ',' + p.y; }).join(' ');
        var dotsHtml = trendPoints.map(function(p) {
            var color = p.value >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<span style="position:absolute;left:' + p.x + '%;top:' + p.y + '%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 2px var(--bccf-surface);pointer-events:none;"></span>';
        }).join('');
        // Final-period cumulative label removed — Net Cash Flow KPI already surfaces this value.
        var svgOverlay = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">'
            + '<polyline points="' + polyPoints + '" fill="none" stroke="var(--bccf-success-500)" stroke-width="2" vector-effect="non-scaling-stroke" />'
            + '</svg>'
            + dotsHtml;

        // Legend — gap:16px between swatches, margin-right:6px between swatch box and label (Bug 4 fix)
        var legend = '<div style="display:flex;align-items:center;gap:16px;font-size:12px;color:var(--bccf-ink-500)">'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-brand-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Revenue</span>'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-cost-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Cost</span>'
            + '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="18" height="6" viewBox="0 0 18 6" style="display:block"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--bccf-success-500)" stroke-width="2" /><circle cx="9" cy="3" r="1.6" fill="var(--bccf-success-500)" /></svg>Cumulative Net</span>'
        + '</div>';

        var headerHtml = '<div style="display:flex;align-items:center;justify-content:space-between">'
            + '<div style="font-weight:600">Monthly cash flow</div>'
            + legend
        + '</div>';

        var barsHtml = '<div style="position:relative">'
            + '<div style="display:flex;align-items:flex-end;gap:8px;padding:16px 0 0">'
                + cols.join('')
            + '</div>'
            + svgOverlay
        + '</div>';

        // renderChart returns the full panel HTML — loadData sets innerHTML of #bccf-chart wrapper (Bug 1 fix)
        return '<div class="bccf-panel" style="margin-bottom:16px">'
            + '<div class="bccf-panel-header">' + headerHtml + '</div>'
            + '<div class="bccf-panel-body">' + barsHtml + '</div>'
        + '</div>';
    }

    // ── Render Table ─────────────────────────────────────────────────────────

    /**
     * Combined table:
     *   thead: Source | <period labels> | Total
     *   tbody: Revenue category row (bold) + sub-rows per line (indented, ink-500)
     *          Cost category row (bold) + sub-rows
     *   tfoot: Net row — each cell colored green/red by sign
     * Spec §3.9 task description (table section).
     */
    function renderTable(periods, categories) {
        var rev  = categories.revenue;
        var cost = categories.cost;

        // ── thead ──
        var headCols = periods.map(function(p) { return '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap">' + esc(p) + '</th>'; }).join('');
        var thead = '<thead><tr>'
            + '<th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--bccf-ink-500)">Source</th>'
            + headCols
            + '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500)">Total</th>'
        + '</tr></thead>';

        // ── helper: category header row ──
        function catRow(label, color) {
            var span = periods.length + 2; // Source + periods + Total
            return '<tr style="background:var(--bccf-bg-50)">'
                + '<td colspan="' + span + '" style="padding:8px 12px;font-weight:700;font-size:var(--bccf-text-sm);color:' + color + '">' + esc(label) + '</td>'
            + '</tr>';
        }

        // ── helper: build drillable href from source metadata ──
        function buildSourceHref(source) {
            if (!source || !source.id) return null;
            var id = encodeURIComponent(source.id);
            if (source.type === 'so') return '/app/accounting/transactions/salesord.nl?id=' + id;
            if (source.type === 'po') return '/app/accounting/transactions/purchord.nl?id=' + id;
            if (source.type === 'cr') return '/app/common/custom/custrecordentry.nl?rectype=customrecord_bc_change_req&id=' + id;
            return null;
        }

        function labelCell(line) {
            var href = buildSourceHref(line.source);
            var safeLabel = esc(line.label);
            if (!href) return safeLabel;
            return '<a href="' + href + '" target="_top" style="color:var(--bccf-brand-500);text-decoration:none">' + safeLabel + '</a>';
        }

        // ── helper: sub-row per line ──
        function lineRow(line) {
            var cells = line.amounts.map(function(v) {
                return '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);color:var(--bccf-ink-500);font-variant-numeric:tabular-nums">'
                    + esc(fmtCurrency(v)) + '</td>';
            }).join('');
            return '<tr>'
                + '<td style="padding:6px 12px 6px 24px;font-size:var(--bccf-text-sm);color:var(--bccf-ink-500)">' + labelCell(line) + '</td>'
                + cells
                + '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);color:var(--bccf-ink-500);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(line.total)) + '</td>'
            + '</tr>';
        }

        // ── helper: totals row ──
        function totalRow(label, totals, grandTotal, color) {
            var cells = totals.map(function(v) {
                return '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + color + ';font-variant-numeric:tabular-nums;border-top:1px solid var(--bccf-border)">'
                    + esc(fmtCurrency(v)) + '</td>';
            }).join('');
            return '<tr>'
                + '<td style="padding:8px 12px;font-size:var(--bccf-text-sm);font-weight:600;color:' + color + ';border-top:1px solid var(--bccf-border)">' + esc(label) + '</td>'
                + cells
                + '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:700;color:' + color + ';border-top:1px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(grandTotal)) + '</td>'
            + '</tr>';
        }

        // ── tbody ──
        var revRows = rev.lines.map(lineRow).join('');
        var costRows = cost.lines.map(lineRow).join('');

        var tbody = '<tbody>'
            + catRow('Revenue', 'var(--bccf-brand-500)')
            + revRows
            + totalRow('Revenue Total', rev.total, rev.grandTotal, 'var(--bccf-brand-500)')
            + '<tr><td colspan="' + (periods.length + 2) + '" style="padding:4px 0"></td></tr>'
            + catRow('Cost', 'var(--bccf-cost-500)')
            + costRows
            + totalRow('Cost Total', cost.total, cost.grandTotal, 'var(--bccf-cost-500)')
        + '</tbody>';

        // ── tfoot Net row ──
        var netCells = rev.total.map(function(rv, i) {
            var net = rv - (cost.total[i] || 0);
            var color = net >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + color + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">'
                + esc(fmtCurrency(net)) + '</td>';
        }).join('');

        var grandNet = rev.grandTotal - cost.grandTotal;
        var grandNetColor = grandNet >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
        var tfoot = '<tfoot><tr>'
            + '<td style="padding:8px 12px;font-size:var(--bccf-text-sm);font-weight:700;color:var(--bccf-ink-900);border-top:2px solid var(--bccf-border)">Net Cash Flow</td>'
            + netCells
            + '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:700;color:' + grandNetColor + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(grandNet)) + '</td>'
        + '</tr></tfoot>';

        return '<div class="bccf-panel">'
            + '<div class="bccf-panel-body" style="padding:0;overflow-x:auto">'
                + '<table style="width:100%;border-collapse:collapse">'
                    + thead + tbody + tfoot
                + '</table>'
            + '</div>'
        + '</div>';
    }

    // ── Error card ───────────────────────────────────────────────────────────

    function renderError(message) {
        return '<div class="bccf-error-card">'
            + '<h4>Couldn\\u2019t load data</h4>'
            + '<pre>' + esc(message) + '</pre>'
            + '<button type="button" class="bccf-btn" data-action="retry">Retry</button>'
        + '</div>';
    }

    // ── Fetch + render ───────────────────────────────────────────────────────

    var _lastDataUrl = null;

    // Skeleton HTML strings for re-painting regions on refresh (Bug 2 fix)
    var SKEL_KPIS = (function() {
        var cards = '';
        ['Total Revenue','Total Cost','Net Cash Flow','Margin'].forEach(function(label) {
            cards += '<div class="bccf-kpi">'
                + '<div class="bccf-k">' + esc(label) + '</div>'
                + '<div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>'
                + '<div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>'
                + '</div>';
        });
        return cards;
    }());

    var SKEL_CHART = (function() {
        var heights = [40, 70, 100, 90, 60, 30];
        var bars = heights.map(function(h) {
            return '<div class="bccf-skel bar-skel" style="flex:1;height:' + h + 'px;margin:0 3px;border-radius:3px 3px 0 0"></div>';
        }).join('');
        return '<div class="bccf-panel" style="margin-bottom:16px">'
            + '<div class="bccf-panel-header"><span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Cash Flow</span></div>'
            + '<div class="bccf-panel-body"><div style="display:flex;align-items:flex-end;height:120px;padding:14px 18px">' + bars + '</div></div>'
            + '</div>';
    }());

    var SKEL_TABLE = (function() {
        var widths = [80, 60, 70, 65, 75, 55, 90];
        var rows = '';
        for (var r = 0; r < 5; r++) {
            rows += '<tr>';
            for (var c = 0; c < 8; c++) {
                var w = widths[(r + c) % widths.length];
                rows += '<td><span class="bccf-skel" style="display:inline-block;width:' + w + 'px;height:12px"></span></td>';
            }
            rows += '</tr>';
        }
        return '<div class="bccf-panel">'
            + '<div class="bccf-panel-body" style="padding:0;overflow-x:auto">'
            + '<table style="width:100%;border-collapse:collapse"><tbody>' + rows + '</tbody></table>'
            + '</div></div>';
    }());

    function loadData(dataUrl) {
        _lastDataUrl = dataUrl;

        // Bug 2: repaint skeletons immediately so user sees loading state on refresh
        var kpiElSkel = document.getElementById('bccf-kpis');
        if (kpiElSkel) kpiElSkel.innerHTML = SKEL_KPIS;
        var chartElSkel = document.getElementById('bccf-chart');
        if (chartElSkel) chartElSkel.innerHTML = SKEL_CHART;
        var tableElSkel = document.getElementById('bccf-table');
        if (tableElSkel) tableElSkel.innerHTML = SKEL_TABLE;

        fetch(dataUrl)
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function(data) {
                if (!data.ok) throw new Error(data.error || 'Data SL returned ok:false');
                applyBoundsToPicker(data.availableBounds);

                // Bug 1: use innerHTML on stable wrapper divs (IDs never destroyed)
                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis, data.projectTotals);

                var chartEl = document.getElementById('bccf-chart');
                if (chartEl) chartEl.innerHTML = renderChart(data.periods, data.categories);

                var tableEl = document.getElementById('bccf-table');
                if (tableEl) tableEl.innerHTML = renderTable(data.periods, data.categories);
            })
            .catch(function(err) {
                var errHtml = renderError(err.message || String(err));

                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) {
                    kpiEl.innerHTML = '<div class="bccf-error-card" style="grid-column:1/-1"><h4>Couldn\\u2019t load report data</h4><pre>' + esc(err.message || 'Unknown error') + '</pre><button type="button" class="bccf-btn" data-action="retry">Retry</button></div>';
                }
                var chartEl = document.getElementById('bccf-chart');
                if (chartEl) chartEl.innerHTML = errHtml;
                var tableEl = document.getElementById('bccf-table');
                if (tableEl) tableEl.innerHTML = errHtml;
            });
    }

    // ── URL param swap for mode toggle ───────────────────────────────────────

    function swapModeUrl(currentUrl, newMode) {
        var u = new URL(currentUrl, window.location.href);
        u.searchParams.set('mode', newMode);
        return u.toString();
    }

    // ── Date range picker (E1 spec §3.2) ─────────────────────────────────────

    /**
     * Add N months to a YYYY-MM string. UTC-safe.
     */
    function addMonths(yyyymm, n) {
        var parts = yyyymm.split('-');
        var y = Number(parts[0]);
        var m = Number(parts[1]);
        var d = new Date(Date.UTC(y, (m - 1) + n, 1));
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }

    function monthsBetween(s, e) {
        var sp = s.split('-').map(Number);
        var ep = e.split('-').map(Number);
        return (ep[0] - sp[0]) * 12 + (ep[1] - sp[1]) + 1;
    }

    /** Center N-month window around the current month: -floor(N/4) / +(N - floor(N/4) - 1) per spec preset behavior. */
    function presetWindow(n) {
        var now = new Date();
        var cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '00');
        var back = Math.floor(n / 4);  // 8->2, 12->3, 18->4, 24->6
        return { startPeriod: addMonths(cur, -back), endPeriod: addMonths(cur, n - back - 1) };
    }

    function pickerEl() { return document.getElementById('bccf-daterange'); }
    function pickerPanel() { var p = pickerEl(); return p ? p.querySelector('.bccf-daterange-panel') : null; }
    function pickerFrom()  { var p = pickerEl(); return p ? p.querySelector('[data-input="from"]') : null; }
    function pickerTo()    { var p = pickerEl(); return p ? p.querySelector('[data-input="to"]')   : null; }
    function pickerApply() { var p = pickerEl(); return p ? p.querySelector('[data-action="apply-daterange"]') : null; }

    function setActivePreset(n) {
        var p = pickerEl();
        if (!p) return;
        p.querySelectorAll('[data-preset]').forEach(function(b) {
            b.classList.toggle('active', String(n) === b.dataset.preset);
        });
    }

    function clearActivePreset() {
        var p = pickerEl();
        if (!p) return;
        p.querySelectorAll('[data-preset]').forEach(function(b) { b.classList.remove('active'); });
    }

    /**
     * Validate the custom From/To inputs. Returns null if valid (then enables Apply),
     * or a short message if invalid (then disables Apply).
     */
    function validatePickerInputs() {
        var from = pickerFrom();
        var to   = pickerTo();
        var apply = pickerApply();
        if (!from || !to || !apply) return 'init';
        var f = from.value;
        var t = to.value;
        var ok = /^\\d{4}-(0[1-9]|1[0-2])$/.test(f) && /^\\d{4}-(0[1-9]|1[0-2])$/.test(t);
        if (!ok) {
            apply.disabled = true;
            return 'Invalid month';
        }
        if (f > t) {
            apply.disabled = true;
            return 'From must be on or before To';
        }
        if (monthsBetween(f, t) > 24) {
            apply.disabled = true;
            return 'Maximum 24 months';
        }
        apply.disabled = false;
        return null;
    }

    function openPicker() {
        var panel = pickerPanel();
        if (panel) panel.style.display = 'block';
    }
    function closePicker() {
        var panel = pickerPanel();
        if (panel) panel.style.display = 'none';
    }

    function applyPicker() {
        var from = pickerFrom();
        var to   = pickerTo();
        if (!from || !to) return;
        if (validatePickerInputs() !== null) return;  // re-check
        var u = new URL(window.location.href);
        u.searchParams.set('startPeriod', from.value);
        u.searchParams.set('endPeriod',   to.value);
        window.location.replace(u.toString());
    }

    // Wire picker events
    document.addEventListener('click', function(e) {
        // Open/close on trigger
        var trigger = e.target.closest('[data-action="open-daterange"]');
        if (trigger) {
            var panel = pickerPanel();
            var isOpen = panel && panel.style.display === 'block';
            if (isOpen) closePicker(); else openPicker();
            return;
        }
        // Apply
        if (e.target.closest('[data-action="apply-daterange"]')) {
            applyPicker();
            return;
        }
        // Preset chip
        var preset = e.target.closest('[data-preset]');
        if (preset) {
            var n = Number(preset.dataset.preset);
            var win = presetWindow(n);
            var from = pickerFrom();
            var to   = pickerTo();
            if (from) from.value = win.startPeriod;
            if (to)   to.value   = win.endPeriod;
            setActivePreset(n);
            validatePickerInputs();
            return;
        }
        // Outside click closes panel
        var p = pickerEl();
        if (p && !p.contains(e.target)) closePicker();
    }, true);

    // Custom input edits clear preset + revalidate
    document.addEventListener('input', function(e) {
        if (!e.target.matches('[data-input="from"], [data-input="to"]')) return;
        clearActivePreset();
        validatePickerInputs();
    });

    // Esc closes panel
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closePicker();
    });

    /**
     * After the JSON fetch resolves, clamp the from/to inputs to availableBounds
     * so the native month-picker UI honors the project's actual data window.
     */
    function applyBoundsToPicker(availableBounds) {
        if (!availableBounds) return;
        var from = pickerFrom();
        var to   = pickerTo();
        if (from) {
            from.setAttribute('min', availableBounds.minPeriod);
            from.setAttribute('max', availableBounds.maxPeriod);
        }
        if (to) {
            to.setAttribute('min', availableBounds.minPeriod);
            to.setAttribute('max', availableBounds.maxPeriod);
        }
    }

    // ── Event delegation ─────────────────────────────────────────────────────

    document.addEventListener('click', function(e) {
        // Mode toggle — check BEFORE [data-action] guard because toggle buttons
        // only carry data-value, not data-action.
        var toggleBtn = e.target.closest('[data-toggle-id="mode"] button');
        if (toggleBtn) {
            if (toggleBtn.classList.contains('active')) return;  // already in this mode — no-op
            var newMode = toggleBtn.dataset.value;
            if (!newMode || !_lastDataUrl) return;
            // Update active class
            toggleBtn.closest('.bccf-toggle').querySelectorAll('button').forEach(function(b) {
                b.classList.toggle('active', b.dataset.value === newMode);
            });
            var newUrl = swapModeUrl(_lastDataUrl, newMode);
            loadData(newUrl);
            return;
        }

        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;

        if (action === 'refresh') {
            loadData(_lastDataUrl);
            return;
        }

        if (action === 'retry') {
            if (_lastDataUrl) loadData(_lastDataUrl);
            return;
        }

        if (action === 'close-toast') {
            var t = btn.closest('.bccf-toast');
            if (t && t.parentNode) t.parentNode.removeChild(t);
            return;
        }
    });

    // ── Boot ─────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function() {
        var dataUrl = document.body.dataset.dataUrl;
        if (dataUrl) loadData(dataUrl);
    });

})();
`;
    /* eslint-enable */

    // ─── Entry Point ──────────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;

        if (request.method !== 'GET') {
            response.write('Method not allowed');
            return;
        }

        try {
            const projectId = request.parameters.projectId;
            const mode      = request.parameters.mode === 'accrual' ? 'accrual' : 'cash';
            const range = _resolveRangeOrDefault(
                request.parameters.startPeriod,
                request.parameters.endPeriod
            );

            if (!projectId) {
                response.write(
                    '<!doctype html><html><body style="font-family:sans-serif;padding:40px;color:#666">'
                    + '<p>Missing required parameter: <strong>projectId</strong></p></body></html>'
                );
                return;
            }

            const dataUrl = resolveDataUrl(projectId, mode, range);

            const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Combined Cash Flow</title>
    ${Styles.getStyles()}
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { padding: 16px; background: var(--bccf-bg-50); }
        .bccf-layout { display: flex; flex-direction: column; gap: 16px; }
        /* Table: alternate row shading */
        table tbody tr:hover { background: var(--bccf-bg-50); }
        /* KPI accent override — let JS color the value via inline style */
        .bccf-kpi.accent .bccf-v { color: inherit; }
    </style>
</head>
<body data-data-url="${UI.esc(dataUrl)}">
    <div id="bccf-toast-host"></div>
    <div class="bccf-layout">
        ${buildHeader(projectId, mode, range)}
        ${buildSkeletonKpis()}
        ${buildSkeletonChart()}
        ${buildSkeletonTable()}
    </div>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;

            response.write(html);

        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write(
                `<!doctype html><html><body style="font-family:sans-serif;padding:40px">
                    <div class="bccf-error-card" style="border-left:4px solid #c2361d;padding:14px 16px">
                        <h3 style="color:#c2361d;margin:0 0 8px">Cash Flow Report Error</h3>
                        <p style="color:#2f3742">${UI.esc(e.message)}</p>
                    </div>
                </body></html>`
            );
        }
    };

    return { onRequest };
});

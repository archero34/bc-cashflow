/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Portfolio Cash Flow rollup — shell-only Suitelet.
 *              Returns an HTML skeleton immediately; client JS fetches from
 *              bc_cf_data_sl (action=portfolio) and swaps in real content on resolve.
 *
 * URL Params (passed through to data SL via data-data-url):
 *   mode         – 'cash' (default) | 'accrual'
 *   startPeriod  – YYYY-MM (optional; falls back to rolling default)
 *   endPeriod    – YYYY-MM (optional; falls back to rolling default)
 *   active       – '0' or 'false' to include inactive projects (default: true = active only)
 *   projects     – comma-separated internal IDs (optional)
 *   managers     – comma-separated internal IDs (optional)
 *   customers    – comma-separated internal IDs (optional)
 *   subsidiaries – comma-separated internal IDs (optional)
 *
 * Script ID:  customscript_bc_cf_portfolio_sl
 * Deploy  ID: customdeploy_bc_cf_portfolio_sl
 *
 * @module  entry_points/bc_cf_portfolio_sl
 * @author  BlueCollar
 */
define([
    'N/log',
    'N/url',
    '../modules/bc_cf_styles',
    '../modules/bc_cf_ui'
], (log, url, Styles, UI) => {

    const MODULE = 'bc_cf_portfolio_sl';
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

    // ─── Filter helpers (E2-specific) ────────────────────────────────────────

    const ID_CSV = /^(\d+)(,\d+)*$/;

    /**
     * Parse URL params into a filters object, degrading bad params to defaults
     * (HTML page, not JSON — never errors).
     *
     * - active: default true. Pass active=0 or active=false to disable.
     * - 4 multi-select dims: empty array if absent or malformed.
     */
    const _resolveFiltersOrDefault = (params) => {
        const rawActive = params.active;
        const active = !(rawActive === '0' || (typeof rawActive === 'string' && rawActive.toLowerCase() === 'false'));
        const parseCsv = (raw) => (raw && ID_CSV.test(raw)) ? raw.split(',').map(Number) : [];
        return {
            active,
            projects:     parseCsv(params.projects),
            managers:     parseCsv(params.managers),
            customers:    parseCsv(params.customers),
            subsidiaries: parseCsv(params.subsidiaries)
        };
    };

    /** How many filter dimensions are non-default. Default = active:true + empty arrays. */
    const _countActiveFilters = (filters) => {
        let n = 0;
        if (filters.active !== true) n++;
        if (filters.projects.length)     n++;
        if (filters.managers.length)     n++;
        if (filters.customers.length)    n++;
        if (filters.subsidiaries.length) n++;
        return n;
    };

    // ─── Server-side helpers ──────────────────────────────────────────────────

    /**
     * Resolve the data SL URL server-side so the client never hardcodes paths.
     * Only emits non-default filter params (smaller URLs for the default case).
     */
    const resolveDataUrl = (mode, range, filters) => {
        const dataParams = {
            action:       'portfolio',
            mode:         mode || 'cash',
            startPeriod:  range.startPeriod,
            endPeriod:    range.endPeriod
        };
        // Only emit non-default filter params (smaller URLs for the default case)
        if (filters.active === false) dataParams.active = '0';
        if (filters.projects.length)     dataParams.projects     = filters.projects.join(',');
        if (filters.managers.length)     dataParams.managers     = filters.managers.join(',');
        if (filters.customers.length)    dataParams.customers    = filters.customers.join(',');
        if (filters.subsidiaries.length) dataParams.subsidiaries = filters.subsidiaries.join(',');
        return url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: dataParams
        });
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
     * Server-renders the Filters pill (trigger + panel). Each chip dimension's
     * existing selections render as chips at server-time; option dropdowns
     * are placeholders until the client populates them from data.availableX.
     * Spec §3.5 (adapted: single active checkbox, not 4-state status segmented).
     */
    const buildFiltersPicker = (filters) => {
        const activeCount = _countActiveFilters(filters);
        const badge = activeCount > 0 ? `Filters · ${activeCount} active` : 'Filters';

        // Multi-select chip slot — chips for existing selections + empty <select> for adds.
        // Chip text starts as "#<id>"; client (Task 16) replaces with real names from data.availableX.
        const chipSlot = (dim, ids) => {
            const chips = ids.map((id) =>
                `<span class="bccf-chip" data-id="${id}">#${id}<button type="button" class="bccf-chip-x" data-action="remove-chip" data-dim="${dim}" data-id="${id}">×</button></span>`
            ).join('');
            return `<div class="bccf-filters-chips" data-dim="${dim}">${chips}<select class="bccf-filters-add" data-dim="${dim}"><option value="">+ Add…</option></select></div>`;
        };

        const activeChecked = filters.active ? ' checked' : '';

        return `
            <div class="bccf-filters" id="bccf-filters" data-active-count="${activeCount}">
                <button type="button" class="bccf-filters-trigger" data-action="open-filters">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    <span class="bccf-filters-label">${UI.esc(badge)}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="bccf-filters-panel" style="display:none">
                    <div class="bccf-filters-active">
                        <input type="checkbox" id="bccf-filter-active" data-filter="active"${activeChecked} />
                        <label for="bccf-filter-active">Active projects only</label>
                    </div>

                    <h4>Project</h4>
                    ${chipSlot('projects', filters.projects)}

                    <h4>Project Manager</h4>
                    ${chipSlot('managers', filters.managers)}

                    <h4>Customer</h4>
                    ${chipSlot('customers', filters.customers)}

                    <h4>Subsidiary</h4>
                    ${chipSlot('subsidiaries', filters.subsidiaries)}

                    <div class="bccf-filters-actions">
                        <button type="button" class="bccf-btn bccf-btn-ghost" data-action="reset-filters">Reset all</button>
                        <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-filters">Apply</button>
                    </div>
                </div>
            </div>`
    };

    /**
     * Header panel — fully rendered server-side (cheap chrome, no data needed).
     */
    const buildHeader = (mode, range, filters) => {
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
                    Portfolio Cash Flow
                </h1>
                ${pill}
            </div>`;

        const headerRight = `
            <div style="display:flex;align-items:center;gap:8px">
                ${buildPicker(range)}
                ${buildFiltersPicker(filters)}
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

    /** Chart panel with skeleton bars — #bccf-chart wraps the whole panel */
    const buildSkeletonChart = () => {
        return `<div id="bccf-chart">${UI.panel({
            header: `<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly portfolio cash flow</span>`,
            body: UI.skeletonChart(6)
        })}</div>`;
    };

    /** Table panel with skeleton rows — #bccf-table wraps the whole panel */
    const buildSkeletonTable = () => {
        // thead: Project + 6 period cols + Total = 8 cols
        const headerRow = '<tr><th>Project</th>' + Array(6).fill('<th></th>').join('') + '<th>Total</th></tr>';
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
    // Task 13: fetch + render KPIs/chart/table.
    // Sort plumbing (Task 14), Filters pill JS (Task 15), and Filters dropdown
    // population (Task 16) land in subsequent tasks.
    //
    /* eslint-disable */
    const CLIENT_SCRIPT = `
(function () {
    'use strict';

    // ── Double-evaluation guard ──────────────────────────────────────────────
    if (window.__bccfWiredPortfolio) return;
    window.__bccfWiredPortfolio = true;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function fmtCurrency(n) {
        var abs = Math.abs(n);
        var formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (n < 0 ? '\\u2212' : '') + '$' + formatted;
    }
    function fmtPct(n) {
        return (n < 0 ? '\\u2212' : '') + Math.abs(n).toFixed(1) + '%';
    }
    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function currentYYYYMM() {
        var now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    function labelToYYYYMM(label) {
        var MONTHS = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
        var parts = label.split(' ');
        if (parts.length < 2) return '';
        return parts[1] + '-' + (MONTHS[parts[0]] || '00');
    }

    // ── Render KPIs ──────────────────────────────────────────────────────────

    function renderKpis(kpis, portfolioTotals) {
        portfolioTotals = portfolioTotals || { revenue: 0, cost: 0, net: 0, margin: 0 };
        var netColor = kpis.netCashFlow >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
        return '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(kpis.totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(portfolioTotals.revenue)) + ' portfolio total</div>'
            + '</div>'
            + '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Cost</div>'
                + '<div class="bccf-v" style="color:var(--bccf-cost-500)">' + esc(fmtCurrency(kpis.totalCost)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(portfolioTotals.cost)) + ' portfolio total</div>'
            + '</div>'
            + '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Net Cash Flow</div>'
                + '<div class="bccf-v" style="color:' + netColor + '">' + esc(fmtCurrency(kpis.netCashFlow)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(portfolioTotals.net)) + ' portfolio / ' + esc(fmtPct(portfolioTotals.margin)) + ' overall</div>'
            + '</div>'
            + '<div class="bccf-kpi">'
                + '<div class="bccf-k">Margin</div>'
                + '<div class="bccf-v">' + esc(fmtPct(kpis.margin)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtPct(portfolioTotals.margin)) + ' portfolio overall</div>'
            + '</div>';
    }

    // ── Render Chart ─────────────────────────────────────────────────────────
    // Verbatim port of Combined's renderChart, driven by portfolio aggregates.

    function renderChart(periods, revPerPeriod, costPerPeriod, cumulativeBefore) {
        var BAR_MAX_H = 140;
        var allAmounts = (revPerPeriod || []).concat(costPerPeriod || []);
        var maxAmt = allAmounts.reduce(function(m, v) { return Math.max(m, v); }, 1);
        function barH(v) { return Math.max(2, Math.round((v / maxAmt) * BAR_MAX_H)); }
        var curYYYYMM = currentYYYYMM();

        var barCols = periods.map(function(label, i) {
            var rev = revPerPeriod[i] || 0;
            var cost = costPerPeriod[i] || 0;
            var isNow = labelToYYYYMM(label) === curYYYYMM;
            var haloStyle = isNow ? 'background:var(--bccf-brand-50);border-radius:6px 6px 0 0;' : '';
            return '<div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;flex:1;min-width:48px;height:' + BAR_MAX_H + 'px;' + haloStyle + '">'
                + '<div style="display:flex;align-items:flex-end;gap:2px">'
                    + '<div class="bccf-bar" data-tip="Revenue: ' + esc(fmtCurrency(rev)) + '" style="width:16px;height:' + barH(rev) + 'px;background:var(--bccf-brand-500);border-radius:3px 3px 0 0"></div>'
                    + '<div class="bccf-bar" data-tip="Cost: ' + esc(fmtCurrency(cost)) + '" style="width:16px;height:' + barH(cost) + 'px;background:var(--bccf-cost-500);border-radius:3px 3px 0 0"></div>'
                + '</div>'
            + '</div>';
        });

        var labelCols = periods.map(function(label, i) {
            var isNow = labelToYYYYMM(label) === curYYYYMM;
            var haloStyle = isNow ? 'background:var(--bccf-brand-50);border-radius:0 0 6px 6px;' : '';
            return '<div style="flex:1;min-width:48px;text-align:center;font-size:11px;color:var(--bccf-ink-500);padding:6px 0;' + haloStyle + '">' + esc(label) + '</div>';
        });

        // Cumulative net trend line
        var net = periods.map(function(_, i) { return (revPerPeriod[i] || 0) - (costPerPeriod[i] || 0); });
        var carry = Number(cumulativeBefore) || 0;
        var cumNet = net.reduce(function(acc, n) {
            var prev = acc.length === 0 ? carry : acc[acc.length - 1];
            acc.push(prev + n);
            return acc;
        }, []);
        var cumMax = Math.max(0, Math.max.apply(null, cumNet));
        var cumMin = Math.min(0, Math.min.apply(null, cumNet));
        var cumRange = (cumMax - cumMin) || 1;
        var trendPoints = cumNet.map(function(v, i) {
            var x = (i + 0.5) / periods.length * 100;
            var y = 100 - ((v - cumMin) / cumRange) * 100;
            return { x: x, y: y, value: v, label: periods[i] };
        });
        var polyPoints = trendPoints.map(function(p) { return p.x + ',' + p.y; }).join(' ');
        var dotsHtml = trendPoints.map(function(p) {
            var color = p.value >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<span class="bccf-trend-dot" data-tip="' + esc(fmtCurrency(p.value)) + '" style="position:absolute;left:' + p.x + '%;top:' + p.y + '%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 2px var(--bccf-surface);"></span>';
        }).join('');
        var svgOverlay = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">'
            + '<polyline points="' + polyPoints + '" fill="none" stroke="var(--bccf-success-500)" stroke-width="2" vector-effect="non-scaling-stroke" />'
            + '</svg>'
            + dotsHtml;

        var legend = '<div style="display:flex;align-items:center;gap:16px;font-size:12px;color:var(--bccf-ink-500)">'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-brand-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Revenue</span>'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-cost-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Cost</span>'
            + '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="18" height="6" viewBox="0 0 18 6" style="display:block"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--bccf-success-500)" stroke-width="2" /><circle cx="9" cy="3" r="1.6" fill="var(--bccf-success-500)" /></svg>Cumulative Net</span>'
        + '</div>';
        var headerHtml = '<div style="font-weight:600">Monthly portfolio cash flow</div>' + legend;

        var barsHtml = '<div>'
            + '<div style="position:relative">'
                + '<div style="display:flex;align-items:flex-end;gap:8px;padding:16px 0 0">' + barCols.join('') + '</div>'
                + svgOverlay
            + '</div>'
            + '<div style="display:flex;gap:8px">' + labelCols.join('') + '</div>'
        + '</div>';

        return '<div class="bccf-panel" style="margin-bottom:16px">'
            + '<div class="bccf-panel-header">' + headerHtml + '</div>'
            + '<div class="bccf-panel-body">' + barsHtml + '</div>'
        + '</div>';
    }

    // ── Render Table — one row per project ───────────────────────────────────

    function renderTable(periods, projects) {
        if (!projects || !projects.length) {
            return '<div class="bccf-panel">'
                + '<div class="bccf-panel-body" style="padding:24px;text-align:center;color:var(--bccf-ink-500)">No projects match these filters.</div>'
            + '</div>';
        }

        var headCols = periods.map(function(p) {
            return '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap">' + esc(p) + '</th>';
        }).join('');
        var thead = '<thead><tr>'
            + '<th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--bccf-ink-500)">Project</th>'
            + headCols
            + '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500)">Total</th>'
        + '</tr></thead>';

        function projectRow(proj) {
            var cells = proj.net.map(function(v) {
                var color = v > 0 ? 'var(--bccf-success-500)' : (v < 0 ? 'var(--bccf-danger-500)' : 'var(--bccf-ink-500)');
                return '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);color:' + color + ';font-variant-numeric:tabular-nums">'
                    + esc(fmtCurrency(v)) + '</td>';
            }).join('');
            var totalColor = proj.netTotal > 0 ? 'var(--bccf-success-500)' : (proj.netTotal < 0 ? 'var(--bccf-danger-500)' : 'var(--bccf-ink-700)');
            var href = '/app/common/custom/custrecordentry.nl?rectype=customrecord_cseg_bc_project&id=' + encodeURIComponent(proj.id);
            return '<tr>'
                + '<td style="padding:6px 12px;font-size:var(--bccf-text-sm)">'
                    + '<a href="' + href + '" target="_top" style="color:var(--bccf-brand-500);text-decoration:none">' + esc(proj.name) + '</a>'
                + '</td>'
                + cells
                + '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + totalColor + ';font-variant-numeric:tabular-nums">' + esc(fmtCurrency(proj.netTotal)) + '</td>'
            + '</tr>';
        }

        var rows = projects.map(projectRow).join('');

        // Portfolio Net tfoot row
        var portfolioNetCells = periods.map(function(_, i) {
            var net = projects.reduce(function(s, p) { return s + (p.net[i] || 0); }, 0);
            var color = net >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + color + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(net)) + '</td>';
        }).join('');
        var grandNet = projects.reduce(function(s, p) { return s + p.netTotal; }, 0);
        var grandColor = grandNet >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
        var tfoot = '<tfoot><tr>'
            + '<td style="padding:8px 12px;font-size:var(--bccf-text-sm);font-weight:700;color:var(--bccf-ink-900);border-top:2px solid var(--bccf-border)">Portfolio Net</td>'
            + portfolioNetCells
            + '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:700;color:' + grandColor + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(grandNet)) + '</td>'
        + '</tr></tfoot>';

        return '<div class="bccf-panel">'
            + '<div class="bccf-panel-body" style="padding:0;overflow-x:auto">'
                + '<table style="width:100%;border-collapse:collapse">' + thead + '<tbody>' + rows + '</tbody>' + tfoot + '</table>'
            + '</div>'
        + '</div>';
    }

    // ── Fetch + render ───────────────────────────────────────────────────────

    var _lastDataUrl = null;
    var _lastData = null;

    function loadData(dataUrl) {
        _lastDataUrl = dataUrl;
        fetch(dataUrl)
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
            .then(function(data) {
                if (!data.ok) throw new Error(data.error || 'Data SL returned ok:false');
                _lastData = data;
                var kpiEl   = document.getElementById('bccf-kpis');
                var chartEl = document.getElementById('bccf-chart');
                var tableEl = document.getElementById('bccf-table');
                if (kpiEl)   kpiEl.innerHTML   = renderKpis(data.kpis, data.portfolioTotals);
                if (chartEl) chartEl.innerHTML = renderChart(data.periods, data.portfolioRevenuePerPeriod, data.portfolioCostPerPeriod, data.cumulativeBefore);
                if (tableEl) tableEl.innerHTML = renderTable(data.periods, data.projects);
            })
            .catch(function(err) {
                var msg = err.message || String(err);
                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) kpiEl.innerHTML = '<div class="bccf-error-card" style="grid-column:1/-1"><h4>Couldn\\u2019t load portfolio</h4><pre>' + esc(msg) + '</pre><button type="button" class="bccf-btn" data-action="retry">Retry</button></div>';
            });
    }

    // ── Mode toggle (Cash/Accrual) — same pattern as report SLs ──────────────
    function swapModeUrl(currentUrl, newMode) {
        var u = new URL(currentUrl, window.location.href);
        u.searchParams.set('mode', newMode);
        return u.toString();
    }
    document.addEventListener('click', function(e) {
        var toggleBtn = e.target.closest('[data-toggle-id="mode"] button');
        if (toggleBtn) {
            if (toggleBtn.classList.contains('active')) return;
            var newMode = toggleBtn.dataset.value;
            if (!newMode || !_lastDataUrl) return;
            toggleBtn.closest('.bccf-toggle').querySelectorAll('button').forEach(function(b) {
                b.classList.toggle('active', b.dataset.value === newMode);
            });
            loadData(swapModeUrl(_lastDataUrl, newMode));
            try {
                var iframeUrl = new URL(window.location.href);
                iframeUrl.searchParams.set('mode', newMode);
                history.replaceState(null, '', iframeUrl.toString());
            } catch (err) { /* iframe history may be restricted */ }
            return;
        }
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'refresh' || btn.dataset.action === 'retry') {
            if (_lastDataUrl) loadData(_lastDataUrl);
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
            const params = request.parameters || {};
            const mode = params.mode === 'accrual' ? 'accrual' : 'cash';
            const range = _resolveRangeOrDefault(params.startPeriod, params.endPeriod);
            const filters = _resolveFiltersOrDefault(params);
            const dataUrl = resolveDataUrl(mode, range, filters);

            const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Portfolio Cash Flow</title>
    ${Styles.getStyles()}
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { padding: 16px; background: var(--bccf-bg-50); }
        .bccf-layout { display: flex; flex-direction: column; gap: 16px; }
        table tbody tr:hover { background: var(--bccf-bg-50); }
        .bccf-kpi.accent .bccf-v { color: inherit; }
    </style>
</head>
<body data-data-url="${UI.esc(dataUrl)}">
    <div id="bccf-toast-host"></div>
    <div class="bccf-layout">
        ${buildHeader(mode, range, filters)}
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
                        <h3 style="color:#c2361d;margin:0 0 8px">Portfolio Cash Flow Error</h3>
                        <p style="color:#2f3742">${UI.esc(e.message)}</p>
                    </div>
                </body></html>`
            );
        }
    };

    return { onRequest };
});

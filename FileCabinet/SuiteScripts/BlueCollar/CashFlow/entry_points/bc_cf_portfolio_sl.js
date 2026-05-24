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

    // Filters pill renders in Task 12. Placeholder for now:
    const buildFiltersPicker = (filters) => '<!-- filters pill placeholder; lands in Task 12 -->';

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
    // Empty IIFE shell — implementation lands in Tasks 13–16.
    // Double-evaluation guard: if (window.__bccfWiredPortfolio) return;
    //
    /* eslint-disable */
    const CLIENT_SCRIPT = `
(function () {
    'use strict';

    // Double-evaluation guard
    if (window.__bccfWiredPortfolio) return;
    window.__bccfWiredPortfolio = true;

    // Implementation lands in Tasks 13-16:
    //   - Task 13: fetch + render KPIs/chart/table
    //   - Task 14: sort plumbing
    //   - Task 15: Filters pill JS (open/close, status, chips, Apply)
    //   - Task 16: populate Filters dropdowns from data.availableProjects etc.

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

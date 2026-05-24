/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Revenue Inflows Report — shell-only Suitelet.
 *              Returns an HTML skeleton immediately; client JS fetches from
 *              bc_cf_data_sl (?action=revenue) and swaps in real content on resolve.
 *
 * URL Params (passed through to data SL via data-data-url):
 *   projectId – internal ID of the BC Project
 *   mode      – 'cash' (default) | 'accrual'
 *
 * Script ID:  customscript_bc_cf_rev_report_sl
 * Deploy  ID: customdeploy_bc_cf_rev_report_sl
 *
 * Spec: §3.4 (layout), §3.5 (no in-iframe nav tabs), §3.6 (KPIs — revenue only),
 *       §3.7 (navy color encoding), §3.8 (single-color chart), §3.16 (skeletons)
 *
 * @module  entry_points/bc_cf_rev_report_sl
 * @author  BlueCollar
 */
define([
    'N/log',
    'N/url',
    '../modules/bc_cf_styles',
    '../modules/bc_cf_ui'
], (log, url, Styles, UI) => {

    const MODULE = 'bc_cf_rev_report_sl';
    const DATA_SCRIPT_ID  = 'customscript_bc_cf_data_sl';
    const DATA_DEPLOY_ID  = 'customdeploy_bc_cf_data_sl';

    // ─── Date range helpers (mirror of bc_cf_data_sl helpers; intentional duplication per spec §3.2) ────

    const _YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
    const _validateYYYYMM = (s) => typeof s === 'string' && _YYYYMM_RE.test(s);
    const _addMonths = (yyyymm, n) => {
        const [y, m] = yyyymm.split('-').map(Number);
        const d = new Date(Date.UTC(y, (m - 1) + n, 1));
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '00');
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
                action:      'revenue',
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
                    Revenue Inflows
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
        const labels = ['Total Revenue', 'Base Contract', 'Change Orders', 'Peak Month'];
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
            header: `<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Revenue Inflow</span>`,
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
    // Double-evaluation guard: if (window.__bccfWiredRevenue) return;
    //
    /* eslint-disable */
    const CLIENT_SCRIPT = `
(function () {
    'use strict';

    // ── Double-evaluation guard ──────────────────────────────────────────────
    if (window.__bccfWiredRevenue) return;
    window.__bccfWiredRevenue = true;

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Format a number as currency.
     *   Positive:  $1,005.00
     *   Negative:  −$1,500.00   (Unicode minus U+2212, not ASCII hyphen)
     */
    function fmtCurrency(n) {
        var abs = Math.abs(n);
        var formatted = abs.toLocaleString('en-US', {
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
     * Build 4 KPI cards for revenue-only view:
     *   Total Revenue  — accent class, navy value (--bccf-brand-500) per §3.7
     *   Base Contract  — default ink, % of total
     *   Change Orders  — default ink, CO count + % of total
     *   Peak Month     — default ink, highest month amount + % of total
     *
     * Per spec §3.6, §3.7 — bccf-k / bccf-v / bccf-sub inner classes.
     */
    function renderKpis(kpis, categories, projectTotals) {
        projectTotals = projectTotals || { revenue: 0, baseContract: 0, changeOrders: 0 };

        var totalRevenue = kpis.totalRevenue  || 0;
        var baseContract = kpis.baseContract  || 0;
        var changeOrders = kpis.changeOrders  || 0;
        var peakMonth    = kpis.peakMonth     || 0;

        var basePct  = totalRevenue ? fmtPct((baseContract / totalRevenue) * 100) : '0.0%';
        var coPct    = totalRevenue ? fmtPct((changeOrders / totalRevenue) * 100) : '0.0%';
        var peakPct  = totalRevenue ? fmtPct((peakMonth    / totalRevenue) * 100) : '0.0%';

        var coCount = 0;
        if (categories && categories.revenue && categories.revenue.lines) {
            coCount = categories.revenue.lines.filter(function(l) {
                return l.id && l.id.indexOf('CO:') === 0;
            }).length;
        }
        var coCountLabel = coCount + ' CO';

        var cards = [
            // 1. Total Revenue (range) — subline: project total
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.revenue)) + ' project total</div>'
            + '</div>',

            // 2. Base Contract (in range) — subline: project total
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Base Contract</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(baseContract)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.baseContract)) + ' project total &middot; ' + esc(basePct) + ' of range</div>'
            + '</div>',

            // 3. Change Orders (in range) — subline: project total + CO count
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Change Orders</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(changeOrders)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.changeOrders)) + ' project total &middot; ' + esc(coCountLabel) + '</div>'
            + '</div>',

            // 4. Peak Month (in range)
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Peak Month</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(peakMonth)) + '</div>'
                + '<div class="bccf-sub">' + esc(peakPct) + ' of range</div>'
            + '</div>'
        ];

        return cards.join('');
    }

    // ── Render Chart ─────────────────────────────────────────────────────────

    /**
     * Single bar per month, navy color (--bccf-brand-500), using .bccf-bar.revenue class.
     * Amount label above each bar.
     * Current month gets .now class: brand-50 halo + bolded label + ▲ glyph.
     * Heights normalized to largest bar amount in the dataset.
     * Spec §3.8.
     */
    function renderChart(periods, categories) {
        var revTotal = categories.revenue.total;
        var BAR_MAX_H = 140; // px

        // Find max for normalization
        var maxAmt = revTotal.reduce(function(m, v) { return Math.max(m, v); }, 1);

        function barH(v) {
            return Math.max(2, Math.round((v / maxAmt) * BAR_MAX_H));
        }

        var curYYYYMM = currentYYYYMM();

        // E1.5: bars and labels live in separate rows so the halo splits cleanly
        // across top-rounded (bars row) and bottom-rounded (labels row).
        // Each revenue bar gets data-tip="$..." — dollar amount via fmtCurrency (no native title).
        var barCols = periods.map(function(label, i) {
            var rev = revTotal[i] || 0;
            var isNow = labelToYYYYMM(label) === curYYYYMM;
            var h = barH(rev);
            var haloStyle = isNow ? 'background:var(--bccf-brand-50);border-radius:6px 6px 0 0;' : '';
            return '<div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;flex:1;min-width:48px;height:' + BAR_MAX_H + 'px;' + haloStyle + '">'
                + '<div style="display:flex;align-items:flex-end">'
                    + '<div class="bccf-bar revenue" data-tip="' + esc(fmtCurrency(rev)) + '" style="width:24px;height:' + h + 'px;border-radius:3px 3px 0 0"></div>'
                + '</div>'
            + '</div>';
        });

        var labelCols = periods.map(function(label, i) {
            var isNow = labelToYYYYMM(label) === curYYYYMM;
            var haloStyle = isNow ? 'background:var(--bccf-brand-50);border-radius:0 0 6px 6px;' : '';
            return '<div style="flex:1;min-width:48px;text-align:center;font-size:11px;color:var(--bccf-ink-500);padding:6px 0;' + haloStyle + '">'
                + esc(label)
            + '</div>';
        });

        var headerHtml = '<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Revenue Inflow</span>';

        var barsHtml = '<div>'
            + '<div style="display:flex;align-items:flex-end;gap:8px;padding:16px 0 0">' + barCols.join('') + '</div>'
            + '<div style="display:flex;gap:8px">' + labelCols.join('') + '</div>'
        + '</div>';

        return '<div class="bccf-panel" style="margin-bottom:16px">'
            + '<div class="bccf-panel-header">' + headerHtml + '</div>'
            + '<div class="bccf-panel-body">' + barsHtml + '</div>'
        + '</div>';
    }

    // ── Render Table ─────────────────────────────────────────────────────────

    /**
     * Revenue-only table:
     *   thead: Source | <period labels> | Total
     *   tbody: "Revenue Forecast" category row (bold, navy) + sub-rows per line (indented)
     *   tfoot: Grand Total row — no Net row (revenue-only report)
     * Spec §3.9 (table section).
     */
    function renderTable(periods, categories) {
        var rev = categories.revenue;
        if (rev) rev = Object.assign({}, rev, { lines: sortLines(rev.lines, periods, _sortState) });

        // ── thead ──
        // E1.5: sortable headers — each <th> carries data-sort-col + active indicator.
        // Fixed sort keys for static columns: data-sort-col="source" data-sort-col="total"
        function headerCell(labelText, sortKey, align) {
            var isActive = _sortState.col === sortKey;
            var glyph = _sortState.dir === 'desc' ? '▼' : '▲';
            var indicator = isActive
                ? '<span style="margin-left:4px;color:var(--bccf-brand-500)">' + glyph + '</span>'
                : '';
            var alignStyle = align === 'left' ? 'text-align:left' : 'text-align:right';
            return '<th data-sort-col="' + esc(sortKey) + '" '
                + 'style="padding:8px 12px;font-size:12px;color:var(--bccf-ink-500);'
                + 'white-space:nowrap;cursor:pointer;user-select:none;' + alignStyle + '">'
                + esc(labelText) + indicator
                + '</th>';
        }
        var headCols = periods.map(function(p) { return headerCell(p, p, 'right'); }).join('');
        var thead = '<thead><tr>'
            + headerCell('Source', 'source', 'left')
            + headCols
            + headerCell('Total', 'total', 'right')
        + '</tr></thead>';

        // Use local alias for the rest of the function (revenue → rev)
        var revenue = rev;

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
        var revRows = revenue.lines.map(lineRow).join('');

        var tbody = '<tbody>'
            + catRow('Revenue Forecast', 'var(--bccf-brand-500)')
            + revRows
            + totalRow('Total', revenue.total, revenue.grandTotal, 'var(--bccf-brand-500)')
        + '</tbody>';

        // ── tfoot: Grand Total — no Net row for revenue-only ──
        var totalCells = revenue.total.map(function(v) {
            return '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:var(--bccf-ink-900);border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">'
                + esc(fmtCurrency(v)) + '</td>';
        }).join('');

        var tfoot = '<tfoot><tr>'
            + '<td style="padding:8px 12px;font-size:var(--bccf-text-sm);font-weight:700;color:var(--bccf-ink-900);border-top:2px solid var(--bccf-border)">Grand Total</td>'
            + totalCells
            + '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:700;color:var(--bccf-ink-900);border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(revenue.grandTotal)) + '</td>'
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
    var _lastData = null;

    // Skeleton HTML strings for re-painting regions on refresh (Bug 2 fix)
    var SKEL_KPIS = (function() {
        var cards = '';
        ['Total Revenue','Base Contract','Change Orders','Peak Month'].forEach(function(label) {
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
            + '<div class="bccf-panel-header"><span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Revenue Inflow</span></div>'
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
                _lastData = data;
                applyBoundsToPicker(data.availableBounds);

                // Bug 1: use innerHTML on stable wrapper divs (IDs never destroyed)
                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis, data.categories, data.projectTotals);

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

    // ── Sortable headers (E1.5 spec §3.3) ────────────────────────────────────

    // Lives in the IIFE closure: survives mode toggle + refresh (JSON re-fetch
    // keeps IIFE alive), resets on picker Apply (window.location.replace
    // re-evaluates the IIFE). Spec D8.
    var _sortState = { col: 'source', dir: 'desc' };

    /**
     * Returns a new array of lines sorted by sortState. Never mutates input.
     * Rules:
     *  - col='source' → compare createdDate strings (lexicographic == chronological for YYYY-MM-DD)
     *  - col='total'  → compare line.total
     *  - col=<period> → compare amounts[periodIdx]; missing = 0
     *  - null createdDate always sorts to end (regardless of dir)
     *  - dir='desc' = largest first / newest first; dir='asc' = smallest first / oldest first
     */
    function sortLines(lines, periods, sortState) {
        if (!lines || !lines.length) return lines;
        var sorted = lines.slice();
        var dir = sortState.dir === 'asc' ? 1 : -1;

        sorted.sort(function(a, b) {
            var va, vb;
            if (sortState.col === 'source') {
                va = a.createdDate;
                vb = b.createdDate;
                if (va === null && vb === null) return 0;
                if (va === null) return 1;
                if (vb === null) return -1;
                return va < vb ? -dir : (va > vb ? dir : 0);
            }
            if (sortState.col === 'total') {
                va = a.total || 0;
                vb = b.total || 0;
            } else {
                var idx = periods.indexOf(sortState.col);
                if (idx === -1) return 0;
                va = (a.amounts && a.amounts[idx]) || 0;
                vb = (b.amounts && b.amounts[idx]) || 0;
            }
            return va < vb ? -dir : (va > vb ? dir : 0);
        });

        return sorted;
    }

    // Click handler — 2-state on Source, 3-state on Period/Total.
    // Independent of the existing picker / mode-toggle handlers; each fires
    // on every click and short-circuits if its target isn't matched.
    document.addEventListener('click', function(e) {
        var th = e.target.closest('[data-sort-col]');
        if (!th) return;

        var col = th.dataset.sortCol;
        var was = _sortState;

        if (col === 'source') {
            // 2-state: desc ↔ asc
            _sortState = (was.col === 'source' && was.dir === 'desc')
                ? { col: 'source', dir: 'asc' }
                : { col: 'source', dir: 'desc' };
        } else {
            // 3-state: desc → asc → reset (Source desc)
            if (was.col !== col) {
                _sortState = { col: col, dir: 'desc' };
            } else if (was.dir === 'desc') {
                _sortState = { col: col, dir: 'asc' };
            } else {
                _sortState = { col: 'source', dir: 'desc' };
            }
        }

        if (_lastData) {
            var tableEl = document.getElementById('bccf-table');
            if (tableEl) tableEl.innerHTML = renderTable(_lastData.periods, _lastData.categories);
        }
    });

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
            try {
                var iframeUrl = new URL(window.location.href);
                iframeUrl.searchParams.set('mode', newMode);
                history.replaceState(null, '', iframeUrl.toString());
            } catch (err) { /* iframe history may be restricted; non-fatal */ }
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
    <title>Revenue Inflows</title>
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
                        <h3 style="color:#c2361d;margin:0 0 8px">Revenue Inflows Report Error</h3>
                        <p style="color:#2f3742">${UI.esc(e.message)}</p>
                    </div>
                </body></html>`
            );
        }
    };

    return { onRequest };
});

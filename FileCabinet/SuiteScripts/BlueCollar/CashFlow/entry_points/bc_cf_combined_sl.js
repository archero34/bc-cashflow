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

    // ─── Server-side helpers ──────────────────────────────────────────────────

    /**
     * Resolve the data SL URL server-side so the client never hardcodes paths.
     * returnExternalUrl: false → same-domain session cookies flow correctly
     * inside the iframe.
     */
    const resolveDataUrl = (projectId, mode) => {
        const base = url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: {
                action:    'combined',
                projectId: String(projectId),
                mode:      mode || 'cash'
            }
        });
        return base;
    };

    // ─── Skeleton regions ─────────────────────────────────────────────────────

    /**
     * Header panel — fully rendered server-side (cheap chrome, no data needed).
     * No in-iframe nav tabs per spec §3.5 amendment 2026-05-23.
     */
    const buildHeader = (projectId, mode) => {
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
    function renderKpis(kpis) {
        var netColor = kpis.netCashFlow >= 0
            ? 'var(--bccf-success-500)'
            : 'var(--bccf-danger-500)';

        var cards = [
            // 1. Total Revenue — navy value per §3.7
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(kpis.totalRevenue)) + '</div>'
                + '<div class="bccf-sub">Forecast</div>'
            + '</div>',

            // 2. Total Cost — coral value per §3.7 (cost identity color)
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Cost</div>'
                + '<div class="bccf-v" style="color:var(--bccf-cost-500)">' + esc(fmtCurrency(kpis.totalCost)) + '</div>'
                + '<div class="bccf-sub">Forecast</div>'
            + '</div>',

            // 3. Net Cash Flow — accent class, net color on value per §3.7 + §3.15.5
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Net Cash Flow</div>'
                + '<div class="bccf-v" style="color:' + netColor + '">' + esc(fmtCurrency(kpis.netCashFlow)) + '</div>'
                + '<div class="bccf-sub">' + (kpis.netCashFlow >= 0 ? 'Positive' : 'Negative') + '</div>'
            + '</div>',

            // 4. Margin % — default ink color
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Margin</div>'
                + '<div class="bccf-v">' + esc(fmtPct(kpis.margin)) + '</div>'
                + '<div class="bccf-sub">Net / Revenue</div>'
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

        // Legend — gap:16px between swatches, margin-right:6px between swatch box and label (Bug 4 fix)
        var legend = '<div style="display:flex;align-items:center;gap:16px;font-size:12px;color:var(--bccf-ink-500)">'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-brand-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Revenue</span>'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-cost-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Cost</span>'
        + '</div>';

        var headerHtml = '<div style="display:flex;align-items:center;justify-content:space-between">'
            + '<div style="font-weight:600">Monthly cash flow</div>'
            + legend
        + '</div>';

        var barsHtml = '<div style="display:flex;align-items:flex-end;gap:8px;padding:16px 0 0">'
            + cols.join('')
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
        var cards = ‘’;
        [‘Total Revenue’,’Total Cost’,’Net Cash Flow’,’Margin’].forEach(function(label) {
            cards += ‘<div class="bccf-kpi">’
                + ‘<div class="bccf-k">’ + esc(label) + ‘</div>’
                + ‘<div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>’
                + ‘<div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>’
                + ‘</div>’;
        });
        return cards;
    }());

    var SKEL_CHART = (function() {
        var heights = [40, 70, 100, 90, 60, 30];
        var bars = heights.map(function(h) {
            return ‘<div class="bccf-skel bar-skel" style="flex:1;height:’ + h + ‘px;margin:0 3px;border-radius:3px 3px 0 0"></div>’;
        }).join(‘’);
        return ‘<div class="bccf-panel" style="margin-bottom:16px">’
            + ‘<div class="bccf-panel-header"><span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Cash Flow</span></div>’
            + ‘<div class="bccf-panel-body"><div style="display:flex;align-items:flex-end;height:120px;padding:14px 18px">’ + bars + ‘</div></div>’
            + ‘</div>’;
    }());

    var SKEL_TABLE = (function() {
        var widths = [80, 60, 70, 65, 75, 55, 90];
        var rows = ‘’;
        for (var r = 0; r < 5; r++) {
            rows += ‘<tr>’;
            for (var c = 0; c < 8; c++) {
                var w = widths[(r + c) % widths.length];
                rows += ‘<td><span class="bccf-skel" style="display:inline-block;width:’ + w + ‘px;height:12px"></span></td>’;
            }
            rows += ‘</tr>’;
        }
        return ‘<div class="bccf-panel">’
            + ‘<div class="bccf-panel-body" style="padding:0;overflow-x:auto">’
            + ‘<table style="width:100%;border-collapse:collapse"><tbody>’ + rows + ‘</tbody></table>’
            + ‘</div></div>’;
    }());

    function loadData(dataUrl) {
        _lastDataUrl = dataUrl;

        // Bug 2: repaint skeletons immediately so user sees loading state on refresh
        var kpiElSkel = document.getElementById(‘bccf-kpis’);
        if (kpiElSkel) kpiElSkel.innerHTML = SKEL_KPIS;
        var chartElSkel = document.getElementById(‘bccf-chart’);
        if (chartElSkel) chartElSkel.innerHTML = SKEL_CHART;
        var tableElSkel = document.getElementById(‘bccf-table’);
        if (tableElSkel) tableElSkel.innerHTML = SKEL_TABLE;

        fetch(dataUrl)
            .then(function(res) {
                if (!res.ok) throw new Error(‘HTTP ‘ + res.status);
                return res.json();
            })
            .then(function(data) {
                if (!data.ok) throw new Error(data.error || ‘Data SL returned ok:false’);

                // Bug 1: use innerHTML on stable wrapper divs (IDs never destroyed)
                var kpiEl = document.getElementById(‘bccf-kpis’);
                if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis);

                var chartEl = document.getElementById(‘bccf-chart’);
                if (chartEl) chartEl.innerHTML = renderChart(data.periods, data.categories);

                var tableEl = document.getElementById(‘bccf-table’);
                if (tableEl) tableEl.innerHTML = renderTable(data.periods, data.categories);
            })
            .catch(function(err) {
                var errHtml = renderError(err.message || String(err));

                var kpiEl = document.getElementById(‘bccf-kpis’);
                if (kpiEl) {
                    kpiEl.innerHTML = ‘<div class="bccf-error-card" style="grid-column:1/-1"><h4>Couldn\\u2019t load report data</h4><pre>’ + esc(err.message || ‘Unknown error’) + ‘</pre><button type="button" class="bccf-btn" data-action="retry">Retry</button></div>’;
                }
                var chartEl = document.getElementById(‘bccf-chart’);
                if (chartEl) chartEl.innerHTML = errHtml;
                var tableEl = document.getElementById(‘bccf-table’);
                if (tableEl) tableEl.innerHTML = errHtml;
            });
    }

    // ── URL param swap for mode toggle ───────────────────────────────────────

    function swapModeUrl(currentUrl, newMode) {
        var u = new URL(currentUrl, window.location.href);
        u.searchParams.set('mode', newMode);
        return u.toString();
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

            if (!projectId) {
                response.write(
                    '<!doctype html><html><body style="font-family:sans-serif;padding:40px;color:#666">'
                    + '<p>Missing required parameter: <strong>projectId</strong></p></body></html>'
                );
                return;
            }

            const dataUrl = resolveDataUrl(projectId, mode);

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
        ${buildHeader(projectId, mode)}
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

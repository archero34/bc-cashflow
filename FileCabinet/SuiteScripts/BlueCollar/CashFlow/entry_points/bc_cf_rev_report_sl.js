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
                action:    'revenue',
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
                    Revenue Inflows
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

    /** Chart panel with skeleton bars */
    const buildSkeletonChart = () => {
        return UI.panel({
            header: `<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Revenue Inflow</span>`,
            body: `<div id="bccf-chart">${UI.skeletonChart(6)}</div>`
        });
    };

    /** Table panel with skeleton rows */
    const buildSkeletonTable = () => {
        // thead: Source + 6 period cols + Total = 8 cols
        const headerRow = '<tr><th>Source</th>' + Array(6).fill('<th></th>').join('') + '<th>Total</th></tr>';
        const skelRows = UI.skeletonRows(8, 5);
        return UI.panel({
            body: `<div id="bccf-table" style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:var(--bccf-text-sm)">
                    <thead>${headerRow}</thead>
                    <tbody>${skelRows}</tbody>
                </table>
            </div>`
        });
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
    function renderKpis(kpis, categories) {
        var totalRevenue  = kpis.totalRevenue  || 0;
        var baseContract  = kpis.baseContract  || 0;
        var changeOrders  = kpis.changeOrders  || 0;
        var peakMonth     = kpis.peakMonth     || 0;

        var basePct  = totalRevenue ? fmtPct((baseContract / totalRevenue) * 100) : '0.0%';
        var coPct    = totalRevenue ? fmtPct((changeOrders  / totalRevenue) * 100) : '0.0%';
        var peakPct  = totalRevenue ? fmtPct((peakMonth     / totalRevenue) * 100) : '0.0%';

        // Count CO lines from categories.revenue.lines
        var coCount = 0;
        if (categories && categories.revenue && categories.revenue.lines) {
            coCount = categories.revenue.lines.filter(function(l) {
                return l.id && l.id.indexOf('CO:') === 0;
            }).length;
        }
        var coCountLabel = coCount + ' CO';

        // Line count for Total Revenue sub
        var lineCount = categories && categories.revenue && categories.revenue.lines
            ? categories.revenue.lines.length
            : 0;

        var cards = [
            // 1. Total Revenue — accent class, navy value per §3.6 + §3.7
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(lineCount) + ' lines</div>'
            + '</div>',

            // 2. Base Contract — default ink
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Base Contract</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(baseContract)) + '</div>'
                + '<div class="bccf-sub">' + esc(basePct) + ' of total</div>'
            + '</div>',

            // 3. Change Orders — default ink
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Change Orders</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(changeOrders)) + '</div>'
                + '<div class="bccf-sub">' + esc(coCountLabel) + ' &middot; ' + esc(coPct) + ' of total</div>'
            + '</div>',

            // 4. Peak Month — default ink
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Peak Month</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(peakMonth)) + '</div>'
                + '<div class="bccf-sub">' + esc(peakPct) + ' of total</div>'
            + '</div>'
        ];

        return '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">'
            + cards.join('') + '</div>';
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

        var cols = periods.map(function(label, i) {
            var rev   = revTotal[i] || 0;
            var isNow = labelToYYYYMM(label) === curYYYYMM;

            var amtLabel  = fmtCurrency(rev);
            var haloStyle = isNow
                ? 'background:var(--bccf-brand-50);border-radius:6px;padding:4px 6px 6px;'
                : '';
            var monthLabel = isNow
                ? '<span style="font-weight:700;color:var(--bccf-brand-500)">&#9650; ' + esc(label) + '</span>'
                : '<span>' + esc(label) + '</span>';

            var h = barH(rev);

            return '<div class="' + (isNow ? 'now' : '') + '" style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:48px;' + haloStyle + '">'
                // Amount label above bar
                + '<div style="font-size:11px;font-weight:600;color:var(--bccf-ink-700);margin-bottom:4px;white-space:nowrap;font-variant-numeric:tabular-nums">'
                    + esc(amtLabel)
                + '</div>'
                // Single bar — uses .bccf-bar.revenue for navy color from bc_cf_styles
                + '<div style="display:flex;align-items:flex-end;height:' + BAR_MAX_H + 'px">'
                    + '<div class="bccf-bar revenue" title="Revenue: ' + esc(fmtCurrency(rev)) + '" style="width:24px;height:' + h + 'px;border-radius:3px 3px 0 0"></div>'
                + '</div>'
                // Month label below
                + '<div style="font-size:11px;color:var(--bccf-ink-500);margin-top:6px;text-align:center">' + monthLabel + '</div>'
            + '</div>';
        });

        var headerHtml = '<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly Revenue Inflow</span>';

        var barsHtml = '<div style="display:flex;align-items:flex-end;gap:8px;padding:16px 0 0">'
            + cols.join('')
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
        var revenue = categories.revenue;

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

    function loadData(dataUrl) {
        _lastDataUrl = dataUrl;
        fetch(dataUrl)
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function(data) {
                if (!data.ok) throw new Error(data.error || 'Data SL returned ok:false');

                // Swap KPI region
                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) {
                    kpiEl.outerHTML = renderKpis(data.kpis, data.categories);
                }

                // Swap chart region (inside panel)
                var chartEl = document.getElementById('bccf-chart');
                if (chartEl) {
                    var chartPanel = chartEl.closest('.bccf-panel');
                    if (chartPanel) {
                        var tmp = document.createElement('div');
                        tmp.innerHTML = renderChart(data.periods, data.categories);
                        chartPanel.parentNode.replaceChild(tmp.firstChild, chartPanel);
                    } else {
                        chartEl.innerHTML = renderChart(data.periods, data.categories);
                    }
                }

                // Swap table region (inside panel)
                var tableEl = document.getElementById('bccf-table');
                if (tableEl) {
                    var tablePanel = tableEl.closest('.bccf-panel');
                    if (tablePanel) {
                        var tmp2 = document.createElement('div');
                        tmp2.innerHTML = renderTable(data.periods, data.categories);
                        tablePanel.parentNode.replaceChild(tmp2.firstChild, tablePanel);
                    } else {
                        tableEl.innerHTML = renderTable(data.periods, data.categories);
                    }
                }
            })
            .catch(function(err) {
                var errHtml = renderError(err.message || String(err));
                var chartEl = document.getElementById('bccf-chart');
                var tableEl = document.getElementById('bccf-table');

                var chartPanel = chartEl && chartEl.closest('.bccf-panel');
                var tablePanel = tableEl && tableEl.closest('.bccf-panel');

                if (chartPanel) chartPanel.outerHTML = errHtml;
                if (tablePanel && tablePanel !== chartPanel) tablePanel.outerHTML = errHtml;

                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) {
                    kpiEl.innerHTML = '<div class="bccf-error-card" style="grid-column:1/-1"><h4>Couldn\\'t load report data</h4><pre>' + esc(err.message || 'Unknown error') + '</pre><button type="button" class="bccf-btn" data-action="retry">Retry</button></div>';
                }
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
                        <h3 style="color:#c2361d;margin:0 0 8px">Revenue Inflows Report Error</h3>
                        <p style="color:#2f3742">${UI.esc(e.message)}</p>
                    </div>
                </body></html>`
            );
        }
    };

    return { onRequest };
});

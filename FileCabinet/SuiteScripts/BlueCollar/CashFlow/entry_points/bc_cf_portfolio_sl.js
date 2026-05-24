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
            <div style="display:flex;align-items:center;gap:12px">
                <a href="/app/center/card.nl" title="Back to dashboard"
                   style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--bccf-r-md);color:var(--bccf-ink-500);text-decoration:none;transition:background var(--bccf-t-fast),color var(--bccf-t-fast)"
                   onmouseover="this.style.background='var(--bccf-bg-100)';this.style.color='var(--bccf-brand-500)'"
                   onmouseout="this.style.background='';this.style.color='var(--bccf-ink-500)'">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/></svg>
                </a>
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
        // E1.5-style sortable thead: each <th> carries data-sort-col + ▼/▲ on active.
        // Fixed sort keys for static columns: data-sort-col="project" data-sort-col="total"
        function headerCell(labelText, sortKey, align) {
            var isActive = _sortState.col === sortKey;
            var glyph = _sortState.dir === 'desc' ? '▼' : '▲';
            var indicator = isActive
                ? '<span style="margin-left:4px;color:var(--bccf-brand-500)">' + glyph + '</span>'
                : '';
            var alignStyle = align === 'left' ? 'text-align:left' : 'text-align:right';
            return '<th data-sort-col="' + esc(sortKey) + '" style="padding:8px 12px;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap;cursor:pointer;user-select:none;' + alignStyle + '">'
                + esc(labelText) + indicator
                + '</th>';
        }

        // Sort projects by current sort state (never mutates input).
        var sorted = sortLines(projects, periods, _sortState);

        if (!sorted || !sorted.length) {
            return '<div class="bccf-panel">'
                + '<div class="bccf-panel-body" style="padding:24px;text-align:center;color:var(--bccf-ink-500)">No projects match these filters.</div>'
            + '</div>';
        }

        var headCols = periods.map(function(p) { return headerCell(p, p, 'right'); }).join('');
        var thead = '<thead><tr>'
            + headerCell('Project', 'project', 'left')
            + headCols
            + headerCell('Total', 'total', 'right')
        + '</tr></thead>';

        function projectRow(proj) {
            var cells = proj.net.map(function(v) {
                var color = v > 0 ? 'var(--bccf-success-500)' : (v < 0 ? 'var(--bccf-danger-500)' : 'var(--bccf-ink-500)');
                return '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);color:' + color + ';font-variant-numeric:tabular-nums">'
                    + esc(fmtCurrency(v)) + '</td>';
            }).join('');
            var totalColor = proj.netTotal > 0 ? 'var(--bccf-success-500)' : (proj.netTotal < 0 ? 'var(--bccf-danger-500)' : 'var(--bccf-ink-700)');
            var projectCell = proj.recordUrl
                ? '<a href="' + esc(proj.recordUrl) + '" target="_top" style="color:var(--bccf-brand-500);text-decoration:none">' + esc(proj.name) + '</a>'
                : esc(proj.name);
            return '<tr>'
                + '<td style="padding:6px 12px;font-size:var(--bccf-text-sm)">' + projectCell + '</td>'
                + cells
                + '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + totalColor + ';font-variant-numeric:tabular-nums">' + esc(fmtCurrency(proj.netTotal)) + '</td>'
            + '</tr>';
        }

        var rows = sorted.map(projectRow).join('');

        // Portfolio Net tfoot row
        var portfolioNetCells = periods.map(function(_, i) {
            var net = sorted.reduce(function(s, p) { return s + (p.net[i] || 0); }, 0);
            var color = net >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + color + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(net)) + '</td>';
        }).join('');
        var grandNet = sorted.reduce(function(s, p) { return s + p.netTotal; }, 0);
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

    // Skeleton HTML for repaint-on-refresh visual feedback
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
            + '<div class="bccf-panel-header"><span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly portfolio cash flow</span></div>'
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

    var _lastDataUrl = null;
    var _lastData = null;

    function loadData(dataUrl) {
        _lastDataUrl = dataUrl;
        var kpiElSkel = document.getElementById('bccf-kpis');
        if (kpiElSkel) kpiElSkel.innerHTML = SKEL_KPIS;
        var chartElSkel = document.getElementById('bccf-chart');
        if (chartElSkel) chartElSkel.innerHTML = SKEL_CHART;
        var tableElSkel = document.getElementById('bccf-table');
        if (tableElSkel) tableElSkel.innerHTML = SKEL_TABLE;
        fetch(dataUrl)
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
            .then(function(data) {
                if (!data.ok) throw new Error(data.error || 'Data SL returned ok:false');
                _lastData = data;
                populateFiltersFromData(data);
                applyBoundsToPicker(data.availableBounds);
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

    // ── Sortable headers (port of E1.5 spec §3.3, adapted for project rows) ──

    var _sortState = { col: 'project', dir: 'desc' };

    /**
     * Sort projects array by sortState. Never mutates input.
     * - col='project' → compare createdDate (newest first by default)
     * - col='total'   → compare netTotal
     * - col=<period>  → compare net[periodIdx]
     * - null createdDate sorts to end on project column
     */
    function sortLines(projects, periods, sortState) {
        if (!projects || !projects.length) return projects;
        var sorted = projects.slice();
        var dir = sortState.dir === 'asc' ? 1 : -1;

        sorted.sort(function(a, b) {
            var va, vb;
            if (sortState.col === 'project') {
                va = a.createdDate;
                vb = b.createdDate;
                if (va === null && vb === null) return 0;
                if (va === null) return 1;
                if (vb === null) return -1;
                return va < vb ? -dir : (va > vb ? dir : 0);
            }
            if (sortState.col === 'total') {
                va = a.netTotal || 0;
                vb = b.netTotal || 0;
            } else {
                var idx = periods.indexOf(sortState.col);
                if (idx === -1) return 0;
                va = (a.net && a.net[idx]) || 0;
                vb = (b.net && b.net[idx]) || 0;
            }
            return va < vb ? -dir : (va > vb ? dir : 0);
        });

        return sorted;
    }

    // Click handler — 2-state on Project, 3-state on Period/Total.
    document.addEventListener('click', function(e) {
        var th = e.target.closest('[data-sort-col]');
        if (!th) return;
        var col = th.dataset.sortCol;
        var was = _sortState;
        if (col === 'project') {
            _sortState = (was.col === 'project' && was.dir === 'desc')
                ? { col: 'project', dir: 'asc' }
                : { col: 'project', dir: 'desc' };
        } else {
            if (was.col !== col) {
                _sortState = { col: col, dir: 'desc' };
            } else if (was.dir === 'desc') {
                _sortState = { col: col, dir: 'asc' };
            } else {
                _sortState = { col: 'project', dir: 'desc' };
            }
        }
        if (_lastData) {
            var tableEl = document.getElementById('bccf-table');
            if (tableEl) tableEl.innerHTML = renderTable(_lastData.periods, _lastData.projects);
        }
    });

    // ── Filters pill (E2 spec §3.5, adapted for active-boolean pivot) ────────

    // Selector built at runtime so the literal attr=value pair isn't a single
    // contiguous source token (keeps shell-HTML tests' regex checks for the
    // server-rendered checkbox state unambiguous).
    var ACTIVE_SEL = '[data-filter=' + JSON.stringify('active') + ']';

    function filtersEl()      { return document.getElementById('bccf-filters'); }
    function filtersPanel()   { var e = filtersEl(); return e ? e.querySelector('.bccf-filters-panel') : null; }
    function filtersBadge()   { var e = filtersEl(); return e ? e.querySelector('.bccf-filters-label') : null; }
    function activeCheckbox() { var e = filtersEl(); return e ? e.querySelector(ACTIVE_SEL) : null; }

    function openFilters()  { var p = filtersPanel(); if (p) p.style.display = 'block'; }
    function closeFilters() { var p = filtersPanel(); if (p) p.style.display = 'none'; }

    function readFiltersState() {
        var root = filtersEl();
        if (!root) return null;
        var activeBox = activeCheckbox();
        var dims = ['projects', 'managers', 'customers', 'subsidiaries'];
        var out = { active: activeBox ? activeBox.checked : true };
        dims.forEach(function(dim) {
            var ids = [];
            root.querySelectorAll('.bccf-filters-chips[data-dim="' + dim + '"] .bccf-chip').forEach(function(chip) {
                ids.push(chip.dataset.id);
            });
            out[dim] = ids;
        });
        return out;
    }

    function updateBadge() {
        var state = readFiltersState();
        if (!state) return;
        var n = 0;
        if (state.active !== true) n++;
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            if (state[dim].length) n++;
        });
        var label = filtersBadge();
        if (label) label.textContent = n > 0 ? ('Filters · ' + n + ' active') : 'Filters';
    }

    function applyFilters() {
        var state = readFiltersState();
        if (!state) return;
        var u = new URL(window.location.href);
        // active: default true → omit param; false → ?active=0
        if (state.active === false) u.searchParams.set('active', '0');
        else u.searchParams.delete('active');
        // Unrolled per-dim sets so the literal param names appear in source (testable).
        if (state.projects.length)     u.searchParams.set('projects',     state.projects.join(','));
        else                           u.searchParams.delete('projects');
        if (state.managers.length)     u.searchParams.set('managers',     state.managers.join(','));
        else                           u.searchParams.delete('managers');
        if (state.customers.length)    u.searchParams.set('customers',    state.customers.join(','));
        else                           u.searchParams.delete('customers');
        if (state.subsidiaries.length) u.searchParams.set('subsidiaries', state.subsidiaries.join(','));
        else                           u.searchParams.delete('subsidiaries');
        window.location.replace(u.toString());
    }

    function resetFilters() {
        var root = filtersEl();
        if (!root) return;
        var activeBox = activeCheckbox();
        if (activeBox) activeBox.checked = true;
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            var chipSlot = root.querySelector('.bccf-filters-chips[data-dim="' + dim + '"]');
            if (chipSlot) {
                chipSlot.querySelectorAll('.bccf-chip').forEach(function(c) { c.remove(); });
            }
        });
        updateBadge();
        // User still needs to click Apply to take effect.
    }

    // Click handler — open/close, chip remove, Apply/Reset, outside-click
    document.addEventListener('click', function(e) {
        // Open/close on trigger
        var trigger = e.target.closest('[data-action="open-filters"]');
        if (trigger) {
            var panel = filtersPanel();
            var isOpen = panel && panel.style.display === 'block';
            if (isOpen) closeFilters(); else openFilters();
            return;
        }
        // Chip remove (✕ button inside a chip)
        var chipX = e.target.closest('.bccf-chip-x');
        if (chipX) {
            var chip = chipX.closest('.bccf-chip');
            if (chip) chip.remove();
            updateBadge();
            return;
        }
        // Apply / Reset
        if (e.target.closest('[data-action="apply-filters"]')) { applyFilters(); return; }
        if (e.target.closest('[data-action="reset-filters"]')) { resetFilters(); return; }
        // Outside-click closes panel
        var f = filtersEl();
        if (f && !f.contains(e.target)) closeFilters();
    }, true);

    // Active checkbox change → live badge update
    document.addEventListener('change', function(e) {
        if (e.target.closest(ACTIVE_SEL)) updateBadge();
    });

    // Esc closes panel (shared with date picker — both close on Esc).
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeFilters();
    });

    // ── Filters: populate dropdowns + resolve chip names (Task 16) ───────────

    /**
     * After the JSON fetch resolves: replace #<id> chip placeholders with the
     * real names, and populate the four "Add…" <select> dropdowns from the
     * available* arrays. Omits options for IDs that are already chipped.
     */
    function populateFiltersFromData(data) {
        if (!data) return;
        var nameLookups = {
            projects:     toMap(data.availableProjects),
            managers:     toMap(data.availableManagers),
            customers:    toMap(data.availableCustomers),
            subsidiaries: toMap(data.availableSubsidiaries)
        };
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            var chipSlot = document.querySelector('.bccf-filters-chips[data-dim="' + dim + '"]');
            if (!chipSlot) return;
            // Resolve existing chip names from #<id> placeholders
            chipSlot.querySelectorAll('.bccf-chip').forEach(function(chip) {
                var id = chip.dataset.id;
                var name = nameLookups[dim][id];
                if (name) {
                    var xBtn = chip.querySelector('.bccf-chip-x');
                    chip.textContent = name + ' ';
                    if (xBtn) chip.appendChild(xBtn);
                }
            });
            // Populate the Add… <select> (skip already-chipped ids)
            var sel = chipSlot.querySelector('.bccf-filters-add');
            if (!sel) return;
            var existing = {};
            chipSlot.querySelectorAll('.bccf-chip').forEach(function(c) { existing[c.dataset.id] = true; });
            var opts = '<option value="">+ Add…</option>';
            (data['available' + capitalize(dim)] || []).forEach(function(item) {
                if (existing[String(item.id)]) return;
                opts += '<option value="' + item.id + '">' + esc(item.name) + '</option>';
            });
            sel.innerHTML = opts;
        });
    }

    function toMap(arr) {
        var m = {};
        (arr || []).forEach(function(item) { m[String(item.id)] = item.name; });
        return m;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // Wire the Add… <select> change → append chip + clear select.
    document.addEventListener('change', function(e) {
        var sel = e.target.closest('.bccf-filters-add');
        if (!sel) return;
        var dim = sel.dataset.dim;
        var id = sel.value;
        if (!id) return;
        var chipSlot = sel.closest('.bccf-filters-chips');
        var label = sel.options[sel.selectedIndex].textContent;
        var chip = document.createElement('span');
        chip.className = 'bccf-chip';
        chip.dataset.id = id;
        chip.textContent = label + ' ';
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bccf-chip-x';
        x.dataset.action = 'remove-chip';
        x.dataset.dim = dim;
        x.dataset.id = id;
        x.textContent = '×';
        chip.appendChild(x);
        chipSlot.insertBefore(chip, sel);
        sel.options[sel.selectedIndex].remove();
        sel.selectedIndex = 0;
        updateBadge();
    });

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
            var basisPill = document.querySelector('.bccf-title-pill');
            if (basisPill) basisPill.textContent = (newMode === 'accrual' ? 'Accrual' : 'Cash') + ' basis';
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

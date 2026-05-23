/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description UI rendering module for BC Cash Flow Forecasting.
 *              Generates inline HTML/CSS/JS for injection into NetSuite
 *              record subtabs via UserEvent scripts.
 */
define([
    './bc_timing_constants',
    './bc_cf_styles',
    './bc_cf_ui',
], (Constants, Styles, UI) => {

    const { BRAND, TIMING_TYPE, PERIOD_INTERVAL } = Constants;

    // =========================================================================
    //  Utility Helpers
    // =========================================================================

    /**
     * HTML-escape a string to prevent XSS in rendered output.
     * @param {*} val
     * @returns {string}
     */
    const esc = (val) => {
        if (val === null || val === undefined) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Format a number as US currency ($X,XXX.XX).
     * @param {number} value
     * @returns {string}
     */
    const fmtCurrency = (value) => {
        const n = Number(value) || 0;
        return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    /**
     * Format a number as percentage (XX.X%).
     * @param {number} value
     * @returns {string}
     */
    const fmtPercent = (value) => {
        const n = Number(value) || 0;
        return n.toFixed(1) + '%';
    };

    /**
     * Format a Date to YYYY-MM-DD for input[type=date].
     * @param {Date|string} d
     * @returns {string}
     */
    const fmtDateInput = (d) => {
        if (!d) return '';
        const dt = (d instanceof Date) ? d : new Date(d);
        if (isNaN(dt.getTime())) return '';
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    /**
     * Format a Date for display (MMM DD, YYYY).
     * @param {Date|string} d
     * @returns {string}
     */
    const fmtDateDisplay = (d) => {
        if (!d) return '';
        const dt = (d instanceof Date) ? d : new Date(d);
        if (isNaN(dt.getTime())) return '';
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
    };

    // =========================================================================
    //  1. getBaseStyles()
    // =========================================================================

    /**
     * Returns the complete CSS stylesheet string for the Cash Flow UI.
     * @returns {string}
     */
    const getBaseStyles = () => {
        return Styles.getStyles().replace('</style>', `

/* ====================================================================
   Schedule editor -- surface-specific additions (extends bc_cf_styles)
   ==================================================================== */

/* Container + box-sizing reset */
.bccf-container { overflow: hidden; position: relative; }
.bccf-container *, .bccf-container *::before, .bccf-container *::after { box-sizing: border-box; }

/* Header: gradient banner */
.bccf-header { background: linear-gradient(135deg, var(--bccf-brand-500) 0%, #2a5080 100%); color: #fff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.bccf-header-title { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; }
.bccf-header-title svg { flex-shrink: 0; }
.bccf-header-meta { font-size: 12px; opacity: 0.8; display: flex; gap: 20px; flex-wrap: wrap; }
.bccf-header-meta span { display: inline-flex; align-items: center; gap: 4px; }
.bccf-header-meta strong { font-weight: 600; opacity: 1; }

/* Section: tab-driven show/hide */
.bccf-section { margin: 20px 24px; padding-left: 20px; display: none; }
.bccf-section.active { display: block; }
.bccf-section-title { font-size: 16px; font-weight: 700; color: var(--bccf-ink-900); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
.bccf-section-title .bccf-badge { margin-left: 6px; }

/* Toolbar (template selector row) */
.bccf-toolbar { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--bccf-bg-50); border-radius: var(--bccf-r-lg); margin-bottom: 16px; flex-wrap: wrap; border: 1px solid var(--bccf-border); }
.bccf-toolbar label { font-size: 12px; font-weight: 600; color: var(--bccf-ink-500); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.bccf-toolbar select, .bccf-toolbar input[type="date"] { font-size: var(--bccf-text-sm); padding: 8px 12px; border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); background: var(--bccf-surface); color: var(--bccf-ink-900); outline: none; min-width: 0; }
.bccf-toolbar select { min-width: 200px; max-width: 320px; flex: 1; }
.bccf-toolbar select:focus, .bccf-toolbar input[type="date"]:focus { border-color: var(--bccf-brand-500); box-shadow: 0 0 0 2px var(--bccf-brand-50); }

/* Grid wrapper */
.bccf-grid-wrapper { overflow-x: auto; border-radius: var(--bccf-r-lg); border: 1px solid var(--bccf-border); margin-bottom: 12px; }

/* Grid input variant: transparent at rest, hover reveals, focus ring */
.bccf-grid { width: 100%; border-collapse: collapse; font-size: var(--bccf-text-sm); color: var(--bccf-ink-900); }
.bccf-grid th, .bccf-grid td { padding: 8px 10px; border-bottom: 1px solid var(--bccf-bg-100); text-align: left; color: var(--bccf-ink-900); vertical-align: middle; }
.bccf-grid th { background: var(--bccf-bg-50); color: var(--bccf-ink-500); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
.bccf-grid th.right, .bccf-grid td.right { text-align: right; }
.bccf-grid th.center, .bccf-grid td.center { text-align: center; }
.bccf-grid input { width: 100%; padding: 4px 6px; font-size: var(--bccf-text-sm); border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--bccf-ink-900); font-family: inherit; }
.bccf-grid input:hover { background: var(--bccf-bg-50); border-color: var(--bccf-border); }
.bccf-grid input:focus { outline: none; background: var(--bccf-surface); border-color: var(--bccf-brand-500); box-shadow: 0 0 0 2px var(--bccf-brand-50); }
.bccf-grid input.right { text-align: right; }
.bccf-grid input[type="date"] { min-width: 130px; }
.bccf-grid input[type="number"] { text-align: right; min-width: 90px; -moz-appearance: textfield; }
.bccf-grid input[type="number"]::-webkit-outer-spin-button, .bccf-grid input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.bccf-grid .rownum { color: var(--bccf-ink-500); font-size: 11px; font-weight: 600; }
.bccf-grid .cum { color: var(--bccf-ink-500); font-size: 12px; }
.bccf-grid tfoot td { background: var(--bccf-bg-50); font-weight: 600; border-top: 1px solid var(--bccf-border); border-bottom: 0; }
.bccf-grid tr:hover td { background: #fafbfc; }

/* Validation badge in tfoot */
.bccf-validation { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; transition: all 0.3s ease; }
.bccf-validation.valid { background: var(--bccf-success-50); color: var(--bccf-success-500); }
.bccf-validation.invalid { background: var(--bccf-danger-50); color: var(--bccf-danger-500); }

/* Save bar: sticky bottom, pulse on dirty */
.bccf-save-bar { position: sticky; bottom: 0; background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-lg); padding: 12px 18px; box-shadow: var(--bccf-shadow-2); display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 10px; }
.bccf-save-status { font-size: var(--bccf-text-sm); color: var(--bccf-ink-500); display: inline-flex; align-items: center; gap: 6px; }
.bccf-save-status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bccf-ink-500); }
.bccf-save-status.dirty-balanced .dot { background: var(--bccf-ink-500); animation: bccf-pulse 1.5s ease-in-out infinite; }
.bccf-save-status.dirty-warn { color: var(--bccf-warn-500); }
.bccf-save-status.dirty-warn .dot { background: var(--bccf-warn-500); animation: bccf-pulse 1.5s ease-in-out infinite; }
.bccf-save-status.saved { color: var(--bccf-success-500); }
.bccf-save-status.saved .dot { background: var(--bccf-success-500); }
@keyframes bccf-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
.bccf-save-actions { display: flex; gap: 8px; align-items: center; }
.bccf-btn-rebalance { background: var(--bccf-warn-50); border-color: var(--bccf-warn-500); color: var(--bccf-warn-500); font-weight: 600; }

/* Field block (calculator + filter inputs) */
.bccf-field { display: flex; flex-direction: column; gap: 4px; }
.bccf-field label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bccf-ink-500); font-weight: 500; }

/* Empty state */
.bccf-empty-state { text-align: center; padding: 40px 24px; color: var(--bccf-ink-500); }
.bccf-empty-state p { font-size: var(--bccf-text-base); margin: 0 0 6px; font-weight: 600; color: var(--bccf-ink-700); }
.bccf-empty-state span { font-size: var(--bccf-text-sm); color: var(--bccf-ink-500); }

/* Calculator toolbar additions */
.bccf-toolbar input[type="number"] { font-size: var(--bccf-text-sm); padding: 8px 10px; border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); background: var(--bccf-surface); color: var(--bccf-ink-900); width: 70px; -moz-appearance: textfield; }
.bccf-toolbar input[type="number"]::-webkit-outer-spin-button, .bccf-toolbar input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.bccf-toolbar input[type="number"]:focus { border-color: var(--bccf-brand-500); box-shadow: 0 0 0 2px var(--bccf-brand-50); outline: none; }
.bccf-toolbar input[readonly] { background: var(--bccf-bg-50); color: var(--bccf-ink-500); cursor: default; }
.bccf-toolbar input[type="date"] { min-width: 140px; }

/* Calculator preview panel */
.bccf-calc-preview { background: var(--bccf-bg-50); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-lg); padding: 12px 16px; margin-bottom: 16px; display: none; }
.bccf-calc-preview.visible { display: block; }
.bccf-calc-preview-meta { font-size: 12px; font-weight: 600; color: var(--bccf-ink-700); margin-bottom: 10px; }
.bccf-calc-preview-bars { display: flex; align-items: flex-end; gap: 4px; height: 48px; margin-bottom: 10px; }
.bccf-calc-preview-bars .bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; min-width: 0; }
.bccf-calc-preview-bars .bar-lbl { font-size: 9px; color: var(--bccf-ink-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; text-align: center; }
.bccf-calc-preview-bars .bar { width: 100%; background: var(--bccf-brand-500); border-radius: 2px 2px 0 0; min-height: 2px; }
.bccf-calc-preview table { width: 100%; border-collapse: collapse; font-size: 11px; }
.bccf-calc-preview th { color: var(--bccf-ink-500); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; padding: 3px 6px; border-bottom: 1px solid var(--bccf-border); text-align: left; }
.bccf-calc-preview td { padding: 3px 6px; color: var(--bccf-ink-700); border-bottom: 1px solid var(--bccf-bg-100); }
.bccf-calc-preview td.right, .bccf-calc-preview th.right { text-align: right; }
.bccf-calc-preview .more-rows { font-size: 11px; color: var(--bccf-ink-500); padding: 4px 6px; text-align: center; }

/* Toast host */
#bccf-toast-host { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.bccf-toast { background: var(--bccf-ink-900); color: #fff; padding: 10px 16px; border-radius: var(--bccf-r-md); font-size: var(--bccf-text-sm); font-weight: 500; box-shadow: var(--bccf-shadow-2); pointer-events: auto; transition: opacity 0.3s ease, transform 0.3s ease; opacity: 1; transform: translateY(0); }
.bccf-toast.success { background: var(--bccf-success-500); }
.bccf-toast.error { background: var(--bccf-danger-500); }
.bccf-toast.warn { background: var(--bccf-warn-500); color: var(--bccf-ink-900); }

/* Modal */
.bccf-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.bccf-modal { background: var(--bccf-surface); border-radius: var(--bccf-r-lg); padding: 24px 28px; min-width: 320px; max-width: 440px; box-shadow: var(--bccf-shadow-2); }
.bccf-modal-headline { font-size: 16px; font-weight: 700; color: var(--bccf-ink-900); margin-bottom: 8px; }
.bccf-modal-body { font-size: var(--bccf-text-sm); color: var(--bccf-ink-700); margin-bottom: 20px; }
.bccf-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

</style>`);
    };

    // =========================================================================
    //  SVG Icons (inline, no dependencies)
    // =========================================================================

    const ICONS = {
        cashFlow: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        save: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        empty: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="8" y1="3" x2="8" y2="9"/></svg>',
        chart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
    };

    // =========================================================================
    //  2. renderKpiBar(options)
    // =========================================================================

    /**
     * Renders the KPI cards row.
     * @param {Object} options
     * @param {number} options.totalAmount
     * @param {number} options.scheduledAmount
     * @param {number} options.scheduledPct
     * @param {number} options.remainingAmount
     * @param {number} options.remainingPct
     * @param {string} options.label
     * @returns {string}
     */
    const renderKpiBar = ({ totalAmount, scheduledAmount, scheduledPct, remainingAmount, remainingPct, label }) => {
        const isPctComplete = scheduledPct >= 100;
        const pctClass = isPctComplete ? 'green' : '';
        const remClass = remainingAmount <= 0 ? 'green' : (remainingPct > 50 ? 'red' : 'gold');

        return `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 18px;background:var(--bccf-bg-50);border-bottom:1px solid var(--bccf-border);">
    <div class="bccf-kpi">
        <div class="bccf-k">${esc(label || 'Total Amount')}</div>
        <div class="bccf-v">${esc(fmtCurrency(totalAmount))}</div>
    </div>
    <div class="bccf-kpi">
        <div class="bccf-k">Scheduled</div>
        <div class="bccf-v${pctClass ? ' accent' : ''}">${esc(fmtCurrency(scheduledAmount))}</div>
        <div class="bccf-sub">${esc(fmtPercent(scheduledPct))}</div>
    </div>
    <div class="bccf-kpi">
        <div class="bccf-k">Remaining</div>
        <div class="bccf-v">${esc(fmtCurrency(remainingAmount))}</div>
        <div class="bccf-sub">${esc(fmtPercent(remainingPct))}</div>
    </div>
    <div class="bccf-kpi">
        <div class="bccf-k">Completion</div>
        <div style="margin-top:6px;background:var(--bccf-bg-100);border-radius:var(--bccf-r-full);height:8px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(scheduledPct, 100)}%;background:${isPctComplete ? 'var(--bccf-success-500)' : 'var(--bccf-brand-500)'};border-radius:var(--bccf-r-full);transition:width 0.5s ease;"></div>
        </div>
        <div class="bccf-sub" style="margin-top:4px;">${esc(fmtPercent(scheduledPct))}</div>
    </div>
</div>`;
    };

    // =========================================================================
    //  3. renderCalculatorToolbar(options)  [was: renderTemplateSelector]
    // =========================================================================

    /**
     * Renders the schedule calculator toolbar + live preview region.
     * Replaces the old stamp-only template selector.
     * @param {Object} options
     * @param {string} options.sectionId
     * @returns {string}
     */
    const renderCalculatorToolbar = ({ sectionId }) => {
        const sid = esc(sectionId);
        const distId  = `${sid}_calc_dist`;
        const perdsId = `${sid}_calc_periods`;
        const intId   = `${sid}_calc_interval`;
        const startId = `${sid}_calc_start`;
        const endId   = `${sid}_calc_end`;
        const genId   = `${sid}_calc_generate`;
        const clrId   = `${sid}_calc_clear`;
        const prevId  = `${sid}_calc_preview`;
        const today   = fmtDateInput(new Date());

        return `
<div class="bccf-toolbar" id="${sid}_calc_toolbar">
    <div class="bccf-field">
        <label for="${distId}">Distribution</label>
        <select id="${distId}" data-section="${sid}" data-calc="dist"
                onchange="bcTiming.calcPreview('${sid}')">
            <option value="s_curve" selected>S-curve</option>
            <option value="linear">Linear</option>
            <option value="front_loaded">Front-loaded</option>
            <option value="back_loaded">Back-loaded</option>
        </select>
    </div>
    <div class="bccf-field">
        <label for="${perdsId}">Periods</label>
        <input type="number" id="${perdsId}" data-section="${sid}" data-calc="periods"
               value="6" min="1" max="36"
               oninput="bcTiming.calcPreview('${sid}')">
    </div>
    <div class="bccf-field">
        <label for="${intId}">Interval</label>
        <select id="${intId}" data-section="${sid}" data-calc="interval"
                onchange="bcTiming.calcPreview('${sid}')">
            <option value="monthly" selected>Monthly</option>
            <option value="bi_weekly">Bi-weekly</option>
            <option value="weekly">Weekly</option>
        </select>
    </div>
    <div class="bccf-field">
        <label for="${startId}">${ICONS.calendar} Start date</label>
        <input type="date" id="${startId}" data-section="${sid}" data-calc="start"
               value="${today}"
               oninput="bcTiming.calcPreview('${sid}')">
    </div>
    <div class="bccf-field">
        <label for="${endId}">End date</label>
        <input type="date" id="${endId}" readonly tabindex="-1">
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:2px;">
        <button type="button" class="bccf-btn bccf-btn-pri" id="${genId}"
                onclick="bcTiming.calcGenerate('${sid}')">
            Generate
        </button>
        <button type="button" class="bccf-btn" id="${clrId}"
                onclick="bcTiming.calcClearAll('${sid}')">
            Clear all
        </button>
    </div>
</div>
<div class="bccf-calc-preview" id="${prevId}">
    <div class="bccf-calc-preview-meta" id="${prevId}_meta"></div>
    <div class="bccf-calc-preview-bars" id="${prevId}_bars"></div>
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
        <tbody id="${prevId}_rows"></tbody>
    </table>
    <div class="more-rows" id="${prevId}_more"></div>
</div>`;
    };

    // Keep old name as alias for backward compatibility in callers
    const renderTemplateSelector = ({ sectionId }) => renderCalculatorToolbar({ sectionId });

    // =========================================================================
    //  4. renderTimingGrid(options)
    // =========================================================================

    /**
     * Renders the full timing lines grid table.
     * @param {Object} options
     * @param {string} options.sectionId
     * @param {Object[]} options.lines
     * @param {number} options.sourceAmount
     * @param {boolean} options.editable
     * @param {boolean} options.showCostCode
     * @returns {string}
     */
    const renderTimingGrid = ({ sectionId, lines, sourceAmount, editable, showCostCode }) => {
        const sid = esc(sectionId);
        const safeLines = lines || [];
        const gridId = `${sid}_grid`;
        const tbodyId = `${sid}_tbody`;
        const totalRowId = `${sid}_total_row`;
        const validationId = `${sid}_validation`;

        // Empty state
        if (safeLines.length === 0 && !editable) {
            return `
<div class="bccf-panel-body bccf-empty-state">
    <p>No Timing Lines</p>
    <span>Apply a template or add lines manually to define the payment schedule.</span>
</div>`;
        }

        // Column headers
        let colHeaders = '<tr>';
        colHeaders += '<th class="center" style="width:40px;">#</th>';
        if (showCostCode) {
            colHeaders += '<th>Cost Code</th>';
            colHeaders += '<th>Cost Type</th>';
        }
        colHeaders += '<th>Period Date</th>';
        colHeaders += '<th>Label</th>';
        colHeaders += '<th class="right">Percentage</th>';
        colHeaders += '<th class="right">Amount</th>';
        colHeaders += '<th class="right">Total %</th>';
        colHeaders += '<th class="right">Total Amount</th>';
        if (editable) {
            colHeaders += '<th class="center" style="width:50px;"></th>';
        }
        colHeaders += '</tr>';

        // Data rows
        let rows = '';
        safeLines.forEach((line, idx) => {
            rows += _renderTimingRow({ sectionId: sid, line, idx, editable, showCostCode });
        });

        // Totals
        let totalPct = 0;
        let totalAmt = 0;
        safeLines.forEach((l) => {
            totalPct += (Number(l.percentage) || 0);
            totalAmt += (Number(l.amount) || 0);
        });
        totalPct = Math.round(totalPct * 100) / 100;
        totalAmt = Math.round(totalAmt * 100) / 100;
        const isValid = Math.abs(totalPct - 100) < 0.01 && Math.abs(totalAmt - (sourceAmount || 0)) < 0.01;

        const validationHtml = isValid
            ? `<span class="bccf-validation valid">${ICONS.check} Balanced (100%)</span>`
            : `<span class="bccf-validation invalid">${ICONS.warning} ${fmtPercent(totalPct)} allocated</span>`;

        const costCodeCols = showCostCode ? 2 : 0;
        const baseCols = 6; // #, date, label, pct, amt, cum%, cumAmt
        const actionCol = editable ? 1 : 0;
        const totalCols = baseCols + costCodeCols + actionCol;

        let totalRow = `<tr id="${totalRowId}">`;
        totalRow += `<td colspan="${1 + costCodeCols}"></td>`;
        totalRow += `<td colspan="2" style="text-align:right;">Total</td>`;
        totalRow += `<td class="right" data-field="total_pct">${esc(fmtPercent(totalPct))}</td>`;
        totalRow += `<td class="right" data-field="total_amt">${esc(fmtCurrency(totalAmt))}</td>`;
        totalRow += `<td colspan="${2 + actionCol}" class="right" id="${validationId}">${validationHtml}</td>`;
        totalRow += '</tr>';

        // Add row button
        const addRowHtml = editable
            ? `<button type="button" class="bccf-add-row-btn" onclick="bcTiming.addRow('${sid}')">
                   ${ICONS.plus} Add Line
               </button>`
            : '';

        return `
<div class="bccf-grid-wrapper">
    <table class="bccf-grid" id="${gridId}">
        <thead>${colHeaders}</thead>
        <tbody id="${tbodyId}">
            ${rows}
        </tbody>
        <tfoot>${totalRow}</tfoot>
    </table>
</div>
${addRowHtml}`;
    };

    /**
     * Renders a single timing grid row.
     * @private
     */
    const _renderTimingRow = ({ sectionId, line, idx, editable, showCostCode }) => {
        const sid = esc(sectionId);
        const rowNum = idx + 1;
        const dateVal = fmtDateInput(line.periodDate);
        const dateDisplay = fmtDateDisplay(line.periodDate);
        const pct = Number(line.percentage) || 0;
        const amt = Number(line.amount) || 0;
        const cumPct = Number(line.cumulativePct) || 0;
        const cumAmt = Number(line.cumulativeAmt) || 0;
        const label = line.label || `Period ${rowNum}`;
        const costCode = line.costCode || '';
        const costType = line.costType || '';

        let row = `<tr data-section="${sid}" data-index="${idx}">`;
        row += `<td class="center rownum">${rowNum}</td>`;

        if (showCostCode) {
            row += `<td>${editable
                ? `<input type="text" value="${esc(costCode)}" data-section="${sid}" data-index="${idx}" data-field="costCode" placeholder="Cost Code">`
                : esc(costCode)}</td>`;
            row += `<td>${editable
                ? `<input type="text" value="${esc(costType)}" data-section="${sid}" data-index="${idx}" data-field="costType" placeholder="Cost Type">`
                : esc(costType)}</td>`;
        }

        if (editable) {
            row += `<td><input type="date" value="${esc(dateVal)}" data-section="${sid}" data-index="${idx}" data-field="periodDate"></td>`;
            row += `<td><input type="text" value="${esc(label)}" data-section="${sid}" data-index="${idx}" data-field="label" placeholder="Period label"></td>`;
            row += `<td class="right"><input type="number" value="${pct}" step="0.01" min="0" max="100" data-section="${sid}" data-index="${idx}" data-field="percentage" onchange="bcTiming.recalculate('${sid}')"></td>`;
            row += `<td class="right"><input type="text" value="${fmtCurrency(amt)}" data-section="${sid}" data-index="${idx}" data-field="amount" onfocus="this.select()" onblur="bcTiming.onAmountChange('${sid}',${idx})" onchange="bcTiming.onAmountChange('${sid}',${idx})" style="text-align:right;"></td>`;
        } else {
            row += `<td>${esc(dateDisplay)}</td>`;
            row += `<td>${esc(label)}</td>`;
            row += `<td class="right">${esc(fmtPercent(pct))}</td>`;
            row += `<td class="right">${esc(fmtCurrency(amt))}</td>`;
        }

        row += `<td class="right cum">${esc(fmtPercent(cumPct))}</td>`;
        row += `<td class="right cum">${esc(fmtCurrency(cumAmt))}</td>`;

        if (editable) {
            row += `<td class="center">
                <button type="button" class="bccf-btn bccf-btn-danger-ghost" title="Remove line"
                        onclick="bcTiming.removeRow('${sid}', ${idx})">
                    ${ICONS.trash}
                </button>
            </td>`;
        }

        row += '</tr>';
        return row;
    };

    // =========================================================================
    //  5. renderTimingSection(options)
    // =========================================================================

    /**
     * Renders a complete timing section (Cash Flow or Accrual).
     * @param {Object} options
     * @param {string} options.sectionId
     * @param {string} options.title
     * @param {number} options.sourceAmount
     * @param {Object[]} options.lines
     * @param {boolean} options.editable
     * @param {boolean} options.showCostCode
     * @param {Object[]} options.templates
     * @param {string} options.timingType
     * @returns {string}
     */
    const renderTimingSection = ({ sectionId, title, sourceAmount, lines, editable, showCostCode, templates, timingType }) => {
        const sid = esc(sectionId);
        const safeLines = lines || [];
        const amt = Number(sourceAmount) || 0;

        // Calculate KPI values
        let scheduledAmt = 0;
        safeLines.forEach((l) => { scheduledAmt += (Number(l.amount) || 0); });
        scheduledAmt = Math.round(scheduledAmt * 100) / 100;
        const scheduledPct = amt > 0 ? Math.round((scheduledAmt / amt) * 10000) / 100 : 0;
        const remainingAmt = Math.round((amt - scheduledAmt) * 100) / 100;
        const remainingPct = amt > 0 ? Math.round((remainingAmt / amt) * 10000) / 100 : 0;

        const typeBadge = timingType === 'accrual'
            ? '<span class="bccf-badge brand">Accrual</span>'
            : '<span class="bccf-badge neutral">Cash Flow</span>';

        let lineCountBadge = '';
        if (safeLines.length > 0) {
            lineCountBadge = `<span class="bccf-badge success">${safeLines.length} line${safeLines.length !== 1 ? 's' : ''}</span>`;
        }

        const kpiHtml = renderKpiBar({
            totalAmount: amt,
            scheduledAmount: scheduledAmt,
            scheduledPct,
            remainingAmount: remainingAmt,
            remainingPct,
            label: `${title} Total`
        });

        const toolbarHtml = editable
            ? renderCalculatorToolbar({ sectionId: sid })
            : '';

        const gridHtml = renderTimingGrid({
            sectionId: sid,
            lines: safeLines,
            sourceAmount: amt,
            editable,
            showCostCode
        });

        return `
<div class="bccf-section" id="${sid}_section"
     data-section-id="${sid}"
     data-source-amount="${amt}"
     data-timing-type="${esc(timingType || '')}">
    <div class="bccf-section-title">
        ${esc(title)} ${typeBadge} ${lineCountBadge}
    </div>
    <div id="${sid}_kpi">${kpiHtml}</div>
    ${toolbarHtml}
    <div id="${sid}_grid_container">${gridHtml}</div>
</div>`;
    };

    // =========================================================================
    //  6. renderScheduleSubtab(options)
    // =========================================================================

    /**
     * Renders the complete Schedule subtab HTML.
     * @param {Object} options
     * @returns {string}
     */
    const renderScheduleSubtab = ({
        transactionType, transactionId, transactionName, entityName, totalAmount,
        projectId, projectName, cashFlowLines, accrualLines, editable,
        showCostCode, suiteletUrl, recordType, sourceGroup, changeOrderId,
        sectionPrefix
    }) => {
        const amt = Number(totalAmount) || 0;

        // sectionPrefix allows multiple renderScheduleSubtab calls on the same page
        // (e.g., CO revenue pane + CO cost pane) without element ID collisions.
        // When provided, section IDs become e.g. 'co_rev_cashflow' instead of 'cashflow'.
        const pfx = sectionPrefix ? `${sectionPrefix}_` : '';
        const cfSectionId = `${pfx}cashflow`;
        const acSectionId = `${pfx}accrual`;
        const rootId      = `bc_cf_root${pfx ? '_' + sectionPrefix : ''}`;
        const tabNavId    = `bc_cf_tab_nav${pfx ? '_' + sectionPrefix : ''}`;
        const saveBtnId   = `bc_save_btn${pfx ? '_' + sectionPrefix : ''}`;
        const saveStatusId = `bc_save_status${pfx ? '_' + sectionPrefix : ''}`;

        const cashFlowSection = renderTimingSection({
            sectionId: cfSectionId,
            title: 'Cash Flow Schedule',
            sourceAmount: amt,
            lines: cashFlowLines || [],
            editable: editable !== false,
            showCostCode: showCostCode || false,
            timingType: 'cashflow'
        });

        const accrualSection = renderTimingSection({
            sectionId: acSectionId,
            title: 'Accrual Schedule',
            sourceAmount: amt,
            lines: accrualLines || [],
            editable: editable !== false,
            showCostCode: showCostCode || false,
            timingType: 'accrual'
        });

        const saveBarHtml = (editable !== false) ? `
<div class="bccf-save-bar">
    <div class="bccf-save-status" id="${saveStatusId}">
        <span class="dot"></span> Ready
    </div>
    <div class="bccf-save-actions">
        <button type="button" class="bccf-btn" onclick="bcTiming.switchTab('${esc(cfSectionId)}', '${esc(tabNavId)}')">
            Review Cash Flow
        </button>
        <button type="button" class="bccf-btn" onclick="bcTiming.switchTab('${esc(acSectionId)}', '${esc(tabNavId)}')">
            Review Accrual
        </button>
        <button type="button" class="bccf-btn bccf-btn-pri" id="${saveBtnId}"
                onclick="bcTiming.save('${esc(String(transactionId || ''))}', '${esc(transactionType || '')}', '${esc(rootId)}', '${esc(cfSectionId)}', '${esc(acSectionId)}', '${esc(saveBtnId)}', '${esc(saveStatusId)}')">
            ${ICONS.save} Save Schedules
        </button>
    </div>
</div>` : '';

        return `
${getBaseStyles()}
<div class="bccf-container"
     id="${rootId}"
     data-transaction-id="${esc(String(transactionId || ''))}"
     data-transaction-type="${esc(transactionType || '')}"
     data-project-id="${esc(String(projectId || ''))}"
     data-source-amount="${amt}"
     data-suitelet-url="${esc(suiteletUrl || '')}"
     data-record-type="${esc(recordType || '')}"
     data-source-group="${esc(String(sourceGroup || ''))}"
     data-change-order-id="${esc(String(changeOrderId || ''))}">

    <!-- Header -->
    <div class="bccf-header">
        <div class="bccf-header-title">
            ${ICONS.cashFlow}
            Cash Flow &amp; Accrual Timing
        </div>
        <div class="bccf-header-meta">
            <span><strong>Transaction:</strong> ${esc(transactionName || transactionType || '')}</span>
            <span><strong>Entity:</strong> ${esc(entityName || '')}</span>
            ${projectName ? `<span><strong>Project:</strong> ${esc(projectName)}</span>` : ''}
            <span><strong>Amount:</strong> ${esc(fmtCurrency(amt))}</span>
        </div>
    </div>

    <!-- Tab Navigation -->
    <div class="bccf-tabs" id="${tabNavId}">
        <a class="active cashflow" data-tab="${esc(cfSectionId)}"
                onclick="bcTiming.switchTab('${esc(cfSectionId)}', '${esc(tabNavId)}')">
            ${ICONS.chart} Cash Flow
        </a>
        <a data-tab="${esc(acSectionId)}"
                onclick="bcTiming.switchTab('${esc(acSectionId)}', '${esc(tabNavId)}')">
            ${ICONS.chart} Accrual
        </a>
    </div>

    <!-- Sections -->
    ${cashFlowSection}
    ${accrualSection}

    <!-- Save Bar -->
    ${saveBarHtml}
</div>
<div id="bccf-toast-host"></div>

<script>
${getClientScript()}

// Initialize: show Cash Flow tab by default
document.addEventListener('DOMContentLoaded', function() {
    bcTiming.switchTab('${esc(cfSectionId)}', '${esc(tabNavId)}');
});
// Fallback: if DOM already loaded
if (document.readyState !== 'loading') {
    bcTiming.switchTab('${esc(cfSectionId)}', '${esc(tabNavId)}');
}
</script>`;
    };

    // =========================================================================
    //  7. renderReportHeader(options)
    // =========================================================================

    /**
     * Renders report Suitelet header HTML.
     * @param {Object} options
     * @param {string} options.title
     * @param {string} options.projectName
     * @param {Object[]} options.filters
     * @returns {string}
     */
    const renderReportHeader = ({ title, projectName, filters }) => {
        let filtersHtml = '';
        if (filters && filters.length > 0) {
            const filterItems = filters.map((f) => {
                let inputHtml = '';
                if (f.type === 'select' && f.options) {
                    const opts = f.options.map((o) =>
                        `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.text)}</option>`
                    ).join('');
                    inputHtml = `<select id="${esc(f.id)}" name="${esc(f.id)}">${opts}</select>`;
                } else if (f.type === 'date') {
                    inputHtml = `<input type="date" id="${esc(f.id)}" name="${esc(f.id)}" value="${esc(f.value || '')}">`;
                } else {
                    inputHtml = `<input type="text" id="${esc(f.id)}" name="${esc(f.id)}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}">`;
                }
                return `
<div class="filter-group">
    <label for="${esc(f.id)}">${esc(f.label)}</label>
    ${inputHtml}
</div>`;
            }).join('');

            filtersHtml = `
<div style="display:flex;gap:16px;padding:16px 18px;background:var(--bccf-bg-50);border-bottom:1px solid var(--bccf-border);flex-wrap:wrap;align-items:flex-end;">
    ${filterItems}
    <div class="filter-group" style="align-self:flex-end;">
        <button type="submit" class="bccf-btn bccf-btn-pri">Apply Filters</button>
    </div>
</div>`;
        }

        return `
${getBaseStyles()}
<div class="bccf-container">
    <div class="bccf-panel-header">
        <h1 style="font-size:var(--bccf-text-xl);font-weight:700;margin:0;color:var(--bccf-ink-900);">${esc(title || 'Cash Flow Report')}</h1>
        ${projectName ? `<div style="font-size:var(--bccf-text-sm);color:var(--bccf-ink-500);">Project: ${esc(projectName)}</div>` : ''}
    </div>
    ${filtersHtml}
</div>`;
    };

    // =========================================================================
    //  8. getClientScript()
    // =========================================================================

    /**
     * Returns the complete client-side JavaScript for interactive behavior.
     * @returns {string}
     */
    const getClientScript = () => {

        return `
(function() {
    'use strict';

    // =====================================================================
    //  BlueCollar Timing Client-Side Controller
    // =====================================================================

    var bcTiming = window.bcTiming = {};

    // ─── Utility Functions ──────────────────────────────────────────────

    /**
     * Format a number as US currency.
     */
    bcTiming.formatCurrency = function(value) {
        var n = Number(value) || 0;
        return '$' + n.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
    };

    /**
     * Format a number as percentage.
     */
    bcTiming.formatPercent = function(value) {
        var n = Number(value) || 0;
        return n.toFixed(1) + '%';
    };

    /**
     * Round to 2 decimal places.
     */
    function round2(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    /**
     * Advance a date by periods according to interval.
     */
    function advanceDate(date, intervalId, periods) {
        var d = new Date(date.getTime());
        switch (intervalId) {
            case PERIOD_INTERVAL.WEEKLY.id:
                d.setDate(d.getDate() + (7 * periods));
                break;
            case PERIOD_INTERVAL.BIWEEKLY.id:
                d.setDate(d.getDate() + (14 * periods));
                break;
            case PERIOD_INTERVAL.MONTHLY.id:
            default:
                d.setMonth(d.getMonth() + periods);
                break;
        }
        return d;
    }

    /**
     * Format a Date to YYYY-MM-DD.
     */
    function formatDateInput(d) {
        if (!d) return '';
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    /**
     * HTML-escape.
     */
    function esc(val) {
        if (val === null || val === undefined) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Get the source amount for a section.
     */
    function getSourceAmount(sectionId) {
        var section = document.getElementById(sectionId + '_section');
        if (section) {
            return Number(section.getAttribute('data-source-amount')) || 0;
        }
        var root = document.getElementById('bc_cf_root');
        return root ? (Number(root.getAttribute('data-source-amount')) || 0) : 0;
    }

    /**
     * Collect all line data from the grid.
     */
    function collectLines(sectionId) {
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return [];
        var rows = tbody.querySelectorAll('tr[data-section="' + sectionId + '"]');
        var lines = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var inputs = row.querySelectorAll('input[data-section="' + sectionId + '"]');
            var line = { index: i };
            for (var j = 0; j < inputs.length; j++) {
                var field = inputs[j].getAttribute('data-field');
                var val = inputs[j].value;
                if (field === 'percentage' || field === 'amount') {
                    line[field] = parseFloat(val.replace(/[^0-9.\-]/g, '')) || 0;
                } else {
                    line[field] = val;
                }
            }
            lines.push(line);
        }
        return lines;
    }

    /**
     * Show a toast notification.
     */
    function showToast(message, type) {
        var host = document.getElementById('bccf-toast-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'bccf-toast-host';
            document.body.appendChild(host);
        }
        var toast = document.createElement('div');
        toast.className = 'bccf-toast ' + (type || 'info');
        toast.textContent = message;
        host.appendChild(toast);
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(12px)';
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    /**
     * Show a confirmation modal. Returns a Promise<boolean>.
     * Resolves true on Confirm / Enter, false on Cancel / Esc.
     */
    function confirmDialog(opts) {
        return new Promise(function(resolve) {
            var backdrop = document.createElement('div');
            backdrop.className = 'bccf-modal-backdrop';

            var modal = document.createElement('div');
            modal.className = 'bccf-modal';
            modal.setAttribute('role', 'dialog');

            var headline = document.createElement('div');
            headline.className = 'bccf-modal-headline';
            headline.textContent = opts.headline || 'Confirm';

            var body = document.createElement('div');
            body.className = 'bccf-modal-body';
            body.textContent = opts.body || '';

            var actions = document.createElement('div');
            actions.className = 'bccf-modal-actions';

            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'bccf-btn';
            cancelBtn.textContent = 'Cancel';

            var confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'bccf-btn bccf-btn-pri';
            confirmBtn.textContent = 'Confirm';

            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);
            modal.appendChild(headline);
            modal.appendChild(body);
            modal.appendChild(actions);
            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);

            function cleanup(result) {
                backdrop.remove();
                resolve(result);
            }

            cancelBtn.addEventListener('click', function() { cleanup(false); });
            confirmBtn.addEventListener('click', function() { cleanup(true); });
            backdrop.addEventListener('click', function(e) {
                if (e.target === backdrop) cleanup(false);
            });
            document.addEventListener('keydown', function handler(e) {
                if (e.key === 'Escape') { document.removeEventListener('keydown', handler); cleanup(false); }
                if (e.key === 'Enter')  { document.removeEventListener('keydown', handler); cleanup(true); }
            });

            confirmBtn.focus();
        });
    }

    // =====================================================================
    //  BCCF_CALC — inline mirror of bc_cf_calculator.js (client IIFE copy)
    //  Must match the AMD module exactly. Spec §3.14.
    // =====================================================================

    var BCCF_CALC = (function() {
        var _round2 = function(n) { return Math.round(n * 100) / 100; };

        var weights = function(distribution, n) {
            var w = new Array(n);
            for (var i = 1; i <= n; i++) {
                if (distribution === 'linear') {
                    w[i - 1] = 1;
                } else if (distribution === 's_curve') {
                    w[i - 1] = Math.sin(Math.PI * (i - 0.5) / n);
                } else if (distribution === 'front_loaded') {
                    w[i - 1] = n - i + 1;
                } else if (distribution === 'back_loaded') {
                    w[i - 1] = i;
                } else {
                    throw new Error('Unknown distribution: ' + distribution);
                }
            }
            return w;
        };

        var normalize = function(w) {
            var total = w.reduce(function(s, x) { return s + x; }, 0);
            var p = w.map(function(x) { return _round2(x / total * 100); });
            var drift = _round2(100 - p.reduce(function(s, x) { return s + x; }, 0));
            p[p.length - 1] = _round2(p[p.length - 1] + drift);
            return p;
        };

        var computeDates = function(startDate, n, interval) {
            if (interval !== 'monthly' && interval !== 'bi_weekly' && interval !== 'weekly') {
                throw new Error('Unknown interval: ' + interval);
            }
            var out = new Array(n);
            for (var i = 0; i < n; i++) {
                if (interval === 'monthly') {
                    var d = new Date(startDate);
                    d.setMonth(d.getMonth() + i);
                    out[i] = d;
                } else {
                    var days = interval === 'weekly' ? 7 : 14;
                    var d2 = new Date(startDate);
                    d2.setDate(d2.getDate() + i * days);
                    out[i] = d2;
                }
            }
            return out;
        };

        var computeEndDate = function(startDate, n, interval) {
            return computeDates(startDate, n, interval)[n - 1];
        };

        var generate = function(opts) {
            var distribution = opts.distribution;
            var periods = opts.periods;
            var interval = opts.interval;
            var startDate = opts.startDate;
            var source = opts.source;

            var w = weights(distribution, periods);
            var p = normalize(w);
            var dates = computeDates(startDate, periods, interval);
            var rows = p.map(function(pct, i) {
                return {
                    periodDate: dates[i],
                    label: 'Period ' + (i + 1),
                    percentage: pct,
                    amount: _round2(source * pct / 100)
                };
            });
            var sumAmt = rows.reduce(function(s, r) { return s + r.amount; }, 0);
            var amtDrift = _round2(source - sumAmt);
            if (amtDrift !== 0) {
                rows[rows.length - 1].amount = _round2(rows[rows.length - 1].amount + amtDrift);
            }
            return rows;
        };

        var rebalance = function(rows, source, lastEditedIndex) {
            var out = rows.map(function(r) { return Object.assign({}, r); });
            var excess = _round2(out.reduce(function(s, r) { return s + r.percentage; }, 0) - 100);
            if (Math.abs(excess) < 0.01) return out;
            var targets = out.map(function(_, i) { return i; }).filter(function(i) { return i !== lastEditedIndex; });
            var sumTarget = targets.reduce(function(s, i) { return s + out[i].percentage; }, 0);
            if (sumTarget > 0) {
                targets.forEach(function(i) {
                    out[i].percentage = _round2(out[i].percentage - (out[i].percentage / sumTarget) * excess);
                    if (out[i].percentage < 0) out[i].percentage = 0;
                });
                targets.forEach(function(i) {
                    out[i].amount = _round2(source * out[i].percentage / 100);
                });
                var lastTarget = targets[targets.length - 1];
                var sumPct = out.reduce(function(s, r) { return s + r.percentage; }, 0);
                var pctDrift = _round2(100 - sumPct);
                var adjustedPct = _round2(out[lastTarget].percentage + pctDrift);
                if (adjustedPct >= 0) {
                    out[lastTarget].percentage = adjustedPct;
                    var sumAmt = out.reduce(function(s, r) { return s + r.amount; }, 0);
                    var amtDrift = _round2(source - sumAmt);
                    out[lastTarget].amount = _round2(out[lastTarget].amount + amtDrift);
                }
            }
            return out;
        };

        return { weights: weights, normalize: normalize, computeDates: computeDates, computeEndDate: computeEndDate, generate: generate, rebalance: rebalance };
    })();

    // ─── Tab Switching ──────────────────────────────────────────────────

    /**
     * Switch between Cash Flow and Accrual tabs.
     * @param {string} tabId      - Section ID to activate (e.g. 'cashflow' or 'co_rev_cashflow')
     * @param {string} [navId]    - Tab nav container ID (defaults to 'bc_cf_tab_nav' for backward compat)
     */
    bcTiming.switchTab = function(tabId, navId) {
        // Update tab links — scope to the specific nav container
        var nav = document.getElementById(navId || 'bc_cf_tab_nav');
        if (nav) {
            var tabs = nav.querySelectorAll('a[data-tab]');
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i].getAttribute('data-tab') === tabId) {
                    tabs[i].classList.add('active');
                    tabs[i].classList.add('cashflow');
                } else {
                    tabs[i].classList.remove('active');
                    tabs[i].classList.remove('cashflow');
                }
            }
        }

        // Show/hide sections — only toggle siblings within the same container
        if (nav) {
            var container = nav.parentElement;
            if (container) {
                var sections = container.querySelectorAll('.bccf-section');
                for (var j = 0; j < sections.length; j++) {
                    var sectionEl = sections[j];
                    var sId = sectionEl.getAttribute('data-section-id');
                    if (sId === tabId) {
                        sectionEl.classList.add('active');
                    } else {
                        sectionEl.classList.remove('active');
                    }
                }
            }
        }
    };

    // ─── Calculator (T21–T23) ───────────────────────────────────────────

    /**
     * Read the current calculator inputs for a section.
     */
    function getCalcInputs(sectionId) {
        var dist     = document.getElementById(sectionId + '_calc_dist');
        var perdsEl  = document.getElementById(sectionId + '_calc_periods');
        var intEl    = document.getElementById(sectionId + '_calc_interval');
        var startEl  = document.getElementById(sectionId + '_calc_start');
        return {
            distribution: dist     ? dist.value    : 's_curve',
            periods:      perdsEl  ? (parseInt(perdsEl.value, 10) || 6) : 6,
            interval:     intEl    ? intEl.value   : 'monthly',
            startDateStr: startEl  ? startEl.value : ''
        };
    }

    /**
     * Format a Date to YYYY-MM-DD (for input[type=date]).
     */
    function calcFmtDate(d) {
        if (!d) return '';
        var yyyy = d.getFullYear();
        var mm   = String(d.getMonth() + 1).padStart(2, '0');
        var dd   = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    /**
     * Format a Date for display: "Apr 15 2026"
     */
    function calcFmtDisplay(d) {
        if (!d) return '';
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear();
    }

    /**
     * Update the live preview panel for a section.
     */
    bcTiming.calcPreview = function(sectionId) {
        var inp = getCalcInputs(sectionId);
        var prevId = sectionId + '_calc_preview';
        var preview = document.getElementById(prevId);
        if (!preview) return;

        if (!inp.startDateStr) {
            preview.classList.remove('visible');
            return;
        }

        var startDate = new Date(inp.startDateStr + 'T00:00:00');
        if (isNaN(startDate.getTime())) {
            preview.classList.remove('visible');
            return;
        }

        var n = Math.max(1, Math.min(36, inp.periods));
        var endDate = BCCF_CALC.computeEndDate(startDate, n, inp.interval);

        // Update end date input
        var endEl = document.getElementById(sectionId + '_calc_end');
        if (endEl) endEl.value = calcFmtDate(endDate);

        // Build preview rows
        var sourceAmount = getSourceAmount(sectionId);
        var rows;
        try {
            rows = BCCF_CALC.generate({
                distribution: inp.distribution,
                periods: n,
                interval: inp.interval,
                startDate: startDate,
                source: sourceAmount
            });
        } catch (e) {
            preview.classList.remove('visible');
            return;
        }

        // Compute cumulatives
        var runPct = 0, runAmt = 0;
        rows.forEach(function(r) {
            runPct = Math.round((runPct + r.percentage) * 100) / 100;
            runAmt = Math.round((runAmt + r.amount) * 100) / 100;
            r.cumPct = runPct;
            r.cumAmt = runAmt;
        });

        // Meta line
        var distLabel = { s_curve: 'S-curve', linear: 'Linear', front_loaded: 'Front-loaded', back_loaded: 'Back-loaded' }[inp.distribution] || inp.distribution;
        var intLabel  = { monthly: 'monthly', bi_weekly: 'bi-weekly', weekly: 'weekly' }[inp.interval] || inp.interval;
        var metaEl = document.getElementById(prevId + '_meta');
        if (metaEl) {
            metaEl.textContent = distLabel + ' · ' + n + ' ' + intLabel + ' periods · ' + calcFmtDisplay(startDate) + ' → ' + calcFmtDisplay(endDate);
        }

        // Bar chart
        var barsEl = document.getElementById(prevId + '_bars');
        if (barsEl) {
            var maxPct = rows.reduce(function(m, r) { return Math.max(m, r.percentage); }, 0);
            var barsHtml = '';
            rows.forEach(function(r) {
                var h = maxPct > 0 ? Math.round((r.percentage / maxPct) * 40) : 2;
                barsHtml += '<div class="bar-wrap"><div class="bar-lbl">' + r.percentage.toFixed(1) + '%</div><div class="bar" style="height:' + Math.max(h, 2) + 'px;"></div></div>';
            });
            barsEl.innerHTML = barsHtml;
        }

        // Preview rows table (max 5 + "N more")
        var rowsEl = document.getElementById(prevId + '_rows');
        var moreEl = document.getElementById(prevId + '_more');
        if (rowsEl) {
            var preview5 = rows.slice(0, 5);
            var rowsHtml = '';
            preview5.forEach(function(r) {
                rowsHtml += '<tr>'
                    + '<td>' + calcFmtDate(r.periodDate) + '</td>'
                    + '<td>' + esc(r.label) + '</td>'
                    + '<td class="right">' + r.percentage.toFixed(1) + '%</td>'
                    + '<td class="right">$' + r.amount.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + '</td>'
                    + '<td class="right">' + r.cumPct.toFixed(1) + '%</td>'
                    + '<td class="right">$' + r.cumAmt.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + '</td>'
                    + '</tr>';
            });
            rowsEl.innerHTML = rowsHtml;
        }
        if (moreEl) {
            moreEl.textContent = rows.length > 5 ? ('+ ' + (rows.length - 5) + ' more') : '';
        }

        preview.classList.add('visible');
    };

    /**
     * Generate rows from the calculator — replaces the grid (with confirm if dirty).
     */
    bcTiming.calcGenerate = function(sectionId) {
        var inp = getCalcInputs(sectionId);
        if (!inp.startDateStr) {
            showToast('Please enter a start date.', 'error');
            return;
        }
        var startDate = new Date(inp.startDateStr + 'T00:00:00');
        if (isNaN(startDate.getTime())) {
            showToast('Invalid start date.', 'error');
            return;
        }
        var n = Math.max(1, Math.min(36, inp.periods));
        var sourceAmount = getSourceAmount(sectionId);
        var isDirty = !!window._bccfDirty && !!window._bccfDirty[sectionId];

        function doGenerate() {
            var rows;
            try {
                rows = BCCF_CALC.generate({
                    distribution: inp.distribution,
                    periods: n,
                    interval: inp.interval,
                    startDate: startDate,
                    source: sourceAmount
                });
            } catch (e) {
                showToast('Generation failed: ' + e.message, 'error');
                return;
            }

            // Add cumulatives
            var runPct = 0, runAmt = 0;
            rows.forEach(function(r) {
                runPct = Math.round((runPct + r.percentage) * 100) / 100;
                runAmt = Math.round((runAmt + r.amount) * 100) / 100;
                r.cumulativePct = runPct;
                r.cumulativeAmt = runAmt;
                r.periodDate = calcFmtDate(r.periodDate);
                r.costCode = '';
                r.costType = '';
            });

            populateGrid(sectionId, rows, sourceAmount);
            updateKpi(sectionId, rows, sourceAmount);

            // Reset dirty flags
            if (!window._bccfDirty) window._bccfDirty = {};
            window._bccfDirty[sectionId] = false;

            showToast('Generated ' + rows.length + ' rows.', 'success');
        }

        if (isDirty) {
            confirmDialog({
                headline: 'Replace existing rows?',
                body: 'Generating will replace your current rows.'
            }).then(function(confirmed) {
                if (confirmed) doGenerate();
            });
        } else {
            doGenerate();
        }
    };

    /**
     * Clear all rows from the grid.
     */
    bcTiming.calcClearAll = function(sectionId) {
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return;
        var hasRows = tbody.querySelectorAll('tr[data-section="' + sectionId + '"]').length > 0;
        if (!hasRows) return;

        confirmDialog({
            headline: 'Clear all rows?',
            body: 'This will remove all timing lines from the grid.'
        }).then(function(confirmed) {
            if (!confirmed) return;
            tbody.innerHTML = '';
            var sourceAmount = getSourceAmount(sectionId);
            updateTotals(sectionId, [], sourceAmount);
            updateKpi(sectionId, [], sourceAmount);
            if (!window._bccfDirty) window._bccfDirty = {};
            window._bccfDirty[sectionId] = false;
            showToast('Cleared all rows.', 'info');
        });
    };

    // ─── Dirty tracking ─────────────────────────────────────────────────

    /**
     * Mark a section grid as dirty when any row input changes.
     * Called from grid row inputs (added when rows are populated).
     */
    bcTiming.markDirty = function(sectionId) {
        if (!window._bccfDirty) window._bccfDirty = {};
        window._bccfDirty[sectionId] = true;
    };

    /**
     * Populate the grid tbody with lines.
     */
    function populateGrid(sectionId, lines, sourceAmount) {
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return;

        // Determine if we have cost code columns by checking thead
        var gridEl = document.getElementById(sectionId + '_grid');
        var showCostCode = false;
        if (gridEl) {
            var ths = gridEl.querySelectorAll('thead th');
            for (var h = 0; h < ths.length; h++) {
                if (ths[h].textContent.trim() === 'Cost Code') {
                    showCostCode = true;
                    break;
                }
            }
        }

        var html = '';
        for (var i = 0; i < lines.length; i++) {
            html += buildRowHtml(sectionId, lines[i], i, showCostCode);
        }
        tbody.innerHTML = html;

        updateTotals(sectionId, lines, sourceAmount);
    }

    /**
     * Build the HTML for a single editable row.
     */
    function buildRowHtml(sectionId, line, idx, showCostCode) {
        var rowNum = idx + 1;
        var pct = Number(line.percentage) || 0;
        var amt = Number(line.amount) || 0;
        var cumPct = Number(line.cumulativePct) || 0;
        var cumAmt = Number(line.cumulativeAmt) || 0;
        var dateVal = line.periodDate || '';
        var label = line.label || 'Period ' + rowNum;

        var row = '<tr data-section="' + esc(sectionId) + '" data-index="' + idx + '">';
        row += '<td class="center rownum">' + rowNum + '</td>';

        if (showCostCode) {
            row += '<td><input type="text" value="' + esc(line.costCode || '') + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="costCode" placeholder="Cost Code"></td>';
            row += '<td><input type="text" value="' + esc(line.costType || '') + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="costType" placeholder="Cost Type"></td>';
        }

        row += '<td><input type="date" value="' + esc(dateVal) + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="periodDate" onchange="bcTiming.markDirty(\\'' + esc(sectionId) + '\\')"></td>';
        row += '<td><input type="text" value="' + esc(label) + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="label" placeholder="Period label" onchange="bcTiming.markDirty(\\'' + esc(sectionId) + '\\')"></td>';
        row += '<td class="right"><input type="number" value="' + pct + '" step="0.01" min="0" max="100" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="percentage" onchange="bcTiming.markDirty(\\'' + esc(sectionId) + '\\');bcTiming.recalculate(\\'' + esc(sectionId) + '\\')"></td>';
        row += '<td class="right"><input type="text" value="' + bcTiming.formatCurrency(amt) + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="amount" onfocus="this.select()" onblur="bcTiming.markDirty(\\'' + esc(sectionId) + '\\');bcTiming.onAmountChange(\\'' + esc(sectionId) + '\\',' + idx + ')" onchange="bcTiming.markDirty(\\'' + esc(sectionId) + '\\');bcTiming.onAmountChange(\\'' + esc(sectionId) + '\\',' + idx + ')" style="text-align:right;"></td>';
        row += '<td class="right cum">' + bcTiming.formatPercent(cumPct) + '</td>';
        row += '<td class="right cum">' + bcTiming.formatCurrency(cumAmt) + '</td>';
        row += '<td class="center"><button type="button" class="bccf-btn bccf-btn-danger-ghost" title="Remove line" onclick="bcTiming.removeRow(\\'' + esc(sectionId) + '\\', ' + idx + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>';
        row += '</tr>';
        return row;
    }

    /**
     * Update total row and validation indicator.
     */
    function updateTotals(sectionId, lines, sourceAmount) {
        var totalPct = 0;
        var totalAmt = 0;
        for (var i = 0; i < lines.length; i++) {
            totalPct = round2(totalPct + (Number(lines[i].percentage) || 0));
            totalAmt = round2(totalAmt + (Number(lines[i].amount) || 0));
        }

        var totalRow = document.getElementById(sectionId + '_total_row');
        if (totalRow) {
            var pctCell = totalRow.querySelector('[data-field="total_pct"]');
            var amtCell = totalRow.querySelector('[data-field="total_amt"]');
            if (pctCell) pctCell.textContent = bcTiming.formatPercent(totalPct);
            if (amtCell) amtCell.textContent = bcTiming.formatCurrency(totalAmt);
        }

        var validationEl = document.getElementById(sectionId + '_validation');
        if (validationEl) {
            var isValid = Math.abs(totalPct - 100) < 0.01 && Math.abs(totalAmt - sourceAmount) < 0.01;
            if (isValid) {
                validationEl.innerHTML = '<span class="bccf-validation valid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Balanced (100%)</span>';
            } else {
                validationEl.innerHTML = '<span class="bccf-validation invalid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ' + bcTiming.formatPercent(totalPct) + ' allocated</span>';
            }
        }
    }

    /**
     * Update the KPI bar for a section.
     */
    function updateKpi(sectionId, lines, sourceAmount) {
        var kpiContainer = document.getElementById(sectionId + '_kpi');
        if (!kpiContainer) return;

        var scheduledAmt = 0;
        for (var i = 0; i < lines.length; i++) {
            scheduledAmt = round2(scheduledAmt + (Number(lines[i].amount) || 0));
        }
        var scheduledPct = sourceAmount > 0 ? round2((scheduledAmt / sourceAmount) * 100) : 0;
        var remainingAmt = round2(sourceAmount - scheduledAmt);
        var remainingPct = sourceAmount > 0 ? round2((remainingAmt / sourceAmount) * 100) : 0;
        var isPctComplete = scheduledPct >= 100;
        var pctClass = isPctComplete ? 'green' : '';
        var remClass = remainingAmt <= 0 ? 'green' : (remainingPct > 50 ? 'red' : 'gold');

        kpiContainer.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 18px;background:var(--bccf-bg-50);border-bottom:1px solid var(--bccf-border);">'
            + '<div class="bccf-kpi"><div class="bccf-k">Total Amount</div><div class="bccf-v">' + bcTiming.formatCurrency(sourceAmount) + '</div></div>'
            + '<div class="bccf-kpi"><div class="bccf-k">Scheduled</div><div class="bccf-v' + (pctClass ? ' accent' : '') + '">' + bcTiming.formatCurrency(scheduledAmt) + '</div><div class="bccf-sub">' + bcTiming.formatPercent(scheduledPct) + '</div></div>'
            + '<div class="bccf-kpi"><div class="bccf-k">Remaining</div><div class="bccf-v">' + bcTiming.formatCurrency(remainingAmt) + '</div><div class="bccf-sub">' + bcTiming.formatPercent(remainingPct) + '</div></div>'
            + '<div class="bccf-kpi"><div class="bccf-k">Completion</div><div style="margin-top:6px;background:var(--bccf-bg-100);border-radius:var(--bccf-r-full);height:8px;overflow:hidden;"><div style="height:100%;width:' + Math.min(scheduledPct, 100) + '%;background:' + (isPctComplete ? 'var(--bccf-success-500)' : 'var(--bccf-brand-500)') + ';border-radius:var(--bccf-r-full);transition:width 0.5s ease;"></div></div><div class="bccf-sub" style="margin-top:4px;">' + bcTiming.formatPercent(scheduledPct) + '</div></div>'
            + '</div>';
    }

    // ─── Row Management ─────────────────────────────────────────────────

    /**
     * Add an empty row to the section grid.
     */
    bcTiming.addRow = function(sectionId) {
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return;

        var existingRows = tbody.querySelectorAll('tr[data-section="' + sectionId + '"]');
        var newIndex = existingRows.length;

        // Detect cost code columns
        var gridEl = document.getElementById(sectionId + '_grid');
        var showCostCode = false;
        if (gridEl) {
            var ths = gridEl.querySelectorAll('thead th');
            for (var h = 0; h < ths.length; h++) {
                if (ths[h].textContent.trim() === 'Cost Code') {
                    showCostCode = true;
                    break;
                }
            }
        }

        var newLine = {
            periodDate: '',
            percentage: 0,
            amount: 0,
            cumulativePct: 0,
            cumulativeAmt: 0,
            label: 'Period ' + (newIndex + 1),
            costCode: '',
            costType: ''
        };

        var rowHtml = buildRowHtml(sectionId, newLine, newIndex, showCostCode);
        tbody.insertAdjacentHTML('beforeend', rowHtml);

        // Focus the date field of the new row
        var newRow = tbody.querySelector('tr[data-index="' + newIndex + '"]');
        if (newRow) {
            var dateInput = newRow.querySelector('input[data-field="periodDate"]');
            if (dateInput) dateInput.focus();
        }
    };

    /**
     * Remove a row from the section grid and re-index.
     */
    bcTiming.removeRow = function(sectionId, index) {
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return;

        var row = tbody.querySelector('tr[data-section="' + sectionId + '"][data-index="' + index + '"]');
        if (row) {
            row.remove();
        }

        // Re-index remaining rows
        var rows = tbody.querySelectorAll('tr[data-section="' + sectionId + '"]');
        for (var i = 0; i < rows.length; i++) {
            rows[i].setAttribute('data-index', i);
            // Update row number display
            var numCell = rows[i].querySelector('td:first-child');
            if (numCell && !numCell.querySelector('input')) {
                numCell.textContent = (i + 1);
            }
            // Update input data-index attributes
            var inputs = rows[i].querySelectorAll('input[data-section="' + sectionId + '"]');
            for (var j = 0; j < inputs.length; j++) {
                inputs[j].setAttribute('data-index', i);
            }
            // Update remove button onclick
            var removeBtn = rows[i].querySelector('.bccf-btn-danger-ghost');
            if (removeBtn) {
                removeBtn.setAttribute('onclick', "bcTiming.removeRow('" + sectionId + "', " + i + ")");
            }
        }

        bcTiming.recalculate(sectionId);
    };

    // ─── Recalculation ──────────────────────────────────────────────────

    /**
     * Recalculate amounts from percentages, update cumulatives, totals, KPIs.
     */
    bcTiming.recalculate = function(sectionId) {
        var sourceAmount = getSourceAmount(sectionId);
        var lines = collectLines(sectionId);

        // Detect which field changed — if percentage changed, recalc amount; vice versa.
        // For simplicity, we recalculate amounts from percentages and update cumulatives.
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return;

        var totalPctInput = 0;
        for (var i = 0; i < lines.length; i++) {
            totalPctInput += (lines[i].percentage || 0);
        }

        // Recalculate amounts from percentages
        var allocated = 0;
        for (var k = 0; k < lines.length; k++) {
            var isLast = (k === lines.length - 1);
            var pctVal = lines[k].percentage || 0;
            var newAmt;

            if (isLast && totalPctInput >= 99.5 && totalPctInput <= 100.5) {
                // Only absorb rounding when percentages are ~100% (normal case)
                newAmt = round2(sourceAmount - allocated);
            } else {
                newAmt = round2((pctVal / 100) * sourceAmount);
            }
            allocated = round2(allocated + newAmt);
            lines[k].amount = newAmt;

            // Update the amount input in the DOM
            var amtInput = tbody.querySelector('tr[data-index="' + k + '"] input[data-field="amount"]');
            if (amtInput) {
                amtInput.value = bcTiming.formatCurrency(newAmt);
            }
        }

        // Recalculate cumulatives
        var runPct = 0;
        var runAmt = 0;
        var rows = tbody.querySelectorAll('tr[data-section="' + sectionId + '"]');
        for (var m = 0; m < lines.length; m++) {
            runPct = round2(runPct + (lines[m].percentage || 0));
            runAmt = round2(runAmt + (lines[m].amount || 0));
            lines[m].cumulativePct = runPct;
            lines[m].cumulativeAmt = runAmt;

            // Update cumulative cells (the non-input cells after amount)
            if (rows[m]) {
                var cells = rows[m].querySelectorAll('td');
                // Find the cumulative cells — they are the two cells before the action cell
                // that don't contain inputs and have the grey style
                var cumCells = rows[m].querySelectorAll('td[style*="color"]');
                // More reliable: look at all tds, cumulative % and cumulative amt are the
                // last 2 data cells (before the action button cell)
                var allTds = rows[m].querySelectorAll('td');
                var tdCount = allTds.length;
                // Total % is at tdCount - 3, Total Amt at tdCount - 2 (if action cell exists)
                // or tdCount - 2 and tdCount - 1 (if no action cell)
                var hasActionCell = rows[m].querySelector('.bccf-btn-danger-ghost');
                var cumPctIdx = hasActionCell ? tdCount - 3 : tdCount - 2;
                var cumAmtIdx = hasActionCell ? tdCount - 2 : tdCount - 1;
                if (allTds[cumPctIdx]) allTds[cumPctIdx].textContent = bcTiming.formatPercent(runPct);
                if (allTds[cumAmtIdx]) allTds[cumAmtIdx].textContent = bcTiming.formatCurrency(runAmt);
            }
        }

        // Update totals and KPIs
        updateTotals(sectionId, lines, sourceAmount);
        updateKpi(sectionId, lines, sourceAmount);
    };

    // ─── Amount-driven entry ──────────────────────────────────────────

    /**
     * Handle user typing a dollar amount directly.
     * Back-calculates the percentage, sets it, then calls recalculate
     * so totals / cumulatives stay in sync.
     */
    bcTiming.onAmountChange = function(sectionId, index) {
        var sourceAmount = getSourceAmount(sectionId);
        var tbody = document.getElementById(sectionId + '_tbody');
        if (!tbody) return;

        var row = tbody.querySelector('tr[data-index="' + index + '"]');
        if (!row) return;

        var amtInput = row.querySelector('input[data-field="amount"]');
        var pctInput = row.querySelector('input[data-field="percentage"]');
        if (!amtInput || !pctInput) return;

        // Parse the amount (strip currency formatting)
        var rawAmt = parseFloat(amtInput.value.replace(/[^0-9.\-]/g, '')) || 0;

        // Back-calculate percentage (avoid division by zero)
        if (sourceAmount > 0) {
            var newPct = Math.round((rawAmt / sourceAmount) * 100 * 100) / 100;
            pctInput.value = newPct;
        }

        // Format the amount
        amtInput.value = bcTiming.formatCurrency(rawAmt);

        // Amount is the source of truth. Recalculate ALL percentages from
        // current amounts so they reflect the current sourceAmount.
        // This handles the case where sourceAmount changed since lines were created.
        var allRows = tbody.querySelectorAll('tr[data-section="' + sectionId + '"]');
        var runPct = 0, runAmt = 0, totalPct = 0, totalAmt = 0;
        for (var k = 0; k < allRows.length; k++) {
            var rAmtVal = allRows[k].querySelector('input[data-field="amount"]').value;
            var rAmt = parseFloat(rAmtVal.replace(/[^0-9.\-]/g, '')) || 0;
            // Derive percentage from amount (amount is truth)
            var rPct = sourceAmount > 0 ? Math.round((rAmt / sourceAmount) * 100 * 100) / 100 : 0;
            // Update the percentage input to reflect derived value
            var pctEl = allRows[k].querySelector('input[data-field="percentage"]');
            if (pctEl) pctEl.value = rPct;
            runPct = Math.round((runPct + rPct) * 100) / 100;
            runAmt = Math.round((runAmt + rAmt) * 100) / 100;
            totalPct += rPct;
            totalAmt += rAmt;
            // Update cumulative cells (last 2 non-button cells)
            var tds = allRows[k].querySelectorAll('td');
            var cumPct = tds[tds.length - 3];
            var cumAmt = tds[tds.length - 2];
            if (cumPct && !cumPct.querySelector('input')) cumPct.textContent = runPct.toFixed(1) + '%';
            if (cumAmt && !cumAmt.querySelector('input')) cumAmt.textContent = bcTiming.formatCurrency(runAmt);
        }

        // Update total row — find it by looking for the row after the data rows
        var allTrs = tbody.querySelectorAll('tr');
        var lastTr = allTrs[allTrs.length - 1];
        if (lastTr && !lastTr.getAttribute('data-section')) {
            // This is the total row (no data-section attribute)
            var tCells = lastTr.querySelectorAll('td');
            for (var t = 0; t < tCells.length; t++) {
                var txt = tCells[t].textContent;
                if (txt.indexOf('%') > -1 && txt.indexOf('allocated') === -1) {
                    tCells[t].textContent = totalPct.toFixed(1) + '%';
                } else if (txt.indexOf('$') > -1) {
                    tCells[t].textContent = bcTiming.formatCurrency(totalAmt);
                }
            }
            // Update allocated badge
            var badge = lastTr.querySelector('td:last-child');
            if (badge && badge.textContent.indexOf('allocated') > -1) {
                var isBalanced = totalPct >= 99.5 && totalPct <= 100.5;
                badge.innerHTML = isBalanced
                    ? '<span style="color:#10B981;">&#10003; Balanced (' + totalPct.toFixed(0) + '%)</span>'
                    : '<span style="color:#EF4444;">&#9201; ' + totalPct.toFixed(1) + '% allocated</span>';
            }
        }

        // Update KPI cards
        var section = document.getElementById(sectionId + '_section');
        if (section) {
            var kpis = section.querySelectorAll('.bccf-kpi .bccf-v');
            if (kpis.length >= 3) {
                var subLabels = section.querySelectorAll('.bccf-kpi .bccf-sub');
                kpis[1].textContent = bcTiming.formatCurrency(totalAmt);
                if (subLabels[0]) subLabels[0].textContent = totalPct.toFixed(1) + '%';
                var rem = sourceAmount - totalAmt;
                kpis[2].textContent = bcTiming.formatCurrency(rem);
                if (subLabels[1]) subLabels[1].textContent = (100 - totalPct).toFixed(1) + '%';
            }
        }
    };

    // ─── Save ───────────────────────────────────────────────────────────

    /**
     * Collect all line data from both sections and POST to the Suitelet endpoint.
     */
    bcTiming.save = function(transactionId, transactionType, rootId, cfSectionId, acSectionId, saveBtnId, saveStatusId) {
        // Support scoped IDs for multi-pane layouts (CO pages).
        // Fall back to legacy hardcoded IDs for backward compatibility.
        var _rootId = rootId || 'bc_cf_root';
        var _cfId   = cfSectionId || 'cashflow';
        var _acId   = acSectionId || 'accrual';
        var _saveBtnId = saveBtnId || 'bc_save_btn';
        var _saveStatusId = saveStatusId || 'bc_save_status';

        var root = document.getElementById(_rootId);
        var suiteletUrl = root ? root.getAttribute('data-suitelet-url') : '';
        var projectId = root ? root.getAttribute('data-project-id') : '';
        var recordType = root ? root.getAttribute('data-record-type') : '';
        var sourceGroup = root ? root.getAttribute('data-source-group') : '';
        var changeOrderId = root ? root.getAttribute('data-change-order-id') : '';

        if (!suiteletUrl) {
            showToast('Save endpoint not configured.', 'error');
            return;
        }

        // Collect lines from both sections (using scoped section IDs)
        var cashFlowLines = collectLines(_cfId);
        var accrualLines = collectLines(_acId);

        // Validate
        var sourceAmount = getSourceAmount(_cfId);
        var cfPctTotal = 0;
        for (var i = 0; i < cashFlowLines.length; i++) {
            cfPctTotal += (cashFlowLines[i].percentage || 0);
        }
        var acPctTotal = 0;
        for (var j = 0; j < accrualLines.length; j++) {
            acPctTotal += (accrualLines[j].percentage || 0);
        }

        // Warn if not balanced, but allow save
        if (cashFlowLines.length > 0 && Math.abs(cfPctTotal - 100) > 0.1) {
            if (!confirm('Cash Flow schedule is not balanced (' + bcTiming.formatPercent(cfPctTotal) + '). Save anyway?')) {
                return;
            }
        }
        if (accrualLines.length > 0 && Math.abs(acPctTotal - 100) > 0.1) {
            if (!confirm('Accrual schedule is not balanced (' + bcTiming.formatPercent(acPctTotal) + '). Save anyway?')) {
                return;
            }
        }

        // Build individual save requests per timing type (matches Suitelet 'save' action)
        // TIMING_TYPE.CASH_FLOW.id = 1, TIMING_TYPE.ACCRUAL.id = 2
        var requests = [];
        if (cashFlowLines.length > 0) {
            requests.push({
                action: 'save',
                recordType: recordType,
                transactionId: transactionId,
                projectId: projectId,
                lines: cashFlowLines,
                timingType: 1,
                sourceGroup: Number(sourceGroup) || 0,
                changeOrderId: changeOrderId || null
            });
        }
        if (accrualLines.length > 0) {
            requests.push({
                action: 'save',
                recordType: recordType,
                transactionId: transactionId,
                projectId: projectId,
                lines: accrualLines,
                timingType: 2,
                sourceGroup: Number(sourceGroup) || 0,
                changeOrderId: changeOrderId || null
            });
        }

        if (requests.length === 0) {
            showToast('No lines to save.', 'error');
            return;
        }

        // Update UI (using scoped IDs)
        var saveBtn = document.getElementById(_saveBtnId);
        var statusEl = document.getElementById(_saveStatusId);
        if (saveBtn) saveBtn.disabled = true;
        if (statusEl) statusEl.innerHTML = '<span class="bccf-skel" style="width:16px;height:16px;border-radius:50%;display:inline-block;"></span> Saving...';

        var completed = 0;
        var failed = false;

        function onRequestDone(success, errMsg) {
            completed++;
            if (!success) failed = true;

            if (completed < requests.length) return;

            // All requests finished
            if (saveBtn) saveBtn.disabled = false;

            if (!failed) {
                if (statusEl) statusEl.innerHTML = '<span style="color:#10B981;font-weight:600;">Saved successfully</span>';
                showToast('Schedules saved successfully!', 'success');
            } else {
                if (statusEl) statusEl.innerHTML = '<span style="color:#EF4444;font-weight:600;">Save failed</span>';
                showToast('Save failed: ' + (errMsg || 'Unknown error'), 'error');
            }

            setTimeout(function() {
                if (statusEl) statusEl.innerHTML = '<span style="color:#6B7280;">Ready</span>';
            }, 5000);
        }

        for (var r = 0; r < requests.length; r++) {
            (function(payload) {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', suiteletUrl, true);
                xhr.setRequestHeader('Content-Type', 'application/json');

                xhr.onreadystatechange = function() {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        var resp;
                        try { resp = JSON.parse(xhr.responseText); } catch (e) { resp = { success: true }; }
                        onRequestDone(resp.success !== false, resp.error || '');
                    } else {
                        onRequestDone(false, 'HTTP ' + xhr.status);
                    }
                };

                xhr.onerror = function() {
                    onRequestDone(false, 'Network error');
                };

                xhr.send(JSON.stringify(payload));
            })(requests[r]);
        }
    };

})();
`;
    };

    // =========================================================================
    //  Module Return
    // =========================================================================

    return {
        getBaseStyles,
        renderKpiBar,
        renderCalculatorToolbar,
        renderTemplateSelector,    // backward-compat alias for renderCalculatorToolbar
        renderTimingGrid,
        renderTimingSection,
        renderScheduleSubtab,
        renderReportHeader,
        getClientScript
    };

});

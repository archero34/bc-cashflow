/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description UI rendering module for BC Cash Flow Forecasting.
 *              Generates inline HTML/CSS/JS for injection into NetSuite
 *              record subtabs via UserEvent scripts.
 */
define(['./bc_timing_constants'], (Constants) => {

    const { BRAND, BUILT_IN_TEMPLATES, TIMING_TYPE, PERIOD_INTERVAL } = Constants;

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
        return /* css */`
/* ── BlueCollar Cash Flow Timing ── Google Fonts Import ──────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* ── Reset & Container ───────────────────────────────────────────────── */
.bc-cf-container {
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 14px;
    line-height: 1.5;
    color: ${BRAND.NAVY};
    background: ${BRAND.WHITE};
    border-radius: ${BRAND.BORDER_RADIUS};
    box-shadow: ${BRAND.BOX_SHADOW};
    overflow: hidden;
    position: relative;
}
.bc-cf-container *, .bc-cf-container *::before, .bc-cf-container *::after {
    box-sizing: border-box;
}

/* ── Header ──────────────────────────────────────────────────────────── */
.bc-cf-header {
    background: linear-gradient(135deg, ${BRAND.NAVY} 0%, ${BRAND.NAVY_LIGHT} 100%);
    color: ${BRAND.WHITE};
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}
.bc-cf-header-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: 10px;
}
.bc-cf-header-title svg {
    flex-shrink: 0;
}
.bc-cf-header-meta {
    font-size: 12px;
    opacity: 0.8;
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
}
.bc-cf-header-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.bc-cf-header-meta strong {
    font-weight: 600;
    opacity: 1;
}

/* ── Tab Navigation ──────────────────────────────────────────────────── */
.bc-cf-tab-nav {
    display: flex;
    background: ${BRAND.GREY_LIGHT};
    border-bottom: 2px solid ${BRAND.GREY_MID};
    padding: 0 24px;
    gap: 0;
}
.bc-cf-tab-nav button {
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 12px 24px;
    border: none;
    background: transparent;
    color: ${BRAND.GREY_DARK};
    cursor: pointer;
    position: relative;
    transition: color 0.2s ease, background 0.2s ease;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
}
.bc-cf-tab-nav button:hover {
    color: ${BRAND.NAVY};
    background: rgba(4, 35, 61, 0.04);
}
.bc-cf-tab-nav button.active {
    color: ${BRAND.NAVY};
    border-bottom-color: ${BRAND.GOLD};
    background: ${BRAND.WHITE};
}
.bc-cf-tab-nav button.active::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 3px;
    background: ${BRAND.GOLD};
    border-radius: 3px 3px 0 0;
}

/* ── KPI Bar ─────────────────────────────────────────────────────────── */
.bc-cf-kpi-bar {
    display: flex;
    gap: 16px;
    padding: 20px 24px;
    overflow-x: auto;
    background: ${BRAND.GREY_LIGHT};
    border-bottom: 1px solid ${BRAND.GREY_MID};
}
.bc-cf-kpi-card {
    background: ${BRAND.WHITE};
    border-radius: ${BRAND.BORDER_RADIUS};
    box-shadow: ${BRAND.BOX_SHADOW};
    padding: 16px 20px;
    min-width: 140px;
    flex: 1;
    text-align: center;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    border: 1px solid rgba(0,0,0,0.04);
}
.bc-cf-kpi-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.bc-cf-kpi-value {
    font-size: 24px;
    font-weight: 700;
    color: ${BRAND.NAVY};
    line-height: 1.2;
    margin-bottom: 4px;
}
.bc-cf-kpi-value.green { color: ${BRAND.GREEN}; }
.bc-cf-kpi-value.gold  { color: ${BRAND.GOLD}; }
.bc-cf-kpi-value.red   { color: ${BRAND.RED}; }
.bc-cf-kpi-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${BRAND.GREY_DARK};
}

/* ── Section ─────────────────────────────────────────────────────────── */
.bc-cf-section {
    border-left: 3px solid ${BRAND.GOLD};
    margin: 20px 24px;
    padding-left: 20px;
    display: none;
}
.bc-cf-section.active {
    display: block;
}
.bc-cf-section-title {
    font-size: 16px;
    font-weight: 700;
    color: ${BRAND.NAVY};
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.bc-cf-section-title .bc-cf-badge {
    margin-left: 6px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */
.bc-cf-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: ${BRAND.GREY_LIGHT};
    border-radius: ${BRAND.BORDER_RADIUS};
    margin-bottom: 16px;
    flex-wrap: wrap;
    border: 1px solid ${BRAND.GREY_MID};
}
.bc-cf-toolbar label {
    font-size: 12px;
    font-weight: 600;
    color: ${BRAND.GREY_DARK};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
}
.bc-cf-toolbar select,
.bc-cf-toolbar input[type="date"] {
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 13px;
    padding: 8px 12px;
    border: 1px solid ${BRAND.GREY_MID};
    border-radius: 4px;
    background: ${BRAND.WHITE};
    color: ${BRAND.NAVY};
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    min-width: 0;
}
.bc-cf-toolbar select {
    min-width: 200px;
    max-width: 320px;
    flex: 1;
}
.bc-cf-toolbar select:focus,
.bc-cf-toolbar input[type="date"]:focus {
    border-color: ${BRAND.GOLD};
    box-shadow: 0 0 0 3px rgba(255, 183, 3, 0.15);
}

/* ── Grid (Table) ────────────────────────────────────────────────────── */
.bc-cf-grid-wrapper {
    overflow-x: auto;
    border-radius: ${BRAND.BORDER_RADIUS};
    border: 1px solid ${BRAND.GREY_MID};
    margin-bottom: 12px;
}
.bc-cf-grid {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.bc-cf-grid th {
    background: ${BRAND.NAVY};
    color: ${BRAND.WHITE};
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 10px 12px;
    text-align: left;
    position: sticky;
    top: 0;
    z-index: 2;
    white-space: nowrap;
    border-bottom: 2px solid ${BRAND.GOLD};
}
.bc-cf-grid th:first-child {
    border-top-left-radius: 5px;
}
.bc-cf-grid th:last-child {
    border-top-right-radius: 5px;
}
.bc-cf-grid th.right,
.bc-cf-grid td.right {
    text-align: right;
}
.bc-cf-grid th.center,
.bc-cf-grid td.center {
    text-align: center;
}
.bc-cf-grid td {
    padding: 8px 12px;
    border-bottom: 1px solid ${BRAND.GREY_LIGHT};
    color: ${BRAND.NAVY};
    vertical-align: middle;
    transition: background 0.1s ease;
}
.bc-cf-grid tbody tr:hover td {
    background: ${BRAND.GOLD_LIGHT}22;
}
.bc-cf-grid tbody tr:last-child td {
    border-bottom: none;
}
.bc-cf-grid input {
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 13px;
    color: ${BRAND.NAVY};
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    width: 100%;
    outline: none;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.bc-cf-grid input:hover {
    background: ${BRAND.GREY_LIGHT};
    border-color: ${BRAND.GREY_MID};
}
.bc-cf-grid input:focus {
    background: ${BRAND.WHITE};
    border-color: ${BRAND.GOLD};
    box-shadow: 0 0 0 3px rgba(255, 183, 3, 0.15);
}
.bc-cf-grid input[type="date"] {
    min-width: 130px;
}
.bc-cf-grid input[type="number"] {
    text-align: right;
    min-width: 90px;
    -moz-appearance: textfield;
}
.bc-cf-grid input[type="number"]::-webkit-outer-spin-button,
.bc-cf-grid input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

/* ── Total Row ───────────────────────────────────────────────────────── */
.bc-cf-total-row td {
    background: ${BRAND.NAVY}0D !important;
    font-weight: 700;
    color: ${BRAND.NAVY};
    border-top: 2px solid ${BRAND.NAVY};
    font-size: 13px;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
.bc-cf-btn {
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 13px;
    font-weight: 600;
    padding: 9px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    text-decoration: none;
    background: ${BRAND.GOLD};
    color: ${BRAND.NAVY};
}
.bc-cf-btn:hover {
    background: #E5A503;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 183, 3, 0.3);
}
.bc-cf-btn:active {
    transform: translateY(0);
    box-shadow: none;
}
.bc-cf-btn-secondary {
    background: transparent;
    color: ${BRAND.NAVY};
    border: 2px solid ${BRAND.NAVY};
}
.bc-cf-btn-secondary:hover {
    background: ${BRAND.NAVY};
    color: ${BRAND.WHITE};
    box-shadow: 0 4px 12px rgba(4, 35, 61, 0.2);
}
.bc-cf-btn-danger {
    background: transparent;
    color: ${BRAND.RED};
    border: none;
    padding: 4px 8px;
    font-size: 12px;
}
.bc-cf-btn-danger:hover {
    background: ${BRAND.RED_LIGHT};
    box-shadow: none;
    transform: none;
}
.bc-cf-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

/* ── Validation Badge ────────────────────────────────────────────────── */
.bc-cf-validation {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    transition: all 0.3s ease;
}
.bc-cf-validation.valid {
    background: ${BRAND.GREEN_LIGHT};
    color: ${BRAND.GREEN};
}
.bc-cf-validation.invalid {
    background: ${BRAND.RED_LIGHT};
    color: ${BRAND.RED};
}

/* ── Badge (generic pill) ────────────────────────────────────────────── */
.bc-cf-badge {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    border-radius: 20px;
    white-space: nowrap;
}
.bc-cf-badge.navy   { background: ${BRAND.NAVY}15; color: ${BRAND.NAVY}; }
.bc-cf-badge.gold   { background: ${BRAND.GOLD}30; color: #9A6F00; }
.bc-cf-badge.green  { background: ${BRAND.GREEN_LIGHT}; color: ${BRAND.GREEN}; }
.bc-cf-badge.red    { background: ${BRAND.RED_LIGHT}; color: ${BRAND.RED}; }

/* ── Add Row Link ────────────────────────────────────────────────────── */
.bc-cf-add-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: ${BRAND.NAVY_LIGHT};
    cursor: pointer;
    padding: 8px 0;
    border: none;
    background: none;
    font-family: ${BRAND.FONT_FAMILY};
    transition: color 0.2s ease;
}
.bc-cf-add-row:hover {
    color: ${BRAND.GOLD};
}
.bc-cf-add-row svg {
    width: 16px;
    height: 16px;
}

/* ── Save Bar ────────────────────────────────────────────────────────── */
.bc-cf-save-bar {
    position: sticky;
    bottom: 0;
    background: ${BRAND.WHITE};
    border-top: 2px solid ${BRAND.GREY_MID};
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    z-index: 10;
    box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
}
.bc-cf-save-bar .bc-cf-save-status {
    font-size: 13px;
    color: ${BRAND.GREY_DARK};
    display: flex;
    align-items: center;
    gap: 8px;
}
.bc-cf-save-bar .bc-cf-save-actions {
    display: flex;
    gap: 10px;
    align-items: center;
}

/* ── Empty State ─────────────────────────────────────────────────────── */
.bc-cf-empty-state {
    text-align: center;
    padding: 48px 24px;
    color: ${BRAND.GREY_DARK};
}
.bc-cf-empty-state svg {
    margin-bottom: 16px;
    opacity: 0.4;
}
.bc-cf-empty-state p {
    font-size: 15px;
    margin: 0 0 8px;
    font-weight: 600;
    color: ${BRAND.NAVY};
}
.bc-cf-empty-state span {
    font-size: 13px;
    color: ${BRAND.GREY_DARK};
}

/* ── Report Header ───────────────────────────────────────────────────── */
.bc-cf-report-header {
    background: linear-gradient(135deg, ${BRAND.NAVY} 0%, ${BRAND.NAVY_LIGHT} 100%);
    color: ${BRAND.WHITE};
    padding: 24px 32px;
    border-radius: ${BRAND.BORDER_RADIUS} ${BRAND.BORDER_RADIUS} 0 0;
}
.bc-cf-report-header h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
}
.bc-cf-report-header .subtitle {
    font-size: 13px;
    opacity: 0.8;
}
.bc-cf-report-filters {
    display: flex;
    gap: 16px;
    padding: 16px 32px;
    background: ${BRAND.GREY_LIGHT};
    border-bottom: 1px solid ${BRAND.GREY_MID};
    flex-wrap: wrap;
    align-items: flex-end;
}
.bc-cf-report-filters .filter-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.bc-cf-report-filters label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${BRAND.GREY_DARK};
}
.bc-cf-report-filters select,
.bc-cf-report-filters input {
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 13px;
    padding: 8px 12px;
    border: 1px solid ${BRAND.GREY_MID};
    border-radius: 4px;
    background: ${BRAND.WHITE};
    color: ${BRAND.NAVY};
    outline: none;
    transition: border-color 0.2s ease;
}
.bc-cf-report-filters select:focus,
.bc-cf-report-filters input:focus {
    border-color: ${BRAND.GOLD};
    box-shadow: 0 0 0 3px rgba(255,183,3,0.15);
}

/* ── Spinner ─────────────────────────────────────────────────────────── */
.bc-cf-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid ${BRAND.GREY_MID};
    border-top-color: ${BRAND.GOLD};
    border-radius: 50%;
    animation: bc-spin 0.6s linear infinite;
}
@keyframes bc-spin {
    to { transform: rotate(360deg); }
}

/* ── Toast Notification ──────────────────────────────────────────────── */
.bc-cf-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    padding: 14px 24px;
    border-radius: ${BRAND.BORDER_RADIUS};
    font-family: ${BRAND.FONT_FAMILY};
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    animation: bc-toast-in 0.3s ease;
    transition: opacity 0.3s ease, transform 0.3s ease;
}
.bc-cf-toast.success {
    background: ${BRAND.GREEN};
    color: ${BRAND.WHITE};
}
.bc-cf-toast.error {
    background: ${BRAND.RED};
    color: ${BRAND.WHITE};
}
@keyframes bc-toast-in {
    from { opacity: 0; transform: translateY(-12px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Responsive ──────────────────────────────────────────────────────── */
@media (max-width: 768px) {
    .bc-cf-kpi-bar {
        flex-direction: column;
    }
    .bc-cf-kpi-card {
        min-width: auto;
    }
    .bc-cf-toolbar {
        flex-direction: column;
        align-items: stretch;
    }
    .bc-cf-toolbar select {
        min-width: auto;
        max-width: none;
    }
    .bc-cf-header {
        flex-direction: column;
        align-items: flex-start;
    }
    .bc-cf-save-bar {
        flex-direction: column;
        align-items: stretch;
    }
    .bc-cf-save-bar .bc-cf-save-actions {
        justify-content: flex-end;
    }
}
`;
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
<div class="bc-cf-kpi-bar">
    <div class="bc-cf-kpi-card">
        <div class="bc-cf-kpi-value">${esc(fmtCurrency(totalAmount))}</div>
        <div class="bc-cf-kpi-label">${esc(label || 'Total Amount')}</div>
    </div>
    <div class="bc-cf-kpi-card">
        <div class="bc-cf-kpi-value ${pctClass}">${esc(fmtCurrency(scheduledAmount))}</div>
        <div class="bc-cf-kpi-label">Scheduled (${esc(fmtPercent(scheduledPct))})</div>
    </div>
    <div class="bc-cf-kpi-card">
        <div class="bc-cf-kpi-value ${remClass}">${esc(fmtCurrency(remainingAmount))}</div>
        <div class="bc-cf-kpi-label">Remaining (${esc(fmtPercent(remainingPct))})</div>
    </div>
    <div class="bc-cf-kpi-card">
        <div class="bc-cf-kpi-value" style="font-size:18px;">
            <div style="background:${BRAND.GREY_LIGHT};border-radius:20px;height:8px;overflow:hidden;margin-bottom:8px;">
                <div style="height:100%;width:${Math.min(scheduledPct, 100)}%;background:${isPctComplete ? BRAND.GREEN : BRAND.GOLD};border-radius:20px;transition:width 0.5s ease;"></div>
            </div>
            ${esc(fmtPercent(scheduledPct))}
        </div>
        <div class="bc-cf-kpi-label">Completion</div>
    </div>
</div>`;
    };

    // =========================================================================
    //  3. renderTemplateSelector(options)
    // =========================================================================

    /**
     * Renders the template selector toolbar.
     * @param {Object} options
     * @param {string} options.sectionId
     * @param {Object[]} options.templates
     * @returns {string}
     */
    const renderTemplateSelector = ({ sectionId, templates }) => {
        const selId = `${esc(sectionId)}_template_select`;
        const dateId = `${esc(sectionId)}_start_date`;
        const btnId = `${esc(sectionId)}_apply_btn`;

        let templateOptions = '<option value="">-- Choose a Template --</option>';
        (templates || BUILT_IN_TEMPLATES).forEach((t) => {
            templateOptions += `<option value="${esc(t.id)}">${esc(t.name)}</option>`;
        });

        return `
<div class="bc-cf-toolbar">
    <label for="${selId}">Template</label>
    <select id="${selId}" data-section="${esc(sectionId)}">
        ${templateOptions}
    </select>
    <label for="${dateId}">${ICONS.calendar} Start Date</label>
    <input type="date" id="${dateId}" data-section="${esc(sectionId)}" value="${fmtDateInput(new Date())}">
    <button type="button" class="bc-cf-btn" id="${btnId}"
            onclick="bcTiming.applyTemplate('${esc(sectionId)}')">
        Apply Template
    </button>
</div>`;
    };

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
<div class="bc-cf-empty-state">
    ${ICONS.empty}
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
        colHeaders += '<th class="right">Cumulative %</th>';
        colHeaders += '<th class="right">Cumulative Amount</th>';
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
            ? `<span class="bc-cf-validation valid">${ICONS.check} Balanced (100%)</span>`
            : `<span class="bc-cf-validation invalid">${ICONS.warning} ${fmtPercent(totalPct)} allocated</span>`;

        const costCodeCols = showCostCode ? 2 : 0;
        const baseCols = 6; // #, date, label, pct, amt, cum%, cumAmt
        const actionCol = editable ? 1 : 0;
        const totalCols = baseCols + costCodeCols + actionCol;

        let totalRow = `<tr class="bc-cf-total-row" id="${totalRowId}">`;
        totalRow += `<td colspan="${1 + costCodeCols}"></td>`;
        totalRow += `<td colspan="2" style="text-align:right;">Total</td>`;
        totalRow += `<td class="right" data-field="total_pct">${esc(fmtPercent(totalPct))}</td>`;
        totalRow += `<td class="right" data-field="total_amt">${esc(fmtCurrency(totalAmt))}</td>`;
        totalRow += `<td colspan="${2 + actionCol}" class="right" id="${validationId}">${validationHtml}</td>`;
        totalRow += '</tr>';

        // Add row button
        const addRowHtml = editable
            ? `<button type="button" class="bc-cf-add-row" onclick="bcTiming.addRow('${sid}')">
                   ${ICONS.plus} Add Line
               </button>`
            : '';

        return `
<div class="bc-cf-grid-wrapper">
    <table class="bc-cf-grid" id="${gridId}">
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
        row += `<td class="center" style="color:${BRAND.GREY_DARK};font-size:12px;font-weight:600;">${rowNum}</td>`;

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

        row += `<td class="right" style="color:${BRAND.GREY_DARK};font-size:12px;">${esc(fmtPercent(cumPct))}</td>`;
        row += `<td class="right" style="color:${BRAND.GREY_DARK};font-size:12px;">${esc(fmtCurrency(cumAmt))}</td>`;

        if (editable) {
            row += `<td class="center">
                <button type="button" class="bc-cf-btn-danger" title="Remove line"
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
            ? '<span class="bc-cf-badge navy">Accrual</span>'
            : '<span class="bc-cf-badge gold">Cash Flow</span>';

        let lineCountBadge = '';
        if (safeLines.length > 0) {
            lineCountBadge = `<span class="bc-cf-badge green">${safeLines.length} line${safeLines.length !== 1 ? 's' : ''}</span>`;
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
            ? renderTemplateSelector({ sectionId: sid, templates: templates || BUILT_IN_TEMPLATES })
            : '';

        const gridHtml = renderTimingGrid({
            sectionId: sid,
            lines: safeLines,
            sourceAmount: amt,
            editable,
            showCostCode
        });

        return `
<div class="bc-cf-section" id="${sid}_section"
     data-section-id="${sid}"
     data-source-amount="${amt}"
     data-timing-type="${esc(timingType || '')}">
    <div class="bc-cf-section-title">
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
        showCostCode, templates, suiteletUrl, recordType, sourceGroup, changeOrderId,
        sectionPrefix
    }) => {
        const safeTemplates = templates || BUILT_IN_TEMPLATES;
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
            templates: safeTemplates,
            timingType: 'cashflow'
        });

        const accrualSection = renderTimingSection({
            sectionId: acSectionId,
            title: 'Accrual Schedule',
            sourceAmount: amt,
            lines: accrualLines || [],
            editable: editable !== false,
            showCostCode: showCostCode || false,
            templates: safeTemplates,
            timingType: 'accrual'
        });

        const saveBarHtml = (editable !== false) ? `
<div class="bc-cf-save-bar">
    <div class="bc-cf-save-status" id="${saveStatusId}">
        <span style="color:${BRAND.GREY_DARK};">Ready</span>
    </div>
    <div class="bc-cf-save-actions">
        <button type="button" class="bc-cf-btn-secondary" onclick="bcTiming.switchTab('${esc(cfSectionId)}', '${esc(tabNavId)}')">
            Review Cash Flow
        </button>
        <button type="button" class="bc-cf-btn-secondary" onclick="bcTiming.switchTab('${esc(acSectionId)}', '${esc(tabNavId)}')">
            Review Accrual
        </button>
        <button type="button" class="bc-cf-btn" id="${saveBtnId}"
                onclick="bcTiming.save('${esc(String(transactionId || ''))}', '${esc(transactionType || '')}', '${esc(rootId)}', '${esc(cfSectionId)}', '${esc(acSectionId)}', '${esc(saveBtnId)}', '${esc(saveStatusId)}')">
            ${ICONS.save} Save Schedules
        </button>
    </div>
</div>` : '';

        return `
<style>${getBaseStyles()}</style>
<div class="bc-cf-container"
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
    <div class="bc-cf-header">
        <div class="bc-cf-header-title">
            ${ICONS.cashFlow}
            Cash Flow &amp; Accrual Timing
        </div>
        <div class="bc-cf-header-meta">
            <span><strong>Transaction:</strong> ${esc(transactionName || transactionType || '')}</span>
            <span><strong>Entity:</strong> ${esc(entityName || '')}</span>
            ${projectName ? `<span><strong>Project:</strong> ${esc(projectName)}</span>` : ''}
            <span><strong>Amount:</strong> ${esc(fmtCurrency(amt))}</span>
        </div>
    </div>

    <!-- Tab Navigation -->
    <div class="bc-cf-tab-nav" id="${tabNavId}">
        <button type="button" class="active" data-tab="${esc(cfSectionId)}"
                onclick="bcTiming.switchTab('${esc(cfSectionId)}', '${esc(tabNavId)}')">
            ${ICONS.chart} Cash Flow
        </button>
        <button type="button" data-tab="${esc(acSectionId)}"
                onclick="bcTiming.switchTab('${esc(acSectionId)}', '${esc(tabNavId)}')">
            ${ICONS.chart} Accrual
        </button>
    </div>

    <!-- Sections -->
    ${cashFlowSection}
    ${accrualSection}

    <!-- Save Bar -->
    ${saveBarHtml}
</div>

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
<div class="bc-cf-report-filters">
    ${filterItems}
    <div class="filter-group" style="align-self:flex-end;">
        <button type="submit" class="bc-cf-btn">Apply Filters</button>
    </div>
</div>`;
        }

        return `
<style>${getBaseStyles()}</style>
<div class="bc-cf-container">
    <div class="bc-cf-report-header">
        <h1>${esc(title || 'Cash Flow Report')}</h1>
        ${projectName ? `<div class="subtitle">Project: ${esc(projectName)}</div>` : ''}
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
        // Build the BUILT_IN_TEMPLATES JSON for embedding in client-side code
        const templatesJson = JSON.stringify(BUILT_IN_TEMPLATES);
        const periodIntervalJson = JSON.stringify(PERIOD_INTERVAL);

        return `
(function() {
    'use strict';

    // =====================================================================
    //  BlueCollar Timing Client-Side Controller
    // =====================================================================

    var TEMPLATES = ${templatesJson};
    var PERIOD_INTERVAL = ${periodIntervalJson};

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
        var existing = document.querySelectorAll('.bc-cf-toast');
        for (var i = 0; i < existing.length; i++) {
            existing[i].remove();
        }
        var toast = document.createElement('div');
        toast.className = 'bc-cf-toast ' + (type || 'success');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-12px)';
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    // ─── Tab Switching ──────────────────────────────────────────────────

    /**
     * Switch between Cash Flow and Accrual tabs.
     * @param {string} tabId      - Section ID to activate (e.g. 'cashflow' or 'co_rev_cashflow')
     * @param {string} [navId]    - Tab nav container ID (defaults to 'bc_cf_tab_nav' for backward compat)
     */
    bcTiming.switchTab = function(tabId, navId) {
        // Update tab buttons — scope to the specific nav container
        var nav = document.getElementById(navId || 'bc_cf_tab_nav');
        if (nav) {
            var buttons = nav.querySelectorAll('button');
            for (var i = 0; i < buttons.length; i++) {
                if (buttons[i].getAttribute('data-tab') === tabId) {
                    buttons[i].classList.add('active');
                } else {
                    buttons[i].classList.remove('active');
                }
            }
        }

        // Show/hide sections — only toggle siblings within the same container
        if (nav) {
            var container = nav.parentElement;
            if (container) {
                var sections = container.querySelectorAll('.bc-cf-section');
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

    // ─── Template Application ───────────────────────────────────────────

    /**
     * Apply a template to a section — calculates lines client-side and populates grid.
     */
    bcTiming.applyTemplate = function(sectionId) {
        var selectEl = document.getElementById(sectionId + '_template_select');
        var dateEl = document.getElementById(sectionId + '_start_date');

        if (!selectEl || !dateEl) {
            showToast('Template controls not found.', 'error');
            return;
        }

        var templateId = selectEl.value;
        if (!templateId) {
            showToast('Please select a template.', 'error');
            return;
        }

        var startDateStr = dateEl.value;
        if (!startDateStr) {
            showToast('Please select a start date.', 'error');
            return;
        }

        // Find the template
        var template = null;
        for (var i = 0; i < TEMPLATES.length; i++) {
            if (TEMPLATES[i].id === templateId) {
                template = TEMPLATES[i];
                break;
            }
        }
        if (!template) {
            showToast('Template not found: ' + templateId, 'error');
            return;
        }

        var sourceAmount = getSourceAmount(sectionId);
        var startDate = new Date(startDateStr + 'T00:00:00');
        var intervalId = template.interval || PERIOD_INTERVAL.MONTHLY.id;

        // Build lines
        var lines = [];
        var allocated = 0;
        for (var p = 0; p < template.periods.length; p++) {
            var period = template.periods[p];
            var periodDate = advanceDate(startDate, intervalId, p);
            var isLast = (p === template.periods.length - 1);
            var amount;

            if (isLast) {
                amount = round2(sourceAmount - allocated);
            } else {
                amount = round2((period.percentage / 100) * sourceAmount);
            }
            allocated = round2(allocated + amount);

            lines.push({
                periodDate: formatDateInput(periodDate),
                percentage: period.percentage,
                amount: amount,
                label: 'Period ' + period.periodNumber + ' (' + template.name + ')',
                costCode: '',
                costType: ''
            });
        }

        // Recalculate cumulatives
        var runPct = 0;
        var runAmt = 0;
        for (var c = 0; c < lines.length; c++) {
            runPct = round2(runPct + lines[c].percentage);
            runAmt = round2(runAmt + lines[c].amount);
            lines[c].cumulativePct = runPct;
            lines[c].cumulativeAmt = runAmt;
        }

        // Render into the grid
        populateGrid(sectionId, lines, sourceAmount);
        updateKpi(sectionId, lines, sourceAmount);
        showToast('Applied: ' + template.name, 'success');
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
        row += '<td class="center" style="color:#6B7280;font-size:12px;font-weight:600;">' + rowNum + '</td>';

        if (showCostCode) {
            row += '<td><input type="text" value="' + esc(line.costCode || '') + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="costCode" placeholder="Cost Code"></td>';
            row += '<td><input type="text" value="' + esc(line.costType || '') + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="costType" placeholder="Cost Type"></td>';
        }

        row += '<td><input type="date" value="' + esc(dateVal) + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="periodDate"></td>';
        row += '<td><input type="text" value="' + esc(label) + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="label" placeholder="Period label"></td>';
        row += '<td class="right"><input type="number" value="' + pct + '" step="0.01" min="0" max="100" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="percentage" onchange="bcTiming.recalculate(\\'' + esc(sectionId) + '\\')"></td>';
        row += '<td class="right"><input type="text" value="' + bcTiming.formatCurrency(amt) + '" data-section="' + esc(sectionId) + '" data-index="' + idx + '" data-field="amount" onfocus="this.select()" onblur="bcTiming.onAmountChange(\\'' + esc(sectionId) + '\\',' + idx + ')" onchange="bcTiming.onAmountChange(\\'' + esc(sectionId) + '\\',' + idx + ')" style="text-align:right;"></td>';
        row += '<td class="right" style="color:#6B7280;font-size:12px;">' + bcTiming.formatPercent(cumPct) + '</td>';
        row += '<td class="right" style="color:#6B7280;font-size:12px;">' + bcTiming.formatCurrency(cumAmt) + '</td>';
        row += '<td class="center"><button type="button" class="bc-cf-btn-danger" title="Remove line" onclick="bcTiming.removeRow(\\'' + esc(sectionId) + '\\', ' + idx + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>';
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
                validationEl.innerHTML = '<span class="bc-cf-validation valid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Balanced (100%)</span>';
            } else {
                validationEl.innerHTML = '<span class="bc-cf-validation invalid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ' + bcTiming.formatPercent(totalPct) + ' allocated</span>';
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

        kpiContainer.innerHTML = '<div class="bc-cf-kpi-bar">'
            + '<div class="bc-cf-kpi-card"><div class="bc-cf-kpi-value">' + bcTiming.formatCurrency(sourceAmount) + '</div><div class="bc-cf-kpi-label">Total Amount</div></div>'
            + '<div class="bc-cf-kpi-card"><div class="bc-cf-kpi-value ' + pctClass + '">' + bcTiming.formatCurrency(scheduledAmt) + '</div><div class="bc-cf-kpi-label">Scheduled (' + bcTiming.formatPercent(scheduledPct) + ')</div></div>'
            + '<div class="bc-cf-kpi-card"><div class="bc-cf-kpi-value ' + remClass + '">' + bcTiming.formatCurrency(remainingAmt) + '</div><div class="bc-cf-kpi-label">Remaining (' + bcTiming.formatPercent(remainingPct) + ')</div></div>'
            + '<div class="bc-cf-kpi-card"><div class="bc-cf-kpi-value" style="font-size:18px;"><div style="background:#F5F7FA;border-radius:20px;height:8px;overflow:hidden;margin-bottom:8px;"><div style="height:100%;width:' + Math.min(scheduledPct, 100) + '%;background:' + (isPctComplete ? '#10B981' : '#FFB703') + ';border-radius:20px;transition:width 0.5s ease;"></div></div>' + bcTiming.formatPercent(scheduledPct) + '</div><div class="bc-cf-kpi-label">Completion</div></div>'
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
            var removeBtn = rows[i].querySelector('.bc-cf-btn-danger');
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
                // Cumulative % is at tdCount - 3, Cumulative Amt at tdCount - 2 (if action cell exists)
                // or tdCount - 2 and tdCount - 1 (if no action cell)
                var hasActionCell = rows[m].querySelector('.bc-cf-btn-danger');
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

        // Now call recalculate — it reads percentages and computes amounts.
        // Since we already set the correct percentage above, recalculate will
        // produce the matching amount AND properly update totals + cumulatives + KPIs.
        bcTiming.recalculate(sectionId);
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
        if (statusEl) statusEl.innerHTML = '<span class="bc-cf-spinner"></span> Saving...';

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
        renderTemplateSelector,
        renderTimingGrid,
        renderTimingSection,
        renderScheduleSubtab,
        renderReportHeader,
        getClientScript
    };

});

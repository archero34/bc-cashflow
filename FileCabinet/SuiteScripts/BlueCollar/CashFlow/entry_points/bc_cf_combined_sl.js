/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Combined Cash Flow Report — THE MONEY SHOT.
 *              Renders a full standalone HTML page (runs inside an iframe on the
 *              BlueCollar Project record) showing Revenue In vs Cost Out = Net
 *              Cash Position by month.  Includes inline SVG bar chart, summary
 *              KPI cards, detail grid, and CSV export.
 *
 * URL Params:
 *   projectId  – internal ID of the BC Project
 *   timingType – 1 = Cash Flow (default), 2 = Accrual
 */
define([
    'N/log',
    'N/query',
    'N/runtime',
    '../modules/bc_timing_constants'
], (log, query, runtime, Constants) => {

    const MODULE = 'bc_cf_combined_sl';
    const { BRAND, TIMING_TYPE } = Constants;

    // ────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Format a number as $X,XXX with optional negative-parentheses.
     * Zero/null → em-dash.
     */
    const fmtDollar = (val) => {
        if (val == null || val === 0) return '\u2014';
        const abs = Math.abs(val);
        const formatted = '$' + abs.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        return val < 0 ? '(' + formatted + ')' : formatted;
    };

    /**
     * Compact dollar formatting for chart labels — e.g. $3.5K, $1.2M
     */
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

    /**
     * Turn 'YYYY-MM' → 'Mon-YY'  (e.g. '2026-04' → 'Apr-26')
     */
    const periodLabel = (yyyymm) => {
        const [y, m] = yyyymm.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[Number(m) - 1] + '-' + y.slice(2);
    };

    /**
     * Short month abbreviation for chart axis — 'Apr', 'May', etc.
     */
    const monthAbbrev = (yyyymm) => {
        const m = Number(yyyymm.split('-')[1]);
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
    };

    /**
     * Escape HTML entities.
     */
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // ────────────────────────────────────────────────────────────────────────────
    // SuiteQL
    // ────────────────────────────────────────────────────────────────────────────

    const COMBINED_SQL = `
        SELECT
            'Revenue' AS flow_direction,
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                    THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                ELSE 'Base Bid'
            END AS cost_group,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL THEN MIN(rtl.custrecord_bc_rtl_change_order)
                ELSE MIN(rtl.custrecord_bc_rtl_transaction)
            END AS source_id,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL THEN 'cr'
                ELSE 'so'
            END AS source_type
        FROM customrecord_bc_revenue_timing_line rtl
        LEFT JOIN customrecord_bc_change_req cr
            ON cr.id = rtl.custrecord_bc_rtl_change_order
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
        GROUP BY
            CASE WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                 THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                 ELSE 'Base Bid' END,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')

        UNION ALL

        SELECT
            'Cost' AS flow_direction,
            CASE
                WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                    THEN 'CO: ' || NVL(cr2.custrecord_bc_change_order_number, 'Change Order')
                WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                    THEN NVL(NVL(e.entitytitle, e.entityid), 'Vendor')
                ELSE 'Other Cost'
            END AS cost_group,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS amount,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL THEN MIN(ctl.custrecord_bc_ctl_change_order)
                ELSE MIN(ctl.custrecord_bc_ctl_transaction)
            END AS source_id,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL THEN 'cr'
                ELSE 'po'
            END AS source_type
        FROM customrecord_bc_cost_timing_line ctl
        LEFT JOIN transaction t
            ON t.id = ctl.custrecord_bc_ctl_transaction
        LEFT JOIN entity e
            ON e.id = t.entity
        LEFT JOIN customrecord_bc_change_req cr2
            ON cr2.id = ctl.custrecord_bc_ctl_change_order
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
        GROUP BY
            CASE WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                 THEN 'CO: ' || NVL(cr2.custrecord_bc_change_order_number, 'Change Order')
                 WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                 THEN NVL(NVL(e.entitytitle, e.entityid), 'Vendor')
                 ELSE 'Other Cost' END,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')

        ORDER BY flow_direction DESC, cost_group, period
    `;

    const PROJECT_NAME_SQL = `
        SELECT name
        FROM customrecord_cseg_bc_project
        WHERE id = ?
    `;

    const ACTUALS_SQL = `
        SELECT
            'Revenue Actual' AS flow_direction,
            'Invoiced' AS cost_group,
            TO_CHAR(t.trandate, 'YYYY-MM') AS period,
            SUM(ABS(tl.foreignamount)) AS amount
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
        WHERE t.type = 'CustInvc'
          AND tl.cseg_bc_project = ?
          AND tl.mainline = 'F'
          AND tl.taxline = 'F'
        GROUP BY TO_CHAR(t.trandate, 'YYYY-MM')

        UNION ALL

        SELECT
            'Revenue Actual' AS flow_direction,
            'Collected' AS cost_group,
            TO_CHAR(pmt.trandate, 'YYYY-MM') AS period,
            SUM(ABS(pmtline.foreignamount)) AS amount
        FROM transaction pmt
        JOIN transactionline pmtline ON pmtline.transaction = pmt.id AND pmtline.mainline = 'F'
        JOIN transaction inv ON inv.id = pmtline.createdfrom AND inv.type = 'CustInvc'
        JOIN transactionline invline ON invline.transaction = inv.id AND invline.mainline = 'F' AND invline.taxline = 'F'
        WHERE pmt.type = 'CustPymt'
          AND invline.cseg_bc_project = ?
        GROUP BY TO_CHAR(pmt.trandate, 'YYYY-MM')

        UNION ALL

        SELECT
            'Cost Actual' AS flow_direction,
            'Billed' AS cost_group,
            TO_CHAR(t.trandate, 'YYYY-MM') AS period,
            SUM(ABS(tl.foreignamount)) AS amount
        FROM transaction t
        JOIN transactionline tl ON tl.transaction = t.id
        WHERE t.type = 'VendBill'
          AND tl.cseg_bc_project = ?
          AND tl.mainline = 'F'
          AND tl.taxline = 'F'
        GROUP BY TO_CHAR(t.trandate, 'YYYY-MM')

        UNION ALL

        SELECT
            'Cost Actual' AS flow_direction,
            'Paid' AS cost_group,
            TO_CHAR(pmt.trandate, 'YYYY-MM') AS period,
            SUM(ABS(pmtline.foreignamount)) AS amount
        FROM transaction pmt
        JOIN transactionline pmtline ON pmtline.transaction = pmt.id AND pmtline.mainline = 'F'
        JOIN transaction bill ON bill.id = pmtline.createdfrom AND bill.type = 'VendBill'
        JOIN transactionline billline ON billline.transaction = bill.id AND billline.mainline = 'F' AND billline.taxline = 'F'
        WHERE pmt.type = 'VendPmt'
          AND billline.cseg_bc_project = ?
        GROUP BY TO_CHAR(pmt.trandate, 'YYYY-MM')
    `;

    // ────────────────────────────────────────────────────────────────────────────
    // Data fetching & transformation
    // ────────────────────────────────────────────────────────────────────────────

    const fetchProjectName = (projectId) => {
        try {
            const rs = query.runSuiteQL({
                query: PROJECT_NAME_SQL,
                params: [projectId]
            }).asMappedResults();
            return rs.length ? rs[0].name : 'Project #' + projectId;
        } catch (e) {
            log.error({ title: MODULE + '.fetchProjectName', details: e.message });
            return 'Project #' + projectId;
        }
    };

    const fetchCombinedData = (projectId, timingType) => {
        const rs = query.runSuiteQL({
            query: COMBINED_SQL,
            params: [projectId, timingType, projectId, timingType]
        }).asMappedResults();
        return rs;
    };

    /**
     * Fetch actual transaction data (invoices, payments, bills) for a project.
     * Returns { revActualGroups, costActualGroups, revActualTotals, costActualTotals,
     *           grandRevActual, grandCostActual, periods }
     * Wrapped in try/catch — returns empty on failure so forecast-only still works.
     */
    const fetchActuals = (projectId) => {
        const empty = {
            revActualGroups: {}, costActualGroups: {},
            revActualTotals: {}, costActualTotals: {},
            grandRevActual: 0, grandCostActual: 0,
            actualPeriods: []
        };
        try {
            const rs = query.runSuiteQL({
                query: ACTUALS_SQL,
                params: [projectId, projectId, projectId, projectId]
            }).asMappedResults();

            if (!rs || !rs.length) return empty;

            const periodsSet = new Set();
            const revGroups = {};
            const costGroups = {};

            rs.forEach((r) => {
                const dir = r.flow_direction;
                const grp = r.cost_group;
                const per = r.period;
                const amt = Number(r.amount) || 0;
                periodsSet.add(per);

                const bucket = dir === 'Revenue Actual' ? revGroups : costGroups;
                if (!bucket[grp]) bucket[grp] = {};
                bucket[grp][per] = (bucket[grp][per] || 0) + amt;
            });

            const periods = Array.from(periodsSet).sort();

            // Compute totals
            const revTotals = {};
            const costTotals = {};
            let grandRev = 0;
            let grandCost = 0;

            periods.forEach((p) => {
                let rSum = 0;
                Object.values(revGroups).forEach((g) => { rSum += (g[p] || 0); });
                let cSum = 0;
                Object.values(costGroups).forEach((g) => { cSum += (g[p] || 0); });
                revTotals[p] = rSum;
                costTotals[p] = cSum;
                grandRev += rSum;
                grandCost += cSum;
            });

            return {
                revActualGroups: revGroups,
                costActualGroups: costGroups,
                revActualTotals: revTotals,
                costActualTotals: costTotals,
                grandRevActual: grandRev,
                grandCostActual: grandCost,
                actualPeriods: periods
            };
        } catch (e) {
            log.error({ title: MODULE + '.fetchActuals', details: e.message + '\n' + (e.stack || '') });
            return empty;
        }
    };

    /**
     * Transform flat query rows into the report model.
     *
     * Returns {
     *   periods:       ['2026-04','2026-05', ...],       // sorted
     *   revenueGroups: { 'Base Bid': { '2026-04': 7500, ... }, ... },
     *   costGroups:    { 'Vendor A': { '2026-05': 3000, ... }, ... },
     *   revTotals:     { '2026-04': 7500, ... },
     *   costTotals:    { '2026-04': 4000, ... },
     *   netTotals:     { '2026-04': 3500, ... },
     *   grandRevenue:  42000,
     *   grandCost:     33000,
     *   grandNet:       9000
     * }
     */
    const transformData = (rows) => {
        const periodsSet = new Set();
        const revenueGroups = {};
        const costGroups = {};
        const groupSourceMap = {};  // groupName → { source_id, source_type }

        rows.forEach((r) => {
            const dir = r.flow_direction;
            const grp = r.cost_group;
            const per = r.period;
            const amt = Number(r.amount) || 0;

            periodsSet.add(per);

            const bucket = dir === 'Revenue' ? revenueGroups : costGroups;
            if (!bucket[grp]) bucket[grp] = {};
            bucket[grp][per] = (bucket[grp][per] || 0) + amt;

            // Capture source link info (first occurrence wins)
            if (!groupSourceMap[grp] && r.source_id) {
                groupSourceMap[grp] = { source_id: r.source_id, source_type: r.source_type };
            }
        });

        const periods = Array.from(periodsSet).sort();

        // Sort group names — "Base Bid" first for revenue, then alphabetical
        const sortGroups = (groups, firstKey) => {
            const keys = Object.keys(groups).sort();
            if (keys.includes(firstKey)) {
                keys.splice(keys.indexOf(firstKey), 1);
                keys.unshift(firstKey);
            }
            const sorted = {};
            keys.forEach((k) => { sorted[k] = groups[k]; });
            return sorted;
        };

        const sortedRev = sortGroups(revenueGroups, 'Base Bid');
        const sortedCost = sortGroups(costGroups, 'Other Cost'); // alphabetical, no special first

        // Compute totals per period
        const revTotals = {};
        const costTotals = {};
        const netTotals = {};
        let grandRevenue = 0;
        let grandCost = 0;

        periods.forEach((p) => {
            let rSum = 0;
            Object.values(sortedRev).forEach((g) => { rSum += (g[p] || 0); });
            let cSum = 0;
            Object.values(sortedCost).forEach((g) => { cSum += (g[p] || 0); });

            revTotals[p] = rSum;
            costTotals[p] = cSum;
            netTotals[p] = rSum - cSum;
            grandRevenue += rSum;
            grandCost += cSum;
        });

        return {
            periods,
            revenueGroups: sortedRev,
            costGroups: sortedCost,
            revTotals,
            costTotals,
            netTotals,
            grandRevenue,
            grandCost,
            grandNet: grandRevenue - grandCost,
            groupSourceMap
        };
    };

    // ────────────────────────────────────────────────────────────────────────────
    // HTML Builders
    // ────────────────────────────────────────────────────────────────────────────

    const buildEmptyState = (projectName, timingType, scriptUrl) => {
        return buildPageShell(projectName, timingType, scriptUrl, `
            <div style="display:flex;align-items:center;justify-content:center;min-height:400px;text-align:center;">
                <div style="max-width:480px;">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${BRAND.GREY_MID}" stroke-width="1.5" style="margin-bottom:16px;">
                        <path d="M3 3v18h18"/>
                        <path d="M7 16l4-8 4 4 4-6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <h2 style="color:${BRAND.NAVY};margin:0 0 12px 0;font-size:18px;font-weight:600;">
                        No Timing Data Yet
                    </h2>
                    <p style="color:${BRAND.GREY_DARK};font-size:14px;line-height:1.6;margin:0;">
                        No timing schedules have been configured for this project.
                        Add timing data on Purchase Orders, Sales Orders, or Change
                        Requests to see the cash flow forecast here.
                    </p>
                </div>
            </div>
        `);
    };

    /**
     * Common page wrapper — <html><head>...<body> + header + content + </body></html>
     */
    const buildPageShell = (projectName, timingType, scriptUrl, bodyContent) => {
        const typeName = timingType === TIMING_TYPE.ACCRUAL.id ? 'Accrual' : 'Cash Flow';
        const otherType = timingType === TIMING_TYPE.ACCRUAL.id
            ? TIMING_TYPE.CASH_FLOW.id
            : TIMING_TYPE.ACCRUAL.id;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Combined Cash Flow \u2014 ${esc(projectName)}</title>
<style>
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
    .hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .hdr-left h1 { font-size: 20px; font-weight: 700; color: ${BRAND.NAVY}; letter-spacing: -0.3px; margin-bottom: 4px; }
    .hdr-left .sub { font-size: 13px; color: ${BRAND.GREY_DARK}; }
    .hdr-right { display: flex; align-items: center; gap: 8px; }

    /* Toggle buttons are inline-styled — no class needed */

    /* KPI Cards */
    .kpi-row { display: flex; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
    .kpi-card {
        flex: 1 1 180px;
        background: ${BRAND.WHITE};
        border: 1px solid ${BRAND.GREY_MID};
        border-radius: ${BRAND.BORDER_RADIUS};
        padding: 16px 20px;
        box-shadow: ${BRAND.BOX_SHADOW};
    }
    .kpi-card .kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: ${BRAND.GREY_DARK}; margin-bottom: 6px; }
    .kpi-card .kpi-value { font-size: 22px; font-weight: 700; }
    .kpi-revenue .kpi-value { color: ${BRAND.NAVY}; }
    .kpi-cost .kpi-value    { color: ${BRAND.NAVY}; }
    .kpi-net .kpi-value     { color: ${BRAND.GREEN}; }
    .kpi-net.negative .kpi-value { color: ${BRAND.RED}; }
    .kpi-status { display: flex; align-items: center; gap: 8px; }
    .kpi-status .dot { width: 10px; height: 10px; border-radius: 50%; }
    .kpi-status .dot.positive { background: ${BRAND.GREEN}; }
    .kpi-status .dot.negative { background: ${BRAND.RED}; }
    .kpi-status .status-text { font-size: 15px; font-weight: 600; }

    /* Chart container */
    .chart-wrap {
        background: ${BRAND.WHITE};
        border: 1px solid #E5E7EB;
        border-radius: ${BRAND.BORDER_RADIUS};
        padding: 16px 20px 8px;
        margin: 8px 0;
    }
    .chart-wrap h3 { font-size: 13px; font-weight: 600; color: ${BRAND.GREY_DARK}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }

    /* Table */
    .tbl-wrap {
        background: ${BRAND.WHITE};
        border: 1px solid ${BRAND.GREY_MID};
        border-radius: ${BRAND.BORDER_RADIUS};
        box-shadow: ${BRAND.BOX_SHADOW};
        overflow-x: auto;
        margin-bottom: 20px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 700px; }
    th, td { padding: 8px 12px; text-align: right; white-space: nowrap; font-size: 12.5px; border-bottom: 1px solid #E5E7EB; }
    th { font-weight: 600; color: ${BRAND.WHITE}; background: ${BRAND.NAVY}; position: sticky; top: 0; }
    th:first-child, td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; background: inherit; min-width: 160px; }
    th:first-child { z-index: 2; }

    /* Section header rows */
    tr.sec-hdr td { font-weight: 700; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND.NAVY}; background: ${BRAND.GREY_LIGHT}; border-bottom: 2px solid ${BRAND.GREY_MID}; }
    tr.detail td { color: #374151; }
    tr.detail td:first-child { padding-left: 24px; }
    tr.detail:nth-child(even) td { background: ${BRAND.GREY_LIGHT}; }

    /* Revenue total */
    tr.rev-total td { font-weight: 700; background: rgba(255,183,3,0.10); color: ${BRAND.NAVY}; border-top: 2px solid ${BRAND.GOLD}; }

    /* Cost total */
    tr.cost-total td { font-weight: 700; background: ${BRAND.GREY_LIGHT}; color: ${BRAND.NAVY}; border-top: 2px solid ${BRAND.GREY_MID}; }

    /* Net row */
    tr.net-row td { font-weight: 700; background: ${BRAND.NAVY}; color: ${BRAND.WHITE}; font-size: 13px; border-top: none; }
    tr.net-row td.positive { color: ${BRAND.GOLD}; }
    tr.net-row td.negative { color: ${BRAND.RED}; }

    /* Separator */
    tr.sep td { padding: 0; height: 4px; border: none; background: ${BRAND.WHITE}; }

    /* Current month highlight */
    th.cur-month-hdr { background: ${BRAND.GOLD}; color: ${BRAND.NAVY}; font-weight: 700; }
    td.cur-month-cell { border-left: 2px solid rgba(255,183,3,0.45); background: #FFF8E1; }

    /* Actual section rows */
    tr.actual-sec-hdr td { font-weight: 700; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND.NAVY}; background: #EEF2F7; border-bottom: 2px solid #CBD5E1; }
    tr.actual-sec-hdr td .actual-badge { display: inline-block; background: #64748B; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 3px; margin-left: 6px; vertical-align: middle; letter-spacing: 0.3px; }
    tr.actual-detail td { color: #64748B; font-style: italic; }
    tr.actual-detail td:first-child { padding-left: 24px; }
    tr.actual-detail:nth-child(even) td { background: #F8FAFC; }
    tr.rev-actual-total td { font-weight: 700; background: rgba(255,183,3,0.06); color: #64748B; border-top: 2px solid #CBD5E1; font-style: italic; }
    tr.cost-actual-total td { font-weight: 700; background: #F1F5F9; color: #64748B; border-top: 2px solid #CBD5E1; font-style: italic; }
    tr.net-actual-row td { font-weight: 700; background: #334155; color: ${BRAND.WHITE}; font-size: 13px; border-top: none; font-style: italic; }
    tr.net-actual-row td.positive { color: ${BRAND.GOLD}; }
    tr.net-actual-row td.negative { color: ${BRAND.RED}; }
    td.actual-over-forecast { background: rgba(16,185,129,0.10) !important; }

    /* Action bar */
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 16px;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        border: 1px solid ${BRAND.GREY_MID};
        border-radius: ${BRAND.BORDER_RADIUS};
        background: ${BRAND.WHITE};
        color: ${BRAND.NAVY};
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .btn:hover { background: ${BRAND.GREY_LIGHT}; border-color: ${BRAND.NAVY}; }
    .btn svg { width: 14px; height: 14px; }
</style>
</head>
<body>
<div class="page">

    <!-- Header -->
    <div class="hdr">
        <div class="hdr-left">
            <h1>Combined Cash Flow Forecast</h1>
            <div class="sub">Project: ${esc(projectName)}</div>
        </div>
        <div class="hdr-right">
            <div style="display:flex;gap:8px;align-items:center;">
                <span style="font-size:13px;color:#6B7280;font-weight:500;">View:</span>
                <button type="button" disabled
                    style="padding:8px 16px;font-size:13px;font-weight:600;background:#04233D;color:#FFFFFF;
                    border:none;border-radius:6px;cursor:default;">
                    ${esc(typeName)}
                </button>
                <button type="button" onclick="switchView('${otherType}')"
                    style="padding:8px 16px;font-size:13px;font-weight:600;background:#FFB703;color:#04233D;
                    border:none;border-radius:6px;cursor:pointer;">
                    Switch to ${esc(typeName === 'Cash Flow' ? 'Accrual' : 'Cash Flow')}
                </button>
            </div>
        </div>
    </div>

    ${bodyContent}

</div><!-- /.page -->

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

    // ────────────────────────────────────────────────────────────────────────────
    // SVG Bar Chart
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Escape single quotes for safe embedding inside onmouseover attribute strings.
     */
    const escTooltip = (s) => String(s).replace(/'/g, '&#39;').replace(/\\/g, '&#92;');

    /**
     * Full month name from YYYY-MM.
     */
    const monthFull = (yyyymm) => {
        const m = Number(yyyymm.split('-')[1]);
        const y = yyyymm.split('-')[0];
        return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1] + ' ' + y;
    };

    const buildBarChart = (periods, netTotals, data) => {
        if (!periods.length) return '';

        const { revenueGroups, costGroups, revTotals, costTotals } = data;

        // Find max of revenue totals and cost totals across all periods
        const maxRev = Math.max(...periods.map((p) => revTotals[p] || 0), 1);
        const maxCost = Math.max(...periods.map((p) => costTotals[p] || 0), 1);
        const maxVal = Math.max(maxRev, maxCost, 1);

        // SVG layout — compact
        const n = periods.length;
        const vbW = 1000;
        const pad = 40;
        const usable = vbW - pad * 2;
        const slotW = usable / n;
        const barW = Math.min(slotW * 0.28, 32);
        const gap = Math.min(slotW * 0.06, 6);
        const halfH = 70;
        const topM = 24;
        const botM = 28;
        const vbH = topM + halfH * 2 + botM;
        const baseline = topM + halfH;

        let svg = '';
        const tooltipArray = [];

        // $0 baseline — thin dashed line
        svg += '<line x1="' + pad + '" y1="' + baseline + '" x2="' + (vbW - pad) + '" y2="' + baseline + '" stroke="#9CA3AF" stroke-width="0.75" stroke-dasharray="6,4"/>';

        periods.forEach((p, i) => {
            const cx = pad + slotW * i + slotW / 2;
            const revTotal = revTotals[p] || 0;
            const costTotal = costTotals[p] || 0;
            const net = netTotals[p] || 0;

            // Revenue bar (gold, going UP from baseline)
            const revH = revTotal > 0 ? Math.max(Math.round((revTotal / maxVal) * halfH), 2) : 0;
            const revX = cx - barW - gap / 2;
            if (revH > 0) {
                svg += '<rect x="' + revX + '" y="' + (baseline - revH) + '" width="' + barW + '" height="' + revH + '" rx="2" fill="#FFB703"/>';
            }

            // Cost bar (navy, going DOWN from baseline)
            const costH = costTotal > 0 ? Math.max(Math.round((costTotal / maxVal) * halfH), 2) : 0;
            const costX = cx + gap / 2;
            if (costH > 0) {
                svg += '<rect x="' + costX + '" y="' + baseline + '" width="' + barW + '" height="' + costH + '" rx="2" fill="#04233D"/>';
            }

            // Net label above the column group
            const netColor = net >= 0 ? '#10B981' : '#EF4444';
            const netLabelY = revH > 0 ? (baseline - revH - 6) : (baseline - 6);
            svg += '<text x="' + cx + '" y="' + netLabelY + '" text-anchor="middle" fill="' + netColor + '" font-size="9" font-weight="700" font-family="Inter,sans-serif">' + fmtCompact(net) + '</text>';

            // Month label below
            svg += '<text x="' + cx + '" y="' + (vbH - 6) + '" text-anchor="middle" fill="#6B7280" font-size="10" font-weight="500" font-family="Inter,sans-serif">' + monthAbbrev(p) + '</text>';

            // Tooltip — simple summary only (detail is in the table)
            const netTipColor = net >= 0 ? '#34D399' : '#F87171';
            let tip = '<div style="font-weight:700;margin-bottom:6px;">' + monthFull(p) + '</div>';
            tip += '<div style="display:flex;justify-content:space-between;gap:24px;"><span style="color:#FFB703;">Revenue</span><span style="font-weight:600;">' + fmtCompact(revTotal) + '</span></div>';
            tip += '<div style="display:flex;justify-content:space-between;gap:24px;"><span style="color:#93C5FD;">Cost</span><span style="font-weight:600;">' + fmtCompact(costTotal) + '</span></div>';
            tip += '<div style="border-top:1px solid #4B6A88;margin:6px 0 4px;"></div>';
            tip += '<div style="display:flex;justify-content:space-between;gap:24px;font-weight:700;color:' + netTipColor + ';"><span>Net</span><span>' + fmtCompact(net) + '</span></div>';
            tooltipArray.push(tip);

            // Transparent overlay rect for hover — pass index, not HTML
            svg += '<rect x="' + (pad + slotW * i) + '" y="0" width="' + slotW + '" height="' + vbH + '" fill="transparent" onmouseover="bcShowTooltip(evt,' + i + ')" onmouseout="bcHideTooltip()" style="cursor:pointer;"/>';
        });

        const tooltipScript = '<script>'
            + 'var bcTTData=' + JSON.stringify(tooltipArray) + ';'
            + 'var bcTTEl=document.getElementById("bcChartTooltip");'
            + 'function bcShowTooltip(evt,idx){bcTTEl.innerHTML=bcTTData[idx];bcTTEl.style.display="block";bcTTEl.style.left=(evt.clientX+12)+"px";bcTTEl.style.top=(evt.clientY-10)+"px";}'
            + 'function bcHideTooltip(){bcTTEl.style.display="none";}'
            + '<\/script>';

        return '<div class="chart-wrap">'
            + '<h3>Revenue vs Cost by Month</h3>'
            + '<svg width="100%" viewBox="0 0 ' + vbW + ' ' + vbH + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'
            + svg
            + '</svg>'
            + '<div id="bcChartTooltip" style="display:none;position:fixed;background:#04233D;color:#fff;padding:12px 16px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif;pointer-events:none;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);line-height:1.6;min-width:180px;"></div>'
            + tooltipScript
            + '</div>';
    };

    // ────────────────────────────────────────────────────────────────────────────
    // KPI Cards
    // ────────────────────────────────────────────────────────────────────────────

    const buildKPICards = (data, actuals) => {
        const { grandRevenue, grandCost, grandNet } = data;
        const { grandRevActual, grandCostActual } = actuals || { grandRevActual: 0, grandCostActual: 0 };
        const isPositive = grandNet >= 0;
        const statusLabel = isPositive ? 'Cash Positive' : 'Cash Negative';
        const statusColor = isPositive ? BRAND.GREEN : BRAND.RED;

        return `<div class="kpi-row">
            <div class="kpi-card kpi-revenue">
                <div class="kpi-label">Total Revenue</div>
                <div class="kpi-value">${fmtDollar(grandRevenue)}</div>
            </div>
            <div class="kpi-card kpi-cost">
                <div class="kpi-label">Total Cost</div>
                <div class="kpi-value">${fmtDollar(grandCost)}</div>
            </div>
            <div class="kpi-card kpi-net ${isPositive ? '' : 'negative'}">
                <div class="kpi-label">Net Cash Flow</div>
                <div class="kpi-value">${fmtDollar(grandNet)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Status</div>
                <div class="kpi-status">
                    <span class="dot ${isPositive ? 'positive' : 'negative'}"></span>
                    <span class="status-text" style="color:${statusColor}">${statusLabel}</span>
                </div>
            </div>
            ${grandRevActual ? `<div class="kpi-card" style="border-left:4px solid #10B981;">
                <div class="kpi-label">Actual Revenue</div>
                <div class="kpi-value" style="color:#10B981;">${fmtDollar(grandRevActual)}</div>
            </div>` : ''}
            ${grandCostActual ? `<div class="kpi-card" style="border-left:4px solid #EF4444;">
                <div class="kpi-label">Actual Cost</div>
                <div class="kpi-value" style="color:#EF4444;">${fmtDollar(grandCostActual)}</div>
            </div>` : ''}
        </div>`;
    };

    // ────────────────────────────────────────────────────────────────────────────
    // Detail Grid Table
    // ────────────────────────────────────────────────────────────────────────────

    const buildTable = (data, actuals) => {
        const { periods: forecastPeriods, revenueGroups, costGroups, revTotals, costTotals, netTotals,
                grandRevenue, grandCost, grandNet, groupSourceMap } = data;
        const { revActualGroups, costActualGroups, revActualTotals, costActualTotals,
                grandRevActual, grandCostActual, actualPeriods } = actuals || {
            revActualGroups: {}, costActualGroups: {}, revActualTotals: {}, costActualTotals: {},
            grandRevActual: 0, grandCostActual: 0, actualPeriods: []
        };

        // Merge forecast + actual periods into one sorted set
        const allPeriodsSet = new Set(forecastPeriods);
        (actualPeriods || []).forEach((p) => allPeriodsSet.add(p));
        const periods = Array.from(allPeriodsSet).sort();

        // Current month for column highlighting
        const curMonth = (() => {
            const d = new Date();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            return `${d.getFullYear()}-${mm}`;
        })();

        // Helper: build a dollar cell value
        const cell = (val) => fmtDollar(val || 0);

        // Helper: sum a group's values across all periods
        const groupTotal = (grpMap) => {
            let total = 0;
            periods.forEach((p) => { total += (grpMap[p] || 0); });
            return total;
        };

        // Helper: build drillable link for a group name
        const drillLink = (name) => {
            const src = groupSourceMap[name];
            if (!src || !src.source_id) return esc(name);
            const linkUrl = src.source_type === 'cr'
                ? '/app/common/custom/custrecordentry.nl?rectype=495&id=' + src.source_id
                : '/app/accounting/transactions/transaction.nl?id=' + src.source_id;
            return '<a href="' + linkUrl + '" target="_top" style="color:' + BRAND.NAVY + ';text-decoration:none;border-bottom:1px dashed #D1D5DB;">' + esc(name) + '</a>';
        };

        // Header row — highlight current month
        let headerCells = '<th>Category</th>';
        periods.forEach((p) => {
            const isCur = p === curMonth;
            const cls = isCur ? ' class="cur-month-hdr"' : '';
            headerCells += `<th${cls}>${periodLabel(p)}</th>`;
        });
        headerCells += '<th>Total</th>';

        // Revenue section header
        let revHeader = '<tr class="sec-hdr"><td>REVENUE</td>';
        periods.forEach(() => { revHeader += '<td></td>'; });
        revHeader += '<td></td></tr>';

        // Revenue detail rows
        let revRows = '';
        const revGroupNames = Object.keys(revenueGroups);
        revGroupNames.forEach((name) => {
            const grp = revenueGroups[name];
            revRows += '<tr class="detail"><td>' + drillLink(name) + '</td>';
            periods.forEach((p) => {
                const cls = p === curMonth ? ' class="cur-month-cell"' : '';
                revRows += '<td' + cls + '>' + cell(grp[p]) + '</td>';
            });
            revRows += '<td>' + cell(groupTotal(grp)) + '</td></tr>';
        });

        // Revenue total row
        let revTotalRow = '<tr class="rev-total"><td>Revenue Total</td>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month-cell"' : '';
            revTotalRow += '<td' + cls + '>' + cell(revTotals[p]) + '</td>';
        });
        revTotalRow += '<td>' + cell(grandRevenue) + '</td></tr>';

        // Separator
        const sep = '<tr class="sep"><td colspan="' + (periods.length + 2) + '"></td></tr>';

        // Cost section header
        let costHeader = '<tr class="sec-hdr"><td>COST</td>';
        periods.forEach(() => { costHeader += '<td></td>'; });
        costHeader += '<td></td></tr>';

        // Cost detail rows
        let costRows = '';
        const costGroupNames = Object.keys(costGroups);
        costGroupNames.forEach((name) => {
            const grp = costGroups[name];
            costRows += '<tr class="detail"><td>' + drillLink(name) + '</td>';
            periods.forEach((p) => {
                const cls = p === curMonth ? ' class="cur-month-cell"' : '';
                costRows += '<td' + cls + '>' + cell(grp[p]) + '</td>';
            });
            costRows += '<td>' + cell(groupTotal(grp)) + '</td></tr>';
        });

        // Cost total row
        let costTotalRow = '<tr class="cost-total"><td>Cost Total</td>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month-cell"' : '';
            costTotalRow += '<td' + cls + '>' + cell(costTotals[p]) + '</td>';
        });
        costTotalRow += '<td>' + cell(grandCost) + '</td></tr>';

        // ── Revenue Actual section
        const hasRevActuals = revActualGroups && Object.keys(revActualGroups).length > 0;
        let revActualHeader = '';
        let revActualRows = '';
        let revActualTotalRow = '';

        if (hasRevActuals) {
            revActualHeader = '<tr class="actual-sec-hdr"><td>REVENUE ACTUAL <span class="actual-badge">ACTUAL</span></td>';
            periods.forEach(() => { revActualHeader += '<td></td>'; });
            revActualHeader += '<td></td></tr>';

            const revActGroupNames = Object.keys(revActualGroups).sort();
            revActGroupNames.forEach((name) => {
                const grp = revActualGroups[name];
                revActualRows += '<tr class="actual-detail"><td>' + esc(name) + '</td>';
                periods.forEach((p) => {
                    const val = grp[p] || 0;
                    const forecastVal = revTotals[p] || 0;
                    let cls = p === curMonth ? 'cur-month-cell' : '';
                    if (val > 0 && forecastVal > 0 && val > forecastVal) cls += (cls ? ' ' : '') + 'actual-over-forecast';
                    revActualRows += '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + cell(val) + '</td>';
                });
                revActualRows += '<td>' + cell(groupTotal(grp)) + '</td></tr>';
            });

            revActualTotalRow = '<tr class="rev-actual-total"><td>Actual Total</td>';
            periods.forEach((p) => {
                const cls = p === curMonth ? ' class="cur-month-cell"' : '';
                revActualTotalRow += '<td' + cls + '>' + cell(revActualTotals[p]) + '</td>';
            });
            revActualTotalRow += '<td>' + cell(grandRevActual) + '</td></tr>';
        }

        // ── Cost Actual section
        const hasCostActuals = costActualGroups && Object.keys(costActualGroups).length > 0;
        let costActualHeader = '';
        let costActualRows = '';
        let costActualTotalRow = '';

        if (hasCostActuals) {
            costActualHeader = '<tr class="actual-sec-hdr"><td>COST ACTUAL <span class="actual-badge">ACTUAL</span></td>';
            periods.forEach(() => { costActualHeader += '<td></td>'; });
            costActualHeader += '<td></td></tr>';

            const costActGroupNames = Object.keys(costActualGroups).sort();
            costActGroupNames.forEach((name) => {
                const grp = costActualGroups[name];
                costActualRows += '<tr class="actual-detail"><td>' + esc(name) + '</td>';
                periods.forEach((p) => {
                    const val = grp[p] || 0;
                    const forecastVal = costTotals[p] || 0;
                    let cls = p === curMonth ? 'cur-month-cell' : '';
                    if (val > 0 && forecastVal > 0 && val > forecastVal) cls += (cls ? ' ' : '') + 'actual-over-forecast';
                    costActualRows += '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + cell(val) + '</td>';
                });
                costActualRows += '<td>' + cell(groupTotal(grp)) + '</td></tr>';
            });

            costActualTotalRow = '<tr class="cost-actual-total"><td>Actual Total</td>';
            periods.forEach((p) => {
                const cls = p === curMonth ? ' class="cur-month-cell"' : '';
                costActualTotalRow += '<td' + cls + '>' + cell(costActualTotals[p]) + '</td>';
            });
            costActualTotalRow += '<td>' + cell(grandCostActual) + '</td></tr>';
        }

        // Net Forecast row
        let netRow = '<tr class="net-row"><td>NET FORECAST</td>';
        periods.forEach((p) => {
            const v = netTotals[p] || 0;
            const cls = v >= 0 ? 'positive' : 'negative';
            netRow += '<td class="' + cls + '">' + fmtDollar(v) + '</td>';
        });
        const netCls = grandNet >= 0 ? 'positive' : 'negative';
        netRow += '<td class="' + netCls + '">' + fmtDollar(grandNet) + '</td></tr>';

        // Net Actual row
        const hasAnyActuals = hasRevActuals || hasCostActuals;
        let netActualRow = '';
        if (hasAnyActuals) {
            const grandNetActual = grandRevActual - grandCostActual;
            netActualRow = '<tr class="net-actual-row"><td>NET ACTUAL</td>';
            periods.forEach((p) => {
                const v = (revActualTotals[p] || 0) - (costActualTotals[p] || 0);
                const cls = v >= 0 ? 'positive' : 'negative';
                netActualRow += '<td class="' + cls + '">' + fmtDollar(v) + '</td>';
            });
            const netActCls = grandNetActual >= 0 ? 'positive' : 'negative';
            netActualRow += '<td class="' + netActCls + '">' + fmtDollar(grandNetActual) + '</td></tr>';
        }

        return `<div class="tbl-wrap">
            <table>
                <thead><tr>${headerCells}</tr></thead>
                <tbody>
                    ${revHeader}
                    ${revRows}
                    ${revTotalRow}
                    ${hasRevActuals ? sep : ''}
                    ${revActualHeader}
                    ${revActualRows}
                    ${revActualTotalRow}
                    ${sep}
                    ${costHeader}
                    ${costRows}
                    ${costTotalRow}
                    ${hasCostActuals ? sep : ''}
                    ${costActualHeader}
                    ${costActualRows}
                    ${costActualTotalRow}
                    ${sep}
                    ${netRow}
                    ${netActualRow}
                </tbody>
            </table>
        </div>`;
    };

    // ────────────────────────────────────────────────────────────────────────────
    // CSV Export
    // ────────────────────────────────────────────────────────────────────────────

    const buildCSVScript = (data) => {
        const { periods, revenueGroups, costGroups, revTotals, costTotals, netTotals,
                grandRevenue, grandCost, grandNet } = data;

        const groupTotal = (grpMap) => {
            let t = 0;
            periods.forEach((p) => { t += (grpMap[p] || 0); });
            return t;
        };

        // Build CSV as a JS string literal
        const rows = [];

        // Header
        rows.push(['Category', ...periods.map(periodLabel), 'Total']);

        // Revenue header
        rows.push(['REVENUE', ...periods.map(() => ''), '']);

        // Revenue detail
        Object.keys(revenueGroups).forEach((name) => {
            const g = revenueGroups[name];
            rows.push([name, ...periods.map((p) => g[p] || 0), groupTotal(g)]);
        });

        // Revenue total
        rows.push(['Revenue Total', ...periods.map((p) => revTotals[p] || 0), grandRevenue]);

        // Blank
        rows.push([]);

        // Cost header
        rows.push(['COST', ...periods.map(() => ''), '']);

        // Cost detail
        Object.keys(costGroups).forEach((name) => {
            const g = costGroups[name];
            rows.push([name, ...periods.map((p) => g[p] || 0), groupTotal(g)]);
        });

        // Cost total
        rows.push(['Cost Total', ...periods.map((p) => costTotals[p] || 0), grandCost]);

        // Blank
        rows.push([]);

        // Net
        rows.push(['NET CASH FLOW', ...periods.map((p) => netTotals[p] || 0), grandNet]);

        // Escape CSV cell
        const csvEsc = (v) => {
            const s = String(v == null ? '' : v);
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? '"' + s.replace(/"/g, '""') + '"'
                : s;
        };

        const csvString = rows.map((r) => r.map(csvEsc).join(',')).join('\\n');

        return csvString;
    };

    const buildExportButtons = (data, projectName) => {
        const csvContent = buildCSVScript(data);
        const safeName = (projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');

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
            var csv = "${csvContent}";
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = '${safeName}_cashflow.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        </script>`;
    };

    // ────────────────────────────────────────────────────────────────────────────
    // Entry Point
    // ────────────────────────────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;

        if (request.method !== 'GET') {
            response.write('Method not allowed');
            return;
        }

        try {
            const projectId = request.parameters.projectId;
            const timingType = Number(request.parameters.timingType) || TIMING_TYPE.CASH_FLOW.id;

            if (!projectId) {
                response.write('<html><body style="font-family:sans-serif;padding:40px;color:#666;">'
                    + '<p>Missing required parameter: <strong>projectId</strong></p></body></html>');
                return;
            }

            // Fetch project name
            const projectName = fetchProjectName(projectId);

            // Build the script URL base (for toggle navigation)
            const scriptUrl = runtime.getCurrentScript().getParameter({ name: 'custscript_bc_cf_combined_url' }) || '';

            // Fetch combined data
            let rows;
            try {
                rows = fetchCombinedData(projectId, timingType);
            } catch (e) {
                log.error({ title: MODULE + '.fetchCombinedData', details: e.message + '\n' + e.stack });
                rows = [];
            }

            // Empty state
            if (!rows || !rows.length) {
                response.write(buildEmptyState(projectName, timingType, scriptUrl));
                return;
            }

            // Transform
            const data = transformData(rows);

            // Fetch actuals (wrapped in try/catch inside fetchActuals)
            const actuals = fetchActuals(projectId);

            // Build full report
            const bodyContent = [
                buildKPICards(data, actuals),
                buildBarChart(data.periods, data.netTotals, data),
                buildTable(data, actuals),
                buildExportButtons(data, projectName)
            ].join('\n');

            response.write(buildPageShell(projectName, timingType, scriptUrl, bodyContent));

        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write('<html><body style="font-family:sans-serif;padding:40px;color:#EF4444;">'
                + '<h3>Cash Flow Report Error</h3>'
                + '<p>' + esc(e.message) + '</p></body></html>');
        }
    };

    return { onRequest };
});

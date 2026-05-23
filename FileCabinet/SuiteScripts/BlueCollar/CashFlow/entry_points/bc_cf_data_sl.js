/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Shared action-routed JSON data endpoint for all 3 Cash Flow reports.
 *   GET ?action=combined|cost|revenue&projectId=<id>&mode=cash|accrual
 *
 * Returns `{ ok: true, periods, categories, kpis, ... }` or `{ ok: false, error }`.
 * Spec §3.1 architecture; §3.16 loading.
 */
define(['N/log', 'N/query'], function (log, query) {

    const MODULE = 'bc_cf_data_sl';

    // ── SuiteQL ───────────────────────────────────────────────────────────────

    /**
     * Maps mode string to the timing type list value used in custom records.
     *   'cash'    → 1  (TIMING_TYPE.CASH_FLOW.id)
     *   'accrual' → 2  (TIMING_TYPE.ACCRUAL.id)
     */
    const modeToTimingType = (mode) => (mode === 'accrual' ? 2 : 1);

    /**
     * Forecast-only combined query: revenue timing lines UNION cost timing lines.
     * No VendBill / VendPmt / CustInvc / CustPymt joins — forecast data only.
     */
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** 'YYYY-MM' → 'Apr 2026' */
    const _periodLabel = (yyyymm) => {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [y, m] = yyyymm.split('-');
        return MONTHS[Number(m) - 1] + ' ' + y;
    };

    /**
     * Sort group keys, hoisting a preferred first key to the front.
     * @param {Object} groups
     * @param {string} firstKey
     * @returns {string[]} sorted keys
     */
    const _sortedKeys = (groups, firstKey) => {
        const keys = Object.keys(groups).sort();
        if (firstKey && keys.includes(firstKey)) {
            keys.splice(keys.indexOf(firstKey), 1);
            keys.unshift(firstKey);
        }
        return keys;
    };

    /**
     * Pivot flat rows for one direction ('Revenue' or 'Cost') into:
     *   lines: [{ id, label, source, amounts: [...], total }]
     *   total: [...per-period totals...]
     *   grandTotal: number
     *
     * @param {Object[]} rows - filtered rows for one flow_direction
     * @param {string[]} periods - sorted YYYY-MM strings
     * @param {string} firstKey - group key to hoist to first position
     */
    const _pivotDirection = (rows, periods, firstKey) => {
        const groups = {};
        const sourceMap = {};

        rows.forEach((r) => {
            const g = r.cost_group;
            if (!groups[g]) groups[g] = {};
            groups[g][r.period] = (groups[g][r.period] || 0) + (Number(r.amount) || 0);
            if (!sourceMap[g] && r.source_id) {
                sourceMap[g] = { id: r.source_id, type: r.source_type };
            }
        });

        const keys = _sortedKeys(groups, firstKey);

        const lines = keys.map((k) => {
            const byPeriod = groups[k];
            const amounts = periods.map((p) => byPeriod[p] || 0);
            const total = amounts.reduce((s, v) => s + v, 0);
            const src = sourceMap[k] || null;
            return {
                id: k,
                label: k,
                source: src,
                amounts,
                total
            };
        });

        const total = periods.map((p) => {
            return lines.reduce((s, l) => s + (l.amounts[periods.indexOf(p)] || 0), 0);
        });
        const grandTotal = total.reduce((s, v) => s + v, 0);

        return { lines, total, grandTotal };
    };

    // ── JSON helpers ──────────────────────────────────────────────────────────

    const sendJSON = (response, payload) => {
        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write({ output: JSON.stringify(payload) });
    };

    const sendError = (response, message) => sendJSON(response, { ok: false, error: message });

    // ── Action handlers (delegated to private loaders so tests can mock) ──────

    /**
     * Load combined forecast data and shape it into the standard JSON contract.
     *
     * @param {string} projectId - internal ID of the BC Project
     * @param {string} mode - 'cash' | 'accrual'
     * @returns {{
     *   periods: string[],
     *   categories: {
     *     revenue: { lines: Object[], total: number[], grandTotal: number },
     *     cost:    { lines: Object[], total: number[], grandTotal: number }
     *   },
     *   kpis: { totalRevenue: number, totalCost: number, netCashFlow: number, margin: number }
     * }}
     */
    const _loadCombined = (projectId, mode) => {
        const timingType = modeToTimingType(mode);

        let rows;
        try {
            rows = query.runSuiteQL({
                query: COMBINED_SQL,
                params: [projectId, timingType, projectId, timingType]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // Collect sorted unique periods across both directions
        const periodsSet = new Set();
        rows.forEach((r) => { if (r.period) periodsSet.add(r.period); });
        const periods = Array.from(periodsSet).sort();

        const revRows  = rows.filter((r) => r.flow_direction === 'Revenue');
        const costRows = rows.filter((r) => r.flow_direction === 'Cost');

        const revenue = _pivotDirection(revRows,  periods, 'Base Bid');
        const cost    = _pivotDirection(costRows, periods, 'Other Cost');

        const totalRevenue = revenue.grandTotal;
        const totalCost    = cost.grandTotal;
        const netCashFlow  = totalRevenue - totalCost;
        const margin       = totalRevenue !== 0
            ? (netCashFlow / totalRevenue) * 100
            : 0;

        return {
            periods: periods.map(_periodLabel),
            categories: { revenue, cost },
            kpis: { totalRevenue, totalCost, netCashFlow, margin }
        };
    };
    const _loadCost = (projectId, mode) => {
        // Phase 3 stub: real implementation lands in Task 12.
        return { periods: [], categories: {}, kpis: {} };
    };
    const _loadRevenue = (projectId, mode) => {
        // Phase 3 stub: real implementation lands in Task 13.
        return { periods: [], categories: {}, kpis: {} };
    };

    const onRequest = (context) => {
        try {
            const req = context.request;
            const res = context.response;
            const params = req.parameters || {};

            const action = params.action;
            const projectId = params.projectId;
            const mode = params.mode || 'cash';

            if (!action) return sendError(res, 'Missing action parameter');
            if (!projectId) return sendError(res, 'Missing projectId parameter');

            let data;
            if (action === 'combined')      data = module.exports._loadCombined(projectId, mode);
            else if (action === 'cost')     data = module.exports._loadCost(projectId, mode);
            else if (action === 'revenue')  data = module.exports._loadRevenue(projectId, mode);
            else return sendError(res, `Unknown action: ${action}`);

            sendJSON(res, Object.assign({ ok: true, mode }, data));
        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: e.message + ' ' + (e.stack || '') });
            sendError(context.response, e.message);
        }
    };

    // Export as both AMD module and node-style for the test runner to spy on _load*
    const moduleExports = { onRequest, _loadCombined, _loadCost, _loadRevenue };
    if (typeof module !== 'undefined') module.exports = moduleExports;
    return moduleExports;
});

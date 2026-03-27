/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Revenue Cash Flow Report — thin wrapper that delegates all
 *              rendering to the shared bc_cf_report_utils module.
 *
 * @module      entry_points/bc_cf_rev_report_sl
 * @author      BlueCollar
 */
define([
    'N/log',
    'N/query',
    '../modules/bc_timing_constants',
    '../modules/bc_cf_report_utils'
], (log, query, Constants, utils) => {

    const MODULE = 'bc_cf_rev_report_sl';
    const { TIMING_TYPE, BRAND } = Constants;

    // ─── Data Fetch ─────────────────────────────────────────────────────────────

    /** Revenue timing-line forecast query. */
    const fetchRevenueData = (projectId, timingTypeId) => {
        const sql = `
            SELECT
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
            LEFT JOIN customrecord_bc_change_req cr ON cr.id = rtl.custrecord_bc_rtl_change_order
            WHERE rtl.custrecord_bc_rtl_project = ?
              AND rtl.custrecord_bc_rtl_timing_type = ?
            GROUP BY
                CASE WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order') ELSE 'Base Bid' END,
                TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')
            ORDER BY cost_group, period
        `;
        const results = query.runSuiteQL({ query: sql, params: [projectId, timingTypeId] }).asMappedResults();
        const periodSet = new Set();
        results.forEach((r) => periodSet.add(r.period));
        return { rows: results, periods: Array.from(periodSet).sort() };
    };

    /** Revenue actuals — independent queries so one failure doesn't kill the other. */
    const fetchRevenueActuals = (projectId) => {
        const allRows = [];
        const periodSet = new Set();

        // Query 1: Customer Invoices (Invoiced)
        try {
            const invSql = `
                SELECT
                    'Invoiced' AS cost_group,
                    TO_CHAR(t.trandate, 'YYYY-MM') AS period,
                    SUM(-tl.foreignamount) AS amount
                FROM transaction t
                JOIN transactionline tl ON tl.transaction = t.id
                WHERE t.type = 'CustInvc'
                  AND tl.cseg_bc_project = ?
                  AND tl.mainline = 'F'
                  AND tl.taxline = 'F'
                GROUP BY TO_CHAR(t.trandate, 'YYYY-MM')
            `;
            const rows = query.runSuiteQL({ query: invSql, params: [projectId] }).asMappedResults() || [];
            rows.forEach((r) => { allRows.push(r); periodSet.add(r.period); });
        } catch (e) {
            log.error({ title: MODULE + '.fetchRevenueActuals.invoiced', details: e.message });
        }

        // Query 2: Customer Payments (Collected)
        try {
            const pmtSql = `
                SELECT
                    'Collected' AS cost_group,
                    TO_CHAR(pmt.trandate, 'YYYY-MM') AS period,
                    SUM(-pmt.foreigntotal) AS amount
                FROM transaction pmt
                WHERE pmt.type = 'CustPymt'
                  AND EXISTS (
                    SELECT 1 FROM transactionline pmtl
                    JOIN transactionline invl ON invl.transaction = pmtl.createdfrom
                    WHERE pmtl.transaction = pmt.id
                      AND pmtl.mainline = 'F'
                      AND invl.cseg_bc_project = ?
                      AND invl.mainline = 'F'
                  )
                GROUP BY TO_CHAR(pmt.trandate, 'YYYY-MM')
            `;
            const rows = query.runSuiteQL({ query: pmtSql, params: [projectId] }).asMappedResults() || [];
            rows.forEach((r) => { allRows.push(r); periodSet.add(r.period); });
        } catch (e) {
            log.error({ title: MODULE + '.fetchRevenueActuals.collected', details: e.message });
        }

        return { rows: allRows, periods: Array.from(periodSet).sort() };
    };

    // ─── Entry Point ────────────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;
        try {
            const projectId = request.parameters.projectId;
            const timingTypeId = Number(request.parameters.timingType) || TIMING_TYPE.CASH_FLOW.id;

            if (!projectId) {
                response.write('<html><body style="font-family:sans-serif;padding:40px;color:#666;"><h2>Missing Project</h2><p>No projectId parameter supplied.</p></body></html>');
                return;
            }

            log.debug({ title: MODULE, details: `project=${projectId}, timingType=${timingTypeId}` });

            const data = fetchRevenueData(Number(projectId), timingTypeId);
            const actData = fetchRevenueActuals(Number(projectId));
            const periods = Array.from(new Set([...data.periods, ...actData.periods])).sort();

            // Empty state
            if (!data.rows.length) {
                response.write(utils.buildEmptyState({ title: 'Revenue Cash Flow', projectName: 'Project ' + projectId, timingType: timingTypeId }));
                return;
            }

            // Pivot forecast
            const pv = utils.pivot(data.rows, periods, 'Base Bid');
            const groupOrder = Object.keys(pv.groups).sort((a, b) => {
                if (a === 'Base Bid') return -1;
                if (b === 'Base Bid') return 1;
                return a.localeCompare(b);
            });

            // Pivot actuals
            const hasActuals = actData.rows.length > 0;
            const apv = hasActuals ? utils.pivot(actData.rows, periods) : null;
            const actualGroupOrder = apv ? Object.keys(apv.groups).sort() : [];

            // KPI calculations
            const curMonth = utils.currentYYYYMM();
            let receivedToDate = 0;
            if (apv && apv.groups['Collected']) {
                receivedToDate = Object.values(apv.groups['Collected']).reduce((s, v) => s + Math.abs(v), 0);
            }
            let invoicedToDate = 0;
            if (apv && apv.groups['Invoiced']) {
                invoicedToDate = Object.values(apv.groups['Invoiced']).reduce((s, v) => s + Math.abs(v), 0);
            }
            const expectedThisMonth = pv.totals[curMonth] || 0;

            // Build KPI cards
            const pctBadge = (val) => pv.grandTotal > 0 ? Math.round((val / pv.grandTotal) * 100) + '%' : '';
            const kpiItems = [
                { label: 'Total Revenue Forecast', value: pv.grandTotal, hero: true, accent: BRAND.GOLD },
                { label: 'Received to Date', value: receivedToDate, accent: BRAND.GREEN, badge: pctBadge(receivedToDate), badgeColor: '#D1FAE5' },
                { label: 'Expected This Month', value: expectedThisMonth, badge: pctBadge(expectedThisMonth), badgeColor: BRAND.GREY_LIGHT }
            ];
            const actualsKpi = hasActuals && invoicedToDate > 0
                ? [{ label: 'Actual Invoiced', value: invoicedToDate, accent: BRAND.GOLD }]
                : null;

            // Build chart
            const chartHtml = utils.buildChart({
                mode: 'single',
                series: [{
                    values: pv.totals,
                    color: BRAND.NAVY,
                    gradientFrom: BRAND.NAVY,
                    gradientTo: BRAND.NAVY_LIGHT,
                    label: 'Revenue'
                }],
                periods,
                title: 'Monthly Revenue Inflow'
            });

            // Build table
            const tableHtml = utils.buildTable({
                columnHeader: 'Revenue Source',
                periods,
                groups: pv.groups,
                groupOrder,
                groupTotals: pv.groupTotals,
                totals: pv.totals,
                grandTotal: pv.grandTotal,
                groupSourceMap: pv.groupSourceMap,
                actuals: hasActuals ? {
                    sectionLabel: 'Revenue Actuals',
                    groups: apv.groups,
                    groupOrder: actualGroupOrder,
                    groupTotals: apv.groupTotals
                } : null
            });

            // Build CSV rows
            const csvHeader = ['Revenue Source', ...periods.map(utils.periodLabel), 'Total'];
            const csvData = [csvHeader];
            groupOrder.forEach((g) => {
                csvData.push([g, ...periods.map((p) => pv.groups[g][p] || 0), pv.groupTotals[g]]);
            });
            csvData.push(['Total', ...periods.map((p) => pv.totals[p] || 0), pv.grandTotal]);

            const exportHtml = utils.buildExportBar({ filename: 'revenue_cashflow_report', csvRows: csvData });

            // Assemble page
            const bodyContent = utils.buildKPICards(kpiItems, actualsKpi) + chartHtml + tableHtml + exportHtml;
            const html = utils.buildPageShell({ title: 'Revenue Cash Flow', projectName: 'Project ' + projectId, timingType: timingTypeId, bodyContent });
            response.write(html);

        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write(`<html><body style="font-family:sans-serif;padding:40px;color:#EF4444;"><h2>Error</h2><pre>${utils.esc(e.message)}</pre></body></html>`);
        }
    };

    return { onRequest };
});

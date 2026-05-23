/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Cost Cash Flow Report — thin wrapper that delegates rendering
 *              to the shared bc_cf_report_utils module.
 *
 * @module      entry_points/bc_cf_cost_report_sl
 * @author      BlueCollar
 */
define([
    'N/log',
    'N/query',
    '../modules/bc_timing_constants',
    '../modules/bc_cf_report_utils'
], (log, query, Constants, utils) => {

    const MODULE = 'bc_cf_cost_report_sl';
    const { TIMING_TYPE, BRAND } = Constants;

    // ─── Data Fetch (local — exact SuiteQL stays here) ────────────────────────

    const fetchCostData = (projectId, timingTypeId) => {
        const sql = `
            SELECT
                CASE
                    WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                        THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                    WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                        THEN NVL(t.tranid, '') || ' \u2014 ' || NVL(NVL(e.entitytitle, e.entityid), 'Vendor')
                    ELSE 'Other'
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
            LEFT JOIN transaction t ON t.id = ctl.custrecord_bc_ctl_transaction
            LEFT JOIN entity e ON e.id = t.entity
            LEFT JOIN customrecord_bc_change_req cr ON cr.id = ctl.custrecord_bc_ctl_change_order
            WHERE ctl.custrecord_bc_ctl_project = ?
              AND ctl.custrecord_bc_ctl_timing_type = ?
            GROUP BY
                CASE WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order') WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL THEN NVL(t.tranid, '') || ' \u2014 ' || NVL(NVL(e.entitytitle, e.entityid), 'Vendor') ELSE 'Other' END,
                TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')
            ORDER BY cost_group, period
        `;
        const results = query.runSuiteQL({ query: sql, params: [projectId, timingTypeId] }).asMappedResults();
        const periodSet = new Set();
        results.forEach((r) => periodSet.add(r.period));
        return { rows: results, periods: Array.from(periodSet).sort() };
    };

    // ─── Entry Point ──────────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;
        try {
            const projectId = request.parameters.projectId;
            const timingTypeParam = request.parameters.timingType;
            const timingTypeId = timingTypeParam ? Number(timingTypeParam) : TIMING_TYPE.CASH_FLOW.id;

            if (!projectId) {
                response.write('<html><body style="font-family:sans-serif;padding:40px;color:#666;"><h2>Missing Project</h2><p>No projectId parameter supplied.</p></body></html>');
                return;
            }

            log.debug({ title: MODULE, details: `Rendering cost report: project=${projectId}, timingType=${timingTypeId}` });

            // 1. Fetch forecast
            const data = fetchCostData(Number(projectId), timingTypeId);
            const periods = data.periods;

            // 2. Empty state
            if (!data.rows.length) {
                response.write(utils.buildEmptyState({ title: 'Cost Cash Flow', projectName: 'Project ' + projectId, timingType: timingTypeId }));
                return;
            }

            // 3. Pivot
            const forecast = utils.pivot(data.rows, periods, 'Other');

            // 4. KPI calculations
            const curMonth = utils.currentYYYYMM();
            const dueThisMonth = forecast.totals[curMonth] || 0;
            const duePct = forecast.grandTotal ? Math.round((dueThisMonth / forecast.grandTotal) * 100) + '%' : '0%';

            // 5. Build KPI cards
            const kpiItems = [
                { label: 'Total Cost Forecast', value: forecast.grandTotal, hero: true, accent: BRAND.GOLD },
                { label: 'Due This Month', value: dueThisMonth, badge: duePct, badgeColor: BRAND.GREY_LIGHT, accent: BRAND.NAVY }
            ];
            const kpiHtml = utils.buildKPICards(kpiItems);

            // 6. Build chart
            const chartHtml = utils.buildChart({
                mode: 'single',
                series: [{ values: forecast.totals, color: BRAND.NAVY, gradientFrom: BRAND.NAVY, gradientTo: BRAND.NAVY_LIGHT, label: 'Cost' }],
                periods: periods,
                title: 'Monthly Cost Outflow'
            });

            // 7. Build table
            const forecastGroups = Object.keys(forecast.groups).sort();
            const tableHtml = utils.buildTable({
                columnHeader: 'Cost Group',
                periods: periods,
                groups: forecast.groups,
                groupOrder: forecastGroups,
                groupTotals: forecast.groupTotals,
                totals: forecast.totals,
                grandTotal: forecast.grandTotal,
                groupSourceMap: forecast.groupSourceMap
            });

            // 8. Build CSV + export bar
            const csvHeader = ['Cost Group', ...periods.map(utils.periodLabel), 'Total'];
            const csvData = [csvHeader];
            forecastGroups.forEach((g) => {
                csvData.push([g, ...periods.map((p) => forecast.groups[g][p] || 0), forecast.groupTotals[g]]);
            });
            csvData.push(['Total', ...periods.map((p) => forecast.totals[p] || 0), forecast.grandTotal]);
            const exportHtml = utils.buildExportBar({ filename: 'cost_cashflow_report', csvRows: csvData });

            // 9. Compose page
            const bodyContent = kpiHtml + chartHtml + tableHtml + exportHtml;
            const html = utils.buildPageShell({
                title: 'Cost Cash Flow',
                projectName: 'Project ' + projectId,
                timingType: timingTypeId,
                bodyContent
            });

            response.write(html);
        } catch (e) {
            log.error({ title: `${MODULE}.onRequest`, details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write(`<html><body style="font-family:sans-serif;padding:40px;color:#EF4444;"><h2>Error</h2><pre>${utils.esc(e.message)}</pre></body></html>`);
        }
    };

    return { onRequest };
});

/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Combined Cash Flow Report — Revenue In vs Cost Out = Net Cash Position.
 *              Renders a standalone HTML page (iframe on BC Project record) with
 *              KPI cards, grouped bar chart, combined detail grid, and CSV export.
 *
 * URL Params:
 *   projectId  – internal ID of the BC Project
 *   timingType – 1 = Cash Flow (default), 2 = Accrual
 *
 * @module  entry_points/bc_cf_combined_sl
 * @author  BlueCollar
 */
define([
    'N/log',
    'N/query',
    '../modules/bc_timing_constants',
    '../modules/bc_cf_report_utils'
], (log, query, Constants, utils) => {

    const MODULE = 'bc_cf_combined_sl';
    const { BRAND, TIMING_TYPE } = Constants;

    // ─── SuiteQL ──────────────────────────────────────────────────────────────

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

    const PROJECT_NAME_SQL = `SELECT name FROM customrecord_cseg_bc_project WHERE id = ?`;

    // ─── Data Fetching ────────────────────────────────────────────────────────

    const fetchProjectName = (projectId) => {
        try {
            const rs = query.runSuiteQL({ query: PROJECT_NAME_SQL, params: [projectId] }).asMappedResults();
            return rs.length ? rs[0].name : 'Project #' + projectId;
        } catch (e) {
            log.error({ title: MODULE + '.fetchProjectName', details: e.message });
            return 'Project #' + projectId;
        }
    };

    const fetchCombinedData = (projectId, timingType) => {
        return query.runSuiteQL({
            query: COMBINED_SQL,
            params: [projectId, timingType, projectId, timingType]
        }).asMappedResults();
    };

    // ─── Transform ────────────────────────────────────────────────────────────

    /**
     * Transform flat rows into dual-view model: revenue + cost groups with
     * per-period amounts, totals, and net.
     */
    const transformData = (rows) => {
        const periodsSet = new Set();
        const revenueGroups = {};
        const costGroups = {};
        const groupSourceMap = {};

        rows.forEach((r) => {
            const dir = r.flow_direction;
            const grp = r.cost_group;
            const per = r.period;
            const amt = Number(r.amount) || 0;
            periodsSet.add(per);

            const bucket = dir === 'Revenue' ? revenueGroups : costGroups;
            if (!bucket[grp]) bucket[grp] = {};
            bucket[grp][per] = (bucket[grp][per] || 0) + amt;

            if (!groupSourceMap[grp] && r.source_id) {
                groupSourceMap[grp] = { source_id: r.source_id, source_type: r.source_type };
            }
        });

        const periods = Array.from(periodsSet).sort();

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
        const sortedCost = sortGroups(costGroups, 'Other Cost');

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
            periods, revenueGroups: sortedRev, costGroups: sortedCost,
            revTotals, costTotals, netTotals,
            grandRevenue, grandCost, grandNet: grandRevenue - grandCost,
            groupSourceMap
        };
    };

    // ─── Combined Table (unique to this report) ───────────────────────────────

    const buildCombinedTable = (data) => {
        const { periods, revenueGroups, costGroups, revTotals, costTotals,
                netTotals, grandRevenue, grandCost, grandNet, groupSourceMap } = data;

        const curMonth = utils.currentYYYYMM();
        const colSpan = periods.length + 2;

        const groupTotal = (grpMap) => {
            let t = 0;
            periods.forEach((p) => { t += (grpMap[p] || 0); });
            return t;
        };

        // Header
        let headerCells = '<th>Category</th>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month"' : '';
            headerCells += `<th${cls}>${utils.periodLabel(p)}</th>`;
        });
        headerCells += '<th class="col-total">Total</th>';

        // Revenue section
        let revHeader = `<tr class="sec-hdr"><td colspan="${colSpan}">REVENUE</td></tr>`;
        let revRows = '';
        Object.keys(revenueGroups).forEach((name) => {
            const grp = revenueGroups[name];
            revRows += '<tr class="detail"><td>' + utils.drillLink(name, groupSourceMap) + '</td>';
            periods.forEach((p) => {
                const cls = p === curMonth ? ' class="cur-month"' : '';
                revRows += `<td${cls}>${utils.fmtDollar(grp[p] || 0)}</td>`;
            });
            revRows += `<td class="col-total">${utils.fmtDollar(groupTotal(grp))}</td></tr>`;
        });

        // Revenue total
        let revTotalRow = '<tr class="rev-total"><td>Revenue Total</td>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month"' : '';
            revTotalRow += `<td${cls}>${utils.fmtDollar(revTotals[p] || 0)}</td>`;
        });
        revTotalRow += `<td class="col-total">${utils.fmtDollar(grandRevenue)}</td></tr>`;

        const sep = `<tr class="sep"><td colspan="${colSpan}"></td></tr>`;

        // Cost section
        let costHeader = `<tr class="sec-hdr"><td colspan="${colSpan}">COST</td></tr>`;
        let costRows = '';
        Object.keys(costGroups).forEach((name) => {
            const grp = costGroups[name];
            costRows += '<tr class="detail"><td>' + utils.drillLink(name, groupSourceMap) + '</td>';
            periods.forEach((p) => {
                const cls = p === curMonth ? ' class="cur-month"' : '';
                costRows += `<td${cls}>${utils.fmtDollar(grp[p] || 0)}</td>`;
            });
            costRows += `<td class="col-total">${utils.fmtDollar(groupTotal(grp))}</td></tr>`;
        });

        // Cost total
        let costTotalRow = '<tr class="cost-total"><td>Cost Total</td>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month"' : '';
            costTotalRow += `<td${cls}>${utils.fmtDollar(costTotals[p] || 0)}</td>`;
        });
        costTotalRow += `<td class="col-total">${utils.fmtDollar(grandCost)}</td></tr>`;

        // Net Forecast row
        let netRow = '<tr class="net-row"><td>NET FORECAST</td>';
        periods.forEach((p) => {
            const v = netTotals[p] || 0;
            netRow += `<td class="${v >= 0 ? 'positive' : 'negative'}">${utils.fmtDollar(v)}</td>`;
        });
        netRow += `<td class="${grandNet >= 0 ? 'positive' : 'negative'}">${utils.fmtDollar(grandNet)}</td></tr>`;

        return `<div class="tbl-wrap"><table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>
                ${revHeader}${revRows}${revTotalRow}
                ${sep}
                ${costHeader}${costRows}${costTotalRow}
                ${sep}
                ${netRow}
            </tbody>
        </table></div>`;
    };

    // ─── CSV Export Data ──────────────────────────────────────────────────────

    const buildCSVRows = (data) => {
        const { periods, revenueGroups, costGroups, revTotals, costTotals, netTotals,
                grandRevenue, grandCost, grandNet } = data;

        const groupTotal = (grpMap) => {
            let t = 0;
            periods.forEach((p) => { t += (grpMap[p] || 0); });
            return t;
        };

        const csvRows = [];
        csvRows.push(['Category', ...periods.map(utils.periodLabel), 'Total']);
        csvRows.push(['REVENUE']);
        Object.keys(revenueGroups).forEach((name) => {
            const g = revenueGroups[name];
            csvRows.push([name, ...periods.map((p) => g[p] || 0), groupTotal(g)]);
        });
        csvRows.push(['Revenue Total', ...periods.map((p) => revTotals[p] || 0), grandRevenue]);
        csvRows.push([]);
        csvRows.push(['COST']);
        Object.keys(costGroups).forEach((name) => {
            const g = costGroups[name];
            csvRows.push([name, ...periods.map((p) => g[p] || 0), groupTotal(g)]);
        });
        csvRows.push(['Cost Total', ...periods.map((p) => costTotals[p] || 0), grandCost]);
        csvRows.push([]);
        csvRows.push(['NET CASH FLOW', ...periods.map((p) => netTotals[p] || 0), grandNet]);

        return csvRows;
    };

    // ─── Entry Point ──────────────────────────────────────────────────────────

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

            const projectName = fetchProjectName(projectId);

            // Fetch combined forecast data
            let rows;
            try {
                rows = fetchCombinedData(projectId, timingType);
            } catch (e) {
                log.error({ title: MODULE + '.fetchCombinedData', details: e.message + '\n' + e.stack });
                rows = [];
            }

            // Empty state
            if (!rows || !rows.length) {
                response.write(utils.buildEmptyState({
                    title: 'Combined Cash Flow',
                    projectName,
                    timingType
                }));
                return;
            }

            // Transform
            const data = transformData(rows);
            const { grandRevenue, grandCost, grandNet, periods, revTotals, costTotals, netTotals } = data;

            // ── KPI Cards ──
            const heroItems = [
                {
                    label: 'Net Cash Position', hero: true,
                    value: grandNet,
                    accent: grandNet >= 0 ? BRAND.GREEN : BRAND.RED,
                    statusDot: grandNet >= 0 ? BRAND.GREEN : BRAND.RED,
                    statusText: grandNet >= 0 ? 'Cash Positive' : 'Cash Negative'
                },
                { label: 'Revenue In', value: grandRevenue, accent: BRAND.NAVY },
                { label: 'Cost Out', value: grandCost, accent: BRAND.NAVY }
            ];

            // ── Chart ──
            const chartHtml = utils.buildChart({
                mode: 'grouped',
                series: [
                    { values: revTotals, color: BRAND.GOLD, gradientFrom: BRAND.GOLD, gradientTo: BRAND.GOLD_LIGHT, label: 'Revenue' },
                    { values: costTotals, color: BRAND.NAVY, gradientFrom: BRAND.NAVY, gradientTo: BRAND.NAVY_LIGHT, label: 'Cost' }
                ],
                netLine: { values: netTotals, color: BRAND.GREEN },
                periods,
                title: 'Revenue vs Cost by Month'
            });

            // ── CSV ──
            const safeName = (projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
            const csvRows = buildCSVRows(data);

            // ── Assemble ──
            const bodyContent = [
                utils.buildKPICards(heroItems),
                chartHtml,
                buildCombinedTable(data),
                utils.buildExportBar({ filename: safeName + '_cashflow', csvRows })
            ].join('\n');

            response.write(utils.buildPageShell({
                title: 'Combined Cash Flow',
                projectName,
                timingType,
                bodyContent
            }));

        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write('<html><body style="font-family:sans-serif;padding:40px;color:#EF4444;">'
                + '<h3>Cash Flow Report Error</h3>'
                + '<p>' + utils.esc(e.message) + '</p></body></html>');
        }
    };

    return { onRequest };
});

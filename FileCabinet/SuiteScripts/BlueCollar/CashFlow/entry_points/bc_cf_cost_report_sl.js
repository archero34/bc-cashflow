/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Cost Cash Flow Report — standalone HTML Suitelet rendered in an
 *              iframe tab on the project record. Shows time-phased cost forecast
 *              grouped by vendor / change order, with Cash Flow / Accrual toggle,
 *              KPI bar, and CSV export.
 *
 * @module      entry_points/bc_cf_cost_report_sl
 * @author      BlueCollar
 */
define([
    'N/log',
    'N/query',
    '../modules/bc_timing_constants'
], (log, query, Constants) => {

    const MODULE = 'bc_cf_cost_report_sl';
    const { TIMING_TYPE, BRAND } = Constants;

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Format number as USD with commas, no cents.
     * @param {number} n
     * @returns {string}
     */
    const fmt = (n) => {
        if (n == null || isNaN(n)) return '\u2014';
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(Math.round(n));
        return sign + '$' + abs.toLocaleString('en-US');
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

    // ─── Data Fetch ─────────────────────────────────────────────────────────────

    /**
     * Run the cost timing summary query for a project + timing type.
     * Returns { rows: [{cost_group, period, amount}], periods: sorted string[] }
     */
    const fetchCostData = (projectId, timingTypeId) => {
        const sql = `
            SELECT
                CASE
                    WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                        THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                    WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                        THEN NVL(NVL(e.entitytitle, e.entityid), 'Vendor')
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
                CASE WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order') WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL THEN NVL(NVL(e.entitytitle, e.entityid), 'Vendor') ELSE 'Other' END,
                TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')
            ORDER BY cost_group, period
        `;

        const results = query.runSuiteQL({
            query: sql,
            params: [projectId, timingTypeId]
        }).asMappedResults();

        // Collect unique sorted periods
        const periodSet = new Set();
        results.forEach((r) => periodSet.add(r.period));
        const periods = Array.from(periodSet).sort();

        return { rows: results, periods };
    };

    // ─── Pivot & Aggregate ──────────────────────────────────────────────────────

    /**
     * Pivot rows into { groupName: { period: amount, ... }, ... }
     * Also compute totals per period and grand total.
     */
    const pivot = (rows, periods) => {
        const groups = {};      // groupName → { period → amount }
        const totals = {};      // period → total
        const groupSourceMap = {};  // groupName → { source_id, source_type }
        let grandTotal = 0;

        periods.forEach((p) => { totals[p] = 0; });

        rows.forEach((r) => {
            const g = r.cost_group || 'Other';
            if (!groups[g]) groups[g] = {};
            groups[g][r.period] = (groups[g][r.period] || 0) + Number(r.amount);
            totals[r.period] = (totals[r.period] || 0) + Number(r.amount);
            grandTotal += Number(r.amount);

            // Capture source link info (first occurrence wins)
            if (!groupSourceMap[g] && r.source_id) {
                groupSourceMap[g] = { source_id: r.source_id, source_type: r.source_type };
            }
        });

        // Group row totals
        const groupTotals = {};
        Object.keys(groups).forEach((g) => {
            groupTotals[g] = Object.values(groups[g]).reduce((s, v) => s + v, 0);
        });

        return { groups, totals, grandTotal, groupTotals, groupSourceMap };
    };

    // ─── Chart Builder ────────────────────────────────────────────────────────

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
     * Short month abbreviation — 'Apr', 'May', etc.
     */
    const monthAbbrev = (yyyymm) => {
        const m = Number(yyyymm.split('-')[1]);
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
    };

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

    /**
     * Build a clean single-bar chart SVG for cost data.
     * Single navy bars extend downward (costs are outflows).
     * Hover tooltips show group breakdown.
     */
    const buildCostChart = (groups, periods, totals) => {
        if (!periods.length) return '';

        const groupNames = Object.keys(groups).sort();
        const maxTotal = Math.max(...periods.map((p) => totals[p] || 0), 1);

        const n = periods.length;
        const vbW = 1000;
        const pad = 40;
        const usable = vbW - pad * 2;
        const slotW = usable / n;
        const barW = Math.min(slotW * 0.45, 48);
        const barAreaH = 120;
        const topM = 20;
        const botM = 28;
        const vbH = topM + barAreaH + botM;
        const topBaseline = topM;

        let svg = '';
        const tooltipArray = [];

        // $0 baseline — thin dashed line
        svg += '<line x1="' + pad + '" y1="' + topBaseline + '" x2="' + (vbW - pad) + '" y2="' + topBaseline + '" stroke="#9CA3AF" stroke-width="0.75" stroke-dasharray="6,4"/>';

        periods.forEach((p, i) => {
            const cx = pad + slotW * i + slotW / 2;
            const x = cx - barW / 2;
            const total = totals[p] || 0;

            // Single solid navy bar downward
            const h = total > 0 ? Math.max(Math.round((total / maxTotal) * barAreaH), 2) : 0;
            if (h > 0) {
                svg += '<rect x="' + x + '" y="' + topBaseline + '" width="' + barW + '" height="' + h + '" rx="2" fill="#04233D"/>';
            }

            // Total label below bar
            if (total > 0) {
                svg += '<text x="' + cx + '" y="' + (topBaseline + h + 14) + '" text-anchor="middle" fill="#04233D" font-size="9" font-weight="600" font-family="Inter,sans-serif">' + fmtCompact(total) + '</text>';
            }

            // Month label
            svg += '<text x="' + cx + '" y="' + (vbH - 6) + '" text-anchor="middle" fill="#6B7280" font-size="10" font-weight="500" font-family="Inter,sans-serif">' + monthAbbrev(p) + '</text>';

            // Tooltip HTML — collected into array, referenced by index
            let tip = '<div style="font-weight:700;margin-bottom:4px;">' + monthFull(p) + '</div>';
            tip += '<div style="border-top:1px solid #4B6A88;margin:4px 0;"></div>';
            groupNames.forEach((g) => {
                const amt = groups[g][p] || 0;
                if (amt > 0) {
                    tip += '<div style="display:flex;justify-content:space-between;gap:16px;"><span>' + esc(g) + '</span><span>' + fmtCompact(amt) + '</span></div>';
                }
            });
            tip += '<div style="border-top:1px solid #4B6A88;margin:4px 0;"></div>';
            tip += '<div style="font-weight:700;display:flex;justify-content:space-between;gap:16px;"><span>Total</span><span>' + fmtCompact(total) + '</span></div>';
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

        return '<div style="border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px 8px;margin:8px 0;">'
            + '<div style="font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Cost by Month</div>'
            + '<svg width="100%" viewBox="0 0 ' + vbW + ' ' + vbH + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'
            + svg
            + '</svg>'
            + '<div id="bcChartTooltip" style="display:none;position:fixed;background:#04233D;color:#fff;padding:12px 16px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif;pointer-events:none;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);line-height:1.6;min-width:180px;"></div>'
            + tooltipScript
            + '</div>';
    };

    // ─── Current Month Helper ───────────────────────────────────────────────────

    const currentYYYYMM = () => {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${d.getFullYear()}-${mm}`;
    };

    // ─── HTML Render ────────────────────────────────────────────────────────────

    const renderPage = (projectId, timingTypeId, data, periods) => {
        const { groups, totals, grandTotal, groupTotals, groupSourceMap } = pivot(data.rows, periods);
        const groupNames = Object.keys(groups).sort();
        const curMonth = currentYYYYMM();
        const isCashFlow = timingTypeId === TIMING_TYPE.CASH_FLOW.id;
        const toggleLabel = isCashFlow ? 'Accrual' : 'Cash Flow';
        const toggleType = isCashFlow ? TIMING_TYPE.ACCRUAL.id : TIMING_TYPE.CASH_FLOW.id;
        const viewLabel = isCashFlow ? 'Cash Flow' : 'Accrual';

        // KPI calculations
        const totalForecast = grandTotal;
        const paidToDate = 0;  // Placeholder for POC
        const dueThisMonth = totals[curMonth] || 0;
        const overdue = 0;     // Placeholder for POC

        // ── Build table header
        let thCells = '<th class="row-label">Cost Group</th>';
        periods.forEach((p) => {
            const highlighted = p === curMonth ? ' class="cur-month"' : '';
            thCells += `<th${highlighted}>${esc(p)}</th>`;
        });
        thCells += '<th class="row-total">Total</th>';

        // ── Helper: build drillable link for a group name
        const drillLink = (name) => {
            const src = groupSourceMap[name];
            if (!src || !src.source_id) return esc(name);
            const linkUrl = src.source_type === 'cr'
                ? '/app/common/custom/custrecordentry.nl?rectype=495&id=' + src.source_id
                : '/app/accounting/transactions/transaction.nl?id=' + src.source_id;
            return `<a href="${linkUrl}" target="_top" style="color:${BRAND.NAVY};text-decoration:none;border-bottom:1px dashed #D1D5DB;">${esc(name)}</a>`;
        };

        // ── Build data rows
        let bodyRows = '';
        groupNames.forEach((g) => {
            bodyRows += '<tr>';
            bodyRows += `<td class="row-label">${drillLink(g)}</td>`;
            periods.forEach((p) => {
                const val = groups[g][p];
                const cls = p === curMonth ? ' class="cur-month num"' : ' class="num"';
                bodyRows += `<td${cls}>${val ? fmt(val) : '\u2014'}</td>`;
            });
            bodyRows += `<td class="row-total num">${fmt(groupTotals[g])}</td>`;
            bodyRows += '</tr>';
        });

        // ── Total row
        let totalRow = '<tr class="total-row"><td class="row-label">Total</td>';
        periods.forEach((p) => {
            const cls = p === curMonth ? ' class="cur-month num"' : ' class="num"';
            totalRow += `<td${cls}>${fmt(totals[p])}</td>`;
        });
        totalRow += `<td class="row-total num">${fmt(grandTotal)}</td></tr>`;

        // ── CSV data (for export)
        let csvHeader = 'Cost Group,' + periods.join(',') + ',Total';
        let csvRows = '';
        groupNames.forEach((g) => {
            const vals = periods.map((p) => groups[g][p] || 0);
            csvRows += `\n"${g}",${vals.join(',')},${groupTotals[g]}`;
        });
        const totalVals = periods.map((p) => totals[p] || 0);
        csvRows += `\nTotal,${totalVals.join(',')},${grandTotal}`;
        const csvContent = csvHeader + csvRows;

        const isEmpty = groupNames.length === 0;

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cost Cash Flow Report</title>
<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: ${BRAND.FONT_FAMILY};
        background: ${BRAND.WHITE};
        color: ${BRAND.NAVY};
        font-size: 13px;
        padding: 16px 20px;
    }

    /* ── Header bar ───────────────────────────────────── */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 10px;
    }
    .header h1 {
        font-size: 18px;
        font-weight: 700;
        color: ${BRAND.NAVY};
    }
    .header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .badge {
        display: inline-block;
        background: ${BRAND.NAVY};
        color: ${BRAND.GOLD};
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* ── Buttons ──────────────────────────────────────── */
    .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: ${BRAND.BORDER_RADIUS};
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: background 0.15s, box-shadow 0.15s;
    }
    .btn-toggle {
        background: ${BRAND.NAVY};
        color: ${BRAND.GOLD};
    }
    .btn-toggle:hover { background: ${BRAND.NAVY_LIGHT}; }
    .btn-export {
        background: ${BRAND.GREY_LIGHT};
        color: ${BRAND.NAVY};
        border: 1px solid ${BRAND.GREY_MID};
    }
    .btn-export:hover { background: ${BRAND.GREY_MID}; }

    /* ── KPI bar ──────────────────────────────────────── */
    .kpi-bar {
        display: flex;
        gap: 12px;
        margin-bottom: 10px;
        flex-wrap: wrap;
    }
    .kpi-card {
        flex: 1 1 180px;
        background: ${BRAND.GREY_LIGHT};
        border: 1px solid ${BRAND.GREY_MID};
        border-radius: ${BRAND.BORDER_RADIUS};
        padding: 12px 16px;
        min-width: 160px;
    }
    .kpi-card .kpi-label {
        font-size: 11px;
        font-weight: 600;
        color: ${BRAND.GREY_DARK};
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 4px;
    }
    .kpi-card .kpi-value {
        font-size: 20px;
        font-weight: 700;
        color: ${BRAND.NAVY};
    }
    .kpi-card.gold { border-left: 4px solid ${BRAND.GOLD}; }
    .kpi-card.green { border-left: 4px solid ${BRAND.GREEN}; }
    .kpi-card.navy { border-left: 4px solid ${BRAND.NAVY}; }
    .kpi-card.red { border-left: 4px solid ${BRAND.RED}; }

    /* ── Table ────────────────────────────────────────── */
    .table-wrap {
        overflow-x: auto;
        border: 1px solid ${BRAND.GREY_MID};
        border-radius: ${BRAND.BORDER_RADIUS};
        box-shadow: ${BRAND.BOX_SHADOW};
    }
    table {
        width: 100%;
        border-collapse: collapse;
        min-width: 600px;
    }
    thead th {
        position: sticky;
        top: 0;
        background: ${BRAND.NAVY};
        color: ${BRAND.WHITE};
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        padding: 10px 12px;
        text-align: right;
        white-space: nowrap;
    }
    thead th.row-label { text-align: left; min-width: 200px; }
    thead th.row-total { background: ${BRAND.NAVY_LIGHT}; }
    thead th.cur-month { background: ${BRAND.GOLD}; color: ${BRAND.NAVY}; }
    tbody td {
        padding: 8px 12px;
        border-bottom: 1px solid ${BRAND.GREY_LIGHT};
        font-size: 12px;
    }
    tbody td.row-label {
        font-weight: 600;
        text-align: left;
        white-space: nowrap;
        color: ${BRAND.NAVY};
    }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.row-total { font-weight: 700; text-align: right; background: ${BRAND.GREY_LIGHT}; }
    tbody td.cur-month { background: #FFF8E1; }
    tbody tr:hover { background: ${BRAND.GREY_LIGHT}; }
    .total-row td {
        font-weight: 700;
        border-top: 2px solid ${BRAND.NAVY};
        background: ${BRAND.GREY_LIGHT};
        font-size: 13px;
    }

    /* ── Empty state ──────────────────────────────────── */
    .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: ${BRAND.GREY_DARK};
    }
    .empty-state h2 {
        font-size: 16px;
        margin-bottom: 8px;
        color: ${BRAND.NAVY};
    }
    .empty-state p { font-size: 13px; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
    <div style="display:flex;align-items:center;gap:12px;">
        <h1>Cost Cash Flow Report</h1>
        <span class="badge">${esc(viewLabel)}</span>
    </div>
    <div class="header-actions">
        <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-size:13px;color:#6B7280;font-weight:500;">View:</span>
            <button type="button" disabled
                style="padding:8px 16px;font-size:13px;font-weight:600;background:#04233D;color:#FFFFFF;
                border:none;border-radius:6px;cursor:default;">
                ${esc(viewLabel)}
            </button>
            <button type="button" onclick="toggleView()"
                style="padding:8px 16px;font-size:13px;font-weight:600;background:#FFB703;color:#04233D;
                border:none;border-radius:6px;cursor:pointer;">
                Switch to ${esc(toggleLabel)}
            </button>
        </div>
        ${isEmpty ? '' : '<button class="btn btn-export" onclick="exportCsv()">Export CSV</button>'}
    </div>
</div>

<!-- KPI Bar -->
<div class="kpi-bar">
    <div class="kpi-card gold">
        <div class="kpi-label">Total Forecast</div>
        <div class="kpi-value">${fmt(totalForecast)}</div>
    </div>
    <div class="kpi-card green">
        <div class="kpi-label">Paid to Date</div>
        <div class="kpi-value">${fmt(paidToDate)}</div>
    </div>
    <div class="kpi-card navy">
        <div class="kpi-label">Due This Month</div>
        <div class="kpi-value">${fmt(dueThisMonth)}</div>
    </div>
    <div class="kpi-card red">
        <div class="kpi-label">Overdue</div>
        <div class="kpi-value">${fmt(overdue)}</div>
    </div>
</div>

${!isEmpty ? buildCostChart(groups, periods, totals) : ''}

${isEmpty ? `
<div class="empty-state">
    <h2>No Cost Timing Data</h2>
    <p>There are no ${viewLabel.toLowerCase()} cost timing lines for this project yet.<br>
    Create timing schedules on your purchase orders or change orders to see data here.</p>
</div>
` : `
<!-- Data Grid -->
<div class="table-wrap">
<table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>
        ${bodyRows}
        ${totalRow}
    </tbody>
</table>
</div>
`}

<script>
function toggleView() {
    var url = window.location.href.replace(/&timingType=\\d+/, '');
    url += '&timingType=${toggleType}';
    window.location.href = url;
}

function exportCsv() {
    var csv = ${JSON.stringify(csvContent)};
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'cost_cashflow_report.csv';
    link.click();
}
</script>
</body>
</html>`;
    };

    // ─── Entry Point ────────────────────────────────────────────────────────────

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

            const data = fetchCostData(Number(projectId), timingTypeId);
            const html = renderPage(Number(projectId), timingTypeId, data, data.periods);

            response.write(html);

        } catch (e) {
            log.error({ title: `${MODULE}.onRequest`, details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write(`<html><body style="font-family:sans-serif;padding:40px;color:#EF4444;"><h2>Error</h2><pre>${esc(e.message)}</pre></body></html>`);
        }
    };

    return { onRequest };
});

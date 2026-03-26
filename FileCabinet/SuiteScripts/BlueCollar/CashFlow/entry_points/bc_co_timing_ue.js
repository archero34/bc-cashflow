/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Populates the pre-existing INLINEHTML field on Change Requests
 *              with a DUAL-PANE layout: Revenue timing (billing impact) on top,
 *              Cost timing (budget items grouped by cost code) below.
 *              Data flows through the Suitelet AJAX endpoint for all CRUD.
 *
 * Deployed on: customrecord_bc_change_req (VIEW / EDIT)
 */
define([
    'N/log',
    'N/runtime',
    'N/url',
    'N/query',
    '../modules/bc_timing_constants',
    '../modules/bc_timing_dao',
    '../modules/bc_timing_ui'
], (log, runtime, url, query, Constants, DAO, UI) => {

    const MODULE = 'bc_co_timing_ue';

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Load CO timing lines via the CHANGE_ORDER field rather than TRANSACTION.
     * The standard DAO.loadTimingLines filters by transaction ID, but CO lines
     * are written with the parent SO/PO as the transaction and the CO ID in
     * the change_order field. We query directly here.
     *
     * @param {Object}  opts
     * @param {string}  opts.recordType  - 'cost' or 'revenue'
     * @param {number}  opts.changeOrderId
     * @param {number}  opts.timingType  - Constants.TIMING_TYPE value
     * @returns {Array<Object>}
     */
    const loadCOTimingLines = (opts) => {
        const funcName = `${MODULE}.loadCOTimingLines`;
        try {
            const { recordType, changeOrderId, timingType } = opts;

            let recType, fields;
            if (recordType === 'cost') {
                recType = Constants.RECORDS.COST_TIMING_LINE;
                fields  = Constants.CTL_FIELDS;
            } else {
                recType = Constants.RECORDS.REVENUE_TIMING_LINE;
                fields  = Constants.RTL_FIELDS;
            }

            const selectCols = [
                'id',
                fields.PERIOD_DATE,
                fields.PERCENTAGE,
                fields.AMOUNT,
                fields.CUMULATIVE_PCT,
                fields.CUMULATIVE_AMT,
                fields.LABEL,
                fields.SOURCE,
                fields.SOURCE_GROUP,
                fields.TIMING_TYPE,
                fields.CHANGE_ORDER
            ];

            if (recordType === 'cost') {
                selectCols.push(fields.COST_CODE, fields.COST_TYPE);
            }

            const sql = `
                SELECT ${selectCols.join(', ')}
                FROM ${recType}
                WHERE ${fields.CHANGE_ORDER} = ?
                  AND ${fields.TIMING_TYPE} = ?
                ORDER BY ${fields.PERIOD_DATE}
            `;

            // Use the N/query module from the define() dependency array
            const resultSet = query.runSuiteQL({ query: sql, params: [changeOrderId, timingType] });
            return resultSet.asMappedResults() || [];

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            return [];
        }
    };

    /**
     * Format a number as US currency string for the pane headers.
     * @param {number} value
     * @returns {string}
     */
    const fmtCurrency = (value) => {
        const n = Number(value) || 0;
        return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    // ─── beforeLoad ──────────────────────────────────────────────────────────

    const beforeLoad = (context) => {
        const funcName = `${MODULE}.beforeLoad`;

        try {
            // Only run on VIEW and EDIT — skip CREATE
            if (context.type === context.UserEventType.CREATE) {
                return;
            }
            if (
                context.type !== context.UserEventType.VIEW &&
                context.type !== context.UserEventType.EDIT
            ) {
                return;
            }

            const crId = context.newRecord.id;
            if (!crId) {
                log.debug({ title: funcName, details: 'No Change Request ID found — exiting.' });
                return;
            }

            // ── Get Change Request info (header, billing total, budget items) ──
            const crInfo = DAO.getChangeRequestInfo(Number(crId));
            if (!crInfo) {
                log.debug({ title: funcName, details: `No CR info found for id=${crId} — exiting.` });
                return;
            }

            const crName       = crInfo.name || `CO-${crId}`;
            const billingTotal = crInfo.billingTotal || 0;
            const budgetItems  = crInfo.budgetItems || [];
            const costTotal    = budgetItems.reduce((sum, item) => sum + item.amount, 0);

            // ── Get project from the Change Request record ─────────────────
            // BlueCollar Change Requests use the custom segment cseg_bc_project
            let projectId   = context.newRecord.getValue('custrecord_bc_blue_collar_proj');
            let projectName = context.newRecord.getText('custrecord_bc_blue_collar_proj');

            // Fallback: try custom segment if direct field not present
            if (!projectId) {
                projectId   = context.newRecord.getValue('cseg_bc_project');
                projectName = context.newRecord.getText('cseg_bc_project');
            }

            if (!projectId) {
                // Show empty-state message and exit
                const emptyField = context.form.getField({ id: 'custrecord_bc_co_timing_html' });
                if (emptyField) {
                    emptyField.defaultValue = [
                        '<div style="padding:24px;text-align:center;color:#6B7280;',
                        "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;\">",
                        '<p style="font-size:16px;margin-bottom:8px;">No Project Assigned</p>',
                        '<p style="font-size:13px;">This Change Request must be linked to a project ',
                        'to enable Cash Flow and Accrual scheduling.</p>',
                        '</div>'
                    ].join('');
                }

                log.debug({ title: funcName, details: `CR ${crId} has no project — showing empty state.` });
                return;
            }

            // ── Resolve the Suitelet AJAX endpoint URL ─────────────────────
            const suiteletUrl = url.resolveScript({
                scriptId: 'customscript_bc_timing_data_sl',
                deploymentId: 'customdeploy_bc_timing_data_sl',
                returnExternalUrl: false
            });

            // ── Load existing CO timing lines ──────────────────────────────
            //    Revenue side — Cash Flow + Accrual
            const revCashFlowLines = loadCOTimingLines({
                recordType: 'revenue',
                changeOrderId: Number(crId),
                timingType: Constants.TIMING_TYPE.CASH_FLOW.id
            });
            const revAccrualLines = loadCOTimingLines({
                recordType: 'revenue',
                changeOrderId: Number(crId),
                timingType: Constants.TIMING_TYPE.ACCRUAL.id
            });

            //    Cost side — Cash Flow + Accrual
            const costCashFlowLines = loadCOTimingLines({
                recordType: 'cost',
                changeOrderId: Number(crId),
                timingType: Constants.TIMING_TYPE.CASH_FLOW.id
            });
            const costAccrualLines = loadCOTimingLines({
                recordType: 'cost',
                changeOrderId: Number(crId),
                timingType: Constants.TIMING_TYPE.ACCRUAL.id
            });

            log.debug({
                title: funcName,
                details: `CR ${crId}: rev CF=${revCashFlowLines.length}, rev Acc=${revAccrualLines.length}, `
                    + `cost CF=${costCashFlowLines.length}, cost Acc=${costAccrualLines.length}`
            });

            const editable = true;  // Always editable — timing lives in custom records, not on the CR

            // ── Build Revenue Pane ─────────────────────────────────────────
            let revenueHtml = '';
            if (billingTotal === 0) {
                revenueHtml = [
                    '<div style="padding:20px;text-align:center;color:#6B7280;',
                    "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;\">",
                    '<p style="font-size:14px;">No billing-side changes on this CO</p>',
                    '</div>'
                ].join('');
            } else {
                revenueHtml = UI.renderScheduleSubtab({
                    transactionType: 'changeorder_revenue',
                    transactionId: crId,
                    transactionName: `${crName} \u2014 Revenue`,
                    entityName: '',
                    totalAmount: billingTotal,
                    projectId: projectId,
                    projectName: projectName,
                    cashFlowLines: revCashFlowLines,
                    accrualLines: revAccrualLines,
                    editable: editable,
                    showCostCode: false,
                    templates: Constants.BUILT_IN_TEMPLATES,
                    suiteletUrl: suiteletUrl,
                    recordType: 'revenue',
                    sourceGroup: Constants.SOURCE_GROUP.CHANGE_ORDER.id,
                    changeOrderId: crId
                });
            }

            // ── Build Cost Pane ────────────────────────────────────────────
            let costHtml = '';
            if (!budgetItems.length) {
                costHtml = [
                    '<div style="padding:20px;text-align:center;color:#6B7280;',
                    "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;\">",
                    '<p style="font-size:14px;">No cost-side changes on this CO</p>',
                    '</div>'
                ].join('');
            } else {
                costHtml = UI.renderScheduleSubtab({
                    transactionType: 'changeorder_cost',
                    transactionId: crId,
                    transactionName: `${crName} \u2014 Cost`,
                    entityName: '',
                    totalAmount: costTotal,
                    projectId: projectId,
                    projectName: projectName,
                    cashFlowLines: costCashFlowLines,
                    accrualLines: costAccrualLines,
                    editable: editable,
                    showCostCode: true,
                    templates: Constants.BUILT_IN_TEMPLATES,
                    suiteletUrl: suiteletUrl,
                    recordType: 'cost',
                    sourceGroup: Constants.SOURCE_GROUP.CHANGE_ORDER.id,
                    changeOrderId: crId
                });
            }

            // ── Build cost-code breakdown summary ──────────────────────────
            let costCodeSummary = '';
            if (budgetItems.length) {
                const rows = budgetItems.map((item) => {
                    const code = item.costCodeName || item.costCode || '—';
                    const type = item.costTypeName || item.costType || '—';
                    return `<tr>
                        <td style="padding:6px 12px;border-bottom:1px solid #F5F7FA;">${code}</td>
                        <td style="padding:6px 12px;border-bottom:1px solid #F5F7FA;">${type}</td>
                        <td style="padding:6px 12px;border-bottom:1px solid #F5F7FA;text-align:right;">$${fmtCurrency(item.amount)}</td>
                    </tr>`;
                }).join('');

                costCodeSummary = `
                <div style="margin:0 0 12px 0;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                        <thead>
                            <tr style="background:#04233D;color:#FFFFFF;">
                                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Cost Code</th>
                                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Cost Type</th>
                                <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            }

            // ── Populate the pre-existing INLINEHTML field ──────────────────
            const htmlField = context.form.getField({ id: 'custrecord_bc_co_timing_html' });
            if (!htmlField) {
                log.debug({ title: funcName, details: 'INLINEHTML field custrecord_bc_co_timing_html not found on form.' });
                return;
            }

            // ── Combine into dual-pane wrapper ─────────────────────────────
            htmlField.defaultValue = `
<style>
    .bc-cf-dual-pane {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .bc-cf-pane {
        margin-bottom: 24px;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
    }
    .bc-cf-pane-header {
        padding: 14px 24px;
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 12px;
        letter-spacing: -0.01em;
    }
    .bc-cf-pane-header .bc-cf-pane-amount {
        font-size: 14px;
        font-weight: 600;
        opacity: 0.85;
    }
    .bc-cf-pane-revenue .bc-cf-pane-header {
        background: linear-gradient(135deg, #04233D 0%, #0A3A66 100%);
        color: #FFFFFF;
    }
    .bc-cf-pane-cost .bc-cf-pane-header {
        background: linear-gradient(135deg, #0A3A66 0%, #04233D 100%);
        color: #FFFFFF;
    }
    .bc-cf-pane-body {
        padding: 0;
    }
</style>
<div class="bc-cf-dual-pane">
    <div class="bc-cf-pane bc-cf-pane-revenue">
        <div class="bc-cf-pane-header">
            <span>Revenue Timing</span>
            <span class="bc-cf-pane-amount">\u2014 CO Billing Impact: $${fmtCurrency(billingTotal)}</span>
        </div>
        <div class="bc-cf-pane-body">
            ${revenueHtml}
        </div>
    </div>
    <div class="bc-cf-pane bc-cf-pane-cost">
        <div class="bc-cf-pane-header">
            <span>Cost Timing</span>
            <span class="bc-cf-pane-amount">\u2014 CO Estimate Impact: $${fmtCurrency(costTotal)}</span>
        </div>
        <div class="bc-cf-pane-body">
            ${costCodeSummary}
            ${costHtml}
        </div>
    </div>
</div>`;

            log.debug({ title: funcName, details: `Dual-pane Schedule subtab rendered for CR ${crId}.` });

        } catch (e) {
            // Never block the Change Request from loading — log and move on
            log.error({
                title: `${funcName}.RENDER_FAILURE`,
                details: `${e.name}: ${e.message}\n${e.stack}`
            });
        }
    };

    // ─── Entry Point ─────────────────────────────────────────────────────────

    return { beforeLoad };
});

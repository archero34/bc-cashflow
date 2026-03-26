/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Populates the pre-existing INLINEHTML field on Sales Orders
 *              with Revenue Cash Flow and Accrual timing grids using the shared
 *              UI module. Data flows through the Suitelet AJAX endpoint for all
 *              CRUD operations.
 *
 * Deployed on: Sales Order (VIEW / EDIT)
 * Condition:   BlueCollar Contract checkbox must be checked.
 */
define([
    'N/log',
    'N/runtime',
    'N/url',
    '../modules/bc_timing_constants',
    '../modules/bc_timing_dao',
    '../modules/bc_timing_ui'
], (log, runtime, url, Constants, DAO, UI) => {

    const MODULE = 'bc_rev_timing_ue';

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

            const soId = context.newRecord.id;
            if (!soId) {
                log.debug({ title: funcName, details: 'No SO ID found — exiting.' });
                return;
            }

            // ── BlueCollar Contract gate — only activate for BC contracts ──
            const isBcContract = context.newRecord.getValue('custbody_bc_contract');
            if (!isBcContract) {
                log.debug({ title: funcName, details: `SO ${soId} is not a BC Contract — skipping.` });
                return;
            }

            // ── Gather SO header fields ──────────────────────────────────
            // Prefer Current Contract amount; fall back to native total
            let totalAmount = context.newRecord.getValue('custbody_bc_current_contract');
            if (!totalAmount) {
                totalAmount = context.newRecord.getValue('total');
            }

            const customerName = context.newRecord.getText('entity');
            const soNumber     = context.newRecord.getValue('tranid');
            const projectName  = context.newRecord.getText('cseg_bc_project');
            const projectId    = context.newRecord.getValue('cseg_bc_project');

            // ── If no project assigned, show empty state ─────────────────
            if (!projectId) {
                const emptyField = context.form.getField({ id: 'custbody_bc_rev_timing_html' });
                if (emptyField) {
                    emptyField.defaultValue = [
                        '<div style="padding:24px;text-align:center;color:#6B7280;',
                        'font-family:\'Inter\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">',
                        '<p style="font-size:16px;margin-bottom:8px;">No Project Assigned</p>',
                        '<p style="font-size:13px;">Assign this Sales Order to a project ',
                        'to enable Revenue Cash Flow and Accrual scheduling.</p>',
                        '</div>'
                    ].join('');
                }

                log.debug({ title: funcName, details: `SO ${soId} has no project — showing empty state.` });
                return;
            }

            // ── Resolve the Suitelet AJAX endpoint URL ───────────────────
            const suiteletUrl = url.resolveScript({
                scriptId: 'customscript_bc_timing_data_sl',
                deploymentId: 'customdeploy_bc_timing_data_sl',
                returnExternalUrl: false
            });

            // ── Load existing timing lines for both grid types ───────────
            const cashFlowLines = DAO.loadTimingLines({
                recordType: 'revenue',
                transactionId: Number(soId),
                projectId: Number(projectId),
                timingType: Constants.TIMING_TYPE.CASH_FLOW.id,
                sourceGroup: Constants.SOURCE_GROUP.BASE_CONTRACT.id
            });

            const accrualLines = DAO.loadTimingLines({
                recordType: 'revenue',
                transactionId: Number(soId),
                projectId: Number(projectId),
                timingType: Constants.TIMING_TYPE.ACCRUAL.id,
                sourceGroup: Constants.SOURCE_GROUP.BASE_CONTRACT.id
            });

            log.debug({
                title: funcName,
                details: `SO ${soId}: loaded ${cashFlowLines.length} cash flow lines, `
                    + `${accrualLines.length} accrual lines.`
            });

            // ── Populate the pre-existing INLINEHTML field ────────────────
            const htmlField = context.form.getField({ id: 'custbody_bc_rev_timing_html' });
            if (!htmlField) {
                log.debug({ title: funcName, details: 'INLINEHTML field custbody_bc_rev_timing_html not found on form.' });
                return;
            }

            // ── Render the full Schedule subtab HTML ─────────────────────
            htmlField.defaultValue = UI.renderScheduleSubtab({
                transactionType: 'salesorder',
                transactionId: soId,
                transactionName: `Contract #${soNumber}`,
                entityName: customerName,
                totalAmount: totalAmount,
                projectId: projectId,
                projectName: projectName,
                cashFlowLines: cashFlowLines,
                accrualLines: accrualLines,
                editable: true,  // Always editable — timing lives in custom records, not on the SO
                showCostCode: false,
                templates: Constants.BUILT_IN_TEMPLATES,
                suiteletUrl: suiteletUrl,
                recordType: 'revenue',
                sourceGroup: Constants.SOURCE_GROUP.BASE_CONTRACT.id
            });

            log.debug({ title: funcName, details: `Schedule subtab rendered for SO ${soId}.` });

        } catch (e) {
            // Never block the SO from loading — log and move on
            log.error({
                title: `${funcName}.RENDER_FAILURE`,
                details: `${e.name}: ${e.message}\n${e.stack}`
            });
        }
    };

    // ─── Entry Point ─────────────────────────────────────────────────────────

    return { beforeLoad };
});

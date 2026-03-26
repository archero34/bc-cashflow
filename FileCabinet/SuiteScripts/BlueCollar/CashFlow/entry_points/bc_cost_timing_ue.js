/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Injects the Cash Flow Schedule subtab onto Purchase Orders.
 *              Renders inline HTML grids for Cash Flow and Accrual timing
 *              using the shared UI module. Data flows through the Suitelet
 *              AJAX endpoint for all CRUD operations.
 *
 * Deployed on: Purchase Order (VIEW / EDIT)
 */
define([
    'N/log',
    'N/runtime',
    'N/url',
    'N/ui/serverWidget',
    'N/query',
    '../modules/bc_timing_constants',
    '../modules/bc_timing_dao',
    '../modules/bc_timing_ui'
], (log, runtime, url, serverWidget, query, Constants, DAO, UI) => {

    const MODULE = 'bc_cost_timing_ue';

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

            const poId = context.newRecord.id;
            if (!poId) {
                log.debug({ title: funcName, details: 'No PO ID found — exiting.' });
                return;
            }

            // ── Gather PO header fields ──────────────────────────────────
            const totalAmount = context.newRecord.getValue('total');
            const vendorName  = context.newRecord.getText('entity');
            const poNumber    = context.newRecord.getValue('tranid');
            const projectName = context.newRecord.getText('cseg_bc_project');
            const projectId   = context.newRecord.getValue('cseg_bc_project');

            // ── If no project assigned, show empty state ─────────────────
            if (!projectId) {
                context.form.addTab({
                    id: 'custpage_bc_schedule',
                    label: 'Schedule'
                });

                const emptyField = context.form.addField({
                    id: 'custpage_bc_schedule_html',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: ' ',
                    container: 'custpage_bc_schedule'
                });

                emptyField.defaultValue = [
                    '<div style="padding:24px;text-align:center;color:#6B7280;',
                    'font-family:\'Inter\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">',
                    '<p style="font-size:16px;margin-bottom:8px;">No Project Assigned</p>',
                    '<p style="font-size:13px;">Assign this Purchase Order to a project ',
                    'to enable Cash Flow and Accrual scheduling.</p>',
                    '</div>'
                ].join('');

                log.debug({ title: funcName, details: `PO ${poId} has no project — showing empty state.` });
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
                recordType: 'cost',
                transactionId: Number(poId),
                projectId: Number(projectId),
                timingType: Constants.TIMING_TYPE.CASH_FLOW.id,
                sourceGroup: Constants.SOURCE_GROUP.BASE_PO.id
            });

            const accrualLines = DAO.loadTimingLines({
                recordType: 'cost',
                transactionId: Number(poId),
                projectId: Number(projectId),
                timingType: Constants.TIMING_TYPE.ACCRUAL.id,
                sourceGroup: Constants.SOURCE_GROUP.BASE_PO.id
            });

            log.debug({
                title: funcName,
                details: `PO ${poId}: loaded ${cashFlowLines.length} cash flow lines, `
                    + `${accrualLines.length} accrual lines.`
            });

            // ── Add the Schedule subtab ──────────────────────────────────
            context.form.addTab({
                id: 'custpage_bc_schedule',
                label: 'Schedule'
            });

            const htmlField = context.form.addField({
                id: 'custpage_bc_schedule_html',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_bc_schedule'
            });

            // ── Render the full Schedule subtab HTML ─────────────────────
            htmlField.defaultValue = UI.renderScheduleSubtab({
                transactionType: 'purchaseorder',
                transactionId: poId,
                transactionName: `PO #${poNumber}`,
                entityName: vendorName,
                totalAmount: totalAmount,
                projectId: projectId,
                projectName: projectName,
                cashFlowLines: cashFlowLines,
                accrualLines: accrualLines,
                editable: context.type !== context.UserEventType.VIEW,
                showCostCode: false,
                templates: Constants.BUILT_IN_TEMPLATES,
                suiteletUrl: suiteletUrl,
                recordType: 'cost',
                sourceGroup: Constants.SOURCE_GROUP.BASE_PO.id
            });

            log.debug({ title: funcName, details: `Schedule subtab rendered for PO ${poId}.` });

        } catch (e) {
            // Never block the PO from loading — log and move on
            log.error({
                title: `${funcName}.RENDER_FAILURE`,
                details: `${e.name}: ${e.message}\n${e.stack}`
            });
        }
    };

    // ─── Entry Point ─────────────────────────────────────────────────────────

    return { beforeLoad };
});

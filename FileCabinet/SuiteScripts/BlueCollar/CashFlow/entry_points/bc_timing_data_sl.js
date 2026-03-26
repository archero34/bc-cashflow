/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description AJAX endpoint for all Cash Flow Timing CRUD operations.
 *              Called from inline HTML on PO/SO/Change Request Schedule subtabs.
 *              Handles: load lines, save lines, delete lines, apply template.
 *
 * Routes (via action param):
 *   GET  ?action=load&recordType=cost&transactionId=123&timingType=1
 *   POST action=save   → saves timing lines from JSON body
 *   POST action=apply  → applies template and returns generated lines
 *   POST action=delete → deletes all lines for a transaction+type
 */
define([
    'N/log',
    'N/format',
    '../modules/bc_timing_constants',
    '../modules/bc_timing_engine',
    '../modules/bc_timing_dao'
], (log, format, Constants, Engine, DAO) => {

    const MODULE = 'bc_timing_data_sl';

    // ─── Response Helpers ─────────────────────────────────────────────────────

    const sendJSON = (response, data, statusCode = 200) => {
        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write(JSON.stringify({ success: statusCode < 400, ...data }));
    };

    const sendError = (response, message, statusCode = 400) => {
        log.error({ title: MODULE, details: message });
        sendJSON(response, { error: message }, statusCode);
    };

    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return dateStr;
        // HTML date inputs send ISO format (YYYY-MM-DD) — parse directly
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        // Fallback for NS-formatted dates (MM/DD/YYYY)
        return format.parse({ value: dateStr, type: format.Type.DATE });
    };

    // ─── GET Handler ──────────────────────────────────────────────────────────

    const handleGet = (request, response) => {
        const { action } = request.parameters;

        switch (action) {
            case 'load': {
                const { recordType, transactionId, projectId, timingType, sourceGroup } = request.parameters;

                if (!recordType || !transactionId || !timingType) {
                    return sendError(response, 'Missing required params: recordType, transactionId, timingType');
                }

                const lines = DAO.loadTimingLines({
                    recordType,
                    transactionId: Number(transactionId),
                    projectId: projectId ? Number(projectId) : null,
                    timingType: Number(timingType),
                    sourceGroup: sourceGroup ? Number(sourceGroup) : null
                });

                return sendJSON(response, { lines });
            }

            case 'txninfo': {
                const { transactionId } = request.parameters;
                if (!transactionId) {
                    return sendError(response, 'Missing transactionId');
                }
                const info = DAO.getTransactionInfo(Number(transactionId));
                return sendJSON(response, { transaction: info });
            }

            case 'crinfo': {
                const { changeRequestId } = request.parameters;
                if (!changeRequestId) {
                    return sendError(response, 'Missing changeRequestId');
                }
                const info = DAO.getChangeRequestInfo(Number(changeRequestId));
                return sendJSON(response, { changeRequest: info });
            }

            case 'projectdata': {
                const { projectId, timingType } = request.parameters;
                if (!projectId || !timingType) {
                    return sendError(response, 'Missing projectId or timingType');
                }
                const data = DAO.getProjectTimingData(
                    Number(projectId),
                    Number(timingType)
                );
                return sendJSON(response, { timingData: data });
            }

            case 'templates': {
                return sendJSON(response, { templates: Constants.BUILT_IN_TEMPLATES });
            }

            default:
                return sendError(response, `Unknown GET action: "${action}". Valid: load, txninfo, crinfo, projectdata, templates`);
        }
    };

    // ─── POST Handler ─────────────────────────────────────────────────────────

    const handlePost = (request, response) => {
        let body;
        try {
            body = JSON.parse(request.body);
        } catch (e) {
            return sendError(response, 'Invalid JSON body');
        }

        const { action } = body;

        switch (action) {
            case 'save': {
                const { recordType, transactionId, projectId, lines, timingType, sourceGroup, changeOrderId } = body;

                // transactionId can be 0/null for CO cost lines — require changeOrderId instead
                if (!recordType || !projectId || !lines || !timingType || !sourceGroup) {
                    return sendError(response, 'Missing required fields for save');
                }
                if (!transactionId && !changeOrderId) {
                    return sendError(response, 'Either transactionId or changeOrderId is required');
                }

                // Convert date strings to Date objects
                const parsedLines = lines.map((line) => ({
                    ...line,
                    periodDate: line.periodDate ? parseDate(line.periodDate) : null
                }));

                const counts = DAO.saveTimingLines({
                    recordType,
                    transactionId: Number(transactionId),
                    projectId: Number(projectId),
                    lines: parsedLines,
                    timingType: Number(timingType),
                    sourceGroup: Number(sourceGroup),
                    changeOrderId: changeOrderId ? Number(changeOrderId) : null
                });

                return sendJSON(response, { counts });
            }

            case 'apply': {
                const { templateId, startDate, sourceAmount, timingType } = body;

                if (!templateId || !startDate || !sourceAmount) {
                    return sendError(response, 'Missing required fields for apply: templateId, startDate, sourceAmount');
                }

                const lines = Engine.applyTemplate({
                    templateId,
                    startDate: new Date(startDate),
                    sourceAmount: Number(sourceAmount),
                    timingType: Number(timingType || Constants.TIMING_TYPE.CASH_FLOW.id)
                });

                // Convert dates to strings for JSON transport
                const serializedLines = lines.map((line) => ({
                    ...line,
                    periodDate: format.format({ value: line.periodDate, type: format.Type.DATE })
                }));

                return sendJSON(response, { lines: serializedLines });
            }

            case 'delete': {
                const { recordType, transactionId, timingType } = body;

                if (!recordType || !transactionId || !timingType) {
                    return sendError(response, 'Missing required fields for delete');
                }

                const deleted = DAO.deleteTimingLines({
                    recordType,
                    transactionId: Number(transactionId),
                    timingType: Number(timingType)
                });

                return sendJSON(response, { deleted });
            }

            case 'validate': {
                const { lines, sourceAmount } = body;

                if (!lines || sourceAmount == null) {
                    return sendError(response, 'Missing lines or sourceAmount for validate');
                }

                const result = Engine.validateTimingLines(lines, Number(sourceAmount));
                return sendJSON(response, { validation: result });
            }

            default:
                return sendError(response, `Unknown POST action: "${action}". Valid: save, apply, delete, validate`);
        }
    };

    // ─── Entry Point ──────────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;

        try {
            if (request.method === 'GET') {
                return handleGet(request, response);
            }
            return handlePost(request, response);
        } catch (e) {
            log.error({ title: `${MODULE}.onRequest`, details: `${e.name}: ${e.message}\n${e.stack}` });
            return sendError(response, `Server error: ${e.message}`, 500);
        }
    };

    return { onRequest };
});

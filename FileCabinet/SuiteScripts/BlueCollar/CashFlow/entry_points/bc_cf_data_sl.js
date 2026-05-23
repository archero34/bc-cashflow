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
define(['N/log'], function (log) {

    const MODULE = 'bc_cf_data_sl';

    const sendJSON = (response, payload) => {
        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write({ output: JSON.stringify(payload) });
    };

    const sendError = (response, message) => sendJSON(response, { ok: false, error: message });

    // ── Action handlers (delegated to private loaders so tests can mock) ──────

    const _loadCombined = (projectId, mode) => {
        // Phase 3 stub: real implementation lands in Task 11.
        return { periods: [], categories: {}, kpis: {} };
    };
    const _loadCost = (projectId, mode) => {
        return { periods: [], categories: {}, kpis: {} };
    };
    const _loadRevenue = (projectId, mode) => {
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

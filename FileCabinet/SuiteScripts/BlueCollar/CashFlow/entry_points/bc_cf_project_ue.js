/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Populates three pre-existing INLINEHTML fields on the BlueCollar Project record,
 *              each on its own subtab under the "Cash Flow" parent tab:
 *                - custrecord_bc_cf_combined_html → Combined Cash Flow report iframe
 *                - custrecord_bc_cf_cost_html     → Cost Cash Flow report iframe
 *                - custrecord_bc_cf_revenue_html  → Revenue Cash Flow report iframe
 *
 *              Follows the BC pattern: fields and subtabs are pre-defined on the record;
 *              this UE only injects the iframe HTML at load time.
 */
define([
    'N/log',
    'N/url',
    '../modules/bc_timing_constants'
], (log, url, Constants) => {

    const MODULE = 'bc_cf_project_ue';
    const { BRAND } = Constants;

    /**
     * Resolve a Suitelet URL for an iframe source.
     */
    const resolveSuiteletUrl = (scriptId, deploymentId, params = {}) => {
        return url.resolveScript({ scriptId, deploymentId, returnExternalUrl: false, params });
    };

    /**
     * Build iframe HTML for a single report Suitelet.
     * Minimal wrapper — the Suitelet renders its own full HTML page.
     */
    const buildReportIframe = (suiteletUrl, title) => {
        return `
        <style>
            .bc-cf-iframe-wrap {
                width: 100%;
                padding: 0;
                margin: 0;
                background: ${BRAND.WHITE};
            }
            .bc-cf-iframe-wrap iframe {
                width: 100%;
                min-height: 700px;
                border: none;
                display: block;
            }
        </style>
        <div class="bc-cf-iframe-wrap">
            <iframe src="${suiteletUrl}"
                    title="${title}"
                    onload="(function(f){try{var d=f.contentDocument||f.contentWindow.document;f.style.height=Math.max(d.body.scrollHeight,d.documentElement.scrollHeight,700)+20+'px'}catch(e){f.style.height='800px'}})(this)">
            </iframe>
        </div>
        `;
    };

    // ─── Field ID → Suitelet mapping ──────────────────────────────────────────

    const REPORT_FIELDS = [
        {
            fieldId: 'custrecord_bc_cf_combined_html',
            scriptId: 'customscript_bc_cf_combined_sl',
            deploymentId: 'customdeploy_bc_cf_combined_sl',
            title: 'Combined Cash Flow Forecast'
        },
        {
            fieldId: 'custrecord_bc_cf_cost_html',
            scriptId: 'customscript_bc_cf_cost_report_sl',
            deploymentId: 'customdeploy_bc_cf_cost_report_sl',
            title: 'Cost Cash Flow Timeline'
        },
        {
            fieldId: 'custrecord_bc_cf_revenue_html',
            scriptId: 'customscript_bc_cf_rev_report_sl',
            deploymentId: 'customdeploy_bc_cf_rev_report_sl',
            title: 'Revenue Cash Flow Timeline'
        }
    ];

    // ─── Entry Point ──────────────────────────────────────────────────────────

    const beforeLoad = (context) => {
        try {
            if (context.type === context.UserEventType.CREATE) return;

            const projectId = context.newRecord.id;
            if (!projectId) return;

            for (const report of REPORT_FIELDS) {
                const field = context.form.getField({ id: report.fieldId });
                if (!field) {
                    log.debug({ title: MODULE, details: `Field ${report.fieldId} not found on form — skipping.` });
                    continue;
                }

                const suiteletUrl = resolveSuiteletUrl(
                    report.scriptId,
                    report.deploymentId,
                    { projectId, mode: 'cash' }
                );

                field.defaultValue = buildReportIframe(suiteletUrl, report.title);
            }

            log.debug({ title: MODULE, details: `Cash Flow report iframes injected for project ${projectId}` });

        } catch (e) {
            log.error({ title: `${MODULE}.beforeLoad`, details: `${e.name}: ${e.message}\n${e.stack}` });
        }
    };

    return { beforeLoad };
});

/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Injects "Cash Flow" parent tab with nested child tabs (Cost | Revenue | Combined)
 *              on the BlueCollar Project record. Each child tab loads a report Suitelet in an iframe.
 */
define([
    'N/log',
    'N/runtime',
    'N/url',
    'N/ui/serverWidget',
    '../modules/bc_timing_constants'
], (log, runtime, url, serverWidget, Constants) => {

    const MODULE = 'bc_cf_project_ue';
    const { BRAND } = Constants;

    /**
     * Resolve a Suitelet URL for an iframe source.
     * @param {string} scriptId
     * @param {string} deploymentId
     * @param {Object} params
     * @returns {string}
     */
    const resolveSuiteletUrl = (scriptId, deploymentId, params = {}) => {
        return url.resolveScript({
            scriptId,
            deploymentId,
            returnExternalUrl: false,
            params
        });
    };

    /**
     * Build the HTML for the Cash Flow Forecast subtab.
     * Contains tabbed interface: Cost | Revenue | Combined — each loading an iframe.
     */
    const buildCashFlowHtml = (projectId) => {
        const costUrl = resolveSuiteletUrl(
            'customscript_bc_cf_cost_report_sl',
            'customdeploy_bc_cf_cost_report_sl',
            { projectId, timingType: 1 }
        );
        const revenueUrl = resolveSuiteletUrl(
            'customscript_bc_cf_rev_report_sl',
            'customdeploy_bc_cf_rev_report_sl',
            { projectId, timingType: 1 }
        );
        const combinedUrl = resolveSuiteletUrl(
            'customscript_bc_cf_combined_sl',
            'customdeploy_bc_cf_combined_sl',
            { projectId, timingType: 1 }
        );

        return `
        <style>
            .bc-cf-project-container {
                font-family: ${BRAND.FONT_FAMILY};
                padding: 0;
                margin: 0;
                background: ${BRAND.WHITE};
            }
            .bc-cf-tab-bar {
                display: flex;
                border-bottom: 2px solid ${BRAND.NAVY};
                background: ${BRAND.GREY_LIGHT};
                padding: 0 16px;
            }
            .bc-cf-tab-btn {
                padding: 12px 24px;
                font-size: 13px;
                font-weight: 600;
                color: ${BRAND.GREY_DARK};
                background: transparent;
                border: none;
                border-bottom: 3px solid transparent;
                cursor: pointer;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                transition: all 0.2s;
                margin-bottom: -2px;
            }
            .bc-cf-tab-btn:hover {
                color: ${BRAND.NAVY};
                background: rgba(4, 35, 61, 0.05);
            }
            .bc-cf-tab-btn.active {
                color: ${BRAND.NAVY};
                border-bottom-color: ${BRAND.GOLD};
                background: ${BRAND.WHITE};
            }
            .bc-cf-tab-content {
                display: none;
                width: 100%;
                min-height: 600px;
            }
            .bc-cf-tab-content.active {
                display: block;
            }
            .bc-cf-tab-content iframe {
                width: 100%;
                min-height: 600px;
                border: none;
                display: block;
            }
        </style>

        <div class="bc-cf-project-container">
            <div class="bc-cf-tab-bar">
                <button class="bc-cf-tab-btn active" onclick="bcCfSwitchTab('combined')" id="bcCfTab_combined">Combined</button>
                <button class="bc-cf-tab-btn" onclick="bcCfSwitchTab('cost')" id="bcCfTab_cost">Cost</button>
                <button class="bc-cf-tab-btn" onclick="bcCfSwitchTab('revenue')" id="bcCfTab_revenue">Revenue</button>
            </div>

            <div class="bc-cf-tab-content active" id="bcCfPane_combined">
                <iframe src="${combinedUrl}" id="bcCfFrame_combined" onload="bcCfResizeFrame(this)"></iframe>
            </div>
            <div class="bc-cf-tab-content" id="bcCfPane_cost">
                <iframe data-src="${costUrl}" id="bcCfFrame_cost" onload="bcCfResizeFrame(this)"></iframe>
            </div>
            <div class="bc-cf-tab-content" id="bcCfPane_revenue">
                <iframe data-src="${revenueUrl}" id="bcCfFrame_revenue" onload="bcCfResizeFrame(this)"></iframe>
            </div>
        </div>

        <script>
            // Lazy-load iframes on tab click
            function bcCfSwitchTab(tabId) {
                // Deactivate all
                document.querySelectorAll('.bc-cf-tab-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.bc-cf-tab-content').forEach(pane => pane.classList.remove('active'));

                // Activate selected
                document.getElementById('bcCfTab_' + tabId).classList.add('active');
                document.getElementById('bcCfPane_' + tabId).classList.add('active');

                // Lazy load iframe if not yet loaded
                const frame = document.getElementById('bcCfFrame_' + tabId);
                if (frame && frame.dataset.src && !frame.getAttribute('src')) {
                    frame.src = frame.dataset.src;
                }
            }

            // Auto-resize iframe to fit content
            function bcCfResizeFrame(frame) {
                try {
                    const doc = frame.contentDocument || frame.contentWindow.document;
                    const height = Math.max(
                        doc.body.scrollHeight,
                        doc.documentElement.scrollHeight,
                        600
                    );
                    frame.style.height = height + 20 + 'px';
                } catch (e) {
                    frame.style.height = '800px';
                }
            }
        </script>
        `;
    };

    // ─── Entry Point ──────────────────────────────────────────────────────────

    const beforeLoad = (context) => {
        try {
            if (context.type === context.UserEventType.CREATE) return;

            const rec = context.newRecord;
            const projectId = rec.id;

            if (!projectId) return;

            // Add Cash Flow parent tab
            context.form.addTab({
                id: 'custpage_bc_cashflow',
                label: 'Cash Flow'
            });

            // Add inline HTML field
            const htmlField = context.form.addField({
                id: 'custpage_bc_cf_html',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_bc_cashflow'
            });

            htmlField.defaultValue = buildCashFlowHtml(projectId);

            log.debug({ title: MODULE, details: `Cash Flow subtab injected for project ${projectId}` });

        } catch (e) {
            // Never block the project record from loading
            log.error({ title: `${MODULE}.beforeLoad`, details: `${e.name}: ${e.message}\n${e.stack}` });
        }
    };

    return { beforeLoad };
});

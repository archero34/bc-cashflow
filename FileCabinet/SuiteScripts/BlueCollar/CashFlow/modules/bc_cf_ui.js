/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Shared HTML primitive builders for BC Cash Flow surfaces.
 * Spec: §3.15 of the redesign design doc.
 */
define([], function () {

    const esc = (s) => {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const panel = ({ header, body, footer }) => {
        const h = header ? `<div class="bccf-panel-header">${header}</div>` : '';
        const b = body ? `<div class="bccf-panel-body">${body}</div>` : '';
        const f = footer ? `<div class="bccf-panel-footer">${footer}</div>` : '';
        return `<div class="bccf-panel">${h}${b}${f}</div>`;
    };

    const kpi = ({ k, v, sub, accent }) => {
        const cls = accent ? 'bccf-kpi accent' : 'bccf-kpi';
        return `<div class="${cls}">
            <div class="bccf-k">${esc(k)}</div>
            <div class="bccf-v">${v}</div>
            ${sub ? `<div class="bccf-sub">${sub}</div>` : ''}
        </div>`;
    };

    const badge = (type, label) => {
        return `<span class="bccf-badge ${esc(type)}">${esc(label)}</span>`;
    };

    const toggle = ({ id, options, activeValue }) => {
        const buttons = options.map(o => {
            const active = o.value === activeValue ? ' class="active"' : '';
            return `<button type="button" data-value="${esc(o.value)}"${active}>${esc(o.label)}</button>`;
        }).join('');
        return `<div class="bccf-toggle" data-toggle-id="${esc(id)}">${buttons}</div>`;
    };

    const skeletonKpi = (n = 4) => {
        let html = '';
        for (let i = 0; i < n; i++) {
            html += `<div class="bccf-kpi">
                <div class="bccf-k"><span class="bccf-skel" style="display:block;width:80px;height:11px"></span></div>
                <div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>
                <div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>
            </div>`;
        }
        return html;
    };

    const skeletonChart = (periods = 6) => {
        const heights = [40, 70, 100, 90, 60, 30, 50, 80, 65];
        let bars = '';
        for (let i = 0; i < periods; i++) {
            const h = heights[i % heights.length];
            bars += `<div class="bccf-skel bar-skel" style="flex:1;height:${h}px;margin:0 3px;border-radius:3px 3px 0 0"></div>`;
        }
        return `<div style="display:flex;align-items:flex-end;height:120px;padding:14px 18px">${bars}</div>`;
    };

    const skeletonRows = (cols, rows) => {
        const widths = [80, 60, 70, 65, 75, 55, 90];
        let html = '';
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                const w = widths[(r + c) % widths.length];
                html += `<td><span class="bccf-skel" style="display:inline-block;width:${w}px;height:12px"></span></td>`;
            }
            html += '</tr>';
        }
        return html;
    };

    const errorCard = (message) => {
        return `<div class="bccf-error-card">
            <h4>Couldn't load data</h4>
            <pre>${esc(message)}</pre>
            <button type="button" class="bccf-btn" data-action="retry">Retry</button>
        </div>`;
    };

    return { esc, panel, kpi, badge, toggle, skeletonKpi, skeletonChart, skeletonRows, errorCard };
});

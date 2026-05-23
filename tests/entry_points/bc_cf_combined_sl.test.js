/**
 * Smoke tests for bc_cf_combined_sl — shell-only Suitelet.
 * Spec §3.4, §3.8, §3.16.
 *
 * Verifies:
 *   - <style> block from Styles.getStyles() is present
 *   - data-data-url attribute is stamped on <body>
 *   - #bccf-kpis, #bccf-chart, #bccf-table region anchors are present
 *   - skeleton classes are present
 *   - Client script block is embedded
 *   - Missing projectId returns an error page (not a crash)
 */

const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl');

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock N/url so resolveScript returns a deterministic URL
jest.mock('N/url', () => ({
    resolveScript: jest.fn(({ scriptId, deploymentId, params }) => {
        const qs = new URLSearchParams(Object.assign({ action: 'combined' }, params)).toString();
        return `/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=${deploymentId}&${qs}`;
    })
}), { virtual: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockResponse = () => {
    let body = '';
    return {
        write: (s) => { body += s; },
        setHeader: jest.fn(),
        getBody: () => body
    };
};

const GET = (params) => ({
    method: 'GET',
    parameters: params || {}
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('bc_cf_combined_sl — shell structure', () => {

    it('returns error page for missing projectId (no crash)', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({}), response: res });
        const body = res.getBody();
        expect(body).toMatch(/projectId/i);
        // Must not be a JS exception fallthrough
        expect(body).not.toMatch(/Cash Flow Report Error/);
    });

    it('rejects non-GET with "Method not allowed"', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: { method: 'POST', parameters: { projectId: '1807' } }, response: res });
        expect(res.getBody()).toMatch(/method not allowed/i);
    });

    describe('with valid projectId', () => {
        let body;

        beforeEach(() => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({ projectId: '1807', mode: 'cash' }), response: res });
            body = res.getBody();
        });

        // ── §3.16 — style block ───────────────────────────────────────────────
        it('includes <style> block from Styles.getStyles()', () => {
            expect(body).toMatch(/<style>/);
            expect(body).toContain('--bccf-brand-500');
        });

        // ── §3.9 — data-data-url stamped on body ─────────────────────────────
        it('stamps data-data-url on <body>', () => {
            expect(body).toMatch(/data-data-url=/);
            expect(body).toMatch(/customscript_bc_cf_data_sl/);
            // URL must include action=combined and projectId
            expect(body).toMatch(/action=combined/);
            expect(body).toMatch(/projectId=1807/);
        });

        // ── §3.16 — 3 region IDs present ─────────────────────────────────────
        it('contains id="bccf-kpis" region', () => {
            expect(body).toContain('id="bccf-kpis"');
        });

        it('contains id="bccf-chart" region', () => {
            expect(body).toContain('id="bccf-chart"');
        });

        it('contains id="bccf-table" region', () => {
            expect(body).toContain('id="bccf-table"');
        });

        // ── §3.16 — skeleton classes ──────────────────────────────────────────
        it('contains .bccf-skel shimmer elements in skeleton KPI strip', () => {
            expect(body).toMatch(/class="bccf-skel"/);
        });

        it('contains bar-skel class in skeleton chart', () => {
            expect(body).toMatch(/bar-skel/);
        });

        // ── §3.9 — client script block ────────────────────────────────────────
        it('embeds a <script> block', () => {
            expect(body).toMatch(/<script>/);
        });

        it('client script reads data-data-url from body', () => {
            expect(body).toContain('data-data-url');
            expect(body).toContain('dataset.dataUrl');
        });

        it('client script calls fetch()', () => {
            expect(body).toContain('fetch(');
        });

        // ── §3.5 — no in-iframe nav tabs ─────────────────────────────────────
        it('does NOT render in-iframe nav tabs (spec §3.5 amendment)', () => {
            // The in-iframe tab strip would be an <a> or <button> inside .bccf-tabs
            // that links to the Cost or Revenue reports by name.
            // The shared CSS does define .bccf-tabs styles but there must be no
            // rendered tab strip HTML with report-switching links.
            expect(body).not.toMatch(/<a[^>]*class="[^"]*active[^"]*"[^>]*>\s*(Combined|Cost|Revenue)\s*<\/a>/i);
            expect(body).not.toMatch(/data-tab="(combined|cost|revenue)"/i);
        });

        // ── §3.6 — KPI labels rendered in skeleton strip ──────────────────────
        it('renders KPI label text in skeleton strip for all 4 KPIs', () => {
            expect(body).toContain('Total Revenue');
            expect(body).toContain('Total Cost');
            expect(body).toContain('Net Cash Flow');
            expect(body).toContain('Margin');
        });

        // ── Event delegation + no inline event handlers ───────────────────────
        it('uses data-action attributes for event delegation, not inline handlers', () => {
            // Refresh button present; export buttons removed
            expect(body).toContain('data-action="refresh"');
            expect(body).not.toContain('data-action="export-csv"');
            expect(body).not.toContain('data-action="export-pdf"');
            // No inline onclick/onmouseover/onmouseout on any element
            const inlineHandlers = body.match(/\bon(click|mouseover|mouseout|mouseenter|mouseleave)\s*=/g) || [];
            expect(inlineHandlers).toHaveLength(0);
        });

        // ── Toggle fix: toggle handler uses closest('[data-toggle-id="mode"] button') ─
        it('toggle click handler checks for toggle button via data-toggle-id wrapper', () => {
            expect(body).toContain('[data-toggle-id="mode"] button');
        });

        // ── Double-evaluation guard ──────────────────────────────────────────
        it('includes double-evaluation guard __bccfWiredCombined', () => {
            expect(body).toContain('__bccfWiredCombined');
        });

        // ── Currency helper embeds Unicode minus ──────────────────────────────
        it('client fmtCurrency uses Unicode minus (U+2212), not hyphen', () => {
            // The client script source must contain the Unicode minus escape or literal char
            expect(body).toMatch(/\\u2212|−/);
        });

        // ── Cash/accrual toggle rendered ─────────────────────────────────────
        it('renders cash/accrual toggle with data-toggle-id="mode"', () => {
            expect(body).toContain('data-toggle-id="mode"');
        });
    });

    describe('accrual mode', () => {
        it('sets mode=accrual in data-data-url when mode=accrual param given', () => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({ projectId: '1807', mode: 'accrual' }), response: res });
            const body = res.getBody();
            expect(body).toMatch(/mode=accrual/);
        });

        it('defaults to cash mode when mode param is absent', () => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
            const body = res.getBody();
            expect(body).toMatch(/mode=cash/);
        });
    });
});

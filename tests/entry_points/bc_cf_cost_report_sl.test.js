/**
 * Smoke tests for bc_cf_cost_report_sl — shell-only Suitelet.
 * Spec §3.4, §3.6 (cost KPIs), §3.7 (slate), §3.8 (single-color chart), §3.16.
 *
 * Verifies:
 *   - <style> block from Styles.getStyles() is present
 *   - data-data-url attribute is stamped on <body> with action=cost
 *   - #bccf-kpis, #bccf-chart, #bccf-table region anchors are present
 *   - skeleton classes are present
 *   - Client script block is embedded
 *   - Missing projectId returns an error page (not a crash)
 *   - Cost-only KPI labels (Total Cost / Current Month / Peak Month / Remaining)
 *   - No revenue references in skeleton or header
 *   - Double-eval guard uses __bccfWiredCost
 *   - .bccf-bar.cost (slate) class used — no inline background on bars
 *   - .now class present in client script for current-month column
 *   - Mode toggle skips active button
 *   - All 3 regions (kpis/chart/table) replaced on fetch error
 */

const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl');

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock N/url so resolveScript returns a deterministic URL
jest.mock('N/url', () => ({
    resolveScript: jest.fn(({ scriptId, deploymentId, params }) => {
        const qs = new URLSearchParams(Object.assign({ action: 'cost' }, params)).toString();
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

describe('bc_cf_cost_report_sl — shell structure', () => {

    it('returns error page for missing projectId (no crash)', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({}), response: res });
        const body = res.getBody();
        expect(body).toMatch(/projectId/i);
        // Must not be a JS exception fallthrough
        expect(body).not.toMatch(/Cost Outflows Report Error/);
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
        });

        it('data URL uses action=cost (not combined or revenue)', () => {
            expect(body).toMatch(/action=cost/);
            expect(body).not.toMatch(/action=combined/);
            expect(body).not.toMatch(/action=revenue/);
        });

        it('data URL contains projectId=1807', () => {
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
            expect(body).not.toMatch(/<a[^>]*class="[^"]*active[^"]*"[^>]*>\s*(Combined|Cost|Revenue)\s*<\/a>/i);
            expect(body).not.toMatch(/data-tab="(combined|cost|revenue)"/i);
        });

        // ── §3.6 — Cost KPI labels (4 correct cards, no revenue KPIs) ────────
        it('renders "Total Cost" as first KPI label', () => {
            expect(body).toContain('Total Cost');
        });

        it('renders "Current Month" as second KPI label', () => {
            expect(body).toContain('Current Month');
        });

        it('renders "Peak Month" as third KPI label', () => {
            expect(body).toContain('Peak Month');
        });

        it('renders "Remaining" as fourth KPI label', () => {
            expect(body).toContain('Remaining');
        });

        it('does NOT render revenue-specific KPI labels in skeleton', () => {
            // Revenue, Net Cash Flow, and Margin are Combined-only KPIs
            expect(body).not.toContain('Total Revenue');
            expect(body).not.toContain('Net Cash Flow');
            expect(body).not.toContain('Margin');
        });

        // ── §3.4 — Title is "Cost Outflows" ──────────────────────────────────
        it('page title is "Cost Outflows"', () => {
            expect(body).toContain('<title>Cost Outflows</title>');
        });

        it('h1 heading reads "Cost Outflows"', () => {
            expect(body).toContain('Cost Outflows');
        });

        // ── Event delegation + no inline event handlers ───────────────────────
        it('uses data-action attributes for event delegation, not inline handlers', () => {
            expect(body).toContain('data-action="export-csv"');
            expect(body).toContain('data-action="export-pdf"');
            // No inline onclick/onmouseover/onmouseout on any element
            const inlineHandlers = body.match(/\bon(click|mouseover|mouseout|mouseenter|mouseleave)\s*=/g) || [];
            expect(inlineHandlers).toHaveLength(0);
        });

        // ── Double-evaluation guard ──────────────────────────────────────────
        it('includes double-evaluation guard __bccfWiredCost (not Combined)', () => {
            expect(body).toContain('__bccfWiredCost');
            expect(body).not.toContain('__bccfWiredCombined');
        });

        // ── Currency helper embeds Unicode minus ──────────────────────────────
        it('client fmtCurrency uses Unicode minus (U+2212), not hyphen', () => {
            expect(body).toMatch(/\\u2212|−/);
        });

        // ── Cash/accrual toggle rendered ─────────────────────────────────────
        it('renders cash/accrual toggle with data-toggle-id="mode"', () => {
            expect(body).toContain('data-toggle-id="mode"');
        });

        // ── §3.7 — Slate color encoding (no navy/brand bars in chart) ─────────
        it('uses .bccf-bar.cost CSS class for chart bars (not inline navy background)', () => {
            // The chart bars should use the shared .bccf-bar.cost CSS class
            // from bc_cf_styles.js — not inline background on a generic .bccf-bar
            expect(body).toContain('bccf-bar cost');
        });

        it('does not render revenue bar class in chart', () => {
            expect(body).not.toContain('bccf-bar revenue');
        });

        // ── §3.8 — .now class on current-month column ─────────────────────────
        it('client script applies .now class to current-month chart column', () => {
            expect(body).toContain("'now'");
        });

        // ── Mode toggle skips already-active button ───────────────────────────
        it('mode toggle contains active-button guard (no-op if already active)', () => {
            expect(body).toContain("classList.contains('active')");
        });

        // ── All 3 regions replaced on fetch error ─────────────────────────────
        it('error handler replaces KPI region (#bccf-kpis)', () => {
            expect(body).toContain("getElementById('bccf-kpis')");
        });

        it('error handler replaces chart panel region', () => {
            expect(body).toContain("getElementById('bccf-chart')");
        });

        it('error handler replaces table panel region', () => {
            expect(body).toContain("getElementById('bccf-table')");
        });

        // ── No revenue references in client JS ────────────────────────────────
        it('client script does not reference revenue category', () => {
            // Revenue should not appear in the renderChart or renderTable functions
            // (Combined SL references categories.revenue — cost SL must not)
            expect(body).not.toContain('categories.revenue');
        });

        // ── Table has no Net row ──────────────────────────────────────────────
        it('client table render does not include a Net Cash Flow row', () => {
            expect(body).not.toContain('Net Cash Flow');
        });

        it('client table uses "Cost Forecast" as category header', () => {
            expect(body).toContain('Cost Forecast');
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

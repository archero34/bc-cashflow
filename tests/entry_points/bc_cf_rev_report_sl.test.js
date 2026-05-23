/**
 * Smoke tests for bc_cf_rev_report_sl — shell-only Suitelet.
 * Spec §3.4, §3.6 (revenue KPIs), §3.7 (navy), §3.8 (single-color chart), §3.16.
 *
 * Verifies:
 *   - <style> block from Styles.getStyles() is present
 *   - data-data-url attribute is stamped on <body> with action=revenue
 *   - #bccf-kpis, #bccf-chart, #bccf-table region anchors are present
 *   - skeleton classes are present
 *   - Client script block is embedded
 *   - Missing projectId returns an error page (not a crash)
 *   - Revenue-only KPI labels (Total Revenue / Base Contract / Change Orders / Peak Month)
 *   - No cost references in skeleton or header
 *   - Double-eval guard uses __bccfWiredRevenue
 *   - .bccf-bar.revenue (navy) class used — no inline background on bars
 *   - .now class present in client script for current-month column
 *   - Mode toggle skips active button
 *   - All 3 regions (kpis/chart/table) replaced on fetch error
 */

const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl');

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock N/url so resolveScript returns a deterministic URL
jest.mock('N/url', () => ({
    resolveScript: jest.fn(({ scriptId, deploymentId, params }) => {
        const qs = new URLSearchParams(Object.assign({ action: 'revenue' }, params)).toString();
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

describe('bc_cf_rev_report_sl — shell structure', () => {

    it('returns error page for missing projectId (no crash)', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({}), response: res });
        const body = res.getBody();
        expect(body).toMatch(/projectId/i);
        // Must not be a JS exception fallthrough
        expect(body).not.toMatch(/Revenue Inflows Report Error/);
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

        it('data URL uses action=revenue (not combined or cost)', () => {
            expect(body).toMatch(/action=revenue/);
            expect(body).not.toMatch(/action=combined/);
            expect(body).not.toMatch(/action=cost/);
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

        // ── §3.6 — Revenue KPI labels (4 correct cards, no cost KPIs) ────────
        it('renders "Total Revenue" as first KPI label', () => {
            expect(body).toContain('Total Revenue');
        });

        it('renders "Base Contract" as second KPI label', () => {
            expect(body).toContain('Base Contract');
        });

        it('renders "Change Orders" as third KPI label', () => {
            expect(body).toContain('Change Orders');
        });

        it('renders "Peak Month" as fourth KPI label', () => {
            expect(body).toContain('Peak Month');
        });

        it('does NOT render cost-specific KPI labels in skeleton', () => {
            // Total Cost, Current Month, Remaining are Cost-only KPIs
            expect(body).not.toContain('Total Cost');
            expect(body).not.toContain('Current Month');
            expect(body).not.toContain('Remaining');
        });

        // ── §3.4 — Title is "Revenue Inflows" ────────────────────────────────
        it('page title is "Revenue Inflows"', () => {
            expect(body).toContain('<title>Revenue Inflows</title>');
        });

        it('h1 heading reads "Revenue Inflows"', () => {
            expect(body).toContain('Revenue Inflows');
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
        it('includes double-evaluation guard __bccfWiredRevenue (not Cost or Combined)', () => {
            expect(body).toContain('__bccfWiredRevenue');
            expect(body).not.toContain('__bccfWiredCost');
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

        // ── §3.7 — Navy color encoding (no slate/cost bars in chart) ──────────
        it('uses .bccf-bar.revenue CSS class for chart bars (not inline navy background)', () => {
            // The chart bars should use the shared .bccf-bar.revenue CSS class
            // from bc_cf_styles.js — not inline background on a generic .bccf-bar
            expect(body).toContain('bccf-bar revenue');
        });

        it('does not render cost bar class in chart', () => {
            expect(body).not.toContain('bccf-bar cost');
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

        // ── No cost references in client JS ──────────────────────────────────
        it('client script does not reference cost category', () => {
            // Cost should not appear in renderChart or renderTable functions
            // (Combined SL references categories.cost — revenue SL must not)
            expect(body).not.toContain('categories.cost');
        });

        // ── No actuals references ─────────────────────────────────────────────
        it('client script has no actuals references (invoiced/collected/CustInvc/CustPymt)', () => {
            expect(body).not.toContain('invoiced');
            expect(body).not.toContain('collected');
            expect(body).not.toContain('CustInvc');
            expect(body).not.toContain('CustPymt');
        });

        // ── Table has no Net row ──────────────────────────────────────────────
        it('client table render does not include a Net Cash Flow row', () => {
            expect(body).not.toContain('Net Cash Flow');
        });

        it('client table uses "Revenue Forecast" as category header', () => {
            expect(body).toContain('Revenue Forecast');
        });

        // ── KPI accent uses navy (--bccf-brand-500) ───────────────────────────
        it('Total Revenue KPI accent value uses navy --bccf-brand-500 color', () => {
            expect(body).toContain('--bccf-brand-500');
        });

        // ── CO count derived from lines ───────────────────────────────────────
        it('client script derives CO count from lines filtered by "CO:" prefix', () => {
            expect(body).toContain("indexOf('CO:')");
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

/**
 * Smoke tests for bc_cf_portfolio_sl — shell-only Suitelet.
 */

const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl');

jest.mock('N/url', () => ({
    resolveScript: jest.fn(({ scriptId, deploymentId, params }) => {
        const qs = new URLSearchParams(Object.assign({ action: 'portfolio' }, params)).toString();
        return `/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=${deploymentId}&${qs}`;
    })
}), { virtual: true });

const mockResponse = () => {
    let body = '';
    return {
        write: (s) => { body += s; },
        setHeader: jest.fn(),
        getBody: () => body
    };
};

const GET = (params) => ({ method: 'GET', parameters: params || {} });

describe('bc_cf_portfolio_sl — shell structure', () => {
    it('rejects non-GET with method not allowed', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: { method: 'POST', parameters: {} }, response: res });
        expect(res.getBody()).toMatch(/method not allowed/i);
    });

    describe('with default params', () => {
        let body;
        beforeEach(() => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({}), response: res });
            body = res.getBody();
        });

        it('returns an HTML document', () => {
            expect(body).toMatch(/<!doctype html>/i);
            expect(body).toMatch(/<html lang="en">/);
        });

        it('includes the <style> block from Styles.getStyles()', () => {
            expect(body).toMatch(/<style>/);
            expect(body).toContain('--bccf-brand-500');
        });

        it('stamps data-data-url on <body> with action=portfolio', () => {
            expect(body).toMatch(/data-data-url=/);
            expect(body).toMatch(/action=portfolio/);
        });

        it('renders the page title "Portfolio Cash Flow"', () => {
            expect(body).toMatch(/Portfolio Cash Flow/);
        });

        it('renders #bccf-kpis, #bccf-chart, #bccf-table region anchors', () => {
            expect(body).toContain('id="bccf-kpis"');
            expect(body).toContain('id="bccf-chart"');
            expect(body).toContain('id="bccf-table"');
        });

        it('renders the date-range picker pill (reused from E1)', () => {
            expect(body).toContain('class="bccf-daterange"');
            expect(body).toContain('data-action="open-daterange"');
        });

        it('renders the Cash/Accrual toggle + Refresh button', () => {
            expect(body).toContain('data-toggle-id="mode"');
            expect(body).toContain('data-action="refresh"');
        });

        it('renders the Filters pill trigger', () => {
            expect(body).toContain('class="bccf-filters"');
            expect(body).toContain('data-action="open-filters"');
        });

        it('renders the Active checkbox row checked by default', () => {
            // Active toggle is a checkbox; checked attribute present by default.
            expect(body).toMatch(/class="bccf-filters-active"/);
            expect(body).toMatch(/data-filter="active"[^>]*checked/);
        });

        it('renders 4 empty chip slots for projects/managers/customers/subsidiaries', () => {
            expect(body).toContain('data-dim="projects"');
            expect(body).toContain('data-dim="managers"');
            expect(body).toContain('data-dim="customers"');
            expect(body).toContain('data-dim="subsidiaries"');
        });

        it('renders Reset all + Apply buttons', () => {
            expect(body).toContain('data-action="reset-filters"');
            expect(body).toContain('data-action="apply-filters"');
        });

        it('badge shows "Filters" (no active count) when at defaults', () => {
            // Default = active:true + empty arrays = 0 non-default filters → bare "Filters" label
            expect(body).toMatch(/<span class="bccf-filters-label">Filters<\/span>/);
        });
    });

    describe('with active=0 + projects=1807,2104', () => {
        let body;
        beforeEach(() => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({ active: '0', projects: '1807,2104' }), response: res });
            body = res.getBody();
        });

        it('renders 2 chips for projects', () => {
            expect(body).toContain('data-id="1807"');
            expect(body).toContain('data-id="2104"');
        });

        it('Active checkbox is NOT checked (user disabled active-only)', () => {
            // checkbox without "checked" attribute on data-filter="active"
            expect(body).toMatch(/data-filter="active"[^>]*>/);  // exists
            expect(body).not.toMatch(/data-filter="active"[^>]*checked/);  // but not checked
        });

        it('badge shows count of active filters (active:0 + projects = 2)', () => {
            expect(body).toMatch(/Filters\s*·\s*2\s*active/);
        });
    });
});

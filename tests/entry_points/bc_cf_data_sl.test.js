const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl');

const mockResponse = () => {
    let body = '';
    return {
        write: (opts) => { body = opts.output || opts; },
        setHeader: jest.fn(),
        getBody: () => body,
    };
};

describe('bc_cf_data_sl', () => {

    it('rejects missing action with ok:false', () => {
        const req = { method: 'GET', parameters: {} };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/action/i);
    });

    it('rejects unknown action with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'frobnicate', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/unknown action/i);
    });

    it('rejects missing projectId with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/projectId/i);
    });

    it('returns ok:true with periods + categories for combined action (mocked DAO)', () => {
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr', 'May', 'Jun'],
            categories: { revenue: { lines: [], totals: [] }, cost: { lines: [], totals: [] } },
            kpis: { totalRevenue: 42000, totalCost: 33000 },
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.periods).toEqual(['Apr', 'May', 'Jun']);
        expect(body.kpis.totalRevenue).toBe(42000);
    });
});

describe('bc_cf_data_sl combined action shape', () => {
    it('returns periods + categories + kpis structure', () => {
        // Real SuiteQL not testable from node; assert shape with a mock
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: {
                revenue: { lines: [], total: [0, 0], grandTotal: 0 },
                cost: { lines: [], total: [0, 0], grandTotal: 0 },
            },
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.periods).toBeDefined();
        expect(body.categories.revenue).toBeDefined();
        expect(body.categories.cost).toBeDefined();
        expect(body.kpis).toHaveProperty('totalRevenue');
        expect(body.kpis).toHaveProperty('netCashFlow');
    });
});

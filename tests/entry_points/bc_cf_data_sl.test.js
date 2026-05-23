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

    it('rejects invalid mode with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', mode: 'gibberish' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/invalid mode/i);
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

    it('rejects malformed startPeriod with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-13' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/invalid period format/i);
    });

    it('rejects range > 24 months with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-01', endPeriod: '2028-02' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/24-month/i);
    });

    it('rejects startPeriod > endPeriod with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-12', endPeriod: '2026-01' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/startPeriod must be <= endPeriod/i);
    });

    it('passes resolved range to _loadCombined', () => {
        const spy = jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: [], categories: { revenue: {lines:[],total:[],grandTotal:0}, cost: {lines:[],total:[],grandTotal:0} }, kpis: {}
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-03', endPeriod: '2026-08' } };
        Suitelet.onRequest({ request: req, response: mockResponse() });
        expect(spy).toHaveBeenCalledWith('1807', 'cash', { startPeriod: '2026-03', endPeriod: '2026-08' });
        spy.mockRestore();
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

describe('bc_cf_data_sl cost action shape', () => {
    it('returns cost categories + kpis with currentMonth/peakMonth/remaining', () => {
        jest.spyOn(Suitelet, '_loadCost').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: { cost: { lines: [], total: [0, 0], grandTotal: 0 } },
            kpis: { totalCost: 0, currentMonth: 0, peakMonth: 0, remaining: 0 },
        });
        const req = { method: 'GET', parameters: { action: 'cost', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.categories.cost).toBeDefined();
        expect(body.kpis).toHaveProperty('currentMonth');
        expect(body.kpis).toHaveProperty('peakMonth');
        expect(body.kpis).toHaveProperty('remaining');
    });

    it('returns range, availableBounds, and projectTotals on cost action', () => {
        jest.spyOn(Suitelet, '_loadCost').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: { cost: { lines: [], total: [0, 0], grandTotal: 0 } },
            kpis: { totalCost: 0, currentMonth: 0, peakMonth: 0, remaining: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { cost: 33000 }
        });
        const req = { method: 'GET', parameters: { action: 'cost', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-05' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.range).toEqual({ startPeriod: '2026-04', endPeriod: '2026-05' });
        expect(body.availableBounds).toEqual({ minPeriod: '2026-01', maxPeriod: '2027-12' });
        expect(body.projectTotals.cost).toBe(33000);
    });
});

describe('bc_cf_data_sl revenue action shape', () => {
    it('returns revenue categories + kpis with base/COs/peakMonth', () => {
        jest.spyOn(Suitelet, '_loadRevenue').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: { revenue: { lines: [], total: [0, 0], grandTotal: 0 } },
            kpis: { totalRevenue: 0, baseContract: 0, changeOrders: 0, peakMonth: 0 },
        });
        const req = { method: 'GET', parameters: { action: 'revenue', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.categories.revenue).toBeDefined();
        expect(body.kpis).toHaveProperty('baseContract');
        expect(body.kpis).toHaveProperty('changeOrders');
        expect(body.kpis).toHaveProperty('peakMonth');
    });
});

describe('bc_cf_data_sl YYYY-MM helpers', () => {
    it('_validateYYYYMM accepts well-formed', () => {
        expect(Suitelet._validateYYYYMM('2026-01')).toBe(true);
        expect(Suitelet._validateYYYYMM('2026-12')).toBe(true);
    });
    it('_validateYYYYMM rejects malformed', () => {
        expect(Suitelet._validateYYYYMM('2026-13')).toBe(false);
        expect(Suitelet._validateYYYYMM('2026-00')).toBe(false);
        expect(Suitelet._validateYYYYMM('26-01')).toBe(false);
        expect(Suitelet._validateYYYYMM('2026-1')).toBe(false);
        expect(Suitelet._validateYYYYMM('2026/01')).toBe(false);
        expect(Suitelet._validateYYYYMM('')).toBe(false);
        expect(Suitelet._validateYYYYMM(null)).toBe(false);
        expect(Suitelet._validateYYYYMM(undefined)).toBe(false);
    });
    it('_addMonths handles forward and backward rollover', () => {
        expect(Suitelet._addMonths('2026-05', 0)).toBe('2026-05');
        expect(Suitelet._addMonths('2026-05', 1)).toBe('2026-06');
        expect(Suitelet._addMonths('2026-05', -3)).toBe('2026-02');
        expect(Suitelet._addMonths('2026-05', 11)).toBe('2027-04');
        expect(Suitelet._addMonths('2026-01', -1)).toBe('2025-12');
        expect(Suitelet._addMonths('2026-12', 1)).toBe('2027-01');
    });
    it('_monthsBetween is inclusive', () => {
        expect(Suitelet._monthsBetween('2026-05', '2026-05')).toBe(1);
        expect(Suitelet._monthsBetween('2026-01', '2026-12')).toBe(12);
        expect(Suitelet._monthsBetween('2026-02', '2027-01')).toBe(12);
        expect(Suitelet._monthsBetween('2026-01', '2027-12')).toBe(24);
        expect(Suitelet._monthsBetween('2026-01', '2028-01')).toBe(25);
    });
    it('_defaultRange returns 12-month window centered −3 / +8 around current month', () => {
        const r = Suitelet._defaultRange();
        expect(r.startPeriod).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        expect(r.endPeriod).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        expect(Suitelet._monthsBetween(r.startPeriod, r.endPeriod)).toBe(12);
    });
    it('_resolveRange uses default when both params omitted', () => {
        const r = Suitelet._resolveRange(undefined, undefined);
        expect(r.ok).toBe(true);
        expect(Suitelet._monthsBetween(r.startPeriod, r.endPeriod)).toBe(12);
    });
    it('_resolveRange extends end when only start provided', () => {
        const r = Suitelet._resolveRange('2026-04', undefined);
        expect(r.ok).toBe(true);
        expect(r.startPeriod).toBe('2026-04');
        expect(r.endPeriod).toBe('2027-03');
    });
    it('_resolveRange extends start when only end provided', () => {
        const r = Suitelet._resolveRange(undefined, '2026-12');
        expect(r.ok).toBe(true);
        expect(r.startPeriod).toBe('2026-01');
        expect(r.endPeriod).toBe('2026-12');
    });
    it('_resolveRange accepts both when valid', () => {
        const r = Suitelet._resolveRange('2026-03', '2027-02');
        expect(r.ok).toBe(true);
        expect(r.startPeriod).toBe('2026-03');
        expect(r.endPeriod).toBe('2027-02');
    });
    it('_resolveRange rejects malformed startPeriod', () => {
        const r = Suitelet._resolveRange('2026-13', '2026-12');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/invalid period format/i);
    });
    it('_resolveRange rejects malformed endPeriod', () => {
        const r = Suitelet._resolveRange('2026-01', '2026/12');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/invalid period format/i);
    });
    it('_resolveRange rejects start > end', () => {
        const r = Suitelet._resolveRange('2026-12', '2026-01');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/startPeriod must be <= endPeriod/i);
    });
    it('_resolveRange rejects range > 24 months', () => {
        const r = Suitelet._resolveRange('2026-01', '2028-02');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/24-month/i);
    });
    it('_resolveRange accepts exactly 24 months', () => {
        const r = Suitelet._resolveRange('2026-01', '2027-12');
        expect(r.ok).toBe(true);
    });
});

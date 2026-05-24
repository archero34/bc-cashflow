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

    it('returns range, availableBounds, and projectTotals (both sides) on combined action', () => {
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: {
                revenue: { lines: [], total: [0, 0], grandTotal: 0 },
                cost:    { lines: [], total: [0, 0], grandTotal: 0 }
            },
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000, cost: 33000 }
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-05' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.range).toEqual({ startPeriod: '2026-04', endPeriod: '2026-05' });
        expect(body.availableBounds).toEqual({ minPeriod: '2026-01', maxPeriod: '2027-12' });
        expect(body.projectTotals.revenue).toBe(42000);
        expect(body.projectTotals.cost).toBe(33000);
    });

    it('returns cumulativeBefore on combined action', () => {
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr 2026'],
            categories: {
                revenue: { lines: [], total: [0], grandTotal: 0 },
                cost:    { lines: [], total: [0], grandTotal: 0 }
            },
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-04' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000, cost: 33000 },
            cumulativeBefore: 5500
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-04' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.cumulativeBefore).toBe(5500);
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

    it('returns range, availableBounds, and projectTotals on revenue action', () => {
        jest.spyOn(Suitelet, '_loadRevenue').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: { revenue: { lines: [], total: [0, 0], grandTotal: 0 } },
            kpis: { totalRevenue: 0, baseContract: 0, changeOrders: 0, peakMonth: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000 }
        });
        const req = { method: 'GET', parameters: { action: 'revenue', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-05' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.range).toEqual({ startPeriod: '2026-04', endPeriod: '2026-05' });
        expect(body.availableBounds).toEqual({ minPeriod: '2026-01', maxPeriod: '2027-12' });
        expect(body.projectTotals.revenue).toBe(42000);
    });

    it('returns projectTotals.baseContract and projectTotals.changeOrders on revenue action', () => {
        jest.spyOn(Suitelet, '_loadRevenue').mockReturnValue({
            periods: [],
            categories: { revenue: { lines: [], total: [], grandTotal: 0 } },
            kpis: { totalRevenue: 0, baseContract: 0, changeOrders: 0, peakMonth: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-04' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000, baseContract: 30000, changeOrders: 12000 }
        });
        const req = { method: 'GET', parameters: { action: 'revenue', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.projectTotals.baseContract).toBe(30000);
        expect(body.projectTotals.changeOrders).toBe(12000);
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

describe('bc_cf_data_sl _pivotDirection', () => {
    it('is exported on api', () => {
        expect(typeof Suitelet._pivotDirection).toBe('function');
    });
    it('returns the expected shape with no rows', () => {
        const result = Suitelet._pivotDirection([], ['2026-04', '2026-05'], null);
        expect(result).toEqual({ lines: [], total: [0, 0], grandTotal: 0 });
    });

    it('extracts createdDate from rows into each line', () => {
        const rows = [
            { cost_group: 'PO 16240', period: '2026-04', amount: 1000, source_id: 16240, source_type: 'po', created_date: '2026-03-15' },
            { cost_group: 'PO 16240', period: '2026-05', amount: 2000, source_id: 16240, source_type: 'po', created_date: '2026-03-15' },
            { cost_group: 'PO 16241', period: '2026-04', amount:  500, source_id: 16241, source_type: 'po', created_date: '2026-04-01' }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04', '2026-05'], null);
        expect(result.lines).toHaveLength(2);
        expect(result.lines.find((l) => l.id === 'PO 16240').createdDate).toBe('2026-03-15');
        expect(result.lines.find((l) => l.id === 'PO 16241').createdDate).toBe('2026-04-01');
    });

    it('emits null createdDate for groups whose rows have no created_date', () => {
        const rows = [
            { cost_group: 'Other Cost', period: '2026-04', amount: 100, source_id: null, source_type: null, created_date: null }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04'], null);
        expect(result.lines[0].createdDate).toBeNull();
    });

    it('orders groups by createdDate DESC NULLS LAST (newest first)', () => {
        const rows = [
            { cost_group: 'Old PO',   period: '2026-04', amount: 100, source_id: 1, source_type: 'po', created_date: '2026-01-10' },
            { cost_group: 'New PO',   period: '2026-04', amount: 200, source_id: 2, source_type: 'po', created_date: '2026-05-20' },
            { cost_group: 'Null PO',  period: '2026-04', amount:  50, source_id: null, source_type: null, created_date: null },
            { cost_group: 'Mid PO',   period: '2026-04', amount:  75, source_id: 3, source_type: 'po', created_date: '2026-03-05' }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04'], null);
        expect(result.lines.map((l) => l.id)).toEqual(['New PO', 'Mid PO', 'Old PO', 'Null PO']);
    });

    it('totals + grandTotal stay correct regardless of order change', () => {
        const rows = [
            { cost_group: 'A', period: '2026-04', amount: 100, source_id: 1, source_type: 'po', created_date: '2026-01-01' },
            { cost_group: 'B', period: '2026-04', amount: 200, source_id: 2, source_type: 'po', created_date: '2026-02-01' },
            { cost_group: 'A', period: '2026-05', amount: 300, source_id: 1, source_type: 'po', created_date: '2026-01-01' }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04', '2026-05'], null);
        expect(result.total).toEqual([300, 300]);
        expect(result.grandTotal).toBe(600);
    });
});

describe('bc_cf_data_sl BC_PROJECT constants (E2)', () => {
    it('exports BC_PROJECT metadata on api', () => {
        expect(Suitelet.BC_PROJECT).toBeDefined();
        expect(Suitelet.BC_PROJECT.rectype).toBe('customrecord_cseg_bc_project');
    });
    it('has the 5 field IDs E2 needs (name/customer/manager/subsidiary/created)', () => {
        const f = Suitelet.BC_PROJECT.fields;
        expect(f.name).toBe('name');
        expect(f.customer).toBe('custrecord_bc_proj_customer');
        expect(f.manager).toBe('custrecord_bc_proj_manager');
        expect(f.subsidiary).toBe('custrecord_bc_proj_subsidiary');
        expect(f.created).toBe('created');
    });
    it('does NOT carry a status field (Active-only toggle uses isinactive instead)', () => {
        expect(Suitelet.BC_PROJECT.fields.status).toBeUndefined();
        expect(Suitelet.BC_PROJECT.statusValues).toBeUndefined();
    });
});

describe('bc_cf_data_sl portfolio option-list SQL constants (E2)', () => {
    it('defines AVAILABLE_PROJECTS_SQL', () => {
        expect(Suitelet.AVAILABLE_PROJECTS_SQL).toBeDefined();
        expect(typeof Suitelet.AVAILABLE_PROJECTS_SQL).toBe('string');
        expect(Suitelet.AVAILABLE_PROJECTS_SQL).toMatch(/customrecord_cseg_bc_project/);
    });
    it('defines AVAILABLE_MANAGERS_SQL', () => {
        expect(Suitelet.AVAILABLE_MANAGERS_SQL).toBeDefined();
        expect(Suitelet.AVAILABLE_MANAGERS_SQL).toMatch(/employee/);
    });
    it('defines AVAILABLE_CUSTOMERS_SQL', () => {
        expect(Suitelet.AVAILABLE_CUSTOMERS_SQL).toBeDefined();
        expect(Suitelet.AVAILABLE_CUSTOMERS_SQL).toMatch(/customer/);
    });
    it('defines AVAILABLE_SUBSIDIARIES_SQL', () => {
        expect(Suitelet.AVAILABLE_SUBSIDIARIES_SQL).toBeDefined();
        expect(Suitelet.AVAILABLE_SUBSIDIARIES_SQL).toMatch(/subsidiary/i);
    });
    it('AVAILABLE_MANAGERS_SQL chains through projects with timing data', () => {
        expect(Suitelet.AVAILABLE_MANAGERS_SQL).toMatch(/EXISTS/);
        expect(Suitelet.AVAILABLE_MANAGERS_SQL).toMatch(/customrecord_bc_revenue_timing_line/);
    });
    it('AVAILABLE_CUSTOMERS_SQL chains through projects with timing data', () => {
        expect(Suitelet.AVAILABLE_CUSTOMERS_SQL).toMatch(/EXISTS/);
    });
    it('AVAILABLE_SUBSIDIARIES_SQL chains through projects with timing data', () => {
        expect(Suitelet.AVAILABLE_SUBSIDIARIES_SQL).toMatch(/EXISTS/);
    });
});

describe('bc_cf_data_sl portfolio action (_loadPortfolio) — first-pass shape (E2)', () => {
    it('exports _loadPortfolio on api', () => {
        expect(typeof Suitelet._loadPortfolio).toBe('function');
    });

    it('returns projects + kpis envelope via dispatch (mocked loader)', () => {
        jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            projects: [
                {
                    id: 1807, name: 'Bolder Construction', createdDate: '2026-03-15',
                    revenue: [7500, 4500], cost: [500, 5526], net: [7000, -1026],
                    revenueTotal: 12000, costTotal: 6026, netTotal: 5974
                }
            ],
            kpis: { totalRevenue: 12000, totalCost: 6026, netCashFlow: 5974, margin: 49.8 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' }
        });
        const req = { method: 'GET', parameters: { action: 'portfolio' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.projects)).toBe(true);
        expect(body.projects[0].id).toBe(1807);
        expect(body.kpis.netCashFlow).toBe(5974);
    });

    it('returns availableBounds, portfolioTotals, availableProjects/managers/customers/subsidiaries', () => {
        jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: ['Apr 2026'],
            projects: [],
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-04' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            portfolioTotals: { revenue: 210000, cost: 158000, net: 52000, margin: 24.8 },
            availableProjects: [{id: 1807, name: 'Bolder'}],
            availableManagers: [{id: 42, name: 'Sarah Chen'}],
            availableCustomers: [{id: 197, name: 'Bolder Construction Inc.'}],
            availableSubsidiaries: [{id: 1, name: 'Main'}]
        });
        const req = { method: 'GET', parameters: { action: 'portfolio' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.availableBounds.minPeriod).toBe('2026-01');
        expect(body.portfolioTotals.revenue).toBe(210000);
        expect(body.availableProjects).toHaveLength(1);
        expect(body.availableManagers[0].name).toBe('Sarah Chen');
    });

    it('returns portfolio chart series + cumulativeBefore', () => {
        jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            projects: [],
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            portfolioTotals: { revenue: 0, cost: 0, net: 0, margin: 0 },
            availableProjects: [], availableManagers: [], availableCustomers: [], availableSubsidiaries: [],
            portfolioRevenuePerPeriod: [12500, 8000],
            portfolioCostPerPeriod:    [4500, 6800],
            portfolioNetPerPeriod:     [8000, 1200],
            cumulativeBefore: 5500
        });
        const req = { method: 'GET', parameters: { action: 'portfolio' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.portfolioRevenuePerPeriod).toEqual([12500, 8000]);
        expect(body.portfolioNetPerPeriod).toEqual([8000, 1200]);
        expect(body.cumulativeBefore).toBe(5500);
    });

    it('rejects malformed IDs CSV with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'portfolio', projects: '1807,abc,2104' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/projects/i);
    });

    it('passes resolved filters to _loadPortfolio', () => {
        const spy = jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: [], projects: [], kpis: {}, range: {}, availableBounds: {}, portfolioTotals: {},
            portfolioRevenuePerPeriod: [], portfolioCostPerPeriod: [], portfolioNetPerPeriod: [], cumulativeBefore: 0,
            availableProjects: [], availableManagers: [], availableCustomers: [], availableSubsidiaries: []
        });
        const req = { method: 'GET', parameters: {
            action: 'portfolio',
            active: '0',
            projects: '1807,2104',
            managers: '42',
            customers: '',
            subsidiaries: '1,2,3'
        } };
        Suitelet.onRequest({ request: req, response: mockResponse() });
        expect(spy).toHaveBeenCalledWith('cash', expect.any(Object), {
            active: false,
            projects: [1807, 2104],
            managers: [42],
            customers: [],
            subsidiaries: [1, 2, 3]
        });
        spy.mockRestore();
    });

    it('defaults active to true when omitted', () => {
        const spy = jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: [], projects: [], kpis: {}, range: {}, availableBounds: {}, portfolioTotals: {},
            portfolioRevenuePerPeriod: [], portfolioCostPerPeriod: [], portfolioNetPerPeriod: [], cumulativeBefore: 0,
            availableProjects: [], availableManagers: [], availableCustomers: [], availableSubsidiaries: []
        });
        Suitelet.onRequest({ request: { method: 'GET', parameters: { action: 'portfolio' } }, response: mockResponse() });
        expect(spy).toHaveBeenCalledWith('cash', expect.any(Object), expect.objectContaining({ active: true }));
        spy.mockRestore();
    });
});

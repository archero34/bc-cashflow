import Suitelet from 'SuiteScripts/BlueCollar/CashFlow/entry_points/bc_timing_data_sl';
import log from 'N/log';
import format from 'N/format';

jest.mock('N/log');
jest.mock('N/format');

beforeEach(() => jest.clearAllMocks());

// ─── Mock helpers ─────────────────────────────────────────────────────────

const mockResponse = () => {
    const res = {
        headers: {},
        body: '',
        setHeader: jest.fn(({ name, value }) => { res.headers[name] = value; }),
        write: jest.fn((str) => { res.body = str; })
    };
    return res;
};

const mockGetRequest = (params = {}) => ({
    method: 'GET',
    parameters: params
});

const mockPostRequest = (body = {}) => ({
    method: 'POST',
    body: JSON.stringify(body)
});

const parseBody = (res) => JSON.parse(res.body);

// ─── GET tests ────────────────────────────────────────────────────────────

describe('bc_timing_data_sl — GET', () => {

    it('returns templates on action=templates', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockGetRequest({ action: 'templates' }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(true);
        expect(body.templates).toBeDefined();
        expect(Array.isArray(body.templates)).toBe(true);
        expect(body.templates.length).toBeGreaterThan(0);
        expect(body.templates[0]).toHaveProperty('id');
        expect(body.templates[0]).toHaveProperty('name');
        expect(body.templates[0]).toHaveProperty('periods');
    });

    it('returns error on unknown GET action', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockGetRequest({ action: 'foobar' }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(false);
        expect(body.error).toContain('Unknown GET action');
    });

    it('returns error when load action missing required params', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockGetRequest({ action: 'load', recordType: 'cost' }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(false);
        expect(body.error).toContain('Missing required params');
    });
});

// ─── POST tests ───────────────────────────────────────────────────────────

describe('bc_timing_data_sl — POST', () => {

    it('returns error on invalid JSON body', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: { method: 'POST', body: 'not json' },
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(false);
        expect(body.error).toContain('Invalid JSON');
    });

    it('returns error on unknown POST action', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockPostRequest({ action: 'unknown' }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(false);
        expect(body.error).toContain('Unknown POST action');
    });

    it('returns error when save action missing required fields', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockPostRequest({ action: 'save', recordType: 'cost' }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(false);
        expect(body.error).toContain('Missing required fields');
    });

    it('validates timing lines via validate action', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockPostRequest({
                action: 'validate',
                lines: [
                    { percentage: 50, amount: 5000 },
                    { percentage: 50, amount: 5000 }
                ],
                sourceAmount: 10000
            }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(true);
        expect(body.validation.valid).toBe(true);
        expect(body.validation.totalPct).toBe(100);
    });

    it('validate detects invalid lines', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockPostRequest({
                action: 'validate',
                lines: [
                    { percentage: 40, amount: 4000 },
                    { percentage: 40, amount: 4000 }
                ],
                sourceAmount: 10000
            }),
            response
        });

        const body = parseBody(response);
        expect(body.success).toBe(true);
        expect(body.validation.valid).toBe(false);
        expect(body.validation.totalPct).toBe(80);
    });

    it('sets Content-Type to application/json on every response', () => {
        const response = mockResponse();
        Suitelet.onRequest({
            request: mockGetRequest({ action: 'templates' }),
            response
        });

        expect(response.setHeader).toHaveBeenCalledWith({
            name: 'Content-Type',
            value: 'application/json'
        });
    });
});

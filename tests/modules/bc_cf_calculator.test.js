import Calc from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator';

describe('bc_cf_calculator', () => {

    describe('weights(distribution, n)', () => {
        it('linear returns array of 1s', () => {
            expect(Calc.weights('linear', 4)).toEqual([1, 1, 1, 1]);
        });

        it('front_loaded returns descending n..1', () => {
            expect(Calc.weights('front_loaded', 4)).toEqual([4, 3, 2, 1]);
        });

        it('back_loaded returns ascending 1..n', () => {
            expect(Calc.weights('back_loaded', 4)).toEqual([1, 2, 3, 4]);
        });

        it('s_curve is symmetric for even n', () => {
            const w = Calc.weights('s_curve', 6);
            expect(w[0]).toBeCloseTo(w[5], 5);
            expect(w[1]).toBeCloseTo(w[4], 5);
            expect(w[2]).toBeCloseTo(w[3], 5);
        });

        it('s_curve middle is heaviest', () => {
            const w = Calc.weights('s_curve', 6);
            expect(w[2]).toBeGreaterThan(w[1]);
            expect(w[2]).toBeGreaterThan(w[0]);
        });
    });

    describe('normalize(weights)', () => {
        it('rescales to percentages summing to 100', () => {
            const p = Calc.normalize([1, 1, 1, 1]);
            expect(p).toEqual([25, 25, 25, 25]);
        });

        it('s_curve n=6 gives 6.70 / 18.30 / 25.00 splits', () => {
            const p = Calc.normalize(Calc.weights('s_curve', 6));
            expect(p[0]).toBeCloseTo(6.70, 2);
            expect(p[1]).toBeCloseTo(18.30, 2);
            expect(p[2]).toBeCloseTo(25.00, 2);
        });
    });

    describe('generate(opts)', () => {
        it('returns n rows with periodDate, label, percentage, amount', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 4,
                interval: 'monthly',
                startDate: new Date(2026, 5, 1),  // Jun 1
                source: 12000,
            });
            expect(rows).toHaveLength(4);
            rows.forEach((r, i) => {
                expect(r).toHaveProperty('periodDate');
                expect(r).toHaveProperty('label', `Period ${i + 1}`);
                expect(typeof r.percentage).toBe('number');
                expect(typeof r.amount).toBe('number');
            });
        });

        it('amounts sum exactly to source (rounding absorber active)', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 7,
                interval: 'monthly',
                startDate: new Date(2026, 5, 15),
                source: 10000,  // forces 100/7 = 14.2857..%
            });
            const sumAmt = rows.reduce((s, r) => s + r.amount, 0);
            expect(sumAmt).toBeCloseTo(10000, 2);
        });

        it('percentages sum exactly to 100.00', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 7,
                interval: 'monthly',
                startDate: new Date(2026, 5, 15),
                source: 10000,
            });
            const sumPct = rows.reduce((s, r) => s + r.percentage, 0);
            expect(Math.round(sumPct * 100) / 100).toBe(100.00);
        });

        it('monthly stepping preserves day-of-month', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 3,
                interval: 'monthly',
                startDate: new Date(2026, 3, 15),  // Apr 15
                source: 3000,
            });
            expect(rows[0].periodDate.getDate()).toBe(15);
            expect(rows[1].periodDate.getMonth()).toBe(4);  // May
            expect(rows[1].periodDate.getDate()).toBe(15);
            expect(rows[2].periodDate.getMonth()).toBe(5);  // Jun
            expect(rows[2].periodDate.getDate()).toBe(15);
        });

        it('bi_weekly stepping adds 14 days', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 3,
                interval: 'bi_weekly',
                startDate: new Date(2026, 5, 1),  // Jun 1
                source: 3000,
            });
            const ms = 24 * 60 * 60 * 1000;
            expect((rows[1].periodDate - rows[0].periodDate) / ms).toBe(14);
            expect((rows[2].periodDate - rows[1].periodDate) / ms).toBe(14);
        });

        it('weekly stepping adds 7 days', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 3,
                interval: 'weekly',
                startDate: new Date(2026, 5, 1),
                source: 3000,
            });
            const ms = 24 * 60 * 60 * 1000;
            expect((rows[1].periodDate - rows[0].periodDate) / ms).toBe(7);
        });
    });

    describe('rebalance(rows, source, lastEditedIndex)', () => {
        it('redistributes overage across non-last-edited rows', () => {
            // Start from the §3.14.8 worked example:
            // Row 3 (index 2) edited from 25% → 33.33%, totals 108.33%
            const rows = [
                { percentage: 6.70,  amount: 1005.00 },
                { percentage: 18.30, amount: 2745.00 },
                { percentage: 33.33, amount: 5000.00 },  // edited
                { percentage: 25.00, amount: 3750.00 },
                { percentage: 18.30, amount: 2745.00 },
                { percentage: 6.70,  amount: 1005.00 },
            ];
            const out = Calc.rebalance(rows, 15000, 2);
            // Row 2 (index 2) untouched
            expect(out[2].percentage).toBeCloseTo(33.33, 2);
            expect(out[2].amount).toBeCloseTo(5000.00, 2);
            // Sum back to 100%
            const sumPct = out.reduce((s, r) => s + r.percentage, 0);
            expect(Math.round(sumPct * 100) / 100).toBe(100.00);
            // Sum amounts back to source
            const sumAmt = out.reduce((s, r) => s + r.amount, 0);
            expect(Math.round(sumAmt * 100) / 100).toBe(15000.00);
        });

        it('handles negative overage (under-allocated) symmetrically', () => {
            // Row 2 edited DOWN: 25% → 10%, totals 85%
            const rows = [
                { percentage: 20, amount: 2000 },
                { percentage: 20, amount: 2000 },
                { percentage: 10, amount: 1000 },  // edited
                { percentage: 20, amount: 2000 },
                { percentage: 15, amount: 1500 },
            ];
            const out = Calc.rebalance(rows, 10000, 2);
            expect(out[2].percentage).toBeCloseTo(10, 2);
            const sumPct = out.reduce((s, r) => s + r.percentage, 0);
            expect(Math.round(sumPct * 100) / 100).toBe(100.00);
        });

        it('floors negatives and redistributes residual', () => {
            // Row 0 edited to 200% on a 4-row grid: rebalance would push others negative
            const rows = [
                { percentage: 200, amount: 8000 },  // edited absurdly
                { percentage: 25,  amount: 1000 },
                { percentage: 25,  amount: 1000 },
                { percentage: 25,  amount: 1000 },
            ];
            const out = Calc.rebalance(rows, 4000, 0);
            expect(out[0].percentage).toBeCloseTo(200, 2);
            // Others should be floored at 0 — can't make total = 100 without touching row 0
            out.slice(1).forEach(r => expect(r.percentage).toBeGreaterThanOrEqual(0));
            // Caller's intent is preserved; UI still warns total > 100%
        });
    });

    describe('computeEndDate(startDate, periods, interval)', () => {
        it('monthly returns start + (n − 1) months', () => {
            const end = Calc.computeEndDate(new Date(2026, 3, 15), 6, 'monthly');
            expect(end.getFullYear()).toBe(2026);
            expect(end.getMonth()).toBe(8);  // September
            expect(end.getDate()).toBe(15);
        });

        it('bi_weekly returns start + (n − 1) × 14 days', () => {
            const end = Calc.computeEndDate(new Date(2026, 5, 1), 4, 'bi_weekly');
            // Jun 1 + 42 days = Jul 13
            expect(end.getMonth()).toBe(6);  // July
            expect(end.getDate()).toBe(13);
        });
    });
});

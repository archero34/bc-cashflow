import Engine from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_engine';
import log from 'N/log';

jest.mock('N/log');

beforeEach(() => jest.clearAllMocks());

describe('bc_timing_engine', () => {

    // ─── generateCustomSpread ─────────────────────────────────────────────────

    describe('generateCustomSpread', () => {
        it('generates lines from custom percentages', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 3, 1),
                sourceAmount: 15000,
                percentages: [20, 30, 15, 15, 20],
                timingType: 1
            });

            expect(lines).toHaveLength(5);
            expect(lines[0].amount).toBe(3000);
            expect(lines[1].amount).toBe(4500);
        });

        it('sets source to Manual (2)', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 0, 1),
                sourceAmount: 10000,
                percentages: [50, 50],
                timingType: 2
            });

            lines.forEach(line => {
                expect(line.source).toBe(2);
            });
        });

        it('amounts sum correctly for reference scenario — Vendor A', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 4, 1),  // May
                sourceAmount: 15000,
                percentages: [20, 30, 15, 15, 20],
                timingType: 1
            });

            const total = lines.reduce((sum, l) => sum + l.amount, 0);
            expect(total).toBe(15000);
            expect(lines[0].amount).toBe(3000);   // May - 20%
            expect(lines[1].amount).toBe(4500);   // Jun - 30%
            expect(lines[2].amount).toBe(2250);   // Jul - 15%
        });
    });

    // ─── validateTimingLines ──────────────────────────────────────────────────

    describe('validateTimingLines', () => {
        it('returns valid for correct 100% lines', () => {
            const lines = [
                { percentage: 50, amount: 5000 },
                { percentage: 50, amount: 5000 }
            ];

            const result = Engine.validateTimingLines(lines, 10000);
            expect(result.valid).toBe(true);
            expect(result.totalPct).toBe(100);
            expect(result.totalAmt).toBe(10000);
            expect(result.difference).toBe(0);
        });

        it('returns invalid when percentages do not sum to 100', () => {
            const lines = [
                { percentage: 40, amount: 4000 },
                { percentage: 40, amount: 4000 }
            ];

            const result = Engine.validateTimingLines(lines, 10000);
            expect(result.valid).toBe(false);
            expect(result.totalPct).toBe(80);
        });

        it('returns invalid when amounts do not match source', () => {
            const lines = [
                { percentage: 50, amount: 5000 },
                { percentage: 50, amount: 4999 }
            ];

            const result = Engine.validateTimingLines(lines, 10000);
            expect(result.valid).toBe(false);
            expect(result.difference).toBe(-1);
        });
    });

    // ─── recalculateAmounts ───────────────────────────────────────────────────

    describe('recalculateAmounts', () => {
        it('proportionally adjusts amounts on source change', () => {
            const lines = [
                { percentage: 25, amount: 2500, cumulativePct: 25, cumulativeAmt: 2500 },
                { percentage: 75, amount: 7500, cumulativePct: 100, cumulativeAmt: 10000 }
            ];

            Engine.recalculateAmounts(lines, 20000);

            expect(lines[0].amount).toBe(5000);
            expect(lines[1].amount).toBe(15000);
            expect(lines[1].cumulativeAmt).toBe(20000);
        });

        it('last line absorbs rounding drift', () => {
            const lines = [
                { percentage: 33.33, amount: 0, cumulativePct: 0, cumulativeAmt: 0 },
                { percentage: 33.33, amount: 0, cumulativePct: 0, cumulativeAmt: 0 },
                { percentage: 33.34, amount: 0, cumulativePct: 0, cumulativeAmt: 0 }
            ];

            Engine.recalculateAmounts(lines, 10000);

            const total = lines.reduce((sum, l) => sum + l.amount, 0);
            expect(total).toBe(10000);
        });
    });

    // ─── recalculateCumulatives ───────────────────────────────────────────────

    describe('recalculateCumulatives', () => {
        it('computes running totals', () => {
            const lines = [
                { percentage: 20, amount: 3000, cumulativePct: 0, cumulativeAmt: 0 },
                { percentage: 30, amount: 4500, cumulativePct: 0, cumulativeAmt: 0 },
                { percentage: 50, amount: 7500, cumulativePct: 0, cumulativeAmt: 0 }
            ];

            Engine.recalculateCumulatives(lines);

            expect(lines[0].cumulativePct).toBe(20);
            expect(lines[0].cumulativeAmt).toBe(3000);
            expect(lines[1].cumulativePct).toBe(50);
            expect(lines[1].cumulativeAmt).toBe(7500);
            expect(lines[2].cumulativePct).toBe(100);
            expect(lines[2].cumulativeAmt).toBe(15000);
        });
    });

    // ─── advanceDate ──────────────────────────────────────────────────────────

    describe('advanceDate', () => {
        it('advances monthly', () => {
            const result = Engine.advanceDate(new Date(2026, 0, 1), 3, 3);
            expect(result.getMonth()).toBe(3);  // April
            expect(result.getFullYear()).toBe(2026);
        });

        it('advances weekly', () => {
            const result = Engine.advanceDate(new Date(2026, 0, 1), 1, 2);
            expect(result.getDate()).toBe(15);  // Jan 1 + 14 days
        });

        it('advances biweekly', () => {
            const result = Engine.advanceDate(new Date(2026, 0, 1), 2, 1);
            expect(result.getDate()).toBe(15);  // Jan 1 + 14 days
        });

        it('does not mutate original date', () => {
            const original = new Date(2026, 0, 1);
            const originalTime = original.getTime();
            Engine.advanceDate(original, 3, 6);
            expect(original.getTime()).toBe(originalTime);
        });
    });

    // ─── Reference Scenario Integration ───────────────────────────────────────

    describe('Reference Scenario — Data Airflow Demo', () => {
        it('Base Bid $30K: 25/15/25/15/10/10 spread', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 3, 1),  // April
                sourceAmount: 30000,
                percentages: [25, 15, 25, 15, 10, 10],
                timingType: 1
            });

            expect(lines[0].amount).toBe(7500);   // Apr
            expect(lines[1].amount).toBe(4500);   // May
            expect(lines[2].amount).toBe(7500);   // Jun
            expect(lines[3].amount).toBe(4500);   // Jul
            expect(lines[4].amount).toBe(3000);   // Aug (but scenario says Sep)
            expect(lines[5].amount).toBe(3000);   // Sep (but scenario says Nov)
            expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(30000);
        });

        it('Vendor A $15K: 20/30/15/15/20 spread', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 4, 1),  // May
                sourceAmount: 15000,
                percentages: [20, 30, 15, 15, 20],
                timingType: 1
            });

            expect(lines[0].amount).toBe(3000);   // May
            expect(lines[1].amount).toBe(4500);   // Jun
            expect(lines[2].amount).toBe(2250);   // Jul
            expect(lines[3].amount).toBe(2250);   // Aug (scenario: Oct)
            expect(lines[4].amount).toBe(3000);   // Sep (scenario: Dec)
            expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(15000);
        });

        it('CO Revenue $12K: 20/30/50 spread', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 6, 1),  // July
                sourceAmount: 12000,
                percentages: [20, 30, 50],
                timingType: 1
            });

            expect(lines[0].amount).toBe(2400);
            expect(lines[1].amount).toBe(3600);
            expect(lines[2].amount).toBe(6000);
            expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(12000);
        });

        it('CO Cost $10K: 20/30/50 spread', () => {
            const lines = Engine.generateCustomSpread({
                startDate: new Date(2026, 6, 1),
                sourceAmount: 10000,
                percentages: [20, 30, 50],
                timingType: 1
            });

            expect(lines[0].amount).toBe(2000);
            expect(lines[1].amount).toBe(3000);
            expect(lines[2].amount).toBe(5000);
            expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(10000);
        });

        it('Total revenue = $42K, total cost = $33K, net = $9K', () => {
            const rev1 = Engine.generateCustomSpread({
                startDate: new Date(2026, 3, 1), sourceAmount: 30000,
                percentages: [25, 15, 25, 15, 10, 10], timingType: 1
            });
            const rev2 = Engine.generateCustomSpread({
                startDate: new Date(2026, 6, 1), sourceAmount: 12000,
                percentages: [20, 30, 50], timingType: 1
            });
            const cost1 = Engine.generateCustomSpread({
                startDate: new Date(2026, 4, 1), sourceAmount: 15000,
                percentages: [20, 30, 15, 15, 20], timingType: 1
            });
            const cost2 = Engine.generateCustomSpread({
                startDate: new Date(2026, 3, 1), sourceAmount: 8000,
                percentages: [50, 50], timingType: 1
            });
            const cost3 = Engine.generateCustomSpread({
                startDate: new Date(2026, 6, 1), sourceAmount: 10000,
                percentages: [20, 30, 50], timingType: 1
            });

            const totalRevenue = [...rev1, ...rev2].reduce((s, l) => s + l.amount, 0);
            const totalCost = [...cost1, ...cost2, ...cost3].reduce((s, l) => s + l.amount, 0);

            expect(totalRevenue).toBe(42000);
            expect(totalCost).toBe(33000);
            expect(totalRevenue - totalCost).toBe(9000);
        });
    });
});

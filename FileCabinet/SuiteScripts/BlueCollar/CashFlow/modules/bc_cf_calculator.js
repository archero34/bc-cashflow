/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Pure-function schedule calculator for BC Cash Flow.
 * No I/O, no DOM, no `N/` imports — fully unit-testable in node.
 * Spec: §3.14 of the redesign design doc.
 */
define([], function () {

    const round2 = (n) => Math.round(n * 100) / 100;

    /**
     * Per-period weight before normalization. Spec §3.14.2.
     */
    const weights = (distribution, n) => {
        const w = new Array(n);
        for (let i = 1; i <= n; i++) {
            switch (distribution) {
                case 'linear':
                    w[i - 1] = 1;
                    break;
                case 's_curve':
                    w[i - 1] = Math.sin(Math.PI * (i - 0.5) / n);
                    break;
                case 'front_loaded':
                    w[i - 1] = n - i + 1;
                    break;
                case 'back_loaded':
                    w[i - 1] = i;
                    break;
                default:
                    throw new Error(`Unknown distribution: ${distribution}`);
            }
        }
        return w;
    };

    /**
     * Normalize a weight array to a percentage array summing to 100.
     * Last entry absorbs rounding so Σ = 100.00 exactly.
     */
    const normalize = (w) => {
        const total = w.reduce((s, x) => s + x, 0);
        const p = w.map(x => round2(x / total * 100));
        const drift = round2(100 - p.reduce((s, x) => s + x, 0));
        p[p.length - 1] = round2(p[p.length - 1] + drift);
        return p;
    };

    /**
     * Compute period dates from a start date + interval + count.
     * Monthly stepping uses Date.setMonth which OVERFLOWS for short months —
     * e.g. Jan 31 + 1 month = Mar 3 (not Feb 28). Use a start date within the
     * first 28 days of the month if strict same-day-of-month alignment matters.
     */
    const computeDates = (startDate, n, interval) => {
        if (interval !== 'monthly' && interval !== 'bi_weekly' && interval !== 'weekly') {
            throw new Error(`Unknown interval: ${interval}`);
        }
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            if (interval === 'monthly') {
                const d = new Date(startDate);
                d.setMonth(d.getMonth() + i);
                out[i] = d;
            } else {
                const days = interval === 'weekly' ? 7 : 14;
                const d = new Date(startDate);
                d.setDate(d.getDate() + i * days);
                out[i] = d;
            }
        }
        return out;
    };

    const computeEndDate = (startDate, n, interval) => {
        return computeDates(startDate, n, interval)[n - 1];
    };

    /**
     * Generate row data for the grid. Spec §3.14.3.
     * @param {Object} opts
     * @param {'linear'|'s_curve'|'front_loaded'|'back_loaded'} opts.distribution
     * @param {number} opts.periods
     * @param {'monthly'|'bi_weekly'|'weekly'} opts.interval
     * @param {Date} opts.startDate
     * @param {number} opts.source
     * @returns {Array<{periodDate: Date, label: string, percentage: number, amount: number}>}
     */
    const generate = ({ distribution, periods, interval, startDate, source }) => {
        const w = weights(distribution, periods);
        const p = normalize(w);
        const dates = computeDates(startDate, periods, interval);
        const rows = p.map((pct, i) => ({
            periodDate: dates[i],
            label: `Period ${i + 1}`,
            percentage: pct,
            amount: round2(source * pct / 100),
        }));
        // Last-row amount absorber (handle currency rounding leak)
        const sumAmt = rows.reduce((s, r) => s + r.amount, 0);
        const amtDrift = round2(source - sumAmt);
        if (amtDrift !== 0) {
            rows[rows.length - 1].amount = round2(rows[rows.length - 1].amount + amtDrift);
        }
        return rows;
    };

    /**
     * Redistribute excess proportionally across all rows except `lastEditedIndex`.
     * Spec §3.14.8. Pure function — returns a NEW rows array (does not mutate input).
     */
    const rebalance = (rows, source, lastEditedIndex) => {
        const out = rows.map(r => ({ ...r }));
        const excess = round2(out.reduce((s, r) => s + r.percentage, 0) - 100);
        if (Math.abs(excess) < 0.01) return out;  // already balanced

        const targets = out.map((_, i) => i).filter(i => i !== lastEditedIndex);
        const sumTarget = targets.reduce((s, i) => s + out[i].percentage, 0);

        if (sumTarget > 0) {
            targets.forEach(i => {
                out[i].percentage = round2(out[i].percentage - (out[i].percentage / sumTarget) * excess);
                if (out[i].percentage < 0) out[i].percentage = 0;
            });
            // Re-derive amounts
            targets.forEach(i => {
                out[i].amount = round2(source * out[i].percentage / 100);
            });
            // Last-target absorber so Σ = 100 exactly.
            // Skip when all targets were floored to 0 (over-allocation edge case):
            // applying a negative drift would push the last target below 0, which
            // is worse than leaving total > 100% (UI shows the warn badge instead).
            const lastTarget = targets[targets.length - 1];
            const sumPct = out.reduce((s, r) => s + r.percentage, 0);
            const pctDrift = round2(100 - sumPct);
            const adjustedPct = round2(out[lastTarget].percentage + pctDrift);
            if (adjustedPct >= 0) {
                out[lastTarget].percentage = adjustedPct;
                const sumAmt = out.reduce((s, r) => s + r.amount, 0);
                const amtDrift = round2(source - sumAmt);
                out[lastTarget].amount = round2(out[lastTarget].amount + amtDrift);
            }
        }
        return out;
    };

    return { weights, normalize, computeDates, computeEndDate, generate, rebalance };
});

/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Template application engine for BC Cash Flow timing Suitelets.
 *              Converts template percentage patterns into concrete timing lines
 *              with period dates, dollar amounts, and cumulative totals.
 */
define(['N/log', './bc_timing_constants'], (log, Constants) => {

    const { BUILT_IN_TEMPLATES, SOURCE, PERIOD_INTERVAL } = Constants;

    const LOG_TITLE = 'BC_TimingEngine';

    // ─── Date Helpers ───────────────────────────────────────────────────────────

    /**
     * Advance a date by N periods of the given interval.
     * @param {Date}   date       - base date (not mutated)
     * @param {number} intervalId - 1 = Weekly, 2 = Bi-Weekly, 3 = Monthly
     * @param {number} periods    - number of intervals to advance
     * @returns {Date}
     */
    const advanceDate = (date, intervalId, periods) => {
        const d = new Date(date.getTime());

        switch (intervalId) {
            case PERIOD_INTERVAL.WEEKLY.id:
                d.setDate(d.getDate() + (7 * periods));
                break;

            case PERIOD_INTERVAL.BIWEEKLY.id:
                d.setDate(d.getDate() + (14 * periods));
                break;

            case PERIOD_INTERVAL.MONTHLY.id:
            default:
                d.setMonth(d.getMonth() + periods);
                break;
        }

        return d;
    };

    // ─── Rounding ───────────────────────────────────────────────────────────────

    /**
     * Round to 2 decimal places using banker-friendly rounding.
     * @param {number} value
     * @returns {number}
     */
    const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

    // ─── Cumulative Recalculation ───────────────────────────────────────────────

    /**
     * Recompute cumulativePct and cumulativeAmt on every line in-place.
     * @param {Object[]} lines - timing line objects
     * @returns {Object[]} the same array (mutated)
     */
    const recalculateCumulatives = (lines) => {
        let runningPct = 0;
        let runningAmt = 0;

        lines.forEach((line) => {
            runningPct = round2(runningPct + line.percentage);
            runningAmt = round2(runningAmt + line.amount);
            line.cumulativePct = runningPct;
            line.cumulativeAmt = runningAmt;
        });

        return lines;
    };

    // ─── Build Lines from Percentage Array ──────────────────────────────────────

    /**
     * Internal: turn an array of { periodNumber, percentage } into timing lines.
     * Handles date advancement, dollar computation, and rounding adjustment on
     * the last line so the total equals sourceAmount exactly.
     *
     * @param {Object}   opts
     * @param {Object[]} opts.periods      - [{ periodNumber, percentage }]
     * @param {Date}     opts.startDate
     * @param {number}   opts.sourceAmount
     * @param {number}   opts.intervalId   - PERIOD_INTERVAL id
     * @param {number}   opts.sourceId     - SOURCE id
     * @param {string}   [opts.templateName]
     * @returns {Object[]}
     */
    const buildLines = ({ periods, startDate, sourceAmount, intervalId, sourceId, templateName }) => {
        let allocated = 0;

        const lines = periods.map((p, idx) => {
            const periodDate = advanceDate(startDate, intervalId, idx);
            const isLast = idx === periods.length - 1;

            let amount = round2((p.percentage / 100) * sourceAmount);

            // On the final line, correct for any rounding drift
            if (isLast) {
                amount = round2(sourceAmount - allocated);
            }

            allocated = round2(allocated + amount);

            return {
                periodDate,
                percentage: p.percentage,
                amount,
                cumulativePct: 0,  // filled by recalculateCumulatives
                cumulativeAmt: 0,
                label: `Period ${p.periodNumber}${templateName ? ` (${templateName})` : ''}`,
                source: sourceId
            };
        });

        recalculateCumulatives(lines);
        return lines;
    };

    // ─── Core Public API ────────────────────────────────────────────────────────

    /**
     * Apply a built-in template to produce timing lines.
     *
     * @param {Object} options
     * @param {string} options.templateId   - e.g. 'even_6', 'front_loaded_6'
     * @param {Date}   options.startDate    - first period date
     * @param {number} options.sourceAmount - total dollars to spread
     * @param {number} options.timingType   - 1 (Cash Flow) or 2 (Accrual)
     * @returns {Object[]} timing line array
     * @throws {Error} if templateId is not found
     */
    const applyTemplate = ({ templateId, startDate, sourceAmount, timingType }) => {
        const template = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
        if (!template) {
            throw new Error(`${LOG_TITLE} | applyTemplate: template "${templateId}" not found`);
        }

        log.debug(LOG_TITLE, `Applying template "${template.name}" | amount=${sourceAmount} | type=${timingType}`);

        return buildLines({
            periods:      template.periods,
            startDate,
            sourceAmount,
            intervalId:   template.interval,
            sourceId:     SOURCE.TEMPLATE.id,
            templateName: template.name
        });
    };

    /**
     * Generate timing lines from a manual array of percentages.
     *
     * @param {Object}   options
     * @param {Date}     options.startDate    - first period date
     * @param {number}   options.sourceAmount - total dollars to spread
     * @param {number[]} options.percentages  - e.g. [20, 30, 50]
     * @param {number}   options.timingType   - 1 (Cash Flow) or 2 (Accrual)
     * @returns {Object[]} timing line array
     */
    const generateCustomSpread = ({ startDate, sourceAmount, percentages, timingType }) => {
        const periods = percentages.map((pct, idx) => ({
            periodNumber: idx + 1,
            percentage: pct
        }));

        log.debug(LOG_TITLE, `Custom spread | ${percentages.length} periods | amount=${sourceAmount} | type=${timingType}`);

        return buildLines({
            periods,
            startDate,
            sourceAmount,
            intervalId:   PERIOD_INTERVAL.MONTHLY.id,
            sourceId:     SOURCE.MANUAL.id,
            templateName: null
        });
    };

    // ─── Validation ─────────────────────────────────────────────────────────────

    /**
     * Validate that timing lines total to 100% and sourceAmount.
     *
     * @param {Object[]} lines        - timing line array
     * @param {number}   sourceAmount - expected total
     * @returns {{ valid: boolean, totalPct: number, totalAmt: number, difference: number }}
     */
    const validateTimingLines = (lines, sourceAmount) => {
        const totalPct = round2(lines.reduce((sum, l) => sum + l.percentage, 0));
        const totalAmt = round2(lines.reduce((sum, l) => sum + l.amount, 0));
        const difference = round2(totalAmt - sourceAmount);

        return {
            valid: totalPct === 100 && difference === 0,
            totalPct,
            totalAmt,
            difference
        };
    };

    // ─── Recalculation ──────────────────────────────────────────────────────────

    /**
     * Proportionally recalculate amounts when the source amount changes.
     * Percentages are preserved; only dollar values and cumulatives update.
     * The last line absorbs rounding so the total matches newSourceAmount exactly.
     *
     * @param {Object[]} lines           - timing line array (mutated in place)
     * @param {number}   newSourceAmount - updated total
     * @returns {Object[]} the same array (mutated)
     */
    const recalculateAmounts = (lines, newSourceAmount) => {
        let allocated = 0;

        lines.forEach((line, idx) => {
            const isLast = idx === lines.length - 1;

            if (isLast) {
                line.amount = round2(newSourceAmount - allocated);
            } else {
                line.amount = round2((line.percentage / 100) * newSourceAmount);
            }

            allocated = round2(allocated + line.amount);
        });

        recalculateCumulatives(lines);
        return lines;
    };

    // ─── Module Return ──────────────────────────────────────────────────────────

    return {
        applyTemplate,
        generateCustomSpread,
        validateTimingLines,
        recalculateAmounts,
        recalculateCumulatives,
        advanceDate
    };
});

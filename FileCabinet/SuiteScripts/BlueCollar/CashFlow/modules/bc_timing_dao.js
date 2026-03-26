/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Data Access Object for all timing CRUD operations.
 *              Handles cost and revenue timing lines via SuiteQL for reads
 *              and N/record for writes. Single point of data access for
 *              the BC Cash Flow Forecasting suite.
 */
define([
    'N/record',
    'N/query',
    'N/log',
    './bc_timing_constants'
], (record, query, log, Constants) => {

    const { RECORDS, CTL_FIELDS, RTL_FIELDS, CR_BILLING_FIELDS, CR_BUDGET_FIELDS } = Constants;

    const MODULE = 'bc_timing_dao';

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Resolve record type string and field map from a 'cost' | 'revenue' key.
     * @param {string} recordType - 'cost' or 'revenue'
     * @returns {{ recType: string, fields: Object, prefix: string }}
     */
    const resolveRecordMeta = (recordType) => {
        if (recordType === 'cost') {
            return { recType: RECORDS.COST_TIMING_LINE, fields: CTL_FIELDS, prefix: 'ctl' };
        }
        if (recordType === 'revenue') {
            return { recType: RECORDS.REVENUE_TIMING_LINE, fields: RTL_FIELDS, prefix: 'rtl' };
        }
        throw new Error(`Unknown recordType "${recordType}". Expected "cost" or "revenue".`);
    };

    /**
     * Execute a SuiteQL query and return result rows as plain objects.
     * @param {string} sql
     * @param {Array} params
     * @returns {Array<Object>}
     */
    const runSQL = (sql, params = []) => {
        const resultSet = query.runSuiteQL({ query: sql, params });
        return resultSet.asMappedResults() || [];
    };

    // ─── 1. loadTimingLines ─────────────────────────────────────────────────────

    /**
     * Load timing lines for a transaction using SuiteQL.
     *
     * @param {Object} options
     * @param {string} options.recordType    - 'cost' or 'revenue'
     * @param {number} options.transactionId - Internal ID of the parent transaction
     * @param {number} [options.projectId]   - Optional project filter
     * @param {number} options.timingType    - Timing type list value (1=Cash Flow, 2=Accrual)
     * @param {number} [options.sourceGroup] - Optional source group filter
     * @returns {Array<Object>} Plain objects representing each timing line
     */
    const loadTimingLines = (options) => {
        const funcName = `${MODULE}.loadTimingLines`;
        try {
            const { recordType, transactionId, projectId, timingType, sourceGroup } = options;
            const { recType, fields } = resolveRecordMeta(recordType);

            const conditions = [];
            const params = [];

            conditions.push(`${fields.TRANSACTION} = ?`);
            params.push(transactionId);

            conditions.push(`${fields.TIMING_TYPE} = ?`);
            params.push(timingType);

            if (projectId) {
                conditions.push(`${fields.PROJECT} = ?`);
                params.push(projectId);
            }
            if (sourceGroup) {
                conditions.push(`${fields.SOURCE_GROUP} = ?`);
                params.push(sourceGroup);
            }

            // Alias columns to camelCase names expected by the UI module
            const selectCols = [
                'id',
                `${fields.PERIOD_DATE} AS perioddate`,
                `${fields.PERCENTAGE} AS percentage`,
                `${fields.AMOUNT} AS amount`,
                `${fields.CUMULATIVE_PCT} AS cumulativepct`,
                `${fields.CUMULATIVE_AMT} AS cumulativeamt`,
                `${fields.LABEL} AS label`,
                `${fields.SOURCE} AS source`,
                `${fields.SOURCE_GROUP} AS sourcegroup`,
                `${fields.TIMING_TYPE} AS timingtype`
            ];

            if (recordType === 'cost') {
                selectCols.push(
                    `${fields.COST_CODE} AS costcode`,
                    `${fields.COST_TYPE} AS costtype`,
                    `${fields.CHANGE_ORDER} AS changeorder`
                );
            }
            if (recordType === 'revenue') {
                selectCols.push(`${fields.CHANGE_ORDER} AS changeorder`);
            }

            const sql = `
                SELECT ${selectCols.join(', ')}
                FROM ${recType}
                WHERE ${conditions.join(' AND ')}
                ORDER BY ${fields.PERIOD_DATE}
            `;

            log.debug({ title: funcName, details: `SQL: ${sql} | params: ${JSON.stringify(params)}` });

            // Map SuiteQL results to camelCase for UI compatibility.
            // PERCENT fields return decimals via SuiteQL (0.5 = 50%) — multiply by 100.
            // Recalculate cumulatives on load rather than trusting stored values.
            const rows = runSQL(sql, params);
            let runPct = 0;
            let runAmt = 0;
            return rows.map((r) => {
                const pct = Math.round((r.percentage || 0) * 100 * 100) / 100;
                const amt = r.amount || 0;
                runPct = Math.round((runPct + pct) * 100) / 100;
                runAmt = Math.round((runAmt + amt) * 100) / 100;
                return {
                id: r.id,
                periodDate: r.perioddate,
                percentage: pct,
                amount: amt,
                cumulativePct: runPct,
                cumulativeAmt: runAmt,
                label: r.label,
                source: r.source,
                sourceGroup: r.sourcegroup,
                timingType: r.timingtype,
                costCode: r.costcode || null,
                costType: r.costtype || null,
                changeOrder: r.changeorder || null
            };
            });

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            throw e;
        }
    };

    // ─── 2. saveTimingLines ─────────────────────────────────────────────────────

    /**
     * Save timing lines — create new, update existing, delete removed.
     *
     * @param {Object} options
     * @param {string} options.recordType    - 'cost' or 'revenue'
     * @param {number} options.transactionId - Internal ID of the parent transaction
     * @param {number} options.projectId     - Internal ID of the project
     * @param {Array}  options.lines         - Array of line objects to save
     * @param {number} options.timingType    - Timing type list value
     * @param {number} options.sourceGroup   - Source group list value
     * @param {number} [options.changeOrderId] - Optional change order ID
     * @returns {{ created: number, updated: number, deleted: number }}
     */
    const saveTimingLines = (options) => {
        const funcName = `${MODULE}.saveTimingLines`;
        try {
            const { recordType, transactionId, projectId, lines, timingType, sourceGroup, changeOrderId } = options;
            const { recType, fields } = resolveRecordMeta(recordType);

            const counts = { created: 0, updated: 0, deleted: 0 };

            // Build a set of IDs being saved so we can detect deletions
            const incomingIds = new Set();
            for (const line of lines) {
                if (line.id) incomingIds.add(Number(line.id));
            }

            // Load existing lines to find ones that were removed
            const existingLines = loadTimingLines({
                recordType,
                transactionId,
                timingType,
                sourceGroup
            });

            // Delete lines that exist in the DB but are not in the incoming payload
            for (const existing of existingLines) {
                if (!incomingIds.has(Number(existing.id))) {
                    record.delete({ type: recType, id: existing.id });
                    counts.deleted++;
                }
            }

            // Create or update each incoming line
            for (const line of lines) {
                let rec;

                if (!line.id) {
                    // ── Create ──
                    rec = record.create({ type: recType, isDynamic: false });
                    rec.setValue({ fieldId: fields.TRANSACTION, value: transactionId });
                    rec.setValue({ fieldId: fields.PROJECT, value: projectId });
                    rec.setValue({ fieldId: fields.TIMING_TYPE, value: timingType });
                    rec.setValue({ fieldId: fields.SOURCE_GROUP, value: sourceGroup });

                    if (changeOrderId) {
                        rec.setValue({ fieldId: fields.CHANGE_ORDER, value: changeOrderId });
                    }
                } else {
                    // ── Update ──
                    rec = record.load({ type: recType, id: line.id, isDynamic: false });
                }

                // Set common field values
                if (line.periodDate) {
                    rec.setValue({ fieldId: fields.PERIOD_DATE, value: line.periodDate });
                }
                if (line.percentage != null) {
                    rec.setValue({ fieldId: fields.PERCENTAGE, value: line.percentage });
                }
                if (line.amount != null) {
                    rec.setValue({ fieldId: fields.AMOUNT, value: line.amount });
                }
                if (line.cumulativePct != null) {
                    rec.setValue({ fieldId: fields.CUMULATIVE_PCT, value: line.cumulativePct });
                }
                if (line.cumulativeAmt != null) {
                    rec.setValue({ fieldId: fields.CUMULATIVE_AMT, value: line.cumulativeAmt });
                }
                if (line.label) {
                    rec.setValue({ fieldId: fields.LABEL, value: line.label });
                }
                if (line.source != null) {
                    rec.setValue({ fieldId: fields.SOURCE, value: line.source });
                }

                // Cost-specific fields
                if (recordType === 'cost') {
                    if (line.costCode) {
                        rec.setValue({ fieldId: fields.COST_CODE, value: line.costCode });
                    }
                    if (line.costType) {
                        rec.setValue({ fieldId: fields.COST_TYPE, value: line.costType });
                    }
                }

                const savedId = rec.save({ enableSourcing: false, ignoreMandatoryFields: false });

                if (!line.id) {
                    counts.created++;
                    log.audit({ title: funcName, details: `Created ${recType} id=${savedId}` });
                } else {
                    counts.updated++;
                    log.audit({ title: funcName, details: `Updated ${recType} id=${savedId}` });
                }
            }

            log.audit({ title: funcName, details: `Save complete: ${JSON.stringify(counts)}` });
            return counts;

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            throw e;
        }
    };

    // ─── 3. deleteTimingLines ───────────────────────────────────────────────────

    /**
     * Delete ALL timing lines for a given transaction + timing type.
     *
     * @param {Object} options
     * @param {string} options.recordType    - 'cost' or 'revenue'
     * @param {number} options.transactionId - Internal ID of the parent transaction
     * @param {number} options.timingType    - Timing type list value
     * @returns {number} Count of deleted records
     */
    const deleteTimingLines = (options) => {
        const funcName = `${MODULE}.deleteTimingLines`;
        try {
            const { recordType, transactionId, timingType } = options;
            const { recType, fields } = resolveRecordMeta(recordType);

            const sql = `
                SELECT id
                FROM ${recType}
                WHERE ${fields.TRANSACTION} = ?
                  AND ${fields.TIMING_TYPE} = ?
            `;

            const rows = runSQL(sql, [transactionId, timingType]);
            let deleted = 0;

            for (const row of rows) {
                record.delete({ type: recType, id: row.id });
                deleted++;
            }

            log.audit({ title: funcName, details: `Deleted ${deleted} ${recType} lines for txn ${transactionId}` });
            return deleted;

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            throw e;
        }
    };

    // ─── 4. getTransactionInfo ──────────────────────────────────────────────────

    /**
     * Get PO or SO header information.
     *
     * @param {number} transactionId - Internal ID of the transaction
     * @returns {Object|null} { id, tranid, entityName, totalAmount, status, memo }
     */
    const getTransactionInfo = (transactionId) => {
        const funcName = `${MODULE}.getTransactionInfo`;
        try {
            const sql = `
                SELECT
                    t.id,
                    t.tranid,
                    NVL(e.entitytitle, e.entityid) AS entityname,
                    t.foreigntotal AS totalamount,
                    t.status,
                    t.memo
                FROM transaction t
                LEFT JOIN entity e ON e.id = t.entity
                WHERE t.id = ?
            `;

            const rows = runSQL(sql, [transactionId]);

            if (!rows.length) {
                log.debug({ title: funcName, details: `No transaction found for id=${transactionId}` });
                return null;
            }

            const row = rows[0];
            return {
                id: row.id,
                tranid: row.tranid,
                entityName: row.entityname,
                totalAmount: row.totalamount,
                status: row.status,
                memo: row.memo
            };

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            throw e;
        }
    };

    // ─── 5. getChangeRequestInfo ────────────────────────────────────────────────

    /**
     * Get Change Order header + billing total + budget items.
     *
     * @param {number} changeRequestId - Internal ID of the change request
     * @returns {Object|null} { name, status, billingTotal, budgetItems }
     */
    const getChangeRequestInfo = (changeRequestId) => {
        const funcName = `${MODULE}.getChangeRequestInfo`;
        try {
            // ── Header ──
            const headerSql = `
                SELECT id, custrecord_bc_change_order_number AS name, custrecord_bc_request_status AS status
                FROM ${RECORDS.CHANGE_REQ}
                WHERE id = ?
            `;
            const headerRows = runSQL(headerSql, [changeRequestId]);

            if (!headerRows.length) {
                log.debug({ title: funcName, details: `No change request found for id=${changeRequestId}` });
                return null;
            }

            const header = headerRows[0];

            // ── Billing total ──
            const billingSql = `
                SELECT NVL(SUM(${CR_BILLING_FIELDS.AMOUNT}), 0) AS billingtotal
                FROM ${RECORDS.CHANGE_REQ_BILLING}
                WHERE ${CR_BILLING_FIELDS.PARENT_REQUEST} = ?
            `;
            const billingRows = runSQL(billingSql, [changeRequestId]);
            const billingTotal = billingRows.length ? Number(billingRows[0].billingtotal) : 0;

            // ── Budget items grouped by cost code + cost type ──
            const budgetSql = `
                SELECT
                    b.${CR_BUDGET_FIELDS.COST_CODE} AS costcode,
                    cc.name AS costcodename,
                    b.${CR_BUDGET_FIELDS.COST_TYPE} AS costtype,
                    ct.acctname AS costtypename,
                    NVL(SUM(b.${CR_BUDGET_FIELDS.PROPOSED_CHANGE}), 0) AS amount
                FROM ${RECORDS.CHANGE_REQ_BUDGET} b
                LEFT JOIN ${RECORDS.COST_CODE} cc ON cc.id = b.${CR_BUDGET_FIELDS.COST_CODE}
                LEFT JOIN account ct ON ct.id = b.${CR_BUDGET_FIELDS.COST_TYPE}
                WHERE b.${CR_BUDGET_FIELDS.PARENT} = ?
                GROUP BY
                    b.${CR_BUDGET_FIELDS.COST_CODE},
                    cc.name,
                    b.${CR_BUDGET_FIELDS.COST_TYPE},
                    ct.acctname
            `;
            const budgetRows = runSQL(budgetSql, [changeRequestId]);

            const budgetItems = budgetRows.map((r) => ({
                costCode: r.costcode,
                costCodeName: r.costcodename,
                costType: r.costtype,
                costTypeName: r.costtypename,
                amount: Number(r.amount)
            }));

            return {
                name: header.name,
                status: header.status,
                billingTotal,
                budgetItems
            };

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            throw e;
        }
    };

    // ─── 6. getProjectTimingData ────────────────────────────────────────────────

    /**
     * Get ALL timing data for a project across both cost and revenue lines.
     * Uses UNION ALL for a single combined result set.
     *
     * @param {number} projectId   - Internal ID of the project
     * @param {number} timingType  - Timing type list value (1=Cash Flow, 2=Accrual)
     * @returns {Array<Object>} Rows with flow_direction, cost_group, period, amount
     */
    const getProjectTimingData = (projectId, timingType) => {
        const funcName = `${MODULE}.getProjectTimingData`;
        try {
            const sql = `
                SELECT
                    combined.flow_direction,
                    combined.cost_group,
                    TO_CHAR(combined.period_date, 'YYYY-MM') AS period,
                    SUM(combined.amount) AS amount
                FROM (
                    SELECT
                        'Cost' AS flow_direction,
                        CASE
                            WHEN ctl.${CTL_FIELDS.CHANGE_ORDER} IS NOT NULL
                                THEN 'CO: ' || NVL(cr.name, 'Change Order ' || ctl.${CTL_FIELDS.CHANGE_ORDER})
                            WHEN ctl.${CTL_FIELDS.SOURCE_GROUP} = ${Constants.SOURCE_GROUP.BASE_PO.id}
                                THEN 'PO: ' || NVL(NVL(e.entitytitle, e.entityid), 'Vendor ' || t.entity)
                            ELSE 'Base Bid'
                        END AS cost_group,
                        ctl.${CTL_FIELDS.PERIOD_DATE} AS period_date,
                        NVL(ctl.${CTL_FIELDS.AMOUNT}, 0) AS amount
                    FROM ${RECORDS.COST_TIMING_LINE} ctl
                    LEFT JOIN transaction t ON t.id = ctl.${CTL_FIELDS.TRANSACTION}
                    LEFT JOIN entity e ON e.id = t.entity
                    LEFT JOIN ${RECORDS.CHANGE_REQ} cr ON cr.id = ctl.${CTL_FIELDS.CHANGE_ORDER}
                    WHERE ctl.${CTL_FIELDS.PROJECT} = ?
                      AND ctl.${CTL_FIELDS.TIMING_TYPE} = ?

                    UNION ALL

                    SELECT
                        'Revenue' AS flow_direction,
                        CASE
                            WHEN rtl.${RTL_FIELDS.CHANGE_ORDER} IS NOT NULL
                                THEN 'CO: ' || NVL(cr.name, 'Change Order ' || rtl.${RTL_FIELDS.CHANGE_ORDER})
                            WHEN rtl.${RTL_FIELDS.SOURCE_GROUP} = ${Constants.SOURCE_GROUP.BASE_CONTRACT.id}
                                THEN 'Base Contract'
                            ELSE 'Revenue'
                        END AS cost_group,
                        rtl.${RTL_FIELDS.PERIOD_DATE} AS period_date,
                        NVL(rtl.${RTL_FIELDS.AMOUNT}, 0) AS amount
                    FROM ${RECORDS.REVENUE_TIMING_LINE} rtl
                    LEFT JOIN ${RECORDS.CHANGE_REQ} cr ON cr.id = rtl.${RTL_FIELDS.CHANGE_ORDER}
                    WHERE rtl.${RTL_FIELDS.PROJECT} = ?
                      AND rtl.${RTL_FIELDS.TIMING_TYPE} = ?
                ) combined
                GROUP BY combined.flow_direction, combined.cost_group, TO_CHAR(combined.period_date, 'YYYY-MM')
                ORDER BY combined.flow_direction, combined.cost_group, period
            `;

            const params = [projectId, timingType, projectId, timingType];

            log.debug({ title: funcName, details: `Loading project timing data for project=${projectId}, type=${timingType}` });

            const rows = runSQL(sql, params);

            return rows.map((r) => ({
                flowDirection: r.flow_direction,
                costGroup: r.cost_group,
                period: r.period,
                amount: Number(r.amount)
            }));

        } catch (e) {
            log.error({ title: funcName, details: e.message || JSON.stringify(e) });
            throw e;
        }
    };

    // ─── Public API ─────────────────────────────────────────────────────────────

    return {
        loadTimingLines,
        saveTimingLines,
        deleteTimingLines,
        getTransactionInfo,
        getChangeRequestInfo,
        getProjectTimingData
    };
});

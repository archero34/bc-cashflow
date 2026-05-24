/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Shared action-routed JSON data endpoint for all 3 Cash Flow reports.
 *   GET ?action=combined|cost|revenue&projectId=<id>&mode=cash|accrual
 *
 * Returns `{ ok: true, periods, categories, kpis, ... }` or `{ ok: false, error }`.
 * Spec §3.1 architecture; §3.16 loading.
 */
define(['N/log', 'N/query', 'N/url', '../modules/bc_timing_constants'], function (log, query, url, Constants) {

    const MODULE = 'bc_cf_data_sl';

    // ── BC Project record metadata (looked up 2026-05-24 via NS Main Demo MCP) ──
    //
    // Field IDs from customrecord_cseg_bc_project — the BC SuiteApp's project
    // record. Update if a future SuiteApp release renames these.
    //
    // E2 design pivot 2026-05-24: the SuiteApp's custrecord_bc_proj_status
    // tracks workflow stages (WO Approval / Survey / Manufacturing / etc.),
    // NOT lifecycle states. For the portfolio filter we use the built-in
    // `isinactive` boolean instead — Active-only toggle on by default;
    // off = show all projects including inactive. No status list-value
    // lookup needed.
    const BC_PROJECT = {
        rectype: 'customrecord_cseg_bc_project',
        fields: {
            name:       'name',                            // built-in
            customer:   'custrecord_bc_proj_customer',
            manager:    'custrecord_bc_proj_manager',
            subsidiary: 'custrecord_bc_proj_subsidiary',
            created:    'created'                          // built-in
        }
    };

    // ── SuiteQL ───────────────────────────────────────────────────────────────

    /**
     * Maps mode string to the timing type list value used in custom records.
     *   'cash'    → 1  (TIMING_TYPE.CASH_FLOW.id)
     *   'accrual' → 2  (TIMING_TYPE.ACCRUAL.id)
     */
    const modeToTimingType = (mode) => (
        mode === 'accrual' ? Constants.TIMING_TYPE.ACCRUAL.id : Constants.TIMING_TYPE.CASH_FLOW.id
    );

    /**
     * Forecast-only cost query: cost timing lines only.
     * No VendBill / VendPmt joins — forecast data only.
     */
    const COST_SQL = `
        SELECT
            CASE
                WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                    THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                    THEN NVL(t.tranid, NVL(e.entitytitle, 'Vendor'))
                ELSE 'Other Cost'
            END AS cost_group,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS amount,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL THEN MIN(ctl.custrecord_bc_ctl_change_order)
                ELSE MIN(ctl.custrecord_bc_ctl_transaction)
            END AS source_id,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL THEN 'cr'
                ELSE 'po'
            END AS source_type,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL
                    THEN TO_CHAR(MIN(cr.custrecord_bc_cor_date), 'YYYY-MM-DD')
                WHEN MIN(ctl.custrecord_bc_ctl_transaction) IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
        FROM customrecord_bc_cost_timing_line ctl
        LEFT JOIN transaction t ON t.id = ctl.custrecord_bc_ctl_transaction
        LEFT JOIN entity e ON e.id = t.entity
        LEFT JOIN customrecord_bc_change_req cr ON cr.id = ctl.custrecord_bc_ctl_change_order
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?
        GROUP BY
            CASE WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                 THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                 WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                 THEN NVL(t.tranid, NVL(e.entitytitle, 'Vendor'))
                 ELSE 'Other Cost' END,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')
        ORDER BY created_date DESC NULLS LAST, cost_group, period
    `;

    /**
     * Forecast-only revenue query: revenue timing lines only.
     * No CustInvc / CustPymt joins — forecast data only.
     */
    const REVENUE_SQL = `
        SELECT
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                    THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                ELSE NVL(t.tranid, 'Base Bid')
            END AS cost_group,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL THEN MIN(rtl.custrecord_bc_rtl_change_order)
                ELSE MIN(rtl.custrecord_bc_rtl_transaction)
            END AS source_id,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL THEN 'cr'
                ELSE 'so'
            END AS source_type,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL
                    THEN TO_CHAR(MIN(cr.custrecord_bc_cor_date), 'YYYY-MM-DD')
                WHEN MIN(rtl.custrecord_bc_rtl_transaction) IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
        FROM customrecord_bc_revenue_timing_line rtl
        LEFT JOIN transaction t ON t.id = rtl.custrecord_bc_rtl_transaction
        LEFT JOIN customrecord_bc_change_req cr
            ON cr.id = rtl.custrecord_bc_rtl_change_order
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?
        GROUP BY
            CASE WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                 THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                 ELSE NVL(t.tranid, 'Base Bid') END,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')
        ORDER BY created_date DESC NULLS LAST, cost_group, period
    `;

    /**
     * Forecast-only combined query: revenue timing lines UNION cost timing lines.
     * No VendBill / VendPmt / CustInvc / CustPymt joins — forecast data only.
     */
    const COMBINED_SQL = `
        SELECT
            'Revenue' AS flow_direction,
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                    THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                ELSE NVL(t_rev.tranid, 'Base Bid')
            END AS cost_group,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL THEN MIN(rtl.custrecord_bc_rtl_change_order)
                ELSE MIN(rtl.custrecord_bc_rtl_transaction)
            END AS source_id,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL THEN 'cr'
                ELSE 'so'
            END AS source_type,
            CASE
                WHEN MIN(rtl.custrecord_bc_rtl_change_order) IS NOT NULL
                    THEN TO_CHAR(MIN(cr.custrecord_bc_cor_date), 'YYYY-MM-DD')
                WHEN MIN(rtl.custrecord_bc_rtl_transaction) IS NOT NULL
                    THEN TO_CHAR(MIN(t_rev.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
        FROM customrecord_bc_revenue_timing_line rtl
        LEFT JOIN transaction t_rev ON t_rev.id = rtl.custrecord_bc_rtl_transaction
        LEFT JOIN customrecord_bc_change_req cr
            ON cr.id = rtl.custrecord_bc_rtl_change_order
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?
        GROUP BY
            CASE WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                 THEN 'CO: ' || NVL(cr.custrecord_bc_change_order_number, 'Change Order')
                 ELSE NVL(t_rev.tranid, 'Base Bid') END,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')

        UNION ALL

        SELECT
            'Cost' AS flow_direction,
            CASE
                WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                    THEN 'CO: ' || NVL(cr2.custrecord_bc_change_order_number, 'Change Order')
                WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                    THEN NVL(t.tranid, NVL(e.entitytitle, 'Vendor'))
                ELSE 'Other Cost'
            END AS cost_group,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS amount,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL THEN MIN(ctl.custrecord_bc_ctl_change_order)
                ELSE MIN(ctl.custrecord_bc_ctl_transaction)
            END AS source_id,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL THEN 'cr'
                ELSE 'po'
            END AS source_type,
            CASE
                WHEN MIN(ctl.custrecord_bc_ctl_change_order) IS NOT NULL
                    THEN TO_CHAR(MIN(cr2.custrecord_bc_cor_date), 'YYYY-MM-DD')
                WHEN MIN(ctl.custrecord_bc_ctl_transaction) IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
        FROM customrecord_bc_cost_timing_line ctl
        LEFT JOIN transaction t
            ON t.id = ctl.custrecord_bc_ctl_transaction
        LEFT JOIN entity e
            ON e.id = t.entity
        LEFT JOIN customrecord_bc_change_req cr2
            ON cr2.id = ctl.custrecord_bc_ctl_change_order
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?
        GROUP BY
            CASE WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                 THEN 'CO: ' || NVL(cr2.custrecord_bc_change_order_number, 'Change Order')
                 WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                 THEN NVL(t.tranid, NVL(e.entitytitle, 'Vendor'))
                 ELSE 'Other Cost' END,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')

        ORDER BY flow_direction DESC, created_date DESC NULLS LAST, cost_group, period
    `;

    /**
     * Bounds query for cost loader: earliest + latest period_date in the project's
     * cost timing lines, ignoring any date filter. Used for picker min/max attrs.
     */
    const COST_BOUNDS_SQL = `
        SELECT
            TO_CHAR(MIN(ctl.custrecord_bc_ctl_period_date), 'YYYY-MM') AS min_period,
            TO_CHAR(MAX(ctl.custrecord_bc_ctl_period_date), 'YYYY-MM') AS max_period
        FROM customrecord_bc_cost_timing_line ctl
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
    `;

    /**
     * Project-total query for cost loader: SUM(amount) across all the project's
     * cost timing lines, ignoring any date filter. Used for KPI sublines.
     */
    const COST_TOTAL_SQL = `
        SELECT SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS total_amount
        FROM customrecord_bc_cost_timing_line ctl
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
    `;

    /** Bounds query for revenue loader — mirror of COST_BOUNDS_SQL on revenue timing lines. */
    const REVENUE_BOUNDS_SQL = `
        SELECT
            TO_CHAR(MIN(rtl.custrecord_bc_rtl_period_date), 'YYYY-MM') AS min_period,
            TO_CHAR(MAX(rtl.custrecord_bc_rtl_period_date), 'YYYY-MM') AS max_period
        FROM customrecord_bc_revenue_timing_line rtl
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
    `;

    /** Project-total query for revenue loader — mirror of COST_TOTAL_SQL on revenue timing lines. */
    const REVENUE_TOTAL_SQL = `
        SELECT SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS total_amount
        FROM customrecord_bc_revenue_timing_line rtl
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
    `;

    /**
     * Per-line revenue total query: project-wide totals grouped by the
     * same key as REVENUE_SQL, without any date filter. Used to derive
     * project-total baseContract / changeOrders for KPI sublines.
     */
    const REVENUE_LINES_TOTAL_SQL = `
        SELECT
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL THEN 'CO'
                ELSE 'BASE'
            END AS bucket,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount
        FROM customrecord_bc_revenue_timing_line rtl
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
        GROUP BY CASE WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL THEN 'CO' ELSE 'BASE' END
    `;

    // ── Portfolio (E2) option-list queries ───────────────────────────────────

    /**
     * Projects that appear on at least one revenue or cost timing line.
     * Used to populate the Filters pill's Project multi-select dropdown.
     * Returns id + name, alphabetical.
     */
    const AVAILABLE_PROJECTS_SQL = `
        SELECT p.id AS id, p.${BC_PROJECT.fields.name} AS name
        FROM ${BC_PROJECT.rectype} p
        WHERE EXISTS (
            SELECT 1 FROM customrecord_bc_revenue_timing_line rtl
            WHERE rtl.custrecord_bc_rtl_project = p.id
        )
        OR EXISTS (
            SELECT 1 FROM customrecord_bc_cost_timing_line ctl
            WHERE ctl.custrecord_bc_ctl_project = p.id
        )
        ORDER BY p.${BC_PROJECT.fields.name}
    `;

    /**
     * Project managers (employees) that appear on at least one BC project
     * with timing data. Returns id + entityid (the displayable name).
     */
    const AVAILABLE_MANAGERS_SQL = `
        SELECT e.id AS id, e.entityid AS name
        FROM employee e
        WHERE e.id IN (
            SELECT DISTINCT p.${BC_PROJECT.fields.manager}
            FROM ${BC_PROJECT.rectype} p
            WHERE p.${BC_PROJECT.fields.manager} IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM customrecord_bc_revenue_timing_line rtl WHERE rtl.custrecord_bc_rtl_project = p.id
                  UNION
                  SELECT 1 FROM customrecord_bc_cost_timing_line ctl WHERE ctl.custrecord_bc_ctl_project = p.id
              )
        )
        ORDER BY e.entityid
    `;

    /**
     * Customers that appear on at least one BC project with timing data.
     */
    const AVAILABLE_CUSTOMERS_SQL = `
        SELECT c.id AS id, c.entityid AS name
        FROM customer c
        WHERE c.id IN (
            SELECT DISTINCT p.${BC_PROJECT.fields.customer}
            FROM ${BC_PROJECT.rectype} p
            WHERE p.${BC_PROJECT.fields.customer} IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM customrecord_bc_revenue_timing_line rtl WHERE rtl.custrecord_bc_rtl_project = p.id
                  UNION
                  SELECT 1 FROM customrecord_bc_cost_timing_line ctl WHERE ctl.custrecord_bc_ctl_project = p.id
              )
        )
        ORDER BY c.entityid
    `;

    /**
     * Subsidiaries that appear on at least one BC project with timing data.
     */
    const AVAILABLE_SUBSIDIARIES_SQL = `
        SELECT s.id AS id, s.name AS name
        FROM subsidiary s
        WHERE s.id IN (
            SELECT DISTINCT p.${BC_PROJECT.fields.subsidiary}
            FROM ${BC_PROJECT.rectype} p
            WHERE p.${BC_PROJECT.fields.subsidiary} IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM customrecord_bc_revenue_timing_line rtl WHERE rtl.custrecord_bc_rtl_project = p.id
                  UNION
                  SELECT 1 FROM customrecord_bc_cost_timing_line ctl WHERE ctl.custrecord_bc_ctl_project = p.id
              )
        )
        ORDER BY s.name
    `;

    // ── PORTFOLIO_SQL — main per-project per-period rev+cost aggregator (E2) ──

    /**
     * Returns one row per (flow_direction, project, period) tuple, summed.
     * UNION ALL of revenue leg + cost leg. Each leg joins BC_PROJECT for
     * project metadata + filter dimensions.
     *
     * Filter clauses use the (? = 1 OR <field> ...) disable-flag pattern:
     * pass 1 to disable that filter dimension, 0 (plus values) to enable.
     *
     * - active flag: pass 0 to filter to isinactive='F' projects, 1 to disable
     * - 4 multi-select dimensions (projects/managers/customers/subsidiaries)
     *   accept fixed-width ID lists with disable-flag padding (10 for projects,
     *   5 for others). Padding with the first value is harmless because
     *   `IN (?, ?, ?, ?, ?)` matches if the field equals ANY of the supplied values.
     */
    const PORTFOLIO_SQL = `
        SELECT
            'Revenue' AS flow_direction,
            p.id AS project_id,
            p.${BC_PROJECT.fields.name} AS project_name,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount,
            TO_CHAR(MIN(p.${BC_PROJECT.fields.created}), 'YYYY-MM-DD') AS project_created
        FROM ${BC_PROJECT.rectype} p
        JOIN customrecord_bc_revenue_timing_line rtl ON rtl.custrecord_bc_rtl_project = p.id
        WHERE rtl.custrecord_bc_rtl_timing_type = ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?
          AND (? = 1 OR p.isinactive = 'F')
          AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?))
        GROUP BY p.id, p.${BC_PROJECT.fields.name},
                 TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')

        UNION ALL

        SELECT
            'Cost' AS flow_direction,
            p.id AS project_id,
            p.${BC_PROJECT.fields.name} AS project_name,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS amount,
            TO_CHAR(MIN(p.${BC_PROJECT.fields.created}), 'YYYY-MM-DD') AS project_created
        FROM ${BC_PROJECT.rectype} p
        JOIN customrecord_bc_cost_timing_line ctl ON ctl.custrecord_bc_ctl_project = p.id
        WHERE ctl.custrecord_bc_ctl_timing_type = ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?
          AND (? = 1 OR p.isinactive = 'F')
          AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?))
        GROUP BY p.id, p.${BC_PROJECT.fields.name},
                 TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')

        ORDER BY project_created DESC NULLS LAST, project_name, period
    `;

    /**
     * Earliest + latest period_date across both timing-line tables, ignoring
     * filters. Powers the date picker's min/max attrs.
     */
    const PORTFOLIO_BOUNDS_SQL = `
        SELECT
            TO_CHAR(MIN(period), 'YYYY-MM') AS min_period,
            TO_CHAR(MAX(period), 'YYYY-MM') AS max_period
        FROM (
            SELECT rtl.custrecord_bc_rtl_period_date AS period
              FROM customrecord_bc_revenue_timing_line rtl
            UNION ALL
            SELECT ctl.custrecord_bc_ctl_period_date AS period
              FROM customrecord_bc_cost_timing_line ctl
        ) all_periods
    `;

    /**
     * Unfiltered portfolio totals within the active date range. Powers the
     * KPI sublines ("$210K portfolio total"). Takes startPeriod + endPeriod
     * as the only params — does NOT respect the active/project/etc. filters.
     */
    const PORTFOLIO_TOTALS_SQL = `
        SELECT
            (SELECT NVL(SUM(rtl.custrecord_bc_rtl_amount), 0)
               FROM customrecord_bc_revenue_timing_line rtl
              WHERE rtl.custrecord_bc_rtl_timing_type = ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?) AS rev_total,
            (SELECT NVL(SUM(ctl.custrecord_bc_ctl_amount), 0)
               FROM customrecord_bc_cost_timing_line ctl
              WHERE ctl.custrecord_bc_ctl_timing_type = ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?) AS cost_total
        FROM dual
    `;

    /**
     * Pre-range cumulative net across the FILTERED project set.
     * Returns rev_total + cost_total for periods strictly before startPeriod,
     * respecting the same active + project/manager/customer/subsidiary filters
     * as PORTFOLIO_SQL. Caller computes net = rev_total - cost_total.
     *
     * Same disable-flag pattern as PORTFOLIO_SQL, twice (one set per subquery).
     */
    const PORTFOLIO_CUM_BEFORE_SQL = `
        SELECT
            (SELECT NVL(SUM(rtl.custrecord_bc_rtl_amount), 0)
               FROM customrecord_bc_revenue_timing_line rtl
               JOIN ${BC_PROJECT.rectype} p ON p.id = rtl.custrecord_bc_rtl_project
              WHERE rtl.custrecord_bc_rtl_timing_type = ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') < ?
                AND (? = 1 OR p.isinactive = 'F')
                AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?))) AS rev_total,
            (SELECT NVL(SUM(ctl.custrecord_bc_ctl_amount), 0)
               FROM customrecord_bc_cost_timing_line ctl
               JOIN ${BC_PROJECT.rectype} p ON p.id = ctl.custrecord_bc_ctl_project
              WHERE ctl.custrecord_bc_ctl_timing_type = ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') < ?
                AND (? = 1 OR p.isinactive = 'F')
                AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?))) AS cost_total
        FROM dual
    `;

    /**
     * Pre-range cumulative net for combined action.
     * Returns one row with rev_total and cost_total — both summed across
     * periods STRICTLY BEFORE the supplied startPeriod. Caller computes
     * net = rev_total - cost_total. Spec §3.5.
     */
    const CUMULATIVE_BEFORE_SQL = `
        SELECT
            (SELECT NVL(SUM(rtl.custrecord_bc_rtl_amount), 0)
               FROM customrecord_bc_revenue_timing_line rtl
              WHERE rtl.custrecord_bc_rtl_project = ?
                AND rtl.custrecord_bc_rtl_timing_type = ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') < ?) AS rev_total,
            (SELECT NVL(SUM(ctl.custrecord_bc_ctl_amount), 0)
               FROM customrecord_bc_cost_timing_line ctl
              WHERE ctl.custrecord_bc_ctl_project = ?
                AND ctl.custrecord_bc_ctl_timing_type = ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') < ?) AS cost_total
        FROM dual
    `;

    // ── Helpers ───────────────────────────────────────────────────────────────

    // ── Date range helpers ────────────────────────────────────────────────────

    const _YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

    /** Strict YYYY-MM format check. */
    const _validateYYYYMM = (s) => typeof s === 'string' && _YYYYMM_RE.test(s);

    /**
     * Add N months (positive or negative) to a YYYY-MM string.
     * Uses UTC Date math to avoid timezone drift on month boundaries.
     */
    const _addMonths = (yyyymm, n) => {
        const parts = yyyymm.split('-');
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = new Date(Date.UTC(y, (m - 1) + n, 1));
        const ny = d.getUTCFullYear();
        const nm = String(d.getUTCMonth() + 1).padStart(2, '0');
        return ny + '-' + nm;
    };

    /**
     * Inclusive month count between two YYYY-MM strings (start <= end assumed).
     * monthsBetween('2026-01', '2026-12') → 12
     * monthsBetween('2026-05', '2026-05') → 1
     */
    const _monthsBetween = (start, end) => {
        const [sy, sm] = start.split('-').map(Number);
        const [ey, em] = end.split('-').map(Number);
        return (ey - sy) * 12 + (em - sm) + 1;
    };

    /**
     * Default rolling window per spec D1: current month -3 → current month +8 = 12 months inclusive.
     * Example: today May 2026 → { startPeriod: '2026-02', endPeriod: '2027-01' }.
     */
    const _defaultRange = () => {
        const now = new Date();
        const curYYYYMM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        return {
            startPeriod: _addMonths(curYYYYMM, -3),
            endPeriod:   _addMonths(curYYYYMM, 8)
        };
    };

    /**
     * Resolve raw request params into an effective range, applying defaults
     * and validating per spec §3.1. Returns either:
     *   { ok: true,  startPeriod, endPeriod }
     *   { ok: false, error: '...' }
     */
    const _resolveRange = (rawStart, rawEnd) => {
        const hasStart = rawStart != null && rawStart !== '';
        const hasEnd   = rawEnd   != null && rawEnd   !== '';

        if (!hasStart && !hasEnd) return Object.assign({ ok: true }, _defaultRange());

        if (hasStart && !_validateYYYYMM(rawStart)) return { ok: false, error: 'Invalid period format' };
        if (hasEnd   && !_validateYYYYMM(rawEnd))   return { ok: false, error: 'Invalid period format' };

        const startPeriod = hasStart ? rawStart : _addMonths(rawEnd,   -11);
        const endPeriod   = hasEnd   ? rawEnd   : _addMonths(rawStart, 11);

        if (startPeriod > endPeriod) return { ok: false, error: 'startPeriod must be <= endPeriod' };
        if (_monthsBetween(startPeriod, endPeriod) > 24) {
            return { ok: false, error: 'Date range exceeds 24-month limit' };
        }

        return { ok: true, startPeriod, endPeriod };
    };

    /**
     * Parse + validate portfolio filter params from the URL request. Returns
     *   { ok: true, filters: {...} }
     *   { ok: false, error: '...' }
     *
     * active param: default true. To disable active-only filter (show all
     * projects including inactive), pass active=0 or active=false.
     */
    const _parseFilters = (params) => {
        // active: default true; '0' or 'false' (case-insensitive) → false; everything else → true.
        const rawActive = params.active;
        const active = !(rawActive === '0' || (typeof rawActive === 'string' && rawActive.toLowerCase() === 'false'));

        const ID_CSV = /^(\d+)(,\d+)*$/;
        const parseIds = (raw, dim) => {
            if (raw == null || raw === '') return { ok: true, ids: [] };
            if (!ID_CSV.test(raw)) return { ok: false, error: 'Invalid ' + dim + ' filter format' };
            return { ok: true, ids: raw.split(',').map(Number) };
        };

        const p = parseIds(params.projects,     'projects');
        if (!p.ok) return p;
        const m = parseIds(params.managers,     'managers');
        if (!m.ok) return m;
        const c = parseIds(params.customers,    'customers');
        if (!c.ok) return c;
        const s = parseIds(params.subsidiaries, 'subsidiaries');
        if (!s.ok) return s;

        return {
            ok: true,
            filters: {
                active,
                projects:     p.ids,
                managers:     m.ids,
                customers:    c.ids,
                subsidiaries: s.ids
            }
        };
    };

    /** 'YYYY-MM' → 'Apr 2026' */
    const _periodLabel = (yyyymm) => {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [y, m] = yyyymm.split('-');
        return MONTHS[Number(m) - 1] + ' ' + y;
    };

    /**
     * Sort group keys, hoisting a preferred first key to the front.
     * @param {Object} groups
     * @param {string} firstKey
     * @returns {string[]} sorted keys
     */
    const _sortedKeys = (groups, firstKey) => {
        const keys = Object.keys(groups).sort();
        if (firstKey && keys.includes(firstKey)) {
            keys.splice(keys.indexOf(firstKey), 1);
            keys.unshift(firstKey);
        }
        return keys;
    };

    /**
     * Pivot flat rows for one direction ('Revenue' or 'Cost') into:
     *   lines: [{ id, label, source, amounts: [...], total, createdDate }]
     *   total: [...per-period totals...]
     *   grandTotal: number
     *
     * @param {Object[]} rows - filtered rows for one flow_direction
     * @param {string[]} periods - sorted YYYY-MM strings
     * @param {string} firstKey - retained for backwards-compat; unused after E1.5. Spec §3.1.4.
     */
    const _pivotDirection = (rows, periods, firstKey) => {
        // firstKey arg retained for backwards-compat — unused after E1.5.
        // Group keys are now ordered by createdDate DESC NULLS LAST. Spec §3.1.4.

        const groups = {};
        const sourceMap = {};
        const createdMap = {};

        rows.forEach((r) => {
            const g = r.cost_group;
            if (!groups[g]) groups[g] = {};
            groups[g][r.period] = (groups[g][r.period] || 0) + (Number(r.amount) || 0);
            if (!sourceMap[g] && r.source_id) {
                const _src = { id: r.source_id, type: r.source_type };
                // CR drill-in needs server-resolved URL — custrecordentry.nl?rectype=<scriptid>
                // returns "Invalid Record Type" for BC SuiteApp records in some accounts.
                if (r.source_type === 'cr') {
                    try {
                        _src.recordUrl = url.resolveRecord({
                            recordType: 'customrecord_bc_change_req',
                            recordId: r.source_id,
                            isEditMode: false
                        });
                    } catch (e) {
                        log.error({ title: MODULE + '._pivotDirection (cr url)', details: e.message });
                    }
                }
                sourceMap[g] = _src;
            }
            if (!(g in createdMap) && r.created_date != null) {
                createdMap[g] = r.created_date;
            }
        });

        // Sort group keys by createdDate DESC NULLS LAST.
        const keys = Object.keys(groups).sort((a, b) => {
            const da = createdMap[a];
            const db = createdMap[b];
            if (da == null && db == null) return a < b ? -1 : (a > b ? 1 : 0);  // stable alphabetic for both-null
            if (da == null) return 1;   // nulls to end
            if (db == null) return -1;
            return da < db ? 1 : (da > db ? -1 : 0);  // descending
        });

        const lines = keys.map((k) => {
            const byPeriod = groups[k];
            const amounts = periods.map((p) => byPeriod[p] || 0);
            const total = amounts.reduce((s, v) => s + v, 0);
            const src = sourceMap[k] || null;
            return {
                id: k,
                label: k,
                source: src,
                amounts,
                total,
                createdDate: (k in createdMap) ? createdMap[k] : null
            };
        });

        const total = periods.map((_, i) => lines.reduce((s, l) => s + (l.amounts[i] || 0), 0));
        const grandTotal = total.reduce((s, v) => s + v, 0);

        return { lines, total, grandTotal };
    };

    /**
     * Load portfolio data — per-project per-period revenue + cost, aggregated
     * across all projects matching the supplied filters and date range.
     *
     * @param {string} mode - 'cash' | 'accrual'
     * @param {{startPeriod, endPeriod}} range
     * @param {Object} filters
     *   - active: boolean — default true. true → only isinactive='F' projects.
     *   - projects/managers/customers/subsidiaries: arrays of internal IDs (empty = no filter)
     */
    const _loadPortfolio = (mode, range, filters) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        // Build active-flag SQL params: pass [0] to enable filter, [1] to disable.
        const activeParams = filters.active === false ? [1] : [0];

        // Multi-select filter dimensions: [disableFlag, ...paddedIds].
        // disableFlag = 1 means "ignore this dimension"; otherwise 0 + a fixed-width
        // value list. Pad with first ID (harmless — IN matches if field equals ANY value).
        const buildIdFilter = (ids, cap) => {
            if (!ids || !ids.length) {
                return [1].concat(Array(cap).fill(0));
            }
            const padded = ids.slice(0, cap);
            while (padded.length < cap) padded.push(ids[0]);
            return [0].concat(padded);
        };

        const projectParams    = buildIdFilter(filters.projects, 10);
        const managerParams    = buildIdFilter(filters.managers, 5);
        const customerParams   = buildIdFilter(filters.customers, 5);
        const subsidiaryParams = buildIdFilter(filters.subsidiaries, 5);

        // SQL params per leg, in PORTFOLIO_SQL's ? order:
        // timingType, startPeriod, endPeriod, active(1), projects(11), managers(6),
        // customers(6), subsidiaries(6) = 34 per leg.
        const legParams = [timingType, startPeriod, endPeriod]
            .concat(activeParams)
            .concat(projectParams)
            .concat(managerParams)
            .concat(customerParams)
            .concat(subsidiaryParams);

        // Both UNION legs get the same param set.
        const allParams = legParams.concat(legParams);

        let rows;
        try {
            rows = query.runSuiteQL({
                query: PORTFOLIO_SQL,
                params: allParams
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // ── availableBounds ──
        let boundsRow;
        try {
            boundsRow = query.runSuiteQL({
                query: PORTFOLIO_BOUNDS_SQL,
                params: []
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio (bounds)', details: e.message + '\n' + (e.stack || '') });
            boundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const availableBounds = {
            minPeriod: boundsRow.min_period || _curYYYYMM,
            maxPeriod: boundsRow.max_period || _curYYYYMM
        };

        // ── portfolioTotals (unfiltered, within range) ──
        let totalsRow;
        try {
            totalsRow = query.runSuiteQL({
                query: PORTFOLIO_TOTALS_SQL,
                params: [timingType, startPeriod, endPeriod, timingType, startPeriod, endPeriod]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio (totals)', details: e.message + '\n' + (e.stack || '') });
            totalsRow = {};
        }
        const portfRevenue = Number(totalsRow.rev_total) || 0;
        const portfCost    = Number(totalsRow.cost_total) || 0;
        const portfolioTotals = {
            revenue: portfRevenue,
            cost:    portfCost,
            net:     portfRevenue - portfCost,
            margin:  portfRevenue !== 0 ? ((portfRevenue - portfCost) / portfRevenue) * 100 : 0
        };

        // ── availableProjects / Managers / Customers / Subsidiaries ──
        const runOptionList = (sqlConst, label) => {
            try {
                return query.runSuiteQL({ query: sqlConst, params: [] }).asMappedResults()
                    .map((r) => ({ id: Number(r.id), name: r.name || '' }));
            } catch (e) {
                log.error({ title: MODULE + '._loadPortfolio (' + label + ')', details: e.message + '\n' + (e.stack || '') });
                return [];
            }
        };
        const availableProjects     = runOptionList(AVAILABLE_PROJECTS_SQL,     'projects');
        const availableManagers     = runOptionList(AVAILABLE_MANAGERS_SQL,     'managers');
        const availableCustomers    = runOptionList(AVAILABLE_CUSTOMERS_SQL,    'customers');
        const availableSubsidiaries = runOptionList(AVAILABLE_SUBSIDIARIES_SQL, 'subsidiaries');

        // ── cumulativeBefore — pre-range net across the FILTERED project set ──
        // Build the cum-before params per subquery. SAME filter dimensions as
        // PORTFOLIO_SQL but WITHOUT endPeriod (the < startPeriod clause replaces
        // the date BETWEEN). Per subquery: timingType + startPeriod + active + 4 dims.
        const cumSubqueryParams = [timingType, startPeriod]
            .concat(activeParams)
            .concat(projectParams)
            .concat(managerParams)
            .concat(customerParams)
            .concat(subsidiaryParams);
        let cumRow;
        try {
            cumRow = query.runSuiteQL({
                query: PORTFOLIO_CUM_BEFORE_SQL,
                params: cumSubqueryParams.concat(cumSubqueryParams)
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio (cumBefore)', details: e.message + '\n' + (e.stack || '') });
            cumRow = {};
        }
        const cumulativeBefore = (Number(cumRow.rev_total) || 0) - (Number(cumRow.cost_total) || 0);

        // Build period list from the range (every month renders even if empty).
        const periods = [];
        let _p = startPeriod;
        while (_p <= endPeriod) { periods.push(_p); _p = _addMonths(_p, 1); }

        // Group rows by project, pivot rev+cost onto the period array.
        const byProject = {};
        rows.forEach((r) => {
            const pid = String(r.project_id);
            if (!byProject[pid]) {
                byProject[pid] = {
                    id: Number(r.project_id),
                    name: r.project_name || '(Unnamed)',
                    createdDate: r.project_created || null,
                    revenuePerPeriod: {},
                    costPerPeriod: {}
                };
            }
            const bucket = r.flow_direction === 'Revenue' ? 'revenuePerPeriod' : 'costPerPeriod';
            byProject[pid][bucket][r.period] = (byProject[pid][bucket][r.period] || 0) + (Number(r.amount) || 0);
        });

        // Materialize the projects array, sort by createdDate DESC NULLS LAST.
        const projectList = Object.keys(byProject).map((pid) => {
            const proj = byProject[pid];
            const revenue = periods.map((p) => proj.revenuePerPeriod[p] || 0);
            const cost    = periods.map((p) => proj.costPerPeriod[p] || 0);
            const net     = revenue.map((v, i) => v - (cost[i] || 0));
            // custrecordentry.nl needs the numeric internal rectype id for
            // custom-segment-backing records (not the scriptid). Let N/url
            // resolve the correct path per project.
            let _projUrl = null;
            try {
                _projUrl = url.resolveRecord({
                    recordType: BC_PROJECT.rectype,
                    recordId: proj.id,
                    isEditMode: false
                });
            } catch (e) {
                log.error({ title: MODULE + '._loadPortfolio (resolveRecord)', details: e.message });
            }
            return {
                id: proj.id,
                name: proj.name,
                createdDate: proj.createdDate,
                recordUrl: _projUrl,
                revenue, cost, net,
                revenueTotal: revenue.reduce((s, v) => s + v, 0),
                costTotal:    cost.reduce((s, v) => s + v, 0),
                netTotal:     net.reduce((s, v) => s + v, 0)
            };
        });

        projectList.sort((a, b) => {
            if (a.createdDate == null && b.createdDate == null) {
                return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
            }
            if (a.createdDate == null) return 1;
            if (b.createdDate == null) return -1;
            return a.createdDate < b.createdDate ? 1 : (a.createdDate > b.createdDate ? -1 : 0);
        });

        // Aggregate per-period series across the filtered projects (drives the chart).
        const portfolioRevenuePerPeriod = periods.map((_, i) =>
            projectList.reduce((s, p) => s + (p.revenue[i] || 0), 0)
        );
        const portfolioCostPerPeriod = periods.map((_, i) =>
            projectList.reduce((s, p) => s + (p.cost[i] || 0), 0)
        );
        const portfolioNetPerPeriod = portfolioRevenuePerPeriod.map((v, i) =>
            v - (portfolioCostPerPeriod[i] || 0)
        );

        // KPIs — sum across the filtered subset.
        const totalRevenue = projectList.reduce((s, p) => s + p.revenueTotal, 0);
        const totalCost    = projectList.reduce((s, p) => s + p.costTotal, 0);
        const netCashFlow  = totalRevenue - totalCost;
        const margin       = totalRevenue !== 0 ? (netCashFlow / totalRevenue) * 100 : 0;

        return {
            periods: periods.map(_periodLabel),
            projects: projectList,
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod },
            availableBounds,
            portfolioTotals,
            portfolioRevenuePerPeriod,
            portfolioCostPerPeriod,
            portfolioNetPerPeriod,
            cumulativeBefore,
            availableProjects,
            availableManagers,
            availableCustomers,
            availableSubsidiaries
        };
    };

    // ── JSON helpers ──────────────────────────────────────────────────────────

    const sendJSON = (response, payload) => {
        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write({ output: JSON.stringify(payload) });
    };

    const sendError = (response, message) => sendJSON(response, { ok: false, error: message });

    // ── Action handlers (delegated to private loaders so tests can mock) ──────

    /**
     * Load combined forecast data and shape it into the standard JSON contract.
     *
     * @param {string} projectId - internal ID of the BC Project
     * @param {string} mode - 'cash' | 'accrual'
     * @returns {{
     *   periods: string[],
     *   categories: {
     *     revenue: { lines: Object[], total: number[], grandTotal: number },
     *     cost:    { lines: Object[], total: number[], grandTotal: number }
     *   },
     *   kpis: { totalRevenue: number, totalCost: number, netCashFlow: number, margin: number }
     * }}
     */
    const _loadCombined = (projectId, mode, range) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        let rows;
        try {
            rows = query.runSuiteQL({
                query: COMBINED_SQL,
                params: [
                    projectId, timingType, startPeriod, endPeriod,  // revenue leg
                    projectId, timingType, startPeriod, endPeriod   // cost leg
                ]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // availableBounds — union of revenue + cost bounds (no date filter)
        let revBoundsRow, costBoundsRow;
        try {
            revBoundsRow = query.runSuiteQL({
                query: REVENUE_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (rev bounds)', details: e.message + '\n' + (e.stack || '') });
            revBoundsRow = {};
        }
        try {
            costBoundsRow = query.runSuiteQL({
                query: COST_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (cost bounds)', details: e.message + '\n' + (e.stack || '') });
            costBoundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const allMins = [revBoundsRow.min_period, costBoundsRow.min_period].filter(Boolean);
        const allMaxs = [revBoundsRow.max_period, costBoundsRow.max_period].filter(Boolean);
        const availableBounds = {
            minPeriod: allMins.length ? allMins.sort()[0] : _curYYYYMM,
            maxPeriod: allMaxs.length ? allMaxs.sort()[allMaxs.length - 1] : _curYYYYMM
        };

        // projectTotals — both revenue + cost (no date filter)
        let revTotalRow, costTotalRow;
        try {
            revTotalRow = query.runSuiteQL({
                query: REVENUE_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (rev total)', details: e.message + '\n' + (e.stack || '') });
            revTotalRow = {};
        }
        try {
            costTotalRow = query.runSuiteQL({
                query: COST_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (cost total)', details: e.message + '\n' + (e.stack || '') });
            costTotalRow = {};
        }
        const projectTotals = {
            revenue: Number(revTotalRow.total_amount) || 0,
            cost:    Number(costTotalRow.total_amount) || 0
        };

        // cumulativeBefore — net flow accumulated in periods strictly before startPeriod
        let cumRow;
        try {
            cumRow = query.runSuiteQL({
                query: CUMULATIVE_BEFORE_SQL,
                params: [
                    projectId, timingType, startPeriod,  // revenue subquery
                    projectId, timingType, startPeriod   // cost subquery
                ]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (cumBefore)', details: e.message + '\n' + (e.stack || '') });
            cumRow = {};
        }
        const cumulativeBefore = (Number(cumRow.rev_total) || 0) - (Number(cumRow.cost_total) || 0);

        // Build full period list from the range so months with no data still render as $0 columns.
        const periods = [];
        let _p = startPeriod;
        while (_p <= endPeriod) { periods.push(_p); _p = _addMonths(_p, 1); }

        const revRows  = rows.filter((r) => r.flow_direction === 'Revenue');
        const costRows = rows.filter((r) => r.flow_direction === 'Cost');

        const revenue = _pivotDirection(revRows,  periods, 'Base Bid');
        const cost    = _pivotDirection(costRows, periods, null);

        const totalRevenue = revenue.grandTotal;
        const totalCost    = cost.grandTotal;
        const netCashFlow  = totalRevenue - totalCost;
        const margin       = totalRevenue !== 0
            ? (netCashFlow / totalRevenue) * 100
            : 0;

        return {
            periods: periods.map(_periodLabel),
            categories: { revenue, cost },
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals,
            cumulativeBefore
        };
    };
    /**
     * Load forecast-only cost data and shape it into the standard JSON contract.
     * No actuals (VendBill / VendPmt) — forecast timing lines only.
     *
     * @param {string} projectId - internal ID of the BC Project
     * @param {string} mode - 'cash' | 'accrual'
     * @returns {{
     *   periods: string[],
     *   categories: {
     *     cost: { lines: Object[], total: number[], grandTotal: number }
     *   },
     *   kpis: { totalCost: number, currentMonth: number, peakMonth: number, remaining: number }
     * }}
     */
    const _loadCost = (projectId, mode, range) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        let rows;
        try {
            rows = query.runSuiteQL({
                query: COST_SQL,
                params: [projectId, timingType, startPeriod, endPeriod]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadCost', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // availableBounds — single-row result with MIN/MAX of period_date across all timing lines (no date filter)
        let boundsRow;
        try {
            boundsRow = query.runSuiteQL({
                query: COST_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCost (bounds)', details: e.message + '\n' + (e.stack || '') });
            boundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const availableBounds = {
            minPeriod: boundsRow.min_period || _curYYYYMM,
            maxPeriod: boundsRow.max_period || _curYYYYMM
        };

        // projectTotals.cost — single-row SUM(amount) across all timing lines (no date filter)
        let totalRow;
        try {
            totalRow = query.runSuiteQL({
                query: COST_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCost (total)', details: e.message + '\n' + (e.stack || '') });
            totalRow = {};
        }
        const projectTotals = { cost: Number(totalRow.total_amount) || 0 };

        // Build full period list from the range so months with no data still render as $0 columns.
        const periods = [];
        let _p = startPeriod;
        while (_p <= endPeriod) { periods.push(_p); _p = _addMonths(_p, 1); }

        const cost = _pivotDirection(rows, periods, null);

        // KPI: current YYYY-MM derived from runtime clock
        const now = new Date();
        const curYYYYMM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        const curIdx = periods.indexOf(curYYYYMM);
        const currentMonth = curIdx !== -1 ? (cost.total[curIdx] || 0) : 0;

        const peakMonth = cost.total.length > 0
            ? Math.max.apply(null, cost.total)
            : 0;

        const remaining = periods.reduce((sum, p, i) => {
            return p >= curYYYYMM ? sum + (cost.total[i] || 0) : sum;
        }, 0);

        return {
            periods: periods.map(_periodLabel),
            categories: { cost },
            kpis: {
                totalCost: cost.grandTotal,
                currentMonth,
                peakMonth,
                remaining
            },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals
        };
    };
    /**
     * Load forecast-only revenue data and shape it into the standard JSON contract.
     * No actuals (CustInvc / CustPymt) — forecast timing lines only.
     * 'Base Bid' is hoisted to first position per spec §3.6 revenue KPI mockup.
     *
     * @param {string} projectId - internal ID of the BC Project
     * @param {string} mode - 'cash' | 'accrual'
     * @returns {{
     *   periods: string[],
     *   categories: {
     *     revenue: { lines: Object[], total: number[], grandTotal: number }
     *   },
     *   kpis: { totalRevenue: number, baseContract: number, changeOrders: number, peakMonth: number }
     * }}
     */
    const _loadRevenue = (projectId, mode, range) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        let rows;
        try {
            rows = query.runSuiteQL({
                query: REVENUE_SQL,
                params: [projectId, timingType, startPeriod, endPeriod]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // availableBounds
        let boundsRow;
        try {
            boundsRow = query.runSuiteQL({
                query: REVENUE_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue (bounds)', details: e.message + '\n' + (e.stack || '') });
            boundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const availableBounds = {
            minPeriod: boundsRow.min_period || _curYYYYMM,
            maxPeriod: boundsRow.max_period || _curYYYYMM
        };

        // projectTotals.revenue
        let totalRow;
        try {
            totalRow = query.runSuiteQL({
                query: REVENUE_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue (total)', details: e.message + '\n' + (e.stack || '') });
            totalRow = {};
        }
        // Bucket project-wide revenue into baseContract vs changeOrders
        let bucketRows;
        try {
            bucketRows = query.runSuiteQL({
                query: REVENUE_LINES_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue (buckets)', details: e.message + '\n' + (e.stack || '') });
            bucketRows = [];
        }
        const baseTotal = (bucketRows.find((r) => r.bucket === 'BASE') || {}).amount || 0;
        const coTotal   = (bucketRows.find((r) => r.bucket === 'CO')   || {}).amount || 0;
        const projectTotals = {
            revenue:       Number(totalRow.total_amount) || 0,
            baseContract:  Number(baseTotal) || 0,
            changeOrders:  Number(coTotal) || 0
        };

        // Build full period list from the range so months with no data still render as $0 columns.
        const periods = [];
        let _p = startPeriod;
        while (_p <= endPeriod) { periods.push(_p); _p = _addMonths(_p, 1); }

        const revenue = _pivotDirection(rows, periods, 'Base Bid');

        const totalRevenue = revenue.grandTotal;

        const baseContract = revenue.lines
            .filter((l) => !l.id.startsWith('CO: '))
            .reduce((sum, l) => sum + l.total, 0);

        const changeOrders = revenue.lines
            .filter((l) => l.id.startsWith('CO: '))
            .reduce((sum, l) => sum + l.total, 0);

        const peakMonth = revenue.total.length > 0
            ? Math.max.apply(null, revenue.total)
            : 0;

        return {
            periods: periods.map(_periodLabel),
            categories: { revenue },
            kpis: { totalRevenue, baseContract, changeOrders, peakMonth },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals
        };
    };

    const onRequest = (context) => {
        try {
            const req = context.request;
            const res = context.response;
            const params = req.parameters || {};

            const action = params.action;
            const projectId = params.projectId;
            const mode = params.mode || 'cash';
            const rawStart = params.startPeriod;
            const rawEnd   = params.endPeriod;

            if (!action) return sendError(res, 'Missing action parameter');
            if (!projectId && action !== 'portfolio') return sendError(res, 'Missing projectId parameter');
            if (mode !== 'cash' && mode !== 'accrual') return sendError(res, `Invalid mode: ${mode}`);

            const resolved = api._resolveRange(rawStart, rawEnd);
            if (!resolved.ok) return sendError(res, resolved.error);
            const range = { startPeriod: resolved.startPeriod, endPeriod: resolved.endPeriod };

            let filters = null;
            if (action === 'portfolio') {
                const parsedFilters = api._parseFilters(params);
                if (!parsedFilters.ok) return sendError(res, parsedFilters.error);
                filters = parsedFilters.filters;
            }

            let data;
            // Dispatch through `api` so Jest spies on the returned object intercept the call
            // (referencing closure-scoped functions directly would bypass the spy).
            // `module.exports` is undefined in NetSuite's AMD runtime — never reference it here.
            if (action === 'combined')      data = api._loadCombined(projectId, mode, range);
            else if (action === 'cost')     data = api._loadCost(projectId, mode, range);
            else if (action === 'revenue')  data = api._loadRevenue(projectId, mode, range);
            else if (action === 'portfolio') data = api._loadPortfolio(mode, range, filters);
            else return sendError(res, `Unknown action: ${action}`);

            sendJSON(res, Object.assign({ ok: true, mode }, data));
        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: e.message + ' ' + (e.stack || '') });
            sendError(context.response, e.message);
        }
    };

    // Single exports object — `onRequest` dispatches through it so Jest spies work in tests
    // AND NetSuite's AMD runtime loads it cleanly (no `module.exports` reference needed).
    const api = {
        _loadCombined, _loadCost, _loadRevenue, _loadPortfolio,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange,
        _pivotDirection, _parseFilters,
        BC_PROJECT,
        AVAILABLE_PROJECTS_SQL, AVAILABLE_MANAGERS_SQL,
        AVAILABLE_CUSTOMERS_SQL, AVAILABLE_SUBSIDIARIES_SQL,
        PORTFOLIO_SQL, PORTFOLIO_BOUNDS_SQL, PORTFOLIO_TOTALS_SQL, PORTFOLIO_CUM_BEFORE_SQL
    };
    api.onRequest = onRequest;
    return api;
});

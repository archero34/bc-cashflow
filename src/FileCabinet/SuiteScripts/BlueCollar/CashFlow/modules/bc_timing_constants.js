/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Shared constants for BC Cash Flow Forecasting.
 *              Single source of truth for record IDs, field IDs, list values, and brand config.
 */
define([], () => {

    // ─── Custom Record Type IDs ───────────────────────────────────────────────
    const RECORDS = {
        COST_TIMING_TEMPLATE:   'customrecord_bc_cost_timing_template',
        CTT_LINE:               'customrecord_bc_ctt_line',
        COST_TIMING_LINE:       'customrecord_bc_cost_timing_line',
        REVENUE_TIMING_LINE:    'customrecord_bc_revenue_timing_line',
        // Existing BC records (we reference, don't own)
        CHANGE_REQ:             'customrecord_bc_change_req',
        CHANGE_REQ_BILLING:     'customrecord_bc_change_req_billing_item',
        CHANGE_REQ_BUDGET:      'customrecord_bc_change_req_budget_item',
        BUDGET_ITEM:            'customrecord_bc_budget_item',
        PROJECT:                'customrecord_cseg_bc_project',
        COST_CODE:              'customrecord_cseg_bc_cost_code',
        COST_DIVISION:          'customrecord_bc_cost_division',
        GLOBAL_PREF:            'customrecord_bc_global_pref',
        GLOBAL_PERMS:           'customrecord_bc_global_permissions',
        PROJECT_TASK:           'customrecord_bc_proj_task',
        SUB_CHANGE_REQ:         'customrecord_bc_sub_change_req',
        SUB_CHANGE_REQ_LINE:    'customrecord_bc_sub_change_req_line',
        RESOURCE_RATE_TEMPLATE: 'customrecord_bc_resource_rate_template'
    };

    // ─── Cost Timing Line Fields ──────────────────────────────────────────────
    const CTL_FIELDS = {
        TRANSACTION:    'custrecord_bc_ctl_transaction',
        PROJECT:        'custrecord_bc_ctl_project',
        PERIOD_DATE:    'custrecord_bc_ctl_period_date',
        PERCENTAGE:     'custrecord_bc_ctl_percentage',
        AMOUNT:         'custrecord_bc_ctl_amount',
        CUMULATIVE_PCT: 'custrecord_bc_ctl_cumulative_pct',
        CUMULATIVE_AMT: 'custrecord_bc_ctl_cumulative_amt',
        STATUS:         'custrecord_bc_ctl_status',
        LABEL:          'custrecord_bc_ctl_label',
        SOURCE:         'custrecord_bc_ctl_source',
        SOURCE_GROUP:   'custrecord_bc_ctl_source_group',
        SOURCE_TEMPLATE:'custrecord_bc_ctl_source_template',
        TIMING_TYPE:    'custrecord_bc_ctl_timing_type',
        CHANGE_ORDER:   'custrecord_bc_ctl_change_order',
        COST_CODE:      'custrecord_bc_ctl_cost_code',
        COST_TYPE:      'custrecord_bc_ctl_cost_type',
        NEEDS_RECALC:   'custrecord_bc_ctl_needs_recalc'
    };

    // ─── Revenue Timing Line Fields ───────────────────────────────────────────
    const RTL_FIELDS = {
        TRANSACTION:    'custrecord_bc_rtl_transaction',
        PROJECT:        'custrecord_bc_rtl_project',
        PERIOD_DATE:    'custrecord_bc_rtl_period_date',
        PERCENTAGE:     'custrecord_bc_rtl_percentage',
        AMOUNT:         'custrecord_bc_rtl_amount',
        CUMULATIVE_PCT: 'custrecord_bc_rtl_cumulative_pct',
        CUMULATIVE_AMT: 'custrecord_bc_rtl_cumulative_amt',
        STATUS:         'custrecord_bc_rtl_status',
        LABEL:          'custrecord_bc_rtl_label',
        SOURCE:         'custrecord_bc_rtl_source',
        SOURCE_GROUP:   'custrecord_bc_rtl_source_group',
        SOURCE_TEMPLATE:'custrecord_bc_rtl_source_template',
        TIMING_TYPE:    'custrecord_bc_rtl_timing_type',
        CHANGE_ORDER:   'custrecord_bc_rtl_change_order',
        NEEDS_RECALC:   'custrecord_bc_rtl_needs_recalc'
    };

    // ─── Cost Timing Template Fields ──────────────────────────────────────────
    const CTT_FIELDS = {
        NAME:           'name',
        SPREAD_TYPE:    'custrecord_bc_ctt_spread_type',
        PERIOD_INTERVAL:'custrecord_bc_ctt_period_interval',
        NUM_PERIODS:    'custrecord_bc_ctt_num_periods',
        IS_INACTIVE:    'isinactive'
    };

    // ─── Template Line Fields ─────────────────────────────────────────────────
    const CTT_LINE_FIELDS = {
        PARENT:         'custrecord_bc_cttl_parent',
        PERIOD_NUMBER:  'custrecord_bc_cttl_period_number',
        PERCENTAGE:     'custrecord_bc_cttl_percentage'
    };

    // ─── Change Request Billing Item Fields (CO revenue side) ─────────────────
    const CR_BILLING_FIELDS = {
        PARENT_REQUEST:     'custrecord_bc_parent_request',
        ITEM:               'custrecord_bc_item',
        LINE_NUMBER:        'custrecord_bc_line_number',
        AMOUNT:             'custrecord_bc_amount',
        RATE:               'custrecord_bc_rate',
        QUANTITY:           'custrecord_bc_quantity',
        DESCRIPTION:        'custrecord_bc_billing_description',
        STATUS:             'custrecord_bc_chg_request_item_status',
        RELATED_TRANSACTION:'custrecord_bc_related_transaction',
        NEW_CONTRACT_LINE:  'custrecord_bc_new_contract_line',
        RETENTION_PCT:      'custrecord_bc_retention_percentage',
        COST_CODE:          'custrecord_bc_cost_code'
    };

    // ─── Change Request Budget Item Fields (CO cost side) ─────────────────────
    const CR_BUDGET_FIELDS = {
        PARENT:             'custrecordbc_parent',  // NOTE: quirky naming from BC
        BUDGET_ITEM:        'custrecord_bc_budget_item',
        PROPOSED_CHANGE:    'custrecord_bc_proposed_change',
        PROPOSED_HOURS:     'custrecord_bc_proposed_hours',
        PROPOSED_UNITS:     'custrecord_bc_proposed_units',
        COST_CODE:          'custrecord_bc_ch_cost_prop_cost_code',
        COST_TYPE:          'custrecord_bc_ch_cost_prop_cost_type',
        IS_NEW:             'custrecord_bc_ch_cost_is_new',
        STATUS:             'custrecord_bc_chg_request_b_item_status',
        DESCRIPTION:        'custrecord_bc_ch_cost_description'
    };

    // ─── Custom List Values ───────────────────────────────────────────────────
    const SPREAD_TYPE = {
        EVEN:           { id: 1, name: 'Even' },
        FRONT_LOADED:   { id: 2, name: 'Front-Loaded' },
        BACK_LOADED:    { id: 3, name: 'Back-Loaded' },
        MILESTONE:      { id: 4, name: 'Milestone' },
        CUSTOM:         { id: 5, name: 'Custom' }
    };

    const PERIOD_INTERVAL = {
        WEEKLY:         { id: 1, name: 'Weekly' },
        BIWEEKLY:       { id: 2, name: 'Bi-Weekly' },
        MONTHLY:        { id: 3, name: 'Monthly' }
    };

    const TIMING_TYPE = {
        CASH_FLOW:      { id: 1, name: 'Cash Flow' },
        ACCRUAL:        { id: 2, name: 'Accrual' }
    };

    const SOURCE = {
        TEMPLATE:       { id: 1, name: 'Template' },
        MANUAL:         { id: 2, name: 'Manual' }
    };

    const SOURCE_GROUP = {
        BASE_CONTRACT:  { id: 1, name: 'Base Contract' },
        CHANGE_ORDER:   { id: 2, name: 'Change Order' },
        BASE_PO:        { id: 3, name: 'Base PO' }
    };

    const STATUS = {
        FORECASTED:     { id: 1, name: 'Forecasted' },
        ACTUALIZED:     { id: 2, name: 'Actualized' },
        RECEIVED:       { id: 3, name: 'Received' },
        OVERDUE:        { id: 4, name: 'Overdue' }
    };

    // ─── BlueCollar Brand ─────────────────────────────────────────────────────
    const BRAND = {
        NAVY:           '#04233D',
        NAVY_LIGHT:     '#0A3A66',
        GOLD:           '#FFB703',
        GOLD_LIGHT:     '#FCD86D',
        WHITE:          '#FFFFFF',
        GREY_LIGHT:     '#F5F7FA',
        GREY_MID:       '#D1D5DB',
        GREY_DARK:      '#6B7280',
        GREEN:          '#10B981',
        GREEN_LIGHT:    '#E8F5E9',
        RED:            '#EF4444',
        RED_LIGHT:      '#FFEBEE',
        FONT_FAMILY:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        BORDER_RADIUS:  '6px',
        BOX_SHADOW:     '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)'
    };

    // ─── Permission Keys ──────────────────────────────────────────────────────
    const PERMISSIONS = {
        VIEW:               'COSTTIMINGVIEW',
        CREATE_COST:        'COSTTIMINGCREATE',
        CREATE_REVENUE:     'REVENUETIMINGCREATE',
        CREATE_CO:          'COTIMINGCREATE',
        TEMPLATE_MANAGE:    'COSTTIMINGTEMPLATE',
        DELETE:             'COSTTIMINGDELETE',
        LABOR_FORECAST:     'LABORFORECASTCREATE'
    };

    // ─── Built-in Template Patterns (for POC — production uses custom records) ─
    const BUILT_IN_TEMPLATES = [
        {
            id: 'even_3',
            name: 'Even Spread — 3 Months',
            spreadType: SPREAD_TYPE.EVEN.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 33.34 },
                { periodNumber: 2, percentage: 33.33 },
                { periodNumber: 3, percentage: 33.33 }
            ]
        },
        {
            id: 'even_6',
            name: 'Even Spread — 6 Months',
            spreadType: SPREAD_TYPE.EVEN.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 16.67 },
                { periodNumber: 2, percentage: 16.67 },
                { periodNumber: 3, percentage: 16.67 },
                { periodNumber: 4, percentage: 16.67 },
                { periodNumber: 5, percentage: 16.67 },
                { periodNumber: 6, percentage: 16.65 }
            ]
        },
        {
            id: 'front_loaded_6',
            name: 'Front-Loaded — 6 Months',
            spreadType: SPREAD_TYPE.FRONT_LOADED.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 30 },
                { periodNumber: 2, percentage: 25 },
                { periodNumber: 3, percentage: 20 },
                { periodNumber: 4, percentage: 12 },
                { periodNumber: 5, percentage: 8 },
                { periodNumber: 6, percentage: 5 }
            ]
        },
        {
            id: 'back_loaded_6',
            name: 'Back-Loaded — 6 Months',
            spreadType: SPREAD_TYPE.BACK_LOADED.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 5 },
                { periodNumber: 2, percentage: 8 },
                { periodNumber: 3, percentage: 12 },
                { periodNumber: 4, percentage: 20 },
                { periodNumber: 5, percentage: 25 },
                { periodNumber: 6, percentage: 30 }
            ]
        },
        {
            id: 'milestone_2',
            name: 'Milestone — 50/50',
            spreadType: SPREAD_TYPE.MILESTONE.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 50 },
                { periodNumber: 2, percentage: 50 }
            ]
        },
        {
            id: 'milestone_deposit',
            name: 'Milestone — 25% Deposit + Balance',
            spreadType: SPREAD_TYPE.MILESTONE.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 25 },
                { periodNumber: 2, percentage: 75 }
            ]
        },
        {
            id: 'milestone_progress_4',
            name: 'Progress Payments — 4 Equal',
            spreadType: SPREAD_TYPE.MILESTONE.id,
            interval: PERIOD_INTERVAL.MONTHLY.id,
            periods: [
                { periodNumber: 1, percentage: 25 },
                { periodNumber: 2, percentage: 25 },
                { periodNumber: 3, percentage: 25 },
                { periodNumber: 4, percentage: 25 }
            ]
        }
    ];

    return {
        RECORDS,
        CTL_FIELDS,
        RTL_FIELDS,
        CTT_FIELDS,
        CTT_LINE_FIELDS,
        CR_BILLING_FIELDS,
        CR_BUDGET_FIELDS,
        SPREAD_TYPE,
        PERIOD_INTERVAL,
        TIMING_TYPE,
        SOURCE,
        SOURCE_GROUP,
        STATUS,
        BRAND,
        PERMISSIONS,
        BUILT_IN_TEMPLATES
    };
});

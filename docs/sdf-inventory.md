# BC Cash Flow — Object Inventory

The custom objects in the Data Airflow sandbox that support BC Cash Flow Forecasting.

---

## 1. Scripts (10)

| Name | Script ID | Type | Mounted on | Purpose |
|------|-----------|------|------------|---------|
| BC Cash Flow - Combined Report | `customscript_bc_cf_combined_sl` | Suitelet | Iframe on BC Project | Combined per-project report: paired Revenue+Cost bars, cumulative-net trend, source-grouped table. |
| BC Cash Flow - Cost Report | `customscript_bc_cf_cost_report_sl` | Suitelet | Iframe on BC Project | Cost-only per-project report. |
| BC Cash Flow - Revenue Report | `customscript_bc_cf_rev_report_sl` | Suitelet | Iframe on BC Project | Revenue-only per-project report. KPIs surface Base Contract vs Change Orders. |
| BC Cash Flow - Portfolio | `customscript_bc_cf_portfolio_sl` | Suitelet | Standalone — BlueCollar → Project Control Center → Cash Flow Portfolio | Cross-project rollup with 5-dim filter pill (Active + Project / PM / Customer / Subsidiary). |
| BC Cash Flow - Data Endpoint | `customscript_bc_cf_data_sl` | Suitelet (JSON) | Called by the 4 report Suitelets | Action-routed JSON endpoint. Returns combined / cost / revenue / portfolio data based on the `action` parameter. |
| BC Timing Data AJAX Endpoint | `customscript_bc_timing_data_sl` | Suitelet (JSON) | Called by the 3 schedule editors | CRUD endpoint for cost / revenue / CO timing lines. |
| BC Cost Timing - PO Schedule | `customscript_bc_cost_timing_ue` | User Event | Purchase Order | Stamps the schedule editor into `custbody_bc_cost_timing_html`. |
| BC Revenue Timing - SO Schedule | `customscript_bc_rev_timing_ue` | User Event | Sales Order | Stamps the schedule editor into `custbody_bc_rev_timing_html`. |
| BC Cash Flow - Project Reports | `customscript_bc_cf_project_ue` | User Event | BC Project | Stamps the 3 report iframes into the 3 INLINEHTML fields on the Cash Flow subtab. |
| BC CO Timing - Change Request Schedule | `customscript_bc_co_timing_ue` | User Event | BC Change Request | Renders the dual-pane Contract / Estimate Schedule. |

Every script has a single matching deployment (`customscript_*` → `customdeploy_*`).

---

## 2. Custom Records (4)

| Script ID | Name | Description |
|-----------|------|-------------|
| `customrecord_bc_cost_timing_line` | BC Cost Timing Line | Time-phased cost forecast per PO or Change Order. No GL impact. |
| `customrecord_bc_revenue_timing_line` | BC Revenue Timing Line | Time-phased revenue forecast per contract. No GL impact. |
| `customrecord_bc_cost_timing_template` | BC Cost Timing Template | Reusable spread-pattern templates (S-curve / Linear / Front / Back). |
| `customrecord_bc_ctt_line` | BC Cost Timing Template Line | Individual period within a timing template (period number + percentage). |

---

## 3. Custom Record Fields

### `customrecord_bc_cost_timing_line` (17 fields)

| Field ID | Label | Type | Source / Target |
|----------|-------|------|-----------------|
| `custrecord_bc_ctl_transaction` | Transaction | List/Record | Transaction |
| `custrecord_bc_ctl_project` | Project | List/Record | BC Project (`customrecord_cseg_bc_project`) |
| `custrecord_bc_ctl_period_date` | Period Date | Date | — |
| `custrecord_bc_ctl_percentage` | Percentage | Percent | — |
| `custrecord_bc_ctl_amount` | Amount | Currency | — |
| `custrecord_bc_ctl_cumulative_pct` | Cumulative % | Percent | — |
| `custrecord_bc_ctl_cumulative_amt` | Cumulative Amount | Currency | — |
| `custrecord_bc_ctl_status` | Status | List/Record | `customlist_bc_ctl_status` |
| `custrecord_bc_ctl_label` | Label / Note | Free-form Text | — |
| `custrecord_bc_ctl_source` | Source | List/Record | `customlist_bc_ctl_source` |
| `custrecord_bc_ctl_source_group` | Source Group | List/Record | `customlist_bc_ctl_source_group` |
| `custrecord_bc_ctl_timing_type` | Timing Type | List/Record | `customlist_bc_ctl_timing_type` |
| `custrecord_bc_ctl_source_template` | Source Template | List/Record | BC Cost Timing Template |
| `custrecord_bc_ctl_change_order` | Related Change Order | List/Record | BC Change Request (`customrecord_bc_change_req`) |
| `custrecord_bc_ctl_cost_code` | Related Cost Code | List/Record | BC Cost Code (`customrecord_cseg_bc_cost_code`) |
| `custrecord_bc_ctl_cost_type` | Cost Type (GL Account) | List/Record | Account |
| `custrecord_bc_ctl_needs_recalc` | Needs Recalculation | Check Box | — |

### `customrecord_bc_revenue_timing_line` (15 fields)

| Field ID | Label | Type | Source / Target |
|----------|-------|------|-----------------|
| `custrecord_bc_rtl_transaction` | Contract (Sales Order) | List/Record | Transaction |
| `custrecord_bc_rtl_project` | Project | List/Record | BC Project |
| `custrecord_bc_rtl_period_date` | Period Date | Date | — |
| `custrecord_bc_rtl_percentage` | Percentage | Percent | — |
| `custrecord_bc_rtl_amount` | Amount | Currency | — |
| `custrecord_bc_rtl_cumulative_pct` | Cumulative % | Percent | — |
| `custrecord_bc_rtl_cumulative_amt` | Cumulative Amount | Currency | — |
| `custrecord_bc_rtl_status` | Status | List/Record | `customlist_bc_ctl_status` |
| `custrecord_bc_rtl_label` | Label / Note | Free-form Text | — |
| `custrecord_bc_rtl_source` | Source | List/Record | `customlist_bc_ctl_source` |
| `custrecord_bc_rtl_source_group` | Source Group | List/Record | `customlist_bc_ctl_source_group` |
| `custrecord_bc_rtl_timing_type` | Timing Type | List/Record | `customlist_bc_ctl_timing_type` |
| `custrecord_bc_rtl_source_template` | Source Template | List/Record | BC Cost Timing Template |
| `custrecord_bc_rtl_change_order` | Related Change Order | List/Record | BC Change Request |
| `custrecord_bc_rtl_needs_recalc` | Needs Recalculation | Check Box | — |

### `customrecord_bc_cost_timing_template` (3 fields)

| Field ID | Label | Type | Source / Target |
|----------|-------|------|-----------------|
| `custrecord_bc_ctt_spread_type` | Spread Type | List/Record | `customlist_bc_ctt_spread_type` |
| `custrecord_bc_ctt_period_interval` | Period Interval | List/Record | `customlist_bc_ctt_period_interval` |
| `custrecord_bc_ctt_num_periods` | Number of Periods | Integer Number | — |

### `customrecord_bc_ctt_line` (3 fields)

| Field ID | Label | Type | Source / Target |
|----------|-------|------|-----------------|
| `custrecord_bc_cttl_parent` | Template | List/Record | BC Cost Timing Template |
| `custrecord_bc_cttl_period_number` | Period Number | Integer Number | — |
| `custrecord_bc_cttl_percentage` | Percentage | Percent | — |

---

## 4. Custom Lists (6)

| Script ID | Name | Values | Used by |
|-----------|------|--------|---------|
| `customlist_bc_ctl_source` | BC Timing Line Source | Template, Manual | `*_source` on cost and revenue timing-line records |
| `customlist_bc_ctl_source_group` | BC Timing Source Group | Base Contract, Change Order, Base PO | `*_source_group` on cost and revenue timing-line records |
| `customlist_bc_ctl_status` | BC Timing Line Status | Forecasted, Actualized, Received, Overdue | `*_status` on cost and revenue timing-line records |
| `customlist_bc_ctl_timing_type` | BC Timing Type | Cash Flow, Accrual | `*_timing_type` on cost and revenue timing-line records; backs the Cash / Accrual UI toggle |
| `customlist_bc_ctt_period_interval` | BC Period Interval | Weekly, Bi-Weekly, Monthly | `custrecord_bc_ctt_period_interval` on the template record |
| `customlist_bc_ctt_spread_type` | BC Spread Type | Even, Front-Loaded, Back-Loaded, Milestone, Custom | `custrecord_bc_ctt_spread_type` on the template record |

---

## 5. Inline HTML Mount Fields (6)

Each field is an INLINEHTML field that a User Event script writes HTML into on `beforeLoad`. They have no stored value.

| Field ID | Label | Lives on | Stamped by |
|----------|-------|----------|------------|
| `custbody_bc_cost_timing_html` | Cost Timing Schedule | Purchase Order | `bc_cost_timing_ue.js` |
| `custbody_bc_rev_timing_html` | Revenue Timing Schedule | Sales Order | `bc_rev_timing_ue.js` |
| `custrecord_bc_co_timing_html` | CO Timing Schedule | BC Change Request | `bc_co_timing_ue.js` |
| `custrecord_bc_cf_combined_html` | Combined Cash Flow Forecast | BC Project | `bc_cf_project_ue.js` |
| `custrecord_bc_cf_cost_html` | Cost Cash Flow Timeline | BC Project | `bc_cf_project_ue.js` |
| `custrecord_bc_cf_revenue_html` | Revenue Cash Flow Timeline | BC Project | `bc_cf_project_ue.js` |

---

## 6. Supporting Modules

The entry-point scripts depend on a small set of pure SuiteScript modules in the file cabinet. They are not deployed as scripts — they are imported via `define([...])` by the entry points.

| Module | File | Purpose |
|--------|------|---------|
| Schedule math | `bc_cf_calculator.js` | Pure functions for spread shapes (S-curve / Linear / Front / Back), normalization, generate, rebalance, end-date computation. |
| HTML builders | `bc_cf_ui.js` | Shared HTML helpers (esc, panel, kpi, badge, toggle, skeleton, error card). |
| Design tokens | `bc_cf_styles.js` | Shared CSS variable palette and primitive styles for every Cash Flow surface. |
| Report utilities | `bc_cf_report_utils.js` | Legacy report helpers; mostly orphaned after the v1 redesign. |
| Schedule editor UI | `bc_timing_ui.js` | Calculator toolbar + grid HTML + the inline client IIFE rendered into the INLINEHTML mount fields. |
| Schedule engine | `bc_timing_engine.js` | Server-side math engine for the schedule editor (weights, regenerate, rebalance). |
| Timing DAO | `bc_timing_dao.js` | SuiteQL reads + `N/record` writes for cost / revenue timing line records. Called by the Timing Data Suitelet. |
| Timing constants | `bc_timing_constants.js` | Brand config + list-value internal IDs + field-ID shorthand used by every entry point. |

---

## 7. Process Flow Diagram

Three end-user actions, traced step by step through the records and scripts that carry them.

### Flow A · User edits a timing schedule on a transaction

1. **User opens** a Purchase Order, Sales Order, or BC Change Request.
2. **User Event script fires** on `beforeLoad`:
   - `customscript_bc_cost_timing_ue` (PO)
   - `customscript_bc_rev_timing_ue` (SO)
   - `customscript_bc_co_timing_ue` (CR)
3. **UE stamps the schedule editor HTML** into the INLINEHTML mount field:
   - PO → `custbody_bc_cost_timing_html`
   - SO → `custbody_bc_rev_timing_html`
   - CR → `custrecord_bc_co_timing_html`
4. **User clicks Generate** (or edits a row, or clicks Rebalance / Save). The editor JS runs locally; math comes from `bc_cf_calculator.js` and `bc_timing_engine.js`.
5. **Editor JS posts to the Timing Data Suitelet** (`customscript_bc_timing_data_sl`).
6. **Timing Data Suitelet** uses `bc_timing_dao.js` to read or write:
   - `customrecord_bc_cost_timing_line`
   - `customrecord_bc_revenue_timing_line`

### Flow B · User opens Cash Flow reports on a BC Project record

1. **User opens** a BC Project record (`customrecord_cseg_bc_project`).
2. **Project User Event fires** (`customscript_bc_cf_project_ue`) on `beforeLoad`.
3. **UE stamps 3 iframes** into the 3 INLINEHTML fields on the Cash Flow subtab:
   - `custrecord_bc_cf_combined_html`
   - `custrecord_bc_cf_cost_html`
   - `custrecord_bc_cf_revenue_html`
4. **Each iframe loads its report Suitelet**:
   - `customscript_bc_cf_combined_sl`
   - `customscript_bc_cf_cost_report_sl`
   - `customscript_bc_cf_rev_report_sl`
5. **Each report Suitelet returns a skeleton HTML page**, then its client JS fetches JSON from the Data Endpoint Suitelet (`customscript_bc_cf_data_sl`).
6. **Data Endpoint runs SuiteQL** over `customrecord_bc_cost_timing_line` + `customrecord_bc_revenue_timing_line`, returns aggregated JSON.
7. **Report client JS renders** KPIs, chart, and source-grouped table.

### Flow C · User opens the cross-project Portfolio report

1. **User clicks** BlueCollar → Project Control Center → Cash Flow Portfolio.
2. **Portfolio Suitelet loads** (`customscript_bc_cf_portfolio_sl`) and returns a skeleton page.
3. **Client JS fetches JSON** from the same Data Endpoint Suitelet, but with `action=portfolio` and the active filter values.
4. **Data Endpoint rolls up** every BC project's timing lines into one response.
5. **Portfolio client JS renders** the filter pill, KPIs, chart, and one-row-per-project table.


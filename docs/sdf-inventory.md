# BC Cash Flow — Object Inventory

The custom objects in the Data Airflow sandbox that support BC Cash Flow Forecasting.

---

## 1. Scripts (10)

| # | Name | Script ID | Type | Mounted on | Purpose |
|---|------|-----------|------|------------|---------|
| 1 | BC Cash Flow - Combined Report | `customscript_bc_cf_combined_sl` | Suitelet | Iframe on BC Project record | Per-project combined report: KPIs, paired Revenue+Cost bars + cumulative-net trend, source-grouped table. |
| 2 | BC Cash Flow - Cost Report | `customscript_bc_cf_cost_report_sl` | Suitelet | Iframe on BC Project record | Per-project cost-only report. |
| 3 | BC Cash Flow - Revenue Report | `customscript_bc_cf_rev_report_sl` | Suitelet | Iframe on BC Project record | Per-project revenue-only report. KPIs surface Base Contract vs Change Orders. |
| 4 | BC Cash Flow - Portfolio | `customscript_bc_cf_portfolio_sl` | Suitelet | Standalone page — BlueCollar → Project Control Center → Cash Flow Portfolio | Cross-project rollup, one row per project, 5-dimension filter pill (Active + Project / PM / Customer / Subsidiary). |
| 5 | BC Cash Flow - Data Endpoint | `customscript_bc_cf_data_sl` | Suitelet (JSON) | Called by the 4 report Suitelets | Action-routed JSON endpoint. `?action=combined\|cost\|revenue\|portfolio&projectId=…&mode=cash\|accrual`. |
| 6 | BC Timing Data AJAX Endpoint | `customscript_bc_timing_data_sl` | Suitelet (JSON) | Called by the 3 schedule editors | CRUD endpoint for cost / revenue / CO timing lines. |
| 7 | BC Cost Timing - PO Schedule | `customscript_bc_cost_timing_ue` | User Event | Purchase Order | Stamps the schedule editor into `custbody_bc_cost_timing_html` on the Cash Flow subtab. |
| 8 | BC Revenue Timing - SO Schedule | `customscript_bc_rev_timing_ue` | User Event | Sales Order | Stamps the schedule editor into `custbody_bc_rev_timing_html` on the Cash Flow subtab. |
| 9 | BC Cash Flow - Project Reports | `customscript_bc_cf_project_ue` | User Event | BC Project (`customrecord_cseg_bc_project`) | Stamps the 3 report iframes into the 3 INLINEHTML fields on the BC Project record's Cash Flow subtab. |
| 10 | BC CO Timing - Change Request Schedule | `customscript_bc_co_timing_ue` | User Event | BC Change Request (`customrecord_bc_change_req`) | Renders the dual-pane Contract / Estimate Schedule on the Cash Flow subtab. |

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

## 6. Relationship Diagram

```
                          BC Project                BC Change Request
                          (customrecord_cseg_       (customrecord_bc_
                           bc_project)               change_req)
                          BC Cost Code
                          (customrecord_cseg_
                           bc_cost_code)
                              ▲   ▲   ▲
                              │   │   │ referenced by
                              │   │   │
              ┌───────────────┴───┴───┴───────────────┐
              │                                       │
   customrecord_bc_cost_timing_line       customrecord_bc_revenue_timing_line
              │                                       │
              │ template ref                          │ template ref
              ▼                                       ▼
       customrecord_bc_cost_timing_template ──┐
                                              │ parent
                                              ▼
                                  customrecord_bc_ctt_line


   ── Report path ───────────────────────────────────────────────────

   bc_cf_data_sl  (?action=combined|cost|revenue|portfolio)
        ▲
        │ fetched by
        ├── bc_cf_combined_sl        (iframe on BC Project)
        ├── bc_cf_cost_report_sl     (iframe on BC Project)
        ├── bc_cf_rev_report_sl      (iframe on BC Project)
        └── bc_cf_portfolio_sl       (standalone — Reports menu)

   BC Project → bc_cf_project_ue → stamps the 3 iframes into
                custrecord_bc_cf_combined_html
                custrecord_bc_cf_cost_html
                custrecord_bc_cf_revenue_html


   ── Schedule editor path ──────────────────────────────────────────

   bc_timing_data_sl  (CRUD)
        ▲
        │ AJAX save/load
        │
   Purchase Order   → bc_cost_timing_ue → custbody_bc_cost_timing_html
   Sales Order      → bc_rev_timing_ue  → custbody_bc_rev_timing_html
   Change Request   → bc_co_timing_ue   → custrecord_bc_co_timing_html
```

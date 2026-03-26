# BC Cash Flow Forecasting — Project Status

## Current Phase: POC Live + Actuals Integration In Progress

**Date**: 2026-03-26
**Demo**: Data Airflow — COMPLETED SUCCESSFULLY ("absolutely crushed it")
**Account**: TD2984799 - BlueCollar Demo Trailing
**Repo**: https://github.com/archero34/bc-cashflow
**Demo Project**: Data Airflow - Cash Flow Demo (ID: 1807, DEMO-2026-DAF-001)

---

## What's Working

### Schedule Subtabs (PO, SO, Change Request)
- Cash Flow + Accrual timing grids on PO, SO, Change Request
- Template apply (7 built-in patterns), manual date/percentage editing
- Currency formatting, cumulative calculations, 100% validation badge
- SO automatically excludes CO-added lines (Original Contract = Total - CO Billing Impacts)
- CO has Contract/Estimate toggle (not stacked panes)
- Amount-driven entry: type a dollar amount → percentage back-calculates
- Save persists to custom records via AJAX Suitelet endpoint
- Delete via diff-based save (removed lines get deleted on save)

### Project-Level Reports (Cash Flow tab — 3 iframed Suitelets)
- **Combined**: Revenue vs Cost = Net, KPIs, bar chart, Cash Flow/Accrual toggle, drillable links, current month highlight, Export CSV/PDF
- **Cost**: Cost outflows by vendor/CO, bar chart, drillable links
- **Revenue**: Revenue inflows by Base Bid/CO, bar chart, drillable links
- **Actuals Integration** (in progress): Bills, invoices, payments pulled via SuiteQL
  - Revenue: Invoiced (CustInvc) + Collected (CustPymt) — WORKING
  - Cost: Billed (VendBill) — WORKING. Paid (VendPmt) — NEEDS VALIDATION
  - Each query independent (payment failure doesn't kill bills)
  - Actual rows styled with muted italic + subtle background
  - KPIs: Received to Date, Paid to Date, Actual Invoiced, Actual Billed

### Known Issues (Current)
- **VendPmt query** may not match if payment not created FROM the bill directly. Uses `pmt.createdfrom IN (SELECT bill.id ...)` — needs validation with actual payment data
- **Amount-driven manual entry** works for new lines but has edge cases when existing lines were created at a different source amount
- **Template dropdown** resets to "Choose a Template" on reload (cosmetic — template ID not stored on timing lines)

---

## Architecture

```
Purchase Order → Schedule subtab → custbody_bc_cost_timing_html
                  └── UE: bc_cost_timing_ue.js (populates existing INLINEHTML field)

Sales Order    → Schedule subtab → custbody_bc_rev_timing_html
                  └── UE: bc_rev_timing_ue.js (BC Contract gate + original contract calc)

Change Request → Schedule subtab → custrecord_bc_co_timing_html
                  └── UE: bc_co_timing_ue.js (Contract/Estimate toggle)
                  ├── Contract → Revenue timing (transactionId = parent SO)
                  └── Estimate → Cost timing (transactionId = null, keyed by CO)

Project Record → Cash Flow tab (3 INLINEHTML fields, each loading an iframe)
                  ├── Combined → custrecord_bc_cf_combined_html
                  ├── Cost     → custrecord_bc_cf_cost_html
                  └── Revenue  → custrecord_bc_cf_revenue_html
                  └── UE: bc_cf_project_ue.js (populates all 3 fields with iframe HTML)
```

### Shared Modules (FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/)
- `bc_timing_ui.js` (~1,900 lines) — Inline HTML/CSS/JS renderer
- `bc_timing_engine.js` — Template application, validation, recalculation
- `bc_timing_dao.js` — SuiteQL reads + N/record writes
- `bc_timing_constants.js` — Field IDs, list values, brand config

### Entry Points (FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/)
- `bc_timing_data_sl.js` — AJAX Suitelet for all timing CRUD
- `bc_cost_timing_ue.js` — PO Schedule subtab
- `bc_rev_timing_ue.js` — SO Schedule subtab
- `bc_co_timing_ue.js` — CO Schedule subtab (dual-pane)
- `bc_cf_project_ue.js` — Project Cash Flow tab
- `bc_cf_combined_sl.js` — Combined report Suitelet
- `bc_cf_cost_report_sl.js` — Cost report Suitelet
- `bc_cf_rev_report_sl.js` — Revenue report Suitelet

---

## Deploy Commands

```bash
# File-only updates (preferred for iteration):
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/FILE.js"

# Multiple files:
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js" "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js"

# Full project deploy (new objects only — records excluded):
npx suitecloud project:deploy

# NEVER use full deploy for code-only changes — it overwrites manual UI field fixes
```

### Objects/records/ is EXCLUDED from deploy.xml
Custom record fields were manually changed from INTEGER to List/Record in the NS UI to reference BC SuiteApp records. SDF deploy reverts these. The records path is commented out in deploy.xml.

---

## Manual Setup (not SDF-deployable)

| Item | Record | Done |
|------|--------|------|
| `custrecord_bc_cf_combined_html` | BC Project | Yes |
| `custrecord_bc_cf_cost_html` | BC Project | Yes |
| `custrecord_bc_cf_revenue_html` | BC Project | Yes |
| `custrecord_bc_co_timing_html` | BC Change Request | Yes |
| UE deploy: bc_cf_project_ue.js | BC Project | Yes |
| UE deploy: bc_co_timing_ue.js | BC Change Request | Yes |
| List/Record field type fixes | Timing records | Yes |

---

## Key SuiteQL Gotchas Discovered

| Issue | Solution |
|-------|----------|
| `entity.companyname` not found | Use `entity.entitytitle` |
| `account.acctname` NOT_EXPOSED | Use `account.accountsearchdisplayname` |
| PERCENT fields return decimals (0.5 = 50%) | Multiply by 100 on load |
| Invoice line `foreignamount` is NEGATIVE | Use `SUM(-tl.foreignamount)` |
| Customer payment `foreigntotal` is NEGATIVE | Use `SUM(-pmt.foreigntotal)` |
| Payment→Invoice join creates cross-product | Use EXISTS subquery |
| VendPmt `transactionline.createdfrom` empty | Use `pmt.createdfrom` (header) or IN subquery |
| Custom segment on transactionline | `tl.cseg_bc_project` works in SuiteQL |
| BC Change Request status field | `custrecord_bc_request_status` (not `chg_request_status`) |
| BC Change Request project field | `custrecord_bc_blue_collar_proj` (not `cseg_bc_project`) |
| BC Contract checkbox | `custbody_bc_is_bluecollar_contract` |
| CO number field | `custrecord_bc_change_order_number` |
| CO related SO | `custrecord_bc_related_transactions` |

---

## Demo Scenario Data

**Project**: Data Airflow - Cash Flow Demo (ID: 1807)
**Customer**: Bolder Construction Inc. (ID: 197)
**Contract**: SO0631 | $30,000 base + $12,000 CO = $42,000 current
**PO A**: Phoenix Mechanical Supply | $15,000 (ID: 16240)
**PO B**: Metro Electric Supply | $8,000 (ID: 16241)
**CO**: CO-001 | $12K billing / $10K estimate

---

## What's NOT Built Yet

| Feature | Phase |
|---------|-------|
| Labor timing | 2 |
| Task/schedule integration | 2 |
| Portfolio view (all projects) | 2 |
| Status updater scheduled script | 2 |
| Alerts / email digests | 2 |
| Dashboard portlets | 2 |
| Lock/unlock schedule | 2 |
| Template stored on timing lines | 2 |
| Subcontract CO handling | 2 |

---

## Session History

**2026-03-25/26 overnight**: Built entire POC from scratch. 12 scripts, 34 tests, 20+ bug fixes. Deployed via SDF. Demo to Data Airflow — success.

**2026-03-26 post-demo**: Added actuals integration (bills, invoices, payments). Fixed SuiteQL joins, negative amounts, cross-product inflation. Split queries for resilience. Polished report charts (simplified sparklines, hover tooltips, drillable links). Fixed amount-driven entry UX. Created demo project + cheatsheet.

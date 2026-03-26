# BC Cash Flow Forecasting — Project Status

## Current Phase: POC Live — Demo Ready

**Date**: 2026-03-26
**Demo**: Data Airflow follow-up — TODAY
**Account**: TD2984799 - BlueCollar Demo Trailing

---

## What's Working

### Schedule Subtabs (PO, SO, Change Request)
- **Purchase Order**: Schedule subtab with Cash Flow + Accrual timing grids. Template apply, manual edit, save. Full currency formatting, cumulative calculations, 100% validation.
- **Sales Order (Contract)**: Same UX. Automatically excludes CO-added lines from the schedule amount (Original Contract = Current Total - CO Billing Impacts).
- **Change Request**: Contract/Estimate toggle. Contract side schedules CO revenue timing (saves against parent SO). Estimate side schedules CO cost timing (no parent transaction). Both have Cash Flow + Accrual views.

### Project-Level Reports (Cash Flow tab)
- **Combined Cash Flow Forecast**: Revenue In vs Cost Out = Net Cash Position by month. KPI cards, inline SVG bar chart, Cash Flow/Accrual toggle, Export CSV/PDF.
- **Cost Cash Flow Report**: Cost outflows by vendor/CO, time-phased by month.
- **Revenue Cash Flow Report**: Revenue inflows by Base Bid/CO, time-phased by month.

### Infrastructure
- 4 custom records deployed (cost timing line, revenue timing line, template, template line)
- 6 custom lists deployed
- 12 SuiteScript files (4 modules, 4 Suitelets, 4 UE scripts)
- 34 Jest unit tests passing
- Full SDF project with CI-ready structure

---

## Architecture

```
Purchase Order → Schedule subtab → custbody_bc_cost_timing_html
Sales Order    → Schedule subtab → custbody_bc_rev_timing_html
Change Request → Schedule subtab → custrecord_bc_co_timing_html
                  ├── Contract toggle → Revenue timing (→ parent SO)
                  └── Estimate toggle → Cost timing (no txn, keyed by CO)

Project Record → Cash Flow tab
                  ├── Combined → custrecord_bc_cf_combined_html (iframe)
                  ├── Cost     → custrecord_bc_cf_cost_html (iframe)
                  └── Revenue  → custrecord_bc_cf_revenue_html (iframe)
```

All timing UIs use shared modules: `bc_timing_ui.js` (1,860 lines), `bc_timing_engine.js`, `bc_timing_dao.js`, `bc_timing_constants.js`.

---

## Key Bugs Fixed During Build

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Save fails on dates | HTML date inputs send ISO (YYYY-MM-DD), NS expects MM/DD/YYYY | Parse ISO in Suitelet |
| Percentages show 0.5 not 50 | SuiteQL PERCENT returns decimals | Multiply by 100 on load |
| Cumulatives disappear | Stored values unreliable | Recalculate on load |
| SO Schedule blank | Wrong BC Contract checkbox field ID | `custbody_bc_is_bluecollar_contract` |
| CO Estimate crashes page | `<button>` defaults to submit inside NS form | Added `type="button"` |
| CO save fails | Transaction field rejects CR ID (not a transaction) | Revenue → parent SO; Cost → keyed by changeOrderId |
| CO Estimate save rejected | Suitelet validation requires transactionId | Allow changeOrderId as alternative key |
| Report entity name error | `entity.companyname` not in SuiteQL | Use `entity.entitytitle` |
| Report account name error | `account.acctname` NOT_EXPOSED | Use `account.accountsearchdisplayname` |
| SO double-counts CO | Total includes CO lines | Subtract CO billing impacts from current total |
| SDF overwrites UI field fixes | Deploy.xml includes records/ | Commented out records path |

---

## Manual Setup (not SDF-deployable)

| Item | Why Manual | Done |
|------|-----------|------|
| `custrecord_bc_cashflow_html` on Project | Can't add fields to records we don't own via SDF | Yes |
| `custrecord_bc_cf_cost_html` on Project | Same | Yes |
| `custrecord_bc_cf_revenue_html` on Project | Same | Yes |
| `custrecord_bc_cf_combined_html` on Project | Same | Yes |
| `custrecord_bc_co_timing_html` on Change Request | Same | Yes |
| UE deploy: `bc_cf_project_ue.js` on Project | Script deploy on custom record | Yes |
| UE deploy: `bc_co_timing_ue.js` on Change Request | Script deploy on custom record | Yes |
| List/Record field type fixes on timing records | SDF deploys as INTEGER, converted in UI | Yes |

---

## Not in POC

| Feature | Status | Phase |
|---------|--------|-------|
| Labor timing | Diagram/narrative for demo | 2 |
| Task/schedule integration | Not built | 2 |
| Portfolio view (all projects) | Not built | 2 |
| Scheduled script status updater | Not built | 2 |
| Subcontract CO handling | Excluded | 2 |
| Alerts / email digests | Not built | 2 |
| Dashboard portlets | Not built | 2 |

---

## Demo Scenario

Project: Phoenix Datacenter
- Contract (SO0629): $1,500,000 original + $120,000 CO = $1,620,000 current
- PO (PO1376): $50,000 — Phoenix Mechanical Supply
- Change Request (CO-001): $120,000 billing / $60,000 estimate
- Cash Flow + Accrual schedules on all three
- Combined report shows full picture on Project record

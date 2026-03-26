# BC Cash Flow Forecasting — Project Status

## Current Phase: POC Live — Demo Ready

**Date**: 2026-03-26
**Demo**: Data Airflow follow-up — TODAY
**Account**: TD2984799 - BlueCollar Demo Trailing
**Repo**: https://github.com/archero34/bc-cashflow

---

## What's Working

### Schedule Subtabs (PO, SO, Change Request)
- **Purchase Order**: Schedule subtab with Cash Flow + Accrual timing grids. Template apply (7 built-in patterns), manual edit, save. Currency formatting with commas, cumulative calculations, 100% validation badge.
- **Sales Order (Contract)**: Same UX. Automatically calculates original contract value by subtracting CO billing impacts — prevents double-counting CO revenue.
- **Change Request**: Contract/Estimate toggle (not stacked). Contract side schedules CO revenue timing (saves against parent SO). Estimate side schedules CO cost timing (keyed by changeOrderId, no parent transaction). Both have Cash Flow + Accrual views.

### Project-Level Reports (Cash Flow tab)
- **Combined Cash Flow Forecast**: Revenue In vs Cost Out = Net Cash Position by month. Stacked gold-up/navy-down bar chart with hover tooltips, KPI cards (Total Revenue, Total Cost, Net, Status), Cash Flow/Accrual button toggle, drillable links to source transactions, current month highlight, Export CSV/PDF.
- **Cost Cash Flow Report**: Cost outflows by vendor/CO with navy bar chart, hover tooltips, drillable links.
- **Revenue Cash Flow Report**: Revenue inflows by Base Bid/CO with gold bar chart, hover tooltips, drillable links.
- All three reports have consistent UX: button toggle, sparkline chart, drillable links, current month gold highlight.

### Infrastructure
- 4 custom records deployed via SDF (cost timing line, revenue timing line, template, template line)
- 6 custom lists deployed via SDF
- 12 SuiteScript 2.1 files (4 modules, 4 Suitelets, 4 UE scripts)
- 2 transaction body fields deployed via SDF (PO + SO inline HTML)
- 7 SDF script object XMLs with deployments
- 34 Jest unit tests passing
- Full SDF ACP project structure per sdf.md best practices

---

## Architecture

```
Purchase Order → Schedule subtab → custbody_bc_cost_timing_html
                  └── UE: bc_cost_timing_ue.js → populates existing INLINEHTML field
                  └── Cash Flow + Accrual grids

Sales Order    → Schedule subtab → custbody_bc_rev_timing_html
                  └── UE: bc_rev_timing_ue.js → BC Contract gate + original contract calc
                  └── Cash Flow + Accrual grids

Change Request → Schedule subtab → custrecord_bc_co_timing_html
                  └── UE: bc_co_timing_ue.js → Contract/Estimate toggle
                  ├── Contract → Revenue timing (transactionId = parent SO)
                  └── Estimate → Cost timing (transactionId = null, keyed by CO)

Project Record → Cash Flow tab
                  ├── Combined → custrecord_bc_cf_combined_html (iframe → Suitelet)
                  ├── Cost     → custrecord_bc_cf_cost_html (iframe → Suitelet)
                  └── Revenue  → custrecord_bc_cf_revenue_html (iframe → Suitelet)
```

### Shared Modules
- `bc_timing_ui.js` (1,860 lines) — Inline HTML/CSS/JS renderer, BlueCollar branded
- `bc_timing_engine.js` — Template application, validation, recalculation
- `bc_timing_dao.js` — SuiteQL reads + N/record writes, camelCase mapping, PERCENT conversion
- `bc_timing_constants.js` — Field IDs, list values, brand config, built-in templates
- `bc_timing_data_sl.js` — Single AJAX Suitelet endpoint for all timing CRUD

---

## Bugs Fixed During Build (17 total)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Save fails on dates | HTML sends ISO YYYY-MM-DD, NS expects MM/DD/YYYY | Parse ISO in Suitelet |
| Percentages show 0.5 not 50% | SuiteQL PERCENT returns decimals | Multiply by 100 on load |
| Cumulatives disappear on reload | Stored values unreliable | Recalculate on load |
| SO Schedule blank | Wrong BC Contract checkbox field ID | `custbody_bc_is_bluecollar_contract` |
| CO Estimate crashes page | `<button>` defaults to submit inside NS form | Added `type="button"` |
| CO revenue save fails | Transaction field rejects CR ID | Revenue → parent SO via `custrecord_bc_related_transactions` |
| CO cost save rejected | Suitelet requires transactionId | Allow changeOrderId as alternative key |
| CO cost save "missing fields" | Validation rejects transactionId=0 | Accept either txnId OR changeOrderId |
| Report entity name error | `entity.companyname` not in SuiteQL | Use `entity.entitytitle` |
| Report account name error | `account.acctname` NOT_EXPOSED | Use `account.accountsearchdisplayname` |
| CO name shows ID not number | Query used `cr.name` (internal ID) | Use `cr.custrecord_bc_change_order_number` |
| SO double-counts CO revenue | Total includes CO-added lines | Subtract CO billing impacts from current total |
| CO data load fails | Wrong status field + project field on CR | Discovered via `SELECT *` — correct IDs |
| SDF overwrites UI field fixes | deploy.xml includes records/ | Commented out records path |
| Amount column shows raw numbers | `<input type="number">` can't format | Switched to `type="text"` with blur formatting |
| SVG tooltips corrupt chart | Inline HTML breaks SVG attributes | Array-based index lookup via JSON.stringify |
| Subtab/field approach wrong | BC uses pre-existing INLINEHTML fields | Changed to `getField()` pattern |

---

## SDF Deployment Notes

### Deployed via SDF (automated)
- Custom lists (6): timing type, source, source group, status, spread type, period interval
- Custom records (4): cost timing line, revenue timing line, template, template line
- Transaction body fields (2): `custbody_bc_cost_timing_html`, `custbody_bc_rev_timing_html`
- Script files (12): 4 modules + 4 Suitelets + 4 UE entry points
- Script objects (7): with deployments on PO, SO, and 3 Suitelet deploys

### NOT deployed via SDF (manual in NS UI)
| Item | Reason |
|------|--------|
| `custrecord_bc_cashflow_html` + 3 report fields on Project | Can't add fields to records we don't own |
| `custrecord_bc_co_timing_html` on Change Request | Same |
| UE deploy: `bc_cf_project_ue.js` on Project record | Script deploy on custom record |
| UE deploy: `bc_co_timing_ue.js` on Change Request | Same |
| List/Record field type fixes on timing records | SDF deploys as INTEGER, converted manually |

### Deploy commands
```bash
# File-only updates (preferred during iteration):
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/FILE.js"

# Full project deploy (creates new objects, updates existing):
npx suitecloud project:deploy

# NOTE: Objects/records/ excluded from deploy.xml to protect manual field type fixes
```

---

## Not in POC — Future Phases

| Feature | Phase | Notes |
|---------|-------|-------|
| Labor timing Suitelet | 2 | Same template engine, new UE on project |
| Task/schedule integration | 2 | Cost Code as join key (Addendum Tier 1) |
| Portfolio view (all projects) | 2 | Standalone Suitelet, multi-project grid |
| Scheduled script status updater | 2 | Forecasted → Actualized/Received/Overdue |
| Alerts / weekly email digest | 2 | Addendum section 2 |
| Dashboard portlets (saved searches) | 2 | Addendum section 4 |
| Subcontract CO handling | 2 | Data Airflow doesn't use subs |
| S-curve visualization | 2 | Cumulative chart overlay |
| Multi-currency | Future | BC hasn't crossed this bridge yet |
| SOV line-level timing | Future | Currently contract-level |

---

## Demo Scenario — NEXT SESSION

**Source**: Customer-provided spreadsheet (Cashflow-demo-email.md)
**Project**: To be created fresh for the demo

| Source | Type | Amount | Timing |
|--------|------|--------|--------|
| Customer Contract (Base Bid) | Revenue | $30,000 | 25% Apr, 15% May, 25% Jun, 15% Jul, 10% Sep, 10% Nov |
| PO — Vendor A | Cost | $15,000 | 20% May, 30% Jun, 15% Jul, 15% Oct, 20% Dec |
| PO — Vendor B | Cost | $8,000 | 50% Apr, 50% Nov |
| Change Order A (Revenue) | Revenue | $12,000 | 20% Jul, 30% Sep, 50% Dec |
| Change Order A (Cost) | Cost | $10,000 | 20% Jul, 30% Sep, 50% Dec |

**Expected Combined Output**: Revenue $42,000 | Cost $33,000 | Net $9,000

---

## Session Log

**2026-03-25 → 2026-03-26 overnight build session**
- Research: Read all planning docs, demo transcript, user guide. 13 issues identified and reviewed.
- Plan: 9-task build plan approved. 4-hour target.
- Build: 8 parallel agents produced 12 SuiteScript files + SDF scaffolding.
- Code Review: Lint Eastwood found 6 critical/high bugs, all fixed before first deploy.
- Deploy: 4 deployment iterations resolving SDF validation (features.xml, bundle refs, record schema).
- Testing: 17 bugs found and fixed during live testing in NetSuite.
- Polish: Drillable links, CO name fix, sparkline charts, hover tooltips, consistent toggle, current month highlight.
- Total commits: 20+ on main branch.

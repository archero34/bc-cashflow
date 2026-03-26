# BC Cash Flow Forecasting — Project Status

## Current Phase: POC Complete — Ready for Demo Deployment

**Date**: 2026-03-25
**Next milestone**: Data Airflow follow-up demo (2026-03-26)

---

## What Was Built

A complete SDF Account Customization Project for **Project Cash Flow Forecasting** — the ability to define WHEN cash moves on POs, Contracts, and Change Orders, then roll it all up into a Combined Cash Flow Report on the BlueCollar Project record.

### Deliverables

| Component | Files | Status |
|-----------|-------|--------|
| **Shared Modules** | `bc_timing_constants.js`, `bc_timing_engine.js`, `bc_timing_dao.js`, `bc_timing_ui.js` | Complete |
| **Cost Timing (PO)** | `bc_cost_timing_ue.js` + Script XML | Complete |
| **Revenue Timing (SO)** | `bc_rev_timing_ue.js` + Script XML | Complete |
| **CO Timing (Change Request)** | `bc_co_timing_ue.js` + Script XML | Complete |
| **AJAX Data Endpoint** | `bc_timing_data_sl.js` + Script XML | Complete |
| **Combined Report** | `bc_cf_combined_sl.js` + Script XML | Complete |
| **Cost Report** | `bc_cf_cost_report_sl.js` + Script XML | Complete |
| **Revenue Report** | `bc_cf_rev_report_sl.js` + Script XML | Complete |
| **Project Cash Flow Subtab** | `bc_cf_project_ue.js` + Script XML | Complete |
| **Custom Records** | 4 XMLs (cost timing line, revenue timing line, template, template line) | Complete |
| **Custom Lists** | 6 XMLs (timing type, source, source group, status, spread type, interval) | Complete |
| **SDF Scaffolding** | manifest.xml, deploy.xml, features.xml, all .attr.xml files | Complete |

### Architecture

```
Purchase Order → "Schedule" subtab → Cash Flow + Accrual timing grids
Sales Order    → "Schedule" subtab → Cash Flow + Accrual timing grids
Change Request → "Schedule" subtab → Dual-pane (Revenue + Cost) timing grids
Project Record → "Cash Flow" tab → Combined | Cost | Revenue report iframes
```

All timing UIs share a common module stack:
- `bc_timing_ui.js` — Inline HTML/CSS/JS renderer (BlueCollar branded)
- `bc_timing_engine.js` — Template application engine
- `bc_timing_dao.js` — SuiteQL + N/record CRUD
- `bc_timing_data_sl.js` — Single AJAX endpoint for all timing operations

### Key Features
- **Dual timing perspectives**: Cash Flow (when payments move) + Accrual (when recognized)
- **Template system**: 7 built-in templates (even, front/back-loaded, milestone, progress)
- **CO dual-pane**: Revenue + Cost timing on Change Requests, sourced from actual billing/budget items
- **Combined Report**: Revenue In vs Cost Out = Net Cash Position by month, with inline SVG bar chart
- **BlueCollar brand**: Navy (#04233D) + Gold (#FFB703), polished SaaS-grade UI

---

## What's NOT in the POC

| Feature | Reason | Phase |
|---------|--------|-------|
| Scheduled script status updater | Overcomplicates POC | 2 |
| Subcontract CO handling | Data Airflow doesn't use subs | 2 |
| Labor timing | Diagram/narrative only for demo | 2 |
| Task/schedule integration | Not needed for demo scenario | 2 |
| Portfolio view | Stretch goal, not built | 2 |
| CO approval gate blocking | Reports show status, don't block | 2 |
| Multi-currency | BC hasn't crossed this bridge yet | Future |

---

## Decisions Made

1. **Accrual included in Phase 1** — Same timing framework, different dates. User enters both.
2. **Subtabs, not popups** — Schedule lives ON the transaction record as a subtab.
3. **CO writes directly to timing records** — No staging record for POC. Source group = 'Change Order'.
4. **Approval gating in reports** — Show approval status visually, don't block calculations.
5. **Shared template engine** — `applyTemplate(templateId, startDate, sourceAmount)` used everywhere.
6. **Confirmed CO child record IDs via SuiteQL discovery** — `custrecord_bc_change_req_billing_item` + `custrecord_bc_change_req_budget_item`.

---

## Code Review Summary (Lint Eastwood)

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 3 | 3 |
| High | 3 | 3 |
| Medium | 4 | Reported |
| Low | 4 | Reported |

Critical fixes: save action name, payload structure, data attribute passthrough, iframe lazy-load, null safety in esc().

---

## Deployment Steps

1. `cd bc-cashflow`
2. Authenticate: `npx suitecloud account:setup` (connect to Main Demo account)
3. Dry-run: `npx suitecloud project:deploy --dryrun`
4. Deploy: `npx suitecloud project:deploy`
5. Verify: Open a PO → check for "Schedule" subtab
6. Demo scenario: Create project + contract ($30K) + 2 POs ($15K, $8K) + 1 CO ($12K/$10K)

---

## Reference Scenario (for demo validation)

| Source | Type | Amount | Timing |
|--------|------|--------|--------|
| Customer Contract | Revenue | $30,000 | 25% Apr, 15% May, 25% Jun, 15% Jul, 10% Sep, 10% Nov |
| PO Vendor A | Cost | $15,000 | 20% May, 30% Jun, 15% Jul, 15% Oct, 20% Dec |
| PO Vendor B | Cost | $8,000 | 50% Apr, 50% Nov |
| Change Order A | Revenue | $12,000 | 20% Jul, 30% Sep, 50% Dec |
| Change Order A | Cost | $10,000 | 20% Jul, 30% Sep, 50% Dec |

**Expected Combined Output**: Total Revenue $42,000 | Total Cost $33,000 | Net $9,000

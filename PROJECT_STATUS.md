# BC Cash Flow Forecasting — Project Status

## Current Phase: v1.5 Enhancements — E1 (Date Range Filter) Spec Approved, Plan Pending

**Date**: 2026-05-23
**Account**: TD2984799 — BlueCollar Demo Trailing (dev)
**Repo**: https://github.com/archero34/bc-cashflow
**Demo Project**: Data Airflow - Cash Flow Demo (ID: 1807)
**Active branch**: `feature/v1.5-enhancements` (1 commit ahead of `main` — the E1 spec)
**`main` status**: up to date with v1 redesign (PR #1 merged at `034c9de`)

---

## Resume here for next session

1. **Check out the branch**:
   ```bash
   git checkout feature/v1.5-enhancements && git pull
   ```
2. **Read the E1 spec**: `docs/superpowers/specs/2026-05-23-cashflow-report-date-range-filter-design.md` (commit `6a944ba`) — fully approved during 2026-05-23 brainstorm.
3. **Invoke `superpowers:writing-plans`** to generate the implementation plan for E1. The spec is already organized into 15 candidate task buckets (§6 in the spec doc) that the plan can fold into.
4. **Execute the plan** via `superpowers:subagent-driven-development` (same pattern as v1 redesign — worked well).
5. **After E1 ships**: separately brainstorm E2 (portfolio Suitelet), which is the larger lift. E1's picker component + URL contract were designed for E2 to reuse — see spec §7.

---

---

## Snapshot

### What changed in the v1 redesign (this session)

- **Actuals integration removed entirely** — half-finished SuiteQL (CustInvc / CustPymt / VendBill / VendPmt) deleted along with the variance KPIs and italic-actual rendering. Spec §3.3. Reintroduction is a Phase 2 epic; the code remains in git history.
- **Design system rolled out across all 6 surfaces** — shared `bc_cf_styles.js` (CSS tokens + primitives), `bc_cf_ui.js` (HTML builders), `bc_cf_calculator.js` (pure math). All classes prefixed `bccf-*`.
- **3 report Suitelets converted to shell-only** — server returns skeleton instantly; client fetches JSON from the new `bc_cf_data_sl` (action-routed: `?action=combined|cost|revenue`).
- **Color encoding**: Revenue = navy `--bccf-brand-500 #1f3b5e`. Cost = coral `--bccf-cost-500 #f97316`. Net positive = green, negative = red. Spec §3.7.
- **Combined chart**: paired bars per period + Net amount label above each pair + cumulative-net trend line overlay (green polyline with sign-colored dots). No final-period label (Net KPI already surfaces it).
- **Drillable transaction links restored** — sub-row labels link to SO / PO / Change Request via `target="_top"`. Labels now show transaction tranid (PO1377, SO0631, etc.) instead of vendor name.
- **Cash/Accrual toggle + Refresh button** in each report header. Skeleton flashes on refresh + on save.
- **Schedule editor reskin** (PO / SO / CO Schedule subtabs):
  - Calculator toolbar replaces the old stamp-only template selector: Distribution (S-curve/Linear/Front/Back) + Periods + Interval (Monthly/Bi-weekly/Weekly) + Start date + End date (read-only computed) + Generate + Clear all.
  - Live preview region updates as inputs change (mini bar chart + 5-row table snippet).
  - Generate replaces the grid; confirms first if rows are dirty.
  - New save bar with status pulse: saved (green) / dirty-balanced (slate pulse) / dirty-warn (amber pulse). Discard / Rebalance (conditional) / Save schedules.
  - Math truth fix: edits to BOTH percent AND amount columns now route through a unified `recalculate(sid)` — totals row + validation badge + KPI strip + Rebalance button visibility all reconcile after every edit (was previously broken for amount edits).
  - Rebalance button distributes the overage/shortage proportionally across non-last-edited rows. Live tooltip shows the amount + percent + line count.
  - Validation badge in tfoot: `✓ Balanced` (success-green) or `⚠ X% allocated` (warn-amber).
  - CO Schedule: Contract / Estimate pill toggle in header (Contract = navy, Estimate = slate) replaces the old stacked dual-pane layout.
  - Skeleton-load grid rows during save AJAX so the user sees progress (in addition to the save-bar pulse).
- **Native `confirm()` / `alert()` swept out** — all dialogs now use the project's `confirmDialog` modal (esc/enter keyboard support, custom button labels).

### Portability audit (pre-customer-deploy, 2026-05-23)

Four critical hardcoded internal IDs were found and fixed:
- `bc_cf_report_utils.js`: `rectype=495` → `rectype=customrecord_bc_change_req` (scriptid form)
- `bc_cf_data_sl.js`: `modeToTimingType` now references `Constants.TIMING_TYPE.CASH_FLOW.id` / `.ACCRUAL.id`
- `bc_timing_ui.js`: save handler `timingType: 1` / `2` literals replaced with `${TIMING_TYPE.CASH_FLOW.id}` / `${TIMING_TYPE.ACCRUAL.id}` template interpolation
- `bc_cf_project_ue.js`: iframe URL `timingType: 1` replaced with `mode: 'cash'` (the portable string param the shell SLs actually consume)

Zero remaining references to TD2984799, project ID 1807, transaction IDs, or vendor names in production code.

### Manual NetSuite UI configurations (not SDF-deployable — owned per-account)

| Item | Record | Notes |
|------|--------|-------|
| Parent/child subtab structure on BC Project | BC Project | Cash Flow as parent; Combined / Cost / Revenue as children. Each `custrecord_bc_cf_*_html` field moved to its child subtab. |
| `custrecord_bc_ctl_cost_code` display label | BC Cost Timing Line | **Renamed in NetSuite UI to "Related Cost Code"** to avoid name collision with the BC Project cost code custom segment when updating the BlueCollar SuiteApp. Script ID unchanged. |
| `custrecord_bc_ctl_change_order` display label | BC Cost Timing Line | Renamed to "Related Change Order" (same reasoning). Script ID unchanged. |
| List/Record field type fixes | Timing line records | Custom fields manually changed from INTEGER to List/Record in the NS UI to reference BC SuiteApp records. SDF deploy would revert these — the records path is commented out of `deploy.xml`. |
| Available Without Login = OFF | `customdeploy_bc_cf_data_sl` | Data endpoint should be authenticated-only (iframe carries session). Verified during T14 deploy. |

---

## Architecture

```
BC Project record · Cash Flow parent subtab
    ├── Combined child subtab    →  iframe  →  bc_cf_combined_sl  ─┐
    ├── Cost child subtab         →  iframe  →  bc_cf_cost_report_sl │  shell only
    └── Revenue child subtab      →  iframe  →  bc_cf_rev_report_sl  ─┘
                                                          │
                                                  fetch JSON
                                                          ↓
                                            bc_cf_data_sl?action=…&projectId=…&mode=cash|accrual

Purchase Order → Schedule subtab → custbody_bc_cost_timing_html ─┐
Sales Order    → Schedule subtab → custbody_bc_rev_timing_html   │  full inline editor
Change Request → Schedule subtab → custrecord_bc_co_timing_html  ─┘  (UI + math both in iframe)
                                                                  └── data via bc_timing_data_sl AJAX
```

### File layout

```
FileCabinet/SuiteScripts/BlueCollar/CashFlow/
  modules/
    bc_cf_styles.js         — shared CSS tokens + primitives (149 lines)
    bc_cf_ui.js              — HTML builders (esc, panel, kpi, badge, toggle, skeleton*, errorCard)
    bc_cf_calculator.js      — pure-function schedule math (weights, normalize, generate, rebalance, computeEndDate)
    bc_cf_report_utils.js    — legacy report utils; mostly orphaned, drillLink fixed for portability
    bc_timing_ui.js          — schedule editor HTML + inline client IIFE (~1.5k lines)
    bc_timing_engine.js      — schedule math engine (server-side; applyTemplate removed)
    bc_timing_dao.js         — DAO: SuiteQL reads + N/record writes for timing lines
    bc_timing_constants.js   — list values, field IDs, brand config

  entry_points/
    bc_cf_data_sl.js              — NEW shared JSON data endpoint, action-routed
    bc_cf_combined_sl.js          — shell-only Combined report
    bc_cf_cost_report_sl.js       — shell-only Cost report
    bc_cf_rev_report_sl.js        — shell-only Revenue report
    bc_cf_project_ue.js           — stamps 3 iframes on BC Project record
    bc_timing_data_sl.js          — schedule editor AJAX endpoint (unchanged)
    bc_cost_timing_ue.js          — PO Schedule subtab UE
    bc_rev_timing_ue.js           — SO Schedule subtab UE
    bc_co_timing_ue.js            — CO Schedule subtab UE (now with Contract/Estimate toggle)
```

---

## Deploy commands

```bash
# File-only updates (preferred for code iteration):
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/<file>"

# Full project deploy (when adding new script objects / fields):
npm run deploy

# Validate before deploy:
npm run validate

# Dry-run:
npm run deploy:dryrun
```

**NEVER use full deploy for code-only changes** — it can overwrite manual UI field fixes. Records path is excluded from `deploy.xml` for this reason.

### Suitelet inventory (deployed)

| Script ID | Deploy ID | Purpose |
|-----------|-----------|---------|
| `customscript_bc_cf_combined_sl` | `customdeploy_bc_cf_combined_sl` | Combined report shell |
| `customscript_bc_cf_cost_report_sl` | `customdeploy_bc_cf_cost_report_sl` | Cost report shell |
| `customscript_bc_cf_rev_report_sl` | `customdeploy_bc_cf_rev_report_sl` | Revenue report shell |
| `customscript_bc_cf_data_sl` | `customdeploy_bc_cf_data_sl` | **NEW** action-routed JSON endpoint. Available Without Login = OFF. |
| `customscript_bc_timing_data_sl` | `customdeploy_bc_timing_data_sl` | Schedule editor AJAX save endpoint |

---

## Demo scenario data (Project 1807)

- **Customer**: Bolder Construction Inc. (ID: 197)
- **Contract**: SO0631 — $30,000 base + $12,000 CO = $42,000 current
- **PO A**: Phoenix Mechanical Supply (PO 16240) — $15,000
- **PO B**: Metro Electric Supply (PO 16241) — $8,000
- **CO**: CO-001 — $12K billing / $10K estimate
- **Forecast totals**: Revenue $42K · Cost $33K · Net $9K · Margin 21.4%

---

## Known minor quirks (not blocking v1)

- **Amount-driven entry rounding drift**: typing exact whole-dollar amounts can land slightly off due to the percent ↔ amount round-trip (e.g. typing `$2,000` may settle at `$1,999.50` after one debounce cycle). Soft forecast numbers — not material for v1. Could be fixed in Phase 2 by storing the literal amount and recomputing percentages directly without an intermediate rounded percent.
- **Combined chart trend line in tall iframes**: the SVG `viewBox="0 0 100 100" preserveAspectRatio="none"` stretches the polyline correctly but data dots and the (now-removed) label needed to be HTML siblings instead of SVG children. Pattern documented in T15.7 fix; relevant for any future overlay work.
- **NetSuite iframe iframe height**: hardcoded 900px on the parent record. ResizeObserver / postMessage height-sync is a Phase 2 polish item per spec §3.11.

---

## v1.5 enhancements — status

### E1 — Date range filtering on report Suitelets · **SPEC APPROVED, plan pending**

- **Brainstormed**: 2026-05-23 (this session)
- **Spec**: `docs/superpowers/specs/2026-05-23-cashflow-report-date-range-filter-design.md` (commit `6a944ba`)
- **Status**: Spec approved by user, ready for `superpowers:writing-plans` to generate the implementation plan.

**Key locked decisions** (full detail in spec §2):
- Default view: rolling window, current month −3 / +9 = 12 months
- Hard cap: 24 months (server-side guard + client picker disables Apply)
- Picker UI: pill button → dropdown panel with 4 preset chips (8/12/18/24) + custom `<input type="month">` From/To + Apply button (Option C from brainstorm)
- Filter location: server-side via SuiteQL `AND TO_CHAR(period_date, 'YYYY-MM') BETWEEN ? AND ?`
- New `bc_cf_data_sl` query params: `startPeriod` / `endPeriod` (both optional, regex-validated)
- Response shape additions: `range`, `availableBounds`, `projectTotals`, plus `cumulativeBefore` on the Combined action (for trend line carry-forward)
- KPI semantics under filter: KPI value = sum in range; subline = project total
- Cumulative net trend line: starts at `cumulativeBefore` (not $0) when range starts mid-project
- Persistence: URL-encoded `?startPeriod=YYYY-MM&endPeriod=YYYY-MM` on the iframe Suitelet URL — bookmarkable, shareable

**Reusability**: the picker component + URL contract + `availableBounds` server response are designed so E2 (below) can reuse them without changes.

### E2 — Consolidated portfolio Suitelet · **BACKLOG — own brainstorm cycle**

**Request:** A new top-level Suitelet that rolls up all BC projects into a single cash-flow view. The earlier "consolidated reporting" thread did NOT mean consolidating the 3 SuiteApps (Combined / Cost / Revenue) into one — it meant a portfolio view across all projects.

**Sketch (refine in dedicated brainstorm):**
- Each project = one row showing revenue + cost across period columns
- Header KPIs + charting that aggregate across visible projects (total revenue, total cost, net, margin)
- Multi-select project picker (filter to a subset of projects)
- Date range filter — reuses E1's picker component verbatim
- Cash / Accrual toggle — same primitive as report SLs
- Architecture: new shell SL `bc_cf_portfolio_sl` + new `?action=portfolio` route on the existing `bc_cf_data_sl`
- Mount point: TBD (standalone NS menu entry vs. INLINEHTML on a list view)

**Start E2 after E1 ships and is verified in customer sandbox.**

### E3 — Existing tracked items (Phase 2, unchanged from earlier sessions)

| Feature | Phase |
|---------|-------|
| Actuals integration re-introduction (CustInvc / CustPymt / VendBill / VendPmt) — design from scratch | 2 |
| Labor timing | 2 |
| Task/schedule integration | 2 |
| Status updater scheduled script | 2 |
| Alerts / email digests | 2 |
| Dashboard portlets | 2 |
| Lock/unlock schedule | 2 |
| Template stored on timing lines | 2 |
| Subcontract CO handling | 2 |
| Iframe height-sync via postMessage | 2 polish |
| Least-privilege custom run-as role for Suitelet deployments | 2 hardening |
| Replace TIMING_TYPE list-value integer IDs with scriptid-based lookup | 2 hardening |
| Migrate brand hex literals to `--bccf-*` CSS tokens consistently | 2 polish |

---

## Session history

- **2026-03-25/26 overnight**: POC built from scratch. Demo to Data Airflow — success.
- **2026-03-26 post-demo**: Actuals integration started (bills, invoices, payments). Unresolved correctness issues.
- **2026-05-22 → 2026-05-23**: Brainstormed + designed the v1 redesign. Wrote spec (`docs/superpowers/specs/2026-05-22-cashflow-ui-redesign-design.md`) and 31-task plan (`docs/superpowers/plans/2026-05-22-cashflow-ui-redesign.md`). Executed all 31 tasks + 4 polish passes via subagent-driven development. Deployed continuously to TD2984799 sandbox. Committed everything to `feature/v1-redesign` branch on GitHub. Portability audit + fixes. Ready for customer sandbox.
- **2026-05-23 (continued)**: PR #1 merged `feature/v1-redesign` into `main` at commit `034c9de`. Cut new branch `feature/v1.5-enhancements` off main. Brainstormed E1 (date range filter). Wrote spec at `docs/superpowers/specs/2026-05-23-cashflow-report-date-range-filter-design.md`, commit `6a944ba`. Next session: invoke `superpowers:writing-plans` against the spec.

---

## Open questions / decisions for next session

1. **Run `superpowers:writing-plans`** against the E1 spec to produce the implementation plan, then execute via `superpowers:subagent-driven-development`. The spec is approved; nothing else gates start.
2. **Customer sandbox deploy** — still pending. The 4 portability fixes (`59b9656`) should make it clean. Decide whether to deploy current `main` (v1 redesign) to the customer sandbox NOW, before E1 lands, or wait for v1.5. **Recommendation**: deploy v1 now so the customer can start using it; E1 lands as an additive enhancement later.
3. **E2 brainstorming** — pick up after E1 ships. E2 will reuse E1's picker component + URL contract per spec §7.

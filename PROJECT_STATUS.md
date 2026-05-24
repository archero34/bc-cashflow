# BC Cash Flow Forecasting — Project Status

## Current Phase: v1.5 E2 (Portfolio Suitelet) — Phases 1–4 shipped, resume at Phase 5 (client behavior)

**Date**: 2026-05-24
**Account**: TD2984799 — BlueCollar Demo Trailing (dev)
**Repo**: https://github.com/archero34/bc-cashflow
**Demo Project**: Data Airflow - Cash Flow Demo (ID: 1807)
**Active branch**: `feature/v1.5-e2-portfolio` (12 of 17 tasks complete, latest commit `0157d03`)
**`main` status**: carries v1 redesign + v1.5 E1 (date range filter) + v1.5 E1.5 (table densification). E2 NOT merged yet.
**Tests**: 298 / 10 suites passing.

---

## Resume here for next session

E2 implementation is paused mid-Phase-5. Pick up at **Task 13** in the plan.

1. **Check out the branch + sync**:
   ```bash
   git checkout feature/v1.5-e2-portfolio
   git pull
   npm test    # should show 298 / 10 suites green
   ```

2. **Read the plan**: `docs/superpowers/plans/2026-05-24-cashflow-portfolio-suitelet.md` (commit `d3efb62`). Tasks 1–12 are done; resume at **Task 13** (CLIENT_SCRIPT fetch + render KPIs / chart / table).

3. **Critical design pivot to remember** — the plan was written with a 4-state status enum (`active|hold|closed|all`). During Task 2's NS-UI lookup we discovered the BC SuiteApp's `custrecord_bc_proj_status` tracks workflow stages (WO Approval / Survey / Manufacturing / etc.), not lifecycle states. **We pivoted to a single `active` boolean filter** backed by the built-in `isinactive` column:
   - `filters.active` (boolean) default `true` → SQL filters to `isinactive = 'F'`
   - URL param `?active=0` or `?active=false` disables (shows all projects)
   - The plan's Tasks 14, 15, 16 use `_sortState`, click handlers, and chip flows — these are unchanged
   - Plan tasks 15 + 16 still mention "status" in places; adapt to "active" as you go (same way Tasks 5, 7, 8, 10, 11, 12 were adapted)
   - The `BC_PROJECT` constants block in `bc_cf_data_sl.js` already documents this pivot in its header comment

4. **Continue with subagent-driven-development** following the same pattern that worked for Tasks 3–12. Each remaining task dispatches a fresh subagent with full task text + pivot reminder.

5. **After Task 17**: push branch + open PR + (separately) configure NS menu entry in the UI for the portfolio SL deployment (Reports center → BlueCollar → Portfolio Cash Flow).

6. **Customer sandbox deploy** still pending. With v1 + E1 + E1.5 merged, the customer would already get the full v1.5 feature set. Decide: deploy now (additive) or wait for E2 to land?

---

## E2 task status (12 of 17 complete)

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Baseline snapshot | ✅ | (no commit — verification only) |
| 2 | Discover BC Project field IDs + add `BC_PROJECT` constants | ✅ | `5b07358` |
| 3 | SDF script + deployment + placeholder JS | ✅ | `742634a` |
| 4 | 4 `AVAILABLE_*` SQL option-list constants | ✅ | `4a66810` |
| 5 | `PORTFOLIO_SQL` + `_loadPortfolio` first pass | ✅ | `83f181f` |
| 6 | Bounds + totals + option-list response wiring | ✅ | `cc86fdf` |
| 7 | Chart series + `cumulativeBefore` | ✅ | `431738e` |
| 8 | Filter param parsing in `onRequest` | ✅ | `43000f0` |
| 9 | Phase 2 deploy (data SL portfolio action live) | ✅ | (deploy only) |
| 10 | `.bccf-filters*` CSS primitives | ✅ | `329734d` |
| 11 | Shell SL server-render scaffold | ✅ | `61131bd` |
| 12 | Server-render Filters pill | ✅ | `0157d03` |
| **13** | **Client fetch + render KPIs / chart / table** | **⏳ next** | |
| 14 | Sort plumbing port from E1.5 | pending | |
| 15 | Filters pill JS (open/close, chip add/remove, Apply→reload, etc.) | pending | |
| 16 | Populate filter dropdowns from JSON + chip name resolution | pending | |
| 17 | Final regression + cross-feature sweep + NS menu entry + PR | pending | |

**What's deployed to TD2984799 right now**:
- `bc_cf_data_sl.js` — carries the new `?action=portfolio` route (Tasks 4–8)
- `bc_cf_styles.js` — carries `.bccf-filters*` CSS (Task 10)
- `bc_cf_portfolio_sl.js` — server-rendered HTML shell (Tasks 11–12) — page renders with all chrome but no client behavior yet (clicking the Filters pill / hitting Apply does nothing; KPIs/chart/table stay as skeletons)

The Portfolio SL deployment URL exists; menu entry not yet configured (a Task 17 step).

---

---

## Snapshot

### What changed in the v1 redesign (this session)

- **Actuals integration removed entirely** — half-finished SuiteQL (CustInvc / CustPymt / VendBill / VendPmt) deleted along with the variance KPIs and italic-actual rendering. Spec §3.3. Reintroduction is a Phase 2 epic; the code remains in git history.
- **Design system rolled out across all 6 surfaces** — shared `bc_cf_styles.js` (CSS tokens + primitives), `bc_cf_ui.js` (HTML builders), `bc_cf_calculator.js` (pure math). All classes prefixed `bccf-*`.
- **3 report Suitelets converted to shell-only** — server returns skeleton instantly; client fetches JSON from the new `bc_cf_data_sl` (action-routed: `?action=combined|cost|revenue`).
- **Color encoding**: Revenue = navy `--bccf-brand-500 #1f3b5e`. Cost = coral `--bccf-cost-500 #f97316`. Net positive = green, negative = red. Spec §3.7.
- **Combined chart**: paired bars per period + cumulative-net trend line overlay (green polyline with sign-colored dots). Three independent hover surfaces per period — Revenue bar, Cost bar, trend dot — each surfaces its value via `.bccf-bar[data-tip]::after` / `.bccf-trend-dot::after` dark tooltips. (Per-period net labels above bars were dropped in E1.5; the bars + trend line + hover speak for themselves.)
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

### E1 — Date range filtering on report Suitelets · **SHIPPED TO SANDBOX**

- **Brainstormed**: 2026-05-23
- **Spec**: `docs/superpowers/specs/2026-05-23-cashflow-report-date-range-filter-design.md` (commit `6a944ba`)
- **Plan**: `docs/superpowers/plans/2026-05-23-cashflow-report-date-range-filter.md` (commit `576abf6`) — 20 tasks across 6 phases
- **Status**: Implementation complete. 231 tests / 9 suites green (baseline was 183 → +48). Deployed and verified on TD2984799 across all 3 report SLs.

**What shipped**:
- `bc_cf_data_sl` accepts `startPeriod` / `endPeriod` URL params (regex `/^\d{4}-(0[1-9]|1[0-2])$/`), enforces 24-month cap server-side, defaults to rolling −3 / +8 = 12 months when omitted.
- All 3 SuiteQL queries (cost / revenue / combined-UNION-both-legs) filtered by `TO_CHAR(period_date, 'YYYY-MM') BETWEEN ? AND ?`.
- Loaders generate periods from the range itself (not from SQL distinct values), so empty months render as $0 columns instead of disappearing.
- Response shape additions: `range`, `availableBounds: {minPeriod, maxPeriod}`, `projectTotals` (cost: `{cost}`; revenue: `{revenue, baseContract, changeOrders}`; combined: `{revenue, cost}`), plus `cumulativeBefore` on combined for trend-line carry-forward.
- Picker UI inlined in all 3 SL shells (per spec §3.2 intentional duplication): pill trigger with calendar icon, dropdown panel with 4 preset chips (8/12/18/24 months, centered around current month), custom `<input type="month">` From/To, Apply button. Validation disables Apply on bad range or > 24 months. URL-encoded persistence (`?startPeriod=...&endPeriod=...`) — bookmarkable.
- KPI cards under the filter: headline value = sum in range, subline = project total.
- Combined chart trend-line begins at `cumulativeBefore` instead of $0; per-period net labels dropped; cumulative amount surfaced via CSS hover tooltip on each trend dot.
- Mode toggle (Cash/Accrual) writes `history.replaceState` so the iframe URL bar stays in sync — picker Apply preserves the active mode across reload.
- `.bccf-daterange*` CSS primitives + `.bccf-trend-dot` hover tooltip in `bc_cf_styles.js`.

**Sandbox iterations** (Phase 3 polish, surfaced during user verification):
- Server-side period generation (empty months were dropping out)
- Chart header layout (legend was crowding the "Monthly cash flow" title)
- Trend-dot/label overlap (resolved by dropping per-period labels entirely)
- Mode persistence on picker Apply (mode was resetting to Cash)
- Native `title` hover tooltips replaced with CSS `::after` (native title unreliable inside NetSuite iframes)
- Current-month caret/bold dropped from all 3 charts (column halo is the signal — less wrapping in 18/24-month ranges)

**Reusability for E2**: picker server helpers, `buildPicker`, `CLIENT_SCRIPT` picker JS, URL contract, and `availableBounds` response field are all designed to lift cleanly into the upcoming portfolio Suitelet without modification.

### E1.5 — Table densification (sticky chrome + sortable columns + hover-tooltip bars) · **SHIPPED TO SANDBOX**

- **Brainstormed + spec'd**: 2026-05-23
- **Spec**: `docs/superpowers/specs/2026-05-23-cashflow-table-densification-design.md` (commit `bc90308`)
- **Plan**: `docs/superpowers/plans/2026-05-23-cashflow-table-densification.md` (commit `aef41bc`) — 17-task TDD plan + 3 mid-flight hotfixes
- **Status**: Implementation complete. 267 tests / 9 suites green (baseline 231 → +36 new). Deployed and verified on all 3 report SLs.

**What shipped**:
- **Server**: `_pivotDirection` extracts `createdDate` per line (string `YYYY-MM-DD` or `null`); group keys ordered chronologically DESC NULLS LAST instead of alphabetically. `_sortedKeys` and `firstKey` arg retained as dead code per spec §3.1.4. All 3 SQLs add `MIN(<source>.createddate)` (transaction) or `MIN(<source>.custrecord_bc_cor_date)` (change order) wrapped in `MIN(...)` aggregates inside CASE WHEN conditions to satisfy GROUP BY semantics. `created_date DESC NULLS LAST` added to each `ORDER BY` (and the outer ORDER BY for the combined UNION). `customrecord_bc_change_req` exposes `custrecord_bc_cor_date` as the operationally-meaningful CO date (not the NS record-`created` timestamp).
- **CSS**: slim `.bccf-kpi` rule (~30px reclaimed); sticky-layout rules on `#bccf-kpis` (top 0) and `#bccf-chart` (top 78px). Sticky-thead initially attempted at top 290px but consistently misrendered inside `.bccf-panel-body`'s `overflow-x:auto` context (thead row visually placed between Cost Total and Net Cash Flow rows); sticky-thead intentionally dropped — KPIs + chart remain sticky as the primary context surface, column headers scroll with data. CSS `.bccf-bar[data-tip]::after` and `.bccf-trend-dot::after` pseudo-element hover tooltips (dark ink-900 background, white text, fade in on hover); hovered bar gets `z-index:10` so its tooltip floats above sibling bars in Combined's Revenue+Cost pair.
- **Client (all 3 report SLs)**: `_sortState` + `_lastData` + `sortLines` comparator in each `CLIENT_SCRIPT` (closure-scoped, survives mode toggle + Refresh, resets on picker Apply). Headers carry `data-sort-col` with ▼/▲ active indicator. 2-state toggle on Source, 3-state on Period/Total. Re-render from cached data — no SL re-fetch on sort click. Click handler is a bubble-phase listener separate from the picker's capture-phase handler.
- **Client charts (all 3 SLs)**: bars and period labels now live in separate rows (was a single column-stack). Current-month halo splits across both rows via top-rounded + bottom-rounded `border-radius` for continuity. SVG trend-line overlay (Combined) only wraps the bars row — no longer crosses through period text. Per-period dollar labels above bars REMOVED from Cost and Revenue SLs; replaced with bar hover tooltip showing the period total. Combined gets THREE independent hover surfaces per period (Revenue bar, Cost bar, trend dot — each with its own tooltip).
- **Reusability for E2**: the sticky-layout CSS pattern, the `sortLines` comparator, the `headerCell` rendering helper, the bars/labels split chart pattern, and the `.bccf-bar[data-tip]::after` tooltip all lift cleanly into the upcoming portfolio Suitelet. The chronological-default principle ("newest first") applies — E2's portfolio rows will sort by project createdDate by default with the same 2-state Source / 3-state Period+Total toggle.

**Mid-flight hotfixes** (each surfaced during user sandbox verification):
- `a6ff2a7` — `created_date` CASE WHEN conditions referenced non-aggregated columns; wrap in `MIN()` to satisfy GROUP BY (Tasks 4-6 SQL bug).
- `4d7f1c1` — `customrecord_bc_change_req` doesn't expose `createddate`; switched to `created`.
- `41148b5` — Then switched to `custrecord_bc_cor_date` (the actual CO date, more operationally meaningful than NS record-creation).
- `c856c1b` → `b83028a` — Sticky-thead attempts failed; dropped entirely + chart bars/labels split landed together.
- `ae2d6cd` — Hovered bar z-index bump so tooltip isn't clipped by sibling bars.

### E2 — Consolidated portfolio Suitelet · **PHASES 1–4 SHIPPED, paused mid-Phase-5**

- **Brainstormed**: 2026-05-24
- **Spec**: `docs/superpowers/specs/2026-05-24-cashflow-portfolio-suitelet-design.md` (commit `0bed155`)
- **Plan**: `docs/superpowers/plans/2026-05-24-cashflow-portfolio-suitelet.md` (commit `d3efb62`) — 17-task TDD plan across 6 phases
- **Branch**: `feature/v1.5-e2-portfolio` (cut from `main` 2026-05-24; **NOT** merged to main yet)
- **Status**: 12 of 17 tasks complete. 298 tests / 10 suites green (baseline 267 → +31 new). Server-side + CSS + shell scaffold all deployed to TD2984799 sandbox; client behavior (CLIENT_SCRIPT IIFE) is empty — Tasks 13–16 fill it in.

**Locked design decisions** (full detail in spec §2, with one mid-flight pivot noted below):
- Mount point: standalone NS menu entry (Reports center → BlueCollar → Portfolio Cash Flow). Menu placement configured post-deploy via NS UI in Task 17 (SDF doesn't manage menu entries).
- Row shape: one row per project; each period cell shows NET cash flow for that project in that month (green/red by sign). Chart separately uses full revenue+cost granularity.
- ⚠️ **Status filter pivot 2026-05-24**: the spec assumed Active/Hold/Closed lifecycle states. The actual BC SuiteApp data model exposes `custrecord_bc_proj_status` as workflow stages (WO Approval / Survey / Manufacturing / Shipping / Install / Service / etc.), NOT lifecycle. Per user direction we pivoted to **a single `active` boolean filter** backed by the built-in `isinactive` column. Default `true` (Active projects only); URL param `active=0` disables it. No status list-value lookup needed. The other 4 filter dimensions (Project / PM / Customer / Subsidiary) are unchanged.
- 4 multi-select chip filter dimensions behind a single Filters pill (modeled on E1's date picker): Project, Project Manager, Customer, Subsidiary. Plus the Active checkbox at the top of the panel. All AND together.
- KPIs aggregate over the filtered+dated subset; sublines show the portfolio total within the date range (unfiltered).
- Chart: paired Revenue+Cost bars summed across filtered projects + cumulative-net trend line; three hover surfaces per period (rev bar / cost bar / trend dot) with `.bccf-bar` and `.bccf-trend-dot` tooltips.
- Drill-in: project name cell links to `customrecord_cseg_bc_project&id=<id>` (`target="_top"`); user lands on the project record's Main subtab.
- Default sort: chronological by project createdDate, newest first. 2-state Project toggle / 3-state Period+Total toggle (mirrors E1.5).
- Persistence: filters + range + mode URL-encoded; sort state lives in IIFE closure (survives mode toggle + refresh; resets on Apply).
- Architecture: new shell SL `bc_cf_portfolio_sl` + new `?action=portfolio` route on `bc_cf_data_sl`. Reuses every E1+E1.5 piece verbatim.

**What's actually built** (all on `feature/v1.5-e2-portfolio`):

- **`bc_cf_data_sl.js`** — `BC_PROJECT` field-metadata constants block at top (looked up via NS Main Demo MCP); 4 `AVAILABLE_*_SQL` option-list constants; `PORTFOLIO_SQL` (UNION ALL with 33 placeholders per leg, `(?=1 OR ...)` disable-flag filter pattern for 1 active flag + 4 multi-select dims); `PORTFOLIO_BOUNDS_SQL`, `PORTFOLIO_TOTALS_SQL`, `PORTFOLIO_CUM_BEFORE_SQL` aggregates; `_loadPortfolio(mode, range, filters)` loader (pivots rows into one entry per project sorted by createdDate DESC); `_parseFilters` validates URL params; `onRequest` routes `action=portfolio`.

- **`bc_cf_styles.js`** — `.bccf-filters*` block (trigger pill, panel, chip pattern, action footer, `.bccf-filters-active` checkbox row). All using existing tokens.

- **`bc_cf_portfolio_sl.js`** — full server-rendered HTML shell. Header (page title "Portfolio Cash Flow" + Cash basis pill + date picker + Filters pill + Cash/Accrual toggle + Refresh) + KPI skeleton + chart skeleton + table skeleton with first-col header "Project". Server-side helpers: `_resolveRangeOrDefault`, `_resolveFiltersOrDefault` (active boolean + 4 ID-CSV dims), `_countActiveFilters`, `resolveDataUrl`, `buildPicker`, `buildFiltersPicker`, `buildHeader`, the 3 skeleton builders. **`CLIENT_SCRIPT` IIFE is empty** — that's the work remaining.

- **SDF**: `Objects/scripts/customscript_bc_cf_portfolio_sl.xml` deployed (Script + deployment, `isonline=F`, RELEASED).

**Remaining work** (Tasks 13–17 in the plan):
- **Task 13**: CLIENT_SCRIPT fetch + `renderKpis(kpis, portfolioTotals)` + `renderChart(periods, revPer, costPer, cumBefore)` (port from Combined's chart) + `renderTable(periods, projects)` (one row per project, drill-in links). Mode toggle + Refresh handlers wired.
- **Task 14**: Sort plumbing — `_sortState` (default `{col:'project',dir:'desc'}`), `sortLines(projects, periods, sortState)`, `headerCell` with `data-sort-col` + ▼/▲, click handler with 2-state Project / 3-state Period+Total toggle. Verbatim adaptation of E1.5's pattern (project shape instead of line shape).
- **Task 15**: Filters pill JS — open/close (trigger + outside-click + Esc), active-checkbox toggle, chip ✕ remove, Apply (rebuild URL with all dims + reload), Reset all, live badge updates.
- **Task 16**: `populateFiltersFromData(data)` — replace `#<id>` chip placeholders with real names from `data.availableProjects` / `availableManagers` / `availableCustomers` / `availableSubsidiaries`; populate the four `<select.bccf-filters-add>` dropdowns; change handler appends chips on select.
- **Task 17**: Final regression sweep, NS menu entry config (manual NS UI), PROJECT_STATUS final update, push, PR.

**Reference implementations to copy from** (already in `main`):
- `bc_cf_combined_sl.js` — closest template for Task 13's CLIENT_SCRIPT chart rendering, mode-toggle handler, `history.replaceState` URL sync.
- Combined SL's `// ── Sortable headers (E1.5 spec §3.3) ──` block — verbatim port for Task 14 (just swap `'source'` → `'project'` in the sort-key default).

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
- **2026-05-23 (continued)**: PR #1 merged `feature/v1-redesign` into `main` at commit `034c9de`. Cut new branch `feature/v1.5-enhancements` off main. Brainstormed E1 (date range filter). Wrote spec at `docs/superpowers/specs/2026-05-23-cashflow-report-date-range-filter-design.md`, commit `6a944ba`.
- **2026-05-23 (E1 implementation)**: Wrote 20-task plan via `superpowers:writing-plans` (commit `576abf6`). Executed end-to-end via `superpowers:subagent-driven-development` — fresh subagent per task, spec-compliance review + code-quality review at each checkpoint. All 6 phases complete: data SL contract (8 tasks), CSS primitives (1 task), Combined SL wiring (4 tasks), polish + sandbox iterations (2 hotfix commits), Cost SL mirror (1 task), Revenue SL mirror + base/CO project-totals data extension (1 task), regression sweep. 231 tests / 9 suites green. Deployed continuously to TD2984799 across iterations. PR #2 merged to `main`.
- **2026-05-23 (E1.5 implementation)**: Brainstormed + spec'd table densification (sticky chrome + chronological default sort + click-to-sort headers + hover-tooltip bars). 17-task plan (`docs/superpowers/plans/2026-05-23-cashflow-table-densification.md`). Executed via subagent-driven development. 3 mid-flight hotfixes for SQL aggregation, change-req date field, sticky-thead unreliability. 267 tests / 9 suites green. Deployed to TD2984799. E1.5 PR merged to `main`; `feature/v1.5-enhancements` branch retired. Ready to start E2 brainstorm.
- **2026-05-24 (E2 brainstorm + spec + plan)**: Cut `feature/v1.5-e2-portfolio` from `main`. Brainstormed the consolidated portfolio Suitelet — locked mount point (standalone menu entry), row shape (one row per project, net per period), filter dimensions, KPI scope, chart, drill-in, default sort. Spec at `docs/superpowers/specs/2026-05-24-cashflow-portfolio-suitelet-design.md` (commit `0bed155`). 17-task TDD plan at `docs/superpowers/plans/2026-05-24-cashflow-portfolio-suitelet.md` (commit `d3efb62`).
- **2026-05-24 (E2 implementation — Phases 1–4 + half of 5)**: Executed Tasks 1–12 of 17 via subagent-driven development. Task 2's NS UI lookup (via NS Main Demo MCP) revealed the BC SuiteApp's `custrecord_bc_proj_status` tracks workflow stages, not lifecycle — **pivoted the status filter to a single `active` boolean** backed by `isinactive`. Subsequent tasks (5, 7, 8, 10, 11, 12) adapted to the pivot. Data SL portfolio action + `.bccf-filters*` CSS + shell SL server-render + Filters pill HTML all shipped and deployed. CLIENT_SCRIPT IIFE is empty — Tasks 13–16 fill it in (fetch+render, sort plumbing, filter JS, populate dropdowns). 298 tests / 10 suites green. Paused before Task 13 for a clean session handoff.

---

## Open questions / decisions for next session

1. **Resume E2 implementation at Task 13** — `superpowers:subagent-driven-development` against `docs/superpowers/plans/2026-05-24-cashflow-portfolio-suitelet.md` starting from Task 13. Reference the **Active-toggle pivot** (see E2 section above) when adapting tasks 14/15/16 — the plan's wording still says "status" in some places.
2. **Customer sandbox deploy** — still pending. With v1 + E1 + E1.5 merged, the customer would already get the full v1.5 feature set today. Decide whether to deploy now or hold until E2 ships.

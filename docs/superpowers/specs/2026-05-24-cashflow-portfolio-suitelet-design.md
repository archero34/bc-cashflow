# BC Cash Flow — E2 — Portfolio Cash Flow Suitelet

**Status:** Approved for implementation · **Date:** 2026-05-24
**Track:** v1.5 enhancement #3 of 3 (final v1.5 epic)
**Branch:** `feature/v1.5-e2-portfolio` (cut from `main` post-E1.5 merge)
**Spec authority:** This document.

---

## 1. Motivation

The per-project Combined / Cost / Revenue reports (v1 + E1 + E1.5) answer "how is THIS project doing?" — they're scoped to a single BC Project record. A CFO or portfolio manager asking "how is the whole business doing?" or "which projects are bleeding cash in May?" or "what's our active backlog of revenue looking like?" has no consolidated view today; they'd have to open each project record individually.

E2 adds a top-level Portfolio Cash Flow Suitelet — a standalone NS menu entry sitting outside any individual project — that rolls every BC project up into a single cash-flow view with header KPIs, an aggregated chart, and a scrollable table of one-row-per-project nets across the active date range.

The Suitelet is the proof point that E1 and E1.5's reusable pieces held up: the date-range picker, the `sortLines` comparator, the `headerCell` helper, the sticky KPIs+chart CSS, the bars/labels-split chart layout, and the `.bccf-bar[data-tip]::after` hover tooltips all lift cleanly into E2 with zero refactoring of the per-project surfaces. The new components introduced are a multi-dimension Filters pill + panel (modeled on E1's date-range pill) and the portfolio SQL + per-project pivot in the data SL.

---

## 2. Locked decisions (from brainstorming 2026-05-24)

| # | Decision |
|---|----------|
| D1 | **Mount point:** Standalone NS menu entry under Reports center → BlueCollar → Portfolio Cash Flow. Full-page Suitelet. Bookmarkable URL. Separate from the per-project reports (different audience). |
| D2 | **Row shape:** One row per project. Each period cell shows the project's NET cash flow for that month, colored green/red by sign. The chart (separately) uses full revenue + cost granularity. Two complementary views of the same dataset. |
| D3 | **Filter dimensions:** 5 — Status (Active default, On Hold, Closed, All), Project (multi-select), Project Manager (multi-select), Customer (multi-select), Subsidiary (multi-select). All AND together. |
| D4 | **Filter UI:** Single "Filters" pill in the header that opens a dropdown panel with all 5 filter controls stacked. Same component shape as E1's date-range picker — trains users on a familiar mechanic. Pill badge shows count of active filters (e.g. "Filters · 3 active"). |
| D5 | **KPI scope:** Aggregated across the filtered + dated subset (matches the per-project reports' behavior). Subline shows the portfolio total in the same date range (unfiltered) for context. |
| D6 | **Chart:** Paired Revenue (navy) + Cost (coral) bars per period, summed across the filtered projects. Green cumulative-net trend line with sign-colored dots, starting at `cumulativeBefore`. Three hover surfaces per period — revenue bar, cost bar, trend dot — each with its own `.bccf-bar[data-tip]::after` or `.bccf-trend-dot::after` tooltip. |
| D7 | **Drill-in:** Project name cell is an `<a target="_top">` to the BC Project record (`/app/common/custom/custrecordentry.nl?rectype=customrecord_cseg_bc_project&id=<id>`). User lands on the record's Main subtab; clicks Cash Flow themselves. Simplest URL, no subtab targeting. |
| D8 | **Default sort:** Chronological by project createdDate, newest first (`{ col: 'project', dir: 'desc' }`). Same as E1.5's pattern. Source column (Project) is 2-state toggle (newest ↔ oldest); Period / Total columns are 3-state (▼ → ▲ → reset). |
| D9 | **Persistence:** Filter selections AND date range AND mode are URL-encoded (bookmarkable, shareable). Sort state lives in the IIFE closure — survives mode toggle + refresh; resets on picker Apply or filter Apply (full reload). |
| D10 | **Architecture:** New shell SL `bc_cf_portfolio_sl` + new `?action=portfolio` route on the existing `bc_cf_data_sl`. Reuses every E1/E1.5 piece verbatim. |

---

## 3. Architecture

### 3.1 Shell Suitelet — `bc_cf_portfolio_sl.js`

New entry point file at `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`. Mirrors the structure of `bc_cf_combined_sl.js`:

- `@NApiVersion 2.1`, `@NScriptType Suitelet`
- Imports `N/log`, `N/url`, `../modules/bc_cf_styles`, `../modules/bc_cf_ui`
- Server-side: `resolveDataUrl(projectId-irrelevant, mode, range, filters)` → resolves `bc_cf_data_sl?action=portfolio&...` URL
- Server-side: `buildHeader(mode, range, filters)` — renders page title + Cash/Accrual pill + date picker + Filters pill + Cash/Accrual toggle + Refresh
- Server-side: `buildPicker(range)` — date range picker, verbatim from per-project SLs
- Server-side: `buildFiltersPicker(filters, availableOptions)` — NEW component, modeled on `buildPicker` (trigger pill + dropdown panel). On initial server render, the picker is rendered with placeholder option lists; the client populates the actual lists from `availableProjects` / `availableManagers` / `availableCustomers` / `availableSubsidiaries` once the JSON fetch arrives (same pattern as `applyBoundsToPicker` in E1).
- Server-side: `buildSkeletonKpis()`, `buildSkeletonChart()`, `buildSkeletonTable()` — same skeleton primitives as per-project reports
- Server-side: `onRequest` reads URL params (mode, startPeriod, endPeriod, status, projects, managers, customers, subsidiaries), resolves them, builds the data SL URL, returns the HTML shell
- Client-side: `CLIENT_SCRIPT` IIFE — fetch JSON, render KPIs/chart/table, wire mode toggle + refresh + date picker + filters picker + sort click handler. Identical IIFE shape to per-project SLs.

URL parameters consumed by `onRequest`:
```
?mode=cash|accrual               (default: cash)
&startPeriod=YYYY-MM             (date picker — same validation as E1's _resolveRangeOrDefault)
&endPeriod=YYYY-MM
&status=active|hold|closed|all   (default: active)
&projects=<id>,<id>,...          (comma-sep CSV; absent = no project constraint)
&managers=<id>,<id>,...
&customers=<id>,<id>,...
&subsidiaries=<id>,<id>,...
```

Status values map to BC Project's status field (need to confirm field name + list values during implementation; record-reference skill or NS UI lookup).

### 3.2 Data SL — new `?action=portfolio` route

`bc_cf_data_sl.js` gains:

1. **New SQL constants:**
   - `PORTFOLIO_SQL` — main rev+cost UNION ALL query per project per period. Filtered by status / project IDs / manager IDs / customer IDs / subsidiary IDs / date range.
   - `PORTFOLIO_BOUNDS_SQL` — MIN/MAX `period_date` across all timing tables, ignoring filters but respecting the same join structure. Used for `availableBounds` (picker min/max).
   - `PORTFOLIO_CUM_BEFORE_SQL` — Sum of (revenue − cost) across all filtered projects, periods strictly before `startPeriod`. Used for the trend-line carry-forward.
   - `PORTFOLIO_TOTALS_SQL` — Unfiltered portfolio totals (revenue, cost) within the active date range. Used for the KPI sublines ("$210K portfolio total").
   - `AVAILABLE_PROJECTS_SQL`, `AVAILABLE_MANAGERS_SQL`, `AVAILABLE_CUSTOMERS_SQL`, `AVAILABLE_SUBSIDIARIES_SQL` — return the option lists for the Filters pill dropdowns. Each returns `id` + `name`, deduplicated, sorted alphabetically by name. Driven from BC Project's foreign keys (projects with at least one timing line; managers/customers/subsidiaries that appear on at least one project).

2. **New loader function** `_loadPortfolio(mode, range, filters)`:
   - Resolves the project status whitelist from `filters.status`.
   - Builds the SQL params array including comma-separated ID lists (NULL-safe — if a filter dimension is empty, the SQL clause becomes `(? = 1 OR ...)` and passes `1` to disable that branch; standard SuiteQL conditional-filter pattern).
   - Fires `PORTFOLIO_SQL` once. Pivots results into one entry per project: `{ id, name, createdDate, revenue: [...], cost: [...], net: [...], revenueTotal, costTotal, netTotal }`.
   - Computes `portfolioRevenuePerPeriod` / `portfolioCostPerPeriod` / `portfolioNetPerPeriod` by summing across projects per period (for the chart).
   - Fires the 3 auxiliary aggregate queries (`PORTFOLIO_BOUNDS_SQL`, `PORTFOLIO_CUM_BEFORE_SQL`, `PORTFOLIO_TOTALS_SQL`).
   - Fires the 4 `AVAILABLE_*` option-list queries.
   - Returns the response shape below.
   - All try/catch'd with log.error per the existing loader pattern.

3. **`onRequest` dispatch update:**
   - Add `params.status`, `params.projects`, `params.managers`, `params.customers`, `params.subsidiaries` extraction.
   - Validate `status` is one of `active|hold|closed|all` (default `active`).
   - Validate ID-CSV strings match `^\d+(,\d+)*$` (regex; empty allowed).
   - Build a `filters` object from the parsed params, pass to `api._loadPortfolio(mode, range, filters)`.

4. **Export `_loadPortfolio` on the `api` object** alongside the existing loaders.

### 3.3 Response shape

```js
{
  ok: true, mode,
  range:           { startPeriod, endPeriod },
  availableBounds: { minPeriod, maxPeriod },

  periods: ['Feb 2026', 'Mar 2026', ...],

  // One entry per project in the filtered result set:
  projects: [
    {
      id: 1807,
      name: 'Bolder Construction Inc.',
      createdDate: '2026-03-15',
      revenue: [0, 0, 7500, 4500, 7500, ...],       // length = periods.length
      cost:    [0, 0, 500, 5526, 870, ...],
      net:     [0, 0, 7000, -1026, 6630, ...],
      revenueTotal: 30000,
      costTotal: 23000,
      netTotal: 7000
    },
    ...
  ],

  // For the chart — summed across the projects array:
  portfolioRevenuePerPeriod: [0, 0, 12500, ...],
  portfolioCostPerPeriod:    [0, 500, 1300, ...],
  portfolioNetPerPeriod:     [0, -500, 11200, ...],
  cumulativeBefore: 5500,

  // For the KPI strip — headline values (filtered subset, in range):
  kpis: {
    totalRevenue: 84500,
    totalCost: 61200,
    netCashFlow: 23300,
    margin: 27.6
  },

  // For KPI sublines (whole portfolio, in range, unfiltered):
  portfolioTotals: {
    revenue: 210000,
    cost: 158000,
    net: 52000,
    margin: 24.8
  },

  // For the Filters pill dropdowns (cached server-side; cheap):
  availableProjects:     [{id, name}, ...],
  availableManagers:     [{id, name}, ...],
  availableCustomers:    [{id, name}, ...],
  availableSubsidiaries: [{id, name}, ...]
}
```

Or `{ ok: false, error }` on validation / SQL failure (same envelope as existing actions).

### 3.4 Client layout — `bc_cf_portfolio_sl.js` HTML body

Top-to-bottom in a single iframe body / scroll container, inside `.bccf-layout`:

1. **Header panel** — page title "Portfolio Cash Flow" + Cash basis pill on the left; date picker + Filters pill + Cash/Accrual toggle + Refresh button on the right. `.bccf-panel-header` flex layout, justify-content space-between.
2. **`#bccf-kpis` strip** — 4 KPI cards, slim variant from E1.5. Sticky top:0.
3. **`#bccf-chart` panel** — title "Monthly portfolio cash flow" + Revenue/Cost/Cumulative-Net legend on right; bars row + labels row beneath (E1.5 split); trend SVG overlay on bars row only. Sticky top:78px.
4. **`#bccf-table` panel** — `<table>` with `<thead>` (Project, period cols, Total) + `<tbody>` (one row per project) + `<tfoot>` (Portfolio Net row). No sticky thead (carries E1.5's intentional decision).

### 3.5 Filters pill component

Server-rendered initial HTML (option lists are placeholders; client fills them after JSON arrives):

```html
<div class="bccf-filters" id="bccf-filters">
  <button type="button" class="bccf-filters-trigger" data-action="open-filters">
    <svg>🪪</svg>
    <span class="bccf-filters-label">Filters · 2 active</span>
    <svg>▾</svg>
  </button>
  <div class="bccf-filters-panel" style="display:none">
    <h4>Status</h4>
    <div class="bccf-filters-status">
      <button type="button" data-status="active" class="active">Active</button>
      <button type="button" data-status="hold">On Hold</button>
      <button type="button" data-status="closed">Closed</button>
      <button type="button" data-status="all">All</button>
    </div>

    <h4>Project</h4>
    <div class="bccf-filters-chips" data-dim="projects">
      <!-- existing chips render here, populated from URL params -->
      <span class="bccf-chip" data-id="1807">Bolder Construction Inc. <button class="bccf-chip-x">×</button></span>
      <select class="bccf-filters-add" data-dim="projects">
        <option value="">+ Add project…</option>
        <!-- options populated client-side from data.availableProjects -->
      </select>
    </div>

    <h4>Project Manager</h4>
    <div class="bccf-filters-chips" data-dim="managers">...</div>

    <h4>Customer</h4>
    <div class="bccf-filters-chips" data-dim="customers">...</div>

    <h4>Subsidiary</h4>
    <div class="bccf-filters-chips" data-dim="subsidiaries">...</div>

    <div class="bccf-filters-actions">
      <button type="button" class="bccf-btn bccf-btn-ghost" data-action="reset-filters">Reset all</button>
      <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-filters">Apply</button>
    </div>
  </div>
</div>
```

Client behavior:
- Click trigger → toggle panel visibility; outside-click / Esc closes (same primitive as E1 date picker).
- Click Status button → set `data-status` active class; updates internal state.
- Select option from `<select class="bccf-filters-add">` → append a chip + clear the select; pushes the chosen ID onto internal state.
- Click chip ✕ → remove chip + pop ID from internal state.
- Click Apply → rebuild URL with new filter params (`status`, `projects`, `managers`, `customers`, `subsidiaries` as comma-sep CSV), call `window.location.replace(newUrl)` → full reload.
- Click Reset all → set state to defaults (status=active, all multi-selects empty); user still needs to click Apply.
- After JSON fetch resolves: populate the four `<select class="bccf-filters-add">` dropdowns from `data.availableProjects` etc. (omitting already-chipped IDs).

### 3.6 CSS additions — `bc_cf_styles.js`

New `.bccf-filters*` primitives, modeled on the existing `.bccf-daterange*` block:

```css
/* Filters pill — modeled on .bccf-daterange (E1 spec §3.2) */
.bccf-filters { position: relative; display: inline-block; }
.bccf-filters-trigger { /* same shape as .bccf-daterange-trigger */ }
.bccf-filters-trigger:hover { background: var(--bccf-bg-50); }
.bccf-filters-panel {
  position: absolute; top: 100%; right: 0; margin-top: 6px;
  background: var(--bccf-surface); border: 1px solid var(--bccf-border);
  border-radius: var(--bccf-r-md); box-shadow: 0 4px 16px rgba(18,24,33,.08);
  padding: 14px; min-width: 340px; max-width: 420px; z-index: 50;
}
.bccf-filters-panel h4 { /* same as .bccf-daterange-panel h4 */ }

.bccf-filters-status { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 12px; }
.bccf-filters-status button { font-size: var(--bccf-text-xs); padding: 6px 8px;
  border-radius: var(--bccf-r-md); background: var(--bccf-bg-50);
  border: 1px solid var(--bccf-border); color: var(--bccf-ink-700); font-weight: 500;
  cursor: pointer; }
.bccf-filters-status button.active { background: var(--bccf-brand-500); color: #fff;
  border-color: var(--bccf-brand-500); }

.bccf-filters-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.bccf-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px;
  background: var(--bccf-brand-50); color: var(--bccf-brand-500); border-radius: var(--bccf-r-full);
  font-size: var(--bccf-text-xs); font-weight: 500; }
.bccf-chip-x { background: transparent; border: 0; color: var(--bccf-brand-500); cursor: pointer;
  padding: 0 4px; line-height: 1; }
.bccf-chip-x:hover { color: var(--bccf-brand-600); }
.bccf-filters-add { font-size: var(--bccf-text-xs); padding: 4px 6px;
  border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md);
  background: var(--bccf-surface); cursor: pointer; }

.bccf-filters-actions { display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--bccf-bg-100); }
```

### 3.7 Edge cases

| Case | Behavior |
|------|----------|
| Filter combination matches zero projects | `data.projects = []`. Table renders thead + a single full-width row "No projects match these filters". Chart renders all-$0 bars; KPIs $0; sublines still show portfolio totals (unfiltered). |
| A filtered project has zero timing lines in the date range | Project row still appears (it matched the filter). All cells $0.00. "I expected activity but there isn't any" signal. |
| `availableBounds` is empty (no project has any timing data ever) | Picker falls back to current month, same as E1. |
| Range excludes current month | No current-month halo on any column (matches per-project reports). |
| Project name has special chars (`&`, `<`, `"`) | `esc()` applied at every render site. |
| Picked manager whose filtered projects all later get excluded by another dimension | Empty result table; "No projects match these filters". |
| Filter dropdown lists grow long (50+ customers) | Multi-select `<select>` is browser-native, scrollable. V1 alphabetical sort; search-within-picker is a V1.5 follow-up if needed. |
| Project createdDate is null | Project sorts to the end on Project column (same as E1.5's null-createdDate rule). Other sorts work normally. |
| Mode toggle while filters active | Sort + filter state survive (no reload); only `mode=` URL param updates via `history.replaceState`. |
| Refresh button | Re-fetches JSON with current URL params; sort + filters preserved (no IIFE re-eval). |
| User picks a custom range that exceeds the 24-month cap | Apply button disabled (same as E1 date picker); inline message. |
| Click outside panel (filters or date) while it's open | Panel closes without applying. Esc same. |
| Status set to "All" + no other filters | Returns every BC project that has any timing line in the active date range. Could be 100+ rows. Acceptable in V1; performance and pagination are V1.5 concerns if it bites. |

### 3.8 Permissions + deployment

- `customscript_bc_cf_portfolio_sl` / `customdeploy_bc_cf_portfolio_sl` deployment record.
- **Available Without Login = OFF**.
- `audslot = ALLEMPLOYEES` (matches the existing report SLs).
- Required script-record permissions: read on `customrecord_cseg_bc_project`, `customrecord_bc_revenue_timing_line`, `customrecord_bc_cost_timing_line`, `customer`, `employee` (PMs), `subsidiary`.
- Menu placement: Reports center → BlueCollar → "Portfolio Cash Flow". Configured in the script deployment record's "Available As Menu Entry" section.

---

## 4. Files affected

### New

| File | Purpose |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js` | Shell SL — server-rendered HTML skeleton + inline `CLIENT_SCRIPT` IIFE. ~1000 lines (matches per-project SL scale). |
| `Objects/scripts/customscript_bc_cf_portfolio_sl.xml` | SDF Suitelet script object. |
| `Objects/scripts/customscript_bc_cf_portfolio_sl/customdeploy_bc_cf_portfolio_sl.xml` | SDF deployment record. |
| `tests/entry_points/bc_cf_portfolio_sl.test.js` | Smoke tests for the shell — `<style>` block present, `data-data-url` stamped, KPI/chart/table region anchors, Filters pill HTML present, picker JS present in CLIENT_SCRIPT, sort plumbing present. |

### Modified

| File | Change |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` | Add `PORTFOLIO_SQL`, `PORTFOLIO_BOUNDS_SQL`, `PORTFOLIO_CUM_BEFORE_SQL`, `PORTFOLIO_TOTALS_SQL`, and the 4 `AVAILABLE_*` SQL constants. Add `_loadPortfolio(mode, range, filters)` loader. Add status/projects/managers/customers/subsidiaries param parsing + validation in `onRequest`. Add `'portfolio'` to the action dispatcher. Export `_loadPortfolio` on `api`. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` | Append `.bccf-filters*` CSS primitives (filters pill, status segmented control, chip pattern, action footer). |
| `tests/entry_points/bc_cf_data_sl.test.js` | New describe block for `_loadPortfolio` shape: validation rejections, response shape additions (`projects`, `portfolioRevenuePerPeriod`, `portfolioCostPerPeriod`, `portfolioNetPerPeriod`, `cumulativeBefore`, `portfolioTotals`, `availableProjects` etc.), 3-state filter validation (status whitelist, IDs CSV regex). |
| `tests/modules/bc_cf_styles.test.js` | Assert new `.bccf-filters*` selectors present. |
| `PROJECT_STATUS.md` | Add E2 section under v1.5 status; update "Resume here for next session" + Session history when E2 ships. (Updated post-merge, not as part of the implementation tasks.) |

### Deleted

None.

---

## 5. Testing strategy

- **Unit (Jest):**
  - `_loadPortfolio` validation (status whitelist, IDs CSV regex, range cap).
  - `_loadPortfolio` pivot logic — mocked rows → expected `projects` shape, summed `portfolioRevenuePerPeriod` / `portfolioCostPerPeriod` / `portfolioNetPerPeriod`, correct `cumulativeBefore`.
  - Multi-select picker URL-build logic — round-trip empty → CSV → empty produces clean URLs.
  - `sortLines` works on project shape (each line has `name`, `amounts`, `total`, `createdDate`).
- **Integration (manual sandbox):**
  - Build 4–6 BC projects in TD2984799 with varied PM / Customer / Subsidiary assignments. The existing demo (Project 1807) provides one starting point; create 3–5 more with the `bc-project-create` skill.
  - Verify each filter dimension narrows correctly. Combine multiple dimensions.
  - Verify drill-in lands on the right project record.
  - Verify KPI sublines reflect the portfolio total (unfiltered), KPI headlines reflect filtered subset.
  - Verify chart aggregates correctly (hand-compute against 2 sample projects).
  - Verify sort behaviors work — Project column 2-state, Period / Total columns 3-state.
  - Verify URL persistence: bookmark a filtered URL, reopen → same filters applied.

---

## 6. Implementation phases

This spec splits cleanly into ~13–15 plan tasks. Plan generated separately via `superpowers:writing-plans`.

1. SDF Suitelet script + deployment records (`customscript_bc_cf_portfolio_sl.xml`, `customdeploy_bc_cf_portfolio_sl.xml`).
2. Data SL: add 4 `AVAILABLE_*` SQL constants + their helper queries + the option-list response fields.
3. Data SL: add `PORTFOLIO_SQL` + `_loadPortfolio` pivot — first pass returns `projects` array + `kpis` only.
4. Data SL: add `PORTFOLIO_BOUNDS_SQL` + `PORTFOLIO_TOTALS_SQL` + wire into response.
5. Data SL: add `PORTFOLIO_CUM_BEFORE_SQL` + `cumulativeBefore` to response.
6. Data SL: filter validation in `onRequest` (status whitelist, IDs CSV regex) + dispatch.
7. CSS: `.bccf-filters*` primitives.
8. Shell SL: basic skeleton (header + KPI strip + chart panel + table panel, all skeletons).
9. Shell SL: server-side `_resolveFiltersOrDefault` helper + URL-param parsing.
10. Shell SL: `buildFiltersPicker(filters)` server-side render.
11. Shell SL: CLIENT_SCRIPT — picker JS (open/close, status, chip add/remove, Apply→reload).
12. Shell SL: CLIENT_SCRIPT — fetch + render KPIs + render chart (reusing E1.5 pattern verbatim) + render table.
13. Shell SL: CLIENT_SCRIPT — sort plumbing (port verbatim from E1.5).
14. Shell SL: CLIENT_SCRIPT — populate Filters pill dropdowns from `data.availableProjects` etc. after fetch.
15. Manual sandbox verification + deploy + PROJECT_STATUS update.

---

## 7. Forward compatibility / future work

- **Performance** — V1 ships unpaginated. If a customer with 200+ active projects sees slow loads, V1.5 adds either server-side pagination (page param + page-size on the URL) or client-side virtual scrolling on the table tbody.
- **Search-within-picker** — V1 multi-selects are plain `<select>` dropdowns. If customer / project lists grow past ~50 items, V1.5 swaps in a search-input + filtered-results pattern (similar to NS's native autocomplete UI).
- **Saved filter sets** — currently every filter combination needs to be re-applied or bookmarked individually. V1.5 could persist common combinations as named "Views" on the user's preferences record.
- **Per-row sparkline** — instead of (or in addition to) the period-column cells, each project row could carry a small inline sparkline showing the net trajectory. Deferred from V1 to keep the row simple.
- **Drill-in to Cash Flow subtab directly** — currently drills to the project record's Main subtab; user has to click Cash Flow themselves. The `&tab=<id>` URL param exists; we deferred it for V1 to avoid the one-time NS-UI lookup to grab the subtab's internal ID. Easy V1.5 addition.
- **Phase 2 actuals integration** — when actuals come back (Phase 2 epic), the portfolio SL surfaces them the same way Combined will: variance KPIs and italic-actual rendering in cells.

---

*Brainstorming closed 2026-05-24. Implementation plan to follow via `superpowers:writing-plans`.*

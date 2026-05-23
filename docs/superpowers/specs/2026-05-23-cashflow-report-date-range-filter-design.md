# BC Cash Flow — E1 — Date Range Filter on Report Suitelets

**Status:** Approved for implementation · **Date:** 2026-05-23
**Track:** v1.5 enhancement #1 of 2 (E2 = portfolio Suitelet follows separately)
**Branch:** `feature/v1.5-enhancements`
**Spec authority:** This document.

---

## 1. Motivation

The current report Suitelets (Combined / Cost / Revenue) show every period that exists in the project's timing-line data. For projects with long horizons (multi-year forecasts, retainage tails, etc.) this produces an unwieldy 20-column table that requires horizontal scroll and crowds the chart.

E1 adds a date range filter: users pick a window, the report renders only those periods. The picker doubles as the foundation for the upcoming E2 portfolio Suitelet, which will reuse the same component and URL contract.

---

## 2. Locked decisions (from brainstorming 2026-05-23)

| # | Decision |
|---|----------|
| D1 | **Default view:** Rolling window, current month −3 / +9 = 12 months (e.g. if today is May 2026, default range is Feb 2026 → Jan 2027). |
| D2 | **Hard cap:** 24 months. Apply button disabled if requested range exceeds 24 months. |
| D3 | **Filter location:** Server-side via SuiteQL `WHERE` clause. Client picker triggers re-fetch with `startPeriod` / `endPeriod` query params. Data SL also returns `availableBounds` (min/max periods present in the project) so the picker can constrain its custom range inputs. |
| D4 | **Picker UI:** Option C — pill button in the report header displaying the active range; clicking opens a dropdown panel with 4 preset chips (8/12/18/24 months) + 2 custom month inputs + Apply button + cap footer. |
| D5 | **KPI semantics:** KPI value = sum within the visible range. Subline shows the project total for context. |
| D6 | **Trend line:** Combined report's cumulative net polyline starts at `cumulativeBefore` (the net accumulated in periods strictly before the range start), not at $0. Carries forward truthfully. |
| D7 | **Persistence:** URL-encoded — `?startPeriod=YYYY-MM&endPeriod=YYYY-MM` on the iframe Suitelet URL. Bookmarkable, shareable. Default rolling window applied on first visit / missing params. |

---

## 3. Architecture

### 3.1 Data SL changes — `bc_cf_data_sl.js`

Add two new optional query parameters to all 3 actions (`combined`, `cost`, `revenue`):

```
GET ?action=combined&projectId=<id>&mode=cash|accrual
    &startPeriod=YYYY-MM        ← new (optional)
    &endPeriod=YYYY-MM          ← new (optional)
```

**Behavior:**
- If `startPeriod` and `endPeriod` are both omitted: apply default rolling window (current month −3 / +9). Server computes the dates server-side using `new Date()` — no client coordination needed.
- If only one is provided: extend the other bound by 11 months from the provided one (so total range = 12 months). Example: `startPeriod=2026-04` alone → server uses `endPeriod=2027-03`. `endPeriod=2026-12` alone → server uses `startPeriod=2026-01`.
- If both are provided: use as-is.
- Reject invalid YYYY-MM (regex `/^\d{4}-(0[1-9]|1[0-2])$/`); return `{ ok: false, error: 'Invalid period format' }`.
- Reject range exceeding 24 months: return `{ ok: false, error: 'Date range exceeds 24-month limit' }`. Picker disables Apply before this can fire, but server-side guards are mandatory.
- Reject `startPeriod > endPeriod`: return `{ ok: false, error: 'startPeriod must be <= endPeriod' }`.

**SQL change** in `COMBINED_SQL`, `COST_SQL`, `REVENUE_SQL`:

Add to each `WHERE` clause:
```sql
AND TO_CHAR(<table>.<period_date_field>, 'YYYY-MM') >= ?
AND TO_CHAR(<table>.<period_date_field>, 'YYYY-MM') <= ?
```

Append `startPeriod` and `endPeriod` to the SuiteQL params array (per SELECT in the UNION for combined — both legs get the same range).

**Response shape additions** (all 3 actions):

```js
{
    ok: true, mode,
    periods: [...],              // unchanged: only periods within the filtered range
    categories: { ... },         // unchanged: only data for periods within the range
    kpis: { ... },               // unchanged: but values now reflect the filtered range (see §3.4)
    range: {                     // NEW
        startPeriod: 'YYYY-MM',  // applied range start (may differ from request if defaults filled in)
        endPeriod: 'YYYY-MM',    // applied range end
    },
    availableBounds: {           // NEW
        minPeriod: 'YYYY-MM',    // earliest period in project's timing data (across all months)
        maxPeriod: 'YYYY-MM',    // latest period in project's timing data
    },
}
```

Combined action additionally returns:
```js
{
    ...,
    cumulativeBefore: <number>,  // NEW — net cash flow accumulated in all periods strictly before range.startPeriod
}
```

Computed via an extra SuiteQL aggregate query against revenue/cost timing lines with `WHERE period_date < startPeriod`. Sum(revenue) − Sum(cost) for that pre-range slice.

### 3.2 Picker component — shared client-side module

Lives inside the inline `<script>` block of each report shell (Combined / Cost / Revenue). Implementation is duplicated across the 3 SLs for v1.5 (matches the existing client-JS-inlined pattern). If maintenance becomes painful, future refactor can extract to a shared CDN-cached JS file.

**Picker HTML structure (server-side rendered with initial state):**

```html
<div class="bccf-daterange" id="bccf-daterange">
    <button type="button" class="bccf-daterange-trigger" data-action="open-daterange">
        <svg>📅</svg>
        <span class="bccf-daterange-label">Mar 2026 – Feb 2027</span>
        <svg>▾</svg>
    </button>
    <div class="bccf-daterange-panel" style="display:none">
        <h4>Quick ranges</h4>
        <div class="bccf-daterange-presets">
            <button type="button" data-preset="8">8 months</button>
            <button type="button" data-preset="12" class="active">12 months</button>
            <button type="button" data-preset="18">18 months</button>
            <button type="button" data-preset="24">24 months</button>
        </div>
        <h4>Custom range</h4>
        <div class="bccf-daterange-custom">
            <div>
                <label>From</label>
                <input type="month" data-input="from" min="<minPeriod>" max="<maxPeriod>" />
            </div>
            <div>
                <label>To</label>
                <input type="month" data-input="to" min="<minPeriod>" max="<maxPeriod>" />
            </div>
        </div>
        <div class="bccf-daterange-actions">
            <span class="bccf-daterange-hint">Limit: 24 months</span>
            <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-daterange">Apply</button>
        </div>
    </div>
</div>
```

**Client behavior:**
- Click anywhere with `data-action="open-daterange"` → toggle panel visibility, manage outside-click-to-close
- Click a preset chip → mark it `.active`, compute window centered on current month, fill the custom inputs to match, **do not auto-apply** (user must click Apply or press Enter)
- Edit custom From / To inputs → clear active preset, validate (from ≤ to, range ≤ 24 months), enable/disable Apply
- Click Apply → close panel, rebuild iframe URL with new `startPeriod` / `endPeriod` params, trigger `window.location.replace(newUrl)` (full refresh; the server-rendered skeleton + fetch flow re-runs)
- Esc key closes panel without applying
- Click outside panel closes without applying

**CSS additions:** Add to `bc_cf_styles.js` PRIMITIVES section:

```css
.bccf-daterange { position: relative; display: inline-block; }
.bccf-daterange-trigger { display: inline-flex; align-items: center; gap: 6px; background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); padding: 6px 12px; font-size: var(--bccf-text-sm); color: var(--bccf-ink-700); font-weight: 500; cursor: pointer; }
.bccf-daterange-trigger:hover { background: var(--bccf-bg-50); }
.bccf-daterange-trigger .bccf-daterange-label { color: var(--bccf-ink-900); }
.bccf-daterange-panel { position: absolute; top: 100%; right: 0; margin-top: 6px; background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); box-shadow: 0 4px 16px rgba(18,24,33,.08); padding: 14px; min-width: 280px; z-index: 50; }
.bccf-daterange-panel h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bccf-ink-500); font-weight: 500; margin: 0 0 8px; }
.bccf-daterange-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
.bccf-daterange-presets button { font-size: var(--bccf-text-xs); padding: 6px 10px; border-radius: var(--bccf-r-md); background: var(--bccf-bg-50); border: 1px solid var(--bccf-border); color: var(--bccf-ink-700); font-weight: 500; cursor: pointer; text-align: center; }
.bccf-daterange-presets button.active { background: var(--bccf-brand-500); color: #fff; border-color: var(--bccf-brand-500); }
.bccf-daterange-custom { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bccf-daterange-custom label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bccf-ink-500); font-weight: 500; margin-bottom: 3px; }
.bccf-daterange-custom input { width: 100%; padding: 6px 8px; font-size: var(--bccf-text-xs); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); font-family: inherit; }
.bccf-daterange-custom input:focus { outline: 2px solid var(--bccf-brand-500); outline-offset: -1px; border-color: var(--bccf-brand-500); }
.bccf-daterange-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--bccf-bg-100); }
.bccf-daterange-hint { font-size: 11px; color: var(--bccf-ink-500); }
.bccf-daterange-actions button[disabled] { opacity: 0.4; cursor: not-allowed; }
```

### 3.3 Header layout update — all 3 report shells

Inserts the picker between the meta line and the Cash/Accrual toggle. New header right-side block order:

```
[Date range pill] [Cash/Accrual toggle] [Refresh icon button]
```

The header `display:flex; gap:8px;` container already handles spacing.

### 3.4 KPI rendering under filter

All KPIs reflect the visible (filtered) range. Each KPI card adds a subline showing the project total.

| Report | KPI 1 | KPI 2 | KPI 3 | KPI 4 |
|--------|-------|-------|-------|-------|
| **Combined** | Revenue (range) · subline: "$X project total" | Cost (range) · subline: project total | Net (range) · subline: "$X project total / Y% margin overall" | Margin % (range) · subline: "Y% project overall" |
| **Cost** | Total Cost (range) · subline: project total | Current Month (in range, else 0) | Peak Month (in range) | Remaining (in range, from current month onward) |
| **Revenue** | Total Revenue (range) · subline: project total | Base Contract (in range) · subline: total | Change Orders (in range) · subline: total | Peak Month (in range) |

The data SL response can carry both range-scoped values and project totals to make this cheap. The simplest path: the data SL fires a second lightweight SuiteQL query (`SELECT SUM(amount) FROM <table> WHERE project = ?` with no period filter) to get project totals, and includes them in the JSON response under a new `projectTotals` key:

```js
projectTotals: {
    revenue: <number>,       // sum across ALL periods (combined + revenue actions)
    cost: <number>,          // sum across ALL periods (combined + cost actions)
}
```

(Cost-only action only needs `projectTotals.cost`; revenue-only only needs `projectTotals.revenue`; combined needs both.)

### 3.5 Cumulative net trend line — Combined chart

Currently the polyline starts at $0 at the leftmost visible period and accumulates from there. Under the filter:

- Server returns `cumulativeBefore: number` — the net cash flow accumulated in periods strictly before `range.startPeriod`. Computed by a SuiteQL `SELECT (SUM(revenue_amount) - SUM(cost_amount)) FROM ... WHERE period_date < <startPeriod>`.
- Client trend math: `cumNet[0] = cumulativeBefore + net[0]; cumNet[i] = cumNet[i-1] + net[i]`. The polyline starts at the `cumulativeBefore` level, not at $0.
- The y-axis scale of the chart is computed across the bars AND the trend line points together (existing logic, now with the carry-forward shift). If `cumulativeBefore` is very large relative to the in-range numbers, the line may "float" above the bars — that's a truthful signal that most of the project value happened earlier.
- Dot color flips green/red by sign of the cumulative value (unchanged).

### 3.6 URL state persistence

The iframe URL the UE stamps is the source of truth. Format:

```
<suitelet_external_url>?projectId=1807&startPeriod=2026-03&endPeriod=2027-02
```

- The UE (`bc_cf_project_ue.js`) doesn't change — it stamps the iframe with the default URL (no range params). The Suitelet server-side resolves "no params" to the default rolling window.
- When the user picks a new range and clicks Apply, the client builds a new URL with the range params and calls `window.location.replace(newUrl)`. The Suitelet re-renders with the new range.
- If a user bookmarks the URL (or shares it), the range travels with them.
- The `mode=cash|accrual` toggle continues to set `?mode=accrual` on the URL — same persistence mechanism, same URL.

### 3.7 Edge cases

| Case | Behavior |
|------|----------|
| Project has zero timing lines | Empty state in the report body (existing). Picker is rendered but disabled — trigger button shows "No data". |
| User picks range entirely outside project's data | Report renders with all-zero periods. Chart bars are 0 height. Picker pill shows the selected range. Optional v1.5+: small "No activity in this range" annotation overlay. |
| User picks `from > to` | Apply button stays disabled. Inline error message under the From/To inputs: "From must be on or before To". |
| User picks range > 24 months | Apply button stays disabled. Inline message: "Maximum 24 months". |
| `availableBounds` is empty (no data ever) | `minPeriod` / `maxPeriod` returned as the current month. Picker shows the default rolling window. |
| Single-month range (from = to) | Renders 1 column, 1 bar pair, 1 trend dot. Tables and KPIs reflect the single month. |
| Range that includes current month but it has no data | The current-month halo still shows on that period in the chart (the period exists in the SQL result with zero values). |
| Range that excludes current month | "Current Month" KPI on the Cost report shows $0. Chart has no halo (no period qualifies as current month). |

---

## 4. Files affected

### Modified

| File | Change |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` | Add `startPeriod` / `endPeriod` params; SQL `WHERE` additions; new SuiteQL queries for `cumulativeBefore` and `projectTotals`; response shape additions (`range`, `availableBounds`, `cumulativeBefore`, `projectTotals`) |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` | Picker HTML + JS in the inline client `<script>`; KPI subline rendering; trend line `cumulativeBefore` integration |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js` | Picker HTML + JS; KPI subline rendering |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js` | Picker HTML + JS; KPI subline rendering |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` | New `.bccf-daterange*` CSS primitives |
| `tests/entry_points/bc_cf_data_sl.test.js` | Assertions for new params validation, response shape additions |
| `tests/entry_points/bc_cf_combined_sl.test.js` | Shape assertions for picker HTML, cumulativeBefore wiring |
| `tests/entry_points/bc_cf_cost_report_sl.test.js` | Same |
| `tests/entry_points/bc_cf_rev_report_sl.test.js` | Same |
| `tests/modules/bc_cf_styles.test.js` | Assert new `.bccf-daterange` class present |

### New files

None — picker UI is inline in each report SL.

---

## 5. Testing strategy

- **Unit (Jest):** validation of `startPeriod` / `endPeriod` regex, 24-month cap, from-to ordering. Response shape additions. Picker HTML rendered with correct min/max attributes on month inputs.
- **Integration (manual in NS sandbox):** with Demo Project 1807 — default window renders; expanding to 18 mo / 24 mo each re-fetches; custom range works; URL params persist on page reload; trend line carries forward correctly when range starts mid-project; KPI sublines show project totals.
- **Cross-report consistency:** changing the range on Combined and switching to Cost should NOT apply the same range (each iframe is independent). Confirm via NS subtab navigation.

---

## 6. Implementation phases

This single spec splits cleanly into ~12–15 plan tasks:

1. Data SL: add param validation + SQL filter (no UI yet)
2. Data SL: add `range`, `availableBounds`, `projectTotals` to response
3. Data SL: add `cumulativeBefore` to combined action
4. Update SL tests for new contract
5. CSS primitives in `bc_cf_styles.js`
6. Picker HTML helper (shared inline JS)
7. Picker open/close + outside-click + Esc
8. Picker preset chip handling
9. Picker custom input validation
10. Picker Apply → URL rebuild + reload
11. Wire picker into Combined SL header + KPI sublines + trend line carry-forward
12. Wire picker into Cost SL header + KPI sublines
13. Wire picker into Revenue SL header + KPI sublines
14. Manual sandbox verification on Demo Project 1807
15. Deploy + commit marker

Plan generated separately via `superpowers:writing-plans`.

---

## 7. Forward compatibility with E2 (portfolio Suitelet)

The picker component, the `startPeriod` / `endPeriod` URL contract, the `availableBounds` server response, and the trend line carry-forward math are all designed to be reused by the upcoming portfolio Suitelet (E2). When E2 starts, the picker code lifts cleanly out of the per-report SLs into a shared inline helper (or a vendored client file if the duplication becomes painful). No changes to the data SL contract are anticipated for E2's adoption — E2 may add a `?action=portfolio` route on the same data SL, but `startPeriod` / `endPeriod` semantics are identical.

---

*Brainstorming closed 2026-05-23. Implementation plan to follow via `superpowers:writing-plans`.*

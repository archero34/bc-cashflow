# BC Cash Flow — E1.5 — Table Densification (sticky chrome + scrollable tbody + sortable columns)

**Status:** Approved for implementation · **Date:** 2026-05-23
**Track:** v1.5 enhancement #2 of 2 (sits between E1 and E2)
**Branch:** `feature/v1.5-enhancements` (continues from E1, merged via PR)
**Spec authority:** This document.

---

## 1. Motivation

E1 (date range filter) keeps the report tables narrow enough horizontally, but doesn't address the vertical density problem. Real customer projects routinely carry 30+ POs / SOs / COs across multi-year forecasts. With the current table:

- The KPI strip and chart scroll out of view as soon as the user inspects line items, removing the context the report exists to provide.
- Transactions are sorted alphabetically by `tranid` — a stable but operationally useless order. A user asking "who burned cash in May?" or "what's our latest commitment?" has to scan the entire wall of rows.
- There's no way to rank transactions by activity in a given month, so investigating a spend spike means visually scanning a column and remembering which row had the biggest bar.

E1.5 adds three coordinated features:
1. **Sticky chrome** so KPIs, the monthly chart, and the table header row remain pinned while the user scrolls a long transaction list.
2. **Chronological default sort** by source-transaction creation date (newest first) — the operationally useful default.
3. **Click-to-sort** on any column header with a 3-state toggle and visual ▲/▼ indicator, enabling fast "rank by this month's spend" investigation flows.

The picker component, URL contract, and `availableBounds` server response from E1 remain untouched. E1.5's sort comparator and sticky-layout patterns are designed so the upcoming E2 portfolio Suitelet inherits them verbatim.

---

## 2. Locked decisions (from brainstorming 2026-05-23)

| # | Decision |
|---|----------|
| D1 | **Sort scope on Combined**: Revenue and Cost sections preserved as separate visual groups. Sort applies *within* each section independently. A click on a period header sorts both sections (top of Revenue = highest revenue in that period; top of Cost = highest cost in that period). The two sections never interleave. |
| D2 | **Toggle behavior on Source column**: 2-state — ▼ (newest createdDate first) ↔ ▲ (oldest first). Source is the default sort, so there is no "reset" state to cycle to. |
| D3 | **Toggle behavior on Period / Total columns**: 3-state — ▼ desc → ▲ asc → reset (default Source ▼). Third click escapes sort mode. |
| D4 | **Zero-value rows under sort**: Always shown. A row with $0 in the sorted period sinks to the bottom on ▼ or rises to the top on ▲. Never hidden — keeps the row inventory stable. |
| D5 | **Null createdDate handling**: Catch-all buckets ("Other Cost", "Base Bid") have no source transaction. Their `createdDate` is `null`. Null sorts to the end in both directions on the Source column, so synthetic buckets always sit at the bottom of their section. |
| D6 | **Sticky layout**: Header panel NOT sticky (scrolls away — it's controls, not context). KPI strip, chart panel, and table thead all sticky with progressive top offsets. Single scroll container = iframe body. |
| D7 | **KPI strip slim mode**: Reduced from ~100px to ~70px to reclaim sticky real estate. Smaller padding, smaller value type, tighter subline. Pure CSS — markup unchanged. |
| D8 | **Sort persistence**: Lives in the inline IIFE closure (`_sortState`). Survives mode toggle and Refresh (those are JSON re-fetches; the IIFE stays alive). Resets on picker Apply (which does `window.location.replace` → full reload → IIFE re-evaluated). No URL state for sort. |
| D9 | **Section totals + tfoot**: `Revenue Total`, `Cost Total`, and `Net Cash Flow` rows do NOT participate in sorting. They remain at their natural positions (bottom of section / bottom of table). |
| D10 | **Scope**: Applies to the 3 report Suitelets (Combined / Cost / Revenue). Does NOT touch the schedule editor tables (PO/SO/CO Schedule subtabs) — those are edit-in-place grids with different concerns. |

---

## 3. Architecture

### 3.1 Data SL changes — `bc_cf_data_sl.js`

#### 3.1.1 New per-line field: `createdDate`

Each line emitted by `_pivotDirection` gains a `createdDate` field (YYYY-MM-DD string or `null`). Sourced from the transaction's `createddate` for SO/PO/CO-backed lines; `null` for synthetic catch-all buckets ("Other Cost", "Base Bid").

```js
// _pivotDirection emits:
{ id, label, source, amounts, total, createdDate }   // createdDate added
```

#### 3.1.2 SQL changes

Each of `COST_SQL`, `REVENUE_SQL`, and both legs of `COMBINED_SQL` gains:

1. A new SELECT-list expression that produces `created_date`:

   ```sql
   CASE
       WHEN <table>.custrecord_bc_*_change_order IS NOT NULL
           THEN TO_CHAR(MIN(cr.createddate), 'YYYY-MM-DD')
       WHEN <table>.custrecord_bc_*_transaction IS NOT NULL
           THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
       ELSE NULL
   END AS created_date
   ```

   The `MIN` aggregate is required because of `GROUP BY`. All rows within a group share the same `cost_group` key and therefore the same source transaction, so MIN/MAX/AVG are all equivalent — MIN is conventional. For combined SQL the cost leg references `cr2` (the second change-req alias used in that leg) instead of `cr`.

2. A modified `ORDER BY` that sorts by created date descending (newest first), then by the existing keys for stability:

   ```sql
   ORDER BY created_date DESC NULLS LAST, cost_group, period
   ```

   For `COMBINED_SQL` the outer `ORDER BY flow_direction DESC, ...` becomes `ORDER BY flow_direction DESC, created_date DESC NULLS LAST, cost_group, period`. Revenue rows still group before Cost rows (`flow_direction DESC` returns `'Revenue'` before `'Cost'`).

#### 3.1.3 `_pivotDirection` update

Currently signature: `_pivotDirection(rows, periods, firstKey)`. The body builds `groups[k]` from `r.cost_group` and `sourceMap[k]` from `r.source_id` / `r.source_type`. Add a third map alongside:

```js
const createdMap = {};
rows.forEach((r) => {
    if (!createdMap[r.cost_group] && r.created_date) {
        createdMap[r.cost_group] = r.created_date;
    }
});
```

And in the `lines.map`:

```js
return {
    id: k,
    label: k,
    source: src,
    amounts,
    total,
    createdDate: createdMap[k] || null
};
```

#### 3.1.4 firstKey hoist becomes dead code

`_pivotDirection` currently accepts a `firstKey` arg ("Base Bid" for revenue) that hoists a known label to the front of `keys`. With the new server-side default ordering by createdDate, the SQL already controls order — hoisting would re-shuffle it. **All loaders pass `null` for `firstKey`.** The arg and hoist code remain in `_pivotDirection` (no signature break, no behavior change for any caller passing null), but no caller in this codebase exercises the hoist branch after this change. Base Bid rows reach the bottom of the Revenue section naturally via D5 (null `createdDate` sorts to end).

### 3.2 Sticky layout — all 3 report SLs + `bc_cf_styles.js`

#### 3.2.1 Layout structure (unchanged HTML)

Current `<body>` of each report SL contains a `.bccf-layout` flex column with sibling panels:

```
<body>
  <div id="bccf-toast-host"></div>
  <div class="bccf-layout">
    <header panel>               <!-- title + picker + toggle + refresh -->
    <div id="bccf-kpis">          <!-- KPI strip -->
    <div id="bccf-chart">         <!-- chart panel -->
    <div id="bccf-table">         <!-- table panel -->
  </div>
  <script>...</script>
</body>
```

No markup changes. CSS-only sticky pinning.

#### 3.2.2 Sticky CSS — added to `bc_cf_styles.js`

```css
/* E1.5 sticky layout — pins KPIs/chart/thead while tbody scrolls.
   Header panel is intentionally NOT sticky (controls, not context). */
.bccf-layout #bccf-kpis {
    position: sticky;
    top: 0;
    z-index: 30;
    background: var(--bccf-bg-50);
    padding-top: 4px;
}
.bccf-layout #bccf-chart {
    position: sticky;
    top: 78px;          /* slim KPI strip ~70px + 8px breathing room */
    z-index: 25;
    background: var(--bccf-bg-50);
}
/* Table thead — sticks at the bottom of the chart's reserved space.
   Top value is computed so the thead pins just below the chart panel. */
.bccf-layout #bccf-table table thead {
    position: sticky;
    top: 290px;         /* KPI 78px + chart panel ~212px */
    z-index: 20;
    background: var(--bccf-surface);
    box-shadow: 0 1px 0 var(--bccf-border);
}
/* When a thead cell is sortable, full-width sticky background. */
.bccf-layout #bccf-table table thead th {
    background: var(--bccf-surface);
}
```

Notes:
- `top` values are absolute pixel offsets, calibrated to the slim KPI and standard chart heights. They are tightly coupled to those heights — if the chart's panel-header padding changes, this needs an update.
- `z-index` stacking: KPIs above chart, chart above thead, thead above tbody. Toasts (`z-index: 200`) and modals (`z-index: 100`) remain on top of all sticky elements.
- Background colors on each sticky region are explicit. Without them, scrolling content would show through the sticky panels.

#### 3.2.3 KPI slim mode — added to `bc_cf_styles.js`

```css
/* E1.5 KPI slim mode — reclaim ~30px of sticky real estate. */
.bccf-kpi { padding: 8px 12px; }
.bccf-kpi .bccf-v { font-size: var(--bccf-text-xl); margin-top: 2px; }
.bccf-kpi .bccf-sub { margin-top: 3px; }
```

This is a global redefinition of `.bccf-kpi` — replaces the existing rule in `PRIMITIVES` (currently `padding: 14px 16px;` with `font-size: var(--bccf-text-2xl);`). No markup change.

The KPI cards on the schedule editor (if any) use the same `.bccf-kpi` class. Confirm during implementation that downstream surfaces still look right with the smaller numbers. If they don't, a `.bccf-kpi.compact` modifier is the fallback.

### 3.3 Sortable headers — all 3 report SLs

#### 3.3.1 State shape

Inside each report SL's `CLIENT_SCRIPT` IIFE, add a module-level state:

```js
// _sortState lives in the IIFE closure. Survives mode toggle + refresh
// (those re-fetch JSON, IIFE stays alive). Resets on picker Apply
// (window.location.replace → full reload → IIFE re-evaluated).
var _sortState = { col: 'source', dir: 'desc' };
```

`col` is one of: `'source'`, `'total'`, or a period label (e.g. `'Apr 2026'`).
`dir` is `'desc'` or `'asc'`.

#### 3.3.2 Header markup

In `renderTable`, each `<th>` gets a `data-sort-col` attribute identifying it. Active column gets a `<span>` indicator (▼ or ▲) appended.

```js
function headerCell(label, sortKey) {
    var isActive = _sortState.col === sortKey;
    var indicator = isActive
        ? '<span style="margin-left:4px;color:var(--bccf-brand-500)">' + (_sortState.dir === 'desc' ? '▼' : '▲') + '</span>'
        : '';
    return '<th data-sort-col="' + esc(sortKey) + '" style="cursor:pointer;...">'
        + esc(label) + indicator
        + '</th>';
}
```

`thead` becomes:

```js
headerCell('Source', 'source') + periods.map(p => headerCell(p, p)).join('') + headerCell('Total', 'total')
```

#### 3.3.3 Click handler

A new event listener in each SL's `CLIENT_SCRIPT`, registered alongside the existing capture-phase click handler for the picker:

```js
document.addEventListener('click', function(e) {
    var th = e.target.closest('[data-sort-col]');
    if (!th) return;

    var col = th.dataset.sortCol;
    var was = _sortState;

    if (col === 'source') {
        // 2-state toggle: desc ↔ asc
        _sortState = (was.col === 'source' && was.dir === 'desc')
            ? { col: 'source', dir: 'asc' }
            : { col: 'source', dir: 'desc' };
    } else {
        // 3-state toggle: desc → asc → reset (Source desc)
        if (was.col !== col) {
            _sortState = { col: col, dir: 'desc' };
        } else if (was.dir === 'desc') {
            _sortState = { col: col, dir: 'asc' };
        } else {
            _sortState = { col: 'source', dir: 'desc' };
        }
    }

    // Re-render — use the last data we received
    if (_lastData) {
        var tableEl = document.getElementById('bccf-table');
        if (tableEl) tableEl.innerHTML = renderTable(_lastData.periods, _lastData.categories);
    }
});
```

Note: `_lastData` must be added to the existing fetch resolver alongside `_lastDataUrl`. Currently `_lastDataUrl` is the only persistent state.

#### 3.3.4 Comparator — shared helper

A single helper used by all 3 report SLs (duplicated inline per spec §3.2 of E1's intentional-duplication pattern):

```js
function sortLines(lines, periods, sortState) {
    if (!lines || !lines.length) return lines;
    var sorted = lines.slice();  // never mutate the input array
    var dir = sortState.dir === 'asc' ? 1 : -1;

    sorted.sort(function(a, b) {
        var va, vb;
        if (sortState.col === 'source') {
            // createdDate: null sorts to end regardless of direction
            va = a.createdDate;
            vb = b.createdDate;
            if (va === null && vb === null) return 0;
            if (va === null) return 1;   // null always to end
            if (vb === null) return -1;
            return va < vb ? -dir : (va > vb ? dir : 0);
        }
        if (sortState.col === 'total') {
            va = a.total || 0;
            vb = b.total || 0;
        } else {
            // period label — look up index
            var idx = periods.indexOf(sortState.col);
            if (idx === -1) return 0;    // unknown period (shouldn't happen)
            va = (a.amounts && a.amounts[idx]) || 0;
            vb = (b.amounts && b.amounts[idx]) || 0;
        }
        return va < vb ? -dir : (va > vb ? dir : 0);
    });

    return sorted;
}
```

The function:
- Never mutates the input. Returns a new sorted array. Re-fetches start from server order.
- Treats `null` createdDate as always-to-end (D5).
- Treats missing/undefined values in `amounts` as 0 (D4 — $0 rows participate).
- For ties (equal sort keys), stable order is browser-dependent. Acceptable for this use case.

#### 3.3.5 `renderTable` integration

Existing `renderTable(periods, categories)` becomes effectively:

```js
function renderTable(periods, categories) {
    var rev = categories.revenue
        ? Object.assign({}, categories.revenue, { lines: sortLines(categories.revenue.lines, periods, _sortState) })
        : null;
    var cost = categories.cost
        ? Object.assign({}, categories.cost, { lines: sortLines(categories.cost.lines, periods, _sortState) })
        : null;
    // ...rest of existing renderTable logic uses rev/cost ...
}
```

(Combined uses both `rev` and `cost`; Cost SL only uses `cost`; Revenue SL only uses `rev`.)

#### 3.3.6 `_lastData` persistence

Currently each report SL's `CLIENT_SCRIPT` has `_lastDataUrl` for refresh/mode-toggle support. Add `_lastData = data` inside the fetch resolver alongside the existing `_lastDataUrl` assignment. The sort click handler reads from `_lastData` to re-render without re-fetching.

### 3.4 Combined chart — small change

No behavior change required. The chart already renders from `categories.<dir>.total` (per-period totals), which aren't affected by sort order of individual lines. The chart and the table are independent surfaces.

### 3.5 Edge cases

| Case | Behavior |
|------|----------|
| Empty range (zero matching rows from SQL) | Server returns no `lines` for each direction. The thead still renders; tbody renders the category headers + the totals rows showing $0. Sort indicator can appear on a header but has nothing to sort. |
| One row in a section | Sort is a no-op visually but the indicator still shows. Click toggles state per the 3-state rules even with one row. |
| All rows have `createdDate: null` (no transactional sources) | Default Source-▼ sort produces an arbitrary stable order. User can still sort by period or total to find what they want. |
| `<tfoot>` Net row in Combined | Renders unchanged. Independent of sort. |
| Mode toggle while sorted | Sort persists. New JSON arrives, sort re-applies on new lines. If a previously visible source disappears (e.g. an accrual line that doesn't exist in cash mode), the sort just operates on the remaining rows. |
| Picker Apply while sorted | Sort resets to default — full page reload. |
| Browser without `position: sticky` support | Graceful degradation: KPIs, chart, thead all scroll normally. No JS error. Older Chrome and IE11 affected; modern browsers (the supported target) all work. |
| Iframe height changes (future Phase 2 polish) | The hardcoded `top:` values in the sticky CSS would need recalibration. Documented in PROJECT_STATUS quirks. |
| Click on a non-`<th>` element | `e.target.closest('[data-sort-col]')` returns null; handler short-circuits. No interference with other click handlers (picker, mode toggle, refresh). |

---

## 4. Files affected

### Modified

| File | Change |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` | Add `created_date` SELECT expression + `ORDER BY created_date DESC NULLS LAST, ...` to all 3 SQL constants; extend `_pivotDirection` to emit `createdDate` on each line. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` | Slim `.bccf-kpi` rule; add 4 sticky-layout rules under `.bccf-layout #bccf-{kpis,chart,table}`. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` | Add `_sortState`, `sortLines`, click handler, header `data-sort-col` attributes + indicator. Persist `_lastData`. `renderTable` calls `sortLines` for both directions. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js` | Same as Combined; only the `cost` direction. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js` | Same as Combined; only the `revenue` direction. |
| `tests/entry_points/bc_cf_data_sl.test.js` | Assertions that `createdDate` is present on emitted lines (via mocked SuiteQL); ORDER BY clause includes `created_date`. |
| `tests/entry_points/bc_cf_combined_sl.test.js` | Assertions for `data-sort-col` on every header, `_sortState` default, sort indicator rendering, `sortLines` function present in CLIENT_SCRIPT, $0 + null-createdDate handling. |
| `tests/entry_points/bc_cf_cost_report_sl.test.js` | Same shape. |
| `tests/entry_points/bc_cf_rev_report_sl.test.js` | Same shape. |
| `tests/modules/bc_cf_styles.test.js` | Assert sticky-layout rules present; assert slim KPI dimensions. |

### New files

None — all changes are extensions of existing files.

---

## 5. Testing strategy

- **Unit (Jest)**:
  - `_pivotDirection` emits `createdDate` on each line; null when source is null.
  - Sort comparator handles all three column types correctly (source, period, total).
  - Null `createdDate` always sorts to end.
  - $0 amount values participate in sort (not filtered out).
  - 3-state toggle on period/total columns produces expected sequence.
  - 2-state toggle on source column produces expected sequence.
  - `renderTable` doesn't mutate input `lines` arrays.
- **Integration (manual in NS sandbox)**:
  - Sticky chrome: scroll through ~30 transaction rows on a stress-test project; KPIs, chart, thead all remain visible.
  - Default sort: load a project with multiple POs created over time; newest PO appears first within the Cost section.
  - Click-to-sort: click a period header; biggest contributor for that period rises to top of each section. Click again, smallest rises. Click a third time, back to chronological.
  - Sort persistence: change Cash/Accrual; sort state retained. Click Refresh; sort state retained. Apply a new date range via picker; sort resets.
  - Combined sections: clicking a period header sorts both Revenue and Cost sections independently; sections do not interleave.
  - Empty / single-row edge cases on a synthetic minimal project.
- **Cross-report consistency**: same sort behavior on all 3 reports. Combined applies to both sections; Cost and Revenue each apply to their single section.

---

## 6. Implementation phases

This spec splits cleanly into ~10–12 plan tasks:

1. Data SL: SQL + `_pivotDirection` for `createdDate` (one task per loader, three total — or one task if treated as a mechanical mirror).
2. Test fixtures + contract assertions for `createdDate`.
3. CSS: slim KPI rule.
4. CSS: sticky layout rules + style tests.
5. Combined SL: `_sortState`, `_lastData` persistence.
6. Combined SL: `sortLines` helper, `renderTable` integration, header `data-sort-col` + indicator.
7. Combined SL: click handler with 3-state + 2-state toggle logic.
8. Cost SL: mirror sort logic from Combined.
9. Revenue SL: mirror sort logic from Combined.
10. Manual sandbox verification on a stress-test project (or seeded Project 1807 with extra transactions).
11. Deploy + commit marker.

Plan generated separately via `superpowers:writing-plans`.

---

## 7. Forward compatibility with E2 (portfolio Suitelet)

E2 will render rows of *projects* (not transaction lines), so its column model is different: project name, revenue per period, cost per period, etc. However:

- The same sticky-chrome CSS pattern (`#bccf-kpis` / `#bccf-chart` / `#bccf-table` sticky with progressive top offsets) lifts cleanly into E2's portfolio table. The `top:` values may need recalibration if E2's chart is smaller or absent.
- The `sortLines` comparator works on any `{ amounts: [], total: number }` shape — projects, transactions, or anything else. E2 reuses it.
- The 3-state / 2-state toggle UX and indicator rendering all extract cleanly.
- The default-sort concept becomes "newest project first" in E2; the same chronological-default principle holds.

No changes to E1.5's data SL contract are needed for E2's adoption. E2 will add its own `?action=portfolio` route with its own SQL but the same per-line `createdDate` pattern.

---

*Brainstorming closed 2026-05-23. Implementation plan to follow via `superpowers:writing-plans`.*

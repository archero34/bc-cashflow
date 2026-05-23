# Report Suitelet Consolidation + Elevated Polish

**Date**: 2026-03-26
**Scope**: `bc_cf_combined_sl.js`, `bc_cf_cost_report_sl.js`, `bc_cf_rev_report_sl.js`
**Goal**: Eliminate ~60% code duplication across the 3 report Suitelets, elevate the frontend design, and fix accumulated patch debt.

---

## Problem

Three report Suitelets totaling 2,796 lines share ~60% identical code — helpers, CSS, chart builders, table rendering, pivot logic, CSV export. Each was built fast during the POC overnight and patched independently, leading to:

- Copy-pasted helper functions (`esc`, `fmt`, `fmtCompact`, `monthAbbrev`, etc.) in all 3 files
- ~450–600 lines of duplicated inline CSS
- Chart code 80% identical (only bar direction + color differs)
- Cost & Revenue `renderPage()` 95% identical
- `pivot()` function verbatim in cost & revenue
- 3 different CSV export approaches
- Inconsistent actuals fault tolerance (revenue uses single try/catch)
- Dead code: Overdue KPI placeholder (`= 0`), duplicate `escTooltip` in combined
- Inconsistent URL toggle (regex hack vs `new URL()`)

---

## Architecture: New Shared Module

### New file: `modules/bc_cf_report_utils.js`

Single shared module exporting all common report functionality:

```
bc_cf_report_utils.js (~500 lines)
├── Formatting helpers
│   ├── fmtDollar(val)         — $X,XXX with negative parens
│   ├── fmtActual(val)         — always-positive display
│   ├── fmtCompact(val)        — $3.5K, $1.2M for chart labels
│   ├── esc(s)                 — HTML entity escape
│   ├── escTooltip(s)          — tooltip-safe escaping
│   ├── monthAbbrev(yyyymm)    — 'Apr'
│   ├── monthFull(yyyymm)      — 'April 2026'
│   ├── periodLabel(yyyymm)    — 'Apr-26'
│   └── currentYYYYMM()        — '2026-03'
├── Data processing
│   └── pivot(rows, periods)   — aggregate into { groups, totals, grandTotal, groupTotals, groupSourceMap }
├── CSS
│   └── buildCSS(config)       — returns full <style> block; config: { accentColor }
├── Page shell
│   └── buildPageShell(config) — <html>...<body> wrapper with:
│       ├── Pill-style Cash Flow / Accrual toggle
│       ├── Header with title + project subtitle
│       ├── switchView() using new URL() API
│       └── bodyContent slot
├── KPI cards
│   └── buildKPICards(items)   — renders KPI row from array:
│       ├── items[]: { label, value, accent, badge?, hero? }
│       ├── First hero:true item gets gradient navy card
│       └── Badge items get percentage circle
├── Chart
│   └── buildChart(config)     — SVG bar chart:
│       ├── config.mode: 'single' | 'grouped'
│       ├── config.series: [{ values, color, gradientFrom, gradientTo, label }]
│       ├── config.netLine: { values, color } (optional, combined only)
│       ├── config.periods, config.currentMonth
│       ├── Current month: gold gradient + glow
│       └── Tooltip with hover data
├── Table
│   └── buildTable(config)     — data grid:
│       ├── config.columnHeader: 'Cost Group' | 'Revenue Source'
│       ├── config.rows: [{ label, drillUrl, values, total }]
│       ├── config.totalRow: { label, values, total }
│       ├── config.actuals: { sectionLabel, rows: [{ label, values, total }] }
│       ├── No column total for actuals (stages, not additive)
│       ├── Current month gold highlight column
│       ├── Drillable links on row labels
│       ├── Scrollable container with sticky header
│       └── tabular-nums on all value cells
├── Export
│   └── buildExportBar(csvContent, filename) — CSV + PDF buttons with unified approach
└── Tooltip
    └── buildTooltipScript(data) — shared tooltip JS snippet
```

### Thin wrapper Suitelets

**`bc_cf_cost_report_sl.js` (~80 lines)**:
- Imports `bc_cf_report_utils`, `bc_timing_constants`, `N/log`, `N/query`
- `fetchCostData(projectId, timingTypeId)` — SuiteQL query (unchanged)
- `fetchCostActuals(projectId)` — two independent try/catch blocks (bills + payments)
- `onRequest` — orchestrates: fetch → pivot → configure KPIs/chart/table → render via utils

**`bc_cf_rev_report_sl.js` (~80 lines)**:
- Same structure as cost, different query + config
- Fix: split actuals into independent try/catch (currently single try/catch = fragile)

**`bc_cf_combined_sl.js` (~400 lines)**:
- Imports shared utils but has unique logic:
  - UNION ALL query for both revenue + cost timing
  - `transformData()` for dual-view aggregation
  - Grouped bars + net line overlay chart (uses `buildChart` with `mode: 'grouped'` + `netLine`)
  - Revenue section + Cost section + Net row in table
  - More KPI cards (Net Cash Position hero, Revenue In, Cost Out, conditional actuals)
- Still imports shared CSS, page shell, helpers, tooltip, export

### Resulting file sizes (estimated)

| File | Before | After | Change |
|------|--------|-------|--------|
| `bc_cf_report_utils.js` | — | ~500 | new |
| `bc_cf_cost_report_sl.js` | 791 | ~80 | -90% |
| `bc_cf_rev_report_sl.js` | 798 | ~80 | -90% |
| `bc_cf_combined_sl.js` | 1,207 | ~400 | -67% |
| **Total** | **2,796** | **~1,060** | **-62%** |

---

## Frontend Design: Elevated Polish

### Pill Toggle (replaces two-button approach)
- Container: `background: GREY_LIGHT; border-radius: 8px; padding: 3px; border: 1px solid GREY_MID`
- Active pill: `background: NAVY; color: WHITE; border-radius: 6px`
- Inactive pill: `color: GREY_DARK; cursor: pointer`
- Uses `new URL()` API for view switching (no regex hacks)

### KPI Cards
- **Hero card** (first/primary metric): `background: linear-gradient(135deg, NAVY, NAVY_LIGHT); color: WHITE`
  - Value color varies: GOLD (cost/revenue forecasts), GREEN (net positive), RED (net negative)
- **Standard cards**: white background, 1px border, border-radius 8px
  - Percentage badge: circular div, background matches accent (GREEN_LIGHT, FFF8E1), font-weight 700
  - Badge value = (this metric / hero metric) as percentage
- **Actual KPI cards** (conditional — only render when actuals data exists):
  - `border-left: 3px solid {accent}`; accent varies by type (GREEN=received, RED=paid, GOLD=invoiced, GREY=billed)
- Overdue KPI: **removed** (was always $0 placeholder)

### Chart
- **Cost/Revenue (single series)**: `buildChart({ mode: 'single', series: [{ color, gradient }] })`
  - Bars grow upward from baseline
  - Gradient fill: `linear-gradient(0deg, colorFrom, colorTo)`
  - Current month: gold gradient + `drop-shadow(0 0 6px rgba(255,183,3,0.4))`
- **Combined (grouped + net line)**: `buildChart({ mode: 'grouped', series: [revSeries, costSeries], netLine: { values, color: GREEN } })`
  - Revenue (gold) + Cost (navy) side-by-side per month
  - Green polyline overlay tracing net margin with dot markers
  - Current month: both bars get glow
  - Legend in top-right: colored squares + labels

### Table
- **Row labels**: Cost uses `PO#XXXXX — Vendor Name`, Revenue uses `SO#XXXXX — Base Bid` or `CO: CO-001` (tran ID + name in all cases)
- **Drillable links**: dashed underline, opens in NetSuite `target="_top"`
- **Current month column**: gold header (`FFB703`), light yellow cells (`FFFDE7`)
- **Total column header**: slightly lighter navy (`NAVY_LIGHT`)
- **Forecast total row**: 2px navy top border, grey background
- **Actuals section**:
  - Spacer row (6px gap)
  - Section header with "ACTUAL" badge (slate pill)
  - Detail rows: muted italic slate (#64748B), indented labels, FAFBFC background
  - **No column total** — Billed/Paid (cost) and Invoiced/Collected (revenue) are stages of the same transactions, not additive categories. Row totals only.
  - Closes with a subtle 2px slate border
- **Scrollable container**: `max-height` with `overflow-y: auto`, sticky `<thead>`
- **All value cells**: `font-variant-numeric: tabular-nums` for column alignment

### Export
- Unified approach: `buildExportBar()` renders CSV + PDF buttons below the table
- CSV uses consistent `csvEsc()` helper + Blob download
- Buttons: white background, 1px grey border, 6px radius, SVG icons

---

## Code Cleanup

| Issue | Fix |
|-------|-----|
| Overdue KPI `= 0` placeholder | Remove entirely |
| Duplicate `escTooltip` in combined (line 634) | Remove; import from utils |
| Revenue actuals single try/catch | Split into independent per-query try/catch |
| Regex URL toggle in cost/revenue | Replace with `new URL()` API |
| 3 different CSV export approaches | Unified `buildExportBar()` |
| Inline `runQ` helper in combined | Keep local but clean up; too tightly coupled to move |
| `fmtDollar` vs `fmt` naming inconsistency | Standardize as `fmtDollar` in utils |

---

## Files Modified

| File | Action |
|------|--------|
| `modules/bc_cf_report_utils.js` | **CREATE** — new shared module |
| `entry_points/bc_cf_cost_report_sl.js` | **REWRITE** — thin wrapper |
| `entry_points/bc_cf_rev_report_sl.js` | **REWRITE** — thin wrapper |
| `entry_points/bc_cf_combined_sl.js` | **REWRITE** — uses shared pieces, keeps unique logic |
| `modules/bc_timing_constants.js` | **NO CHANGE** — BRAND tokens already sufficient |

---

## Verification

1. **Deploy all 4 files** to the sandbox:
   ```bash
   npx suitecloud file:upload --paths \
     "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js" \
     "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js" \
     "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js" \
     "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js"
   ```

2. **Test each report** on project 1807 (Data Airflow Demo):
   - Cost report: KPIs render, chart shows, table populates, actuals section shows Billed/Paid without column total, CSV export works, Cash Flow/Accrual toggle works
   - Revenue report: Same checks, Invoiced/Collected in actuals
   - Combined report: Grouped bars + net line chart, revenue + cost sections in table, net row, all KPI cards including conditional actuals

3. **Edge cases**:
   - Project with no timing data → empty state renders
   - Project with timing but no actuals → actuals section hidden, no conditional KPI cards
   - Cash Flow ↔ Accrual toggle preserves view correctly (new URL API)

4. **Regression**: Drillable links open correct PO/CO/SO records in NetSuite

# BC Cash Flow — UI Redesign + Actuals Removal (v1 POC Deploy)

**Status:** Approved for implementation · **Date:** 2026-05-22
**Goal:** Refactor the BC Cash Flow UI to a unified design system based on `docs/reference/design-guide-bcp-reference.md` (bc_wo_wp), and rip out the half-finished actuals integration so the v1 POC can ship to the customer's NetSuite environment.

This spec is the running record of design decisions agreed during brainstorming. Implementation plan is generated from this spec via the `superpowers:writing-plans` skill once approved.

---

## 1. Scope

### 1.1 Surfaces in scope (all 6)

**Report Suitelets (project record · Cash Flow tab — 3 iframed Suitelets):**
1. Combined Report — `bc_cf_combined_sl.js`
2. Cost Report — `bc_cf_cost_report_sl.js`
3. Revenue Report — `bc_cf_rev_report_sl.js`

**Schedule subtab editors (3 inline grids):**
4. PO Cost Schedule — `bc_cost_timing_ue.js`
5. SO Revenue Schedule — `bc_rev_timing_ue.js`
6. CO Change Request Schedule — `bc_co_timing_ue.js` (dual Contract/Estimate panes)

### 1.2 Out of scope (deferred)

- **Consolidated reporting** (a single Cash Flow Suitelet replacing the 3 iframes) → Phase 2.
- **Schedule-line math improvements** (amount-driven entry edge cases, rounding absorber refinements) → tracked but not part of this refactor.
- **Labor timing, task/schedule integration, portfolio view, alerts, dashboard portlets, lock/unlock, template-stored-on-line, subcontract CO handling** → Phase 2 (per PROJECT_STATUS.md §"What's NOT Built Yet").

---

## 2. Pain points this redesign addresses

All four of the following:

| # | Pain | Resolution |
|---|------|------------|
| P1 | **Visual polish / brand feel** — looks like a NetSuite scriptlet | Adopt bc_wo_wp token set + primitive library verbatim |
| P2 | **Inconsistency across the 3 reports + 3 editors** | Single shared CSS/HTML primitive module; identical chrome on every surface |
| P3 | **Loading / perceived performance** (5–8s cold renders) | Two-Suitelet split per report: shell returns skeleton instantly, client fetches JSON in parallel, skeleton replaced when data lands |
| P4 | **Info density / scannability / chart quality** | KPI strip + labeled single-color bars + current-month emphasis + cleaner table hierarchy |

---

## 3. Core design decisions (locked)

### 3.1 Architecture

| Decision | Value |
|----------|-------|
| Token set + primitive library | `bc_wo_wp` design guide adopted verbatim (navy `--brand-500: #1f3b5e`, full `--ink-* / --bg-* / --success-* / --warn-* / --danger-*` scale, Inter type scale, spacing/radius/shadow tokens) |
| CSS delivery | Inline `<style>` blocks (no CDN, no SuiteApp file cabinet CSS), but extracted from a shared `bc_cf_styles.js` module so all 6 surfaces import the same tokens + primitives (no duplication, fixing the bc_wo_wp anti-pattern) |
| CSS namespace | All classes prefixed `bccf-*` (e.g. `.bccf-panel`, `.bccf-btn`, `.bccf-kpi`) — keeps INLINEHTML islands safe even if NetSuite ever drops the iframe wrapper |
| Suitelet structure (per report) | **Shell Suitelet** returns HTML + skeleton (instant); **shared data Suitelet** (`bc_cf_data_sl.js`, action-routed: `?action=combined\|cost\|revenue`) returns `{ok, ...data}` JSON |
| Shell vs data URL resolution | Shell SL resolves data SL URL server-side via `N/url.resolveScript`, stamps onto `<body data-data-url="...">` for client JS to read. **No hardcoded `/app/site/hosting/scriptlet.nl` paths in client JS.** |
| Inline error card on shell render failure | Hosting SL `try/catch` returns a styled error card (red left-border) instead of NetSuite's `UNEXPECTED_ERROR` page |
| Double-evaluation guard | Client JS wraps all listener registrations in `if (window.__bccfWired)` to survive NetSuite re-running inline `<script>` on subtab iframe re-render |
| Event handling | Document-level delegation only — no per-element `addEventListener` on dynamic rows; no inline `onclick` in markup |
| Iframe stamping | Existing UE (`bc_cf_project_ue.js` + the 3 per-record UEs) stays — just update the hardcoded `<iframe>` strings to point at the new shell SL URLs |

### 3.2 Number of report surfaces

**Keep 3 iframes, redesign each.** Combined / Cost / Revenue remain 3 separate Suitelets with the same chrome but distinct content. Consolidation into a single tabbed Suitelet is a clean Phase 2 follow-up.

### 3.3 Actuals — REMOVED entirely from v1

**Decision:** Drop the actuals integration from all reports. v1 ships forecast-only.

**Reason:** Actuals were always a "tease" enhancement post-demo. SuiteQL joins (`CustInvc`, `CustPymt`, `VendBill`, `VendPmt`) had unresolved correctness issues (VendPmt `createdfrom` matching, negative-amount handling, payment→invoice cross-products). Shipping with these in a customer environment would create support-load issues that block the v1 POC.

**What gets removed:**
- All SuiteQL queries for `CustInvc`, `CustPymt`, `VendBill`, `VendPmt`
- The actuals-merge code in `bc_cf_report_utils.js`
- All "actual" rows in tables (invoiced / collected / billed / paid)
- KPIs: Received to Date, Paid to Date, Actual Invoiced, Actual Billed, Forecast Variance
- The muted-italic CSS for actual rows
- Spark markers / two-color chart bars
- Any client-side toggle that exposed actuals

**Schema impact:** None — actuals were purely read-side derivations; no records or fields to drop.

**Re-introducing actuals in a later release:** The deleted code remains in git history; the design can be revisited as a Phase 2 epic once the v1 POC is stable in production.

### 3.4 Report layout — Option A (Vertical Flow)

Each report is a vertical stack (no in-iframe nav tabs; native parent/child subtabs handle navigation per §3.5):

```
┌─ Panel: header ───────────────────────────────────────┐
│  Title (h1) + Cash-basis pill | Cash/Accrual toggle   │
│  Meta line (project · customer · SO#)   CSV / PDF btns│
└───────────────────────────────────────────────────────┘

┌─ KPI strip — 4 KPIs in a row ─────────────────────────┐
│  KPI 1 │ KPI 2 │ KPI 3 │ KPI 4                        │
└───────────────────────────────────────────────────────┘

┌─ Panel: chart ────────────────────────────────────────┐
│  Subhead "Monthly cash flow" | legend / summary line  │
│  Bars per month, amount labels above, current month   │
│  boxed in brand-50, monospace amounts                 │
└───────────────────────────────────────────────────────┘

┌─ Panel: data table ───────────────────────────────────┐
│  Source │ Month columns │ Total                        │
│  Category rows (bold) + indented sub-rows per line    │
│  Footer: Net (Combined only)                          │
└───────────────────────────────────────────────────────┘
```

**Rejected alternatives:** B (KPI sidebar rail) — squeezes table width; C (data-forward compact with inline-header KPIs) — too dense for the demo audience.

### 3.5 Report subtab structure — parent/child subtabs (amended 2026-05-23)

**Decision:** The BC Project record's `Cash Flow` subtab becomes a **parent subtab** with three **child subtabs**:
- `Combined` (child) — single full-width INLINEHTML field stamped with the Combined report iframe
- `Cost` (child) — single full-width INLINEHTML field stamped with the Cost report iframe
- `Revenue` (child) — single full-width INLINEHTML field stamped with the Revenue report iframe

Native NetSuite parent/child subtab navigation handles report-to-report switching — clicking a child subtab swaps the visible iframe. No in-iframe nav tabs are needed; the previous design's "Combined · Cost · Revenue" tab strip inside each report panel is dropped.

**Why this changed:** The original spec assumed 3 stacked INLINEHTML fields on one subtab and added in-iframe nav tabs as a workaround for the scrolling problem. Parent/child subtabs are the native NetSuite mechanism for this UX and provide a cleaner click-through tabbing experience without any client-side nav code.

**Manual NetSuite UI configuration required** (not SDF-deployable, follows the existing pattern from PROJECT_STATUS.md "Manual Setup" section):

1. Customization → Lists, Records, & Fields → Record Types → BC Project → Subtabs.
2. Edit the existing `Cash Flow` subtab; ensure it has no `Parent Subtab` set (so it acts as a parent).
3. Create three child subtabs with `Cash Flow` as their `Parent Subtab`: `Combined`, `Cost`, `Revenue`.
4. Edit the three INLINEHTML fields and move each to its corresponding child subtab:
   - `custrecord_bc_cf_combined_html` → `Combined` child subtab
   - `custrecord_bc_cf_cost_html` → `Cost` child subtab
   - `custrecord_bc_cf_revenue_html` → `Revenue` child subtab
5. With one field per child subtab, each iframe renders full-width.

**Iframe stamping (UE) is unchanged:** `bc_cf_project_ue.js` still beforeLoad-stamps each INLINEHTML field with its iframe. The UE doesn't care which subtab the field is on — the parent/child structure is a form-layout concern, not a UE concern.

### 3.6 KPIs per report (4 each, forecast-driven)

| Report | KPI 1 (accent) | KPI 2 | KPI 3 | KPI 4 |
|--------|----------------|-------|-------|-------|
| **Combined** | Total Revenue | Total Cost | Net Cash Flow | Margin % |
| **Cost** | Total Cost | Current Month | Peak Month | Remaining (current → end) |
| **Revenue** | Total Revenue | Base Contract | Change Orders | Peak Month |

"Accent" KPI uses the headline color for the value (see §3.7 color encoding).

### 3.7 Color encoding — Navy + Slate (Option δ)

| Element | Color | Token |
|---------|-------|-------|
| **Revenue** identity (KPI value, chart bar, table category total) | Navy | `--brand-500` `#1f3b5e` |
| **Cost** identity (KPI value, chart bar, table category total) | Muted slate | `--ink-500` `#5b6472` |
| **Net positive** (delta text only) | Green | `--success-500` `#1f9d55` |
| **Net negative** (delta text only) | Red | `--danger-500` `#c2361d` |
| **Brand chrome** (nav tabs, primary buttons, pill, current-month halo) | Navy | `--brand-500` |

**Rationale:** BlueCollar's master brand is amber/orange — adopting amber for Cost would force the Cash Flow product into a workwear aesthetic that doesn't fit a financial reporting surface. Navy + slate reads as a neutral finance product (Stripe/Linear-adjacent), keeping deliberate brand distance while staying inside the bc_wo_wp token set. Semantic green/red is reserved exclusively for net-sign deltas — never for revenue or cost identity — which keeps "red ≠ alarm everywhere" and preserves the green/red signal where it matters.

### 3.8 Chart rendering

- **Cost / Revenue (single-category reports):** one bar per month, height proportional, amount label above each bar, x-axis month label below. Current month bar gets a brand-50 box-shadow halo + bolded label with ▲ glyph.
- **Combined (two-category):** paired bars per month (Revenue + Cost, side-by-side, 2px gap). Net amount labeled above each pair, colored by sign (green if positive, red if negative).
- All bars hand-drawn `<div>` with inline `height: <px>` — no chart library.
- Hover: opacity .85 on the hovered bar (CSS-only, no JS).

### 3.9 Loading strategy

Shell SL returns immediately with:
- Header chrome (title, meta, toolbar) rendered fully
- KPI strip with **skeleton placeholders** (4 shimmer cards)
- Chart panel with a **skeleton bar grid** (6 grey shimmer bars at varying heights)
- Table with **skeleton rows** (header + 5 placeholder rows)

Client JS reads `data-data-url` from `<body>`, fires `fetch()` to the data SL, replaces skeletons with real content on resolve. Error path: replace skeleton with inline error card matching the shell SL error card pattern. No spinner over the full panel — skeletons stay until data arrives.

### 3.10 Toasts, modals, confirms

- **Toast host** anchored top-right (z-index 200), border-left color per type (info=brand, warn=amber, danger=red), 4500ms auto-dismiss, manual close button.
- **Confirm dialog** as `Promise<boolean>` via `confirmDialog(opts)` — replaces any native `confirm()` use. Esc=false, Enter=true.
- All three primitives live in the shared `bc_cf_styles.js` so all 6 surfaces use the same instances (fixes bc_wo_wp duplication anti-pattern).

### 3.11 Out-of-iframe height behavior

Hardcoded iframe height stays for v1 (matching the bc_wo_wp acceptance of `height:900px`). `postMessage` height-sync is a Phase 2 polish item.

### 3.12 Run-as role on deployments

v1 keeps `<runasrole>ADMINISTRATOR</runasrole>` on all CF Suitelet deployments (matching current state). Least-privilege custom role is a Phase 2 hardening item.

### 3.13 Schedule editor (PO / SO / CO) layout

Each of the 3 schedule subtab editors uses the same chrome:

```
┌─ Header panel ────────────────────────────────────────┐
│  "Cash Flow & Accrual Timing" + record-id pill        │
│   + line-count balance pill                           │
│  Vendor/Customer · Project · Amount                   │
│                                  [Saved · 2 min ago]  │
│  (CO only: Contract/Estimate pill toggle on right)    │
└───────────────────────────────────────────────────────┘

┌─ Tabs ────────────────────────────────────────────────┐
│ ● Cash Flow (navy)   ● Accrual (slate)                │
└───────────────────────────────────────────────────────┘

┌─ Section body (one panel per active tab) ─────────────┐
│  ── 3 KPIs: Source / Scheduled / Remaining ─────────  │
│  ── Calculator toolbar (§3.14): Distribution ·        │
│      Periods · Interval · Start · End (read-only) ·   │
│      Generate                                         │
│  ── Live preview (mini chart + 5-row table preview)   │
│  ── Grid table: editable cells with brand focus ring  │
│      tfoot: Total row + balanced/unbalanced badge     │
│  ── + Add line (dashed ghost button)                  │
└───────────────────────────────────────────────────────┘

┌─ Save bar (sticky bottom) ────────────────────────────┐
│ ● Saved / unsaved (pulsing) status   Review Accrual · │
│                                       Discard · Save  │
└───────────────────────────────────────────────────────┘
```

**Grid columns** (order, header label):
1. `#` (row number, monospace muted)
2. `Cost Code` (input) — PO only (`showCostCode: true`)
3. `Cost Type` (input) — PO only
4. `Period date` (date input)
5. `Label` (text input)
6. `Percent` (number input, drives Amount)
7. `Amount` (currency input, drives Percent on edit — existing behavior unchanged)
8. **`Total %`** (computed cumulative, muted text) — *renamed from "Cum %"*
9. **`Total Amount`** (computed cumulative, muted text) — *renamed from "Cum Amount"*
10. `✕` (remove button, danger-ghost style)

**Save bar buttons** (sticky bottom, right-aligned, in this order):
1. `Review Accrual` — secondary, switches the tab
2. `Discard changes` — secondary, fires a `confirmDialog` then reverts to last-saved
3. `Rebalance` — **secondary, conditionally visible only when totals are out of balance** (per §3.14.8)
4. `Save schedules` — primary, plain text (no emoji / icon glyph)

**Grid input styling:** Transparent border at rest, reveal a bg-50 highlight on hover, brand-blue focus ring (`outline: 2px solid var(--brand-500)` + `box-shadow: 0 0 0 2px var(--brand-50)`) when active. Feels inline rather than form-y.

**Validation badge:** In tfoot, right-aligned, `badge-success` ("✓ Balanced") when total is 100% and total amount matches source ±$0.01, otherwise `badge-warn` ("⚠ X% allocated").

**CO Contract/Estimate toggle:** Pill-style segmented control in the header (`.pane-toggle`). Contract pill uses `--brand-500`, Estimate pill uses `--ink-700`. Replaces the current stacked dual-pane layout. Toggling re-renders the section body with that pane's data.

**Existing math preserved:** Amount-driven entry (typing dollars back-calculates percentage), last-line rounding absorber near 100%, focus-select all on amount input — all unchanged from current behavior. *Inline-row* editing math is presentation-only. The *template selector*, however, is being restructured — see §3.14.

### 3.14 Template Calculator (replaces the current stamp-only template selector)

**Motivation:** The current `renderTemplateSelector` picks a fixed-length percentage array (e.g. S-Curve = `[10, 20, 30, 20, 15, 5]`) and stamps it across however many rows the user has already created. The period count is locked by the array; the user has no control over interval, end date, or row count except by manually adding/deleting rows after the stamp. v1 replaces this with a real calculator that generates the rows.

#### 3.14.1 Inputs (replaces the current Template + Start date pair)

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| **Distribution** | select | S-curve | One of `s_curve`, `linear`, `front_loaded`, `back_loaded` |
| **Periods (n)** | number | 6 | Range 1–36 |
| **Interval** | select | `monthly` | One of `monthly`, `bi_weekly`, `weekly` |
| **Start date** | date | today | Date of row 1 |
| **End date** | date (computed, read-only) | `start + (n − 1) × interval_days` | Displayed for user verification |
| Source amount | (inherited from record) | — | PO total / SO Base Contract / CO Contract or Estimate; not user-editable in this surface |

#### 3.14.2 Distribution functions `w(i, n)`

Each returns a per-period weight before normalization. The calculator then divides by `Σw(j, n)` to convert to a percentage.

| Shape | `w(i, n)` |
|-------|-----------|
| `linear` | `1` |
| `s_curve` | `sin(π × (i − 0.5) / n)` |
| `front_loaded` | `n − i + 1` |
| `back_loaded` | `i` |

`milestone` (custom user-supplied %) is **out of scope for v1** — the post-Generate inline editing covers ad-hoc milestone-style schedules; a dedicated Milestone Builder is a Phase 2 surface.

#### 3.14.3 Outputs (per row, generated)

| Field | Formula |
|-------|---------|
| `periodDate` | `start_date + (i − 1) × interval_days` (interval_days = 7 / 14 / ~30 per option) |
| `label` | `"Period " + i` (default; user-editable post-generate) |
| `percentage` | `round( w(i, n) / Σw(j, n) × 100, 2 )` |
| `amount` | `round( source × percentage / 100, 2 )` |
| Last-row rounding absorber | The last row's `amount` (and corresponding `percentage`) is adjusted so that `Σamount = source` exactly (zero rounding leakage). |
| `cumulativePct` / `cumulativeAmt` | Running totals over rows 1..i, computed on render (already in v1). |

#### 3.14.4 Interval-day mapping

| Option | Step |
|--------|------|
| `monthly` | Use date arithmetic `addMonths(start, i-1)` — preserves the day-of-month (snaps to month-end if start is 29/30/31 and target month is shorter) |
| `bi_weekly` | `start + (i − 1) × 14 days` |
| `weekly` | `start + (i − 1) × 7 days` |

#### 3.14.5 Generate behavior

- Clicking **Generate** replaces all current grid rows with the calculated rows. No partial merge.
- If the existing grid has any user-edited rows (detected via per-row `rowDirty` flag set on any input change), Generate first shows a `confirmDialog({headline: 'warn', body: 'Generating will replace your current rows.'})` and waits for confirmation.
- Generation runs client-side (no server round-trip). Generation also resets all `rowDirty` and `lastEdited` flags (see §3.14.8 for those flags' role in Rebalance).
- Post-generate, the inline-row editing math is unchanged from v1 (percent ↔ amount, last-line absorber, date free-edit).

#### 3.14.6 Preview panel (above Generate button)

Live-updating preview as inputs change:
- One-line meta: `"S-curve · 6 monthly periods · Apr 15 → Sep 15 2026"`
- Source amount display
- Mini bar chart (one bar per planned period, height = percentage)
- Compact table preview of the rows that will be created (5-row max, "+N more" if longer)
- No data is written until Generate is clicked

#### 3.14.7 UI vs internal math separation (REQUIREMENT)

**No formula, weight, normalization, Σ, "absorber," or other math terminology is ever exposed in the rendered UI.** All distribution math runs client-side, hidden behind the calculator inputs and the resulting grid. The user sees only:

- 5 calculator inputs (Distribution, Periods, Interval, Start date, End date)
- A bar-chart preview with percentages above each bar
- A row preview with Date / Label / % / Amount / Total % / Total Amount
- A Generate button

What the user **does not** see in production UI:
- The text `w(i, n)`, `sin`, `π`, `Σ`, "normalize," "weights"
- A "rounding absorber" badge or annotation
- Per-row math step-by-step

The verification mockup `calc-verification.html` (audit-only) and the formulas in §3.14.2 / §3.14.3 are reference material for implementation, not UI copy.

#### 3.14.8 Rebalance button (added per user request)

**When it appears:** A `Rebalance` button appears in the sticky save bar (positioned immediately to the left of `Save schedules`) **only when the totals are out of balance** — i.e. validation badge is `⚠ X% allocated` rather than `✓ Balanced`. When balanced, the button is removed from the bar (not greyed; visually absent) to keep the save bar uncluttered in the steady state.

**What it does:**
1. Computes the delta: `excess = Σpercentage − 100` (signed; can be positive or negative).
2. Identifies the **rebalance target set**: all rows **except the most recently edited row** (the row whose input was the last `change`-event source). The most-recently-edited row stays at exactly the value the user typed.
3. Computes the current `Σ_target = sum of percentage across target rows`.
4. Distributes `−excess` across the target rows proportional to their current percentage: for each target row `i`, `new_p[i] = p[i] − (p[i] / Σ_target) × excess`.
5. Re-derives each target row's `amount = round(source × new_p / 100, 2)`.
6. Runs the last-row rounding absorber on the **last target row** (not necessarily the last grid row) so `Σpercentage = 100.00%` and `Σamount = source` exactly.
7. Re-renders the grid with the new values. Validation badge swaps to `✓ Balanced`. The most-recently-edited row's `lastEdited` flag is preserved so a *second* Rebalance would still leave that row alone.

**Tooltip on the button** (shown on hover, plain language only): `"Distribute the 8.33% overage across the other 5 lines proportionally."` Numbers update live as the user types.

**Edge cases:**
- If only one row exists (or all rows have been individually edited in this session, with no clear "most recent"), Rebalance computes against all rows except the one with the largest absolute deviation from `source/n`; tooltip becomes `"Rebalance from the largest line."` This is a fallback — the common path is single-row edit followed by Rebalance.
- If a target row's `new_p` would go negative (e.g. user typed `200%` into one row of a 4-row grid), the Rebalance instead **floors that row at 0% and redistributes the residual across the remaining target rows**. Repeats until all targets are ≥ 0.
- After rebalance, the grid is still in the dirty save-state (the user must still click Save to persist).

**No UI math reveal:** the button label is just "Rebalance." The tooltip uses plain English. No formulas, no Σ, no "absorber."

#### 3.14.9 What gets removed from the current code

- `BUILT_IN_TEMPLATES` array of fixed percentage arrays in `bc_timing_engine.js`
- The `applyTemplate(sectionId)` client function that stamps an array onto existing rows
- The current 2-input toolbar (Template + Start date)

### 3.15 UI element catalog (consistency reference)

All surfaces use the same primitive set. Every variant below ships in the shared `bc_cf_styles.js` (CSS) + `bc_cf_ui.js` (HTML builders). No surface invents new primitives.

#### 3.15.1 Buttons

| Class | Visual | Use |
|-------|--------|-----|
| `.bccf-btn` (default) | Surface bg, border, ink-700 text | Secondary actions: Export CSV, Clear all, Review Accrual, Discard changes |
| `.bccf-btn.bccf-btn-pri` | Brand-500 bg, white text | Primary action: Save schedules, Apply template / Generate, Export PDF |
| `.bccf-btn.bccf-btn-ghost` | Transparent, brand-500 text | Tertiary: Clear all (in toolbar), in-iframe links |
| `.bccf-btn.bccf-btn-danger-ghost` | Transparent, danger-500 text | Row-level delete `✕` (no fill, used per row in grid) |
| `.bccf-btn.bccf-btn-sm` | min-height 28px | Compact contexts |
| `.bccf-add-row-btn` | Dashed border, transparent | The "+ Add line" affordance below the grid (matches bc_wo_wp `.resume-card.new` ethos) |

**No icon emoji on buttons** (e.g. no 💾 on Save). If an icon is needed, use an inline `<svg>` glyph from the shared icon set.

#### 3.15.2 Toggles & segmented controls

| Pattern | Use | Active color |
|---------|-----|--------------|
| `.bccf-toggle` (Cash / Accrual pill) | Report-surface cash-vs-accrual switch | `--brand-500` |
| `.bccf-pane-toggle` (Contract / Estimate) | CO Schedule pane switch | Contract: `--brand-500` · Estimate: `--ink-700` |
| `.bccf-tabs` (underline tabs) | (a) In-iframe report nav: Combined / Cost / Revenue; (b) Editor tabs: Cash Flow / Accrual | Active border + text = `--brand-500` for Cash Flow; `--ink-500/700` for Accrual |

All three are pure CSS — no JS dependency for the visual state; click handlers swap a `.active` class.

#### 3.15.3 Selects, inputs, dates

Single style across all surfaces:
- Border `--border`, radius `--r-md`, padding `7px 10px`, font-size 13px, font-family inherit (Inter)
- Focus state: `outline: 2px solid var(--brand-500); outline-offset: -1px; border-color: var(--brand-500);`
- Read-only inputs (e.g. computed End date): bg `--bg-100`, color `--ink-700`, no focus ring

**Grid input variant** (inside the schedule editor `<table.bccf-grid>`):
- Border `transparent` at rest, reveals bg-50 + border on hover, focus ring on active
- Feels inline rather than form-y

#### 3.15.4 Badges & pills

| Class | Background | Text | Use |
|-------|------------|------|-----|
| `.bccf-badge.success` | `--success-50` | `--success-500` | ✓ Balanced (totals row); Saved status |
| `.bccf-badge.warn` | `--warn-50` | `--warn-500` | ⚠ X% allocated (unbalanced totals); Dirty/unsaved |
| `.bccf-badge.danger` | `--danger-50` | `--danger-500` | (Reserved for future destructive states) |
| `.bccf-badge.brand` | `--brand-50` | `--brand-500` | Record-id pills (PO 16240, CO-001), Cash basis pill |
| `.bccf-badge.neutral` | `--bg-100` | `--ink-700` | Saved · N min ago timestamp |
| `.bccf-title-pill` | (same as brand) | | The inline pill next to `<h1>` titles |

#### 3.15.5 KPI cards

`.bccf-kpi` — surface bg, border, r-lg, padding 14px 16px. Components inside: `.k` (uppercase label, ink-500), `.v` (24px or 20px value, ink-900 default), `.sub` (12px subline, ink-500). Variant `.bccf-kpi.accent` colors `.v` with `--brand-500` for the headline total. **No KPI ever colors `.v` with green/red** — green/red is reserved exclusively for net-sign deltas in chart amount labels and tfoot Net cells (per §3.7).

#### 3.15.6 Toast / Confirm

- **Toast host**: fixed top-right (z 200), one host per iframe. Border-left color: info=brand, warn=warn, danger=danger. Default TTL 4500ms, manual close `✕`.
- **Confirm dialog**: `Promise<boolean>` via `confirmDialog({headline, body, confirmLabel, cancelLabel, confirmStyle})`. `confirmStyle: 'danger'` reddens the confirm button. Esc=false, Enter=true. Replaces any native `confirm()` use across all 6 surfaces.

#### 3.15.7 Validation badge (in tfoot)

Embedded in the totals row (no separate `<div>`):
- `<span class="bccf-badge success">✓ Balanced</span>` when `|totalPct − 100| < 0.01` AND `|totalAmt − source| < 0.01`
- `<span class="bccf-badge warn">⚠ {totalPct}% allocated</span>` otherwise

### 3.16 Skeleton loading state (per report shell SL)

Shell Suitelet returns the HTML doc immediately with:

- **Header** rendered fully (title, meta, toolbar) — no skeleton, this is server-cheap chrome
- **In-iframe nav tabs** rendered fully (active tab known from URL)
- **KPI strip**: 4 `.bccf-kpi` cards with placeholder labels rendered, but `.v` and `.sub` replaced by `.bccf-skel` shimmer bars (one wide bar for `.v`, one narrow bar for `.sub`)
- **Chart panel**: Title rendered, but the bar grid is 6 `.bccf-skel.bar-skel` shimmer rectangles at varied heights (40%, 70%, 100%, 90%, 60%, 30%) so it visually previews a real chart
- **Data table**: Header rendered, then 5 `.bccf-skel-row` rows where each cell is a shimmer bar at varied widths
- **No spinner overlay** — skeleton is the only loading affordance

Client JS reads `<body data-data-url>`, fires `fetch(url)`, replaces skeleton regions on resolve:
- On success: swap each skeleton region in place with the real content via a single innerHTML replace per region (no flicker)
- On failure: replace the chart + table regions with an inline error card (`<div class="bccf-error-card">` with red left border, the error message, and a "Retry" button that re-fires the fetch)

Shimmer animation: `background: linear-gradient(90deg, #eef0f4 0%, #f7f8fa 50%, #eef0f4 100%); background-size: 200%; animation: bccf-shimmer 1.2s ease-in-out infinite;` (same primitive bc_wo_wp uses).

---

## 4. Verification before deploy

Once implementation lands, manually verify the live grid against the demo project so the customer demo numbers reconcile:

- **Project 1807** (Data Airflow — Cash Flow Demo) on account TD2984799
- **Revenue:** SO0631 Base Contract $30K + CO-001 billing $12K = $42K total
- **Cost:** PO 16240 Phoenix Mech $15K + PO 16241 Metro Electric $8K + CO-001 Estimate $10K = $33K total
- **Net:** $9K (21.4% margin)

---

## 5. Files affected (preview — finalized in implementation plan)

### New files
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` — shared token + primitive CSS, returns a single `<style>` block
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js` — shared HTML primitives (panel, header, kpi, chart, table, toast, confirm, skeleton) as JS string builders
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` — new shared action-routed JSON data Suitelet for all 3 reports
- `Objects/scripts/customscript_bc_cf_data_sl.xml` — deployment

### Modified files
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` — convert to shell-only, drop SuiteQL, drop actuals merge
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js` — convert to shell-only, drop actuals
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js` — convert to shell-only, drop actuals
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js` — strip all actuals-merge logic, keep forecast-grid utilities
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js` — adopt shared `bc_cf_styles.js` + primitives in the schedule editor
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cost_timing_ue.js` — re-skin schedule subtab
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_rev_timing_ue.js` — re-skin schedule subtab
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_co_timing_ue.js` — re-skin schedule subtab (preserve Contract/Estimate dual-pane)
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_project_ue.js` — point iframe stamps at the new shell SLs (URL changes if shell SLs get new script IDs)

### Deleted code
- All actuals-related SuiteQL in `bc_cf_report_utils.js` (queries + merge logic)
- KPI definitions for actuals
- CSS for actual rows / spark markers
- Any docstring or comment block referencing actuals

---

## 6. Deployment + demo timeline

POC is queued for deployment in the customer's NetSuite environment as soon as this redesign is stable. Implementation should be sized accordingly — favor smaller, deployable steps over comprehensive sweeping commits.

---

*Brainstorming closed 2026-05-22. Implementation plan generated from this spec via `superpowers:writing-plans`.*

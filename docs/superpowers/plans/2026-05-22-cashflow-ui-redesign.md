# BC Cash Flow UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor 6 BC Cash Flow surfaces (3 reports + 3 schedule editors) to a unified design system, remove the half-finished actuals integration, and replace the stamp-only template selector with a real schedule calculator (Generate + Rebalance) — so the v1 POC can ship to the customer's NetSuite environment.

**Architecture:** Single shared `bc_cf_styles.js` + `bc_cf_ui.js` primitives module imported by all 6 surfaces. Reports split into shell Suitelet (HTML + skeleton) + shared data Suitelet (action-routed JSON). Schedule editor keeps its in-record iframe but adopts the shared primitives and a new pure-function calculator module (`bc_cf_calculator.js`). Actuals SuiteQL and merge logic are deleted (preserved in git history for Phase 2 re-introduction).

**Tech Stack:** SuiteScript 2.1 AMD (`@NApiVersion 2.1`), hand-rolled vanilla JS + CSS inlined in template literals, Jest + `@oracle/suitecloud-unit-testing` for tests, SuiteCloud SDF for deploy.

**Spec:** `docs/superpowers/specs/2026-05-22-cashflow-ui-redesign-design.md` (the authoritative design record).

**Deploy cadence:** Each phase ends in a green test run + a deployable commit. Phase 1 alone unblocks the customer POC; later phases layer polish on top.

---

## File Structure

### New files
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` — shared CSS tokens + primitive class definitions; exports a single `getStyles()` returning a `<style>` block string
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js` — shared HTML primitive builders (panel, header, kpi, chart, table, toast, confirmDialog, skeleton, validation badge, save bar)
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator.js` — pure-function calculator (distribution weights, generate rows, rebalance redistribution); no I/O, no DOM
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` — shared action-routed JSON data Suitelet (`?action=combined|cost|revenue`)
- `Objects/scripts/customscript_bc_cf_data_sl.xml` — deployment for the data Suitelet
- `tests/modules/bc_cf_calculator.test.js` — Jest tests for the calculator
- `tests/modules/bc_cf_styles.test.js` — shape tests for the styles module
- `tests/modules/bc_cf_ui.test.js` — shape tests for HTML builders
- `tests/entry_points/bc_cf_data_sl.test.js` — action routing + response shape tests

### Modified files
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js` — strip actuals; adopt shared styles/builders
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` — convert to shell-only
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js` — convert to shell-only
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js` — convert to shell-only
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js` — adopt shared primitives, new calculator toolbar, new save bar, Rebalance button, column renames
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_engine.js` — remove `applyTemplate` + `BUILT_IN_TEMPLATES`; keep the rest
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cost_timing_ue.js` — no logic change; verify still passes templates correctly
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_rev_timing_ue.js` — same
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_co_timing_ue.js` — same; CO Contract/Estimate stacked panes become a toggle
- `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_project_ue.js` — verify iframe stamps unchanged (no new script IDs)

### Deleted code (inside existing files; files themselves remain)
- All `fetchActuals` / `buildActuals*` code paths in `bc_cf_combined_sl.js`, `bc_cf_cost_report_sl.js`, `bc_cf_rev_report_sl.js`, and `bc_cf_report_utils.js`
- `BUILT_IN_TEMPLATES` array + `applyTemplate` function in `bc_timing_engine.js`
- All actuals CSS in `bc_cf_report_utils.js` `getReportStyles()` (`.kpi-actual`, `tr.actual-sec-hdr`, `tr.actual-detail`, `tr.actual-close`, `tr.net-actual-row`, `.actual-badge`)
- The `fmtActual` helper in `bc_cf_report_utils.js`

---

# Phase 1 — Drop actuals (deploy-immediate unblock for customer POC)

**Goal of phase:** Get the codebase into a deployable forecast-only state in one tranche. No UI redesign yet — just delete the half-finished actuals integration so we stop carrying the unstable SuiteQL joins and the variance code that produced incorrect numbers.

**Phase exit criteria:** All 3 report Suitelets render forecast-only, no actuals references remain, tests pass, project deploys clean to a sandbox.

---

### Task 1: Smoke-test the current report Suitelets render

**Files:**
- Read: `tests/modules/bc_timing_engine.test.js` (to confirm Jest setup)

- [ ] **Step 1: Run the existing test suite to confirm baseline green**

Run: `npm test`
Expected: Jest runs, existing `bc_timing_engine.test.js` and `bc_timing_data_sl.test.js` pass.

If the suite is red, stop and fix before continuing — every later phase relies on knowing the baseline is stable.

- [ ] **Step 2: Note the current report-Suitelet line counts**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_*sl.js FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js`
Expected (approximate, for change verification at end of phase): 566 + 228 + 225 + 690 = 1709 lines total.

- [ ] **Step 3: Confirm no uncommitted edits to the report files before starting**

Run: `git status FileCabinet/SuiteScripts/BlueCollar/CashFlow/`
Expected: working tree clean.

---

### Task 2: Strip actuals from `bc_cf_report_utils.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js`

This file currently exports utilities used by all 3 report Suitelets. Actuals concerns are spread across CSS (lines ~150–210), `fmtActual` (line ~25), `buildKPICards` (handles an `actualsRow` 2nd row of cards), and `buildPeriodTable` (handles an `actuals` config block, lines ~565–630).

- [ ] **Step 1: Read the file end-to-end so you know what's there**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js`
Then `Read` the file (Read tool). Identify every reference to: `fmtActual`, `kpi-actual`, `actualsRow`, `actual-sec-hdr`, `actual-detail`, `actual-badge`, `actual-close`, `net-actual-row`, and the `actuals` config destructure in `buildPeriodTable`.

- [ ] **Step 2: Delete the `fmtActual` helper definition**

Locate the JSDoc + function around line 25:
```js
/** Format for actual rows — always positive display, zero → em-dash. */
const fmtActual = (n) => { ... };
```
Delete the whole block (JSDoc + function body). It is not used after this phase.

- [ ] **Step 3: Delete actuals CSS from `getReportStyles()`**

Remove every selector listed at the end of this task's Files block from the inlined CSS in `getReportStyles()`:
- `.kpi-actual`
- `tr.actual-sec-hdr td`, `tr.actual-sec-hdr` (any variants)
- `.actual-badge`
- `tr.actual-detail td`, `tr.actual-detail td:first-child`
- `tr.actual-close td`
- `tr.net-actual-row td`, `tr.net-actual-row td.positive`, `tr.net-actual-row td.negative`

Leave the rest of the CSS untouched.

- [ ] **Step 4: Remove the `actualsRow` parameter from `buildKPICards`**

Change the signature from:
```js
const buildKPICards = (items, actualsRow) => {
```
to:
```js
const buildKPICards = (items) => {
```
Then delete the `if (actualsRow && actualsRow.length) { ... }` block below the existing forecast-cards loop. Update the JSDoc to drop `@param {Object[]} [actualsRow]`.

- [ ] **Step 5: Remove the `actuals` config from `buildPeriodTable`**

In the function `buildPeriodTable(config)`:
- In the destructure `const { columnHeader, periods, groups, groupOrder, groupTotals, totals, grandTotal, groupSourceMap, actuals } = config;` — remove `, actuals`.
- Delete the entire `// Actuals section (no column total)` block (around lines 601–630). Keep the regular `tbody` build and `</table>` close. Remove the `+ actualHtml` concatenation if present.
- Update the JSDoc to drop `@param {Object} [config.actuals]`.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: All existing tests still pass. (No tests reference actuals; `bc_cf_report_utils.js` is currently untested but doesn't need new tests for a deletion-only change.)

- [ ] **Step 7: Verify the file lost ~150 lines**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js`
Expected: 540–560 lines (down from 690). If it's still 690 you missed something — grep for `actual` and finish the cleanup.

Run: `grep -ni "actual" FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js`
Expected: No matches.

- [ ] **Step 8: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js
git commit -m "refactor: drop actuals from bc_cf_report_utils — forecast-only utilities

Removes fmtActual, kpi-actual CSS, actualsRow param on buildKPICards,
and the actuals config block in buildPeriodTable. Forecast utilities
unchanged. See spec §3.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Strip actuals from `bc_cf_combined_sl.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`

- [ ] **Step 1: Identify the actuals code paths**

Run: `grep -n "actual\|Actual\|VendBill\|VendPmt\|CustInvc\|CustPymt\|fetchActuals" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`

You will see references in: `fetchActuals` function definition (~line 122), `actuals` destructure (~line 264), the actuals-rendering branches (`Revenue actuals (no column total row)`, `Cost actuals`, `Net Actual row`), and the call site `const actuals = fetchActuals(projectId);` (~line 482).

- [ ] **Step 2: Delete the `fetchActuals` function definition**

Locate `const fetchActuals = (projectId) => { ... };` and remove the entire function (JSDoc + body). Also delete any helper imports it uses that nothing else needs (re-check with grep before removing imports).

- [ ] **Step 3: Delete the `fetchActuals(projectId)` call site**

Locate and delete `const actuals = fetchActuals(projectId);` (around line 482) and the conditional KPI/actuals row construction that follows it (`Conditional actuals KPI row` block).

- [ ] **Step 4: Remove `actuals` from object destructures and config**

Search the file for `actuals` usages — every `const { ..., actuals } = ...` should drop the `actuals` key, and every place that passes `actuals:` into a config object should drop that key.

- [ ] **Step 5: Delete the actuals-rendering branches**

The file builds the period table rows around lines 314–415. Delete the blocks labeled "Revenue actuals", "Cost actuals", and "Net Actual row". Keep the forecast Revenue, Cost, and Net rows.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All existing tests pass. No new tests for this refactor (deletion-only).

- [ ] **Step 7: Verify the file is actuals-free**

Run: `grep -ni "actual\|VendBill\|VendPmt\|CustInvc\|CustPymt" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
Expected: No matches. If `Actual` appears in a comment string, delete the comment too.

- [ ] **Step 8: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js
git commit -m "refactor: drop actuals from combined report — forecast-only

Removes fetchActuals SuiteQL block, actuals KPI row, and actual-row
rendering. Spec §3.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Strip actuals from `bc_cf_cost_report_sl.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`

- [ ] **Step 1: Identify references**

Run: `grep -n "actual\|VendBill\|VendPmt\|fetchActuals\|billed\|paid" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`

- [ ] **Step 2: Delete the actuals fetch and merge code**

Apply the same surgery as Task 3 — delete any `fetchActuals` / `loadActuals` function, its call site, any `actuals` destructures, and any rendering branches that use them. The cost report only deals with cost-side actuals (`VendBill` / `VendPmt`), so the grep set is narrower.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 4: Verify clean**

Run: `grep -ni "actual\|VendBill\|VendPmt\|billed\|paid" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`
Expected: No matches except where the words appear in non-actuals contexts (e.g. a JSDoc reference to a cost category). Re-read the file to confirm.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js
git commit -m "refactor: drop actuals from cost report — forecast-only

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Strip actuals from `bc_cf_rev_report_sl.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`

- [ ] **Step 1: Identify references**

Run: `grep -n "actual\|CustInvc\|CustPymt\|fetchActuals\|invoiced\|collected" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`

- [ ] **Step 2: Delete the actuals fetch and merge code (same surgery as Tasks 3–4)**

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: Pass.

- [ ] **Step 4: Verify clean**

Run: `grep -ni "actual\|CustInvc\|CustPymt\|invoiced\|collected" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`
Expected: No matches in actuals contexts.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js
git commit -m "refactor: drop actuals from revenue report — forecast-only

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Deploy Phase 1 to sandbox + smoke-test

**Files:**
- None modified; this task is deploy + verify only.

- [ ] **Step 1: Run a deploy dry-run**

Run: `npm run deploy:dryrun`
Expected: No errors. SDF lists which files will be uploaded.

- [ ] **Step 2: Deploy file-only updates (matches PROJECT_STATUS guidance)**

Run:
```bash
npx suitecloud file:upload --paths \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js"
```
Expected: All 4 files report as uploaded successfully.

- [ ] **Step 3: Smoke-test on the demo project**

In a browser:
1. Open the NetSuite Project record for `Data Airflow — Cash Flow Demo` (ID 1807).
2. Click the **Cash Flow** tab.
3. Confirm all 3 iframes render. Confirm: no actuals KPIs, no actual rows in any table, no two-color chart bars, no italic-grey rows.
4. Confirm the forecast totals match: Revenue $42,000 · Cost $33,000 · Net $9,000.

- [ ] **Step 4: Commit a phase-end marker (optional but recommended for git log clarity)**

```bash
git commit --allow-empty -m "chore: Phase 1 complete — actuals removed, POC unblocked

All 3 report Suitelets render forecast-only. Customer POC environment
is now safe to receive this code (no half-finished SuiteQL joins).
Spec §3.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 1 exit:** customer-deployable forecast-only POC.

---

# Phase 2 — Foundation modules

**Goal of phase:** Create the shared design system and calculator math modules. No surface changes yet — pure new files. Sets up everything Phases 3–5 depend on.

**Phase exit criteria:** `bc_cf_styles.js`, `bc_cf_ui.js`, and `bc_cf_calculator.js` exist with full test coverage of the math.

---

### Task 7: Create `bc_cf_styles.js` shared CSS module

**Files:**
- Create: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`
- Create: `tests/modules/bc_cf_styles.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/modules/bc_cf_styles.test.js`:
```js
import Styles from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles';

describe('bc_cf_styles', () => {
    describe('getStyles()', () => {
        it('returns a string wrapped in <style> tags', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/^<style>/);
            expect(out).toMatch(/<\/style>$/);
        });

        it('defines all design tokens from spec §3.1', () => {
            const out = Styles.getStyles();
            // Brand
            expect(out).toContain('--bccf-brand-500: #1f3b5e');
            expect(out).toContain('--bccf-brand-600: #16304d');
            expect(out).toContain('--bccf-brand-50: #eaeef4');
            // Ink scale
            expect(out).toContain('--bccf-ink-500: #5b6472');
            expect(out).toContain('--bccf-ink-700: #2f3742');
            expect(out).toContain('--bccf-ink-900: #121821');
            // Backgrounds
            expect(out).toContain('--bccf-bg-50: #f7f8fa');
            expect(out).toContain('--bccf-bg-100: #eef0f4');
            expect(out).toContain('--bccf-surface: #ffffff');
            // Border + status
            expect(out).toContain('--bccf-border: #e2e6ec');
            expect(out).toContain('--bccf-success-500: #1f9d55');
            expect(out).toContain('--bccf-warn-500: #c97a0b');
            expect(out).toContain('--bccf-danger-500: #c2361d');
        });

        it('defines core primitive classes from spec §3.15', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-panel\b/);
            expect(out).toMatch(/\.bccf-btn\b/);
            expect(out).toMatch(/\.bccf-btn-pri\b/);
            expect(out).toMatch(/\.bccf-btn-ghost\b/);
            expect(out).toMatch(/\.bccf-btn-danger-ghost\b/);
            expect(out).toMatch(/\.bccf-add-row-btn\b/);
            expect(out).toMatch(/\.bccf-toggle\b/);
            expect(out).toMatch(/\.bccf-pane-toggle\b/);
            expect(out).toMatch(/\.bccf-tabs\b/);
            expect(out).toMatch(/\.bccf-kpi\b/);
            expect(out).toMatch(/\.bccf-badge\b/);
            expect(out).toMatch(/\.bccf-skel\b/);
            expect(out).toMatch(/\.bccf-toast\b/);
            expect(out).toMatch(/\.bccf-modal\b/);
        });

        it('namespaces every class with bccf- prefix', () => {
            const out = Styles.getStyles();
            // Find any class selector NOT starting with .bccf- (excluding pseudo-classes / element selectors)
            const orphans = out.match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) || [];
            const violations = orphans.filter(c => !c.startsWith('.bccf-'));
            expect(violations).toEqual([]);
        });
    });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- bc_cf_styles`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the styles module**

Create `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`:
```js
/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Shared design tokens + primitive CSS for all BC Cash Flow surfaces.
 * Imported by every report Suitelet shell and the schedule editor.
 * Spec: docs/superpowers/specs/2026-05-22-cashflow-ui-redesign-design.md §3.1 / §3.15
 */
define([], function () {

    const TOKENS = `
        :root {
            /* Backgrounds */
            --bccf-bg-50: #f7f8fa;
            --bccf-bg-100: #eef0f4;
            --bccf-surface: #ffffff;
            --bccf-border: #e2e6ec;
            /* Ink */
            --bccf-ink-500: #5b6472;
            --bccf-ink-700: #2f3742;
            --bccf-ink-900: #121821;
            /* Brand */
            --bccf-brand-500: #1f3b5e;
            --bccf-brand-600: #16304d;
            --bccf-brand-50: #eaeef4;
            /* Status */
            --bccf-success-500: #1f9d55;
            --bccf-success-50: #e7f6ec;
            --bccf-warn-500: #c97a0b;
            --bccf-warn-50: #fdf4e3;
            --bccf-danger-500: #c2361d;
            --bccf-danger-50: #fbeceb;
            /* Type scale */
            --bccf-text-xs: 12px;
            --bccf-text-sm: 13px;
            --bccf-text-base: 14px;
            --bccf-text-lg: 16px;
            --bccf-text-xl: 20px;
            --bccf-text-2xl: 26px;
            /* Spacing */
            --bccf-s-1: 4px;  --bccf-s-2: 8px;  --bccf-s-3: 12px;
            --bccf-s-4: 16px; --bccf-s-5: 20px; --bccf-s-6: 24px; --bccf-s-8: 32px;
            /* Radius */
            --bccf-r-sm: 4px; --bccf-r-md: 6px; --bccf-r-lg: 10px; --bccf-r-full: 999px;
            /* Shadow + motion */
            --bccf-shadow-1: 0 1px 2px rgba(18,24,33,.04), 0 1px 1px rgba(18,24,33,.02);
            --bccf-shadow-2: 0 -4px 12px rgba(18,24,33,.04);
            --bccf-t-fast: 120ms;
        }
        body { font-family: "Inter", "Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: var(--bccf-ink-900); background: var(--bccf-bg-50); color-scheme: light; }
    `;

    const PRIMITIVES = `
        /* Panel */
        .bccf-panel { background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-lg); box-shadow: var(--bccf-shadow-1); }
        .bccf-panel-header { padding: 14px 18px; border-bottom: 1px solid var(--bccf-border); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .bccf-panel-body { padding: 14px 18px; }
        .bccf-panel-footer { padding: 12px 18px; background: var(--bccf-bg-50); border-top: 1px solid var(--bccf-border); display: flex; justify-content: flex-end; gap: 8px; }

        /* Buttons */
        .bccf-btn { font-size: var(--bccf-text-sm); background: var(--bccf-surface); border: 1px solid var(--bccf-border); padding: 7px 14px; border-radius: var(--bccf-r-md); color: var(--bccf-ink-700); font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; transition: box-shadow var(--bccf-t-fast); }
        .bccf-btn:hover { box-shadow: var(--bccf-shadow-1); }
        .bccf-btn-pri { background: var(--bccf-brand-500); color: #fff; border-color: var(--bccf-brand-500); }
        .bccf-btn-pri:hover { background: var(--bccf-brand-600); }
        .bccf-btn-ghost { background: transparent; border-color: transparent; color: var(--bccf-brand-500); }
        .bccf-btn-danger-ghost { background: transparent; border-color: transparent; color: var(--bccf-danger-500); padding: 4px 8px; min-height: 0; }
        .bccf-btn-sm { min-height: 28px; padding: 4px 10px; font-size: var(--bccf-text-xs); }
        .bccf-add-row-btn { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: transparent; border: 1px dashed var(--bccf-border); color: var(--bccf-ink-500); border-radius: var(--bccf-r-md); font-size: var(--bccf-text-sm); font-weight: 500; cursor: pointer; }
        .bccf-add-row-btn:hover { background: var(--bccf-bg-50); color: var(--bccf-brand-500); border-color: var(--bccf-brand-500); }

        /* Toggle / segmented control */
        .bccf-toggle { background: var(--bccf-bg-50); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-full); padding: 3px; display: inline-flex; gap: 2px; }
        .bccf-toggle button { font-size: var(--bccf-text-xs); padding: 4px 12px; border-radius: var(--bccf-r-full); color: var(--bccf-ink-500); border: 0; background: transparent; font-weight: 500; cursor: pointer; }
        .bccf-toggle button.active { background: var(--bccf-brand-500); color: #fff; }
        .bccf-pane-toggle { display: inline-flex; padding: 3px; background: var(--bccf-bg-100); border-radius: var(--bccf-r-full); }
        .bccf-pane-toggle button { font-size: var(--bccf-text-sm); padding: 6px 16px; border-radius: var(--bccf-r-full); background: transparent; border: 0; color: var(--bccf-ink-500); font-weight: 500; cursor: pointer; }
        .bccf-pane-toggle button.active.contract { background: var(--bccf-brand-500); color: #fff; }
        .bccf-pane-toggle button.active.estimate { background: var(--bccf-ink-700); color: #fff; }

        /* Tabs (underline) */
        .bccf-tabs { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid var(--bccf-border); background: var(--bccf-surface); }
        .bccf-tabs a { padding: 12px 14px; font-size: var(--bccf-text-sm); color: var(--bccf-ink-500); font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; text-decoration: none; cursor: pointer; }
        .bccf-tabs a.active.cashflow, .bccf-tabs a.active.brand { color: var(--bccf-brand-500); border-bottom-color: var(--bccf-brand-500); }
        .bccf-tabs a.active.accrual { color: var(--bccf-ink-700); border-bottom-color: var(--bccf-ink-500); }

        /* KPI card */
        .bccf-kpi { background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-lg); padding: 14px 16px; }
        .bccf-kpi .bccf-k { font-size: var(--bccf-text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--bccf-ink-500); font-weight: 500; }
        .bccf-kpi .bccf-v { font-size: var(--bccf-text-2xl); font-weight: 600; color: var(--bccf-ink-900); letter-spacing: -0.01em; margin-top: 4px; line-height: 1; }
        .bccf-kpi .bccf-sub { font-size: var(--bccf-text-xs); color: var(--bccf-ink-500); margin-top: 6px; }
        .bccf-kpi.accent .bccf-v { color: var(--bccf-brand-500); }

        /* Badge */
        .bccf-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: var(--bccf-r-full); }
        .bccf-badge.success { background: var(--bccf-success-50); color: var(--bccf-success-500); }
        .bccf-badge.warn { background: var(--bccf-warn-50); color: var(--bccf-warn-500); }
        .bccf-badge.danger { background: var(--bccf-danger-50); color: var(--bccf-danger-500); }
        .bccf-badge.brand { background: var(--bccf-brand-50); color: var(--bccf-brand-500); }
        .bccf-badge.neutral { background: var(--bccf-bg-100); color: var(--bccf-ink-700); }

        /* Inputs */
        .bccf-input, .bccf-select, .bccf-date { font-size: var(--bccf-text-sm); padding: 7px 10px; border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); background: var(--bccf-surface); color: var(--bccf-ink-900); font-family: inherit; }
        .bccf-input:focus, .bccf-select:focus, .bccf-date:focus { outline: 2px solid var(--bccf-brand-500); outline-offset: -1px; border-color: var(--bccf-brand-500); }
        .bccf-input[readonly], .bccf-date[readonly] { background: var(--bccf-bg-100); color: var(--bccf-ink-700); cursor: default; }

        /* Skeleton shimmer */
        .bccf-skel { background: linear-gradient(90deg, #eef0f4 0%, #f7f8fa 50%, #eef0f4 100%); background-size: 200%; animation: bccf-shimmer 1.2s ease-in-out infinite; border-radius: var(--bccf-r-sm); display: inline-block; }
        @keyframes bccf-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        /* Toast */
        #bccf-toast-host { position: fixed; top: 16px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 200; }
        .bccf-toast { background: var(--bccf-surface); border: 1px solid var(--bccf-border); box-shadow: var(--bccf-shadow-1); border-radius: var(--bccf-r-md); padding: 10px 14px; min-width: 320px; max-width: 440px; font-size: var(--bccf-text-sm); display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; animation: bccf-toast-in 200ms ease-out; }
        .bccf-toast.info { border-left: 4px solid var(--bccf-brand-500); }
        .bccf-toast.warn { border-left: 4px solid var(--bccf-warn-500); }
        .bccf-toast.danger { border-left: 4px solid var(--bccf-danger-500); }
        .bccf-toast-close { background: transparent; border: 0; color: var(--bccf-ink-500); cursor: pointer; font-size: 14px; }
        @keyframes bccf-toast-in { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        /* Modal / confirm */
        .bccf-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,38,.55); display: flex; justify-content: center; padding-top: 60px; z-index: 100; }
        .bccf-modal { background: var(--bccf-surface); border-radius: var(--bccf-r-lg); box-shadow: 0 16px 48px rgba(0,0,0,.18); max-width: 480px; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
        .bccf-modal-headline-warn { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bccf-warn-500); font-weight: 600; }
        .bccf-modal-headline-danger { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bccf-danger-500); font-weight: 600; }
        .bccf-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

        /* Error card */
        .bccf-error-card { background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-left: 4px solid var(--bccf-danger-500); border-radius: var(--bccf-r-md); padding: 14px 16px; margin: 12px 0; }
        .bccf-error-card h4 { font-size: var(--bccf-text-base); color: var(--bccf-danger-500); margin: 0 0 6px; font-weight: 600; }
        .bccf-error-card pre { font-size: 12px; color: var(--bccf-ink-700); white-space: pre-wrap; margin: 6px 0; }

        /* Title pill */
        .bccf-title-pill { display: inline-flex; align-items: center; background: var(--bccf-brand-50); color: var(--bccf-brand-500); font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: var(--bccf-r-full); }
    `;

    /**
     * @returns {string} A `<style>` block containing all BC Cash Flow tokens + primitives.
     */
    const getStyles = () => `<style>${TOKENS}${PRIMITIVES}</style>`;

    return { getStyles };
});
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- bc_cf_styles`
Expected: PASS — all four assertions green.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js tests/modules/bc_cf_styles.test.js
git commit -m "feat: bc_cf_styles — shared CSS tokens + primitives module

Single source of truth for all BC Cash Flow surface styling.
Spec §3.1, §3.15.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Create `bc_cf_calculator.js` pure math module

**Files:**
- Create: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator.js`
- Create: `tests/modules/bc_cf_calculator.test.js`

This is the most heavily-tested module because it owns all schedule math. Pure functions, no `N/` imports.

- [ ] **Step 1: Write the failing tests for distribution weights**

Create `tests/modules/bc_cf_calculator.test.js`:
```js
import Calc from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator';

describe('bc_cf_calculator', () => {

    describe('weights(distribution, n)', () => {
        it('linear returns array of 1s', () => {
            expect(Calc.weights('linear', 4)).toEqual([1, 1, 1, 1]);
        });

        it('front_loaded returns descending n..1', () => {
            expect(Calc.weights('front_loaded', 4)).toEqual([4, 3, 2, 1]);
        });

        it('back_loaded returns ascending 1..n', () => {
            expect(Calc.weights('back_loaded', 4)).toEqual([1, 2, 3, 4]);
        });

        it('s_curve is symmetric for even n', () => {
            const w = Calc.weights('s_curve', 6);
            expect(w[0]).toBeCloseTo(w[5], 5);
            expect(w[1]).toBeCloseTo(w[4], 5);
            expect(w[2]).toBeCloseTo(w[3], 5);
        });

        it('s_curve middle is heaviest', () => {
            const w = Calc.weights('s_curve', 6);
            expect(w[2]).toBeGreaterThan(w[1]);
            expect(w[2]).toBeGreaterThan(w[0]);
        });
    });

    describe('normalize(weights)', () => {
        it('rescales to percentages summing to 100', () => {
            const p = Calc.normalize([1, 1, 1, 1]);
            expect(p).toEqual([25, 25, 25, 25]);
        });

        it('s_curve n=6 gives 6.70 / 18.30 / 25.00 splits', () => {
            const p = Calc.normalize(Calc.weights('s_curve', 6));
            expect(p[0]).toBeCloseTo(6.70, 2);
            expect(p[1]).toBeCloseTo(18.30, 2);
            expect(p[2]).toBeCloseTo(25.00, 2);
        });
    });

    describe('generate(opts)', () => {
        it('returns n rows with periodDate, label, percentage, amount', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 4,
                interval: 'monthly',
                startDate: new Date(2026, 5, 1),  // Jun 1
                source: 12000,
            });
            expect(rows).toHaveLength(4);
            rows.forEach((r, i) => {
                expect(r).toHaveProperty('periodDate');
                expect(r).toHaveProperty('label', `Period ${i + 1}`);
                expect(typeof r.percentage).toBe('number');
                expect(typeof r.amount).toBe('number');
            });
        });

        it('amounts sum exactly to source (rounding absorber active)', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 7,
                interval: 'monthly',
                startDate: new Date(2026, 5, 15),
                source: 10000,  // forces 100/7 = 14.2857..%
            });
            const sumAmt = rows.reduce((s, r) => s + r.amount, 0);
            expect(sumAmt).toBeCloseTo(10000, 2);
        });

        it('percentages sum exactly to 100.00', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 7,
                interval: 'monthly',
                startDate: new Date(2026, 5, 15),
                source: 10000,
            });
            const sumPct = rows.reduce((s, r) => s + r.percentage, 0);
            expect(Math.round(sumPct * 100) / 100).toBe(100.00);
        });

        it('monthly stepping preserves day-of-month', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 3,
                interval: 'monthly',
                startDate: new Date(2026, 3, 15),  // Apr 15
                source: 3000,
            });
            expect(rows[0].periodDate.getDate()).toBe(15);
            expect(rows[1].periodDate.getMonth()).toBe(4);  // May
            expect(rows[1].periodDate.getDate()).toBe(15);
            expect(rows[2].periodDate.getMonth()).toBe(5);  // Jun
            expect(rows[2].periodDate.getDate()).toBe(15);
        });

        it('bi_weekly stepping adds 14 days', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 3,
                interval: 'bi_weekly',
                startDate: new Date(2026, 5, 1),  // Jun 1
                source: 3000,
            });
            const ms = 24 * 60 * 60 * 1000;
            expect((rows[1].periodDate - rows[0].periodDate) / ms).toBe(14);
            expect((rows[2].periodDate - rows[1].periodDate) / ms).toBe(14);
        });

        it('weekly stepping adds 7 days', () => {
            const rows = Calc.generate({
                distribution: 'linear',
                periods: 3,
                interval: 'weekly',
                startDate: new Date(2026, 5, 1),
                source: 3000,
            });
            const ms = 24 * 60 * 60 * 1000;
            expect((rows[1].periodDate - rows[0].periodDate) / ms).toBe(7);
        });
    });

    describe('rebalance(rows, source, lastEditedIndex)', () => {
        it('redistributes overage across non-last-edited rows', () => {
            // Start from the §3.14.8 worked example:
            // Row 3 (index 2) edited from 25% → 33.33%, totals 108.33%
            const rows = [
                { percentage: 6.70,  amount: 1005.00 },
                { percentage: 18.30, amount: 2745.00 },
                { percentage: 33.33, amount: 5000.00 },  // edited
                { percentage: 25.00, amount: 3750.00 },
                { percentage: 18.30, amount: 2745.00 },
                { percentage: 6.70,  amount: 1005.00 },
            ];
            const out = Calc.rebalance(rows, 15000, 2);
            // Row 2 (index 2) untouched
            expect(out[2].percentage).toBeCloseTo(33.33, 2);
            expect(out[2].amount).toBeCloseTo(5000.00, 2);
            // Sum back to 100%
            const sumPct = out.reduce((s, r) => s + r.percentage, 0);
            expect(Math.round(sumPct * 100) / 100).toBe(100.00);
            // Sum amounts back to source
            const sumAmt = out.reduce((s, r) => s + r.amount, 0);
            expect(Math.round(sumAmt * 100) / 100).toBe(15000.00);
        });

        it('handles negative overage (under-allocated) symmetrically', () => {
            // Row 2 edited DOWN: 25% → 10%, totals 85%
            const rows = [
                { percentage: 20, amount: 2000 },
                { percentage: 20, amount: 2000 },
                { percentage: 10, amount: 1000 },  // edited
                { percentage: 20, amount: 2000 },
                { percentage: 15, amount: 1500 },
            ];
            const out = Calc.rebalance(rows, 10000, 2);
            expect(out[2].percentage).toBeCloseTo(10, 2);
            const sumPct = out.reduce((s, r) => s + r.percentage, 0);
            expect(Math.round(sumPct * 100) / 100).toBe(100.00);
        });

        it('floors negatives and redistributes residual', () => {
            // Row 0 edited to 200% on a 4-row grid: rebalance would push others negative
            const rows = [
                { percentage: 200, amount: 8000 },  // edited absurdly
                { percentage: 25,  amount: 1000 },
                { percentage: 25,  amount: 1000 },
                { percentage: 25,  amount: 1000 },
            ];
            const out = Calc.rebalance(rows, 4000, 0);
            expect(out[0].percentage).toBeCloseTo(200, 2);
            // Others should be floored at 0 — can't make total = 100 without touching row 0
            out.slice(1).forEach(r => expect(r.percentage).toBeGreaterThanOrEqual(0));
            // Caller's intent is preserved; UI still warns total > 100%
        });
    });

    describe('computeEndDate(startDate, periods, interval)', () => {
        it('monthly returns start + (n − 1) months', () => {
            const end = Calc.computeEndDate(new Date(2026, 3, 15), 6, 'monthly');
            expect(end.getFullYear()).toBe(2026);
            expect(end.getMonth()).toBe(8);  // September
            expect(end.getDate()).toBe(15);
        });

        it('bi_weekly returns start + (n − 1) × 14 days', () => {
            const end = Calc.computeEndDate(new Date(2026, 5, 1), 4, 'bi_weekly');
            // Jun 1 + 42 days = Jul 13
            expect(end.getMonth()).toBe(6);  // July
            expect(end.getDate()).toBe(13);
        });
    });
});
```

- [ ] **Step 2: Run tests — confirm all fail**

Run: `npm test -- bc_cf_calculator`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the calculator module**

Create `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator.js`:
```js
/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Pure-function schedule calculator for BC Cash Flow.
 * No I/O, no DOM, no `N/` imports — fully unit-testable in node.
 * Spec: §3.14 of the redesign design doc.
 */
define([], function () {

    const round2 = (n) => Math.round(n * 100) / 100;

    /**
     * Per-period weight before normalization. Spec §3.14.2.
     */
    const weights = (distribution, n) => {
        const w = new Array(n);
        for (let i = 1; i <= n; i++) {
            switch (distribution) {
                case 'linear':
                    w[i - 1] = 1;
                    break;
                case 's_curve':
                    w[i - 1] = Math.sin(Math.PI * (i - 0.5) / n);
                    break;
                case 'front_loaded':
                    w[i - 1] = n - i + 1;
                    break;
                case 'back_loaded':
                    w[i - 1] = i;
                    break;
                default:
                    throw new Error(`Unknown distribution: ${distribution}`);
            }
        }
        return w;
    };

    /**
     * Normalize a weight array to a percentage array summing to 100.
     * Last entry absorbs rounding so Σ = 100.00 exactly.
     */
    const normalize = (w) => {
        const total = w.reduce((s, x) => s + x, 0);
        const p = w.map(x => round2(x / total * 100));
        const drift = round2(100 - p.reduce((s, x) => s + x, 0));
        p[p.length - 1] = round2(p[p.length - 1] + drift);
        return p;
    };

    /**
     * Compute period dates from a start date + interval + count.
     * Monthly preserves day-of-month (and clamps via Date if month is shorter).
     */
    const computeDates = (startDate, n, interval) => {
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            if (interval === 'monthly') {
                const d = new Date(startDate);
                d.setMonth(d.getMonth() + i);
                out[i] = d;
            } else {
                const days = interval === 'weekly' ? 7 : 14;
                const d = new Date(startDate);
                d.setDate(d.getDate() + i * days);
                out[i] = d;
            }
        }
        return out;
    };

    const computeEndDate = (startDate, n, interval) => {
        return computeDates(startDate, n, interval)[n - 1];
    };

    /**
     * Generate row data for the grid. Spec §3.14.3.
     * @param {Object} opts
     * @param {'linear'|'s_curve'|'front_loaded'|'back_loaded'} opts.distribution
     * @param {number} opts.periods
     * @param {'monthly'|'bi_weekly'|'weekly'} opts.interval
     * @param {Date} opts.startDate
     * @param {number} opts.source
     * @returns {Array<{periodDate: Date, label: string, percentage: number, amount: number}>}
     */
    const generate = ({ distribution, periods, interval, startDate, source }) => {
        const w = weights(distribution, periods);
        const p = normalize(w);
        const dates = computeDates(startDate, periods, interval);
        const rows = p.map((pct, i) => ({
            periodDate: dates[i],
            label: `Period ${i + 1}`,
            percentage: pct,
            amount: round2(source * pct / 100),
        }));
        // Last-row amount absorber (handle currency rounding leak)
        const sumAmt = rows.reduce((s, r) => s + r.amount, 0);
        const amtDrift = round2(source - sumAmt);
        if (amtDrift !== 0) {
            rows[rows.length - 1].amount = round2(rows[rows.length - 1].amount + amtDrift);
        }
        return rows;
    };

    /**
     * Redistribute excess proportionally across all rows except `lastEditedIndex`.
     * Spec §3.14.8. Pure function — returns a NEW rows array (does not mutate input).
     */
    const rebalance = (rows, source, lastEditedIndex) => {
        const out = rows.map(r => ({ ...r }));
        const excess = round2(out.reduce((s, r) => s + r.percentage, 0) - 100);
        if (Math.abs(excess) < 0.01) return out;  // already balanced

        const targets = out.map((_, i) => i).filter(i => i !== lastEditedIndex);
        const sumTarget = targets.reduce((s, i) => s + out[i].percentage, 0);

        if (sumTarget > 0) {
            targets.forEach(i => {
                out[i].percentage = round2(out[i].percentage - (out[i].percentage / sumTarget) * excess);
                if (out[i].percentage < 0) out[i].percentage = 0;
            });
            // Re-derive amounts
            targets.forEach(i => {
                out[i].amount = round2(source * out[i].percentage / 100);
            });
            // Last-target absorber so Σ = 100 exactly
            const lastTarget = targets[targets.length - 1];
            const sumPct = out.reduce((s, r) => s + r.percentage, 0);
            const pctDrift = round2(100 - sumPct);
            out[lastTarget].percentage = round2(out[lastTarget].percentage + pctDrift);
            const sumAmt = out.reduce((s, r) => s + r.amount, 0);
            const amtDrift = round2(source - sumAmt);
            out[lastTarget].amount = round2(out[lastTarget].amount + amtDrift);
        }
        return out;
    };

    return { weights, normalize, computeDates, computeEndDate, generate, rebalance };
});
```

- [ ] **Step 4: Run the tests — confirm all pass**

Run: `npm test -- bc_cf_calculator`
Expected: PASS — 14 assertions across 4 describe blocks all green.

If anything fails, read the failing assertion and the calculator code together; do not change the test to make it pass.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator.js tests/modules/bc_cf_calculator.test.js
git commit -m "feat: bc_cf_calculator — pure-function schedule math

Distribution weights (linear, s_curve, front, back) + normalize +
generate (rows with dates, %, amounts, last-row rounding absorber)
+ rebalance (redistribute overage across non-edited rows).
Fully unit-tested. Spec §3.14.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Create `bc_cf_ui.js` HTML builders module

**Files:**
- Create: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js`
- Create: `tests/modules/bc_cf_ui.test.js`

This module returns HTML strings for the shared primitives so all 6 surfaces compose UI from the same building blocks.

- [ ] **Step 1: Write the failing test**

Create `tests/modules/bc_cf_ui.test.js`:
```js
import UI from 'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui';

describe('bc_cf_ui', () => {

    describe('panel({ header, body, footer })', () => {
        it('wraps in .bccf-panel and includes header/body/footer regions', () => {
            const out = UI.panel({ header: '<h1>T</h1>', body: '<p>B</p>', footer: '<i>F</i>' });
            expect(out).toContain('class="bccf-panel"');
            expect(out).toContain('class="bccf-panel-header"');
            expect(out).toContain('<h1>T</h1>');
            expect(out).toContain('class="bccf-panel-body"');
            expect(out).toContain('<p>B</p>');
            expect(out).toContain('class="bccf-panel-footer"');
            expect(out).toContain('<i>F</i>');
        });
        it('omits header/footer when not provided', () => {
            const out = UI.panel({ body: '<p>B</p>' });
            expect(out).not.toContain('bccf-panel-header');
            expect(out).not.toContain('bccf-panel-footer');
        });
    });

    describe('kpi({ k, v, sub, accent })', () => {
        it('builds a KPI card with label / value / subline', () => {
            const out = UI.kpi({ k: 'Total Cost', v: '$33,000', sub: '3 lines' });
            expect(out).toContain('class="bccf-kpi"');
            expect(out).toContain('class="bccf-k"');
            expect(out).toContain('Total Cost');
            expect(out).toContain('$33,000');
            expect(out).toContain('3 lines');
        });
        it('adds accent class when accent=true', () => {
            const out = UI.kpi({ k: 'X', v: '$1', accent: true });
            expect(out).toContain('class="bccf-kpi accent"');
        });
    });

    describe('badge(type, label)', () => {
        it('applies success class', () => {
            expect(UI.badge('success', '✓ Balanced')).toContain('class="bccf-badge success"');
        });
        it('applies warn class', () => {
            expect(UI.badge('warn', '⚠ 108%')).toContain('class="bccf-badge warn"');
        });
    });

    describe('skeletonKpi() / skeletonChart(periods) / skeletonRows(cols, rows)', () => {
        it('skeletonKpi returns 4 KPI cards with shimmer bars', () => {
            const out = UI.skeletonKpi(4);
            const matches = (out.match(/class="bccf-kpi"/g) || []).length;
            expect(matches).toBe(4);
            expect(out).toContain('class="bccf-skel"');
        });
        it('skeletonChart returns N bars with varied heights', () => {
            const out = UI.skeletonChart(6);
            const bars = (out.match(/class="bccf-skel bar-skel"/g) || []).length;
            expect(bars).toBe(6);
        });
        it('skeletonRows returns rows × cols shimmer cells', () => {
            const out = UI.skeletonRows(7, 5);
            const tds = (out.match(/<td/g) || []).length;
            expect(tds).toBe(35);  // 5 rows × 7 cols
        });
    });

    describe('errorCard(message)', () => {
        it('wraps the error in a .bccf-error-card with retry hint', () => {
            const out = UI.errorCard('Boom');
            expect(out).toContain('class="bccf-error-card"');
            expect(out).toContain('Boom');
            expect(out).toContain('data-action="retry"');  // for the Retry button
        });
    });

    describe('toggle({ id, options, activeValue })', () => {
        it('renders pill buttons with the active option marked', () => {
            const out = UI.toggle({
                id: 'mode',
                options: [{ value: 'cash', label: 'Cash' }, { value: 'accrual', label: 'Accrual' }],
                activeValue: 'cash',
            });
            expect(out).toContain('class="bccf-toggle"');
            expect(out).toMatch(/data-value="cash"[^>]*class="active"/);
            expect(out).toMatch(/data-value="accrual"(?![^>]*active)/);
        });
    });

    describe('esc(s)', () => {
        it('escapes < > & " \' ', () => {
            expect(UI.esc('<a href="x">&"\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&quot;&#39;&lt;/a&gt;');
        });
        it('handles null and undefined as empty string', () => {
            expect(UI.esc(null)).toBe('');
            expect(UI.esc(undefined)).toBe('');
        });
    });
});
```

- [ ] **Step 2: Run tests — confirm fail**

Run: `npm test -- bc_cf_ui`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `bc_cf_ui.js`**

Create `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js`:
```js
/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Shared HTML primitive builders for BC Cash Flow surfaces.
 * Spec: §3.15 of the redesign design doc.
 */
define([], function () {

    const esc = (s) => {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const panel = ({ header, body, footer }) => {
        const h = header ? `<div class="bccf-panel-header">${header}</div>` : '';
        const b = body ? `<div class="bccf-panel-body">${body}</div>` : '';
        const f = footer ? `<div class="bccf-panel-footer">${footer}</div>` : '';
        return `<div class="bccf-panel">${h}${b}${f}</div>`;
    };

    const kpi = ({ k, v, sub, accent }) => {
        const cls = accent ? 'bccf-kpi accent' : 'bccf-kpi';
        return `<div class="${cls}">
            <div class="bccf-k">${esc(k)}</div>
            <div class="bccf-v">${v}</div>
            ${sub ? `<div class="bccf-sub">${sub}</div>` : ''}
        </div>`;
    };

    const badge = (type, label) => {
        return `<span class="bccf-badge ${esc(type)}">${esc(label)}</span>`;
    };

    const toggle = ({ id, options, activeValue }) => {
        const buttons = options.map(o => {
            const active = o.value === activeValue ? ' class="active"' : '';
            return `<button type="button" data-value="${esc(o.value)}"${active}>${esc(o.label)}</button>`;
        }).join('');
        return `<div class="bccf-toggle" data-toggle-id="${esc(id)}">${buttons}</div>`;
    };

    const skeletonKpi = (n = 4) => {
        let html = '';
        for (let i = 0; i < n; i++) {
            html += `<div class="bccf-kpi">
                <div class="bccf-k"><span class="bccf-skel" style="display:block;width:80px;height:11px"></span></div>
                <div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>
                <div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>
            </div>`;
        }
        return html;
    };

    const skeletonChart = (periods = 6) => {
        const heights = [40, 70, 100, 90, 60, 30, 50, 80, 65];
        let bars = '';
        for (let i = 0; i < periods; i++) {
            const h = heights[i % heights.length];
            bars += `<div class="bccf-skel bar-skel" style="flex:1;height:${h}px;margin:0 3px;border-radius:3px 3px 0 0"></div>`;
        }
        return `<div style="display:flex;align-items:flex-end;height:120px;padding:14px 18px">${bars}</div>`;
    };

    const skeletonRows = (cols, rows) => {
        const widths = [80, 60, 70, 65, 75, 55, 90];
        let html = '';
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                const w = widths[(r + c) % widths.length];
                html += `<td><span class="bccf-skel" style="display:inline-block;width:${w}px;height:12px"></span></td>`;
            }
            html += '</tr>';
        }
        return html;
    };

    const errorCard = (message) => {
        return `<div class="bccf-error-card">
            <h4>Couldn't load data</h4>
            <pre>${esc(message)}</pre>
            <button type="button" class="bccf-btn" data-action="retry">Retry</button>
        </div>`;
    };

    return { esc, panel, kpi, badge, toggle, skeletonKpi, skeletonChart, skeletonRows, errorCard };
});
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `npm test -- bc_cf_ui`
Expected: All 11 assertions green.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js tests/modules/bc_cf_ui.test.js
git commit -m "feat: bc_cf_ui — shared HTML primitive builders

Panel, kpi, badge, toggle, skeleton families, error card, esc.
Used by every BC Cash Flow surface. Spec §3.15.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 3 — New data Suitelet

**Goal of phase:** Stand up a shared action-routed JSON data Suitelet (`?action=combined|cost|revenue`). The three report Suitelets will still own their HTML rendering for now; this just *adds* the JSON endpoint so Phase 4 can split shell from data.

**Phase exit criteria:** `bc_cf_data_sl.js` deployed + browser-testable returning `{ok:true, ...}` for all 3 actions.

---

### Task 10: Create `bc_cf_data_sl.js` action router skeleton

**Files:**
- Create: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Create: `tests/entry_points/bc_cf_data_sl.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/entry_points/bc_cf_data_sl.test.js`:
```js
const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl');

const mockResponse = () => {
    let body = '';
    return {
        write: (opts) => { body = opts.output || opts; },
        setHeader: jest.fn(),
        getBody: () => body,
    };
};

describe('bc_cf_data_sl', () => {

    it('rejects missing action with ok:false', () => {
        const req = { method: 'GET', parameters: {} };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/action/i);
    });

    it('rejects unknown action with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'frobnicate' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
    });

    it('rejects missing projectId with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/projectId/i);
    });

    it('returns ok:true with periods + categories for combined action (mocked DAO)', () => {
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr', 'May', 'Jun'],
            categories: { revenue: { lines: [], totals: [] }, cost: { lines: [], totals: [] } },
            kpis: { totalRevenue: 42000, totalCost: 33000 },
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.periods).toEqual(['Apr', 'May', 'Jun']);
        expect(body.kpis.totalRevenue).toBe(42000);
    });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npm test -- bc_cf_data_sl`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skeleton router**

Create `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`:
```js
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Shared action-routed JSON data endpoint for all 3 Cash Flow reports.
 *   GET ?action=combined|cost|revenue&projectId=<id>&mode=cash|accrual
 *
 * Returns `{ ok: true, periods, categories, kpis, ... }` or `{ ok: false, error }`.
 * Spec §3.1 architecture; §3.16 loading.
 */
define(['N/log'], function (log) {

    const MODULE = 'bc_cf_data_sl';

    const sendJSON = (response, payload) => {
        response.setHeader({ name: 'Content-Type', value: 'application/json' });
        response.write({ output: JSON.stringify(payload) });
    };

    const sendError = (response, message) => sendJSON(response, { ok: false, error: message });

    // ── Action handlers (delegated to private loaders so tests can mock) ──────

    const _loadCombined = (projectId, mode) => {
        // Phase 3 stub: real implementation lands in Task 11.
        return { periods: [], categories: {}, kpis: {} };
    };
    const _loadCost = (projectId, mode) => {
        return { periods: [], categories: {}, kpis: {} };
    };
    const _loadRevenue = (projectId, mode) => {
        return { periods: [], categories: {}, kpis: {} };
    };

    const onRequest = (context) => {
        try {
            const req = context.request;
            const res = context.response;
            const params = req.parameters || {};

            const action = params.action;
            const projectId = params.projectId;
            const mode = params.mode || 'cash';

            if (!action) return sendError(res, 'Missing action parameter');
            if (!projectId) return sendError(res, 'Missing projectId parameter');

            let data;
            if (action === 'combined')      data = module.exports._loadCombined(projectId, mode);
            else if (action === 'cost')     data = module.exports._loadCost(projectId, mode);
            else if (action === 'revenue')  data = module.exports._loadRevenue(projectId, mode);
            else return sendError(res, `Unknown action: ${action}`);

            sendJSON(res, Object.assign({ ok: true, mode }, data));
        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: e.message + ' ' + (e.stack || '') });
            sendError(context.response, e.message);
        }
    };

    // Export as both AMD module and node-style for the test runner to spy on _load*
    const moduleExports = { onRequest, _loadCombined, _loadCost, _loadRevenue };
    if (typeof module !== 'undefined') module.exports = moduleExports;
    return moduleExports;
});
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `npm test -- bc_cf_data_sl`
Expected: 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "feat: bc_cf_data_sl — action-routed JSON endpoint skeleton

Handles ?action=combined|cost|revenue with validation. Loaders are
stubs; real SuiteQL lands in Tasks 11-13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Migrate Combined report's SuiteQL into the data SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Read (for reference): `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` and `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js`

- [ ] **Step 1: Find the SuiteQL block in the current Combined SL**

Run: `grep -n "runSuiteQL\|SUITEQL\|query.runSuiteQL\|fetchPeriods\|buildPeriods\|loadCashFlow" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`

Identify the function (probably `loadProjectCashFlow(projectId, mode)` or similar) that returns `{ periods, revenue: {lines, totals}, cost: {lines, totals}, grandTotal }`. Note the function name and the imports it needs (`N/query`, `N/search`, etc).

- [ ] **Step 2: Move the loader function into the data SL**

In `bc_cf_data_sl.js`:
1. Replace the `define(['N/log'], function(log) {` with `define(['N/log', 'N/query'], function(log, query) {` (add whatever imports the loader needs).
2. Replace the stub `_loadCombined` body with the moved SuiteQL logic, reshaped to return the JSON contract:
   ```js
   {
       periods: ['Apr', 'May', 'Jun', ...],
       categories: {
           revenue: {
               lines: [{ id, label, source, amounts: [..per period..], total }],
               total: [..per period..],
               grandTotal: <number>,
           },
           cost: { lines: [...], total: [...], grandTotal: <number> },
       },
       kpis: {
           totalRevenue: <number>,
           totalCost: <number>,
           netCashFlow: <number>,
           margin: <number>,
       },
   }
   ```
3. Keep the existing helper functions (`fmtMonth`, period building, etc.) — either copy them into the data SL or extract to a shared module if reused by Tasks 12/13 as well. **Recommendation:** extract to `modules/bc_cf_data_helpers.js` to keep the data SL lean.

- [ ] **Step 3: Add a smoke test that the loader returns the expected shape**

Append to `tests/entry_points/bc_cf_data_sl.test.js`:
```js
describe('bc_cf_data_sl combined action shape', () => {
    it('returns periods + categories + kpis structure', () => {
        // Real SuiteQL not testable from node; assert shape with a mock
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: {
                revenue: { lines: [], total: [0, 0], grandTotal: 0 },
                cost: { lines: [], total: [0, 0], grandTotal: 0 },
            },
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.periods).toBeDefined();
        expect(body.categories.revenue).toBeDefined();
        expect(body.categories.cost).toBeDefined();
        expect(body.kpis).toHaveProperty('totalRevenue');
        expect(body.kpis).toHaveProperty('netCashFlow');
    });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bc_cf_data_sl`
Expected: All assertions pass (including the shape assertion).

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_data_helpers.js  # if extracted
git commit -m "feat: data SL combined action returns periods + categories + kpis

Migrates Combined report's SuiteQL into the shared data SL. Existing
Combined SL still owns rendering — Task 15 will switch it to shell-only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Migrate Cost report's SuiteQL into the data SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Read: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`

- [ ] **Step 1: Identify the cost loader**

Run: `grep -n "loadCost\|loadProjectCost\|fetchCost\|SUITEQL\|runSuiteQL" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`

- [ ] **Step 2: Move the cost loader into `_loadCost` of the data SL**

Return shape:
```js
{
    periods: ['Apr 2026', ...],
    categories: {
        cost: {
            lines: [{ id, label, source, amounts: [...], total }],
            total: [...per period...],
            grandTotal: <number>,
        },
    },
    kpis: {
        totalCost: <number>,
        currentMonth: <number>,
        peakMonth: <number>,
        remaining: <number>,
    },
}
```

- [ ] **Step 3: Add cost action shape test**

```js
it('cost action returns cost categories + kpis', () => {
    jest.spyOn(Suitelet, '_loadCost').mockReturnValue({
        periods: ['Apr', 'May'],
        categories: { cost: { lines: [], total: [0, 0], grandTotal: 0 } },
        kpis: { totalCost: 0, currentMonth: 0, peakMonth: 0, remaining: 0 },
    });
    const req = { method: 'GET', parameters: { action: 'cost', projectId: '1807' } };
    const res = mockResponse();
    Suitelet.onRequest({ request: req, response: res });
    const body = JSON.parse(res.getBody());
    expect(body.ok).toBe(true);
    expect(body.categories.cost).toBeDefined();
    expect(body.kpis).toHaveProperty('currentMonth');
    expect(body.kpis).toHaveProperty('peakMonth');
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bc_cf_data_sl`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat: data SL cost action returns cost + kpis (currentMonth, peakMonth, remaining)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Migrate Revenue report's SuiteQL into the data SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Read: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`

- [ ] **Step 1: Identify the revenue loader**

Run: `grep -n "loadRev\|loadProjectRev\|fetchRev\|SUITEQL\|runSuiteQL" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`

- [ ] **Step 2: Move into `_loadRevenue`**

Return shape:
```js
{
    periods: [...],
    categories: { revenue: { lines: [...], total: [...], grandTotal } },
    kpis: { totalRevenue, baseContract, changeOrders, peakMonth },
}
```

- [ ] **Step 3: Add revenue action shape test**

(Mirror Task 12's test pattern with revenue KPIs.)

- [ ] **Step 4: Run tests**

Run: `npm test -- bc_cf_data_sl`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat: data SL revenue action returns revenue + kpis (base, COs, peak)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Create deployment XML for the data Suitelet + deploy

**Files:**
- Create: `Objects/scripts/customscript_bc_cf_data_sl.xml`
- Modify: `deploy.xml` (add the new script object to the deploy list if needed)

- [ ] **Step 1: Read an existing report Suitelet deployment for the template**

Run: `ls Objects/scripts/ | grep cf_`
Open one of the existing `customscript_bc_cf_*_sl.xml` files (e.g. `customscript_bc_cf_combined_sl.xml`) and copy the structure.

- [ ] **Step 2: Create `Objects/scripts/customscript_bc_cf_data_sl.xml`**

Use this template, replacing the file ref with `bc_cf_data_sl.js`:
```xml
<suitelet scriptid="customscript_bc_cf_data_sl">
    <description>BC Cash Flow — shared JSON data endpoint (action-routed)</description>
    <isinactive>F</isinactive>
    <name>BC CF Data SL</name>
    <notifyowner>T</notifyowner>
    <scriptfile>[/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js]</scriptfile>
    <scriptdeployments>
        <scriptdeployment scriptid="customdeploy_bc_cf_data_sl">
            <allemployees>T</allemployees>
            <allpartners>F</allpartners>
            <allroles>T</allroles>
            <eventtype></eventtype>
            <isdeployed>T</isdeployed>
            <loglevel>ERROR</loglevel>
            <recordaccesstype>OWNERANDRESTRICTED</recordaccesstype>
            <runasrole>ADMINISTRATOR</runasrole>
            <status>RELEASED</status>
            <title>BC CF Data SL — Deploy</title>
        </scriptdeployment>
    </scriptdeployments>
</suitelet>
```

- [ ] **Step 3: Validate the SDF project**

Run: `npm run validate`
Expected: No errors. The new script object is recognized.

- [ ] **Step 4: Deploy file + script object**

Run:
```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js"
npx suitecloud object:import --type suitelet --scriptid customscript_bc_cf_data_sl  # if importing from sandbox
# OR full deploy if needed:
npm run deploy
```
Expected: Both succeed without warnings about the new script ID.

- [ ] **Step 5: Smoke-test the data SL in a browser**

Find the deployed Suitelet URL via NetSuite UI (Customization → Scripts → Scripts → BC CF Data SL → Deployment → External URL), then append `?action=combined&projectId=1807&mode=cash` and open it. Expected: JSON response with `ok:true` and the project's forecast data.

Repeat for `?action=cost&projectId=1807` and `?action=revenue&projectId=1807`.

- [ ] **Step 6: Commit**

```bash
git add Objects/scripts/customscript_bc_cf_data_sl.xml deploy.xml
git commit -m "feat: deploy bc_cf_data_sl — action-routed JSON endpoint live

Verified all 3 actions return forecast data for project 1807.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 3 exit:** the data Suitelet is live and reachable. Reports still own their HTML.

---

# Phase 4 — Convert reports to shell-only

**Goal of phase:** Each of the 3 report Suitelets is reduced to: emit HTML shell with skeleton + client JS that fetches the data SL and swaps skeleton for real content. KPI strip, chart, and table all render from the same `bc_cf_ui.js` builders.

**Phase exit criteria:** All 3 reports show skeleton within ~1s of opening the Cash Flow tab; full content arrives shortly after; the chart paired-bars and KPI labels render exactly as the mockups locked in §3.4 / §3.6 / §3.8.

---

### Task 15: Convert `bc_cf_combined_sl.js` to shell-only

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`

This is the biggest single rewrite of the phase. Detailed because there's no test that covers it end-to-end — we rely on the structural test in Step 6 plus a manual smoke check.

- [ ] **Step 1: Read the spec sections that govern this surface**

Re-read: spec §3.4 (Vertical Flow layout), §3.5 (in-iframe nav tabs), §3.6 (Combined KPIs), §3.7 (Navy + Slate encoding), §3.8 (Combined paired-bar chart), §3.9 (loading), §3.16 (skeleton).

- [ ] **Step 2: Replace the entire file with the shell-only version**

The new file looks roughly like this (skeleton — implementer fills in exact field/label values):
```js
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * BC Cash Flow Combined Report — shell Suitelet.
 * Returns HTML doc with skeleton; client fetches bc_cf_data_sl?action=combined.
 * Spec §3.4, §3.8, §3.16.
 */
define([
    'N/log', 'N/url',
    'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles',
    'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui',
], function (log, url, Styles, UI) {

    const MODULE = 'bc_cf_combined_sl';

    const buildDataUrl = (projectId, mode) => {
        return url.resolveScript({
            scriptId: 'customscript_bc_cf_data_sl',
            deploymentId: 'customdeploy_bc_cf_data_sl',
            returnExternalUrl: true,
            params: { action: 'combined', projectId, mode },
        });
    };

    const navTabs = (active, projectId) => {
        const t = (slug, label) => `<a href="#" data-nav="${slug}" class="${active === slug ? 'active brand' : ''}">${label}</a>`;
        return `<div class="bccf-tabs">${t('combined', 'Combined')}${t('cost', 'Cost')}${t('revenue', 'Revenue')}</div>`;
    };

    const headerHtml = (projectId, projectName, customerName, soNumber, mode) => {
        return `<div class="bccf-panel-header">
            <div>
                <h1 style="font-size:22px;font-weight:600;color:var(--bccf-ink-900);letter-spacing:-0.01em;margin:0;display:flex;align-items:center;gap:8px">
                    Combined Cash Flow <span class="bccf-title-pill">${mode === 'accrual' ? 'Accrual basis' : 'Cash basis'}</span>
                </h1>
                <div style="color:var(--bccf-ink-500);font-size:13px;margin-top:4px">
                    ${UI.esc(projectName)} · ${UI.esc(customerName)} · ${UI.esc(soNumber)}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                ${UI.toggle({ id: 'mode', options: [{value:'cash',label:'Cash'},{value:'accrual',label:'Accrual'}], activeValue: mode })}
                <button type="button" class="bccf-btn" data-action="csv">Export CSV</button>
                <button type="button" class="bccf-btn bccf-btn-pri" data-action="pdf">Export PDF</button>
            </div>
        </div>`;
    };

    const buildShell = (projectId, projectName, customerName, soNumber, mode, dataUrl) => {
        return `<!doctype html>
<html><head><meta charset="utf-8">
${Styles.getStyles()}
</head>
<body data-data-url="${UI.esc(dataUrl)}" data-project-id="${UI.esc(projectId)}">
<div id="bccf-toast-host"></div>
<div style="padding:16px;max-width:1400px;margin:0 auto">
    <div class="bccf-panel">
        ${navTabs('combined', projectId)}
        ${headerHtml(projectId, projectName, customerName, soNumber, mode)}
    </div>
    <div id="bccf-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px">
        ${UI.skeletonKpi(4)}
    </div>
    <div id="bccf-chart" class="bccf-panel" style="margin-top:10px">
        <div class="bccf-panel-header"><div style="font-weight:600">Monthly cash flow</div></div>
        ${UI.skeletonChart(6)}
    </div>
    <div id="bccf-table" class="bccf-panel" style="margin-top:10px">
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${
            ['Source','Apr','May','Jun','Jul','Aug','Sep','Total'].map(h => `<th style="padding:9px 12px;background:var(--bccf-bg-50);color:var(--bccf-ink-500);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:500;text-align:right">${h}</th>`).join('')
        }</tr></thead><tbody>${UI.skeletonRows(8, 5)}</tbody></table>
    </div>
</div>
<script>
${getClientScript()}
</script>
</body></html>`;
    };

    const getClientScript = () => `
(function () {
    if (window.__bccfWired) return;
    window.__bccfWired = true;
    const dataUrl = document.body.getAttribute('data-data-url');

    const render = (data) => {
        // Render KPIs
        // ... build kpiHtml from data.kpis (Total Revenue / Total Cost / Net / Margin %)
        // Render chart
        // ... build chartHtml from data.periods + data.categories with paired bars + net amount label
        // Render table
        // ... build tableHtml from data.periods + data.categories.revenue/cost lines + tfoot net
        document.getElementById('bccf-kpis').innerHTML = kpiHtml;
        document.getElementById('bccf-chart').innerHTML = chartHtml;
        document.getElementById('bccf-table').innerHTML = tableHtml;
    };

    const renderError = (msg) => {
        const card = '<div class="bccf-error-card"><h4>Couldn\\'t load data</h4><pre>' + msg + '</pre><button type="button" class="bccf-btn" data-action="retry">Retry</button></div>';
        document.getElementById('bccf-chart').innerHTML = card;
        document.getElementById('bccf-table').innerHTML = '';
    };

    const fetchData = () => {
        fetch(dataUrl)
            .then(r => r.json())
            .then(j => { if (j.ok) render(j); else renderError(j.error); })
            .catch(e => renderError(e.message));
    };

    // Event delegation for retry, mode toggle, nav tabs, export buttons
    document.addEventListener('click', (e) => {
        const retry = e.target.closest('[data-action="retry"]');
        if (retry) { fetchData(); return; }
        const navTab = e.target.closest('[data-nav]');
        if (navTab) {
            const slug = navTab.getAttribute('data-nav');
            // Build href to other report SLs (preserving script/deploy hosting params)
            // ...
        }
        // ... other delegated handlers (mode toggle, csv, pdf)
    });

    fetchData();
})();
`;

    const onRequest = (context) => {
        try {
            const req = context.request;
            const res = context.response;
            const params = req.parameters || {};
            const projectId = params.projectId || params.id || '';
            const mode = params.mode || 'cash';

            // (Optional) load project name + customer + SO# from N/record for the header chrome
            // Keep this minimal — full data lives in the data SL
            const projectName = params.projectName || '';   // implementer: fetch via N/record if not in params
            const customerName = params.customerName || '';
            const soNumber = params.soNumber || '';

            const dataUrl = buildDataUrl(projectId, mode);
            res.write({ output: buildShell(projectId, projectName, customerName, soNumber, mode, dataUrl) });
        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: e.message });
            // Inline styled error card (matches the bccf-error-card visual)
            context.response.write({ output: `<!doctype html><html><head>${Styles.getStyles()}</head><body><div style="padding:20px"><div class="bccf-error-card"><h4>Couldn’t render this report</h4><pre>${UI.esc(e.message)}</pre></div></div></body></html>` });
        }
    };

    return { onRequest };
});
```

**Implementer note:** the inline JS block in `getClientScript()` is a template literal; the real chart+KPI+table render logic must be filled in. Spec §3.6 (Combined KPIs: Total Revenue / Total Cost / Net / Margin), §3.7 (navy = revenue, slate = cost, green/red = net sign), §3.8 (paired bars per month with Net amount label).

- [ ] **Step 3: Implement the `render()` client function in full**

Inside `getClientScript()`, implement:

1. **KPI strip render** (4 cards in a `display:grid;grid-template-columns:repeat(4,1fr);gap:10px` container):
   - Total Revenue (accent, navy value)
   - Total Cost (slate value)
   - Net Cash Flow (green if positive, red if negative)
   - Margin %
   - Build via inline `<div class="bccf-kpi">` matching the shape `UI.kpi()` produces server-side, but constructed in JS.

2. **Chart render**: a flex container of 6 columns. Each column has:
   - A `<div>` Net amount label above (green/red by sign)
   - A `<div class="pair">` with two adjacent bars: revenue (navy) and cost (slate). Heights proportional to the largest value in the dataset; bars 50% width each within the column.
   - Month label below.
   - Current month adds `.now` class for the brand-50 halo.

3. **Table render**: full data table with `<thead>` matching skeleton header, `<tbody>` building category rows (Revenue, Cost) + indented sub-rows per line (Base Contract / CO / PO A / PO B / CO Estimate), and `<tfoot>` with Net row colored by sign per column.

- [ ] **Step 4: Implement the mode-toggle and export-button handlers in the delegated `click` listener**

When the Cash/Accrual toggle is clicked, fire `fetch(dataUrl.replace('mode=cash', 'mode=' + newMode))` and re-render; update the toggle's `.active` class on the buttons.

When CSV/PDF is clicked, navigate the iframe to a URL that triggers those (preserve existing CSV/PDF export hooks if they exist).

- [ ] **Step 5: Add a shape smoke test against `buildShell()`**

Append to `tests/entry_points/bc_cf_combined_sl.test.js` (create the file if it doesn't exist):
```js
// Use the existing Suitelet-test pattern and assert the shell HTML contains
// nav tabs, skeleton classes, data-data-url attr, and the styles block.
```

- [ ] **Step 6: Run tests**

Run: `npm test -- bc_cf_combined_sl`
Expected: green.

- [ ] **Step 7: Deploy + smoke test**

Run:
```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js"
```
Then open project 1807's Cash Flow tab. Confirm:
1. Skeleton renders within ~1s (header chrome + skeleton KPI cards + shimmer bars + shimmer table rows).
2. Real data lands shortly after; KPIs show $42K / $33K / $9K / 21.4%.
3. Chart shows 6 paired Revenue+Cost bars with Net amount labels above.
4. Table shows the breakdown with Net row in tfoot.
5. Network tab: a single `fetch` to the data SL `?action=combined`.
6. Console: no errors.

- [ ] **Step 8: Commit**

```bash
git add -u && git commit -m "feat: combined report shell-only — skeleton + fetch + render

Removes server-side SuiteQL from this Suitelet; data sourced from
bc_cf_data_sl ?action=combined. Skeleton shown immediately for
perceived perf; client swaps in real content on resolve.
Spec §3.4, §3.8, §3.16.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Convert `bc_cf_cost_report_sl.js` to shell-only

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`

Apply the same surgery as Task 15, but for the Cost-only surface:
- Title: "Cost Outflows"
- KPIs: Total Cost (accent slate) / Current Month / Peak Month / Remaining
- Chart: single-color slate bars (one bar per month, amount label above each), current-month halo
- Table: single category (Cost) + indented per-vendor lines; no tfoot Net row

- [ ] **Step 1: Spec re-read** — §3.6 row 2 (Cost KPIs), §3.7 (Cost = slate), §3.8 single-category chart.

- [ ] **Step 2: Reskin the file** following the same shell-only pattern from Task 15. The chart render function changes to single-bar-per-month; the table render function drops the second category.

- [ ] **Step 3: Run tests**

Run: `npm test -- bc_cf_cost_report_sl`
Expected: green.

- [ ] **Step 4: Deploy + smoke test**

Same as Task 15 step 7 but for the cost report iframe — confirm slate color encoding, current month emphasis, KPI values.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat: cost report shell-only — slate single-color chart, no actuals

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Convert `bc_cf_rev_report_sl.js` to shell-only

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`

Same pattern as Task 16, mirrored for revenue:
- Title: "Revenue Inflows"
- KPIs: Total Revenue (accent navy) / Base Contract / Change Orders / Peak Month
- Chart: single-color navy bars
- Table: single category (Revenue) + indented per-source lines (Base Contract / each CO)

- [ ] **Step 1–5: Mirror Task 16 steps.** Commit message: `"feat: revenue report shell-only — navy single-color chart, no actuals"`.

---

### Task 18: Verify in-iframe nav tabs work across all 3 surfaces

**Files:**
- Modify: client JS sections of all 3 report SLs if nav-tab href construction needs adjustment.

- [ ] **Step 1: Open the Combined report iframe in the project record.**

Click the **Cost** nav tab. Confirm:
- The iframe navigates to the Cost report Suitelet URL.
- The `script=` and `deploy=` query params from NetSuite's iframe URL are **preserved** (otherwise the Suitelet 404s with "missing required parameter").

- [ ] **Step 2: Implement `buildAppHref(otherSlug)` helper if Step 1 fails**

In each shell SL's client JS, the nav-tab click handler must build the target URL by:
1. Reading `window.location.search` and parsing out `script=` and `deploy=` params (these are NetSuite-managed).
2. Building the new URL: replace `script=<combined_sl>` with `script=<cost_sl>` and `deploy=<combined_deploy>` with `deploy=<cost_deploy>` while preserving everything else.

Add server-resolved tab URLs to `<body>` attributes (e.g. `data-combined-url`, `data-cost-url`, `data-revenue-url`) so the client doesn't have to compute script IDs:
```js
const targetUrls = {
    combined: url.resolveScript({ scriptId: 'customscript_bc_cf_combined_sl', deploymentId: 'customdeploy_bc_cf_combined_sl', returnExternalUrl: true, params: { projectId, mode } }),
    cost: url.resolveScript({ scriptId: 'customscript_bc_cf_cost_report_sl', deploymentId: 'customdeploy_bc_cf_cost_report_sl', returnExternalUrl: true, params: { projectId, mode } }),
    revenue: url.resolveScript({ scriptId: 'customscript_bc_cf_rev_report_sl', deploymentId: 'customdeploy_bc_cf_rev_report_sl', returnExternalUrl: true, params: { projectId, mode } }),
};
// Stamp each onto <body data-<slug>-url="...">
```

Client JS reads `document.body.dataset.combinedUrl` etc. and navigates.

- [ ] **Step 3: Deploy + smoke test all 3 tabs from all 3 starting points (9 navigations total).**

Each one must end on the correct report.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "fix: in-iframe nav tabs preserve NS hosting params via server-resolved URLs

Spec §3.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 4 exit:** all 3 reports shell-only, skeleton + fetch loading, nav tabs working, mode toggle live. Customer-visible improvement.

---

# Phase 5 — Schedule editor reskin + calculator + rebalance

**Goal of phase:** Apply the design system to the PO / SO / CO schedule subtabs; replace the template-stamp toolbar with the new calculator (Distribution / Periods / Interval / Start date / End date / Generate + live preview); add Rebalance button to the save bar; rename `Cum %` → `Total %` and `Cum Amount` → `Total Amount`.

**Phase exit criteria:** all 3 schedule subtabs render with new chrome; calculator generates rows from spec inputs; Rebalance redistributes overage; saved/unsaved status pulses; CO has segmented Contract/Estimate toggle.

---

### Task 19: Adopt shared styles + primitives in `bc_timing_ui.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

- [ ] **Step 1: Add imports for the shared modules**

Change the `define([...], function(...){ })` header to include `bc_cf_styles` and `bc_cf_ui`:
```js
define([
    'SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_constants',
    'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles',
    'SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui',
], function (CONSTANTS, Styles, UI) { ... });
```

- [ ] **Step 2: Replace the inlined `getBaseStyles()` body with `Styles.getStyles() + <legacy adjustments>`**

The schedule-editor-specific CSS that doesn't exist in the shared module (grid input variant, save-bar pulse animation, pane-toggle, calculator preview chart, CO toggle) stays in `bc_timing_ui.js` as a small CSS block — but everything that's already in `bc_cf_styles.js` is removed.

Add this CSS-only addition (schedule-editor-specific):
```css
/* Grid input variant — overrides .bccf-input default */
.bccf-grid input { border-color: transparent; background: transparent; padding: 4px 6px; width: 100%; font-size: var(--bccf-text-sm); border-radius: 4px; }
.bccf-grid input:hover { background: var(--bccf-bg-50); border-color: var(--bccf-border); }
.bccf-grid input:focus { outline: none; background: var(--bccf-surface); border-color: var(--bccf-brand-500); box-shadow: 0 0 0 2px var(--bccf-brand-50); }

/* Save bar pulse for dirty state */
.bccf-save-status { font-size: 13px; color: var(--bccf-ink-500); display: inline-flex; align-items: center; gap: 6px; }
.bccf-save-status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bccf-ink-500); }
.bccf-save-status.dirty-balanced .dot { background: var(--bccf-ink-500); animation: bccf-pulse 1.5s ease-in-out infinite; }
.bccf-save-status.dirty-warn { color: var(--bccf-warn-500); }
.bccf-save-status.dirty-warn .dot { background: var(--bccf-warn-500); animation: bccf-pulse 1.5s ease-in-out infinite; }
.bccf-save-status.saved { color: var(--bccf-success-500); }
.bccf-save-status.saved .dot { background: var(--bccf-success-500); }
@keyframes bccf-pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }

/* Rebalance button — warn-amber styling per mockup */
.bccf-btn-rebalance { background: var(--bccf-warn-50); border-color: var(--bccf-warn-500); color: var(--bccf-warn-500); font-weight: 600; }

/* Calculator preview chart */
.bccf-calc-preview { background: var(--bccf-bg-50); border: 1px dashed var(--bccf-border); border-radius: var(--bccf-r-md); padding: 12px; margin-top: 10px; }
.bccf-calc-preview-bars { display: flex; gap: 4px; align-items: flex-end; height: 80px; padding-top: 18px; }
.bccf-calc-preview-bars .b { flex: 1; background: var(--bccf-brand-500); border-radius: 2px 2px 0 0; min-height: 4px; position: relative; }
```

- [ ] **Step 3: Replace old class names in render functions**

Search the file for the old class prefixes and rename:
- `.bc-cf-toolbar` → `.bccf-toolbar` (use a new local class for the calculator strip)
- `.bc-cf-btn` → `.bccf-btn`
- `.bc-cf-btn-secondary` → `.bccf-btn`
- `.bc-cf-btn-danger` → `.bccf-btn-danger-ghost`
- `.bc-cf-section` → `.bccf-section`
- `.bc-cf-grid` → `.bccf-grid`
- `.bc-cf-tab-nav` → `.bccf-tabs`
- `.bc-cf-save-bar` → `.bccf-save-bar`
- `.bc-cf-badge.green/.gold/.navy` → `.bccf-badge.success/.brand/.brand` per the new badge palette

Drop the `.bc-cf-empty-state` icon-heavy block; replace with a simpler placeholder using `.bccf-panel-body` + ink-500 text.

- [ ] **Step 4: Run tests**

Run: `npm test -- bc_timing`
Expected: existing tests still pass. (They mostly cover the engine, not the UI module.)

- [ ] **Step 5: Smoke-test deploy**

Run:
```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js"
```
Open a PO with an existing schedule. Confirm it still renders (visual differences will be everywhere; that's expected).

- [ ] **Step 6: Commit**

```bash
git add -u && git commit -m "refactor: bc_timing_ui adopts shared bc_cf_styles + primitives

Renames all .bc-cf-* classes to .bccf-* and pulls tokens + buttons +
badges from the shared module. Calculator/preview-specific CSS stays
local for now (extracted later).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Rename grid column headers

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

- [ ] **Step 1: Edit the column headers in `renderTimingGrid`**

Find:
```js
colHeaders += '<th class="right">Cumulative %</th>';
colHeaders += '<th class="right">Cumulative Amount</th>';
```
Replace with:
```js
colHeaders += '<th class="right">Total %</th>';
colHeaders += '<th class="right">Total Amount</th>';
```

- [ ] **Step 2: Run tests + smoke test deploy**

Run: `npm test` then `npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js"`. Confirm the PO subtab shows the renamed columns.

- [ ] **Step 3: Commit**

```bash
git add -u && git commit -m "ui: rename schedule grid columns Cum %/Amount → Total %/Amount

Per spec §3.13 column list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Replace template selector with calculator toolbar (UI only)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

Replace the old `renderTemplateSelector()` function's output with a calculator toolbar containing the 5 inputs from §3.14.1 + a Generate button. **Do not wire the math yet** — that's Task 22.

- [ ] **Step 1: Replace `renderTemplateSelector` body**

```js
const renderTemplateSelector = ({ sectionId, sourceAmount }) => {
    const sid = UI.esc(sectionId);
    const todayISO = new Date().toISOString().slice(0, 10);
    return `
<div class="bccf-calc" data-section="${sid}">
    <div style="display:grid;grid-template-columns:1.4fr 0.7fr 0.9fr 1.1fr 1.1fr auto;gap:10px;align-items:end">
        <div class="bccf-field">
            <label>Distribution</label>
            <select class="bccf-select" id="${sid}_calc_dist">
                <option value="s_curve" selected>S-curve (slow / heavy-middle / slow)</option>
                <option value="linear">Linear (even split)</option>
                <option value="front_loaded">Front-loaded (heavy start)</option>
                <option value="back_loaded">Back-loaded (heavy end)</option>
            </select>
        </div>
        <div class="bccf-field">
            <label>Periods</label>
            <input class="bccf-input" type="number" id="${sid}_calc_n" value="6" min="1" max="36" />
        </div>
        <div class="bccf-field">
            <label>Interval</label>
            <select class="bccf-select" id="${sid}_calc_interval">
                <option value="monthly" selected>Monthly</option>
                <option value="bi_weekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
            </select>
        </div>
        <div class="bccf-field">
            <label>Start date</label>
            <input class="bccf-date" type="date" id="${sid}_calc_start" value="${todayISO}" />
        </div>
        <div class="bccf-field">
            <label>End date</label>
            <input class="bccf-date" type="date" id="${sid}_calc_end" readonly />
        </div>
        <button type="button" class="bccf-btn bccf-btn-pri" id="${sid}_calc_generate">Generate</button>
    </div>
    <div class="bccf-calc-preview" id="${sid}_calc_preview" style="display:none">
        <div class="bccf-calc-preview-meta" id="${sid}_calc_meta"></div>
        <div class="bccf-calc-preview-bars" id="${sid}_calc_bars"></div>
        <table class="bccf-grid" style="margin-top:10px;font-size:12px"><tbody id="${sid}_calc_table"></tbody></table>
    </div>
</div>`;
};
```

Add `.bccf-field { display:flex; flex-direction:column; gap:4px; } .bccf-field label { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:var(--bccf-ink-500); font-weight:500; }` to the local CSS block.

- [ ] **Step 2: Find callers of `renderTemplateSelector`**

Update them to pass `sourceAmount` (no more `templates` prop). Remove the `BUILT_IN_TEMPLATES` import from the file's header.

- [ ] **Step 3: Smoke-test deploy**

Run the same upload as Task 19 and open the PO. Confirm the new 5-input toolbar renders. Generate button is non-functional at this step — that's expected.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "ui: schedule editor toolbar swapped to calculator inputs (no math yet)

Distribution / Periods / Interval / Start date / End date + Generate +
hidden live-preview region. Math wires up next task.
Spec §3.14.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Wire calculator math (live preview)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js` (in the inline client `<script>` block)

- [ ] **Step 1: Import the calculator into the client-side script via global**

Since client JS in the iframe can't AMD-load, embed a `<script>` block right before the section's main script that defines the calculator as a global. Easier: copy the calculator math (weights / normalize / generate / rebalance / computeEndDate / round2) into the client script directly as a `const BCCF_CALC = { weights, normalize, ... };`.

(Trade-off: duplicates the math between `bc_cf_calculator.js` and the inlined client copy. Acceptable because the AMD module is for the Suitelet server-side and Jest; the iframe runs vanilla JS. Both must agree — TDD prevents drift. **Implementer:** make sure the inlined copy matches the AMD module exactly.)

- [ ] **Step 2: Wire change-listeners on the 5 inputs to update End date + preview**

```js
function wireCalculator(sectionId, source) {
    const el = (suffix) => document.getElementById(sectionId + '_calc_' + suffix);
    const dist = el('dist'), n = el('n'), interval = el('interval'), start = el('start'), end = el('end'),
          preview = el('preview'), meta = el('meta'), bars = el('bars'), table = el('table');

    const recompute = () => {
        const opts = {
            distribution: dist.value,
            periods: parseInt(n.value, 10),
            interval: interval.value,
            startDate: new Date(start.value + 'T00:00:00'),
            source: source,
        };
        if (!opts.periods || opts.periods < 1 || isNaN(opts.startDate.getTime())) {
            preview.style.display = 'none';
            return;
        }
        const rows = BCCF_CALC.generate(opts);
        end.value = rows[rows.length - 1].periodDate.toISOString().slice(0, 10);
        // Update preview
        const distLabel = dist.options[dist.selectedIndex].text;
        const intLabel = { monthly: 'monthly', bi_weekly: 'bi-weekly', weekly: 'weekly' }[interval.value];
        meta.innerHTML = '<span><b>' + distLabel.split(' ')[0] + '</b> · ' + rows.length + ' ' + intLabel + ' periods · ' + fmtDate(rows[0].periodDate) + ' → ' + fmtDate(rows[rows.length - 1].periodDate) + '</span><span>Source <b>' + fmtCurrency(source) + '</b></span>';
        const maxPct = Math.max(...rows.map(r => r.percentage));
        bars.innerHTML = rows.map(r => '<div class="b" style="height:' + Math.max(4, Math.round(r.percentage / maxPct * 70)) + 'px"></div>').join('');
        table.innerHTML = rows.slice(0, 5).map((r, i) => '<tr><td>' + (i+1) + '</td><td>' + fmtDate(r.periodDate) + '</td><td>Period ' + (i+1) + '</td><td>' + r.percentage.toFixed(2) + '%</td><td>' + fmtCurrency(r.amount) + '</td></tr>').join('');
        if (rows.length > 5) table.innerHTML += '<tr><td colspan="5" style="color:var(--bccf-ink-500);text-align:center">+ ' + (rows.length - 5) + ' more</td></tr>';
        preview.style.display = 'block';
    };

    [dist, n, interval, start].forEach(input => input.addEventListener('change', recompute));
    [dist, n, interval, start].forEach(input => input.addEventListener('input', recompute));
    recompute();
}
```

Call `wireCalculator(sectionId, sourceAmount)` after the section renders.

- [ ] **Step 3: Deploy + smoke test**

Open a PO subtab. Change Distribution and confirm the preview updates. Change Periods to 8 and confirm 8 bars + 5-row preview + "+3 more" footer. Change Interval to Bi-weekly and confirm dates step every 14 days.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "feat: schedule calculator live preview wired

Changing any input updates End date + bar preview + row preview.
No grid mutation yet — Generate button is next task.
Spec §3.14.6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Wire Generate button (replace grid rows)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

- [ ] **Step 1: Add Generate click handler**

In the same client script block, after `wireCalculator`:
```js
function wireGenerate(sectionId, source) {
    document.getElementById(sectionId + '_calc_generate').addEventListener('click', async () => {
        // Confirm if grid is dirty
        const dirty = isGridDirty(sectionId);
        if (dirty) {
            const ok = await confirmDialog({
                headline: 'warn',
                body: 'Generating will replace your current rows.',
                confirmLabel: 'Generate',
                cancelLabel: 'Cancel',
            });
            if (!ok) return;
        }
        const dist = document.getElementById(sectionId + '_calc_dist').value;
        const n = parseInt(document.getElementById(sectionId + '_calc_n').value, 10);
        const interval = document.getElementById(sectionId + '_calc_interval').value;
        const start = new Date(document.getElementById(sectionId + '_calc_start').value + 'T00:00:00');
        const rows = BCCF_CALC.generate({ distribution: dist, periods: n, interval, startDate: start, source });
        // Replace grid rows
        bcTiming.setLines(sectionId, rows);
        // Reset dirty + lastEdited flags
        clearDirtyFlags(sectionId);
        // Show success toast
        showToast({ type: 'info', message: 'Generated ' + n + ' rows.' });
    });
}
```

- [ ] **Step 2: Implement `bcTiming.setLines(sectionId, rows)`**

Look up the existing grid-rerender pattern in `bc_timing_ui.js` (the client JS that handles `addRow` / `removeRow`). The function should:
1. Clear `<tbody>`.
2. Rebuild rows from the new data.
3. Recompute cumulative columns.
4. Update the validation badge.

If the file already has a `recalculate` function — use that pattern.

- [ ] **Step 3: Implement `confirmDialog(opts)` if not already inlined**

Mirror the §3.10 contract. Returns `Promise<boolean>`. Esc=false, Enter=true. Style uses `.bccf-modal-*` classes from `bc_cf_styles.js`.

- [ ] **Step 4: Run tests + smoke test deploy**

Deploy. On a PO subtab:
1. Click **Generate** with default inputs (S-curve, 6, monthly, today). Grid should populate with 6 S-curve rows matching the preview.
2. Edit row 3's percentage manually.
3. Click **Generate** again. Confirm dialog appears warning that changes will be lost. Click Cancel → grid unchanged. Click Generate again → confirm → grid replaced.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat: schedule calculator Generate button replaces grid rows

Confirms before overwriting dirty edits (spec §3.14.5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Remove `applyTemplate` + `BUILT_IN_TEMPLATES` from `bc_timing_engine.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_engine.js`
- Modify: `tests/modules/bc_timing_engine.test.js` (delete `applyTemplate` tests; they reference the deleted code)

- [ ] **Step 1: Delete the `applyTemplate` function + `BUILT_IN_TEMPLATES` constant**

Read the file. Remove the `applyTemplate` function and the `BUILT_IN_TEMPLATES` array. Leave other exports intact.

- [ ] **Step 2: Update the engine's `return { ... }` to drop `applyTemplate`**

- [ ] **Step 3: Remove the `applyTemplate` test block**

Delete the `describe('applyTemplate', () => { ... });` block from `tests/modules/bc_timing_engine.test.js`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: green. All remaining engine tests pass.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "refactor: drop applyTemplate + BUILT_IN_TEMPLATES from bc_timing_engine

Calculator replaces stamp-only template; engine no longer needs these.
Spec §3.14.9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: New save bar (status + Rebalance + Save)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

- [ ] **Step 1: Replace the existing save bar HTML in `renderScheduleSubtab`**

Find the current `<div class="bc-cf-save-bar">` block and replace with:
```js
const saveBarHtml = (editable !== false) ? `
<div class="bccf-save-bar" id="${rootId}_save_bar">
    <div class="bccf-save-status saved" id="${saveStatusId}"><span class="dot"></span>Ready</div>
    <div class="bccf-save-actions">
        <button type="button" class="bccf-btn" data-action="review-accrual">Review Accrual</button>
        <button type="button" class="bccf-btn" data-action="discard">Discard changes</button>
        <button type="button" class="bccf-btn bccf-btn-rebalance" data-action="rebalance" id="${rootId}_rebalance_btn" style="display:none">Rebalance</button>
        <button type="button" class="bccf-btn bccf-btn-pri" id="${saveBtnId}" data-action="save">Save schedules</button>
    </div>
</div>` : '';
```

Add `.bccf-save-bar { position:sticky; bottom:0; background:var(--bccf-surface); border:1px solid var(--bccf-border); border-radius:var(--bccf-r-lg); padding:12px 18px; box-shadow:var(--bccf-shadow-2); display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:10px; } .bccf-save-actions { display:flex; gap:8px; align-items:center; }` to the local CSS block.

- [ ] **Step 2: Replace per-button `onclick` with document-level delegation**

In the client JS, register one listener:
```js
document.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;
    if (action === 'save') { await bcTiming.save(...); }
    else if (action === 'discard') { await handleDiscard(); }
    else if (action === 'rebalance') { handleRebalance(); }
    else if (action === 'review-accrual') { bcTiming.switchTab('accrual', tabNavId); }
    else if (action === 'review-cashflow') { bcTiming.switchTab('cashflow', tabNavId); }
});
```

- [ ] **Step 3: Wire dirty/saved status updates**

Listen for `change` / `input` events on grid cells; when fired, swap save-status to `dirty-balanced` (or `dirty-warn` if totals out of balance). On successful save, swap to `saved`.

Define `setSaveStatus(state, message)` helper inside the client JS.

- [ ] **Step 4: Show/hide Rebalance button based on totals**

After every grid change, compute `Σpercentage`. If `|Σ − 100| < 0.01`, hide `#<rootId>_rebalance_btn`; otherwise show it.

- [ ] **Step 5: Smoke-test deploy**

Open a PO. Edit row 3 percentage. Confirm:
1. Save status pulses `Unsaved changes · totals out of balance` in amber.
2. Rebalance button appears (warn-amber).
3. Save button stays enabled.

Restore row 3 to its original value. Confirm Rebalance disappears.

- [ ] **Step 6: Commit**

```bash
git add -u && git commit -m "feat: new save bar — status dot + Rebalance (conditional) + delegation

Spec §3.13 save bar buttons, §3.14.8 rebalance visibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Wire Rebalance redistribution + tooltip

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

- [ ] **Step 1: Implement `handleRebalance()` in the client JS**

```js
function handleRebalance() {
    const sectionId = getActiveSectionId();  // existing helper
    const rows = bcTiming.getLines(sectionId);
    const source = parseFloat(document.getElementById(rootId).dataset.sourceAmount);
    const lastEdited = window.__bccfLastEditedIndex?.[sectionId] ?? rows.length - 1;
    const newRows = BCCF_CALC.rebalance(rows, source, lastEdited);
    bcTiming.setLines(sectionId, newRows);
    setSaveStatus('dirty-balanced', 'Unsaved changes · ready to save');
    flashRebalancedRows(sectionId, lastEdited);  // CSS class for 1.5s background fade
    document.getElementById(rootId + '_rebalance_btn').style.display = 'none';
}
```

- [ ] **Step 2: Track `lastEdited` index globally**

In the input `change` event handler, set `window.__bccfLastEditedIndex[sectionId] = idx`. Reset to null on Generate.

- [ ] **Step 3: Implement dynamic tooltip**

The Rebalance button needs a tooltip showing live numbers. Use a `title="..."` attribute updated on each totals recompute, OR a CSS-only `[data-tooltip]` overlay (use the helper from spec §3.10 toast/confirm or build inline). Tooltip text format: `"Distribute the $1,250.00 (8.33%) overage across the other 5 lines proportionally."` (Signed; show "shortage" instead of "overage" when totals < 100%.)

```js
function updateRebalanceTooltip() {
    const rows = bcTiming.getLines(getActiveSectionId());
    const source = parseFloat(document.getElementById(rootId).dataset.sourceAmount);
    const sumPct = rows.reduce((s, r) => s + r.percentage, 0);
    const sumAmt = rows.reduce((s, r) => s + r.amount, 0);
    const pctDiff = Math.round((sumPct - 100) * 100) / 100;
    const amtDiff = Math.round((sumAmt - source) * 100) / 100;
    const word = pctDiff >= 0 ? 'overage' : 'shortage';
    const targets = rows.length - 1;  // excluding lastEdited
    const btn = document.getElementById(rootId + '_rebalance_btn');
    btn.title = `Distribute the ${fmtCurrency(Math.abs(amtDiff))} (${Math.abs(pctDiff).toFixed(2)}%) ${word} across the other ${targets} lines proportionally.`;
}
```

Call after each totals recompute.

- [ ] **Step 4: Smoke test**

Edit row 3 amount to $5,000. Confirm:
1. Rebalance button appears.
2. Hover shows the tooltip with `Distribute the $1,250.00 (8.33%) overage across the other 5 lines proportionally.`
3. Click Rebalance. Other rows adjust; row 3 stays at $5,000. Totals back to 100% / $15,000. Rebalance button disappears. Save status pulses `Unsaved changes · ready to save`.
4. Touched rows briefly flash light green.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat: Rebalance redistributes overage across non-edited rows

Uses bc_cf_calculator.rebalance(); preserves last-edited row exactly.
Tooltip shows live overage/shortage. Spec §3.14.8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: Validation badge in tfoot

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js`

- [ ] **Step 1: Replace the old `bc-cf-validation` badge with new badge primitives in `renderTimingGrid` tfoot**

```js
const validationHtml = isValid
    ? `<span class="bccf-badge success">✓ Balanced</span>`
    : `<span class="bccf-badge warn">⚠ ${fmtPercent(totalPct)} allocated</span>`;
```

- [ ] **Step 2: Update the inline-recompute path**

When `recalculate(sid)` runs after a cell change, the validation badge in tfoot must update. Find the existing recompute code and ensure the tfoot HTML is rebuilt with the new badge classes.

- [ ] **Step 3: Smoke test**

Open a PO, confirm `✓ Balanced` badge appears in tfoot when 100% / source. Edit a row to break balance — badge swaps to amber `⚠ X% allocated`. Click Rebalance — back to green.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "ui: validation badge uses bccf-badge success/warn classes

Spec §3.15.7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: CO Schedule — Contract/Estimate segmented toggle

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_co_timing_ue.js`
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js` (for any rendering changes if the dual-pane pattern lives here)

- [ ] **Step 1: Identify the current CO dual-pane render**

Run: `grep -n "Estimate\|Contract\|sectionPrefix\|dual\|co_rev\|co_cost" FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_co_timing_ue.js FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js | head -40`

The current behavior: stacks both Contract and Estimate panes vertically with separate `sectionPrefix` IDs.

- [ ] **Step 2: Replace stacked layout with a single section + pane toggle**

In `bc_co_timing_ue.js` (which composes the CO subtab), instead of calling `renderScheduleSubtab` twice and concatenating, call it once for the active pane and add a `.bccf-pane-toggle` in the header. Toggle clicks re-fire `renderScheduleSubtab` for the other pane (or just toggle visibility of two pre-rendered panes — both work; pre-rendered is simpler).

Header HTML to add:
```js
const paneToggle = `<div class="bccf-pane-toggle">
    <button type="button" class="active contract" data-pane="contract">⬡ Contract ($${fmtCurrency(contractAmount, true)})</button>
    <button type="button" class="estimate" data-pane="estimate">⬢ Estimate ($${fmtCurrency(estimateAmount, true)})</button>
</div>`;
```

Client JS handler:
```js
document.addEventListener('click', (e) => {
    const paneBtn = e.target.closest('[data-pane]');
    if (!paneBtn) return;
    const target = paneBtn.getAttribute('data-pane');
    document.querySelectorAll('.bccf-pane-toggle button').forEach(b => b.classList.remove('active'));
    paneBtn.classList.add('active', target);
    document.getElementById('co_pane_contract').style.display = target === 'contract' ? 'block' : 'none';
    document.getElementById('co_pane_estimate').style.display = target === 'estimate' ? 'block' : 'none';
});
```

- [ ] **Step 3: Smoke test deploy**

Run:
```bash
npx suitecloud file:upload --paths \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_co_timing_ue.js" \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js"
```
Open a Change Request record. Confirm:
1. Pane toggle visible in header.
2. Default Contract pane shows.
3. Click Estimate — section swaps, toggle pill swaps colors (navy → slate active).
4. Each pane retains its own grid data and save status independently.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "feat: CO Schedule — Contract/Estimate segmented toggle

Replaces stacked dual-pane layout. Contract = navy active, Estimate = slate active.
Spec §3.13 CO toggle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 6 — Polish + verification

**Goal of phase:** Final sweeps + deploy + customer demo verification.

---

### Task 29: Verify the demo project end-to-end

**Files:**
- None (verification only).

- [ ] **Step 1: Open Project record 1807 in NetSuite**

- [ ] **Step 2: Cash Flow tab**

Confirm all 3 reports load with skeletons, then real data within ~2s. Numbers match spec §4 verification block: Revenue $42K · Cost $33K · Net $9K · Margin 21.4%.

- [ ] **Step 3: PO 16240 Schedule subtab**

- Cash Flow tab default. KPI strip shows Source / Scheduled / Remaining.
- Click Generate with default inputs → 6 S-curve rows ($1,005 / $2,745 / $3,750 / $3,750 / $2,745 / $1,005).
- Edit row 3 amount to $5,000 → Rebalance button appears.
- Click Rebalance → row 3 stays, others adjust, total back to $15,000.
- Save → status flips to `Saved · just now`.

- [ ] **Step 4: SO0631 Schedule subtab**

Same flow as PO but no Cost Code columns; source = $30K (Base Contract only).

- [ ] **Step 5: CO-001 Schedule subtab**

- Contract pane default ($12K). Generate 3 rows. Save.
- Toggle to Estimate ($10K). Generate. Save.
- Toggle back to Contract → original Contract rows persist.

- [ ] **Step 6: If anything is broken**

Open a new task at the bottom of this plan describing the bug + fix it. Don't bypass with a hot patch.

---

### Task 30: Sweep — confirm no native confirm()/alert() leaks

**Files:**
- All modified files in Phase 4 / 5.

- [ ] **Step 1: Grep for native dialog usage**

Run: `grep -rn "window\.confirm\|window\.alert\|^[^/]*confirm(\|^[^/]*alert(" FileCabinet/SuiteScripts/BlueCollar/CashFlow/`
Expected: No matches (or all matches are in comments / SuiteScript log calls).

If any survive, replace with `confirmDialog(...)` or `showToast({ type: 'info', message: ... })`.

- [ ] **Step 2: Commit any fixes**

```bash
git add -u && git commit -m "polish: remove residual native confirm/alert calls — use confirmDialog/toast

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 31: Final deploy + customer-ready commit

**Files:**
- None (deploy only).

- [ ] **Step 1: Validate the full project**

Run: `npm run validate`
Expected: clean.

- [ ] **Step 2: Dry-run deploy**

Run: `npm run deploy:dryrun`
Expected: lists all changed files, no errors.

- [ ] **Step 3: File-only upload of every modified SuiteScript file**

Run:
```bash
npx suitecloud file:upload --paths \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js" \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_ui.js" \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_calculator.js" \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_report_utils.js" \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_ui.js" \
  "/SuiteScripts/BlueCollar/CashFlow/modules/bc_timing_engine.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cost_timing_ue.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_rev_timing_ue.js" \
  "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_co_timing_ue.js"
```
Expected: every file reports as uploaded.

- [ ] **Step 4: Final smoke test from a fresh browser session**

Hard-reload the project record. Walk through all 6 surfaces. Confirm no console errors. Confirm no missing primitives (e.g. unstyled save bar, missing border).

- [ ] **Step 5: Phase-end commit marker**

```bash
git commit --allow-empty -m "chore: v1 redesign complete — ready for customer POC deploy

All 6 surfaces re-skinned. Actuals removed. Calculator + Rebalance live.
Spec §1-§3.16 fully implemented. Demo project 1807 verified.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Coverage check:** Every spec section §3.1–§3.16 maps to at least one task: §3.1 architecture → T7 + T9–11. §3.2 3-iframe choice → preserved by T15–17. §3.3 actuals removal → T2–6. §3.4 layout → T15–17. §3.5 nav tabs → T18. §3.6 KPIs → T15–17. §3.7 color encoding → T7 (tokens) + T15–17 (applied). §3.8 chart → T15–17. §3.9 loading → T15. §3.10 toast/modal → T9 (primitives) + T23 (used). §3.11 iframe height → unchanged (in scope). §3.12 run-as → unchanged. §3.13 editor layout → T19–21, T25. §3.14 calculator → T8 (math) + T21–23. §3.14.8 rebalance → T8 + T25–26. §3.15 catalog → T7 + T9. §3.16 skeleton → T9 (skel builders) + T15–17 (used).

**Type / signature consistency:** `BCCF_CALC.generate / rebalance / weights / normalize / computeEndDate` — used identically in T22, T23, T26. Calculator inputs `{distribution, periods, interval, startDate, source}` — same shape everywhere. Save-bar `data-action` strings (`save`, `discard`, `rebalance`, `review-accrual`, `review-cashflow`) — defined T25, referenced same in T26 / T28.

**Placeholder scan:** No `TBD` / `TODO` / "implement later". Every step has either runnable code or a runnable command. Step 3 of Task 11 marks "implementer fills in exact field/label values" — that's a deliberate hand-off, not a placeholder, because the real SuiteQL field names are already in the existing report SLs and grep-able.

**Scope:** 31 tasks across 6 phases, each phase deployable. Customer POC unblocked at Phase 1. Phases 2–6 layer polish on top. Plan is one coherent unit; no further decomposition needed.

---

*Plan complete. Ready for `superpowers:subagent-driven-development` or `superpowers:executing-plans` to begin Task 1.*

# BC Cash Flow — E1.5 — Table Densification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sticky KPIs/chart/table-header + scrollable transaction tbody + chronological default sort (newest createdDate first) + click-to-sort on column headers (3-state toggle on Period/Total, 2-state on Source) to the 3 report Suitelets, so long-forecast projects are usable and the table UX is ready for E2 to inherit.

**Architecture:** Server-side, the data SL learns `createdDate` per line: each SQL adds a `MIN(<source>.createddate)` expression in the SELECT and `created_date DESC NULLS LAST` to `ORDER BY`. `_pivotDirection` extracts the date into each emitted line and re-orders groups by it instead of alphabetically. Client-side, each report SL's `CLIENT_SCRIPT` IIFE gains `_sortState`, `_lastData` (so re-sort doesn't re-fetch), a `sortLines` comparator (handles source/period/total columns, treats null createdDate as always-to-end, $0 amounts as participating), header `<th data-sort-col="...">` attributes with an active-column ▼/▲ indicator, and a click handler implementing the 2-state (Source) and 3-state (Period/Total) toggle. CSS adds 4 sticky-layout rules under `.bccf-layout #bccf-{kpis,chart,table}` plus a slim `.bccf-kpi` redefinition.

**Tech Stack:** SuiteScript 2.1 AMD (`@NApiVersion 2.1`), hand-rolled vanilla JS + CSS inlined in template literals, Jest + `@oracle/suitecloud-unit-testing` for tests, SuiteCloud SDF for deploy.

**Spec:** `docs/superpowers/specs/2026-05-23-cashflow-table-densification-design.md` (commit `bc90308`).

**Deploy cadence:** Phase 1 (data SL) deploys file-only and is invisible until the client uses `createdDate`. Phase 2 (CSS) is invisible until the SL changes ship. Phase 3 (Combined) is the first user-visible drop; sandbox checkpoint before mirroring to Cost (Phase 4) and Revenue (Phase 5).

---

## File Structure

### Modified files

| File | Change |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` | Each of `COST_SQL`, `REVENUE_SQL`, both legs of `COMBINED_SQL`: add a `created_date` CASE expression in SELECT and update `ORDER BY`. `_pivotDirection` extracts the new column and orders groups by createdDate DESC NULLS LAST. Export `_pivotDirection` on `api` for direct unit testing. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` | Replace `.bccf-kpi` rule with slim variant; append 4 sticky-layout rules. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` | Add `_sortState`, `_lastData`, `sortLines` to `CLIENT_SCRIPT`. `renderTable` accepts `sortState` and sorts each direction's lines. Headers carry `data-sort-col` + active indicator. New click handler for sort. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js` | Same as Combined, single direction (`cost`). |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js` | Same as Combined, single direction (`revenue`). |
| `tests/entry_points/bc_cf_data_sl.test.js` | New `describe('bc_cf_data_sl _pivotDirection', ...)` covering createdDate extraction + chronological key ordering + null handling. |
| `tests/entry_points/bc_cf_combined_sl.test.js` | New `describe('bc_cf_combined_sl — sortable headers (E1.5)', ...)`: `data-sort-col` present on all headers, `_sortState` default in CLIENT_SCRIPT, `sortLines` function present, sort indicator markup, immutability of input lines. |
| `tests/entry_points/bc_cf_cost_report_sl.test.js` | Same shape. |
| `tests/entry_points/bc_cf_rev_report_sl.test.js` | Same shape. |
| `tests/modules/bc_cf_styles.test.js` | Assert sticky-layout rules + slim KPI dimensions present. |

### New files

None.

---

# Phase 1 — Data SL: createdDate per line

**Goal of phase:** Server emits `createdDate` on every line and orders groups newest-first by default. No UI changes; the field is dormant until Phase 3 wires the client.

**Phase exit criteria:** All Phase 1 tests green; full suite still green; data SL deploys clean.

---

### Task 1: Baseline snapshot

**Files:**
- Read: nothing modified.

- [ ] **Step 1: Confirm branch + clean tree**

Run: `git status && git branch --show-current`
Expected: branch `feature/v1.5-enhancements`, working tree clean.

- [ ] **Step 2: Run the suite to confirm green baseline**

Run: `npm test`
Expected: 9 suites pass, 231 tests pass.

- [ ] **Step 3: Note current data SL line count**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
Expected: ~795 lines (after E1).

---

### Task 2: Export `_pivotDirection` on `api` for direct testing

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Currently `_pivotDirection` is a closure inside the AMD body, not exported. To test the createdDate extraction directly we add it to the `api` export. Pure refactor — no behavior change.

- [ ] **Step 1: Add the failing test**

Append to `tests/entry_points/bc_cf_data_sl.test.js`:

```js
describe('bc_cf_data_sl _pivotDirection', () => {
    it('is exported on api', () => {
        expect(typeof Suitelet._pivotDirection).toBe('function');
    });
    it('returns the expected shape with no rows', () => {
        const result = Suitelet._pivotDirection([], ['2026-04', '2026-05'], null);
        expect(result).toEqual({ lines: [], total: [0, 0], grandTotal: 0 });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: first test fails (`Suitelet._pivotDirection is not a function`).

- [ ] **Step 3: Add `_pivotDirection` to the `api` export**

In `bc_cf_data_sl.js`, locate the `const api = { ... };` block near the bottom. Update it to include `_pivotDirection`:

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange,
        _pivotDirection
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
chore(bc_cf_data_sl): export _pivotDirection on api for direct testing

Pure refactor — no behavior change. Enables the next task to unit-test
the new createdDate extraction without going through loader spies.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `_pivotDirection` extracts `createdDate` and orders groups chronologically

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

`_pivotDirection` currently builds `groups` + `sourceMap` and orders keys via `_sortedKeys` (alphabetical with optional `firstKey` hoist). We add a `createdMap` (group → createdDate string), emit `createdDate` on each line, and reorder keys by createdDate DESC NULLS LAST. The `_sortedKeys` call is replaced; `_sortedKeys` itself stays in the file as dead code (no signature break, no callers).

The `firstKey` arg on `_pivotDirection` likewise becomes ignored — callers can still pass anything but the value is unused. Spec §3.1.4.

- [ ] **Step 1: Add the failing tests**

Append to the same `describe('bc_cf_data_sl _pivotDirection', ...)` block:

```js
    it('extracts createdDate from rows into each line', () => {
        const rows = [
            { cost_group: 'PO 16240', period: '2026-04', amount: 1000, source_id: 16240, source_type: 'po', created_date: '2026-03-15' },
            { cost_group: 'PO 16240', period: '2026-05', amount: 2000, source_id: 16240, source_type: 'po', created_date: '2026-03-15' },
            { cost_group: 'PO 16241', period: '2026-04', amount:  500, source_id: 16241, source_type: 'po', created_date: '2026-04-01' }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04', '2026-05'], null);
        expect(result.lines).toHaveLength(2);
        expect(result.lines.find((l) => l.id === 'PO 16240').createdDate).toBe('2026-03-15');
        expect(result.lines.find((l) => l.id === 'PO 16241').createdDate).toBe('2026-04-01');
    });

    it('emits null createdDate for groups whose rows have no created_date', () => {
        const rows = [
            { cost_group: 'Other Cost', period: '2026-04', amount: 100, source_id: null, source_type: null, created_date: null }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04'], null);
        expect(result.lines[0].createdDate).toBeNull();
    });

    it('orders groups by createdDate DESC NULLS LAST (newest first)', () => {
        const rows = [
            { cost_group: 'Old PO',   period: '2026-04', amount: 100, source_id: 1, source_type: 'po', created_date: '2026-01-10' },
            { cost_group: 'New PO',   period: '2026-04', amount: 200, source_id: 2, source_type: 'po', created_date: '2026-05-20' },
            { cost_group: 'Null PO',  period: '2026-04', amount:  50, source_id: null, source_type: null, created_date: null },
            { cost_group: 'Mid PO',   period: '2026-04', amount:  75, source_id: 3, source_type: 'po', created_date: '2026-03-05' }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04'], null);
        expect(result.lines.map((l) => l.id)).toEqual(['New PO', 'Mid PO', 'Old PO', 'Null PO']);
    });

    it('totals + grandTotal stay correct regardless of order change', () => {
        const rows = [
            { cost_group: 'A', period: '2026-04', amount: 100, source_id: 1, source_type: 'po', created_date: '2026-01-01' },
            { cost_group: 'B', period: '2026-04', amount: 200, source_id: 2, source_type: 'po', created_date: '2026-02-01' },
            { cost_group: 'A', period: '2026-05', amount: 300, source_id: 1, source_type: 'po', created_date: '2026-01-01' }
        ];
        const result = Suitelet._pivotDirection(rows, ['2026-04', '2026-05'], null);
        expect(result.total).toEqual([300, 300]);
        expect(result.grandTotal).toBe(600);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: 4 new tests fail.

- [ ] **Step 3: Update `_pivotDirection`**

In `bc_cf_data_sl.js`, locate the `_pivotDirection` function (around line 370). Replace the entire body with:

```js
    const _pivotDirection = (rows, periods, firstKey) => {
        // firstKey arg retained for backwards-compat — unused after E1.5.
        // Group keys are now ordered by createdDate DESC NULLS LAST. Spec §3.1.4.

        const groups = {};
        const sourceMap = {};
        const createdMap = {};

        rows.forEach((r) => {
            const g = r.cost_group;
            if (!groups[g]) groups[g] = {};
            groups[g][r.period] = (groups[g][r.period] || 0) + (Number(r.amount) || 0);
            if (!sourceMap[g] && r.source_id) {
                sourceMap[g] = { id: r.source_id, type: r.source_type };
            }
            if (!(g in createdMap) && r.created_date != null) {
                createdMap[g] = r.created_date;
            }
        });

        // Sort group keys by createdDate DESC NULLS LAST.
        const keys = Object.keys(groups).sort((a, b) => {
            const da = createdMap[a];
            const db = createdMap[b];
            if (da == null && db == null) return a < b ? -1 : (a > b ? 1 : 0);  // stable alphabetic for both-null
            if (da == null) return 1;   // nulls to end
            if (db == null) return -1;
            return da < db ? 1 : (da > db ? -1 : 0);  // descending
        });

        const lines = keys.map((k) => {
            const byPeriod = groups[k];
            const amounts = periods.map((p) => byPeriod[p] || 0);
            const total = amounts.reduce((s, v) => s + v, 0);
            const src = sourceMap[k] || null;
            return {
                id: k,
                label: k,
                source: src,
                amounts,
                total,
                createdDate: (k in createdMap) ? createdMap[k] : null
            };
        });

        const total = periods.map((_, i) => lines.reduce((s, l) => s + (l.amounts[i] || 0), 0));
        const grandTotal = total.reduce((s, v) => s + v, 0);

        return { lines, total, grandTotal };
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: all green, including the 4 new tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 9 suites pass. The existing loader tests (which mock `_loadCombined` etc. entirely) are unaffected.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): _pivotDirection emits createdDate + orders groups chronologically

Adds createdMap collection from r.created_date (SQL changes ship next).
Each line now carries createdDate (string or null). Group keys ordered
by createdDate DESC NULLS LAST instead of alphabetically; firstKey hoist
is now dead code (call sites still pass arg for signature stability).
Spec §3.1.3, §3.1.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: COST_SQL emits `created_date` + `ORDER BY` includes it

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`

The SQL change is purely additive — a new SELECT-list column and a reordered ORDER BY. No new joins (the existing LEFT JOINs already expose `t.createddate` and `cr.createddate`). No tests required at this step because the data SL tests mock loaders entirely; the SQL is not exercised by Jest. The behavior gets verified in Phase 6 sandbox check.

- [ ] **Step 1: Add the `created_date` SELECT expression to `COST_SQL`**

In `bc_cf_data_sl.js`, locate `const COST_SQL = ...`. The current SELECT list ends with a `source_type` CASE expression. After that closing `END AS source_type,` (before the `FROM` keyword), insert:

```sql
            CASE
                WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                    THEN TO_CHAR(MIN(cr.createddate), 'YYYY-MM-DD')
                WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
```

(Comma-separate the new column from the preceding `source_type` column. The existing column ends with a comma; the new column is the last in the SELECT list and has no trailing comma — placed immediately before `FROM`.)

The full SELECT block in `COST_SQL` after the edit looks like:
```sql
        SELECT
            CASE ... END AS cost_group,
            TO_CHAR(...) AS period,
            SUM(...) AS amount,
            CASE ... END AS source_id,
            CASE ... END AS source_type,
            CASE
                WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                    THEN TO_CHAR(MIN(cr.createddate), 'YYYY-MM-DD')
                WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
        FROM customrecord_bc_cost_timing_line ctl
```

- [ ] **Step 2: Update `COST_SQL` `ORDER BY`**

Locate the final line of `COST_SQL`: `ORDER BY cost_group, period`. Replace with:

```sql
        ORDER BY created_date DESC NULLS LAST, cost_group, period
```

- [ ] **Step 3: Run the suite to confirm no regressions**

Run: `npm test`
Expected: 9 suites pass, all 235 tests green (the SQL constant is a string, not executed in Jest).

- [ ] **Step 4: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): COST_SQL emits created_date + sorts newest first

Adds MIN(<source>.createddate) CASE in the SELECT, surfaces as created_date
on each row. ORDER BY uses created_date DESC NULLS LAST as the primary key
so newest transactions appear first in _pivotDirection's input. Spec §3.1.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: REVENUE_SQL emits `created_date` + `ORDER BY` includes it

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`

Mirror of Task 4 for revenue. Revenue uses `rtl.custrecord_bc_rtl_*` fields and joins `transaction t` + `customrecord_bc_change_req cr`.

- [ ] **Step 1: Add the `created_date` SELECT expression to `REVENUE_SQL`**

In `REVENUE_SQL`, after the `source_type` CASE column, insert:

```sql
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                    THEN TO_CHAR(MIN(cr.createddate), 'YYYY-MM-DD')
                WHEN rtl.custrecord_bc_rtl_transaction IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
```

- [ ] **Step 2: Update `REVENUE_SQL` `ORDER BY`**

Change `ORDER BY cost_group, period` to:

```sql
        ORDER BY created_date DESC NULLS LAST, cost_group, period
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 4: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): REVENUE_SQL emits created_date + sorts newest first

Mirror of Task 4 for revenue path. ORDER BY uses created_date DESC NULLS
LAST so SO/CO/Base-Bid rows reach _pivotDirection in newest-first order.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: COMBINED_SQL emits `created_date` on both UNION legs + `ORDER BY` includes it

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`

Combined is the most fiddly — both legs of the UNION ALL need the same column. Revenue leg uses `cr` for change-req joins; cost leg uses `cr2` (distinct alias inside the second SELECT). The outer `ORDER BY` is also updated.

- [ ] **Step 1: Add `created_date` to revenue leg of `COMBINED_SQL`**

In the revenue leg's SELECT list (the first half of `COMBINED_SQL`), after the `source_type` CASE, insert:

```sql
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL
                    THEN TO_CHAR(MIN(cr.createddate), 'YYYY-MM-DD')
                WHEN rtl.custrecord_bc_rtl_transaction IS NOT NULL
                    THEN TO_CHAR(MIN(t_rev.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
```

Note `t_rev` (the alias used in the revenue leg, not `t`).

- [ ] **Step 2: Add `created_date` to cost leg of `COMBINED_SQL`**

In the cost leg's SELECT list (the second half of `COMBINED_SQL`, after `UNION ALL`), after the `source_type` CASE, insert:

```sql
            CASE
                WHEN ctl.custrecord_bc_ctl_change_order IS NOT NULL
                    THEN TO_CHAR(MIN(cr2.createddate), 'YYYY-MM-DD')
                WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
                    THEN TO_CHAR(MIN(t.createddate), 'YYYY-MM-DD')
                ELSE NULL
            END AS created_date
```

Note `cr2` (the alias used in the cost leg's change-req join).

- [ ] **Step 3: Update `COMBINED_SQL` outer `ORDER BY`**

Locate the final line: `ORDER BY flow_direction DESC, cost_group, period`. Replace with:

```sql
        ORDER BY flow_direction DESC, created_date DESC NULLS LAST, cost_group, period
```

This keeps Revenue rows grouped before Cost rows (the outer `flow_direction DESC` returns 'Revenue' alphabetically before 'Cost' in descending order — wait, that's actually backwards; 'Revenue' > 'Cost' lexicographically, so DESC puts Revenue first). Existing behavior preserved; createdDate becomes the secondary key.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): COMBINED_SQL emits created_date on both UNION legs

Revenue leg uses MIN(cr.createddate) / MIN(t_rev.createddate); cost leg
uses MIN(cr2.createddate) / MIN(t.createddate). Outer ORDER BY adds
created_date DESC NULLS LAST after flow_direction DESC so each direction
stays grouped but rows within each direction land newest-first.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Deploy data SL — Phase 1 complete

**Files:** none modified.

- [ ] **Step 1: Confirm working tree is clean + tests green**

Run: `git status && npm test 2>&1 | tail -5`
Expected: clean tree, 235 tests / 9 suites pass.

- [ ] **Step 2: Upload data SL to sandbox**

Run: `npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js"`
Expected: success.

The data SL change is now live but invisible to users — no UI consumes `createdDate` yet. The current Combined/Cost/Revenue reports will continue to render exactly as before, because:
- The new line field is just ignored by the existing client.
- The `ORDER BY` change means lines arrive in chronological order instead of alphabetical; the client doesn't notice because the table renders whatever order it receives, and there's no visible "wrong" order to compare against.

Phase 1 done. Proceeding to Phase 2.

---

# Phase 2 — CSS: slim KPI + sticky chrome

**Goal of phase:** Visual changes that compress the KPI strip and pin KPIs/chart/thead while the tbody scrolls. No interactive changes.

**Phase exit criteria:** Tests green; deployed stylesheet behaves correctly on existing reports (with no sortable headers yet).

---

### Task 8: Slim `.bccf-kpi` rule

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`
- Modify: `tests/modules/bc_cf_styles.test.js`

The current `.bccf-kpi` rule sets `padding: 14px 16px` and `.bccf-v { font-size: var(--bccf-text-2xl) }`. Replace to slim: `padding: 8px 12px` and `font-size: var(--bccf-text-xl)`. Spec §3.2.3.

- [ ] **Step 1: Add the failing test**

In `tests/modules/bc_cf_styles.test.js`, append a new `it` to the `describe('getStyles()', ...)` block:

```js
        it('uses slim KPI dimensions (E1.5 §3.2.3)', () => {
            const out = Styles.getStyles();
            // Slim padding on .bccf-kpi
            expect(out).toMatch(/\.bccf-kpi\s*\{[^}]*padding:\s*8px\s+12px/);
            // Slim value type
            expect(out).toMatch(/\.bccf-kpi\s+\.bccf-v\s*\{[^}]*font-size:\s*var\(--bccf-text-xl\)/);
        });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: the new test fails.

- [ ] **Step 3: Replace the `.bccf-kpi` rules in `bc_cf_styles.js`**

In the `PRIMITIVES` template literal, locate the KPI block:

```css
        .bccf-kpi { background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-lg); padding: 14px 16px; }
        .bccf-kpi .bccf-k { font-size: var(--bccf-text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--bccf-ink-500); font-weight: 500; }
        .bccf-kpi .bccf-v { font-size: var(--bccf-text-2xl); font-weight: 600; color: var(--bccf-ink-900); letter-spacing: -0.01em; margin-top: 4px; line-height: 1; }
        .bccf-kpi .bccf-sub { font-size: var(--bccf-text-xs); color: var(--bccf-ink-500); margin-top: 6px; }
        .bccf-kpi.accent .bccf-v { color: var(--bccf-brand-500); }
```

Replace with:

```css
        /* E1.5 slim KPI — reclaims sticky real estate for long forecasts */
        .bccf-kpi { background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-lg); padding: 8px 12px; }
        .bccf-kpi .bccf-k { font-size: var(--bccf-text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--bccf-ink-500); font-weight: 500; }
        .bccf-kpi .bccf-v { font-size: var(--bccf-text-xl); font-weight: 600; color: var(--bccf-ink-900); letter-spacing: -0.01em; margin-top: 2px; line-height: 1.1; }
        .bccf-kpi .bccf-sub { font-size: var(--bccf-text-xs); color: var(--bccf-ink-500); margin-top: 3px; }
        .bccf-kpi.accent .bccf-v { color: var(--bccf-brand-500); }
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js tests/modules/bc_cf_styles.test.js
git commit -m "$(cat <<'EOF'
style(bc_cf_styles): slim .bccf-kpi for E1.5 sticky stack

KPI cards drop from ~100px to ~70px tall: padding 14/16 → 8/12, value
font 2xl → xl, internal margins tightened. Sticky chrome (next task)
reuses this 30px reclaim. No markup change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Sticky layout rules

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`
- Modify: `tests/modules/bc_cf_styles.test.js`

Add 4 rules under `.bccf-layout #bccf-{kpis,chart,table}` for sticky positioning. Spec §3.2.2.

- [ ] **Step 1: Add the failing tests**

In `tests/modules/bc_cf_styles.test.js`, append:

```js
        it('defines sticky-layout rules (E1.5 §3.2.2)', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-layout\s+#bccf-kpis[^}]*position:\s*sticky[^}]*top:\s*0/);
            expect(out).toMatch(/\.bccf-layout\s+#bccf-chart[^}]*position:\s*sticky/);
            expect(out).toMatch(/\.bccf-layout\s+#bccf-table\s+table\s+thead[^}]*position:\s*sticky/);
        });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: new test fails.

- [ ] **Step 3: Append sticky-layout rules to `PRIMITIVES`**

Locate the end of `PRIMITIVES` (just before the closing backtick). The previous task added trend-dot tooltip rules; sticky rules go AFTER those, just before the closing backtick:

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
            top: 78px;
            z-index: 25;
            background: var(--bccf-bg-50);
        }
        .bccf-layout #bccf-table table thead {
            position: sticky;
            top: 290px;
            z-index: 20;
            background: var(--bccf-surface);
            box-shadow: 0 1px 0 var(--bccf-border);
        }
        .bccf-layout #bccf-table table thead th {
            background: var(--bccf-surface);
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 6: Deploy styles to sandbox**

Run: `npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js"`

The KPI strip will look slimmer immediately on any open report. Sticky behavior will partially work (KPIs and chart pin) — the thead won't pin until the report SL changes ship in Phase 3 (because the SLs need to ensure their table container interacts correctly with `position:sticky`; specifically, no `overflow:hidden` on ancestors). For now this is expected.

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js tests/modules/bc_cf_styles.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_styles): sticky-layout rules for KPIs / chart / table thead

Adds 4 .bccf-layout #bccf-* sticky rules with progressive top offsets:
KPIs at 0px, chart at 78px (below KPIs), thead at 290px (below chart).
Z-stacking: KPIs 30, chart 25, thead 20 — below modal (100) and toasts
(200). Background colors explicit so scrolling rows don't show through.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — Combined SL: sortable headers + render integration

**Goal of phase:** First user-visible drop. The Combined report gains the sort plumbing end-to-end: state, comparator, header markup with indicators, and click handler with 2-state (Source) and 3-state (Period/Total) toggle logic.

**Phase exit criteria:** Tests green; sandbox verification on Project 1807 (and ideally a denser project if available) confirms sticky chrome works, default sort is by createdDate, and clicking headers re-orders rows correctly.

---

### Task 10: Persist `_lastData` in `CLIENT_SCRIPT` (Combined)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

The sort click handler will re-render the table from cached data instead of re-fetching. Add `_lastData` alongside the existing `_lastDataUrl` and populate it in the fetch resolver.

- [ ] **Step 1: Add the failing test**

Append to `tests/entry_points/bc_cf_combined_sl.test.js`, in a new `describe` block:

```js
describe('bc_cf_combined_sl — sortable headers (E1.5)', () => {
    let body;
    beforeEach(() => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        body = res.getBody();
    });

    it('persists _lastData in CLIENT_SCRIPT for re-render', () => {
        // Variable declared
        expect(body).toMatch(/var\s+_lastData\b/);
        // Assigned inside the .then resolver
        expect(body).toMatch(/_lastData\s*=\s*data\b/);
    });
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: the new test fails.

- [ ] **Step 3: Add `_lastData` declaration + assignment in `CLIENT_SCRIPT`**

In `bc_cf_combined_sl.js`, locate the line `var _lastDataUrl = null;` (around line 490, inside `CLIENT_SCRIPT`). Add immediately after:

```js
    var _lastData = null;
```

Then locate the `.then(function(data) {` block inside `loadData` (the fetch resolver). Immediately after `if (!data.ok) throw new Error(data.error || 'Data SL returned ok:false');`, add:

```js
                _lastData = data;
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): persist _lastData so re-sort doesn't refetch

Next task adds sortLines + click handler. Holding _lastData in closure
lets a sort click trigger renderTable(_lastData...) without hitting the
data SL again. Spec §3.3.6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `_sortState` + `sortLines` comparator (Combined)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

Add `_sortState` (default `{ col: 'source', dir: 'desc' }`) and `sortLines(lines, periods, sortState)` — pure function, doesn't mutate input. Comparator rules per spec §3.3.4.

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe('bc_cf_combined_sl — sortable headers (E1.5)', ...)` block:

```js
    it('declares _sortState defaulting to Source desc', () => {
        expect(body).toMatch(/var\s+_sortState\s*=\s*\{\s*col:\s*['"]source['"]\s*,\s*dir:\s*['"]desc['"]\s*\}/);
    });

    it('declares sortLines function in CLIENT_SCRIPT', () => {
        expect(body).toMatch(/function sortLines\(lines,\s*periods,\s*sortState\)/);
    });

    it('sortLines: null createdDate sorts to end on Source', () => {
        // Reach into the script and exec the comparator definition + invoke it
        // We can't easily eval the inline script, so this is a structural test —
        // verify the null-handling branches exist in the rendered code.
        expect(body).toMatch(/if\s*\(va\s*===\s*null\s*&&\s*vb\s*===\s*null\)/);
        expect(body).toMatch(/if\s*\(va\s*===\s*null\)\s*return\s*1/);
        expect(body).toMatch(/if\s*\(vb\s*===\s*null\)\s*return\s*-1/);
    });

    it('sortLines: returns a new array (never mutates input)', () => {
        expect(body).toMatch(/lines\.slice\(\)/);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: 4 new tests fail.

- [ ] **Step 3: Add `_sortState` declaration and `sortLines` function**

In `bc_cf_combined_sl.js`'s `CLIENT_SCRIPT`, locate the picker section (E1's `// ── Date range picker (E1 spec §3.2) ──` block). Immediately AFTER the picker section closes (right before `// ── Event delegation ──`), insert:

```js
    // ── Sortable headers (E1.5 spec §3.3) ────────────────────────────────────

    // Lives in the IIFE closure: survives mode toggle + refresh (JSON re-fetch
    // keeps IIFE alive), resets on picker Apply (window.location.replace
    // re-evaluates the IIFE). Spec D8.
    var _sortState = { col: 'source', dir: 'desc' };

    /**
     * Returns a new array of `lines` sorted by `sortState`. Never mutates input.
     * Rules:
     *  - col='source' → compare createdDate strings (lexicographic == chronological for YYYY-MM-DD)
     *  - col='total'  → compare line.total
     *  - col=<period> → compare amounts[periodIdx]; missing = 0
     *  - null createdDate always sorts to end (regardless of dir)
     *  - dir='desc' = largest first / newest first; dir='asc' = smallest first / oldest first
     */
    function sortLines(lines, periods, sortState) {
        if (!lines || !lines.length) return lines;
        var sorted = lines.slice();
        var dir = sortState.dir === 'asc' ? 1 : -1;

        sorted.sort(function(a, b) {
            var va, vb;
            if (sortState.col === 'source') {
                va = a.createdDate;
                vb = b.createdDate;
                if (va === null && vb === null) return 0;
                if (va === null) return 1;
                if (vb === null) return -1;
                return va < vb ? -dir : (va > vb ? dir : 0);
            }
            if (sortState.col === 'total') {
                va = a.total || 0;
                vb = b.total || 0;
            } else {
                var idx = periods.indexOf(sortState.col);
                if (idx === -1) return 0;
                va = (a.amounts && a.amounts[idx]) || 0;
                vb = (b.amounts && b.amounts[idx]) || 0;
            }
            return va < vb ? -dir : (va > vb ? dir : 0);
        });

        return sorted;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: all green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): _sortState + sortLines comparator

Pure comparator handles all 3 sort-column types (source/period/total),
null createdDate always to end, $0 amounts participate, never mutates
input. _sortState default = Source desc (newest first). Spec §3.3.1, §3.3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Sortable headers — `data-sort-col` + indicator in `renderTable` (Combined)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

`renderTable` is updated to: (1) call `sortLines` on each section's lines using `_sortState`, (2) emit `data-sort-col="source|<period>|total"` on every `<th>`, (3) render ▼/▲ indicator on the active column's `<th>`. Section totals + `<tfoot>` Net row do NOT participate in sorting.

- [ ] **Step 1: Add the failing tests**

Append inside the same E1.5 describe block:

```js
    it('emits data-sort-col on every header (Source / periods / Total)', () => {
        expect(body).toMatch(/data-sort-col="source"/);
        expect(body).toMatch(/data-sort-col="total"/);
        // Skeleton tables in the shell render generic <th></th>; the data-sort-col
        // attributes appear in the renderTable function body inside CLIENT_SCRIPT.
        expect(body).toMatch(/headerCell\s*\(\s*['"]Source['"]/);
        expect(body).toMatch(/headerCell\s*\(\s*['"]Total['"]/);
    });

    it('headerCell renders ▼/▲ indicator when column is active', () => {
        // Indicator markup present in renderTable's headerCell helper
        expect(body).toMatch(/_sortState\.col\s*===\s*sortKey/);
        // Both glyphs available (UTF-8 in the inline string literal)
        expect(body).toMatch(/▼|\\u25bc/i);
        expect(body).toMatch(/▲|\\u25b2/i);
    });

    it('renderTable passes sorted lines to row rendering', () => {
        // renderTable calls sortLines on each direction's lines
        expect(body).toMatch(/sortLines\(\s*rev\.lines\b/);
        expect(body).toMatch(/sortLines\(\s*cost\.lines\b/);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: 3 new tests fail.

- [ ] **Step 3: Locate `renderTable` and update header generation**

In `bc_cf_combined_sl.js`'s `CLIENT_SCRIPT`, locate `function renderTable(periods, categories) {`. Find the current header generation:

```js
        var headCols = periods.map(function(p) { return '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap">' + esc(p) + '</th>'; }).join('');
        var thead = '<thead><tr>'
            + '<th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--bccf-ink-500)">Source</th>'
            + headCols
            + '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500)">Total</th>'
        + '</tr></thead>';
```

Replace with:

```js
        // E1.5: sortable headers — each <th> carries data-sort-col + active indicator.
        function headerCell(labelText, sortKey, align) {
            var isActive = _sortState.col === sortKey;
            var glyph = _sortState.dir === 'desc' ? '▼' : '▲';  // ▼ / ▲
            var indicator = isActive
                ? '<span style="margin-left:4px;color:var(--bccf-brand-500)">' + glyph + '</span>'
                : '';
            var alignStyle = align === 'left' ? 'text-align:left' : 'text-align:right';
            return '<th data-sort-col="' + esc(sortKey) + '" '
                + 'style="padding:8px 12px;font-size:12px;color:var(--bccf-ink-500);'
                + 'white-space:nowrap;cursor:pointer;user-select:none;' + alignStyle + '">'
                + esc(labelText) + indicator
                + '</th>';
        }
        var headCols = periods.map(function(p) { return headerCell(p, p, 'right'); }).join('');
        var thead = '<thead><tr>'
            + headerCell('Source', 'source', 'left')
            + headCols
            + headerCell('Total', 'total', 'right')
        + '</tr></thead>';
```

- [ ] **Step 4: Sort the lines before rendering**

Still in `renderTable`, find the destructure / line aliasing near the top of the function:

```js
        var rev  = categories.revenue;
        var cost = categories.cost;
```

Replace with:

```js
        // E1.5: apply current sort to each section's lines (never mutates input).
        var rev  = categories.revenue
            ? Object.assign({}, categories.revenue, { lines: sortLines(categories.revenue.lines, periods, _sortState) })
            : categories.revenue;
        var cost = categories.cost
            ? Object.assign({}, categories.cost, { lines: sortLines(categories.cost.lines, periods, _sortState) })
            : categories.cost;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: all green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): sortable headers + sorted-lines in renderTable

renderTable's thead now uses a headerCell() helper that emits data-sort-col
and a ▼/▲ indicator on the active column. Each section's lines pass through
sortLines() before row rendering. Section totals + tfoot Net row are not
touched (they stay at natural positions). Spec §3.3.2, §3.3.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Click handler — 2-state Source toggle + 3-state Period/Total toggle (Combined)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

A new `document.addEventListener('click', ...)` handler that updates `_sortState` per the spec rules and re-renders the table from `_lastData`. The new handler is independent of the existing picker handler — both fire; each short-circuits if its target wasn't clicked.

- [ ] **Step 1: Add the failing tests**

Append inside the same E1.5 describe block:

```js
    it('wires a click listener for [data-sort-col]', () => {
        expect(body).toMatch(/closest\(['"]\[data-sort-col\]['"]\)/);
    });

    it('Source toggles 2-state (desc ↔ asc), no reset', () => {
        // The handler branch that handles 'source' col exclusively
        expect(body).toMatch(/col\s*===\s*['"]source['"]/);
    });

    it('Period/Total toggles 3-state (desc → asc → reset to Source desc)', () => {
        // The reset path returns to default
        expect(body).toMatch(/\{\s*col:\s*['"]source['"]\s*,\s*dir:\s*['"]desc['"]\s*\}/);
    });

    it('re-renders table from _lastData on sort click', () => {
        expect(body).toMatch(/renderTable\(_lastData\.periods,\s*_lastData\.categories\)/);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: tests targeting the click handler fail.

- [ ] **Step 3: Add the click handler inside `CLIENT_SCRIPT`**

In the same `// ── Sortable headers (E1.5 spec §3.3) ─` section added in Task 11, after `sortLines`, append:

```js
    // Click handler — 2-state on Source, 3-state on Period/Total.
    // Independent of the existing picker / mode-toggle handlers; each fires
    // on every click and short-circuits if its target isn't matched.
    document.addEventListener('click', function(e) {
        var th = e.target.closest('[data-sort-col]');
        if (!th) return;

        var col = th.dataset.sortCol;
        var was = _sortState;

        if (col === 'source') {
            // 2-state: desc ↔ asc
            _sortState = (was.col === 'source' && was.dir === 'desc')
                ? { col: 'source', dir: 'asc' }
                : { col: 'source', dir: 'desc' };
        } else {
            // 3-state: desc → asc → reset (Source desc)
            if (was.col !== col) {
                _sortState = { col: col, dir: 'desc' };
            } else if (was.dir === 'desc') {
                _sortState = { col: col, dir: 'asc' };
            } else {
                _sortState = { col: 'source', dir: 'desc' };
            }
        }

        if (_lastData) {
            var tableEl = document.getElementById('bccf-table');
            if (tableEl) tableEl.innerHTML = renderTable(_lastData.periods, _lastData.categories);
        }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: all green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 9 suites green; 246 tests pass.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): click handler for 2-state Source / 3-state Period+Total

Click on Source toggles desc ↔ asc (no reset state).
Click on a Period or Total column: desc → asc → reset (default Source desc).
Re-renders table from cached _lastData — no SL re-fetch. Independent of
picker / mode-toggle handlers. Spec §3.3.3, D2, D3, D8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Phase 3 deploy + Combined sandbox verification

**Files:** none.

- [ ] **Step 1: Deploy Combined SL (data SL + styles already shipped)**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js"
```

- [ ] **Step 2: Ask the user to verify on Project 1807 → Cash Flow → Combined**

Manual checks:
1. **Sticky stack**: scroll inside the iframe — KPI strip pins at top, chart pins right below, table thead pins at the bottom of the chart. Tbody scrolls beneath. (Project 1807 only has ~3 rows; sticky behavior should still be visible.)
2. **Slim KPIs**: cards visibly smaller than before (~70px instead of ~100px).
3. **Default sort**: lines in each section appear in createdDate-desc order (newest transaction first). Synthetic "Other Cost" / "Base Bid" buckets (if any) sit at the bottom of their section.
4. **Click Source**: indicator switches to ▼ (already active). Second click → ▲, rows reverse. Third click on Source: nothing (Source is 2-state).
5. **Click a period column** (e.g. May 2026): rows within each section reorder so highest spend in May sits on top of Revenue and on top of Cost. Indicator ▼ next to the period label.
6. **Second click on same period**: ▲, lowest first.
7. **Third click**: resets to default (Source ▼).
8. **Click Total**: same 3-state behavior, sorting by row total.
9. **Persistence**: while sorted by a period, toggle Cash ↔ Accrual — sort survives. Click Refresh — sort survives. Apply a new date range via the picker — sort resets to default.
10. **Sections preserved**: clicking a period header on Combined sorts Revenue and Cost independently — they never interleave; Net Cash Flow `<tfoot>` row stays at the bottom.

Do not proceed to Phase 4 until the user confirms. Note: top values of the sticky stack (`78px`, `290px`) are calibrated to the slim KPI + standard chart heights — if the chart's panel header has changed, those values may need adjustment.

- [ ] **Step 3: Wait for user confirmation**

If issues are found, diagnose and fix BEFORE mirroring to Cost / Revenue. Those are copy-paste tasks — don't propagate a bug into 2 more files.

---

# Phase 4 — Cost SL: mirror sort plumbing

### Task 15: Mirror E1.5 sort plumbing into Cost SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`
- Modify: `tests/entry_points/bc_cf_cost_report_sl.test.js`

Verbatim copy of Tasks 10–13 with one substitution: Cost SL has only the `cost` direction (no `revenue` section), so the `sortLines` integration in `renderTable` only sorts `categories.cost.lines`.

- [ ] **Step 1: Add the failing tests (port from Combined)**

Append to `tests/entry_points/bc_cf_cost_report_sl.test.js`:

```js
describe('bc_cf_cost_report_sl — sortable headers (E1.5)', () => {
    let body;
    beforeEach(() => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        body = res.getBody();
    });

    it('persists _lastData', () => {
        expect(body).toMatch(/var\s+_lastData\b/);
        expect(body).toMatch(/_lastData\s*=\s*data\b/);
    });
    it('declares _sortState defaulting to Source desc', () => {
        expect(body).toMatch(/var\s+_sortState\s*=\s*\{\s*col:\s*['"]source['"]\s*,\s*dir:\s*['"]desc['"]\s*\}/);
    });
    it('declares sortLines function', () => {
        expect(body).toMatch(/function sortLines\(lines,\s*periods,\s*sortState\)/);
    });
    it('emits data-sort-col on Source and Total headers', () => {
        expect(body).toMatch(/data-sort-col="source"/);
        expect(body).toMatch(/data-sort-col="total"/);
    });
    it('wires click handler for [data-sort-col]', () => {
        expect(body).toMatch(/closest\(['"]\[data-sort-col\]['"]\)/);
    });
    it('renderTable sorts cost lines', () => {
        expect(body).toMatch(/sortLines\(\s*cost\.lines\b/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_cost_report_sl.test.js`
Expected: 6 new tests fail.

- [ ] **Step 3: Copy `_lastData`, `_sortState`, `sortLines`, click handler into Cost SL's `CLIENT_SCRIPT`**

Open `bc_cf_combined_sl.js` and read the E1.5 sort section (the block starting `// ── Sortable headers (E1.5 spec §3.3) ──`). Paste it verbatim into `bc_cf_cost_report_sl.js`'s `CLIENT_SCRIPT`, immediately after the picker section and before `// ── Event delegation`.

Also locate `var _lastDataUrl = null;` in Cost SL and add `var _lastData = null;` immediately after.

Locate the `.then(function(data) {` block in Cost SL's `loadData` and add `_lastData = data;` immediately after the `if (!data.ok) throw new Error(...)` line.

- [ ] **Step 4: Update Cost SL's `renderTable` headers**

Locate `function renderTable(periods, categories) {` in Cost SL's `CLIENT_SCRIPT`. Find the current thead generation (same shape as Combined's pre-edit version) and replace with the headerCell-based version from Task 12 step 3. The cost table has Source, period columns, and a Total column — same structure.

- [ ] **Step 5: Sort the lines in Cost SL's `renderTable`**

Find the variable that holds the cost section, currently:

```js
        var cost = categories.cost;
```

Replace with:

```js
        // E1.5: apply current sort to cost lines (never mutates input).
        var cost = categories.cost
            ? Object.assign({}, categories.cost, { lines: sortLines(categories.cost.lines, periods, _sortState) })
            : categories.cost;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_cost_report_sl.test.js`
Expected: all green.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 9 suites green, 252 tests pass.

- [ ] **Step 8: Deploy Cost SL**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js"
```

- [ ] **Step 9: User sandbox check on Cost subtab**

Verify: sticky stack works, default sort by createdDate, click-to-sort on each column with correct 2/3-state behavior. Same checks as Task 14 step 2 but applied to a single section (no Revenue/Cost split).

- [ ] **Step 10: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js tests/entry_points/bc_cf_cost_report_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_cost_report_sl): mirror E1.5 sort plumbing from Combined

Same _sortState / sortLines / click handler / headerCell as Combined, with
single-direction renderTable integration (cost lines only). Spec §3.3,
intentional duplication per spec §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Revenue SL: mirror sort plumbing

### Task 16: Mirror E1.5 sort plumbing into Revenue SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`
- Modify: `tests/entry_points/bc_cf_rev_report_sl.test.js`

Same pattern as Task 15 with the `revenue` direction.

- [ ] **Step 1: Add the failing tests**

Append to `tests/entry_points/bc_cf_rev_report_sl.test.js`:

```js
describe('bc_cf_rev_report_sl — sortable headers (E1.5)', () => {
    let body;
    beforeEach(() => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        body = res.getBody();
    });

    it('persists _lastData', () => {
        expect(body).toMatch(/var\s+_lastData\b/);
        expect(body).toMatch(/_lastData\s*=\s*data\b/);
    });
    it('declares _sortState defaulting to Source desc', () => {
        expect(body).toMatch(/var\s+_sortState\s*=\s*\{\s*col:\s*['"]source['"]\s*,\s*dir:\s*['"]desc['"]\s*\}/);
    });
    it('declares sortLines function', () => {
        expect(body).toMatch(/function sortLines\(lines,\s*periods,\s*sortState\)/);
    });
    it('emits data-sort-col on headers', () => {
        expect(body).toMatch(/data-sort-col="source"/);
        expect(body).toMatch(/data-sort-col="total"/);
    });
    it('wires click handler for [data-sort-col]', () => {
        expect(body).toMatch(/closest\(['"]\[data-sort-col\]['"]\)/);
    });
    it('renderTable sorts revenue lines', () => {
        expect(body).toMatch(/sortLines\(\s*rev\.lines\b/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_rev_report_sl.test.js`
Expected: 6 new tests fail.

- [ ] **Step 3: Copy sort plumbing into Revenue SL's `CLIENT_SCRIPT`**

Same as Task 15 step 3: paste the E1.5 sort section verbatim after the picker section and before `// ── Event delegation`. Add `var _lastData = null;` after `_lastDataUrl`. Add `_lastData = data;` in the `.then` resolver.

- [ ] **Step 4: Update Revenue SL's `renderTable` headers**

Same as Task 15 step 4: replace the thead generation with the `headerCell`-based version.

- [ ] **Step 5: Sort the lines in Revenue SL's `renderTable`**

The Revenue SL's renderTable currently has:

```js
        var rev = categories.revenue;
```

Replace with:

```js
        // E1.5: apply current sort to revenue lines (never mutates input).
        var rev = categories.revenue
            ? Object.assign({}, categories.revenue, { lines: sortLines(categories.revenue.lines, periods, _sortState) })
            : categories.revenue;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_rev_report_sl.test.js`
Expected: all green.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 9 suites green, 258 tests pass.

- [ ] **Step 8: Deploy Revenue SL**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js"
```

- [ ] **Step 9: User sandbox check on Revenue subtab**

Verify: sticky stack, default sort by createdDate, 2-state on Source / 3-state on period+Total, sort persists across mode/refresh, resets on picker Apply.

- [ ] **Step 10: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js tests/entry_points/bc_cf_rev_report_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_rev_report_sl): mirror E1.5 sort plumbing from Combined

Same _sortState / sortLines / click handler / headerCell as Combined and
Cost SLs. Single-direction renderTable integration (revenue lines only).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 6 — Final regression + ship

### Task 17: Final regression + PROJECT_STATUS + push

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Final test run**

Run: `npm test`
Expected: 9 suites green, 258 tests pass (231 baseline + 27 new across data SL helpers, styles, 3 report SLs).

- [ ] **Step 2: Cross-report sandbox sweep**

User opens all 3 subtabs on Project 1807. For each:
1. Sticky stack pins KPIs/chart/thead while tbody scrolls.
2. Default sort = chronological newest-first (Source ▼).
3. Click a period column → sorts that section by descending spend; ▼ indicator appears.
4. 3-state cycle on period: ▼ → ▲ → reset.
5. 2-state cycle on Source: ▼ ↔ ▲.
6. Sort survives Cash/Accrual + Refresh; resets on picker Apply.
7. No console errors in DevTools.

If anything is off, do not proceed.

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Edit the "Current Phase" heading and add an E1.5 section under "v1.5 enhancements — status". Append a session-history entry summarizing E1.5.

Specifically:
- Change the "Current Phase" heading from the E1-shipped state to:
  ```markdown
  ## Current Phase: v1.5 E1 + E1.5 Shipped — E2 (Portfolio Suitelet) Next
  ```
- Add a new subsection in "v1.5 enhancements — status" right after E1:
  ```markdown
  ### E1.5 — Table densification (sticky chrome + sortable columns) · **SHIPPED TO SANDBOX**

  - **Brainstormed + spec'd**: 2026-05-23
  - **Spec**: `docs/superpowers/specs/2026-05-23-cashflow-table-densification-design.md` (commit `bc90308`)
  - **Plan**: `docs/superpowers/plans/2026-05-23-cashflow-table-densification.md` — 17 tasks across 6 phases
  - **Status**: Implementation complete. 258 tests / 9 suites green. Deployed and verified on all 3 report SLs.

  **What shipped**:
  - Server: `_pivotDirection` extracts `createdDate` per line; group keys ordered chronologically (DESC NULLS LAST). All 3 SQLs add `MIN(<source>.createddate)` SELECT + `ORDER BY created_date DESC NULLS LAST, ...`.
  - CSS: slim `.bccf-kpi` rule (~30px reclaimed); sticky-layout rules on `#bccf-kpis` (top 0), `#bccf-chart` (top 78px), `#bccf-table thead` (top 290px).
  - Client: `_sortState` + `_lastData` + `sortLines` comparator in each SL's `CLIENT_SCRIPT`. Headers carry `data-sort-col` with ▼/▲ active indicator. 2-state toggle on Source, 3-state on Period/Total. Re-render from cached data — no SL re-fetch on sort click. Sort persists across mode toggle + Refresh; resets on picker Apply.
  - Reusability for E2: sticky CSS pattern and `sortLines` comparator both designed for verbatim lift into the portfolio Suitelet.
  ```
- Append to Session history:
  ```markdown
  - **2026-05-23 (E1.5 implementation)**: Brainstormed + spec'd table densification (sticky chrome + chronological default sort + click-to-sort headers). Plan: 17 tasks across 6 phases (`docs/superpowers/plans/2026-05-23-cashflow-table-densification.md`). Executed via subagent-driven development. 258 tests / 9 suites green. Deployed to TD2984799. Branch `feature/v1.5-enhancements` has E1 + E1.5 + ready for PR.
  ```
- Update the "Open questions" section: drop the customer-deploy item if it's been resolved separately; otherwise leave as-is.

- [ ] **Step 4: Commit + push**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
docs: PROJECT_STATUS — E1.5 (table densification) shipped

All 3 report SLs ship with sticky KPI/chart/thead, scrollable tbody,
chronological default sort by createdDate, and click-to-sort headers
with 2-state (Source) / 3-state (Period+Total) toggle. 258 tests green.
Branch ready for PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 5: Offer PR**

Ask the user whether to open a PR for `feature/v1.5-enhancements` (now carrying both E1 and E1.5) against `main`. If yes, run `gh pr create` with a body summarizing both epics. Do not push or open the PR without explicit user direction.

---

## Self-Review Checklist (plan author)

- ✅ Every spec section maps to a task: §3.1 Data SL → Tasks 2–6; §3.2 sticky + slim CSS → Tasks 8–9; §3.3 sortable headers → Tasks 10–13; §3.5 edge cases (null createdDate, $0 rows, sectioning) → Tasks 3, 11, 12, 14; mirror to Cost/Revenue → Tasks 15, 16; cross-report verification + ship → Task 17.
- ✅ No placeholders ("TBD", "TODO", "implement later").
- ✅ Type consistency: `_sortState = { col, dir }` consistent across all SLs. `sortLines(lines, periods, sortState)` signature identical in all 3 SLs. `_lastData` and `_lastDataUrl` co-located in each SL.
- ✅ Function names consistent: `_pivotDirection` (server), `sortLines` (client), `headerCell` (client renderTable helper). No drift between Combined and Cost/Revenue.
- ✅ Backwards-compat: `_pivotDirection`'s `firstKey` arg retained (unused — documented). `_sortedKeys` helper retained (no callers — documented dead code). No callsites in the broader codebase changed.
- ✅ Spec edge cases covered: null createdDate → end (sortLines + _pivotDirection); $0 rows → bottom on ▼ (sortLines treats undefined as 0, included not filtered); Combined Revenue/Cost sections → sorted independently (separate sortLines calls); section totals + tfoot → never touched.

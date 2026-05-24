# BC Cash Flow — E2 — Portfolio Cash Flow Suitelet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Portfolio Cash Flow Suitelet that rolls all BC projects into one cash-flow view with header KPIs aggregated over a filtered + dated subset, an aggregated chart (paired Revenue/Cost bars + cumulative net trend), and a scrollable table with one row per project showing NET per period — all gated by a 5-dimension Filters pill (Status / Project / PM / Customer / Subsidiary), reusing every E1+E1.5 piece verbatim.

**Architecture:** New shell SL `bc_cf_portfolio_sl` that follows the existing 3-report-SL pattern (skeleton HTML + inline `CLIENT_SCRIPT` IIFE). New `?action=portfolio` route on `bc_cf_data_sl` joining `customrecord_cseg_bc_project` to the revenue + cost timing-line tables (UNION ALL, like `COMBINED_SQL`), grouped by project + period. Filters pill component is modeled on E1's date-range pill — a trigger button that opens a dropdown panel with all 5 filter controls (status segmented control + 4 multi-select chip pickers).

**Tech Stack:** SuiteScript 2.1 AMD (`@NApiVersion 2.1`), hand-rolled vanilla JS + CSS inlined in template literals, Jest + `@oracle/suitecloud-unit-testing` for tests, SuiteCloud SDF for deploy.

**Spec:** `docs/superpowers/specs/2026-05-24-cashflow-portfolio-suitelet-design.md` (commit `0bed155`).

**Deploy cadence:** Each phase ends in a green test run + a deployable commit. Phase 2 (data SL) deploys are invisible until a client uses the new route. Phase 4 (shell SL scaffold) is the first deployable user-facing milestone. Manual sandbox checkpoints at Task 8 (data SL contract complete), Task 12 (shell SL renders with no fetched data), Task 16 (full E2 verified end-to-end).

---

## File Structure

### New files

| File | Purpose |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js` | Shell SL — server-rendered HTML skeleton + inline `CLIENT_SCRIPT` IIFE. ~1000 lines (matches per-project SL scale). |
| `Objects/scripts/customscript_bc_cf_portfolio_sl.xml` | SDF Suitelet script object + deployment record (single file, scriptdeployment nested inside per repo convention). |
| `tests/entry_points/bc_cf_portfolio_sl.test.js` | Smoke tests for shell SL — region anchors, picker HTML, sort plumbing, filter dropdowns, data-data-url stamping. |

### Modified files

| File | Change |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` | Add `BC_PROJECT_FIELDS` constants block. Add 4 `AVAILABLE_*` + `PORTFOLIO_*` SQL constants. Add `_loadPortfolio(mode, range, filters)` loader. Add filter param parsing in `onRequest`. Add `'portfolio'` to action dispatch. Export `_loadPortfolio` on `api`. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` | Append `.bccf-filters*` CSS primitives (modeled on `.bccf-daterange*`). |
| `tests/entry_points/bc_cf_data_sl.test.js` | New `describe` blocks: `_loadPortfolio` shape via mock; filter param validation; status whitelist; ID-CSV regex. |
| `tests/modules/bc_cf_styles.test.js` | Assert new `.bccf-filters*` selectors present. |

### Not in scope for this plan

`PROJECT_STATUS.md` update happens in the final task. SDF account customization beyond the new script/deployment is not needed.

---

# Phase 1 — Discovery + scaffold

**Goal of phase:** Capture the NetSuite-specific identifiers (BC Project field IDs, status list values, Cash Flow subtab ID if pursued) that the implementation depends on, and lay down the SDF Suitelet record so deploys work.

**Phase exit criteria:** Constants documented in code; SDF script + deployment XML validate via `npm run validate`.

---

### Task 1: Baseline snapshot

**Files:** none modified.

- [ ] **Step 1: Confirm branch + clean tree**

Run: `git status && git branch --show-current`
Expected: branch `feature/v1.5-e2-portfolio`, clean tree.

- [ ] **Step 2: Run the suite to confirm green baseline**

Run: `npm test`
Expected: 9 suites pass, 267 tests pass.

- [ ] **Step 3: Note current data SL + styles line counts**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`
Expected: ~837 + ~243 lines.

---

### Task 2: Discover BC Project record field IDs

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`

This is a one-time NetSuite-UI lookup task. Add a constants block at the top of `bc_cf_data_sl.js` documenting the BC Project record's field IDs that subsequent tasks reference. Without this, the SQL constants in Tasks 3 and 4 would have placeholder field names.

- [ ] **Step 1: Look up the BC Project record's fields in NetSuite UI**

In NetSuite (TD2984799 sandbox):
- Go to Customization → Lists, Records, & Fields → Record Types
- Search for the record with scriptid `customrecord_cseg_bc_project` (this is the BC Project custom-segment record)
- Open the record; go to the Fields tab
- Note the **internal IDs / scriptids** for these business fields. Most are `custrecord_*` prefixed. Common candidates per the BC SuiteApp's naming:
  - **Name** — usually the record's built-in `name` field (no custrecord prefix)
  - **Status** — a List/Record field referencing a status list (e.g., `custrecord_bc_project_status`)
  - **Customer** — a List/Record field referencing the customer record
  - **Project Manager** — a List/Record field referencing the employee record
  - **Subsidiary** — could be a custom field OR the record's built-in `subsidiary` field if subsidiary is enabled on the record type

If the exact field IDs aren't obvious from the field names, click each field and check its "ID" column. Capture these as plain strings.

Also look up the **status list values**:
- The status field's "Source List" or "Source Record" property points to a custom list (or the field's own values).
- Open that list; note the internal IDs (numeric) for the status values Active, On Hold, Closed.

- [ ] **Step 2: Add the constants block to `bc_cf_data_sl.js`**

At the top of `bc_cf_data_sl.js`, immediately after the `const MODULE = 'bc_cf_data_sl';` line (around line 14), add a new constants block. Use the **actual field IDs you captured in Step 1** to fill in the values:

```js
    // ── BC Project record metadata (looked up 2026-05-24 from NS sandbox) ─────
    // Update these if the BC SuiteApp's field IDs change.
    const BC_PROJECT = {
        rectype:        'customrecord_cseg_bc_project',
        fields: {
            name:        'name',                                // built-in
            status:      'custrecord_<status_field_id>',        // ← fill in from Step 1
            customer:    'custrecord_<customer_field_id>',      // ← fill in
            manager:     'custrecord_<manager_field_id>',       // ← fill in
            subsidiary:  'custrecord_<subsidiary_field_id>',    // ← fill in
            created:     'created'                              // built-in system field
        },
        // BC project status list-value internal IDs (sandbox-specific).
        // The filter SL accepts status=active|hold|closed|all; this maps the
        // friendly names to the actual NS list-value IDs in SQL params.
        statusValues: {
            active: <id>,    // ← fill in from Step 1
            hold:   <id>,    // ← fill in from Step 1
            closed: <id>     // ← fill in from Step 1
        }
    };
```

Replace each `<...>` placeholder with the actual value from your NS UI lookup. If a field doesn't exist on the BC Project record (e.g., no subsidiary custom field, just the built-in), use the built-in name.

If `customrecord_cseg_bc_project` doesn't have a subsidiary field at all (because subsidiary is implicit via the linked customer), set `subsidiary: null` and add a comment noting that the subsidiary filter joins through the customer record instead. Subsequent tasks will reference this constant; the join strategy can adjust.

- [ ] **Step 3: Add `BC_PROJECT` to the `api` export for tests**

Update the existing `const api = { ... };` block at the bottom of the file to include `BC_PROJECT`:

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange,
        _pivotDirection,
        BC_PROJECT
    };
```

- [ ] **Step 4: Add the test**

Append to `tests/entry_points/bc_cf_data_sl.test.js`:

```js
describe('bc_cf_data_sl BC_PROJECT constants', () => {
    it('exports BC_PROJECT metadata on api', () => {
        expect(Suitelet.BC_PROJECT).toBeDefined();
        expect(Suitelet.BC_PROJECT.rectype).toBe('customrecord_cseg_bc_project');
        expect(typeof Suitelet.BC_PROJECT.fields.name).toBe('string');
        expect(typeof Suitelet.BC_PROJECT.fields.status).toBe('string');
        expect(typeof Suitelet.BC_PROJECT.statusValues.active).toBe('number');
    });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 268 tests / 9 suites pass.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): add BC_PROJECT field metadata constants

Captures the BC Project custom-segment record's field IDs + status list
values so subsequent E2 tasks reference named constants instead of magic
strings. Looked up 2026-05-24 from TD2984799 sandbox; needs an update if
the BC SuiteApp's field IDs change in a future SuiteApp release.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SDF script + deployment for `bc_cf_portfolio_sl`

**Files:**
- Create: `Objects/scripts/customscript_bc_cf_portfolio_sl.xml`

Adds the SuiteCloud script object so the empty `bc_cf_portfolio_sl.js` (created in Task 9) can deploy. Mirrors the existing `customscript_bc_cf_combined_sl.xml` shape exactly.

- [ ] **Step 1: Create the XML file**

Write `Objects/scripts/customscript_bc_cf_portfolio_sl.xml` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<suitelet scriptid="customscript_bc_cf_portfolio_sl">
  <name>BC Cash Flow - Portfolio</name>
  <scriptfile>[/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js]</scriptfile>
  <description>Portfolio Cash Flow rollup across all BC projects.</description>
  <isinactive>F</isinactive>
  <notifyadmins>F</notifyadmins>
  <notifyemails></notifyemails>
  <notifyowner>F</notifyowner>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_bc_cf_portfolio_sl">
      <title>BC Cash Flow Portfolio - Deploy</title>
      <isdeployed>T</isdeployed>
      <isonline>F</isonline>
      <status>RELEASED</status>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</suitelet>
```

`<isonline>F</isonline>` means Available Without Login = OFF — matches the other report SLs per spec D11. The deployment's center / menu placement (Reports → BlueCollar) is configured AFTER deploy via the NS UI; SDF doesn't manage menu placement.

- [ ] **Step 2: Create a placeholder JS file so SDF can validate**

SDF validation will fail if the `<scriptfile>` reference can't be resolved. Create a minimal placeholder at `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`:

```js
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Portfolio Cash Flow rollup — implementation lands in Tasks 9–15.
 */
define(['N/log'], (log) => {
    const onRequest = (context) => {
        context.response.write('Portfolio Cash Flow — under construction.');
    };
    return { onRequest };
});
```

- [ ] **Step 3: Validate the SDF project**

Run: `npm run validate`
Expected: SuiteCloud validation passes. The new script + deployment objects are now recognized.

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: 268 tests / 9 suites pass. The new JS file has no test coverage yet; that arrives in Task 9.

- [ ] **Step 5: Commit**

```bash
git add Objects/scripts/customscript_bc_cf_portfolio_sl.xml FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js
git commit -m "$(cat <<'EOF'
scaffold(bc_cf_portfolio_sl): SDF script + deployment + placeholder JS

Creates the SuiteCloud script object so subsequent E2 tasks can deploy
incrementally. Placeholder JS returns "under construction" — replaced
fully in Task 9. Menu placement (Reports → BlueCollar) is configured
post-deploy in the NS UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Data SL: portfolio action

**Goal of phase:** The `bc_cf_data_sl` learns a new `?action=portfolio` route that returns per-project per-period revenue + cost, filtered by 5 dimensions, with all the auxiliary aggregates (bounds, totals, cum-before, option lists) needed by the shell SL.

**Phase exit criteria:** All Phase 2 tests green; data SL deploys; manual hit of `?action=portfolio&projectId=ignored` returns the expected envelope.

---

### Task 4: Available-* option-list SQL + helpers

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Adds 4 SuiteQL constants that return the option lists for the Filters pill multi-selects: projects, project managers, customers, subsidiaries. Each list is "things that appear on at least one BC project that has at least one timing line" — so empty / never-used filter dimensions don't show up.

- [ ] **Step 1: Add the failing test**

Append to `tests/entry_points/bc_cf_data_sl.test.js`:

```js
describe('bc_cf_data_sl portfolio option-list SQL constants', () => {
    it('defines AVAILABLE_PROJECTS_SQL', () => {
        expect(Suitelet.AVAILABLE_PROJECTS_SQL).toBeDefined();
        expect(typeof Suitelet.AVAILABLE_PROJECTS_SQL).toBe('string');
        expect(Suitelet.AVAILABLE_PROJECTS_SQL).toMatch(/customrecord_cseg_bc_project/);
    });
    it('defines AVAILABLE_MANAGERS_SQL', () => {
        expect(Suitelet.AVAILABLE_MANAGERS_SQL).toBeDefined();
        expect(Suitelet.AVAILABLE_MANAGERS_SQL).toMatch(/employee/);
    });
    it('defines AVAILABLE_CUSTOMERS_SQL', () => {
        expect(Suitelet.AVAILABLE_CUSTOMERS_SQL).toBeDefined();
        expect(Suitelet.AVAILABLE_CUSTOMERS_SQL).toMatch(/customer/);
    });
    it('defines AVAILABLE_SUBSIDIARIES_SQL', () => {
        expect(Suitelet.AVAILABLE_SUBSIDIARIES_SQL).toBeDefined();
        expect(Suitelet.AVAILABLE_SUBSIDIARIES_SQL).toMatch(/subsidiary/i);
    });
});
```

- [ ] **Step 2: Add the SQL constants**

In `bc_cf_data_sl.js`, after the existing `REVENUE_LINES_TOTAL_SQL` constant (the last existing SQL constant — search for it), add this block:

```js
    // ── Portfolio (E2) option-list queries ───────────────────────────────────

    /**
     * Projects that appear on at least one revenue or cost timing line.
     * Used to populate the Filters pill's Project multi-select dropdown.
     * Returns id + name, alphabetical.
     */
    const AVAILABLE_PROJECTS_SQL = `
        SELECT DISTINCT p.id AS id, p.${BC_PROJECT.fields.name} AS name
        FROM ${BC_PROJECT.rectype} p
        WHERE EXISTS (
            SELECT 1 FROM customrecord_bc_revenue_timing_line rtl
            WHERE rtl.custrecord_bc_rtl_project = p.id
            UNION
            SELECT 1 FROM customrecord_bc_cost_timing_line ctl
            WHERE ctl.custrecord_bc_ctl_project = p.id
        )
        ORDER BY p.${BC_PROJECT.fields.name}
    `;

    /**
     * Project managers (employees) that appear on at least one BC project
     * with timing data. Returns id + entityid (the displayable name).
     */
    const AVAILABLE_MANAGERS_SQL = `
        SELECT DISTINCT e.id AS id, e.entityid AS name
        FROM employee e
        WHERE e.id IN (
            SELECT DISTINCT p.${BC_PROJECT.fields.manager}
            FROM ${BC_PROJECT.rectype} p
            WHERE p.${BC_PROJECT.fields.manager} IS NOT NULL
        )
        ORDER BY e.entityid
    `;

    /**
     * Customers that appear on at least one BC project with timing data.
     */
    const AVAILABLE_CUSTOMERS_SQL = `
        SELECT DISTINCT c.id AS id, c.entityid AS name
        FROM customer c
        WHERE c.id IN (
            SELECT DISTINCT p.${BC_PROJECT.fields.customer}
            FROM ${BC_PROJECT.rectype} p
            WHERE p.${BC_PROJECT.fields.customer} IS NOT NULL
        )
        ORDER BY c.entityid
    `;

    /**
     * Subsidiaries that appear on at least one BC project with timing data.
     * If BC_PROJECT.fields.subsidiary is null (no direct subsidiary field on
     * the project), this query joins through the customer record instead.
     */
    const AVAILABLE_SUBSIDIARIES_SQL = BC_PROJECT.fields.subsidiary
        ? `
            SELECT DISTINCT s.id AS id, s.name AS name
            FROM subsidiary s
            WHERE s.id IN (
                SELECT DISTINCT p.${BC_PROJECT.fields.subsidiary}
                FROM ${BC_PROJECT.rectype} p
                WHERE p.${BC_PROJECT.fields.subsidiary} IS NOT NULL
            )
            ORDER BY s.name
        `
        : `
            SELECT DISTINCT s.id AS id, s.name AS name
            FROM subsidiary s
            WHERE s.id IN (
                SELECT DISTINCT c.subsidiary
                FROM customer c
                WHERE c.id IN (
                    SELECT DISTINCT p.${BC_PROJECT.fields.customer}
                    FROM ${BC_PROJECT.rectype} p
                    WHERE p.${BC_PROJECT.fields.customer} IS NOT NULL
                )
            )
            ORDER BY s.name
        `;
```

- [ ] **Step 3: Export the constants on `api`**

Update the `const api = { ... };` block to include the 4 new constants:

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange,
        _pivotDirection,
        BC_PROJECT,
        AVAILABLE_PROJECTS_SQL, AVAILABLE_MANAGERS_SQL,
        AVAILABLE_CUSTOMERS_SQL, AVAILABLE_SUBSIDIARIES_SQL
    };
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 272 tests / 9 suites pass (268 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): add 4 AVAILABLE_*_SQL constants for portfolio filters

Option-list queries that drive the Filters pill multi-select dropdowns:
projects, managers, customers, subsidiaries. Each returns id+name for
records that appear on at least one BC project with timing data.
Subsidiary query has two forms — direct field if BC_PROJECT.fields.subsidiary
is non-null, otherwise joins through the customer record. Spec §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `PORTFOLIO_SQL` + `_loadPortfolio` pivot (first pass — projects array)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

The main SQL — one big query that joins BC projects to revenue + cost timing lines, filtered by status / project IDs / manager IDs / customer IDs / subsidiary IDs / date range, returning rows shaped `{ flow_direction, project_id, project_name, period, amount, project_created }`. UNION ALL of the revenue leg + cost leg (same pattern as `COMBINED_SQL`).

Plus `_loadPortfolio(mode, range, filters)` that fires the SQL and pivots results into `data.projects` array. First pass returns `projects` + `kpis` only; Tasks 6 and 7 add the auxiliary aggregates.

- [ ] **Step 1: Add the failing test**

Append to `tests/entry_points/bc_cf_data_sl.test.js`:

```js
describe('bc_cf_data_sl portfolio action (_loadPortfolio) — first-pass shape', () => {
    it('exports _loadPortfolio on api', () => {
        expect(typeof Suitelet._loadPortfolio).toBe('function');
    });

    it('returns projects + kpis envelope via dispatch (mocked loader)', () => {
        jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            projects: [
                {
                    id: 1807, name: 'Bolder Construction', createdDate: '2026-03-15',
                    revenue: [7500, 4500], cost: [500, 5526], net: [7000, -1026],
                    revenueTotal: 12000, costTotal: 6026, netTotal: 5974
                }
            ],
            kpis: { totalRevenue: 12000, totalCost: 6026, netCashFlow: 5974, margin: 49.8 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' }
        });
        const req = { method: 'GET', parameters: { action: 'portfolio' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.projects)).toBe(true);
        expect(body.projects[0].id).toBe(1807);
        expect(body.kpis.netCashFlow).toBe(5974);
    });
});
```

- [ ] **Step 2: Run tests to verify the first test fails**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: `Suitelet._loadPortfolio is not a function` — first test in the new block fails. The second test will also fail because `onRequest` doesn't dispatch `portfolio` yet.

- [ ] **Step 3: Add `PORTFOLIO_SQL` to `bc_cf_data_sl.js`**

After the 4 `AVAILABLE_*` constants from Task 4, append:

```js
    // ── PORTFOLIO_SQL — main per-project per-period rev+cost aggregator ──────

    /**
     * Returns one row per (flow_direction, project, period) tuple, summed.
     * UNION ALL of revenue leg (joining customrecord_bc_revenue_timing_line)
     * + cost leg (joining customrecord_bc_cost_timing_line). Each leg joins
     * BC_PROJECT for project metadata + filter dimensions.
     *
     * Filter clauses use the (? = 1 OR p.field IN (...)) pattern: pass 1
     * to disable a filter dimension, otherwise pass 0 + the value list.
     */
    const PORTFOLIO_SQL = `
        SELECT
            'Revenue' AS flow_direction,
            p.id AS project_id,
            p.${BC_PROJECT.fields.name} AS project_name,
            TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount,
            TO_CHAR(MIN(p.${BC_PROJECT.fields.created}), 'YYYY-MM-DD') AS project_created
        FROM ${BC_PROJECT.rectype} p
        JOIN customrecord_bc_revenue_timing_line rtl ON rtl.custrecord_bc_rtl_project = p.id
        WHERE rtl.custrecord_bc_rtl_timing_type = ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?
          AND (? = 1 OR p.${BC_PROJECT.fields.status} IN (?, ?, ?))
          AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR ${BC_PROJECT.fields.subsidiary
                ? `p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?)`
                : `EXISTS (SELECT 1 FROM customer c WHERE c.id = p.${BC_PROJECT.fields.customer} AND c.subsidiary IN (?, ?, ?, ?, ?))`
              })
        GROUP BY p.id, p.${BC_PROJECT.fields.name},
                 TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')

        UNION ALL

        SELECT
            'Cost' AS flow_direction,
            p.id AS project_id,
            p.${BC_PROJECT.fields.name} AS project_name,
            TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') AS period,
            SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS amount,
            TO_CHAR(MIN(p.${BC_PROJECT.fields.created}), 'YYYY-MM-DD') AS project_created
        FROM ${BC_PROJECT.rectype} p
        JOIN customrecord_bc_cost_timing_line ctl ON ctl.custrecord_bc_ctl_project = p.id
        WHERE ctl.custrecord_bc_ctl_timing_type = ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?
          AND (? = 1 OR p.${BC_PROJECT.fields.status} IN (?, ?, ?))
          AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
          AND (? = 1 OR ${BC_PROJECT.fields.subsidiary
                ? `p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?)`
                : `EXISTS (SELECT 1 FROM customer c WHERE c.id = p.${BC_PROJECT.fields.customer} AND c.subsidiary IN (?, ?, ?, ?, ?))`
              })
        GROUP BY p.id, p.${BC_PROJECT.fields.name},
                 TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')

        ORDER BY project_created DESC NULLS LAST, project_name, period
    `;
```

Notes on the filter pattern:
- `(? = 1 OR <field> IN (...))` — caller passes `1` to disable that filter dimension; passes `0` + a fixed-width value list to enable. The fixed-width comes from a configurable cap (3 for status — there are only 3 list values; 10 for projects; 5 for managers/customers/subsidiaries — typical small lists). If a list has fewer than the cap, padding with the first value works because `IN (?, ?, ...)` matches if the field equals ANY of the supplied values; padding with duplicates is harmless.
- The cap can be raised in V1.5 if 5 isn't enough for customers/subsidiaries.

- [ ] **Step 4: Add `_loadPortfolio` to `bc_cf_data_sl.js`**

After the existing `_loadRevenue` function and before the `// ── JSON helpers ──` comment block, insert:

```js
    /**
     * Load portfolio data — per-project per-period revenue + cost, aggregated
     * across all projects matching the supplied filters and date range.
     *
     * @param {string} mode - 'cash' | 'accrual'
     * @param {{startPeriod, endPeriod}} range
     * @param {{status, projects, managers, customers, subsidiaries}} filters
     *   - status: one of 'active'|'hold'|'closed'|'all' (default 'active')
     *   - projects/managers/customers/subsidiaries: arrays of internal IDs (empty = no filter)
     * @returns The full portfolio payload (see spec §3.3) minus auxiliary
     *   aggregates which Tasks 6 + 7 add on top.
     */
    const _loadPortfolio = (mode, range, filters) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        // Resolve status filter into a list of NS list-value IDs.
        let statusList;
        if (filters.status === 'all') {
            statusList = [];  // disable status filter
        } else if (filters.status === 'active') {
            statusList = [BC_PROJECT.statusValues.active];
        } else if (filters.status === 'hold') {
            statusList = [BC_PROJECT.statusValues.hold];
        } else if (filters.status === 'closed') {
            statusList = [BC_PROJECT.statusValues.closed];
        } else {
            statusList = [BC_PROJECT.statusValues.active];  // safe default
        }

        // Each filter dimension produces a [disableFlag, paddedValues...] tuple
        // for the SQL params. disableFlag = 1 disables that filter (matches all).
        const buildFilter = (ids, cap, defaultPad) => {
            if (!ids || !ids.length) {
                return [1].concat(Array(cap).fill(defaultPad));
            }
            const padded = ids.slice(0, cap);
            while (padded.length < cap) padded.push(ids[0]);  // pad with first
            return [0].concat(padded);
        };

        const statusParams      = buildFilter(statusList, 3, 0);
        const projectParams     = buildFilter(filters.projects, 10, 0);
        const managerParams     = buildFilter(filters.managers, 5, 0);
        const customerParams    = buildFilter(filters.customers, 5, 0);
        const subsidiaryParams  = buildFilter(filters.subsidiaries, 5, 0);

        // SQL params order matches PORTFOLIO_SQL's ? placeholders, both legs.
        const legParams = [
            timingType,
            startPeriod, endPeriod
        ].concat(statusParams).concat(projectParams)
         .concat(managerParams).concat(customerParams)
         .concat(subsidiaryParams);

        const allParams = legParams.concat(legParams);  // same params on both UNION legs

        let rows;
        try {
            rows = query.runSuiteQL({
                query: PORTFOLIO_SQL,
                params: allParams
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // Build period list from the range (every month renders even if empty).
        const periods = [];
        let _p = startPeriod;
        while (_p <= endPeriod) { periods.push(_p); _p = _addMonths(_p, 1); }

        // Group rows by project, then pivot per-direction onto the period array.
        const byProject = {};
        rows.forEach((r) => {
            const pid = String(r.project_id);
            if (!byProject[pid]) {
                byProject[pid] = {
                    id: Number(r.project_id),
                    name: r.project_name || '(Unnamed)',
                    createdDate: r.project_created || null,
                    revenuePerPeriod: {},
                    costPerPeriod: {}
                };
            }
            const bucket = r.flow_direction === 'Revenue' ? 'revenuePerPeriod' : 'costPerPeriod';
            byProject[pid][bucket][r.period] = (byProject[pid][bucket][r.period] || 0) + (Number(r.amount) || 0);
        });

        // Materialize the projects array, in createdDate DESC NULLS LAST order
        // (matches SQL's ORDER BY — but we re-sort here defensively since the
        // UNION ALL's outer ORDER BY doesn't guarantee both legs interleave
        // perfectly when one project appears only in one leg).
        const projectList = Object.keys(byProject).map((pid) => {
            const proj = byProject[pid];
            const revenue = periods.map((p) => proj.revenuePerPeriod[p] || 0);
            const cost    = periods.map((p) => proj.costPerPeriod[p] || 0);
            const net     = revenue.map((v, i) => v - (cost[i] || 0));
            return {
                id: proj.id,
                name: proj.name,
                createdDate: proj.createdDate,
                revenue, cost, net,
                revenueTotal: revenue.reduce((s, v) => s + v, 0),
                costTotal:    cost.reduce((s, v) => s + v, 0),
                netTotal:     net.reduce((s, v) => s + v, 0)
            };
        });

        projectList.sort((a, b) => {
            if (a.createdDate == null && b.createdDate == null) return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
            if (a.createdDate == null) return 1;
            if (b.createdDate == null) return -1;
            return a.createdDate < b.createdDate ? 1 : (a.createdDate > b.createdDate ? -1 : 0);
        });

        // KPIs — sum across the filtered subset.
        const totalRevenue = projectList.reduce((s, p) => s + p.revenueTotal, 0);
        const totalCost    = projectList.reduce((s, p) => s + p.costTotal, 0);
        const netCashFlow  = totalRevenue - totalCost;
        const margin       = totalRevenue !== 0 ? (netCashFlow / totalRevenue) * 100 : 0;

        return {
            periods: periods.map(_periodLabel),
            projects: projectList,
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod }
        };
    };
```

- [ ] **Step 5: Dispatch `portfolio` action in `onRequest`**

In `bc_cf_data_sl.js`'s `onRequest` function, find the existing action-dispatch block:

```js
            if (action === 'combined')      data = api._loadCombined(projectId, mode, range);
            else if (action === 'cost')     data = api._loadCost(projectId, mode, range);
            else if (action === 'revenue')  data = api._loadRevenue(projectId, mode, range);
            else return sendError(res, `Unknown action: ${action}`);
```

Replace the action chain to add `portfolio` BEFORE the unknown-action fallback. The portfolio action doesn't need a `projectId`; it does need `filters`. For now, pass an empty filters object — Task 8 wires actual param parsing:

```js
            if (action === 'combined')      data = api._loadCombined(projectId, mode, range);
            else if (action === 'cost')     data = api._loadCost(projectId, mode, range);
            else if (action === 'revenue')  data = api._loadRevenue(projectId, mode, range);
            else if (action === 'portfolio') data = api._loadPortfolio(mode, range, { status: 'active', projects: [], managers: [], customers: [], subsidiaries: [] });
            else return sendError(res, `Unknown action: ${action}`);
```

Also relax the `projectId` requirement for portfolio — find the `if (!projectId) return sendError(res, 'Missing projectId parameter');` line and change it to:

```js
            if (!projectId && action !== 'portfolio') return sendError(res, 'Missing projectId parameter');
```

- [ ] **Step 6: Export `_loadPortfolio` and `PORTFOLIO_SQL` on `api`**

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue, _loadPortfolio,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange,
        _pivotDirection,
        BC_PROJECT,
        AVAILABLE_PROJECTS_SQL, AVAILABLE_MANAGERS_SQL,
        AVAILABLE_CUSTOMERS_SQL, AVAILABLE_SUBSIDIARIES_SQL,
        PORTFOLIO_SQL
    };
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: 274 tests / 9 suites pass (272 + 2 new).

- [ ] **Step 8: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): PORTFOLIO_SQL + _loadPortfolio first-pass (projects + kpis)

UNION ALL across rev + cost timing lines, joined to BC_PROJECT, grouped
by project + period. Filter dimensions encoded as (?=1 OR field IN (...))
with caps (status=3, projects=10, managers/customers/subsidiaries=5) and
disable-flag padding. _loadPortfolio resolves status name → list-value
ID, pivots SQL rows into one entry per project, sorts by createdDate
DESC NULLS LAST. Auxiliary aggregates (bounds, cumBefore, portfolioTotals,
option lists) land in Tasks 6+7; filter param parsing in Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Portfolio bounds + totals + option-list response wiring

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Adds `PORTFOLIO_BOUNDS_SQL` + `PORTFOLIO_TOTALS_SQL` + wires the 4 `AVAILABLE_*` queries (from Task 4) into `_loadPortfolio`'s response, plus `availableBounds` and `portfolioTotals`.

- [ ] **Step 1: Add the failing test**

Append to the existing `describe('bc_cf_data_sl portfolio action (_loadPortfolio)...` block (Task 5):

```js
    it('returns availableBounds, portfolioTotals, availableProjects/managers/customers/subsidiaries', () => {
        jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: ['Apr 2026'],
            projects: [],
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-04' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            portfolioTotals: { revenue: 210000, cost: 158000, net: 52000, margin: 24.8 },
            availableProjects: [{id: 1807, name: 'Bolder'}],
            availableManagers: [{id: 42, name: 'Sarah Chen'}],
            availableCustomers: [{id: 197, name: 'Bolder Construction Inc.'}],
            availableSubsidiaries: [{id: 1, name: 'Main'}]
        });
        const req = { method: 'GET', parameters: { action: 'portfolio' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.availableBounds.minPeriod).toBe('2026-01');
        expect(body.portfolioTotals.revenue).toBe(210000);
        expect(body.availableProjects).toHaveLength(1);
        expect(body.availableManagers[0].name).toBe('Sarah Chen');
    });
```

- [ ] **Step 2: Add `PORTFOLIO_BOUNDS_SQL` + `PORTFOLIO_TOTALS_SQL`**

After `PORTFOLIO_SQL`, append:

```js
    /**
     * Earliest + latest period_date across both timing-line tables, ignoring
     * filters. Powers the date picker's min/max attrs.
     */
    const PORTFOLIO_BOUNDS_SQL = `
        SELECT
            TO_CHAR(MIN(period), 'YYYY-MM') AS min_period,
            TO_CHAR(MAX(period), 'YYYY-MM') AS max_period
        FROM (
            SELECT rtl.custrecord_bc_rtl_period_date AS period
              FROM customrecord_bc_revenue_timing_line rtl
            UNION ALL
            SELECT ctl.custrecord_bc_ctl_period_date AS period
              FROM customrecord_bc_cost_timing_line ctl
        ) all_periods
    `;

    /**
     * Unfiltered portfolio totals within the active date range. Powers the
     * KPI sublines ("$210K portfolio total"). Takes startPeriod + endPeriod
     * as the only params — does NOT respect the status/project/etc. filters.
     */
    const PORTFOLIO_TOTALS_SQL = `
        SELECT
            (SELECT NVL(SUM(rtl.custrecord_bc_rtl_amount), 0)
               FROM customrecord_bc_revenue_timing_line rtl
              WHERE rtl.custrecord_bc_rtl_timing_type = ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?) AS rev_total,
            (SELECT NVL(SUM(ctl.custrecord_bc_ctl_amount), 0)
               FROM customrecord_bc_cost_timing_line ctl
              WHERE ctl.custrecord_bc_ctl_timing_type = ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?) AS cost_total
        FROM dual
    `;
```

- [ ] **Step 3: Extend `_loadPortfolio` to fire the auxiliary queries**

In `_loadPortfolio`, between the main `PORTFOLIO_SQL` execution and the period/project pivot logic, insert these blocks:

```js
        // ── availableBounds ──
        let boundsRow;
        try {
            boundsRow = query.runSuiteQL({
                query: PORTFOLIO_BOUNDS_SQL,
                params: []
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio (bounds)', details: e.message + '\n' + (e.stack || '') });
            boundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const availableBounds = {
            minPeriod: boundsRow.min_period || _curYYYYMM,
            maxPeriod: boundsRow.max_period || _curYYYYMM
        };

        // ── portfolioTotals (unfiltered, within range) ──
        let totalsRow;
        try {
            totalsRow = query.runSuiteQL({
                query: PORTFOLIO_TOTALS_SQL,
                params: [timingType, startPeriod, endPeriod, timingType, startPeriod, endPeriod]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio (totals)', details: e.message + '\n' + (e.stack || '') });
            totalsRow = {};
        }
        const portfRevenue = Number(totalsRow.rev_total) || 0;
        const portfCost    = Number(totalsRow.cost_total) || 0;
        const portfolioTotals = {
            revenue: portfRevenue,
            cost:    portfCost,
            net:     portfRevenue - portfCost,
            margin:  portfRevenue !== 0 ? ((portfRevenue - portfCost) / portfRevenue) * 100 : 0
        };

        // ── availableProjects / Managers / Customers / Subsidiaries ──
        const runOptionList = (sqlConst, label) => {
            try {
                return query.runSuiteQL({ query: sqlConst, params: [] }).asMappedResults()
                    .map((r) => ({ id: Number(r.id), name: r.name || '' }));
            } catch (e) {
                log.error({ title: MODULE + '._loadPortfolio (' + label + ')', details: e.message + '\n' + (e.stack || '') });
                return [];
            }
        };
        const availableProjects     = runOptionList(AVAILABLE_PROJECTS_SQL,     'projects');
        const availableManagers     = runOptionList(AVAILABLE_MANAGERS_SQL,     'managers');
        const availableCustomers    = runOptionList(AVAILABLE_CUSTOMERS_SQL,    'customers');
        const availableSubsidiaries = runOptionList(AVAILABLE_SUBSIDIARIES_SQL, 'subsidiaries');
```

- [ ] **Step 4: Update the return shape**

Change `_loadPortfolio`'s final `return { ... };` to include the new fields:

```js
        return {
            periods: periods.map(_periodLabel),
            projects: projectList,
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod },
            availableBounds,
            portfolioTotals,
            availableProjects,
            availableManagers,
            availableCustomers,
            availableSubsidiaries
        };
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 275 tests / 9 suites pass (274 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): portfolio response — bounds + totals + option lists

Adds PORTFOLIO_BOUNDS_SQL (MIN/MAX across both timing tables, unfiltered),
PORTFOLIO_TOTALS_SQL (single-row SUM(rev)/SUM(cost) within range, unfiltered).
_loadPortfolio fires those plus the 4 AVAILABLE_* queries; response now
carries availableBounds + portfolioTotals + availableProjects/Managers/
Customers/Subsidiaries. KPI sublines + Filters pill dropdowns can now
populate from this payload. Spec §3.3 response shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Portfolio chart series + cumulativeBefore

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Adds aggregated `portfolioRevenuePerPeriod` / `portfolioCostPerPeriod` / `portfolioNetPerPeriod` (sums across the filtered projects per period — drives the chart bars) and `cumulativeBefore` (net accumulated across filtered projects in periods strictly before `startPeriod` — drives the trend-line carry-forward).

- [ ] **Step 1: Add the failing test**

Append to the same `describe('bc_cf_data_sl portfolio action...` block:

```js
    it('returns portfolio chart series + cumulativeBefore', () => {
        jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            projects: [],
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            portfolioTotals: { revenue: 0, cost: 0, net: 0, margin: 0 },
            availableProjects: [], availableManagers: [], availableCustomers: [], availableSubsidiaries: [],
            portfolioRevenuePerPeriod: [12500, 8000],
            portfolioCostPerPeriod:    [4500, 6800],
            portfolioNetPerPeriod:     [8000, 1200],
            cumulativeBefore: 5500
        });
        const req = { method: 'GET', parameters: { action: 'portfolio' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.portfolioRevenuePerPeriod).toEqual([12500, 8000]);
        expect(body.portfolioNetPerPeriod).toEqual([8000, 1200]);
        expect(body.cumulativeBefore).toBe(5500);
    });
```

- [ ] **Step 2: Compute the per-period series from the projects array (no extra SQL needed)**

The per-period series are sums of the projects array. In `_loadPortfolio`, immediately after the `projectList.sort(...)` call (before the KPI computation), add:

```js
        // Aggregate per-period series across the filtered projects (drives the chart).
        const portfolioRevenuePerPeriod = periods.map((_, i) =>
            projectList.reduce((s, p) => s + (p.revenue[i] || 0), 0)
        );
        const portfolioCostPerPeriod = periods.map((_, i) =>
            projectList.reduce((s, p) => s + (p.cost[i] || 0), 0)
        );
        const portfolioNetPerPeriod = portfolioRevenuePerPeriod.map((v, i) =>
            v - (portfolioCostPerPeriod[i] || 0)
        );
```

- [ ] **Step 3: Add `PORTFOLIO_CUM_BEFORE_SQL`**

After `PORTFOLIO_TOTALS_SQL`, append:

```js
    /**
     * Pre-range cumulative net across the FILTERED project set.
     * Returns rev_total + cost_total for periods strictly before startPeriod,
     * respecting the same status/project/manager/customer/subsidiary filters
     * as PORTFOLIO_SQL. Caller computes net = rev_total - cost_total.
     */
    const PORTFOLIO_CUM_BEFORE_SQL = `
        SELECT
            (SELECT NVL(SUM(rtl.custrecord_bc_rtl_amount), 0)
               FROM customrecord_bc_revenue_timing_line rtl
               JOIN ${BC_PROJECT.rectype} p ON p.id = rtl.custrecord_bc_rtl_project
              WHERE rtl.custrecord_bc_rtl_timing_type = ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') < ?
                AND (? = 1 OR p.${BC_PROJECT.fields.status} IN (?, ?, ?))
                AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR ${BC_PROJECT.fields.subsidiary
                    ? `p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?)`
                    : `EXISTS (SELECT 1 FROM customer c WHERE c.id = p.${BC_PROJECT.fields.customer} AND c.subsidiary IN (?, ?, ?, ?, ?))`
                  })) AS rev_total,
            (SELECT NVL(SUM(ctl.custrecord_bc_ctl_amount), 0)
               FROM customrecord_bc_cost_timing_line ctl
               JOIN ${BC_PROJECT.rectype} p ON p.id = ctl.custrecord_bc_ctl_project
              WHERE ctl.custrecord_bc_ctl_timing_type = ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') < ?
                AND (? = 1 OR p.${BC_PROJECT.fields.status} IN (?, ?, ?))
                AND (? = 1 OR p.id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.manager} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR p.${BC_PROJECT.fields.customer} IN (?, ?, ?, ?, ?))
                AND (? = 1 OR ${BC_PROJECT.fields.subsidiary
                    ? `p.${BC_PROJECT.fields.subsidiary} IN (?, ?, ?, ?, ?)`
                    : `EXISTS (SELECT 1 FROM customer c WHERE c.id = p.${BC_PROJECT.fields.customer} AND c.subsidiary IN (?, ?, ?, ?, ?))`
                  })) AS cost_total
        FROM dual
    `;
```

- [ ] **Step 4: Fire `PORTFOLIO_CUM_BEFORE_SQL` in `_loadPortfolio`**

In `_loadPortfolio`, after the `availableSubsidiaries = runOptionList(...)` line and before the final `return`, add:

```js
        // ── cumulativeBefore — pre-range net across the FILTERED project set ──
        // Params are the same filter set as PORTFOLIO_SQL (per leg), but with
        // startPeriod replacing the BETWEEN clause and no endPeriod.
        const cumLegParams = [timingType, startPeriod]
            .concat(statusParams).concat(projectParams)
            .concat(managerParams).concat(customerParams)
            .concat(subsidiaryParams);
        let cumRow;
        try {
            cumRow = query.runSuiteQL({
                query: PORTFOLIO_CUM_BEFORE_SQL,
                params: cumLegParams.concat(cumLegParams)
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadPortfolio (cumBefore)', details: e.message + '\n' + (e.stack || '') });
            cumRow = {};
        }
        const cumulativeBefore = (Number(cumRow.rev_total) || 0) - (Number(cumRow.cost_total) || 0);
```

- [ ] **Step 5: Update the return shape one more time**

Update `_loadPortfolio`'s `return { ... }` to include the new fields:

```js
        return {
            periods: periods.map(_periodLabel),
            projects: projectList,
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod },
            availableBounds,
            portfolioTotals,
            portfolioRevenuePerPeriod,
            portfolioCostPerPeriod,
            portfolioNetPerPeriod,
            cumulativeBefore,
            availableProjects,
            availableManagers,
            availableCustomers,
            availableSubsidiaries
        };
```

- [ ] **Step 6: Export `PORTFOLIO_BOUNDS_SQL`, `PORTFOLIO_TOTALS_SQL`, `PORTFOLIO_CUM_BEFORE_SQL` on `api`**

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue, _loadPortfolio,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange,
        _pivotDirection,
        BC_PROJECT,
        AVAILABLE_PROJECTS_SQL, AVAILABLE_MANAGERS_SQL,
        AVAILABLE_CUSTOMERS_SQL, AVAILABLE_SUBSIDIARIES_SQL,
        PORTFOLIO_SQL, PORTFOLIO_BOUNDS_SQL, PORTFOLIO_TOTALS_SQL, PORTFOLIO_CUM_BEFORE_SQL
    };
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: 276 tests / 9 suites pass.

- [ ] **Step 8: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): portfolio chart series + cumulativeBefore

Per-period series computed by summing the projects array — no new SQL
needed for portfolioRevenuePerPeriod/CostPerPeriod/NetPerPeriod. Adds
PORTFOLIO_CUM_BEFORE_SQL (filter-respecting pre-range net) for the trend
line's truthful carry-forward when the date range starts mid-project.
Mirrors COMBINED's cumulativeBefore but aggregated across the filtered
project set. Spec §3.3 response.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Filter param parsing in `onRequest`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Reads `status`, `projects`, `managers`, `customers`, `subsidiaries` from URL params; validates them; threads into `_loadPortfolio`. Until this task, the dispatcher passes empty filters (from Task 5 step 5).

- [ ] **Step 1: Add the failing tests**

Append to the existing portfolio describe block:

```js
    it('rejects invalid status with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'portfolio', status: 'gibberish' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/status/i);
    });

    it('rejects malformed IDs CSV with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'portfolio', projects: '1807,abc,2104' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/projects/i);
    });

    it('passes resolved filters to _loadPortfolio', () => {
        const spy = jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: [], projects: [], kpis: {}, range: {}, availableBounds: {}, portfolioTotals: {},
            portfolioRevenuePerPeriod: [], portfolioCostPerPeriod: [], portfolioNetPerPeriod: [], cumulativeBefore: 0,
            availableProjects: [], availableManagers: [], availableCustomers: [], availableSubsidiaries: []
        });
        const req = { method: 'GET', parameters: {
            action: 'portfolio',
            status: 'hold',
            projects: '1807,2104',
            managers: '42',
            customers: '',
            subsidiaries: '1,2,3'
        } };
        Suitelet.onRequest({ request: req, response: mockResponse() });
        expect(spy).toHaveBeenCalledWith('cash', expect.any(Object), {
            status: 'hold',
            projects: [1807, 2104],
            managers: [42],
            customers: [],
            subsidiaries: [1, 2, 3]
        });
        spy.mockRestore();
    });

    it('defaults status to active when omitted', () => {
        const spy = jest.spyOn(Suitelet, '_loadPortfolio').mockReturnValue({
            periods: [], projects: [], kpis: {}, range: {}, availableBounds: {}, portfolioTotals: {},
            portfolioRevenuePerPeriod: [], portfolioCostPerPeriod: [], portfolioNetPerPeriod: [], cumulativeBefore: 0,
            availableProjects: [], availableManagers: [], availableCustomers: [], availableSubsidiaries: []
        });
        Suitelet.onRequest({ request: { method: 'GET', parameters: { action: 'portfolio' } }, response: mockResponse() });
        expect(spy).toHaveBeenCalledWith('cash', expect.any(Object), expect.objectContaining({ status: 'active' }));
        spy.mockRestore();
    });
```

- [ ] **Step 2: Add a `_parseFilters` helper to `bc_cf_data_sl.js`**

After the existing `_resolveRange` helper, append:

```js
    /**
     * Parse + validate portfolio filter params from the URL request. Returns
     *   { ok: true, filters: {...} }
     *   { ok: false, error: '...' }
     */
    const _parseFilters = (params) => {
        const VALID_STATUS = ['active', 'hold', 'closed', 'all'];
        const status = params.status || 'active';
        if (VALID_STATUS.indexOf(status) === -1) {
            return { ok: false, error: 'Invalid status: ' + status };
        }

        const ID_CSV = /^(\d+)(,\d+)*$/;
        const parseIds = (raw, dim) => {
            if (raw == null || raw === '') return { ok: true, ids: [] };
            if (!ID_CSV.test(raw)) return { ok: false, error: 'Invalid ' + dim + ' filter format' };
            return { ok: true, ids: raw.split(',').map(Number) };
        };

        const p = parseIds(params.projects,     'projects');
        if (!p.ok) return p;
        const m = parseIds(params.managers,     'managers');
        if (!m.ok) return m;
        const c = parseIds(params.customers,    'customers');
        if (!c.ok) return c;
        const s = parseIds(params.subsidiaries, 'subsidiaries');
        if (!s.ok) return s;

        return {
            ok: true,
            filters: {
                status,
                projects:     p.ids,
                managers:     m.ids,
                customers:    c.ids,
                subsidiaries: s.ids
            }
        };
    };
```

- [ ] **Step 3: Wire `_parseFilters` into `onRequest`**

In `onRequest`, after the existing `_resolveRange` block and BEFORE the action dispatch, add:

```js
            let filters = null;
            if (action === 'portfolio') {
                const parsedFilters = api._parseFilters(params);
                if (!parsedFilters.ok) return sendError(res, parsedFilters.error);
                filters = parsedFilters.filters;
            }
```

Update the action dispatch's `portfolio` branch (from Task 5 step 5) to use the parsed filters:

```js
            else if (action === 'portfolio') data = api._loadPortfolio(mode, range, filters);
```

- [ ] **Step 4: Export `_parseFilters` on `api`**

```js
    const api = {
        ...,  // existing exports
        _parseFilters
    };
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 280 tests / 9 suites pass (276 + 4 new).

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): portfolio filter param parsing in onRequest

_parseFilters validates status whitelist + ID-CSV format for the 4
multi-select dimensions, returns { ok, filters } or { ok:false, error }.
onRequest threads parsed filters into _loadPortfolio. Defaults status
to 'active' when omitted. Phase 2 (data SL contract) complete. Spec §3.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Phase 2 deploy — data SL portfolio action live

**Files:** none modified.

- [ ] **Step 1: Confirm clean tree + green tests**

Run: `git status && npm test 2>&1 | tail -5`
Expected: clean, 280 tests pass.

- [ ] **Step 2: Deploy the data SL**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js"
```

Expected: success.

The portfolio route is now reachable at `bc_cf_data_sl?action=portfolio&...`. No client consumes it yet (Phase 4); the route is dormant in production until then. Existing per-project actions are unaffected — they shared the same loader signature pattern and didn't change.

Phase 2 complete. Proceed to Phase 3.

---

# Phase 3 — CSS primitives for Filters pill

### Task 10: `.bccf-filters*` CSS primitives

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`
- Modify: `tests/modules/bc_cf_styles.test.js`

Adds the CSS for the Filters pill component, modeled on `.bccf-daterange*` from E1. Status segmented control, multi-select chip pattern, panel footer with Reset + Apply actions.

- [ ] **Step 1: Add the failing tests**

Append to `tests/modules/bc_cf_styles.test.js` inside the `describe('getStyles()', ...)` block:

```js
        it('defines bccf-filters primitives (E2 spec §3.6)', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-filters\b/);
            expect(out).toMatch(/\.bccf-filters-trigger\b/);
            expect(out).toMatch(/\.bccf-filters-panel\b/);
            expect(out).toMatch(/\.bccf-filters-status\b/);
            expect(out).toMatch(/\.bccf-filters-chips\b/);
            expect(out).toMatch(/\.bccf-chip\b/);
            expect(out).toMatch(/\.bccf-filters-actions\b/);
        });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: new `it` fails.

- [ ] **Step 3: Append `.bccf-filters*` CSS to `PRIMITIVES`**

In `bc_cf_styles.js`, locate the end of `PRIMITIVES` (just before the closing backtick). After the existing `.bccf-trend-dot:hover::after` rule (or `.bccf-bar[data-tip]:hover::after` block — whichever is last), append:

```css

        /* Filters pill (E2 spec §3.6) — modeled on .bccf-daterange */
        .bccf-filters { position: relative; display: inline-block; }
        .bccf-filters-trigger { display: inline-flex; align-items: center; gap: 6px; background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); padding: 6px 12px; font-size: var(--bccf-text-sm); color: var(--bccf-ink-700); font-weight: 500; cursor: pointer; }
        .bccf-filters-trigger:hover { background: var(--bccf-bg-50); }
        .bccf-filters-trigger .bccf-filters-label { color: var(--bccf-ink-900); }
        .bccf-filters-panel { position: absolute; top: 100%; right: 0; margin-top: 6px; background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); box-shadow: 0 4px 16px rgba(18,24,33,.08); padding: 14px; min-width: 340px; max-width: 420px; z-index: 50; }
        .bccf-filters-panel h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--bccf-ink-500); font-weight: 500; margin: 0 0 8px; }

        .bccf-filters-status { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 12px; }
        .bccf-filters-status button { font-size: var(--bccf-text-xs); padding: 6px 8px; border-radius: var(--bccf-r-md); background: var(--bccf-bg-50); border: 1px solid var(--bccf-border); color: var(--bccf-ink-700); font-weight: 500; cursor: pointer; text-align: center; }
        .bccf-filters-status button.active { background: var(--bccf-brand-500); color: #fff; border-color: var(--bccf-brand-500); }

        .bccf-filters-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; align-items: center; }
        .bccf-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; background: var(--bccf-brand-50); color: var(--bccf-brand-500); border-radius: var(--bccf-r-full); font-size: var(--bccf-text-xs); font-weight: 500; }
        .bccf-chip-x { background: transparent; border: 0; color: var(--bccf-brand-500); cursor: pointer; padding: 0 4px; line-height: 1; font-size: 14px; }
        .bccf-chip-x:hover { color: var(--bccf-brand-600); }
        .bccf-filters-add { font-size: var(--bccf-text-xs); padding: 4px 6px; border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); background: var(--bccf-surface); cursor: pointer; max-width: 220px; }

        .bccf-filters-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--bccf-bg-100); }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: all green including new test.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 281 tests / 9 suites pass.

- [ ] **Step 6: Deploy styles**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js"
```

Filter primitives are now live in production stylesheet — invisible until the Portfolio SL uses them (Tasks 11+).

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js tests/modules/bc_cf_styles.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_styles): .bccf-filters* primitives for E2 Filters pill

Modeled on .bccf-daterange — trigger pill + dropdown panel, status
segmented control (4-column grid), multi-select chip pattern (chip +
remove ✕ + add select), action footer (Reset + Apply). All tokens reused
from the existing design system. Panel widens to 340–420px to fit five
filter dimensions stacked vertically. Spec §3.6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4 — Shell SL: server-side scaffold

**Goal of phase:** Replace the placeholder JS from Task 3 with the full server-rendered shell — header (title + date picker + Filters pill + Cash/Accrual + Refresh) + KPI skeleton + chart skeleton + table skeleton. No client behavior yet beyond the skeletons.

**Phase exit criteria:** Shell SL renders an HTML page with all chrome in place; placeholder text fills data regions until Phase 5 wires the fetch.

---

### Task 11: Shell SL — copy-and-strip Combined SL as starting point

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`
- Create: `tests/entry_points/bc_cf_portfolio_sl.test.js`

Take `bc_cf_combined_sl.js` as the starting structure (date helpers + buildPicker + buildHeader + skeleton builders + CLIENT_SCRIPT + onRequest) and adapt it for the portfolio context. This task lays down the FULL server-rendered shell with placeholders for portfolio-specific pieces. The Filters pill HTML lands in Task 12. The CLIENT_SCRIPT becomes a no-op IIFE that will be filled in across Tasks 13–16.

- [ ] **Step 1: Add a failing test**

Create `tests/entry_points/bc_cf_portfolio_sl.test.js`:

```js
/**
 * Smoke tests for bc_cf_portfolio_sl — shell-only Suitelet.
 */

const Suitelet = require('SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl');

jest.mock('N/url', () => ({
    resolveScript: jest.fn(({ scriptId, deploymentId, params }) => {
        const qs = new URLSearchParams(Object.assign({ action: 'portfolio' }, params)).toString();
        return `/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=${deploymentId}&${qs}`;
    })
}), { virtual: true });

const mockResponse = () => {
    let body = '';
    return {
        write: (s) => { body += s; },
        setHeader: jest.fn(),
        getBody: () => body
    };
};

const GET = (params) => ({ method: 'GET', parameters: params || {} });

describe('bc_cf_portfolio_sl — shell structure', () => {
    it('rejects non-GET with method not allowed', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: { method: 'POST', parameters: {} }, response: res });
        expect(res.getBody()).toMatch(/method not allowed/i);
    });

    describe('with default params', () => {
        let body;
        beforeEach(() => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({}), response: res });
            body = res.getBody();
        });

        it('returns an HTML document', () => {
            expect(body).toMatch(/<!doctype html>/i);
            expect(body).toMatch(/<html lang="en">/);
        });

        it('includes the <style> block from Styles.getStyles()', () => {
            expect(body).toMatch(/<style>/);
            expect(body).toContain('--bccf-brand-500');
        });

        it('stamps data-data-url on <body> with action=portfolio', () => {
            expect(body).toMatch(/data-data-url=/);
            expect(body).toMatch(/action=portfolio/);
        });

        it('renders the page title "Portfolio Cash Flow"', () => {
            expect(body).toMatch(/Portfolio Cash Flow/);
        });

        it('renders #bccf-kpis, #bccf-chart, #bccf-table region anchors', () => {
            expect(body).toContain('id="bccf-kpis"');
            expect(body).toContain('id="bccf-chart"');
            expect(body).toContain('id="bccf-table"');
        });

        it('renders the date-range picker pill (reused from E1)', () => {
            expect(body).toContain('class="bccf-daterange"');
            expect(body).toContain('data-action="open-daterange"');
        });

        it('renders the Cash/Accrual toggle + Refresh button', () => {
            expect(body).toContain('data-toggle-id="mode"');
            expect(body).toContain('data-action="refresh"');
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: all tests fail — the placeholder JS from Task 3 returns a 1-line plain string, not an HTML page.

- [ ] **Step 3: Replace the placeholder JS with the full server shell**

Open `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`. Replace the entire contents with the structure below. This file is ~600 lines after this task (CLIENT_SCRIPT is empty for now); it grows to ~1000 lines across Tasks 13–16 as client behavior fills in.

```js
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Portfolio Cash Flow rollup — shell-only Suitelet.
 *              Returns an HTML skeleton immediately; client JS fetches from
 *              bc_cf_data_sl (?action=portfolio) and swaps in real content.
 *
 * URL Params:
 *   mode         — 'cash' (default) | 'accrual'
 *   startPeriod  — YYYY-MM, optional
 *   endPeriod    — YYYY-MM, optional
 *   status       — 'active' (default) | 'hold' | 'closed' | 'all'
 *   projects     — comma-sep IDs CSV (optional)
 *   managers     — comma-sep IDs CSV (optional)
 *   customers    — comma-sep IDs CSV (optional)
 *   subsidiaries — comma-sep IDs CSV (optional)
 *
 * Script ID:  customscript_bc_cf_portfolio_sl
 * Deploy  ID: customdeploy_bc_cf_portfolio_sl
 *
 * Spec: docs/superpowers/specs/2026-05-24-cashflow-portfolio-suitelet-design.md
 *
 * @module  entry_points/bc_cf_portfolio_sl
 * @author  BlueCollar
 */
define([
    'N/log',
    'N/url',
    '../modules/bc_cf_styles',
    '../modules/bc_cf_ui'
], (log, url, Styles, UI) => {

    const MODULE = 'bc_cf_portfolio_sl';
    const DATA_SCRIPT_ID  = 'customscript_bc_cf_data_sl';
    const DATA_DEPLOY_ID  = 'customdeploy_bc_cf_data_sl';

    // ─── Date range helpers (mirror of bc_cf_data_sl helpers) ────────────────

    const _YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
    const _validateYYYYMM = (s) => typeof s === 'string' && _YYYYMM_RE.test(s);
    const _addMonths = (yyyymm, n) => {
        const [y, m] = yyyymm.split('-').map(Number);
        const d = new Date(Date.UTC(y, (m - 1) + n, 1));
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    };
    const _monthsBetween = (s, e) => {
        const [sy, sm] = s.split('-').map(Number);
        const [ey, em] = e.split('-').map(Number);
        return (ey - sy) * 12 + (em - sm) + 1;
    };
    const _defaultRange = () => {
        const now = new Date();
        const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        return { startPeriod: _addMonths(cur, -3), endPeriod: _addMonths(cur, 8) };
    };
    const _resolveRangeOrDefault = (rawStart, rawEnd) => {
        const hasStart = rawStart && _validateYYYYMM(rawStart);
        const hasEnd   = rawEnd   && _validateYYYYMM(rawEnd);
        if (!hasStart && !hasEnd) return _defaultRange();
        const startPeriod = hasStart ? rawStart : _addMonths(rawEnd, -11);
        const endPeriod   = hasEnd   ? rawEnd   : _addMonths(rawStart, 11);
        if (startPeriod > endPeriod) return _defaultRange();
        if (_monthsBetween(startPeriod, endPeriod) > 24) return _defaultRange();
        return { startPeriod, endPeriod };
    };
    const _periodLabelShort = (yyyymm) => {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [y, m] = yyyymm.split('-');
        return MONTHS[Number(m) - 1] + ' ' + y;
    };

    // ─── Filter helpers (E2-specific) ────────────────────────────────────────

    const VALID_STATUS = ['active', 'hold', 'closed', 'all'];
    const ID_CSV = /^(\d+)(,\d+)*$/;

    /**
     * Parse URL params into a filters object, degrading bad params to defaults
     * (HTML page, not JSON — never errors).
     */
    const _resolveFiltersOrDefault = (params) => {
        const status = VALID_STATUS.indexOf(params.status) === -1 ? 'active' : params.status;
        const parseCsv = (raw) => (raw && ID_CSV.test(raw)) ? raw.split(',').map(Number) : [];
        return {
            status,
            projects:     parseCsv(params.projects),
            managers:     parseCsv(params.managers),
            customers:    parseCsv(params.customers),
            subsidiaries: parseCsv(params.subsidiaries)
        };
    };

    const _countActiveFilters = (filters) => {
        let n = 0;
        if (filters.status !== 'active') n++;
        if (filters.projects.length)     n++;
        if (filters.managers.length)     n++;
        if (filters.customers.length)    n++;
        if (filters.subsidiaries.length) n++;
        return n;
    };

    // ─── Server-side helpers ─────────────────────────────────────────────────

    const resolveDataUrl = (mode, range, filters) => {
        const base = url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: {
                action:       'portfolio',
                mode:         mode || 'cash',
                startPeriod:  range.startPeriod,
                endPeriod:    range.endPeriod,
                status:       filters.status,
                projects:     filters.projects.join(','),
                managers:     filters.managers.join(','),
                customers:    filters.customers.join(','),
                subsidiaries: filters.subsidiaries.join(',')
            }
        });
        return base;
    };

    /**
     * Date-range picker — verbatim port of the version from the report SLs.
     */
    const buildPicker = (range) => {
        const label = `${_periodLabelShort(range.startPeriod)} – ${_periodLabelShort(range.endPeriod)}`;
        const months = _monthsBetween(range.startPeriod, range.endPeriod);
        const activeChip = (months === 8 || months === 12 || months === 18 || months === 24) ? String(months) : '';
        const chip = (n) => `<button type="button" data-preset="${n}"${activeChip === String(n) ? ' class="active"' : ''}>${n} months</button>`;
        return `
            <div class="bccf-daterange" id="bccf-daterange"
                 data-start="${UI.esc(range.startPeriod)}"
                 data-end="${UI.esc(range.endPeriod)}">
                <button type="button" class="bccf-daterange-trigger" data-action="open-daterange">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span class="bccf-daterange-label">${UI.esc(label)}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="bccf-daterange-panel" style="display:none">
                    <h4>Quick ranges</h4>
                    <div class="bccf-daterange-presets">${chip(8)}${chip(12)}${chip(18)}${chip(24)}</div>
                    <h4>Custom range</h4>
                    <div class="bccf-daterange-custom">
                        <div>
                            <label>From</label>
                            <input type="month" data-input="from" value="${UI.esc(range.startPeriod)}" />
                        </div>
                        <div>
                            <label>To</label>
                            <input type="month" data-input="to" value="${UI.esc(range.endPeriod)}" />
                        </div>
                    </div>
                    <div class="bccf-daterange-actions">
                        <span class="bccf-daterange-hint">Limit: 24 months</span>
                        <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-daterange">Apply</button>
                    </div>
                </div>
            </div>`;
    };

    // Filters pill renders in Task 12. Placeholder here:
    const buildFiltersPicker = (filters) => '<!-- filters pill placeholder; lands in Task 12 -->';

    const buildHeader = (mode, range, filters) => {
        const modeLabel = mode === 'accrual' ? 'Accrual' : 'Cash';
        const pill = `<span class="bccf-badge brand bccf-title-pill">${UI.esc(modeLabel)} basis</span>`;
        const toggle = UI.toggle({
            id: 'mode',
            options: [
                { value: 'cash',    label: 'Cash' },
                { value: 'accrual', label: 'Accrual' }
            ],
            activeValue: mode || 'cash'
        });

        const headerLeft = `
            <div style="display:flex;align-items:center;gap:10px">
                <h1 style="margin:0;font-size:var(--bccf-text-xl);font-weight:700;color:var(--bccf-ink-900)">
                    Portfolio Cash Flow
                </h1>
                ${pill}
            </div>`;

        const headerRight = `
            <div style="display:flex;align-items:center;gap:8px">
                ${buildPicker(range)}
                ${buildFiltersPicker(filters)}
                ${toggle}
                <button type="button" class="bccf-btn" data-action="refresh" title="Refresh">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>`;

        return UI.panel({ header: headerLeft + headerRight });
    };

    // ─── Skeleton regions ────────────────────────────────────────────────────

    const buildSkeletonKpis = () => {
        const labels = ['Total Revenue', 'Total Cost', 'Net Cash Flow', 'Margin'];
        let cards = '';
        labels.forEach(label => {
            cards += `<div class="bccf-kpi">
                <div class="bccf-k">${UI.esc(label)}</div>
                <div class="bccf-v"><span class="bccf-skel" style="display:block;width:140px;height:24px;margin-top:4px"></span></div>
                <div class="bccf-sub"><span class="bccf-skel" style="display:block;width:100px;height:11px;margin-top:6px"></span></div>
            </div>`;
        });
        return `<div id="bccf-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
            ${cards}
        </div>`;
    };

    const buildSkeletonChart = () => {
        return `<div id="bccf-chart">${UI.panel({
            header: `<span style="font-size:var(--bccf-text-base);font-weight:600;color:var(--bccf-ink-900)">Monthly portfolio cash flow</span>`,
            body: UI.skeletonChart(6)
        })}</div>`;
    };

    const buildSkeletonTable = () => {
        const headerRow = '<tr><th>Project</th>' + Array(6).fill('<th></th>').join('') + '<th>Total</th></tr>';
        const skelRows = UI.skeletonRows(8, 5);
        return `<div id="bccf-table">${UI.panel({
            body: `<div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:var(--bccf-text-sm)">
                    <thead>${headerRow}</thead>
                    <tbody>${skelRows}</tbody>
                </table>
            </div>`
        })}</div>`;
    };

    // ─── Client-side JS (filled out in Tasks 13–16) ──────────────────────────

    /* eslint-disable */
    const CLIENT_SCRIPT = `
(function () {
    'use strict';

    // Double-evaluation guard
    if (window.__bccfWiredPortfolio) return;
    window.__bccfWiredPortfolio = true;

    // Implementation lands in Tasks 13–16:
    //   - Task 13: fetch + render KPIs/chart/table
    //   - Task 14: sort plumbing
    //   - Task 15: Filters pill JS (open/close, status, chips, Apply)
    //   - Task 16: populate Filters dropdowns from data.availableProjects etc.

})();
`;
    /* eslint-enable */

    // ─── Entry Point ─────────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;

        if (request.method !== 'GET') {
            response.write('Method not allowed');
            return;
        }

        try {
            const params = request.parameters || {};
            const mode = params.mode === 'accrual' ? 'accrual' : 'cash';
            const range = _resolveRangeOrDefault(params.startPeriod, params.endPeriod);
            const filters = _resolveFiltersOrDefault(params);
            const dataUrl = resolveDataUrl(mode, range, filters);

            const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Portfolio Cash Flow</title>
    ${Styles.getStyles()}
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { padding: 16px; background: var(--bccf-bg-50); }
        .bccf-layout { display: flex; flex-direction: column; gap: 16px; }
        table tbody tr:hover { background: var(--bccf-bg-50); }
        .bccf-kpi.accent .bccf-v { color: inherit; }
    </style>
</head>
<body data-data-url="${UI.esc(dataUrl)}">
    <div id="bccf-toast-host"></div>
    <div class="bccf-layout">
        ${buildHeader(mode, range, filters)}
        ${buildSkeletonKpis()}
        ${buildSkeletonChart()}
        ${buildSkeletonTable()}
    </div>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;

            response.write(html);

        } catch (e) {
            log.error({ title: MODULE + '.onRequest', details: `${e.name}: ${e.message}\n${e.stack}` });
            response.write(
                `<!doctype html><html><body style="font-family:sans-serif;padding:40px">
                    <div class="bccf-error-card" style="border-left:4px solid #c2361d;padding:14px 16px">
                        <h3 style="color:#c2361d;margin:0 0 8px">Portfolio Cash Flow Error</h3>
                        <p style="color:#2f3742">${UI.esc(e.message)}</p>
                    </div>
                </body></html>`
            );
        }
    };

    return { onRequest };
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: all 8 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 289 tests / 10 suites pass (281 + 8 new in a new suite).

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js tests/entry_points/bc_cf_portfolio_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_portfolio_sl): shell-only server-render scaffold

Full HTML page: <head> with shared styles + page CSS, <body> with toast
host + flex layout container holding header (title + Cash basis pill +
date picker + filter-pill placeholder + Cash/Accrual toggle + Refresh)
+ KPI skeleton strip + chart skeleton + table skeleton. Server-side
helpers: _resolveRangeOrDefault (reused), _resolveFiltersOrDefault,
_countActiveFilters, resolveDataUrl, buildPicker (date — verbatim),
buildHeader, buildSkeletonKpis/Chart/Table. CLIENT_SCRIPT is empty IIFE
shell for Tasks 13–16. Filters pill HTML is placeholder for Task 12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Server-render the Filters pill

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`
- Modify: `tests/entry_points/bc_cf_portfolio_sl.test.js`

Replaces the placeholder `buildFiltersPicker` with a real implementation. Server-side renders the trigger pill (with active-filters badge), the dropdown panel (status segmented control + 4 multi-select chip slots + Reset/Apply footer), and any existing chips based on URL filter state. The chip dropdowns' option lists are placeholders that the client fills in once JSON arrives.

- [ ] **Step 1: Add failing tests**

Append to `tests/entry_points/bc_cf_portfolio_sl.test.js`, inside the existing `describe('bc_cf_portfolio_sl — shell structure', ...)` block:

```js
        it('renders the Filters pill trigger', () => {
            expect(body).toContain('class="bccf-filters"');
            expect(body).toContain('data-action="open-filters"');
        });

        it('renders the 4 status segmented buttons with Active default-active', () => {
            expect(body).toMatch(/data-status="active"[^>]*class="active"/);
            expect(body).toContain('data-status="hold"');
            expect(body).toContain('data-status="closed"');
            expect(body).toContain('data-status="all"');
        });

        it('renders 4 empty chip slots for projects/managers/customers/subsidiaries', () => {
            expect(body).toContain('data-dim="projects"');
            expect(body).toContain('data-dim="managers"');
            expect(body).toContain('data-dim="customers"');
            expect(body).toContain('data-dim="subsidiaries"');
        });

        it('renders Reset all + Apply buttons', () => {
            expect(body).toContain('data-action="reset-filters"');
            expect(body).toContain('data-action="apply-filters"');
        });

        it('badge shows zero active filters by default', () => {
            expect(body).toMatch(/Filters[^<]*<\/span>/);
        });
    });

    describe('with status=hold + projects=1807,2104', () => {
        let body;
        beforeEach(() => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({ status: 'hold', projects: '1807,2104' }), response: res });
            body = res.getBody();
        });

        it('renders 2 active filter chips for projects', () => {
            // Two <span class="bccf-chip"> with data-id values 1807 and 2104
            expect(body).toContain('data-id="1807"');
            expect(body).toContain('data-id="2104"');
        });

        it('marks Hold status active', () => {
            expect(body).toMatch(/data-status="hold"[^>]*class="active"/);
        });

        it('badge reflects 2 active filter dimensions (status + projects)', () => {
            expect(body).toMatch(/2\s*active/i);
        });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: ~7 new tests fail.

- [ ] **Step 3: Replace `buildFiltersPicker` with the full implementation**

In `bc_cf_portfolio_sl.js`, locate the placeholder line:

```js
    const buildFiltersPicker = (filters) => '<!-- filters pill placeholder; lands in Task 12 -->';
```

Replace it with:

```js
    /**
     * Server-renders the Filters pill (trigger + panel). Each chip dimension's
     * existing selections render as chips at server-time; option dropdowns
     * are placeholders until the client populates them from data.availableX.
     * Spec §3.5.
     */
    const buildFiltersPicker = (filters) => {
        const activeCount = _countActiveFilters(filters);
        const badge = activeCount > 0 ? `Filters · ${activeCount} active` : 'Filters';

        // Status segmented control
        const statusBtn = (val, label) => {
            const cls = filters.status === val ? ' class="active"' : '';
            return `<button type="button" data-status="${val}"${cls}>${label}</button>`;
        };

        // Multi-select chip slot — chips for existing selections, empty <select> for adds (client fills).
        const chipSlot = (dim, ids) => {
            const chips = ids.map((id) =>
                `<span class="bccf-chip" data-id="${id}">#${id}<button type="button" class="bccf-chip-x" data-action="remove-chip" data-dim="${dim}" data-id="${id}">×</button></span>`
            ).join('');
            return `<div class="bccf-filters-chips" data-dim="${dim}">${chips}<select class="bccf-filters-add" data-dim="${dim}"><option value="">+ Add…</option></select></div>`;
        };

        return `
            <div class="bccf-filters" id="bccf-filters" data-active-count="${activeCount}">
                <button type="button" class="bccf-filters-trigger" data-action="open-filters">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    <span class="bccf-filters-label">${UI.esc(badge)}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="bccf-filters-panel" style="display:none">
                    <h4>Status</h4>
                    <div class="bccf-filters-status">
                        ${statusBtn('active', 'Active')}
                        ${statusBtn('hold', 'On Hold')}
                        ${statusBtn('closed', 'Closed')}
                        ${statusBtn('all', 'All')}
                    </div>

                    <h4>Project</h4>
                    ${chipSlot('projects', filters.projects)}

                    <h4>Project Manager</h4>
                    ${chipSlot('managers', filters.managers)}

                    <h4>Customer</h4>
                    ${chipSlot('customers', filters.customers)}

                    <h4>Subsidiary</h4>
                    ${chipSlot('subsidiaries', filters.subsidiaries)}

                    <div class="bccf-filters-actions">
                        <button type="button" class="bccf-btn bccf-btn-ghost" data-action="reset-filters">Reset all</button>
                        <button type="button" class="bccf-btn bccf-btn-pri" data-action="apply-filters">Apply</button>
                    </div>
                </div>
            </div>`;
    };
```

Notes:
- The chips show `#<id>` initially (e.g. "#1807") because the server doesn't know the project names yet. The client replaces these with real names once `data.availableProjects` etc. arrive (Task 16).
- `data-active-count` on the `.bccf-filters` root lets the client update the badge count on chip add/remove without server round-trips.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 295 tests / 10 suites pass (289 + ~7 new).

- [ ] **Step 5: Deploy the shell SL for manual smoke**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js"
```

Hit the deployment URL in NS:
```
/app/site/hosting/scriptlet.nl?script=customscript_bc_cf_portfolio_sl&deploy=customdeploy_bc_cf_portfolio_sl
```

Expected: HTML page with title "Portfolio Cash Flow", Cash basis pill, date picker + Filters pill + Cash/Accrual toggle + Refresh in header; 4 KPI skeleton cards; chart skeleton; table skeleton. Clicking the Filters pill does nothing yet (JS lands in Task 15). Clicking the date picker DOES open (its JS shipped with E1).

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js tests/entry_points/bc_cf_portfolio_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_portfolio_sl): server-rendered Filters pill

Trigger pill with active-filter count badge. Dropdown panel with 4-button
status segmented control (default-active = 'active'), 4 chip slots
(projects/managers/customers/subsidiaries) — chips for current URL state,
empty <select> dropdowns the client populates from JSON. Reset all +
Apply footer. data-active-count attribute on root for client-side badge
updates without server round-trip. Spec §3.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Client-side: fetch, render, sort, filter behavior

**Goal of phase:** Fill in the empty `CLIENT_SCRIPT` IIFE with the full client behavior — fetch + render KPIs/chart/table, sort plumbing, filters pill JS, populate dropdowns from JSON.

**Phase exit criteria:** All 4 client behaviors wired; manual sandbox shows the SL with real data, sortable columns, working filters; drilling into a project link opens the BC Project record.

---

### Task 13: Fetch + render KPIs / chart / table

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`
- Modify: `tests/entry_points/bc_cf_portfolio_sl.test.js`

Fills the `CLIENT_SCRIPT` IIFE with the fetch + render path: `loadData(url)` → `renderKpis(kpis, portfolioTotals)` → `renderChart(periods, series, cumulativeBefore)` → `renderTable(periods, projects)`. The chart code is a verbatim port of Combined's `renderChart` (paired Revenue+Cost bars + cumulative-net trend line), driven by `data.portfolioRevenuePerPeriod` / `portfolioCostPerPeriod` / `portfolioNetPerPeriod` / `cumulativeBefore`. The table is new — one row per project.

- [ ] **Step 1: Add failing tests**

Append to `tests/entry_points/bc_cf_portfolio_sl.test.js`, inside `describe('bc_cf_portfolio_sl — shell structure', ...)`:

```js
        it('CLIENT_SCRIPT defines loadData / renderKpis / renderChart / renderTable', () => {
            expect(body).toMatch(/function loadData\(/);
            expect(body).toMatch(/function renderKpis\(/);
            expect(body).toMatch(/function renderChart\(/);
            expect(body).toMatch(/function renderTable\(/);
        });

        it('CLIENT_SCRIPT references the portfolio response fields', () => {
            expect(body).toMatch(/data\.projects\b/);
            expect(body).toMatch(/portfolioRevenuePerPeriod/);
            expect(body).toMatch(/portfolioCostPerPeriod/);
            expect(body).toMatch(/cumulativeBefore/);
            expect(body).toMatch(/portfolioTotals/);
        });

        it('renderTable emits project rows with target="_top" drill-in links', () => {
            // The renderTable function generates <a> links to the BC project record
            expect(body).toMatch(/customrecord_cseg_bc_project/);
            expect(body).toMatch(/target="_top"/);
        });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: 3 new tests fail.

- [ ] **Step 3: Replace the empty `CLIENT_SCRIPT` IIFE**

In `bc_cf_portfolio_sl.js`, replace the entire `const CLIENT_SCRIPT = \`...\`;` block with:

```js
    /* eslint-disable */
    const CLIENT_SCRIPT = `
(function () {
    'use strict';

    // ── Double-evaluation guard ──────────────────────────────────────────────
    if (window.__bccfWiredPortfolio) return;
    window.__bccfWiredPortfolio = true;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function fmtCurrency(n) {
        var abs = Math.abs(n);
        var formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (n < 0 ? '\\u2212' : '') + '$' + formatted;
    }
    function fmtPct(n) {
        return (n < 0 ? '\\u2212' : '') + Math.abs(n).toFixed(1) + '%';
    }
    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function currentYYYYMM() {
        var now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    function labelToYYYYMM(label) {
        var MONTHS = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
        var parts = label.split(' ');
        if (parts.length < 2) return '';
        return parts[1] + '-' + (MONTHS[parts[0]] || '00');
    }

    // ── Render KPIs ──────────────────────────────────────────────────────────

    function renderKpis(kpis, portfolioTotals) {
        portfolioTotals = portfolioTotals || { revenue: 0, cost: 0, net: 0, margin: 0 };
        var netColor = kpis.netCashFlow >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
        return '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(kpis.totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(portfolioTotals.revenue)) + ' portfolio total</div>'
            + '</div>'
            + '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Cost</div>'
                + '<div class="bccf-v" style="color:var(--bccf-cost-500)">' + esc(fmtCurrency(kpis.totalCost)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(portfolioTotals.cost)) + ' portfolio total</div>'
            + '</div>'
            + '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Net Cash Flow</div>'
                + '<div class="bccf-v" style="color:' + netColor + '">' + esc(fmtCurrency(kpis.netCashFlow)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(portfolioTotals.net)) + ' portfolio / ' + esc(fmtPct(portfolioTotals.margin)) + ' overall</div>'
            + '</div>'
            + '<div class="bccf-kpi">'
                + '<div class="bccf-k">Margin</div>'
                + '<div class="bccf-v">' + esc(fmtPct(kpis.margin)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtPct(portfolioTotals.margin)) + ' portfolio overall</div>'
            + '</div>';
    }

    // ── Render Chart ─────────────────────────────────────────────────────────
    // Verbatim port of Combined's renderChart, driven by portfolio aggregates.

    function renderChart(periods, revPerPeriod, costPerPeriod, cumulativeBefore) {
        var BAR_MAX_H = 140;
        var allAmounts = (revPerPeriod || []).concat(costPerPeriod || []);
        var maxAmt = allAmounts.reduce(function(m, v) { return Math.max(m, v); }, 1);
        function barH(v) { return Math.max(2, Math.round((v / maxAmt) * BAR_MAX_H)); }
        var curYYYYMM = currentYYYYMM();

        var barCols = periods.map(function(label, i) {
            var rev = revPerPeriod[i] || 0;
            var cost = costPerPeriod[i] || 0;
            var isNow = labelToYYYYMM(label) === curYYYYMM;
            var haloStyle = isNow ? 'background:var(--bccf-brand-50);border-radius:6px 6px 0 0;' : '';
            return '<div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;flex:1;min-width:48px;height:' + BAR_MAX_H + 'px;' + haloStyle + '">'
                + '<div style="display:flex;align-items:flex-end;gap:2px">'
                    + '<div class="bccf-bar" data-tip="Revenue: ' + esc(fmtCurrency(rev)) + '" style="width:16px;height:' + barH(rev) + 'px;background:var(--bccf-brand-500);border-radius:3px 3px 0 0"></div>'
                    + '<div class="bccf-bar" data-tip="Cost: ' + esc(fmtCurrency(cost)) + '" style="width:16px;height:' + barH(cost) + 'px;background:var(--bccf-cost-500);border-radius:3px 3px 0 0"></div>'
                + '</div>'
            + '</div>';
        });

        var labelCols = periods.map(function(label, i) {
            var isNow = labelToYYYYMM(label) === curYYYYMM;
            var haloStyle = isNow ? 'background:var(--bccf-brand-50);border-radius:0 0 6px 6px;' : '';
            return '<div style="flex:1;min-width:48px;text-align:center;font-size:11px;color:var(--bccf-ink-500);padding:6px 0;' + haloStyle + '">' + esc(label) + '</div>';
        });

        // Cumulative net trend line
        var net = periods.map(function(_, i) { return (revPerPeriod[i] || 0) - (costPerPeriod[i] || 0); });
        var carry = Number(cumulativeBefore) || 0;
        var cumNet = net.reduce(function(acc, n) {
            var prev = acc.length === 0 ? carry : acc[acc.length - 1];
            acc.push(prev + n);
            return acc;
        }, []);
        var cumMax = Math.max(0, Math.max.apply(null, cumNet));
        var cumMin = Math.min(0, Math.min.apply(null, cumNet));
        var cumRange = (cumMax - cumMin) || 1;
        var trendPoints = cumNet.map(function(v, i) {
            var x = (i + 0.5) / periods.length * 100;
            var y = 100 - ((v - cumMin) / cumRange) * 100;
            return { x: x, y: y, value: v, label: periods[i] };
        });
        var polyPoints = trendPoints.map(function(p) { return p.x + ',' + p.y; }).join(' ');
        var dotsHtml = trendPoints.map(function(p) {
            var color = p.value >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<span class="bccf-trend-dot" data-tip="' + esc(fmtCurrency(p.value)) + '" style="position:absolute;left:' + p.x + '%;top:' + p.y + '%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 2px var(--bccf-surface);"></span>';
        }).join('');
        var svgOverlay = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">'
            + '<polyline points="' + polyPoints + '" fill="none" stroke="var(--bccf-success-500)" stroke-width="2" vector-effect="non-scaling-stroke" />'
            + '</svg>'
            + dotsHtml;

        var legend = '<div style="display:flex;align-items:center;gap:16px;font-size:12px;color:var(--bccf-ink-500)">'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-brand-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Revenue</span>'
            + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--bccf-cost-500);border-radius:2px;vertical-align:middle;margin-right:6px"></span>Cost</span>'
            + '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="18" height="6" viewBox="0 0 18 6" style="display:block"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--bccf-success-500)" stroke-width="2" /><circle cx="9" cy="3" r="1.6" fill="var(--bccf-success-500)" /></svg>Cumulative Net</span>'
        + '</div>';
        var headerHtml = '<div style="font-weight:600">Monthly portfolio cash flow</div>' + legend;

        var barsHtml = '<div>'
            + '<div style="position:relative">'
                + '<div style="display:flex;align-items:flex-end;gap:8px;padding:16px 0 0">' + barCols.join('') + '</div>'
                + svgOverlay
            + '</div>'
            + '<div style="display:flex;gap:8px">' + labelCols.join('') + '</div>'
        + '</div>';

        return '<div class="bccf-panel" style="margin-bottom:16px">'
            + '<div class="bccf-panel-header">' + headerHtml + '</div>'
            + '<div class="bccf-panel-body">' + barsHtml + '</div>'
        + '</div>';
    }

    // ── Render Table — one row per project ───────────────────────────────────

    function renderTable(periods, projects) {
        if (!projects || !projects.length) {
            return '<div class="bccf-panel">'
                + '<div class="bccf-panel-body" style="padding:24px;text-align:center;color:var(--bccf-ink-500)">No projects match these filters.</div>'
            + '</div>';
        }

        var headCols = periods.map(function(p) {
            return '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap">' + esc(p) + '</th>';
        }).join('');
        var thead = '<thead><tr>'
            + '<th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--bccf-ink-500)">Project</th>'
            + headCols
            + '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500)">Total</th>'
        + '</tr></thead>';

        function projectRow(proj) {
            var cells = proj.net.map(function(v) {
                var color = v > 0 ? 'var(--bccf-success-500)' : (v < 0 ? 'var(--bccf-danger-500)' : 'var(--bccf-ink-500)');
                return '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);color:' + color + ';font-variant-numeric:tabular-nums">'
                    + esc(fmtCurrency(v)) + '</td>';
            }).join('');
            var totalColor = proj.netTotal > 0 ? 'var(--bccf-success-500)' : (proj.netTotal < 0 ? 'var(--bccf-danger-500)' : 'var(--bccf-ink-700)');
            var href = '/app/common/custom/custrecordentry.nl?rectype=customrecord_cseg_bc_project&id=' + encodeURIComponent(proj.id);
            return '<tr>'
                + '<td style="padding:6px 12px;font-size:var(--bccf-text-sm)">'
                    + '<a href="' + href + '" target="_top" style="color:var(--bccf-brand-500);text-decoration:none">' + esc(proj.name) + '</a>'
                + '</td>'
                + cells
                + '<td style="padding:6px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + totalColor + ';font-variant-numeric:tabular-nums">' + esc(fmtCurrency(proj.netTotal)) + '</td>'
            + '</tr>';
        }

        var rows = projects.map(projectRow).join('');

        // Portfolio Net tfoot row
        var portfolioNetCells = periods.map(function(_, i) {
            var net = projects.reduce(function(s, p) { return s + (p.net[i] || 0); }, 0);
            var color = net >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
            return '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:600;color:' + color + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(net)) + '</td>';
        }).join('');
        var grandNet = projects.reduce(function(s, p) { return s + p.netTotal; }, 0);
        var grandColor = grandNet >= 0 ? 'var(--bccf-success-500)' : 'var(--bccf-danger-500)';
        var tfoot = '<tfoot><tr>'
            + '<td style="padding:8px 12px;font-size:var(--bccf-text-sm);font-weight:700;color:var(--bccf-ink-900);border-top:2px solid var(--bccf-border)">Portfolio Net</td>'
            + portfolioNetCells
            + '<td style="padding:8px 12px;text-align:right;font-size:var(--bccf-text-sm);font-weight:700;color:' + grandColor + ';border-top:2px solid var(--bccf-border);font-variant-numeric:tabular-nums">' + esc(fmtCurrency(grandNet)) + '</td>'
        + '</tr></tfoot>';

        return '<div class="bccf-panel">'
            + '<div class="bccf-panel-body" style="padding:0;overflow-x:auto">'
                + '<table style="width:100%;border-collapse:collapse">' + thead + '<tbody>' + rows + '</tbody>' + tfoot + '</table>'
            + '</div>'
        + '</div>';
    }

    // ── Fetch + render ───────────────────────────────────────────────────────

    var _lastDataUrl = null;
    var _lastData = null;

    function loadData(dataUrl) {
        _lastDataUrl = dataUrl;
        fetch(dataUrl)
            .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
            .then(function(data) {
                if (!data.ok) throw new Error(data.error || 'Data SL returned ok:false');
                _lastData = data;
                var kpiEl   = document.getElementById('bccf-kpis');
                var chartEl = document.getElementById('bccf-chart');
                var tableEl = document.getElementById('bccf-table');
                if (kpiEl)   kpiEl.innerHTML   = renderKpis(data.kpis, data.portfolioTotals);
                if (chartEl) chartEl.innerHTML = renderChart(data.periods, data.portfolioRevenuePerPeriod, data.portfolioCostPerPeriod, data.cumulativeBefore);
                if (tableEl) tableEl.innerHTML = renderTable(data.periods, data.projects);
            })
            .catch(function(err) {
                var msg = err.message || String(err);
                var kpiEl = document.getElementById('bccf-kpis');
                if (kpiEl) kpiEl.innerHTML = '<div class="bccf-error-card" style="grid-column:1/-1"><h4>Couldn\\u2019t load portfolio</h4><pre>' + esc(msg) + '</pre><button type="button" class="bccf-btn" data-action="retry">Retry</button></div>';
            });
    }

    // ── Mode toggle (Cash/Accrual) — same pattern as report SLs ──────────────
    function swapModeUrl(currentUrl, newMode) {
        var u = new URL(currentUrl, window.location.href);
        u.searchParams.set('mode', newMode);
        return u.toString();
    }
    document.addEventListener('click', function(e) {
        var toggleBtn = e.target.closest('[data-toggle-id="mode"] button');
        if (toggleBtn) {
            if (toggleBtn.classList.contains('active')) return;
            var newMode = toggleBtn.dataset.value;
            if (!newMode || !_lastDataUrl) return;
            toggleBtn.closest('.bccf-toggle').querySelectorAll('button').forEach(function(b) {
                b.classList.toggle('active', b.dataset.value === newMode);
            });
            loadData(swapModeUrl(_lastDataUrl, newMode));
            try {
                var iframeUrl = new URL(window.location.href);
                iframeUrl.searchParams.set('mode', newMode);
                history.replaceState(null, '', iframeUrl.toString());
            } catch (err) { /* iframe history may be restricted */ }
            return;
        }
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'refresh' || btn.dataset.action === 'retry') {
            if (_lastDataUrl) loadData(_lastDataUrl);
        }
    });

    // ── Boot ─────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function() {
        var dataUrl = document.body.dataset.dataUrl;
        if (dataUrl) loadData(dataUrl);
    });

})();
`;
    /* eslint-enable */
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 298 tests / 10 suites pass (295 + 3 new).

- [ ] **Step 5: Deploy + manual smoke**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js"
```

Open the Portfolio SL URL in NS. Expected: real data flows in — KPIs populated, chart with bars + trend line, table with one row per BC project that has timing data, project name links to the BC project record. Default sort: newest project createdDate first.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js tests/entry_points/bc_cf_portfolio_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_portfolio_sl): client fetch + render KPIs/chart/table

CLIENT_SCRIPT IIFE: fetch JSON from bc_cf_data_sl?action=portfolio,
renderKpis (4 cards with portfolio-total sublines), renderChart (verbatim
port of Combined's paired-bars + trend pattern, driven by aggregated
portfolio series + cumulativeBefore), renderTable (one row per project,
net per period cell color-coded by sign, project name link to BC project
record via target=_top, Portfolio Net tfoot row). Mode toggle + Refresh
wired (re-fetch + history.replaceState). Sort plumbing in Task 14;
filter pill JS in Task 15.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Sort plumbing (port from E1.5)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`
- Modify: `tests/entry_points/bc_cf_portfolio_sl.test.js`

Adds `_sortState`, `sortLines` (works on the projects array — each item has `name`, `net` amounts, `netTotal`, `createdDate`), `headerCell`-based thead rendering with `data-sort-col` + ▼/▲ indicator, click handler with 2-state Project / 3-state Period+Total toggle. Verbatim port of E1.5 with two adaptations: column key is `'project'` instead of `'source'`, and the comparator operates on each project's `net` array instead of an `amounts` array.

- [ ] **Step 1: Add failing tests**

Append to the same describe block in `tests/entry_points/bc_cf_portfolio_sl.test.js`:

```js
        it('declares _sortState defaulting to project desc', () => {
            expect(body).toMatch(/var\s+_sortState\s*=\s*\{\s*col:\s*['"]project['"]\s*,\s*dir:\s*['"]desc['"]\s*\}/);
        });
        it('declares sortLines function', () => {
            expect(body).toMatch(/function sortLines\(projects,\s*periods,\s*sortState\)/);
        });
        it('emits data-sort-col on Project and Total headers', () => {
            // The sortable headerCell helper emits data-sort-col + ▼/▲ on active
            expect(body).toMatch(/data-sort-col="project"/);
            expect(body).toMatch(/data-sort-col="total"/);
        });
        it('wires sort click handler for [data-sort-col]', () => {
            expect(body).toMatch(/closest\(['"]\[data-sort-col\]['"]\)/);
        });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: 4 new tests fail.

- [ ] **Step 3: Inject the sort plumbing into `CLIENT_SCRIPT`**

In `bc_cf_portfolio_sl.js`, inside the `CLIENT_SCRIPT` IIFE, find the `// ── Mode toggle ──` comment (the section added in Task 13). IMMEDIATELY BEFORE that comment, insert this new block:

```js
    // ── Sortable headers (port of E1.5 spec §3.3, adapted for project rows) ──

    var _sortState = { col: 'project', dir: 'desc' };

    /**
     * Sort projects array by sortState. Never mutates input.
     * - col='project' → compare createdDate (newest first by default)
     * - col='total'   → compare netTotal
     * - col=<period>  → compare net[periodIdx]
     * - null createdDate sorts to end on project column
     */
    function sortLines(projects, periods, sortState) {
        if (!projects || !projects.length) return projects;
        var sorted = projects.slice();
        var dir = sortState.dir === 'asc' ? 1 : -1;

        sorted.sort(function(a, b) {
            var va, vb;
            if (sortState.col === 'project') {
                va = a.createdDate;
                vb = b.createdDate;
                if (va === null && vb === null) return 0;
                if (va === null) return 1;
                if (vb === null) return -1;
                return va < vb ? -dir : (va > vb ? dir : 0);
            }
            if (sortState.col === 'total') {
                va = a.netTotal || 0;
                vb = b.netTotal || 0;
            } else {
                var idx = periods.indexOf(sortState.col);
                if (idx === -1) return 0;
                va = (a.net && a.net[idx]) || 0;
                vb = (b.net && b.net[idx]) || 0;
            }
            return va < vb ? -dir : (va > vb ? dir : 0);
        });

        return sorted;
    }

    // Click handler — 2-state on Project, 3-state on Period/Total.
    document.addEventListener('click', function(e) {
        var th = e.target.closest('[data-sort-col]');
        if (!th) return;
        var col = th.dataset.sortCol;
        var was = _sortState;
        if (col === 'project') {
            _sortState = (was.col === 'project' && was.dir === 'desc')
                ? { col: 'project', dir: 'asc' }
                : { col: 'project', dir: 'desc' };
        } else {
            if (was.col !== col) {
                _sortState = { col: col, dir: 'desc' };
            } else if (was.dir === 'desc') {
                _sortState = { col: col, dir: 'asc' };
            } else {
                _sortState = { col: 'project', dir: 'desc' };
            }
        }
        if (_lastData) {
            var tableEl = document.getElementById('bccf-table');
            if (tableEl) tableEl.innerHTML = renderTable(_lastData.periods, _lastData.projects);
        }
    });
```

- [ ] **Step 4: Update `renderTable` to sort + emit `data-sort-col`**

In the same `CLIENT_SCRIPT`, locate `function renderTable(periods, projects) {`. Update the function body:

Find:
```js
        if (!projects || !projects.length) {
            return '<div class="bccf-panel">...';
        }

        var headCols = periods.map(function(p) {
            return '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap">' + esc(p) + '</th>';
        }).join('');
        var thead = '<thead><tr>'
            + '<th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--bccf-ink-500)">Project</th>'
            + headCols
            + '<th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--bccf-ink-500)">Total</th>'
        + '</tr></thead>';
```

Replace with:

```js
        // E1.5-style sortable thead: each <th> carries data-sort-col + ▼/▲ on active.
        // Fixed sort keys for static columns: data-sort-col="project" data-sort-col="total"
        function headerCell(labelText, sortKey, align) {
            var isActive = _sortState.col === sortKey;
            var glyph = _sortState.dir === 'desc' ? '▼' : '▲';
            var indicator = isActive
                ? '<span style="margin-left:4px;color:var(--bccf-brand-500)">' + glyph + '</span>'
                : '';
            var alignStyle = align === 'left' ? 'text-align:left' : 'text-align:right';
            return '<th data-sort-col="' + esc(sortKey) + '" style="padding:8px 12px;font-size:12px;color:var(--bccf-ink-500);white-space:nowrap;cursor:pointer;user-select:none;' + alignStyle + '">'
                + esc(labelText) + indicator
                + '</th>';
        }

        // Sort projects by current sort state (never mutates input).
        var sorted = sortLines(projects, periods, _sortState);

        if (!sorted || !sorted.length) {
            return '<div class="bccf-panel">'
                + '<div class="bccf-panel-body" style="padding:24px;text-align:center;color:var(--bccf-ink-500)">No projects match these filters.</div>'
            + '</div>';
        }

        var headCols = periods.map(function(p) { return headerCell(p, p, 'right'); }).join('');
        var thead = '<thead><tr>'
            + headerCell('Project', 'project', 'left')
            + headCols
            + headerCell('Total', 'total', 'right')
        + '</tr></thead>';
```

Then find:
```js
        var rows = projects.map(projectRow).join('');
```

Replace with:
```js
        var rows = sorted.map(projectRow).join('');
```

And update the `portfolioNetCells` calculation to use `sorted`:
```js
        var portfolioNetCells = periods.map(function(_, i) {
            var net = sorted.reduce(function(s, p) { return s + (p.net[i] || 0); }, 0);
            ...
        }).join('');
        var grandNet = sorted.reduce(function(s, p) { return s + p.netTotal; }, 0);
```

(Sum is order-independent so this is just defensive — the totals row stays correct regardless.)

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 302 tests / 10 suites pass (298 + 4 new).

- [ ] **Step 6: Deploy + manual smoke**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js"
```

In sandbox: refresh Portfolio SL. Click Project header → indicator ▼ active; click again → ▲, rows reverse. Click a period column → 3-state cycle ranks projects by spend in that month.

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js tests/entry_points/bc_cf_portfolio_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_portfolio_sl): sort plumbing — 2-state Project / 3-state Period+Total

_sortState defaults to {col:'project', dir:'desc'} (newest createdDate
first). sortLines comparator handles project/total/period columns; null
createdDate sorts to end. Click handler with 2-state Project toggle
(desc↔asc) and 3-state Period/Total toggle (desc→asc→reset). renderTable
calls sortLines before rendering rows; headerCell emits data-sort-col
+ active ▼/▲ indicator. Spec §3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Filters pill JS — open/close, status, chips, Apply

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`
- Modify: `tests/entry_points/bc_cf_portfolio_sl.test.js`

Adds client behavior for the Filters pill: open/close (trigger + outside-click + Esc), status segmented control (click toggles active class), chip add/remove (click ✕ removes; future Task 16 wires the add `<select>`), Apply → rebuild URL with all filter dimensions → reload.

- [ ] **Step 1: Add failing tests**

Append:

```js
        it('wires Filters pill open/close handler', () => {
            expect(body).toMatch(/data-action="open-filters"/);
            expect(body).toMatch(/Escape|keydown/);
        });

        it('wires Filters Apply → rebuild URL → reload', () => {
            expect(body).toMatch(/data-action="apply-filters"/);
            expect(body).toMatch(/searchParams\.set\(['"]status['"]/);
            expect(body).toMatch(/searchParams\.set\(['"]projects['"]/);
        });

        it('wires Reset all', () => {
            expect(body).toMatch(/data-action="reset-filters"/);
        });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: 3 new tests fail.

- [ ] **Step 3: Add the filters JS block**

In `bc_cf_portfolio_sl.js`'s `CLIENT_SCRIPT`, find the `// ── Sortable headers ──` block (added in Task 14). IMMEDIATELY AFTER its closing `});` (the click handler's closing), insert:

```js
    // ── Filters pill (E2 spec §3.5) ──────────────────────────────────────────

    function filtersEl()   { return document.getElementById('bccf-filters'); }
    function filtersPanel() { var e = filtersEl(); return e ? e.querySelector('.bccf-filters-panel') : null; }
    function filtersBadge() { var e = filtersEl(); return e ? e.querySelector('.bccf-filters-label') : null; }

    function openFilters()  { var p = filtersPanel(); if (p) p.style.display = 'block'; }
    function closeFilters() { var p = filtersPanel(); if (p) p.style.display = 'none'; }

    function readFiltersState() {
        var root = filtersEl();
        if (!root) return null;
        var status = (root.querySelector('.bccf-filters-status button.active') || {}).dataset || {};
        var dims = ['projects', 'managers', 'customers', 'subsidiaries'];
        var out = { status: status.status || 'active' };
        dims.forEach(function(dim) {
            var ids = [];
            root.querySelectorAll('.bccf-filters-chips[data-dim="' + dim + '"] .bccf-chip').forEach(function(chip) {
                ids.push(chip.dataset.id);
            });
            out[dim] = ids;
        });
        return out;
    }

    function updateBadge() {
        var state = readFiltersState();
        if (!state) return;
        var n = 0;
        if (state.status !== 'active') n++;
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            if (state[dim].length) n++;
        });
        var label = filtersBadge();
        if (label) label.textContent = n > 0 ? ('Filters · ' + n + ' active') : 'Filters';
    }

    function applyFilters() {
        var state = readFiltersState();
        if (!state) return;
        var u = new URL(window.location.href);
        u.searchParams.set('status', state.status);
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            if (state[dim].length) u.searchParams.set(dim, state[dim].join(','));
            else u.searchParams.delete(dim);
        });
        window.location.replace(u.toString());
    }

    function resetFilters() {
        var root = filtersEl();
        if (!root) return;
        // Reset status to active
        root.querySelectorAll('.bccf-filters-status button').forEach(function(b) {
            b.classList.toggle('active', b.dataset.status === 'active');
        });
        // Clear all chips
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            var chipSlot = root.querySelector('.bccf-filters-chips[data-dim="' + dim + '"]');
            if (chipSlot) {
                chipSlot.querySelectorAll('.bccf-chip').forEach(function(c) { c.remove(); });
            }
        });
        updateBadge();
        // User still needs to click Apply to take effect.
    }

    // Wire filters events
    document.addEventListener('click', function(e) {
        // Open/close on trigger
        var trigger = e.target.closest('[data-action="open-filters"]');
        if (trigger) {
            var panel = filtersPanel();
            var isOpen = panel && panel.style.display === 'block';
            if (isOpen) closeFilters(); else openFilters();
            return;
        }
        // Status button click
        var statusBtn = e.target.closest('.bccf-filters-status button');
        if (statusBtn) {
            statusBtn.closest('.bccf-filters-status').querySelectorAll('button').forEach(function(b) {
                b.classList.toggle('active', b === statusBtn);
            });
            updateBadge();
            return;
        }
        // Chip remove
        var chipX = e.target.closest('.bccf-chip-x');
        if (chipX) {
            var chip = chipX.closest('.bccf-chip');
            if (chip) chip.remove();
            updateBadge();
            return;
        }
        // Apply / Reset
        if (e.target.closest('[data-action="apply-filters"]')) { applyFilters(); return; }
        if (e.target.closest('[data-action="reset-filters"]')) { resetFilters(); return; }
        // Outside click closes panel
        var f = filtersEl();
        if (f && !f.contains(e.target)) closeFilters();
    }, true);

    // Esc closes panel (shared with date picker — both close on Esc).
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeFilters();
    });
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 305 tests / 10 suites pass.

- [ ] **Step 5: Deploy + manual smoke**

Upload + refresh. Clicking the Filters pill should open the panel. Click status buttons → switches active. Click ✕ on a chip → chip removes. Click Apply → page reloads with new URL params. Outside-click + Esc close.

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js"
```

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js tests/entry_points/bc_cf_portfolio_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_portfolio_sl): Filters pill client behavior

Open/close on trigger (capture-phase, outside-click + Esc close).
Status segmented control (click toggles active class). Chip ✕ removes.
Apply: reads current panel state, rebuilds URL with status + 4 dim CSVs,
window.location.replace → full reload. Reset all: clears chips +
restores Active status (still needs Apply to take effect). Live badge
updates ("Filters · N active") on every state change. Chip Add via
<select> wires up in Task 16 once option lists arrive from JSON.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Populate Filters dropdowns from JSON; chip name resolution

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js`
- Modify: `tests/entry_points/bc_cf_portfolio_sl.test.js`

After the JSON fetch resolves, populate the `<select class="bccf-filters-add">` dropdowns from `data.availableProjects` / etc., and replace the `#1807`-style chip placeholders with real names (e.g., "Bolder Construction Inc.").

- [ ] **Step 1: Add failing tests**

Append:

```js
        it('CLIENT_SCRIPT populates filter dropdowns from data.availableX', () => {
            expect(body).toMatch(/data\.availableProjects/);
            expect(body).toMatch(/data\.availableManagers/);
            expect(body).toMatch(/data\.availableCustomers/);
            expect(body).toMatch(/data\.availableSubsidiaries/);
        });
        it('CLIENT_SCRIPT defines a helper that resolves chip names from option lists', () => {
            // Function name pattern; the actual call sites are inside loadData's success handler
            expect(body).toMatch(/function populateFiltersFromData/);
        });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/entry_points/bc_cf_portfolio_sl.test.js`
Expected: 2 new tests fail.

- [ ] **Step 3: Add `populateFiltersFromData` helper**

In `CLIENT_SCRIPT`, immediately after the existing `// ── Filters pill ──` block (after `keydown` handler), append:

```js
    /**
     * After the JSON fetch resolves: replace #<id> chip placeholders with the
     * real names, and populate the four "Add…" <select> dropdowns from the
     * available* arrays. Omits options for IDs that are already chipped.
     */
    function populateFiltersFromData(data) {
        if (!data) return;
        var nameLookups = {
            projects:     toMap(data.availableProjects),
            managers:     toMap(data.availableManagers),
            customers:    toMap(data.availableCustomers),
            subsidiaries: toMap(data.availableSubsidiaries)
        };
        // Update existing chips
        ['projects', 'managers', 'customers', 'subsidiaries'].forEach(function(dim) {
            var chipSlot = document.querySelector('.bccf-filters-chips[data-dim="' + dim + '"]');
            if (!chipSlot) return;
            chipSlot.querySelectorAll('.bccf-chip').forEach(function(chip) {
                var id = chip.dataset.id;
                var name = nameLookups[dim][id];
                if (name) {
                    // Replace inner text (before the ✕ button) with the resolved name
                    var xBtn = chip.querySelector('.bccf-chip-x');
                    chip.textContent = name + ' ';
                    if (xBtn) chip.appendChild(xBtn);
                }
            });
            // Populate the Add… <select>
            var sel = chipSlot.querySelector('.bccf-filters-add');
            if (!sel) return;
            var existing = {};
            chipSlot.querySelectorAll('.bccf-chip').forEach(function(c) { existing[c.dataset.id] = true; });
            var opts = '<option value="">+ Add…</option>';
            (data['available' + capitalize(dim)] || []).forEach(function(item) {
                if (existing[String(item.id)]) return;
                opts += '<option value="' + item.id + '">' + escHtml(item.name) + '</option>';
            });
            sel.innerHTML = opts;
        });
    }
    function toMap(arr) {
        var m = {};
        (arr || []).forEach(function(item) { m[String(item.id)] = item.name; });
        return m;
    }
    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function escHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Wire the Add… <select> change → append chip + clear select.
    document.addEventListener('change', function(e) {
        var sel = e.target.closest('.bccf-filters-add');
        if (!sel) return;
        var dim = sel.dataset.dim;
        var id = sel.value;
        if (!id) return;
        var chipSlot = sel.closest('.bccf-filters-chips');
        var label = sel.options[sel.selectedIndex].textContent;
        var chip = document.createElement('span');
        chip.className = 'bccf-chip';
        chip.dataset.id = id;
        chip.textContent = label + ' ';
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bccf-chip-x';
        x.dataset.action = 'remove-chip';
        x.dataset.dim = dim;
        x.dataset.id = id;
        x.textContent = '×';
        chip.appendChild(x);
        chipSlot.insertBefore(chip, sel);
        // Remove this option from the select so it can't be re-added
        sel.options[sel.selectedIndex].remove();
        sel.selectedIndex = 0;
        updateBadge();
    });
```

- [ ] **Step 4: Call `populateFiltersFromData` from the fetch resolver**

In `CLIENT_SCRIPT`, locate the `.then(function(data) {` block inside `loadData`. Immediately after the `_lastData = data;` line, add:

```js
                populateFiltersFromData(data);
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 307 tests / 10 suites pass.

- [ ] **Step 6: Deploy + manual smoke**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js"
```

Open the Portfolio SL. Chips that were `#1807` style now show real project names. Open Filters pill → the Project / Manager / Customer / Subsidiary dropdowns are populated. Pick something → chip appears in panel. Apply → page reloads with the new filter applied; chips persist.

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_portfolio_sl.js tests/entry_points/bc_cf_portfolio_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_portfolio_sl): populate filter dropdowns from JSON + chip name resolution

populateFiltersFromData runs after each fetch: server-side chip placeholders
(#<id>) get replaced with real names from data.availableX maps; the four
"Add…" <select> dropdowns get populated with options minus already-chipped
IDs. Change handler on the <select> appends a chip + removes that option
+ updates the badge. Phase 5 client behavior complete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 6 — Ship

### Task 17: Final regression + PROJECT_STATUS + push + PR

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Final full test run**

Run: `npm test`
Expected: 307 tests / 10 suites green.

- [ ] **Step 2: Cross-feature sandbox sweep**

On TD2984799, open the Portfolio SL (URL above) and verify:
1. Page loads. KPI cards show real numbers; sublines show portfolio totals.
2. Chart bars + trend line populate. Hover on a revenue bar → tooltip "Revenue: $X". Hover cost bar → "Cost: $X". Hover trend dot → cumulative net.
3. Table shows one row per BC project with timing data. Project name links to BC project record (target="_top").
4. Sort: click Project header → indicator ▼ active (default); click again → ▲. Click a period header → 3-state cycle, rows reorder by net in that month.
5. Date picker: change range → reload with new periods.
6. Filters pill: badge starts as "Filters" (zero active by default since status defaults to active). Click pill → panel opens. Click Hold → status changes. Add a project chip from the dropdown. Click Apply → reload; badge shows "Filters · 2 active"; URL has `&status=hold&projects=<id>`.
7. Reset all + Apply → back to defaults.
8. Cash/Accrual toggle → re-fetches, preserves filters; URL gets `&mode=accrual` via `history.replaceState`.
9. Refresh button → re-fetches; sort + filter state preserved.
10. No console errors in DevTools.

Do not proceed until all 10 pass.

- [ ] **Step 3: Configure NS menu entry**

In NetSuite UI:
- Customization → Scripting → Script Deployments → `customdeploy_bc_cf_portfolio_sl`
- "Links" subtab → add a link under Reports center → category BlueCollar → label "Portfolio Cash Flow"
- Save.

This step is SDF-undeployable (menu entries belong to the SDF roles/centers config, not script objects).

- [ ] **Step 4: Update `PROJECT_STATUS.md`**

Move the "Current Phase" heading to `## Current Phase: v1.5 E1 + E1.5 + E2 Shipped — Customer Sandbox Deploy Next`. Add an E2 section under "v1.5 enhancements — status" (paste structure from E1.5 entry, with E2's content). Append to Session history.

- [ ] **Step 5: Commit + push + PR**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
docs: PROJECT_STATUS — E2 (portfolio Suitelet) shipped

Standalone top-level portfolio cash-flow Suitelet. One row per BC project;
header KPIs aggregated over filtered+dated subset; aggregated chart with
paired Revenue+Cost bars + cumulative net trend; 5-dim Filters pill (Status
+ Project/PM/Customer/Subsidiary multi-selects). Reuses E1+E1.5 verbatim:
date picker, sortLines, headerCell, sticky CSS, bars/labels chart layout,
hover tooltips. 307 tests / 10 suites green. Deployed to TD2984799.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feature/v1.5-e2-portfolio
gh pr create --title "v1.5 E2 — Portfolio Cash Flow Suitelet" --body "$(cat <<'EOF'
## Summary
- New standalone Portfolio Cash Flow Suitelet rolling all BC projects into one view
- 5-dim Filters pill (Status / Project / PM / Customer / Subsidiary) modeled on E1's date picker
- Aggregated chart (paired Revenue+Cost bars + cumulative net trend) + table (one row per project, net per period, drill-in to BC project record)
- Reuses every E1+E1.5 piece verbatim (proves the abstractions held)

## Test plan
- [x] Jest: 307 / 10 suites green
- [x] Sandbox: all 10 manual checks pass on TD2984799
- [x] Drill-in works (target="_top" to customrecord_cseg_bc_project)
- [x] Filter URL state survives bookmark + reload
- [x] Sort state survives mode toggle + refresh; resets on filter/date Apply

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Done**

Return the PR URL. Customer sandbox deploy can now follow.

---

## Self-Review Checklist (plan author)

- ✅ Every spec section maps to a task: §3.1 architecture → Tasks 3, 11; §3.2 data SL → Tasks 4–8; §3.3 response shape → covered across Tasks 5, 6, 7; §3.4 client layout → Task 11; §3.5 Filters pill → Tasks 12, 15, 16; §3.6 CSS → Task 10; §3.7 edge cases → handled across renderTable empty state (Task 13), validation (Task 8), sort null-handling (Task 14); §3.8 permissions + deployment → Tasks 3, 17.
- ✅ No placeholders ("TBD", "TODO", "implement later", "similar to Task N"). All code blocks are complete and self-contained.
- ✅ Type consistency: `_sortState = { col, dir }` shape matches E1.5; `sortLines(projects, periods, sortState)` signature consistent across Task 14 declaration and Task 14 callsite; chip slot structure (`.bccf-filters-chips[data-dim="X"]` containing `.bccf-chip[data-id]` + `<select.bccf-filters-add>`) matches between server render (Task 12), client read (Task 15), and dropdown population (Task 16); response field names (`availableProjects`, `portfolioRevenuePerPeriod`, `cumulativeBefore`, `portfolioTotals`) consistent between data SL emissions (Tasks 5, 6, 7) and client consumption (Tasks 13, 16).
- ✅ Backwards-compat: no changes to existing per-project SL contracts; the data SL's existing `combined`/`cost`/`revenue` actions are untouched; `_pivotDirection` from E1.5 is not reused (the portfolio loader pivots its own shape because the row keys are different).
- ✅ Backwards-compat #2: existing 267 tests continue to pass. The new test counts add cleanly per task.
- ✅ Manual sandbox checkpoints at end of Phase 2 (Task 9), end of Phase 4 (Task 12), and end of Phase 5 (Task 16) catch problems before mirroring into final ship.
- ✅ Tasks are bite-sized — typical task touches 1-2 files with ≤ 1 commit's worth of changes; biggest is Task 11 (initial shell SL ~600 lines) and Task 13 (CLIENT_SCRIPT initial fill ~200 lines), both single-file, single-purpose.

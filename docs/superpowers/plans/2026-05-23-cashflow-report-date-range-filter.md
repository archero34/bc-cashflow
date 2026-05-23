# BC Cash Flow — E1 — Date Range Filter on Report Suitelets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date range filter to the 3 report Suitelets (Combined / Cost / Revenue) so users can narrow long forecast horizons to a focused window. The filter is server-side (SuiteQL `WHERE`), bookmarkable (URL-encoded `?startPeriod=YYYY-MM&endPeriod=YYYY-MM`), capped at 24 months, and the picker component is shaped so the upcoming E2 portfolio Suitelet can reuse it verbatim.

**Architecture:** `bc_cf_data_sl` grows two new optional params (`startPeriod` / `endPeriod`), three new SuiteQL helper queries (`availableBounds`, `projectTotals`, `cumulativeBefore`), and three new response fields. Each report shell SL gets an inline picker (pill trigger + dropdown panel with preset chips + custom month inputs + Apply button) wired into the existing header `display:flex` container, plus KPI subline rendering (range value + project-total subline) and — for Combined — a trend-line that starts at `cumulativeBefore` instead of $0. CSS primitives live in `bc_cf_styles.js`; picker JS is duplicated across the 3 SLs (matches existing inline-client pattern; future refactor extracts to a shared file if E2 makes the duplication painful).

**Tech Stack:** SuiteScript 2.1 AMD (`@NApiVersion 2.1`), hand-rolled vanilla JS + CSS inlined in template literals, Jest + `@oracle/suitecloud-unit-testing` for tests, SuiteCloud SDF for deploy.

**Spec:** `docs/superpowers/specs/2026-05-23-cashflow-report-date-range-filter-design.md` (commit `6a944ba`).

**Deploy cadence:** Each phase ends in a green test run + a deployable commit. Phases 1 and 2 are server/CSS-only — invisible to the user. Phase 3 (Combined SL) is the first user-visible drop and should be tested in sandbox before mirroring to Cost (Phase 4) and Revenue (Phase 5).

---

## File Structure

### Modified files

| File | Change |
|------|--------|
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js` | New private helpers (`_validateYYYYMM`, `_addMonths`, `_monthsBetween`, `_defaultRange`, `_resolveRange`). New SuiteQL constants for `availableBounds` + `projectTotals` + `cumulativeBefore`. Each `_loadXxx` function accepts `startPeriod` / `endPeriod`, threads them into SQL params, returns `range` + `availableBounds` + `projectTotals` (combined also `cumulativeBefore`). `onRequest` reads + validates the two new params. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js` | Append `.bccf-daterange*` block (~10 selectors) to `PRIMITIVES`. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js` | `resolveDataUrl` passes through `startPeriod` / `endPeriod`. `buildHeader` renders the picker pill. `CLIENT_SCRIPT` gains picker JS (open/close, presets, custom validation, Apply→URL reload), `renderKpis` adds project-total sublines, `renderChart` uses `cumulativeBefore` for trend start. |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js` | Same picker wiring + KPI sublines (no trend line). |
| `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js` | Same picker wiring + KPI sublines (no trend line). |
| `tests/entry_points/bc_cf_data_sl.test.js` | Tests for param validation, default range, SQL params arity, response shape additions, `cumulativeBefore` on combined. |
| `tests/entry_points/bc_cf_combined_sl.test.js` | Tests for picker HTML in header, picker JS presence in `CLIENT_SCRIPT`, `startPeriod`/`endPeriod` URL pass-through. |
| `tests/entry_points/bc_cf_cost_report_sl.test.js` | Same as combined (no trend line assertion). |
| `tests/entry_points/bc_cf_rev_report_sl.test.js` | Same. |
| `tests/modules/bc_cf_styles.test.js` | Assert `.bccf-daterange*` selectors present. |

### New files

None.

---

# Phase 1 — Data SL contract

**Goal of phase:** Make the server speak the new contract end-to-end before any UI ships. Param validation, default rolling window, SQL filtering, and the four new response fields (`range`, `availableBounds`, `projectTotals`, `cumulativeBefore`) all land here. The 3 report SLs continue to work because they ignore the new fields until Phase 3+.

**Phase exit criteria:** All Phase 1 tests green; existing tests still green; `bc_cf_data_sl.js` deploys clean to sandbox.

---

### Task 1: Baseline snapshot

**Files:**
- Read: `tests/entry_points/bc_cf_data_sl.test.js`
- Read: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`

- [ ] **Step 1: Confirm we're on the right branch and clean**

Run: `git status && git branch --show-current`
Expected: branch `feature/v1.5-enhancements`, working tree clean.

If the branch is wrong, stop and check with the user — do not switch.

- [ ] **Step 2: Run the full suite to confirm green baseline**

Run: `npm test`
Expected: 9 suites pass, 183 tests pass.

If red, stop and fix before continuing.

- [ ] **Step 3: Note current data SL line count (for change verification later)**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
Expected (approximate): 469 lines.

---

### Task 2: Add YYYY-MM utility helpers + tests

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

We need pure functions for: regex validation, month arithmetic (add N months to a YYYY-MM), inclusive-month-count between two YYYY-MM, and computing the default rolling window. These will be exported on the `api` object so tests can call them directly (and so they participate in the existing `api.x` indirection pattern that survives Jest spies — see comment at line ~451 in `bc_cf_data_sl.js`).

- [ ] **Step 1: Add the failing tests**

Append the following `describe` block to the bottom of `tests/entry_points/bc_cf_data_sl.test.js`:

```js
describe('bc_cf_data_sl YYYY-MM helpers', () => {
    it('_validateYYYYMM accepts well-formed', () => {
        expect(Suitelet._validateYYYYMM('2026-01')).toBe(true);
        expect(Suitelet._validateYYYYMM('2026-12')).toBe(true);
    });
    it('_validateYYYYMM rejects malformed', () => {
        expect(Suitelet._validateYYYYMM('2026-13')).toBe(false);
        expect(Suitelet._validateYYYYMM('2026-00')).toBe(false);
        expect(Suitelet._validateYYYYMM('26-01')).toBe(false);
        expect(Suitelet._validateYYYYMM('2026-1')).toBe(false);
        expect(Suitelet._validateYYYYMM('2026/01')).toBe(false);
        expect(Suitelet._validateYYYYMM('')).toBe(false);
        expect(Suitelet._validateYYYYMM(null)).toBe(false);
        expect(Suitelet._validateYYYYMM(undefined)).toBe(false);
    });
    it('_addMonths handles forward and backward rollover', () => {
        expect(Suitelet._addMonths('2026-05', 0)).toBe('2026-05');
        expect(Suitelet._addMonths('2026-05', 1)).toBe('2026-06');
        expect(Suitelet._addMonths('2026-05', -3)).toBe('2026-02');
        expect(Suitelet._addMonths('2026-05', 11)).toBe('2027-04');
        expect(Suitelet._addMonths('2026-01', -1)).toBe('2025-12');
        expect(Suitelet._addMonths('2026-12', 1)).toBe('2027-01');
    });
    it('_monthsBetween is inclusive', () => {
        expect(Suitelet._monthsBetween('2026-05', '2026-05')).toBe(1);
        expect(Suitelet._monthsBetween('2026-01', '2026-12')).toBe(12);
        expect(Suitelet._monthsBetween('2026-02', '2027-01')).toBe(12);
        expect(Suitelet._monthsBetween('2026-01', '2027-12')).toBe(24);
        expect(Suitelet._monthsBetween('2026-01', '2028-01')).toBe(25);
    });
    it('_defaultRange returns 12-month window centered −3 / +8 around current month', () => {
        const r = Suitelet._defaultRange();
        expect(r.startPeriod).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        expect(r.endPeriod).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        expect(Suitelet._monthsBetween(r.startPeriod, r.endPeriod)).toBe(12);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: 5 new tests fail with `Suitelet._validateYYYYMM is not a function` (or similar).

- [ ] **Step 3: Add the helpers to `bc_cf_data_sl.js`**

Open `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`. Locate the `// ── Helpers ──` section header (around line 176, just after the SuiteQL constants). Insert the following helpers immediately **before** the existing `_periodLabel` helper:

```js
    // ── Date range helpers ────────────────────────────────────────────────────

    const _YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

    /** Strict YYYY-MM format check. */
    const _validateYYYYMM = (s) => typeof s === 'string' && _YYYYMM_RE.test(s);

    /**
     * Add N months (positive or negative) to a YYYY-MM string.
     * Uses UTC Date math to avoid timezone drift on month boundaries.
     */
    const _addMonths = (yyyymm, n) => {
        const parts = yyyymm.split('-');
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = new Date(Date.UTC(y, (m - 1) + n, 1));
        const ny = d.getUTCFullYear();
        const nm = String(d.getUTCMonth() + 1).padStart(2, '0');
        return ny + '-' + nm;
    };

    /**
     * Inclusive month count between two YYYY-MM strings (start <= end assumed).
     * monthsBetween('2026-01', '2026-12') → 12
     * monthsBetween('2026-05', '2026-05') → 1
     */
    const _monthsBetween = (start, end) => {
        const [sy, sm] = start.split('-').map(Number);
        const [ey, em] = end.split('-').map(Number);
        return (ey - sy) * 12 + (em - sm) + 1;
    };

    /**
     * Default rolling window per spec D1: current month -3 → current month +8 = 12 months inclusive.
     * Example: today May 2026 → { startPeriod: '2026-02', endPeriod: '2027-01' }.
     */
    const _defaultRange = () => {
        const now = new Date();
        const curYYYYMM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        return {
            startPeriod: _addMonths(curYYYYMM, -3),
            endPeriod:   _addMonths(curYYYYMM, 8)
        };
    };
```

- [ ] **Step 4: Export the helpers on `api`**

At the bottom of the file, locate the line `const api = { _loadCombined, _loadCost, _loadRevenue };` (around line 466). Replace it with:

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange
    };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: all tests in this file pass, including the 5 new ones.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): add YYYY-MM helpers for date range filter

Adds _validateYYYYMM (strict regex), _addMonths (UTC-safe), _monthsBetween
(inclusive), _defaultRange (current −3 / +8 = 12 months inclusive). Exported
on api object for unit testing. Spec §3.1, D1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `_resolveRange` — combines request params with defaults + validation

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Per spec §3.1, the server must:
- If both params omitted → apply default rolling window.
- If only one provided → extend the other by 11 months from the provided one (12-month window).
- If both provided → use as-is.
- Reject malformed YYYY-MM.
- Reject `startPeriod > endPeriod`.
- Reject range > 24 months.

`_resolveRange(rawStart, rawEnd)` returns either `{ ok: true, startPeriod, endPeriod }` or `{ ok: false, error }`.

- [ ] **Step 1: Add the failing tests**

Append to the same `describe('bc_cf_data_sl YYYY-MM helpers', ...)` block in `tests/entry_points/bc_cf_data_sl.test.js`:

```js
    it('_resolveRange uses default when both params omitted', () => {
        const r = Suitelet._resolveRange(undefined, undefined);
        expect(r.ok).toBe(true);
        expect(Suitelet._monthsBetween(r.startPeriod, r.endPeriod)).toBe(12);
    });
    it('_resolveRange extends end when only start provided', () => {
        const r = Suitelet._resolveRange('2026-04', undefined);
        expect(r.ok).toBe(true);
        expect(r.startPeriod).toBe('2026-04');
        expect(r.endPeriod).toBe('2027-03');
    });
    it('_resolveRange extends start when only end provided', () => {
        const r = Suitelet._resolveRange(undefined, '2026-12');
        expect(r.ok).toBe(true);
        expect(r.startPeriod).toBe('2026-01');
        expect(r.endPeriod).toBe('2026-12');
    });
    it('_resolveRange accepts both when valid', () => {
        const r = Suitelet._resolveRange('2026-03', '2027-02');
        expect(r.ok).toBe(true);
        expect(r.startPeriod).toBe('2026-03');
        expect(r.endPeriod).toBe('2027-02');
    });
    it('_resolveRange rejects malformed startPeriod', () => {
        const r = Suitelet._resolveRange('2026-13', '2026-12');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/invalid period format/i);
    });
    it('_resolveRange rejects malformed endPeriod', () => {
        const r = Suitelet._resolveRange('2026-01', '2026/12');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/invalid period format/i);
    });
    it('_resolveRange rejects start > end', () => {
        const r = Suitelet._resolveRange('2026-12', '2026-01');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/startPeriod must be <= endPeriod/i);
    });
    it('_resolveRange rejects range > 24 months', () => {
        const r = Suitelet._resolveRange('2026-01', '2028-02');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/24-month/i);
    });
    it('_resolveRange accepts exactly 24 months', () => {
        const r = Suitelet._resolveRange('2026-01', '2027-12');
        expect(r.ok).toBe(true);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: 9 new tests fail with `_resolveRange is not a function`.

- [ ] **Step 3: Add `_resolveRange` to `bc_cf_data_sl.js`**

Append this function inside the `// ── Date range helpers ──` section, immediately after `_defaultRange`:

```js
    /**
     * Resolve raw request params into an effective range, applying defaults
     * and validating per spec §3.1. Returns either:
     *   { ok: true,  startPeriod, endPeriod }
     *   { ok: false, error: '...' }
     */
    const _resolveRange = (rawStart, rawEnd) => {
        const hasStart = rawStart != null && rawStart !== '';
        const hasEnd   = rawEnd   != null && rawEnd   !== '';

        if (!hasStart && !hasEnd) return Object.assign({ ok: true }, _defaultRange());

        if (hasStart && !_validateYYYYMM(rawStart)) return { ok: false, error: 'Invalid period format' };
        if (hasEnd   && !_validateYYYYMM(rawEnd))   return { ok: false, error: 'Invalid period format' };

        const startPeriod = hasStart ? rawStart : _addMonths(rawEnd,   -11);
        const endPeriod   = hasEnd   ? rawEnd   : _addMonths(rawStart, 11);

        if (startPeriod > endPeriod) return { ok: false, error: 'startPeriod must be <= endPeriod' };
        if (_monthsBetween(startPeriod, endPeriod) > 24) {
            return { ok: false, error: 'Date range exceeds 24-month limit' };
        }

        return { ok: true, startPeriod, endPeriod };
    };
```

- [ ] **Step 4: Add `_resolveRange` to the `api` export**

Update the `const api = { ... };` line near the bottom to include `_resolveRange`:

```js
    const api = {
        _loadCombined, _loadCost, _loadRevenue,
        _validateYYYYMM, _addMonths, _monthsBetween, _defaultRange, _resolveRange
    };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: all tests pass, including the 9 new ones.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): add _resolveRange — defaults, single-bound extension, 24mo cap

Combines raw startPeriod/endPeriod request params with default rolling
window logic and enforces spec §3.1 validation: format regex, ordering,
24-month cap. Returns { ok, startPeriod, endPeriod } or { ok:false, error }.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire `_resolveRange` into `onRequest` — surface errors as `{ok:false}`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Before this task, `_loadCombined / _loadCost / _loadRevenue` only take `(projectId, mode)`. We're widening their signature to `(projectId, mode, range)` where `range = { startPeriod, endPeriod }`. The wiring layer happens in `onRequest`: read params, resolve via `_resolveRange`, short-circuit on `ok:false`, and pass the resolved `range` down to the `_loadXxx` function.

The actual SQL params/response changes happen in Tasks 5–8. This task only changes the gateway and the loader signatures (the loaders ignore `range` for now but accept it).

- [ ] **Step 1: Add the failing tests**

Add the following to `tests/entry_points/bc_cf_data_sl.test.js`, inside the existing top-level `describe('bc_cf_data_sl', ...)` block (after the existing rejection tests):

```js
    it('rejects malformed startPeriod with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-13' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/invalid period format/i);
    });

    it('rejects range > 24 months with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-01', endPeriod: '2028-02' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/24-month/i);
    });

    it('rejects startPeriod > endPeriod with ok:false', () => {
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-12', endPeriod: '2026-01' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/startPeriod must be <= endPeriod/i);
    });

    it('passes resolved range to _loadCombined', () => {
        const spy = jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: [], categories: { revenue: {lines:[],total:[],grandTotal:0}, cost: {lines:[],total:[],grandTotal:0} }, kpis: {}
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-03', endPeriod: '2026-08' } };
        Suitelet.onRequest({ request: req, response: mockResponse() });
        expect(spy).toHaveBeenCalledWith('1807', 'cash', { startPeriod: '2026-03', endPeriod: '2026-08' });
        spy.mockRestore();
    });
```

- [ ] **Step 2: Run tests to verify the 4 new ones fail**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: 4 new tests fail (some because validation isn't wired, the last because `_loadCombined` is called with 2 args instead of 3).

- [ ] **Step 3: Update loader signatures to accept `range`**

In `bc_cf_data_sl.js`, change the three loader function signatures and `_loadCombined / _loadCost / _loadRevenue` JSDocs. The bodies stay unchanged in this task. Apply this `replace_all` pattern via three separate Edits:

For `_loadCombined`:
```js
    const _loadCombined = (projectId, mode) => {
```
becomes:
```js
    const _loadCombined = (projectId, mode, range) => {
```

For `_loadCost`:
```js
    const _loadCost = (projectId, mode) => {
```
becomes:
```js
    const _loadCost = (projectId, mode, range) => {
```

For `_loadRevenue`:
```js
    const _loadRevenue = (projectId, mode) => {
```
becomes:
```js
    const _loadRevenue = (projectId, mode, range) => {
```

(The `range` parameter is unused for now — Tasks 5–7 will wire it into the SQL params and response.)

- [ ] **Step 4: Update `onRequest` to read params and resolve range**

Locate the `onRequest` function (around line 434). Replace the dispatcher block. The current block reads:

```js
            const action = params.action;
            const projectId = params.projectId;
            const mode = params.mode || 'cash';

            if (!action) return sendError(res, 'Missing action parameter');
            if (!projectId) return sendError(res, 'Missing projectId parameter');
            if (mode !== 'cash' && mode !== 'accrual') return sendError(res, `Invalid mode: ${mode}`);

            let data;
            // Dispatch through `api` so Jest spies on the returned object intercept the call
            // (referencing closure-scoped functions directly would bypass the spy).
            // `module.exports` is undefined in NetSuite's AMD runtime — never reference it here.
            if (action === 'combined')      data = api._loadCombined(projectId, mode);
            else if (action === 'cost')     data = api._loadCost(projectId, mode);
            else if (action === 'revenue')  data = api._loadRevenue(projectId, mode);
            else return sendError(res, `Unknown action: ${action}`);
```

Replace with:

```js
            const action = params.action;
            const projectId = params.projectId;
            const mode = params.mode || 'cash';
            const rawStart = params.startPeriod;
            const rawEnd   = params.endPeriod;

            if (!action) return sendError(res, 'Missing action parameter');
            if (!projectId) return sendError(res, 'Missing projectId parameter');
            if (mode !== 'cash' && mode !== 'accrual') return sendError(res, `Invalid mode: ${mode}`);

            const resolved = api._resolveRange(rawStart, rawEnd);
            if (!resolved.ok) return sendError(res, resolved.error);
            const range = { startPeriod: resolved.startPeriod, endPeriod: resolved.endPeriod };

            let data;
            // Dispatch through `api` so Jest spies on the returned object intercept the call
            // (referencing closure-scoped functions directly would bypass the spy).
            // `module.exports` is undefined in NetSuite's AMD runtime — never reference it here.
            if (action === 'combined')      data = api._loadCombined(projectId, mode, range);
            else if (action === 'cost')     data = api._loadCost(projectId, mode, range);
            else if (action === 'revenue')  data = api._loadRevenue(projectId, mode, range);
            else return sendError(res, `Unknown action: ${action}`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: all tests pass.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all 9 suites pass. The cost/revenue/combined shell SL tests still pass because the response shape from the loaders hasn't changed yet — they continue to return the old shape (just now with an unused `range` argument).

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): wire _resolveRange into onRequest, widen loader signatures

onRequest now reads startPeriod/endPeriod, resolves via _resolveRange, and
short-circuits with { ok:false } on validation failure. Loader signatures
widened to (projectId, mode, range) — bodies still ignore range; SQL +
response wiring lands in Tasks 5–8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: SuiteQL `WHERE` filter on COST query + response `range`/`availableBounds`/`projectTotals`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

This is the first of three "apply the range to a loader" tasks. We pick the cost loader first because it's the simplest (one timing-line table, no UNION). The pattern established here is repeated almost verbatim for revenue (Task 6) and combined (Task 7).

The cost loader needs three new SuiteQL constants and additions to `_loadCost`:
1. Add `period BETWEEN ? AND ?` to `COST_SQL`'s `WHERE` clause.
2. Add a new `COST_BOUNDS_SQL` query to fetch `MIN(period_date)` / `MAX(period_date)` across the project's cost timing lines (no date filter).
3. Add a new `COST_TOTAL_SQL` query to fetch `SUM(amount)` across all the project's cost timing lines (no date filter) for `projectTotals.cost`.
4. Augment the response with `range`, `availableBounds`, `projectTotals`.

- [ ] **Step 1: Add the failing test**

Add the following test to `tests/entry_points/bc_cf_data_sl.test.js`, inside the existing `describe('bc_cf_data_sl cost action shape', ...)` block (after the existing `it`):

```js
    it('returns range, availableBounds, and projectTotals on cost action', () => {
        jest.spyOn(Suitelet, '_loadCost').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: { cost: { lines: [], total: [0, 0], grandTotal: 0 } },
            kpis: { totalCost: 0, currentMonth: 0, peakMonth: 0, remaining: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { cost: 33000 }
        });
        const req = { method: 'GET', parameters: { action: 'cost', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-05' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.range).toEqual({ startPeriod: '2026-04', endPeriod: '2026-05' });
        expect(body.availableBounds).toEqual({ minPeriod: '2026-01', maxPeriod: '2027-12' });
        expect(body.projectTotals.cost).toBe(33000);
    });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: the new test fails because the mock returns those fields but `onRequest` uses `Object.assign({ ok: true, mode }, data)` which DOES pass them through. Wait — read the existing dispatcher: `sendJSON(res, Object.assign({ ok: true, mode }, data));`. So a mocked loader returning these fields WILL pass them through. The test should pass at this step already? Let me re-check.

Yes, `Object.assign({ ok:true, mode }, data)` will spread `data`. So this single test is purely a contract assertion. Run it; if it passes already (because we're just spying on the loader), that's fine — proceed to Step 3 which adds the actual implementation.

- [ ] **Step 3: Add the new SuiteQL constants**

In `bc_cf_data_sl.js`, locate the end of the SuiteQL constants block (the `COMBINED_SQL` ends at the closing backtick around line 174). Immediately after it, insert these three new constants:

```js
    /**
     * Bounds query for cost loader: earliest + latest period_date in the project's
     * cost timing lines, ignoring any date filter. Used for picker min/max attrs.
     */
    const COST_BOUNDS_SQL = `
        SELECT
            TO_CHAR(MIN(ctl.custrecord_bc_ctl_period_date), 'YYYY-MM') AS min_period,
            TO_CHAR(MAX(ctl.custrecord_bc_ctl_period_date), 'YYYY-MM') AS max_period
        FROM customrecord_bc_cost_timing_line ctl
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
    `;

    /**
     * Project-total query for cost loader: SUM(amount) across all the project's
     * cost timing lines, ignoring any date filter. Used for KPI sublines.
     */
    const COST_TOTAL_SQL = `
        SELECT SUM(NVL(ctl.custrecord_bc_ctl_amount, 0)) AS total_amount
        FROM customrecord_bc_cost_timing_line ctl
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
    `;

    /** Bounds query for revenue loader — mirror of COST_BOUNDS_SQL on revenue timing lines. */
    const REVENUE_BOUNDS_SQL = `
        SELECT
            TO_CHAR(MIN(rtl.custrecord_bc_rtl_period_date), 'YYYY-MM') AS min_period,
            TO_CHAR(MAX(rtl.custrecord_bc_rtl_period_date), 'YYYY-MM') AS max_period
        FROM customrecord_bc_revenue_timing_line rtl
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
    `;

    /** Project-total query for revenue loader — mirror of COST_TOTAL_SQL on revenue timing lines. */
    const REVENUE_TOTAL_SQL = `
        SELECT SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS total_amount
        FROM customrecord_bc_revenue_timing_line rtl
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
    `;
```

(We're adding the revenue constants too so they're co-located with cost — Task 6 uses them.)

- [ ] **Step 4: Add the `WHERE` clause to `COST_SQL`**

In the existing `COST_SQL` constant, locate the `WHERE` block:

```sql
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
```

Replace with:

```sql
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?
```

- [ ] **Step 5: Update `_loadCost` to use the range + fire the auxiliary queries**

Find the `_loadCost` function. Its body currently runs ONE query (COST_SQL) and returns `{ periods, categories, kpis }`. Replace the function body so it:
- Passes `range.startPeriod` / `range.endPeriod` into `COST_SQL`'s params (4 params now, not 2).
- Fires `COST_BOUNDS_SQL` for `availableBounds`.
- Fires `COST_TOTAL_SQL` for `projectTotals.cost`.
- Returns the augmented shape.

Replace the entire `_loadCost` function with:

```js
    const _loadCost = (projectId, mode, range) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        let rows;
        try {
            rows = query.runSuiteQL({
                query: COST_SQL,
                params: [projectId, timingType, startPeriod, endPeriod]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadCost', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // availableBounds — single-row result with MIN/MAX of period_date across all timing lines (no date filter)
        let boundsRow;
        try {
            boundsRow = query.runSuiteQL({
                query: COST_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCost (bounds)', details: e.message + '\n' + (e.stack || '') });
            boundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const availableBounds = {
            minPeriod: boundsRow.min_period || _curYYYYMM,
            maxPeriod: boundsRow.max_period || _curYYYYMM
        };

        // projectTotals.cost — single-row SUM(amount) across all timing lines (no date filter)
        let totalRow;
        try {
            totalRow = query.runSuiteQL({
                query: COST_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCost (total)', details: e.message + '\n' + (e.stack || '') });
            totalRow = {};
        }
        const projectTotals = { cost: Number(totalRow.total_amount) || 0 };

        // ── Existing in-range pivot below ──
        const periodsSet = new Set();
        rows.forEach((r) => { if (r.period) periodsSet.add(r.period); });
        const periods = Array.from(periodsSet).sort();

        const cost = _pivotDirection(rows, periods, null);

        // KPI: current YYYY-MM derived from runtime clock
        const now = new Date();
        const curYYYYMM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        const curIdx = periods.indexOf(curYYYYMM);
        const currentMonth = curIdx !== -1 ? (cost.total[curIdx] || 0) : 0;

        const peakMonth = cost.total.length > 0
            ? Math.max.apply(null, cost.total)
            : 0;

        const remaining = periods.reduce((sum, p, i) => {
            return p >= curYYYYMM ? sum + (cost.total[i] || 0) : sum;
        }, 0);

        return {
            periods: periods.map(_periodLabel),
            categories: { cost },
            kpis: {
                totalCost: cost.grandTotal,
                currentMonth,
                peakMonth,
                remaining
            },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals
        };
    };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: all tests pass including the new contract test.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green. Cost SL shell tests pass because they don't yet assert on the new fields.

- [ ] **Step 8: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): cost action — SQL date filter + range/availableBounds/projectTotals

Adds COST_BOUNDS_SQL + COST_TOTAL_SQL (and pre-wires REVENUE_BOUNDS_SQL /
REVENUE_TOTAL_SQL for Task 6). _loadCost now passes startPeriod/endPeriod
into COST_SQL params, fires bounds + total queries, and returns range +
availableBounds + projectTotals.cost. Spec §3.1, §3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Apply the same pattern to the REVENUE loader

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Mirror Task 5 for the revenue path. The SuiteQL constants (`REVENUE_BOUNDS_SQL`, `REVENUE_TOTAL_SQL`) already exist from Task 5 step 3.

- [ ] **Step 1: Add the failing test**

Add to the existing `describe('bc_cf_data_sl revenue action shape', ...)` block in `tests/entry_points/bc_cf_data_sl.test.js`:

```js
    it('returns range, availableBounds, and projectTotals on revenue action', () => {
        jest.spyOn(Suitelet, '_loadRevenue').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: { revenue: { lines: [], total: [0, 0], grandTotal: 0 } },
            kpis: { totalRevenue: 0, baseContract: 0, changeOrders: 0, peakMonth: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000 }
        });
        const req = { method: 'GET', parameters: { action: 'revenue', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-05' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.range).toEqual({ startPeriod: '2026-04', endPeriod: '2026-05' });
        expect(body.availableBounds).toEqual({ minPeriod: '2026-01', maxPeriod: '2027-12' });
        expect(body.projectTotals.revenue).toBe(42000);
    });
```

- [ ] **Step 2: Run tests — should pass already because of mock pass-through**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: green (the mock returns the fields; `onRequest`'s `Object.assign` passes them through). Proceed to Step 3 to add the real implementation.

- [ ] **Step 3: Add the `WHERE` clause to `REVENUE_SQL`**

In the existing `REVENUE_SQL` constant, locate the `WHERE` block:

```sql
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
```

Replace with:

```sql
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?
```

- [ ] **Step 4: Update `_loadRevenue`**

Replace the entire `_loadRevenue` function body with:

```js
    const _loadRevenue = (projectId, mode, range) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        let rows;
        try {
            rows = query.runSuiteQL({
                query: REVENUE_SQL,
                params: [projectId, timingType, startPeriod, endPeriod]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // availableBounds
        let boundsRow;
        try {
            boundsRow = query.runSuiteQL({
                query: REVENUE_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue (bounds)', details: e.message + '\n' + (e.stack || '') });
            boundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const availableBounds = {
            minPeriod: boundsRow.min_period || _curYYYYMM,
            maxPeriod: boundsRow.max_period || _curYYYYMM
        };

        // projectTotals.revenue
        let totalRow;
        try {
            totalRow = query.runSuiteQL({
                query: REVENUE_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue (total)', details: e.message + '\n' + (e.stack || '') });
            totalRow = {};
        }
        const projectTotals = { revenue: Number(totalRow.total_amount) || 0 };

        // ── Existing in-range pivot below ──
        const periodsSet = new Set();
        rows.forEach((r) => { if (r.period) periodsSet.add(r.period); });
        const periods = Array.from(periodsSet).sort();

        const revenue = _pivotDirection(rows, periods, 'Base Bid');

        const totalRevenue = revenue.grandTotal;

        const baseContract = revenue.lines
            .filter((l) => !l.id.startsWith('CO: '))
            .reduce((sum, l) => sum + l.total, 0);

        const changeOrders = revenue.lines
            .filter((l) => l.id.startsWith('CO: '))
            .reduce((sum, l) => sum + l.total, 0);

        const peakMonth = revenue.total.length > 0
            ? Math.max.apply(null, revenue.total)
            : 0;

        return {
            periods: periods.map(_periodLabel),
            categories: { revenue },
            kpis: { totalRevenue, baseContract, changeOrders, peakMonth },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals
        };
    };
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all 9 suites green.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): revenue action — SQL date filter + range/availableBounds/projectTotals

Mirrors Task 5 for the revenue loader. _loadRevenue threads startPeriod/
endPeriod through REVENUE_SQL params, fires REVENUE_BOUNDS_SQL +
REVENUE_TOTAL_SQL, returns range + availableBounds + projectTotals.revenue.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: COMBINED loader — SQL filter on both UNION legs + `availableBounds`/`projectTotals` (both sides)

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Combined is the most involved loader because its SQL is a UNION across revenue + cost timing tables. Both legs need the date filter. `availableBounds` must reflect the union (earliest period across either table, latest across either). `projectTotals` must include both `revenue` and `cost`. `cumulativeBefore` is added in Task 8 — keep this task focused on the SQL filter + the basic response augmentation.

- [ ] **Step 1: Add the failing test**

Add to the existing `describe('bc_cf_data_sl combined action shape', ...)` block:

```js
    it('returns range, availableBounds, and projectTotals (both sides) on combined action', () => {
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr 2026', 'May 2026'],
            categories: {
                revenue: { lines: [], total: [0, 0], grandTotal: 0 },
                cost:    { lines: [], total: [0, 0], grandTotal: 0 }
            },
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-05' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000, cost: 33000 }
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-05' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.range).toEqual({ startPeriod: '2026-04', endPeriod: '2026-05' });
        expect(body.availableBounds).toEqual({ minPeriod: '2026-01', maxPeriod: '2027-12' });
        expect(body.projectTotals.revenue).toBe(42000);
        expect(body.projectTotals.cost).toBe(33000);
    });
```

- [ ] **Step 2: Run tests — should pass via mock pass-through**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: green.

- [ ] **Step 3: Update both legs of `COMBINED_SQL`**

In `COMBINED_SQL`, locate the revenue leg's `WHERE`:

```sql
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
```

Replace with:

```sql
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') <= ?
```

Then locate the cost leg's `WHERE` further down in `COMBINED_SQL`:

```sql
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
```

Replace with:

```sql
        WHERE ctl.custrecord_bc_ctl_project = ?
          AND ctl.custrecord_bc_ctl_timing_type = ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') >= ?
          AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') <= ?
```

- [ ] **Step 4: Update `_loadCombined`**

Replace the entire `_loadCombined` function body with:

```js
    const _loadCombined = (projectId, mode, range) => {
        const timingType = modeToTimingType(mode);
        const { startPeriod, endPeriod } = range;

        let rows;
        try {
            rows = query.runSuiteQL({
                query: COMBINED_SQL,
                params: [
                    projectId, timingType, startPeriod, endPeriod,  // revenue leg
                    projectId, timingType, startPeriod, endPeriod   // cost leg
                ]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined', details: e.message + '\n' + (e.stack || '') });
            rows = [];
        }

        // availableBounds — union of revenue + cost bounds (no date filter)
        let revBoundsRow, costBoundsRow;
        try {
            revBoundsRow = query.runSuiteQL({
                query: REVENUE_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (rev bounds)', details: e.message + '\n' + (e.stack || '') });
            revBoundsRow = {};
        }
        try {
            costBoundsRow = query.runSuiteQL({
                query: COST_BOUNDS_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (cost bounds)', details: e.message + '\n' + (e.stack || '') });
            costBoundsRow = {};
        }
        const _curYYYYMM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
        const allMins = [revBoundsRow.min_period, costBoundsRow.min_period].filter(Boolean);
        const allMaxs = [revBoundsRow.max_period, costBoundsRow.max_period].filter(Boolean);
        const availableBounds = {
            minPeriod: allMins.length ? allMins.sort()[0] : _curYYYYMM,
            maxPeriod: allMaxs.length ? allMaxs.sort()[allMaxs.length - 1] : _curYYYYMM
        };

        // projectTotals — both revenue + cost (no date filter)
        let revTotalRow, costTotalRow;
        try {
            revTotalRow = query.runSuiteQL({
                query: REVENUE_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (rev total)', details: e.message + '\n' + (e.stack || '') });
            revTotalRow = {};
        }
        try {
            costTotalRow = query.runSuiteQL({
                query: COST_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (cost total)', details: e.message + '\n' + (e.stack || '') });
            costTotalRow = {};
        }
        const projectTotals = {
            revenue: Number(revTotalRow.total_amount) || 0,
            cost:    Number(costTotalRow.total_amount) || 0
        };

        // ── Existing in-range pivot below ──
        const periodsSet = new Set();
        rows.forEach((r) => { if (r.period) periodsSet.add(r.period); });
        const periods = Array.from(periodsSet).sort();

        const revRows  = rows.filter((r) => r.flow_direction === 'Revenue');
        const costRows = rows.filter((r) => r.flow_direction === 'Cost');

        const revenue = _pivotDirection(revRows,  periods, 'Base Bid');
        const cost    = _pivotDirection(costRows, periods, null);

        const totalRevenue = revenue.grandTotal;
        const totalCost    = cost.grandTotal;
        const netCashFlow  = totalRevenue - totalCost;
        const margin       = totalRevenue !== 0
            ? (netCashFlow / totalRevenue) * 100
            : 0;

        return {
            periods: periods.map(_periodLabel),
            categories: { revenue, cost },
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals
        };
    };
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): combined action — SQL date filter on both UNION legs

Both legs of COMBINED_SQL get TO_CHAR(period_date,'YYYY-MM') BETWEEN ? AND ?.
_loadCombined now passes 8 params (4 per leg), fires bounds + total queries
for both revenue and cost tables, unions their MIN/MAX into availableBounds,
and returns projectTotals.{revenue,cost}.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Add `cumulativeBefore` to the COMBINED loader

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
- Modify: `tests/entry_points/bc_cf_data_sl.test.js`

Per spec §3.5, the combined response includes `cumulativeBefore`: the net cash flow (`SUM(revenue) - SUM(cost)`) accumulated in periods strictly before `range.startPeriod`. The trend line in the Combined chart uses this so the polyline truthfully starts at the carry-forward level instead of $0 when the range starts mid-project.

Computed via a single SuiteQL query that UNIONs the two pre-range sums.

- [ ] **Step 1: Add the failing test**

Add to the `describe('bc_cf_data_sl combined action shape', ...)` block:

```js
    it('returns cumulativeBefore on combined action', () => {
        jest.spyOn(Suitelet, '_loadCombined').mockReturnValue({
            periods: ['Apr 2026'],
            categories: {
                revenue: { lines: [], total: [0], grandTotal: 0 },
                cost:    { lines: [], total: [0], grandTotal: 0 }
            },
            kpis: { totalRevenue: 0, totalCost: 0, netCashFlow: 0, margin: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-04' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000, cost: 33000 },
            cumulativeBefore: 5500
        });
        const req = { method: 'GET', parameters: { action: 'combined', projectId: '1807', startPeriod: '2026-04', endPeriod: '2026-04' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.ok).toBe(true);
        expect(body.cumulativeBefore).toBe(5500);
    });
```

- [ ] **Step 2: Run tests — should pass via mock pass-through**

Run: `npm test -- tests/entry_points/bc_cf_data_sl.test.js`
Expected: green.

- [ ] **Step 3: Add the `CUMULATIVE_BEFORE_SQL` constant**

After the `REVENUE_TOTAL_SQL` constant (added in Task 5 step 3), append:

```js
    /**
     * Pre-range cumulative net for combined action.
     * Returns one row with rev_total and cost_total — both summed across
     * periods STRICTLY BEFORE the supplied startPeriod. Caller computes
     * net = rev_total - cost_total. Spec §3.5.
     */
    const CUMULATIVE_BEFORE_SQL = `
        SELECT
            (SELECT NVL(SUM(rtl.custrecord_bc_rtl_amount), 0)
               FROM customrecord_bc_revenue_timing_line rtl
              WHERE rtl.custrecord_bc_rtl_project = ?
                AND rtl.custrecord_bc_rtl_timing_type = ?
                AND TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') < ?) AS rev_total,
            (SELECT NVL(SUM(ctl.custrecord_bc_ctl_amount), 0)
               FROM customrecord_bc_cost_timing_line ctl
              WHERE ctl.custrecord_bc_ctl_project = ?
                AND ctl.custrecord_bc_ctl_timing_type = ?
                AND TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') < ?) AS cost_total
        FROM dual
    `;
```

- [ ] **Step 4: Add the query execution to `_loadCombined`**

In `_loadCombined`, insert this block immediately after the `projectTotals` assignment (just before the `// ── Existing in-range pivot below ──` comment):

```js
        // cumulativeBefore — net flow accumulated in periods strictly before startPeriod
        let cumRow;
        try {
            cumRow = query.runSuiteQL({
                query: CUMULATIVE_BEFORE_SQL,
                params: [
                    projectId, timingType, startPeriod,  // revenue subquery
                    projectId, timingType, startPeriod   // cost subquery
                ]
            }).asMappedResults()[0] || {};
        } catch (e) {
            log.error({ title: MODULE + '._loadCombined (cumBefore)', details: e.message + '\n' + (e.stack || '') });
            cumRow = {};
        }
        const cumulativeBefore = (Number(cumRow.rev_total) || 0) - (Number(cumRow.cost_total) || 0);
```

- [ ] **Step 5: Add `cumulativeBefore` to the `_loadCombined` return**

In the `return { ... }` block at the end of `_loadCombined`, add `cumulativeBefore` as a key alongside `range`, `availableBounds`, `projectTotals`:

```js
        return {
            periods: periods.map(_periodLabel),
            categories: { revenue, cost },
            kpis: { totalRevenue, totalCost, netCashFlow, margin },
            range: { startPeriod, endPeriod },
            availableBounds,
            projectTotals,
            cumulativeBefore
        };
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 7: Verify total line count growth is reasonable**

Run: `wc -l FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js`
Expected: ~620–680 lines (started at 469; we added ~150–200 lines of SQL constants + helper functions + augmented loaders).

- [ ] **Step 8: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_data_sl): combined action — cumulativeBefore for trend-line carry-forward

Adds CUMULATIVE_BEFORE_SQL (single-row UNION subquery returning rev_total +
cost_total for periods strictly before startPeriod). _loadCombined computes
cumulativeBefore = pre-range revenue − pre-range cost; client trend line in
Phase 3 uses it as the polyline's starting y-value instead of $0. Spec §3.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Phase 1 deploy + sandbox smoke test

**Files:** none modified.

The server contract is complete. Deploy the data SL alone (file-only upload — no new script objects) and smoke-test via direct URL hits before any UI work.

- [ ] **Step 1: Confirm working tree is clean**

Run: `git status`
Expected: clean.

- [ ] **Step 2: Validate the project**

Run: `npm run validate`
Expected: SuiteCloud validation passes. If warnings appear about unrelated files, that's fine — only halt on errors involving `bc_cf_data_sl.js`.

- [ ] **Step 3: Upload the data SL file**

Run: `npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js"`
Expected: success.

- [ ] **Step 4: Smoke-test the data SL via direct URL**

The user runs these in the NetSuite UI (the engineer cannot hit the SL directly from local node):
  a) Hit `bc_cf_data_sl?action=combined&projectId=1807` (no range) → expect JSON with `range`, `availableBounds`, `projectTotals.revenue`, `projectTotals.cost`, `cumulativeBefore`. The `range` should be the default rolling window (current month -3 / +8).
  b) Hit `bc_cf_data_sl?action=combined&projectId=1807&startPeriod=2026-03&endPeriod=2026-08` → expect JSON with `range: { startPeriod: '2026-03', endPeriod: '2026-08' }` and `periods` containing only labels in that window.
  c) Hit `bc_cf_data_sl?action=cost&projectId=1807&startPeriod=2026-13&endPeriod=2026-12` → expect `{ ok: false, error: 'Invalid period format' }`.
  d) Hit `bc_cf_data_sl?action=combined&projectId=1807&startPeriod=2026-01&endPeriod=2028-02` → expect `{ ok: false, error: 'Date range exceeds 24-month limit' }`.

The agent should pause here and ask the user to confirm those four smoke tests. Do not proceed to Phase 2 until the user confirms.

- [ ] **Step 5: Confirm user has smoke-tested before continuing**

Wait for explicit user confirmation. If a smoke test fails, do NOT continue — debug the data SL first.

---

# Phase 2 — CSS primitives

**Goal of phase:** Add the `.bccf-daterange*` selectors to the shared styles module so all 3 report SLs can render the picker without inline CSS duplication.

**Phase exit criteria:** `bc_cf_styles.js` tests pass with new assertions; existing assertions still pass; visual smoke (deploy + look at any report) shows no regressions in existing primitives.

---

### Task 10: Add `.bccf-daterange*` CSS to `bc_cf_styles.js`

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`
- Modify: `tests/modules/bc_cf_styles.test.js`

- [ ] **Step 1: Add the failing tests**

In `tests/modules/bc_cf_styles.test.js`, inside the `describe('getStyles()', ...)` block (after the existing `it('defines bccf-bar primitive', ...)`), add:

```js
        it('defines bccf-daterange primitives from E1 spec §3.2', () => {
            const out = Styles.getStyles();
            expect(out).toMatch(/\.bccf-daterange\b/);
            expect(out).toMatch(/\.bccf-daterange-trigger\b/);
            expect(out).toMatch(/\.bccf-daterange-panel\b/);
            expect(out).toMatch(/\.bccf-daterange-presets\b/);
            expect(out).toMatch(/\.bccf-daterange-custom\b/);
            expect(out).toMatch(/\.bccf-daterange-actions\b/);
            expect(out).toMatch(/\.bccf-daterange-hint\b/);
            expect(out).toMatch(/\.bccf-daterange-label\b/);
        });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: the new `it` fails (selectors missing).

- [ ] **Step 3: Append the picker CSS to `PRIMITIVES`**

In `FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js`, locate the `PRIMITIVES` template literal. Just before the closing backtick (the line containing only `    `;), append:

```css

        /* Date range picker (E1 spec §3.2) */
        .bccf-daterange { position: relative; display: inline-block; }
        .bccf-daterange-trigger { display: inline-flex; align-items: center; gap: 6px; background: var(--bccf-surface); border: 1px solid var(--bccf-border); border-radius: var(--bccf-r-md); padding: 6px 12px; font-size: var(--bccf-text-sm); color: var(--bccf-ink-700); font-weight: 500; cursor: pointer; }
        .bccf-daterange-trigger:hover { background: var(--bccf-bg-50); }
        .bccf-daterange-trigger .bccf-daterange-label { color: var(--bccf-ink-900); }
        .bccf-daterange-trigger[disabled] { opacity: 0.6; cursor: not-allowed; }
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/modules/bc_cf_styles.test.js`
Expected: all assertions pass, including the new ones and the existing `namespaces every class with bccf- prefix` (every new class is prefixed).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 6: Deploy the styles module**

Run: `npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js"`
Expected: success. (The new CSS is dormant — no markup uses it yet.)

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js tests/modules/bc_cf_styles.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_styles): add .bccf-daterange* primitives for E1 picker

10 new selectors covering trigger pill, dropdown panel, preset chip grid,
custom-range inputs, hint footer, disabled state. All use existing design
tokens — no new colors or sizing introduced. Spec §3.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — Combined SL: picker + KPI sublines + trend carry-forward

**Goal of phase:** First user-visible delivery. The Combined report gets the full picker, KPI sublines that show project totals next to the range value, and a trend line that starts at `cumulativeBefore` instead of $0.

**Phase exit criteria:** Combined SL renders the picker pill in its header; clicking opens a panel; preset chips switch the range; custom inputs validate; Apply reloads the page with new URL params; KPI sublines show project totals; trend line begins at carry-forward level. All tests green. Manual sandbox verification on Project 1807 passes.

---

### Task 11: Server-side URL pass-through + initial picker HTML in header

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

The server already reads `projectId` and `mode` from request params. We need to also read `startPeriod` / `endPeriod`, compute the effective range via the same `_resolveRange` logic (duplicated server-side here for the picker label — invalid params from the URL produce a default fallback rather than a JSON error since the SL is HTML, not JSON), pass them through to `resolveDataUrl`, and render the picker HTML in the header.

Because `_resolveRange` lives in `bc_cf_data_sl.js` (which is loaded by a different SuiteCloud script context — not importable from the report SL), the report SL needs its own copy of the small set of helpers. To keep the duplication tight, we add them as local closures in `bc_cf_combined_sl.js` (and later in the cost / revenue SLs). The duplication is acknowledged in spec §3.2 and is intentional for v1.5.

- [ ] **Step 1: Add the failing tests**

Add a new `describe` block at the bottom of `tests/entry_points/bc_cf_combined_sl.test.js`:

```js
describe('bc_cf_combined_sl — date range picker (E1)', () => {

    it('passes startPeriod and endPeriod through to data SL URL when present', () => {
        const res = mockResponse();
        Suitelet.onRequest({
            request: GET({ projectId: '1807', mode: 'cash', startPeriod: '2026-03', endPeriod: '2026-08' }),
            response: res
        });
        const body = res.getBody();
        expect(body).toMatch(/startPeriod=2026-03/);
        expect(body).toMatch(/endPeriod=2026-08/);
    });

    it('renders picker pill with default rolling window when no range params provided', () => {
        const res = mockResponse();
        Suitelet.onRequest({
            request: GET({ projectId: '1807' }),
            response: res
        });
        const body = res.getBody();
        expect(body).toContain('class="bccf-daterange"');
        expect(body).toContain('class="bccf-daterange-trigger"');
        expect(body).toContain('class="bccf-daterange-label"');
        // Both default startPeriod and endPeriod hit the data SL URL
        expect(body).toMatch(/startPeriod=\d{4}-\d{2}/);
        expect(body).toMatch(/endPeriod=\d{4}-\d{2}/);
    });

    it('renders 4 preset chips (8/12/18/24) in panel', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toContain('data-preset="8"');
        expect(body).toContain('data-preset="12"');
        expect(body).toContain('data-preset="18"');
        expect(body).toContain('data-preset="24"');
    });

    it('renders custom From/To month inputs', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toContain('data-input="from"');
        expect(body).toContain('data-input="to"');
        expect(body).toMatch(/type="month"/);
    });

    it('renders 24-month cap hint in panel footer', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toContain('24 months');
    });

    it('falls back to default rolling window when range params are malformed', () => {
        const res = mockResponse();
        // Bad input: should render anyway with defaults (not an error page)
        Suitelet.onRequest({
            request: GET({ projectId: '1807', startPeriod: 'garbage', endPeriod: '2026-13' }),
            response: res
        });
        const body = res.getBody();
        // The SL still serves an HTML page
        expect(body).toMatch(/<!doctype html>/i);
        // Bad inputs don't appear verbatim in the resolved data URL
        expect(body).not.toMatch(/startPeriod=garbage/);
        expect(body).not.toMatch(/endPeriod=2026-13/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: 6 new tests fail (URL params not threaded, picker HTML absent).

- [ ] **Step 3: Add date range helpers + picker HTML helper at the top of the SL module**

Open `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`. Immediately after the `MODULE` / `DATA_SCRIPT_ID` / `DATA_DEPLOY_ID` constants (around line 30), insert:

```js
    // ─── Date range helpers (mirror of bc_cf_data_sl helpers; intentional duplication per spec §3.2) ────

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
    /**
     * Server-side range resolution for the report SL: if request params are
     * present + valid, use them; otherwise fall back to the default rolling
     * window. Unlike the data SL's _resolveRange, this NEVER errors — bad
     * params just degrade to defaults so the HTML page still renders.
     */
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

    /** 'YYYY-MM' → 'Mar 2026' for the picker pill label. */
    const _periodLabelShort = (yyyymm) => {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [y, m] = yyyymm.split('-');
        return MONTHS[Number(m) - 1] + ' ' + y;
    };
```

- [ ] **Step 4: Update `resolveDataUrl` to pass the range through**

Replace the existing `resolveDataUrl` (around line 39) with:

```js
    const resolveDataUrl = (projectId, mode, range) => {
        const base = url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: {
                action:      'combined',
                projectId:   String(projectId),
                mode:        mode || 'cash',
                startPeriod: range.startPeriod,
                endPeriod:   range.endPeriod
            }
        });
        return base;
    };
```

- [ ] **Step 5: Add a `buildPicker` helper near `buildHeader`**

Immediately above the existing `buildHeader` function (around line 59), insert:

```js
    /**
     * Server-render the date range picker with the effective range as initial state.
     * The `min`/`max` attributes on the month inputs are left blank — the client
     * sets them once availableBounds arrives from the JSON fetch. Spec §3.2.
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
```

- [ ] **Step 6: Update `buildHeader` to include the picker**

Find the existing `buildHeader` function. Replace the `headerRight` template literal so it includes the picker between meta and toggle:

```js
        const headerRight = `
            <div style="display:flex;align-items:center;gap:8px">
                ${buildPicker(range)}
                ${toggle}
                <button type="button" class="bccf-btn" data-action="refresh" title="Refresh">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>`;
```

Also update the function signature from `const buildHeader = (projectId, mode) => {` to `const buildHeader = (projectId, mode, range) => {`.

- [ ] **Step 7: Update `onRequest` to resolve the range and thread it through**

Find `onRequest` (around line 637). Find the block:

```js
            const projectId = request.parameters.projectId;
            const mode      = request.parameters.mode === 'accrual' ? 'accrual' : 'cash';
```

After it, add:

```js
            const range = _resolveRangeOrDefault(
                request.parameters.startPeriod,
                request.parameters.endPeriod
            );
```

Then find `const dataUrl = resolveDataUrl(projectId, mode);` and change it to:

```js
            const dataUrl = resolveDataUrl(projectId, mode, range);
```

Then find `${buildHeader(projectId, mode)}` and change it to:

```js
            ${buildHeader(projectId, mode, range)}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: all tests pass including the 6 new ones.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: 9 suites, all green.

- [ ] **Step 10: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): render picker pill + thread startPeriod/endPeriod into data URL

Server-side: _resolveRangeOrDefault degrades bad params to the default
rolling window instead of erroring (HTML, not JSON). resolveDataUrl now
passes startPeriod + endPeriod through to bc_cf_data_sl. buildPicker
renders the trigger pill + dropdown panel with preset chips and custom
month inputs; client JS lands in Task 12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Picker client JS — open/close, presets, custom validation, Apply

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

Add the picker's interactive behavior to `CLIENT_SCRIPT`. All four behaviors land in one task because they share state (the panel DOM, the current preset selection, the Apply enabled/disabled state).

- [ ] **Step 1: Add the failing tests**

Add to the `describe('bc_cf_combined_sl — date range picker (E1)', ...)` block:

```js
    describe('picker client JS', () => {
        let body;
        beforeEach(() => {
            const res = mockResponse();
            Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
            body = res.getBody();
        });

        it('listens for [data-action="open-daterange"]', () => {
            expect(body).toMatch(/open-daterange/);
        });
        it('listens for [data-action="apply-daterange"]', () => {
            expect(body).toMatch(/apply-daterange/);
        });
        it('listens for preset chip clicks', () => {
            expect(body).toMatch(/data-preset/);
        });
        it('inlines outside-click / Esc handler', () => {
            expect(body).toMatch(/Escape|keydown/);
        });
        it('rebuilds URL with startPeriod/endPeriod on apply', () => {
            // The client script contains a URL-build helper that sets both params
            expect(body).toMatch(/startPeriod/);
            expect(body).toMatch(/endPeriod/);
        });
        it('clamps availableBounds onto the from/to inputs after fetch', () => {
            // The client script wires data.availableBounds → input min/max
            expect(body).toMatch(/availableBounds/);
        });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: 6 new tests fail (none of those strings appear in `CLIENT_SCRIPT` yet).

- [ ] **Step 3: Add picker JS to `CLIENT_SCRIPT`**

Locate `CLIENT_SCRIPT` in `bc_cf_combined_sl.js`. Inside the IIFE, find the existing `// ── Event delegation ──────` comment (around line 584). Immediately ABOVE that comment, insert a new section:

```js
    // ── Date range picker (E1 spec §3.2) ─────────────────────────────────────

    /**
     * Add N months to a YYYY-MM string. UTC-safe.
     */
    function addMonths(yyyymm, n) {
        var parts = yyyymm.split('-');
        var y = Number(parts[0]);
        var m = Number(parts[1]);
        var d = new Date(Date.UTC(y, (m - 1) + n, 1));
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }

    function monthsBetween(s, e) {
        var sp = s.split('-').map(Number);
        var ep = e.split('-').map(Number);
        return (ep[0] - sp[0]) * 12 + (ep[1] - sp[1]) + 1;
    }

    /** Center N-month window around the current month: −floor(N/4) / +(N - floor(N/4) - 1) per spec preset behavior. */
    function presetWindow(n) {
        var now = new Date();
        var cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        var back = Math.floor(n / 4);  // 8→2, 12→3, 18→4, 24→6
        return { startPeriod: addMonths(cur, -back), endPeriod: addMonths(cur, n - back - 1) };
    }

    function pickerEl() { return document.getElementById('bccf-daterange'); }
    function pickerPanel() { var p = pickerEl(); return p ? p.querySelector('.bccf-daterange-panel') : null; }
    function pickerFrom()  { var p = pickerEl(); return p ? p.querySelector('[data-input="from"]') : null; }
    function pickerTo()    { var p = pickerEl(); return p ? p.querySelector('[data-input="to"]')   : null; }
    function pickerApply() { var p = pickerEl(); return p ? p.querySelector('[data-action="apply-daterange"]') : null; }

    function setActivePreset(n) {
        var p = pickerEl();
        if (!p) return;
        p.querySelectorAll('[data-preset]').forEach(function(b) {
            b.classList.toggle('active', String(n) === b.dataset.preset);
        });
    }

    function clearActivePreset() {
        var p = pickerEl();
        if (!p) return;
        p.querySelectorAll('[data-preset]').forEach(function(b) { b.classList.remove('active'); });
    }

    /**
     * Validate the custom From/To inputs. Returns null if valid (then enables Apply),
     * or a short message if invalid (then disables Apply).
     */
    function validatePickerInputs() {
        var from = pickerFrom();
        var to   = pickerTo();
        var apply = pickerApply();
        if (!from || !to || !apply) return 'init';
        var f = from.value;
        var t = to.value;
        var ok = /^\\d{4}-(0[1-9]|1[0-2])$/.test(f) && /^\\d{4}-(0[1-9]|1[0-2])$/.test(t);
        if (!ok) {
            apply.disabled = true;
            return 'Invalid month';
        }
        if (f > t) {
            apply.disabled = true;
            return 'From must be on or before To';
        }
        if (monthsBetween(f, t) > 24) {
            apply.disabled = true;
            return 'Maximum 24 months';
        }
        apply.disabled = false;
        return null;
    }

    function openPicker() {
        var panel = pickerPanel();
        if (panel) panel.style.display = 'block';
    }
    function closePicker() {
        var panel = pickerPanel();
        if (panel) panel.style.display = 'none';
    }

    function applyPicker() {
        var from = pickerFrom();
        var to   = pickerTo();
        if (!from || !to) return;
        if (validatePickerInputs() !== null) return;  // re-check
        var u = new URL(window.location.href);
        u.searchParams.set('startPeriod', from.value);
        u.searchParams.set('endPeriod',   to.value);
        window.location.replace(u.toString());
    }

    // Wire picker events
    document.addEventListener('click', function(e) {
        // Open/close on trigger
        var trigger = e.target.closest('[data-action="open-daterange"]');
        if (trigger) {
            var panel = pickerPanel();
            var isOpen = panel && panel.style.display === 'block';
            if (isOpen) closePicker(); else openPicker();
            return;
        }
        // Apply
        if (e.target.closest('[data-action="apply-daterange"]')) {
            applyPicker();
            return;
        }
        // Preset chip
        var preset = e.target.closest('[data-preset]');
        if (preset) {
            var n = Number(preset.dataset.preset);
            var win = presetWindow(n);
            var from = pickerFrom();
            var to   = pickerTo();
            if (from) from.value = win.startPeriod;
            if (to)   to.value   = win.endPeriod;
            setActivePreset(n);
            validatePickerInputs();
            return;
        }
        // Outside click closes panel
        var p = pickerEl();
        if (p && !p.contains(e.target)) closePicker();
    }, true);

    // Custom input edits clear preset + revalidate
    document.addEventListener('input', function(e) {
        if (!e.target.matches('[data-input="from"], [data-input="to"]')) return;
        clearActivePreset();
        validatePickerInputs();
    });

    // Esc closes panel
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closePicker();
    });

    /**
     * After the JSON fetch resolves, clamp the from/to inputs to availableBounds
     * so the native month-picker UI honors the project's actual data window.
     */
    function applyBoundsToPicker(availableBounds) {
        if (!availableBounds) return;
        var from = pickerFrom();
        var to   = pickerTo();
        if (from) {
            from.setAttribute('min', availableBounds.minPeriod);
            from.setAttribute('max', availableBounds.maxPeriod);
        }
        if (to) {
            to.setAttribute('min', availableBounds.minPeriod);
            to.setAttribute('max', availableBounds.maxPeriod);
        }
    }
```

- [ ] **Step 4: Hook `applyBoundsToPicker` into the existing fetch resolver**

In the same `CLIENT_SCRIPT`, locate the `.then(function(data) { ... })` block inside `loadData` (around line 549). Inside that handler, immediately after the `if (!data.ok) throw new Error(...)` line, add:

```js
                applyBoundsToPicker(data.availableBounds);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: all tests pass.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: 9 suites green.

- [ ] **Step 7: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): wire picker interactivity — presets, custom range, Apply→reload

CLIENT_SCRIPT now handles: open/close (trigger + outside-click + Esc),
preset chip selection (8/12/18/24 months centered around current month),
custom From/To validation (format + ordering + 24-month cap → disable
Apply), Apply (rebuild URL with startPeriod/endPeriod params, full reload).
availableBounds from the JSON fetch clamps the native month-picker min/max.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: KPI sublines — show project totals next to range values

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

Per spec §3.4, each KPI under the filter shows the in-range value as the headline and the project total as a subline. The existing `renderKpis(kpis)` becomes `renderKpis(kpis, projectTotals)`.

- [ ] **Step 1: Add the failing test**

Add to the `describe('bc_cf_combined_sl — date range picker (E1)', ...)` block:

```js
    it('renderKpis function in CLIENT_SCRIPT accepts projectTotals', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        // The fetch resolver passes projectTotals into renderKpis
        expect(body).toMatch(/renderKpis\(data\.kpis,\s*data\.projectTotals\)/);
        // The renderKpis function signature accepts the new arg
        expect(body).toMatch(/function renderKpis\(kpis,\s*projectTotals\)/);
        // KPI sublines reference project totals
        expect(body).toMatch(/projectTotals/);
    });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: the new test fails.

- [ ] **Step 3: Update `renderKpis` in `CLIENT_SCRIPT`**

In `bc_cf_combined_sl.js`, locate `function renderKpis(kpis) {` inside `CLIENT_SCRIPT` (around line 220). Replace the entire function with:

```js
    function renderKpis(kpis, projectTotals) {
        projectTotals = projectTotals || { revenue: 0, cost: 0 };

        var projectNet = (projectTotals.revenue || 0) - (projectTotals.cost || 0);
        var projectMargin = projectTotals.revenue
            ? (projectNet / projectTotals.revenue) * 100
            : 0;

        var netColor = kpis.netCashFlow >= 0
            ? 'var(--bccf-success-500)'
            : 'var(--bccf-danger-500)';

        var cards = [
            // 1. Total Revenue (range) — subline shows project total
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(kpis.totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.revenue)) + ' project total</div>'
            + '</div>',

            // 2. Total Cost (range) — subline shows project total
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Total Cost</div>'
                + '<div class="bccf-v" style="color:var(--bccf-cost-500)">' + esc(fmtCurrency(kpis.totalCost)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.cost)) + ' project total</div>'
            + '</div>',

            // 3. Net Cash Flow (range) — subline shows project net + margin
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Net Cash Flow</div>'
                + '<div class="bccf-v" style="color:' + netColor + '">' + esc(fmtCurrency(kpis.netCashFlow)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectNet)) + ' project / ' + esc(fmtPct(projectMargin)) + ' overall</div>'
            + '</div>',

            // 4. Margin (range) — subline shows project margin
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Margin</div>'
                + '<div class="bccf-v">' + esc(fmtPct(kpis.margin)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtPct(projectMargin)) + ' project overall</div>'
            + '</div>'
        ];

        return cards.join('');
    }
```

- [ ] **Step 4: Update the caller in `loadData`**

Find the line `if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis);` (around line 554) and change it to:

```js
                if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis, data.projectTotals);
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 9 suites green.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): KPI sublines show project totals beside range values

renderKpis now takes (kpis, projectTotals). Each card's bccf-sub line shows
the equivalent project-wide number: revenue total, cost total, project net
+ overall margin, project margin. Spec §3.4 KPI table — Combined column.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Trend-line carry-forward — use `cumulativeBefore` instead of $0

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js`
- Modify: `tests/entry_points/bc_cf_combined_sl.test.js`

Per spec §3.5, the Combined chart's polyline must begin at `cumulativeBefore` (net accumulated in periods strictly before the range) rather than $0. The signature of `renderChart` widens to `(periods, categories, cumulativeBefore)`.

- [ ] **Step 1: Add the failing test**

Add to the `describe('bc_cf_combined_sl — date range picker (E1)', ...)` block:

```js
    it('renderChart in CLIENT_SCRIPT accepts cumulativeBefore for trend carry-forward', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        // Updated signature
        expect(body).toMatch(/function renderChart\(periods,\s*categories,\s*cumulativeBefore\)/);
        // Caller threads cumulativeBefore through
        expect(body).toMatch(/renderChart\(data\.periods,\s*data\.categories,\s*data\.cumulativeBefore\)/);
        // Trend-line math: cumNet[0] starts at cumulativeBefore + net[0]
        expect(body).toMatch(/cumulativeBefore/);
    });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test -- tests/entry_points/bc_cf_combined_sl.test.js`
Expected: new test fails.

- [ ] **Step 3: Update `renderChart` signature + trend math**

In `bc_cf_combined_sl.js`, locate `function renderChart(periods, categories) {` inside `CLIENT_SCRIPT` (around line 268). Change the signature to:

```js
    function renderChart(periods, categories, cumulativeBefore) {
```

Then find the existing trend math:

```js
        var net = periods.map(function(_, i) { return (revTotal[i] || 0) - (costTotal[i] || 0); });
        var cumNet = net.reduce(function(acc, n) { acc.push((acc[acc.length - 1] || 0) + n); return acc; }, []);
```

Replace with:

```js
        var net = periods.map(function(_, i) { return (revTotal[i] || 0) - (costTotal[i] || 0); });
        var carry = Number(cumulativeBefore) || 0;
        var cumNet = net.reduce(function(acc, n) {
            var prev = acc.length === 0 ? carry : acc[acc.length - 1];
            acc.push(prev + n);
            return acc;
        }, []);
```

- [ ] **Step 4: Update the caller in `loadData`**

Find `if (chartEl) chartEl.innerHTML = renderChart(data.periods, data.categories);` (around line 557) and change to:

```js
                if (chartEl) chartEl.innerHTML = renderChart(data.periods, data.categories, data.cumulativeBefore);
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 9 suites green.

- [ ] **Step 6: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js tests/entry_points/bc_cf_combined_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_combined_sl): trend line starts at cumulativeBefore — truthful carry-forward

renderChart signature widens to (periods, categories, cumulativeBefore).
The polyline's first y now uses cumulativeBefore + net[0] instead of $0,
so a range that starts mid-project shows the trend continuing from the
already-accumulated cash position. Spec §3.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Phase 3 deploy + Combined sandbox verification

**Files:** none.

- [ ] **Step 1: Deploy the styles + data SL + combined SL**

Run these uploads (the data SL already shipped in Phase 1 but re-upload is safe if helpers were tweaked):

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js"
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js"
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_combined_sl.js"
```

Expected: 3 successful uploads.

- [ ] **Step 2: Pause for user manual verification on Combined report**

Ask the user to open BC Project 1807 → Cash Flow → Combined subtab. Verify:

1. The header shows a date range pill (e.g. "Feb 2026 – Jan 2027") next to the Cash/Accrual toggle.
2. Clicking the pill opens a dropdown panel with 4 preset chips (8/12/18/24 months) + From/To month inputs + Apply button.
3. The 12-month chip is highlighted by default.
4. Clicking 8 months collapses the chips; selecting 24 months and clicking Apply reloads the page with `?startPeriod=...&endPeriod=...` in the URL and the report shows 24 columns.
5. Picking a from-month later than to-month disables the Apply button.
6. Picking a range > 24 months disables Apply.
7. Esc and outside-click close the panel without applying.
8. KPI cards now show project totals in their subline (e.g. Revenue card subline: "$42,000.00 project total").
9. The cumulative net trend line begins at the project's pre-range carry-forward, not at $0 (visible if the range starts after some project activity).
10. Switching Cash ↔ Accrual still works and preserves the date range in the URL.
11. The Refresh button still works.

Do not proceed to Phase 4 until the user confirms.

- [ ] **Step 3: Wait for user confirmation**

If issues are found, diagnose and fix BEFORE mirroring the picker to Cost / Revenue SLs (those are copy-paste tasks; you do NOT want to copy a bug into 2 more files).

---

# Phase 4 — Cost SL: picker + KPI sublines (mirror of Phase 3)

**Goal of phase:** Apply the same picker + KPI subline pattern to the Cost report. No trend line on this SL.

---

### Task 16: Mirror picker server-rendering into Cost SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`
- Modify: `tests/entry_points/bc_cf_cost_report_sl.test.js`

This is a near-verbatim copy of Task 11 + Task 12 with `combined`-specific references renamed. Because the picker server helpers are short, we duplicate them inline (spec §3.2 explicitly approves this).

- [ ] **Step 1: Add the failing tests (port from Combined tests)**

Append to `tests/entry_points/bc_cf_cost_report_sl.test.js`:

```js
describe('bc_cf_cost_report_sl — date range picker (E1)', () => {

    it('passes startPeriod and endPeriod through to data SL URL', () => {
        const res = mockResponse();
        Suitelet.onRequest({
            request: GET({ projectId: '1807', startPeriod: '2026-03', endPeriod: '2026-08' }),
            response: res
        });
        const body = res.getBody();
        expect(body).toMatch(/startPeriod=2026-03/);
        expect(body).toMatch(/endPeriod=2026-08/);
        // Still threaded under action=cost
        expect(body).toMatch(/action=cost/);
    });

    it('renders picker pill with default rolling window', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toContain('class="bccf-daterange"');
        expect(body).toContain('class="bccf-daterange-trigger"');
        expect(body).toMatch(/startPeriod=\d{4}-\d{2}/);
        expect(body).toMatch(/endPeriod=\d{4}-\d{2}/);
    });

    it('renders 4 preset chips', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toContain('data-preset="8"');
        expect(body).toContain('data-preset="12"');
        expect(body).toContain('data-preset="18"');
        expect(body).toContain('data-preset="24"');
    });

    it('wires open/close/apply/preset handlers', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toMatch(/open-daterange/);
        expect(body).toMatch(/apply-daterange/);
        expect(body).toMatch(/data-preset/);
        expect(body).toMatch(/Escape|keydown/);
    });

    it('renderKpis accepts projectTotals', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toMatch(/function renderKpis\(kpis,\s*projectTotals\)/);
        expect(body).toMatch(/renderKpis\(data\.kpis,\s*data\.projectTotals\)/);
    });

    it('clamps availableBounds onto inputs after fetch', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toMatch(/availableBounds/);
    });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npm test -- tests/entry_points/bc_cf_cost_report_sl.test.js`
Expected: 6 new tests fail.

- [ ] **Step 3: Copy the date range helpers + `_periodLabelShort` + `_resolveRangeOrDefault` block from Combined**

Open `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js`. Immediately after the `MODULE` / `DATA_SCRIPT_ID` / `DATA_DEPLOY_ID` constants (around line 30), insert the SAME helper block from Task 11 step 3. Use it verbatim — the helpers are identical.

- [ ] **Step 4: Copy the `buildPicker` helper**

Immediately above the existing `buildHeader` in `bc_cf_cost_report_sl.js`, insert the SAME `buildPicker` function from Task 11 step 5. The function body is identical.

- [ ] **Step 5: Update `resolveDataUrl` signature to take `range`**

Replace the existing `resolveDataUrl` with:

```js
    const resolveDataUrl = (projectId, mode, range) => {
        const base = url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: {
                action:      'cost',
                projectId:   String(projectId),
                mode:        mode || 'cash',
                startPeriod: range.startPeriod,
                endPeriod:   range.endPeriod
            }
        });
        return base;
    };
```

- [ ] **Step 6: Update `buildHeader` to take + render the picker**

Change signature from `const buildHeader = (projectId, mode) => {` to `const buildHeader = (projectId, mode, range) => {`. Update the `headerRight` to insert `${buildPicker(range)}` before `${toggle}` (same change as Task 11 step 6).

- [ ] **Step 7: Add picker client JS to `CLIENT_SCRIPT`**

In the Cost SL's `CLIENT_SCRIPT`, paste the entire `// ── Date range picker (E1 spec §3.2) ─` block from Task 12 step 3 immediately before the existing `// ── Event delegation ──` comment.

- [ ] **Step 8: Hook `applyBoundsToPicker` into the cost loader's fetch resolver**

Same pattern as Task 12 step 4: inside the `.then(function(data) { ... })` block of `loadData`, immediately after `if (!data.ok) throw new Error(...)`, add:

```js
                applyBoundsToPicker(data.availableBounds);
```

- [ ] **Step 9: Update `renderKpis` to take `projectTotals` and surface project total cost**

Locate `function renderKpis(kpis) {` in the Cost SL's `CLIENT_SCRIPT` (around line 219). Replace with:

```js
    function renderKpis(kpis, projectTotals) {
        projectTotals = projectTotals || { cost: 0 };

        var totalCost    = kpis.totalCost    || 0;
        var currentMonth = kpis.currentMonth || 0;
        var peakMonth    = kpis.peakMonth    || 0;
        var remaining    = kpis.remaining    || 0;
        var projCost     = projectTotals.cost || 0;

        var currentPct = totalCost ? fmtPct((currentMonth / totalCost) * 100) : '0.0%';
        var peakPct    = totalCost ? fmtPct((peakMonth    / totalCost) * 100) : '0.0%';
        var remPct     = totalCost ? fmtPct((remaining    / totalCost) * 100) : '0.0%';

        var cards = [
            // 1. Total Cost (range) — subline shows project total
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Total Cost</div>'
                + '<div class="bccf-v" style="color:var(--bccf-cost-500)">' + esc(fmtCurrency(totalCost)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projCost)) + ' project total</div>'
            + '</div>',

            // 2. Current Month (in range, else 0)
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Current Month</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(currentMonth)) + '</div>'
                + '<div class="bccf-sub">' + esc(currentPct) + ' of range</div>'
            + '</div>',

            // 3. Peak Month (in range)
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Peak Month</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(peakMonth)) + '</div>'
                + '<div class="bccf-sub">' + esc(peakPct) + ' of range</div>'
            + '</div>',

            // 4. Remaining (in range, from current month onward)
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Remaining</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(remaining)) + '</div>'
                + '<div class="bccf-sub">' + esc(remPct) + ' of range</div>'
            + '</div>'
        ];

        return cards.join('');
    }
```

- [ ] **Step 10: Update the `loadData` caller to pass `projectTotals`**

Find `if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis);` in the Cost SL and replace with:

```js
                if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis, data.projectTotals);
```

- [ ] **Step 11: Update `onRequest` to resolve range + pass through**

Find `onRequest` in the Cost SL. After the `projectId` / `mode` lines, add:

```js
            const range = _resolveRangeOrDefault(
                request.parameters.startPeriod,
                request.parameters.endPeriod
            );
```

Find `const dataUrl = resolveDataUrl(projectId, mode);` → change to `const dataUrl = resolveDataUrl(projectId, mode, range);`.

Find `${buildHeader(projectId, mode)}` → change to `${buildHeader(projectId, mode, range)}`.

- [ ] **Step 12: Run tests**

Run: `npm test -- tests/entry_points/bc_cf_cost_report_sl.test.js`
Expected: all green.

Run: `npm test`
Expected: 9 suites green.

- [ ] **Step 13: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js tests/entry_points/bc_cf_cost_report_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_cost_report_sl): mirror E1 picker + KPI sublines from Combined SL

Server helpers (_validateYYYYMM, _addMonths, _monthsBetween, _defaultRange,
_resolveRangeOrDefault, _periodLabelShort) + buildPicker duplicated from
bc_cf_combined_sl per spec §3.2 (inlined client pattern). renderKpis takes
projectTotals; Total Cost card's subline shows project total. CLIENT_SCRIPT
gains the same picker JS — open/close, presets, custom validation, Apply
reload, availableBounds clamp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Deploy + sandbox verify Cost report

**Files:** none.

- [ ] **Step 1: Upload the cost SL**

Run: `npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_cost_report_sl.js"`
Expected: success.

- [ ] **Step 2: Ask the user to verify in sandbox**

On BC Project 1807 → Cash Flow → Cost subtab, verify:
1. Date range pill renders in the header.
2. All picker behaviors work (open, presets, custom validation, Apply, Esc, outside-click).
3. Total Cost KPI shows project total in its subline.
4. Switching range narrows the period columns + recomputes Current/Peak/Remaining KPIs.
5. Cash/Accrual toggle still works and preserves the range.

Do not proceed until user confirms.

---

# Phase 5 — Revenue SL: picker + KPI sublines

### Task 18: Mirror picker into Revenue SL

**Files:**
- Modify: `FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js`
- Modify: `tests/entry_points/bc_cf_rev_report_sl.test.js`

Exactly parallel to Task 16, with two differences in the KPI renderer: (a) the subline on the Total Revenue card shows project total revenue, (b) the Base Contract and Change Orders cards show their own project totals (computed client-side by filtering `categories.revenue.lines` — same logic as the existing code, but applied to a hypothetical "all periods" view ... actually, the data SL only returns in-range lines, so for project-total base/CO sublines we infer that the user's filter does NOT change which lines exist, only their per-period amounts. The lines themselves are stable across range changes — what changes is `line.amounts[i]` and `line.total`. Project totals for base/CO would need separate aggregation server-side.

The spec §3.4 says: Revenue KPI 2 = "Base Contract (in range) · subline: total" and KPI 3 = "Change Orders (in range) · subline: total". So we need project totals for base and COs across all periods. The cleanest path: extend `projectTotals` to include `baseContract` and `changeOrders` for the revenue action.

Update the data SL (`bc_cf_data_sl.js`) so that the revenue loader's `projectTotals` includes `baseContract` + `changeOrders` (derived by re-running the existing line-classification on an unfiltered query result — OR more cheaply, by adding two more total queries). The simplest approach: add ONE more `_pivotDirection` pass against an unfiltered rowset for the revenue loader, then extract `baseContract` / `changeOrders` from that pivot's `lines`. This avoids two extra SQL hits.

We'll do that as part of this task (changes the data SL contract slightly — non-breaking, just adds keys to `projectTotals` for the revenue action).

- [ ] **Step 1: Add failing tests for revenue SL**

Append to `tests/entry_points/bc_cf_rev_report_sl.test.js`:

```js
describe('bc_cf_rev_report_sl — date range picker (E1)', () => {

    it('passes startPeriod and endPeriod through to data SL URL', () => {
        const res = mockResponse();
        Suitelet.onRequest({
            request: GET({ projectId: '1807', startPeriod: '2026-03', endPeriod: '2026-08' }),
            response: res
        });
        const body = res.getBody();
        expect(body).toMatch(/startPeriod=2026-03/);
        expect(body).toMatch(/endPeriod=2026-08/);
        expect(body).toMatch(/action=revenue/);
    });

    it('renders picker pill + 4 preset chips', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toContain('class="bccf-daterange"');
        expect(body).toContain('data-preset="8"');
        expect(body).toContain('data-preset="24"');
    });

    it('wires picker handlers + bounds clamp', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toMatch(/open-daterange/);
        expect(body).toMatch(/apply-daterange/);
        expect(body).toMatch(/Escape|keydown/);
        expect(body).toMatch(/availableBounds/);
    });

    it('renderKpis accepts projectTotals', () => {
        const res = mockResponse();
        Suitelet.onRequest({ request: GET({ projectId: '1807' }), response: res });
        const body = res.getBody();
        expect(body).toMatch(/function renderKpis\(kpis,\s*categories,\s*projectTotals\)/);
        expect(body).toMatch(/renderKpis\(data\.kpis,\s*data\.categories,\s*data\.projectTotals\)/);
    });
});
```

Also add this test to `tests/entry_points/bc_cf_data_sl.test.js`, inside the existing `describe('bc_cf_data_sl revenue action shape', ...)` block:

```js
    it('returns projectTotals.baseContract and projectTotals.changeOrders on revenue action', () => {
        jest.spyOn(Suitelet, '_loadRevenue').mockReturnValue({
            periods: [],
            categories: { revenue: { lines: [], total: [], grandTotal: 0 } },
            kpis: { totalRevenue: 0, baseContract: 0, changeOrders: 0, peakMonth: 0 },
            range: { startPeriod: '2026-04', endPeriod: '2026-04' },
            availableBounds: { minPeriod: '2026-01', maxPeriod: '2027-12' },
            projectTotals: { revenue: 42000, baseContract: 30000, changeOrders: 12000 }
        });
        const req = { method: 'GET', parameters: { action: 'revenue', projectId: '1807' } };
        const res = mockResponse();
        Suitelet.onRequest({ request: req, response: res });
        const body = JSON.parse(res.getBody());
        expect(body.projectTotals.baseContract).toBe(30000);
        expect(body.projectTotals.changeOrders).toBe(12000);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entry_points/bc_cf_rev_report_sl.test.js tests/entry_points/bc_cf_data_sl.test.js`
Expected: 4 + 1 = 5 new tests fail.

- [ ] **Step 3: Extend `bc_cf_data_sl.js` `_loadRevenue` `projectTotals` with base + CO breakdown**

Open `bc_cf_data_sl.js`. We need an unfiltered revenue-line rowset to classify base vs CO. Add a new SuiteQL constant immediately after `REVENUE_TOTAL_SQL`:

```js
    /**
     * Per-line revenue total query: project-wide totals grouped by the
     * same key as REVENUE_SQL, without any date filter. Used to derive
     * project-total baseContract / changeOrders for KPI sublines.
     */
    const REVENUE_LINES_TOTAL_SQL = `
        SELECT
            CASE
                WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL THEN 'CO'
                ELSE 'BASE'
            END AS bucket,
            SUM(NVL(rtl.custrecord_bc_rtl_amount, 0)) AS amount
        FROM customrecord_bc_revenue_timing_line rtl
        WHERE rtl.custrecord_bc_rtl_project = ?
          AND rtl.custrecord_bc_rtl_timing_type = ?
        GROUP BY CASE WHEN rtl.custrecord_bc_rtl_change_order IS NOT NULL THEN 'CO' ELSE 'BASE' END
    `;
```

In `_loadRevenue`, inside the `projectTotals` assignment block, replace:

```js
        const projectTotals = { revenue: Number(totalRow.total_amount) || 0 };
```

with:

```js
        // Bucket project-wide revenue into baseContract vs changeOrders
        let bucketRows;
        try {
            bucketRows = query.runSuiteQL({
                query: REVENUE_LINES_TOTAL_SQL,
                params: [projectId, timingType]
            }).asMappedResults();
        } catch (e) {
            log.error({ title: MODULE + '._loadRevenue (buckets)', details: e.message + '\n' + (e.stack || '') });
            bucketRows = [];
        }
        const baseTotal = (bucketRows.find((r) => r.bucket === 'BASE') || {}).amount || 0;
        const coTotal   = (bucketRows.find((r) => r.bucket === 'CO')   || {}).amount || 0;
        const projectTotals = {
            revenue:       Number(totalRow.total_amount) || 0,
            baseContract:  Number(baseTotal) || 0,
            changeOrders:  Number(coTotal) || 0
        };
```

- [ ] **Step 4: Copy server helpers + `buildPicker` into `bc_cf_rev_report_sl.js`**

Same pattern as Task 16 steps 3–4: paste the date range helpers + `_periodLabelShort` + `_resolveRangeOrDefault` block right after the constants, and paste `buildPicker` above `buildHeader`. Use the same code verbatim from Task 11 steps 3 + 5.

- [ ] **Step 5: Update `resolveDataUrl` for Revenue**

```js
    const resolveDataUrl = (projectId, mode, range) => {
        const base = url.resolveScript({
            scriptId:     DATA_SCRIPT_ID,
            deploymentId: DATA_DEPLOY_ID,
            returnExternalUrl: false,
            params: {
                action:      'revenue',
                projectId:   String(projectId),
                mode:        mode || 'cash',
                startPeriod: range.startPeriod,
                endPeriod:   range.endPeriod
            }
        });
        return base;
    };
```

- [ ] **Step 6: Update `buildHeader` signature + insert `${buildPicker(range)}`**

Same as Task 16 step 6.

- [ ] **Step 7: Add picker client JS to Revenue's `CLIENT_SCRIPT`**

Paste the same `// ── Date range picker (E1 spec §3.2) ─` block from Task 12 step 3 into the Revenue SL's `CLIENT_SCRIPT`, immediately before its `// ── Event delegation ──` comment.

- [ ] **Step 8: Hook `applyBoundsToPicker` into the Revenue fetch resolver**

Same as Task 16 step 8.

- [ ] **Step 9: Update Revenue's `renderKpis` to take `projectTotals`**

Locate `function renderKpis(kpis, categories) {` in the Revenue SL's `CLIENT_SCRIPT`. The existing signature already takes `categories`. Change to `function renderKpis(kpis, categories, projectTotals) {` and replace the body with:

```js
    function renderKpis(kpis, categories, projectTotals) {
        projectTotals = projectTotals || { revenue: 0, baseContract: 0, changeOrders: 0 };

        var totalRevenue = kpis.totalRevenue  || 0;
        var baseContract = kpis.baseContract  || 0;
        var changeOrders = kpis.changeOrders  || 0;
        var peakMonth    = kpis.peakMonth     || 0;

        var basePct  = totalRevenue ? fmtPct((baseContract / totalRevenue) * 100) : '0.0%';
        var coPct    = totalRevenue ? fmtPct((changeOrders / totalRevenue) * 100) : '0.0%';
        var peakPct  = totalRevenue ? fmtPct((peakMonth    / totalRevenue) * 100) : '0.0%';

        var coCount = 0;
        if (categories && categories.revenue && categories.revenue.lines) {
            coCount = categories.revenue.lines.filter(function(l) {
                return l.id && l.id.indexOf('CO:') === 0;
            }).length;
        }
        var coCountLabel = coCount + ' CO';

        var cards = [
            // 1. Total Revenue (range) — subline: project total
            '<div class="bccf-kpi accent">'
                + '<div class="bccf-k">Total Revenue</div>'
                + '<div class="bccf-v" style="color:var(--bccf-brand-500)">' + esc(fmtCurrency(totalRevenue)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.revenue)) + ' project total</div>'
            + '</div>',

            // 2. Base Contract (in range) — subline: project total
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Base Contract</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(baseContract)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.baseContract)) + ' project total &middot; ' + esc(basePct) + ' of range</div>'
            + '</div>',

            // 3. Change Orders (in range) — subline: project total + CO count
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Change Orders</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(changeOrders)) + '</div>'
                + '<div class="bccf-sub">' + esc(fmtCurrency(projectTotals.changeOrders)) + ' project total &middot; ' + esc(coCountLabel) + '</div>'
            + '</div>',

            // 4. Peak Month (in range)
            '<div class="bccf-kpi">'
                + '<div class="bccf-k">Peak Month</div>'
                + '<div class="bccf-v">' + esc(fmtCurrency(peakMonth)) + '</div>'
                + '<div class="bccf-sub">' + esc(peakPct) + ' of range</div>'
            + '</div>'
        ];

        return cards.join('');
    }
```

- [ ] **Step 10: Update Revenue's `loadData` to pass `projectTotals`**

Find `if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis, data.categories);` in the Revenue SL and replace with:

```js
                if (kpiEl) kpiEl.innerHTML = renderKpis(data.kpis, data.categories, data.projectTotals);
```

- [ ] **Step 11: Update Revenue's `onRequest`**

Same edits as Task 16 step 11: read params, resolve range, thread into `resolveDataUrl` and `buildHeader`.

- [ ] **Step 12: Run tests**

Run: `npm test`
Expected: 9 suites green.

- [ ] **Step 13: Commit**

```bash
git add FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js FileCabinet/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js tests/entry_points/bc_cf_rev_report_sl.test.js tests/entry_points/bc_cf_data_sl.test.js
git commit -m "$(cat <<'EOF'
feat(bc_cf_rev_report_sl): mirror E1 picker + KPI sublines, add base/CO project totals

Revenue SL gains the same picker server helpers + buildPicker + client JS
as Combined/Cost. renderKpis takes projectTotals and surfaces project total
revenue + base + CO in card sublines. Data SL revenue loader gains
REVENUE_LINES_TOTAL_SQL + breaks projectTotals into { revenue, baseContract,
changeOrders }. Spec §3.4 Revenue column.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Deploy + sandbox verify Revenue report

**Files:** none.

- [ ] **Step 1: Upload Revenue SL + Data SL**

```bash
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_data_sl.js"
npx suitecloud file:upload --paths "/SuiteScripts/BlueCollar/CashFlow/entry_points/bc_cf_rev_report_sl.js"
```

- [ ] **Step 2: Ask the user to verify on Project 1807 → Cash Flow → Revenue subtab**

1. Date range pill renders.
2. All picker behaviors work.
3. Total Revenue card shows project total in subline.
4. Base Contract / Change Orders cards show project totals + range % in subline.
5. CO count remains correct under filter.
6. Cash/Accrual toggle still works and preserves the range.

Wait for confirmation before proceeding.

---

# Phase 6 — End-to-end verification + final commit marker

### Task 20: Final regression sweep + PROJECT_STATUS update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Final full test run**

Run: `npm test`
Expected: 9 suites green, well over 183 tests (likely ~210+ after the new assertions land).

- [ ] **Step 2: Cross-report sandbox sweep**

User opens all 3 reports on Project 1807 in sequence. Verify:
1. Each report's date range pill is independent (changing range on Combined does NOT change Cost or Revenue — verified by spec §5 cross-report consistency).
2. URL of each iframe persists its own range params.
3. Bookmarking a Combined iframe URL with `?startPeriod=...&endPeriod=...` reopens to the same range.
4. No console errors in DevTools across all 3 reports.

- [ ] **Step 3: Update PROJECT_STATUS.md**

Edit `PROJECT_STATUS.md` to move E1 from "SPEC APPROVED, plan pending" to "SHIPPED". Update the Current Phase heading. Append a bullet to Session history for 2026-05-23 (or the actual completion date).

Specifically:
- Change the heading from `## Current Phase: v1.5 Enhancements — E1 (Date Range Filter) Spec Approved, Plan Pending` to `## Current Phase: v1.5 Enhancements — E1 (Date Range Filter) Shipped, E2 (Portfolio Suitelet) Next`.
- Under "v1.5 enhancements — status", change the E1 heading from `### E1 — Date range filtering on report Suitelets · **SPEC APPROVED, plan pending**` to `### E1 — Date range filtering on report Suitelets · **SHIPPED**` and append a sentence noting the plan was executed and deployed.
- In the Session history section, append an entry summarizing the E1 ship.

- [ ] **Step 4: Final commit**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
docs: PROJECT_STATUS — E1 (date range filter) shipped to sandbox

All 3 report SLs now ship with the picker pill, KPI project-total sublines,
and (Combined) trend-line carry-forward via cumulativeBefore. Server-side
24-month cap + validation enforced. Picker component + URL contract ready
for E2 portfolio Suitelet reuse.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Suggest PR**

Ask the user whether they want to:
  a) Merge `feature/v1.5-enhancements` to `main` now (E1 is a complete unit; E2 is a separate brainstorm).
  b) Wait for E2 to ship before merging.

Default recommendation: open the PR now. E1 is independently valuable, E2 has its own brainstorm cycle ahead, and shipping E1 to main means the customer deploy (still pending per PROJECT_STATUS §2 of the open questions) can include the filter.

Do not push or open the PR without explicit user direction.

---

## Self-Review Checklist (run by plan author before handoff)

- ✅ Every spec §6 task bucket maps to a plan task: param validation (Task 2, 3, 4), SQL filter (Tasks 5, 6, 7), `range`/`availableBounds`/`projectTotals` (Tasks 5, 6, 7), `cumulativeBefore` (Task 8), SL tests (covered across Tasks 2–8), CSS primitives (Task 10), picker HTML helper (Task 11), open/close/Esc (Task 12), preset chips (Task 12), custom inputs validation (Task 12), Apply → URL rebuild (Task 12), Combined wiring (Tasks 11–14), Cost wiring (Task 16), Revenue wiring (Task 18), sandbox verification (Tasks 9, 15, 17, 19), deploy + commit (each task ends in a commit).
- ✅ No placeholders ("TBD", "TODO", "implement later").
- ✅ Type consistency: `range = { startPeriod, endPeriod }` used uniformly across loaders, helpers, and `resolveDataUrl`. `availableBounds = { minPeriod, maxPeriod }` consistent. `projectTotals` keys consistent per action (`cost` for cost; `revenue, baseContract, changeOrders` for revenue; `revenue, cost` for combined).
- ✅ Method names consistent: `_resolveRange` (data SL JSON-erroring), `_resolveRangeOrDefault` (report SL HTML-degrading) — distinct names so no shadowing confusion.
- ✅ Spec §3.7 edge cases handled: empty bounds → current month (in `availableBounds` assignment); range outside data → empty pivot result returns zero rows (existing behavior); range > 24mo → server `{ ok:false }` + client Apply disabled; from > to → client Apply disabled; single-month range → `_monthsBetween` returns 1; current month outside range → `currentMonth` KPI = 0 (existing behavior unchanged).

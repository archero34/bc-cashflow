# Apportia Design Guide — bc_wo_wp Reference

**Source:** `/Users/macmurphy/Developer/trp-work-order/bc_wo_wp` (BCP Work Order + Work Performed SDF project)
**Purpose:** Inform Apportia's UI/UX choices. Borrow validated patterns; identify anti-patterns to avoid. This is a reference, not a directive — Apportia owns its own design system.
**Date:** 2026-05-20

---

## TL;DR

- bc_wo_wp ships a complete hand-rolled design system inside two `_html.js` modules — no CSS framework, no vendored component library. Every primitive (tokens, layout, buttons, panels, tables, modals, toasts, skeleton loaders, breadcrumbs, popovers) is defined inline as a `<style>` block and rendered server-side via a SuiteScript AMD module. Apportia should follow the same pattern rather than reaching for a CDN-delivered framework that will fight NetSuite's iframe CSP.
- The loading strategy is deliberate and well-documented: show skeleton rows _before_ the fetch resolves, disable Save until data lands, show a full-page nav-overlay for page-to-page navigation. NetSuite Suitelet cold renders can take 5-8 seconds; bc_wo_wp comments call this out explicitly and designs around it. Apportia faces the same constraint.
- The "two-Suitelet" split (a thin _hosting_ Suitelet that renders HTML + a pure-JSON _data_ Suitelet) is the cleanest pattern the team has validated. Apportia should adopt it: one Suitelet returns the INLINEHTML shell, one or more Suitelets serve action-routed JSON endpoints.
- The CSS token set (`--brand-500 #1f3b5e`, `--ink-*`, `--bg-*`, `--border`, `--success/warn/danger-*`) and type scale (Inter, 12–26px) are locked and consistent across both features. Apportia will want its own palette but should match the token-naming discipline so components swap cleanly.
- There are no vendored third-party JS libraries in bc_wo_wp at all — not Cytoscape, not CodeMirror, nothing. Apportia will need to vendor both itself. The project gives no prior art there; Apportia must solve it from scratch.

---

## What to borrow

### Suitelet shell + INLINEHTML island pattern

**What it is.** Every UI feature is split into two Suitelets: a _hosting_ Suitelet (`bc_wo_mgmt_sl`, `bc_wp_sl`) that returns a complete HTML document written by `bc_wo_html.bundle()` / `bc_wp_html.bundle()`, and a _data_ Suitelet (`bc_wo_data_sl`, `bc_wp_data_sl`) that serves action-routed JSON. The hosting Suitelet is invoked via an INLINEHTML custom field stamped by a User Event script (`bc_wo_mgmt_ue.js`) in a `beforeLoad`. The custom field renders the Suitelet response as a `<iframe>` inside a native NetSuite subtab.

**Where it lives.**
- Hosting Suitelet entry: `FileCabinet/SuiteScripts/BC_WorkOrder/entry_points/bc_wo_mgmt_sl.js` (lines 1–62) and `…/BC_WorkPerformed/entry_points/bc_wp_sl.js` (lines 1–102).
- UE iframe stamper: `…/entry_points/bc_wo_mgmt_ue.js` (lines 1–53). Note lines 18–23 — the iframe is constructed as a bare string with a session-aware URL; width is `100%`, height is hardcoded `900px`, border is `0`.
- Data Suitelet: `…/entry_points/bc_wo_data_sl.js` (lines 1–208).

**Pattern 2 (server-side URL resolution).** The hosting Suitelet resolves the data Suitelet's URL server-side using `N/url.resolveScript` (via `bc_http.buildSuiteletUrl`), then injects it as a `data-data-url` attribute on `<body>`. Client JS reads it via `document.body.getAttribute('data-data-url')`. This is documented in both Suitelet JSDoc headers and tested in `__tests__/bc_wo_html.test.js` (line 28). **Never hardcode `/app/site/hosting/scriptlet.nl` paths in client JS** — the tests enforce this (line 21–26 of `bc_wo_html.test.js`).

**Pattern 4 (inline error card).** If the server-side bundle render throws, the hosting Suitelet catches and writes a styled error card rather than letting NetSuite show its `UNEXPECTED_ERROR` page. See `bc_wp_sl.js` lines 52–62 for the card shape (`.card` with a red left-border, `pre` stack trace). Apportia should adopt this for every hosting Suitelet.

**Apportia application.** Use this split exactly: one Suitelet per UI surface that returns the full HTML shell; one or more data Suitelets returning `{ ok, ...data }` JSON. Stamp INLINEHTML fields from a UE `beforeLoad` using server-resolved URLs.

---

### CSS strategy / utility classes / namespacing

**What it is.** All CSS is inlined in the `<style>` block returned by the `bundle()` function — no external `.css` file, no CDN link, no SuiteApp file cabinet CSS. Each of the two UI surfaces (`bc_wo_html.js`, `bc_wp_html.js`) carries its own full copy of the token set and primitives. There is some deliberate duplication (both files define identical `:root` variable blocks) with a comment in `bc_wp_html.js` (line 36) noting the aesthetic was "locked in" for the WO Mgmt surface first.

**Token set.** Defined in `:root` at the top of each `styles` const (e.g. `bc_wo_html.js` lines 39–52):

```
Backgrounds:  --bg-50: #f7f8fa   --bg-100: #eef0f4   --surface: #ffffff
Border:       --border: #e2e6ec
Ink (text):   --ink-500: #5b6472   --ink-700: #2f3742   --ink-900: #121821
Brand:        --brand-500: #1f3b5e (navy)   --brand-600: #16304d   --brand-50: #eaeef4
Link:         --link-500: #1f6feb   --link-600: #1a5cc8   --link-50: #e8f0fe
Success:      --success-500: #1f9d55   --success-50: #e7f6ec
Warn:         --warn-500: #c97a0b   --warn-50: #fdf4e3
Danger:       --danger-500: #c2361d   --danger-50: #fbeceb
Type scale:   --text-xs:12px  --text-sm:13px  --text-base:14px  --text-lg:16px
              --text-xl:20px  --text-2xl:26px
Spacing:      --s-1:4px  --s-2:8px  --s-3:12px  --s-4:16px  --s-5:20px  --s-6:24px  --s-8:32px
Radius:       --r-sm:4px  --r-md:6px  --r-lg:10px  --r-full:999px
Shadows:      --shadow-1: subtle  --shadow-2: prominent (modals)
Transition:   --t-fast: 120ms
```

**Body typography.** `font-family: "Inter", "Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` — Inter first, system-ui fallback chain. `-webkit-font-smoothing: antialiased` applied to body. Inter is not self-hosted or vendored — it falls through to system-ui if not available in the browser's font cache.

**Naming.** No `bc-` or `bcp-` prefix on CSS classes. Classes use semantic, minimal names: `.panel`, `.btn`, `.badge`, `.toast`, `.modal`, `.skeleton`, `.chip`, `.crumbs`. This is fine for isolated INLINEHTML islands (no collision risk with native NetSuite CSS), but Apportia should consider namespacing its classes with `apportia-*` as specified in `docs/02-architecture-suitecloud-native.md` §4 if it plans to share CSS across surfaces.

**No utility classes.** bc_wo_wp does not use a utility-class system (no `flex`, `grid`, `p-4` etc.). All layout is composed from semantic class names (`.row`, `.stack`, `.grow`, `.between`, `.page`, `.panel-body`). Spacing is applied inline or via specific selectors rather than composed utilities.

**Apportia application.** Adopt the token set naming convention. Define your own palette as `--apportia-*` tokens but follow the same semantic tiers (bg, surface, border, ink, brand, status). Keep CSS inline in the bundle function — do not reach for an external stylesheet file unless you have a strong reason, because it introduces a file cabinet dependency and a separate round-trip.

---

### Component primitives (toasts, modals, pills, skeleton, etc.)

All primitives are defined in CSS and implemented as HTML strings assembled in JS. No framework components. No Web Components. Here is a complete inventory of what exists:

**Buttons** (`bc_wo_html.js` lines 62–71, mirrored in `bc_wp_html.js` lines 78–86):
- `.btn` — base (inline-flex, gap, padding, min-height 34px)
- `.btn-primary` — navy background, white text
- `.btn-secondary` — surface background, border
- `.btn-ghost` — transparent, link-color text
- `.btn-danger-ghost` — transparent, danger-color text
- `.btn-danger` — danger background, white text (destructive actions)
- `.btn-sm` — compact variant (min-height 28px)
- `.btn.spinning` — SVG spin animation for loading state (`.row-spinner` inline spinner for row-level)

**Panels** (`bc_wo_html.js` lines 74–79):
- `.panel` — white surface, border, `--r-lg` radius, `--shadow-1`
- `.panel-header` — flex, space-between, border-bottom
- `.panel-body` — padding; `.panel-body.flush` — no padding
- `.panel-footer` — flex, right-aligned, bg-50 background

**Badges / pills** (`bc_wo_html.js` lines 82–88):
- `.badge` — base (inline-block, `--r-full`, text-xs, font-weight 500)
- `.badge-success`, `.badge-warn`, `.badge-danger`, `.badge-neutral`, `.badge-brand` — semantic color variants
- `.title-pill` — inline-flex pill used beside page `<h1>` for record counts / states

**Fields** (`bc_wo_html.js` lines 90–97):
- `.field` — flex column, gap 4px
- `label` inside `.field` — uppercase, letter-spaced, ink-500, text-xs
- `input/select/textarea` inside `.field` — border, radius, focus ring (2px solid `--brand-500`)
- `input[readonly]` — bg-100 background, cursor default

**Tables** (`bc_wo_html.js` lines 99–116):
- `table.data` — border-collapse, text-sm
- `thead th` — uppercase, letter-spaced, text-xs, ink-500, bg-50, border-bottom
- `tbody td` — padding, border-bottom, hover bg-50
- `tbody tr.selected` — brand-50 background
- `.num` — right-aligned, tabular-nums
- `.muted` — ink-500 text
- `tfoot` — bg-50, font-weight 600, border-top
- `table.data.compact` — reduced row padding

**Search input** (`bc_wo_html.js` lines 119–133):
- `.search` — composed with inner SVG icon, `<input>`, `.clear` button
- Focus-within border highlight + brand-50 box-shadow

**Breadcrumbs** (`bc_wo_html.js` lines 137–140):
- `.crumbs` — text-sm, ink-500
- `.crumbs a` — link-500, no underline; underline on hover
- `.crumbs .sep` — margin on both sides, ink-500

**Page header** (`bc_wo_html.js` lines 143–154):
- `.page-header h1` — text-2xl (26px), font-weight 600, letter-spacing -0.01em
- `.page-title` — flex, align-items center, gap; used with `<h1>` + `.title-pill` inline
- `.page-header .meta` — ink-500, text-sm

**Meta grid** (`bc_wo_html.js` lines 157–159):
- `.meta-grid` — CSS grid, 5 equal columns, gap `--s-4`
- `.cell .k` — uppercase key label (ink-500, text-xs)
- `.cell .v` — value (ink-900, font-weight 500)

**Expandable rows** (`bc_wo_html.js` lines 165–183):
- `.chev` — 18x18px chevron icon button, rotates 90° on `.row-open` via CSS transition
- `.wo-detail` — expanded row with gradient background `linear-gradient(180deg, #fafbfd 0%, #f4f6fa 100%)`
- `table.lines-mini` — nested table inside expanded row (border, radius, surface background)
- `.wo-actions` — flex row for actions inside expanded row; `.terminal-note` for locked-state messaging

**Selection bar** (`bc_wo_html.js` lines 186–193):
- `.selection-bar` — flex, brand-50 background, border `#c8d3e1`, round corners
- Shows live count + sum as rows are checked

**Sticky action bar** (`bc_wo_html.js` lines 198–206):
- `.action-bar` — `position: sticky; bottom: 0`, border-top, upward box-shadow `0 -4px 12px rgba(18,24,33,.04)`
- Used for Save / Cancel on full-page Create/Edit flows

**Status pills** (`bc_wo_html.js` line 232):
- `.status-select` — thin `<select>` styled as a pill (r-full, border, bg-surface)

**Filter chips** (`bc_wo_html.js` lines 269–277):
- `.chip` / `.chip.active` — pill-shaped toggle buttons for status filter row; active = brand-500 fill

**Resume cards** (`bc_wo_html.js` lines 279–298, extended in `bc_wp_html.js` lines 409–444):
- `.resume-grid` — `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, gap `--s-3`
- `.resume-card` — surface, border, r-md, cursor pointer, border-color + shadow on hover
- `.resume-card.new` — brand-50 tinted, dashed border, centered content; the "create new" affordance within the same grid

**Modal** (`bc_wo_html.js` lines 329–352):
- `.modal-backdrop` — `position: fixed; inset: 0`, semi-transparent overlay (rgba 15,23,38 at 0.55), flex, top-padding 60px for scrollable tall modals
- `.modal` — surface, r-lg, shadow-2, max-width 1100px, max-height `calc(100vh - 120px)`, flex column
- `.modal-header`, `.modal-body`, `.modal-footer` — standard 3-part layout with border separator and bg-50 footer

**Confirm dialog** (`bc_wo_html.js` lines 379–395, identical in `bc_wp_html.js` lines 185–201):
- `.confirm-backdrop` — same overlay pattern as modal, z-index 300 (above modal at 100)
- `.confirm` — max-width 480px, padding 20px 22px
- `.confirm-headline-warn` / `.confirm-headline-danger` — eyebrow label (uppercase, 0.06em letter-spacing)
- Implemented as a `Promise<boolean>` via `confirmDialog(opts)` — caller awaits. Supports `confirmStyle: 'danger'` for destructive flows. Keyboard: Escape = false, Enter = true. Replaces native `confirm()` / `alert()`.

**Toasts** (`bc_wo_html.js` lines 356–378, identical in `bc_wp_html.js` lines 161–183):
- `#toast-host` — `position: fixed; top: 16px; right: 24px`, flex column, gap 8px, z-index 200
- `.toast` — surface, border, shadow-2, min-width 320px, max-width 440px
- `.toast.warn` — `border-left: 4px solid --warn-500`; `.toast.info` — `border-left: 4px solid --brand-500`
- Animate in via `@keyframes toast-in` (translateY 8px → 0, opacity 0 → 1, 200ms)
- Dismiss via close button or TTL (default 4500ms). Self-removes via opacity 0 + 200ms delay.
- Comment in `bc_wp_html.js` (line 161) notes why top-right is used: bottom toasts fall below the iframe fold when the parent NS page is scrolled past the subtab area.

**Skeleton loaders** (`bc_wo_html.js` lines 400–431):
- `.skeleton` — shimmer animation via `background: linear-gradient(90deg, #eef0f4 0%, #f7f8fa 50%, #eef0f4 100%)`, `background-size: 200%`, `animation: skeleton-shimmer 1.2s ease-in-out infinite`
- Variants: `.skeleton.line`, `.skeleton.line.short`, `.skeleton.line.med`, `.skeleton.num`
- `.skeleton-row` — table row pre-populated with skeleton cells; shown before data resolves
- `.skeleton-overlay` — `position: absolute; inset: 0`, `backdrop-filter: blur(2px)`, centered label chip; overlays a loading panel without fully hiding its structure
- In `bc_wp_html.js`, renamed `.sk` (same shimmer, variants: `.sk-wide`, `.sk-narrow`, `.sk-tall`); also `.skeleton-card` for resume-card-sized placeholders shown while fetch resolves

**Navigation overlay** (`bc_wp_html.js` lines 146–158):
- `.nav-overlay` — `position: fixed; inset: 0`, rgba(247,248,250,0.92), flex center, z-index 400
- Contains a `.spinner` (36px spinner) + `.label` text
- Shown immediately on navigation clicks (before `window.location.href` is set) to give feedback during the 5-8 second cold render

**Autocomplete combobox** (`bc_wp_html.js` lines 124–142):
- `.autocomplete` — `position: relative`
- `.autocomplete-results` — `position: absolute; top: calc(100% + 4px)`, surface, border, r-md, max-height 280px, overflow-y auto, z-index 100, shadow-2
- `.ac-item` — padding, cursor pointer, border-bottom; hover/active = brand-50 background
- `.ac-empty`, `.ac-loading` — centered italic ink-500 hint text

**Column meta popover** (`bc_wp_html.js` lines 342–356):
- `#col-meta-popover` — `position: absolute`, `display: none`, z-index 50, white bg, border, r-md `border-radius: 6px`, shadow, width 280px. Toggled via `.open` class.
- Contains label+input pairs for ticket, site, road metadata fields
- No accessibility implementation (no `role="dialog"`, no focus trap). Identified as an area Apportia can improve.

**Locked column state** (`bc_wo_html.js` lines 311–323, `bc_wp_html.js` lines 388–395):
- `th.col-locked`, `td.col-locked` — `background: #f4f5f8 !important`
- Lock indicator: `::after { content: "🔒" }` on the column header tool area

**In-flight row state** (`bc_wo_html.js` lines 249–255):
- `tr.wo-row-pending` — `opacity: 0.55; pointer-events: none` while a server mutation resolves. Prevents double-fire on optimistic concurrency errors.

**Qty warn state** (`bc_wo_html.js` lines 435–445):
- `.qty-input.qty-warn` — amber border + background + color when qty < already-completed amount
- `.qty-warn-tip` — inline hint text below the input

---

### Vendored library set

**There are no vendored JS libraries in bc_wo_wp.** The entire client-side is hand-rolled vanilla JavaScript. No Cytoscape, no CodeMirror, no Lodash, no React, no Alpine. Every utility (HTML escaping, qty parsing, number formatting, debounce, URL manipulation, event delegation, promise-based dialogs) is implemented inline in the HTML bundle or in the shared `bc_http.js` module.

Implications for Apportia:
- Cytoscape (lineage graph) and CodeMirror (formula builder) are first-time dependencies for the team. bc_wo_wp gives no guidance on how to vendor them into a SuiteApp FileCabinet, how to configure their module format for the Rhino/V8 SuiteScript AMD loader, or how to handle their CSS. Apportia must solve this from scratch.
- For anything that does not need Cytoscape or CodeMirror, the vanilla-JS approach is proven to work and has no loading overhead.

---

### JS conventions and module patterns

**AMD modules via `define([...], factory)`.** All server-side SuiteScript uses NApiVersion 2.1 AMD syntax. Every file declares `@NApiVersion 2.1` and `@NModuleScope` in JSDoc. No ES modules, no CommonJS. This is a SuiteCloud constraint, not a choice.

**Client-side JS is a template string, not a module.** The HTML bundle embeds a `<script>` tag with the client JS written as a template literal inside the server-side `clientJs` function. This means the client JS is vanilla (no `define()`, no `import`), uses ES2019-era syntax (arrow functions, template literals, `async/await`, `?.`, `??`), and runs in the browser's V8. `const`/`let` throughout.

**No build tooling.** No webpack, rollup, esbuild, or Babel. No `package.json` scripts for building client JS (there is a `package.json` at project root for the Jest test runner, but it has no bundler). What you write is what NetSuite receives. This limits client JS to what modern browsers support natively.

**Guard against double-evaluation.** `bc_wo_html.js` (line 573) wraps all event-listener registrations in `if (window.__bcWoMgmtWired)` to prevent double-fire when NetSuite re-runs inline `<script>` blocks on subtab iframe re-render. This is a documented gotcha (comment at line 574: "NetSuite occasionally re-runs inline `<script>` blocks inside subtab iframes on re-render"). Apportia should adopt the same guard for any script running in a subtab iframe.

**Delegation over per-element listeners.** All button clicks use `document.addEventListener('click', ...)` with `e.target.closest(selector)` delegation. No per-element `addEventListener` calls on dynamically-rendered rows. This pattern is consistent across both HTML modules.

**State via module-scope variables.** Client state is tracked in `let` variables at the top of the script scope (e.g. `CURRENT_FILTER`, `CURRENT_SORT`, `MODAL_STATE`, `window.__lastWos`). No Proxy-based reactivity, no stores. Simple and debuggable.

**`window.__lastWos` cache.** Rendered data is cached on `window` to enable client-side filter/sort without a re-fetch. The cache is stamped fresh after every list load. Apportia can use the same pattern for similar "filter in memory" interactions.

**HTTP helpers (`bc_http.js`).** `sendJSON` / `sendError` / `buildSuiteletUrl` / `esc` are extracted to a shared module at `Shared/lib/bc_http.js`. `esc()` is defined in three places (server in `bc_http.js`, and inlined in both `bc_wo_html.js` and `bc_wp_html.js` client JS sections) — consistent behavior, safe duplication. Apportia should centralize its own equivalent in a shared lib module.

**Constants as frozen objects (`bc_constants.js`).** All script IDs, record type IDs, field IDs, and status enum values are defined in `Shared/lib/bc_constants.js` as a single `Object.freeze({})` tree. No magic strings anywhere else. This is the pattern Apportia's `apportia_constants.js` equivalent should follow.

**DAO layer (`bc_wo_dao.js`, `bc_wp_dao.js`).** Data access is isolated into `modules/` files that only use `N/record`, `N/search`, `N/query` — no logging, no routing. The DAO throws bare on error; the Suitelet entry point catches and wraps. Apportia should follow the same separation.

**SuiteQL for aggregations.** `bc_wo_remaining.js` and `bc_wp_dao.listRecentReports` both use `query.runSuiteQL().asMappedResults()` for aggregate queries (GROUP BY, JOIN, ORDER BY, FETCH FIRST). `N/search` is used for simple filter-and-list queries. Note: `customrecord_cseg_bc_project` is explicitly not SuiteQL-queryable (comment at `bc_wo_data_sl.js` line 70 and `bc_wp_html.js` line 856) — this is a custom segment restriction, and `record.load` is used instead.

**Action routing.** Data Suitelets route on `?action=` param for GET and `body.action` for POST. Both patterns return `{ ok: true, ...data }` or `{ ok: false, error: '...' }`. No HTTP status codes beyond 200 — the `ok` field is the error signal.

**In-app navigation preserving NS hosting params.** `bc_wp_html.js` (lines 713–735) documents that setting `window.location.search` directly wipes the `script=` and `deploy=` params NetSuite needs to route the Suitelet, causing a "missing required parameter" error. The `buildAppHref` and `navigateToView` helpers preserve all non-app params. Apportia must adopt the same approach for any in-page navigation.

---

### File organization and scriptid naming

**Folder structure per domain:**
```
FileCabinet/SuiteScripts/
  BC_WorkOrder/
    entry_points/     -- Suitelet + UE script files
    modules/          -- DAO, HTML bundle, business logic helpers
  BC_WorkPerformed/
    entry_points/
    modules/
  Shared/
    lib/              -- bc_constants.js, bc_http.js

Objects/
  records/            -- customrecordtype XML
  lists/              -- customlist XML
  scripts/            -- suitelet/ue script + deployment XML

__tests__/            -- Jest unit tests (one per module)
```

**ScriptID conventions:**
- Scripts: `customscript_bc_<feature>_<type>` (e.g. `customscript_bc_wo_mgmt_sl`, `customscript_bc_wp_data_sl`, `customscript_bc_wo_cascade_ue`)
- Deployments: `customdeploy_bc_<feature>_<type>` (mirrors script ID)
- Records: `customrecord_bc_<domain>` (e.g. `customrecord_bc_wo`, `customrecord_bc_wp_report`)
- Fields: `custrecord_bc_<domain>_<field>` (e.g. `custrecord_bc_wo_customer_ref`, `custrecord_bc_wp_col_report`)
- Body/column fields on standard records: `custbody_bc_<field>`, `custcol_bc_<field>`

**Apportia equivalent:** `customscript_apportia_*`, `customrecord_apportia_*`, `custrecord_apportia_*`. Keep the same 3-tier structure: entry_points, modules, Shared/lib.

---

### Integration with native NetSuite records

**UE iframe-stamp pattern** (`bc_wo_mgmt_ue.js`): A single User Event `beforeLoad` on both `customrecord_cseg_bc_project` and `salesorder` stamps INLINEHTML fields with `<iframe src="...">` on `view` and `edit` contexts. The Suitelet URL is resolved server-side via `url.resolveScript`. The UE script itself has no logic beyond building the iframe string — all UI logic lives in the Suitelet bundle.

**INLINEHTML field types:** `custrecord_bc_wo_mgmt_html` and `custrecord_bc_wp_mgmt_html` on the project record; `custbody_bc_wo_mgmt_html` on Sales Order. These are TEXT-type fields with INLINEHTML display type — the string stored is the `<iframe>` element.

**Cascade UE** (`bc_wo_cascade_ue.js`): An `afterSubmit` UE on `customrecord_bc_wo` cascades WO status changes (specifically: Complete → flips all In-Progress WP columns to Complete). This is the only server-side business-logic hook; everything else is mediated through Suitelet API calls.

**JSON-in-CLOBTEXT:** WO lines are stored as a JSON array (`[{line, qty}, ...]`) in a `CLOBTEXT` custom field (`custrecord_bc_wo_lines`). This avoids a child record per line and keeps the WO as a single record write. It trades query flexibility for write simplicity. For Apportia's allocation rules (which may need to be queried), a child record or separate record type may be more appropriate.

---

## What NOT to carry forward

**CSS duplication between features.** `bc_wo_html.js` and `bc_wp_html.js` each carry their own full copy of the `:root` token block and core primitives (buttons, panels, badges, etc.). This works because each feature is an isolated iframe island, but it means any token change requires editing two files. Apportia should extract shared tokens and primitives into a single source, even if the delivery mechanism is still inlined — a shared `apportia_styles.js` module that returns the token block and primitive CSS, imported by each feature's HTML module.

**No CSS namespacing.** bc_wo_wp uses unsuffixed class names (`.panel`, `.btn`, `.badge`, `.modal`). This is safe inside a sandboxed iframe, but if Apportia ever renders outside an iframe (e.g., an INLINEHTML field on a native form without an iframe wrapper), these names will collide with NetSuite's own CSS. Apportia should prefix all its classes with `apportia-` as the architecture spec requires.

**Hardcoded iframe height.** The UE stamper (`bc_wo_mgmt_ue.js` line 18) sets `height:900px` unconditionally. This is a known awkward point — tall content scrolls inside the iframe; short content leaves whitespace. Apportia should implement a `ResizeObserver` / `postMessage` height-sync pattern so the iframe height matches its content.

**No popover accessibility.** The `#col-meta-popover` in `bc_wp_html.js` (lines 342–356) has no `role="dialog"`, no `aria-modal`, no focus trap, and no keyboard-close behavior (the only close paths are `onclick` on two buttons, which requires pointer interaction). Apportia's popover implementation should be fully keyboard-accessible.

**`confirmDialog` + `showToast` are duplicated, not shared.** Both HTML modules implement identical `confirmDialog` and `showToast` functions (compare `bc_wo_html.js` lines 605–699 with `bc_wp_html.js` lines 764–849). The source comment in `bc_wp_html.js` says "mirrors WO Mgmt." This is copy-paste, not shared code — any fix to one must be manually applied to the other. Apportia should put these in a shared client-side utility module (e.g. `Shared/lib/bc_ui_utils.js`) that gets inlined once per bundle.

**`window.__lastWos` global.** Using `window` as a cache avoids a module closure but pollutes the global scope in the iframe. In a more complex app this can cause subtle bugs when multiple features share an iframe. Apportia should use a module-scope `let` or a named object namespace (e.g. `window.__apportia = window.__apportia || {}`) to avoid collisions.

**No explicit ARIA on tables or modals.** The modal uses `role="dialog" aria-modal="true"` on the inner `.confirm` element (good), but the main `.modal` container has none. Tables have no `aria-label` or `aria-describedby`. Search inputs have no `aria-label`. This is a pragmatic tradeoff for a construction-industry field app, but Apportia targeting finance/ops audiences may have a higher accessibility bar.

**Inline `onclick` in markup.** `bc_wp_html.js` line 589–590 uses inline `onclick="closeMetaPopover(false)"` and `onclick="closeMetaPopover(true)"` — the only inline handlers in the codebase. Everything else uses delegated `addEventListener`. Inline handlers require the function to be globally scoped, which is messy. Apportia should be consistent: delegation only.

**Suitelet deployment XML uses `ADMINISTRATOR` run-as role.** All four Suitelets deploy with `<runasrole>ADMINISTRATOR</runasrole>` (see `customscript_bc_wo_mgmt_sl.xml`). This is the easiest path to deployment but grants maximum privilege. Apportia should define a least-privilege custom role for its Suitelet deployments, especially for data-mutating endpoints.

---

## Open questions for the Apportia design phase

1. **Vendoring Cytoscape and CodeMirror.** bc_wo_wp provides no prior art. Key questions: what AMD wrapper format do these libraries need to load via `define()`? Do their CSS files need to be added to the FileCabinet and served via a separate HTTP call? Does NetSuite's CSP in the INLINEHTML iframe allow dynamic script loading? The team will need to test a minimal vendored-library deploy before committing to either library.

2. **Cross-iframe height synchronization.** bc_wo_wp accepts a hardcoded 900px. Apportia's UI will vary significantly in height depending on the number of allocation rules / graph nodes. A `postMessage` height-sync between the iframe and the parent NetSuite page needs to be designed and validated — this is not a solved problem in bc_wo_wp.

3. **Shared CSS module.** bc_wo_wp duplicates CSS across features. Apportia will have more surfaces. Decide whether to: (a) maintain a canonical `apportia_styles.js` module that other HTML modules import and inline, or (b) accept per-surface duplication as bc_wo_wp does. Option (a) is cleaner but requires all HTML modules to import and spread the shared block.

4. **Token palette.** bc_wo_wp uses a navy brand (`#1f3b5e`). Apportia's architecture spec (`docs/02-architecture-suitecloud-native.md` §4) calls for "modern SaaS inside NetSuite" — is navy the right anchor color for an allocation engine? The token set is the right _structure_; the palette is the Apportia designer's choice.

5. **SuiteQL for allocation data.** bc_wo_wp's `bc_wo_remaining.js` shows that complex aggregate queries (multi-join, GROUP BY, FETCH FIRST) work reliably in SuiteQL. However, custom segment records (`customrecord_cseg_*`) are not SuiteQL-queryable — an important gotcha if any of Apportia's data models use custom segments rather than plain custom records.

6. **Standalone vs. embedded modes.** bc_wo_wp's WO Mgmt Suitelet handles both `embedded` (subtab iframe on project record) and `standalone` (direct URL open). Apportia should decide for each surface whether standalone access is needed, and if so, how the URL-routing and context-strip behave when there is no parent record.

7. **Breadcrumb vs. context strip.** bc_wo_wp defines both `.crumbs` (link-based breadcrumb, used in WO Mgmt) and `.context-strip` (bg-100 banner with project/SO/WO context, used in WP). Apportia's spec calls for breadcrumbs explicitly; decide which pattern fits each surface and standardize.

---

## Inventory

### Entry-point scripts

| File | Type | Purpose |
|------|------|---------|
| `BC_WorkOrder/entry_points/bc_wo_mgmt_sl.js` | Suitelet | Returns HTML bundle for WO management UI |
| `BC_WorkOrder/entry_points/bc_wo_data_sl.js` | Suitelet | Action-routed JSON API for WO CRUD + remaining-qty |
| `BC_WorkOrder/entry_points/bc_wo_mgmt_ue.js` | UserEvent | beforeLoad: stamps INLINEHTML iframe on project + SO records |
| `BC_WorkOrder/entry_points/bc_wo_cascade_ue.js` | UserEvent | afterSubmit: cascades WO Complete → WP column status flip |
| `BC_WorkPerformed/entry_points/bc_wp_sl.js` | Suitelet | Returns HTML bundle for WP report editor/browse |
| `BC_WorkPerformed/entry_points/bc_wp_data_sl.js` | Suitelet | Action-routed JSON API for WP CRUD + project search |

### Module files

| File | Purpose |
|------|---------|
| `BC_WorkOrder/modules/bc_wo_html.js` | Full HTML bundle for WO Mgmt: CSS token set + all primitives + markup + client JS (~1569 lines) |
| `BC_WorkOrder/modules/bc_wo_dao.js` | DAO for `customrecord_bc_wo`: load, create, update, listByProject |
| `BC_WorkOrder/modules/bc_wo_remaining.js` | SuiteQL aggregate module: SO contract lines, completed-qty rollups, open-WO reservation math |
| `BC_WorkPerformed/modules/bc_wp_html.js` | Full HTML bundle for WP Mgmt: CSS token set + all primitives + browse/editor/confirm markup + client JS (~1880 lines) |
| `BC_WorkPerformed/modules/bc_wp_dao.js` | DAO for WP report/column/qty records: loadReport, saveReport, listRecentReports, listProjectsWithReports |
| `BC_WorkPerformed/modules/bc_wp_lock.js` | Lock predicate: `isLocked(col)` returns true if persistedStatus is Complete or Re-Work (retained but not imported in current save flow per §7.3) |
| `Shared/lib/bc_constants.js` | Single-source-of-truth for all script IDs, record types, field IDs, status enums |
| `Shared/lib/bc_http.js` | Shared HTTP helpers: `esc()`, `sendJSON()`, `sendError()`, `buildSuiteletUrl()` |

### SDF Objects

| File | Type | Notes |
|------|------|-------|
| `Objects/records/customrecord_bc_wo.xml` | customrecordtype | WO record: name, customer_ref, so (FK), project (FK to cseg), status (list FK), lines (CLOBTEXT JSON) |
| `Objects/lists/customlist_bc_wo_status.xml` | customlist | WO status values: Open=1, Complete=3, Cancelled=4 |
| `Objects/scripts/customscript_bc_wo_mgmt_sl.xml` | suitelet | Deployment: allemployees=T, allroles=T, runasrole=ADMINISTRATOR, status=RELEASED |
| `Objects/scripts/customscript_bc_wo_data_sl.xml` | suitelet | Same deployment pattern |
| `Objects/scripts/customscript_bc_wp_sl.xml` | suitelet | Same deployment pattern |
| `Objects/scripts/customscript_bc_wp_data_sl.xml` | suitelet | Same deployment pattern |
| `Objects/scripts/customscript_bc_wo_mgmt_ue.xml` | usereventscript | Deployed on customrecord_cseg_bc_project + salesorder |
| `Objects/scripts/customscript_bc_wo_cascade_ue.xml` | usereventscript | Deployed on customrecord_bc_wo |

### Vendored JS libraries

None. The codebase contains no vendored third-party JavaScript libraries.

### Test files

| File | Coverage |
|------|---------|
| `__tests__/bc_wo_html.test.js` | HTML bundle shape, data-* attributes, no hardcoded URLs, action-routed fetch patterns |
| `__tests__/bc_wp_html.test.js` | WP bundle shape |
| `__tests__/bc_wo_dao.test.js` | DAO create/load/update/list against mocked N/record + N/search |
| `__tests__/bc_wp_dao.test.js` | WP DAO coverage |
| `__tests__/bc_wo_data_sl.test.js` | Data Suitelet action routing |
| `__tests__/bc_wp_data_sl.test.js` | WP data Suitelet action routing |
| `__tests__/bc_wo_remaining.test.js` | Remaining-qty math |
| `__tests__/bc_wp_lock.test.js` | Lock predicate |
| `__tests__/bc_wo_mgmt_ue.test.js` | UE beforeLoad iframe stamp |
| `__tests__/bc_wo_cascade_ue.test.js` | Cascade UE afterSubmit status transition |
| `__tests__/bc_constants.test.js` | Constants shape validation |
| `__tests__/bc_http.test.js` | HTTP helpers |
| `__tests__/sanity.test.js` | Import sanity check |

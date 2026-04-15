# User Stories: Cost Timing Schedule

## Context

- **Module**: BlueCollar Cloud — NetSuite SuiteApp
- **Feature**: Project Cash Flow Forecasting (Material + Labor + Revenue + Change Orders)
- **Version**: 3.0
- **Date**: 2026-03-25
- **Reference**: `PRD_CostTimingSchedule_v3.md`, `TDD_CostTimingSchedule_v3.md`

---

## Priority Matrix

| Priority | Epic | Stories | Rationale |
|----------|------|---------|-----------|
| **P0** | Epic 1: Templates | 1.1, 1.2 | Foundation — shared by all timing types |
| **P0** | Epic 2: Material Timing | 2.1, 2.2, 2.3, 2.4 | Core cost outflow forecasting |
| **P0** | Epic 3: Revenue Timing | 3.1, 3.2 | Revenue inflow forecasting — moved to Phase 1 |
| **P0** | Epic 4: Change Order Timing | 4.1, 4.2, 4.3 | CO timing + approval propagation |
| **P0** | Epic 8: Permissions | 8.1, 8.2 | Controlled rollout |
| **P1** | Epic 5: Labor Forecast | 5.1, 5.2, 5.3 | Labor cost forecasting |
| **P1** | Epic 6: Recalc + Status | 6.1, 6.2, 6.3 | Keeps data accurate |
| **P1** | Epic 7: Reporting | 7.1, 7.2, 7.3, 7.4, 7.5 | Subtab + portfolio |

---

## Epic 1: Cost Timing Templates

*(Unchanged from v2 — Stories 1.1, 1.2)*

Templates are now used by material timing, revenue timing, CO timing, and labor timing.

---

## Epic 2: Material Cost Timing (PO / Bill)

*(Unchanged from v2 — Stories 2.1, 2.2, 2.3, 2.4)*

**Addition**: `source_group` field added to cost timing lines. For PO/Bill-sourced lines, set to `Base PO`.

---

## Epic 3: Revenue Timing (NEW)

> Forecasting when customer payments arrive based on the contract billing schedule.

### Story 3.1: Apply Revenue Timing to a Contract

**As a** Project Manager,
**I want to** apply a timing schedule to my Sales Order (Contract),
**So that** I can forecast when customer payments will arrive based on billing terms.

#### Acceptance Criteria

1. "Revenue Timing Schedule" button appears on Sales Orders where BlueCollar Contract checkbox = true
2. Button opens `customscript_bc_revenue_timing_mgr` Suitelet
3. Suitelet shows: Contract info header (SO#, customer, Current Contract total) + timing grid
4. User selects template + start date → generates timing lines based on Current Contract amount
5. Lines: Period Date, %, Amount, Cumulative %, Status = `Forecasted`, Source Group = `Base Contract`
6. User can adjust or add manual lines
7. 100% validation on save (warning, not hard block — allows retainage scenarios where total < 100%)
8. Lines saved as `customrecord_bc_revenue_timing_line` linked to the Sales Order
9. If Change Order revenue timing lines exist (appended from CO approval), they display in a separate "Change Orders" section below the base contract lines

#### Implementation Notes

- Suitelet: `customscript_bc_revenue_timing_mgr` → URL param: `txnid` (SO internal ID)
- Button added by: `customscript_bc_revenue_timing_ue` beforeLoad on Sales Order
- Permission: `REVENUETIMINGCREATE`
- Status uses `Received` (not `Actualized`) for revenue that has been collected

**Reference scenario**: Base Bid $30,000 → 25% Apr, 15% May, 25% Jun, 15% Jul, 10% Sep, 10% Nov

---

### Story 3.2: Revenue Timing Recalculation on CO Approval

**As a** Project Manager,
**I want to** be prompted to review revenue timing when a Change Order changes the contract value,
**So that** my revenue forecast stays in sync with the updated contract.

#### Acceptance Criteria

1. When a CO is approved with billing-side impact, existing base contract revenue timing lines are flagged `needs_recalc = true`
2. CO's revenue timing lines (from `customrecord_bc_co_timing_line`) are copied to `customrecord_bc_revenue_timing_line` with `source_group = 'Change Order'` and `related_change_order = CO ID`
3. Next time user opens Revenue Timing Manager, banner shows: "Change Order [name] approved. [X] CO timing lines added. Review your revenue forecast."
4. User can see base contract lines and CO lines in separate sections
5. Total across all lines (base + COs) should equal Current Contract — system shows warning if mismatch
6. User can optionally recalculate base contract lines proportionally to new Current Contract total

---

## Epic 4: Change Order Timing (NEW)

> Defining when CO revenue and cost impacts flow — before and after approval.

### Story 4.1: Configure CO Timing on a Change Request

**As a** Project Manager,
**I want to** define timing schedules for both the revenue and cost sides of a Change Order,
**So that** I can plan when the CO's financial impacts will occur.

#### Acceptance Criteria

1. "CO Timing Schedule" button appears on Change Request records (when feature enabled + permissions)
2. Button opens `customscript_bc_co_timing_mgr` Suitelet
3. Suitelet shows dual-pane UI:

   **Revenue Pane (top):**
   - Header: "CO Billing Impact: $[sum of Contract subtab Proposed Changes]"
   - If CO has no billing impact, pane shows "No billing-side changes on this CO" and is disabled
   - Template selector + start date + "Apply" button
   - Editable grid: Period Date, %, Amount, Label
   - 100% validation against CO billing impact amount

   **Cost Pane (bottom):**
   - Header: "CO Estimate Impact: $[sum of Estimate subtab Proposed Changes]"
   - If CO has no estimate impact, pane shows "No cost-side changes on this CO" and is disabled
   - Shows breakdown by Cost Code + Cost Type from Estimate subtab
   - Template selector + start date per cost code group (or single template for all)
   - Editable grid: Period Date, %, Amount, Cost Code, GL Account
   - 100% validation per cost code group

4. Save persists as `customrecord_bc_co_timing_line` records with `side = Revenue | Cost`
5. All lines saved with `approved = false` until CO is approved
6. Timing data at this stage is NOT visible in project reports (staging only)

#### Implementation Notes

- Suitelet: `customscript_bc_co_timing_mgr` → URL param: `coid` (Change Request internal ID)
- Revenue impact sourced from: CO contract detail child records (SuiteQL join)
- Cost impact sourced from: CO estimate detail child records (SuiteQL join)
- If subcontract CO exists: include sub CO impact in cost pane
- See TDD sections 3.2-3.4 for SuiteQL queries to access CO child records
- **NOTE**: Exact field/record IDs for CO child records need SDF inspection — run TDD discovery queries first

**Reference scenario**: Change Order A → Revenue $12,000 (20% Jul, 30% Sep, 50% Dec), Cost $10,000 (20% Jul, 30% Sep, 50% Dec)

---

### Story 4.2: CO Approval — Propagate Timing to Project Records

**As a** system,
**When** a Change Order is approved,
**I want to** automatically copy CO timing data to the appropriate project-level records,
**So that** the project cash flow forecast reflects the approved change.

#### Acceptance Criteria

1. On CO approval (status → Approved), UE afterSubmit fires
2. **Revenue propagation:**
   - Each `co_timing_line` where side = Revenue → creates a `revenue_timing_line` on the SO
   - New lines: `source_group = 'Change Order'`, `related_change_order = this CO`
   - Existing base contract revenue timing lines flagged `needs_recalc = true`
3. **Cost propagation:**
   - Each `co_timing_line` where side = Cost → creates a `cost_timing_line`
   - New lines: `source_group = 'Change Order'`, `change_order = this CO`, `cost_code` and `cost_type` from CO estimate detail
   - No parent transaction (these are CO-sourced costs, not PO-sourced)
4. All source `co_timing_line` records marked `approved = true`
5. If CO is approved WITHOUT timing configured:
   - System creates single timing line at approval date for full amount (both sides)
   - Logs warning for user review
6. Project reports now include the CO timing data

#### Implementation Notes

- Script: `customscript_bc_co_timing_ue` → afterSubmit on Change Request
- Must check `oldRecord.getValue('status')` vs `newRecord.getValue('status')` to detect approval
- Revenue timing line creation uses `N/record.create()` for `customrecord_bc_revenue_timing_line`
- Cost timing line creation uses `N/record.create()` for `customrecord_bc_cost_timing_line`
- Subcontract CO: if PO amount changed, also set `needs_recalc` on existing PO cost timing lines

---

### Story 4.3: Edit CO Timing After Initial Entry

**As a** Project Manager,
**I want to** edit CO timing before the CO is approved,
**So that** I can refine the forecast as I get better information about the CO's payment terms.

#### Acceptance Criteria

1. Re-opening CO Timing Suitelet shows existing timing lines
2. User can edit, add, or delete lines (same validation rules)
3. After CO is approved, CO timing lines become read-only on the Change Request
4. Post-approval edits must be made on the propagated records (revenue timing on SO, cost timing at project level)

---

## Epic 5: Labor Cost Forecast

*(Unchanged from v2 — Stories 5.1, 5.2, 5.3)*

---

## Epic 6: Recalculation and Status Management

### Story 6.1: Material Timing Recalc on Amount Change

*(Unchanged from v2)*

---

### Story 6.2: Automatic Status Updates (All Types)

**As a** Controller,
**I want** timing statuses to update automatically across material, revenue, and labor,
**So that** I see what's on track, overdue, or completed.

#### Acceptance Criteria

1. Nightly scheduled script processes ALL timing record types:
   - **Material** (`cost_timing_line`): Forecasted + past date → check for vendor bill → `Actualized` or `Overdue`
   - **Revenue** (`revenue_timing_line`): Forecasted + past date → check for customer invoice/payment → `Received` or `Overdue`
   - **Labor** (`labor_timing_line`): Forecasted + past date → check for labor cost journals → `Actualized` or `Overdue`
2. CO-sourced timing lines follow the same rules as their propagated type
3. Status changes logged via system notes

---

### Story 6.3: Revenue Timing — CO Append Notification

**As a** Project Manager,
**I want to** be notified when CO approval adds new lines to my revenue timing,
**So that** I can review the full picture and ensure timing totals match the updated contract.

#### Acceptance Criteria

1. After CO approval propagates revenue lines, base contract lines flagged `needs_recalc`
2. Banner in Revenue Timing Manager: "Change Order [name] added [N] lines. Total timing: $X of $Y contract."
3. If total timing (base + COs) ≠ Current Contract, warning: "Timing total ($X) does not match Current Contract ($Y). Difference: $Z"
4. User can dismiss or recalculate

---

## Epic 7: Project Reporting + Portfolio

### Story 7.1: Cash Flow Forecast Subtab on Project

**As a** Project Manager,
**I want** a "Cash Flow Forecast" subtab on my project,
**So that** I can view cost, revenue, and net cash flow without leaving the project.

#### Acceptance Criteria

1. Subtab appears when feature enabled + `COSTTIMINGVIEW`
2. Three tabs: **Cost** | **Revenue** | **Combined**
3. Each tab loads Suitelet in iframe with project ID
4. Cost tab lazy-loaded by default; Revenue and Combined lazy-load on click
5. BlueCollar brand styling
6. Empty state messages with links to configure timing

---

### Story 7.2: Cost Cash Flow Report

**As a** Project Manager,
**I want** a time-phased cost outflow report,
**So that** I can see when material, subcontract, labor, and CO costs will flow out.

#### Acceptance Criteria

1. Grid: months across columns, cost groups down rows
2. Cost groups: Vendor names (from POs), CO names (from approved COs), "Labor"
3. Each group expandable to show Division > Cost Code detail
4. Color coding: Forecasted (default), Actualized (green), Overdue (red)
5. Total row at bottom
6. Filters: Date Range, Cost Code, Cost Group, Status
7. Export: CSV, PDF

---

### Story 7.3: Revenue Cash Flow Report (NEW)

**As a** Project Manager,
**I want** a time-phased revenue inflow report,
**So that** I can see when customer payments are expected.

#### Acceptance Criteria

1. Grid: months across columns, source groups down rows
2. Source groups: "Base Bid" (base contract) and each CO by name
3. Color coding: Forecasted (default), Received (green), Overdue (red)
4. Total row
5. Filters: Date Range, Source Group, Status
6. Export: CSV, PDF

**Reference**: Matches top section of Job Cashflow spreadsheet (Price rows)

---

### Story 7.4: Combined Cash Flow Forecast Report

**As a** Project Manager,
**I want** a combined view showing revenue in vs. cost out = net cash position,
**So that** I can see when my project is cash-positive vs. cash-negative.

#### Acceptance Criteria

1. Layout matches the reference spreadsheet:
   ```
   Revenue Section: Base Bid + CO revenue by month → Revenue Total
   Cost Section: Vendor A + Vendor B + CO cost + Labor by month → Cost Total
   Net Row: Revenue Total - Cost Total per month
   ```
2. Grand totals column on the right
3. Net row highlights: positive = green text, negative = red text with parentheses
4. Filters: Date Range, Cost Category
5. Export: CSV, PDF

**Reference**: Matches Job Cashflow spreadsheet exactly

---

### Story 7.5: Global Portfolio View

**As a** CFO,
**I want** a company-wide cash flow forecast,
**So that** I can manage liquidity across all projects.

#### Acceptance Criteria

1. Standalone Suitelet: `BlueCollar > Project Control Center > Cash Flow Portfolio`
2. Filters: Subsidiary, PM, Date Range, Status, Cost Category, Project multi-select
3. Grid: Projects down, Months across
4. Columns per month: Revenue | Cost | Net
5. Expandable project rows → cost group detail
6. Grand total + subsidiary subtotals
7. Export: CSV, PDF
8. Drill-down: click project → opens project Cash Flow Forecast subtab
9. Performance: < 10 seconds for 100 projects

---

## Epic 8: Permissions and Administration

### Story 8.1: Feature Activation

*(Same as v2 — Global Preferences checkbox)*

---

### Story 8.2: Role-Based Permissions

**As an** Administrator,
**I want to** control access to all timing features by role.

#### Acceptance Criteria

| Key | Controls | Without It |
|-----|----------|-----------|
| `COSTTIMINGVIEW` | View all timing data + subtab + portfolio | Hidden |
| `COSTTIMINGCREATE` | Create/edit material timing | Read-only |
| `COSTTIMINGTEMPLATE` | Manage templates | No template access |
| `COSTTIMINGDELETE` | Delete any timing lines | Cannot delete |
| `LABORFORECASTCREATE` | Create/edit labor assignments + timing | Read-only labor |
| `REVENUETIMINGCREATE` | Create/edit revenue timing on contracts | Read-only revenue |
| `COTIMINGCREATE` | Create/edit CO timing on Change Requests | Read-only CO timing |

---

## Definition of Done (All Stories)

- [ ] Acceptance criteria verified in NetSuite sandbox
- [ ] **ZERO GL entries** from any timing operation
- [ ] Budget grid unchanged (Committed, Actual, Total Cost, Current Hours)
- [ ] WIP Report unaffected
- [ ] Revenue Recognition unaffected
- [ ] Billing unaffected — timing does not create or modify invoices
- [ ] Resource Rate Templates not modified (read-only reference)
- [ ] Existing Labor Resource Costing journals not affected
- [ ] Change Order approval flow unchanged — timing is additive, not blocking
- [ ] Permission checks enforced at script level
- [ ] Global Preferences toggle respected
- [ ] System notes for audit trail
- [ ] Project subtab iframes load correctly
- [ ] Combined report matches reference spreadsheet layout
- [ ] CO timing propagation verified (Revenue → SO lines, Cost → project lines)
- [ ] Portfolio view aggregation accurate (Revenue + Cost + Net)
- [ ] BlueCollar brand styling on all Suitelet HTML
- [ ] Code reviewed and deployed via SDF

### Reference Scenario Validation

The following must be reproducible end-to-end:

1. Create project with $30K contract → apply revenue timing (6 payments Apr-Nov)
2. Create PO Vendor A $15K → apply cost timing (5 payments May-Dec)
3. Create PO Vendor B $8K → apply cost timing (2 payments Apr, Nov)
4. Create Change Order: +$12K revenue, +$10K cost → apply CO timing (3 payments Jul-Dec)
5. Approve CO → verify propagation
6. Open Combined report → output matches reference spreadsheet totals
7. Open Portfolio → project appears with correct revenue/cost/net

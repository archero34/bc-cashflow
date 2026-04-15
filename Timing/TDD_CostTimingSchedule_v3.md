# Technical Design Document: Cost Timing Schedule

## Context

- **Module**: BlueCollar Cloud — NetSuite SuiteApp
- **Feature**: Project Cash Flow Forecasting (Material + Labor + Revenue + Change Orders)
- **Version**: 3.0
- **Date**: 2026-03-25

---

## 1. Architecture Overview

### Component Inventory

```
CUSTOM RECORDS (7):
  customrecord_bc_cost_timing_template        — Shared spread pattern templates
  customrecord_bc_ctt_line                    — Template line items
  customrecord_bc_cost_timing_line            — Material timing (PO/Bill)
  customrecord_bc_revenue_timing_line         — Revenue timing (Contract/SO) ← NEW
  customrecord_bc_co_timing_line              — Change Order timing (both sides) ← NEW
  customrecord_bc_labor_resource_assignment   — Hours → Resource Rate Template mapping
  customrecord_bc_labor_timing_line           — Labor timing (hours × rates)

CUSTOM LISTS (5):
  customlist_bc_ctt_spread_type               — Even, Front-Loaded, Back-Loaded, Milestone, Custom
  customlist_bc_ctt_period_interval           — Weekly, Bi-Weekly, Monthly
  customlist_bc_ctl_status                    — Forecasted, Actualized/Received, Overdue
  customlist_bc_ctl_source                    — Template, Manual
  customlist_bc_ctl_source_group              — Base Contract, Change Order, Base PO ← NEW

SCRIPTS (12):
  customscript_bc_cost_timing_mgr             — Suitelet: Material timing (PO/Bill)
  customscript_bc_revenue_timing_mgr          — Suitelet: Revenue timing (Contract/SO) ← NEW
  customscript_bc_co_timing_mgr               — Suitelet: CO timing (dual-pane) ← NEW
  customscript_bc_labor_forecast              — Suitelet: Labor forecast (2-part)
  customscript_bc_cf_cost_report              — Suitelet: Cost cash flow report (iframe)
  customscript_bc_cf_revenue_report           — Suitelet: Revenue cash flow report (iframe) ← NEW
  customscript_bc_cf_combined_report          — Suitelet: Combined cash flow (iframe)
  customscript_bc_cf_portfolio                — Suitelet: Global portfolio view
  customscript_bc_cost_timing_ue              — UE: PO/Bill button + recalc
  customscript_bc_revenue_timing_ue           — UE: Sales Order button ← NEW
  customscript_bc_co_timing_ue                — UE: Change Request button + approval hooks ← NEW
  customscript_bc_cf_project_ue               — UE: Project subtab injection
  customscript_bc_timing_status_ss            — SS: Nightly status updater (all types)
```

**Critical constraints**: No GL impact. No revenue recognition impact. No billing impact. Pure forecasting.

---

## 2. Data Model

### 2.1 Cost Timing Template (Shared)

*(Unchanged from v2)*

```
Record ID: customrecord_bc_cost_timing_template
Child:     customrecord_bc_ctt_line
```

Used by: Material timing, Revenue timing, CO timing, Labor timing.

---

### 2.2 Cost Timing Schedule Line (Material — PO/Bill)

*(Unchanged from v2)*

```
Record ID: customrecord_bc_cost_timing_line
```

Key fields: transaction, project, period_date, percentage, amount, status, source, cost_code, cost_type (GL Account).

---

### 2.3 Revenue Timing Line (NEW — Contract/SO)

```
Record ID: customrecord_bc_revenue_timing_line
Purpose:   Time-phased revenue (customer payment) forecast per contract.
```

| Field ID | Label | Type | Required | Notes |
|----------|-------|------|----------|-------|
| `custrecord_bc_rtl_transaction` | Contract (SO) | List/Record → Transaction | Yes | The Sales Order |
| `custrecord_bc_rtl_project` | Project | List/Record | Yes | Denormalized |
| `custrecord_bc_rtl_period_date` | Period Date | Date | Yes | When payment expected |
| `custrecord_bc_rtl_percentage` | Percentage | Percent | Yes | % of contract value attributed to this line |
| `custrecord_bc_rtl_amount` | Amount | Currency | Yes | Dollar amount |
| `custrecord_bc_rtl_cumulative_pct` | Cumulative % | Percent | Calc | |
| `custrecord_bc_rtl_cumulative_amt` | Cumulative Amount | Currency | Calc | |
| `custrecord_bc_rtl_status` | Status | List → `customlist_bc_ctl_status` | Yes | `Forecasted` \| `Received` \| `Overdue` |
| `custrecord_bc_rtl_label` | Label / Note | Free Text | No | e.g., "Progress Payment #1" |
| `custrecord_bc_rtl_source` | Source | List → `customlist_bc_ctl_source` | Yes | Template \| Manual |
| `custrecord_bc_rtl_source_group` | Source Group | List → `customlist_bc_ctl_source_group` | Yes | `Base Contract` or `Change Order` |
| `custrecord_bc_rtl_change_order` | Related Change Order | List/Record → Change Request | No | Set when line originates from CO approval |
| `custrecord_bc_rtl_source_template` | Source Template | List/Record → timing template | No | |
| `custrecord_bc_rtl_needs_recalc` | Needs Recalculation | Checkbox | No | |

**Key design decision**: Revenue timing lines for BOTH the base contract and change orders live on the same record type, linked to the same Sales Order. The `source_group` field distinguishes them. This means the Revenue report Suitelet only needs to query ONE record type and can group by source_group to show "Base Bid" vs "Change Order A" rows — exactly matching the spreadsheet layout.

---

### 2.4 Change Order Timing Line (NEW)

```
Record ID: customrecord_bc_co_timing_line
Purpose:   Stores timing for a CO's revenue and cost impact BEFORE and AFTER approval.
           Acts as staging record. On CO approval, data flows to revenue/cost timing records.
```

| Field ID | Label | Type | Required | Notes |
|----------|-------|------|----------|-------|
| `custrecord_bc_cotl_change_request` | Change Request | List/Record → Change Request | Yes | Parent CO |
| `custrecord_bc_cotl_project` | Project | List/Record | Yes | Denormalized |
| `custrecord_bc_cotl_side` | Side | List (inline) | Yes | `Revenue` \| `Cost` |
| `custrecord_bc_cotl_period_date` | Period Date | Date | Yes | |
| `custrecord_bc_cotl_percentage` | Percentage | Percent | Yes | |
| `custrecord_bc_cotl_amount` | Amount | Currency | Yes | |
| `custrecord_bc_cotl_cumulative_pct` | Cumulative % | Percent | Calc | |
| `custrecord_bc_cotl_cumulative_amt` | Cumulative Amount | Currency | Calc | |
| `custrecord_bc_cotl_status` | Status | List → `customlist_bc_ctl_status` | Yes | Default: Forecasted |
| `custrecord_bc_cotl_label` | Label / Note | Free Text | No | |
| `custrecord_bc_cotl_source` | Source | List → `customlist_bc_ctl_source` | Yes | |
| `custrecord_bc_cotl_source_template` | Source Template | List/Record | No | |
| `custrecord_bc_cotl_cost_code` | Cost Code | List/Record | Conditional | Required when side = Cost |
| `custrecord_bc_cotl_cost_type` | Cost Type (GL Account) | List/Record → Account | Conditional | Required when side = Cost |
| `custrecord_bc_cotl_approved` | Approved | Checkbox | No | Set to true when CO is approved and data has been propagated |

**Lifecycle:**

```
1. CO CREATED → CO Timing Suitelet available on Change Request
2. User enters timing (revenue + cost) → saved as co_timing_line records (approved = false)
3. CO APPROVED → approval hook fires:
   a. Revenue co_timing_lines → COPIED to revenue_timing_line on the Sales Order
      - source_group = 'Change Order'
      - related_change_order = this CO
   b. Cost co_timing_lines → COPIED to cost_timing_line records
      - linked to project (not to a specific PO unless sub CO)
      - cost_code + cost_type from CO estimate detail
   c. co_timing_lines marked approved = true
4. REPORTING: Only approved timing data appears in project reports
   - Pre-approval: visible only on CO record
   - Post-approval: visible in project reports via the copied records
```

---

### 2.5 Labor Records

*(Unchanged from v2)*

```
customrecord_bc_labor_resource_assignment
customrecord_bc_labor_timing_line
```

---

### 2.6 Entity Relationship Diagram

```
                         ┌──────────────────────┐
                         │  BlueCollar Project   │
                         └──────────┬───────────┘
                                    │
         ┌──────────────┬───────────┼──────────────┬──────────────┐
         │              │           │              │              │
   ┌─────▼─────┐  ┌─────▼─────┐ ┌──▼───────┐ ┌───▼──────┐ ┌────▼──────────┐
   │Sales Order │  │Purchase   │ │Vendor    │ │Budget    │ │Change Request │
   │(Contract)  │  │Order      │ │Bill      │ │(Hours)   │ │(Change Order) │
   └─────┬──────┘  └─────┬─────┘ └────┬─────┘ └────┬─────┘ └──┬───────────┘
         │               │            │             │          │
   ┌─────▼──────┐  ┌─────▼────────────▼──┐  ┌──────▼───┐ ┌────▼──────────┐
   │Revenue     │  │Cost Timing          │  │Labor     │ │CO Timing Line │
   │Timing Line │  │Schedule Line        │  │Resource  │ │(staging)      │
   │            │  │(Material)           │  │Assignment│ │side=Rev|Cost  │
   └────────────┘  └─────────────────────┘  └────┬─────┘ └───────────────┘
                                                  │
                                           ┌──────▼───────┐
                                           │Labor Timing  │
                                           │Line          │
                                           └──────────────┘

   On CO Approval:
   CO Timing Line (Revenue) ──COPY──→ Revenue Timing Line (source_group='Change Order')
   CO Timing Line (Cost)    ──COPY──→ Cost Timing Schedule Line (source_group='Change Order')
```

---

## 3. Change Order — SuiteQL Joins for Child Records

### 3.1 Understanding CO Record Structure

The Change Request is the parent. It has child data on two subtabs:

**Contract subtab (billing-side)** — stored as child/sublist records on the Change Request:
```
Change Request
└── Contract Change Lines (sublist or child records)
    ├── Line # (maps to SO line)
    ├── Item
    ├── Current Scheduled Value
    ├── Proposed Changes (the delta — this is the CO revenue impact)
    ├── Status (Pending Approval / Approved)
    └── New Scheduled Value
```

**Estimate subtab (cost-side)** — stored as child/sublist records on the Change Request:
```
Change Request
└── Estimate Change Lines (sublist or child records)
    ├── Division
    ├── Cost Code
    ├── Cost Type (GL Account)
    ├── Current Estimate
    ├── Proposed Changes (the delta — this is the CO cost impact)
    ├── Proposed Hours
    └── New Current Estimate
```

**Subcontract Change Request** — separate child record linked to parent Change Request:
```
Change Request
└── Subcontract Change Request (child record)
    ├── Related Subcontract (PO)
    ├── Subcontract Lines
    │   ├── Line #
    │   ├── Current Amount
    │   ├── Inc/Dec Units
    │   ├── Proposed Changes
    │   └── New Current Value
    └── Status
```

### 3.2 SuiteQL — Get CO Billing Impact (Revenue Side)

```sql
-- Get the total billing-side impact of a Change Request
-- NOTE: Exact table/field names depend on BC's custom record IDs
-- for change request contract detail lines. These may be:
-- customrecord_bc_change_request_contract_line or similar.
-- The key fields are the Proposed Changes column values.

-- Option 1: If contract change data is on a custom record:
SELECT
  crcl.custrecord_bc_crcl_parent AS change_request_id,
  crcl.custrecord_bc_crcl_line_num AS line_number,
  crcl.custrecord_bc_crcl_item AS item,
  crcl.custrecord_bc_crcl_proposed_changes AS proposed_change,
  crcl.custrecord_bc_crcl_status AS approval_status
FROM customrecord_bc_cr_contract_line crcl
WHERE crcl.custrecord_bc_crcl_parent = :changeRequestId
  AND crcl.custrecord_bc_crcl_proposed_changes != 0

-- Option 2: If contract changes are stored as transaction line deltas
-- on the Sales Order itself (need to investigate BC's specific implementation):
-- Query the Change Request record for its related Sales Order,
-- then compare Original Contract vs Current Contract on SO lines

-- IMPLEMENTATION NOTE:
-- The exact record IDs and field IDs for Change Request child records
-- need to be confirmed by inspecting the BC SuiteApp's SDF project.
-- Run this discovery query to find the child records:
SELECT recordid, name
FROM customrecordtype
WHERE name LIKE '%change%' OR name LIKE '%Change%'
ORDER BY name
```

### 3.3 SuiteQL — Get CO Estimate Impact (Cost Side)

```sql
-- Get the cost-side impact of a Change Request
-- Same caveat: exact record/field IDs need BC SDF inspection

SELECT
  crel.custrecord_bc_crel_parent AS change_request_id,
  crel.custrecord_bc_crel_cost_code AS cost_code,
  crel.custrecord_bc_crel_cost_type AS cost_type_gl_account,
  crel.custrecord_bc_crel_proposed_changes AS proposed_change,
  crel.custrecord_bc_crel_proposed_hours AS proposed_hours,
  crel.custrecord_bc_crel_division AS division
FROM customrecord_bc_cr_estimate_line crel
WHERE crel.custrecord_bc_crel_parent = :changeRequestId
  AND (crel.custrecord_bc_crel_proposed_changes != 0
       OR crel.custrecord_bc_crel_proposed_hours != 0)
```

### 3.4 SuiteQL — Get Subcontract CO Impact

```sql
-- Get subcontract change request details
SELECT
  scr.id AS sub_change_request_id,
  scr.custrecord_bc_scr_parent AS parent_change_request,
  scr.custrecord_bc_scr_purchase_order AS related_po,
  scrl.custrecord_bc_scrl_proposed_changes AS proposed_change,
  scrl.custrecord_bc_scrl_line_num AS po_line_number
FROM customrecord_bc_sub_change_request scr
  JOIN customrecord_bc_scr_line scrl
    ON scrl.custrecord_bc_scrl_parent = scr.id
WHERE scr.custrecord_bc_scr_parent = :changeRequestId
  AND scrl.custrecord_bc_scrl_proposed_changes != 0
```

### 3.5 Discovery Queries

Before implementing CO joins, run these discovery queries against a BC environment to confirm record/field IDs:

```sql
-- Find all BC custom records related to change orders
SELECT id, scriptid, name
FROM customrecordtype
WHERE scriptid LIKE '%change%' OR scriptid LIKE '%cr_%'
ORDER BY scriptid;

-- Find fields on a discovered record
SELECT fieldid, label, fieldtype
FROM customfield
WHERE rectype = :recordTypeId
ORDER BY fieldid;

-- Find the relationship between Change Request and its children
SELECT id, scriptid, name
FROM customrecordtype
WHERE scriptid LIKE '%bc%'
ORDER BY scriptid;
```

**IMPORTANT**: The SuiteQL queries in sections 3.2-3.4 use ESTIMATED field/record IDs. The actual IDs must be confirmed by SDF inspection or the discovery queries above. This is the "unique SuiteQL joins" challenge — the CO child record structure is custom to BC and may not follow standard naming conventions.

---

## 4. Script Architecture

### 4.1 Material Timing Manager (Suitelet)

*(Unchanged from v2)*

```
Script: customscript_bc_cost_timing_mgr
```

### 4.2 Revenue Timing Manager (NEW — Suitelet)

```
Script ID:      customscript_bc_revenue_timing_mgr
Deployment:     customdeploy_bc_revenue_timing_mgr
Entry Points:   onRequest (GET + POST)
Purpose:        View/edit/apply timing to Sales Order (Contract)
Trigger:        Button on Sales Order (when BC Contract checkbox = true)
URL Params:     txnid (Sales Order internal ID)
Permission:     REVENUETIMINGCREATE
```

**Behavior**: Same as material timing manager but for revenue. Key differences:
- Source amount = Current Contract (total of all SO lines)
- Status values use `Received` instead of `Actualized` (cash in vs cash out)
- `source_group` field tracks Base Contract vs Change Order origin
- On load, shows CO-appended lines (if any) grouped separately

### 4.3 Change Order Timing Manager (NEW — Suitelet)

```
Script ID:      customscript_bc_co_timing_mgr
Deployment:     customdeploy_bc_co_timing_mgr
Entry Points:   onRequest (GET + POST)
Purpose:        Dual-pane UI for CO revenue + cost timing
Trigger:        Button on Change Request record
URL Params:     coid (Change Request internal ID)
Permission:     COSTTIMINGCREATE (cost side) + REVENUETIMINGCREATE (revenue side)
```

**GET — Render:**

1. Load Change Request record
2. Query CO contract detail (billing-side) → sum = revenue impact amount
3. Query CO estimate detail (cost-side) → breakdown by cost code + cost type
4. Query CO subcontract detail (if exists) → additional cost impact
5. Load existing `customrecord_bc_co_timing_line` records for this CO
6. Render dual-pane UI:

```
┌─────────────────────────────────────────────────────────────┐
│ REVENUE TIMING          CO Billing Impact: $12,000          │
│ [Template dropdown] [Start Date] [Apply]                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Period Date │   %  │  Amount │ Cumul % │ Label         │ │
│ │ 2026-07-01  │  20% │  2,400  │   20%   │               │ │
│ │ 2026-09-01  │  30% │  3,600  │   50%   │               │ │
│ │ 2026-12-01  │  50% │  6,000  │  100%   │               │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ COST TIMING             CO Estimate Impact: $10,000         │
│ Cost Code    │ Cost Type  │ Impact    │ Template │ Start    │
│ [Grouped by cost code from estimate detail]                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Period Date │   %  │  Amount │ Cost Code │ GL Account  │ │
│ │ 2026-07-01  │  20% │  2,000  │ 03300     │ 50600       │ │
│ │ 2026-09-01  │  30% │  3,000  │ 03300     │ 50600       │ │
│ │ 2026-12-01  │  50% │  5,000  │ 03300     │ 50600       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**POST — Save:**
- Revenue lines saved as `customrecord_bc_co_timing_line` with side = Revenue
- Cost lines saved as `customrecord_bc_co_timing_line` with side = Cost
- All lines: approved = false (until CO is approved)

### 4.4 Change Order Approval Hook (NEW — UE on Change Request)

```
Script ID:      customscript_bc_co_timing_ue
Deployed On:    Change Request record
Entry Points:   beforeLoad, afterSubmit
```

**beforeLoad:**
1. Add "CO Timing Schedule" button → opens `customscript_bc_co_timing_mgr`
2. If CO timing lines exist, show indicator

**afterSubmit:**
1. Check if status changed to "Approved"
2. If approved AND co_timing_lines exist:

   **Revenue propagation:**
   ```
   FOR EACH co_timing_line WHERE side = 'Revenue':
     CREATE customrecord_bc_revenue_timing_line:
       - transaction = Change Request's related Sales Order
       - project = CO's project
       - period_date, percentage, amount = from co_timing_line
       - source_group = 'Change Order'
       - related_change_order = this CO
       - source = co_timing_line.source (Template or Manual)
     MARK co_timing_line.approved = true
   ```

   **Cost propagation:**
   ```
   FOR EACH co_timing_line WHERE side = 'Cost':
     CREATE customrecord_bc_cost_timing_line:
       - transaction = NULL (no specific PO — this is a CO cost)
       - project = CO's project
       - period_date, percentage, amount = from co_timing_line
       - cost_code, cost_type = from co_timing_line
       - source_group = 'Change Order'
       - Set a custrecord_bc_ctl_change_order field = this CO
     MARK co_timing_line.approved = true
   ```

3. If approved AND NO co_timing_lines exist:
   - Log warning: "CO approved without timing schedule"
   - Create single timing line at approval date for full amount (lump sum default)

4. If approved AND existing revenue timing lines on the SO:
   - Set `needs_recalc = true` on base contract revenue timing lines
   - This surfaces a banner next time user opens revenue timing manager

### 4.5 Revenue Timing UE (NEW — on Sales Order)

```
Script ID:      customscript_bc_revenue_timing_ue
Deployed On:    Sales Order
Entry Points:   beforeLoad
Condition:      Only when BC Contract checkbox = true
```

**beforeLoad:**
1. Check feature enabled + permissions
2. Add "Revenue Timing Schedule" button → opens `customscript_bc_revenue_timing_mgr`
3. Show timing line count indicator

### 4.6 Labor Forecast Suitelet

*(Unchanged from v2)*

### 4.7 Project Subtab UE

*(Updated from v2)*

```
Script ID: customscript_bc_cf_project_ue
```

Updated iframe tabs: **Cost** | **Revenue** | **Combined**

(Replaces "Material" and "Labor" as separate tabs — Cost tab now includes material + labor + CO cost. Revenue tab is new.)

### 4.8 Report Suitelets

**Cost Cash Flow Report:**
```
Script: customscript_bc_cf_cost_report
Data:   UNION of:
  - customrecord_bc_cost_timing_line (material PO/Bill + CO cost)
  - customrecord_bc_labor_timing_line (labor)
Grouping: Cost Group (vendor name / CO name / "Labor") > Cost Code
```

**Revenue Cash Flow Report (NEW):**
```
Script: customscript_bc_cf_revenue_report
Data:   customrecord_bc_revenue_timing_line
Grouping: Source Group (Base Contract / Change Order name)
```

**Combined Cash Flow Report:**
```
Script: customscript_bc_cf_combined_report
Data:   Revenue (positive) + Cost (negative) → Net per period
Layout: Matches the reference spreadsheet exactly (see PRD section 8.4)
```

### 4.9 Status Updater (Scheduled Script)

*(Updated from v2)*

Now processes three record types:
- `customrecord_bc_cost_timing_line` — Forecasted → Actualized/Overdue
- `customrecord_bc_revenue_timing_line` — Forecasted → Received/Overdue (checks for customer payments/invoices)
- `customrecord_bc_labor_timing_line` — Forecasted → Actualized/Overdue

---

## 5. Key SuiteQL Queries

### 5.1 Combined Cash Flow (Revenue + Cost) for Project Report

```sql
-- Revenue inflows
SELECT
  'Revenue' AS flow_direction,
  CASE
    WHEN rtl.custrecord_bc_rtl_source_group = 'Base Contract' THEN 'Base Bid'
    ELSE 'Change Order: ' || cr.name
  END AS cost_group,
  TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
  SUM(rtl.custrecord_bc_rtl_amount) AS amount
FROM customrecord_bc_revenue_timing_line rtl
  LEFT JOIN customrecord_bc_change_request cr
    ON cr.id = rtl.custrecord_bc_rtl_change_order
WHERE rtl.custrecord_bc_rtl_project = :projectId
GROUP BY rtl.custrecord_bc_rtl_source_group, cr.name,
         TO_CHAR(rtl.custrecord_bc_rtl_period_date, 'YYYY-MM')

UNION ALL

-- Material cost outflows
SELECT
  'Cost' AS flow_direction,
  CASE
    WHEN ctl.custrecord_bc_ctl_transaction IS NOT NULL
      THEN 'Vendor: ' || ent.companyname
    ELSE 'CO Cost: ' || cr2.name
  END AS cost_group,
  TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM') AS period,
  SUM(ctl.custrecord_bc_ctl_amount) AS amount
FROM customrecord_bc_cost_timing_line ctl
  LEFT JOIN transaction txn ON txn.id = ctl.custrecord_bc_ctl_transaction
  LEFT JOIN entity ent ON ent.id = txn.entity
  LEFT JOIN customrecord_bc_change_request cr2
    ON cr2.id = ctl.custrecord_bc_ctl_change_order
WHERE ctl.custrecord_bc_ctl_project = :projectId
GROUP BY ctl.custrecord_bc_ctl_transaction, ent.companyname, cr2.name,
         TO_CHAR(ctl.custrecord_bc_ctl_period_date, 'YYYY-MM')

UNION ALL

-- Labor cost outflows
SELECT
  'Cost' AS flow_direction,
  'Labor' AS cost_group,
  TO_CHAR(ltl.custrecord_bc_ltl_period_date, 'YYYY-MM') AS period,
  SUM(ltl.custrecord_bc_ltl_amount) AS amount
FROM customrecord_bc_labor_timing_line ltl
WHERE ltl.custrecord_bc_ltl_project = :projectId
GROUP BY TO_CHAR(ltl.custrecord_bc_ltl_period_date, 'YYYY-MM')

ORDER BY flow_direction DESC, cost_group, period
```

### 5.2 Portfolio View (All Projects)

```sql
SELECT
  proj.id AS project_id,
  proj.companyname AS project_name,
  period_data.period,
  SUM(period_data.revenue) AS revenue,
  SUM(period_data.cost) AS cost,
  SUM(period_data.revenue) - SUM(period_data.cost) AS net
FROM job proj
INNER JOIN (
  -- Revenue
  SELECT custrecord_bc_rtl_project AS pid,
         TO_CHAR(custrecord_bc_rtl_period_date, 'YYYY-MM') AS period,
         SUM(custrecord_bc_rtl_amount) AS revenue, 0 AS cost
  FROM customrecord_bc_revenue_timing_line
  WHERE custrecord_bc_rtl_status IN ('Forecasted','Overdue')
  GROUP BY custrecord_bc_rtl_project, TO_CHAR(custrecord_bc_rtl_period_date, 'YYYY-MM')

  UNION ALL

  -- Material + CO cost
  SELECT custrecord_bc_ctl_project, TO_CHAR(custrecord_bc_ctl_period_date, 'YYYY-MM'),
         0, SUM(custrecord_bc_ctl_amount)
  FROM customrecord_bc_cost_timing_line
  WHERE custrecord_bc_ctl_status IN ('Forecasted','Overdue')
  GROUP BY custrecord_bc_ctl_project, TO_CHAR(custrecord_bc_ctl_period_date, 'YYYY-MM')

  UNION ALL

  -- Labor
  SELECT custrecord_bc_ltl_project, TO_CHAR(custrecord_bc_ltl_period_date, 'YYYY-MM'),
         0, SUM(custrecord_bc_ltl_amount)
  FROM customrecord_bc_labor_timing_line
  WHERE custrecord_bc_ltl_status IN ('Forecasted','Overdue')
  GROUP BY custrecord_bc_ltl_project, TO_CHAR(custrecord_bc_ltl_period_date, 'YYYY-MM')
) period_data ON period_data.pid = proj.id
GROUP BY proj.id, proj.companyname, period_data.period
ORDER BY proj.companyname, period_data.period
```

---

## 6. Additional Fields on Existing Records

### On `customrecord_bc_cost_timing_line` (add):

| Field ID | Label | Type | Notes |
|----------|-------|------|-------|
| `custrecord_bc_ctl_source_group` | Source Group | List → `customlist_bc_ctl_source_group` | `Base PO` or `Change Order` |
| `custrecord_bc_ctl_change_order` | Related Change Order | List/Record → Change Request | Set when line originates from CO |

---

## 7. Permissions

| Key | Description | Default Roles |
|-----|-------------|---------------|
| `COSTTIMINGVIEW` | View all timing data + project subtab | All BC roles |
| `COSTTIMINGCREATE` | Create/edit material timing | PM, Controller, Admin |
| `COSTTIMINGTEMPLATE` | Manage templates | Admin, Controller |
| `COSTTIMINGDELETE` | Delete timing lines | Admin |
| `LABORFORECASTCREATE` | Create/edit labor assignments + timing | PM, Controller, Admin |
| `REVENUETIMINGCREATE` | Create/edit revenue timing on contracts | PM, Controller, Admin |
| `COTIMINGCREATE` | Create/edit CO timing | PM, Controller, Admin |

---

## 8. Deployment — SDF Object Manifest

```yaml
CustomRecords:
  - customrecord_bc_cost_timing_template
  - customrecord_bc_ctt_line
  - customrecord_bc_cost_timing_line          # + new fields: source_group, change_order
  - customrecord_bc_revenue_timing_line       # NEW
  - customrecord_bc_co_timing_line            # NEW
  - customrecord_bc_labor_resource_assignment
  - customrecord_bc_labor_timing_line

CustomLists:
  - customlist_bc_ctt_spread_type
  - customlist_bc_ctt_period_interval
  - customlist_bc_ctl_status                  # Add 'Received' value
  - customlist_bc_ctl_source
  - customlist_bc_ctl_source_group            # NEW: Base Contract, Change Order, Base PO

Scripts (12):
  - customscript_bc_cost_timing_mgr
  - customscript_bc_revenue_timing_mgr        # NEW
  - customscript_bc_co_timing_mgr             # NEW
  - customscript_bc_labor_forecast
  - customscript_bc_cf_cost_report
  - customscript_bc_cf_revenue_report         # NEW
  - customscript_bc_cf_combined_report
  - customscript_bc_cf_portfolio
  - customscript_bc_cost_timing_ue
  - customscript_bc_revenue_timing_ue         # NEW
  - customscript_bc_co_timing_ue              # NEW
  - customscript_bc_cf_project_ue
  - customscript_bc_timing_status_ss
```

---

## 9. Testing — Critical Path

### CO Approval Flow (highest complexity)

```
1. Create project, contract ($30K), budget, 2 POs ($15K, $8K)
2. Apply revenue timing to contract (Base Bid schedule)
3. Apply cost timing to both POs (Vendor A, Vendor B schedules)
4. Create Change Request
5. Add billing-side change ($12K revenue increase)
6. Add estimate-side change ($10K cost increase)
7. Open CO Timing Suitelet → enter revenue + cost timing
8. Approve CO
9. VERIFY:
   a. Revenue timing on SO now has Base Bid lines + CO lines
   b. Cost timing records include CO cost lines with correct cost code + GL
   c. Project Combined report matches reference spreadsheet layout
   d. Portfolio view shows updated totals
   e. ZERO GL impact
   f. WIP Report / Rev Rec / Billing unchanged
```

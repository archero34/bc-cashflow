# Addendum: Alerts, Visual Intelligence & Schedule Integration

## Context

- **Parent Feature**: Cost Timing Schedule / Project Cash Flow Forecasting
- **Purpose**: Value-add capabilities that demonstrate deep understanding of the construction PM workflow
- **Date**: 2026-03-25
- **Status**: Proposed — layers on top of PRD/TDD/Stories v3

---

## 1. Why This Matters

The base feature answers: *"When will cash move?"*

These additions answer:
- *"What do I need to worry about THIS WEEK?"* (Alerts)
- *"How healthy is my cash flow at a glance?"* (Visual Indicators)
- *"What's coming due across ALL my projects?"* (Dashboard Portlets)
- *"Does my cash flow forecast match my construction schedule?"* (Task Integration)

This is the full circle — budget → timing → schedule → alerts → action.

---

## 2. Alerts and Notifications

### 2.1 Architecture

Since all timing data lives in custom records, we have three alert delivery mechanisms:

```
┌──────────────────────────────────────────────────────────┐
│                    ALERT SOURCES                         │
│  customrecord_bc_cost_timing_line     (material/CO cost) │
│  customrecord_bc_revenue_timing_line  (revenue/CO rev)   │
│  customrecord_bc_labor_timing_line    (labor)            │
│  All have: Period Date + Status + Amount + Project       │
└──────────────────┬───────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────────┐
     │             │                 │
     ▼             ▼                 ▼
┌─────────┐  ┌──────────┐  ┌──────────────────┐
│ Saved   │  │Scheduled │  │ NetSuite         │
│ Search  │  │ Script   │  │ Workflow         │
│ Portlets│  │ Emails   │  │ (on record       │
│         │  │ (weekly  │  │  status change)  │
│         │  │  digest) │  │                  │
└─────────┘  └──────────┘  └──────────────────┘
```

### 2.2 Alert Types

| Alert | Trigger | Audience | Delivery |
|-------|---------|----------|----------|
| **Upcoming Payment Due** | Cost timing line with Period Date within next 7 days, Status = Forecasted | PM, Controller | Dashboard portlet + weekly email digest |
| **Upcoming Revenue Expected** | Revenue timing line with Period Date within next 7 days, Status = Forecasted | PM, CFO | Dashboard portlet + weekly email digest |
| **Overdue Payment** | Cost timing line with Status = Overdue (period date passed, no actual) | PM, Controller | Dashboard portlet + immediate email |
| **Overdue Revenue** | Revenue timing line with Status = Overdue | PM, CFO | Dashboard portlet + immediate email |
| **Large Payment Coming** | Any timing line > configurable threshold (e.g., $50K) within next 14 days | CFO | Email notification |
| **Net Negative Period Ahead** | Combined forecast shows negative net cash for upcoming month | CFO | Weekly email digest |
| **Timing vs. Schedule Misalignment** | Timing line period date falls outside the linked task's date range | PM | Dashboard portlet + Suitelet visual |
| **CO Approved Without Timing** | Change Order approved but no CO timing lines exist | PM | Banner on project record |

### 2.3 Scheduled Script: Weekly Digest Email

```
Script ID:      customscript_bc_cf_alert_digest
Schedule:       Weekly (Monday 7:00 AM)
```

**Per PM — generates a digest:**

```
Subject: BlueCollar Cash Flow — Week of [Date] — [PM Name]

THIS WEEK'S CASH FLOW ACTIVITY
───────────────────────────────

PAYMENTS DUE (Cost Out):
  Project: Highway 101 Overpass
    • Vendor A — $45,000 due 3/28 (Subcontract progress payment)
    • Materials Inc — $12,500 due 3/30 (Steel delivery)
  Project: Downtown Mixed Use
    • Concrete Supply Co — $8,000 due 3/29

REVENUE EXPECTED (Cash In):
  Project: Highway 101 Overpass
    • Progress Payment #4 — $125,000 expected 3/31

OVERDUE ITEMS (Action Required):
  ⚠️ Project: Riverside Apartments
    • Vendor B — $22,000 was due 3/20 — 8 days overdue
    • Revenue Payment #2 — $50,000 was due 3/18 — 10 days overdue

NET CASH POSITION — NEXT 30 DAYS:
  Total Revenue Expected:    $312,000
  Total Cost Expected:       $287,000
  Net:                        $25,000
```

**Per CFO — portfolio digest:**

Same format but aggregated across all projects with subtotals by PM and subsidiary.

### 2.4 NetSuite Workflow Integration

For immediate alerts (overdue items, large payments), use NetSuite Workflow on the custom records:

```
Workflow: BC Cash Flow Alert — Overdue
Record:  customrecord_bc_cost_timing_line
Trigger: Field Changed (custrecord_bc_ctl_status → 'Overdue')
Action:  Send email to Project Manager on the linked project
```

This leverages native NS workflow — no additional scripting for basic alerts. The scheduled script (nightly status updater) changes the status, which triggers the workflow.

### 2.5 Configurable Thresholds

Add to Global Preferences:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `custrecord_bc_gp_cf_alert_days_ahead` | Integer | 7 | Days ahead for "upcoming" alerts |
| `custrecord_bc_gp_cf_large_payment_threshold` | Currency | 50,000 | Threshold for large payment alerts |
| `custrecord_bc_gp_cf_enable_digest_email` | Checkbox | Yes | Toggle weekly digest on/off |
| `custrecord_bc_gp_cf_digest_day` | List | Monday | Day of week for digest |

---

## 3. Visual Indicators (Suitelet Reports)

### 3.1 Cell-Level Indicators in Report Grids

Since report Suitelets render custom HTML, we have full control over visual design. Each cell in the time-phased grid carries meaning beyond the dollar amount:

**Status Colors:**

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Forecasted (future) | White | Navy (#04233D) | None |
| Forecasted (due this week) | Soft Yellow (#FCD86D) | Navy | Gold (#FFB703) left border |
| Forecasted (due next week) | Light amber tint | Navy | None |
| Actualized / Received | Light green (#E8F5E9) | Dark green | None |
| Overdue | Light red (#FFEBEE) | Red | Red left border |

**Cell Badges:**

```html
<!-- Amount with countdown badge -->
<td class="bc-cf-cell bc-cf-due-soon">
  <span class="bc-cf-amount">$45,000</span>
  <span class="bc-cf-badge bc-cf-badge-warning">3 days</span>
</td>

<!-- Overdue with days-overdue badge -->
<td class="bc-cf-cell bc-cf-overdue">
  <span class="bc-cf-amount">$22,000</span>
  <span class="bc-cf-badge bc-cf-badge-danger">8 days overdue</span>
</td>

<!-- Received with check -->
<td class="bc-cf-cell bc-cf-received">
  <span class="bc-cf-amount">$50,000</span>
  <span class="bc-cf-badge bc-cf-badge-success">✓ Received</span>
</td>
```

### 3.2 Row-Level Health Indicators

Each row (vendor/cost group) gets a health indicator based on the overall status of its timing lines:

```
● Green  — All lines on track (no overdue)
◐ Yellow — At least one line due within 7 days
● Red    — At least one line overdue
```

### 3.3 Summary Header Metrics (KPI Bar)

At the top of each report Suitelet, above the grid, render a KPI bar:

```
┌─────────────────────────────────────────────────────────────┐
│  COST CASH FLOW — Highway 101 Overpass                      │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ TOTAL    │ │ PAID     │ │ DUE THIS │ │ OVERDUE      │   │
│  │ FORECAST │ │ TO DATE  │ │ MONTH    │ │              │   │
│  │ $450,000 │ │ $187,500 │ │ $57,000  │ │ $22,000      │   │
│  │          │ │   41.7%  │ │          │ │ ⚠️ 2 items   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [Filter controls...]                                       │
├─────────────────────────────────────────────────────────────┤
│  [Grid...]                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Combined Report — Net Cash Flow Sparkline

In the Combined report header, add a simple inline bar chart showing net cash position by month. Positive months render gold bars above the axis, negative months render red bars below:

```
Net Cash Flow — 9 Month Outlook

     $3.5K  $1.5K  $3.0K  $2.7K    $0   $3.6K              $9K total
     ████   ███    ████   ████          █████
  ─────────────────────────────────────────────── $0 line
                                              ▓▓▓   ▓▓▓   ▓▓▓▓
                                           -$2.3K -$1.0K -$2.0K
     Apr    May    Jun    Jul    Aug   Sep   Oct    Nov    Dec
```

This is rendered as inline SVG or a simple HTML/CSS bar chart — no charting library needed.

---

## 4. Dashboard Portlets (Saved Searches)

### 4.1 Portlet: Upcoming Cash Events (Next 14 Days)

```
Saved Search: BC Cash Flow — Upcoming Events
Record Type: customrecord_bc_cost_timing_line (+ revenue + labor as separate searches)
Criteria:
  - Status = Forecasted
  - Period Date = today through today + 14
Results:
  - Project Name
  - Type (Cost / Revenue)
  - Vendor/Customer
  - Amount
  - Period Date
  - Days Until Due
Sort: Period Date ascending
```

Displays as a portlet on the BC Projects Dashboard or NS Home Dashboard.

### 4.2 Portlet: Overdue Items (Action Required)

```
Saved Search: BC Cash Flow — Overdue Items
Record Type: customrecord_bc_cost_timing_line (+ revenue)
Criteria:
  - Status = Overdue
Results:
  - Project Name
  - Type (Cost / Revenue)
  - Vendor/Customer
  - Amount
  - Period Date (when it was due)
  - Days Overdue (formula: TODAY - Period Date)
Sort: Days Overdue descending
```

### 4.3 Portlet: This Month's Cash Position

```
Saved Search: BC Cash Flow — Monthly Summary
Uses: Summary search grouped by month
Shows: Revenue Expected | Cost Expected | Net for current and next 3 months
```

### 4.4 Portlet: Projects Without Timing

```
Saved Search: BC Cash Flow — Missing Timing
Identifies projects with approved POs or active contracts that have NO timing lines.
Helps drive adoption and coverage.
```

---

## 5. Schedule Integration (Task Tie-In)

### 5.1 The Connection Point: Cost Code

This is the key insight that makes everything work. The BlueCollar ecosystem already shares a common axis:

```
Budget Item     → has Cost Code → has budgeted hours and dollars
Purchase Order  → has Cost Code → has committed cost
Project Task    → has Cost Code → has start date, end date, duration
Timing Line     → has Cost Code → has forecasted date and amount
```

Cost Code is the universal join key. A task for "03300 - Concrete Pour" running May 1–June 15, a PO for concrete materials coded to 03300, and a timing line for that PO all share the same Cost Code.

### 5.2 Capability Tiers

#### Tier 1 — Schedule-Aware Visual Indicators (Phase 1)

Display task date context alongside timing lines in the Suitelet reports:

When rendering a timing line for a cost code that has a linked task:
- Show task start/end date as context: "Task: Concrete Pour (May 1 – Jun 15)"
- If timing line period date falls OUTSIDE the task date range → visual warning
- If timing line period date falls BEFORE task start → flag: "Payment before work begins"
- If timing line period date falls AFTER task end → flag: "Payment after work complete"

**Implementation**: SuiteQL join from timing line → cost code → project task:

```sql
SELECT
  ctl.custrecord_bc_ctl_period_date AS timing_date,
  ctl.custrecord_bc_ctl_amount AS amount,
  ctl.custrecord_bc_ctl_cost_code AS cost_code,
  task.name AS task_name,
  task.startdate AS task_start,
  task.enddate AS task_end,
  CASE
    WHEN ctl.custrecord_bc_ctl_period_date < task.startdate
      THEN 'BEFORE_TASK'
    WHEN ctl.custrecord_bc_ctl_period_date > task.enddate
      THEN 'AFTER_TASK'
    ELSE 'ALIGNED'
  END AS alignment_status
FROM customrecord_bc_cost_timing_line ctl
  LEFT JOIN customrecord_bc_project_task task
    ON task.custrecord_bc_task_project = ctl.custrecord_bc_ctl_project
    AND task.custrecord_bc_task_cost_code = ctl.custrecord_bc_ctl_cost_code
WHERE ctl.custrecord_bc_ctl_project = :projectId
```

**NOTE**: Exact task record/field IDs need SDF inspection. The BC Gantt stores tasks as custom records with cost code, start date, end date, duration, and project fields.

#### Tier 2 — Schedule-Suggested Timing (Phase 2)

Auto-suggest timing schedules based on task dates:

When user opens the Cost Timing Suitelet for a PO:
1. System looks up the cost code on the PO
2. Finds the corresponding project task(s) with matching cost code
3. Suggests: "Task 'Concrete Pour' runs May 1 – Jun 15. Suggest spreading this PO over that period?"
4. If user accepts, generates timing lines with start date = task start, spread evenly across task duration

For labor timing, this is even more natural:
1. Budget hours on cost code 03300 = 600 hours
2. Task "Concrete Pour" runs May 1 – Jun 15 (45 days, ~6.5 weeks)
3. System suggests: 600 hours spread across 6.5 weeks ≈ 92 hrs/week
4. User can accept, adjust, or override

**This is the "full circle" moment**: Budget → Schedule → Timing → Cash Flow → Alerts. Everything connects through the cost code.

#### Tier 3 — Schedule-Driven Recalculation (Phase 3)

When a task's dates change on the Gantt (schedule update):
1. System checks if timing lines exist for cost codes associated with that task
2. If timing lines exist AND their dates fall outside the new task range → flag `needs_recalc`
3. PM sees: "Schedule updated. Concrete Pour moved to Jun 1 – Jul 30. Review cash flow timing?"
4. Option to auto-adjust timing lines to match new schedule

This creates a **live link** between the schedule and the cash flow forecast — when the schedule slips, the cash flow forecast automatically surfaces the impact.

### 5.3 Task Integration — Data Model

No new records needed. The join is purely query-based through Cost Code. However, consider a denormalized field:

| Add to Timing Lines | Field ID | Type | Purpose |
|---------------------|----------|------|---------|
| Related Task | `custrecord_bc_ctl_task` | List/Record → BC Task | Optional explicit link when schedule-suggested timing is used |

When populated (by schedule-suggest or manual link), this enables:
- Direct drill-through from timing line to task
- Automatic recalc flagging when task dates change (via UE on task record)
- Visual timeline overlay in reports (task bar + timing dots)

### 5.4 Schedule Integration — Visual Report Enhancement

In the report Suitelets, when task data is available, overlay task bars above the timing grid:

```
Cost Code: 03300 - Concrete

  Schedule:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ← Task bar (May 1 - Jun 15)
  Timing:    ·····$15K····$22.5K····$11.25K···  ← Timing dots on task bar
             May         Jun
  
  ⚠️ $11.25K payment on Jul 1 falls AFTER task end (Jun 15)
```

---

## 6. Feasibility Assessment

| Capability | Feasibility | Complexity | Phase |
|------------|-------------|------------|-------|
| Weekly digest email | High — scheduled script + email template | Low | 1 |
| NS Workflow alerts (overdue) | High — native NS workflow on custom record | Low | 1 |
| Dashboard portlets (saved searches) | High — standard NS saved search portlets | Low | 1 |
| Cell-level color coding in Suitelets | High — custom HTML, full control | Low | 1 |
| KPI header bar in reports | High — HTML rendering | Low | 1 |
| Net cash flow sparkline | High — inline SVG/CSS | Medium | 1 |
| Schedule-aware visual indicators | High — SuiteQL join through cost code | Medium | 1 |
| Projects without timing portlet | High — saved search | Low | 1 |
| Configurable alert thresholds | High — fields on Global Preferences | Low | 1 |
| Schedule-suggested timing | Medium — requires task record inspection | Medium | 2 |
| Schedule-driven recalc on task change | Medium — UE on task record + flag | Medium | 3 |
| Task bar overlay in reports | Medium — HTML/SVG rendering | Medium | 2 |

**Bottom line**: Most of the alert and visual indicator work is Phase 1 feasible with low additional complexity. The task integration is a natural Phase 2/3 evolution — Tier 1 (visual indicators showing alignment) can ship in Phase 1, with auto-suggest and live linking coming later.

---

## 7. Competitive Differentiation Summary

| Capability | BlueCollar | 4castplus | Anterra | Procore |
|------------|-----------|-----------|---------|---------|
| Transaction-level timing | ✅ Bottom-up | ❌ Top-down | ❌ Top-down | ❌ None |
| GL-aware forecasting | ✅ Cost Type on every line | ❌ | ❌ | ❌ |
| Revenue + Cost combined | ✅ Net cash flow view | ⚠️ Separate | ⚠️ Separate | ❌ |
| Change Order timing | ✅ Dual-pane, approval-linked | ❌ | ❌ | ❌ |
| Schedule-linked timing | ✅ Cost Code join | ⚠️ WBS-only | ❌ | ❌ |
| Proactive alerts | ✅ Multi-channel | ❌ | ⚠️ Basic | ❌ |
| Visual health indicators | ✅ Custom HTML | ⚠️ Basic | ⚠️ Basic | ❌ |
| Dashboard portlets | ✅ Native NS | ❌ Separate tool | ❌ Separate tool | ❌ |
| Labor cost timing | ✅ Resource Rate Template | ❌ | ❌ | ❌ |

The story we're telling: *"Your schedule says when work happens. Your budget says how much it costs. Your contracts say who pays whom. BlueCollar connects all three to tell you when cash actually moves — and alerts you before something goes wrong."*

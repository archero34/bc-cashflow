# Product Requirements Document: Cost Timing Schedule

## Context

- **Module**: BlueCollar Cloud — NetSuite SuiteApp
- **Feature**: Project Cash Flow Forecasting (Material + Labor + Revenue + Change Orders)
- **Version**: 3.0 — Major Revision
- **Status**: Draft
- **Date**: 2026-03-25

### Revision History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-25 | Initial — material cost timing only |
| 2.0 | 2026-03-25 | Added labor forecasting, project subtab, portfolio view |
| 3.0 | 2026-03-25 | Added revenue timing (Contract/SO), change order timing, accrual vs cash flow views. Revenue moved to Phase 1. |

---

## 1. Problem Statement

BlueCollar Projects tells you HOW MUCH — but not WHEN. Three blind spots exist:

1. **Material / Subcontract Cash Flow**: PO approval shows full committed cost today. Reality: cash flows out over months per vendor payment terms.

2. **Labor Cash Flow**: Budget hours and Resource Rate Templates define the cost, but there's no forecast of WHEN those labor dollars hit.

3. **Revenue Cash Flow**: The contract (Sales Order) shows the total amount owed by the customer. But billing happens on a schedule — progress payments, milestone payments, retainage releases. There is no way to forecast WHEN revenue cash will come in.

4. **Change Orders**: A change order modifies both the contract (revenue) and the budget (cost). The CO itself has its own payment schedule — the customer may pay the CO on different terms than the base contract, and the vendor may bill the CO work on a different schedule than the base PO.

**The combined view — revenue in vs. cost out over time — is the project cash flow forecast.** Without it, PMs cannot manage cash position, CFOs cannot plan liquidity, and the company cannot see when projects are cash-positive vs. cash-negative.

---

## 2. Proposed Solution

### 2.1 Material Cost Timing (PO / Bill Level)

Cost Timing Schedule on Purchase Orders and Vendor Bills. Users define when dollars flow out. **No GL impact.**

### 2.2 Labor Cost Timing (Budget / Resource Template Level)

Labor Cost Forecast Suitelet — two-part tool: assign budget hours to Resource Rate Templates, then spread the timing.

### 2.3 Revenue Timing (Contract / Sales Order Level)

Revenue Timing Schedule on the Sales Order (Contract). Users define when customer payments are expected to come in. Same template-based approach as material. Each contract line (Schedule of Values line) can have timing applied. **No GL impact — does not affect revenue recognition or billing.**

### 2.4 Change Order Timing (Change Request Level)

A Change Order Timing Suitelet on the Change Request record. This handles BOTH sides of the CO in one UI:
- **Revenue side**: When the CO's additional contract value will be paid by the customer (independent schedule from base contract)
- **Cost side**: When the CO's additional budget cost will be incurred (independent schedule from base PO)

On CO approval:
- Revenue side: triggers a prompt to recalculate contract-level revenue timing on the Sales Order (since Current Contract has changed)
- Cost side: the budget records created/updated by the CO are captured and can have timing applied

CO timing data feeds directly into the combined project cash flow report — no separate CO reporting Suitelet.

### 2.5 Project-Level Reporting (Subtab on Project Record)

New "Cash Flow Forecast" subtab with three Suitelet reports in iframes:
1. **Material Cash Flow Timeline** — PO/Bill timing + CO cost timing
2. **Revenue Cash Flow Timeline** — Contract timing + CO revenue timing
3. **Combined Cash Flow Forecast** — Revenue In vs. Cost Out (Material + Labor + CO Cost) = Net Cash Position

### 2.6 Global Portfolio View

Standalone Suitelet at `BlueCollar > Project Control Center > Cash Flow Portfolio`.

### Dual-View Model

Based on customer requirements, the reporting must support TWO perspectives:

**Cash Flow View**: When payments actually move based on payment terms (the primary forecast)
- Revenue: when customer payments arrive
- Cost: when vendor/sub payments go out
- Net: cash position per period

**Accrual View (Phase 2)**: When revenue/costs are recognized from an accounting perspective
- Revenue: recognized at delivery/completion using POC method
- Cost: recognized at delivery/completion
- This aligns with the WIP Report and revenue recognition engine

Phase 1 delivers the Cash Flow View. The Accrual View is Phase 2 since it requires integration with the existing revenue recognition engine and delivery dates.

---

## 3. Scope

### 3.1 In Scope — Phase 1

**Material Cost Timing:**
- Cost Timing Schedule on Purchase Orders and Vendor Bills
- Cost Timing Templates (shared across all timing types)
- Manual override + template application
- Auto-recalculation on transaction amount change

**Labor Cost Timing:**
- Labor Cost Forecast Suitelet on project record
- Part 1: budget hours → Resource Rate Templates
- Part 2: timing spread on assigned hours
- Labor Timing Lines (custom record)

**Revenue Timing (NEW):**
- Revenue Timing Schedule on Sales Order (Contract)
- Same template-based approach as material timing
- Applied at the contract (SO) level — total contract value spread over time
- CO approval triggers recalculate prompt on contract revenue timing

**Change Order Timing (NEW):**
- CO Timing Suitelet on the Change Request record
- Dual-pane UI: Revenue (billing-side CO impact) + Cost (estimate-side CO impact)
- Revenue timing: spread the CO's contract change value over time
- Cost timing: spread the CO's budget change value over time
- CO timing lines feed into combined project report
- On CO approval: revenue-side triggers recalc on contract timing; cost-side creates timing-eligible budget delta records

**Project-Level Reporting:**
- Subtab on project record with iframed Suitelets
- Three views: Material/Cost | Revenue | Combined (Net Cash Flow)
- CO timing data included in each relevant view
- Time-phased by month, grouped by cost group / source

**Global Portfolio View:**
- Standalone Suitelet
- All projects, filterable
- Revenue, Cost, Net per month per project

**Infrastructure:**
- Cost Timing Templates (shared)
- Permissions, feature toggle
- No GL impact anywhere

### 3.2 Out of Scope — Future Phases

| Feature | Phase |
|---------|-------|
| Accrual-based view (recognized timing) | 2 |
| S-curve chart visualization | 2 |
| Automated template assignment via workflow | 2 |
| Integration with Gantt / schedule tasks | 3 |
| OT/DT rate blending in labor forecast | 2 |
| Line-level timing on multi-line POs | 2 |
| Revenue timing at SOV line level (vs. contract total) | 2 |

---

## 4. Functional Requirements — Material Cost Timing

*(Unchanged from v2 — see PRD v2 sections 4.1-4.4)*

### Summary
- Cost Timing Templates (shared record)
- Cost Timing Schedule sublist on PO and Bill
- Template application workflow (select template + start date → generate lines)
- Manual override + 100% validation
- Recalculation on amount change

---

## 5. Functional Requirements — Labor Cost Timing

*(Unchanged from v2 — see PRD v2 section 5)*

### Summary
- Part 1: Assign budget hours to Resource Rate Templates per cost code
- Part 2: Spread timing using shared templates
- Labor Timing Lines with rate breakdown (Wages, Burden, Benefits + GL accounts)

---

## 6. Functional Requirements — Revenue Timing (NEW)

### 6.1 Overview

Revenue Timing lives on the Sales Order (Contract). It forecasts when customer payments are expected to arrive based on the contract's billing schedule and payment terms.

This is the SAME mechanism as material cost timing — reusable templates, manual override, 100% validation — but applied to the revenue side.

### 6.2 Revenue Timing Schedule (Contract Sublist)

A "Revenue Timing Schedule" button on the Sales Order (when BlueCollar Contract checkbox is checked).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Period Date | Date | Yes | When this revenue payment is expected |
| Percentage | Percent | Conditional | % of Current Contract total |
| Amount | Currency | Yes | Dollar amount expected |
| Cumulative % | Percent | Auto | Running total |
| Cumulative Amount | Currency | Auto | Running total |
| Status | List | Auto | `Forecasted` \| `Received` \| `Overdue` |
| Label / Note | Free Text | No | e.g., "Progress Payment #1", "Retainage Release" |
| Source | List | Auto | `Template` \| `Manual` |
| Source Group | List | Auto | `Base Contract` \| `Change Order` (identifies origin) |
| Related Change Order | List/Record | No | Links to CO if this timing line was generated from a CO |

### 6.3 Workflow

```
1. Contract created and approved → user clicks "Revenue Timing Schedule" on SO
2. Suitelet shows contract total (Current Contract) + timing grid
3. User selects template + start date → timing lines generated
4. User adjusts as needed → saves
5. On Change Order approval (revenue impact):
   → System prompts: "Change Order approved. Contract value changed from $X to $Y. 
      Options: (a) Add CO timing lines (keep existing, add new lines for CO delta)
               (b) Recalculate all timing proportionally
               (c) Dismiss — handle manually"
6. Option (a) is recommended: preserves base contract timing, adds new lines with Source Group = 'Change Order'
```

### 6.4 CO Revenue Impact — Append vs. Recalculate

The recommended approach for CO revenue timing:

**Option A — Append (Recommended):**
When a CO is approved with billing-side impact, the CO's own revenue timing lines (created on the Change Request) are appended to the contract's revenue timing schedule. These lines have `Source Group = 'Change Order'` and `Related Change Order` set. The base contract timing lines remain unchanged. This mirrors how the spreadsheet example works — Base Bid and Change Order A have independent payment schedules.

**Option B — Proportional Recalculate:**
Recalculate ALL timing lines (base + COs) proportionally based on new Current Contract total. Use when the CO fundamentally changes the payment structure rather than adding incremental payments.

### 6.5 Validation

- Timing lines for Base Contract + all COs must sum to Current Contract total
- Warning (not hard block) if they don't — allows for retainage and partial billing scenarios
- Individual CO timing lines must sum to the CO's billing-side impact amount

---

## 7. Functional Requirements — Change Order Timing (NEW)

### 7.1 Overview

A Change Order Timing Suitelet on the Change Request record. This allows the user to define WHEN the CO's revenue and cost impacts will flow — independent of the base contract and base PO schedules.

The CO timing lives on the Change Request itself (not on the Sales Order or Budget). On approval, CO timing data is:
- Revenue side: appended to the contract's revenue timing schedule
- Cost side: stored as CO-sourced timing lines that feed into the combined report

### 7.2 CO Timing Suitelet — Dual Pane UI

The Suitelet has two panes within a single screen:

**Revenue Pane (top):**
- Shows: CO billing-side impact amount (from Contract subtab → sum of Proposed Changes)
- User applies timing template or manual entry → spreads the CO revenue impact over time
- Same fields as revenue timing lines

**Cost Pane (bottom):**
- Shows: CO cost-side impact amount (from Estimate subtab → sum of Proposed Changes)
- Breaks down by Cost Code and Cost Type (from the Estimate subtab detail)
- User applies timing template or manual entry per cost code → spreads CO cost over time
- Same fields as material cost timing lines, plus Cost Code and Cost Type

### 7.3 Data Sources for CO Timing

**Revenue side — where to get the billing impact:**
The Change Request's Contract subtab stores billing-side change lines. On the Change Request record:
- Each contract line shows: Line #, Item, Current Scheduled Value, Proposed Changes
- Sum of Proposed Changes = total billing impact of this CO
- SuiteQL: query the Change Request's contract detail child records

**Cost side — where to get the estimate impact:**
The Change Request's Estimate subtab stores cost-side change lines. On the Change Request record:
- Each budget line shows: Division, Cost Code, Cost Type, Current Estimate, Proposed Changes, Proposed Hours
- SuiteQL: query the Change Request's estimate detail child records
- These provide the cost code + cost type (GL account) for each CO cost timing line

**Subcontract side:**
If the Change Request has a linked Subcontract Change Request, the PO modification amount is also available. This feeds into the cost pane. SuiteQL: query the Subcontract Change Request child records linked to the parent Change Request.

### 7.4 On CO Approval — What Happens to Timing Data

```
CO APPROVED
├── Revenue side (billing impact exists):
│   ├── CO revenue timing lines → copied/linked to Contract's revenue timing schedule
│   ├── Source Group = 'Change Order', Related Change Order = this CO
│   └── Prompt to user: "Review contract revenue timing — CO lines have been added"
│
├── Cost side (estimate impact exists):
│   ├── CO cost timing lines → stored as project-level timing lines
│   ├── Source = 'Change Order', linked to CO record
│   ├── Cost Code + Cost Type inherited from CO estimate detail
│   └── Feeds directly into combined project report
│
└── Subcontract side (sub CO exists):
    ├── PO amount changes → existing PO material timing recalc flag set
    └── CO subcontract cost timing → also feeds into combined report
```

### 7.5 CO Timing Before vs. After Approval

- **Before approval**: CO timing is visible only on the Change Request record. Not included in project reports.
- **After approval**: CO timing data flows into project-level reports. Revenue side appears in Revenue timeline. Cost side appears in Material/Cost timeline. Both appear in Combined view.
- This prevents "pending" COs from polluting the forecast while still allowing planning before approval.

### 7.6 Validation

- Revenue timing must sum to CO billing impact amount (100%)
- Cost timing per cost code must sum to that cost code's Proposed Changes amount
- Warning if CO is approved without timing configured: "This CO has no timing schedule. Cost/revenue will appear as lump sum on approval date."

---

## 8. Functional Requirements — Project-Level Reporting

### 8.1 Architecture

"Cash Flow Forecast" subtab on BlueCollar Project record. UE script injects inline HTML → iframes → three Suitelet reports.

```
Project Record
├── Cash Flow Forecast (subtab)
│   ├── Cost Tab          ← Material (PO/Bill) + CO Cost + Labor
│   ├── Revenue Tab       ← Base Contract + CO Revenue
│   └── Combined Tab      ← Revenue In - Cost Out = Net Cash Position
```

### 8.2 Cost Cash Flow Timeline (Suitelet)

Groups all cost outflows:
- Material/Subcontract timing (from POs/Bills)
- CO cost timing (from approved Change Orders)
- Labor timing (from labor forecast)

Grouped by: Cost Group (Base PO / Change Order / Labor) > Division > Cost Code

### 8.3 Revenue Cash Flow Timeline (Suitelet)

Groups all revenue inflows:
- Base Contract timing (from Sales Order)
- CO revenue timing (from approved Change Orders)

Grouped by: Source (Base Contract / Change Order name)

### 8.4 Combined Cash Flow Forecast (Suitelet)

The money-shot view. Matches the Job Cashflow spreadsheet layout:

```
                          Apr-26   May-26   Jun-26   Jul-26   ...   Total
Revenue (Price)
  Base Bid                 7,500    4,500    7,500    4,500   ...   30,000
  Change Order A               0        0        0    2,400   ...   12,000
  Revenue Total            7,500    4,500    7,500    6,900   ...   42,000

Cost
  Vendor A                     0    3,000    4,500    2,250   ...   15,000
  Vendor B                 4,000        0        0        0   ...    8,000
  Change Order A               0        0        0    2,000   ...   10,000
  Labor                      ...      ...      ...      ...   ...      ...
  Cost Total               4,000    3,000    4,500    4,250   ...   33,000

Net Cash Flow              3,500    1,500    3,000    2,650   ...    9,000
```

Filters: Date Range, Cost Category, Source/Cost Group
Export: CSV, PDF

---

## 9. Functional Requirements — Global Portfolio View

*(Unchanged from v2 — see PRD v2 section 7)*

Updated to include revenue timing data in aggregation. Each project row shows: Revenue Total | Cost Total | Net per month.

---

## 10. Reference Scenario

The following scenario (from customer-provided spreadsheet) should be fully reproducible in the system:

### Job Summary

| Label | Cost Group | Total Value | Payment Schedule |
|-------|-----------|-------------|-----------------|
| Customer Contract (Base Bid) | Revenue | $30,000 | 25% Apr, 15% May, 25% Jun, 15% Jul, 10% Sep, 10% Nov |
| PO — Vendor A | Cost | $15,000 | 20% May, 30% Jun, 15% Jul, 15% Oct, 20% Dec |
| PO — Vendor B | Cost | $8,000 | 50% Apr, 50% Nov |
| Change Order A (Revenue) | Revenue | $12,000 | 20% Jul, 30% Sep, 50% Dec |
| Change Order A (Cost) | Cost | $10,000 | 20% Jul, 30% Sep, 50% Dec |

### Expected Cash Flow Output

| Period | Revenue In | Cost Out | Net |
|--------|-----------|---------|-----|
| Apr 2026 | $7,500 | $4,000 | $3,500 |
| May 2026 | $4,500 | $3,000 | $1,500 |
| Jun 2026 | $7,500 | $4,500 | $3,000 |
| Jul 2026 | $6,900 | $4,250 | $2,650 |
| Aug 2026 | $0 | $0 | $0 |
| Sep 2026 | $6,600 | $3,000 | $3,600 |
| Oct 2026 | $0 | $2,250 | ($2,250) |
| Nov 2026 | $3,000 | $4,000 | ($1,000) |
| Dec 2026 | $6,000 | $8,000 | ($2,000) |
| **Total** | **$42,000** | **$33,000** | **$9,000** |

This scenario validates:
- Base contract revenue timing
- Two separate PO cost timing schedules
- CO with independent revenue AND cost timing
- CO timing appearing as separate line items (not merged into base)
- Net cash flow calculation (negative months = cash out exceeds cash in)

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Template application | < 2 seconds |
| Project report load | < 5 seconds (500 timing lines) |
| Portfolio view load | < 10 seconds (100 projects) |
| Timing lines per transaction | Up to 52 |
| GL Impact | **NONE** |
| Revenue Recognition Impact | **NONE** — timing is independent of rev rec |
| Billing Impact | **NONE** — timing does not affect invoice generation |

---

## 12. Success Metrics

- 80%+ active projects have material timing within 90 days
- 50%+ active projects have revenue timing within 90 days
- Combined Cash Flow Forecast becomes weekly PM touchpoint
- Portfolio View adopted by finance for monthly cash planning
- Zero GL / rev rec / billing impact (automated regression)

# BC Cash Flow — Post-Deploy Fix-Up Runbook

Manual NS UI changes required after a fresh `npm run deploy` to a new sandbox. SDF ships these as the technically-valid baseline; production behavior needs the tweaks below.

Work top to bottom. Each item: **what** + **why** + checkbox.

---

## 1. Field Type Fixes — INTEGER → List/Record

**Why:** SDF only supports a narrow set of `<selectrecordtype>` values for custom-record references. BC SuiteApp records (Project / Cost Code / Change Order) are not addressable from this account-customization SDF, so they ship as INTEGER. Production needs them as real List/Record refs so the UE scripts and Suitelets get typed values and so the user sees a picker, not a raw internal-id field.

For each field below: **Customization → Lists, Records & Fields → Record Types → [record] → Fields tab → click field → change Type to List/Record → set Source List → Save.**

### `customrecord_bc_cost_timing_line` (BC Cost Timing Line)

- [ ] `custrecord_bc_ctl_project` → List/Record → **BC Project** (BlueCollar SuiteApp segment record)
- [ ] `custrecord_bc_ctl_source_template` → List/Record → **BC Cost Timing Template** (`customrecord_bc_cost_timing_template`)
- [ ] `custrecord_bc_ctl_change_order` → List/Record → **BC Change Order** (BlueCollar SuiteApp record, list ID -380 or equivalent)
- [ ] `custrecord_bc_ctl_cost_code` → List/Record → **BC Cost Code** (BlueCollar SuiteApp segment record)

### `customrecord_bc_revenue_timing_line` (BC Revenue Timing Line)

- [ ] `custrecord_bc_rtl_project` → List/Record → **BC Project**
- [ ] `custrecord_bc_rtl_source_template` → List/Record → **BC Cost Timing Template** (`customrecord_bc_cost_timing_template`)
- [ ] `custrecord_bc_rtl_change_order` → List/Record → **BC Change Order**

> Note: `custrecord_bc_cttl_period_number` and `custrecord_bc_ctt_num_periods` are intentionally INTEGER (sequence / count). Do NOT change these.

---

## 2. BC Project Parent/Child Subtab Structure

**Why:** The three Cash Flow Suitelet iframes are mounted via INLINEHTML fields on the BC Project record. They need a parent "Cash Flow" subtab with three child subtabs so the iframes don't pile up flat on the project header.

**Customization → Forms → Entry Forms → [BC Project form] → Subtabs.**

- [ ] Create parent subtab: **Cash Flow**
- [ ] Create child subtab: **Combined** (parent = Cash Flow)
- [ ] Create child subtab: **Cost** (parent = Cash Flow)
- [ ] Create child subtab: **Revenue** (parent = Cash Flow)

**Customization → Forms → Entry Forms → [BC Project form] → Screen Fields → Custom tab.** Move each field to its child subtab:

- [ ] `custrecord_bc_cf_combined_html` → **Combined** subtab
- [ ] `custrecord_bc_cf_cost_html` → **Cost** subtab
- [ ] `custrecord_bc_cf_revenue_html` → **Revenue** subtab

---

## 3. Disable Available Without Login on Data Suitelet

**Why:** `bc_cf_data_sl` returns JSON used by the parent-record iframes. Public AWL access leaks project-level financial data to anyone with the script URL. The iframe runs in-session against the logged-in NS user, so AWL is unnecessary.

**Customization → Scripting → Script Deployments → search `customdeploy_bc_cf_data_sl` → Edit.**

- [ ] Uncheck **Available Without Login** → Save

---

## 4. Portfolio Suitelet Menu Entry

**Why:** `bc_cf_portfolio_sl` is the cross-project rollup. SDF deploys the script + deployment but does not create the navigation entry. Users need a Reports menu link to find it.

**Setup → Customization → Center Tabs / Center Categories / Center Links** (or **Reports → Customize Menu**).

- [ ] Center: **Reports**
- [ ] Category: **BlueCollar**
- [ ] Link label: **Portfolio Cash Flow**
- [ ] URL: deployment URL for `customdeploy_bc_cf_portfolio_sl` (copy from the Script Deployment record)
- [ ] Save and verify the entry appears under **Reports → BlueCollar → Portfolio Cash Flow** for an admin and for the BC role(s)

---

## 5. Field Label Verifications

**Why:** Two display labels were renamed in production to avoid name collisions with BC Project custom segments. The XML carries these forward, but verify after deploy in case form-level overrides are involved.

On `customrecord_bc_cost_timing_line` → Fields tab:

- [ ] `custrecord_bc_ctl_cost_code` label reads **"Related Cost Code"** (not "Cost Code")
- [ ] `custrecord_bc_ctl_change_order` label reads **"Related Change Order"** (not "Change Order")

If either reverted to the unprefixed label, edit the field and update the Label on the record-type form.

---

## Smoke test after fix-up

- [ ] Open a BC Project: Cash Flow parent subtab visible with three children populated
- [ ] Open a PO: Schedule subtab loads, template picker works
- [ ] Open the Portfolio Cash Flow report from the Reports menu
- [ ] Hit the Data Suitelet URL while logged out → expect a login prompt (not JSON)

# UI/UX Improvements Tracker

Track incremental UI/UX refinements. Work through these one at a time.

---

## 🔴 High Priority

### 1. Dashboard layout — revisit section design
- **Status:** Implemented collapsible sections (Alerts, Job Search, Finance, Career Profile) but visual result needs refinement
- **Next steps:** Experiment with different card proportions, spacing, and section styling until it feels right
- **File:** `src/app/page.tsx`

### 2. Card density — reduce oversized cards across pages
- **Pages affected:** Dashboard, Current Position, Career Model, Applications
- **Problem:** Cards are too tall, consuming excessive vertical space. Hard to get an overview without scrolling.
- **Ideas:**
  - Collapse long content behind "Show more" toggles
  - Use compact card variants (smaller padding, tighter line spacing)
  - Make cards collapsible/expandable by default
  - Reduce header + content padding (`p-6` → `p-4`, `pb-4` → `pb-2`)

### 2. Dashboard — too many full-width cards stacked vertically
- **Problem:** Each card stretches full column width with generous padding, pushing everything below the fold.
- **Ideas:**
  - Use a 2-column grid for smaller cards (Experience + Pay Calendar side by side)
  - Compact stat cards (application counts, interview counts) in a row
  - Collapse sections the user doesn't use often

### 3. Current Position — compensation tab is very long
- **Problem:** CompensationTracker + PaycheckEstimator + PayPeriodCalendar stack makes the tab scroll-heavy.
- **Ideas:**
  - Nest sub-tabs or accordion within the compensation tab
  - Make PaycheckEstimator collapsible (default collapsed)
  - Shrink CompensationTracker table rows

---

## 🟡 Medium Priority

*All completed — see ✅ section below.*

---

## 🟢 Low Priority / Polish

*All completed — see ✅ section below.*

---

## 🔵 Rethink / Design Discussion

### 11. Career Model — Income Projections are unrealistic
- **Status:** Switched from naive avg-of-YoY% to CAGR but still produces speculative numbers
- **Root problem:** Early career income history (e.g. $970 → $96k over 8 years) includes non-comparable life stages (part-time student work, career switches, first full-time job). CAGR treats these as one continuous growth curve, which inflates projections.
- **Current approach:** CAGR from first year to last year → compound forward
- **Ideas to explore:**
  - **Recency-weighted:** Only use the last 3–5 years for projections (career has stabilized)
  - **Median YoY%:** Use median instead of mean to resist outliers, still per-year
  - **Exclude outlier years:** Auto-detect and exclude years with >100% or <-50% change (career pivots, part-time years)
  - **User-selectable baseline:** Let user pick which years to include in the projection baseline
  - **Industry benchmarks:** Use BLS/salary data for typical growth rates (3-5%/yr) as a sanity cap
  - **Scenario modeling:** Show optimistic / realistic / conservative projections (e.g. CAGR, median, 3% floor)
  - **Cap projections:** Hard-cap growth rate at a reasonable ceiling (e.g. 15-20%) to prevent runaway numbers
  - **Rolling window:** Use a configurable rolling window (default 3 years) for the growth calculation
- **File:** `src/app/career-model/page.tsx`

---

## ✅ Completed

### 1. Dashboard layout — revisit section design
- Tightened root spacing `space-y-6` → `space-y-4`
- Compact profile header: banner `h-24` → `h-20`, avatar `h-20 w-20` → `h-16 w-16`, padding `px-6 pb-5` → `px-5 pb-4`

### 2. Card density — reduce oversized cards across pages
- Jobs page company header: banner `h-32` → `h-20`, logo `h-24 w-24` → `h-16 w-16`, padding `px-6 pb-6` → `px-4 pb-4`
- Jobs page text: company `text-2xl` → `text-xl`, role `text-lg` → `text-sm`
- Quick Facts pills: `px-3 py-2` → `px-2.5 py-1.5`, icons `h-4 w-4` → `h-3.5 w-3.5`
- Profile tab card titles: `text-lg` → `text-sm`, padding standardized to `pb-1 pt-3 px-4` / `px-4 pb-3`
- Details sidebar: replaced verbose Separator-heavy layout with compact `divide-y` grid (`py-1.5` rows)
- Responsibilities: `text-sm space-y-2.5` → `text-xs space-y-1.5`

### 2. Dashboard — too many full-width cards stacked vertically
- Already compact from collapsible sections + multi-column grids; tightened further with `space-y-4`

### 3. Current Position — compensation tab is very long
- Section toggles: `px-4 py-3` → `px-3 py-2`, icon containers `p-2` → `p-1.5`
- Inner expanded spacing: `space-y-4` → `space-y-3`
- Summary cards: `p-4` → `p-3`, icon containers `p-2.5` → `p-2`
- All card titles: `text-lg` → `text-sm`
- Empty state: `py-8` → `py-4`, icon `h-8` → `h-6`
- PaycheckTools toggle: same compaction as other toggles

### 7. Empty states are too large
- Jobs empty state: banner `h-32` → `h-20`, `py-16` → `py-10`, logo `h-20 w-20` → `h-14 w-14`
- Compensation history empty: `py-8` → `py-4`, icon `h-8` → `h-6`

### 4. Career Model — paycheck history takes too much space
- Income History card title: `text-lg` → `text-sm`
- Empty state: `py-12` → `py-6`, icon `h-10 w-10` → `h-6 w-6`
- Table container: added `max-h-[420px] overflow-auto` for scroll containment

### 5. Consistent card sizing across pages
- Grid gaps: `gap-4` → `gap-3` on all card grid layouts (learning-tracker, submissions, resumes, skills, contacts)

### 6. Mobile responsiveness
- All page headers: `flex items-center justify-between` → `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- Search inputs: `w-64` → `w-48 sm:w-64` for mobile fit
- Action buttons: `gap-3` → `gap-2` + `flex-wrap` for overflow handling
- Content padding: `p-6` → `p-4` on goals, resumes, applications, contacts

### 8. Sidebar visual weight
- Desktop sidebar: `w-64` (256px) → `w-56` (224px)
- Mobile sheet: `w-64` → `w-56`

### 9. Form dialogs — inputs feel spaced out
- All form dialogs (applications, contacts, goals, skills, certifications): `space-y-4` → `space-y-3`
- Grid gaps in forms: `gap-4` → `gap-3` (2-col and 3-col layouts)

### 10. Data tables — row density
- All page titles: `text-2xl` → `text-xl` across 13 pages
- Page header bars: `px-6 py-4` → `px-4 py-3` on applications, contacts, skills, goals, resumes, analytics
- Header icons: `h-6 w-6` → `h-5 w-5` on analytics, career-model, documents, activity, submissions, import-export

---

## 💡 Future Ideas

### Option B: Distributed Research Navigation
Instead of a dedicated "Research" nav item, distribute research features into existing pages:
- **Learning Tracker** → Career Analytics page (new tab alongside Direction, Goals, Projections)
- **Industry Research** → Insights page (new tab)
- **Tool/Tech Research** → Skills page (new tab or section)
- **Job Market Research** → Job Search page (new tab)

This reduces nav item count and puts research where it's contextually relevant. Consider if the standalone Research page feels too isolated.

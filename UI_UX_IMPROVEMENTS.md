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

### 4. Career Model — paycheck history takes too much space
- **Problem:** Upload history expands inline and pushes other content down.
- **Ideas:**
  - Move history to a slide-out sheet or modal instead of inline expansion
  - Limit visible rows to 3 with "View all" link

### 5. Consistent card sizing across pages
- **Problem:** No max-height or standard sizing for cards — some are 3x taller than others.
- **Ideas:**
  - Establish small/medium/large card height guidelines
  - Use `max-h-[X]` with `overflow-auto` for content-heavy cards
  - Standardize card header sizes

### 6. Mobile responsiveness — cards don't adapt well to small screens
- **Ideas:**
  - Stack columns on mobile
  - Hide secondary info on small screens
  - Full-width cards with reduced padding on mobile

---

## 🟢 Low Priority / Polish

### 7. Empty states are too large
- **Problem:** Empty state placeholders (icons + text) use the same padding as populated cards.
- **Ideas:**
  - Reduce empty state height
  - Use inline "Add X" prompts instead of full card bodies

### 8. Sidebar visual weight
- **Ideas:**
  - Slim down sidebar width slightly
  - Collapse to icons-only on medium screens

### 9. Form dialogs — inputs feel spaced out
- **Ideas:**
  - Tighten gap between form fields
  - Use 2-column layouts for short fields (dates, numbers)

### 10. Data tables — row density
- **Ideas:**
  - Compact row height for applications/contacts/interviews tables
  - Hover-reveal actions instead of always-visible buttons

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

_None yet — move items here as they are done._

---

## 💡 Future Ideas

### Option B: Distributed Research Navigation
Instead of a dedicated "Research" nav item, distribute research features into existing pages:
- **Learning Tracker** → Career Analytics page (new tab alongside Direction, Goals, Projections)
- **Industry Research** → Insights page (new tab)
- **Tool/Tech Research** → Skills page (new tab or section)
- **Job Market Research** → Job Search page (new tab)

This reduces nav item count and puts research where it's contextually relevant. Consider if the standalone Research page feels too isolated.

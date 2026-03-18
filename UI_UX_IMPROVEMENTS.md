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

## ✅ Completed

_None yet — move items here as they are done._

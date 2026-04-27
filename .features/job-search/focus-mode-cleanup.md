# Job Search Focus Panel — Cleanup & Redesign

**Status:** Proposal  
**Component:** `src/components/job-map.tsx` — `selectedJob` floating panel (lines ~4263–5060)  
**Goal:** Mirror the clarity and UX discipline applied to the Work History panel; surface the most useful info faster, reduce visual clutter, and fix structural issues.

---

## Current State Audit

The floating panel has three logical zones (sticky header / scrollable sections / sticky footer) but suffers from several issues:

### Header (lines 4268–4385)
- **Title + company** — good
- **Key metrics row** — salary, life score, commute time — cramped, no visual separation
- **Badge row** — location pill, source badge, contract type, duty stations, walk/transit/bike score emoji badges — hard to read, badge overflow wraps
- Walk/transit/bike appear as `🚶53 🚌45 🚴72` — not legible at glance

### Scrollable sections — uses native `<details>/<summary>`
Native `<details>` causes multiple problems:
- No programmatic open/close (can't auto-close "Location" when a panel elsewhere opens)
- Chevron CSS `group-open:rotate-180` is brittle across browsers
- No consistent expand/collapse tracking in React state

| Section | Open by default | Problems |
|---------|----------------|---------|
| 📍 Location | Yes | Kitchen sink — 6+ distinct sub-features dumped in one section |
| 🏢 Business Info | No | Only appears after address resolves; useful info (rating, website) buried |
| 🚗 Commute | Yes | Good content, but yearly cost hidden behind time/distance row |
| ⚓ Anchors | No | Labelled "Anchors" — unclear; net salary buried at bottom |
| 🏠 Office View | No | Useful but completely invisible until clicked |

### Footer
- "Details" button opens a full Dialog with description + tax breakdown — not obvious to new users what it does
- No indication if a job has already been applied to / saved

---

## Proposed Changes

### 1. Convert `<details>/<summary>` → Custom Accordion
**Scope:** Replace all 5 native `<details>` blocks with the same `expandedSections: Set<string>` + `toggleSection()` pattern used in the Work History panel.

**Behavior:**
- Each section title row is a `<button>` with `onClick={() => toggleSection("commute")}` etc.
- Chevron animated via `cn("transition-transform", expanded ? "rotate-180" : "")`
- Enables programmatic control: auto-close/open on job change, keyboard nav, consistent styling

**Files:** `job-map.tsx` — add `const [jobPanelSections, setJobPanelSections] = useState<Set<string>>(new Set(["location", "commute"]))` scoped alongside `selectedJob` state; reset on `setSelectedJob(null)`.

---

### 2. Header Redesign — "Score Strip"
**Current:** Title → Company → (salary · score · commute) metrics row → badge row

**Proposed:** Title → Company → **Score strip** (one clean row) → secondary badges row

**Score strip layout (single row):**
```
[$24k–$24k]  [53/100 ●]  [🚗 ~33m]  [📅 2d ago]  [● Applied]
```
- Salary — emerald, already good
- Life Score — rename the colored pill; add `title="Life Score: commute 40%, salary 35%, anchors 25%"` tooltip
- Commute — icon + time only (detail inside section); add mode icon dynamically
- **Posted date** — days since `createdAt` — NEW; shows freshness at a glance
- **Application status chip** — NEW; "Applied", "Tracked", or "New" — read from `trackedIds` / interest groups

**Badge row** — strip walk/transit/bike emoji badges from here; move to Business Info section where they read better as labelled rows:
```
🚶 Walk  53    🚌 Transit  45    🚴 Bike  71
```
Keep: location pill, source badge (Adzuna), contract type, duty stations count.

---

### 3. Location Section — Split into "Address" + "Verify"

Current Location section mixes address display with address editing tools. Split it:

**"Address" sub-block (always visible inside section):**
- Loader spinner while resolving
- Resolved address line (MapPinned icon + address text + confidence badge)
- Multi-office selector (when `allLocations.length > 1`)
- **Inline business snapshot:** if `resolvedAddress.rating` → show `★ 3.5 · Open Now · website link` as a compact single line directly below the address (no separate Business Info section needed for the common case)

**"Verify / Edit" — collapsed behind a ghost button `[✏ Edit / Verify]`:**
- Address override input
- Flag as recruiter button
- Recruiter office override block
- NLP location suggestions
- "See All [Company] Locations" button + radius selector

This reduces the default Location section height by ~60% while keeping all tools accessible.

**Business Info section** — demoted to only showing if `resolvedAddress` has `hours` or `editorialSummary` (the long-form stuff). Rating + website move inline.

---

### 4. Commute Section — Surface Yearly Cost in Summary

**Section header summary change:**
```
Current:   ~33m · 22.8mi
Proposed:  ~33m · 22.8mi · $1.2k/yr
```
Add `formatCost(yearlyCommuteCost(...))` to the summary span in the header. This means the single most actionable number (annual cost of commuting to this job) is visible without expanding.

No other changes to commute internals — content is already good.

---

### 5. Anchors → "Life Impact" Rename + Net Salary Prominence

**Rename:** "Anchors" → **"Life Impact"** in the section header.

**Section header summary change:**
```
Current:   $4.9k/yr
Proposed:  Net $47.3k  (if salary exists and anchor commutes loaded)
```
Show **net salary after all commute costs** as the summary blurb — that's the number the user actually cares about.

Inside the section, keep the per-anchor breakdown rows unchanged.

---

### 6. Compensation Section — Bring Tax Breakdown Out of Dialog

Currently the tax breakdown only appears in the "Details" Dialog. Most users never discover it.

**Add a "Compensation" accordion section** between Commute and Life Impact:

```
💰 COMPENSATION                          $17.3k take-home
```

Expanding shows:
- Salary range row (already in header, shown again here in full)
- Tax breakdown table (federal %, state %, FICA, local) — same `estimateTaxes()` logic, already computed
- Take-home line (emerald, bold)
- Employer cost line (muted)
- Walk/transit/bike scores moved here as a "Walkability" mini-row

Only shown if `selectedJob.salaryMin || selectedJob.salaryMax`.  
The section header summary shows the take-home estimate, so users see value without expanding.

---

### 7. Footer CTA Cleanup

**Current:** `Details | Apply | Track | ★▾`

**Issues:**
- "Details" is vague — opens a Dialog with job description + tax breakdown
- "★▾" dropdown for interest groups is not labelled

**Proposed:**
- **"Brief"** → renamed from "Details"; add tooltip `"Full job description & tax breakdown"`; OR split into "Description" and the tax breakdown already moved to Compensation section above, making Details less necessary
- **"Apply"** — keep, already good; if no URL show disabled with "No link"
- **"Track"** — keep; show `"✓ Tracked"` state
- **"Save ▾"** → renamed from the star dropdown; adds an explicit label

**New: Application status inline** — below the button row, a single line:
```
Saved to: [Engineering] [Remote Jobs]   • Applied: not recorded
```
Shows which interest groups the job is in (if any) + a one-click "Mark Applied" action.

---

### 8. Visual Consistency Fixes

| Item | Current | Proposed |
|------|---------|---------|
| Section dividers | `divide-y` on scrollable container | Same `divide-y` — keep, but ensure section bg matches Work History panel (`muted/20` tint on summary rows) |
| Section icons | Mix of `text-emerald-500`, `text-blue-500`, `text-indigo-500`, `text-violet-500` | Standardize: location=emerald, commute=sky, compensation=emerald, life-impact=indigo, office=violet |
| Typography | Mix of `text-[11px]`, `text-xs`, `text-[10px]` | Standardize section headers to `text-[11px] font-semibold uppercase tracking-wider` (already mostly there) |
| Empty states | Some sections just render nothing | Add consistent `text-xs text-muted-foreground italic` placeholder text |

---

## Implementation Order

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Convert to custom accordion (expandedSections) | Medium | High — enables all others |
| 2 | Header score strip + posted date chip | Small | High |
| 3 | Location section split (Address / Verify) | Medium | High — biggest clutter reduction |
| 4 | Commute summary shows yearly cost | Tiny | Medium |
| 5 | Anchors → Life Impact rename + net salary summary | Tiny | Medium |
| 6 | Compensation section (tax breakdown surface) | Small | High |
| 7 | Footer rename + application status row | Small | Medium |
| 8 | Visual consistency pass | Small | Low |

---

## Out of Scope (see company-deep-dive.md)
- Company news, salary benchmarking vs market, side-by-side comparison — those belong to the Deep Dive modal.

## Files Changed
- `src/components/job-map.tsx` — all changes are within the `selectedJob &&` panel block (lines ~4263–5060 for the map panel, lines ~5328–5790 for the Details dialog)

## Test Plan

| # | Step | Expected |
|---|------|---------|
| 1 | Click a job marker | Panel opens; Location + Commute expanded; Score strip shows salary + life score + commute time + days ago |
| 2 | Job with salary data | Compensation section visible; header shows take-home in summary |
| 3 | Job without salary | Compensation section hidden; score strip shows no salary |
| 4 | Address resolves | Inline ★ rating + website link appears under address; no separate Business Info section for this case |
| 5 | Address resolves with hours/summary | Business Info section appears with long-form data |
| 6 | Click `[✏ Edit / Verify]` | Verify drawer expands within Location section |
| 7 | Commute loads | Section header shows `~33m · 22.8mi · $1.2k/yr` |
| 8 | Life anchors loaded + commute computed | Life Impact summary shows net salary |
| 9 | Switch to different job | `jobPanelSections` resets; Location + Commute expand by default |
| 10 | "Track" a job | Track button shows `✓ Tracked`; status chip in footer updates |

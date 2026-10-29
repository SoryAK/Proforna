---
target: career history
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/skaba/Dev_Projects/resumsify/resumsify/web/src/WorkHistory.tsx"
target_fingerprint: "sha256:d02c5f6a1ac3f8242e31a4b2a23f28e18bbe7e0559052efa6070c27989cbc7d2"
target_path: /home/skaba/Dev_Projects/resumsify/resumsify/web/src/WorkHistory.tsx
timestamp: 2026-10-14T14-04-13Z
slug: web-src-workhistory-tsx
---
Method: dual-agent (A: d4ea36b7-7442-45db-b281-9ffc9be7ba33 · B: 9907e778-ebcc-4c60-87ef-d136dea922ba)

# Career History critique

Target: `web/src/WorkHistory.tsx` (the `#/history` ledger, rendered by `web/src/WorkMap.tsx`). Live vault, status Revoked. Design review and detector ran in isolation, then this synthesis.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Revoked is visible, but search leaves the stat strip unchanged and the map then says the history is ready to map. |
| 2 | Match System / Real World | 2 | Total Tenure is a calendar span, Miles Traveled is a hop between first coordinates, and a Lancaster site is labeled PA 17602. |
| 3 | User Control and Freedom | 2 | Back and placement Cancel work. There is no undo and no way to remove a role. |
| 4 | Consistency and Standards | 2 | Preview rows show selection. The private ledger never does. Empty sections stay on screen as Jobs (0). |
| 5 | Error Prevention | 1 | Place is prefilled with the broken compact string, so Save would store PA 17602. Add job cannot be undone. |
| 6 | Recognition Rather Than Recall | 2 | Org, title, and gist are on the row. Seven Giants Direct buttons share one accessible name. |
| 7 | Flexibility and Efficiency | 1 | No merge, no multi-select, no ledger shortcut. Newest / Oldest is the only accelerator. |
| 8 | Aesthetic and Minimalist Design | 2 | Near-black, gold, and Geist hold. Green Current chips and the duplicate pile compete with the record. |
| 9 | Error Recovery | 2 | A failed load is one sentence with no retry. A missed search does not offer to clear. |
| 10 | Help and Documentation | 1 | Nothing explains tenure, miles, Revoked, or why seven identical rows exist. |
| **Total** | | **17/40** | **Poor** |

Cognitive load: 7 of 8 checks fail (grouping passes). That is high. The landing view asks the occupant to scan, import, publish, and read the map at once. Jobs (36) is one undifferentiated pile.

## Design Specificity Verdict

**LLM assessment:** Authored for this product. A generic admin table would not carry a vault status, Homes, Preview and Publish, a place-and-tenure gist, or a map as the light material against an operating-black ledger. The failures sit inside that identity. The stat strip, the emerald Current pill, and rows with no dividing rule drift toward a dashboard and away from the Career Ledger Row: full-width, border-divided, gold wash, inset gold selection.

**Deterministic scan:** Source detect on `WorkMap.tsx`, `WorkHistory.tsx`, `WorkMapPreview.tsx`, and `RoleDetailPanel.tsx` exited 0 with no findings. The in-page scan disagreed. On the history ledger it logged 80 anti-patterns: 72 undersized-ui-text, 4 clipped-overflow-container, 4 gpt-thin-border-wide-shadow. The open Giants Direct role logged 28, including tiny-text on the fact sentences. The design review had already called the gist about 10.7px and the stat labels about 9.3px. The detector confirmed that floor and added the role-fact lines (`Role fact`, `v1`, the duty sentences) at about 10.9px.

False positives: Google Maps chrome (Keyboard shortcuts, Map data, scale, Terms), the closed search and settings dialogs, and map-pane clipping. Repeated Current and date hits are the same measurement on duplicate rows, not 72 distinct labels.

**Visual overlays:** Injection succeeded on the history tab titled [Human]. Overlays were on the page for that pass. The helper server was then stopped, so a reload clears them.

## Overall Impression

The ledger looks like Proforna and does not behave like a record the occupant can trust. The single biggest opportunity is to make one row mean one role: collapse or flag the import copies, let a role be removed, and show the city that was actually stored.

## What's Working

- The shell is the private ledger: operating black, gold rules, Geist, map ground only on the map, and publication language that says Revoked and that a photo stays private until it is allowed.
- Rows are real buttons with organization, title, and a gist. Sections expose whether they are expanded. Keyboard focus uses a 2px gold outline.
- Placement and the preview overlay treat escape seriously. Placement has Cancel. Preview closes on Escape.

## Priority Issues

### [P0] The ledger cannot be scanned or corrected

Of 44 rows, 31 are extra copies of the same signatures (Giants Direct, Sharp Packaging, and Waters each appear seven times). Seventeen rows are marked Current, so the badge no longer means a present job. There is no Remove role. Sites, photos, and homes can be deleted. A role cannot: `server/app.ts` has PUT for a role and DELETE only for a location or a media item.

Why it matters: the primary task is to scan and enrich one record. There is no trustworthy row to open, and an import cannot be thrown away.

Fix: flag or collapse copies that share organization, title, and start date. Add Remove role, with a confirm, through a delete in `core/` and the route. Stop counting copies as 37 roles.

Suggested command: `/impeccable shape`

### [P1] The place on screen is not the place that was stored, and Save would write it back

`formatHistoryPlace` turns `235 N Reservoir St, Lancaster, PA 17602, USA` into **PA 17602**. Street abbreviations (`St`, `Ave`) are not treated as streets, and `PA 17602` is kept as the city, so Lancaster is discarded. Search matches organization, title, `locationLabel`, and that compact string only, so Lancaster and Reservoir miss. The Story Place field is prefilled with the compact result (`RoleDetailPanel.tsx`). `omitZipOnly` in `core/work-map.ts` then drops a public place that is only `ST ZIP`, so the published place becomes empty instead of Lancaster.

Why it matters: the occupant cannot find the job by city, and saving the overview would replace the real label with the fragment.

Fix: parse `ST ZIP` as state plus postal code, treat common street suffixes as streets, and bind Place to the stored label or the site address. Keep the gist as display only.

Suggested command: `/impeccable harden`

### [P1] The numbers and the empty map describe a different career

Total Tenure (10y 7m) is the span from the earliest start to the latest end, and a missing end date counts as ongoing even when the role is not current. Roles (37) includes the internship and every duplicate, and excludes education. Cities (7) includes the bogus PA 17602. Miles Traveled (179) chains each role's first coordinate in start-date order, so overlapping jobs become a fake itinerary. Search filters the list and the map, not the stats. A miss then uses the no-sites sentence.

Why it matters: the strip is the first summary of a career, and on this vault it is wrong in every cell.

Fix: label a span as a span, or sum non-overlapping work. Count distinct roles. Rebuild cities from a city token. When search misses, say no roles match and offer to clear it. Do not reuse "Your history is ready to map."

Suggested command: `/impeccable clarify`

### [P1] At phone width, Publish and Add sit off the screen

At 390px the column stacks, which is right, but the role list is 44px tall under a 72px row, so the map covers the record. Publish and Add job lay out past the right edge and cannot be scrolled into view.

Why it matters: the two controls that change the vault are unreachable on a phone.

Fix: wrap the header inside the viewport, keep Add with its section label, and give the role list a real height before the map.

Suggested command: `/impeccable adapt`

### [P2] Opening a row throws away the list

Choosing a role unmounts the ledger. `career-history-row` never receives `is-selected`, even though the stylesheet defines that state and the preview uses it. Comparing the seven Giants copies means remembering which one was opened.

Why it matters: duplicate cleanup is impossible without the other copies in view.

Fix: keep the list visible on desktop, mark the open row with the inset gold rule, and on a narrow screen use the sheet without unmounting the list underneath.

Suggested command: `/impeccable layout`

## Persona Red Flags

**Alex (power user):** No shortcut, no bulk merge, no "keep this one." Newest still surfaces a 2016 Current row above a job that ended in 2022, because sort is current-flag, then start date. Enriching one Giants row leaves six twins.

**Sam (keyboard and screen reader):** The seven Giants buttons announce the same name. Publish, Homes, and Settings are icon-only in the header, though they have accessible names. "No roles match that search." is not a live region. Gist and stat labels sit under 11px. Approve for publishing is the accessible name of both the growth and the departure checkboxes.

**Riley (edge cases):** Lancaster zeros the list and the map while the stats still say 7 cities. Place and the site address disagree. The site title is 67. A blank end date still counts as ongoing. Story fields are uncontrolled, so a refresh drops unsaved edits. Remove site does not ask. Add job would add another role that cannot be deleted.

## Minor Observations

- Empty sections stay on screen during a search miss, each with a plus.
- Row CSS sets `border-bottom: 0`, so the ledger is not border-divided.
- Current is a green chip outside the gold and coral palette.
- The stat grid uses a 12px radius, which the ledger system reserves for softer surfaces.
- Add is 27×27px.
- Loading uses an `h1`. The loaded title is an `h2`.
- The API stats object (roles, education, mapped) is never what the strip shows.
- The in-page detector's real hits, after the map chrome is set aside, are the undersized gist, Current badge, stat labels, and role-fact lines.
- Kinds are only job, internship, and school. Anything else is dumped into Jobs.
- `hideCurrentEmployer` applies only for stealth or anonymous visibility. On the live unlisted setting it does nothing. Tech stack and skills are copied into a snapshot whenever history is included, with no share flag.
- Preview keeps non-public sites and exact coordinates. The published path filters public sites and rounds coordinates, so preview can look more exact than what will ship.

## Questions to Consider

- If seven imports of Giants Direct are one job, should the ledger collapse them before anyone is asked to enrich a row?
- Should Total Tenure stay once it is clear the number runs from a 2016 flag that is still marked Current?
- On this route, is the map a check that a site landed in the right city, or the thing the screen is about?

---
target: career history
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/skaba/Dev_Projects/resumsify/resumsify/web/src/WorkMap.tsx"
target_fingerprint: "sha256:ae10059a2735b05211ea6621c6222f76511c86f71c73e184201178a6ae0ca667"
target_path: /home/skaba/Dev_Projects/resumsify/resumsify/web/src/WorkMap.tsx
timestamp: 2026-10-22T18-51-53Z
slug: web-src-workmap-tsx
closed: true
---
Method: dual-agent (A: 1a272dcd-3251-41b9-bca6-2e9d7aed833e · B: 166c4022-6c90-4e55-ae07-ab00b4b17d4b)

# Career History critique

Target: `web/src/WorkMap.tsx` (occupant chrome: Career History). Live page: `http://127.0.0.1:5173/#/history`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Opening a role does not move the map or the timeline card; REVOKED is a 11px label. |
| 2 | Match System / Real World | 2 | Identical, UNDERWAY · 2026-10, Role fact v1, and a site labeled 67 are vault mechanics. |
| 3 | User Control and Freedom | 2 | Back, Keep, and Cancel placement work. Add writes a blank role immediately. |
| 4 | Consistency and Standards | 2 | Preview is a word, Publish is an upload icon, Look up is a filled light button, and remove lives in a different mode from edit. |
| 5 | Error Prevention | 2 | Role removal asks first. Remove site does not, and duplicate imports remain separate jobs. |
| 6 | Recognition Rather Than Recall | 2 | Rows are readable. Milestones require a remembered pipe format, and Roles 16 is never reconciled with Jobs (19). |
| 7 | Flexibility and Efficiency | 2 | Search, sort, and Select identical exist. Enrichment is one role and five tabs, with no accelerators. |
| 8 | Aesthetic and Minimalist Design | 2 | The chrome is quiet. Duplicate rows, empty search sections, the timeline card, and map attribution compete. |
| 9 | Error Recovery | 2 | Role-remove copy says what goes with the role. There is no undo, and a failed save has no in-place recovery. |
| 10 | Help and Documentation | 2 | Placement, empty sites, and the publication privacy note explain themselves. Identical, miles, and No pin yet do not. |
| **Total** | | **20/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Career History is authored for Proforna. The first desktop view is a near-black ledger beside real map tiles: identity and home, a gold-ruled stat strip, and full-width rows under Jobs, Internships, and Education. Filled gold is scarce and mostly marks the active Map control. That honors the Gold Is Signal rule, the Career Ledger Row, and Context-Before-Cards.

The instrument breaks when the ledger and the map stop describing the same career. Search for Temple reduced the ledger to one job and the stats to 3 months, 1 role, 0 miles, 1 city, and left the camera on the whole region. Opening Values into Action (Mar 2016 – Jan 2023) left the timeline card on UNDERWAY · 2026-10 · Giants Direct · No pin yet. `DESIGN.md` specifies a side sheet on the right. `WorkMap.tsx` replaces the ledger with `RoleDetailPanel` and leaves the map narrating another decade. Mint Current badges (`#6ee7b7`) and emerald pin rings sit outside the gold ledger. Story placeholders still say “PLC, robotics, vision systems” on a care role.

**Deterministic scan.** CLI `impeccable detect` on the five Career History TSX files exited 0 with `[]`. The live scan on `#/history` found 33 hits the static scan cannot see: 25 `undersized-ui-text`, 4 `clipped-overflow-container`, 4 `gpt-thin-border-wide-shadow`. The detector and the design review agree on the small Current (10), Identical (10), Revoked, and Preview labels, and on `.home` / `.work-map-layout` clipping positioned children. The detector also caught 42px shadows on `section.career-bio` and `aside.work-map-ledger`, which the design system reserves for true overlays.

**False positives.** The two 80px shadows are closed dialogs (`dialog.home-search-dialog`, `dialog.home-settings`). Five 10px strings are Google map chrome (Keyboard shortcuts, Map data, scale, Terms, Report a map error). Map clipping on `.work-map-google` is partly the map viewport doing its job; `.home` clipping the stacked stage on a short window is real.

**Visual overlays.** Injection succeeded in a browser tab titled `[Human]`. Overlays were in the page (68 nodes, 25 visible) when the scan finished. The detector server on port 8400 was stopped afterward; the app on 5173 is still running. If that tab is still open, the highlights are the ones from the scan.

## Overall Impression

The ledger row is the right object, and work sites speak the occupant’s geography. The single biggest opportunity is to make one selection drive the list, the pin, and the month together, including on a phone, where the map is currently clipped off the screen.

## What's Working

- The ledger row stays a row. Organization, title, place, and dates sit on a gold rule. Search rewrote that same pattern and the four stats without turning results into cards.
- Work sites are the vault. Label, kind (Primary, Additional site, Client site, Travel), Look up, coordinates, publication permission, Add site, and Place on map. The empty state tells the occupant to look up an address or place a pin. Placement — “Place this work site. Click its location on the map.” — is the peak of the session.
- Role removal and publication restraint use occupant language. “Remove this role? Its sites and photos on this machine go with it.” Keep sits beside Remove. Publication settings leave exact coordinates unchecked and say private notes stay out of the snapshot.

## Priority Issues

### [P0] The map and the ledger part company

**Why it matters.** Searching, opening a past role, or narrowing the window each leaves geography on a different career than the one in front of the occupant. At 390px the stage starts near y=2437 and `.home` is `overflow: hidden`, so Map, Timeline, and Place on map cannot be reached.

**Fix.** One selection drives the list, the pin, and the month. Refit the camera when the visible set changes. On a narrow viewport, put the map on the first screen and let the page scroll, or use the full-width sheet `DESIGN.md` already specifies.

**Suggested command.** `/impeccable adapt`

### [P1] The career is shown twice, and the stats quietly count once

**Why it matters.** Jobs (19) against Roles 16. Identical badges mark extra Giants, Sharp, Waters, Values into Action, and Delaware County Community College rows. Two Amazon Package Handler rows look the same and are not badged. The timeline treats copies as other open jobs. The Lancaster Giants pin is labeled “67”; the Philadelphia Giants card says “No pin yet.”

**Fix.** Cluster copies into one row, keep the richer record, show the duplicate count on that row, and point Select identical at the cluster. One pin per real site.

**Suggested command.** `/impeccable distill`

### [P1] Add, edit, and remove are not one record

**Why it matters.** Add → Job, Internship, or Education posts a role immediately. The open role can save overview and career evidence separately and has no Remove. Remove appears only after Select, and only as a batch. Edit in that bar stays disabled until exactly one box is checked, even though the row itself opens the role. Media gallery entries have no remove. Remove site deletes immediately.

**Fix.** Add opens the same Story fields as edit and stays unsaved until Save. Put Remove on the open role with the same Keep confirm. Confirm site removal. Give each gallery item the remove the cover photo already has.

**Suggested command.** `/impeccable harden`

### [P1] Publish is a tiny label beside a revoked map

**Why it matters.** The header cluster is REVOKED at 11px, a house icon, a sliders icon, the word Preview, and an upload icon named Publish. The dialog that explains the immutable snapshot hides Save settings under eight sections, Visibility, Target role, and Frame. The ledger behind it stays bright and still in select mode.

**Fix.** Make REVOKED a sentence with one next step. Keep Publish as a labeled control. Pin Save settings to the dialog footer.

**Suggested command.** `/impeccable clarify`

### [P2] Current grows a second, greener map language

**Why it matters.** Current is mint in the row and emerald on the pin. Pins are emoji. Look up is a light filled button beside gold Add site. The timeline card covers the place it is describing, and its month label is clipped against the map line. The live scan also flagged 42px shadows on the bio card and the ledger, which the system reserves for overlays.

**Fix.** Use the gold pin theme’s current ring, draw a small ledger marker, make Look up an outline button, and seat the timeline card where it does not cover the place it names. Drop the ledger shadow to a fine rule.

**Suggested command.** `/impeccable colorize`

## Cognitive load

7 of 8 checks failed. High load.

Grouping held: stats are one strip, rows sit under Jobs, Internships, and Education, and Title/Organization plus Start/End stack on a narrow screen.

Failed: single focus (bio, stats, publish cluster, 19 rows, and the map, or a 2016 form beside a 2026 card); chunking (five editor tabs, a five-control select bar, eight publication sections and six visibility choices); visual hierarchy once Timeline or a role is open; one thing at a time; choices above four at those decision points; working memory across duplicate Giants, Sharp, Waters, and college rows; progressive disclosure (the first view opens every section, and Story stacks overview, linked facts, and evidence in one scroll).

## Emotional journey

Peak is placement: the map becomes the task and the role stays named. The session ends on a form with an empty Place, “Add cover photo” as quiet text, and Save overview below the fold, while the header still says REVOKED. Valleys are the duplicate rows, “Also open” treating copies as concurrent jobs, and “No pin yet” on the card’s featured role. On a phone the first screen ends on another duplicate row. Role removal is the calm high-stakes moment. Publish and geocode are not: the upload icon sits beside REVOKED, and cancelling placement left the camera on a wide mid-Atlantic view. Work-site removal has no confirm.

## Persona Red Flags

**Alex (power user).** No shortcut for search, add, or the next role. Select identical only feeds Remove. Edit in that bar requires exactly one check. Enriching a role is five tabs and two save buttons on Story. Duplicate rows are hand-cleanup. Add inserts a blank role the moment Job is chosen.

**Sam (keyboard and screen reader).** Homes, Settings, Publish, Import, Add, Select, and Hide map are icons with accessible names and no visible text. Story exposes two checkboxes that are both named “Approve for publishing.” “Add cover photo” is a readonly textbox. Map pins did not appear as buttons. Current on the map is a green ring. Earlier month and Later month are the characters ‹ and ›.

**The occupant with a long operational career and real work sites.** Direct Care Provider has an empty Place and “No sites on this role yet,” while the map is still talking about Giants Direct. The Lancaster site’s label is “67” at 235 N Reservoir St. Sharp Packaging’s address is a full geocoder string. Waters is a county, not a plant. The care role’s Story placeholders still describe a plant, PLC, and a line-launch milestone. Miles 112 and Cities 7 cannot explain a multi-site career the list has split into copies.

## Minor Observations

- Searching Temple left Internships (0) and Education (0) expanded under the one hit.
- The header Search and the ledger Search are both on screen. The ledger field is the one that filters roles.
- Delaware County Community College is shown in all capitals beside two Identical associate rows.
- The publication dialog does not dim the ledger. Select-mode checkboxes remain visible along its left edge.
- On the phone, the bio card stays above the editor, and the five tabs fit in one cramped row.
- “Add cover photo” reads as body text under the dates.

## Questions to Consider

- If every Identical copy collapsed into the one richer role, what would Roles 16, Jobs (19), and the pin labeled “67” finally agree on?
- What if choosing a row moved the map to that role’s month and pin before a single form field appeared?
- REVOKED sits beside an upload icon. What would it take for publishing to be impossible to start until that word was a sentence the occupant had to answer?

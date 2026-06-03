1. I need to transfer over the bio crad to the work mapping allowing the user to edit that sectmion before publishing the changes [completed].
2. I need to add a publish/update/push feature that pushes any changes from the work mapping to the IR that way incomplete edits dont show on the IR [completed]
3. I need to find a better wasy to show the user minim requirements as well as the eductation and bio 
4. I should add gallery for the business banner 
5. I should add business info so that the recruiter can get an overview of the company 
6. I should make it editable and allowing the user to show what they want in the work history info section [completed]
7. for the recruiter notes the recruiter should be able to click on things and add it to their notes for talking points/point of interest (This can later help transition over to interview portal) [completed]
8. There should be a question asking the recruiter if they would like to be apart of the user network[completed]
9. I should make it so when you're in the work mapping mode the map goes full screen so it owuld beasically behave and look like the IR but revert back when job seeking [completed]

10. Pin → Vector Outline swap at high zoom (z >= 16): when the user is focused on a job and zoomed in past z16, hide the focused item's pin and let the building outline take over as the visual marker. The polygon already mirrors the recency color and sits exactly on the building, so the pin becomes redundant and competes for attention. Only hide the pin if a footprint actually rendered (fallback safety for addresses with no OSM building). Add a hover effect on the polygon (stroke 3→4, fillOpacity 0.25→0.35). Other (non-focused) pins stay visible to preserve at-a-glance career context. Apply to both IR (resume-immersive-map.tsx) and the work-mapping editor (job-map.tsx). Skip InfoWindow on the polygon since the focus card on the right already shows full details. Polygon hover also shows the same rich tooltip card as the pin (cover image + company + title + tenure). [completed]

11. At some point I have to add feature that notfies you/ the recruiter that the company you worked for closed [completed]
12. We should implement a global search [completed]
13. At some point we need to implement a guide to help recruiters understand what and IR is and how to navigate it

14. **Recruiter Search & JD Match (in IR)** — As an IR grows dense over a career, recruiters won't read the whole thing. Build a recruiter-facing search/match layer on the public IR so they can find what they need in seconds.

    **Phase A — Recruiter Search Bar (in IR):** Floating search input on the public IR (top-right pill or `Ctrl/Cmd+K`). Type a keyword (e.g. "kubernetes") → instantly see grouped results across the candidate's data:
    - Skills (with proficiency + years)
    - Work history positions (title, company, dates)
    - Position descriptions / responsibilities / accomplishments
    - Projects
    - Education / certifications
    - Career events / milestones
    - Industries / occupations tagged

    Each result is clickable → flies the map to that position / opens the relevant panel. Server-side Postgres `ILIKE` for v1 — no AI cost, instant. Decide which fields stay locked behind contact-unlock. [completed]

    **Phase B — Paste-a-JD Match (the headline feature):** "Match this job" button in Recruit Mode. Recruiter pastes a job description, we:
    1. Extract keywords/required skills from the JD (regex + skills dictionary, or lightweight LLM call)
    2. Cross-reference against the candidate's IR data (reuses Phase A index)
    3. Show a structured match report:
       - Match score (e.g. 78%)
       - Strong matches — skills/experience clearly present, with evidence links into the IR
       - Partial matches — adjacent skills or older experience
       - Gaps — JD requirements with no IR evidence
       - Bonus — relevant strengths not in the JD

    This is the **"don't make me read the whole IR"** feature — directly addresses the dense-IR problem.

    **Phase C — Ask-a-Question (LLM, later):** Chat box on the IR — "Has she ever managed budgets over $1M?" → grounded answer with citations into the IR. Adds AI infra/cost; defer until A + B prove value.

    Build order: A → B → C. Skip life anchors / residence history from the searchable index (not recruiter-relevant).


15. I need t make it easier to add more location for the vector outline to automatically detect and outline building/ addresses to make picking building much easier
16. For the sub location outline on hover cusomization on hover effect I want the user to be able to right click the outline and be able to edit it which also includes changing the color. [completed]

17. I need to set up it so the user can choose the order of the photos for a patricular tool with multi photos the tools and inventory [completed]
18. When viewing the photos the user should be able to zoom in and do other things with the photo [completed]

19. **Daily Worklog (private journal → curated IR highlights)** — A private, low-friction daily log designed around the reality that most workdays are repetitive. Goal: capture quiet daily presence so it can later become evidence-backed accomplishments on the IR, without ever auto-publishing raw entries.

    **Core principle — design for redundancy, not against it.** 80% of days are routine; the product must make those take ~5 seconds and only ask for effort when something is genuinely notable. Redundancy becomes the *proof* (47 days using a tool = strong evidence of recurring competency), not noise to fight.

    **Phase A — Capture (private, no AI):** ✅ **SHIPPED**
    - ✅ `WorkLog` model: date, optional title/body, optional links to `WorkHistory` / `PersonalEquipment` / `JobAsset` / tags, `isNotable` flag, `accomplishment` flag, mood, hours, `visibility=PRIVATE` default.
    - ✅ `WorkLogTemplate` model: user-defined "day types" with default category, position, tags, equipment, assets.
    - ✅ "Copy last entry" + "Apply template" + "Start blank" entry creation.
    - ✅ Day-grouped timeline view, filters (job, category, notable).
    - ✅ New route `/worklog`.
    - ✅ Two-picker UX: **Tools used** (`PersonalEquipment` — what you brought) + **Worked on** (`JobAsset` — machines/units/vehicles you serviced). Both with inline create + edit modal.
    - ✅ `JobAsset` model + dedicated `/job-assets` browse page with status/type/job filters and detail modal showing service history.
    - ✅ Service history feed component (`AssetServiceHistory`) — auto-built from worklog entries that touched an asset.
    - ✅ Floating quick-add button on every page (Shift+L shortcut, template chip picker, optional notable toggle, Enter-to-save).
    - ✅ Reuse global search (#12) — `Worklogs` group in the `Cmd+K` palette, scoped to owner only via `WHERE userId = current` in `/api/search`. Click a result → `/worklog?focus=<id>` clears filters, scrolls + highlights the row.
    - ✅ Optional photos on entries (max 6, 5 MB each, thumbnails on timeline + uploader in editor).
    - ✅ Streak heatmap on `/worklog` (last 12 weeks GitHub-style, click a cell to filter to that day, current-streak counter).
    - ✅ Roll-ups for routine days ("Mar 1–28: 21 standard days at Acme") — runs of 3+ consecutive days with the same position, no notable/photo entries, ≤2 entries each, collapse into a single dashed `RoutineRollup` card on `/worklog` timeline; expand to reveal individual `DayView`s.

    **Phase B — Implicit logging (reduce typing further):** 🚧 In progress
    - ✅ Photo upload to a tool → infer "used today" — `ensureAutoLog()` in `src/lib/auto-log.ts`, called from `/api/personal-equipment/photos` POST. One auto entry per user per day, merges equipment IDs, never overwrites user-authored rows.
    - ✅ Photo upload to a job asset → infer "worked on it today" — same helper, called from `/api/job-assets/photos` POST. Inherits the asset's `positionId` if no position is set yet.
    - ✅ "Auto" badge on `/worklog` rows for `isAutoGenerated` entries (sky-tinted, with tooltip). Auto rows are excluded from `RoutineRollup` so they remain visible for the user to confirm/expand.
    - ⬜ Map drawings / location pings → infer site visits
    - ✅ Calendar (.ics URL) integration → on-demand sync pulls last 90 days of events into auto-entries (title, description, hours, dedupe by VEVENT.UID). Settings UI at `/integrations`, helper extended in `src/lib/auto-log.ts` with `externalRef` for stable per-event dedupe.
    - ✅ GitHub public events integration → on-demand sync pulls PushEvent / PullRequestEvent / IssuesEvent / ReleaseEvent for a username, dedupes by `event.id`, marks merged PRs / releases as `isNotable`. Same `/integrations` settings page.
    - 🆕 Schema: `WorkLog.externalSource` + `WorkLog.externalId` + composite unique `[userId, externalSource, externalId]`; new `IntegrationConnection` model (provider, label, config, lastSyncedAt, lastSyncStatus, lastSyncCount, enabled).
    - ⬜ Later: file-upload integrations, OAuth-based private GitHub / Google Calendar / Microsoft Graph for unattended sync.

    **Phase B add-on — Unified Career Analytics cockpit:** ✅ Shipped
    - Single scrolling page at `/career-growth` with sticky left-rail nav (mobile = horizontal pills) and 7 sections: Snapshot · Activity · Evidence · Direction · Income · Goals · Job Search.
    - One aggregator endpoint `/api/career-analytics` runs 13 concurrent Prisma queries (Promise.all) and returns everything in one round-trip; React Query key `["career-analytics"]`, 60s stale time.
    - Native sections (Snapshot KPIs, Activity weekly bars + source-mix + top positions/assets/tools, Evidence cards, Job Search funnel) render directly from the aggregator. Direction/Income/Goals embed existing `CareerDirectionModel`, `CareerModelPage`, `GoalsPage` for zero regression.
    - Cross-link banners (`<CareerAnalyticsBanner>`) added to `/analytics`, `/skill-graph`, `/worklog` so deep-dive pages link back into the relevant cockpit section via `#section-<id>` anchors.

    **Phase C — Pattern surfacing (lightweight aggregation, no AI):** ⬜ Not started
    - "You logged 47 days using the CNC router" → suggest adding as Skill with evidence count
    - "12 client-site visits in Q2" → suggest as bullet on the relevant position
    - "Serviced Compressor C-204 18 times" → suggest as asset-mastery indicator
    - First-time-doing-X → suggest as milestone CareerEvent
    - Per-job, per-tool, and per-asset stats pages (depth-of-work signals)
    - **Partial groundwork done**: `AssetServiceHistory` already shows visit count + total hours + last-visit recency for each JobAsset.

    **Phase D — Selective IR Promotion (the trust loop):** ⬜ Not started
    - Promotion is **always explicit, one item at a time** (entry OR pattern). Never batch. Never automatic.
    - Promotion creates a sanitized derivative (resume bullet / `CareerEvent` / Skill evidence link); raw worklog stays private.
    - **Schema groundwork already in place**: `WorkLog.promotedToCareerEventId` field exists.
    - Recruiters never see worklogs directly — only the polished IR content, with an optional "evidence count" indicator (gated like #14 contact-unlock).

    **Phase E — AI Summarization (last, opt-in, feature-flagged):** ⬜ Not started
    - "Draft accomplishments for this position" → LLM converts raw entries in date range into 3–5 bullets with source citations.
    - "Year in review" annual summary.
    - Ask-your-log chat (mirrors #14 Phase C).
    - Each AI feature requires explicit opt-in with disclosure that text is sent to the model provider.

    **Privacy / compliance guardrails (day one):**
    - ✅ Default `PRIVATE`, all queries scoped by `userId`.
    - ⬜ Export + delete-all in account settings (GDPR/CCPA hygiene).
    - ⬜ No batch visibility change UI yet (currently only single-entry edits exist, which is fine).
    - Map is downgraded to *one view among many*, not the primary surface — worklog is timeline-first, not map-first.

    Build order: A → B → C → D → E. Iterate based on actual usage before committing to AI cost.

    **Placement in app:**
    - ✅ Primary: top-level `/worklog` route — daily-ritual surface with day-grouped timeline, filters, templates.
    - ✅ Top-level `/job-assets` route — browse all assets with embedded service history per asset.
    - ✅ Floating quick-add `+` button on every page (template picker + optional notable line, save in ~5s).
    - ✅ Embedded "Worklog" tab on each WorkHistory position page (`/experience/[id]` + `/current-position`): position-scoped entries, streak/notable stats, mini 6-week activity strip, day-grouped list with photo thumbnails, "Add entry" deep-links to `/worklog?new=1&positionId=...`, "Open full worklog" pre-filters via `?focusPosition=...`, Phase D promotion banner reserved for notable rows.
    - ✅ Embedded "Used in" feed on each PersonalEquipment item (with one-tap "Used today") — `EquipmentUsageHistory` mounted in the inventory item viewer modal; shows uses/hours/notable/last-used stats + day-grouped log list with deep-link to `/worklog?focus=<id>`. Adds `?focusEquipment=<id>` deep-link on `/worklog` (filters timeline + clearable chip showing tool name).
    - ⬜ Read-only "What you did here" timeline on Company page (#5) once that exists.
    - NEVER on the public IR — only promoted/sanitized derivatives appear there.

    **Phase A polish backlog (small wins):**
    - ✅ Photos on `JobAsset` (mirror `PersonalEquipment` photos) — new `JobAssetPhoto` model, `/api/job-assets/photos` (GET/POST/PATCH/PUT/DELETE), `JobAssetPhotos` uploader (max 6 × 5MB), cover badge on `/job-assets` cards, thumbnail in worklog asset chips.
    - ✅ Asset filter chips on worklog timeline — `filterAssetId` filters `WorkLog.assetIds`, secondary chip with cover thumb, deep-link `?focusAsset=<id>` (mirrors `?focusEquipment`), included in Clear-all + focus reset.
    - ⬜ Per-asset "next service due" reminder.
    - ⬜ Customer/site rollup view (group assets by `customerName`).
    - ⬜ Asset filter chips on the worklog timeline (filter timeline by asset/asset-type alongside existing date/category filters).

*** Dasboard Updates ***
1. The pay calendar needs to change to a regular calendar that can link to other calendars 
2. I got to look into the recent activity card and might have to repurpose it
3. The income growth card is so big with little data 
4. 



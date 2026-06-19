# 0035 — Editor as Canonical Event Surface (Photos Parity)

- **Status:** Proposed
- **Date:** 2026-06-19
- **Deciders:** sory
- **Tags:** frontend, data, ux
- **Chains to:** ADR-0027 (CareerEvent + Q2=B anchored/free-floating route split), ADR-0033 (dialog-first creation), ADR-0034 (inline editor + Properties rail)

## Context and Problem Statement

ADR-0034 promoted `CareerEvent` editing onto its own inline surface (`/worklog/events/{new,[id]}`) with a single Properties rail, but **photos were not in scope**. Photos on events lived only on the legacy `job-map.tsx` Photo Modal flow — a relic of the pre-ADR-0034 dialog era. The user discovered the gap in production by trying to add photos to the "Black Line Dinner" event from the editor and finding no affordance.

A bug report ("the photos didn't seem to take") triggered an investigation that surfaced two related architectural questions that ADR-0034 left implicit:

1. **Where do event photos live?** The editor (single surface, parity with notes) or the map (status quo)?
2. **Does the photos endpoint follow the ADR-0027 Q2=B split?** Today only the anchored route exists (`/api/work-history/[id]/events/[eventId]/photos`); free-floating events have no photo endpoint at all because the map surface only photographs anchored events. The editor needs both.

The user's stated intent: *"I do prefer that the editor becomes the canonical because it means everything can be done from one single place."*

This ADR formalizes two decisions that landed inline with the implementation (commit `2227382`) so the precedent is captured, not buried in commit history.

## Decision Drivers

- **Surface consistency** — ADR-0034 committed events to the inline-editor + Properties rail pattern. Leaving photos on the map breaks that contract.
- **Single source of truth** — two surfaces editing the same resource invites drift, dead code, and "which one is canonical" confusion.
- **Symmetry with the anchored/free-floating split** — ADR-0027 Q2=B locked `/api/events/[eventId]/*` to strictly free-floating and `/api/work-history/[id]/events/[eventId]/*` to anchored. Photos should mirror that, not invent a third shape.
- **Cost** — both decisions are cheap to land but expensive to reverse: an editor-canonical surface that later moves back to the map drags every callsite; a unified photos endpoint that later splits would require renaming files mid-flight.

## Considered Options

### Decision 1 — Where do event photos live?

- **Option A — Editor is canonical** ⭐ — `event-photos-section.tsx` mounts on the editor (Photos rail tab at xl+, inline section at <xl). Legacy map photo modal becomes the secondary surface and is a candidate for retirement.
- **Option B — Status quo (map only)** — keep photos on `job-map.tsx`'s Photo Modal; editor has no photo affordance. User's bug report stays unresolved.
- **Option C — Both surfaces equal** — duplicate the photos UI on both the editor and the map. Maintain in two places forever.

### Decision 2 — Photos route shape

- **Option A — Mirror ADR-0027 Q2=B split** ⭐ — create `POST/GET/DELETE /api/events/[eventId]/photos` for free-floating, keep `/api/work-history/[id]/events/[eventId]/photos` for anchored. Editor picks via the existing `eventPatchUrl` helper pattern.
- **Option B — Unified `/api/event-photos/[eventId]`** — break the Q2=B convention for photos specifically; one endpoint regardless of anchoring.
- **Option C — Widen the anchored endpoint** — accept anchored OR free-floating on `/api/work-history/[id]/events/[eventId]/photos` by making `workHistoryId` lookup optional. Re-opens the Q2=B settled decision.

## Decision Outcome

**Decision 1: Option A — editor is canonical.**

**Decision 2: Option A — mirror ADR-0027 Q2=B split.**

Both align the photos sub-resource with the same architectural patterns already settled for the parent `CareerEvent` resource. The editor becomes the user's only entry point for photo management; the route convention stays consistent.

### Positive Consequences

1. **Single source of truth for event photo UX.** The user's mental model collapses to "the editor is where I do event things." No "wait, do I add photos on the map or in the editor?" friction.
2. **Route convention preserved.** Future event sub-resources (notes? attachments? annotations?) inherit the Q2=B split with zero re-litigation.
3. **`eventPhotosUrl({id, workHistoryId})` helper** parallels existing `eventPatchUrl` — a tiny dual-mode resolver that the editor uses without knowing or caring about the anchoring split.
4. **`event-photos-section.tsx` dual-mode component** unifies the gallery shell across the draft (`null` id, queue-and-flush from `File[]`) and persisted (real id, server-backed) cases. Both render the same `Thumb` + `ThumbGrid` chrome.
5. **Properties rail extended cleanly from 1 tab to N tabs.** `worklog-event-editor-rail.tsx` now takes a `tabs: RailTab[]` array instead of a hardcoded single tab, opening the door for future rail content (Linked Notes? Activity?) without another shell rewrite.
6. **Legacy map photo modal retirement is now tractable.** It was implicit dead weight; this ADR makes it explicit and a future-cleanup candidate.

### Negative Consequences

1. **Two photo surfaces transiently.** The map's Photo Modal still works for anchored events; nothing in `job-map.tsx` was deleted in `2227382`. Removing it is a separate cleanup commit pending a verify pass that no other callsite depends on it. **Tech debt acknowledged here.**
2. **Photo route surface doubled.** `/api/work-history/[id]/events/[eventId]/photos` and `/api/events/[eventId]/photos` share ~80% of their logic (multipart parse, ownership check, fs write, `CareerEventPhoto` create). A future refactor could extract a `handleEventPhotosRequest(eventId, ownerCheckFn)` helper; not done in `2227382` to minimize blast radius.
3. **Focal/zoom/rotation/flip render but don't edit.** The `CareerEventPhoto` schema has `focalX/focalY/zoom/rotation/flipH/flipV` fields and the `<Thumb>` component honors them visually, but the editor has no UI to set them. Parked under "Worklog Events — narrow follow-ups" as future polish; no re-entry trigger yet.
4. **No bulk operations.** No bulk-delete, no bulk-reorder, no drag-to-reorder. Single-add and single-remove only. Matches v1 simplicity bar.

## Pros and Cons of the Options

### Decision 1

#### A — Editor canonical

- ✅ Surface consistency with ADR-0034
- ✅ Single mental model for users
- ✅ Map can be retired without UX loss
- ❌ Leaves the legacy map modal as transient dead code

#### B — Map only (status quo)

- ✅ Zero new code
- ❌ User's bug report stays unfixed
- ❌ Perpetuates the surface-shape inconsistency ADR-0034 was designed to eliminate
- ❌ Map modal lives on an anchored-only path; free-floating events have no photo surface

#### C — Both equal

- ✅ "Always there" wherever the user is
- ❌ Permanent dual maintenance
- ❌ State synchronization across two surfaces invites drift
- ❌ Doubles the test matrix forever

### Decision 2

#### A — Mirror Q2=B split

- ✅ Convention consistency — no special-case for photos
- ✅ Route paths are self-documenting about anchoring
- ✅ Each handler has narrow ownership semantics (one filters `workHistoryId: null`, the other looks up via the parent)
- ❌ ~80% logic duplication (acknowledged tech debt, refactor when a third sub-resource lands)

#### B — Unified `/api/event-photos/[eventId]`

- ✅ One handler, less duplication
- ❌ Breaks Q2=B for photos specifically — future maintainers ask "why are photos different?"
- ❌ Breaks Q2=B for photos specifically — future maintainers ask "why are photos different?"
- ❌ Ownership logic gets a branch (`workHistoryId === null ? freeFloatingCheck : anchoredCheck`) — same complexity, now hidden

#### C — Widen anchored endpoint

- ✅ One handler
- ❌ Re-opens ADR-0027 Q2=B (settled at A-grade specificity)
- ❌ Route name becomes a lie (`/api/work-history/[id]/events/...` accepting events with no work history)

## Implementation Plan (units — already landed)

| # | Unit | File | Status |
| --- | --- | --- | --- |
| 1 | Test-first API spec (RED) | `src/app/api/events/[eventId]/photos/route.test.ts` (17 tests) | ✅ shipped in `2227382` |
| 2 | Free-floating photos route (GREEN) | `src/app/api/events/[eventId]/photos/route.ts` | ✅ shipped in `2227382` |
| 3 | Dual-mode URL helper | `src/components/worklog/events/event-patch-url.ts` (added `eventPhotosUrl`) | ✅ shipped in `2227382` |
| 4 | Dual-mode photos section | `src/components/worklog/events/event-photos-section.tsx` (468 LOC) | ✅ shipped in `2227382` |
| 5 | Multi-tab rail refactor | `src/components/worklog/events/worklog-event-editor-rail.tsx` (1 tab → N tabs) | ✅ shipped in `2227382` |
| 6 | Editor wire-up (queue-and-flush for drafts) | `src/components/worklog/events/worklog-event-editor.tsx` | ✅ shipped in `2227382` |
| 7 | This ADR | `docs/adr/0035-event-editor-canonical-photos-surface.md` | ✅ this commit |
| 8 | parked-ideas closure | `/memories/repo/parked-ideas.md` (Photo strategy line) | ✅ already done |

### Out of scope (deliberately deferred)

- **Retiring the map Photo Modal.** `job-map.tsx` still mounts its own photo affordance for anchored events. Removing it requires a verify pass on every callsite that uses the modal. Separate small commit when the user confirms no map-side workflow depends on it.
- **Photo focal/zoom/rotation/flip editing UI.** Schema + render done; control surface deferred.
- **Logic extraction across the two photos routes.** Refactor candidate when a third event sub-resource lands.

## Verification (already complete)

- 17/17 vitest cases on the new route (GET/POST/DELETE × auth/ownership/validation paths).
- 831/831 full suite passing.
- Browser smoke confirmed: 3 photos render in rail (2 new uploads + 1 pre-existing orphan whose file is genuinely missing on disk — separate data issue, not a feature bug).
- Post-Edit Scan clean on all 4 modified files.

## Lessons Captured

- **Next.js 16 + Turbopack image optimizer** returns 400 for `/public/uploads/*` paths even when the file exists. Re-applied the `unoptimized` lesson from user memory ("Next.js 16 + Turbopack Image Optimizer" note) to the new `<Image>` callsites in `<Thumb>`. **Rule: any `<Image src="/uploads/...">` callsite must set `unoptimized` always, not conditionally.**
- **Photo records can outlive their files.** A May 13 orphan row pointed to a file that no longer existed on disk (likely OneDrive sync collision or external cleanup). The new route's DELETE handler does `fs.unlink` best-effort — i.e. ignores ENOENT — so trash-clicks on orphans cleanly remove the DB row without erroring. Pattern worth keeping consistent across all file-backed resources.

## Links / References

- [ADR-0027 — Worklog Events](./0027-worklog-events.md) — Q1=A immutability, Q2=B route split.
- [ADR-0033 — Event-create no map detour](./0033-event-create-no-map-detour.md) — dialog-first creation.
- [ADR-0034 — Worklog Events on the Notes Surface](./0034-worklog-events-inline-editor.md) — inline editor + Properties rail.
- Commit [`2227382`](https://github.com/SoryAK/Resumsify/commit/2227382) — the implementation this ADR formalizes.
- User memory note: "Next.js 16 + Turbopack Image Optimizer" — the `unoptimized` fix.

## Cleanup Audit — 2026-06-19

The ADR's Positive Consequence #6 ("Legacy map photo modal retirement is now tractable") and Negative Consequence #1 ("Two photo surfaces transiently") were investigated on 2026-06-19 in preparation for the retirement cleanup commit.

**Finding: the legacy event Photo Modal does not exist.** The flag was based on a misread of the map code.

What's actually in [src/components/job-map.tsx](src/components/job-map.tsx) (14,302 LOC wrapper) and its dynamic child [src/components/job-map-google.tsx](src/components/job-map-google.tsx) (1,994 LOC renderer):

1. **`GalleryModal` mounted on line 11070** is a **position-level fullscreen photo lightbox** for `WorkHistoryPosition.galleryPhotos`. All 10 `setGalleryModalIdx(...)` callsites (lines 9089, 10890, 10968, 11037, 11043, 14106, 14180, 14215, 14221) source from `matchedPosition?.galleryPhotos` — completely unrelated to `CareerEventPhoto`. Zero imports of `CareerEventPhoto`, `/api/events/[id]/photos`, or the editor surface in either map file.
2. **The actual event-photo touch on the map** is a single inline `<img>` thumbnail baked into each event marker's InfoWindow HTML at [job-map-google.tsx](src/components/job-map-google.tsx#L880-L885) — a 180×80 preview, not a modal, not a CRUD surface. Healthy and intentional.

**Conclusion: no code change required.**

- The "legacy map photo modal" retirement candidate is closed (it was a phantom; the real `GalleryModal` is the position-level lightbox, which stays).
- The "two photo surfaces transiently" tech debt in Negative Consequence #1 is retracted — there is exactly one event-photo surface (the editor) plus a passive marker-thumbnail preview, not two competing modals.
- ADR-0035's two core decisions (Decision 1 Option A — editor canonical; Decision 2 Option A — Q2=B route split) remain accepted and unchanged.

**Sole live consequence**: when ADR-0035 advances from `Proposed` to `Accepted`, scrub the three mentions of "legacy map photo modal" / "two photo surfaces transiently" from Decision 1 Option A description, Positive Consequence #6, and Negative Consequence #1. Done as a doc-only pass; no source change.

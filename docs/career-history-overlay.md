# Career History overlay

The reserved Work Map (`#/history-reserve`, `web/src/WorkMap.tsx`) laid a ledger column over a full-bleed map. A timeline and an action dock sat on that map. The live Career History sheet does not use this layout. This note keeps the timeline, which is the part of that overlay still worth bringing into the sheet, and the other pieces that made the overlay distinct.

The month model remains in `core/career-timeline.ts`, with `core/career-timeline.test.ts`.

## Layout

`.work-map-layout` was a block with a black ground. The map stage was absolutely positioned inside it (`inset: 0.75rem`, 16px radius). The float column — profile, overview, then the ledger or the open role — was absolutely positioned on top of the map: top, bottom, and left at 1.75rem, width `min(24rem, 38vw)`, z-index 3, and it scrolled on its own.

Under 760px both pieces became relative and stacked. The map kept a height of 55vh with a minimum of 18rem.

## Timeline

Timeline was a second map mode. Map showed every visible role. Timeline walked the career one month at a time and revealed roles as their start month arrived.

### What a month knew

`core/career-timeline.ts` turns the ledger into months and moments.

- A role becomes a `CareerTimelineRole`: id, title, organization, place, start, end, current flag, whether it has a pin, milestones, and events.
- A residence becomes a `CareerTimelineResidence`: id, label, address, start, end, and whether it has a pin.
- `careerMonth` reads a `YYYY-MM` prefix. `careerMonths` lists every month from one month through another.
- `careerMoments` builds the moments: a role start (`started`), each milestone, each event, and each pinned residence move (`moved`). Moments sort by month, then role, then id.
- `careerSpan` is every month from the earliest role or moment through the latest date or the current month.
- `rolesStartedBy` keeps roles whose start month is on or before the scrubber month, so a later role has not appeared yet.
- `rolesActiveAt` keeps roles that have started and have not ended, including a current role.
- `residenceAt` is the home whose dates cover the month, preferring the latest start.
- `nextCareerMoment` is the next moment after the shown month. Play advances to that moment.
- `careerFrame` reads one month and returns the tone, the lead role, the other open roles, the moment, an earlier role when nothing is open, and the home.

Tone is `moment` when something happens that month, `underway` when a role is open and nothing is dated to the month, and `between` when the month sits after a role has ended and nothing new has started. The lead is the selected role when that role is active, otherwise the role whose moment falls in the month, otherwise the active role with the latest start.

### What the occupant saw

`CareerTimelineScrubber` drew two pieces on the map.

A draggable card stated the frame:

- A move named the home, then the role underway or the earlier role.
- A start, milestone, or event named the organization or the moment title, the role title, the place, other open roles, and the home.
- An open month with no moment said “Underway” and named the lead role.
- A gap said “Between roles” and named the previous organization, or “No role this month”.

The lead role’s moments were buttons. Each button jumped to that moment’s month.

A bar along the bottom held Earlier, a range input named Month, Later, and Play / Pause. Earlier and Later stepped one month. Holding one repeated: a 280ms pause, then a step every 70ms. Arrow Left and Arrow Right changed the month unless focus was in a field. The card could be dragged inside the map and stayed inside the stage.

### How it connected

The reserved Work Map built timeline roles from the roles the ledger was showing, and timeline residences from every home. While Timeline was on and the occupant was not placing a pin:

- The map showed only roles returned by `rolesStartedBy` for the shown month.
- The camera fit key included that month, so the map refit as the month changed.
- The home pin was the residence active that month. A home without a pin was omitted. With no dated home, the pin fell back to residences that have no start month.
- The empty-map prompt was suppressed, because an early month can legitimately show no roles yet.

Choosing a month selected that frame’s lead role. A month between roles cleared the selection and stopped Play. Choosing a role set the month to that role’s start, or to a month passed in with the selection, and stopped Play. A search that narrowed the ledger to one role selected it and moved the month to its start.

Play ran every 900ms. Each tick took `nextCareerMoment`, framed that month, and selected the lead. At the last moment, Play stopped. If the upcoming month had no lead, Play stopped, showed that month, and cleared the selection. Pressing Play when there was no upcoming moment jumped to the first moment and kept going.

Entering Timeline framed the current month and selected its lead. Placing a pin left Timeline and returned to the ordinary map. The timeline card sat above the action dock (bottom 4.6rem while the dock was open, 2.15rem when the dock was collapsed) and its horizontal padding cleared the float column.

## Action dock

A bar along the bottom of the map, starting to the right of the float column (`left: calc(min(24rem, 38vw) + 1rem)`). It held Publish or Update, with a confirm menu, Revoke when a snapshot was published, Preview in this window or a new window, Map, and Timeline. A handle dragged down past 28px collapsed the bar. A drag up past 28px expanded it. A click on the handle toggled it. Collapsing closed the publish and preview menus. A minimized role canvas docked into a slot in the bar.

The ledger and the profile already show publication status on their own. Publish and preview for the live sheet live with that sheet, not on this dock.

## What to bring forward

The month model, the four moment kinds, the three frame tones, and the way the map revealed roles as the month advanced are the behavior to keep. The overlay positioning, the scrubber, and the action dock are the layout that came off the reserved Work Map.

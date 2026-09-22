# Agent authority

Agents operate inside explicit capability grants. Their default output is a
proposal, not a mutation or external side effect.

Occupants talk to **one Proforna**, not named specialist bots. Specialist
workflows are Agent Run **purposes** (inspect, extract-facts, suggest-reply,
command), never chrome, pickers, or separate assistants.

## Shipped cut (GitHub #49)

The governed-agency epic is **done**. Do not reopen it as unfinished work.
Closed stack: #50 Notice destinations, #51 Contact conversations, #52 Keep in
My Network, #58 Agency.run, #60 extract-facts, #62 suggest-reply, #63 Home
command sessions.

What that means in the product:

- Proforna proposes; Change Sets and Notices carry review.
- Direct messages live on a Contact; My Network is that list.
- A cloud model still needs an explicit grant before vault text may leave.
- Follow-ups belong in **new** issues, not by treating #49 as open.

## May act without per-action approval

- Read local data within the declared run scope
- Search, classify, summarize, compare, and calculate
- Capture imported material into a noncanonical inbox
- Extract candidate facts and link supporting evidence
- Draft goals, plans, tasks, outreach, resume revisions, Work Map enrichment,
  and publication settings
- Render local previews
- Report contradictions, missing evidence, and stale information
- Record the agent run and its proposals

## Requires exact approval

- Create, supersede, merge, or delete canonical career facts
- Change goal, opportunity, application, plan, or task state
- Publish a Work Map snapshot or revoke its interactive projection
- Send a message, submit an application, schedule an event, or upload a file
- Expand an audience, disclosure allowlist, retention period, or relay grant
- Share private data with a remote model outside an active capability grant

## Approval contract

An approval is valid only for the hash of one change set and records its
occupant, action, destination, expiry, and approver. Changing any bound value
invalidates it. External adapters must use an idempotency key and record an
audit event whether the action succeeds or fails.

A direct occupant command may authorize its immediate mutation, but the
result still produces the same change-set and audit records.

# Agent authority

Agents operate inside explicit capability grants. Their default output is a
proposal, not a mutation or external side effect.

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

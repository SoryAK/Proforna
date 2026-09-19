# 0002 — Local career vault with a projection-only publishing relay

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Sory Kaba
- **Tags:** privacy, distribution, publishing, agents

## Context

Proforna must let an occupant use private evidence and agent assistance while
still publishing an interactive resume. Hosting the whole career database
would make public presentation easy, but would turn the relay into a second
authority and expose substantially more private data than publication needs.
Self-hosting every public page would preserve privacy but make reliable,
shareable resumes depend on the occupant's machine being online.

## Decision

- SQLite and local uploads form the authoritative **Career Vault**.
- Agents run against scoped vault data and produce proposals by default.
- The private **Work Map** is the rich authoring surface for work history,
  geography, milestones, work conditions, equipment, media, and reflections.
- Publication freezes the current Work Map into an immutable **Interactive
  Projection** with an explicit disclosure allowlist and redaction policy.
  Resume revisions are separate editorial outputs and are not publication
  sources.
- A separately deployable relay stores only projections, access grants,
  revocation state, inbound contact requests, and privacy-minimized events.
- The relay cannot query, sync, or reconstruct the Career Vault.
- Updating public content creates a new projection; revocation blocks future
  relay access but cannot retract copies already made by viewers.

## Consequences

- Private management continues to work offline.
- Public pages remain available when the local machine is offline.
- Publication and external actions require explicit, auditable approval.
- Relay deployment is optional for occupants who never publish.
- Projection schemas require compatibility and migration discipline.
- Rich private evidence cannot be fetched lazily from a public page.

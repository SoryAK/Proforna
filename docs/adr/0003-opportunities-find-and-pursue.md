# 0003 — Opportunities finds and pursues on the career map

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** Sory Kaba
- **Tags:** product, opportunities, maps, sources

## Context

The previous app kept job search on its own map and applications in a
separate tracker. Proforna already has an Opportunity for a role, project,
speaking event, or connection, and already has one geographic map for career
history. A second map, a hardcoded listing site, or a judgment against a
saved resume would split that record. A resume file also goes stale as soon
as the career record moves.

## Decision

- The surface stays **Opportunities**. It is where the occupant finds a
  possibility and pursues it. "Job search" only names the map. "Applications"
  only names the tracker.
- Opportunities reuses the career map. Listings and life anchors are pins
  beside roles and home. There is no second map.
- A listing the occupant keeps becomes an Opportunity. Project, speaking, and
  connection stay in scope.
- A **Job Source** is added by name. An application id and an API key are
  optional and stay in the Career Vault. Adzuna is not a built-in control.
  Search reads a source named Adzuna. Any other name is kept until Proforna
  can read that place.
- A fit judgment reads the live career record, and only the sections the
  occupant leaves checked. A stored resume file is not one of those sections.
- A **Life Anchor** is a named, weighted place on that same map. Its score is
  weighted straight-line distance. Driving routes and a sweet-spot circle are
  out of this cut.
- A company careers page can be saved for later reading. Crawling it,
  extracting a posting, and proposing an Opportunity are later work. Creating
  an Opportunity still requires the occupant.

## Consequences

- Opportunities and Career History share one map.
- Listing credentials live in the vault, with the map key.
- A source Proforna cannot read yet is still valid configuration.
- Commute geometry and company-site crawl are later work, not gaps in this
  decision.

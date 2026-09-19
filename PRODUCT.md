# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People managing an evolving career record, including workers with detailed
technical, operational, and location-based experience. Recruiters and trusted
viewers are secondary audiences for occupant-approved publications.

## Product Purpose

Proforna helps an occupant capture, understand, plan, and selectively present
their career. Success means the occupant owns a detailed, evidence-backed
career record and can turn its current approved state into useful resumes and
interactive public views without surrendering the private source.

## Positioning

The private Work Map is the career-history authoring source. Publishing freezes
an explicitly redacted snapshot for a separate relay; it does not expose or
synchronize the vault. Resume revisions are separate editorial outputs.

## Operating Context

Occupants import career history, enrich roles over time, record achievements
and evidence, map work sites, review career patterns, create resume variants,
track opportunities, and publish selected Work Map detail. The product is
local-first and must remain useful when the publishing relay is unavailable.

## Capabilities and Constraints

- `core/` owns career management policy; Hono routes and React screens are
  adapters.
- SQLite and local files form the authoritative private Career Vault.
- Work Map roles may include geography, milestones, events, media, work
  conditions, equipment, growth, and departure reflections.
- Compensation, private notes, and unapproved locations or media never enter
  public snapshots.
- Significant mutations and external actions use explicit approvals and audit
  records.
- Public access may be public, unlisted, access controlled, stealth,
  anonymous, expiring, or revoked.
- The entire local vault must remain portable.

## Brand Commitments

The product name is Proforna. Product language is direct, private by default,
and specific about what leaves the vault.

## Evidence on Hand

The repository contains the working product, domain glossary in `CONTEXT.md`,
architecture decisions in `docs/adr/`, the capability parity record in
`docs/capability-parity.md`, and automated domain/HTTP tests. It contains no
approved testimonials, customer claims, or performance benchmarks.

## Product Principles

1. The occupant remains the authority.
2. Capture rich private context before deriving public artifacts.
3. Agents propose; exact approvals authorize.
4. Publish immutable minimum-necessary snapshots.
5. Preserve provenance, portability, and revocability.

## Accessibility & Inclusion

Primary workflows support keyboard operation, visible focus, semantic controls,
responsive layouts, and reduced-motion preferences.

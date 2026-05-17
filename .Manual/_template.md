# {Feature Name}

> Copy this file to `{kebab-case-feature-name}.md` and fill in each section.
> Delete this blockquote when starting a real entry. Add a row to the Index in `README.md`.

**Status:** Shipped | In Progress | Deprecated
**Owner:** {name}
**Related ADR(s):** [NNNN](../docs/adr/NNNN-...) (if applicable)
**Source files:** `src/path/to/main-file.tsx`, `src/path/to/helper.ts`

---

## 1. Functional Description

{What does this feature do for the end-user? Plain language, no jargon. Imagine explaining it to someone who has never opened the app.}

**Example user story:** *"As a job-seeker, I can switch the map area between a map view, my work log, and analytics without losing my current map zoom or filters."*

## 2. Internal Workflow

{Step-by-step "logic path" — what happens when the user interacts with this feature. Reference real files and functions.}

1. User clicks **{button / link / area}** in `src/components/...`
2. Handler `handleX()` fires → reads state `Y`
3. Mutation hits `POST /api/...` → validated by `lib/validators/...`
4. Database updates table `Z` via Prisma
5. React Query key `["..."]` invalidated → UI re-renders
6. User sees **{observable outcome}**

## 3. Configuration / Params

{Settings, constants, thresholds, environment variables that control this feature. Include defaults.}

| Name | Location | Default | Purpose |
|------|----------|---------|---------|
| `EXAMPLE_LIMIT` | `src/lib/constants.ts` | `50` | Max items returned per page |
| `EXAMPLE_FLAG` | `.env` | `true` | Toggle feature on/off in production |

## 4. Known Constraints

{What the feature explicitly does NOT do. Listing constraints prevents wasted "shouldn't this also…?" conversations later.}

- Does not {limitation 1 — and why}
- Does not {limitation 2}
- Does not support {edge case} — see deferred backlog / ADR NNNN

## 5. Future / Deferred

{Optional. Ideas explicitly deferred for later, with brief rationale.}

- {Idea} — deferred because {reason}

# AGENTS.md

Proforna is personal career management, rebuilt from a small base. Do not
assume the old Next.js tree, Prisma schema, or prior ADRs are in this checkout.

Stack: `core/` (domain), `server/` (Hono), `web/` (Vite + React). SQLite on
disk. Install with **pnpm**, not npm. Management logic lives in `core/` — not
in routes or React screens.

Humans start at [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
Decisions: [docs/adr/](docs/adr/). Merge gate: [docs/ci.md](docs/ci.md).
Governed agency (one Proforna, Agent Runs as purposes): [docs/agent-authority.md](docs/agent-authority.md) — epic #49 is done.

Anything an occupant can add must also be readable, changeable, and removable. Create, read, update, and delete stay together. The fields used to add a record are the fields used to change it.

Do not name another product, project, or repository in a commit message or in documentation unless that mention was explicitly requested or approved.

## Agent skills

### Issue tracker

GitHub Issues on SoryAK/Proforna. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root and `docs/adr/`. See `docs/agents/domain.md`.

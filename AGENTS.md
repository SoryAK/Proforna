# AGENTS.md

Proforna is personal career management, rebuilt from a small base. Do not
assume the old Next.js tree, Prisma schema, or prior ADRs are in this checkout.

Stack: `core/` (domain), `server/` (Hono), `web/` (Vite + React). SQLite on
disk. Install with **pnpm**, not npm. Management logic lives in `core/` — not
in routes or React screens.

Humans start at [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
Decisions: [docs/adr/](docs/adr/). Merge gate: [docs/ci.md](docs/ci.md).

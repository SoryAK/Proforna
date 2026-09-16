# Proforna

[![CI](https://img.shields.io/github/actions/workflow/status/SoryAK/Proforna/ci.yml?branch=main&label=CI)](https://github.com/SoryAK/Proforna/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![stars](https://img.shields.io/github/stars/SoryAK/Proforna)](https://github.com/SoryAK/Proforna/stargazers)

Personal career management: resumes, work history, worklog, documents, and job
search. You own the data and you act on it — this is not a log-only tracker.

This repository is being rebuilt from a small base. The previous codebase is
kept locally as a backup, not in this tree.

We are looking for **contributors and collaborators**. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Status

Scaffold. Stack is locked in [ADR-0001](docs/adr/0001-personal-career-management-stack.md):
`core/` (domain), `server/` (Hono), `web/` (Vite + React), SQLite on disk.

[CI](docs/ci.md) is the merge gate. Deploy is a no-op until hosting exists.

## Minimum to run

- Node 22

```bash
cp .env.example .env
npm ci
npm test
npm run dev
```

UI: [http://localhost:5173](http://localhost:5173). API: [http://localhost:3000/api/health](http://localhost:3000/api/health).

Default install is **one occupant on this machine** — no Create Account. `GET /api/me` creates `local` if needed.

## License

[Apache-2.0](LICENSE) © 2026 SoryAK

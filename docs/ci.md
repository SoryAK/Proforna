# CI — GitHub Actions merge gate

The public gate is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
It runs on every **pull request** and every **push to `main`**.

The check name GitHub should require is **`test`**.

## What a run does today

1. **Required files** — README, LICENSE, SECURITY, CONTRIBUTING, Code of Conduct
2. **`npm ci`** then **`npm test`** (Vitest at `core/` and `server/` HTTP seams)
3. **If Prisma exists** — `npx prisma generate` (legacy; this rebuild does not use it)
4. **Deploy (main only)** — no-op until hosting exists

## What is not in the gate yet

- `tsc --noEmit` and a production `vite build` join the gate when they are routine
- Hosting (Vercel or otherwise) is not wired

## Local parity

```sh
npm ci
npm test
```

## Ruleset (manual, once)

Repository **Settings → Rules → Protect main**:

- Pull request required
- Required status check: `test`
- No force-push, no deleting `main`

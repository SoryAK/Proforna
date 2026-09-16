# CI — GitHub Actions merge gate

The public gate is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
It runs on every **pull request** and every **push to `main`**.

The check name GitHub should require is **`test`**.

## What a run does today

1. **Required files** — README, LICENSE, SECURITY, CONTRIBUTING, Code of Conduct
2. **If `package.json` exists** — `npm ci`, then `npm test`
3. **If Prisma exists** — `npx prisma generate` (dummy `DATABASE_URL`; no Postgres)
4. **Deploy (main only)** — no-op until the app is back

Occupant mode (`SINGLE_OCCUPANT`) stays **off** in CI when tests return.

## What is not in the gate yet

- `tsc --noEmit` and `next build` join the gate when they are clean locally
- Hosting (Vercel or otherwise) is not wired yet

## Local parity

When the app is in the tree:

```sh
npm ci
npx prisma generate   # if using Prisma
npm test
```

## Ruleset (manual, once)

Repository **Settings → Rules → Protect main**:

- Pull request required
- Required status check: `test`
- No force-push, no deleting `main` (after the rebuild settle)

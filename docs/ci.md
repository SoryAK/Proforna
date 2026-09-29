# CI — GitHub Actions merge gate

The public gate is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
It runs on every **pull request** and every **push to `main`**.

The check name GitHub should require is **`test`**.

## What a run does today

1. **Required files** — README, LICENSE, SECURITY, CONTRIBUTING, Code of Conduct
2. **`pnpm install --frozen-lockfile`** then **`pnpm test`** (Vitest at `core/` and `server/` HTTP seams)
3. **If Prisma exists** — `npx prisma generate` (legacy; this rebuild does not use it)
4. **Deploy (main only)** — no-op until hosting exists

## What is not in the gate yet

- `tsc --noEmit` and a production `vite build` join the gate when they are routine
- Hosting (Vercel or otherwise) is not wired
- The standards-and-spec review. That review reads the issue and judges the
  diff. A test job cannot do it, so it stays on the pull request.

## Review

Push the branch, then open the pull request. The review happens there, before
the pull request is ready to merge:

- **Standards.** The diff follows the repo's documented standards.
- **Spec.** The diff does what the linked issue asks.

Write both on the pull request. `test` still has to pass. It does not stand in
for that review.

## Local parity

```sh
pnpm install
pnpm test
```

## Ruleset (manual, once)

Repository **Settings → Rules → Protect main**:

- Pull request required
- Required status check: `test`
- No force-push, no deleting `main`

An approving review is not required yet. The repository has one maintainer,
and GitHub does not count that person's approval of their own pull request.
Turn on one required approval when a second reviewer can give it.

# Add an OAuth provider that extends `IntegrationConnection`

**Workflow Type:** `add-oauth-integration-provider`
**Last Updated:** 2026-06-08

## Stack Context

- Next.js 16 Route Handlers (App Router, `src/app/api/**`)
- Prisma v6 with the existing `IntegrationConnection` model (see `prisma/schema.prisma`)
- NextAuth v5 middleware in `src/proxy.ts` — gates `/api/**` with 401, page routes with redirect to `/login`
- AES-256-GCM crypto helper in `src/lib/integration-crypto.ts` for at-rest token storage
- `src/components/integrations-section.tsx` is the shared UI surface for every provider, rendered inside the unified Settings dialog (`PortalSettingsPanel` → Integrations tab). The legacy `/integrations` route is now a redirect to `/dashboard?settings=integrations`.
- `src/components/sidebar.tsx` (`AppHeader`) owns the Settings dialog state AND the `?settings=<section>` / `?<provider>=<flag>` URL-flag handling — the section component does not parse search params itself.
- shadcn/ui v2 (base-ui) — **no `asChild`** on `Button`; use `<Button asChild={false}>` wrapping `<a>` or wrap manually with `<Link className={buttonVariants(...)}>`

## When this recipe applies

You are adding a new **OAuth-based** provider (Notion, OneDrive/Graph, Google Drive,
GitHub OAuth for private repos, etc.) on top of the existing `IntegrationConnection`
plumbing. The existing model already carries everything you need:

```prisma
model IntegrationConnection {
  id, userId, provider, label, config: Json, enabled,
  lastSyncedAt, lastSyncStatus, lastSyncCount,
  createdAt, updatedAt
  @@unique([userId, provider, label])
}
```

Encrypted tokens live inside `config.tokenRef = { version, accessToken, refreshToken?, expiresAt?, scope? }`.
No schema change required — the `config: Json` slot is the extension point.

## Successful Sequence

1. **ADR.** Draft `docs/adr/00XX-<provider>-integration.md` covering:
   - Token storage decision (env-keyed AES-GCM vs envelope encryption — default to env-keyed)
   - Where the connect button lives (existing Settings → Integrations section in `src/components/integrations-section.tsx`)
   - Whether the existing POST allowlist accepts the provider (default **no** — only the OAuth callback can create rows for the new provider)
   - Refresh-token lifecycle if the provider returns one (Notion does not; OneDrive does)

2. **Env vars + `.env.example`.** Append these keys:
   - `<PROVIDER>_CLIENT_ID`, `<PROVIDER>_CLIENT_SECRET`, `<PROVIDER>_REDIRECT_URI`
   - `NEXT_PUBLIC_<PROVIDER>_OAUTH_ENABLED` — UI feature flag (set `"0"` until credentials land)
   - Ensure `INTEGRATION_TOKEN_KEY` is already present (shared across providers)

3. **OAuth `start` route** at `src/app/api/integrations/<provider>/oauth/start/route.ts`:
   - `await getUserId()`; if missing, redirect to `/login?next=/dashboard%3Fsettings%3Dintegrations`
   - Guard on missing client_id/redirect_uri → redirect to `/dashboard?settings=integrations&<provider>=error%3Dnot_configured`
   - Generate `randomBytes(32).toString("base64url")` state
   - Set `httpOnly Secure SameSite=Lax` cookie named `<provider>_oauth_state` with `maxAge: 600`
   - Redirect to provider authorize URL with `client_id`, `response_type=code`, `redirect_uri`, `state`

4. **OAuth `callback` route** at `src/app/api/integrations/<provider>/oauth/callback/route.ts`:
   - Verify cookie state === `?state=` param; delete the cookie immediately after read
   - POST to provider token endpoint; reject on non-OK
   - `encryptToken(access_token)` → build `config.tokenRef`
   - `findFirst({ userId, provider, label }) → update OR create` (upsert pattern; the unique key constraint makes raw upsert awkward)
   - Redirect to `/dashboard?settings=integrations&<provider>=connected` or `/dashboard?settings=integrations&<provider>=error%3D<slug>`

5. **Crypto helper test pattern.** Already covered by `src/lib/integration-crypto.test.ts`. Reuse — do not write a second crypto module.

6. **UI surface.** In `src/components/integrations-section.tsx`:
   - Add a Connect card behind `process.env.NEXT_PUBLIC_<PROVIDER>_OAUTH_ENABLED === "1"`
   - Use `<a href="/api/integrations/<provider>/oauth/start">` wrapped in `buttonVariants(...)` — **NOT** `<Button asChild>`
   - Branch the connection-row renderer to handle the new provider's `config` shape
   - **Do NOT** add a `useEffect` that parses `?<provider>=...` here. The sidebar (`AppHeader` in `src/components/sidebar.tsx`) already owns URL-flag handling for every provider — just extend its existing toast/invalidate switch if you need provider-specific copy.

7. **Tests.** RED → GREEN cycle on the crypto helper happens once. OAuth routes themselves don't get unit tests (they're thin glue around `fetch` + Prisma); smoke-test in the browser end-to-end instead. The "not configured" guard is the easiest smoke path — leave creds blank, click Connect, expect the toast.

## First-Attempt Failures

1. **`<Button asChild>` doesn't exist in shadcn v2 (base-ui).** The Button primitive uses `render` instead. Wrapping a button styles around an `<a>` is cleaner as `<a className={cn(buttonVariants({...}))}>`. (Caught during smoke — the Connect card threw a React DOM warning about an unrecognized prop.)

2. **URL flag format mismatch.** The page `useEffect` expected `?notion=connected | ?notion=error=...`, but the start route initially redirected with `?error=notion_not_configured` (different key entirely). Toast never fired. **Fix:** ALL provider redirects MUST use the shape `?<provider>=connected` or `?<provider>=error%3D<slug>` — slug is URI-encoded inside the value so `useEffect` can parse it as `flag.startsWith("error=")`.

3. **PowerShell `Set-Content -NoNewline` collapses the entire file into one line.** Lost newlines in `.env` once. **Fix:** always use `Set-Content` without `-NoNewline` when round-tripping multi-line config. For `Add-Content`, wrap your block in a here-string (`@"..."@`) — that preserves newlines correctly.

4. **`.env` is gitignored by `.env*`.** To track `.env.example`, add `!.env.example` exception in `.gitignore` and verify with `git check-ignore .env.example` (exit code 1 = not ignored).

5. **The unique constraint `[userId, provider, label]` makes raw Prisma `upsert` awkward** when `label` is the workspace name returned by the OAuth response (which you don't know until *after* the token exchange). Use the explicit `findFirst → update | create` pattern shown in step 4 instead of `upsert()`.

## Gotchas

- **Middleware in `src/proxy.ts`** matches everything except `/_next/static` and `/_next/image`. The OAuth `start` route is `/api/**` so unauthenticated callers get a 401 JSON — that's fine; the page never links there without a session. The `callback` route is also gated, which is what you want (CSRF state alone isn't enough).
- **Notion access tokens are long-lived** (no refresh by default for public integrations). Leave the `refreshToken: null` slot for future providers (OneDrive, Google Drive).
- **Restart `npm run dev` after toggling `NEXT_PUBLIC_*` flags** — these are inlined at build time. Server-only `process.env.X` reads re-evaluate per request, but client bundles need a rebuild.
- **Never log raw tokens.** All error redirects carry opaque `error=<slug>` only. The `decryptToken` helper throws on tamper; do not catch + log the exception body.
- **OneDrive sync gotcha:** when committing with `.env` open in another tool (or the watcher debouncing), `git -c gc.auto=0 commit -F <msg-file>` avoids the worktree gc y/n prompt loop. See `parked-ideas.md` for the full pattern.

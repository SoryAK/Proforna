# 0018 — External Import Integrations (OAuth + Token Encryption)

- **Status:** Proposed
- **Date:** 2026-06-08
- **Supersedes:** —

## Context

Sprint 6 expands the existing `IntegrationConnection` plumbing (ICS + GitHub
public-events, see schema comment on `IntegrationConnection`) with **OAuth
providers** that can pull *authored content* from external knowledge surfaces
into the worklog as importable notes:

- **6A (this ADR):** OAuth scaffolding + token-at-rest encryption for **Notion**
- **6B:** Browse + single-page Notion import (markdown → PM via existing pipeline)
- **6C:** OneDrive (MSAL + Microsoft Graph + `mammoth` for `.docx`)

The schema comment on `IntegrationConnection` already predicts this work:

> *"OAuth providers (google-calendar, microsoft-graph, github-oauth) will reuse
> this row with an additional encrypted token blob in `config` once that work
> lands."*

So Sprint 6A **does not** create a new model — it reuses
`IntegrationConnection` and stores the encrypted access token (and optional
refresh token + expiry) inside `config.tokenRef`.

### Grilling questions answered

1. **Why not a separate `IntegrationCredential` model?** — The existing model
   already carries `config: Json`, `provider`, `userId`, `enabled`, and the last-
   sync metadata we'll need for refresh failure tracking (`lastSyncStatus =
   "needs reauth"`). A second model would duplicate the join chain.
2. **Why env-keyed symmetric crypto instead of a KMS?** — Resumsify runs on a
   single Node process with one operator. KMS round-trips would add latency and
   ops burden with no real adversary model improvement at current scale. The
   `v1:` ciphertext prefix lets us swap to envelope encryption or a remote KMS
   later without a data migration on the storage shape.
3. **What happens if `INTEGRATION_TOKEN_KEY` rotates?** — All existing
   ciphertexts become unreadable. We document a deferred re-encryption migration
   path below. For now: rotating the env key forces every user to reconnect.

## Decision

### 1. Token storage — env-keyed AES-256-GCM

- Master key: 32 random bytes, base64-encoded, stored in `INTEGRATION_TOKEN_KEY`
- Helper module: `src/lib/integration-crypto.ts`
  - `encryptToken(plaintext: string): string` — random 12-byte IV per call
  - `decryptToken(ciphertext: string): string` — throws on tampered auth tag
- Ciphertext format: `v1:<iv_b64>:<authtag_b64>:<ciphertext_b64>`
  - `v1:` prefix lets us rotate algorithm/format without a data migration
- Encrypted blob lives in
  `IntegrationConnection.config.tokenRef = { accessToken, refreshToken?, expiresAt?, scope?, version: "v1" }`
  where `accessToken`/`refreshToken` are the `v1:...` ciphertext strings
- **Never** log raw tokens. Route error responses redact.

### 2. OAuth flow — server-side authorization code, no PKCE

- `GET /api/integrations/notion/oauth/start`
  1. Generate 32-byte random state, store in signed `httpOnly Secure SameSite=Lax`
     cookie (`__Host-notion_oauth_state` in production; `notion_oauth_state` in dev)
  2. Redirect to Notion authorize URL with `client_id`, `redirect_uri`,
     `response_type=code`, `state`, `owner=user`
- `GET /api/integrations/notion/oauth/callback`
  1. Verify state cookie matches `?state=` param; reject + redirect to
     `/integrations?error=state_mismatch` on any mismatch
  2. POST to `https://api.notion.com/v1/oauth/token` with Basic auth header
     `Authorization: Basic base64(client_id:client_secret)` and JSON body
     `{ grant_type: "authorization_code", code, redirect_uri }`
  3. Encrypt `access_token` → upsert `IntegrationConnection` with
     `provider="notion"`, `label=workspace_name`, `config.tokenRef`
  4. Redirect to `/integrations?notion=connected`

### 3. POST `/api/integrations` allowlist stays as-is

`ALLOWED_PROVIDERS = { ics, github }` — `notion` rows can **only** be created by
the OAuth callback. POST returns 400 for `provider="notion"`. PATCH/DELETE work
unchanged so the existing UI can toggle/disconnect Notion rows.

### 4. UI surface — integrations page only

- Add a **Connect Notion** card on the existing `/integrations` page
- Behind feature flag `NEXT_PUBLIC_NOTION_OAUTH_ENABLED` so the card hides until
  the operator sets it to `"1"` (avoids broken-state UX before secrets land)
- For connected `provider="notion"` rows: hide manual ICS/GitHub config fields,
  show workspace name, keep Sync/Toggle/Delete affordances inactive for 6A
  (Sync becomes "Import" in 6B)
- The worklog `+` menu does **not** launch this surface in 6A — that lands in 6B
  with the page-picker dialog

## Consequences

### Pros
- Zero schema migration — reuses existing `IntegrationConnection` row
- Crypto module is single-file + fully unit-testable with no Prisma deps
- Version-prefixed ciphertext format buys us future migration headroom
- Disconnect cleanly removes the encrypted blob (no orphaned secrets)

### Cons / Trade-offs
- **Master key rotation is destructive.** Rotating `INTEGRATION_TOKEN_KEY` makes
  every existing token unreadable. Users would need to reconnect. *Mitigation:*
  document this in the operator runbook; revisit with envelope encryption if
  multi-user / multi-tenant ever materializes.
- **No PKCE.** Notion accepts confidential-client OAuth without PKCE. If we
  ever expose this through a public client (e.g. native app or browser-only
  flow), PKCE must be retrofitted.
- **State cookie is per-browser.** A user starting OAuth on browser A and
  finishing on browser B will be rejected. Acceptable trade-off for CSRF
  protection; documented in the UI as "complete the connection in the same
  browser window."
- **Refresh-token handling is deferred to 6B.** Notion's access tokens are
  long-lived (no refresh by default for public integrations), but for OneDrive
  in 6C we'll need a refresh helper. The `tokenRef` shape already has slots for
  `refreshToken` + `expiresAt` so the call site is the only thing that changes.

## Deferred — Migration to envelope encryption (Option B)

If multi-tenant scale or a stronger blast-radius story is needed:

1. Generate a per-user 32-byte data encryption key (DEK), encrypt it with the
   master key, store wrapped DEK on `User` (new column)
2. Re-encrypt every existing `tokenRef` under the user's DEK, bumping format to
   `v2:<wrapped_dek_id>:<iv>:<tag>:<ciphertext>`
3. `decryptToken` reads the version prefix and dispatches; `v1:` decrypters stay
   for the duration of the migration
4. Master key rotations now only re-encrypt the (small) wrapped DEKs, not every
   token

This work is **not** scheduled. Reference only.

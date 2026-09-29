# Publishing relay

The relay is a separately runnable Hono service. It stores the current public
snapshot for each slug, plus grants, revocation state, inbound requests, and
minimized engagement events. Republishing replaces that snapshot in place.
It has no database or filesystem access to the Career Vault.

## Run locally

```sh
RELAY_OWNER_TOKEN=change-me pnpm dev:relay
```

Point the private workspace at it:

```sh
RELAY_URL=http://localhost:3100 \
RELAY_OWNER_TOKEN=change-me \
pnpm dev:server
```

Relay state defaults to `data/relay.sqlite`. Set `RELAY_DATABASE_PATH` and
`RELAY_PORT` to override it. Use a randomly generated owner token in hosted
environments and terminate TLS before the relay.

The relay intentionally does not receive occupant IDs, evidence, fact
provenance, source documents, private preferences, or visitor identity in
analytics events.

## Agent read

An agent reads a publication at `POST /mcp`. The tool is `read_publication`,
with the slug from the link a person opens and a token when that publication
requires one. The result is the same snapshot the page is drawn from. Revoke,
expiry, and the access token apply to both. A page open is a `view`. An agent
read is a `read`. Neither event carries who asked.

Point an MCP client at `http://localhost:3100/mcp` while the relay is running.
The endpoint accepts the current protocol (`2026-07-28`) and the earlier
streamable HTTP versions that start with `initialize`.

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

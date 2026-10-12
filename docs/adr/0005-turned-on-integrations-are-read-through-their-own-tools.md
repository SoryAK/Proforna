# 0005 — A turned-on integration is read through its own tools

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Sory Kaba
- **Tags:** product, agency, integrations

## Context

A command Agent Run could read mail and GitHub only because each had its own
reader. Any other integration the occupant turned on stayed unused until
someone wrote another reader.

Calling every integration on every question would fetch data the question did
not ask for. Handing the model the credential would let it act outside the
run. Writing through those tools would change an outside service without an
Approval.

The occupant-facing list was also offering integrations that have no sign-in
configured yet. Their plugin files stay in the repo so that work can be
finished later. An integration here is a named outside service in Settings.
It is not a Job Source.

## Decision

- Settings and onboarding list only integrations whose sign-in is already
  configured. The plugin files stay.
- A home command lists the integrations that are turned on.
- When the prompt names one, Proforna calls that integration's own read tool.
  It picks a read that needs no arguments. It does not call a tool that
  creates, updates, deletes, or sends.
- The credential stays on the server. The model sees the result, not the
  token, and must not claim it changed the integration.
- Mail and GitHub keep the readers they already have. The general path skips
  them so the same question is not fetched twice.
- An integration that is off, or that the prompt does not name, is not called.

## Consequences

- A newly configured integration does not need its own command reader once
  the occupant turns it on.
- A read that needs arguments is named and not called.
- Changing an outside integration still needs an Approval. This path does not
  send mail or change a repo.

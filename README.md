# Proforna

[![CI](https://img.shields.io/github/actions/workflow/status/SoryAK/Proforna/ci.yml?branch=main&label=CI)](https://github.com/SoryAK/Proforna/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![stars](https://img.shields.io/github/stars/SoryAK/Proforna)](https://github.com/SoryAK/Proforna/stargazers)

> **A private career operating system.**

Proforna turns evidence from a person's work into career facts, plans, artifacts, and approved actions. The Career Vault stays on this machine. The occupant owns it and acts on it.

---

### What is a Career Operating System?

Proforna is a local system of record for one career, built around four principles:

- **Evidence-backed career memory.** Evidence is immutable source material, such as a stored resume. Career Facts point at that evidence. A Worklog Entry is a dated capture that may become proposed facts.
- **Local vault, local models.** The Career Vault stays on this machine. An extract model is optional. Local servers such as Ollama and llama.cpp are preferred. A cloud model is an explicit grant that what you send may leave the machine.
- **Governed agency.** An agent proposes a Change Set. Those changes enter the vault when the occupant approves them.
- **Publications and MCP.** A Publication is an approved, redacted snapshot. A person reads the page. An agent, through MCP, reads that same snapshot. Revoke, expiry, and an access token apply to both. The Career Vault stays on the machine.

---

## Repository status

The previous codebase is kept locally as a backup, not in this tree.

We are looking for **contributors and collaborators**. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Architecture

One occupant on this machine. Proforna runs locally, or from the desktop package.

- **Domain (`core/`):** Career memory and the rules that govern it.
- **API (`server/`):** HTTP server built with Hono.
- **Web (`web/`):** React and Vite.
- **Desktop (`web/src-tauri`):** The desktop window.
- **Storage:** SQLite on disk.

First run moves through Welcome, Profile, and Resume. The resume is optional. `GET /api/me` creates the `local` vault if needed.

---

## Minimum to run

- Node 22
- pnpm 10 (`corepack enable` then `corepack prepare pnpm@10.17.1 --activate`)

```bash
cp .env.example .env
pnpm install
pnpm test
pnpm dev
```

UI: [http://localhost:5173](http://localhost:5173). API: [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Job mail

Opportunities can read one Gmail account for applications, interviews, recruiter
outreach, and offers. Those messages become Opportunities, applications, and
contacts in My Network. Another provider can be added later; this cut connects
Gmail only.

Create an OAuth client (Web application) in Google Cloud. Set the redirect URI
to `http://localhost:3000/api/mailbox/gmail/callback`. Proforna requests
`https://www.googleapis.com/auth/gmail.readonly` and does not send mail.

```
GMAIL_OAUTH_CLIENT_ID=
GMAIL_OAUTH_CLIENT_SECRET=
```

Optional: `GMAIL_OAUTH_REDIRECT_URI` (default
`http://localhost:3000/api/mailbox/gmail/callback`) and `PROFORNA_APP_ORIGIN`
(default `http://localhost:5173`). See `.env.example`. Without those two
client values, Connect explains what is missing and does not call Google.

## License

[Apache-2.0](LICENSE) © 2026 SoryAK

# Proforna

[![CI](https://img.shields.io/github/actions/workflow/status/SoryAK/Proforna/ci.yml?branch=main&label=CI)](https://github.com/SoryAK/Proforna/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![stars](https://img.shields.io/github/stars/SoryAK/Proforna)](https://github.com/SoryAK/Proforna/stargazers)

> **The Private Career Operating System for Principal Professionals.**

Where traditional job platforms treat you as a candidate profile in someone else's cloud database, Proforna gives you local sovereignty over your data—turning your work history into an asset you own, control, and deploy with complete authority.

---

### What is a Career Operating System?

Proforna isn't a simple resume builder, a task template, or a cloud application tracker. It is a local-first system of record and execution engine built around four core principles:

- **Evidence-Backed Career Memory:** Immutable raw material (resumes, worklogs, artifacts) links directly to verified career facts.
- **Local Sovereignty & Local AI:** Your Career Vault stays on your machine. Runs default to local LLMs (Ollama, llama.cpp), ensuring personal data never leaves without explicit authorization.
- **Governed Agent Agency:** AI agents operate under atomic **Change Sets** and strict **Approvals**. No hallucinated facts, untracked mutations, or unauthorized outbound messages.
- **Dynamic Projections & MCP:** Render tailored resume variants and publish redacted, access-controlled interactive projections for humans and AI agents (via Model Context Protocol) without exposing raw private vault records.

---

## Repository Status

This repository is actively being rebuilt from a small, solid base. The legacy codebase is kept locally as a backup, not in this tree.

We are actively looking for **contributors and collaborators**. See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

---

## Architecture & Stack

Proforna runs entirely on your local machine or via desktop packaging for a **single Principal on this machine** (no cloud accounts or tracking).

- **Domain Core (`core/`):** Pure domain logic, career memory schemas, and governance rules.
- **API Server (`server/`):** Lightweight HTTP server built with Hono.
- **Web UI (`web/`):** Frontend interface built with React and Vite.
- **Desktop Shell (`web/src-tauri`):** Native desktop window powered by Tauri.
- **Storage:** SQLite database on local disk.

First run moves through Welcome → Profile → Resume (resume upload optional). A call to `GET /api/me` automatically bootstraps the `local` vault if needed.

---

## Minimum to Run

- **Node.js:** v22+
- **pnpm:** v10 (`corepack enable` then `corepack prepare pnpm@10.17.1 --activate`)

### Quickstart

```bash
cp .env.example .env
pnpm install
pnpm test
pnpm dev

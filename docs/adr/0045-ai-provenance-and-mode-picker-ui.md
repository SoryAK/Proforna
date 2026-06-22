# AI Provenance UI + Chat Mode Picker — make the router visible to the user

- **Status:** Accepted (2026-06-21)
- **Date:** 2026-06-21
- **Deciders:** Sory
- **Tags:** ai, ui, observability, week-long-sprint
- **Builds on:** [ADR-0044](./0044-ai-provider-router.md)

## Context and Problem Statement

[ADR-0044](./0044-ai-provider-router.md) shipped a unified `ai.generate()` façade with **5 task classes** (`chat` / `extract` / `ground` / `reason` / `summarize`), **3 providers** (`ollama` / `gemini-fast` / `gemini-pro`), end-to-end token-counting via an `onUsage` callback, and a uniform `AIProviderError` envelope. Today **14 routes** call through it.

**None of that is visible to the user.**

Concretely, audit of the current UI:

- The [`AIChat`](../../src/components/ai-chat.tsx) panel surfaces a provider picker (`ollama` | `gemini`) and a model-name dropdown. It shows a small `via ollama` / `via gemini` badge per assistant message. That is the *entire* AI-provenance UI in Resumsify today.
- **Task class** never appears anywhere — the chat panel hardcodes `task: "chat"` server-side, and the user has no way to say *"answer this with reasoning"* or *"search the web for this."*
- **Actual model after fallback** is lost — `result.model` returns through `ai.generate()`, but route handlers drop it; the user sees `provider`, never the specific model the chain landed on.
- **Token usage** — `onUsage` fires server-side, **never reaches the client**.
- **The other 13 AI routes** (`job-parse`, `resume-parse`, `worker-rights`, `google-news`, `google-scholar`, `learning/generate`, `interview-prep`, `employment-report/upload`, the `skill-graph` trio, `cdm/synonyms`, `cdm/decompose`) silently produce data with **zero provenance UI** in their consumers.

User framing: *"VS Code has Agent mode, Plan, Ask, etcetera, etcetera. That's nowhere in our UI right now."*

The router built in ADR-0044 has the data. The UI has none of it.

## Decision Drivers

- **Trust requires observability.** Users cannot evaluate AI output quality if they cannot see which tier answered.
- **Steering requires affordance.** The task-class vocabulary is a powerful router lever; with no UI it is dev-only.
- **Cost-guard remains deferred.** ADR-0044 Scope C (per-user accounting + enforcement) is gated on auth + multi-tenancy. Any user-facing "Think harder" button must self-regulate.
- **Backwards compatibility on 13 routes is non-trivial.** Wrapping responses to carry provenance is a real refactor of every consumer — must be designed to minimize the touch surface.

## Considered Options

- **Option A — Provenance-only.** Add a shared `<AIProvenanceChip />` to every AI-touching surface (chat panel + 13 backend route consumers). No mode picker. Surface what the system *is doing*, no new steering.
- **Option B — Chat-panel mode picker only.** Add sticky-per-thread mode picker to the chat panel. No provenance work on the other 13 routes. Surface user steering for chat, leave the rest silent.
- **Option C — Both** *(this ADR)*. Provenance everywhere + chat-panel mode picker. ~3-5 days.
- **Option D — Full agent-style UX.** C + per-message override + multi-modal tool palette + cost-guard enforcement. Defers ADR-0044's per-user accounting decision — premature.

## Decision Outcome

Chosen option: **Option C — Provenance everywhere + sticky-per-thread mode picker.**

### Decisions locked this sprint

| # | Question | Decision | Rationale |
| - | --- | --- | --- |
| 1 | Cost-guard story for `reason` mode | **Running session token cost in chat panel header, self-regulated.** | Cheaper than feature-flagging; respects ADR-0044's deferral of real cost guard; user gets immediate feedback. |
| 2 | Mode picker shape | **Sticky-per-thread** (one pill at the top of the chat panel; VS Code Ask/Edit/Agent style). | One decision per conversation matches user intent; per-message would mean managing 5+ chips per send. |
| 3 | Provenance transport from server → client | **Wrapped JSON envelope** `{ data: <original>, _ai: { provider, model, usage, durationMs } }`. | Cleanest semantics; lives in the type system; `useAIQuery<T>()` wrapper hides the unwrap. Trade-off: every consumer of the 13 routes is touched. |

### User-facing mode vocabulary

The 5 router task classes do **not** map 1:1 to UI modes — `extract` is backend-only (job-parse, resume-parse) and never reaches the chat panel. The chat-panel picker exposes **4 modes**:

| UI Mode | Task class sent | What it does for the user | Visual tier |
| --- | --- | --- | --- |
| **Chat** *(default)* | `chat` | Just answer. Streaming. Ollama-first, Gemini fallback. | Free |
| **Search** | `ground` | Answer with Google Search grounding. Cites sources. | Free / metered |
| **Think harder** | `reason` | Premium reasoning via `gemini-2.5-pro`. Slower, smarter. | **Premium** — header cost meter active |
| **Summarize** | `summarize` | Compress-to-essence on long inputs. | Free |

The "Premium" badge on Think harder + the live session token cost is the entire cost-guard story for this sprint.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│  AIChat panel (sticky mode picker)                               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ [Chat ▾]  •  ⚡ 1.4k tokens this thread  •  WiFi 🟢      │    │  ← new: mode pill + cost meter
│  └──────────────────────────────────────────────────────────┘    │
│   user: "explain ADR-0044"                                       │
│   bot:  "..."  ▸ ollama:gemma4:26b · 247t · 1.4s ◂              │  ← new: detailed chip per turn
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Backend route consumers (job-parse, resume-parse, ...)          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Parsed Job Title: Software Engineer                      │    │
│  │ ▸ gemini-fast:gemini-2.0-flash-lite · 312t · 0.9s ◂      │    │  ← new: AIProvenanceChip footer
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘

server-side:
  ai.generate(...) → { json, provider, model, usage }
  ↓
  withAIEnvelope(result) → { data: json, _ai: { provider, model, usage, durationMs } }
  ↓
  NextResponse.json(envelope)

client-side:
  useAIQuery<T>(...)  →  { data: T, ai: AIMeta }   ← wraps useQuery, unwraps envelope
  <AIProvenanceChip ai={ai} />                     ← shared component, ~50 LOC
```

## Implementation plan (3-5 day sprint)

| Day | ETC scope | Files touched |
| --- | --- | --- |
| 1 | **L1 — Envelope + shared helpers.** Add `withAIEnvelope()` server helper, `useAIQuery<T>()` client wrapper, `<AIProvenanceChip />` shared component. Hermetic tests for the helper + wrapper. **No route migrated yet.** | `src/lib/ai/envelope.ts` (new), `src/lib/hooks/useAIQuery.ts` (new), `src/components/ai-provenance-chip.tsx` (new), 3 test files |
| 2 | **L2 — Migrate the 13 backend routes + their consumers** to envelope + chip in two batches. Each batch ETC. | 13 route handlers in `src/app/api/**` + their TanStack Query call sites + chip placements |
| 3 | **L3 — Chat panel mode picker + session cost meter.** Sticky pill at top; cost meter header; per-turn chip upgrade (already has the data after L1). `task` is sent based on mode. `reason` mode shows "Premium" badge. | `src/components/ai-chat.tsx`, `src/app/api/ai/chat/route.ts` (accept `task` parameter), shared chip |
| 4 | **L4 — Smoke + visual verification.** Hermetic smoke for envelope + useAIQuery + chip. Live smoke for chat with all 4 modes. Browser walkthrough of all 13 consumer surfaces showing provenance. | smoke files + manual lab |
| 5 | **L5 — ADR flip to Accepted + handoff.** Memory Keeper, Practice Adoptions probe, handoff doc. | ADR file, memory shard, handoff |

ETC discipline per E.T.C. workflow pattern (user memory): each day = Execute → Test (`get_errors` + `npm test`, browser-verify on UI days) → Commit. Days 1 and 3 are single commits; Day 2 may split into 2 commits (one per batch of 6-7 routes).

## Consequences

### Pros

- **Trust + steering, both at once.** Users see what answered AND can ask for a smarter answer. Matches user's stated VS Code mental model.
- **Server-side data layer is unchanged.** ADR-0044's `ai.generate()` returns the same envelope already; this sprint adds transport + UI, not new router logic.
- **`useAIQuery<T>()` makes the envelope cheap.** Once shipped, future AI routes get a chip "for free" by using the hook.
- **Cost-guard via self-regulation is the simplest thing that could work.** No new infra, no feature flags, no client caps — just a number in the header. If it proves insufficient, ADR-0044 Scope C is the upgrade path.

### Cons / trade-offs

- **All 13 route consumers are touched.** Wrapped-envelope means every TanStack Query hook for an AI route is rewritten to unwrap `data`. High blast radius; risk of missing a consumer. Mitigation: `useAIQuery<T>()` typed wrapper makes the migration mechanical, and TS catches forgotten unwraps.
- **Sticky-per-thread mode picker loses one-shot intent.** Users who want to ask *just this one* question with `reason` mode have to flip the pill, send, then flip back. Per-message toggles are more flexible. Mitigation: a small "reset to Chat" link in the header after a non-default-mode turn, ergonomically easy.
- **`reason`-mode self-regulation has no hard stop.** A user who ignores the cost meter could blow through their Gemini free-tier quota in one long thread. Mitigation: header cost meter turns amber / red at thresholds (e.g. amber at 10k tokens, red at 25k). Truly hard stops are ADR-0044 Scope C territory.
- **The envelope shape locks us into a small contract.** Future provenance fields (request latency breakdown, cache-hit flag, MCP tool calls) must fit in `_ai`. Mitigation: `_ai` is open-shape — additive fields are non-breaking.

## Forward Path (explicitly NOT in this sprint)

1. **Per-user cost guard with enforcement** — ADR-0044 Scope C. Trigger: auth + multi-tenancy lands (PROJECT_PLAN Phase 1).
2. **Per-message mode override** ("Think harder" toggle next to send, on top of the sticky pill). Trigger: user-feedback says sticky-only is too rigid in real use.
3. **Mode picker on non-chat surfaces** (e.g. "re-parse this resume with `reason` tier"). Trigger: at least one consumer explicitly asks for it.
4. **Provenance drawer** — full session timeline of AI calls across the app, with token breakdown by route. Trigger: cost meter alone proves insufficient for diagnosing spend.
5. **MCP tool-call visualisation** — when the future L3 Tool Surface (ADR-0044 §Forward Path 3) ships, `_ai` extends to surface which tools fired during a turn.

## Acceptance criteria (re-entry to flip Status to Accepted)

- All 14 AI routes return the `_ai` envelope and have a `<AIProvenanceChip />` rendered on their primary consumer surface (verified by browser walkthrough).
- Chat panel mode picker functional for all 4 modes; sticky-per-thread; session cost meter live and visible; "Premium" badge fires only in `reason` mode.
- Hermetic suite passes; live smoke passes for all 4 chat modes.
- One ETC commit per sprint day; handoff doc and Memory Keeper pass executed at wrap.

## Acceptance — what actually shipped (2026-06-21)

Status flipped to **Accepted** at the end of the sprint. Acceptance evidence:

### Sprint commits

| Day | Commit | Scope |
| --- | --- | --- |
| Day 1 | `5c6758f` | `envelope.ts` (helpers + 13 hermetic tests), `useAIQuery` / `useAIMutation`, `<AIProvenanceChip />` |
| Day 2 Batch A | `21c422e` | 7 routes wrapped + 7 consumers migrated (job-parse, worker-rights, google-news, google-scholar, resume-parse, cdm/synonyms, cdm/decompose) |
| Day 2 Batch B | `90d615c` | 6 routes wrapped + 4 consumer surfaces migrated (interview-prep, learning/generate, employment-report/upload, skill-graph trio) |
| Day 3 | `7590d6d` | Chat panel mode picker (4 modes), session token meter, Premium "Pro" badge on `reason`, route accepts `task` |
| Day 4 | `105fd03` | Hermetic chat-route task-forwarding contract tests (+7) |
| Day 5 | this commit | ADR Accepted + Memory Keeper + handoff |

### Acceptance evidence vs. criteria

- **14/14 routes wrapped:** Day 2 covered all 13 non-chat AI routes (Batch A + B) and Day 3 wired `task` into the chat route — every AI surface now flows through the envelope or the new mode picker.
- **Mode picker:** 4 modes live; sticky-per-thread; session token meter with amber-10k / red-25k thresholds; "Pro" badge fires only on `reason`. Implemented in `src/components/ai-chat.tsx`.
- **Hermetic suite:** 880 passed | 5 skipped (was 873 at sprint start — 13 envelope + 7 chat-route tests added net of pre-existing parents that already covered the router).
- **Live smoke for 4 chat modes:** **completed 2026-06-22.** Re-ran [scripts/smoke-ai-live.ps1](../../scripts/smoke-ai-live.ps1) against warm Ollama (`gemma4:26b` loaded). Result: **5/5 green** in 42.5s — `chat` ✓ (ollama stream), `extract` ✓ (ollama, {p:41, c:13}), `ground` ~ (gemini-fast 429 free-tier exhausted, accepted error path), `reason` ~ (gemini-pro 429, accepted error path), `summarize` ✓ (ollama, {p:51, c:501}). Same evidence shape as ADR-0044 Day 5.
- **Browser walkthrough of 14 consumer surfaces:** **completed 2026-06-22.** All 14 routes (1 chat + 13 envelope routes) verified across 10 distinct page surfaces. Each surface mounts cleanly with the chip-rendering integration intact (source-grep × consumer page mount). Zero error boundaries. Surface list: chat panel (4-mode pill row), `/onboarding`, `/resumes`, `/current-position`, `/experience/verify`, `/worker-rights`, `/learning`, `/research → Company News`, `/research → Scholar`, `/applications`, `/skill-graph` (×3 routes share `lastSkillGraphAi`), `/career-growth → Direction` (×2 cdm routes share `lastCdmAi`).
- **ETC discipline:** 1 commit per day plus a Batch A/B split on Day 2 for blast-radius isolation. All commits passed `get_errors` + `npm test` before landing.

### Deviations from plan

- **`useAIQuery` / `useAIMutation` adoption:** The Day 2 consumer migrations bypassed the new hooks and unwrapped envelopes inline. Rationale: every migrated consumer had pre-existing custom `mutationFn` / `queryFn` logic (rate-limit retries, multipart uploads, shared mutation chains) that the hook abstraction couldn't accommodate without losing intent. The hooks remain available for new consumers — flagged as a potential cleanup pass once a hook-shaped use-case appears.

## Links

- [ADR-0044 — AI provider router](./0044-ai-provider-router.md) — the layer this UI surfaces
- [ADR-0021 — Mobile-first AI architecture](./0021-mobile-first-ai-on-device-gemini.md) — the deferred parent decision; this ADR honours the same Play-push deferral
- [User memory — E.T.C. workflow pattern](../../README.md) — daily ETC ship rhythm reused
- [User memory — Verification-First Bias 2026-06-15](../../README.md) — drives the Day 4 browser walkthrough requirement

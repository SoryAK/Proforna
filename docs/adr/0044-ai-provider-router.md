# AI provider router — Scope B (unified façade + premium tier) with 3-layer Forward Path

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Sory
- **Tags:** ai, architecture, infra, week-long-sprint

> **Numbering note.** This decision was referred to as "ADR-0022" during conversation, but slot 0022 was already taken by [0022-worklog-grill-me-markdown-roundtrip.md](./0022-worklog-grill-me-markdown-roundtrip.md). Slots 0039–0043 are reserved by the [Shipyard 6-phase roadmap](../plans/shipyard-roadmap.md). This ADR therefore takes the next free post-reservation slot, **0044**.

## Context and Problem Statement

Resumsify already calls Google Gemini from **13 API routes** today, but the call surface is fragmented across **two parallel, incompatible abstractions**:

- [src/lib/ai.ts](../../src/lib/ai.ts) — the "right" one. Type-safe (`AIProvider = "ollama" | "gemini"`, `ChatMessage`, `AIConfig`), Ollama-first with Gemini fallback, supports streaming chat (`ollamaChat`, `geminiChat`) and non-streaming `aiGenerateJSON<T>()`. Consumed by 4 routes: `cdm/synonyms`, `cdm/decompose`, `job-parse`, `resume-parse`, `/api/ai/chat`.
- [src/lib/gemini.ts](../../src/lib/gemini.ts) — older direct caller. `callGemini()` does intra-Gemini model-chain fallback (`gemini-2.0-flash-lite` → `gemini-1.5-flash` on 429). Consumed by 9 routes: `worker-rights`, `google-news`, `google-scholar`, `employment-report/upload`, `learning/generate`, `interview-prep`, and the `skill-graph` trio (`scaffold/refresh`, `auto-evidence`, `ingest`).

The fragmentation has three real consequences:

1. **Routing rules live in 13 places.** Adding a smarter model for one route requires touching that route's import + invocation; there is no central policy.
2. **Cost-guard and per-user accounting cannot be added without first unifying the façade.** The 9 direct-Gemini routes bypass any centralized hook.
3. **Downstream features are blocked.** Grill Me, pgvector RAG over `WorkLogVersion`, resume AI suggestions, and the markitdown-powered Equipment Manuals knowledge base all need a *tier* (cheap-fast vs deep-reason) and a *contract* the route handlers don't currently provide.

### Relationship to ADR-0021

[ADR-0021](./0021-mobile-first-ai-on-device-gemini.md) committed to **Option B** ("Build the abstract AI provider interface now; defer implementations until Play") and named a future "ADR-0022 (Provider implementations: AICore + Firebase AI + bring-your-own-key OpenAI fallback)" as a Play Store push deliverable. This ADR honors the **spirit** of that deferral — we are not building Firebase AI, AICore, or BYOK today — but ships **web-side consolidation + a cloud-premium tier** ahead of the Play push because the fragmentation and downstream blockers outweigh further deferral. Scope C below documents what the Play-push ADR will add.

## Decision Drivers

- **Consolidation tax is compounding.** Every new AI-touching route lands on whichever abstraction the author copied; the divergence is a week of refactor today and three weeks of refactor in six months.
- **Downstream blockers.** Grill Me, pgvector RAG, resume bullet polish, and markitdown integration all need a tier hint and a unified façade. None can ship cleanly without this.
- **Cost predictability.** Per-user accounting cannot be added without one central choke point. ADR-0021's deferral does not buy us anything here — the choke point is the same regardless of which providers ultimately implement it.
- **Provider plurality.** The interface must accept new vendors (Anthropic, OpenAI, BYOK) and local models (Ollama today, AICore tomorrow) without rewrites. Plug-in surface > hard-coded enum.
- **No premature complexity.** Five task classes — not 8, not 12. The vocabulary must fit in working memory.
- **Backwards compatibility.** Migration must be staged so we can ship the façade Day 1, migrate routes in batches Days 2–3, and never break a working call site.

## Considered Options

- **Option A — Consolidation only.** Fold `lib/gemini.ts` into `lib/ai.ts`, migrate the 9 stragglers, lock the interface, ship usage logging stubs. No new providers. ~2 days.
- **Option B — Consolidation + cloud-premium tier.** A, plus add `gemini-2.5-pro` as a third provider with task-class routing. ~5 days (one week sprint).
- **Option C — Full ADR-0021 forward stack today.** B + Firebase AI scaffold + AICore shim + BYOK OpenAI fallback + real rate-limit enforcement. ~3 weeks; breaks ADR-0021's Play-push deferral.

## Decision Outcome

Chosen option: **Option B — Consolidation + cloud-premium tier**. Scope B is the largest scope that fits one week, ships clean, and respects ADR-0021's deferral of the mobile-specific provider work. Scope A leaves downstream features (Grill Me deep mode, RAG synthesis) without a Pro-tier model. Scope C drags the sprint into mobile-packaging decisions that are not yet ready. **Scope C is preserved as Forward Path** so the next ADR (likely ADR-0044a or a successor) inherits this contract instead of starting over.

### Decisions locked this sprint

| # | Question | Decision |
| - | --- | --- |
| 1 | Sprint scope | **B** — consolidation + Gemini 2.5 Pro premium tier |
| 2 | Routing shape | **Caller decides task** — task-class routing, never model-name routing in caller code |
| 3 | Cost-guard depth | **Stub** — surface `userId` + `onUsage` hooks; do not enforce until multi-tenancy lands (PROJECT_PLAN Phase 1) |
| 4 | Premium tier vendor | **Gemini 2.5 Pro** (reuse `GEMINI_API_KEY`, no new vendor relationship); provider plug-in surface kept open for Anthropic/OpenAI/local-models later |

## Architecture — the 3-layer model

```text
┌──────────────────────────────────────────────────────────┐
│  L3 — Tool Surface (future ADR, MCP wire protocol)       │  ← see Forward Path §3
│  "what the AI can DO during a conversation"              │
├──────────────────────────────────────────────────────────┤
│  L2 — Skill Registry (future ADR)                        │  ← see Forward Path §2
│  "named bundles of prompt + tools + routing preference"  │
├──────────────────────────────────────────────────────────┤
│  L1 — Provider Router (THIS ADR)                         │  ← gemini-fast / gemini-pro / ollama
│  "give me a model that can {chat,extract,ground,reason,  │
│   summarize} — and stay out of my way otherwise"         │
└──────────────────────────────────────────────────────────┘
```

Dependency direction is strict: **L3 depends on L2 depends on L1.** L1 must exist before either upper layer can be built cleanly. This ADR commits L1 only.

### Task vocabulary — 5 classes

| Task class | When to use it | Default tier → model | Stream | JSON output | Caller examples today |
| --- | --- | --- | --- | --- | --- |
| `chat` | Multi-turn conversation with a system prompt | fast → `gemini-2.0-flash` | ✅ | ❌ | `/api/ai/chat`; future Grill Me live |
| `extract` | Single-shot text → JSON (OCR/document/parse output) | fast → `gemini-2.0-flash` | ❌ | ✅ | `cdm/synonyms`, `cdm/decompose`, `job-parse`, `resume-parse`, `employment-report/upload`, `skill-graph/*` trio |
| `ground` | Needs Google Search grounding for fresh/factual data | fast → `gemini-2.0-flash` + `tools.googleSearch` | ❌ | ✅ | `google-news`, `google-scholar`, `worker-rights` |
| `reason` | Deep multi-step reasoning, evaluation, synthesis | **premium → `gemini-2.5-pro`** | ❌ | ✅ | future Grill Me deep mode, future pgvector-RAG synthesis, future resume AI suggestions |
| `summarize` | Plain-text summarization, no JSON, no streaming | fast → `gemini-2.0-flash` | ❌ | ❌ | `learning/generate`, future resume bullet polish |

`extract` and `ground` deliberately stay separate so callers don't have to remember to pass a `{ ground: true }` flag — the task class implies the capability.

### Interface — locked at Day 1, widens only on demand

```typescript
// src/lib/ai/types.ts
export type AITaskClass = "chat" | "extract" | "ground" | "reason" | "summarize";
export type ProviderId  = "ollama" | "gemini-fast" | "gemini-pro";
// Forward Path additions: "firebase" | "aicore" | "openai-byok" | "anthropic-byok"

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface TokenUsage  { promptTokens?: number; completionTokens?: number; provider: ProviderId; model: string }

export interface AIRequest {
  task: AITaskClass;
  messages: ChatMessage[];
  modelOverride?: string;            // escape hatch — defeats router model choice
  providerOverride?: ProviderId;     // escape hatch — defeats tier selection
  userId?: string;                   // cost-guard stub: recorded only
  onUsage?: (u: TokenUsage) => void; // cost-guard stub: emitted only
}

export interface AIResponse<T = unknown> {
  text?: string;                     // chat / summarize
  json?: T;                          // extract / ground / reason
  stream?: ReadableStream<string>;   // streaming chat
  provider: ProviderId; model: string; usage?: TokenUsage;
}

export interface AIProvider {
  id: ProviderId;
  supports(task: AITaskClass): boolean;
  generate<T = unknown>(req: AIRequest): Promise<AIResponse<T>>;
}
```

Top-level façade — what callers actually use:

```typescript
import { ai } from "@/lib/ai";

const { json } = await ai.generate<ParsedResume>({
  task: "extract",
  messages: [{ role: "system", content: "..." }, { role: "user", content: rawText }],
  userId,
});
```

### Default routing table

| Task | Try in order | Notes |
| --- | --- | --- |
| `chat` | `ollama` if local available → `gemini-fast` | Local-first preserves the existing ADR-0021 cost story |
| `extract` | `ollama` (JSON mode) if local available → `gemini-fast` | Same |
| `summarize` | `ollama` if local available → `gemini-fast` | Same |
| `ground` | `gemini-fast` only | Ollama cannot do Google grounding; skip the optimistic try |
| `reason` | **`gemini-pro` only** — no fast-tier fallback | A fast-tier fallback defeats the entire point of premium routing; surface the quota error instead |

Inside Gemini, the existing model-chain fallback in `lib/gemini.ts` (`gemini-2.0-flash-lite` → `gemini-1.5-flash` on 429) is preserved as **intra-provider** behavior. Providers handle their own quota recovery; the router does not.

### Provider registry — week-1 shape

```typescript
// src/lib/ai/providers/index.ts
import { OllamaProvider }    from "./ollama";
import { GeminiFastProvider } from "./gemini-fast";
import { GeminiProProvider }  from "./gemini-pro";

export const providers: AIProvider[] = [
  new OllamaProvider(),
  new GeminiFastProvider(),
  new GeminiProProvider(),
];

export function registerProvider(p: AIProvider) { providers.push(p); }
```

The `registerProvider` hook is the **extensibility seam** that keeps every future provider — Firebase AI, AICore, OpenAI BYOK, Anthropic, locally-hosted Llama / Mistral / etc. — a plug-in rather than a rewrite. No caller, no router, no façade change is required to add one.

### Cost-guard stubs (Q3 decision)

The interface exposes `userId` and `onUsage` from day one, but the providers **only emit and record**:

- `userId` is logged with each request via the same `console.log` channel as today's quota errors. No DB write, no enforcement.
- `onUsage` is called with `{ promptTokens, completionTokens, provider, model }` parsed out of provider responses where available. No aggregation.

When multi-tenancy lands (PROJECT_PLAN Phase 1), the enforcement layer wraps these hooks — the façade does not change. This is the difference between "build the hook now" and "rebuild the façade to add the hook later."

## Migration plan — 5 days

| Day | ETC cycle | Output |
| --- | --- | --- |
| **1 (today)** | This ADR + memory entity update + workflow-change-log append | Locked contract, ready to build against |
| **2** | Create `src/lib/ai/` directory; move `lib/ai.ts` contents into `src/lib/ai/index.ts` + per-provider files; old `lib/ai.ts` re-exports as deprecated shim; `lib/gemini.ts` becomes a deprecated shim that proxies into the new façade | One source of truth; no caller migration yet; everything still compiles |
| **3** | Migrate the 9 direct-`lib/gemini.ts` callers in two batches: (a) skill-graph trio + news + scholar; (b) worker-rights + employment-report + learning + interview-prep | 13/13 routes through unified façade |
| **4** | Add `GeminiProProvider` + per-route `reason` task class adoption (where appropriate); finalize `onUsage` parsing for token counts in Gemini responses | Premium tier live; tokens recorded per call |
| **5** | Tests + browser smoke + delete the deprecated `lib/gemini.ts` shim once no callers remain + ADR promoted from Proposed → Accepted + handoff | Sprint closes |

## Forward Path

### §1 — Mobile providers (Scope C from ADR-0021)

Deferred per the original ADR-0021 deferral. The provider plug-in surface and task vocabulary defined here are designed so the Play Store push ADR can register without changes to the façade or any consumer:

- `FirebaseAIProvider` — same task surface, callable from native + web fallback. Likely supports all 5 task classes.
- `AICoreProvider` — on-device, supports `chat` + `summarize` and possibly `extract`. Reports `supports(task) === false` for `ground` and `reason`.
- `BYOKProvider` family — `openai-byok`, `anthropic-byok`. Requires a `UserAIConfig` Prisma model for per-user key storage; lands with multi-tenancy or shortly after.

**Re-entry trigger:** Play Store packaging sprint kicks off.

### §2 — Skill Registry (future ADR)

A future "skill" abstraction will sit **above** the provider router, not parallel to it. A Skill is:

```typescript
{
  id: string;
  name: string;              // user-facing
  systemPrompt: string;
  taskClass: AITaskClass;    // delegated to L1
  modelHint?: string;        // optional override
  tools?: ToolRef[];         // see §3 — Tool Surface
  owner: "system" | string;  // userId for user-authored skills
}
```

Skills are user-facing — visible in the UI, addressable by name — and may be system-shipped ("Grill Me", "Resume Bullet Polish") or user-authored (per-user career coaches, role-specific interviewers). Each Skill invocation lowers to one or more `ai.generate({ task, ... })` calls against this layer.

**Prior art worth studying when this ADR opens:** Anthropic Claude Skills, OpenAI GPTs / Assistants, MCP tool calling, LangChain `Runnable` interface.

**Re-entry trigger:** auth + multi-tenancy has landed (Skills need per-user ownership), AND at least 3 hard-coded "skill-shaped" features (e.g. Grill Me + Recruiter Flagger + one more) exist in code such that the inline pattern is visibly painful.

### §3 — Tool Surface (future ADR)

AI chat and skill executors will gain the ability to invoke external tools mid-conversation. **The wire protocol will be MCP (Model Context Protocol).** Each callable tool — whether a Resumsify-internal API route, a local MCP server (codegraph, memory), or an external one (Excalidraw, GitHub, Notion) — is registered with the same shape.

Provider implementations must report `supportsTools(): boolean`; only tool-capable providers (Gemini 2.0+, GPT-4+, Claude 3+, etc.) receive tool-call requests. Streaming tool calls require careful interleaving of token output and tool-call requests, which is one of the design points the future ADR has to nail.

Concrete shipping use case that motivates this layer: **chat-side visual diagrams via an Excalidraw MCP server during architecture explanations.** Resumsify's existing 53 API routes become MCP servers with thin wrappers — the multi-tenant security boundary lives once in the wrapper rather than scattered across routes.

**Re-entry trigger:** Skill Registry has shipped AND at least one concrete tool use case has product clarity (most likely: chat-side diagram rendering).

### Positive Consequences

- One source of truth for AI calls. New routes opt into the façade by default; the temptation to clone an existing direct call disappears.
- Per-user cost-guard becomes a configuration concern, not a refactor.
- Downstream features (Grill Me, RAG, resume suggestions, markitdown) gain a tier hint and a contract instead of inventing new ones.
- ADR-0021's deferral is preserved — Firebase AI, AICore, and BYOK still land on the Play push, but on top of a clean interface instead of greenfield code.
- The 3-layer architecture is documented in one place; future ADRs (Skill Registry, Tool Surface) inherit the boundary instead of negotiating it from scratch.
- Plug-in provider surface means a self-hosted Llama 3 or a future Anthropic relationship is a new file, not a refactor.

### Negative Consequences

- 13 routes touched in Days 2–3. Risk of behavior drift on any one of them; mitigated by the deprecated-shim staging.
- The intra-Gemini model-chain fallback (`gemini-2.0-flash-lite` → `gemini-1.5-flash`) becomes a `GeminiFastProvider` implementation detail. Other providers will not have an equivalent — quota recovery becomes per-provider, not central. Acceptable; it was already per-provider.
- We are intentionally getting ahead of ADR-0021's "defer until Play push" guidance for the web-side consolidation. ADR-0021 remains in force for Firebase AI / AICore / BYOK; future readers must not interpret this ADR as a license to start shipping mobile providers early.
- `reason` task class with no fast-tier fallback means any `gemini-2.5-pro` quota exhaustion surfaces directly to the user. Documented; intentional.
- Cost-guard hooks exist but are inert. Risk of complacency — somebody could see the hooks and assume enforcement is happening. Mitigated by inline comments and by the explicit deferral note here.

## Pros and Cons of the Options

### Option A — Consolidation only

- ✅ Smallest blast radius; ships in ~2 days
- ✅ Strictly honors ADR-0021's "no new providers"
- ❌ Downstream features (Grill Me deep mode, RAG synthesis) still have no premium tier
- ❌ Defers the premium-vs-fast routing decision to a second sprint that has to revisit the same code paths

### Option B — Consolidation + cloud-premium tier ⭐ CHOSEN

- ✅ One sprint covers consolidation, premium tier, cost-guard hooks, and the 3-layer foundation
- ✅ Premium tier unblocks 3+ downstream features without committing to a mobile timeline
- ✅ ADR-0021's mobile deferral remains intact in the Forward Path
- ❌ Adds a provider during a phase ADR-0021 said was "defer all concrete provider work" — requires explicit acknowledgement (done in this ADR)
- ❌ Five days of focused work; any sprint slip pushes downstream features

### Option C — Full ADR-0021 forward stack today

- ✅ Single design pass for the entire AI architecture
- ❌ Breaks ADR-0021's deferral promise mid-stream
- ❌ Drags the sprint into Capacitor / Firebase / AICore product decisions that are not ready
- ❌ Almost certainly lands in ~3 weeks, not 5 days
- ❌ Per-user storage of BYOK keys requires multi-tenancy, which itself requires PROJECT_PLAN Phase 1 (auth + Postgres). Out-of-order.

## Links / References

- [ADR-0021 — Mobile-first AI architecture & on-device Gemini strategy](./0021-mobile-first-ai-on-device-gemini.md) — the deferred parent decision
- [ADR-0037 — Shipyard context-engineering layer](./0037-shipyard-context-engineering-layer.md) — slice-vs-memory home for backend infra (this ADR's knowledge lives in the `AIServicesLayer` memory entity, not a slice, per ADR-0038 §G1 "UI-surface granularity")
- [ADR-0038 — Slice schema lock + Extractability NFR](./0038-slice-schema-and-extractability.md) — the rule that says "if you can't navigate to it as a user, it's not a slice"
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — the wire protocol committed for the future Tool Surface layer
- [Google Gemini API — Search grounding](https://ai.google.dev/gemini-api/docs/grounding) — used by `ground` task class today
- [Anthropic Claude Skills](https://docs.anthropic.com/) — prior art for the future Skill Registry
- Re-entry trigger for **graduation to Accepted**: end of Day 5 ETC, after all 13 routes migrated, premium tier live, and a green smoke pass. **Triggered 2026-06-21** — see Acceptance below.

## Acceptance (2026-06-21)

Graduation criteria met. The 5-day sprint shipped as designed:

| Day | Commit | Scope |
| --- | --- | --- |
| 1 | `1a3bfff` | ADR-0044 Proposed |
| 2 | `40e2c78` | `src/lib/ai/` consolidation — router + 3 providers (ollama, gemini-fast) + tests |
| 3 | `d97ceb2` | 14-caller migration to `ai.generate()` façade + `AIProviderError` + delete legacy `src/lib/ai.ts` / `src/lib/gemini.ts` shims |
| 4 | `24073cf` | `GeminiProProvider` (`reason` task) + `onUsage` callback wiring + token-count parsing across all providers |
| 5 | `e5fcbe0`, `1472f75` | Replace decommissioned `gemini-1.5` fallback models + hermetic smoke (6) + live smoke (5, env-gated) |

**Lab evidence at acceptance:**

- Hermetic suite: **860/860 green** (Vitest 4.1.9, Node env)
- Live smoke (`RUN_LIVE_SMOKE_AI=1`, 2026-06-21 evening): **5/5 green** — 1 real happy-path (`summarize` → ollama `gemma4:26b`, `{p:51, c:534}` tokens) + 4 accepted error-path 429s (Gemini free-tier quota exhausted, `limit: 0`; documented behavior, not a code defect)
- `gemini-1.5` lineup decommission caught by Day 5 live smoke and remediated in the same sprint window

**Known follow-up issues parked (not blocking acceptance):**

- `geminiErrorMessage()` returns generic `"AI extraction failed"` for non-429 errors; should surface the underlying error body for diagnosability. Tracked in `/memories/repo/parked-ideas.md`.
- Free-tier Gemini quota is `limit: 0` on this account; production deployments should either enable billing or rely entirely on the `ollama` tier. Captured in user memory.

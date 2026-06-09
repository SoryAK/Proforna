# Mobile-first AI architecture & on-device Gemini strategy

- **Status:** Proposed
- **Date:** 2026-06-09
- **Deciders:** Sory
- **Tags:** ai, mobile, android, ios, architecture, cost, privacy, strategy

## Context and Problem Statement

Resumsify today is a Next.js web app, but the long-term distribution target is the **Google Play Store** (Android) and, eventually, the App Store (iOS). Several in-flight features — worklog dictation (ADR-0020), worklog AI promotion/extraction (ADR-0011 — promotion pipeline), the parked "AI grills the user on their notes" idea, plus near-future summarization/polish features — all assume an LLM and ASR backend. Today the only realistic backend for these is **server-side OpenAI / Vertex** with all the usual costs: per-token billing, latency, network requirement, privacy concerns, vendor lock-in, and the operational overhead of API key management.

Two things change the calculus once Resumsify is a native Android app:

1. **AICore / Gemini Nano runs on-device** on Pixel 8 Pro+, Galaxy S24+, and every flagship Android shipping with Google Play Services AICore. Free, private, offline-capable, vendor-managed.
2. **Firebase AI (Vertex AI in Firebase)** gives cloud Gemini access with no API key in the app, no backend, generous free tier, and the same SDK works on every Android device — even those without AICore.

This ADR captures the **architectural commitment to a mobile-first AI strategy** so that decisions made *now* (server route shape, audio/text data model, where AI logic lives) don't paint us into a corner that has to be unwound when we ship to Play. It is **deliberately not committing to any AI feature implementation today** — that happens when we begin Phase 2 (Play Store push). What this ADR commits to is: **don't build web-only AI infra that will be thrown away.**

## Decision Drivers

- **Cost** — On-device Gemini Nano is $0/inference. Cloud Gemini via Firebase has a free tier that covers an indie launch comfortably. Both are dramatically cheaper than OpenAI at scale.
- **Privacy** — On-device inference means user data (resume content, worklog notes, audio) never leaves the phone. This is a real, marketable differentiator vs. competitors that pipe everything to OpenAI.
- **Friction** — Zero user setup. No API key prompts, no signup, no rate limit explanations. The phone already has the model.
- **Vendor lock-in risk** — Building all AI features against OpenAI today means a hard rip-out later. Building against an abstract "AIProvider" interface from day one keeps every option open.
- **Throwaway work** — Server-side Whisper plumbing, server-side OpenAI proxies, complex cost-guard middleware — all of this is rendered redundant the moment AICore is available. We should not build it twice.
- **Coverage gap** — AICore coverage is real but partial today (~20-30% of Android devices, growing fast). Need a tiered fallback: AICore → Firebase AI → optional OpenAI bring-your-own-key.

## Considered Options

- **Option A — Stay web-only, build OpenAI integration now, rewrite later.** Treat web as the only target until Play launch, then rewrite the AI layer.
- **Option B — Build the abstract AI provider interface now; defer implementations until Play.** Lock the contract early so server routes and data models are AI-aware, but don't implement any provider until the mobile push.
- **Option C — Skip AI entirely until Play launch.** Park every AI-dependent feature (dictation polish, summarization, AI grill, worklog promotion AI) until the Android app exists.
- **Option D — Build OpenAI as v1 and AICore as v2.** Ship cloud AI features on web now, layer on-device Gemini on top later in the Android client.

## Decision Outcome

**Chosen option: "Option B — Build the abstract AI provider interface now; defer implementations until Play."**, because it lets us continue developing the web app's AI-adjacent UX (consent flows, error handling, the prompt shape, response rendering) **without committing to a specific backend**. Server routes are shaped from day one to be thin and platform-agnostic — a future native client can hit them directly, or bypass them entirely for on-device inference.

This ADR explicitly **defers all concrete AI provider work to the Play Store push phase**. When we begin that phase, this ADR becomes the entry point for ADR-0022 (Provider implementations: AICore + Firebase AI + bring-your-own-key OpenAI fallback).

### Positive Consequences

- Zero throwaway AI infrastructure. Anything we build between now and Play launch is provider-agnostic.
- AICore + Firebase AI eliminate per-user inference cost almost entirely for the Android launch.
- The "AI grills the user on their notes" idea (parked from ADR-0020 context) becomes free to ship once we're on Android.
- The dictation v3 target (on-device whisper.cpp from ADR-0020) is partially superseded — AICore's multimodal Nano variants accept audio input directly. ADR-0020 v3 might collapse into "use AICore" instead of "embed whisper.cpp."
- Strong privacy story for marketing: "Your worklogs are processed on your phone, not on our servers."

### Negative Consequences

- We will not have *any* AI features on the web app until after Play launch (unless we explicitly add Chrome Built-in AI or OpenAI as an opt-in later).
- The "AI provider interface" needs to be designed well now even though it's unused — a bad shape will cost us at implementation time. Mitigation: keep it tiny (one method: `infer(prompt, opts) → text`) and only widen when a real consumer demands it.
- Forces an Android-first launch discipline. iOS support becomes a follow-up (Apple Intelligence is not exposed to third-party apps the way AICore is, so the iOS strategy will likely be Firebase AI cloud).
- Coverage gap on Android: ~70-80% of devices won't have AICore on day one of Play launch. Firebase AI fallback is mandatory, not optional.

## Pros and Cons of the Options

### Option A — Stay web-only, build OpenAI, rewrite later

- ✅ Ships AI features fastest in the short term
- ✅ Familiar pattern; tons of community examples
- ❌ Every line of OpenAI integration is dead code the day AICore ships in the Android app
- ❌ Per-user inference cost eats indie-launch margins
- ❌ Privacy story is "your data goes to OpenAI" — actively bad for a resume/career app
- ❌ Locks the data model into "AI features happen server-side" — exactly what AICore inverts

### Option B — Abstract interface now, implementations deferred

- ✅ Zero throwaway code
- ✅ Forces the right separation of concerns (UI / consent / contract / provider) before any provider exists
- ✅ Leaves the door open for Chrome Built-in AI as a desktop bonus later
- ✅ Aligns with ADR-0020's v3 forward path (on-device whisper.cpp / AICore)
- ❌ No AI features on the web app until Play push
- ❌ The interface shape is unverified until first real implementation lands

### Option C — Skip AI entirely until Play

- ✅ Simplest, zero risk
- ❌ AI is a major differentiator; postponing it 6+ months cedes marketing ground
- ❌ The "AI grill" feature and worklog promotion AI become dead backlog items

### Option D — OpenAI now, AICore later

- ✅ Best of both worlds in theory
- ❌ In practice = Option A's costs plus the complexity of maintaining two provider paths permanently
- ❌ Encourages the wrong "AI lives server-side" mental model that AICore breaks

## Forward Path (executed at Play Store push, not now)

When we begin the Android wrap (Play Store phase), a follow-up ADR (likely ADR-0022) will commit to specific providers. The expected stack:

| Layer            | Android (AICore-capable device)   | Android (other)              | iOS                   | Web (post-launch)           |
| ---------------- | --------------------------------- | ---------------------------- | --------------------- | --------------------------- |
| ASR (dictation)  | AICore / on-device                | Firebase AI Gemini cloud     | iOS Speech + Firebase | Web Speech (ADR-0020 v1)    |
| Summarize/polish | AICore Gemini Nano                | Firebase AI Gemini 1.5 Flash | Firebase AI           | Chrome Built-in AI (opt-in) |
| Heavy reasoning  | Firebase AI Gemini 2.0 Pro        | Firebase AI Gemini 2.0 Pro   | Firebase AI           | Firebase AI                 |
| User BYOK        | Optional OpenAI key (power users) | same                         | same                  | same                        |

**Concrete commitments deferred to ADR-0022:**

- The exact `AIProvider` TypeScript interface shape
- Which routes (if any) are "AI route handlers" vs. "data routes"
- The Android wrapper choice (Capacitor / native Kotlin shell / React Native)
- The Firebase project / auth setup
- AICore feature detection + graceful degradation policy
- The audio capture model for native (likely the platform `MediaRecorder` → AICore feed, replacing Web Speech entirely on mobile)

## Links

- Supersedes nothing.
- Supplements [ADR-0020 — Worklog dictation on-ramp](./0020-worklog-dictation-onramp.md) by reframing its v3 "on-device whisper.cpp" target as "on-device AICore (Android) / iOS Speech (iOS)."
- Related: [Google AI Edge — AICore SDK](https://developer.android.com/ai/aicore), [Firebase AI Logic](https://firebase.google.com/docs/ai-logic).
- Re-entry trigger: open this ADR (and draft ADR-0022) when starting the Play Store packaging sprint.

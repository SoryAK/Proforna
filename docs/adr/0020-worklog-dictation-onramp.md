# Worklog dictation v1 — Web Speech only, hybrid + on-device deferred

- **Status:** Accepted
- **Date:** 2026-06-08
- **Deciders:** Sory
- **Tags:** worklog, ai, frontend, audio, privacy

## Context and Problem Statement

Worklog notes are the primary capture surface in Resumsify — every brag-doc fact, every salary number, every "the manager said X in the 1:1" lives here. Typing is a friction tax on the user's most-frequent action. We want the user to be able to **dictate** notes in conversational form ("Today I shipped the Notion import on-ramp, the tests passed on the first green, we found out the schema already had the column…") and have that flow into the note body.

This ADR also explicitly captures the **forward path** for richer voice features (recorded audio attachments, re-transcribe, playback scrub) so that v1 can be built with the right seams to grow into v2 and v3 without a rewrite.

Constraints:

- **Privacy.** Worklog notes carry sensitive personal/compensation data. Audio leaving the user's machine is acceptable for v1 *only if it is not stored* server-side. The real long-term goal is **on-device transcription** (self-hosted whisper.cpp) — v1 should pick an architecture that can migrate there without redesigning the React surface.
- **Reliability.** Browser-native `SpeechRecognition` exists and gives a live word-by-word preview, but accuracy is mediocre and Safari/Firefox coverage is poor.
- **Latency.** Whisper API end-to-end is ~2-10 s — too slow for a "live" feel, but acceptable for a finalize pass after the user taps stop.
- **Surface area.** Quick Capture dialog is the primary target. The full Tiptap editor is a richer secondary target. Both should reuse the same hook.
- **Budget.** Whisper API is $0.006/min. A heavy daily user dictating 30 min/day = $5.40/month — acceptable for v1, not free.

## Decision Drivers

- **Conversational UX first.** "Like normal conversation" means streaming interim text appears as the user speaks — silence between mic-tap-stop and "transcript ready" kills the flow.
- **Privacy migration path.** v1 must not lock us out of swapping in self-hosted whisper.cpp. The React surface (hooks, dialog, editor command) is identical regardless of backend; only the route handler changes.
- **Reuse existing primitives.** shadcn/ui v2 (base-ui) Dialog, Button, existing toast pattern, existing Tiptap editor command surface. No new UI library.
- **Zero new server state.** v1 audio blobs are streamed straight to Whisper and dropped — no Prisma model, no blob storage, no audit row. (v2 changes this.)
- **Forward-compatible with voice-recording-as-attachment** (recorded audio saved to a note, replayable, re-transcribable) — see Forward Path.

## Considered Options

- **Option A — Web Speech API only** (browser-native `SpeechRecognition`, no backend)
- **Option B — Whisper finalize only** (`MediaRecorder` → server → OpenAI Whisper, no live preview)
- **Option C — Hybrid: Web Speech live preview + Whisper finalize** *(chosen)*
- **Option D — Self-hosted whisper.cpp from day one**

## Decision Outcome

**v1 ships Option A (Web Speech only). v1.5 = hybrid (Option C). v3 = on-device whisper.cpp (Option D).**

The user gets live word-by-word dictation in their default Chromium/Edge browser via the native `SpeechRecognition` API. No backend involvement, no API key, no per-minute cost, no audio leaves the device under Resumsify's control (it is still routed through Google/MS by the browser, documented in the consent modal). When dictation accuracy is the demonstrated bottleneck — not before — we add the Whisper finalize pass (v1.5) by swapping the `provider` arg on a single hook. When the user's privacy floor tightens — the stated real goal — we swap that same arg to `"local"` and route to a sidecar whisper.cpp (v3).

**Why v1=A instead of v1=C:**

1. We have not validated whether the user dictates daily. Spending the OpenAI dependency / cost / consent-modal complexity on a feature that may not survive its first week is premature.
2. The hybrid hook seam preserved in v1 means upgrading to v1.5 is a one-route + one-hook-prop change, not a refactor of every callsite.
3. Skipping the OpenAI dependency entirely until the UX is validated lets us upgrade **straight from v1 to v3** (Web Speech → on-device whisper.cpp) without ever taking on a cloud-vendor dependency. v1.5 (cloud Whisper) becomes a true contingency, not a mandatory waypoint.
4. Web Speech accuracy on a quiet-room, single-speaker, English-language session is genuinely good. The Whisper accuracy advantage is largest on accents, multi-speaker, and noisy environments — none apply to brag-doc note-taking alone at a desk.

### Positive Consequences

- **Ships fastest of the three options** — no API key signup, no billing setup, no `OPENAI_API_KEY` env scaffolding, no server route, no rate-limit table.
- **Zero new dependencies.** `MediaRecorder` + `SpeechRecognition` are browser-native. No npm packages added in v1.
- **Zero per-minute cost.** Web Speech is free.
- **Zero server-side audio handling.** v1 has no server route, no consent modal needs the "audio is sent to OpenAI" disclosure (the browser handles its own permission prompt).
- **Forward-compatible.** The `useVoiceDictation()` hook signature pre-commits the `provider: "webspeech" | "openai" | "local"` seam even though v1 only accepts `"webspeech"`. v1.5 and v3 do not rewrite a single callsite.
- **The voice-attachment forward path is unchanged** — see Forward Path → v2.

### Negative Consequences

- **Browser coverage gap.** Chrome/Edge work today. Safari is fragile (vendor-prefixed, intermittent), Firefox has no support. Mitigation: feature-detect, gracefully hide the mic button when unsupported, surface a one-line tooltip explaining the limitation.
- **Mediocre accuracy on accents / jargon / proper nouns.** Web Speech is a generalist; "Resumsify," "Tiptap," "Prisma" will be mangled. Mitigation: user types the proper noun once and Web Speech adapts within a session; v1.5 Whisper fixes it permanently.
- **Audio is still routed through Google/MS** by the browser's Web Speech implementation. Same privacy story as Option C's OpenAI route, just owned by the browser vendor instead of Resumsify. Documented in the consent modal.
- **No "polish on stop" UX.** Final transcript is whatever Web Speech said as the last interim result — no second-pass cleanup. v1.5 fixes this.
- **No graceful degradation for unsupported browsers in v1.** Safari/Firefox users see no mic button. Some may interpret this as the feature being broken. Mitigation: "Voice dictation (Beta) — Chrome/Edge only" badge in Settings.

## Pros and Cons of the Options

### Option A — Web Speech API only

- ✅ Zero backend, zero deps, zero secrets, zero cost
- ✅ Streaming interim results out of the box
- ❌ Chrome/Edge only realistically (Safari fragile, Firefox absent)
- ❌ Mediocre accuracy on jargon/accents; no post-processing
- ❌ Audio still routed through Google/MS cloud silently — same privacy concern as Option C, with worse accuracy

### Option B — Whisper finalize only

- ✅ Best-in-class accuracy
- ✅ Cross-browser (any browser with `MediaRecorder` = ~all of them)
- ❌ No live preview — silent UI for the duration of recording, then a 2-10 s wait
- ❌ Same OpenAI dependency / cost / privacy story as Option C, without the conversational feel that motivated the feature

### Option C — Hybrid *(chosen)*

- ✅ Conversational live feel via Web Speech
- ✅ Polished accurate final transcript via Whisper
- ✅ Graceful degradation when Web Speech is unavailable (Whisper still runs)
- ✅ React surface unchanged across v1→v3 (only route handler swaps)
- ❌ 2× implementation surface vs. A or B alone
- ❌ Same OpenAI dependency / cost / privacy story as B
- ❌ Edge case: Web Speech preview drift vs. Whisper final ("but I said X!") needs UI to set expectations

### Option D — Self-hosted whisper.cpp (v3 goal)

- ✅ Zero data leaves device — privacy-pure
- ✅ Zero per-minute cost after the initial CPU/RAM investment
- ✅ Works offline once installed
- ❌ Adds local infra (binary install, model weights download ~150 MB to ~1.5 GB depending on model size, sidecar process or WASM bundle)
- ❌ CPU/RAM hit during transcription (small model = 1× real-time on modern hardware; medium = 4× slower)
- ❌ Requires user setup OR Resumsify ships a binary — both have their own friction
- ❌ Premature today: Option C lets us validate the UX first; rebuilding for whisper.cpp once is cheap if the React surface is right

## Scope (v1)

In scope:

- **`useVoiceDictation()` hook** — owns the `SpeechRecognition` lifecycle, mic permission, session state machine (`idle` | `recording` | `error` | `unsupported`), 5-min hard cap, emits `{ liveTranscript, finalTranscript, status, error, start(), stop(), cancel() }`. **Hook signature pre-commits `provider: "webspeech" | "openai" | "local"` and `mode: "ephemeral" | "attached"` seams** even though v1 only accepts `provider: "webspeech"` and `mode: "ephemeral"`. v1.5 + v2 + v3 do not refactor callsites.
- **Browser support detection** — feature-detect `window.SpeechRecognition || window.webkitSpeechRecognition`. If absent, hook returns `status: "unsupported"` and the mic button does not render.
- **One-time consent modal** — before the very first mic activation per user, surface a concise disclosure: "Resumsify uses your browser's built-in speech recognition. Your audio is processed by your browser vendor (Google for Chrome/Edge) to convert speech to text. Resumsify itself never receives or stores your audio — only the transcript text." Opt-in is recorded as a user preference. Opt-out lives in Settings.
- **Quick Capture dialog integration** — mic button in the content textarea toolbar. Tap to start, tap to stop. Live transcript appended to the textarea content as Web Speech emits interim results. Final result is whatever the last `isFinal: true` event delivered when the user tapped stop.
- **Tiptap editor command** — mic button in the editor's bubble/floating menu. Same hook; insertion respects the y-prosemirror binding via `editor.commands.insertContent()` on each `isFinal: true` chunk.
- **Settings toggle** — "Voice dictation (Beta) — Chrome/Edge only" with the consent acknowledgment persisted.
- **Toast feedback** — mic icon switches to a pulsing red dot while recording. Tap-to-stop fires a `Dictation saved` toast on success, or a specific error toast (`Mic permission denied`, `Recognition timed out at 5 min`, `Browser doesn't support dictation`) on failure.
- **Telemetry hook (named, not wired)** — the hook accepts an optional `onTelemetry?: (event) => void` so v1.5's accuracy-validation work has a place to plug in without refactoring. v1 does not emit anything.

## Out of scope (v1)

These are deferred to named follow-up sprints, NOT permanently parked:

- **Whisper finalize pass.** Deferred to **v1.5** (see Forward Path). Re-enter when (a) dictation is used daily for at least a week, AND (b) accuracy or browser coverage is the demonstrated bottleneck.
- **Voice recording as an attached asset on a note** — saving the raw audio file, replay, scrub, re-transcribe. See Forward Path → v2.
- **AI grilling on note content** — separate feature, separate ADR, separate UI surface. Tracked in `/memories/repo/parked-ideas.md`.
- **On-device whisper.cpp transcription.** See Forward Path → v3 (the stated real goal).
- **Multi-language detection.** v1 = English only (`SpeechRecognition.lang = "en-US"`).
- **Punctuation/capitalization post-processing.** Web Speech inserts what it inserts; no GPT pass, no regex polish, no auto-paragraph-break heuristics.
- **Speaker diarization** ("Sory said X, the manager said Y").
- **Safari / Firefox support.** Re-enter if Safari's vendor-prefixed implementation stabilizes or if MDN reports Firefox shipping the API.
- **Mobile/PWA mic flow.** Browser support exists but testing surface is large; mobile after v1 desktop ships.
- **Editor cursor-position semantics beyond "append at current selection."** No mark preservation, no auto-paragraph-break heuristics.
- **Cost guard / usage cap / rate limit / `OPENAI_API_KEY` env scaffold.** All deferred with v1.5.

## Forward Path — voice as a first-class asset (informational, NOT v1 scope)

This ADR pre-commits the seams so we don't paint into a corner. Two named follow-up sprints turn dictation into a richer feature; the **real goal** is v3.

### v1.5 — Hybrid Whisper finalize (contingency, not mandatory)

Enter this sprint only if v1 dictation is used daily for at least a week AND accuracy or cross-browser coverage is the demonstrated bottleneck. Otherwise, skip straight to v3.

- Add `MediaRecorder` to the existing `useVoiceDictation()` hook (recording in parallel with the Web Speech preview).
- New route `POST /api/voice/transcribe` — accepts the audio blob on tap-stop, proxies to OpenAI Whisper (`whisper-1` or `gpt-4o-mini-transcribe`), returns `{ transcript, durationMs }`, **never writes audio to disk**.
- New env vars: `OPENAI_API_KEY` (server-only), `VOICE_TRANSCRIBE_DAILY_MINUTES_CAP` (default 30).
- New cost-guard table or in-memory counter (decide in the v1.5 ADR).
- Consent modal copy updated to disclose "audio is sent to OpenAI during transcription."
- Hook activates by setting `provider: "openai"` — zero callsite changes.
- Safari / Firefox become viable since the OpenAI path is browser-agnostic via `MediaRecorder`.

### v2 — Voice attachments

- **New Prisma model `WorkLogVoiceMemo`:** `id`, `workLogId` (nullable — memo can exist without a note for the "voice inbox" pattern), `userId`, `storageKey`, `mimeType`, `durationMs`, `transcript` (full text), `transcriptJson` (Whisper segments, only populated under v1.5+), `createdAt`. Unique on `(userId, storageKey)`.
- **Audio storage:** reuse the existing blob storage pattern (whatever the inline-photo support uses today — `WorklogDomain` memory note says Phase 2b shipped inline photos, so the bucket exists). Per-user folder, signed URLs, lifecycle rule for cleanup.
- **`WorkLog.voiceMemoIds: String[]` OR a `WorkLogAsset` join table** — decide in the v2 ADR.
- **UI:** voice memo chip in the read-mode renderer (`WorklogNoteReadView`) and the editor (`worklog-editor.tsx`) — play/pause/scrub, "View transcript" expansion, "Re-transcribe" command (re-runs Whisper if it has improved, useful when v3 lands).
- The v1 `useVoiceDictation()` hook gains `mode: "attached"` semantics — same prop, different downstream effect.

### v3 — On-device transcription (the stated real goal)

- **Self-hosted whisper.cpp** packaged as a WASM bundle (loaded lazily client-side) OR sidecar process. Decision in the v3 ADR.
- **No code change to the React surface.** The `useVoiceDictation()` hook reads a user preference and dispatches accordingly. The server route (if v1.5 shipped) gets a sibling local-transcribe path that never leaves the user's machine; if v1.5 was skipped, v3 is the first cloud-or-local decision and ships with `provider: "local"` as the default.
- **Settings:** "Transcription provider" dropdown — `Browser (Web Speech)` | `OpenAI Whisper (cloud)` (only present if v1.5 shipped) | `On-device (whisper.cpp)`. On-device becomes the recommended default once stable.
- **No cost guard for the on-device path.** OpenAI path (if shipped) keeps the cap.

### Why pre-commit this now

The v1 `useVoiceDictation()` hook signature must already include the seams (`mode: "ephemeral" | "attached"`, `provider: "webspeech" | "openai" | "local"`) even if it only accepts the v1 values, so v1.5 / v2 / v3 don't have to refactor every callsite. The v1 consent modal copy is written with "your browser vendor processes your audio" framing so v3 can deactivate that line cleanly when the local path is default. **v1 does NOT introduce `/api/voice/transcribe`** — that route lives in v1.5 — because shipping a server route with no implementation is dead code and a security review surface for nothing.

## Implementation Plan (v1)

Not committing the plan here in ADR detail — captured at the end of this turn outside the ADR for the user to confirm. ADR locks the **decision**, plan locks the **steps**.

## Open Questions (resolve before plan acceptance)

1. **Live insertion granularity** — push each `interim` result into the textarea (flicker-y but conversational) or only push on `isFinal: true` (lag-y but clean)? Default proposal: push on `isFinal: true` only, with a small "…" indicator after the last final chunk while interims are arriving.
2. **Mic button affordance** — icon-only button on the dialog content area top-right, or a labeled "Dictate" button below the textarea? Default proposal: icon-only button (Mic icon), labeled tooltip, visible pulse animation while recording.
3. **Consent persistence key** — reuse the existing `WorklogPreferences` JSON blob (add a `voiceDictationConsentedAt` field) or a separate row? Default proposal: extend `WorklogPreferences` to avoid a new table.
4. **Auto-stop after silence?** — originally rejected in favor of tap-to-stop, but Web Speech itself stops after ~5-10 s of silence by default. Do we auto-restart (until user taps stop) or treat the auto-stop as the session end? Default proposal: auto-restart so tap-to-stop remains the only end signal; surface a brief "paused, still listening" indicator when the underlying recognizer is restarting.

## Links / References

- [Web Speech API — MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API)
- [MediaRecorder — MDN](https://developer.mozilla.org/docs/Web/API/MediaRecorder)
- [OpenAI Whisper API — docs](https://platform.openai.com/docs/guides/speech-to-text)
- [whisper.cpp — GitHub](https://github.com/ggerganov/whisper.cpp)
- Related: [ADR-0009 — Worklog server-backed draft sync](./0009-worklog-server-backed-draft-sync.md) (dictation transcript joins the same draft sync pipeline)
- Related: [ADR-0010 — Tiptap Yjs worklog editor](./0010-tiptap-yjs-worklog-editor.md) (transcript insertion respects y-prosemirror binding)
- Related: parked AI-grilling-on-notes idea in `/memories/repo/parked-ideas.md` (post-v1)

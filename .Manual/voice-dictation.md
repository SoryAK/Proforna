# Feature: Voice Dictation (Beta) for Worklog Capture

**Status:** Shipped — Beta (smoke test deferred until mic hardware available)
**Owner:** Sory
**Related ADR(s):** [0020](../docs/adr/0020-worklog-dictation-onramp.md), [0021](../docs/adr/0021-mobile-first-ai-on-device-gemini.md)
**Source files:**
`src/components/worklog/voice/types.ts`,
`src/components/worklog/voice/use-voice-dictation.ts`,
`src/components/worklog/voice/use-voice-consent.ts`,
`src/components/worklog/voice/voice-dictation-consent-dialog.tsx`,
`src/components/worklog/voice/voice-dictation-button.tsx`,
`src/components/worklog/quick-capture-dialog.tsx` (wiring),
`src/components/worklog/worklog-editor-toolbar.tsx` (wiring),
`src/components/worklog/hooks/use-worklog-preferences.ts`,
`src/types/worklog.ts`,
`prisma/schema.prisma` (`WorkLogPreference.voiceDictationConsentedAt`),
`src/app/api/work-logs/preferences/route.ts`

---

## 1. Functional Description

Resumsify lets the user speak a worklog instead of typing it. A small mic icon
appears on two surfaces — the **Quick Capture dialog** (next to the *Notes*
label) and the **full Tiptap toolbar** (after the *Insert* dropdown). Clicking
it once starts dictation; clicking again stops. While recording, the icon
turns red with a pulsing dot in the corner so the user always knows the mic
is hot.

The first time the user clicks the mic in any session, a **consent dialog**
appears. The dialog plainly states that Resumsify uses the browser's built-in
speech recognition and that audio is sent to the **browser vendor's servers
(Google for Chrome and Edge)** — not to Resumsify. Once the user accepts, the
consent timestamp is saved to their profile and the dialog never reappears.
Browsers that don't support Web Speech (Firefox today) simply hide the button
— a non-functional control is worse than no control.

The transcribed text is appended to whatever surface owns the button: in
Quick Capture it appends to the Notes textarea; in the editor it inserts at
the current cursor position.

If something goes wrong — denied permission, no microphone, no internet — a
plain-English toast explains the cause and what to fix, with a diagnostic
suffix carrying the raw Web Speech error code so future bug reports are
actionable.

**Example user story:** *"As a job-seeker who just left a 30-minute
stand-up, I tap the mic in Quick Capture, speak the three things I want to
remember from the meeting, and tap save — all without unlocking my keyboard
or worrying that my audio is being uploaded to Resumsify."*

## 2. Internal Workflow

### Click flow (user already consented)

1. User clicks `<VoiceDictationButton>` on either surface.
2. The button reads `hasConsented` from `useVoiceConsent()`. If `true`, jumps to step 5.
3. Otherwise it opens `<VoiceDictationConsentDialog>` and waits.
4. On accept: `grantConsent()` PUTs the full preferences object with `voiceDictationConsentedAt: new Date().toISOString()` to `PUT /api/work-logs/preferences`, then `qc.setQueryData(["worklog-preferences"], saved)` so the rest of the UI sees the new timestamp without a refetch.
5. `start()` (from `useVoiceDictation`) constructs a `SpeechRecognition` instance via `window.SpeechRecognition || window.webkitSpeechRecognition`, sets `continuous: true`, `interimResults: true`, `maxAlternatives: 1`, `lang: "en-US"`, then calls `recognition.start()`.
6. The hook flips `status` from `"idle"` → `"recording"`. The button paints the destructive color and shows a pulsing red dot in the top-right corner.
7. Web Speech streams `onresult` events. The hook only acts on **final** results: it concatenates their transcripts (separated by spaces), trims, and calls `options.onFinalChunk(text)`. Interim results are ignored to avoid duplicate insertion.
8. `onFinalChunk` is wired per-surface:
   - **Quick Capture:** `setContent((prev) => (prev ? \`${prev} ${chunk}\` : chunk))` (appends to the Notes textarea state).
   - **Editor toolbar:** `editor.chain().focus().insertContent(\`${chunk} \`).run()` (inserts at the cursor).
9. Web Speech has a built-in silence timeout. The hook tracks a `wantsContinuationRef` flag — if `onend` fires while the user has not pressed Stop, it auto-restarts the recognition. This makes the session feel continuous up to the 5-minute hard cap.
10. The session ends three ways: (a) user clicks the mic again (`stop()` → graceful `recognition.stop()` and `wantsContinuationRef = false`), (b) hard cap fires (5 min — `stopInternal("cap")`), (c) error (any `onerror` → `stopInternal("error")` + tagged Error thrown to consumers).
11. On unmount the cleanup effect calls `stopInternal("unmount")` which calls `recognition.abort()` — the mic indicator in the browser tab disappears, no leaked stream.

### Error flow

1. Web Speech emits `event.error` ∈ {`not-allowed`, `service-not-allowed`, `audio-capture`, `network`, …}.
2. The hook constructs an `Error` whose `.message` is `"Speech recognition error: <event.error>"` and tags `.code = event.error`.
3. The hook exposes `error: Error | null` and flips `status` to `"error"`.
4. `<VoiceDictationButton>` runs a `useEffect` keyed on `error`. A `toastedErrorRef` ensures the same error never re-toasts on every render.
5. The toast calls `friendlyErrorMessage(code, raw)` which maps the code to an actionable title + description (see table in §3 below). The raw `code` is always appended in parentheses as a diagnostic for support / future bug reports.
6. The button paints destructive color while `status === "error"` until the user clicks it again to retry.
7. The hook also logs `console.error("[VoiceDictation] error", { code, message, error })` so the user can copy-paste the exact payload into a bug report.

### Consent persistence

1. `WorklogPreferences` (Prisma model `WorkLogPreference`, type `WorklogPreferences`) carries a single new field: `voiceDictationConsentedAt: string | null`.
2. The consent state is shared with all worklog preferences via the same TanStack Query cache key `["worklog-preferences"]`. `useVoiceConsent` is a narrow projection of `useWorklogPreferences`.
3. `grantConsent()` is a mutation: PUT the full prefs object with the new timestamp set, then write the response into the cache (no second fetch).
4. Revocation is **not** implemented in v1 — the user can clear it manually via the future generic worklog preferences pane (not built yet). For the beta, accepting once is intentionally a low-friction one-way handshake (per ADR-0020).

## 3. Configuration / Params

| Name | Location | Default | Purpose |
| ---- | -------- | ------- | ------- |
| `DEFAULT_MAX_DURATION_MS` | `use-voice-dictation.ts` | `5 * 60 * 1000` (5 min) | Hard cap per dictation session |
| `DEFAULT_LANG` | `use-voice-dictation.ts` | `"en-US"` | Web Speech language tag (i18n parked) |
| `recognition.continuous` | `use-voice-dictation.ts` | `true` | Keep streaming across pauses |
| `recognition.interimResults` | `use-voice-dictation.ts` | `true` | Receive partial events (only finals are emitted) |
| `recognition.maxAlternatives` | `use-voice-dictation.ts` | `1` | Single best transcription, no alternatives panel |
| `provider` (`VoiceDictationOptions`) | hook seam | `"webspeech"` | v1 only — `"openai"` and `"local"` enforced unreachable |
| `mode` (`VoiceDictationOptions`) | hook seam | `"ephemeral"` | v1 only — `"attached"` (audio retained) blocked for v1.5 |
| `voiceDictationConsentedAt` | DB column `WorkLogPreference` | `null` until accepted | One-time consent timestamp (ISO 8601) |
| `["worklog-preferences"]` | TanStack Query key | shared | Single source of truth for prefs cache; do NOT fork keys |
| Toast `duration` | `voice-dictation-button.tsx` | `10000` ms | Errors persist long enough to read the diagnostic code |

### Error → friendly message map

| Web Speech `code` | Title | Description |
| ----------------- | ----- | ----------- |
| `not-allowed`, `service-not-allowed`, `start-failed` | "Microphone unavailable" | Hardware missing OR site/OS permission blocked. Three things to check: mic plugged in, Chrome site mic = Allow, Windows Privacy → Microphone = on. |
| `audio-capture` | "No microphone detected" | Plug a mic in and try again. |
| `network` | "Speech recognition offline" | Web Speech needs an internet connection. |
| *(any other)* | "Voice dictation failed" | Raw error message echoed verbatim. |

All toasts append `(diagnostic: code="...")` so the user can paste the exact code into a bug report.

## 4. Known Constraints

- **Chrome / Edge only on desktop.** Firefox lacks Web Speech entirely → the button hides on `status === "unsupported"`. Safari supports it on iOS / macOS but runs the recognizer on-device, which has slightly different behavior than the cloud-streamed Chrome/Edge flow.
- **Audio leaves the browser.** Chrome and Edge route audio to Google's servers (per Web Speech API design). Resumsify never sees the audio — but it does pass through a third party. Consent copy says this plainly.
- **English only.** `lang = "en-US"`. Other locales work if you swap the constant, but no UI to pick a locale yet.
- **No `Beta` indicator on the button itself.** The label says "Dictate (Beta)" in the tooltip only. Users may not notice they're on a beta path.
- **No revocation UI.** Consent is a one-way switch in v1. To revoke, a user has to clear it via DB or the future prefs pane.
- **No transcript retention.** Audio is never stored; the converted text is the only artifact. There is no "review the raw transcript" feature, no Otter-style timeline.
- **Hard 5-min cap per session.** Long meetings need to be re-triggered. Auto-restart-on-silence keeps things smooth within a session, but the cap is non-negotiable per ADR-0020 to avoid Web Speech runaway sessions.
- **Final-results-only.** Interim text doesn't show in the surface. Users sometimes pause mid-sentence and expect to see the partial — by design they don't.
- **No "what did I just say?" undo of last chunk.** Standard editor undo works for the inserted text in the Tiptap surface but not for the textarea in Quick Capture (textarea has no undo stack we own).
- **No telemetry.** `onTelemetry` is reserved in the type but no surface wires it. ADR-0020 v2 work.
- **`not-allowed` is overloaded.** Chrome reports `not-allowed` for both "permission denied" *and* "no microphone connected" (`NotFoundError` under the hood, but Web Speech surfaces it as `not-allowed`). The friendly message addresses both possibilities; the diagnostic snippet (`navigator.mediaDevices.getUserMedia({audio:true})`) is the deterministic way to disambiguate — kept in the codebase comments and the user manual here.
- **Smoke test deferred.** Implementation complete + error path validated end-to-end (button → hook → tagged error → toast). Happy path (button → speak → text appears) was not verified on this machine — no microphone hardware available at ship time. Re-test when a USB mic arrives or when the feature is used from a phone via the wider product.

## 5. Future / Deferred

See [ADR-0020](../docs/adr/0020-worklog-dictation-onramp.md) for the staged plan:

- **v1.5** — OpenAI Whisper provider (BYOK key, server-side relay). Same `onFinalChunk` contract — the `VoiceDictationOptions.provider` seam already exists.
- **v3** — On-device whisper.cpp. May collapse to AICore on Android + iOS Speech on iOS once the mobile sprint lands (per [ADR-0021](../docs/adr/0021-mobile-first-ai-on-device-gemini.md)).
- **Telemetry** — wire `onTelemetry` to capture session length / error code distribution.
- **Locale picker** — surface `lang` selection in the worklog preferences pane.
- **Revocation UI** — toggle in worklog preferences pane to clear `voiceDictationConsentedAt`.
- **Drag-to-record-elsewhere** — a global "hold-to-talk" gesture on the Quick Capture trigger.

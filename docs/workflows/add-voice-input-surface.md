# Add a voice-input surface to a text-capture component

**Workflow Type:** `add-voice-input-surface`
**Last Updated:** 2026-06-09

## Stack Context

- Next.js 16 (App Router, `src/app/**`)
- Tiptap 3 (`@tiptap/react@^3`) + Y.js — editor surfaces use `editor.chain().focus().insertContent(...).run()` for programmatic insertion
- shadcn/ui v2 (base-ui) `Button` + `Dialog` — **no `asChild`** on Trigger; consent dialog manages its own open state via `useState`
- sonner toast library — `toast.error(title, { description, duration })`
- TanStack Query v5 — single shared key `["worklog-preferences"]` for prefs (do not fork)
- Web Speech API — `window.SpeechRecognition || window.webkitSpeechRecognition`, **Chrome/Edge only** on desktop (Firefox hides UI; Safari runs on-device with different behavior)
- Prisma v6 — `WorkLogPreference` carries the consent timestamp (`voiceDictationConsentedAt: DateTime?`)
- Pre-existing dev DB drift on Resumsify means `prisma migrate dev` cannot run end-to-end. The proven path is `prisma db execute --stdin` with a surgical `ALTER TABLE IF NOT EXISTS` (see Gotchas).

## When this recipe applies

You are adding a microphone button to an existing text-capture surface so the
user can dictate text into it. The pattern reuses the `useVoiceDictation` hook
and `<VoiceDictationButton>` component shipped in Sprint 6C, so each new
surface only contributes one `onFinalChunk` callback and the placement of the
button. No new hook, no new provider, no schema change.

## Successful Sequence

1. **Identify the insertion target** in the surface component:
   - If the surface is a Tiptap editor: you'll insert via `editor.chain().focus().insertContent(\`${chunk} \`).run()`.
   - If the surface is a `<textarea>` controlled by React state: you'll append via `setX((prev) => (prev ? \`${prev} ${chunk}\` : chunk))`.
2. **Import the button**: `import { VoiceDictationButton } from "@/components/worklog/voice/voice-dictation-button";`
3. **Decide placement**:
   - For inline labels (Quick Capture pattern): wrap the label in a flex row — `<div className="flex items-center justify-between">` — and put the button at the end of the row.
   - For toolbars (Tiptap pattern): drop the button between groups with a `<div className="w-px h-4 bg-border mx-1" />` separator so it reads as a distinct toolgroup.
4. **Choose button sizing** to match the surrounding controls (`h-8 w-8` for labels, `h-7 w-7` for toolbar density). Pass via `className` prop.
5. **Wire `onFinalChunk`** with one of the two patterns from step 1. Keep it pure — no side-effects beyond updating the target state / editor.
6. **(Optional) Override `title`** prop only if the default "Dictate (Beta)" doesn't read well in your surface.
7. **Smoke test** in Chrome with a real microphone:
   - First click triggers consent dialog. Accept.
   - Second click starts recording (icon turns red, pulsing dot appears).
   - Speak. Final chunks land in the target after each natural pause.
   - Click again stops cleanly (icon back to neutral; no mic indicator on the tab).
   - Refresh page → click mic → no consent prompt (timestamp persisted).
8. **Smoke test the error path**:
   - In Chrome → site settings → set Microphone = Block.
   - Click mic → toast appears: "Microphone unavailable" with `(diagnostic: code="not-allowed")` suffix.
   - Console contains `[VoiceDictation] error { code, message, error }`.
9. **Phase 4 update**:
   - Append a "Surface" bullet to `.Manual/voice-dictation.md` §1 listing your new surface.
   - Add the surface to the Memory Keeper observation for `WorklogDomain` (or whichever domain owns it).

## First-Attempt Failures

1. **Tried to put `<VoiceDictationButton>` inside a `<DropdownMenuTrigger>`.** base-ui Trigger owns its own `onClick` for opening the menu; nesting a button that swallows the click breaks both. → Wire the mic as a sibling control, not a wrapped child.
2. **Tried to fork the query key** to `["worklog-preferences", "voice"]` so the consent UI didn't have to round-trip the entire prefs object. → Re-uses the same cache, no contention, less code. Drop the fork.
3. **Tried to call `recognition.start()` and `recognition.stop()` directly from React event handlers without a `wantsContinuationRef`.** Web Speech triggers `onend` after silence; without the continuation flag, the session feels broken at every natural pause. → Auto-restart on `onend` when the user has not pressed Stop.
4. **Tried to emit interim results to `onFinalChunk`.** Surface gets every interim word inserted, duplicates, and looks like a typewriter glitch. → Only forward **final** results.
5. **Tried to use `lib.dom.d.ts`'s `SpeechRecognition` types.** It doesn't ship them in any usable form. → Inline minimal ambient types in `use-voice-dictation.ts`.
6. **Tried to attach a `onClick` to `<DropdownMenuItem>` that opens the consent dialog.** base-ui `MenuItem` only supports `onClick` (not the Radix `onSelect`); was already correct, but momentarily was tempted to align with Radix patterns. Lesson: stay on `onClick` for base-ui.
7. **Tried to use `prisma migrate dev` to add `voiceDictationConsentedAt`.** Dev DB has pre-existing drift (Asset tables, `JobAsset.assetType → assetTypeId` rename, `WorkLog.search_vector` tsvector generated column). Prisma proposed `migrate reset`, which would drop user data. Refused. **Workaround:** `'ALTER TABLE "WorkLogPreference" ADD COLUMN IF NOT EXISTS "voiceDictationConsentedAt" TIMESTAMP(3);' | npx prisma db execute --stdin --schema prisma/schema.prisma`, then `npx prisma generate`.
8. **Tried to run `npx prisma generate` while dev server was up.** Windows DLL lock on `query_engine-windows.dll.node` (held by Next dev PID). Workaround: kill the dev PID first (`Stop-Process -Id <pid> -Force`), generate, then restart `npm run dev`.

## Gotchas

1. **Chrome's `not-allowed` is overloaded.** It fires for "permission denied" *and* for "no microphone connected" (`NotFoundError` under the hood, surfaced as `not-allowed` by Web Speech). The deterministic disambiguator is `navigator.mediaDevices.getUserMedia({ audio: true })` in the console — `NotFoundError` means hardware absent; `NotAllowedError` means permission. Friendly toast must speak to both possibilities.
2. **OneDrive sync locks Prisma DLLs.** When running `prisma generate` after a schema change, expect intermittent EPERM. Killing the dev server first is the simplest fix.
3. **Pre-existing dev DB drift** means new columns must be added via `prisma db execute` rather than `prisma migrate dev`. Migration history is not in sync — flag this in any handoff that touches Prisma.
4. **Web Speech audio leaves the browser.** Chrome/Edge route to Google. Consent copy must say so explicitly (per ADR-0020). Do not paraphrase the consent message.
5. **Don't `asChild` on shadcn/ui v2 (base-ui).** It's not supported. Use `<Button asChild={false}>` or `render` prop.
6. **Don't bind global keyboard shortcuts that browsers claim.** `Ctrl+Shift+N` opens a new browser window — already documented in `src/components/command-palette.tsx:80`. Voice-related shortcut ideas (e.g. `Ctrl+Shift+V` for "voice") need a browser-claim check first.
7. **Hard 5-minute cap per session.** Per ADR-0020 and enforced in `use-voice-dictation.ts`. Surfaces should not extend or override.
8. **The `provider` seam is enforced.** Setting `provider: "openai"` or `mode: "attached"` in `VoiceDictationOptions` throws today. They're reserved for v1.5 / v3.
9. **Sonner toast `duration` should be at least 8s for errors.** Default 4s is not long enough to read the action items + diagnostic code.
10. **Y.js + Tiptap toolbar interaction:** the editor's `insertContent` plays nicely with the Yjs collab undo stack — no special handling required.

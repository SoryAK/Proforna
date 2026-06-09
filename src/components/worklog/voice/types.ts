/**
 * Voice dictation contracts — shared across the hook, button, and consent
 * dialog. Owned by ADR-0020 (worklog dictation on-ramp).
 *
 * The hook signature is deliberately wider than v1 needs:
 *   - `provider` reserves room for v1.5 ("openai" → server-side Whisper) and
 *     v3 ("local" → on-device whisper.cpp) without forcing callsite rewrites.
 *   - `mode` reserves room for v1.5 "attached" mode where audio is uploaded
 *     and persisted as a worklog attachment alongside the transcript.
 *
 * v1 only accepts provider="webspeech" + mode="ephemeral". The hook throws
 * on anything else so unimplemented paths fail loud, not silent.
 */

export type VoiceDictationStatus = "idle" | "recording" | "error" | "unsupported";

export type VoiceDictationProvider = "webspeech" | "openai" | "local";

export type VoiceDictationMode = "ephemeral" | "attached";

export interface VoiceDictationOptions {
  /** Recognition backend. v1 only supports "webspeech". */
  provider?: VoiceDictationProvider;
  /** Storage mode. v1 only supports "ephemeral" (transcript text only). */
  mode?: VoiceDictationMode;
  /** BCP-47 language tag passed to SpeechRecognition.lang. Defaults to "en-US". */
  lang?: string;
  /**
   * Hard ceiling on a single recording session. Web Speech browsers throttle
   * long sessions and the user has zero feedback when they're cut off, so we
   * stop ourselves at a known boundary. Default 5 minutes.
   */
  maxDurationMs?: number;
  /**
   * Fired ONCE per finalized utterance (Web Speech `isFinal: true`). v1
   * callers append the chunk to their target surface (Textarea, Tiptap).
   * Interim transcripts are exposed via `liveTranscript` for UI overlays only.
   */
  onFinalChunk?: (text: string) => void;
  /** Surfaced when the underlying recognition errors out. */
  onError?: (err: Error) => void;
  /**
   * Lightweight telemetry sink for v2 instrumentation. v1 is allowed to leave
   * this unset; the hook always calls it defensively so future wiring is
   * additive only.
   */
  onTelemetry?: (event: { type: string; meta?: Record<string, unknown> }) => void;
}

export interface VoiceDictationApi {
  status: VoiceDictationStatus;
  /** Interim transcript since the last finalized chunk (UI feedback only). */
  liveTranscript: string;
  /** Concatenation of every finalized chunk this session. */
  finalTranscript: string;
  error: Error | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

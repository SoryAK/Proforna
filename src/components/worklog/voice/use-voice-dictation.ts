/**
 * useVoiceDictation — v1 worklog dictation hook.
 *
 * Backed by the browser-native Web Speech API (per ADR-0020 v1 Option A).
 * Owns the full lifecycle: feature-detection, mic permission, start/stop,
 * auto-restart on Web Speech's internal silence timeout, and a 5-minute hard
 * cap so abandoned sessions can't leave the mic open.
 *
 * v1 boundary enforcement: the `provider`/`mode` options exist to lock the
 * eventual v1.5 hybrid (server Whisper) and v3 (whisper.cpp on-device) hook
 * signature now, but anything other than `provider: "webspeech"` +
 * `mode: "ephemeral"` throws — unimplemented paths must fail loud.
 *
 * v1 explicitly does NOT:
 *   - upload audio anywhere (mode="attached" is reserved for v1.5+)
 *   - call any server route
 *   - persist audio
 *   - render a permission UI (consent is handled by VoiceDictationConsentDialog)
 *
 * Browser support: realistically Chrome/Edge only. Safari/Firefox return
 * `status: "unsupported"` and the button hides itself.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VoiceDictationApi,
  VoiceDictationOptions,
  VoiceDictationStatus,
} from "./types";

// ─── Minimal Web Speech ambient types ───────────────────────────────────
// lib.dom.d.ts doesn't ship SpeechRecognition (it's still a draft). We only
// need the surface we actually call, so we inline rather than pull in a
// dependency.

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => unknown) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_LANG = "en-US";

export function useVoiceDictation(options: VoiceDictationOptions = {}): VoiceDictationApi {
  const {
    provider = "webspeech",
    mode = "ephemeral",
    lang = DEFAULT_LANG,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    onFinalChunk,
    onError,
    onTelemetry,
  } = options;

  // v1 boundary: refuse to silently degrade. v1.5/v3 wiring should land here
  // explicitly, not by accident.
  if (provider !== "webspeech") {
    throw new Error(`useVoiceDictation: provider="${provider}" not yet implemented in v1`);
  }
  if (mode !== "ephemeral") {
    throw new Error(`useVoiceDictation: mode="${mode}" not yet implemented in v1`);
  }

  // Determine support once on mount. We don't recompute — if the browser
  // doesn't expose SpeechRecognition, it won't appear mid-session.
  const [status, setStatus] = useState<VoiceDictationStatus>(() =>
    getRecognitionCtor() ? "idle" : "unsupported",
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<Error | null>(null);

  // Stable refs for callbacks — recognition handlers fire across React renders
  // and we don't want to recreate the recognition instance just because a
  // parent re-rendered.
  const onFinalChunkRef = useRef(onFinalChunk);
  const onErrorRef = useRef(onError);
  const onTelemetryRef = useRef(onTelemetry);
  useEffect(() => {
    onFinalChunkRef.current = onFinalChunk;
  }, [onFinalChunk]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onTelemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const sessionActiveRef = useRef(false);
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether `onend` should auto-restart. Web Speech ends the stream
  // after ~10s of silence even when continuous=true; we restart silently so
  // the user perceives one continuous session up to the hard cap.
  const wantsContinuationRef = useRef(false);

  function emitTelemetry(type: string, meta?: Record<string, unknown>) {
    try {
      onTelemetryRef.current?.({ type, meta });
    } catch {
      // Telemetry must never break the hook.
    }
  }

  function clearHardCap() {
    if (hardCapTimerRef.current != null) {
      clearTimeout(hardCapTimerRef.current);
      hardCapTimerRef.current = null;
    }
  }

  function teardownRecognition(recognition: SpeechRecognitionInstance | null) {
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
  }

  function buildRecognition(): SpeechRecognitionInstance | null {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    return r;
  }

  function stopInternal(reason: "user" | "cap" | "cancel" | "error") {
    wantsContinuationRef.current = false;
    sessionActiveRef.current = false;
    clearHardCap();
    const r = recognitionRef.current;
    if (r) {
      try {
        if (reason === "cancel" || reason === "error") {
          r.abort();
        } else {
          r.stop();
        }
      } catch {
        // ignore — recognition may already be stopped.
      }
    }
  }

  const start = useCallback(async () => {
    if (status === "unsupported") return;
    if (sessionActiveRef.current) return;

    const recognition = buildRecognition();
    if (!recognition) {
      setStatus("unsupported");
      return;
    }

    setError(null);
    setLiveTranscript("");
    setFinalTranscript("");

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        const transcript = alt.transcript;
        if (result.isFinal) {
          const chunk = transcript.trim();
          if (chunk.length > 0) {
            setFinalTranscript((prev) => (prev ? `${prev} ${chunk}` : chunk));
            try {
              onFinalChunkRef.current?.(chunk);
            } catch (err) {
              // Caller's append crashed — surface, but keep recording.
              const e = err instanceof Error ? err : new Error(String(err));
              setError(e);
              onErrorRef.current?.(e);
            }
          }
        } else {
          interim += transcript;
        }
      }
      setLiveTranscript(interim);
    };

    recognition.onerror = (event) => {
      // Web Speech errors include "no-speech" (recoverable — onend will fire
      // and we'll auto-restart), "aborted" (user-initiated), and real errors
      // ("not-allowed", "audio-capture", "network"). Treat the recoverable
      // ones as no-ops; surface the rest.
      const code = event.error;
      if (code === "no-speech" || code === "aborted") {
        emitTelemetry("voice.recoverable_error", { code });
        return;
      }
      const e = new Error(`Speech recognition error: ${code}${event.message ? ` — ${event.message}` : ""}`);
      // Attach the raw Web Speech code so callers can branch on it without
      // string-sniffing the message (e.g. "not-allowed" → actionable toast).
      (e as Error & { code?: string }).code = code;
      setError(e);
      setStatus("error");
      onErrorRef.current?.(e);
      emitTelemetry("voice.error", { code });
      stopInternal("error");
    };

    recognition.onend = () => {
      // Web Speech's continuous mode still cuts the stream on silence. If the
      // user hasn't asked us to stop, restart so the session feels seamless.
      if (wantsContinuationRef.current) {
        try {
          recognition.start();
        } catch (err) {
          // Some browsers reject `start()` if called too fast after `onend`.
          // Backoff once and retry; if that still fails we give up cleanly.
          setTimeout(() => {
            if (!wantsContinuationRef.current) return;
            try {
              recognition.start();
            } catch {
              const e = err instanceof Error ? err : new Error("Failed to restart recognition");
              setError(e);
              setStatus("error");
              onErrorRef.current?.(e);
              stopInternal("error");
            }
          }, 250);
        }
        return;
      }
      setStatus("idle");
      setLiveTranscript("");
      emitTelemetry("voice.stopped");
    };

    recognition.onstart = () => {
      emitTelemetry("voice.started");
    };

    recognitionRef.current = recognition;
    wantsContinuationRef.current = true;
    sessionActiveRef.current = true;

    // Hard cap so abandoned sessions don't keep the mic open indefinitely.
    hardCapTimerRef.current = setTimeout(() => {
      emitTelemetry("voice.hard_cap_reached", { maxDurationMs });
      stopInternal("cap");
    }, maxDurationMs);

    try {
      recognition.start();
      setStatus("recording");
    } catch (err) {
      // start() throws if mic permission is denied at the OS level, or if
      // the user starts/stops too fast. Surface either way.
      const e = err instanceof Error ? err : new Error("Failed to start recognition");
      // Best-effort code tag — start() exceptions don't carry the Web Speech
      // error code, but "not-allowed" is by far the most common case here.
      (e as Error & { code?: string }).code = (e as Error & { code?: string }).code ?? "start-failed";
      setError(e);
      setStatus("error");
      onErrorRef.current?.(e);
      emitTelemetry("voice.start_failed", { message: e.message });
      stopInternal("error");
    }
  }, [status, lang, maxDurationMs]);

  const stop = useCallback(() => {
    if (!sessionActiveRef.current) return;
    stopInternal("user");
  }, []);

  const cancel = useCallback(() => {
    if (!sessionActiveRef.current) {
      setLiveTranscript("");
      setFinalTranscript("");
      return;
    }
    stopInternal("cancel");
    setLiveTranscript("");
    setFinalTranscript("");
  }, []);

  // Tear down on unmount — recognition holding the mic across a route change
  // is a bug we don't want to debug later.
  useEffect(() => {
    return () => {
      wantsContinuationRef.current = false;
      sessionActiveRef.current = false;
      clearHardCap();
      const r = recognitionRef.current;
      if (r) {
        try {
          r.abort();
        } catch {
          // ignore
        }
        teardownRecognition(r);
      }
      recognitionRef.current = null;
    };
  }, []);

  return {
    status,
    liveTranscript,
    finalTranscript,
    error,
    start,
    stop,
    cancel,
  };
}

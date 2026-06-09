/**
 * VoiceDictationButton — icon-only mic that toggles a dictation session.
 *
 * Owns:
 *   - the useVoiceDictation hook (one instance per button, so two surfaces
 *     can't fight over the mic)
 *   - the first-run consent flow (shows VoiceDictationConsentDialog if the
 *     user hasn't accepted yet)
 *   - the visual states: idle → recording (pulsing red dot) → error
 *   - hiding itself when the browser doesn't support Web Speech (per ADR Q2)
 *
 * Surfaces (Quick Capture, Tiptap toolbar) only pass `onFinalChunk` — the
 * exact same shape the future v1.5 OpenAI/v3 whisper.cpp backends will emit,
 * so callsites never need to change.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceDictation } from "./use-voice-dictation";
import { useVoiceConsent } from "./use-voice-consent";
import { VoiceDictationConsentDialog } from "./voice-dictation-consent-dialog";

interface VoiceDictationButtonProps {
  /** Append the finalized transcript chunk to the target surface. */
  onFinalChunk: (text: string) => void;
  /** Optional className passthrough for surface-specific sizing. */
  className?: string;
  /** Optional title override for the tooltip. */
  title?: string;
}

/** Maps Web Speech error codes to a user-actionable toast. */
function friendlyErrorMessage(code: string | undefined, raw: string): {
  title: string;
  description: string;
} {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
    case "start-failed":
      return {
        title: "Microphone unavailable",
        description:
          "Either no microphone is connected, or the browser/OS is blocking access. Check: (1) a mic is plugged in (Settings → Sound → Input shows a device), (2) Chrome's site permission is Allow, (3) Windows Settings → Privacy → Microphone is on. Reload after fixing.",
      };
    case "audio-capture":
      return {
        title: "No microphone detected",
        description: "Connect a microphone and try again.",
      };
    case "network":
      return {
        title: "Speech recognition offline",
        description: "Web Speech needs an internet connection. Check your network and try again.",
      };
    default:
      return {
        title: "Voice dictation failed",
        description: raw,
      };
  }
}

export function VoiceDictationButton({
  onFinalChunk,
  className,
  title,
}: VoiceDictationButtonProps) {
  const { hasConsented } = useVoiceConsent();
  const [consentOpen, setConsentOpen] = useState(false);

  const { status, start, stop, error } = useVoiceDictation({
    onFinalChunk,
  });

  // Toast the first time a given error surfaces. Refs (not state) so we don't
  // re-toast on every render once the user has seen the message.
  const toastedErrorRef = useRef<Error | null>(null);
  useEffect(() => {
    if (!error || toastedErrorRef.current === error) return;
    toastedErrorRef.current = error;
    const code = (error as Error & { code?: string }).code;
    // Log raw payload to console so users can copy-paste exact diagnostics.
    // eslint-disable-next-line no-console
    console.error("[VoiceDictation] error", { code, message: error.message, error });
    const { title: t, description } = friendlyErrorMessage(code, error.message);
    // Always append the raw code so we can distinguish browser-blocked
    // (service-not-allowed, common in Brave) from OS-blocked (not-allowed)
    // from hardware-missing (audio-capture) without another debug round-trip.
    const debugDescription = code
      ? `${description}\n\n(diagnostic: code="${code}")`
      : description;
    toast.error(t, { description: debugDescription, duration: 10000 });
  }, [error]);

  // Hide entirely on unsupported browsers — a non-functional control is
  // worse than a missing one, and Beta is opt-in anyway.
  if (status === "unsupported") return null;

  const isRecording = status === "recording";

  async function handleClick() {
    if (isRecording) {
      stop();
      return;
    }
    if (!hasConsented) {
      setConsentOpen(true);
      return;
    }
    await start();
  }

  function handleConsented() {
    // Fire-and-forget — start() is async but the button can show its
    // recording state via the hook's status update.
    void start();
  }

  const tooltip = error
    ? `Voice dictation error: ${error.message}`
    : title ?? (isRecording ? "Stop dictation" : "Dictate (Beta)");

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        title={tooltip}
        aria-label={tooltip}
        aria-pressed={isRecording}
        className={cn(
          "relative h-8 w-8",
          isRecording && "text-destructive",
          status === "error" && "text-destructive",
          className,
        )}
      >
        <Mic className="h-4 w-4" />
        {isRecording && (
          <span
            aria-hidden
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive animate-pulse"
          />
        )}
      </Button>
      <VoiceDictationConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConsented={handleConsented}
      />
    </>
  );
}

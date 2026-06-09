/**
 * VoiceDictationConsentDialog — one-time modal shown the first time a user
 * taps the mic button. Copy locked by ADR-0020 (be explicit that audio leaves
 * the device via the browser vendor; v3 will move this on-device).
 *
 * Hidden when the user has already consented. Accept writes an ISO timestamp
 * to WorklogPreferences.voiceDictationConsentedAt; Cancel just closes.
 */

"use client";

import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useVoiceConsent } from "./use-voice-consent";

interface VoiceDictationConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after consent is persisted; the caller then starts recording. */
  onConsented: () => void;
}

export function VoiceDictationConsentDialog({
  open,
  onOpenChange,
  onConsented,
}: VoiceDictationConsentDialogProps) {
  const { grantConsent, isSaving } = useVoiceConsent();

  async function handleAccept() {
    try {
      await grantConsent();
      onOpenChange(false);
      onConsented();
    } catch {
      // useVoiceConsent doesn't surface a toast; keep the dialog open so the
      // user can retry. Errors here are rare (the prefs route is well-trodden).
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isSaving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable voice dictation (Beta)</DialogTitle>
          <DialogDescription>
            Quickly capture notes with your voice instead of typing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Resumsify uses your browser&apos;s built-in speech recognition. Your audio is
            processed by your browser vendor (typically Google for Chrome and Edge) — it is
            not sent to Resumsify servers, and we do not store the audio.
          </p>
          <p>
            Only the final transcribed text is saved with your worklog. You can stop at any
            time, and your microphone is only active while you&apos;re recording.
          </p>
          <p className="text-xs">
            Voice dictation works best in Chrome and Edge. Other browsers may not support it.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleAccept} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept &amp; start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

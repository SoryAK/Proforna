/**
 * useVoiceConsent — narrow accessor for the worklog dictation consent
 * timestamp stored on WorklogPreferences. Centralized so the button and the
 * consent dialog don't drift on cache keys or save shape.
 *
 * Shares the ["worklog-preferences"] query key with useWorklogPreferences so
 * the consent timestamp is hot the moment any worklog surface is open.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorklogPreferences } from "@/types/worklog";

const EMPTY_PREFS: WorklogPreferences = {
  defaultPositionId: null,
  defaultShiftId: null,
  defaultCategory: "task",
  defaultMood: null,
  defaultHours: null,
  voiceDictationConsentedAt: null,
  // ADR-0023 — reader right-rail defaults (unused here, included for type completeness).
  readerRailTab: "backlinks",
  readerRailCollapsed: false,
};

export interface VoiceConsentApi {
  consentedAt: string | null;
  hasConsented: boolean;
  /** Save NOW as the consent timestamp. Resolves after the server round-trip. */
  grantConsent: () => Promise<void>;
  isSaving: boolean;
}

export function useVoiceConsent(): VoiceConsentApi {
  const qc = useQueryClient();

  const { data: prefs = EMPTY_PREFS } = useQuery<WorklogPreferences>({
    queryKey: ["worklog-preferences"],
    queryFn: async () => {
      const r = await fetch("/api/work-logs/preferences");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // Preserve every existing field — the PUT route replaces all columns.
      const next: WorklogPreferences = {
        ...prefs,
        voiceDictationConsentedAt: new Date().toISOString(),
      };
      const r = await fetch("/api/work-logs/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as WorklogPreferences;
    },
    onSuccess: (saved) => {
      qc.setQueryData(["worklog-preferences"], saved);
    },
  });

  return {
    consentedAt: prefs.voiceDictationConsentedAt ?? null,
    hasConsented: Boolean(prefs.voiceDictationConsentedAt),
    grantConsent: async () => {
      await mutation.mutateAsync();
    },
    isSaving: mutation.isPending,
  };
}

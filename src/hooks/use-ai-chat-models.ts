"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ModelsData } from "@/lib/ai-chat-constants";

const URL_STORAGE_KEY = "resumsify-ai-url";

export interface UseAiChatModelsResult {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  localUrl: string | null;
  setLocalUrl: (v: string | null) => void;
  modelsData: ModelsData | undefined;
  refetch: () => void;
}

/**
 * Owns the AI chat's model-picker state: provider/model selection, the
 * optional localhost Ollama URL, and the `/api/ai/models` fetch that
 * powers auto-select + the stale-selection guard.
 *
 * Behavior preserved bit-for-bit from the inline version in ai-chat.tsx:
 *   - First successful models-data load auto-selects the best
 *     provider+model exactly once (gated by an internal `initialized` flag).
 *   - When provider switches without a model, picks a sensible default
 *     for the new provider.
 *   - Stale-selection guard (2026-06-22): if the currently-selected ollama
 *     model is no longer in the live pulled list (e.g. user ran
 *     `ollama rm` mid-session), resets to defaultModel.
 *
 * Extracted in Phase 3 of the god-file refactor.
 */
export function useAiChatModels(open: boolean): UseAiChatModelsResult {
  const [provider, setProvider] = useState<string>("ollama");
  const [model, setModel] = useState<string>("");
  const [localUrl, setLocalUrl] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(URL_STORAGE_KEY) : null,
  );
  const [initialized, setInitialized] = useState(false);

  const { data: modelsData, refetch } = useQuery<ModelsData>({
    queryKey: ["ai-models", open, localUrl], // re-run if local URL changes before open
    queryFn: () => {
      const url = localUrl
        ? `/api/ai/models?url=${encodeURIComponent(localUrl)}`
        : "/api/ai/models";
      return fetch(url).then((r) => r.json());
    },
    staleTime: 30_000,
    enabled: open,
  });

  // Auto-select best provider+model on first models-data load (only once)
  useEffect(() => {
    if (!modelsData || initialized) return;
    if (modelsData.ollama.available) {
      setProvider("ollama");
      const active = modelsData.models.find((m) => m.provider === "ollama" && m.active);
      // `defaultModel` may be null when zero models are pulled; fall
      // through to "" so the picker shows the empty-state hint rather
      // than auto-selecting a phantom name.
      setModel(active?.name ?? modelsData.ollama.defaultModel ?? "");
    } else if (modelsData.gemini.available) {
      setProvider("gemini");
      setModel(modelsData.gemini.defaultModel);
    }
    setInitialized(true);
  }, [modelsData, initialized]);

  // When provider changes, ensure a valid model is selected
  useEffect(() => {
    if (!modelsData || !initialized) return;
    if (!model) {
      if (provider === "ollama" && modelsData.ollama.available) {
        const active = modelsData.models.find((m) => m.provider === "ollama" && m.active);
        setModel(active?.name ?? modelsData.ollama.defaultModel ?? "");
      } else if (provider === "gemini" && modelsData.gemini.available) {
        setModel(modelsData.gemini.defaultModel);
      }
    }
  }, [provider, initialized, modelsData, model]);

  // Stale-selection guard (2026-06-22). If the currently-selected model is
  // no longer in the live pulled list (e.g. user ran `ollama rm <name>`
  // while the panel was open, or the previously-cached default leaked from
  // an older route version), reset to the effective default. Prevents the
  // picker from POSTing a phantom name to the chat route.
  useEffect(() => {
    if (!modelsData || !initialized || !model) return;
    if (provider !== "ollama") return;
    const stillPulled = modelsData.models.some(
      (m) => m.provider === "ollama" && m.name === model,
    );
    if (!stillPulled) {
      setModel(modelsData.ollama.defaultModel ?? "");
    }
  }, [provider, model, modelsData, initialized]);

  return { provider, setProvider, model, setModel, localUrl, setLocalUrl, modelsData, refetch };
}

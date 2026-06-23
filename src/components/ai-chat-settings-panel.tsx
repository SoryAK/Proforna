"use client";

import { Wifi, WifiOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dispatch, SetStateAction } from "react";
import type { ProviderId } from "@/lib/ai/types";
import type { ModelInfo, ModelsData } from "@/lib/ai-chat-constants";

/**
 * Settings panel (toggled from the bottom toolbar Settings button).
 * Surfaces the Provider picker, Model picker, Localhost URL (Ollama only),
 * and availability hints.
 *
 * Returns null when closed so the parent can keep `{showSettings && (...)}`
 * inline-clean.
 */
export interface AIChatSettingsPanelProps {
  open: boolean;
  provider: ProviderId;
  setProvider: Dispatch<SetStateAction<ProviderId>>;
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
  providerModels: ModelInfo[];
  modelsData: ModelsData | undefined;
  setLocalUrl: (url: string | null) => void;
  refetch: () => void;
}

export function AIChatSettingsPanel({
  open,
  provider,
  setProvider,
  model,
  setModel,
  providerModels,
  modelsData,
  setLocalUrl,
  refetch,
}: AIChatSettingsPanelProps) {
  if (!open) return null;
  return (
    <div className="border-b px-4 py-3 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Provider</label>
          <Select value={provider} onValueChange={(v) => { setProvider((v ?? "ollama") as ProviderId); setModel(""); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ollama">
                <span className="flex items-center gap-1.5">
                  {modelsData?.ollama.available ? (
                    <Wifi className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-red-400" />
                  )}
                  Local AI (Ollama)
                </span>
              </SelectItem>
              <SelectItem value="gemini">
                <span className="flex items-center gap-1.5">
                  {modelsData?.gemini.available ? (
                    <Wifi className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-red-400" />
                  )}
                  Resumsify Cloud (Gemini)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Model</label>
          <Select value={model} onValueChange={(v) => setModel(v ?? "")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              {providerModels.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
              {providerModels.length === 0 && (
                <SelectItem value="" disabled>
                  No models available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      {provider === "ollama" && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Localhost URL</label>
          <input
            type="text"
            className="w-full text-xs h-8 px-2 rounded-md border bg-background"
            placeholder="http://127.0.0.1:11434"
            defaultValue={typeof window !== "undefined" ? localStorage.getItem("resumsify-ai-url") || "http://127.0.0.1:11434" : "http://127.0.0.1:11434"}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val) {
                localStorage.setItem("resumsify-ai-url", val);
                setLocalUrl(val);
              } else {
                localStorage.removeItem("resumsify-ai-url");
                setLocalUrl(null);
              }
              refetch();
            }}
          />
        </div>
      )}
      {provider === "ollama" && !modelsData?.ollama.available && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Ollama not detected. Start Ollama and ensure the URL is correct.
        </p>
      )}
      {provider === "gemini" && !modelsData?.gemini.available && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Add <code className="bg-muted px-1 rounded">GEMINI_API_KEY</code> to your .env file.
        </p>
      )}
    </div>
  );
}

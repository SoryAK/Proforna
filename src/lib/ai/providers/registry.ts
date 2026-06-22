import type { AIProvider } from "../types";
import { OllamaProvider } from "./ollama";
import { GeminiFastProvider } from "./gemini-fast";

const _providers: AIProvider[] = [
  new OllamaProvider(),
  new GeminiFastProvider(),
  // GeminiProProvider — registered Day 4 of the ADR-0044 migration plan.
];

/** Snapshot of currently-registered providers (defensive copy). */
export function getProviders(): readonly AIProvider[] {
  return _providers.slice();
}

/**
 * Plug-in seam — append a provider to the registry. Intended for Forward Path
 * additions (Firebase AI, AICore, BYOK family) per ADR-0044 §Mobile providers.
 */
export function registerProvider(p: AIProvider): void {
  _providers.push(p);
}

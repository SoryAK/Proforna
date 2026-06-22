/**
 * @deprecated This module has been folded into `@/lib/ai/providers/gemini-fast`.
 *
 * For new code, prefer the unified façade:
 *
 *     import { ai } from "@/lib/ai";
 *     const { json } = await ai.generate({ task: "extract", messages });   // 429-safe model chain
 *     const { json } = await ai.generate({ task: "ground",  messages });   // Google grounding
 *
 * This shim re-exports the existing helpers so the 9 callers under
 * `src/app/api/` can migrate one at a time. Scheduled for removal at the
 * end of Day 5 of the ADR-0044 migration sprint (week of 2026-06-21).
 */
export { callGemini, geminiErrorMessage } from "@/lib/ai/providers/gemini-fast";

"use client";

import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AIMeta } from "@/lib/ai/envelope";
import type { ProviderId } from "@/lib/ai/types";
import type { MentionRef } from "@/lib/ai-chat-mentions";
import {
  estimateTokens,
  type ChatTask,
  type ContextSlice,
  type Message,
} from "@/lib/ai-chat-constants";

/**
 * Streaming hook for the AI chat panel.
 *
 * Owns:
 *   - `streaming` state (the in-flight indicator)
 *   - `sessionTokens` state (running total, updated on stream finish)
 *   - `abortRef` (current AbortController, internal)
 *   - `sendMessage` (POST → SSE pipeline → setMessages incremental updates)
 *   - `stopStreaming` (abort + flip streaming false)
 *
 * Takes `messages` + `setMessages` as params (Griller path B). `messagesRef`
 * mirrors the latest `messages` snapshot so `sendMessage` does not need
 * `messages` in its dep array — this keeps the callback stable across
 * incremental SSE writes (avoids rebuilding the callback 100× per stream).
 */
export interface UseAiChatStreamParams {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  mentions: MentionRef[];
  setMentions: Dispatch<SetStateAction<MentionRef[]>>;
  contextSlices: ContextSlice[];
  suppressedSliceIds: Set<string>;
  provider: ProviderId;
  model: string;
  localUrl: string;
  task: ChatTask;
}

export interface UseAiChatStreamReturn {
  streaming: boolean;
  sessionTokens: number;
  setSessionTokens: Dispatch<SetStateAction<number>>;
  sendMessage: (overrideText?: string) => Promise<void>;
  stopStreaming: () => void;
}

export function useAiChatStream(params: UseAiChatStreamParams): UseAiChatStreamReturn {
  const {
    messages,
    setMessages,
    input,
    setInput,
    mentions,
    setMentions,
    contextSlices,
    suppressedSliceIds,
    provider,
    model,
    localUrl,
    task,
  } = params;

  const [streaming, setStreaming] = useState(false);
  const [sessionTokens, setSessionTokens] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Mirror the latest messages snapshot so `sendMessage` can read it without
  // adding `messages` to its dep list (which would rebuild the callback on
  // every incremental SSE write).
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    // Snapshot current mentions so we can both attach them to the user
    // message AND ship them in the chat-route sidecar. Cleared once the
    // user message is queued.
    const turnMentions = mentions;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      mentions: turnMentions.length > 0 ? turnMentions : undefined,
    };

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Snapshot + clear mentions so the textarea is ready for the next turn.
    // The structured payload is sent alongside the chat body — the chat
    // route increments `EntityAIMentionCount` and injects a hidden system
    // message containing the JSON block (ADR-0046 Phase C.2). The same
    // snapshot is also stored on the user message itself so D.3's
    // code-block resolver can read the thread's mention history.
    const mentionsPayload = turnMentions.map(({ type, id, label }) => ({ type, id, label }));
    setMentions([]);

    // Build messages array, prefixing the unsuppressed context slices as one
    // system message. The user can drop individual slices via the chip row
    // above the input — see `suppressedSliceIds` (ADR-0046 Phase A).
    const chatHistory: { role: "system" | "user" | "assistant"; content: string }[] = [
      ...messagesRef.current,
      userMsg,
    ].map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const activeSlices = contextSlices.filter((s) => !suppressedSliceIds.has(s.id));
    if (activeSlices.length > 0) {
      const systemPrompt = activeSlices.map((s) => s.prompt).join("\n\n");
      chatHistory.unshift({ role: "system" as const, content: systemPrompt });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          provider,
          model: model || undefined,
          localUrl: provider === "ollama" ? localUrl : undefined,
          task,
          mentions: mentionsPayload,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `**Error:** ${err.error}` }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";
      let usedProvider = "";
      let usedModel = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "provider") {
              usedProvider = event.provider;
            } else if (event.type === "text") {
              accumulated += event.text;
              const snapshot = accumulated;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: snapshot }
                    : m
                )
              );
            } else if (event.type === "meta") {
              // Final provenance metadata from the server. Hydrate the
              // assistant turn so the AIProvenanceChip renders in the header.
              usedModel = event.model;
              const meta: AIMeta = {
                provider: (usedProvider || "unknown") as ProviderId,
                model: usedModel,
                durationMs: event.durationMs,
              };
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, ai: meta } : m))
              );
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "**Error:** Connection failed. Is your AI provider running?" }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Update session token estimate from the final accumulated text.
      setMessages((prev) => {
        const total = prev.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        setSessionTokens(total);
        return prev;
      });
    }
  }, [
    input,
    streaming,
    mentions,
    contextSlices,
    suppressedSliceIds,
    provider,
    model,
    localUrl,
    task,
    setMessages,
    setInput,
    setMentions,
  ]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return {
    streaming,
    sessionTokens,
    setSessionTokens,
    sendMessage,
    stopStreaming,
  };
}

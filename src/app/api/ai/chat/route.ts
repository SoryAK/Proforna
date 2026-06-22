import { NextResponse } from "next/server";
import {
  ai,
  AIProviderError,
  getAIConfig,
  ollamaIsAvailable,
  ollamaChat,
  type AITaskClass,
  type ChatMessage,
  type ProviderId,
} from "@/lib/ai";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// Tasks the chat panel is allowed to dispatch. `extract` is intentionally
// excluded — it's a JSON-shape task that doesn't fit the streaming UI.
const CHAT_TASKS = new Set<AITaskClass>(["chat", "ground", "reason", "summarize"]);

// ADR-0046 Phase C — vocabulary for the @-mention payload sidecar.
// MUST stay in sync with `VALID_TYPES` in src/app/api/ai/mention-search/route.ts.
const MENTION_TYPES = new Set(["job", "skill", "worklog", "contact"]);

interface MentionRef {
  type: string;
  id: string;
  label: string;
}

/**
 * Filter + dedup the user-supplied mention payload.
 *
 * - Invalid `type` values are silently dropped (degraded gracefully — mentions
 *   are UI-side data, not an auth gate).
 * - Missing fields drop the entry.
 * - Duplicates collapse on `${type}:${id}` (label of first occurrence wins).
 */
function sanitizeMentions(raw: unknown): MentionRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, MentionRef>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (typeof m.type !== "string" || !MENTION_TYPES.has(m.type)) continue;
    if (typeof m.id !== "string" || !m.id) continue;
    if (typeof m.label !== "string" || !m.label) continue;
    const key = `${m.type}:${m.id}`;
    if (seen.has(key)) continue;
    seen.set(key, { type: m.type, id: m.id, label: m.label });
  }
  return Array.from(seen.values());
}

/**
 * POST /api/ai/chat
 *
 * Accepts { messages: ChatMessage[], provider?: "ollama" | "gemini", model?: string, localUrl?: string }
 * and streams back the assistant's response as text/event-stream.
 *
 * Routing:
 *   - `localUrl`            → raw OllamaProvider against the custom URL (power-user override).
 *   - `provider: "gemini"`  → router with `providerOverride: "gemini-fast"`.
 *   - default               → router default chain for `chat` (Ollama → gemini-fast).
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const rawMessages: ChatMessage[] = body.messages;
  const preferredProvider = body.provider as string | undefined;
  const preferredModel = body.model as string | undefined;
  const customUrl = body.localUrl as string | undefined;
  const rawTask = typeof body.task === "string" ? (body.task as AITaskClass) : "chat";
  const task: AITaskClass = CHAT_TASKS.has(rawTask) ? rawTask : "chat";

  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
    return new Response("messages array is required", { status: 400 });
  }

  // ADR-0046 Phase C.2 — mention payload sidecar.
  //  1. Sanitize + dedup the user-supplied list.
  //  2. Best-effort rank-write: upsert `EntityAIMentionCount` per unique mention.
  //     Errors here are swallowed; ranking is non-critical and must not block
  //     the streaming UX.
  //  3. Inject a hidden system message at the head of the messages array so
  //     the model sees the structured JSON block alongside the user's natural
  //     `@Label` text.
  const mentions = sanitizeMentions(body.mentions);
  if (mentions.length > 0) {
    const now = new Date();
    await Promise.all(
      mentions.map((m) =>
        prisma.entityAIMentionCount
          .upsert({
            where: {
              userId_entityType_entityId: {
                userId,
                entityType: m.type,
                entityId: m.id,
              },
            },
            update: { count: { increment: 1 }, lastMentionedAt: now },
            create: {
              userId,
              entityType: m.type,
              entityId: m.id,
              count: 1,
              lastMentionedAt: now,
            },
          })
          .catch((err) => {
            // Best-effort — never block the chat turn on a ranking write.
            console.error(
              `[ai-chat] mention upsert failed for ${m.type}:${m.id}`,
              err,
            );
          }),
      ),
    );
  }

  const messages: ChatMessage[] =
    mentions.length > 0
      ? [
          {
            role: "system",
            content: `Resumsify mentions — the user explicitly referenced these entities in their message. Use them as authoritative context: ${JSON.stringify(mentions)}`,
          },
          ...rawMessages,
        ]
      : rawMessages;

  let stream: ReadableStream<string>;
  let usedProvider: string;
  let usedModel: string;
  const startMs = Date.now();

  if (customUrl) {
    // Power-user override: pin to a specific Ollama instance.
    const config = getAIConfig();
    const available = await ollamaIsAvailable(customUrl);
    if (!available) {
      return new Response(
        JSON.stringify({ error: `Ollama is not reachable at ${customUrl}` }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    const model = preferredModel ?? config.ollamaModel;
    stream = ollamaChat(customUrl, model, messages);
    usedProvider = "ollama";
    usedModel = model;
  } else {
    try {
      const providerOverride: ProviderId | undefined =
        preferredProvider === "gemini" ? "gemini-fast" : undefined;
      const result = await ai.generate({
        task,
        messages,
        modelOverride: preferredModel,
        providerOverride,
        userId,
      });
      if (!result.stream) {
        return new Response(
          JSON.stringify({ error: `Router returned no stream for ${task} task` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      stream = result.stream;
      usedProvider = result.provider;
      usedModel = result.model;
    } catch (error) {
      if (error instanceof AIProviderError) {
        return new Response(
          JSON.stringify({ error: error.message, retryAfter: error.retryAfter }),
          {
            status: error.status ?? 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      throw error;
    }
  }

  // Convert string stream to SSE
  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      // Send provider info as first event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "provider", provider: usedProvider })}\n\n`)
      );

      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", text: value })}\n\n`)
          );
        }
        // Emit provenance metadata at end of stream so the chat panel can
        // render a per-turn AIProvenanceChip (ADR-0046 Phase A). Usage is
        // not captured here because the streaming providers don't surface
        // token counts to the route layer; the chip falls back to
        // `provider:model · {duration}` when usage is absent.
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "meta", model: usedModel, durationMs: Date.now() - startMs })}\n\n`
          )
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`
          )
        );
      }
      controller.close();
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

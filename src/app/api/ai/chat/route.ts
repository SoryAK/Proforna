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

// Tasks the chat panel is allowed to dispatch. `extract` is intentionally
// excluded — it's a JSON-shape task that doesn't fit the streaming UI.
const CHAT_TASKS = new Set<AITaskClass>(["chat", "ground", "reason", "summarize"]);

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
  const messages: ChatMessage[] = body.messages;
  const preferredProvider = body.provider as string | undefined;
  const preferredModel = body.model as string | undefined;
  const customUrl = body.localUrl as string | undefined;
  const rawTask = typeof body.task === "string" ? (body.task as AITaskClass) : "chat";
  const task: AITaskClass = CHAT_TASKS.has(rawTask) ? rawTask : "chat";

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("messages array is required", { status: 400 });
  }

  let stream: ReadableStream<string>;
  let usedProvider: string;

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

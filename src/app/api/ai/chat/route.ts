import {
  getAIConfig,
  ollamaIsAvailable,
  ollamaChat,
  geminiChat,
  type ChatMessage,
} from "@/lib/ai";

/**
 * POST /api/ai/chat
 *
 * Accepts { messages: ChatMessage[], provider?: "ollama" | "gemini", model?: string }
 * and streams back the assistant's response as text/event-stream.
 *
 * Falls back from Ollama → Gemini automatically if Ollama is unavailable.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const messages: ChatMessage[] = body.messages;
  const preferredProvider = body.provider as string | undefined;
  const preferredModel = body.model as string | undefined;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("messages array is required", { status: 400 });
  }

  const config = getAIConfig();

  let stream: ReadableStream<string>;
  let usedProvider: string;

  // Determine which provider to use
  const wantOllama = !preferredProvider || preferredProvider === "ollama";

  if (wantOllama) {
    const available = await ollamaIsAvailable(config.ollamaUrl);
    if (available) {
      const model = preferredModel ?? config.ollamaModel;
      stream = ollamaChat(config.ollamaUrl, model, messages);
      usedProvider = "ollama";
    } else if (config.geminiApiKey) {
      // Fallback to Gemini
      const model = preferredModel ?? config.geminiModel;
      stream = geminiChat(config.geminiApiKey, model, messages);
      usedProvider = "gemini";
    } else {
      return new Response(
        JSON.stringify({
          error: "Ollama is not running and no Gemini API key is configured. " +
            "Start Ollama with `ollama serve` or set GEMINI_API_KEY in your .env file.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
  } else {
    // Explicitly requested Gemini
    if (!config.geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured in .env" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    const model = preferredModel ?? config.geminiModel;
    stream = geminiChat(config.geminiApiKey, model, messages);
    usedProvider = "gemini";
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

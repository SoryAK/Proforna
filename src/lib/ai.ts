/**
 * AI Provider abstraction — supports Ollama (local) and Gemini (cloud).
 *
 * The app always tries Ollama first. If Ollama is unreachable and a Gemini
 * API key is configured, it falls back to Gemini automatically.
 */

export type AIProvider = "ollama" | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIConfig {
  provider: AIProvider;
  ollamaUrl: string;
  ollamaModel: string;
  geminiApiKey: string;
  geminiModel: string;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "ollama",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
};

export function getAIConfig(): AIConfig {
  return { ...DEFAULT_CONFIG };
}

/* ── Ollama ── */

export async function ollamaIsAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map(
      (m: { name: string }) => m.name
    );
  } catch {
    return [];
  }
}

/**
 * Stream a chat completion from Ollama.
 * Returns a ReadableStream of string chunks (the assistant's text).
 */
export function ollamaChat(
  url: string,
  model: string,
  messages: ChatMessage[]
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, stream: true }),
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "Ollama request failed");
          controller.enqueue(`Error: ${text}`);
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Ollama streams newline-delimited JSON
          for (const line of chunk.split("\n")) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                controller.enqueue(json.message.content);
              }
            } catch {
              // skip invalid JSON fragments
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(`Error: ${err instanceof Error ? err.message : String(err)}`);
        controller.close();
      }
    },
  });
}

/* ── Gemini ── */

/**
 * Stream a chat completion from Google Gemini REST API.
 * Uses the REST endpoint directly to avoid extra dependencies.
 */
export function geminiChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        // Convert messages to Gemini format
        // Gemini uses "user" and "model" roles, system is sent as systemInstruction
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system");

        const contents = chatMessages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const body: Record<string, unknown> = { contents };
        if (systemMsg) {
          body.systemInstruction = {
            parts: [{ text: systemMsg.content }],
          };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "Gemini request failed");
          controller.enqueue(`Error: ${text}`);
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Gemini SSE streams "data: {...}" lines
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const json = JSON.parse(jsonStr);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue(text);
            } catch {
              // skip
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(`Error: ${err instanceof Error ? err.message : String(err)}`);
        controller.close();
      }
    },
  });
}

/* ── Non-streaming JSON generation ── */

/**
 * Generate a structured JSON response from the AI (non-streaming).
 * Tries Ollama first, falls back to Gemini.
 * The system prompt should instruct the model to respond ONLY with valid JSON.
 */
export async function aiGenerateJSON<T = unknown>(
  messages: ChatMessage[]
): Promise<T> {
  const cfg = getAIConfig();

  // Try Ollama first
  if (await ollamaIsAvailable(cfg.ollamaUrl)) {
    const res = await fetch(`${cfg.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.ollamaModel,
        messages,
        stream: false,
        format: "json",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.message?.content ?? "";
      return JSON.parse(text) as T;
    }
  }

  // Fall back to Gemini
  if (cfg.geminiApiKey) {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");
    const contents = chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        responseMimeType: "application/json",
      },
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent?key=${cfg.geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Gemini request failed");
      throw new Error(`Gemini error: ${errText}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return JSON.parse(text) as T;
  }

  throw new Error("No AI provider available. Start Ollama or set GEMINI_API_KEY.");
}

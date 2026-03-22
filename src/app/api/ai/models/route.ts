import { NextResponse } from "next/server";
import { getAIConfig, ollamaIsAvailable, ollamaModels } from "@/lib/ai";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/ai/models
 *
 * Returns available AI models and status for each provider.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = getAIConfig();

  const ollamaUp = await ollamaIsAvailable(config.ollamaUrl);
  const models: { provider: string; name: string; active: boolean }[] = [];

  if (ollamaUp) {
    const names = await ollamaModels(config.ollamaUrl);
    for (const name of names) {
      models.push({
        provider: "ollama",
        name,
        active: name === config.ollamaModel,
      });
    }
  }

  if (config.geminiApiKey) {
    for (const name of ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"]) {
      models.push({
        provider: "gemini",
        name,
        active: name === config.geminiModel,
      });
    }
  }

  return NextResponse.json({
    ollama: { available: ollamaUp, url: config.ollamaUrl, defaultModel: config.ollamaModel },
    gemini: { available: !!config.geminiApiKey, defaultModel: config.geminiModel },
    models,
  });
}

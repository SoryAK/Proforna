import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { getAIConfig, ollamaIsAvailable } from "@/lib/ai";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { text } = await request.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Job description text is required" }, { status: 400 });
    }

    const systemPrompt = `You are an expert HR data extractor. 
Extract the following job information from the provided job description or offer letter and return it as a pure valid JSON object. Do not wrap in markdown blocks, just raw JSON.

Return this exact JSON structure:
{
  "role": "", // The job title
  "department": "", 
  "location": "",
  "type": "remote", // One of: "remote", "hybrid", "onsite". Guess from context if not explicit.
  "salary": "", // Numeric annual salary if found
  "payType": "salary", // One of: "salary", "hourly", "contract"
  "payRate": "", // A string like "$45.50/hr" or "$85,000"
  "hoursPerWeek": "", // Numeric if found, e.g. "40"
  "schedule": "", // Short schedule description like "Mon-Fri 9-5" or "Overnight"
  "focus": "", // 1-2 sentence summary of the primary role/focus
  "responsibilities": "", // Key 3-5 responsibilities separated by a newline character (\n)
  "techStack": "" // Comma-separated list of tools/software/technologies mentioned
}
Leave fields as empty strings "" if entirely not found in the text.`;

    const config = getAIConfig();
    let isOllamaUp = false;

    if (config.provider === "ollama") {
      isOllamaUp = await ollamaIsAvailable(config.ollamaUrl);
    }

    const useGemini = config.provider === "gemini" || (!isOllamaUp && config.geminiApiKey);

    if (useGemini && config.geminiApiKey) {
      // Use Gemini non-streaming
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
      
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { responseSchema: { type: "OBJECT" }, responseMimeType: "application/json" } // Force JSON
        }),
      });

      if (!res.ok) throw new Error("Gemini API error: " + await res.text());
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) throw new Error("No response from Gemini");
      
      try {
        const json = JSON.parse(content);
        return NextResponse.json(json);
      } catch (e) {
        // Fallback cleanup if model still returns markdown
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        return NextResponse.json(JSON.parse(cleaned));
      }

    } else if (isOllamaUp) {
      // Use Ollama non-streaming
      const res = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          stream: false,
          format: "json"
        }),
      });

      if (!res.ok) throw new Error("Ollama API error: " + await res.text());
      const data = await res.json();
      const content = data.message?.content;
      
      if (!content) throw new Error("No response from Ollama");
      const json = JSON.parse(content);
      return NextResponse.json(json);

    } else {
      return NextResponse.json({ error: "No AI provider available (Ollama is down and Gemini is not configured)." }, { status: 503 });
    }

  } catch (error) {
    console.error("Job Parse API Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

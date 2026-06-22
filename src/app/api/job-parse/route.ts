import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";
import { toAIEnvelope } from "@/lib/ai/envelope";

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

    try {
      const t0 = Date.now();
      const result = await ai.generate<Record<string, unknown>>({
        task: "extract",
        userId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });
      const durationMs = Date.now() - t0;
      console.log(`[job-parse] used model: ${result.model}`);
      return NextResponse.json(toAIEnvelope(result.json ?? {}, result, durationMs));
    } catch (error) {
      if (error instanceof AIProviderError) {
        console.error(`[job-parse] ${error.providerId} error:`, error.message);
        return NextResponse.json(
          { error: error.message, retryAfter: error.retryAfter },
          { status: error.status ?? 500 },
        );
      }
      throw error;
    }

  } catch (error) {
    console.error("Job Parse API Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

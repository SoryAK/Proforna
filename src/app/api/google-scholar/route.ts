import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q");
  const yearLow = searchParams.get("year_low") || "";
  const yearHigh = searchParams.get("year_high") || "";

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  // We ask Gemini to search the web for academic/research articles to simulate Google Scholar.
  const prompt = `You are an academic research assistant. Search the web for scholarly articles, academic papers, and research related to: "${query}".
${yearLow ? `Only include papers published from ${yearLow} onwards.` : ""}
${yearHigh ? `Only include papers published up to ${yearHigh}.` : ""}
Return the data STRICTLY in the following JSON schema, filling in real data from your search. Do not include any commentary.
{
  "results": [
    {
      "title": "Paper Title",
      "link": "https://example.com/paper-link",
      "snippet": "A brief abstract or snippet from the paper.",
      "publicationInfo": "Authors - Journal/Conference, Year",
      "citedBy": 15,
      "citedByLink": null,
      "relatedLink": null,
      "resources": [
        {
          "title": "[PDF] example.com",
          "fileFormat": "PDF",
          "link": "https://example.com/paper.pdf"
        }
      ],
      "position": 1
    }
  ]
}
Include up to 10 relevant scholarly results.`;

  try {
    const { json, model } = await ai.generate<{ results?: unknown[] }>({
      task: "ground",
      messages: [{ role: "user", content: prompt }],
      userId,
    });
    console.log(`[google-scholar] used model: ${model}`);

    return NextResponse.json({
      results: json.results || [],
      searchInfo: { source: "Gemini Search Grounding (Academic)" },
      hasMore: false,
    });
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.error(`[google-scholar] ${error.providerId} error:`, error.message);
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.status ?? 500 }
      );
    }
    console.error("Error fetching scholar via Gemini:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

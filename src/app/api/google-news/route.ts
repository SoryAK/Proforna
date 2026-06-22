import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q");
  const topic = searchParams.get("topic") || "";

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  const prompt = `You are a helpful research assistant. Search the web for recent news articles related to: "${query}" ${topic ? `(Topic: ${topic})` : ""}. 
Return the data STRICTLY in the following JSON schema, filling in real data from your search. Do not include any commentary.
{
  "articles": [
    {
      "title": "Article Title",
      "link": "https://example.com/article",
      "source": "Publisher Name",
      "date": "Relative date like '2 days ago' or actual date",
      "snippet": "A brief summary of the article.",
      "thumbnail": null,
      "stories": []
    }
  ]
}
Include at least 5 articles if possible. Make sure links are valid.`;

  try {
    const { json, model } = await ai.generate<{ articles?: unknown[] }>({
      task: "ground",
      messages: [{ role: "user", content: prompt }],
      userId,
    });
    console.log(`[google-news] used model: ${model}`);

    return NextResponse.json({
      articles: json.articles || [],
      searchInfo: { source: "Gemini Search Grounding" },
    });
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.error(`[google-news] ${error.providerId} error:`, error.message);
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.status ?? 500 }
      );
    }
    console.error("Error fetching news via Gemini:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

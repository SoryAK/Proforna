import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { callGemini, geminiErrorMessage } from "@/lib/gemini";

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
    const { res: response, model } = await callGemini({
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    if (!response.ok) {
      const { message, retryAfter } = await geminiErrorMessage(response);
      console.error(`[google-news] ${model} error:`, message);
      return NextResponse.json(
        { error: message, retryAfter },
        { status: response.status }
      );
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(textContent);

    return NextResponse.json({
      articles: parsed.articles || [],
      searchInfo: { "source": "Gemini Search Grounding" },
    });
  } catch (error) {
    console.error("Error fetching news via Gemini:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

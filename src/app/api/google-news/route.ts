import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 503 }
    );
  }

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: prompt }] }
        ],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: "Gemini API request failed", details: text },
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

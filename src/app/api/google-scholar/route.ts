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
      results: parsed.results || [],
      searchInfo: { "source": "Gemini Search Grounding (Academic)" },
      hasMore: false, // Since this is a generated list, we might not have reliable pagination
    });
  } catch (error) {
    console.error("Error fetching scholar via Gemini:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

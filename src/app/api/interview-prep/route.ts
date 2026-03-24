import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY)
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 503 }
    );

  const body = await req.json();
  const { company, role, interviewType, interviewerRole } = body;

  if (!company || !role) {
    return NextResponse.json(
      { error: "Company and role are required" },
      { status: 400 }
    );
  }

  const prompt = `You are an expert interview coach. Generate personalized interview preparation materials for a candidate.

INTERVIEW CONTEXT:
- Company: ${company}
- Role: ${role}
- Interview Type: ${interviewType || "general"}
${interviewerRole ? `- Interviewer Role: ${interviewerRole}` : ""}

Return a JSON object with this EXACT structure:
{
  "questions": [
    {
      "question": "The interview question",
      "tip": "A brief tip on how to answer this well",
      "category": "behavioral|technical|situational|company-specific|role-specific"
    }
  ],
  "companyInsights": [
    "Key insight about the company that could help in the interview"
  ],
  "talkingPoints": [
    "Specific achievement or experience to highlight"
  ],
  "questionsToAsk": [
    "Smart question the candidate should ask the interviewer"
  ]
}

GUIDELINES:
- Generate 8-12 interview questions tailored to the specific company, role, and interview type.
- For technical interviews, include role-specific technical questions.
- For behavioral interviews, focus on STAR-method questions.
- For phone screens, include fit and motivation questions.
- Include 3-5 company insights based on what you know about the company.
- Include 3-5 talking points the candidate should prepare.
- Include 3-5 smart questions for the candidate to ask.
- Make questions specific to the company and role, not generic.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[interview-prep] Gemini error:", text);
      return NextResponse.json(
        { error: "AI service request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const textContent =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(textContent);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[interview-prep] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

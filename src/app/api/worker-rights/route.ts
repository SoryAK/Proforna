import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const question = body.question?.trim();
  if (!question || question.length === 0) {
    return NextResponse.json(
      { error: "A question is required" },
      { status: 400 }
    );
  }

  // Pull user context for personalized responses
  let userState = "";
  let userRole = "";
  let userIndustry = "";

  try {
    const [profile, position] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId }, select: { state: true } }),
      prisma.workHistory.findFirst({
        where: { userId, isActive: true },
        select: { title: true, company: true, department: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    userState = profile?.state || "";
    userRole = position?.title || "";
    userIndustry = position?.department || "";
  } catch {
    // Non-critical — proceed without context
  }

  const contextClause = [
    userState && `The worker is located in ${userState}.`,
    userRole && `Their current role is: ${userRole}.`,
    userIndustry && `Their department/industry is: ${userIndustry}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const systemPrompt = `You are a knowledgeable workplace rights advisor integrated into a career management platform. Your purpose is to help workers understand their legal rights and protections in the workplace.

IMPORTANT DISCLAIMERS YOU MUST FOLLOW:
- You provide GENERAL EDUCATIONAL INFORMATION, NOT legal advice.
- Always recommend consulting a licensed attorney for specific legal situations.
- Always recommend contacting the appropriate government agency for formal action.

${contextClause ? `USER CONTEXT: ${contextClause}` : ""}

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "answer": "Your detailed, helpful response in markdown format. Use headers (##), bullet points, and bold text for readability.",
  "agencies": [
    {
      "name": "Agency Name",
      "description": "Brief description of what they handle",
      "url": "https://official-url.gov",
      "phone": "1-800-XXX-XXXX (if applicable)"
    }
  ],
  "keyPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"],
  "actionSteps": ["Step 1: Description", "Step 2: Description"],
  "category": "osha|wage-theft|discrimination|whistleblower|harassment|retaliation|workers-comp|general"
}

GUIDELINES:
- Be thorough but accessible — explain legal concepts in plain language.
- Reference specific laws when relevant (OSHA Act, FLSA, Title VII, ADA, FMLA, NLRA, state-specific laws).
- Always include the most relevant federal AND state agencies.
- Provide actionable steps the worker can take.
- If the question involves immediate safety danger, emphasize calling OSHA (1-800-321-OSHA) or 911 first.
- Mention that many protections have filing deadlines (statutes of limitations).
- Note that retaliation for exercising legal rights is itself illegal.
- When relevant, mention that many agencies accept anonymous complaints.${userState ? `\n- Include ${userState}-specific laws and agencies when applicable.` : ""}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\nWORKER'S QUESTION: ${question}` }] },
        ],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[worker-rights] Gemini error:", text);
      return NextResponse.json(
        { error: "AI service request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const textContent =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(textContent);

    return NextResponse.json({
      ...parsed,
      disclaimer:
        "This information is for educational purposes only and does not constitute legal advice. Consult a licensed attorney for advice specific to your situation.",
    });
  } catch (error) {
    console.error("[worker-rights] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

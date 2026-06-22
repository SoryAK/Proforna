import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";
import { toAIEnvelope } from "@/lib/ai/envelope";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const t0 = Date.now();
    const result = await ai.generate<unknown>({
      task: "extract",
      messages: [{ role: "user", content: prompt }],
      userId,
    });
    const durationMs = Date.now() - t0;
    console.log(`[interview-prep] used model: ${result.model}`);
    return NextResponse.json(toAIEnvelope(result.json ?? {}, result, durationMs));
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.error(`[interview-prep] ${error.providerId} error:`, error.message);
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.status ?? 500 }
      );
    }
    console.error("[interview-prep] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

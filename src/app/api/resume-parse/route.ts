import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";
import { toAIEnvelope } from "@/lib/ai/envelope";
import type { AIResponse } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";

/**
 * Extract full text from all pages of a PDF using pdfjs-dist.
 */
async function extractAllTextFromPDF(data: Uint8Array): Promise<string> {
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  let rawText = "";

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lineTexts: string[] = [];
    
    // Using simple text extraction
    for (const item of tc.items) {
      if ("str" in item) {
        lineTexts.push(item.str);
      }
    }
    rawText += lineTexts.join(" ") + "\n";
  }

  await doc.destroy();
  return rawText.trim();
}

/**
 * Extract text from a docx file.
 */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  // We check for mammoth or docx on the server, but for now we'll do dynamic import or fallback.
  // We have mammoth? No, docx in package.json
  // Actually, extracting text from .docx via `docx` library is not supported (it's for generating docx).
  // I will throw an error and ask them to use PDF for now, or just extract raw strings.
  return "DOCX extraction not implemented yet. Please upload PDF.";
}

const systemInstruction = `You are a strict resume data extractor. Your ONLY job is to pull information DIRECTLY from the resume text provided. You must follow these rules:

CRITICAL RULES:
1. ONLY extract text that is LITERALLY present in the resume. Do NOT infer, guess, embellish, or generate any information.
2. If a field is not explicitly stated in the resume, return null for strings or an empty array for lists. NEVER fabricate data.
3. Do NOT rephrase, summarize, or rewrite the user's text. Copy it as closely as possible.
4. For "headline": Use the exact professional title or summary line that appears at the top of the resume. If none exists, return null.
5. For "bio": Use the exact summary/objective paragraph from the resume. If none exists, return null.
6. For dates: Only use dates that appear in the resume. If only a month and year are given (e.g. "Jan 2020"), use "2020-01-01". If only a year is given (e.g. "2020"), use "2020-01-01". If no date is given, return null.
7. For "isCurrent": Only set to true if the resume explicitly says "Present", "Current", or similar. Do NOT assume based on missing end dates.
8. For "achievements": Use the exact bullet points from the resume. Do NOT rewrite or combine them.
9. For "skills": Only include skills that are explicitly listed on the resume. Do NOT infer skills from job descriptions.
10. Return ONLY raw JSON. No markdown, no explanation, no extra text.

Output JSON schema:
{
  "profile": {
    "headline": "string or null - Exact title/headline from resume header",
    "bio": "string or null - Exact summary/objective paragraph if present",
    "location": "string or null - Exact location as written on resume",
    "website": "string or null - Exact URL if listed",
    "githubUrl": "string or null - Exact GitHub URL if listed",
    "linkedinUrl": "string or null - Exact LinkedIn URL if listed"
  },
  "experience": [
    {
      "company": "string - Exact company name",
      "title": "string - Exact job title",
      "location": "string or null - Exact location as written",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "isCurrent": "boolean",
      "description": "string or null - Exact role description if present",
      "achievements": ["Exact bullet point text"]
    }
  ],
  "skills": ["Exact skill name as listed"],
  "education": [
    {
      "institution": "string - Exact school/university name",
      "degree": "string or null - Exact degree as written",
      "field": "string or null - Exact field/major as written",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "description": "string or null - Exact description if present"
    }
  ]
}
`;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported currently." }, { status: 400 });
    }

    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (5MB max)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText = "";

    try {
      rawText = await extractAllTextFromPDF(new Uint8Array(buffer));
    } catch (e: any) {
      return NextResponse.json({ error: "Failed to read PDF file.", details: e.message }, { status: 422 });
    }

    if (!rawText || rawText.length < 50) {
      return NextResponse.json({ error: "Could not extract sufficient text from the PDF." }, { status: 422 });
    }

    let parsedData;
    let aiResult: AIResponse<Record<string, unknown>> | null = null;
    let aiDurationMs = 0;
    try {
      const t0 = Date.now();
      aiResult = await ai.generate<Record<string, unknown>>({
        task: "extract",
        userId,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: rawText },
        ],
      });
      aiDurationMs = Date.now() - t0;
      parsedData = aiResult.json;
      console.log(`[resume-parse] used model: ${aiResult.model}`);
    } catch (error) {
      if (error instanceof AIProviderError) {
        console.error(`[resume-parse] ${error.providerId} error:`, error.message);
        return NextResponse.json(
          { error: error.message, retryAfter: error.retryAfter },
          { status: error.status ?? 500 },
        );
      }
      console.error("[resume-parse] AI error:", error);
      return NextResponse.json({ error: "AI failed to return valid data." }, { status: 500 });
    }

    if (!parsedData || !aiResult) {
      return NextResponse.json({ error: "AI failed to return data." }, { status: 500 });
    }

    // Just return the parsed data to the frontend for preview
    return NextResponse.json(
      toAIEnvelope({ success: true, data: parsedData }, aiResult, aiDurationMs),
    );

  } catch (error: any) {
    console.error("Resume parse error:", error);
    return NextResponse.json({ error: "Failed to process resume." }, { status: 500 });
  }
}

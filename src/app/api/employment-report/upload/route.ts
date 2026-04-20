import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getUserId } from "@/lib/auth-utils";
import { callGemini, geminiErrorMessage } from "@/lib/gemini";

/**
 * POST /api/employment-report/upload
 *
 * Accepts a PDF from Equifax "The Work Number" Employment Data Report.
 * Extracts text, then uses Gemini to parse it into structured employment records.
 */

async function extractAllTextFromPDF(data: Uint8Array): Promise<string> {
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  let rawText = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lineTexts: string[] = [];
    for (const item of tc.items) {
      if ("str" in item) lineTexts.push(item.str);
    }
    rawText += lineTexts.join(" ") + "\n";
  }
  await doc.destroy();
  return rawText.trim();
}

const EXTRACTION_PROMPT = `You are a precise data extractor for Equifax "The Work Number" Employment Data Reports.

These reports contain verified employment history from payroll data. Extract ALL employer records from the text.

For EACH employer entry, extract:
- employerName: The legal employer name as listed
- employerCode: The Work Number employer code (numeric, if present)
- ein: Employer Identification Number (XX-XXXXXXX format, if present)
- hireDate: Original hire date (convert to YYYY-MM-DD)
- separationDate: Termination/separation date (YYYY-MM-DD, null if still active)
- status: "active" or "inactive"
- jobTitle: Job title if listed
- payFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "annual" (if listed)
- basePay: Base pay amount as a number (if listed)
- payRate: "hourly" | "salary" (if determinable from context)
- totalCompensation: Total annual compensation if listed
- lastPayDate: Most recent pay date (YYYY-MM-DD, if listed)

CRITICAL RULES:
1. Extract ONLY what is explicitly in the text. Do NOT fabricate any data.
2. If a field is not present, use null.
3. Dates should be converted to YYYY-MM-DD format. If only month/year, use first of month.
4. Pay amounts should be numbers only (no $ signs or commas).
5. Extract the report date if visible at the top.
6. Extract the employee name from the report header if present.

Return ONLY valid JSON:
{
  "reportDate": "YYYY-MM-DD or null",
  "employeeName": "string or null",
  "employers": [
    {
      "employerName": "string",
      "employerCode": "string or null",
      "ein": "string or null",
      "hireDate": "YYYY-MM-DD or null",
      "separationDate": "YYYY-MM-DD or null",
      "status": "active | inactive",
      "jobTitle": "string or null",
      "payFrequency": "string or null",
      "basePay": "number or null",
      "payRate": "hourly | salary | null",
      "totalCompensation": "number or null",
      "lastPayDate": "YYYY-MM-DD or null"
    }
  ]
}`;

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
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    // 10MB limit (these reports can be multi-page)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText = "";

    try {
      rawText = await extractAllTextFromPDF(new Uint8Array(buffer));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "Failed to read PDF file.", details: msg }, { status: 422 });
    }

    if (!rawText || rawText.length < 30) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from the PDF. The file may be image-based — try a text-based PDF export from The Work Number." },
        { status: 422 }
      );
    }

    // Use shared Gemini helper with automatic model fallback
    const { res, model: usedModel } = await callGemini({
      systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: rawText }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    if (!res.ok) {
      const { message, retryAfter } = await geminiErrorMessage(res);
      return NextResponse.json({ error: message, retryAfter }, { status: 429 });
    }

    console.log(`[employment-report/upload] Used model: ${usedModel}`);

    const geminiData = await res.json();
    const rawResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawResponse) {
      return NextResponse.json({ error: "AI returned no data" }, { status: 500 });
    }

    let parsed;
    try {
      const clean = rawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error("[employment-report/upload] Failed to parse AI JSON:", rawResponse.slice(0, 500));
      return NextResponse.json({ error: "AI returned invalid data" }, { status: 500 });
    }

    // Validate structure
    if (!parsed.employers || !Array.isArray(parsed.employers)) {
      return NextResponse.json({ error: "AI could not identify any employer records in this PDF" }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      data: parsed,
      rawTextLength: rawText.length,
      employerCount: parsed.employers.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[employment-report/upload] Error:", msg);
    return NextResponse.json({ error: "Failed to process employment report" }, { status: 500 });
  }
}

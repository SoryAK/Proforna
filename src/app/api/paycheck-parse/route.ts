import { NextResponse } from "next/server";
import { extractText } from "unpdf";

interface PaycheckData {
  grossPay: number | null;
  netPay: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  payRate: number | null;
  federalTax: number | null;
  stateTax: number | null;
  socialSecurity: number | null;
  medicare: number | null;
  retirement: number | null;
  healthInsurance: number | null;
  otherDeductions: number | null;
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  rawText: string;
}

function extractAmount(text: string, ...patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1].replace(/,/g, "");
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

function extractHours(text: string, ...patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && num > 0 && num < 200) return num;
    }
  }
  return null;
}

function parsePaycheckText(text: string): PaycheckData {
  // Normalize whitespace but preserve line structure
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");

  const grossPay = extractAmount(
    normalized,
    /gross\s*pay[:\s]*\$?([\d,]+\.?\d*)/i,
    /total\s*gross[:\s]*\$?([\d,]+\.?\d*)/i,
    /gross\s*earnings[:\s]*\$?([\d,]+\.?\d*)/i,
    /total\s*earnings[:\s]*\$?([\d,]+\.?\d*)/i,
  );

  const netPay = extractAmount(
    normalized,
    /net\s*pay[:\s]*\$?([\d,]+\.?\d*)/i,
    /take[\s-]*home[:\s]*\$?([\d,]+\.?\d*)/i,
    /total\s*net[:\s]*\$?([\d,]+\.?\d*)/i,
    /net\s*check[:\s]*\$?([\d,]+\.?\d*)/i,
  );

  const regularHours = extractHours(
    normalized,
    /regular\s*(?:hours?)?[:\s]*([\d.]+)\s*(?:hrs?|hours?)?/i,
    /reg\s*(?:hours?)?[:\s]*([\d.]+)/i,
    /straight\s*time[:\s]*([\d.]+)/i,
  );

  const overtimeHours = extractHours(
    normalized,
    /overtime\s*(?:hours?)?[:\s]*([\d.]+)\s*(?:hrs?|hours?)?/i,
    /ot\s*(?:hours?)?[:\s]*([\d.]+)/i,
    /over\s*time[:\s]*([\d.]+)/i,
    /time\s*(?:and\s*a?\s*)?half[:\s]*([\d.]+)/i,
  );

  const payRate = extractAmount(
    normalized,
    /(?:hourly\s*)?rate[:\s]*\$?([\d,]+\.?\d*)/i,
    /pay\s*rate[:\s]*\$?([\d,]+\.?\d*)/i,
    /regular\s*rate[:\s]*\$?([\d,]+\.?\d*)/i,
    /base\s*rate[:\s]*\$?([\d,]+\.?\d*)/i,
  );

  const federalTax = extractAmount(
    normalized,
    /(?:federal|fed)\s*(?:income\s*)?(?:tax|w\/h|withholding)[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /(?:fed)\s*(?:tax|w\/h)[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /federal[:\s]*-?\$?([\d,]+\.?\d*)/i,
  );

  const stateTax = extractAmount(
    normalized,
    /(?:state)\s*(?:income\s*)?(?:tax|w\/h|withholding)[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /(?:state|sit)\s*(?:tax|w\/h)[:\s]*-?\$?([\d,]+\.?\d*)/i,
  );

  const socialSecurity = extractAmount(
    normalized,
    /(?:social\s*security|ss|fica\s*ss|oasdi)[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /fica[:\s]*-?\$?([\d,]+\.?\d*)/i,
  );

  const medicare = extractAmount(
    normalized,
    /medicare[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /med\s*tax[:\s]*-?\$?([\d,]+\.?\d*)/i,
  );

  const retirement = extractAmount(
    normalized,
    /(?:401\s*k|retirement|pension|403\s*b|roth)[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /(?:401k|ret)\s*(?:contrib)?[:\s]*-?\$?([\d,]+\.?\d*)/i,
  );

  const healthInsurance = extractAmount(
    normalized,
    /(?:health|medical|dental|vision)\s*(?:insurance|ins|plan)?[:\s]*-?\$?([\d,]+\.?\d*)/i,
    /(?:hmo|ppo|hsa)\s*(?:plan)?[:\s]*-?\$?([\d,]+\.?\d*)/i,
  );

  // Sum up deductions we didn't categorize
  const knownDeductions = [federalTax, stateTax, socialSecurity, medicare, retirement, healthInsurance]
    .filter((v): v is number => v !== null)
    .reduce((s, v) => s + v, 0);

  let otherDeductions: number | null = null;
  if (grossPay && netPay && knownDeductions > 0) {
    const totalDed = grossPay - netPay;
    const remainder = totalDed - knownDeductions;
    if (remainder > 1) otherDeductions = Math.round(remainder * 100) / 100;
  }

  // Pay period dates
  const dateMatch = normalized.match(
    /(?:pay\s*period|period)[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*(?:to|[-–])\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
  );

  return {
    grossPay,
    netPay,
    regularHours,
    overtimeHours,
    payRate,
    federalTax,
    stateTax,
    socialSecurity,
    medicare,
    retirement,
    healthInsurance,
    otherDeductions,
    payPeriodStart: dateMatch?.[1] ?? null,
    payPeriodEnd: dateMatch?.[2] ?? null,
    rawText: normalized.slice(0, 3000),
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF files are supported. Please upload a PDF paycheck." },
        { status: 400 },
      );
    }

    // Limit file size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractText(buffer);
    const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text);

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF. It may be image-based — try a text-based paycheck PDF." },
        { status: 422 },
      );
    }

    const data = parsePaycheckText(text);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse paycheck. Please try a different file." },
      { status: 500 },
    );
  }
}

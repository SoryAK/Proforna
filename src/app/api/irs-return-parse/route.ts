import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * IRS Wage & Income Transcript Parser
 *
 * Parses IRS transcripts (downloaded from irs.gov) that list multiple
 * employer W-2 records in a single document. Each employer section
 * starts with "FORM W-2" and contains labeled rows like:
 *   EMPLOYER NAME: ACME CORP
 *   WAGES, TIPS AND OTHER COMPENSATION: 45,000.00
 *
 * Returns an array of per-employer records.
 */

export interface IRSEmployerRecord {
  employerName: string | null;
  employerEIN: string | null;
  employerAddress: string | null;
  wages: number | null;
  federalTaxWithheld: number | null;
  socialSecurityWages: number | null;
  socialSecurityTax: number | null;
  medicareWages: number | null;
  medicareTax: number | null;
  stateWages: number | null;
  stateTaxWithheld: number | null;
  localWages: number | null;
  localTaxWithheld: number | null;
  state: string | null;
}

export interface IRSParseResult {
  taxYear: number | null;
  documentType: "irs-transcript";
  employers: Array<
    IRSEmployerRecord & {
      cfmReady: {
        year: number | null;
        grossIncome: number | null;
        netIncome: number | null;
        notes: string;
      };
      companyData: {
        company: string | null;
        ein: string | null;
        address: string | null;
        state: string | null;
      };
    }
  >;
  rawText: string;
}

/* ── Helpers ── */

function parseDollar(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  const n = parseFloat(clean);
  return !isNaN(n) && n >= 0 ? n : null;
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","GU","VI","AS","MP",
]);

/**
 * Extract all text from the PDF preserving line structure.
 * Uses positioned items grouped into rows (same as W-2 parser)
 * so we get proper line breaks between labels.
 */
async function extractAllText(data: Uint8Array): Promise<string> {
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    // Collect positioned items
    const items: { str: string; x: number; y: number }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const tx = item.transform;
      const x = tx[4];
      const y = pageHeight - tx[5];
      items.push({ str: item.str.trim(), x, y });
    }

    // Sort top-to-bottom, then left-to-right
    items.sort((a, b) => {
      const dy = a.y - b.y;
      if (Math.abs(dy) > 3) return dy;
      return a.x - b.x;
    });

    // Group into rows by y-proximity
    let currentRow: typeof items = [];
    let currentY = -Infinity;
    for (const item of items) {
      if (Math.abs(item.y - currentY) > 4) {
        if (currentRow.length > 0) {
          currentRow.sort((a, b) => a.x - b.x);
          allLines.push(currentRow.map((it) => it.str).join("  "));
        }
        currentRow = [item];
        currentY = item.y;
      } else {
        currentRow.push(item);
      }
    }
    if (currentRow.length > 0) {
      currentRow.sort((a, b) => a.x - b.x);
      allLines.push(currentRow.map((it) => it.str).join("  "));
    }
    allLines.push("---PAGE BREAK---");
  }

  await doc.destroy();
  return allLines.join("\n");
}

/**
 * Parse IRS Wage & Income Transcript text into per-employer records.
 *
 * Strategy: Split text into sections at each "FORM W-2" boundary.
 * Within each section, look for labeled values.
 */
function parseTranscript(rawText: string): IRSParseResult {
  // Detect tax year — the ONLY reliable source is the "Tax Period Requested" line.
  // Format on that line is a date: "12-31-2024" (MM-DD-YYYY) — the year at the end
  // is the actual tax year. Everything else (Request Date, Response Date, page title)
  // contains the date the transcript was *generated*, NOT the tax year.
  let taxYear: number | null = null;
  const yearPatterns = [
    // "Tax Period Requested:   12-31-2024" → MM-DD-YYYY, grab year at end
    /TAX\s+PERIOD\s+(?:REQUESTED)?[:\s]*\d{1,2}-\d{1,2}-(\d{4})/i,
    // "Tax Period Requested:   Dec. 2024" or "Dec 2024"
    /TAX\s+PERIOD\s+(?:REQUESTED)?[:\s]*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+)?(\d{4})/i,
    // "Tax Period: 2024" or "Tax Year: 2024"
    /TAX\s+(?:PERIOD|YEAR)[:\s]*(\d{4})/i,
    // "For Tax Year: 2024"
    /FOR\s+(?:TAX|CALENDAR)\s+YEAR[:\s]*(\d{4})/i,
  ];
  for (const pat of yearPatterns) {
    const m = rawText.match(pat);
    if (m) {
      const y = parseInt(m[1]);
      if (y >= 2000 && y <= 2099) { taxYear = y; break; }
    }
  }
  // Fallback: look for a 4-digit year, but SKIP Request Date, Response Date, and title lines
  if (!taxYear) {
    const lines = rawText.split(/\n/);
    for (const line of lines) {
      if (/REQUEST\s+DATE/i.test(line)) continue;
      if (/RESPONSE\s+DATE/i.test(line)) continue;
      if (/TRACKING\s+NUMBER/i.test(line)) continue;
      if (/WAGE\s+AND\s+INCOME\s+TRANSCRIPT/i.test(line)) continue;
      const m = line.match(/\b(20[0-3]\d)\b/);
      if (m) { taxYear = parseInt(m[1]); break; }
    }
  }

  // Split into sections by "FORM W-2" occurrences
  // Some transcripts say "FORM W-2" or "W-2 WAGE AND TAX STATEMENT"
  const sectionPattern = /\bFORM\s+W-?2\b/gi;
  const splits: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(rawText)) !== null) {
    splits.push(match.index);
  }

  // If no "FORM W-2" found, try alternative section markers
  if (splits.length === 0) {
    const altPattern = /\bW-?2\s+WAGE\s+AND\s+TAX\b/gi;
    while ((match = altPattern.exec(rawText)) !== null) {
      splits.push(match.index);
    }
  }

  // Extract sections
  const sections: string[] = [];
  if (splits.length === 0) {
    // Treat entire document as one section
    sections.push(rawText);
  } else {
    for (let i = 0; i < splits.length; i++) {
      const start = splits[i];
      const end = i + 1 < splits.length ? splits[i + 1] : rawText.length;
      sections.push(rawText.substring(start, end));
    }
  }

  // Parse each section into an employer record
  const employers: IRSParseResult["employers"] = [];

  for (const section of sections) {
    const record = parseSectionToRecord(section);
    // Skip sections with no useful data (header text, etc.)
    if (!record.employerName && record.wages === null && record.federalTaxWithheld === null) {
      continue;
    }
    const totalTaxes =
      (record.federalTaxWithheld ?? 0) +
      (record.socialSecurityTax ?? 0) +
      (record.medicareTax ?? 0) +
      (record.stateTaxWithheld ?? 0) +
      (record.localTaxWithheld ?? 0);
    const grossIncome = record.wages;
    const netIncome = grossIncome != null ? grossIncome - totalTaxes : null;

    employers.push({
      ...record,
      cfmReady: {
        year: taxYear,
        grossIncome,
        netIncome: netIncome != null && netIncome > 0 ? netIncome : null,
        notes: record.employerName
          ? `IRS Transcript — ${record.employerName}`
          : "Imported from IRS Transcript",
      },
      companyData: {
        company: record.employerName,
        ein: record.employerEIN,
        address: record.employerAddress,
        state: record.state,
      },
    });
  }

  return { taxYear, documentType: "irs-transcript", employers, rawText };
}

/**
 * Parse a single employer section from an IRS transcript.
 *
 * IRS Wage & Income Transcripts have a structured format per employer:
 *   FORM W-2  WAGE AND TAX STATEMENT
 *   EMPLOYER NAME AND ADDRESS  ACME CORP INC
 *                               123 MAIN ST
 *                               CITY, STATE ZIP
 *   EMPLOYER IDENTIFICATION NUMBER (EIN)  12-3456789
 *   WAGES, TIPS AND OTHER COMPENSATION  34,966.00
 *   FEDERAL INCOME TAX WITHHELD  4,576.00
 *   ...
 *
 * The text is line-based (from positioned extraction), with labels on the
 * left and values on the right, separated by whitespace.
 */
function parseSectionToRecord(section: string): IRSEmployerRecord {
  const record: IRSEmployerRecord = {
    employerName: null,
    employerEIN: null,
    employerAddress: null,
    wages: null,
    federalTaxWithheld: null,
    socialSecurityWages: null,
    socialSecurityTax: null,
    medicareWages: null,
    medicareTax: null,
    stateWages: null,
    stateTaxWithheld: null,
    localWages: null,
    localTaxWithheld: null,
    state: null,
  };

  const lines = section.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // ── Employer Name ──
  // Pattern 1: "EMPLOYER NAME AND ADDRESS  ACME CORP" on same line
  // Pattern 2: Label on one line, name on the next
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for "EMPLOYER NAME" label
    if (/EMPLOYER\s*(?:NAME|'S?\s*NAME)/i.test(line)) {
      // Try extracting name from the same line after the label
      const afterLabel = line.replace(/.*?(?:EMPLOYER\s*(?:NAME\s*(?:AND\s*ADDRESS)?|'S?\s*NAME))[:\s]*/i, "").trim();
      if (afterLabel.length > 2 && !/^\d/.test(afterLabel)) {
        record.employerName = afterLabel.replace(/\s{2,}/g, " ");
      } else if (i + 1 < lines.length) {
        // Name is on the next line
        const nextLine = lines[i + 1].trim();
        if (nextLine.length > 2 && !/^\d{2}-\d{7}/.test(nextLine) && !/WAGES|FEDERAL|SOCIAL|MEDICARE|STATE|LOCAL|EMPLOYEE|BOX/i.test(nextLine)) {
          record.employerName = nextLine.replace(/\s{2,}/g, " ");
          // Check for address on subsequent lines
          const addrLines: string[] = [];
          for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
            const al = lines[j].trim();
            if (/EMPLOYER\s*ID|EIN|WAGES|FEDERAL|SOCIAL|MEDICARE|EMPLOYEE|BOX/i.test(al)) break;
            if (/^\d{2}-\d{7}/.test(al)) break;
            if (al.length > 2) addrLines.push(al);
          }
          if (addrLines.length > 0) record.employerAddress = addrLines.join(", ");
        }
      }
      if (record.employerName) break;
    }

    // Pattern: "PAYER NAME" or just company name after FORM W-2 header
    if (!record.employerName && /PAYER\s*(?:NAME)?/i.test(line)) {
      const afterLabel = line.replace(/.*?PAYER\s*(?:NAME)?[:\s]*/i, "").trim();
      if (afterLabel.length > 2) {
        record.employerName = afterLabel.replace(/\s{2,}/g, " ");
      } else if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.length > 2 && !/^\d{2}-\d{7}/.test(nextLine) && !/WAGES|FEDERAL/i.test(nextLine)) {
          record.employerName = nextLine.replace(/\s{2,}/g, " ");
        }
      }
      if (record.employerName) break;
    }
  }

  // Fallback: look for a line that's all caps text (company name) between FORM W-2 and first dollar amount
  if (!record.employerName) {
    let foundFormW2 = false;
    for (const line of lines) {
      if (/FORM\s+W-?2/i.test(line)) { foundFormW2 = true; continue; }
      if (!foundFormW2) continue;
      // Skip known label lines
      if (/WAGE\s*AND\s*TAX|EMPLOYER\s*(?:NAME|ID)|EMPLOYEE|IDENTIFICATION/i.test(line)) continue;
      // Skip lines with dollar amounts
      if (/\$?\d{1,3}(?:,\d{3})*\.\d{2}/.test(line)) break;
      // Skip EIN lines
      if (/^\d{2}-\d{7}$/.test(line.trim())) continue;
      // Candidate: all-caps text at least 3 chars
      const candidate = line.trim();
      if (candidate.length >= 3 && /^[A-Z][A-Z\s&.,'\-/()]+$/.test(candidate)) {
        record.employerName = candidate.replace(/\s{2,}/g, " ");
        break;
      }
    }
  }

  // ── Employer EIN ──
  for (const line of lines) {
    // Explicit label
    if (/(?:EMPLOYER\s*)?(?:ID(?:ENTIFICATION)?\s*(?:NUMBER)?|EIN)[:\s)]*(\d{2}-\d{7})/i.test(line)) {
      const m = line.match(/(\d{2}-\d{7})/);
      if (m) { record.employerEIN = m[1]; break; }
    }
  }
  // Fallback: find first standalone EIN in the section
  if (!record.employerEIN) {
    for (const line of lines) {
      const m = line.match(/\b(\d{2}-\d{7})\b/);
      if (m) { record.employerEIN = m[1]; break; }
    }
  }

  // ── Dollar Values ──
  // For each field, search lines for the labeled value.
  // IRS transcripts put label and value on the same line separated by whitespace.
  const valuePatterns: Array<[keyof IRSEmployerRecord, RegExp[]]> = [
    ["wages", [
      /WAGES[,\s]+TIPS[,\s]+(?:AND\s+)?OTHER\s+COMP(?:ENSATION)?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*1[:\s]+|WAGES[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["federalTaxWithheld", [
      /FEDERAL\s+(?:INCOME\s+)?TAX\s+WITH(?:HELD)?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*2[:\s]+|FED(?:ERAL)?\s+TAX[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["socialSecurityWages", [
      /SOCIAL\s+SECURITY\s+WAGES[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*3[:\s]+|SS\s+WAGES[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["socialSecurityTax", [
      /SOCIAL\s+SECURITY\s+TAX\s+WITH(?:HELD)?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*4[:\s]+|SS\s+TAX[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["medicareWages", [
      /MEDICARE\s+WAGES\s+(?:AND\s+)?TIPS?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*5[:\s]+|MEDICARE\s+WAGES[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["medicareTax", [
      /MEDICARE\s+TAX\s+WITH(?:HELD)?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*6[:\s]+|MEDICARE\s+TAX[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["stateWages", [
      /STATE\s+WAGES[,\s]+TIPS[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*16[:\s]+|STATE\s+WAGES[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["stateTaxWithheld", [
      /STATE\s+(?:INCOME\s+)?TAX\s+WITH(?:HELD)?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*17[:\s]+|STATE\s+TAX[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["localWages", [
      /LOCAL\s+WAGES[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*18[:\s]+|LOCAL\s+WAGES[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
    ["localTaxWithheld", [
      /LOCAL\s+(?:INCOME\s+)?TAX\s+WITH(?:HELD)?[:\s]*\$?([\d,]+\.?\d*)/i,
      /(?:BOX\s*19[:\s]+|LOCAL\s+TAX[:\s]+)\$?([\d,]+\.?\d*)/i,
    ]],
  ];

  for (const [field, patterns] of valuePatterns) {
    for (const pat of patterns) {
      const m = section.match(pat);
      if (m) {
        const v = parseDollar(m[1]);
        if (v !== null) {
          (record[field] as number | null) = v;
          break;
        }
      }
    }
  }

  // State abbreviation
  for (const line of lines) {
    if (/STATE/i.test(line)) {
      const twoLetters = line.match(/\b([A-Z]{2})\b/g);
      if (twoLetters) {
        for (const code of twoLetters) {
          if (US_STATES.has(code) && code !== "SS" && code !== "ID") {
            record.state = code;
            break;
          }
        }
      }
      if (record.state) break;
    }
  }
  // Fallback: address-line state (ZIP pattern)
  if (!record.state && record.employerAddress) {
    const m = record.employerAddress.match(/\b([A-Z]{2})\s+\d{5}/);
    if (m && US_STATES.has(m[1])) record.state = m[1];
  }

  // Sanity checks (same as W-2 parser)
  if (record.wages !== null && record.federalTaxWithheld !== null) {
    if (record.federalTaxWithheld > record.wages) {
      [record.wages, record.federalTaxWithheld] = [record.federalTaxWithheld, record.wages];
    }
  }

  return record;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractAllText(new Uint8Array(buffer));

    if (rawText.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not extract text from the PDF. It may be a scanned image." },
        { status: 422 }
      );
    }

    const result = parseTranscript(rawText);

    if (result.employers.length === 0) {
      return NextResponse.json(
        { error: "No employer W-2 data found in this document. Make sure it's an IRS Wage & Income Transcript." },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("IRS return parse error:", error);
    return NextResponse.json({ error: "Failed to parse IRS document" }, { status: 500 });
  }
}

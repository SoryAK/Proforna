import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getUserId } from "@/lib/auth-utils";

export interface W2Data {
  taxYear: number | null;
  employerName: string | null;
  employerEIN: string | null;
  employerAddress: string | null;
  employeeAddress: string | null;
  wages: number | null;           // Box 1 — Wages, tips, other compensation
  federalTaxWithheld: number | null; // Box 2
  socialSecurityWages: number | null; // Box 3
  socialSecurityTax: number | null;   // Box 4
  medicareWages: number | null;       // Box 5
  medicareTax: number | null;         // Box 6
  stateTaxWithheld: number | null;    // Box 17
  stateWages: number | null;          // Box 16
  localTaxWithheld: number | null;    // Box 19
  localWages: number | null;          // Box 18
  state: string | null;               // Box 15
  rawText: string;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","GU","VI","AS","MP",
]);

/* ── Helpers ── */

function parseDollar(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  const n = parseFloat(clean);
  return !isNaN(n) && n >= 0 ? n : null;
}

function extractAllAmounts(s: string): number[] {
  const matches = s.match(/\$?[\d,]+\.\d{2}/g);
  if (!matches) return [];
  return matches.map((m) => parseDollar(m)).filter((v): v is number => v !== null);
}

/**
 * Extract positioned text items from page 1 of a PDF using pdfjs-dist.
 * Returns items sorted top-to-bottom, left-to-right, plus the full page text.
 */
async function extractPage1Items(data: Uint8Array): Promise<{ items: TextItem[]; rawText: string }> {
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  const pageHeight = viewport.height;

  const items: TextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    // Transform coordinates: PDF y=0 is bottom, we flip so y=0 is top
    const tx = item.transform;
    const x = tx[4];
    const y = pageHeight - tx[5];
    items.push({ str: item.str.trim(), x, y, width: item.width ?? 0 });
  }

  // Sort top-to-bottom, then left-to-right
  items.sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > 3) return dy;
    return a.x - b.x;
  });

  // Also build full raw text (all pages for the debug viewer)
  let rawText = "";
  const numPages = doc.numPages;
  for (let p = 1; p <= Math.min(numPages, 2); p++) {
    const pg = await doc.getPage(p);
    const tc = await pg.getTextContent();
    const lineTexts: string[] = [];
    for (const it of tc.items) {
      if ("str" in it) lineTexts.push(it.str);
    }
    rawText += lineTexts.join(" ") + "\n---PAGE BREAK---\n";
  }

  await doc.destroy();
  return { items, rawText: rawText.trim() };
}

/**
 * Group text items into rows by y-coordinate proximity.
 * Items within yTolerance pixels of each other are on the same row.
 */
function groupIntoRows(items: TextItem[], yTolerance = 4): TextItem[][] {
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [];
  let currentY = -Infinity;

  for (const item of items) {
    if (Math.abs(item.y - currentY) > yTolerance) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    } else {
      currentRow.push(item);
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Sort items within each row by x position
  for (const row of rows) row.sort((a, b) => a.x - b.x);

  return rows;
}

/**
 * W-2 Parser v4 — Positional extraction using pdfjs-dist.
 *
 * Extracts text with (x, y) coordinates from page 1 only, eliminating
 * the multi-copy problem entirely. Groups items into rows and uses
 * label matching + spatial position to assign values to the correct boxes.
 *
 * W-2 layout: boxes appear in left/right pairs. Labels appear above or
 * on the same row as their values. A label row like
 *   "1 Wages, tips, other comp.   2 Federal income tax withheld"
 * is followed by a value row like
 *   "10,879.52   182.07"
 * The left value maps to box 1, right value to box 2.
 */
function parseW2FromItems(items: TextItem[], rawText: string): W2Data {
  const result: W2Data = {
    taxYear: null, employerName: null, employerEIN: null,
    employerAddress: null, employeeAddress: null,
    wages: null, federalTaxWithheld: null,
    socialSecurityWages: null, socialSecurityTax: null,
    medicareWages: null, medicareTax: null,
    stateTaxWithheld: null, stateWages: null,
    localTaxWithheld: null, localWages: null,
    state: null, rawText,
  };

  const rows = groupIntoRows(items);

  // Build a simple text version of each row for regex matching
  const rowTexts = rows.map((row) => row.map((it) => it.str).join(" "));

  // ── Box pair definitions ──
  const boxPairs: Array<{
    leftField: keyof W2Data;
    rightField: keyof W2Data;
    labelPattern: RegExp;
    leftLabelPattern: RegExp;
    rightLabelPattern: RegExp;
  }> = [
    {
      leftField: "wages", rightField: "federalTaxWithheld",
      labelPattern: /wages.*?comp.*?federal|federal.*?wages.*?comp/i,
      leftLabelPattern: /wages[,.\s]*tips[,.\s]*other\s*comp/i,
      rightLabelPattern: /federal\s*income\s*tax\s*with/i,
    },
    {
      leftField: "socialSecurityWages", rightField: "socialSecurityTax",
      labelPattern: /social\s*security\s*wages.*?social\s*security\s*tax/i,
      leftLabelPattern: /social\s*security\s*wages/i,
      rightLabelPattern: /social\s*security\s*tax\s*with/i,
    },
    {
      leftField: "medicareWages", rightField: "medicareTax",
      labelPattern: /medicare\s*wages.*?medicare\s*tax/i,
      leftLabelPattern: /medicare\s*wages/i,
      rightLabelPattern: /medicare\s*tax\s*with/i,
    },
    {
      leftField: "stateWages", rightField: "stateTaxWithheld",
      labelPattern: /state\s*wages.*?state\s*income\s*tax/i,
      leftLabelPattern: /state\s*wages/i,
      rightLabelPattern: /state\s*income\s*tax/i,
    },
    {
      leftField: "localWages", rightField: "localTaxWithheld",
      labelPattern: /local\s*wages.*?local\s*income\s*tax/i,
      leftLabelPattern: /local\s*wages/i,
      rightLabelPattern: /local\s*income\s*tax/i,
    },
  ];

  // ── Pass 1: Positional paired-box extraction ──
  for (let ri = 0; ri < rows.length; ri++) {
    const rowText = rowTexts[ri];

    for (const pair of boxPairs) {
      if (result[pair.leftField] !== null && result[pair.rightField] !== null) continue;

      // Check if this row is a label row containing both labels of a pair
      const hasLeft = pair.leftLabelPattern.test(rowText);
      const hasRight = pair.rightLabelPattern.test(rowText);
      const hasBoth = pair.labelPattern.test(rowText) || (hasLeft && hasRight);

      if (hasBoth) {
        // Look at the next 1-3 rows for value rows
        for (let vr = ri + 1; vr <= ri + 3 && vr < rows.length; vr++) {
          const valueRowText = rowTexts[vr];
          // Skip rows that are clearly more labels
          if (/\b(?:wages|federal|social|medicare|employer|employee)\b/i.test(valueRowText)
              && !/^\$?[\d,]+/.test(valueRowText)) {
            continue;
          }
          const amounts = extractAllAmounts(valueRowText);
          if (amounts.length >= 2) {
            if (result[pair.leftField] === null) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (result as any)[pair.leftField] = amounts[0];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (result as any)[pair.rightField] = amounts[1];
            }
            break;
          } else if (amounts.length === 1) {
            // Single value — might be on a row by itself; check spatial position
            // If the value's x position is in the right half of the page, it's the right box
            const valueItem = rows[vr].find((it) => /\$?[\d,]+\.\d{2}/.test(it.str));
            if (valueItem) {
              const pageMiddle = 300; // approximate midpoint of a standard 612-point-wide page
              if (valueItem.x > pageMiddle && result[pair.rightField] === null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (result as any)[pair.rightField] = amounts[0];
              } else if (result[pair.leftField] === null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (result as any)[pair.leftField] = amounts[0];
              }
            }
            // Keep looking for more values
            continue;
          }
        }
        continue;
      }

      // Single label on the row
      if (hasLeft && result[pair.leftField] === null) {
        for (let vr = ri; vr <= ri + 2 && vr < rows.length; vr++) {
          const amounts = extractAllAmounts(rowTexts[vr]);
          if (amounts.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result as any)[pair.leftField] = amounts[0];
            break;
          }
        }
      }
      if (hasRight && result[pair.rightField] === null) {
        for (let vr = ri; vr <= ri + 2 && vr < rows.length; vr++) {
          const amounts = extractAllAmounts(rowTexts[vr]);
          if (amounts.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result as any)[pair.rightField] = amounts[0];
            break;
          }
        }
      }
    }
  }

  // ── Pass 2: Text-line fallback for any missing boxes ──
  const fullLines = rawText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const singlePatterns: [keyof W2Data, RegExp][] = [
    ["wages", /^1\s+wages.*?\$?([\d,]+\.\d{2})/i],
    ["federalTaxWithheld", /^2\s+federal.*?\$?([\d,]+\.\d{2})/i],
    ["socialSecurityWages", /^3\s+social.*?\$?([\d,]+\.\d{2})/i],
    ["socialSecurityTax", /^4\s+social.*?\$?([\d,]+\.\d{2})/i],
    ["medicareWages", /^5\s+medicare.*?\$?([\d,]+\.\d{2})/i],
    ["medicareTax", /^6\s+medicare.*?\$?([\d,]+\.\d{2})/i],
    ["stateWages", /^16\s+state.*?\$?([\d,]+\.\d{2})/i],
    ["stateTaxWithheld", /^17\s+state.*?\$?([\d,]+\.\d{2})/i],
    ["localWages", /^18\s+local.*?\$?([\d,]+\.\d{2})/i],
    ["localTaxWithheld", /^19\s+local.*?\$?([\d,]+\.\d{2})/i],
  ];
  for (const line of fullLines) {
    for (const [field, pattern] of singlePatterns) {
      if (result[field] !== null) continue;
      const m = line.match(pattern);
      if (m) {
        const v = parseDollar(m[1]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (v !== null) (result as any)[field] = v;
      }
    }
  }

  // ── Sanity checks: wages > taxes ──
  if (result.wages !== null && result.federalTaxWithheld !== null) {
    if (result.federalTaxWithheld > result.wages) {
      [result.wages, result.federalTaxWithheld] = [result.federalTaxWithheld, result.wages];
    }
  }
  if (result.socialSecurityWages !== null && result.socialSecurityTax !== null) {
    if (result.socialSecurityTax > result.socialSecurityWages) {
      [result.socialSecurityWages, result.socialSecurityTax] = [result.socialSecurityTax, result.socialSecurityWages];
    }
  }
  if (result.medicareWages !== null && result.medicareTax !== null) {
    if (result.medicareTax > result.medicareWages) {
      [result.medicareWages, result.medicareTax] = [result.medicareTax, result.medicareWages];
    }
  }
  if (result.stateWages !== null && result.stateTaxWithheld !== null) {
    if (result.stateTaxWithheld > result.stateWages) {
      [result.stateWages, result.stateTaxWithheld] = [result.stateTaxWithheld, result.stateWages];
    }
  }
  if (result.localWages !== null && result.localTaxWithheld !== null) {
    if (result.localTaxWithheld > result.localWages) {
      [result.localWages, result.localTaxWithheld] = [result.localTaxWithheld, result.localWages];
    }
  }

  // Cross-validate: Box 4 ≈ Box 3 × 6.2%, Box 6 ≈ Box 5 × 1.45%
  if (result.socialSecurityWages !== null && result.socialSecurityTax !== null) {
    const expected = result.socialSecurityWages * 0.062;
    if (Math.abs(result.socialSecurityTax - expected) > expected * 0.5) {
      result.socialSecurityTax = Math.round(expected * 100) / 100;
    }
  }
  if (result.medicareWages !== null && result.medicareTax !== null) {
    const expected = result.medicareWages * 0.0145;
    if (Math.abs(result.medicareTax - expected) > expected * 0.5) {
      result.medicareTax = Math.round(expected * 100) / 100;
    }
  }

  // ── Employer Name ──
  // Use row-based scan for "Employer's name" label
  for (let ri = 0; ri < rows.length; ri++) {
    if (result.employerName) break;
    const rowText = rowTexts[ri];

    const isEmployerLabel =
      /employer['\u2019]?s?\s*name[,.\s]*(?:address|and)/i.test(rowText) ||
      /^c\s+employer/i.test(rowText);

    if (isEmployerLabel) {
      // Company name is on the following row(s)
      const addrLines: string[] = [];
      let foundName = false;
      for (let j = ri + 1; j < Math.min(ri + 5, rows.length); j++) {
        const nextText = rowTexts[j];
        if (/employee|wages|fed.*id|box\s*\d|^\d{2}-\d{7}|social\s*sec/i.test(nextText)) break;
        if (nextText.length <= 2) continue;
        if (/\u00a9|\(c\)\s*\d{4}|page\s+\d/i.test(nextText)) continue;

        if (!foundName) {
          result.employerName = nextText.replace(/\s{2,}/g, " ");
          foundName = true;
        } else {
          addrLines.push(nextText);
        }
      }
      if (addrLines.length) result.employerAddress = addrLines.join(", ");
      break;
    }
  }

  // ── Employer EIN ──
  for (let ri = 0; ri < rows.length; ri++) {
    const rowText = rowTexts[ri];
    if (/(?:fed\s*(?:id|identification)|employer['\u2019]?s?\s*fed|^b\s+employer)/i.test(rowText)) {
      const einMatch = rowText.match(/(\d{2}-\d{7})/);
      if (einMatch) { result.employerEIN = einMatch[1]; break; }
      if (ri + 1 < rows.length) {
        const nextMatch = rowTexts[ri + 1].match(/(\d{2}-\d{7})/);
        if (nextMatch) { result.employerEIN = nextMatch[1]; break; }
      }
    }
  }
  if (!result.employerEIN) {
    for (const rt of rowTexts) {
      const m = rt.match(/\b(\d{2}-\d{7})\b/);
      if (m) { result.employerEIN = m[1]; break; }
    }
  }

  // ── Employee Address ──
  for (let ri = 0; ri < rows.length; ri++) {
    const rowText = rowTexts[ri];
    if (/employee['\u2019]?s?\s*name/i.test(rowText) && !/employer/i.test(rowText)) {
      const addrLines: string[] = [];
      for (let j = ri + 1; j < Math.min(ri + 4, rows.length); j++) {
        if (/box\s*\d|employer|wages|social|medicare|fed\s*id/i.test(rowTexts[j])) break;
        if (rowTexts[j].length > 3) addrLines.push(rowTexts[j]);
      }
      if (addrLines.length) result.employeeAddress = addrLines.join(", ");
      break;
    }
  }

  // ── Tax Year ──
  const yearPatterns = [
    /(?:tax\s*year|for\s*(?:calendar\s*)?year|w-?2\s*(?:wage.*?)?)\s*(\d{4})/i,
    /(\d{4})\s*(?:w-?2|wage\s*and\s*tax)/i,
    /form\s*w-?2.*?(\d{4})/i,
    /statement\s+(\d{4})/i,
  ];
  for (const pat of yearPatterns) {
    const match = rawText.match(pat);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 2000 && year <= 2099) { result.taxYear = year; break; }
    }
  }
  if (!result.taxYear) {
    const yearMatch = rawText.match(/\b(20[12]\d)\b/);
    if (yearMatch) result.taxYear = parseInt(yearMatch[1]);
  }

  // ── State abbreviation (Box 15) ──
  for (const rt of rowTexts) {
    if (/(?:state\s*(?:employer|id)|^15\s+state)/i.test(rt)) {
      const twoLetters = rt.match(/\b([A-Z]{2})\b/g);
      if (twoLetters) {
        for (const code of twoLetters) {
          if (US_STATES.has(code)) { result.state = code; break; }
        }
      }
      if (result.state) break;
    }
  }
  if (!result.state) {
    for (const rt of rowTexts) {
      const m = rt.match(/\b([A-Z]{2})\s+\d{5,}/);
      if (m && US_STATES.has(m[1])) { result.state = m[1]; break; }
    }
  }

  return result;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF or image (PNG, JPEG, WebP)." },
        { status: 400 }
      );
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Image-based W-2 parsing requires OCR which isn't available yet. Please upload the PDF version of your W-2 instead." },
        { status: 422 }
      );
    }

    const { items, rawText } = await extractPage1Items(new Uint8Array(buffer));

    if (items.length < 5) {
      return NextResponse.json(
        { error: "Could not extract text from the PDF. It may be a scanned image — try uploading a text-based PDF." },
        { status: 422 }
      );
    }

    const parsed = parseW2FromItems(items, rawText);

    // Compute derived values for CFM
    const totalTaxes =
      (parsed.federalTaxWithheld ?? 0) +
      (parsed.socialSecurityTax ?? 0) +
      (parsed.medicareTax ?? 0) +
      (parsed.stateTaxWithheld ?? 0) +
      (parsed.localTaxWithheld ?? 0);

    const grossIncome = parsed.wages;
    const netIncome = grossIncome != null ? grossIncome - totalTaxes : null;

    return NextResponse.json({
      ...parsed,
      // Pre-computed values ready for CFM import
      cfmReady: {
        year: parsed.taxYear,
        grossIncome,
        netIncome: netIncome != null && netIncome > 0 ? netIncome : null,
        notes: parsed.employerName
          ? `W-2 from ${parsed.employerName}`
          : "Imported from W-2",
      },
      // Company data for potential employment history import
      companyData: {
        company: parsed.employerName,
        ein: parsed.employerEIN,
        address: parsed.employerAddress,
        state: parsed.state,
        year: parsed.taxYear,
      },
    });
  } catch (error) {
    console.error("W-2 parse error:", error);
    return NextResponse.json({ error: "Failed to parse W-2" }, { status: 500 });
  }
}

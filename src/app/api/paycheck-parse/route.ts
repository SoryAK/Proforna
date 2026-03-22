import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getUserId } from "@/lib/auth-utils";

/* ── Types ── */

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

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
  // Tax percentages (tax / grossPay * 100) — stable across paychecks
  percentages: {
    federalTax: number | null;
    stateTax: number | null;
    socialSecurity: number | null;
    medicare: number | null;
    retirement: number | null;
    healthInsurance: number | null;
    totalDeductions: number | null;
  };
  // Year-to-date totals (from the YTD column)
  ytd: {
    grossPay: number | null;
    netPay: number | null;
    federalTax: number | null;
    stateTax: number | null;
    socialSecurity: number | null;
    medicare: number | null;
    retirement: number | null;
    healthInsurance: number | null;
    totalDeductions: number | null;
  };
  rawText: string;
}

/* ── Positional PDF extraction (same approach as W-2 parser) ── */

async function extractPageItems(data: Uint8Array): Promise<{ items: TextItem[]; rawText: string }> {
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const allItems: TextItem[] = [];
  let rawText = "";

  const numPages = Math.min(doc.numPages, 3);
  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const tx = item.transform;
      const x = tx[4];
      const y = pageHeight - tx[5];
      allItems.push({ str: item.str.trim(), x, y, width: item.width ?? 0 });
    }

    const lineTexts: string[] = [];
    for (const it of content.items) {
      if ("str" in it) lineTexts.push(it.str);
    }
    rawText += lineTexts.join(" ") + "\n";
  }

  await doc.destroy();

  // Sort top-to-bottom, then left-to-right
  allItems.sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > 3) return dy;
    return a.x - b.x;
  });

  return { items: allItems, rawText: rawText.trim() };
}

/** Group text items into rows by y-coordinate proximity. */
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
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Merge adjacent text items on the same row and reassemble split numbers.
 *
 * ADP (and other payroll providers) split numbers into 2-3 separate PDF text
 * elements — e.g. "$1" + "862" + "09" for "$1,862.09", or "-198" + "89" for
 * "-198.89", or "35" + "0200" for "35.0200".
 *
 * Strategy: walk left-to-right. When two adjacent items are both numeric
 * fragments with a small gap, join them — inserting a "." when the second
 * fragment looks like a decimal part (2-4 digits with no existing dot).
 */
function mergeAndReassemble(row: TextItem[]): TextItem[] {
  if (row.length <= 1) return row;
  const merged: TextItem[] = [];
  let cur = { ...row[0] };

  for (let i = 1; i < row.length; i++) {
    const next = row[i];
    const curEnd = cur.x + cur.width;
    const gap = next.x - curEnd;

    // Both fragments are numeric-ish (digits, $, -, comma, dot, *)
    const curIsNumeric = /[\d$,.\-*]$/.test(cur.str);
    const nextIsNumeric = /^[\d$,.\-*]/.test(next.str);
    const bothNumeric = curIsNumeric && nextIsNumeric;

    // Separator characters (comma, dot) that glue numeric fragments
    const nextIsSep = /^[,.]$/.test(next.str);

    if (bothNumeric && gap < 12) {
      // Decide whether to insert a decimal point between fragments.
      // Insert "." when:
      //   - Current ends with digits (no comma/dot at boundary)
      //   - Next is 2-4 pure digits (the decimal-cents portion)
      //   - Current doesn't already contain a "."
      //   - Current doesn't end with a comma (which means thousands grouping)
      //   - It's NOT a thousands group ($1 + 862 = $1,862 not $1.862)
      const curEndsDigits = /\d$/.test(cur.str);
      const curEndsSep = /[,.]$/.test(cur.str);
      const nextIsDecimalPart = /^\d{2,4}\*?$/.test(next.str);
      const curHasDot = cur.str.includes(".");
      // Thousands group: "$X" or "X" followed by exactly 3 digits
      const isThousandsGroup = /^\d{3}$/.test(next.str) && /[\d$]\d{0,2}$/.test(cur.str);
      const needsDot = curEndsDigits && !curEndsSep && nextIsDecimalPart && !curHasDot && !isThousandsGroup;

      const separator = needsDot ? "." : isThousandsGroup ? "," : "";
      cur = {
        str: cur.str + separator + next.str.replace(/\*$/, ""),
        x: cur.x,
        y: cur.y,
        width: (next.x + next.width) - cur.x,
      };
    } else if (nextIsSep && gap < 12) {
      // Merge comma/dot separators into the current number
      cur = {
        str: cur.str + next.str,
        x: cur.x,
        y: cur.y,
        width: (next.x + next.width) - cur.x,
      };
    } else if (gap < 4 && !bothNumeric) {
      // Very close non-numeric items — merge as text (e.g. parts of a label)
      cur = {
        str: cur.str + " " + next.str,
        x: cur.x,
        y: cur.y,
        width: (next.x + next.width) - cur.x,
      };
    } else {
      merged.push(cur);
      cur = { ...next };
    }
  }
  merged.push(cur);
  return merged;
}

/* ── Helpers ── */

function parseDollar(s: string): number | null {
  const clean = s.replace(/[$,\s*]/g, "");
  const n = parseFloat(clean);
  return !isNaN(n) && n >= 0 ? n : null;
}

function parseSignedDollar(s: string): number | null {
  const clean = s.replace(/[$,\s*]/g, "");
  if (/[^0-9.\-]/.test(clean)) return null; // Reject non-numeric (times, text)
  const n = parseFloat(clean);
  return !isNaN(n) ? Math.abs(n) : null;
}

function parseNumber(s: string): number | null {
  const clean = s.replace(/[,\s*]/g, "");
  if (/[^0-9.\-]/.test(clean)) return null; // Reject non-numeric (times, text)
  const n = parseFloat(clean);
  return !isNaN(n) ? n : null;
}

function pct(amount: number | null, gross: number | null): number | null {
  if (amount == null || gross == null || gross === 0) return null;
  return Math.round((amount / gross) * 10000) / 100;
}

/** Find the first dollar amount on a merged row to the right of labelEndX. */
function findAmountRightOf(row: TextItem[], labelEndX: number): number | null {
  for (const item of row) {
    if (item.x <= labelEndX) continue;
    const v = parseSignedDollar(item.str);
    if (v !== null && v > 0) return v;
  }
  return null;
}

/**
 * Find dollar amounts to the right of a label — returns [thisPeriod, ytd] by position.
 *
 * ADP paychecks have two side-by-side sections: the left section (Earnings,
 * Deductions, Net Pay) and a right section (Other Benefits, Important Notes,
 * Time Card Detail).  Items from both sections share the same y-coordinate rows.
 * We use ytdColX to compute a right-boundary so that amounts from the right
 * section are excluded.
 */
function findAmountsRightOf(row: TextItem[], labelEndX: number, ytdColX: number): [number | null, number | null] {
  // Bound the search to the left section of the page.
  // Anything beyond the YTD column + margin is from a different section.
  const sectionMaxCx = ytdColX > 0 ? ytdColX + 100 : -1;

  const amounts: { val: number; cx: number }[] = [];
  for (const item of row) {
    if (item.x <= labelEndX) continue;
    const cx = item.x + item.width / 2;
    if (sectionMaxCx > 0 && cx > sectionMaxCx) continue;
    const v = parseSignedDollar(item.str);
    if (v === null || v === 0) continue;
    amounts.push({ val: v, cx });
  }
  if (amounts.length === 0) return [null, null];

  // Sort left to right
  amounts.sort((a, b) => a.cx - b.cx);

  if (ytdColX > 0) {
    let thisPeriod: number | null = null;
    let ytd: number | null = null;
    for (const a of amounts) {
      if (Math.abs(a.cx - ytdColX) < 80) {
        ytd = a.val;
      } else if (thisPeriod === null) {
        thisPeriod = a.val;
      }
    }
    // If only one value found, check if it's closer to YTD column
    if (thisPeriod !== null && ytd === null) {
      if (Math.abs(amounts[0].cx - ytdColX) < 80) {
        ytd = thisPeriod;
        thisPeriod = null;
      }
    }
    return [thisPeriod, ytd];
  }

  // Fallback: no YTD column header found.
  // When 2+ amounts, leftmost = this period, rightmost = YTD
  if (amounts.length >= 2) {
    return [amounts[0].val, amounts[amounts.length - 1].val];
  }

  // Single amount: treat as this period
  return [amounts[0].val, null];
}

/** Find a numeric value in a column range on a merged row. */
function findNumberInColumn(row: TextItem[], colStart: number, colEnd: number): number | null {
  for (const item of row) {
    const cx = item.x + item.width / 2;
    if (cx >= colStart && cx <= colEnd) {
      const v = parseNumber(item.str);
      if (v !== null) return v;
    }
  }
  return null;
}

/* ── Main parser using positional data ── */

function parsePaycheckFromItems(items: TextItem[], rawText: string): PaycheckData {
  const rawRows = groupIntoRows(items);

  // Merge adjacent items and reassemble split decimals on each row
  const rows = rawRows.map((row) => mergeAndReassemble(row));
  const rowTexts = rows.map((row) => row.map((it) => it.str).join(" "));

  let grossPay: number | null = null;
  let netPay: number | null = null;
  let regularHours: number | null = null;
  let overtimeHours: number | null = null;
  let payRate: number | null = null;
  let federalTax: number | null = null;
  let stateTax: number | null = null;
  let socialSecurity: number | null = null;
  let medicare: number | null = null;
  let retirement: number | null = null;
  let healthInsurance: number | null = null;
  let payPeriodStart: string | null = null;
  let payPeriodEnd: string | null = null;

  // ── Detect column structure ──
  // ADP layout: Description | rate | hours | this period | year to date
  // Other layouts: Description | Hours | Rate | Current | YTD
  let rateColX = -1;
  let hoursColX = -1;
  let thisPeriodColX = -1;
  let ytdColX = -1;

  /**
   * Scan a row for multi-word column headers that may be split across items.
   * ADP often renders "Year to Date" as 3 separate text items and
   * "This Period" as 2 separate items, which won't merge because the
   * gap between header words is typically > 4px.
   */
  function detectColumnsFromRow(row: TextItem[]) {
    for (let j = 0; j < row.length; j++) {
      const s = row[j].str.toLowerCase().trim();

      // Single-word matches
      if (/^rate$/.test(s)) rateColX = row[j].x + row[j].width / 2;
      if (/^hours?$|^hrs\.?$/.test(s)) hoursColX = row[j].x + row[j].width / 2;
      if (/^ytd$/.test(s)) ytdColX = row[j].x + row[j].width / 2;
      if (/^current$|^amount$/.test(s)) thisPeriodColX = row[j].x + row[j].width / 2;

      // Already-merged multi-word
      if (/year\s*to\s*date/.test(s)) {
        ytdColX = row[j].x + row[j].width / 2;
      }
      if (/this\s*period/.test(s)) {
        thisPeriodColX = row[j].x + row[j].width / 2;
      }

      // Split "Year" + "to" + "Date" (3 items)
      if (/^year$/.test(s) && j + 2 < row.length
          && /^to$/i.test(row[j + 1].str.trim())
          && /^date$/i.test(row[j + 2].str.trim())) {
        ytdColX = (row[j].x + row[j + 2].x + row[j + 2].width) / 2;
      }
      // Split "Year" + "to Date" (2 items)
      if (/^year$/.test(s) && j + 1 < row.length
          && /^to\s*date$/i.test(row[j + 1].str.trim())) {
        ytdColX = (row[j].x + row[j + 1].x + row[j + 1].width) / 2;
      }
      // Split "This" + "Period" (2 items)
      if (/^this$/.test(s) && j + 1 < row.length
          && /^period$/i.test(row[j + 1].str.trim())) {
        thisPeriodColX = (row[j].x + row[j + 1].x + row[j + 1].width) / 2;
      }
    }
  }

  // First pass: look for header row with "rate" and "hours"
  for (let i = 0; i < rows.length; i++) {
    const rt = rowTexts[i].toLowerCase();
    if (rt.includes("rate") && (rt.includes("hours") || rt.includes("hrs"))) {
      detectColumnsFromRow(rows[i]);
      break;
    }
  }

  // Fallback: scan any row that mentions "year to date" or "ytd"
  if (ytdColX < 0) {
    for (let i = 0; i < rows.length; i++) {
      const rt = rowTexts[i].toLowerCase();
      if (/year\s*to\s*date|\bytd\b/.test(rt)) {
        detectColumnsFromRow(rows[i]);
        if (ytdColX > 0) break;
      }
    }
  }

  // Last resort: scan all header-like rows (short text rows near the top)
  if (ytdColX < 0) {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const rt = rowTexts[i].toLowerCase();
      if (/date|period|total|ytd/.test(rt)) {
        detectColumnsFromRow(rows[i]);
        if (ytdColX > 0) break;
      }
    }
  }

  // YTD accumulators
  let ytdGross: number | null = null;
  let ytdNet: number | null = null;
  let ytdFederalTax: number | null = null;
  let ytdStateTax: number | null = null;
  let ytdSocialSecurity: number | null = null;
  let ytdMedicare: number | null = null;
  let ytdRetirement: number | null = null;
  let ytdHealthInsurance: number | null = null;

  // ── Row-by-row extraction on merged rows ──
  for (let i = 0; i < rows.length; i++) {
    const rt = rowTexts[i];
    const rtLower = rt.toLowerCase();
    const row = rows[i];

    // ── Gross / Net Pay ──
    if (/gross\s*pay|total\s*gross|gross\s*earnings/i.test(rt) && !/year|ytd/i.test(rt)) {
      const labelItem = row.find((it) => /gross/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        grossPay = tp ?? grossPay;
        ytdGross = yt ?? ytdGross;
      }
    }
    if (/net\s*pay/i.test(rt) && !/year|ytd/i.test(rt)) {
      const labelItem = row.find((it) => /net/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        netPay = tp ?? netPay;
        ytdNet = yt ?? ytdNet;
      }
    }

    // ── Earnings rows: Regular, Overtime ──
    // After merging, "Regular" row items: "Regular", "35.0200", "40.00", "1,400.80", "9,399.02"
    // ADP column order: label, rate, hours, this-period, year-to-date
    if (/^regular\b|^reg\b|^straight\s*time/i.test(rtLower.trim())) {
      const nums: { val: number; x: number }[] = [];
      for (const item of row) {
        const v = parseNumber(item.str);
        if (v !== null && v > 0) nums.push({ val: v, x: item.x });
      }
      if (rateColX > 0 && hoursColX > 0) {
        for (const n of nums) {
          if (Math.abs(n.x - rateColX) < 40 && n.val < 500) payRate = n.val;
          if (Math.abs(n.x - hoursColX) < 40 && n.val < 200) regularHours = n.val;
        }
      } else if (nums.length >= 2) {
        // Positional heuristic: first number = rate, second = hours
        // Both are small numbers (< 500). Larger numbers are period totals.
        const small = nums.filter((n) => n.val < 500).sort((a, b) => a.x - b.x);
        if (small.length >= 2) {
          payRate = small[0].val;
          regularHours = small[1].val;
        } else if (small.length === 1) {
          // Single small number — decide by magnitude
          if (small[0].val <= 200) regularHours = small[0].val;
          else payRate = small[0].val;
        }
      }
    }
    if (/^overtime\b|^ot\b|^over\s*time/i.test(rtLower.trim())) {
      const nums: { val: number; x: number }[] = [];
      for (const item of row) {
        const v = parseNumber(item.str);
        if (v !== null && v > 0) nums.push({ val: v, x: item.x });
      }
      if (hoursColX > 0) {
        const h = nums.find((n) => Math.abs(n.x - hoursColX) < 40 && n.val < 200);
        if (h) overtimeHours = h.val;
      } else {
        const h = nums.find((n) => n.val > 0 && n.val < 200);
        if (h) overtimeHours = h.val;
      }
    }

    // ── Tax deductions (first amount after label = this period, second = YTD) ──
    if (/federal\s*(?:income\s*)?tax|fed\s*(?:income\s*)?(?:tax|w\/h|withholding)/i.test(rt)) {
      const labelItem = row.findLast?.((it) => /tax|withholding|w\/h/i.test(it.str))
                      ?? row.find((it) => /fed/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        federalTax = tp ?? federalTax;
        ytdFederalTax = yt ?? ytdFederalTax;
      }
    }
    if (/state\s*(?:income\s*)?tax|^sit\b|state\s*w\/h/i.test(rt) && !/eddystone|local/i.test(rt)) {
      const labelItem = row.findLast?.((it) => /tax|withholding|w\/h/i.test(it.str))
                      ?? row.find((it) => /state/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        stateTax = tp ?? stateTax;
        ytdStateTax = yt ?? ytdStateTax;
      }
    }
    if (/social\s*security|oasdi|fica\s*(?:ss|oasdi)/i.test(rt)) {
      const labelItem = row.findLast?.((it) => /tax/i.test(it.str))
                      ?? row.find((it) => /social|oasdi|fica/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        socialSecurity = tp ?? socialSecurity;
        ytdSocialSecurity = yt ?? ytdSocialSecurity;
      }
    }
    if (/medicare\s*tax|med\s*tax/i.test(rt) && !/social/i.test(rt)) {
      const labelItem = row.findLast?.((it) => /tax/i.test(it.str))
                      ?? row.find((it) => /medicare|med/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        medicare = tp ?? medicare;
        ytdMedicare = yt ?? ytdMedicare;
      }
    }
    if (/401\s*k|retirement|pension|403\s*b|roth\b|tsp\b/i.test(rt)) {
      const labelItem = row.find((it) => /401|retirement|pension|403|roth|tsp/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        retirement = tp ?? retirement;
        ytdRetirement = yt ?? ytdRetirement;
      }
    }
    if (/health\s*(?:ins|insurance|plan)|medical\s*(?:ins|insurance|plan)|dental|vision|hmo|ppo|hsa/i.test(rt)) {
      const labelItem = row.find((it) => /health|medical|dental|vision|hmo|ppo|hsa/i.test(it.str));
      if (labelItem) {
        const [tp, yt] = findAmountsRightOf(row, labelItem.x + labelItem.width, ytdColX);
        healthInsurance = tp ?? healthInsurance;
        ytdHealthInsurance = yt ?? ytdHealthInsurance;
      }
    }

    // ── Pay period dates ──
    if (/period\s*beginning|period\s*start/i.test(rt)) {
      const m = rt.match(/(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/);
      if (m) payPeriodStart = m[1];
    }
    if (/period\s*ending|period\s*end/i.test(rt)) {
      const m = rt.match(/(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/);
      if (m) payPeriodEnd = m[1];
    }
    // Fallback: inline "from – to" format
    if (!payPeriodStart) {
      const dateMatch = rt.match(
        /(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*(?:to|[-–—]|through|thru)\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
      );
      if (dateMatch) {
        payPeriodStart = dateMatch[1];
        payPeriodEnd = dateMatch[2];
      }
    }
  }

  // ── Other deductions (remainder) ──
  const knownDeductions = [federalTax, stateTax, socialSecurity, medicare, retirement, healthInsurance]
    .filter((v): v is number => v !== null)
    .reduce((s, v) => s + v, 0);

  let otherDeductions: number | null = null;
  if (grossPay && netPay && knownDeductions > 0) {
    const totalDed = grossPay - netPay;
    const remainder = totalDed - knownDeductions;
    if (remainder > 1) otherDeductions = Math.round(remainder * 100) / 100;
  }

  // ── Compute percentages (tax / gross) — stable across paychecks ──
  const totalDedAmt = knownDeductions + (otherDeductions ?? 0);
  const percentages = {
    federalTax: pct(federalTax, grossPay),
    stateTax: pct(stateTax, grossPay),
    socialSecurity: pct(socialSecurity, grossPay),
    medicare: pct(medicare, grossPay),
    retirement: pct(retirement, grossPay),
    healthInsurance: pct(healthInsurance, grossPay),
    totalDeductions: grossPay && totalDedAmt > 0
      ? Math.round((totalDedAmt / grossPay) * 10000) / 100
      : null,
  };

  // ── Compute YTD total deductions ──
  const ytdKnownDed = [ytdFederalTax, ytdStateTax, ytdSocialSecurity, ytdMedicare, ytdRetirement, ytdHealthInsurance]
    .filter((v): v is number => v !== null)
    .reduce((s, v) => s + v, 0);
  const ytdTotalDed = ytdGross && ytdNet
    ? Math.round((ytdGross - ytdNet) * 100) / 100
    : ytdKnownDed > 0
      ? ytdKnownDed
      : null;

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
    payPeriodStart,
    payPeriodEnd,
    percentages,
    ytd: {
      grossPay: ytdGross,
      netPay: ytdNet,
      federalTax: ytdFederalTax,
      stateTax: ytdStateTax,
      socialSecurity: ytdSocialSecurity,
      medicare: ytdMedicare,
      retirement: ytdRetirement,
      healthInsurance: ytdHealthInsurance,
      totalDeductions: ytdTotalDed,
    },
    rawText: rawText.slice(0, 3000),
  };
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF files are supported. Please upload a PDF paycheck." },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { items, rawText } = await extractPageItems(new Uint8Array(buffer));

    if (items.length < 5) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF. It may be image-based — try a text-based paycheck PDF." },
        { status: 422 },
      );
    }

    const data = parsePaycheckFromItems(items, rawText);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse paycheck. Please try a different file." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/employment-report/compare
 *
 * Accepts extracted Equifax employment data and compares it against
 * the user's existing WorkHistory records.
 *
 * Returns a comparison result showing matches, discrepancies, and missing entries.
 */

interface EquifaxEmployer {
  employerName: string;
  employerCode: string | null;
  ein: string | null;
  hireDate: string | null;
  separationDate: string | null;
  status: string;
  jobTitle: string | null;
  payFrequency: string | null;
  basePay: number | null;
  payRate: string | null;
  totalCompensation: number | null;
  lastPayDate: string | null;
}

interface ComparisonField {
  field: string;
  label: string;
  equifaxValue: string | null;
  appValue: string | null;
  match: boolean;
}

interface ComparisonResult {
  status: "matched" | "discrepancy" | "missing-from-app" | "missing-from-report";
  equifaxRecord: EquifaxEmployer | null;
  workHistoryRecord: {
    id: string;
    company: string;
    title: string | null;
    ein: string | null;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
    salaryAmount: number | null;
    salaryType: string | null;
    payRate: string | null;
    payFrequency: string | null;
    legalName: string | null;
  } | null;
  fields: ComparisonField[];
  matchScore: number; // 0-100
}

/**
 * Fuzzy company name matching.
 * Normalizes names by removing common suffixes, punctuation, case.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"!?()]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co|company|corporation|incorporated|limited|group|holdings|services|enterprises)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function companiesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (na === nb) return true;
  // Check if one contains the other (for partial matches)
  if (na.length > 3 && nb.length > 3) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  // Simple Levenshtein-like check for close matches
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (shorter.length > 5 && longer.startsWith(shorter.slice(0, Math.ceil(shorter.length * 0.7)))) {
    return true;
  }
  return false;
}

function einsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const cleanA = a.replace(/[^0-9]/g, "");
  const cleanB = b.replace(/[^0-9]/g, "");
  return cleanA === cleanB && cleanA.length === 9;
}

/**
 * Convert YYYY-MM-DD to YYYY-MM for comparison with WorkHistory's YYYY-MM format.
 */
function toYearMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function datesClose(a: string | null, b: string | null): boolean {
  const ya = toYearMonth(a);
  const yb = toYearMonth(b);
  if (!ya || !yb) return false;
  if (ya === yb) return true;
  // Within 1 month tolerance
  const [ay, am] = ya.split("-").map(Number);
  const [by, bm] = yb.split("-").map(Number);
  const diffMonths = Math.abs((ay * 12 + am) - (by * 12 + bm));
  return diffMonths <= 1;
}

function formatMoney(amount: number | null): string | null {
  if (amount == null) return null;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const employers: EquifaxEmployer[] = body.employers;

    if (!employers || !Array.isArray(employers) || employers.length === 0) {
      return NextResponse.json({ error: "No employer data provided" }, { status: 400 });
    }

    // Fetch all user's WorkHistory records
    const workHistory = await prisma.workHistory.findMany({
      where: { userId, type: "job" },
      select: {
        id: true,
        company: true,
        title: true,
        ein: true,
        legalName: true,
        startDate: true,
        endDate: true,
        isActive: true,
        salaryAmount: true,
        salaryType: true,
        payRate: true,
        payFrequency: true,
        address: true,
        location: true,
      },
      orderBy: { startDate: "desc" },
    });

    const comparisons: ComparisonResult[] = [];
    const matchedWHIds = new Set<string>();

    // For each Equifax employer, try to find a matching WorkHistory record
    for (const eq of employers) {
      let bestMatch: (typeof workHistory)[0] | null = null;
      let bestScore = 0;

      for (const wh of workHistory) {
        if (matchedWHIds.has(wh.id)) continue;

        let score = 0;

        // EIN match is strongest signal
        if (einsMatch(eq.ein, wh.ein)) {
          score += 50;
        }

        // Company name match
        const nameMatches = companiesMatch(eq.employerName, wh.company) ||
          (wh.legalName ? companiesMatch(eq.employerName, wh.legalName) : false);
        if (nameMatches) score += 40;

        // Start date match
        if (datesClose(eq.hireDate, wh.startDate)) score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = wh;
        }
      }

      if (bestMatch && bestScore >= 40) {
        // We have a match — compare fields
        matchedWHIds.add(bestMatch.id);

        const fields: ComparisonField[] = [];

        // Company name
        fields.push({
          field: "company",
          label: "Employer Name",
          equifaxValue: eq.employerName,
          appValue: bestMatch.legalName || bestMatch.company,
          match: companiesMatch(eq.employerName, bestMatch.legalName || bestMatch.company),
        });

        // EIN
        if (eq.ein) {
          fields.push({
            field: "ein",
            label: "EIN",
            equifaxValue: eq.ein,
            appValue: bestMatch.ein,
            match: einsMatch(eq.ein, bestMatch.ein),
          });
        }

        // Hire date
        fields.push({
          field: "hireDate",
          label: "Hire Date",
          equifaxValue: eq.hireDate,
          appValue: bestMatch.startDate,
          match: datesClose(eq.hireDate, bestMatch.startDate),
        });

        // Separation date
        fields.push({
          field: "separationDate",
          label: "End Date",
          equifaxValue: eq.separationDate || (eq.status === "active" ? "Active" : null),
          appValue: bestMatch.endDate || (bestMatch.isActive ? "Active" : null),
          match: eq.status === "active"
            ? bestMatch.isActive
            : datesClose(eq.separationDate, bestMatch.endDate),
        });

        // Job title
        if (eq.jobTitle) {
          fields.push({
            field: "title",
            label: "Job Title",
            equifaxValue: eq.jobTitle,
            appValue: bestMatch.title,
            match: eq.jobTitle && bestMatch.title
              ? eq.jobTitle.toLowerCase().trim() === bestMatch.title.toLowerCase().trim()
              : false,
          });
        }

        // Pay
        if (eq.basePay != null) {
          fields.push({
            field: "basePay",
            label: "Base Pay",
            equifaxValue: formatMoney(eq.basePay),
            appValue: formatMoney(bestMatch.salaryAmount),
            match: eq.basePay != null && bestMatch.salaryAmount != null
              ? Math.abs(eq.basePay - bestMatch.salaryAmount) < 0.5
              : false,
          });
        }

        // Pay frequency
        if (eq.payFrequency) {
          fields.push({
            field: "payFrequency",
            label: "Pay Frequency",
            equifaxValue: eq.payFrequency,
            appValue: bestMatch.payFrequency,
            match: eq.payFrequency === bestMatch.payFrequency,
          });
        }

        const matchedFields = fields.filter((f) => f.match).length;
        const matchScore = Math.round((matchedFields / fields.length) * 100);
        const hasDiscrepancy = fields.some((f) => !f.match);

        comparisons.push({
          status: hasDiscrepancy ? "discrepancy" : "matched",
          equifaxRecord: eq,
          workHistoryRecord: bestMatch,
          fields,
          matchScore,
        });
      } else {
        // No match found — this employer is in Equifax but not in app
        comparisons.push({
          status: "missing-from-app",
          equifaxRecord: eq,
          workHistoryRecord: null,
          fields: [],
          matchScore: 0,
        });
      }
    }

    // Find WorkHistory records not matched by any Equifax employer
    for (const wh of workHistory) {
      if (!matchedWHIds.has(wh.id)) {
        comparisons.push({
          status: "missing-from-report",
          equifaxRecord: null,
          workHistoryRecord: wh,
          fields: [],
          matchScore: 0,
        });
      }
    }

    // Summary stats
    const summary = {
      total: comparisons.length,
      matched: comparisons.filter((c) => c.status === "matched").length,
      discrepancies: comparisons.filter((c) => c.status === "discrepancy").length,
      missingFromApp: comparisons.filter((c) => c.status === "missing-from-app").length,
      missingFromReport: comparisons.filter((c) => c.status === "missing-from-report").length,
    };

    return NextResponse.json({ success: true, comparisons, summary });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[employment-report/compare] Error:", msg);
    return NextResponse.json({ error: "Comparison failed" }, { status: 500 });
  }
}

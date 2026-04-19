import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { buildAliasResolver, normEmployer } from "@/lib/employer-alias";

/**
 * GET /api/income-history?employer=CompanyName
 * Returns year-by-year income entries for a given employer + lifetime total.
 * Resolves employer aliases so "VALU INT ACTI IN" matches "Values Into Action" etc.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employer = req.nextUrl.searchParams.get("employer")?.trim();
  if (!employer) return NextResponse.json({ error: "employer query param required" }, { status: 400 });

  // Resolve alias: find canonical name for the queried employer
  const resolve = await buildAliasResolver(userId);
  const canonical = resolve(employer);

  // Find all aliases that map to this canonical name
  const aliases = await prisma.employerAlias.findMany({
    where: { userId, canonicalName: canonical },
    select: { variantName: true },
  });

  // Build set of normalised names to match against
  const matchNames = new Set<string>([normEmployer(employer), normEmployer(canonical)]);
  aliases.forEach((a) => matchNames.add(a.variantName));

  // Build list of original employer name variants to push filter into SQL
  const variantNames = Array.from(matchNames);

  // Fetch matching entries directly from DB (no fetch-all-then-filter)
  const entries = await prisma.careerIncomeEntry.findMany({
    where: {
      incomeYear: { userId },
      employer: { in: variantNames, mode: "insensitive" },
    },
    include: { incomeYear: { select: { year: true } } },
    orderBy: { incomeYear: { year: "asc" } },
  });

  // Aggregate per-year: sum entries within the same year (NOT across years)
  const yearMap = new Map<number, { grossIncome: number; netIncome: number }>();
  for (const e of entries) {
    const yr = e.incomeYear.year;
    const existing = yearMap.get(yr);
    if (existing) {
      existing.grossIncome += e.grossIncome;
      existing.netIncome += e.netIncome ?? 0;
    } else {
      yearMap.set(yr, { grossIncome: e.grossIncome, netIncome: e.netIncome ?? 0 });
    }
  }

  const years = Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => ({
      year,
      grossIncome: data.grossIncome,
      netIncome: data.netIncome || null,
    }));

  // Lifetime total: sum across all years (total tenure)
  const totalGross = years.reduce((s, y) => s + y.grossIncome, 0);
  const totalNet = years.reduce((s, y) => s + (y.netIncome ?? 0), 0);

  return NextResponse.json({
    employer: canonical,
    years,
    totalGross,
    totalNet: totalNet > 0 ? totalNet : null,
    yearCount: years.length,
  });
}

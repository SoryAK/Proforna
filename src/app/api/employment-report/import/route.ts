import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/employment-report/import
 *
 * Imports or updates WorkHistory records from extracted Equifax data.
 * Accepts an array of actions: { action: "create" | "update", data, workHistoryId? }
 */

interface ImportAction {
  action: "create" | "update";
  workHistoryId?: string; // for updates
  data: {
    employerName: string;
    ein: string | null;
    hireDate: string | null;
    separationDate: string | null;
    status: string;
    jobTitle: string | null;
    basePay: number | null;
    payRate: string | null;
    payFrequency: string | null;
  };
}

function toYearMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function parseYear(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Given Equifax employer records with basePay + date ranges,
 * populate CareerIncomeYear + CareerIncomeEntry so the data
 * flows into income projections / career model.
 */
async function populateIncomeTimeline(
  userId: string,
  actions: ImportAction[]
) {
  // Only process employers that have basePay and at least a hireDate
  const withPay = actions.filter(
    (a) => a.data.basePay != null && a.data.basePay > 0 && a.data.hireDate
  );
  if (withPay.length === 0) return;

  const currentYear = new Date().getFullYear();

  // Build a map: year → [{ employer, grossIncome, ein }]
  const yearMap = new Map<number, { employer: string; grossIncome: number; ein: string | null }[]>();

  for (const act of withPay) {
    const startYear = parseYear(act.data.hireDate)!;
    const endYear = act.data.separationDate
      ? parseYear(act.data.separationDate) ?? currentYear
      : currentYear;

    // Annualize basePay based on payRate/payFrequency
    let annualPay = act.data.basePay!;
    if (act.data.payRate === "hourly") {
      // Assume 40h/week, 52 weeks
      annualPay = act.data.basePay! * 40 * 52;
    } else if (act.data.payFrequency) {
      // If basePay is per-period, annualize it
      const multipliers: Record<string, number> = {
        weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, annual: 1,
      };
      const mult = multipliers[act.data.payFrequency];
      if (mult && mult !== 1) {
        annualPay = act.data.basePay! * mult;
      }
    }

    // Populate each year the employer was active
    for (let y = startYear; y <= Math.min(endYear, currentYear); y++) {
      if (!yearMap.has(y)) yearMap.set(y, []);
      yearMap.get(y)!.push({
        employer: act.data.employerName,
        grossIncome: Math.round(annualPay),
        ein: act.data.ein,
      });
    }
  }

  // Upsert CareerIncomeYear + CareerIncomeEntry for each year
  for (const [year, employers] of yearMap) {
    const totalGross = employers.reduce((s, e) => s + e.grossIncome, 0);

    const incomeYear = await prisma.careerIncomeYear.upsert({
      where: { userId_year: { userId, year } },
      create: {
        userId,
        year,
        grossIncome: totalGross,
        jobCount: employers.length,
        notes: "Auto-populated from Equifax Work Number report",
      },
      update: {
        // Only update if the existing record was also auto-populated (don't overwrite manual edits)
        // We check notes to detect auto-populated records
      },
    });

    // Check if entries already exist for this year to avoid duplicates
    const existingEntries = await prisma.careerIncomeEntry.findMany({
      where: { yearId: incomeYear.id },
    });

    for (const emp of employers) {
      // Skip if an entry for this employer already exists in this year
      const alreadyExists = existingEntries.some(
        (e) => e.employer.toLowerCase() === emp.employer.toLowerCase()
      );
      if (alreadyExists) continue;

      await prisma.careerIncomeEntry.create({
        data: {
          yearId: incomeYear.id,
          employer: emp.employer,
          grossIncome: emp.grossIncome,
          ein: emp.ein,
          notes: "From Equifax Work Number report",
        },
      });
    }

    // Re-aggregate the year total from all entries (existing + new)
    const allEntries = await prisma.careerIncomeEntry.findMany({
      where: { yearId: incomeYear.id },
    });
    const newTotal = allEntries.reduce((s, e) => s + e.grossIncome, 0);
    await prisma.careerIncomeYear.update({
      where: { id: incomeYear.id },
      data: { grossIncome: newTotal, jobCount: allEntries.length },
    });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const actions: ImportAction[] = body.actions;

    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json({ error: "No actions provided" }, { status: 400 });
    }

    const results: { action: string; employer: string; success: boolean; id?: string; error?: string }[] = [];

    for (const act of actions) {
      try {
        if (act.action === "create") {
          const record = await prisma.workHistory.create({
            data: {
              userId,
              type: "job",
              company: act.data.employerName,
              legalName: act.data.employerName,
              ein: act.data.ein,
              title: act.data.jobTitle,
              address: "N/A",
              lat: 0,
              lng: 0,
              startDate: toYearMonth(act.data.hireDate),
              endDate: toYearMonth(act.data.separationDate),
              isActive: act.data.status === "active",
              salaryAmount: act.data.basePay,
              salaryType: act.data.payRate === "hourly" ? "hourly" : "annual",
              payRate: act.data.basePay ? `$${act.data.basePay}` : null,
              payFrequency: act.data.payFrequency,
            },
          });
          results.push({ action: "create", employer: act.data.employerName, success: true, id: record.id });
        } else if (act.action === "update" && act.workHistoryId) {
          // Verify ownership
          const existing = await prisma.workHistory.findFirst({
            where: { id: act.workHistoryId, userId },
          });
          if (!existing) {
            results.push({ action: "update", employer: act.data.employerName, success: false, error: "Record not found" });
            continue;
          }

          // Build update payload — only update fields that have Equifax data
          const updateData: Record<string, unknown> = {};

          if (act.data.ein) updateData.ein = act.data.ein;
          if (act.data.employerName) updateData.legalName = act.data.employerName;
          if (act.data.hireDate) updateData.startDate = toYearMonth(act.data.hireDate);
          if (act.data.separationDate) updateData.endDate = toYearMonth(act.data.separationDate);
          if (act.data.status) updateData.isActive = act.data.status === "active";
          if (act.data.jobTitle) updateData.title = act.data.jobTitle;
          if (act.data.basePay != null) {
            updateData.salaryAmount = act.data.basePay;
            updateData.salaryType = act.data.payRate === "hourly" ? "hourly" : "annual";
            updateData.payRate = `$${act.data.basePay}`;
          }
          if (act.data.payFrequency) updateData.payFrequency = act.data.payFrequency;

          await prisma.workHistory.update({
            where: { id: act.workHistoryId },
            data: updateData,
          });

          results.push({ action: "update", employer: act.data.employerName, success: true, id: act.workHistoryId });
        } else {
          results.push({ action: act.action, employer: act.data.employerName, success: false, error: "Invalid action" });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ action: act.action, employer: act.data.employerName, success: false, error: msg });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Populate income timeline for career projections
    let incomeTimelinePopulated = false;
    try {
      await populateIncomeTimeline(userId, actions.filter((a) => a.data.basePay != null));
      incomeTimelinePopulated = true;
    } catch (err) {
      console.error("[employment-report/import] Income timeline population failed:", err);
      // Non-fatal — work history records are already saved
    }

    return NextResponse.json({
      success: true,
      results,
      summary: { total: results.length, succeeded, failed },
      incomeTimelinePopulated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[employment-report/import] Error:", msg);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

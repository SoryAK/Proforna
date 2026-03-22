import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── Server-side annual estimate (mirrors compensation-tracker logic) ── */

interface EstimatorSettings {
  estOt2Hours?: string;
  estOt2Rate?: string;
  estSchedBOt2?: string;
  estDiffPercent?: string;
  estHolidayDays?: string;
  estHolidayRate?: string;
  estFederalTax?: string;
  estStateTax?: string;
  estRetirement?: string;
  estHealthIns?: string;
  estOtherDed?: string;
}

interface LiveEstimate {
  year: number;
  grossIncome: number;
  netIncome: number | null;
  company: string;
  role: string;
  breakdown: {
    basePay: number;
    ot1Pay: number;
    ot2Pay: number;
    diffPay: number;
    holidayPay: number;
    bonuses: number;
  };
  ytdGross: number | null; // year-to-date gross based on pay periods elapsed
}

function computeLiveEstimate(
  position: {
    payType: string;
    payRate: string | null;
    salary: number | null;
    differentials: string | null;
    payFrequency: string;
    rotatingSchedule: boolean;
    hoursPerWeek: number | null;
    scheduleBHours: number | null;
    otHoursA: number | null;
    otHoursB: number | null;
    otRate: number | null;
    estimatorSettings: string | null;
    company: string;
    role: string;
    startDate: Date;
  },
  compensationEvents: { type: string; amount: number; recurring: boolean; effectiveDate: Date }[]
): LiveEstimate {
  const settings: EstimatorSettings = (() => {
    try { return position.estimatorSettings ? JSON.parse(position.estimatorSettings) : {}; }
    catch { return {}; }
  })();

  const baseRateNum = position.payRate ? parseFloat(position.payRate.replace(/[^0-9.]/g, "")) : 0;
  const diffItems = position.differentials?.split("\n").filter(Boolean) ?? [];
  const parseDiffAmount = (d: string) => {
    const m = d.match(/[+-]?\$?([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  };

  // Hours
  const schedAHrs = position.hoursPerWeek ?? 40;
  const schedBHrs = position.scheduleBHours ?? 40;
  const schedAOt1 = position.otHoursA ?? 0;
  const schedBOt1 = position.otHoursB ?? 0;
  const ot1Rate = position.otRate ?? 1.5;
  const schedAOt2 = parseFloat(settings.estOt2Hours ?? "0");
  const schedBOt2 = parseFloat(settings.estSchedBOt2 ?? "0");
  const ot2Rate = parseFloat(settings.estOt2Rate ?? "2");
  const diffPct = parseFloat(settings.estDiffPercent ?? "50") / 100;
  const holidayDays = parseFloat(settings.estHolidayDays ?? "0");
  const holidayRate = parseFloat(settings.estHolidayRate ?? "1.5");

  // Tax / deductions (for net estimate)
  const fedTaxPct = parseFloat(settings.estFederalTax ?? "22") / 100;
  const stateTaxPct = parseFloat(settings.estStateTax ?? "5") / 100;
  const retirementPct = parseFloat(settings.estRetirement ?? "0") / 100;
  const healthInsPer = parseFloat(settings.estHealthIns ?? "0");
  const otherDedPer = parseFloat(settings.estOtherDed ?? "0");

  const payPeriods = position.payFrequency === "weekly" ? 52
    : position.payFrequency === "biweekly" ? 26
    : position.payFrequency === "semimonthly" ? 24
    : 12;

  // Compensation events
  const totalBonuses = compensationEvents
    .filter((e) => !e.recurring)
    .reduce((sum, e) => sum + e.amount, 0);
  const currentSalaryEvent = compensationEvents
    .filter((e) => e.recurring)
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];

  let basePay: number, ot1Pay: number, ot2Pay: number, diffPay: number;

  if (position.payType === "hourly" && baseRateNum > 0) {
    const weeksPerYear = 52;
    const avgDiff = diffItems.length > 0
      ? diffItems.reduce((sum, d) => sum + parseDiffAmount(d), 0) / diffItems.length
      : 0;

    if (position.rotatingSchedule) {
      const half = weeksPerYear / 2;
      basePay = baseRateNum * (schedAHrs * half + schedBHrs * half);
      ot1Pay = baseRateNum * ot1Rate * (schedAOt1 * half + schedBOt1 * half);
      ot2Pay = baseRateNum * ot2Rate * (schedAOt2 * half + schedBOt2 * half);
      diffPay = avgDiff * (schedAHrs * half + schedBHrs * half) * diffPct;
    } else {
      basePay = baseRateNum * schedAHrs * weeksPerYear;
      ot1Pay = baseRateNum * ot1Rate * schedAOt1 * weeksPerYear;
      ot2Pay = baseRateNum * ot2Rate * schedAOt2 * weeksPerYear;
      diffPay = avgDiff * schedAHrs * diffPct * weeksPerYear;
    }
  } else {
    basePay = position.salary || (currentSalaryEvent?.amount ?? 0);
    ot1Pay = 0;
    ot2Pay = 0;
    diffPay = 0;
  }

  const holidayPay = baseRateNum > 0 ? baseRateNum * holidayRate * 8 * holidayDays : 0;
  const grossIncome = basePay + ot1Pay + ot2Pay + diffPay + holidayPay + totalBonuses;

  // Net estimate
  const grossPerPeriod = grossIncome / payPeriods;
  const deductionsPerPeriod = grossPerPeriod * (fedTaxPct + stateTaxPct + retirementPct) + healthInsPer + otherDedPer;
  const netPerPeriod = grossPerPeriod - deductionsPerPeriod;
  const netIncome = netPerPeriod * payPeriods;

  // Year-to-date: count completed pay periods this year for more accurate estimate
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const posStart = position.startDate > yearStart ? position.startDate : yearStart;

  // Count how many pay periods have been completed from posStart to now
  const periodDays = position.payFrequency === "weekly" ? 7
    : position.payFrequency === "biweekly" ? 14
    : position.payFrequency === "semimonthly" ? 15
    : 30;
  const daysSinceStart = (now.getTime() - posStart.getTime()) / (86400000);
  const completedPeriods = Math.floor(daysSinceStart / periodDays);
  const fractionOfYear = Math.min(1, completedPeriods / payPeriods);
  const ytdGross = grossIncome > 0 ? Math.round(grossIncome * fractionOfYear) : null;

  return {
    year: currentYear,
    grossIncome: Math.round(grossIncome),
    netIncome: netIncome > 0 ? Math.round(netIncome) : null,
    company: position.company,
    role: position.role,
    breakdown: {
      basePay: Math.round(basePay),
      ot1Pay: Math.round(ot1Pay),
      ot2Pay: Math.round(ot2Pay),
      diffPay: Math.round(diffPay),
      holidayPay: Math.round(holidayPay),
      bonuses: totalBonuses,
    },
    ytdGross,
  };
}

// GET — all income years + wage tiers + live estimate from current position
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [incomeYears, wageTiers, activePositions] = await Promise.all([
      prisma.careerIncomeYear.findMany({
        orderBy: { year: "asc" },
        include: {
          entries: { orderBy: { createdAt: "asc" } },
          w2Records: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.wageTier.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.currentPosition.findMany({
        where: { isActive: true },
        orderBy: { startDate: "desc" },
        include: {
          compensation: true,
          paychecks: { orderBy: { createdAt: "desc" } },
        },
      }),
    ]);

    let liveEstimate: LiveEstimate | null = null;
    const activePosition = activePositions[0] ?? null;
    if (activePosition) {
      liveEstimate = computeLiveEstimate(activePosition, activePosition.compensation);
    }

    // Build paycheck tracker data for all active positions
    const paycheckTrackers = activePositions.map((pos) => {
      const le = computeLiveEstimate(pos, pos.compensation);
      const latest = pos.paychecks[0] ?? null;
      return {
        positionId: pos.id,
        company: pos.company,
        role: pos.role,
        annualRaiseMin: pos.annualRaiseMin,
        annualRaiseMax: pos.annualRaiseMax,
        projectedGross: le.grossIncome,
        projectedYtd: le.ytdGross,
        actualYtd: latest?.ytdGross ?? null,
        latestPaycheck: latest ? {
          id: latest.id,
          payPeriodEnd: latest.payPeriodEnd,
          grossPay: latest.grossPay,
          netPay: latest.netPay,
          ytdGross: latest.ytdGross,
          ytdNet: latest.ytdNet,
          createdAt: latest.createdAt,
        } : null,
        // All paycheck records for history view
        paycheckHistory: pos.paychecks.map((pc) => ({
          id: pc.id,
          payPeriodStart: pc.payPeriodStart,
          payPeriodEnd: pc.payPeriodEnd,
          grossPay: pc.grossPay,
          netPay: pc.netPay,
          payRate: pc.payRate,
          regularHours: pc.regularHours,
          overtimeHours: pc.overtimeHours,
          ytdGross: pc.ytdGross,
          ytdNet: pc.ytdNet,
          ytdFederalTax: pc.ytdFederalTax,
          ytdStateTax: pc.ytdStateTax,
          ytdSocialSec: pc.ytdSocialSec,
          ytdMedicare: pc.ytdMedicare,
          ytdRetirement: pc.ytdRetirement,
          ytdHealthIns: pc.ytdHealthIns,
          ytdTotalDed: pc.ytdTotalDed,
          taxPercentages: pc.taxPercentages,
          createdAt: pc.createdAt,
        })),
      };
    });

    return NextResponse.json({ incomeYears, wageTiers, liveEstimate, paycheckTrackers });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — create income year or wage tier
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { type, ...data } = body;

    if (type === "tier") {
      const count = await prisma.wageTier.count();
      const tier = await prisma.wageTier.create({
        data: { userId,
          label: data.label,
          hourlyRate: parseFloat(data.hourlyRate),
          yearlyRate: parseFloat(data.yearlyRate),
          color: data.color || "#6366f1",
          sortOrder: count,
        },
      });
      return NextResponse.json(tier, { status: 201 });
    }

    // Default: income year
    if (!data.year || data.grossIncome == null) {
      return NextResponse.json(
        { error: "year and grossIncome are required" },
        { status: 400 }
      );
    }

    const year = parseInt(data.year);
    const grossIncome = parseFloat(data.grossIncome);
    const netIncome = data.netIncome ? parseFloat(data.netIncome) : null;
    const jobCount = data.jobCount ? parseInt(data.jobCount) : 1;
    const notes = data.notes || null;
    const employer = data.employer || null;
    const ein = data.ein || null;

    const existing = await prisma.careerIncomeYear.findFirst({
      where: { userId, year },
    });

    let yearRecord;
    if (existing) {
      // Accumulate income from multiple W-2s for the same year
      yearRecord = await prisma.careerIncomeYear.update({
        where: { id: existing.id },
        data: {
          grossIncome: existing.grossIncome + grossIncome,
          netIncome:
            netIncome != null
              ? (existing.netIncome ?? 0) + netIncome
              : existing.netIncome,
          jobCount: existing.jobCount + jobCount,
          notes: existing.notes && notes
            ? `${existing.notes}; ${notes}`
            : notes || existing.notes,
        },
        include: { entries: true, w2Records: true },
      });
    } else {
      yearRecord = await prisma.careerIncomeYear.create({
        data: { userId, year, grossIncome, netIncome, jobCount, notes },
        include: { entries: true, w2Records: true },
      });
    }

    // Create a per-employer entry if employer name is provided
    if (employer) {
      await prisma.careerIncomeEntry.create({
        data: {
          yearId: yearRecord.id,
          employer,
          grossIncome,
          netIncome,
          ein,
          notes,
        },
      });
      // Re-fetch with entries
      yearRecord = await prisma.careerIncomeYear.findFirst({
        where: { userId, year },
        include: { entries: true, w2Records: true },
      });
    }

    return NextResponse.json(yearRecord, { status: existing ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

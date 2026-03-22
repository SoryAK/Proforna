import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — comprehensive hours-worked metrics for a position
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");

  if (!positionId) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const [position, paychecks, workLogs] = await Promise.all([
    prisma.currentPosition.findUnique({
      where: { id: positionId },
      select: {
        id: true,
        company: true,
        role: true,
        startDate: true,
        endDate: true,
        isActive: true,
        payType: true,
        payRate: true,
        hoursPerWeek: true,
        scheduleBHours: true,
        rotatingSchedule: true,
        payFrequency: true,
      },
    }),
    prisma.paycheckRecord.findMany({
      where: { positionId },
      orderBy: { payPeriodStart: "asc" },
      select: {
        id: true,
        payPeriodStart: true,
        payPeriodEnd: true,
        regularHours: true,
        overtimeHours: true,
        grossPay: true,
        payRate: true,
      },
    }),
    prisma.workLog.findMany({
      where: { positionId },
      select: { date: true, hours: true },
    }),
  ]);

  if (!position) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }

  // ── Paycheck-based hours (most reliable) ──
  const paycheckPeriods = paychecks.filter(
    (p) => p.regularHours != null || p.overtimeHours != null
  );

  let totalRegularHours = 0;
  let totalOvertimeHours = 0;
  let periodsWithHours = 0;

  // By-year breakdown
  const yearlyMap = new Map<
    number,
    { regular: number; overtime: number; periods: number; grossPay: number }
  >();

  // By-month breakdown for chart
  const monthlyMap = new Map<
    string,
    { regular: number; overtime: number; periods: number }
  >();

  for (const pc of paychecks) {
    const reg = pc.regularHours ?? 0;
    const ot = pc.overtimeHours ?? 0;

    if (reg > 0 || ot > 0) {
      totalRegularHours += reg;
      totalOvertimeHours += ot;
      periodsWithHours++;
    }

    // Year grouping
    const date = pc.payPeriodEnd ?? pc.payPeriodStart;
    if (date) {
      const year = date.getFullYear();
      const existing = yearlyMap.get(year) ?? {
        regular: 0,
        overtime: 0,
        periods: 0,
        grossPay: 0,
      };
      existing.regular += reg;
      existing.overtime += ot;
      existing.periods++;
      existing.grossPay += pc.grossPay ?? 0;
      yearlyMap.set(year, existing);

      // Month grouping (YYYY-MM)
      const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const mExisting = monthlyMap.get(monthKey) ?? {
        regular: 0,
        overtime: 0,
        periods: 0,
      };
      mExisting.regular += reg;
      mExisting.overtime += ot;
      mExisting.periods++;
      monthlyMap.set(monthKey, mExisting);
    }
  }

  const totalPaycheckHours = totalRegularHours + totalOvertimeHours;

  // ── Work-log-based hours (supplemental) ──
  const workLogHours = workLogs.reduce((sum, wl) => sum + (wl.hours ?? 0), 0);

  // ── Schedule-based estimate (gap fill) ──
  const now = new Date();
  const effectiveEnd = position.endDate ?? now;
  const tenureDays =
    (effectiveEnd.getTime() - position.startDate.getTime()) / 86400000;
  const tenureWeeks = tenureDays / 7;

  const schedHoursPerWeek = position.rotatingSchedule
    ? ((position.hoursPerWeek ?? 40) + (position.scheduleBHours ?? 40)) / 2
    : (position.hoursPerWeek ?? 40);

  const scheduledTotalHours = Math.round(tenureWeeks * schedHoursPerWeek);

  // ── Gap analysis ──
  // Figure out which pay periods are missing hours
  const payFreqDays =
    position.payFrequency === "weekly"
      ? 7
      : position.payFrequency === "biweekly"
        ? 14
        : position.payFrequency === "semimonthly"
          ? 15
          : 30;

  const expectedPeriods = Math.floor(tenureDays / payFreqDays);
  const periodsWithData = paychecks.length;
  const periodsMissingHours = Math.max(0, periodsWithData - periodsWithHours);
  const periodsCompletelyMissing = Math.max(0, expectedPeriods - periodsWithData);

  // Estimate hours for missing periods using average from known periods
  const avgHoursPerPeriod =
    periodsWithHours > 0
      ? totalPaycheckHours / periodsWithHours
      : schedHoursPerWeek * (payFreqDays / 7);

  const estimatedMissingHours = Math.round(
    (periodsMissingHours + periodsCompletelyMissing) * avgHoursPerPeriod
  );

  const bestEstimateTotalHours = Math.round(
    totalPaycheckHours + estimatedMissingHours
  );

  // ── Conversions ──
  const equivalentDays = +(totalPaycheckHours / 8).toFixed(1);
  const equivalentWeeks = +(totalPaycheckHours / 40).toFixed(1);
  const equivalentMonths = +(totalPaycheckHours / 173.3).toFixed(1);

  const bestEstDays = +(bestEstimateTotalHours / 8).toFixed(1);
  const bestEstWeeks = +(bestEstimateTotalHours / 40).toFixed(1);
  const bestEstMonths = +(bestEstimateTotalHours / 173.3).toFixed(1);

  // ── Build yearly breakdown ──
  const yearly = Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => ({
      year,
      regularHours: Math.round(data.regular * 10) / 10,
      overtimeHours: Math.round(data.overtime * 10) / 10,
      totalHours: Math.round((data.regular + data.overtime) * 10) / 10,
      periods: data.periods,
      grossPay: Math.round(data.grossPay),
    }));

  // ── Build monthly breakdown (last 12 months or all) ──
  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      regularHours: Math.round(data.regular * 10) / 10,
      overtimeHours: Math.round(data.overtime * 10) / 10,
      totalHours: Math.round((data.regular + data.overtime) * 10) / 10,
      periods: data.periods,
    }));

  // ── Averages ──
  const avgRegularPerPeriod =
    periodsWithHours > 0
      ? Math.round((totalRegularHours / periodsWithHours) * 10) / 10
      : null;
  const avgOtPerPeriod =
    periodsWithHours > 0
      ? Math.round((totalOvertimeHours / periodsWithHours) * 10) / 10
      : null;
  const avgWeeklyHours =
    periodsWithHours > 0
      ? Math.round(
          (totalPaycheckHours / periodsWithHours) * (7 / payFreqDays) * 10
        ) / 10
      : null;
  const otPercentage =
    totalPaycheckHours > 0
      ? Math.round((totalOvertimeHours / totalPaycheckHours) * 1000) / 10
      : 0;

  return NextResponse.json({
    positionId: position.id,
    company: position.company,
    role: position.role,
    tenure: {
      startDate: position.startDate,
      endDate: position.endDate,
      days: Math.round(tenureDays),
      weeks: Math.round(tenureWeeks * 10) / 10,
      months: Math.round((tenureDays / 30.44) * 10) / 10,
    },
    // Verified hours from paychecks
    verified: {
      regularHours: Math.round(totalRegularHours * 10) / 10,
      overtimeHours: Math.round(totalOvertimeHours * 10) / 10,
      totalHours: Math.round(totalPaycheckHours * 10) / 10,
      equivalentDays,
      equivalentWeeks,
      equivalentMonths,
      periodsWithData: periodsWithHours,
    },
    // Best estimate (verified + estimated gaps)
    estimated: {
      totalHours: bestEstimateTotalHours,
      equivalentDays: bestEstDays,
      equivalentWeeks: bestEstWeeks,
      equivalentMonths: bestEstMonths,
      estimatedMissingHours,
    },
    // Schedule-based theoretical max
    scheduled: {
      totalHours: scheduledTotalHours,
      hoursPerWeek: schedHoursPerWeek,
    },
    // Work log supplemental
    workLogHours: Math.round(workLogHours * 10) / 10,
    // Gap analysis
    coverage: {
      expectedPeriods,
      periodsWithData,
      periodsWithHours,
      periodsMissingHours,
      periodsCompletelyMissing,
      coveragePercent:
        expectedPeriods > 0
          ? Math.round((periodsWithHours / expectedPeriods) * 100)
          : 0,
    },
    // Averages
    averages: {
      regularPerPeriod: avgRegularPerPeriod,
      overtimePerPeriod: avgOtPerPeriod,
      weeklyHours: avgWeeklyHours,
      otPercentage,
    },
    // Breakdowns
    yearly,
    monthly,
  });
}

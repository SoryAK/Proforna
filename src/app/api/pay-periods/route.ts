import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Compute pay period boundaries for a calendar view.
 *
 * We anchor from the latest paycheck's payPeriodEnd and extrapolate
 * forward/backward based on pay frequency. If no paycheck exists,
 * we use the position's start date as anchor.
 */

interface PayPeriod {
  start: string; // ISO date
  end: string;   // ISO date
  payday: string; // ISO date — typically a few days after period end
  isPast: boolean;
  isCurrent: boolean;
  hasPaycheck: boolean; // whether we have an uploaded paycheck for this period
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function periodLengthDays(freq: string): number {
  switch (freq) {
    case "weekly": return 7;
    case "biweekly": return 14;
    case "semimonthly": return 15; // approximate
    case "monthly": return 30; // approximate
    default: return 14;
  }
}

function paydayOffset(freq: string): number {
  // Typical days between period end and actual pay date
  switch (freq) {
    case "weekly": return 5;
    case "biweekly": return 5;
    case "semimonthly": return 5;
    case "monthly": return 5;
    default: return 5;
  }
}

function generatePeriods(
  anchorEnd: Date,
  freq: string,
  rangeStart: Date,
  rangeEnd: Date,
  paycheckEndDates: Set<string>,
): PayPeriod[] {
  const len = periodLengthDays(freq);
  const offset = paydayOffset(freq);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const periods: PayPeriod[] = [];

  // Generate periods backward from anchor
  let curEnd = new Date(anchorEnd);
  while (curEnd >= rangeStart) {
    const curStart = addDays(curEnd, -(len - 1));
    const payday = addDays(curEnd, offset);
    if (curStart <= rangeEnd) {
      const periodEndStr = toISO(curEnd);
      periods.push({
        start: toISO(curStart),
        end: periodEndStr,
        payday: toISO(payday),
        isPast: payday < now,
        isCurrent: curStart <= now && addDays(curEnd, offset) >= now,
        hasPaycheck: paycheckEndDates.has(periodEndStr),
      });
    }
    curEnd = addDays(curEnd, -len);
  }

  // Generate periods forward from anchor
  curEnd = addDays(anchorEnd, len);
  while (curEnd <= addDays(rangeEnd, len)) {
    const curStart = addDays(curEnd, -(len - 1));
    const payday = addDays(curEnd, offset);
    if (payday >= rangeStart) {
      const periodEndStr = toISO(curEnd);
      periods.push({
        start: toISO(curStart),
        end: periodEndStr,
        payday: toISO(payday),
        isPast: payday < now,
        isCurrent: curStart <= now && addDays(curEnd, offset) >= now,
        hasPaycheck: paycheckEndDates.has(periodEndStr),
      });
    }
    curEnd = addDays(curEnd, len);
  }

  // Sort chronologically
  periods.sort((a, b) => a.start.localeCompare(b.start));
  return periods;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get("positionId");

    // Find position
    const position = positionId
      ? await prisma.currentPosition.findUnique({
          where: { id: positionId },
          include: { paychecks: { orderBy: { payPeriodEnd: "desc" } } },
        })
      : await prisma.currentPosition.findFirst({
          where: { isActive: true },
          orderBy: { startDate: "desc" },
          include: { paychecks: { orderBy: { payPeriodEnd: "desc" } } },
        });

    if (!position) {
      return NextResponse.json({ periods: [], nextPayday: null, currentPeriod: null });
    }

    const freq = position.payFrequency || "biweekly";
    const len = periodLengthDays(freq);

    // Anchor from latest paycheck's payPeriodEnd, or position startDate
    const latestWithEnd = position.paychecks.find((p) => p.payPeriodEnd);
    const anchorEnd = latestWithEnd?.payPeriodEnd
      ? new Date(latestWithEnd.payPeriodEnd)
      : addDays(new Date(position.startDate), len - 1);

    // Set of paycheck period-end dates for marking
    const paycheckEndDates = new Set<string>();
    for (const pc of position.paychecks) {
      if (pc.payPeriodEnd) paycheckEndDates.add(toISO(new Date(pc.payPeriodEnd)));
    }

    // Generate 6 months of periods (3 months back, 3 months forward)
    const now = new Date();
    const rangeStart = addDays(now, -90);
    const rangeEnd = addDays(now, 90);

    const periods = generatePeriods(anchorEnd, freq, rangeStart, rangeEnd, paycheckEndDates);

    // Find next payday and current period
    const today = toISO(now);
    const nextPayday = periods.find((p) => p.payday >= today && !p.isPast)?.payday ?? null;
    const currentPeriod = periods.find((p) => p.start <= today && p.end >= today) ?? null;

    // Count completed pay periods this year for YTD calculation
    const yearStart = `${now.getFullYear()}-01-01`;
    const completedThisYear = periods.filter((p) => p.end >= yearStart && p.isPast).length;
    const totalPeriodsPerYear = freq === "weekly" ? 52 : freq === "biweekly" ? 26 : freq === "semimonthly" ? 24 : 12;

    return NextResponse.json({
      positionId: position.id,
      company: position.company,
      role: position.role,
      payFrequency: freq,
      periods,
      nextPayday,
      currentPeriod,
      completedPeriodsThisYear: completedThisYear,
      totalPeriodsPerYear,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

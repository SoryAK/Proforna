"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  DollarSign,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface PayPeriod {
  start: string;
  end: string;
  payday: string;
  isPast: boolean;
  isCurrent: boolean;
  hasPaycheck: boolean;
}

interface PayPeriodData {
  positionId: string;
  company: string;
  role: string;
  payFrequency: string;
  periods: PayPeriod[];
  nextPayday: string | null;
  currentPeriod: PayPeriod | null;
  completedPeriodsThisYear: number;
  totalPeriodsPerYear: number;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  semimonthly: "Semi-monthly",
  monthly: "Monthly",
};

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysUntil(target: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(target + "T00:00:00");
  return Math.ceil((t.getTime() - now.getTime()) / (86400000));
}

/**
 * Reusable Pay Period Calendar component.
 * Shows a monthly calendar with pay periods highlighted,
 * next payday countdown, and upload status.
 */
export function PayPeriodCalendar({
  positionId,
  compact = false,
}: {
  positionId?: string;
  compact?: boolean;
}) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const { data, isLoading } = useQuery<PayPeriodData>({
    queryKey: ["pay-periods", positionId ?? "active"],
    queryFn: () =>
      fetch(`/api/pay-periods${positionId ? `?positionId=${positionId}` : ""}`)
        .then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const days: { date: string; day: number; inMonth: boolean }[] = [];

    // Pad start
    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      days.push({ date: toISO(d), day: d.getDate(), inMonth: false });
    }

    // Month days
    for (let d = 1; d <= totalDays; d++) {
      const dt = new Date(viewYear, viewMonth, d);
      days.push({ date: toISO(dt), day: d, inMonth: true });
    }

    // Pad end to fill 6 rows
    while (days.length < 42) {
      const d = new Date(viewYear, viewMonth + 1, days.length - startPad - totalDays + 1);
      days.push({ date: toISO(d), day: d.getDate(), inMonth: false });
    }

    return days;
  }, [viewYear, viewMonth]);

  // Map dates to their pay period info
  const dateInfo = useMemo(() => {
    if (!data?.periods) return new Map<string, { inPeriod: boolean; isPayday: boolean; isPast: boolean; isCurrent: boolean; hasPaycheck: boolean; periodLabel: string }>();

    const map = new Map<string, { inPeriod: boolean; isPayday: boolean; isPast: boolean; isCurrent: boolean; hasPaycheck: boolean; periodLabel: string }>();

    for (const p of data.periods) {
      // Mark all dates within the period
      const start = new Date(p.start + "T00:00:00");
      const end = new Date(p.end + "T00:00:00");
      const label = `${new Date(p.start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(p.end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toISO(d);
        map.set(key, {
          inPeriod: true,
          isPayday: key === p.payday,
          isPast: p.isPast,
          isCurrent: p.isCurrent,
          hasPaycheck: p.hasPaycheck,
          periodLabel: label,
        });
      }

      // Mark payday
      const existing = map.get(p.payday);
      map.set(p.payday, {
        inPeriod: existing?.inPeriod ?? false,
        isPayday: true,
        isPast: p.isPast,
        isCurrent: p.isCurrent,
        hasPaycheck: p.hasPaycheck,
        periodLabel: label,
      });
    }

    return map;
  }, [data?.periods]);

  const today = toISO(new Date());

  const prevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1, 1));
  const goToday = () => setViewDate(new Date());

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center h-32">
          <div className="animate-pulse text-sm text-muted-foreground">Loading pay periods…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.periods?.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No pay period data available.</p>
          <p className="text-xs mt-1">Upload a paycheck to anchor your pay schedule.</p>
        </CardContent>
      </Card>
    );
  }

  const nextPaydayDays = data.nextPayday ? daysUntil(data.nextPayday) : null;

  return (
    <Card>
      <CardHeader className={compact ? "pb-2 px-4 pt-4" : "pb-2"}>
        <div className="flex items-center justify-between">
          <CardTitle className={compact ? "text-sm flex items-center gap-2" : "text-lg flex items-center gap-2"}>
            <CalendarIcon className={compact ? "h-4 w-4 text-blue-600" : "h-5 w-5 text-blue-600"} />
            Pay Period Calendar
          </CardTitle>
          {!compact && data.payFrequency && (
            <Badge variant="secondary" className="text-xs">
              {FREQ_LABELS[data.payFrequency] ?? data.payFrequency}
            </Badge>
          )}
        </div>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            {data.company} — {data.role}
          </p>
        )}
      </CardHeader>
      <CardContent className={compact ? "px-4 pb-4" : ""}>
        {/* Next payday banner */}
        {data.nextPayday && (
          <div className={`rounded-lg border p-2.5 mb-3 flex items-center justify-between ${
            nextPaydayDays !== null && nextPaydayDays <= 3
              ? "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800"
              : "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800"
          }`}>
            <div className="flex items-center gap-2">
              <DollarSign className={`h-4 w-4 ${nextPaydayDays !== null && nextPaydayDays <= 3 ? "text-green-600" : "text-blue-600"}`} />
              <div>
                <p className="text-xs font-medium">Next Payday</p>
                <p className="text-sm font-bold font-mono">
                  {new Date(data.nextPayday + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
            <div className="text-right">
              {nextPaydayDays !== null && (
                <p className={`text-sm font-bold ${nextPaydayDays <= 3 ? "text-green-600" : "text-blue-600"}`}>
                  {nextPaydayDays === 0 ? "Today!" : nextPaydayDays === 1 ? "Tomorrow" : `${nextPaydayDays} days`}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {data.completedPeriodsThisYear}/{data.totalPeriodsPerYear} periods this year
              </p>
            </div>
          </div>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="text-sm font-semibold hover:text-blue-600 transition-colors"
            onClick={goToday}
          >
            {MONTH_NAMES[viewMonth]} {viewYear}
          </button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <TooltipProvider delay={200}>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map(({ date, day, inMonth }) => {
              const info = dateInfo.get(date);
              const isToday = date === today;
              const isPayday = info?.isPayday ?? false;
              const inPeriod = info?.inPeriod ?? false;
              const isCurrent = info?.isCurrent ?? false;
              const hasPaycheck = info?.hasPaycheck ?? false;

              let bg = "";
              if (isPayday) {
                bg = "bg-emerald-500 text-white dark:bg-emerald-600";
              } else if (isCurrent && inPeriod) {
                bg = "bg-blue-100 dark:bg-blue-900/40";
              } else if (inPeriod && hasPaycheck) {
                bg = "bg-emerald-50 dark:bg-emerald-950/30";
              } else if (inPeriod && info?.isPast) {
                bg = "bg-slate-100 dark:bg-slate-800/40";
              } else if (inPeriod) {
                bg = "bg-blue-50 dark:bg-blue-950/20";
              }

              const cell = (
                <div
                  className={`
                    relative flex items-center justify-center rounded-md text-xs h-8
                    ${!inMonth ? "text-muted-foreground/30" : ""}
                    ${isToday && !isPayday ? "ring-2 ring-blue-500 font-bold" : ""}
                    ${bg}
                    transition-colors
                  `}
                >
                  {day}
                  {isPayday && (
                    <DollarSign className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 text-emerald-300" />
                  )}
                  {hasPaycheck && !isPayday && (
                    <CheckCircle2 className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 text-emerald-500" />
                  )}
                </div>
              );

              if (info && inMonth) {
                return (
                  <Tooltip key={date}>
                    <TooltipTrigger className="w-full">{cell}</TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{info.periodLabel}</p>
                      {isPayday && <p className="text-emerald-400">💰 Payday</p>}
                      {isCurrent && <p className="text-blue-400">Current period</p>}
                      {hasPaycheck && <p className="text-emerald-400">✓ Paycheck uploaded</p>}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={date}>{cell}</div>;
            })}
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className={`flex flex-wrap gap-3 mt-3 ${compact ? "text-[9px]" : "text-[10px]"} text-muted-foreground`}>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Payday
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-100 dark:bg-blue-900/60" /> Current Period
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> Uploaded
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-blue-500" /> Today
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

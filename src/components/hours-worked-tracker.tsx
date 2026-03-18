"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Clock,
  CalendarDays,
  CalendarRange,
  Timer,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
} from "recharts";


interface HoursWorkedData {
  positionId: string;
  company: string;
  role: string;
  tenure: {
    startDate: string;
    endDate: string | null;
    days: number;
    weeks: number;
    months: number;
  };
  verified: {
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    equivalentDays: number;
    equivalentWeeks: number;
    equivalentMonths: number;
    periodsWithData: number;
  };
  estimated: {
    totalHours: number;
    equivalentDays: number;
    equivalentWeeks: number;
    equivalentMonths: number;
    estimatedMissingHours: number;
  };
  scheduled: {
    totalHours: number;
    hoursPerWeek: number;
  };
  workLogHours: number;
  coverage: {
    expectedPeriods: number;
    periodsWithData: number;
    periodsWithHours: number;
    periodsMissingHours: number;
    periodsCompletelyMissing: number;
    coveragePercent: number;
  };
  averages: {
    regularPerPeriod: number | null;
    overtimePerPeriod: number | null;
    weeklyHours: number | null;
    otPercentage: number;
  };
  yearly: {
    year: number;
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    periods: number;
    grossPay: number;
  }[];
  monthly: {
    month: string;
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    periods: number;
  }[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "orange" | "green" | "purple";
}) {
  const colors = {
    blue: "text-blue-600 dark:text-blue-400",
    orange: "text-orange-600 dark:text-orange-400",
    green: "text-green-600 dark:text-green-400",
    purple: "text-purple-600 dark:text-purple-400",
  };
  const color = accent ? colors[accent] : "text-muted-foreground";

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
      <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function CoverageBar({ percent }: { percent: number }) {
  const color =
    percent >= 80
      ? "bg-green-500"
      : percent >= 50
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Data Coverage</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function HoursWorkedTracker({ positionId }: { positionId: string }) {
  const { data, isLoading, error } = useQuery<HoursWorkedData>({
    queryKey: ["hours-worked", positionId],
    queryFn: () =>
      fetch(`/api/hours-worked?positionId=${positionId}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load hours data");
        return r.json();
      }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading hours data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
          Could not load hours data. Make sure paycheck records exist.
        </CardContent>
      </Card>
    );
  }

  const hasPaycheckData = data.verified.periodsWithData > 0;
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-4">
      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Clock}
          label="Verified Hours"
          value={fmt(data.verified.totalHours)}
          sub={`${fmt(data.verified.regularHours)} reg + ${fmt(data.verified.overtimeHours)} OT`}
          accent="blue"
        />
        <StatCard
          icon={CalendarDays}
          label="Equivalent Days"
          value={hasPaycheckData ? fmt(data.verified.equivalentDays) : "—"}
          sub={hasPaycheckData ? `${fmt(data.verified.equivalentWeeks)} weeks` : "No paycheck data"}
          accent="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Best Estimate"
          value={`${fmt(data.estimated.totalHours)} hrs`}
          sub={
            data.estimated.estimatedMissingHours > 0
              ? `+${fmt(data.estimated.estimatedMissingHours)} est. gaps`
              : "No gaps"
          }
          accent="purple"
        />
        <StatCard
          icon={CalendarRange}
          label="Tenure"
          value={`${data.tenure.months} mo`}
          sub={`${data.tenure.weeks} weeks · ${data.tenure.days} days`}
          accent="orange"
        />
      </div>

      {/* ── Coverage + Averages ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Data Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CoverageBar percent={data.coverage.coveragePercent} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Expected periods:</span>{" "}
                {data.coverage.expectedPeriods}
              </div>
              <div>
                <span className="text-muted-foreground">With hours:</span>{" "}
                {data.coverage.periodsWithHours}
              </div>
              <div>
                <span className="text-muted-foreground">Missing hours:</span>{" "}
                {data.coverage.periodsMissingHours}
              </div>
              <div>
                <span className="text-muted-foreground">Missing periods:</span>{" "}
                {data.coverage.periodsCompletelyMissing}
              </div>
            </div>
            {data.coverage.coveragePercent < 50 && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Low coverage — import more paychecks for accuracy
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Averages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg weekly hours</span>
                <span className="font-medium">
                  {data.averages.weeklyHours ?? "—"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Regular / period</span>
                <span className="font-medium">
                  {data.averages.regularPerPeriod ?? "—"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overtime / period</span>
                <span className="font-medium">
                  {data.averages.overtimePerPeriod ?? "—"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">OT percentage</span>
                <Badge variant="secondary">{data.averages.otPercentage}%</Badge>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled/week</span>
                <span className="font-medium">
                  {data.scheduled.hoursPerWeek} hrs
                </span>
              </div>
              {data.workLogHours > 0 && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Work log hours</span>
                    <span className="font-medium">{data.workLogHours}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ── */}
      {(data.yearly.length > 0 || data.monthly.length > 0) && (
        <Card>
          <CardContent className="pt-4">
            <Tabs defaultValue={data.yearly.length > 1 ? "yearly" : "monthly"}>
              <TabsList className="mb-2">
                {data.yearly.length > 0 && (
                  <TabsTrigger value="yearly">Yearly</TabsTrigger>
                )}
                {data.monthly.length > 0 && (
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                )}
              </TabsList>

              {data.yearly.length > 0 && (
                <TabsContent value="yearly">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.yearly}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="year" fontSize={12} />
                        <YAxis fontSize={12} />
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--card))",
                          }}
                          formatter={(value) => [`${Number(value ?? 0)} hrs`]}
                        />
                        <Legend />
                        <Bar
                          dataKey="regularHours"
                          name="Regular"
                          fill="hsl(var(--chart-1))"
                          radius={[4, 4, 0, 0]}
                          stackId="hours"
                        />
                        <Bar
                          dataKey="overtimeHours"
                          name="Overtime"
                          fill="hsl(var(--chart-2))"
                          radius={[4, 4, 0, 0]}
                          stackId="hours"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Yearly table */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-1 font-medium">Year</th>
                          <th className="text-right py-1 font-medium">Regular</th>
                          <th className="text-right py-1 font-medium">OT</th>
                          <th className="text-right py-1 font-medium">Total</th>
                          <th className="text-right py-1 font-medium">Periods</th>
                          <th className="text-right py-1 font-medium">Gross Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.yearly.map((y) => (
                          <tr key={y.year} className="border-b border-muted/50">
                            <td className="py-1.5 font-medium">{y.year}</td>
                            <td className="text-right">{fmt(y.regularHours)}</td>
                            <td className="text-right">{fmt(y.overtimeHours)}</td>
                            <td className="text-right font-medium">
                              {fmt(y.totalHours)}
                            </td>
                            <td className="text-right">{y.periods}</td>
                            <td className="text-right">
                              ${y.grossPay.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              )}

              {data.monthly.length > 0 && (
                <TabsContent value="monthly">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.monthly}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="month"
                          fontSize={11}
                          tickFormatter={(v: string) => {
                            const [y, m] = v.split("-");
                            const months = [
                              "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                            ];
                            return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
                          }}
                        />
                        <YAxis fontSize={12} />
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--card))",
                          }}
                          formatter={(value) => [`${Number(value ?? 0)} hrs`]}
                          labelFormatter={(label) => {
                            const s = String(label);
                            const [y, m] = s.split("-");
                            const months = [
                              "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                            ];
                            return `${months[parseInt(m) - 1]} ${y}`;
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="regularHours"
                          name="Regular"
                          fill="hsl(var(--chart-1))"
                          radius={[4, 4, 0, 0]}
                          stackId="hours"
                        />
                        <Bar
                          dataKey="overtimeHours"
                          name="Overtime"
                          fill="hsl(var(--chart-2))"
                          radius={[4, 4, 0, 0]}
                          stackId="hours"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* ── No data state ── */}
      {!hasPaycheckData && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No paycheck hours data yet</p>
            <p className="text-sm mt-1">
              Import paycheck stubs to see verified hours worked. The schedule-based
              estimate of <strong>{fmt(data.scheduled.totalHours)} hours</strong> is
              shown above.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

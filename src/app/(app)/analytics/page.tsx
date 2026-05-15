"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  Target,
  Clock,
  Award,
  Users,
  DollarSign,
  PieChart as PieIcon,
} from "lucide-react";
import {
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";
import { CareerAnalyticsBanner } from "@/components/career-analytics-banner";

interface AnalyticsData {
  total: number;
  applied: number;
  offers: number;
  offerRate: number;
  totalInterviews: number;
  completedInterviews: number;
  avgRating: string | null;
  statusCounts: Record<string, number>;
  companyResponse: { company: string; applied: number; responded: number; rate: number }[];
  roleResponse: { role: string; applied: number; responded: number; rate: number }[];
  salaryTrends: { type: string; avgMin: number; avgMax: number; avgOffer: number; count: number }[];
  timeline: { month: string; count: number }[];
  pipelineAvg: { stage: string; avgDays: number; count: number }[];
}

const STATUS_PIE_COLORS: Record<string, string> = {
  wishlist: "#9ca3af",
  applied: "#3b82f6",
  screening: "#eab308",
  interviewing: "#a855f7",
  offer: "#22c55e",
  accepted: "#10b981",
  rejected: "#ef4444",
  withdrawn: "#f97316",
};

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: () => fetch("/api/analytics").then((r) => r.json()),
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  const pieData = Object.entries(data.statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status as ApplicationStatus] || status,
    value: count,
    color: STATUS_PIE_COLORS[status] || "#6b7280",
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Job search performance &amp; insights
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <CareerAnalyticsBanner section="jobsearch" />
        {/* ── KPI Cards ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Target className="h-5 w-5 text-orange-600" />}
            label="Total Applications"
            value={data.total}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-green-600" />}
            label="Offer Rate"
            value={`${data.offerRate}%`}
            sub={`${data.offers} offers from ${data.applied} applied`}
          />
          <StatCard
            icon={<Users className="h-5 w-5 text-purple-600" />}
            label="Interviews"
            value={data.totalInterviews}
            sub={`${data.completedInterviews} completed`}
          />
          <StatCard
            icon={<Award className="h-5 w-5 text-yellow-600" />}
            label="Avg Interview Rating"
            value={data.avgRating ? `${data.avgRating}/5` : "—"}
            sub="Self-assessed performance"
          />
        </div>

        {/* ── Row: Pipeline & Status ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <PieIcon className="h-4 w-4" /> Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, value }) => `${name} (${value})`}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Stage Timing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Average Pipeline Timing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.pipelineAvg.some((p) => p.count > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.pipelineAvg}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                    <YAxis label={{ value: "Days", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => [`${value} days`, "Avg"]}
                    />
                    <Bar dataKey="avgDays" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">
                  Not enough stage transitions to calculate timing
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Application Timeline ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Application Volume Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data.timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    fill="#3b82f680"
                    name="Applications"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data</p>
            )}
          </CardContent>
        </Card>

        {/* ── Row: Response Rates ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By Company */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Response Rate by Company</CardTitle>
            </CardHeader>
            <CardContent>
              {data.companyResponse.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(250, data.companyResponse.length * 32)}>
                  <BarChart data={data.companyResponse} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis
                      type="category"
                      dataKey="company"
                      width={120}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, "Response Rate"]}
                    />
                    <Bar dataKey="rate" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No data</p>
              )}
            </CardContent>
          </Card>

          {/* By Role */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Response Rate by Role</CardTitle>
            </CardHeader>
            <CardContent>
              {data.roleResponse.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(250, data.roleResponse.length * 32)}>
                  <BarChart data={data.roleResponse} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis
                      type="category"
                      dataKey="role"
                      width={140}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, "Response Rate"]}
                    />
                    <Bar dataKey="rate" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Salary Trends ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Salary Trends by Job Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.salaryTrends.some((s) => s.count > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.salaryTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `$${Number(value).toLocaleString()}`,
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="avgMin" name="Avg Min Salary" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgMax" name="Avg Max Salary" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgOffer" name="Avg Offer" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">
                Add salary data to your applications to see trends
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {icon}
          <div className="text-right">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

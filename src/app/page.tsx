"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarDays,
  Users,
  Zap,
  Target,
  TrendingUp,
  Clock,
  Building2,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS, type ApplicationStatus } from "@/lib/constants";
import { formatDistanceToNow, format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const CHART_COLORS: Record<string, string> = {
  wishlist: "#9ca3af",
  applied: "#3b82f6",
  screening: "#eab308",
  interviewing: "#a855f7",
  offer: "#22c55e",
  accepted: "#10b981",
  rejected: "#ef4444",
  withdrawn: "#f97316",
};

interface DashboardData {
  stats: {
    totalApplications: number;
    activeApplications: number;
    interviews: number;
    upcomingInterviews: number;
    contacts: number;
    skills: number;
    goals: number;
    newSubmissions: number;
  };
  pipeline: { status: string; count: number }[];
  recentActivity: {
    id: string;
    entityType: string;
    action: string;
    description: string;
    createdAt: string;
  }[];
  currentPosition: {
    id: string;
    company: string;
    role: string;
    department: string | null;
    location: string | null;
    type: string;
    startDate: string;
    salary: number | null;
    currency: string;
    techStack: string | null;
  } | null;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-gray-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { stats, pipeline, recentActivity, currentPosition } = data;

  const statCards = [
    {
      title: "Total Applications",
      value: stats.totalApplications,
      icon: Briefcase,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Active Pipeline",
      value: stats.activeApplications,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Upcoming Interviews",
      value: stats.upcomingInterviews,
      icon: CalendarDays,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      title: "Network Contacts",
      value: stats.contacts,
      icon: Users,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  const chartData = pipeline.map((p) => ({
    name: STATUS_LABELS[p.status as ApplicationStatus] ?? p.status,
    count: p.count,
    fill: CHART_COLORS[p.status] ?? "#6b7280",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Your career search at a glance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`rounded-lg p-3 ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Current Role & Submissions Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {currentPosition ? (
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg">Current Role</CardTitle>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 ml-auto">
                  Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="font-semibold text-lg">{currentPosition.role}</p>
                <p className="text-muted-foreground">{currentPosition.company}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {currentPosition.department && (
                    <Badge variant="outline">{currentPosition.department}</Badge>
                  )}
                  {currentPosition.location && (
                    <Badge variant="outline">{currentPosition.location}</Badge>
                  )}
                  <Badge variant="outline" className="capitalize">{currentPosition.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Since {format(new Date(currentPosition.startDate), "MMM yyyy")} &middot;{" "}
                  {formatDistanceToNow(new Date(currentPosition.startDate))}
                </p>
                {currentPosition.techStack && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {currentPosition.techStack.split(",").slice(0, 5).map((t) => (
                      <Badge key={t.trim()} variant="secondary" className="text-xs">
                        {t.trim()}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
              <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No current role set. Add one from the Current Role page.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-lg p-3 bg-rose-50">
              <Inbox className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.newSubmissions}</p>
              <p className="text-sm text-muted-foreground">New Recruiter Submissions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Application Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">
                No applications yet. Start by adding your first application!
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No activity yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-lg p-3 bg-yellow-50">
              <Zap className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.skills}</p>
              <p className="text-sm text-muted-foreground">Skills Tracked</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-lg p-3 bg-indigo-50">
              <Target className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.goals}</p>
              <p className="text-sm text-muted-foreground">Active Goals</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-lg p-3 bg-cyan-50">
              <CalendarDays className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.interviews}</p>
              <p className="text-sm text-muted-foreground">Total Interviews</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

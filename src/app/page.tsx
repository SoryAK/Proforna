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
  FileText,
  MapPin,
  Award,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  STATUS_LABELS,
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  type ApplicationStatus,
  type AvailabilityStatus,
} from "@/lib/constants";
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
import Link from "next/link";

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

const PROFICIENCY_PCT: Record<string, number> = {
  beginner: 25,
  intermediate: 50,
  advanced: 75,
  expert: 100,
};

const PROFICIENCY_COLORS: Record<string, string> = {
  beginner: "bg-gray-400",
  intermediate: "bg-blue-500",
  advanced: "bg-purple-500",
  expert: "bg-emerald-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  soft: "Soft Skills",
  language: "Languages",
  tool: "Tools",
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
    resumes: number;
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
    description: string | null;
    responsibilities: string | null;
    techStack: string | null;
  } | null;
  profile: {
    availability: string;
    bio: string | null;
    preferredRoles: string | null;
    locationPreference: string | null;
    targetSalaryMin: number | null;
    targetSalaryMax: number | null;
    currency: string;
  } | null;
  topSkills: {
    id: string;
    name: string;
    category: string;
    proficiency: string;
  }[];
  certifications: {
    id: string;
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate: string | null;
    credentialUrl: string | null;
  }[];
  activeGoals: {
    id: string;
    title: string;
    description: string | null;
    targetDate: string | null;
    status: string;
    priority: string;
    milestones: { id: string; title: string; completed: boolean }[];
  }[];
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse">
          <CardContent className="p-8">
            <div className="h-32 bg-gray-200 rounded" />
          </CardContent>
        </Card>
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-gray-200 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { stats, pipeline, recentActivity, currentPosition, profile, topSkills, certifications, activeGoals } = data;

  const availability = (profile?.availability ?? "open_to_work") as AvailabilityStatus;
  const headline = currentPosition
    ? `${currentPosition.role} at ${currentPosition.company}`
    : profile?.preferredRoles?.split(",")[0]?.trim() || "Career Professional";

  const chartData = pipeline.map((p) => ({
    name: STATUS_LABELS[p.status as ApplicationStatus] ?? p.status,
    count: p.count,
    fill: CHART_COLORS[p.status] ?? "#6b7280",
  }));

  // Group skills by category
  const skillsByCategory = topSkills.reduce<Record<string, typeof topSkills>>((acc, skill) => {
    const cat = skill.category || "technical";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* ── Profile Header Card ── */}
      <Card className="overflow-hidden">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500" />

        <CardContent className="relative px-6 pb-6 pt-0">
          {/* Avatar */}
          <div className="-mt-16 mb-4 flex items-end gap-4">
            <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-background bg-white text-3xl font-bold text-blue-600 shadow-md">
              {currentPosition
                ? `${currentPosition.role[0]}${currentPosition.company[0]}`
                : "Me"}
            </div>
            <div className="mb-1">
              <Badge className={AVAILABILITY_COLORS[availability]}>
                {AVAILABILITY_LABELS[availability]}
              </Badge>
            </div>
          </div>

          {/* Name / Headline / Meta */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{headline}</h1>
            {currentPosition && (
              <p className="text-muted-foreground">
                {currentPosition.department && `${currentPosition.department} · `}
                <span className="capitalize">{currentPosition.type}</span>
                {currentPosition.location && ` · ${currentPosition.location}`}
              </p>
            )}
            {profile?.locationPreference && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {profile.locationPreference}
              </p>
            )}
          </div>

          {/* Quick Stats Row */}
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <Link href="/applications" className="flex items-center gap-1.5 text-blue-600 hover:underline">
              <Briefcase className="h-4 w-4" />
              <span className="font-semibold">{stats.totalApplications}</span> Applications
            </Link>
            <Link href="/contacts" className="flex items-center gap-1.5 text-blue-600 hover:underline">
              <Users className="h-4 w-4" />
              <span className="font-semibold">{stats.contacts}</span> Contacts
            </Link>
            <Link href="/skills" className="flex items-center gap-1.5 text-blue-600 hover:underline">
              <Zap className="h-4 w-4" />
              <span className="font-semibold">{stats.skills}</span> Skills
            </Link>
            {stats.upcomingInterviews > 0 && (
              <Link href="/applications" className="flex items-center gap-1.5 text-purple-600 hover:underline">
                <CalendarDays className="h-4 w-4" />
                <span className="font-semibold">{stats.upcomingInterviews}</span> Upcoming Interviews
              </Link>
            )}
          </div>

          {/* Preferred Roles */}
          {profile?.preferredRoles && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.preferredRoles.split(",").map((role) => (
                <Badge key={role.trim()} variant="secondary">
                  {role.trim()}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Two-Column Layout ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* About */}
          {profile?.bio && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {profile.bio}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Experience */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Experience</CardTitle>
                <Link href="/current-position" className="text-sm text-blue-600 hover:underline flex items-center gap-0.5">
                  Manage <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {currentPosition ? (
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg font-bold text-slate-500">
                    {currentPosition.company[0]}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold">{currentPosition.role}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentPosition.company}
                      {currentPosition.department && ` · ${currentPosition.department}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(currentPosition.startDate), "MMM yyyy")} – Present · {formatDistanceToNow(new Date(currentPosition.startDate))}
                    </p>
                    {currentPosition.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {currentPosition.location} · <span className="capitalize">{currentPosition.type}</span>
                      </p>
                    )}
                    {currentPosition.description && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
                        {currentPosition.description}
                      </p>
                    )}
                    {currentPosition.techStack && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {currentPosition.techStack.split(",").map((t) => (
                          <Badge key={t.trim()} variant="secondary" className="text-xs">
                            {t.trim()}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No current role. Add one from the Current Role page.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Skills</CardTitle>
                <Link href="/skills" className="text-sm text-blue-600 hover:underline flex items-center gap-0.5">
                  All skills <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {topSkills.length > 0 ? (
                <div className="space-y-5">
                  {Object.entries(skillsByCategory).map(([cat, skills]) => (
                    <div key={cat}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </p>
                      <div className="space-y-2.5">
                        {skills.map((skill) => (
                          <div key={skill.id} className="flex items-center gap-3">
                            <span className="text-sm w-28 truncate">{skill.name}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${PROFICIENCY_COLORS[skill.proficiency] ?? "bg-gray-400"}`}
                                style={{ width: `${PROFICIENCY_PCT[skill.proficiency] ?? 25}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground capitalize w-20 text-right">
                              {skill.proficiency}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No skills tracked yet. Add some from the Skills page.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Certifications */}
          {certifications.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Licenses & Certifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {certifications.map((cert) => (
                    <div key={cert.id} className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                        <Award className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">{cert.issuer}</p>
                        <p className="text-xs text-muted-foreground">
                          Issued {format(new Date(cert.issueDate), "MMM yyyy")}
                          {cert.expiryDate && ` · Expires ${format(new Date(cert.expiryDate), "MMM yyyy")}`}
                        </p>
                        {cert.credentialUrl && (
                          <a
                            href={cert.credentialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                          >
                            Show credential <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Career Goals */}
          {activeGoals.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Career Goals</CardTitle>
                  <Link href="/goals" className="text-sm text-blue-600 hover:underline flex items-center gap-0.5">
                    All goals <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeGoals.map((goal) => {
                    const total = goal.milestones.length;
                    const done = goal.milestones.filter((m) => m.completed).length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div key={goal.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">{goal.title}</p>
                            {goal.targetDate && (
                              <p className="text-xs text-muted-foreground">
                                Target: {format(new Date(goal.targetDate), "MMM yyyy")}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant="secondary"
                            className={
                              goal.priority === "high"
                                ? "bg-red-100 text-red-700"
                                : goal.priority === "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-700"
                            }
                          >
                            {goal.priority}
                          </Badge>
                        </div>
                        {total > 0 && (
                          <Progress value={pct}>
                            <ProgressLabel>{done}/{total} milestones</ProgressLabel>
                            <ProgressValue />
                          </Progress>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Analytics Snapshot */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Job Search Analytics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Pipeline</span>
                <span className="font-semibold">{stats.activeApplications}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Upcoming Interviews</span>
                <span className="font-semibold">{stats.upcomingInterviews}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">New Submissions</span>
                <span className="font-semibold">{stats.newSubmissions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Resume Versions</span>
                <span className="font-semibold">{stats.resumes}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Career Goals</span>
                <span className="font-semibold">{stats.goals}</span>
              </div>
              <Separator />
              {profile?.targetSalaryMin && profile?.targetSalaryMax && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Target Salary</span>
                  <span className="text-sm font-semibold">
                    {profile.currency} {profile.targetSalaryMin.toLocaleString()}–{profile.targetSalaryMax.toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Application Pipeline Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} layout="vertical">
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="name" fontSize={11} width={80} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-center text-muted-foreground py-8">
                  No applications yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.slice(0, 6).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs leading-snug">{activity.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

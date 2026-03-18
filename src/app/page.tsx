"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  ChevronDown,
  AlertTriangle,
  Bell,
  DollarSign,
  User,
  Search,
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
import Image from "next/image";
import { PersonalFinance } from "@/components/personal-finance";
import { PayPeriodCalendar } from "@/components/pay-period-calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ExperiencePage from "./experience/page";
import SkillsPage from "./skills/page";
import ResumesPage from "./resumes/page";
import { History, Zap as ZapIcon, FileText as FileTextIcon } from "lucide-react";

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
    payType: string;
    payRate: string | null;
    payFrequency: string;
    hoursPerWeek: number | null;
    scheduleBHours: number | null;
    rotatingSchedule: boolean;
    otHoursA: number | null;
    otHoursB: number | null;
    otRate: number | null;
    differentials: string | null;
    estimatorSettings: string | null;
  } | null;
  profile: {
    fullName: string | null;
    headline: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    city: string | null;
    state: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
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
  cfm: {
    incomeYears: {
      id: string;
      year: number;
      grossIncome: number;
      netIncome: number | null;
      jobCount: number;
    }[];
    wageTiers: {
      id: string;
      label: string;
      hourlyRate: number;
      yearlyRate: number;
      color: string;
    }[];
  };
  upcomingInterviewDetails: {
    id: string;
    type: string;
    scheduledAt: string;
    durationMinutes: number | null;
    location: string | null;
    interviewerName: string | null;
    interviewerRole: string | null;
    jobApplication: { company: string; role: string };
  }[];
  expiringCertifications: {
    id: string;
    name: string;
    issuer: string;
    expiryDate: string | null;
  }[];
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
  });

  // Collapsible section state — must be before any early return
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  const isOpen = (key: string) => !collapsed[key];

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

  const { stats, pipeline, recentActivity, currentPosition, profile, topSkills, certifications, activeGoals, cfm, upcomingInterviewDetails, expiringCertifications } = data;

  const availability = (profile?.availability ?? "open_to_work") as AvailabilityStatus;
  const displayName = profile?.fullName || (currentPosition
    ? `${currentPosition.role} at ${currentPosition.company}`
    : "Career Professional");
  const headline = profile?.headline || (currentPosition
    ? `${currentPosition.role} at ${currentPosition.company}`
    : profile?.preferredRoles?.split(",")[0]?.trim() || "Career Professional");
  const locationStr = profile?.city && profile?.state
    ? `${profile.city}, ${profile.state}`
    : profile?.city || profile?.state || profile?.locationPreference || null;
  const initials = profile?.fullName
    ? profile.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : currentPosition
      ? `${currentPosition.role[0]}${currentPosition.company[0]}`
      : "Me";

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

  // Section header component
  const SectionHead = ({ id, icon: Icon, label, count }: { id: string; icon: React.ElementType; label: string; count?: number }) => (
    <button
      type="button"
      onClick={() => toggle(id)}
      className="flex items-center gap-2 w-full group py-1"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
      {count != null && count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>
      )}
      <Separator className="flex-1 mx-2" />
      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen(id) ? "" : "-rotate-90"}`} />
    </button>
  );

  // Alerts count
  const alertCount = upcomingInterviewDetails.length + expiringCertifications.length;

  // CFM summary data
  const cfmYears = cfm.incomeYears;
  const cfmLatest = cfmYears[cfmYears.length - 1] ?? null;
  const grossChanges = cfmYears.slice(1).map((y, i) =>
    cfmYears[i].grossIncome > 0
      ? ((y.grossIncome - cfmYears[i].grossIncome) / cfmYears[i].grossIncome) * 100
      : 0
  );
  const avgGrowth = grossChanges.length > 0
    ? grossChanges.reduce((a, b) => a + b, 0) / grossChanges.length
    : 0;
  const topTier = cfm.wageTiers.length > 0 ? cfm.wageTiers[cfm.wageTiers.length - 1] : null;
  const tierProgress = topTier && cfmLatest && cfmLatest.grossIncome > 0
    ? Math.min(100, (cfmLatest.grossIncome / topTier.yearlyRate) * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* ━━ Section 1: Profile Header ━━ */}
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500" />
        <CardContent className="relative px-6 pb-5 pt-0">
          <div className="-mt-12 mb-3 flex items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-background bg-white shadow-md overflow-hidden">
              {profile?.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={profile.fullName || "Profile"}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-blue-600">{initials}</span>
              )}
            </div>
            <div className="mb-1">
              <Badge className={AVAILABILITY_COLORS[availability]}>
                {AVAILABILITY_LABELS[availability]}
              </Badge>
            </div>
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold">{displayName}</h1>
            {headline !== displayName && (
              <p className="text-sm text-muted-foreground">{headline}</p>
            )}
            {locationStr && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {locationStr}
              </p>
            )}
            {(profile?.linkedinUrl || profile?.githubUrl || profile?.portfolioUrl || profile?.email) && (
              <div className="flex gap-3 pt-0.5">
                {profile?.email && (
                  <a href={`mailto:${profile.email}`} className="text-muted-foreground hover:text-foreground transition-colors" title="Email">
                    <FileText className="h-3.5 w-3.5" />
                  </a>
                )}
                {profile?.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-600 transition-colors" title="LinkedIn">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {profile?.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" title="GitHub">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {profile?.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" title="Portfolio">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
          {/* Compact stat row */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            <Link href="/applications" className="flex items-center gap-1 text-blue-600 hover:underline">
              <Briefcase className="h-3.5 w-3.5" />
              <span className="font-semibold">{stats.totalApplications}</span> Apps
            </Link>
            <Link href="/contacts" className="flex items-center gap-1 text-blue-600 hover:underline">
              <Users className="h-3.5 w-3.5" />
              <span className="font-semibold">{stats.contacts}</span> Contacts
            </Link>
            <Link href="/skills" className="flex items-center gap-1 text-blue-600 hover:underline">
              <Zap className="h-3.5 w-3.5" />
              <span className="font-semibold">{stats.skills}</span> Skills
            </Link>
            {stats.upcomingInterviews > 0 && (
              <Link href="/applications" className="flex items-center gap-1 text-purple-600 hover:underline">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="font-semibold">{stats.upcomingInterviews}</span> Interviews
              </Link>
            )}
          </div>
          {profile?.preferredRoles && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.preferredRoles.split(",").map((role) => (
                <Badge key={role.trim()} variant="secondary" className="text-[10px]">
                  {role.trim()}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ━━ Section 2: Alerts & Action Items ━━ */}
      {(alertCount > 0 || recentActivity.length > 0) && (
        <div>
          <SectionHead id="alerts" icon={Bell} label="Alerts & Recent" count={alertCount} />
          {isOpen("alerts") && (
            <div className="grid gap-3 mt-2 lg:grid-cols-3">
              {/* Upcoming Interviews */}
              {upcomingInterviewDetails.length > 0 && (
                <Card className="border-purple-200 dark:border-purple-800">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-purple-600" />
                      Interviews
                      <Badge className="ml-auto bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[10px] px-1.5 py-0">
                        {upcomingInterviewDetails.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {upcomingInterviewDetails.map((iv) => (
                        <div key={iv.id} className="flex gap-2 rounded border p-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-purple-50 dark:bg-purple-950">
                            <CalendarDays className="h-4 w-4 text-purple-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">
                              {iv.jobApplication.company} — {iv.jobApplication.role}
                            </p>
                            <p className="text-[10px] text-muted-foreground capitalize">
                              {iv.type}{iv.interviewerName && ` w/ ${iv.interviewerName}`}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(iv.scheduledAt), "MMM d 'at' h:mm a")}
                              {iv.durationMinutes && ` · ${iv.durationMinutes}m`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Expiring Certs */}
              {expiringCertifications.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Expiring Certs
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {expiringCertifications.map((cert) => {
                        const isExpired = cert.expiryDate && new Date(cert.expiryDate) < new Date();
                        return (
                          <div key={cert.id} className="flex items-center gap-2">
                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isExpired ? "bg-red-100 dark:bg-red-950" : "bg-amber-100 dark:bg-amber-950"}`}>
                              <Award className={`h-3 w-3 ${isExpired ? "text-red-600" : "text-amber-600"}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{cert.name}</p>
                              <p className="text-[10px] text-muted-foreground">{cert.issuer}</p>
                            </div>
                            <Badge className={`text-[10px] px-1.5 py-0 ${isExpired ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"}`}>
                              {isExpired ? "Expired" : `${format(new Date(cert.expiryDate!), "MMM d")}`}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Activity */}
              <Card>
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {recentActivity.length > 0 ? (
                    <div className="space-y-1.5">
                      {recentActivity.slice(0, 5).map((a) => (
                        <div key={a.id} className="flex items-start gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] leading-tight">{a.description}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground text-center py-3">No activity yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ━━ Section 3: Job Search ━━ */}
      <div>
        <SectionHead id="search" icon={Search} label="Job Search" count={stats.activeApplications} />
        {isOpen("search") && (
          <div className="grid gap-3 mt-2 lg:grid-cols-2">
            {/* Left: Analytics + Goals */}
            <div className="space-y-3">
              {/* Quick stats */}
              <Card>
                <CardContent className="px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Active Pipeline</span>
                      <span className="font-semibold text-sm">{stats.activeApplications}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Interviews</span>
                      <span className="font-semibold text-sm">{stats.upcomingInterviews}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Submissions</span>
                      <span className="font-semibold text-sm">{stats.newSubmissions}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Resumes</span>
                      <span className="font-semibold text-sm">{stats.resumes}</span>
                    </div>
                    {profile?.targetSalaryMin && profile?.targetSalaryMax && (
                      <div className="col-span-2 flex items-center justify-between pt-1 border-t">
                        <span className="text-xs text-muted-foreground">Target Salary</span>
                        <span className="text-xs font-semibold">
                          {profile.currency} {profile.targetSalaryMin.toLocaleString()}–{profile.targetSalaryMax.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Career Goals */}
              {activeGoals.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Goals</CardTitle>
                      <Link href="/goals" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                        All <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2.5">
                      {activeGoals.map((goal) => {
                        const total = goal.milestones.length;
                        const done = goal.milestones.filter((m) => m.completed).length;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        return (
                          <div key={goal.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold truncate">{goal.title}</p>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] px-1.5 py-0 ${
                                  goal.priority === "high" ? "bg-red-100 text-red-700"
                                    : goal.priority === "medium" ? "bg-yellow-100 text-yellow-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {goal.priority}
                              </Badge>
                            </div>
                            {total > 0 && (
                              <Progress value={pct}>
                                <ProgressLabel className="text-[10px]">{done}/{total}</ProgressLabel>
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

            {/* Right: Pipeline chart */}
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm">Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData} layout="vertical">
                      <XAxis type="number" allowDecimals={false} fontSize={10} />
                      <YAxis type="category" dataKey="name" fontSize={10} width={70} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-center text-muted-foreground py-6">No applications yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ━━ Section 4: Finance & Compensation ━━ */}
      {currentPosition && (
        <div>
          <SectionHead id="finance" icon={DollarSign} label="Finance & Compensation" />
          {isOpen("finance") && (
            <div className="grid gap-3 mt-2 lg:grid-cols-3">
              {/* Pay Period Calendar */}
              {currentPosition.payFrequency && (
                <PayPeriodCalendar compact />
              )}

              {/* Personal Finance */}
              <PersonalFinance
                positionId={currentPosition.id}
                payType={currentPosition.payType}
                payRate={currentPosition.payRate}
                salary={currentPosition.salary}
                payFrequency={currentPosition.payFrequency}
                hoursPerWeek={currentPosition.hoursPerWeek}
                scheduleBHours={currentPosition.scheduleBHours}
                rotatingSchedule={currentPosition.rotatingSchedule}
                otHoursA={currentPosition.otHoursA}
                otHoursB={currentPosition.otHoursB}
                otRate={currentPosition.otRate}
                differentials={currentPosition.differentials}
                estimatorSettings={currentPosition.estimatorSettings}
              />

              {/* Income Growth */}
              {cfmLatest && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Income Growth</CardTitle>
                      <Link href="/career-model" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                        Details <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Gross ({cfmLatest.year})</span>
                      <span className="text-sm font-semibold">${cfmLatest.grossIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Avg Growth</span>
                      {grossChanges.length > 0 ? (
                        <span className={`text-sm font-semibold flex items-center gap-1 ${avgGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {avgGrowth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingUp className="h-3 w-3 rotate-180" />}
                          {avgGrowth >= 0 ? "+" : ""}{avgGrowth.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Need 2+ years</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Years Tracked</span>
                      <span className="text-sm font-semibold">{cfmYears.length}</span>
                    </div>
                    {topTier && tierProgress !== null && (
                      <>
                        <Separator className="my-1" />
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{topTier.label} Goal</span>
                            <span className="font-medium">{tierProgress.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${tierProgress}%`, backgroundColor: topTier.color }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground text-right">
                            ${cfmLatest.grossIncome.toLocaleString()} / ${topTier.yearlyRate.toLocaleString()}
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ━━ Section 5: Career Profile ━━ */}
      <div>
        <SectionHead id="profile" icon={User} label="Career Profile" />
        {isOpen("profile") && (
          <div className="grid gap-3 mt-2 lg:grid-cols-2">
            {/* Left column: Experience + About */}
            <div className="space-y-3">
              {/* Experience */}
              <Card>
                <CardHeader className="pb-1 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Experience</CardTitle>
                    <Link href="/current-position" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                      Manage <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {currentPosition ? (
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
                        {currentPosition.company[0]}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-sm font-semibold">{currentPosition.role}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentPosition.company}
                          {currentPosition.department && ` · ${currentPosition.department}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(currentPosition.startDate), "MMM yyyy")} – Present · {formatDistanceToNow(new Date(currentPosition.startDate))}
                        </p>
                        {currentPosition.location && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" /> {currentPosition.location} · <span className="capitalize">{currentPosition.type}</span>
                          </p>
                        )}
                        {currentPosition.techStack && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {currentPosition.techStack.split(",").map((t) => (
                              <Badge key={t.trim()} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {t.trim()}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-4 text-center">
                      <Building2 className="h-6 w-6 text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">No current role</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* About */}
              {profile?.bio && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm">About</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed line-clamp-4">
                      {profile.bio}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Certifications */}
              {certifications.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm">Certifications</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {certifications.map((cert) => (
                        <div key={cert.id} className="flex gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-amber-50">
                            <Award className="h-3.5 w-3.5 text-amber-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">{cert.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {cert.issuer} · {format(new Date(cert.issueDate), "MMM yyyy")}
                              {cert.expiryDate && ` · Exp ${format(new Date(cert.expiryDate), "MMM yyyy")}`}
                            </p>
                            {cert.credentialUrl && (
                              <a href={cert.credentialUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                                Credential <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column: Skills */}
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Skills</CardTitle>
                  <Link href="/skills" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                    All <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {topSkills.length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(skillsByCategory).map(([cat, skills]) => (
                      <div key={cat}>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                          {CATEGORY_LABELS[cat] ?? cat}
                        </p>
                        <div className="space-y-1.5">
                          {skills.map((skill) => (
                            <div key={skill.id} className="flex items-center gap-2">
                              <span className="text-xs w-24 truncate">{skill.name}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${PROFICIENCY_COLORS[skill.proficiency] ?? "bg-gray-400"}`}
                                  style={{ width: `${PROFICIENCY_PCT[skill.proficiency] ?? 25}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground capitalize w-16 text-right">
                                {skill.proficiency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No skills tracked yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ━━ Section 6: Profile Management ━━ */}
      <div>
        <SectionHead id="manage" icon={User} label="Profile Management" />
        {isOpen("manage") && (
          <div className="mt-2">
            <Tabs defaultValue="experience">
              <TabsList>
                <TabsTrigger value="experience">Experience</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="resumes">Resumes</TabsTrigger>
              </TabsList>
              <TabsContent value="experience" className="mt-4">
                <ExperiencePage />
              </TabsContent>
              <TabsContent value="skills" className="mt-4">
                <SkillsPage />
              </TabsContent>
              <TabsContent value="resumes" className="mt-4">
                <ResumesPage />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

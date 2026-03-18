"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarDays,
  Users,
  Zap,
  TrendingUp,
  Clock,
  Building2,
  FileText,
  MapPin,
  Award,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
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
  intermediate: "bg-orange-500",
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
    <div className="max-w-5xl mx-auto space-y-3">
      {/* ━━ Banner row: Profile Header + Sidebar Info Cards ━━ */}
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* ── Profile Banner (left) ── */}
        <Card className="overflow-hidden">
          <div className="relative h-48 sm:h-52 bg-gradient-to-r from-orange-600 via-orange-500 to-cyan-500" />
          <CardContent className="relative px-6 pb-5 pt-0">
            {/* Avatar overlapping banner */}
            <div className="-mt-20 mb-3 flex items-end gap-5">
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-4 border-background bg-white shadow-lg overflow-hidden">
                {profile?.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={profile.fullName || "Profile"}
                    width={144}
                    height={144}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-bold text-orange-600">{initials}</span>
                )}
              </div>
              <div className="mb-2 flex items-center gap-2">
                <Badge className={AVAILABILITY_COLORS[availability]}>
                  {AVAILABILITY_LABELS[availability]}
                </Badge>
              </div>
            </div>

            {/* Name + headline + company row */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
                {headline !== displayName && (
                  <p className="text-sm text-muted-foreground max-w-lg">{headline}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground pt-0.5">
                  {locationStr && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {locationStr}
                    </span>
                  )}
                  {currentPosition && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {currentPosition.company}
                    </span>
                  )}
                </div>
              </div>
              {currentPosition && (
                <div className="flex items-center gap-2 sm:mt-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500 border">
                    {currentPosition.company[0]}
                  </div>
                  <span className="text-sm font-medium">{currentPosition.company}</span>
                </div>
              )}
            </div>

            {/* Social links row */}
            {(profile?.linkedinUrl || profile?.githubUrl || profile?.portfolioUrl || profile?.email) && (
              <div className="flex gap-4 mt-2">
                {profile?.email && (
                  <a href={`mailto:${profile.email}`} className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="Email">
                    <FileText className="h-3.5 w-3.5" /> Email
                  </a>
                )}
                {profile?.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="LinkedIn">
                    <ExternalLink className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
                {profile?.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="GitHub">
                    <ExternalLink className="h-3.5 w-3.5" /> GitHub
                  </a>
                )}
                {profile?.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="Portfolio">
                    <ExternalLink className="h-3.5 w-3.5" /> Portfolio
                  </a>
                )}
              </div>
            )}

            {/* Stats row */}
            <Separator className="my-3" />
            <div className="flex flex-wrap gap-5 text-sm">
              <Link href="/applications" className="flex items-center gap-1.5 hover:underline">
                <Briefcase className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{stats.totalApplications}</span>
                <span className="text-muted-foreground">Applications</span>
              </Link>
              <Link href="/contacts" className="flex items-center gap-1.5 hover:underline">
                <Users className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{stats.contacts}</span>
                <span className="text-muted-foreground">Contacts</span>
              </Link>
              <Link href="/skills" className="flex items-center gap-1.5 hover:underline">
                <Zap className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{stats.skills}</span>
                <span className="text-muted-foreground">Skills</span>
              </Link>
              {stats.upcomingInterviews > 0 && (
                <Link href="/applications" className="flex items-center gap-1.5 hover:underline">
                  <CalendarDays className="h-4 w-4 text-purple-600" />
                  <span className="font-semibold">{stats.upcomingInterviews}</span>
                  <span className="text-muted-foreground">Interviews</span>
                </Link>
              )}
            </div>

            {/* Preferred roles tags */}
            {profile?.preferredRoles && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.preferredRoles.split(",").map((role) => (
                  <Badge key={role.trim()} variant="secondary" className="text-xs px-2 py-0.5">
                    {role.trim()}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Sidebar Info Cards (right of banner) ── */}
        <div className="space-y-3">
          {/* Current Position */}
          {currentPosition && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Current Role</CardTitle>
                  <Link href="/current-position" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    Manage <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500 border">
                    {currentPosition.company[0]}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold truncate">{currentPosition.role}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentPosition.company}
                      {currentPosition.department && ` · ${currentPosition.department}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(currentPosition.startDate), "MMM yyyy")} – Present
                    </p>
                    {currentPosition.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {currentPosition.location}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Active Pipeline</span>
                  <span className="font-semibold">{stats.activeApplications}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Interviews</span>
                  <span className="font-semibold">{stats.upcomingInterviews}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Submissions</span>
                  <span className="font-semibold">{stats.newSubmissions}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Resumes</span>
                  <span className="font-semibold">{stats.resumes}</span>
                </div>
                {profile?.targetSalaryMin && profile?.targetSalaryMax && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Target Salary</span>
                      <span className="text-sm font-semibold">
                        {profile.currency} {profile.targetSalaryMin.toLocaleString()}–{profile.targetSalaryMax.toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Public Links */}
          {(profile?.linkedinUrl || profile?.githubUrl || profile?.portfolioUrl) && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Public Profile & URLs</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2">
                {profile?.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-orange-600 hover:underline truncate">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{profile.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                  </a>
                )}
                {profile?.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-orange-600 hover:underline truncate">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{profile.githubUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                  </a>
                )}
                {profile?.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-orange-600 hover:underline truncate">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{profile.portfolioUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ━━ Two-column LinkedIn grid: Main (left) + Sidebar (right) ━━ */}
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* ════ LEFT / MAIN COLUMN ════ */}
        <div className="space-y-3">
          {/* About */}
          {profile?.bio && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-base font-semibold">About</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {profile.bio}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-base font-semibold">Certifications</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-3">
                  {certifications.map((cert) => (
                    <div key={cert.id} className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950">
                        <Award className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cert.issuer} · Issued {format(new Date(cert.issueDate), "MMM yyyy")}
                          {cert.expiryDate && ` · Expires ${format(new Date(cert.expiryDate), "MMM yyyy")}`}
                        </p>
                        {cert.credentialUrl && (
                          <a href={cert.credentialUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5 mt-0.5">
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

          {/* Job Search Pipeline */}
          {(stats.activeApplications > 0 || chartData.length > 0) && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Application Pipeline</CardTitle>
                  <Link href="/applications" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
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
                  <p className="text-sm text-center text-muted-foreground py-8">No applications yet</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Profile Management Tabs */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base font-semibold">Profile Management</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
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
            </CardContent>
          </Card>
        </div>

        {/* ════ RIGHT / SIDEBAR ════ */}
        <div className="space-y-3">
          {/* Alerts: Upcoming Interviews */}
          {upcomingInterviewDetails.length > 0 && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-purple-600" />
                  Upcoming Interviews
                  <Badge className="ml-auto bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[11px] px-2 py-0.5">
                    {upcomingInterviewDetails.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-3">
                  {upcomingInterviewDetails.map((iv) => (
                    <div key={iv.id} className="flex gap-3 rounded-lg border p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950">
                        <CalendarDays className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {iv.jobApplication.company} — {iv.jobApplication.role}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {iv.type}{iv.interviewerName && ` w/ ${iv.interviewerName}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
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

          {/* Alerts: Expiring Certs */}
          {expiringCertifications.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Expiring Certifications
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-2.5">
                  {expiringCertifications.map((cert) => {
                    const isExpired = cert.expiryDate && new Date(cert.expiryDate) < new Date();
                    return (
                      <div key={cert.id} className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isExpired ? "bg-red-100 dark:bg-red-950" : "bg-amber-100 dark:bg-amber-950"}`}>
                          <Award className={`h-4 w-4 ${isExpired ? "text-red-600" : "text-amber-600"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{cert.name}</p>
                          <p className="text-xs text-muted-foreground">{cert.issuer}</p>
                        </div>
                        <Badge className={`text-xs px-2 py-0.5 ${isExpired ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"}`}>
                          {isExpired ? "Expired" : `${format(new Date(cert.expiryDate!), "MMM d")}`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Career Goals */}
          {activeGoals.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Goals</CardTitle>
                  <Link href="/goals" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    All <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-3">
                  {activeGoals.map((goal) => {
                    const total = goal.milestones.length;
                    const done = goal.milestones.filter((m) => m.completed).length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div key={goal.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold truncate">{goal.title}</p>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] px-2 py-0.5 ${
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
                            <ProgressLabel className="text-xs">{done}/{total}</ProgressLabel>
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

          {/* Finance: Income Growth */}
          {currentPosition && cfmLatest && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Income Growth</CardTitle>
                  <Link href="/career-model" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    Details <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gross ({cfmLatest.year})</span>
                  <span className="font-semibold">${cfmLatest.grossIncome.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg Growth</span>
                  {grossChanges.length > 0 ? (
                    <span className={`font-semibold flex items-center gap-1 ${avgGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {avgGrowth >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5 rotate-180" />}
                      {avgGrowth >= 0 ? "+" : ""}{avgGrowth.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Need 2+ years</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Years Tracked</span>
                  <span className="font-semibold">{cfmYears.length}</span>
                </div>
                {topTier && tierProgress !== null && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{topTier.label} Goal</span>
                        <span className="font-medium">{tierProgress.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${tierProgress}%`, backgroundColor: topTier.color }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        ${cfmLatest.grossIncome.toLocaleString()} / ${topTier.yearlyRate.toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Finance widgets */}
          {currentPosition && currentPosition.payFrequency && (
            <PayPeriodCalendar compact />
          )}
          {currentPosition && (
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
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {recentActivity.length > 0 ? (
                <div className="space-y-2.5">
                  {recentActivity.slice(0, 6).map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{a.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

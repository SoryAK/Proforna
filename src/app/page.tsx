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
  AlertTriangle,
  Bell,
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

  return (
    <div className="space-y-4">
      {/* ── Profile Header Card ── */}
      <Card className="overflow-hidden">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500" />

        <CardContent className="relative px-6 pb-6 pt-0">
          {/* Avatar */}
          <div className="-mt-16 mb-4 flex items-end gap-4">
            <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-background bg-white shadow-md overflow-hidden">
              {profile?.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={profile.fullName || "Profile"}
                  width={112}
                  height={112}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-blue-600">{initials}</span>
              )}
            </div>
            <div className="mb-1">
              <Badge className={AVAILABILITY_COLORS[availability]}>
                {AVAILABILITY_LABELS[availability]}
              </Badge>
            </div>
          </div>

          {/* Name / Headline / Meta */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {headline !== displayName && (
              <p className="text-muted-foreground">{headline}</p>
            )}
            {currentPosition && headline === displayName && (
              <p className="text-muted-foreground">
                {currentPosition.department && `${currentPosition.department} · `}
                <span className="capitalize">{currentPosition.type}</span>
                {currentPosition.location && ` · ${currentPosition.location}`}
              </p>
            )}
            {locationStr && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {locationStr}
              </p>
            )}
            {/* Social Links */}
            {(profile?.linkedinUrl || profile?.githubUrl || profile?.portfolioUrl || profile?.email) && (
              <div className="flex gap-3 pt-1">
                {profile.email && (
                  <a href={`mailto:${profile.email}`} className="text-muted-foreground hover:text-foreground transition-colors" title="Email">
                    <FileText className="h-4 w-4" />
                  </a>
                )}
                {profile.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-600 transition-colors" title="LinkedIn">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {profile.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" title="GitHub">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {profile.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" title="Portfolio">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
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
          {/* Upcoming Interviews */}
          {upcomingInterviewDetails.length > 0 && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-purple-600" />
                    Upcoming Interviews
                  </CardTitle>
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                    {upcomingInterviewDetails.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {upcomingInterviewDetails.map((iv) => (
                    <div key={iv.id} className="flex gap-3 rounded-md border p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950">
                        <CalendarDays className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {iv.jobApplication.company} — {iv.jobApplication.role}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {iv.type} interview
                          {iv.interviewerName && ` with ${iv.interviewerName}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(iv.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                          {iv.durationMinutes && ` · ${iv.durationMinutes}min`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expiring Certifications */}
          {expiringCertifications.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Expiring Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
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
                        <Badge className={isExpired ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"}>
                          {isExpired ? "Expired" : `Expires ${format(new Date(cert.expiryDate!), "MMM d")}`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Personal Finance */}
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

          {/* Career Financial Model Summary */}
          {cfm.incomeYears.length > 0 && (() => {
            const years = cfm.incomeYears;
            const latest = years[years.length - 1];
            const grossChanges = years.slice(1).map((y, i) =>
              years[i].grossIncome > 0
                ? ((y.grossIncome - years[i].grossIncome) / years[i].grossIncome) * 100
                : 0
            );
            const avgGrowth = grossChanges.length > 0
              ? grossChanges.reduce((a, b) => a + b, 0) / grossChanges.length
              : 0;
            const topTier = cfm.wageTiers.length > 0
              ? cfm.wageTiers[cfm.wageTiers.length - 1]
              : null;
            const progress = topTier && latest.grossIncome > 0
              ? Math.min(100, (latest.grossIncome / topTier.yearlyRate) * 100)
              : null;

            return (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Income Growth</CardTitle>
                    <Link href="/career-model" className="text-sm text-blue-600 hover:underline flex items-center gap-0.5">
                      Details <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Latest Gross ({latest.year})</span>
                    <span className="font-semibold">${latest.grossIncome.toLocaleString()}</span>
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
                    <span className="font-semibold">{years.length}</span>
                  </div>
                  {latest.jobCount > 1 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Employers ({latest.year})</span>
                      <span className="font-semibold">{latest.jobCount}</span>
                    </div>
                  )}
                  {topTier && progress !== null && (
                    <>
                      <Separator />
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{topTier.label} Goal</span>
                          <span className="font-medium">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${progress}%`, backgroundColor: topTier.color }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-right">
                          ${latest.grossIncome.toLocaleString()} / ${topTier.yearlyRate.toLocaleString()}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}

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

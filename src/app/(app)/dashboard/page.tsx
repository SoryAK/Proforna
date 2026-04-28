"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  BookOpen,
  Compass,
  Newspaper,
  Pencil,
  Settings,
  Camera,
  DollarSign,
  Youtube,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  STATUS_LABELS,
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  AVAILABILITY_STATUSES,
  type ApplicationStatus,
  type AvailabilityStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
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

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { PersonalFinance } from "@/components/personal-finance";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { PayPeriodCalendar } from "@/components/pay-period-calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VideoFeed } from "@/components/video-feed";
import ExperiencePage from "../experience/page";
import SkillsPage from "../skills/page";
import ResumesPage from "../resumes/page";


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
    schedulingUrl: string | null;
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
  learningSummary: {
    total: number;
    inProgress: number;
    completed: number;
    totalHours: number;
    recentItems: {
      id: string;
      title: string;
      status: string;
      progress: number;
      provider: string | null;
    }[];
  };
  cdmSummary: {
    overallScore: number | null;
    capturedAt: string;
    pathCount: number;
    paths: { title: string; score: number; skillMatch: number }[];
  } | null;
  unreadArticleCount: number;
  recentArticles: {
    id: string;
    title: string;
    url: string;
    source: string | null;
    summary: string | null;
    publishedAt: string | null;
    imageUrl: string | null;
    feed: { title: string; category: string };
  }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard");
      if (r.status === 401) throw new Error("UNAUTHORIZED");
      if (!r.ok) throw new Error(`Dashboard fetch failed: ${r.status}`);
      return r.json();
    },
    retry: false,
  });

  // Stale session (e.g. DB reset while JWT cookie persists) — sign out
  useEffect(() => {
    if (isError && error?.message === "UNAUTHORIZED") {
      signOut({ callbackUrl: "/login" });
    }
  }, [isError, error]);

  // Redirect brand-new users to onboarding — only when data loaded successfully
  // and no profile record exists at all (not due to an API error)
  useEffect(() => {
    if (!isLoading && !isError && data && !data.profile) {
      router.replace("/onboarding");
    }
  }, [isLoading, isError, data, router]);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    headline: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    schedulingUrl: "",
    availability: "open_to_work",
    bio: "",
    preferredRoles: "",
    locationPreference: "",
    avatarUrl: "",
  });

  const profileMutation = useMutation({
    mutationFn: (body: typeof editForm) =>
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setEditOpen(false);
    },
  });

  const openEditDialog = () => {
    if (data?.profile) {
      setEditForm({
        fullName: data.profile.fullName ?? "",
        headline: data.profile.headline ?? "",
        email: data.profile.email ?? "",
        phone: data.profile.phone ?? "",
        city: data.profile.city ?? "",
        state: data.profile.state ?? "",
        linkedinUrl: data.profile.linkedinUrl ?? "",
        githubUrl: data.profile.githubUrl ?? "",
        portfolioUrl: data.profile.portfolioUrl ?? "",
        schedulingUrl: data.profile.schedulingUrl ?? "",
        availability: data.profile.availability ?? "open_to_work",
        bio: data.profile.bio ?? "",
        preferredRoles: data.profile.preferredRoles ?? "",
        locationPreference: data.profile.locationPreference ?? "",
        avatarUrl: data.profile.avatarUrl ?? "",
      });
    }
    setEditOpen(true);
  };

  useEffect(() => {
    if (!isLoading && data && !data.profile?.fullName) {
      if (!sessionStorage.getItem("profileEditPrompted")) {
        sessionStorage.setItem("profileEditPrompted", "true");
        // eslint-disable-next-line react-hooks/exhaustive-deps
        openEditDialog();
      }
    }
  }, [isLoading, data]);

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

  const { stats, pipeline, recentActivity, currentPosition, profile, topSkills, certifications, activeGoals, cfm, upcomingInterviewDetails, expiringCertifications, learningSummary, cdmSummary, unreadArticleCount, recentArticles } = data;

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

  const hasProfile = Boolean(profile?.fullName);
  const hasPosition = Boolean(currentPosition);
  const hasResume = stats.resumes > 0;
  const showOnboarding = !hasProfile || !hasPosition || !hasResume;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ━━ Onboarding ━━ */}
      {showOnboarding && (
        <OnboardingFlow
          hasProfile={hasProfile}
          hasPosition={hasPosition}
          hasResume={hasResume}
          onProfileClick={openEditDialog}
        />
      )}

      {/* ━━ Profile Banner ━━ */}
      <div>
        {/* ── Profile Banner (left) ── */}
        <Card className="overflow-hidden pt-0">
          {/* Abstract wave banner inspired by MatDash */}
          <div className="relative h-48 sm:h-56 overflow-hidden">
            {/* Base gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-400" />
            {/* Overlay soft light */}
            <div className="absolute inset-0 bg-gradient-to-t from-white/10 via-transparent to-white/5" />
            {/* SVG wave layers */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 1200 400"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="wave1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
                </linearGradient>
                <linearGradient id="wave2" x1="0" y1="0" x2="1" y2="0.5">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.3" />
                </linearGradient>
                <linearGradient id="wave3" x1="0" y1="0.5" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity="0.5" />
                </linearGradient>
              </defs>
              {/* Background mountain/wave shape */}
              <path
                d="M0,320 C100,280 200,200 350,220 C500,240 550,160 700,140 C850,120 950,180 1050,160 C1150,140 1200,180 1200,180 L1200,400 L0,400 Z"
                fill="url(#wave1)"
              />
              {/* Mid layer wave */}
              <path
                d="M0,350 C150,300 250,260 400,280 C550,300 600,220 750,200 C900,180 1000,240 1100,220 C1150,210 1200,240 1200,240 L1200,400 L0,400 Z"
                fill="url(#wave2)"
              />
              {/* Front wave */}
              <path
                d="M0,380 C200,340 350,320 500,340 C650,360 700,300 850,280 C1000,260 1100,310 1200,300 L1200,400 L0,400 Z"
                fill="url(#wave3)"
              />
              {/* Accent dots / circles for depth */}
              <circle cx="200" cy="180" r="40" fill="white" fillOpacity="0.05" />
              <circle cx="800" cy="120" r="60" fill="white" fillOpacity="0.04" />
              <circle cx="500" cy="100" r="30" fill="white" fillOpacity="0.06" />
              <circle cx="1000" cy="160" r="25" fill="white" fillOpacity="0.05" />
            </svg>
            {/* Subtle noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
            {/* Edit Profile & Settings buttons on banner */}
            <div className="absolute top-3 right-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={openEditDialog} className="bg-white/95 hover:bg-white shadow-md text-xs font-semibold gap-1.5 text-gray-800 border-white/60">
                <Pencil className="h-3.5 w-3.5" />
                Edit Profile
              </Button>
              <Link href="/portal-settings">
                <Button size="sm" variant="outline" className="bg-white/95 hover:bg-white shadow-md text-xs font-semibold gap-1.5 text-gray-800 border-white/60">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
          <CardContent className="relative px-6 pb-5 pt-0">
            {/* Avatar overlapping banner */}
            <div className="-mt-20 mb-3 flex items-end gap-5">
              <div className="relative">
                <div className="flex h-36 w-36 items-center justify-center rounded-full border-[3px] border-white bg-white shadow-lg ring-2 ring-black/5 overflow-hidden">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.fullName || "Profile"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-bold text-orange-600">{initials}</span>
                  )}
                </div>
                {/* Availability badge overlay */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <Badge className={cn(AVAILABILITY_COLORS[availability], "text-[10px] px-2 py-0.5 shadow-sm border border-white whitespace-nowrap")}>
                    {AVAILABILITY_LABELS[availability]}
                  </Badge>
                </div>
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
            </div>

            {/* Social links row */}
            {(profile?.linkedinUrl || profile?.githubUrl || profile?.portfolioUrl || profile?.email) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {profile?.email && (
                  <a href={`mailto:${profile.email}`} className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="Email">
                    <FileText className="h-3.5 w-3.5" /> {profile.email}
                  </a>
                )}
                {profile?.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="LinkedIn">
                    <ExternalLink className="h-3.5 w-3.5" /> {profile.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
                {profile?.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="GitHub">
                    <ExternalLink className="h-3.5 w-3.5" /> {profile.githubUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
                {profile?.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1" title="Portfolio">
                    <ExternalLink className="h-3.5 w-3.5" /> {profile.portfolioUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
              </div>
            )}

            {/* Stats row */}
            <div className="my-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/applications" className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors">
                <Briefcase className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{stats.totalApplications}</span>
                <span className="text-muted-foreground">Applications</span>
              </Link>
              <Link href="/contacts" className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors">
                <Users className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{stats.contacts}</span>
                <span className="text-muted-foreground">Contacts</span>
              </Link>
              <Link href="/skills" className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors">
                <Zap className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{stats.skills}</span>
                <span className="text-muted-foreground">Skills</span>
              </Link>
              {stats.upcomingInterviews > 0 && (
                <Link href="/applications" className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors">
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
      </div>

      {/* ━━ ALERTS (only render section if there are alerts) ━━ */}
      {(upcomingInterviewDetails.length > 0 || expiringCertifications.length > 0) && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Upcoming Interviews */}
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

            {/* Expiring Certs */}
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
          </div>
        </div>
      )}

      {/* ━━ FINANCIALS ━━ */}
      {currentPosition && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <DollarSign className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Financials</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Income Growth */}
            {cfmLatest && (
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

            {/* Pay Period Calendar */}
            {currentPosition.payFrequency && (
              <PayPeriodCalendar compact />
            )}
          </div>
        </div>
      )}

      {/* ━━ JOB SEARCH ━━ */}
      {(stats.activeApplications > 0 || chartData.length > 0 || certifications.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Briefcase className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Job Search</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Application Pipeline */}
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
          </div>
        </div>
      )}

      {/* ━━ CAREER DEVELOPMENT ━━ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <TrendingUp className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Career Development</h2>
        </div>

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

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Learning Progress */}
          {learningSummary.total > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-orange-500" />
                    Learning Progress
                  </CardTitle>
                  <Link href="/research" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    View <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-orange-600">{learningSummary.inProgress}</p>
                    <p className="text-[10px] text-muted-foreground">In Progress</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{learningSummary.completed}</p>
                    <p className="text-[10px] text-muted-foreground">Completed</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{learningSummary.totalHours}</p>
                    <p className="text-[10px] text-muted-foreground">Hours</p>
                  </div>
                </div>
                {learningSummary.recentItems.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      {learningSummary.recentItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{item.title}</p>
                            {item.provider && (
                              <p className="text-[10px] text-muted-foreground">{item.provider}</p>
                            )}
                          </div>
                          <Progress value={item.progress} className="w-12 h-1.5" />
                          <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">
                            {item.progress}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Career Direction */}
          {cdmSummary && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Compass className="h-4 w-4 text-indigo-500" />
                    Career Direction
                  </CardTitle>
                  <Link href="/career-growth" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    CDM <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${
                      (cdmSummary.overallScore ?? 0) >= 75
                        ? "text-emerald-600"
                        : (cdmSummary.overallScore ?? 0) >= 50
                        ? "text-amber-600"
                        : "text-red-500"
                    }`}>
                      {Math.round(cdmSummary.overallScore ?? 0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Overall</p>
                  </div>
                  <Separator orientation="vertical" className="h-8" />
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>{cdmSummary.pathCount} career path{cdmSummary.pathCount !== 1 ? "s" : ""} tracked</p>
                    <p>Last snapshot: {formatDistanceToNow(new Date(cdmSummary.capturedAt), { addSuffix: true })}</p>
                  </div>
                </div>
                {cdmSummary.paths.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      {cdmSummary.paths.map((p) => (
                        <div key={p.title} className="flex items-center justify-between text-xs">
                          <span className="truncate font-medium">{p.title}</span>
                          <span className={`font-semibold ${
                            p.score >= 75
                              ? "text-emerald-600"
                              : p.score >= 50
                              ? "text-amber-600"
                              : "text-red-500"
                          }`}>
                            {Math.round(p.score)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Goals - full width */}
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
              <div className="grid gap-4 sm:grid-cols-2">
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

        {/* Profile Management Tabs - full width */}
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

      {/* ━━ VIDEO FEED ━━ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Youtube className="h-4 w-4 text-red-600" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Industry Videos</h2>
        </div>
        <VideoFeed />
      </div>

      {/* ━━ ACTIVITY & INSIGHTS ━━ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Clock className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Activity & Insights</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Recent Activity */}
          <Card className="sm:col-span-2 lg:col-span-2">
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

          {/* Industry News */}
          {recentArticles && recentArticles.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Newspaper className="h-4 w-4 text-cyan-600" />
                    Industry News
                    {unreadArticleCount > 0 && (
                      <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300 text-[10px] px-1.5 py-0">
                        {unreadArticleCount}
                      </Badge>
                    )}
                  </CardTitle>
                  <Link href="/research" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-1">
                  {recentArticles.map((article) => (
                    <a
                      key={article.id}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
                    >
                      {/* Thumbnail */}
                      {article.imageUrl ? (
                        <img
                          src={article.imageUrl}
                          alt=""
                          className="h-14 w-20 shrink-0 rounded-md object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Newspaper className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-cyan-600 transition-colors">
                          {article.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate">{article.feed.title}</span>
                          {article.publishedAt && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="shrink-0">{formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              profileMutation.mutate(editForm);
            }}
            className="space-y-4"
          >
            {/* Profile Picture */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                <div className="h-24 w-24 rounded-full border-2 border-muted bg-muted/30 overflow-hidden flex items-center justify-center">
                  {editForm.avatarUrl ? (
                    <img src={editForm.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center rounded-full cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-5 w-5 text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setEditForm((f) => ({ ...f, avatarUrl: reader.result as string }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
              <span className="text-xs text-muted-foreground">Click to change photo</span>
              {editForm.avatarUrl && (
                <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => setEditForm((f) => ({ ...f, avatarUrl: "" }))}>
                  Remove photo
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-fullName">Full Name</Label>
                <Input id="ep-fullName" value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-headline">Headline</Label>
                <Input id="ep-headline" value={editForm.headline} onChange={(e) => setEditForm((f) => ({ ...f, headline: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-email">Email</Label>
                <Input id="ep-email" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-phone">Phone</Label>
                <Input id="ep-phone" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-city">City</Label>
                <Input id="ep-city" value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-state">State</Label>
                <Input id="ep-state" value={editForm.state} onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Availability</Label>
              <Select value={editForm.availability} onValueChange={(v) => setEditForm((f) => ({ ...f, availability: v ?? f.availability }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{AVAILABILITY_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-bio">Bio</Label>
              <Textarea id="ep-bio" rows={3} value={editForm.bio} onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-roles">Preferred Roles</Label>
              <Input id="ep-roles" placeholder="e.g. Frontend Engineer, Full-Stack" value={editForm.preferredRoles} onChange={(e) => setEditForm((f) => ({ ...f, preferredRoles: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-locPref">Location Preference</Label>
              <Input id="ep-locPref" placeholder="e.g. Remote, NYC, SF" value={editForm.locationPreference} onChange={(e) => setEditForm((f) => ({ ...f, locationPreference: e.target.value }))} />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="ep-linkedin">LinkedIn URL</Label>
              <Input id="ep-linkedin" value={editForm.linkedinUrl} onChange={(e) => setEditForm((f) => ({ ...f, linkedinUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-github">GitHub URL</Label>
              <Input id="ep-github" value={editForm.githubUrl} onChange={(e) => setEditForm((f) => ({ ...f, githubUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-portfolio">Portfolio URL</Label>
              <Input id="ep-portfolio" value={editForm.portfolioUrl} onChange={(e) => setEditForm((f) => ({ ...f, portfolioUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-scheduling">Scheduling URL</Label>
              <Input id="ep-scheduling" placeholder="https://calendly.com/your-handle" value={editForm.schedulingUrl} onChange={(e) => setEditForm((f) => ({ ...f, schedulingUrl: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Calendly, Cal.com, or any link where recruiters can book time. Powers the “Schedule interview” button on your public resume.</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

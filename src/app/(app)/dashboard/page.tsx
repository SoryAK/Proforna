"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarDays,
  TrendingUp,
  Clock,
  Award,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Newspaper,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import {
  STATUS_LABELS,
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
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { PayPeriodCalendar } from "@/components/pay-period-calendar";
import { ProfileBanner } from "@/components/dashboard/profile-banner";
import { CareerSection } from "@/components/dashboard/career-section";
import { EditProfileDialog } from "@/components/dashboard/edit-profile-dialog";
import type { DashboardData, EditProfileForm } from "@/components/dashboard/types";

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
  const [editForm, setEditForm] = useState<EditProfileForm>({
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
    mutationFn: (body: EditProfileForm) =>
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ━━ Onboarding ━━ */}
      {showOnboarding && (
        <OnboardingFlow
          hasProfile={hasProfile}
          hasPosition={hasPosition}
          hasResume={hasResume}
          onProfileClick={openEditDialog}
        />
      )}

      {/* ━━ Profile Banner + Recent Activity ━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-start">
        <ProfileBanner
          profile={profile}
          currentPosition={currentPosition}
          stats={stats}
          availability={availability}
          displayName={displayName}
          headline={headline}
          locationStr={locationStr}
          initials={initials}
          onEditClick={openEditDialog}
        />
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
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground/70">Actions across the app will appear here</p>
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
            <h2 className="text-base font-semibold text-foreground">Financials</h2>
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
            <h2 className="text-base font-semibold text-foreground">Job Search</h2>
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
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <Briefcase className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No applications yet</p>
                      <Link href="/applications" className="text-xs text-orange-600 hover:underline">Track your first application</Link>
                    </div>
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
      <CareerSection
        profile={profile}
        learningSummary={learningSummary}
        cdmSummary={cdmSummary}
        activeGoals={activeGoals}
        topSkills={topSkills}
        currentPosition={currentPosition}
        stats={stats}
      />

      {/* ━━ INDUSTRY NEWS ━━ */}
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
      {/* Edit Profile Dialog */}
      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editForm={editForm}
        setEditForm={setEditForm}
        isPending={profileMutation.isPending}
        onSubmit={() => profileMutation.mutate(editForm)}
      />
    </div>
  );
}

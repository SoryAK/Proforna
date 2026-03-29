"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  DollarSign,
  MapPin,
  Briefcase,
  TrendingUp,
  Users,
  Shield,
  FileText,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Types ── */
export interface DeepDiveJob {
  id: string;
  title: string;
  company: string;
  location: string;
  lat: number;
  lng: number;
  salaryMin: number | null;
  salaryMax: number | null;
  created: string;
  source: "adzuna" | "google" | "email";
  via?: string;
  scheduleType?: string | null;
  contractTime?: string | null;
  contractType?: string | null;
  category: string;
  description: string;
}

interface CompanyDeepDiveProps {
  companyName: string;
  jobs: DeepDiveJob[];
}

/* ── Helpers ── */
function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/** Normalize job titles into role categories */
function categorizeRole(title: string): string {
  const t = title.toLowerCase();
  if (/engineer|developer|software|sre|devops|frontend|backend|fullstack|full.stack/.test(t)) return "Engineering";
  if (/data.*scien|machine.learn|ml\b|ai\b|deep.learn/.test(t)) return "Data Science / ML";
  if (/data.*analy|business.intel|bi\b|analytics/.test(t)) return "Data / Analytics";
  if (/design|ux|ui|graphic|creative/.test(t)) return "Design";
  if (/product.*manag|program.*manag|scrum|agile/.test(t)) return "Product / Program";
  if (/market|growth|seo|content|brand|social/.test(t)) return "Marketing";
  if (/sale|account.*exec|business.*dev|bdr|sdr/.test(t)) return "Sales / BD";
  if (/recruit|talent|people|hr|human.resource/.test(t)) return "HR / Recruiting";
  if (/financ|account|payroll|tax|audit|controller/.test(t)) return "Finance / Accounting";
  if (/legal|compliance|counsel|paralegal/.test(t)) return "Legal / Compliance";
  if (/support|customer.*success|helpdesk|service/.test(t)) return "Support / CS";
  if (/ops|operat|logistics|supply.chain|warehouse/.test(t)) return "Operations";
  if (/secur|cyber|infosec|penetration/.test(t)) return "Security";
  if (/manag|director|vp|chief|head.of|lead/.test(t)) return "Management";
  if (/intern|apprentice|co.op|entry.level|junior/.test(t)) return "Early Career";
  return "Other";
}

/** Known staffing / recruiting firms */
const RECRUITER_KEYWORDS = [
  "staffing", "recruiting", "recruiters", "talent", "randstad", "adecco", "manpower",
  "robert half", "kelly services", "hays", "kforce", "insight global", "teksystems",
  "cybercoders", "apex systems", "aerotek", "modis", "tek experts",
];

function isRecruiterSource(via?: string, company?: string) {
  const text = `${via ?? ""} ${company ?? ""}`.toLowerCase();
  return RECRUITER_KEYWORDS.some((k) => text.includes(k));
}

/* ── Analytics computations ── */
function computeAnalytics(jobs: DeepDiveJob[]) {
  // Salary intelligence
  const withSalary = jobs.filter((j) => j.salaryMin || j.salaryMax);
  const allMins = withSalary.map((j) => j.salaryMin).filter(Boolean) as number[];
  const allMaxs = withSalary.map((j) => j.salaryMax).filter(Boolean) as number[];
  const allMids = withSalary.map((j) => {
    const lo = j.salaryMin ?? j.salaryMax ?? 0;
    const hi = j.salaryMax ?? j.salaryMin ?? 0;
    return (lo + hi) / 2;
  }).filter((v) => v > 0);

  const salaryRange = {
    min: allMins.length ? Math.min(...allMins) : null,
    max: allMaxs.length ? Math.max(...allMaxs) : null,
    avgMid: allMids.length ? Math.round(allMids.reduce((s, v) => s + v, 0) / allMids.length) : null,
    medianMid: allMids.length ? allMids.sort((a, b) => a - b)[Math.floor(allMids.length / 2)] : null,
    count: withSalary.length,
  };

  // Hiring velocity
  const daysAgo = jobs.map((j) => daysSince(j.created)).filter((d) => d >= 0);
  const recentWeek = daysAgo.filter((d) => d <= 7).length;
  const recentMonth = daysAgo.filter((d) => d <= 30).length;
  const oldestDays = daysAgo.length ? Math.max(...daysAgo) : 0;
  const velocity = {
    totalOpenings: jobs.length,
    lastWeek: recentWeek,
    lastMonth: recentMonth,
    oldestPostingDays: oldestDays,
    postsPerWeek: oldestDays > 0 ? Number((jobs.length / (oldestDays / 7)).toFixed(1)) : jobs.length,
  };

  // Location footprint
  const locationMap = new Map<string, { lat: number; lng: number; count: number }>();
  jobs.forEach((j) => {
    const key = j.location.toLowerCase().trim();
    const entry = locationMap.get(key);
    if (entry) {
      entry.count++;
    } else {
      locationMap.set(key, { lat: j.lat, lng: j.lng, count: 1 });
    }
  });
  const locations = Array.from(locationMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count);

  // Role diversity
  const roleMap = new Map<string, string[]>();
  jobs.forEach((j) => {
    const cat = categorizeRole(j.title);
    const arr = roleMap.get(cat) ?? [];
    arr.push(j.title);
    roleMap.set(cat, arr);
  });
  const roles = Array.from(roleMap.entries())
    .map(([category, titles]) => ({ category, count: titles.length, titles: [...new Set(titles)] }))
    .sort((a, b) => b.count - a.count);

  // Recruiter vs direct
  const recruiterJobs = jobs.filter((j) => isRecruiterSource(j.via, j.company));
  const recruiterRatio = {
    recruiter: recruiterJobs.length,
    direct: jobs.length - recruiterJobs.length,
    pct: jobs.length ? Math.round((recruiterJobs.length / jobs.length) * 100) : 0,
  };

  // Schedule mix
  const scheduleMap = new Map<string, number>();
  jobs.forEach((j) => {
    const key = j.scheduleType || j.contractTime || "unspecified";
    scheduleMap.set(key, (scheduleMap.get(key) ?? 0) + 1);
  });
  const schedules = Array.from(scheduleMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Source breakdown
  const sourceMap = new Map<string, number>();
  jobs.forEach((j) => { sourceMap.set(j.source, (sourceMap.get(j.source) ?? 0) + 1); });
  const sources = Array.from(sourceMap.entries())
    .map(([src, count]) => ({ source: src, count }))
    .sort((a, b) => b.count - a.count);

  return { salaryRange, velocity, locations, roles, recruiterRatio, schedules, sources };
}

/* ── Federal Research types ── */
interface FederalData {
  ein: string | null;
  name: string | null;
  isPublic: boolean;
  employeeCount: number | null;
  industry: string | null;
  secData: { ticker?: string; cik?: string; companyName?: string; isPublic: boolean; sicDescription?: string; stateOfIncorporation?: string } | null;
  oshaData: { summary: { inspectionCount: number; totalViolations: number; totalPenalties: number; latestInspection: string | null }; inspections: Array<{ establishmentName: string | null; openDate: string | null; violations: number | null; totalPenalty: number | null; city: string | null; state: string | null }> } | null;
  form5500Data: { summary: { planCount: number; estimatedEmployees: number | null }; filings: Array<{ planName: string | null; planYear: string | null; participantCount: number | null; totalAssets: number | null }> } | null;
  sosData: { legalName: string | null; status: string | null; companyType: string | null; incorporationDate: string | null; officers: Array<{ name: string; position: string }> } | null;
  _sources: Record<string, string>;
}

/* ── Component ── */
export function CompanyDeepDive({ companyName, jobs }: CompanyDeepDiveProps) {
  const [tab, setTab] = useState("overview");

  const analytics = useMemo(() => computeAnalytics(jobs), [jobs]);

  // Federal records lookup
  const { data: federal, isLoading: federalLoading, refetch: refetchFederal } = useQuery<FederalData>({
    queryKey: ["company-deep-dive-federal", companyName],
    queryFn: async () => {
      const res = await fetch("/api/company-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, ein: null }),
      });
      if (!res.ok) throw new Error("Research failed");
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  const { salaryRange, velocity, locations, roles, recruiterRatio, schedules, sources } = analytics;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{companyName}</h2>
          <p className="text-sm text-muted-foreground">
            {jobs.length} open position{jobs.length !== 1 ? "s" : ""} in your search
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="federal">Federal Records</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Briefcase className="h-3.5 w-3.5" /> Open Roles
                </div>
                <p className="text-2xl font-bold">{velocity.totalOpenings}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {velocity.lastWeek} posted this week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" /> Salary Range
                </div>
                {salaryRange.min || salaryRange.max ? (
                  <>
                    <p className="text-2xl font-bold">
                      {salaryRange.min ? formatSalary(salaryRange.min) : "?"}–{salaryRange.max ? formatSalary(salaryRange.max) : "?"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      across {salaryRange.count} listing{salaryRange.count !== 1 ? "s" : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No salary data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <MapPin className="h-3.5 w-3.5" /> Locations
                </div>
                <p className="text-2xl font-bold">{locations.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  unique location{locations.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Velocity
                </div>
                <p className="text-2xl font-bold">{velocity.postsPerWeek}<span className="text-sm font-normal">/wk</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  avg posting rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recruiter vs Direct */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Recruiter vs Direct Postings</span>
                <span className="text-xs text-muted-foreground">{recruiterRatio.pct}% via recruiter</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                {recruiterRatio.direct > 0 && (
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${100 - recruiterRatio.pct}%` }}
                  />
                )}
                {recruiterRatio.recruiter > 0 && (
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${recruiterRatio.pct}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Direct ({recruiterRatio.direct})
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Recruiter ({recruiterRatio.recruiter})
                </span>
              </div>
              {recruiterRatio.pct > 60 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  High recruiter usage may signal urgent hiring or limited HR capacity
                </p>
              )}
            </CardContent>
          </Card>

          {/* Role breakdown mini */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <span className="text-sm font-medium">Top Hiring Areas</span>
              <div className="mt-2 space-y-1.5">
                {roles.slice(0, 5).map((r) => (
                  <div key={r.category} className="flex items-center gap-2">
                    <span className="text-xs w-28 truncate text-muted-foreground">{r.category}</span>
                    <Progress value={(r.count / jobs.length) * 100} className="flex-1 h-2" />
                    <span className="text-xs font-mono w-8 text-right">{r.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Source breakdown */}
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <Badge key={s.source} variant="outline" className="text-xs capitalize">
                {s.source}: {s.count}
              </Badge>
            ))}
            {schedules.filter((s) => s.type !== "unspecified").map((s) => (
              <Badge key={s.type} variant="secondary" className="text-xs capitalize">
                {s.type.replace(/_/g, " ")}: {s.count}
              </Badge>
            ))}
          </div>
        </TabsContent>

        {/* ── Salary Intelligence ── */}
        <TabsContent value="salary" className="mt-4 space-y-4">
          {salaryRange.count === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No salary data available for {companyName} listings</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Aggregate stats */}
              <div className="grid gap-3 sm:grid-cols-4">
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Lowest</p>
                    <p className="text-xl font-bold text-red-500">{salaryRange.min ? formatSalary(salaryRange.min) : "—"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Median</p>
                    <p className="text-xl font-bold">{salaryRange.medianMid ? formatSalary(salaryRange.medianMid) : "—"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Average</p>
                    <p className="text-xl font-bold">{salaryRange.avgMid ? formatSalary(salaryRange.avgMid) : "—"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Highest</p>
                    <p className="text-xl font-bold text-emerald-500">{salaryRange.max ? formatSalary(salaryRange.max) : "—"}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-listing salary table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Salary by Listing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {jobs
                      .filter((j) => j.salaryMin || j.salaryMax)
                      .sort((a, b) => (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0))
                      .map((j) => (
                        <div key={j.id} className="flex items-center justify-between rounded-lg border p-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{j.title}</p>
                            <p className="text-xs text-muted-foreground">{j.location}</p>
                          </div>
                          <span className="text-sm font-mono font-medium shrink-0 ml-3">
                            {j.salaryMin ? formatSalary(j.salaryMin) : "?"}
                            {j.salaryMin && j.salaryMax ? "–" : ""}
                            {j.salaryMax ? formatSalary(j.salaryMax) : ""}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Roles ── */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          {roles.map((r) => (
            <Card key={r.category}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{r.category}</span>
                  <Badge variant="secondary" className="text-xs">{r.count}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.titles.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Locations ── */}
        <TabsContent value="locations" className="mt-4 space-y-4">
          {locations.map((loc) => (
            <div key={loc.name} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium capitalize truncate">{loc.name}</span>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {loc.count} role{loc.count !== 1 ? "s" : ""}
              </Badge>
            </div>
          ))}
        </TabsContent>

        {/* ── Federal Records ── */}
        <TabsContent value="federal" className="mt-4 space-y-4">
          {federalLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
              <Skeleton className="h-40" />
            </div>
          ) : federal ? (
            <div className="space-y-4">
              {/* Source badges */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(federal._sources ?? {}).map(([src, status]) => (
                    <Badge
                      key={src}
                      className={`text-xs ${
                        status === "found"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {src.toUpperCase()} {status === "found" ? "✓" : status === "error" ? "✗" : "—"}
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchFederal()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                </Button>
              </div>

              {/* Overview cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Globe className="h-3.5 w-3.5" /> Company Type
                    </div>
                    {federal.isPublic ? (
                      <Badge className="bg-blue-100 text-blue-700">Public</Badge>
                    ) : (
                      <Badge variant="outline">Private</Badge>
                    )}
                    {federal.secData?.ticker && (
                      <span className="font-mono font-bold ml-2">${federal.secData.ticker}</span>
                    )}
                    {federal.industry && (
                      <p className="text-xs text-muted-foreground mt-1">{federal.industry}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Users className="h-3.5 w-3.5" /> Employees
                    </div>
                    <p className="text-xl font-bold">
                      {federal.employeeCount ? federal.employeeCount.toLocaleString() : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">from benefit plan data</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Shield className="h-3.5 w-3.5" /> Safety
                    </div>
                    {federal.oshaData?.summary ? (
                      <>
                        <p className="text-xl font-bold">{federal.oshaData.summary.totalViolations} <span className="text-xs font-normal">violations</span></p>
                        <p className="text-xs text-muted-foreground">
                          {federal.oshaData.summary.inspectionCount} inspections
                          {federal.oshaData.summary.totalPenalties > 0 && ` • $${federal.oshaData.summary.totalPenalties.toLocaleString()}`}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No OSHA data</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* OSHA details */}
              {federal.oshaData && federal.oshaData.inspections.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4" /> OSHA Inspections
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {federal.oshaData.inspections.map((insp, i) => (
                        <div key={i} className="rounded-lg border p-2.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{insp.establishmentName || "Inspection"}</span>
                            {insp.openDate && <span className="text-xs text-muted-foreground">{insp.openDate}</span>}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                            {insp.city && insp.state && <span>{insp.city}, {insp.state}</span>}
                            {insp.violations != null && insp.violations > 0 && (
                              <span className="text-amber-600 flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> {insp.violations} violations
                              </span>
                            )}
                            {insp.totalPenalty != null && insp.totalPenalty > 0 && (
                              <span className="text-red-600">${insp.totalPenalty.toLocaleString()}</span>
                            )}
                            {(!insp.violations || insp.violations === 0) && (
                              <span className="text-emerald-600 flex items-center gap-0.5">
                                <CheckCircle2 className="h-3 w-3" /> Clean
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* DOL Form 5500 */}
              {federal.form5500Data && federal.form5500Data.filings.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" /> DOL Employee Benefit Plans
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {federal.form5500Data.filings.map((f, i) => (
                        <div key={i} className="rounded-lg border p-2.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{f.planName || "Unnamed Plan"}</span>
                            {f.planYear && <Badge variant="outline" className="text-xs">{f.planYear}</Badge>}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                            {f.participantCount != null && <span>{f.participantCount.toLocaleString()} participants</span>}
                            {f.totalAssets != null && <span>${Number(f.totalAssets).toLocaleString()} assets</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SOS / Corporate structure */}
              {federal.sosData && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Corporate Registration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm">
                      {federal.sosData.legalName && (
                        <div>
                          <span className="text-muted-foreground">Legal Name</span>
                          <p className="font-medium">{federal.sosData.legalName}</p>
                        </div>
                      )}
                      {federal.sosData.status && (
                        <div>
                          <span className="text-muted-foreground">Status</span>
                          <p className="font-medium flex items-center gap-1">
                            {federal.sosData.status.toLowerCase().includes("active") ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            )}
                            {federal.sosData.status}
                          </p>
                        </div>
                      )}
                      {federal.sosData.companyType && (
                        <div>
                          <span className="text-muted-foreground">Entity Type</span>
                          <p className="font-medium">{federal.sosData.companyType}</p>
                        </div>
                      )}
                      {federal.sosData.incorporationDate && (
                        <div>
                          <span className="text-muted-foreground">Incorporated</span>
                          <p className="font-medium">{federal.sosData.incorporationDate}</p>
                        </div>
                      )}
                    </div>
                    {federal.sosData.officers.length > 0 && (
                      <>
                        <Separator className="my-3" />
                        <p className="text-sm font-medium mb-2">Officers & Directors</p>
                        <div className="space-y-1.5">
                          {federal.sosData.officers.map((o, i) => (
                            <div key={i} className="flex items-center justify-between text-sm rounded-lg border p-2">
                              <span className="font-medium">{o.name}</span>
                              <span className="text-xs text-muted-foreground">{o.position}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* No federal data at all */}
              {!federal.oshaData && !federal.form5500Data && !federal.secData && !federal.sosData && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <XCircle className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">
                      No public records found for &quot;{companyName}&quot;. The company may use a different legal name in filings.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground mb-3">
                  Federal records not yet loaded
                </p>
                <Button size="sm" variant="outline" onClick={() => refetchFederal()}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Fetch Records
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Monitor,
  Briefcase,
  ChevronRight,
  Clock,
  ArrowUpRight,
  GraduationCap,
  Shield,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { differenceInMonths } from "date-fns";

interface WorkHistoryItem {
  id: string;
  type: string; // "job" | "school" | "military" | "volunteer"
  company: string;
  title: string | null;
  address: string;
  startDate: string | null;
  endDate: string | null;
  workMode: string | null;
  scheduleType: string | null;
  department: string | null;
  salaryAmount: number | null;
  salaryCurrency: string | null;
  salaryType: string | null;
  degree: string | null;
  major: string | null;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  remote: Monitor,
  "on-site": MapPin,
  onsite: MapPin,
  hybrid: Building2,
};

const ENTRY_TYPE_ICON: Record<string, React.ElementType> = {
  job: Briefcase,
  school: GraduationCap,
  military: Shield,
  volunteer: Heart,
};

function parseYearMonth(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // Handle "YYYY-MM" format
  const [y, m] = dateStr.split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, 1);
}

function formatYearMonth(dateStr: string | null): string {
  const d = parseYearMonth(dateStr);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDuration(startDate: string | null, endDate: string | null): string {
  const start = parseYearMonth(startDate);
  if (!start) return "";
  const end = endDate ? parseYearMonth(endDate) : new Date();
  if (!end) return "";
  const months = differenceInMonths(end, start);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years > 0 && rem > 0) return `${years}y ${rem}mo`;
  if (years > 0) return `${years}y`;
  return `${Math.max(rem, 1)}mo`;
}

export default function ExperiencePage() {
  const { data: items = [], isLoading } = useQuery<WorkHistoryItem[]>({
    queryKey: ["work-history"],
    queryFn: async () => {
      const res = await fetch("/api/work-history");
      if (!res.ok) throw new Error("Failed to fetch work history");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const active = items.filter((p) => !p.endDate);
  const past = items.filter((p) => !!p.endDate);

  const totalYears = (() => {
    const months = items.reduce((sum, p) => {
      const start = parseYearMonth(p.startDate);
      if (!start) return sum;
      const end = p.endDate ? parseYearMonth(p.endDate) : new Date();
      if (!end) return sum;
      return sum + differenceInMonths(end, start);
    }, 0);
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y > 0 && m > 0) return `${y}y ${m}mo`;
    if (y > 0) return `${y}y`;
    return `${m || 0}mo`;
  })();

  const uniqueCompanies = new Set(items.map((p) => p.company)).size;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Experience</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your complete work history — {items.length} position{items.length !== 1 ? "s" : ""} across {uniqueCompanies} company{uniqueCompanies !== 1 ? "ies" : ""}
          </p>
        </div>
        <Link href="/experience/verify">
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
            <ShieldCheck className="h-4 w-4" />
            Verify Employment
          </Button>
        </Link>
      </div>

      {/* Summary Stats */}
      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
                <Briefcase className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{items.length}</p>
                <p className="text-xs text-muted-foreground">Total Positions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{uniqueCompanies}</p>
                <p className="text-xs text-muted-foreground">Companies</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalYears}</p>
                <p className="text-xs text-muted-foreground">Total Experience</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Positions */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Current
          </h2>
          {active.map((pos) => (
            <PositionCard key={pos.id} item={pos} />
          ))}
        </div>
      )}

      {/* Separator */}
      {active.length > 0 && past.length > 0 && <Separator />}

      {/* Past Positions */}
      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Previous
          </h2>
          {past.map((pos) => (
            <PositionCard key={pos.id} item={pos} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
              <Briefcase className="h-8 w-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold">No Experience Yet</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Add your current role or import W-2s to build your work history.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PositionCard({ item: pos }: { item: WorkHistoryItem }) {
  const isActive = !pos.endDate;
  const workMode = pos.workMode || "on-site";
  const TypeIcon = TYPE_ICON[workMode] || MapPin;
  const EntryIcon = ENTRY_TYPE_ICON[pos.type] || Briefcase;
  const duration = formatDuration(pos.startDate, pos.endDate);
  const displayTitle = pos.type === "school"
    ? (pos.degree ? `${pos.degree} — ${pos.major || pos.company}` : pos.title || pos.company)
    : (pos.title || pos.company);
  // Link to detail page
  const detailId = pos.id;

  return (
    <Link href={`/experience/${detailId}`}>
      <Card className="group hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Company + Info */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Company Initials */}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm ${
                isActive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {pos.company.slice(0, 2).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                {/* Title Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{displayTitle}</h3>
                  {isActive && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs">
                      Active
                    </Badge>
                  )}
                  {pos.type !== "job" && (
                    <Badge variant="outline" className="text-xs capitalize gap-1">
                      <EntryIcon className="h-3 w-3" />
                      {pos.type}
                    </Badge>
                  )}
                </div>

                {/* Company + Meta */}
                <p className="text-sm text-muted-foreground mt-0.5">
                  {pos.company}
                  {pos.department && ` · ${pos.department}`}
                </p>

                {/* Date + Location Row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
                  {pos.startDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatYearMonth(pos.startDate)}
                      {" — "}
                      {pos.endDate ? formatYearMonth(pos.endDate) : "Present"}
                      {duration && <span className="text-muted-foreground/60">({duration})</span>}
                    </span>
                  )}
                  {pos.address && pos.address !== "N/A" && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {pos.address.length > 40 ? pos.address.slice(0, 37) + "…" : pos.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1 capitalize">
                    <TypeIcon className="h-3 w-3" />
                    {workMode}
                  </span>
                  {pos.salaryAmount && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {pos.salaryCurrency || "USD"} {pos.salaryAmount.toLocaleString()}
                      {pos.salaryType === "hourly" ? "/hr" : "/yr"}
                    </span>
                  )}
                  {pos.scheduleType && (
                    <span className="capitalize">{pos.scheduleType}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Arrow */}
            <div className="shrink-0 mt-3">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

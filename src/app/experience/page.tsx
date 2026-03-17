"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { format, formatDistanceToNow, differenceInMonths } from "date-fns";

interface Position {
  id: string;
  company: string;
  role: string;
  department: string | null;
  location: string | null;
  type: string;
  startDate: string;
  endDate: string | null;
  salary: number | null;
  currency: string;
  payRate: string | null;
  payType: string;
  isActive: boolean;
  industry: string | null;
  techStack: string | null;
  focus: string | null;
  schedule: string | null;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  remote: Monitor,
  hybrid: Building2,
  onsite: MapPin,
};

function formatDuration(startDate: string, endDate: string | null): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const months = differenceInMonths(end, start);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years > 0 && rem > 0) return `${years}y ${rem}mo`;
  if (years > 0) return `${years}y`;
  return `${rem || 1}mo`;
}

export default function ExperiencePage() {
  const { data: positions = [], isLoading } = useQuery<Position[]>({
    queryKey: ["current-position"],
    queryFn: async () => {
      const res = await fetch("/api/current-position");
      if (!res.ok) throw new Error("Failed to fetch positions");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const active = positions.filter((p) => p.isActive);
  const past = positions.filter((p) => !p.isActive);

  const totalYears = (() => {
    const months = positions.reduce((sum, p) => {
      const start = new Date(p.startDate);
      const end = p.endDate ? new Date(p.endDate) : new Date();
      return sum + differenceInMonths(end, start);
    }, 0);
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y > 0 && m > 0) return `${y}y ${m}mo`;
    if (y > 0) return `${y}y`;
    return `${m || 0}mo`;
  })();

  const uniqueCompanies = new Set(positions.map((p) => p.company)).size;

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
      <div>
        <h1 className="text-2xl font-bold">Experience</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your complete work history — {positions.length} position{positions.length !== 1 ? "s" : ""} across {uniqueCompanies} company{uniqueCompanies !== 1 ? "ies" : ""}
        </p>
      </div>

      {/* Summary Stats */}
      {positions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
                <Briefcase className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{positions.length}</p>
                <p className="text-xs text-muted-foreground">Total Positions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <Building2 className="h-5 w-5 text-blue-600" />
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
            <PositionCard key={pos.id} position={pos} />
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
            <PositionCard key={pos.id} position={pos} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {positions.length === 0 && (
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

function PositionCard({ position: pos }: { position: Position }) {
  const TypeIcon = TYPE_ICON[pos.type] || Monitor;
  const techItems = pos.techStack?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const duration = formatDuration(pos.startDate, pos.endDate);

  return (
    <Link href={`/experience/${pos.id}`}>
      <Card className="group hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Company + Info */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Company Initials */}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm ${
                pos.isActive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {pos.company.slice(0, 2).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                {/* Title Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{pos.role}</h3>
                  {pos.isActive && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs">
                      Active
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
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(pos.startDate), "MMM yyyy")}
                    {" — "}
                    {pos.endDate ? format(new Date(pos.endDate), "MMM yyyy") : "Present"}
                    <span className="text-muted-foreground/60">({duration})</span>
                  </span>
                  {pos.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {pos.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1 capitalize">
                    <TypeIcon className="h-3 w-3" />
                    {pos.type}
                  </span>
                  {(pos.salary || pos.payRate) && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {pos.salary
                        ? `${pos.currency} ${pos.salary.toLocaleString()}/yr`
                        : `${pos.payRate} ${pos.payType}`}
                    </span>
                  )}
                </div>

                {/* Focus preview */}
                {pos.focus && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                    {pos.focus}
                  </p>
                )}

                {/* Tech badges */}
                {techItems.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {techItems.slice(0, 5).map((tech) => (
                      <Badge key={tech} variant="secondary" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                    {techItems.length > 5 && (
                      <Badge variant="secondary" className="text-xs">
                        +{techItems.length - 5}
                      </Badge>
                    )}
                  </div>
                )}
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

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  DollarSign,
  Building2,
  Clock,
  Star,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  ExternalLink,
  Filter,
  X,
} from "lucide-react";

interface JobPosting {
  id: string;
  slug: string;
  company: string;
  role: string;
  department: string | null;
  location: string | null;
  type: string;
  employmentType: string;
  experienceLevel: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  payFrequency: string;
  description: string;
  requirements: string | null;
  benefits: string | null;
  techStack: string | null;
  applicationUrl: string | null;
  isFeatured: boolean;
  createdAt: string;
  user?: { name: string | null };
}

const TYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};
const LEVEL_LABELS: Record<string, string> = {
  entry: "Entry Level",
  mid: "Mid Level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive",
};
const FREQ_SHORT: Record<string, string> = { hourly: "/hr", yearly: "/yr" };

function fmtSalary(min: number | null, max: number | null, currency: string, freq: string) {
  const f = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  if (min && max) return `${f(min)} – ${f(max)}${FREQ_SHORT[freq] ?? ""}`;
  if (min) return `From ${f(min)}${FREQ_SHORT[freq] ?? ""}`;
  if (max) return `Up to ${f(max)}${FREQ_SHORT[freq] ?? ""}`;
  return null;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function JobBoardPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [employment, setEmployment] = useState("");
  const [page, setPage] = useState(1);
  const limit = 12;

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (type) params.set("type", type);
  if (level) params.set("level", level);
  if (employment) params.set("employment", employment);
  params.set("page", String(page));
  params.set("limit", String(limit));

  const { data, isLoading } = useQuery<{
    postings: JobPosting[];
    total: number;
    page: number;
    pages: number;
  }>({
    queryKey: ["job-board", search, type, level, employment, page],
    queryFn: () => fetch(`/api/job-board?${params}`).then((r) => r.json()),
  });

  const postings = data?.postings ?? [];
  const pages = data?.pages ?? 1;
  const total = data?.total ?? 0;
  const hasFilters = !!(type || level || employment);

  function clearFilters() {
    setType("");
    setLevel("");
    setEmployment("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 p-6 text-white shadow-lg">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAxNXY2aC02VjE5aDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Job Board</h1>
              <p className="text-sm text-white/80">
                Browse {total > 0 ? `${total} open` : ""} positions from companies in the network
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles, companies, locations, skills..."
            className="pl-9 h-11"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={type} onValueChange={(v) => { setType(v ?? ""); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Work Type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={level} onValueChange={(v) => { setLevel(v ?? ""); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={employment} onValueChange={(v) => { setEmployment(v ?? ""); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Employment" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5"><div className="h-40 bg-muted rounded-lg" /></CardContent>
            </Card>
          ))}
        </div>
      ) : postings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold mb-1">No jobs found</h3>
            <p className="text-sm text-muted-foreground">
              Try broadening your search or clearing filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {postings.map((p) => {
            const salary = fmtSalary(p.salaryMin, p.salaryMax, p.currency, p.payFrequency);
            const tech = p.techStack?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];

            return (
              <Card
                key={p.id}
                className={`group hover:shadow-lg transition-shadow ${
                  p.isFeatured ? "ring-1 ring-amber-300 dark:ring-amber-700" : ""
                }`}
              >
                <CardContent className="p-5 flex flex-col h-full">
                  {/* Featured badge */}
                  {p.isFeatured && (
                    <div className="flex justify-end -mt-1 -mr-1 mb-2">
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px]">
                        <Star className="h-2.5 w-2.5 mr-0.5" /> Featured
                      </Badge>
                    </div>
                  )}

                  {/* Company & Role */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40">
                      <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{p.role}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.company}{p.department ? ` · ${p.department}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {p.location && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <MapPin className="h-2.5 w-2.5" /> {p.location}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {TYPE_LABELS[p.type] ?? p.type}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {EMPLOYMENT_LABELS[p.employmentType] ?? p.employmentType}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {LEVEL_LABELS[p.experienceLevel] ?? p.experienceLevel}
                    </Badge>
                  </div>

                  {/* Salary */}
                  {salary && (
                    <div className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-3">
                      <DollarSign className="h-3.5 w-3.5" /> {salary}
                    </div>
                  )}

                  {/* Description excerpt */}
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-3 flex-1">
                    {p.description}
                  </p>

                  {/* Tech stack */}
                  {tech.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tech.slice(0, 5).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          {t}
                        </span>
                      ))}
                      {tech.length > 5 && (
                        <span className="text-[9px] px-1.5 py-0.5 text-muted-foreground">+{tech.length - 5}</span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" /> {timeAgo(p.createdAt)}
                    </span>
                    {p.applicationUrl ? (
                      <a
                        href={p.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" className="h-7 text-xs gap-1">
                          Apply <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    ) : (
                      <a href={`/jobs/${p.slug}`}>
                        <Button size="sm" variant="secondary" className="h-7 text-xs">
                          View Details
                        </Button>
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  MapPin,
  Loader2,
  ExternalLink,
  Plus,
  Briefcase,
  X,
  DollarSign,
  Navigation,
  ArrowUpDown,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Car,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import dynamic from "next/dynamic";

/* ── Types ── */
interface MapJob {
  id: string;
  title: string;
  company: string;
  location: string;
  area: string[];
  lat: number;
  lng: number;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPredicted: boolean;
  contractTime: string | null;
  contractType: string | null;
  created: string;
  category: string;
  description: string;
  source: "adzuna" | "google";
}

interface SearchResponse {
  jobs: MapJob[];
  total: number;
  mean: number | null;
  page: number;
  hasMore: boolean;
}

/* ── Dynamically loaded map (Leaflet needs browser) ── */
const LeafletMap = dynamic(
  () => import("@/components/job-map-leaflet"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading map...
      </div>
    ),
  }
);

/* ── Constants ── */
const RADIUS_OPTIONS = [
  { value: "10", label: "10 mi" },
  { value: "25", label: "25 mi" },
  { value: "50", label: "50 mi" },
  { value: "100", label: "100 mi" },
];

const SORT_OPTIONS = [
  { value: "salary-desc", label: "Salary: High → Low" },
  { value: "salary-asc", label: "Salary: Low → High" },
  { value: "date", label: "Newest first" },
  { value: "company", label: "Company A → Z" },
];

const SOURCE_OPTIONS = [
  { value: "both", label: "All Sources" },
  { value: "adzuna", label: "Adzuna" },
  { value: "google", label: "Google Jobs" },
];

const PAGE_SIZE = 30;

const DEFAULT_CENTER: [number, number] = [39.87, -75.38]; // Eddystone, PA area

function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

/* ── Component ── */
export function JobMap() {
  const [query, setQuery] = useState("");
  const [where, setWhere] = useState("");
  const [radius, setRadius] = useState("25");
  const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchParams, setSearchParams] = useState<{ q: string; where: string; distance: string } | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("salary-desc");
  const [minSalary, setMinSalary] = useState("");
  const [page, setPage] = useState(1);
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null);
  const [source, setSource] = useState<"adzuna" | "google" | "both">("both");
  const [commuteInfo, setCommuteInfo] = useState<{ durationMin: number; distanceMi: number; geometry: [number, number][] } | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user profile for default location
  const { data: profile } = useQuery<{ city?: string; state?: string }>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Set default location from profile
  useEffect(() => {
    if (profile && !where) {
      const loc = [profile.city, profile.state].filter(Boolean).join(", ");
      if (loc) setWhere(loc);
    }
  }, [profile, where]);

  // Adzuna search query
  const { data: adzunaData, isFetching: adzunaFetching } = useQuery<SearchResponse>({
    queryKey: ["adzuna-map", searchParams],
    queryFn: async () => {
      if (!searchParams) return { jobs: [], total: 0, mean: null, page: 1, hasMore: false };
      const params = new URLSearchParams({
        q: searchParams.q,
        where: searchParams.where,
        distance: searchParams.distance,
      });
      const res = await fetch(`/api/adzuna?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Search failed");
      }
      const d = await res.json();
      return { ...d, jobs: d.jobs.map((j: MapJob) => ({ ...j, source: "adzuna" as const })) };
    },
    enabled: !!searchParams && source !== "google",
  });

  // Google Jobs query — SerpAPI + batch geocode
  const { data: googleData, isFetching: googleFetching } = useQuery<{ jobs: MapJob[]; total: number }>({
    queryKey: ["google-map", searchParams],
    queryFn: async () => {
      if (!searchParams) return { jobs: [], total: 0 };
      const params = new URLSearchParams({
        q: searchParams.q,
        location: searchParams.where,
      });
      const res = await fetch(`/api/job-search?${params}`);
      if (!res.ok) throw new Error("Google Jobs search failed");
      const data = await res.json();
      const rawJobs: Array<{
        jobId: string; title: string; company: string; location: string;
        description: string; applyLinks: { title: string; link: string }[];
        detectedExtensions: Record<string, unknown>;
      }> = data.jobs ?? [];
      if (rawJobs.length === 0) return { jobs: [], total: 0 };

      // Batch geocode unique locations
      const uniqueLocs = [...new Set(rawJobs.map((j) => j.location).filter(Boolean))];
      let geoResults: Record<string, { lat: number; lng: number }> = {};
      try {
        const geoRes = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locations: uniqueLocs }),
        });
        const geoData = await geoRes.json();
        geoResults = geoData.results ?? {};
      } catch { /* geocoding failed silently */ }

      const jobs: MapJob[] = rawJobs.map((j) => {
        const geo = geoResults[j.location];
        const ext = j.detectedExtensions ?? {};
        const salaryStr = ext.salary as string | undefined;
        let salaryMin: number | null = null;
        let salaryMax: number | null = null;
        if (salaryStr) {
          const nums = salaryStr.match(/[\d,]+/g)?.map((s) => Number(s.replace(/,/g, ""))) ?? [];
          if (nums.length >= 2) { salaryMin = nums[0]; salaryMax = nums[1]; }
          else if (nums.length === 1) { salaryMin = nums[0]; }
        }
        return {
          id: `google-${j.jobId}`,
          title: j.title,
          company: j.company,
          location: j.location,
          area: [],
          lat: geo?.lat ?? 0,
          lng: geo?.lng ?? 0,
          url: j.applyLinks?.[0]?.link || "",
          salaryMin,
          salaryMax,
          salaryPredicted: false,
          contractTime: null,
          contractType: null,
          created: new Date().toISOString(),
          category: "",
          description: j.description?.slice(0, 300) || "",
          source: "google" as const,
        };
      });

      return { jobs, total: rawJobs.length };
    },
    enabled: !!searchParams && source !== "adzuna",
  });

  // Merge results from both sources
  const isFetching = adzunaFetching || googleFetching;
  const mergedJobs = useMemo(() => {
    const a = (source !== "google" ? adzunaData?.jobs : []) ?? [];
    const g = (source !== "adzuna" ? googleData?.jobs : []) ?? [];
    return [...a, ...g];
  }, [adzunaData, googleData, source]);
  const totalCount = (source !== "google" ? adzunaData?.total ?? 0 : 0) + (source !== "adzuna" ? googleData?.total ?? 0 : 0);
  const meanSalary = adzunaData?.mean ?? null;

  const geoJobs = useMemo(() => mergedJobs.filter((j) => j.lat && j.lng), [mergedJobs]);

  // Sort & filter
  const sortedJobs = useMemo(() => {
    let filtered = geoJobs;
    const minSal = Number(minSalary);
    if (minSal > 0) {
      filtered = filtered.filter(
        (j) => (j.salaryMax ?? j.salaryMin ?? 0) >= minSal
      );
    }
    const sorted = [...filtered];
    switch (sortBy) {
      case "salary-desc":
        sorted.sort(
          (a, b) =>
            (b.salaryMax ?? b.salaryMin ?? 0) -
            (a.salaryMax ?? a.salaryMin ?? 0)
        );
        break;
      case "salary-asc":
        sorted.sort(
          (a, b) =>
            (a.salaryMax ?? a.salaryMin ?? 0) -
            (b.salaryMax ?? b.salaryMin ?? 0)
        );
        break;
      case "date":
        sorted.sort(
          (a, b) =>
            new Date(b.created).getTime() - new Date(a.created).getTime()
        );
        break;
      case "company":
        sorted.sort((a, b) => a.company.localeCompare(b.company));
        break;
    }
    return sorted;
  }, [geoJobs, sortBy, minSalary]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE));
  const pagedJobs = useMemo(
    () => sortedJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedJobs, page]
  );

  // Reset page on new search or filter change
  useEffect(() => {
    setPage(1);
  }, [searchParams, sortBy, minSalary]);

  // Geocode the search location to get lat/lng for the radius ring
  useEffect(() => {
    if (!searchParams?.where) {
      setSearchCenter(null);
      return;
    }
    const encoded = encodeURIComponent(searchParams.where);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`)
      .then((r) => r.json())
      .then((results: { lat: string; lon: string }[]) => {
        if (results.length > 0) {
          setSearchCenter([parseFloat(results[0].lat), parseFloat(results[0].lon)]);
        }
      })
      .catch(() => {
        // Silent fail — radius ring just won't show
      });
  }, [searchParams?.where]);

  // Fetch commute estimate when a job is selected
  useEffect(() => {
    setCommuteInfo(null);
    if (!selectedJob || !searchCenter) return;
    setCommuteLoading(true);
    const params = new URLSearchParams({
      fromLat: String(searchCenter[0]),
      fromLng: String(searchCenter[1]),
      toLat: String(selectedJob.lat),
      toLng: String(selectedJob.lng),
    });
    fetch(`/api/commute?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCommuteInfo(d); })
      .catch(() => {})
      .finally(() => setCommuteLoading(false));
  }, [selectedJob, searchCenter]);

  // Track job as application
  const trackMutation = useMutation({
    mutationFn: async (job: MapJob) => {
      const body: Record<string, unknown> = {
        company: job.company,
        role: job.title,
        location: job.location,
        url: job.url || null,
        status: "wishlist",
        notes: `Found via ${job.source === "google" ? "Google Jobs" : "Adzuna"} Job Map\n\n${job.description}...`,
      };
      if (job.salaryMin) body.salaryMin = job.salaryMin;
      if (job.salaryMax) body.salaryMax = job.salaryMax;
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to track");
      return res.json();
    },
    onSuccess: (_d, job) => {
      setTrackedIds((p) => new Set(p).add(job.id));
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success(`Tracking ${job.title} at ${job.company}`);
    },
    onError: () => toast.error("Failed to save application"),
  });

  const doSearch = useCallback(() => {
    if (!where.trim()) {
      toast.error("Enter a location to search");
      return;
    }
    setSearchParams({ q: query.trim(), where: where.trim(), distance: radius });
    setSearched(true);
    setSelectedJob(null);
    setPage(1);
  }, [query, where, radius]);

  // "Search this area" — reverse-geocode the map center and re-search
  const handleSearchArea = useCallback(
    async (center: [number, number]) => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${center[0]}&lon=${center[1]}`
        );
        const data = await res.json();
        const city =
          data.address?.city ||
          data.address?.town ||
          data.address?.county ||
          "Area";
        const state = data.address?.state || "";
        const loc = state ? `${city}, ${state}` : city;
        setWhere(loc);
        setSearchCenter(center);
        setSearchParams({ q: query.trim(), where: loc, distance: radius });
        setSelectedJob(null);
        setPage(1);
      } catch {
        toast.error("Could not determine location");
      }
    },
    [query, radius]
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <Card>
        <CardContent className="pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Job title or keywords..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative sm:w-52">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="City, State"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={radius} onValueChange={(v) => setRadius(v ?? "25")}>
              <SelectTrigger className="w-28">
                <Navigation className="h-3.5 w-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => setSource((v ?? "both") as "adzuna" | "google" | "both")}>
              <SelectTrigger className="w-32">
                <Globe className="h-3.5 w-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stats bar + legend */}
      {searched && totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-sm text-muted-foreground">
          <span>{totalCount.toLocaleString()} jobs found</span>
          {sortedJobs.length < geoJobs.length && (
            <span>({sortedJobs.length} matching filter)</span>
          )}
          {meanSalary && (
            <Badge variant="outline" className="gap-1">
              <DollarSign className="h-3 w-3" />
              Avg {formatSalary(meanSalary)}
            </Badge>
          )}
          {/* Salary colour legend */}
          <div className="flex items-center gap-2 ml-auto text-xs">
            <span className="flex items-center gap-1">
              <CircleDot className="h-3 w-3 text-green-500" /> Above avg
            </span>
            <span className="flex items-center gap-1">
              <CircleDot className="h-3 w-3 text-yellow-500" /> Near avg
            </span>
            <span className="flex items-center gap-1">
              <CircleDot className="h-3 w-3 text-red-500" /> Below avg
            </span>
            <span className="flex items-center gap-1">
              <CircleDot className="h-3 w-3 text-blue-500" /> No data
            </span>
          </div>
        </div>
      )}

      {/* Map + sidebar layout */}
      <div className="flex gap-3 h-[600px]">
        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border bg-muted">
          {!searched ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <MapPin className="h-10 w-10 opacity-30" />
              <p className="text-sm">Search for jobs to see them on the map</p>
              {profile?.city && (
                <p className="text-xs">
                  Default location: {profile.city}, {profile.state}
                </p>
              )}
            </div>
          ) : isFetching ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Searching{source === "google" ? " Google Jobs" : source === "adzuna" ? " Adzuna" : ""}...
            </div>
          ) : (
            <LeafletMap
              jobs={geoJobs}
              center={
                geoJobs.length > 0
                  ? [geoJobs[0].lat, geoJobs[0].lng] as [number, number]
                  : DEFAULT_CENTER
              }
              selectedId={selectedJob?.id ?? null}
              onSelect={(job: MapJob) => setSelectedJob(job)}
              meanSalary={meanSalary}
              searchCenter={searchCenter}
              radiusMiles={Number(radius)}
              onSearchArea={handleSearchArea}
              routeGeometry={commuteInfo?.geometry ?? null}
            />
          )}
        </div>

        {/* Sidebar — sort/filter + job list / detail */}
        <div className="w-80 shrink-0 flex flex-col">
          {/* Sort & filter controls */}
          {searched && geoJobs.length > 0 && !selectedJob && (
            <div className="flex gap-1.5 mb-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? "salary-desc")}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <ArrowUpDown className="h-3 w-3 mr-1 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-28">
                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Min salary"
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value.replace(/\D/g, ""))}
                  className="h-8 text-xs pl-6"
                />
              </div>
            </div>
          )}

          {/* Scrollable job list or detail */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {selectedJob ? (
              /* ── Job detail card ── */
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-tight">{selectedJob.title}</h3>
                      <p className="text-sm text-muted-foreground">{selectedJob.company}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => setSelectedJob(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <MapPin className="h-3 w-3" /> {selectedJob.location}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${selectedJob.source === "google" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}
                    >
                      {selectedJob.source === "google" ? "Google" : "Adzuna"}
                    </Badge>
                    {selectedJob.category && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedJob.category}
                      </Badge>
                    )}
                    {selectedJob.contractTime && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {selectedJob.contractTime.replace("_", " ")}
                      </Badge>
                    )}
                  </div>

                  {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium">
                        {selectedJob.salaryMin && formatSalary(selectedJob.salaryMin)}
                        {selectedJob.salaryMin && selectedJob.salaryMax && " – "}
                        {selectedJob.salaryMax && formatSalary(selectedJob.salaryMax)}
                      </span>
                      {selectedJob.salaryPredicted && (
                        <span className="text-xs text-muted-foreground">(estimated)</span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedJob.description}
                  </p>

                  {/* Commute estimate */}
                  {searchCenter && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Car className="h-3.5 w-3.5 text-blue-500" />
                      {commuteLoading ? (
                        <span className="text-xs text-muted-foreground">Calculating commute...</span>
                      ) : commuteInfo ? (
                        <span className="text-xs font-medium">
                          ~{commuteInfo.durationMin} min drive ({commuteInfo.distanceMi} mi)
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Commute unavailable</span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {selectedJob.url && (
                      <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button size="sm" className="w-full gap-1">
                          <ExternalLink className="h-3.5 w-3.5" /> Apply
                        </Button>
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant={trackedIds.has(selectedJob.id) ? "outline" : "secondary"}
                      disabled={trackedIds.has(selectedJob.id)}
                      onClick={() => trackMutation.mutate(selectedJob)}
                      className="gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {trackedIds.has(selectedJob.id) ? "Tracked" : "Track"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* ── Paginated job list ── */
              <>
                {sortedJobs.length === 0 && searched && !isFetching && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No jobs found in this area</p>
                  </div>
                )}
                {pagedJobs.map((job) => (
                  <Card
                    key={job.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedJob(job)}
                  >
                    <CardContent className="py-3 px-3">
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-medium text-sm leading-tight truncate">
                          {job.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1 py-0 shrink-0 ${job.source === "google" ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400" : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"}`}
                        >
                          {job.source === "google" ? "G" : "A"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {job.company}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" /> {job.location}
                        </span>
                        {(job.salaryMin || job.salaryMax) && (
                          <span className="text-xs font-medium text-emerald-600">
                            {job.salaryMin ? formatSalary(job.salaryMin) : ""}
                            {job.salaryMin && job.salaryMax ? "–" : ""}
                            {job.salaryMax ? formatSalary(job.salaryMax) : ""}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>

          {/* Pagination controls */}
          {!selectedJob && sortedJobs.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 border-t mt-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 text-xs"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

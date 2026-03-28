"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
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
  Eye,
  Map as MapIcon,
  List,
  Building2,
  Clock,
  Star,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Trash2,
  Filter,
  Wifi,
  CalendarDays,
  Tag,
  TrainFront,
  Footprints,
  Bike,
  PersonStanding,
  Flame,
  Layers,
  MapPinned,
  Anchor,
  Mail,
  Copy,
  RefreshCw,
  Link2,
  Code,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LifeAnchorsPanel } from "@/components/life-anchors-panel";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  source: "adzuna" | "google" | "email";
  /* Google Jobs enrichment */
  thumbnail?: string | null;
  via?: string;
  applyLinks?: { title: string; link: string }[];
  scheduleType?: string | null;
}

/** Strip basic HTML tags from Adzuna descriptions */
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface SearchResponse {
  jobs: MapJob[];
  total: number;
  mean: number | null;
  page: number;
  hasMore: boolean;
}

/* ── Geocode an override address via the resolve-address API (geocode mode) ── */
async function geocodeOverride(address: string): Promise<{ address: string; lat: number; lng: number; name: string | null; confidence: "high" | "medium" | "low"; totalResults: number } | null> {
  try {
    const params = new URLSearchParams({ address, mode: "geocode" });
    const res = await fetch(`/api/resolve-address?${params}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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
  { value: "life-score", label: "Life Score" },
];

const SOURCE_OPTIONS = [
  { value: "both", label: "All Sources" },
  { value: "adzuna", label: "Adzuna" },
  { value: "google", label: "Google Jobs" },
];

const PAGE_SIZE = 30;

type CommuteMode = "driving" | "transit" | "walking" | "bicycling";
const COMMUTE_MODES: { value: CommuteMode; label: string; icon: typeof Car }[] = [
  { value: "driving", label: "Drive", icon: Car },
  { value: "transit", label: "Transit", icon: TrainFront },
  { value: "walking", label: "Walk", icon: Footprints },
  { value: "bicycling", label: "Bike", icon: Bike },
];

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const DATE_POSTED_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "3days", label: "Past 3 days" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "any", label: "Any type" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "permanent", label: "Permanent" },
];

const HOURS_OPTIONS = [
  { value: "any", label: "Any hours" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
];

const REMOTE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
];

const DEFAULT_CENTER: [number, number] = [39.87, -75.38]; // Eddystone, PA area

const ANCHOR_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

/** 2026 IRS standard mileage rate (business) */
const IRS_MILEAGE_RATE = 0.70;
/** Yearly roundtrip commute cost: distanceMi × 2 (roundtrip) × 250 work days × IRS rate */
function yearlyCommuteCost(distanceMi: number) {
  return distanceMi * 2 * 250 * IRS_MILEAGE_RATE;
}
function formatCost(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

/** Source badge styling + label */
function sourceBadge(src: "adzuna" | "google" | "email") {
  if (src === "google") return { label: "Google", labelLong: "Google Jobs", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  if (src === "email") return { label: "Email", labelLong: "Email Lead", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" };
  return { label: "Adzuna", labelLong: "Adzuna", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
}

/* ── Component ── */
export function JobMap() {
  const [query, setQuery] = useState("");
  const [where, setWhere] = useState("");
  const [radius, setRadius] = useState("25");
  const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchParams, setSearchParams] = useState<{ q: string; where: string; apiWhere: string; distance: string } | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("salary-desc");
  const [minSalary, setMinSalary] = useState("");
  const [page, setPage] = useState(1);
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null);
  const [source, setSource] = useState<"adzuna" | "google" | "both">("both");
  const [commuteInfo, setCommuteInfo] = useState<{ durationMin: number; distanceMi: number; mode?: CommuteMode; estimated?: boolean; geometry?: [number, number][] } | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteMode, setCommuteMode] = useState<CommuteMode>("driving");
  const [showDetails, setShowDetails] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  /* Map overlays */
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [tileStyle, setTileStyle] = useState<"osm" | "google-roadmap" | "google-satellite" | "google-hybrid">("osm");
  /* Filters */
  const [showFilters, setShowFilters] = useState(false);
  const [datePosted, setDatePosted] = useState("any");
  const [remoteFilter, setRemoteFilter] = useState("any");
  const [employmentType, setEmploymentType] = useState("any");
  const [hoursFilter, setHoursFilter] = useState("any");
  const [categoryFilter, setCategoryFilter] = useState("any");
  const [companyFilter, setCompanyFilter] = useState("any");
  /* Resolved company address — auto-resolved via Places API or manually overridden */
  const [resolvedAddress, setResolvedAddress] = useState<{ address: string; lat: number; lng: number; name: string | null; confidence: "high" | "medium" | "low"; totalResults: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressOverride, setAddressOverride] = useState("");
  const [addressCache, setAddressCache] = useState<Record<string, { address: string; lat: number; lng: number; name: string | null; confidence: "high" | "medium" | "low"; totalResults: number }>>({});
  const resolveAbort = useRef<AbortController | null>(null);
  /* Pre-fetched commute times for sidebar cards: jobId → { durationMin, distanceMi, estimated? } */
  const [commuteCache, setCommuteCache] = useState<Record<string, { durationMin: number; distanceMi: number; estimated?: boolean }>>({});
  /* AbortControllers for cancelling stale commute requests */
  const commuteAbort = useRef<AbortController | null>(null);
  const geometryAbort = useRef<AbortController | null>(null);
  const prefetchAbort = useRef<AbortController | null>(null);
  const anchorAbort = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  /* ── Life Anchors state ── */
  interface LifeAnchorData { id: string; label: string; icon: string; address: string; lat: number; lng: number; weight: number }
  const { data: lifeAnchors = [] } = useQuery<LifeAnchorData[]>({
    queryKey: ["life-anchors"],
    queryFn: () => fetch("/api/life-anchors").then((r) => r.json()),
    staleTime: 60_000,
  });
  // Per-anchor commute for selected job: anchorId → { durationMin, distanceMi, estimated?, geometry? }
  const [anchorCommutes, setAnchorCommutes] = useState<Record<string, { durationMin: number; distanceMi: number; estimated?: boolean; geometry?: [number, number][] }>>({});
  // Anchor commute cache: `jobId-mode` → anchor commutes (avoids re-fetching)
  const anchorCommuteCache = useRef<Record<string, Record<string, { durationMin: number; distanceMi: number; estimated?: boolean; geometry?: [number, number][] }>>>({});
  // Life Score cache: jobId → score (0-100)
  const [lifeScoreCache, setLifeScoreCache] = useState<Record<string, number>>({});
  const [showAnchors, setShowAnchors] = useState(false);

  // Email leads
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [emailParsing, setEmailParsing] = useState(false);
  const [showForwardSetup, setShowForwardSetup] = useState(false);
  const [ingestToken, setIngestToken] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);

  interface EmailLeadRow {
    id: string; title: string; company: string; location: string;
    lat: number; lng: number; salaryMin: number | null; salaryMax: number | null;
    applyUrl: string | null; source: string; description: string; expiresAt: string;
  }
  const { data: emailLeadsData } = useQuery<{ leads: EmailLeadRow[]; count: number }>({
    queryKey: ["email-leads"],
    queryFn: () => fetch("/api/email-leads").then((r) => r.json()),
    staleTime: 60_000,
  });
  const emailLeads = emailLeadsData?.leads ?? [];
  const hasEmailLeads = emailLeads.some((l) => l.lat && l.lng);

  // Fetch user profile for default location
  const { data: profile } = useQuery<{ city?: string; state?: string }>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Set default location from profile (only once on mount)
  const profileLocationSet = useRef(false);
  useEffect(() => {
    if (profile && !profileLocationSet.current && !where) {
      const loc = [profile.city, profile.state].filter(Boolean).join(", ");
      if (loc) {
        setWhere(loc);
        profileLocationSet.current = true;
      }
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Adzuna search query — fetch up to 5 pages (250 jobs) for good coverage
  const { data: adzunaData, isFetching: adzunaFetching } = useQuery<SearchResponse>({
    queryKey: ["adzuna-map", searchParams],
    queryFn: async () => {
      if (!searchParams) return { jobs: [], total: 0, mean: null, page: 1, hasMore: false };
      const baseParams = {
        q: searchParams.q,
        where: searchParams.apiWhere,
        distance: searchParams.distance,
      };

      // Fetch first page
      const firstRes = await fetch(`/api/adzuna?${new URLSearchParams(baseParams)}`);
      if (!firstRes.ok) {
        const err = await firstRes.json();
        throw new Error(err.error || "Search failed");
      }
      const firstData = await firstRes.json();
      let allJobs = [...firstData.jobs];
      const total = firstData.count ?? firstData.total ?? 0;
      const mean = firstData.mean ?? null;

      // Fetch additional pages in parallel (pages 2-5, up to 250 total)
      const maxPages = Math.min(5, Math.ceil(total / 50));
      if (maxPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= maxPages; p++) {
          pagePromises.push(
            fetch(`/api/adzuna?${new URLSearchParams({ ...baseParams, page: String(p) })}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          );
        }
        const pages = await Promise.all(pagePromises);
        for (const pg of pages) {
          if (pg?.jobs) allJobs = [...allJobs, ...pg.jobs];
        }
      }

      return {
        jobs: allJobs.map((j: MapJob) => ({ ...j, source: "adzuna" as const })),
        total,
        mean,
        page: 1,
        hasMore: allJobs.length < total,
      };
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
        location: searchParams.apiWhere,
      });
      const res = await fetch(`/api/job-search?${params}`);
      if (!res.ok) return { jobs: [], total: 0 }; // SerpAPI error — degrade gracefully
      const data = await res.json();
      const rawJobs: Array<{
        jobId: string; title: string; company: string; location: string;
        description: string; thumbnail?: string | null; via?: string;
        applyLinks: { title: string; link: string }[];
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
          description: j.description || "",
          source: "google" as const,
          thumbnail: j.thumbnail ?? null,
          via: j.via ?? "",
          applyLinks: j.applyLinks ?? [],
          scheduleType: (ext.schedule_type as string) ?? null,
        };
      });

      return { jobs, total: rawJobs.length };
    },
    enabled: !!searchParams && source !== "adzuna",
  });

  // Merge results from both sources + email leads
  const isFetching = adzunaFetching || googleFetching;
  const mergedJobs = useMemo(() => {
    const a = (source !== "google" ? adzunaData?.jobs : []) ?? [];
    const g = (source !== "adzuna" ? googleData?.jobs : []) ?? [];
    // Convert email leads to MapJob format
    const e: MapJob[] = emailLeads.filter((l) => l.lat && l.lng).map((l) => ({
      id: `email-${l.id}`,
      title: l.title,
      company: l.company,
      location: l.location,
      area: [],
      lat: l.lat,
      lng: l.lng,
      url: l.applyUrl ?? "",
      salaryMin: l.salaryMin,
      salaryMax: l.salaryMax,
      salaryPredicted: false,
      contractTime: null,
      contractType: null,
      created: l.expiresAt,
      category: "",
      description: l.description ?? "",
      source: "email" as const,
    }));
    return [...a, ...g, ...e];
  }, [adzunaData, googleData, source, emailLeads]);
  const totalCount = (source !== "google" ? adzunaData?.total ?? 0 : 0) + (source !== "adzuna" ? googleData?.total ?? 0 : 0) + emailLeads.filter((l) => l.lat && l.lng).length;
  const meanSalary = adzunaData?.mean ?? null;

  const geoJobs = useMemo(() => mergedJobs.filter((j) => j.lat && j.lng), [mergedJobs]);

  // Dynamic filter options extracted from results
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    geoJobs.forEach((j) => { if (j.category) cats.add(j.category); });
    return Array.from(cats).sort();
  }, [geoJobs]);

  const availableCompanies = useMemo(() => {
    const cos = new Set<string>();
    geoJobs.forEach((j) => { if (j.company) cos.add(j.company); });
    return Array.from(cos).sort();
  }, [geoJobs]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (Number(minSalary) > 0) n++;
    if (datePosted !== "any") n++;
    if (remoteFilter !== "any") n++;
    if (employmentType !== "any") n++;
    if (hoursFilter !== "any") n++;
    if (categoryFilter !== "any") n++;
    if (companyFilter !== "any") n++;
    return n;
  }, [minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter, companyFilter]);

  const clearAllFilters = useCallback(() => {
    setMinSalary("");
    setDatePosted("any");
    setRemoteFilter("any");
    setEmploymentType("any");
    setHoursFilter("any");
    setCategoryFilter("any");
    setCompanyFilter("any");
  }, []);

  // Sort & filter
  const sortedJobs = useMemo(() => {
    let filtered = geoJobs;
    const minSal = Number(minSalary);
    if (minSal > 0) {
      filtered = filtered.filter(
        (j) => (j.salaryMax ?? j.salaryMin ?? 0) >= minSal
      );
    }

    // Date posted filter
    if (datePosted !== "any") {
      const now = Date.now();
      const cutoffs: Record<string, number> = {
        today: 24 * 60 * 60 * 1000,
        "3days": 3 * 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
      };
      const cutoff = cutoffs[datePosted];
      if (cutoff) {
        filtered = filtered.filter((j) => j.source === "email" || now - new Date(j.created).getTime() <= cutoff);
      }
    }

    // Remote filter
    if (remoteFilter !== "any") {
      filtered = filtered.filter((j) => {
        const text = `${j.title} ${j.location} ${j.description} ${j.scheduleType ?? ""}`.toLowerCase();
        const isRemote = text.includes("remote") || text.includes("work from home") || text.includes("telecommute");
        return remoteFilter === "remote" ? isRemote : !isRemote;
      });
    }

    // Employment type filter (contract_type from Adzuna, scheduleType from Google)
    if (employmentType !== "any") {
      filtered = filtered.filter((j) => {
        const ct = j.contractType?.toLowerCase() ?? "";
        const st = j.scheduleType?.toLowerCase() ?? "";
        switch (employmentType) {
          case "full_time": return ct === "full_time" || st.includes("full-time") || st.includes("full time");
          case "part_time": return ct === "part_time" || st.includes("part-time") || st.includes("part time");
          case "contract": return ct === "contract" || st.includes("contract") || st.includes("contractor");
          case "permanent": return ct === "permanent" || st.includes("permanent");
          default: return true;
        }
      });
    }

    // Hours filter (contract_time from Adzuna)
    if (hoursFilter !== "any") {
      filtered = filtered.filter((j) => {
        const ct = j.contractTime?.toLowerCase() ?? "";
        const st = j.scheduleType?.toLowerCase() ?? "";
        switch (hoursFilter) {
          case "full_time": return ct === "full_time" || st.includes("full-time") || st.includes("full time");
          case "part_time": return ct === "part_time" || st.includes("part-time") || st.includes("part time");
          default: return true;
        }
      });
    }

    // Category filter
    if (categoryFilter !== "any") {
      filtered = filtered.filter((j) => j.category === categoryFilter);
    }

    // Company filter
    if (companyFilter !== "any") {
      filtered = filtered.filter((j) => j.company === companyFilter);
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
      case "life-score":
        sorted.sort((a, b) => (lifeScoreCache[b.id] ?? -1) - (lifeScoreCache[a.id] ?? -1));
        break;
    }
    return sorted;
  }, [geoJobs, sortBy, minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter, companyFilter, lifeScoreCache]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE));
  const pagedJobs = useMemo(
    () => sortedJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedJobs, page]
  );

  // Reset page on new search or filter change
  useEffect(() => {
    setPage(1);
  }, [searchParams, sortBy, minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter, companyFilter]);

  // Geocode the search location to get lat/lng for the radius ring + commute origin
  useEffect(() => {
    if (!searchParams?.where) {
      setSearchCenter(null);
      return;
    }
    const GKEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (GKEY) {
      // Use Google Geocoding API for precise address-level coords
      const encoded = encodeURIComponent(searchParams.where);
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GKEY}`)
        .then((r) => r.json())
        .then((data: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }) => {
          if (data.status === "OK" && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            setSearchCenter([loc.lat, loc.lng]);
          }
        })
        .catch(() => {});
    } else {
      // Fallback to Nominatim
      const encoded = encodeURIComponent(searchParams.where);
      fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`)
        .then((r) => r.json())
        .then((results: { lat: string; lon: string }[]) => {
          if (results.length > 0) {
            setSearchCenter([parseFloat(results[0].lat), parseFloat(results[0].lon)]);
          }
        })
        .catch(() => {});
    }
  }, [searchParams?.where]);

  // ── Auto-resolve company address via Google Places ──
  useEffect(() => {
    resolveAbort.current?.abort();
    setResolvedAddress(null);
    setAddressOverride("");
    setAddressLoading(false);

    if (!selectedJob) return;

    // Check client-side cache first
    const cacheKey = `${selectedJob.company}:${selectedJob.location}`;
    const cached = addressCache[cacheKey];
    if (cached) {
      setResolvedAddress(cached);
      return;
    }

    const ctrl = new AbortController();
    resolveAbort.current = ctrl;
    setAddressLoading(true);

    const params = new URLSearchParams({
      company: selectedJob.company,
      location: selectedJob.location,
    });

    fetch(`/api/resolve-address?${params}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !ctrl.signal.aborted) {
          setResolvedAddress(d);
          setAddressCache((prev) => ({ ...prev, [cacheKey]: d }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setAddressLoading(false); });

    return () => ctrl.abort();
  }, [selectedJob]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: effective job lat/lng — resolved address takes priority over raw Adzuna coords
  const effectiveJobCoords = useMemo<[number, number] | null>(() => {
    if (!selectedJob) return null;
    if (resolvedAddress?.lat && resolvedAddress?.lng) return [resolvedAddress.lat, resolvedAddress.lng];
    if (selectedJob.lat && selectedJob.lng) return [selectedJob.lat, selectedJob.lng];
    return null;
  }, [selectedJob, resolvedAddress]);

  // ── Two-phase commute: fast duration first, then geometry in background ──
  // Waits for address resolution to finish so we don't compute twice
  useEffect(() => {
    // Cancel any in-flight commute requests
    commuteAbort.current?.abort();
    geometryAbort.current?.abort();
    setCommuteInfo(null);

    // Wait until address resolution is complete before computing commute
    if (!selectedJob || !searchCenter || !effectiveJobCoords || addressLoading) return;

    // Check pre-fetch cache for instant duration display (include resolved coords in key)
    const coordKey = `${effectiveJobCoords[0].toFixed(4)},${effectiveJobCoords[1].toFixed(4)}`;
    const cacheKey = `${selectedJob.id}:${commuteMode}:${coordKey}`;
    const cached = commuteCache[cacheKey];
    if (cached) {
      setCommuteInfo({ durationMin: cached.durationMin, distanceMi: cached.distanceMi, mode: commuteMode, estimated: cached.estimated });
      setCommuteLoading(false);
    } else {
      setCommuteLoading(true);
    }

    const params = new URLSearchParams({
      fromLat: String(searchCenter[0]),
      fromLng: String(searchCenter[1]),
      toLat: String(effectiveJobCoords[0]),
      toLng: String(effectiveJobCoords[1]),
      mode: commuteMode,
    });

    // Phase 1: fast duration/distance (no geometry, overview=false)
    const fastCtrl = new AbortController();
    commuteAbort.current = fastCtrl;

    if (!cached) {
      fetch(`/api/commute?${params}`, { signal: fastCtrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && !fastCtrl.signal.aborted) {
            setCommuteInfo({ durationMin: d.durationMin, distanceMi: d.distanceMi, mode: commuteMode, estimated: d.estimated });
            setCommuteCache((prev) => ({ ...prev, [cacheKey]: d }));
          }
        })
        .catch(() => {})
        .finally(() => { if (!fastCtrl.signal.aborted) setCommuteLoading(false); });
    }

    // Phase 2: full geometry in background (for route polyline on map)
    const geoCtrl = new AbortController();
    geometryAbort.current = geoCtrl;

    fetch(`/api/commute?${params}&geometry=true`, { signal: geoCtrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.geometry && !geoCtrl.signal.aborted) {
          setCommuteInfo((prev) => prev ? { ...prev, geometry: d.geometry } : d);
        }
      })
      .catch(() => {});

    return () => {
      fastCtrl.abort();
      geoCtrl.abort();
    };
  }, [selectedJob, searchCenter, commuteMode, effectiveJobCoords, addressLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-fetch commute times for visible sidebar cards (driving only for speed) ──
  useEffect(() => {
    prefetchAbort.current?.abort();
    if (!searchCenter || pagedJobs.length === 0) return;

    const ctrl = new AbortController();
    prefetchAbort.current = ctrl;

    // Only pre-fetch for jobs we haven't cached yet (limit to first 10)
    const uncached = pagedJobs.filter((j) => j.lat && j.lng && !commuteCache[`${j.id}:driving`]).slice(0, 10);
    if (uncached.length === 0) return;

    // Fetch one at a time with a gap between requests to avoid rate-limits
    async function fetchSequential() {
      for (const job of uncached) {
        if (ctrl.signal.aborted) return;

        const params = new URLSearchParams({
          fromLat: String(searchCenter![0]),
          fromLng: String(searchCenter![1]),
          toLat: String(job.lat),
          toLng: String(job.lng),
          mode: "driving",
        });

        try {
          const res = await fetch(`/api/commute?${params}`, { signal: ctrl.signal });
          if (!res.ok) continue;
          const d = await res.json();
          if (d && !ctrl.signal.aborted) {
            setCommuteCache((prev) => ({ ...prev, [`${job.id}:driving`]: { durationMin: d.durationMin, distanceMi: d.distanceMi, estimated: d.estimated } }));
          }
        } catch { /* aborted or failed — skip */ }

        // 1.5 s gap between requests to stay friendly with public server
        if (!ctrl.signal.aborted) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    // Start pre-fetching after a delay so the selected-job fetch gets priority
    const timer = setTimeout(fetchSequential, 800);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [pagedJobs, searchCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch commute from job to each Life Anchor when a job is selected ──
  useEffect(() => {
    anchorAbort.current?.abort();
    setAnchorCommutes({});

    if (!selectedJob || !effectiveJobCoords || lifeAnchors.length === 0 || addressLoading) return;

    // Check cache first
    const cacheKey = `${selectedJob.id}-${commuteMode}`;
    const cached = anchorCommuteCache.current[cacheKey];
    if (cached && Object.keys(cached).length === lifeAnchors.length) {
      setAnchorCommutes(cached);
      return;
    }

    const ctrl = new AbortController();
    anchorAbort.current = ctrl;

    async function fetchAnchorCommutes() {
      const results: Record<string, { durationMin: number; distanceMi: number; estimated?: boolean; geometry?: [number, number][] }> = {};

      for (const anchor of lifeAnchors) {
        if (ctrl.signal.aborted) return;

        const params = new URLSearchParams({
          fromLat: String(effectiveJobCoords![0]),
          fromLng: String(effectiveJobCoords![1]),
          toLat: String(anchor.lat),
          toLng: String(anchor.lng),
          mode: commuteMode,
        });

        try {
          // Fetch with geometry for route lines
          const res = await fetch(`/api/commute?${params}&geometry=true`, { signal: ctrl.signal });
          if (!res.ok) continue;
          const d = await res.json();
          if (d && !ctrl.signal.aborted) {
            results[anchor.id] = { durationMin: d.durationMin, distanceMi: d.distanceMi, estimated: d.estimated, geometry: d.geometry };
            setAnchorCommutes({ ...results });
          }
        } catch { /* aborted or failed */ }

        // Small gap to be rate-limit friendly
        if (!ctrl.signal.aborted) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      // Store in cache
      if (!ctrl.signal.aborted) {
        anchorCommuteCache.current[cacheKey] = results;
      }
    }

    const timer = setTimeout(fetchAnchorCommutes, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [selectedJob, effectiveJobCoords, lifeAnchors, commuteMode, addressLoading]);

  // ── Compute Life Score for jobs in the commute cache ──
  // Life Score: weighted inverse of commute time to all anchors (0-100 scale)
  const computeLifeScore = useCallback(
    (jobLat: number, jobLng: number, jobId: string): number | null => {
      if (lifeAnchors.length === 0) return null;

      // Use the commute cache to get driving minutes from searchCenter to job
      // For life score we need commute from job to each anchor, but we only have
      // search-center-to-job cached. Use haversine as a fast approximation for scoring.
      const totalWeight = lifeAnchors.reduce((s, a) => s + a.weight, 0);
      if (totalWeight === 0) return null;

      let weightedScore = 0;
      for (const anchor of lifeAnchors) {
        // Haversine distance in miles
        const R = 3958.8;
        const dLat = ((anchor.lat - jobLat) * Math.PI) / 180;
        const dLng = ((anchor.lng - jobLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((jobLat * Math.PI) / 180) *
            Math.cos((anchor.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distMi = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        // Score per anchor: 100 at 0 mi, ~50 at 15 mi, ~0 at 60+ mi
        const anchorScore = Math.max(0, 100 * Math.exp(-distMi / 20));
        weightedScore += anchorScore * (anchor.weight / totalWeight);
      }

      return Math.round(weightedScore);
    },
    [lifeAnchors],
  );

  // Pre-compute life scores for all geo jobs when anchors change
  useEffect(() => {
    if (lifeAnchors.length === 0) { setLifeScoreCache({}); return; }
    const cache: Record<string, number> = {};
    for (const job of geoJobs) {
      const score = computeLifeScore(job.lat, job.lng, job.id);
      if (score !== null) cache[job.id] = score;
    }
    setLifeScoreCache(cache);
  }, [geoJobs, lifeAnchors, computeLifeScore]);

  // ── Sweet Spot: weighted centroid + radius ──
  const sweetSpot = useMemo(() => {
    if (lifeAnchors.length < 2) return null;
    const totalWeight = lifeAnchors.reduce((s, a) => s + a.weight, 0);
    if (totalWeight === 0) return null;

    // Weighted centroid
    let cLat = 0, cLng = 0;
    for (const a of lifeAnchors) {
      cLat += a.lat * a.weight;
      cLng += a.lng * a.weight;
    }
    cLat /= totalWeight;
    cLng /= totalWeight;

    // Weighted average distance from centroid (in meters)
    let avgDist = 0;
    for (const a of lifeAnchors) {
      const R = 6371000; // meters
      const dLat = ((a.lat - cLat) * Math.PI) / 180;
      const dLng = ((a.lng - cLng) * Math.PI) / 180;
      const hav =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((cLat * Math.PI) / 180) *
          Math.cos((a.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
      avgDist += dist * (a.weight / totalWeight);
    }

    // Radius = weighted avg distance, clamped 3-40 miles (in meters)
    const radiusMeters = Math.max(4828, Math.min(64374, avgDist * 1.2));

    return { center: [cLat, cLng] as [number, number], radiusMeters };
  }, [lifeAnchors]);

  // Track job as application
  const trackMutation = useMutation({
    mutationFn: async (job: MapJob) => {
      const body: Record<string, unknown> = {
        company: job.company,
        role: job.title,
        location: job.location,
        url: job.url || null,
        status: "wishlist",
        notes: `Found via ${job.source === "google" ? "Google Jobs" : job.source === "email" ? "Email Lead" : "Adzuna"} Job Map\n\n${job.description}...`,
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

  /* ── Interest groups ── */
  const { data: interestGroups = [] } = useQuery<{ id: string; name: string; color: string; _count: { items: number } }[]>({
    queryKey: ["interest-groups"],
    queryFn: () => fetch("/api/interest-groups").then((r) => r.json()),
    staleTime: 60_000,
  });

  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/interest-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interest-groups"] });
      setNewGroupName("");
      setShowNewGroup(false);
    },
    onError: () => toast.error("Failed to create group"),
  });

  const addToGroupMutation = useMutation({
    mutationFn: async ({ groupId, job }: { groupId: string; job: MapJob }) => {
      const res = await fetch(`/api/interest-groups/${groupId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobKey: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          source: job.source,
          description: job.description?.slice(0, 500),
          thumbnail: job.thumbnail,
          scheduleType: job.scheduleType,
        }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: (_d, { job }) => {
      queryClient.invalidateQueries({ queryKey: ["interest-groups"] });
      toast.success(`Saved "${job.title}" to group`);
    },
    onError: () => toast.error("Failed to save to group"),
  });

  const doSearch = useCallback(async () => {
    if (!where.trim()) {
      toast.error("Enter a location to search");
      return;
    }
    const trimmed = where.trim();

    // Extract city/state from address for job APIs (they don't understand street addresses)
    let apiWhere = trimmed;
    const GKEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (GKEY) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&key=${GKEY}`
        );
        const data = await res.json();
        if (data.status === "OK" && data.results?.length > 0) {
          const comps = data.results[0].address_components as { long_name: string; short_name: string; types: string[] }[];
          const city = comps.find((c) => c.types.includes("locality"))?.long_name
            || comps.find((c) => c.types.includes("sublocality"))?.long_name
            || comps.find((c) => c.types.includes("administrative_area_level_3"))?.long_name
            || "";
          const state = comps.find((c) => c.types.includes("administrative_area_level_1"))?.short_name || "";
          if (city) {
            apiWhere = state ? `${city}, ${state}` : city;
          }
          // Also set searchCenter immediately from the geocode result
          const loc = data.results[0].geometry.location;
          setSearchCenter([loc.lat, loc.lng]);
        }
      } catch {
        // Fall through — use raw address
      }
    }

    setSearchParams({ q: query.trim(), where: trimmed, apiWhere, distance: radius });
    setSearched(true);
    setSelectedJob(null);
    setShowDetails(false);
    setPage(1);
    setCommuteCache({});
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
        setSearchParams({ q: query.trim(), where: loc, apiWhere: loc, distance: radius });
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
      <Card className="relative z-20">
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
            <PlacesAutocomplete
              value={where}
              onChange={setWhere}
              placeholder="Address or city..."
              className="sm:w-52"
              types={[]}
            />
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
            {/* Map / List toggle */}
            <div className="flex border rounded-md overflow-hidden">
              <Button
                type="button"
                size="icon"
                variant={viewMode === "map" ? "default" : "ghost"}
                className="rounded-none h-9 w-9"
                onClick={() => setViewMode("map")}
                title="Map view"
              >
                <MapIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={viewMode === "list" ? "default" : "ghost"}
                className="rounded-none h-9 w-9"
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Stats bar + legend */}
      {searched && totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-sm text-muted-foreground">
          <span>
            {geoJobs.length.toLocaleString()} jobs loaded
            {totalCount > geoJobs.length && (
              <span className="text-xs"> of {totalCount.toLocaleString()} in area</span>
            )}
          </span>
          {sortedJobs.length < geoJobs.length && (
            <span>({sortedJobs.length} matching filter)</span>
          )}
          {meanSalary && (
            <Badge variant="outline" className="gap-1">
              <DollarSign className="h-3 w-3" />
              Avg {formatSalary(meanSalary)}
            </Badge>
          )}
          {/* Salary colour legend — map mode only */}
          {viewMode === "map" && (
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
              {/* ── Map overlay controls ── */}
              <span className="mx-1 h-4 w-px bg-border" />
              <Button
                variant={showHeatmap ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setShowHeatmap((v) => !v)}
                title={showHeatmap ? "Hide heatmap" : "Show heatmap"}
              >
                <Flame className="h-3 w-3" />
                Heatmap
              </Button>
              <Select value={tileStyle} onValueChange={(v) => setTileStyle((v ?? "osm") as typeof tileStyle)}>
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="osm">OpenStreetMap</SelectItem>
                  <SelectItem value="google-roadmap">Google Road</SelectItem>
                  <SelectItem value="google-satellite">Satellite</SelectItem>
                  <SelectItem value="google-hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div className="space-y-3">
          {/* Sort & filter controls */}
          {searched && geoJobs.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-1.5 items-center">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? "salary-desc")}>
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                <Button
                  type="button"
                  size="sm"
                  variant={showFilters ? "default" : "outline"}
                  className="h-8 text-xs gap-1"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-3 w-3" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] rounded-full ml-0.5">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
                {activeFilterCount > 0 && (
                  <Button type="button" size="sm" variant="ghost" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearAllFilters}>
                    <X className="h-3 w-3" /> Clear
                  </Button>
                )}
              </div>

              {/* Collapsible filter panel */}
              {showFilters && (
                <Card className="border-dashed">
                  <CardContent className="py-3 px-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> Date Posted
                        </label>
                        <Select value={datePosted} onValueChange={(v) => setDatePosted(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DATE_POSTED_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Wifi className="h-3 w-3" /> Remote
                        </label>
                        <Select value={remoteFilter} onValueChange={(v) => setRemoteFilter(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REMOTE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> Employment Type
                        </label>
                        <Select value={employmentType} onValueChange={(v) => setEmploymentType(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Hours
                        </label>
                        <Select value={hoursFilter} onValueChange={(v) => setHoursFilter(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {HOURS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Tag className="h-3 w-3" /> Category
                        </label>
                        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">All categories</SelectItem>
                            {availableCategories.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> Company
                        </label>
                        <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">All companies</SelectItem>
                            {availableCompanies.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Empty / loading states */}
          {!searched && !hasEmailLeads && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Search className="h-10 w-10 opacity-30" />
              <p className="text-sm">Search for jobs to see results</p>
            </div>
          )}
          {searched && isFetching && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Searching...
            </div>
          )}
          {(searched || hasEmailLeads) && !isFetching && sortedJobs.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No jobs found in this area</p>
            </div>
          )}

          {/* Job cards grid */}
          {(searched || hasEmailLeads) && !isFetching && sortedJobs.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pagedJobs.map((job) => {
                  const desc = stripHtml(job.description);
                  const isExpanded = expandedDescs.has(job.id);
                  return (
                    <Card key={job.id} className="flex flex-col">
                      <CardContent className="pt-4 space-y-2 flex-1">
                        {/* Header: thumbnail + title/company */}
                        <div className="flex gap-3">
                          {job.thumbnail ? (
                            <img
                              src={job.thumbnail}
                              alt=""
                              className="h-10 w-10 rounded object-contain shrink-0 bg-muted"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm leading-tight line-clamp-2">
                              {job.title}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                            {job.via && (
                              <p className="text-[10px] text-muted-foreground">{job.via}</p>
                            )}
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                            <MapPin className="h-2.5 w-2.5" /> {job.location}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${sourceBadge(job.source).className}`}
                          >
                            {sourceBadge(job.source).label}
                          </Badge>
                          {(job.salaryMin || job.salaryMax) && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0 text-emerald-600 border-emerald-300 dark:border-emerald-700">
                              <DollarSign className="h-2.5 w-2.5" />
                              {job.salaryMin ? formatSalary(job.salaryMin) : ""}
                              {job.salaryMin && job.salaryMax ? "–" : ""}
                              {job.salaryMax ? formatSalary(job.salaryMax) : ""}
                            </Badge>
                          )}
                          {job.scheduleType && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {job.scheduleType}
                            </Badge>
                          )}
                          {job.contractTime && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                              {job.contractTime.replace("_", " ")}
                            </Badge>
                          )}
                        </div>

                        {/* Commute */}
                        {commuteCache[`${job.id}:driving`] && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <Car className="h-3 w-3" />
                            ~{commuteCache[`${job.id}:driving`].durationMin} min ({commuteCache[`${job.id}:driving`].distanceMi} mi)
                            {commuteCache[`${job.id}:driving`].estimated && <span className="opacity-60">(est.)</span>}
                          </div>
                        )}

                        {/* Life Score */}
                        {lifeScoreCache[job.id] != null && (
                          <div className="flex items-center gap-1 text-xs">
                            <Anchor className="h-3 w-3 text-indigo-500" />
                            <span className={`font-semibold ${lifeScoreCache[job.id] >= 70 ? "text-emerald-600 dark:text-emerald-400" : lifeScoreCache[job.id] >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500"}`}>
                              Life Score: {lifeScoreCache[job.id]}
                            </span>
                          </div>
                        )}

                        {/* Description */}
                        <p className={`text-xs text-muted-foreground leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                          {desc}
                        </p>
                        {desc.length > 200 && (
                          <button
                            type="button"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={() => setExpandedDescs((prev) => {
                              const next = new Set(prev);
                              if (next.has(job.id)) next.delete(job.id);
                              else next.add(job.id);
                              return next;
                            })}
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </button>
                        )}

                        {/* Apply links (Google Jobs) */}
                        {job.applyLinks && job.applyLinks.length > 0 && (
                          <div className="space-y-1">
                            <Separator />
                            {job.applyLinks.slice(0, 3).map((link, i) => (
                              <a
                                key={i}
                                href={link.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{link.title}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </CardContent>

                      {/* Footer actions */}
                      <div className="px-4 pb-3 flex gap-2 mt-auto">
                        {job.url && (
                          <a href={job.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                            <Button size="sm" className="w-full gap-1 text-xs">
                              <ExternalLink className="h-3 w-3" /> Apply
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant={trackedIds.has(job.id) ? "outline" : "secondary"}
                          disabled={trackedIds.has(job.id)}
                          onClick={() => trackMutation.mutate(job)}
                          className="gap-1 text-xs"
                        >
                          <Plus className="h-3 w-3" />
                          {trackedIds.has(job.id) ? "Tracked" : "Track"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-2 h-8 text-xs hover:bg-accent">
                            <Star className="h-3 w-3" />
                            <ChevronDown className="h-3 w-3" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel className="text-xs">Save to Interest Group</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {interestGroups.map((g) => (
                                <DropdownMenuItem key={g.id} onClick={() => addToGroupMutation.mutate({ groupId: g.id, job })}>
                                  <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: g.color }} />
                                  {g.name}
                                </DropdownMenuItem>
                              ))}
                              {interestGroups.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No groups yet</div>
                              )}
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowNewGroup(true)}>
                              <FolderPlus className="h-3.5 w-3.5 mr-2" /> New Group…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs"
                          onClick={() => { setSelectedJob(job); setShowDetails(true); }}
                        >
                          <Eye className="h-3 w-3" /> Details
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Pagination */}
              {sortedJobs.length > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-4 pt-2">
                  <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                  <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Details dialog (shared — list mode opens directly) */}
          {selectedJob && (
            <Dialog open={showDetails} onOpenChange={(open) => { setShowDetails(open); if (!open) setSelectedJob(null); }}>
              <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>{selectedJob.title}</DialogTitle>
                  <DialogDescription>{selectedJob.company} — {selectedJob.location}</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto -mx-4 px-4 min-h-0">
                  <div className="space-y-4 pb-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className={`text-xs ${sourceBadge(selectedJob.source).className}`}>
                        {sourceBadge(selectedJob.source).labelLong}
                      </Badge>
                      {selectedJob.scheduleType && <Badge variant="outline" className="text-xs">{selectedJob.scheduleType}</Badge>}
                      {selectedJob.contractTime && <Badge variant="outline" className="text-xs capitalize">{selectedJob.contractTime.replace("_", " ")}</Badge>}
                    </div>
                    {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        <span className="font-semibold">
                          {selectedJob.salaryMin && formatSalary(selectedJob.salaryMin)}
                          {selectedJob.salaryMin && selectedJob.salaryMax && " – "}
                          {selectedJob.salaryMax && formatSalary(selectedJob.salaryMax)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" /> {selectedJob.location}
                    </div>

                    {/* Resolved / override address */}
                    <div className="space-y-1.5">
                      {addressLoading && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Resolving exact address…
                        </div>
                      )}
                      {resolvedAddress && !addressOverride && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                            <MapPinned className="h-4 w-4 shrink-0" />
                            <span className="font-medium">{resolvedAddress.address}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-4 ${
                                resolvedAddress.confidence === "high" ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                                : resolvedAddress.confidence === "medium" ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                              }`}
                            >
                              {resolvedAddress.confidence === "high" ? "Exact match" : resolvedAddress.confidence === "medium" ? "Likely match" : "Multiple offices found"}
                            </Badge>
                            {resolvedAddress.name && resolvedAddress.name !== resolvedAddress.address && (
                              <span className="text-[10px] text-muted-foreground">{resolvedAddress.name}</span>
                            )}
                          </div>
                        </div>
                      )}
                      <PlacesAutocomplete
                        value={addressOverride}
                        onChange={(v) => {
                          setAddressOverride(v);
                          if (!v.trim()) return;
                          geocodeOverride(v).then((d) => { if (d) setResolvedAddress(d); });
                        }}
                        placeholder={resolvedAddress ? "Override address…" : "Enter exact address…"}
                        className="h-8 text-xs"
                      />
                    </div>

                    {selectedJob.via && (
                      <p className="text-xs text-muted-foreground">{selectedJob.via}</p>
                    )}

                    {/* Commute + transport mode selector */}
                    {searchCenter && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {COMMUTE_MODES.map((m) => {
                            const Icon = m.icon;
                            return (
                              <Button
                                key={m.value}
                                type="button"
                                size="icon"
                                variant={commuteMode === m.value ? "default" : "outline"}
                                className="h-7 w-7"
                                title={m.label}
                                onClick={() => setCommuteMode(m.value)}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </Button>
                            );
                          })}
                          {commuteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>
                        {commuteInfo && (
                          <div className="flex items-center gap-1.5 text-sm">
                            {(() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-4 w-4 text-blue-500" />; })()}
                            <span className="font-medium">
                              ~{commuteInfo.durationMin} min ({commuteInfo.distanceMi} mi)
                              {commuteInfo.estimated && <span className="text-xs text-muted-foreground ml-1">(est.)</span>}
                            </span>
                          </div>
                        )}

                        {/* Life Anchors commute breakdown */}
                        {lifeAnchors.length > 0 && Object.keys(anchorCommutes).length > 0 && (() => {
                          const totalYearlyCost = lifeAnchors.reduce((sum, a) => {
                            const ac = anchorCommutes[a.id];
                            return sum + (ac ? yearlyCommuteCost(ac.distanceMi) : 0);
                          }, 0);
                          const midSalary = selectedJob.salaryMin
                            ? selectedJob.salaryMax ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2 : selectedJob.salaryMin
                            : null;
                          return (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <Anchor className="h-3.5 w-3.5 text-indigo-500" /> Life Anchors
                            </div>
                            {lifeAnchors.map((anchor) => {
                              const ac = anchorCommutes[anchor.id];
                              return (
                                <div key={anchor.id} className="flex items-center justify-between text-xs px-1">
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ANCHOR_COLORS[lifeAnchors.indexOf(anchor) % ANCHOR_COLORS.length] }} />
                                    {anchor.label}
                                  </span>
                                  {ac ? (
                                    <span className="font-medium">
                                      ~{ac.durationMin} min ({ac.distanceMi} mi)
                                      <span className="text-muted-foreground ml-1">· {formatCost(yearlyCommuteCost(ac.distanceMi))}/yr</span>
                                      {ac.estimated && <span className="opacity-60 ml-0.5">(est.)</span>}
                                    </span>
                                  ) : (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                  )}
                                </div>
                              );
                            })}
                            {/* Yearly commute cost + net salary */}
                            {totalYearlyCost > 0 && (
                              <div className="pt-1 border-t space-y-0.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1 text-muted-foreground"><Car className="h-3 w-3" /> Total Commute Cost</span>
                                  <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCost(totalYearlyCost)}/yr</span>
                                </div>
                                {midSalary && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="h-3 w-3" /> Net Effective Salary</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatSalary(midSalary - totalYearlyCost)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Life Score */}
                            {lifeScoreCache[selectedJob.id] != null && (
                              <div className="flex items-center justify-between pt-1 border-t text-xs">
                                <span className="font-semibold flex items-center gap-1"><Anchor className="h-3 w-3 text-indigo-500" /> Life Score</span>
                                <span className={`font-bold text-sm ${lifeScoreCache[selectedJob.id] >= 70 ? "text-emerald-600" : lifeScoreCache[selectedJob.id] >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                                  {lifeScoreCache[selectedJob.id]}/100
                                </span>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Street View */}
                    {GOOGLE_MAPS_KEY && effectiveJobCoords && (
                      <div className="rounded-lg overflow-hidden border">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                          <PersonStanding className="h-3.5 w-3.5" /> {resolvedAddress ? "Office View" : "Neighborhood View"}
                        </div>
                        <img
                          src={`https://maps.googleapis.com/maps/api/streetview?size=600x250&location=${effectiveJobCoords[0]},${effectiveJobCoords[1]}&key=${GOOGLE_MAPS_KEY}`}
                          alt={`Street view near ${resolvedAddress?.address ?? selectedJob.location}`}
                          className="w-full h-[180px] object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <Separator />
                    <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {stripHtml(selectedJob.description)}
                    </div>
                    {/* Apply links */}
                    {selectedJob.applyLinks && selectedJob.applyLinks.length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <h4 className="text-xs font-medium">Apply on:</h4>
                        {selectedJob.applyLinks.map((link, i) => (
                          <a key={i} href={link.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {link.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  {selectedJob.url && (
                    <a href={selectedJob.url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="gap-1"><ExternalLink className="h-3.5 w-3.5" /> Apply Now</Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant={trackedIds.has(selectedJob.id) ? "outline" : "secondary"}
                    disabled={trackedIds.has(selectedJob.id)}
                    onClick={() => trackMutation.mutate(selectedJob)}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> {trackedIds.has(selectedJob.id) ? "Tracked" : "Track"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-2.5 h-9 text-sm hover:bg-accent">
                      <Star className="h-3.5 w-3.5" />
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs">Save to Interest Group</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {interestGroups.map((g) => (
                          <DropdownMenuItem key={g.id} onClick={() => addToGroupMutation.mutate({ groupId: g.id, job: selectedJob })}>
                            <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: g.color }} />
                            {g.name}
                          </DropdownMenuItem>
                        ))}
                        {interestGroups.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No groups yet</div>
                        )}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowNewGroup(true)}>
                        <FolderPlus className="h-3.5 w-3.5 mr-2" /> New Group…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ── MAP VIEW ── */}
      {viewMode === "map" && (
      <div className="flex gap-3 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border bg-muted">
          {!searched && !hasEmailLeads ? (
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
              jobs={sortedJobs}
              center={
                sortedJobs.length > 0
                  ? [sortedJobs[0].lat, sortedJobs[0].lng] as [number, number]
                  : DEFAULT_CENTER
              }
              selectedId={selectedJob?.id ?? null}
              onSelect={(job: MapJob) => { setSelectedJob(job); setShowDetails(false); }}
              meanSalary={meanSalary}
              searchCenter={searchCenter}
              radiusMiles={Number(radius)}
              onSearchArea={handleSearchArea}
              routeGeometry={commuteInfo?.geometry ?? null}
              anchorRoutes={
                selectedJob && anchorCommutes
                  ? Object.entries(anchorCommutes).map(([aId, info], i) => ({
                      anchorId: aId,
                      geometry: (info as any)?.geometry ?? null,
                      color: ANCHOR_COLORS[i % ANCHOR_COLORS.length],
                      label: (lifeAnchors ?? []).find((a: LifeAnchorData) => a.id === aId)?.label ?? "",
                    })).filter((r) => r.geometry)
                  : []
              }
              anchorMarkers={
                lifeAnchors && lifeAnchors.length > 0
                  ? (lifeAnchors as LifeAnchorData[]).map((a, i) => ({
                      id: a.id,
                      lat: a.lat,
                      lng: a.lng,
                      label: a.label,
                      icon: a.icon ?? "map-pin",
                      color: ANCHOR_COLORS[i % ANCHOR_COLORS.length],
                    }))
                  : []
              }
              showHeatmap={showHeatmap}
              tileStyle={tileStyle}
              resolvedCoords={effectiveJobCoords}
              highlightedIds={pagedJobs.map((j) => j.id)}
              sweetSpot={sweetSpot}
            />
          )}
        </div>

        {/* Sidebar — sort/filter + job list / detail */}
        <div className="w-80 shrink-0 flex flex-col">
          {/* Sort & filter controls */}
          {searched && geoJobs.length > 0 && !selectedJob && (
            <div className="space-y-2 mb-2">
              <div className="flex gap-1.5 items-center">
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
                <Button
                  type="button"
                  size="icon"
                  variant={showFilters ? "default" : "outline"}
                  className="h-8 w-8 shrink-0 relative"
                  onClick={() => setShowFilters(!showFilters)}
                  title="Toggle filters"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center px-1">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={showAnchors ? "default" : "outline"}
                  className="h-8 w-8 shrink-0 relative"
                  onClick={() => setShowAnchors(!showAnchors)}
                  title="Life Anchors"
                >
                  <Anchor className="h-3.5 w-3.5" />
                  {(lifeAnchors ?? []).length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center px-1">
                      {(lifeAnchors ?? []).length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0 relative"
                  onClick={() => setShowEmailImport(true)}
                  title="Import from email"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {emailLeads.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center px-1">
                      {emailLeads.length}
                    </span>
                  )}
                </Button>
              </div>

              {/* Collapsible sidebar filters */}
              {showFilters && (
                <div className="space-y-2 p-2 border border-dashed rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
                    {activeFilterCount > 0 && (
                      <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={clearAllFilters}>
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Min salary"
                      value={minSalary}
                      onChange={(e) => setMinSalary(e.target.value.replace(/\D/g, ""))}
                      className="h-7 text-xs pl-6"
                    />
                  </div>
                  <Select value={datePosted} onValueChange={(v) => setDatePosted(v ?? "any")}>
                    <SelectTrigger className="h-7 text-xs">
                      <CalendarDays className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_POSTED_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={remoteFilter} onValueChange={(v) => setRemoteFilter(v ?? "any")}>
                    <SelectTrigger className="h-7 text-xs">
                      <Wifi className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMOTE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={employmentType} onValueChange={(v) => setEmploymentType(v ?? "any")}>
                    <SelectTrigger className="h-7 text-xs">
                      <Briefcase className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={hoursFilter} onValueChange={(v) => setHoursFilter(v ?? "any")}>
                    <SelectTrigger className="h-7 text-xs">
                      <Clock className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableCategories.length > 0 && (
                    <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "any")}>
                      <SelectTrigger className="h-7 text-xs">
                        <Tag className="h-3 w-3 mr-1 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">All categories</SelectItem>
                        {availableCategories.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {availableCompanies.length > 1 && (
                    <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v ?? "any")}>
                      <SelectTrigger className="h-7 text-xs">
                        <Building2 className="h-3 w-3 mr-1 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">All companies</SelectItem>
                        {availableCompanies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Collapsible Life Anchors */}
              {showAnchors && (
                <div className="border border-dashed border-violet-300 rounded-lg p-2">
                  <LifeAnchorsPanel
                    compact
                    defaultAddress={where}
                    onAnchorsChange={() => queryClient.invalidateQueries({ queryKey: ["life-anchors"] })}
                  />
                </div>
              )}
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
                      onClick={() => { setSelectedJob(null); setShowDetails(false); }}
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
                      className={`text-xs ${sourceBadge(selectedJob.source).className}`}
                    >
                      {sourceBadge(selectedJob.source).label}
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

                  {/* Resolved address (compact) */}
                  <div className="space-y-1">
                    {addressLoading && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Resolving…
                      </div>
                    )}
                    {resolvedAddress && !addressOverride && (
                      <div className="space-y-0.5">
                        <div className="flex items-start gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <MapPinned className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{resolvedAddress.address}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1 py-0 h-3.5 ${
                            resolvedAddress.confidence === "high" ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                            : resolvedAddress.confidence === "medium" ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                            : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                          }`}
                        >
                          {resolvedAddress.confidence === "high" ? "Exact" : resolvedAddress.confidence === "medium" ? "Likely" : "Multiple offices"}
                        </Badge>
                      </div>
                    )}
                    <PlacesAutocomplete
                      value={addressOverride}
                      onChange={(v) => {
                        setAddressOverride(v);
                        if (!v.trim()) return;
                        geocodeOverride(v).then((d) => { if (d) setResolvedAddress(d); });
                      }}
                      placeholder={resolvedAddress ? "Override address…" : "Enter exact address…"}
                      className="h-7 text-xs"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {stripHtml(selectedJob.description)}
                  </p>

                  {/* View Full Details button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1"
                    onClick={() => setShowDetails(true)}
                  >
                    <Eye className="h-3.5 w-3.5" /> View Full Details
                  </Button>

                  {/* Full Details Dialog */}
                  <Dialog open={showDetails} onOpenChange={setShowDetails}>
                    <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle>{selectedJob.title}</DialogTitle>
                        <DialogDescription>{selectedJob.company} — {selectedJob.location}</DialogDescription>
                      </DialogHeader>

                      <div className="flex-1 overflow-y-auto -mx-4 px-4 min-h-0">
                        <div className="space-y-4 pb-2">
                          {/* Badges */}
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${sourceBadge(selectedJob.source).className}`}
                            >
                              {sourceBadge(selectedJob.source).labelLong}
                            </Badge>
                            {selectedJob.category && (
                              <Badge variant="secondary" className="text-xs">{selectedJob.category}</Badge>
                            )}
                            {selectedJob.contractTime && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {selectedJob.contractTime.replace("_", " ")}
                              </Badge>
                            )}
                            {selectedJob.contractType && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {selectedJob.contractType.replace("_", " ")}
                              </Badge>
                            )}
                          </div>

                          {/* Salary */}
                          {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <DollarSign className="h-4 w-4 text-emerald-500" />
                              <span className="font-semibold">
                                {selectedJob.salaryMin && formatSalary(selectedJob.salaryMin)}
                                {selectedJob.salaryMin && selectedJob.salaryMax && " – "}
                                {selectedJob.salaryMax && formatSalary(selectedJob.salaryMax)}
                              </span>
                              {selectedJob.salaryPredicted && (
                                <span className="text-xs text-muted-foreground">(estimated)</span>
                              )}
                            </div>
                          )}

                          {/* Commute + transport mode selector */}
                          {searchCenter && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                {COMMUTE_MODES.map((m) => {
                                  const Icon = m.icon;
                                  return (
                                    <Button
                                      key={m.value}
                                      type="button"
                                      size="icon"
                                      variant={commuteMode === m.value ? "default" : "outline"}
                                      className="h-7 w-7"
                                      title={m.label}
                                      onClick={() => setCommuteMode(m.value)}
                                    >
                                      <Icon className="h-3.5 w-3.5" />
                                    </Button>
                                  );
                                })}
                                {commuteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              </div>
                              {commuteInfo && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  {(() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-4 w-4 text-blue-500" />; })()}
                                  <span className="font-medium">
                                    ~{commuteInfo.durationMin} min ({commuteInfo.distanceMi} mi)
                                    {commuteInfo.estimated && <span className="text-xs text-muted-foreground ml-1">(est.)</span>}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Life Anchors commute breakdown (dialog) */}
                          {lifeAnchors.length > 0 && Object.keys(anchorCommutes).length > 0 && (() => {
                            const totalYearlyCost = lifeAnchors.reduce((sum, a) => {
                              const ac = anchorCommutes[a.id];
                              return sum + (ac ? yearlyCommuteCost(ac.distanceMi) : 0);
                            }, 0);
                            const midSalary = selectedJob.salaryMin
                              ? selectedJob.salaryMax ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2 : selectedJob.salaryMin
                              : null;
                            return (
                            <div className="space-y-1.5 p-3 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                <Anchor className="h-3.5 w-3.5 text-indigo-500" /> Life Anchors
                              </div>
                              {lifeAnchors.map((anchor, idx) => {
                                const ac = anchorCommutes[anchor.id];
                                return (
                                  <div key={anchor.id} className="flex items-center justify-between text-xs px-1">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ANCHOR_COLORS[idx % ANCHOR_COLORS.length] }} />
                                      {anchor.label}
                                    </span>
                                    {ac ? (
                                      <span className="font-medium">
                                        ~{ac.durationMin} min ({ac.distanceMi} mi)
                                        <span className="text-muted-foreground ml-1">· {formatCost(yearlyCommuteCost(ac.distanceMi))}/yr</span>
                                        {ac.estimated && <span className="opacity-60 ml-0.5">(est.)</span>}
                                      </span>
                                    ) : (
                                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                    )}
                                  </div>
                                );
                              })}
                              {/* Yearly commute cost + net salary */}
                              {totalYearlyCost > 0 && (
                                <div className="pt-1.5 border-t space-y-0.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1 text-muted-foreground"><Car className="h-3 w-3" /> Total Commute Cost</span>
                                    <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCost(totalYearlyCost)}/yr</span>
                                  </div>
                                  {midSalary && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="h-3 w-3" /> Net Effective Salary</span>
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatSalary(midSalary - totalYearlyCost)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {lifeScoreCache[selectedJob.id] != null && (
                                <div className="flex items-center justify-between pt-1.5 border-t text-xs">
                                  <span className="font-semibold flex items-center gap-1"><Anchor className="h-3 w-3 text-indigo-500" /> Life Score</span>
                                  <span className={`font-bold text-sm ${lifeScoreCache[selectedJob.id] >= 70 ? "text-emerald-600" : lifeScoreCache[selectedJob.id] >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                                    {lifeScoreCache[selectedJob.id]}/100
                                  </span>
                                </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Street View */}
                          {GOOGLE_MAPS_KEY && effectiveJobCoords && (
                            <div className="rounded-lg overflow-hidden border">
                              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                                <PersonStanding className="h-3.5 w-3.5" /> {resolvedAddress ? "Office View" : "Neighborhood View"}
                              </div>
                              <img
                                src={`https://maps.googleapis.com/maps/api/streetview?size=600x250&location=${effectiveJobCoords[0]},${effectiveJobCoords[1]}&key=${GOOGLE_MAPS_KEY}`}
                                alt={`Street view near ${resolvedAddress?.address ?? selectedJob.location}`}
                                className="w-full h-[180px] object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}

                          {/* Location + resolved address */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              {selectedJob.location}
                              {selectedJob.area.length > 0 && (
                                <span className="text-xs">({selectedJob.area.join(", ")})</span>
                              )}
                            </div>
                            {addressLoading && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Resolving exact address…
                              </div>
                            )}
                            {resolvedAddress && !addressOverride && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                                  <MapPinned className="h-4 w-4 shrink-0" />
                                  <span className="font-medium">{resolvedAddress.address}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 h-4 ${
                                      resolvedAddress.confidence === "high" ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                                      : resolvedAddress.confidence === "medium" ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                      : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                                    }`}
                                  >
                                    {resolvedAddress.confidence === "high" ? "Exact match" : resolvedAddress.confidence === "medium" ? "Likely match" : "Multiple offices found"}
                                  </Badge>
                                  {resolvedAddress.name && resolvedAddress.name !== resolvedAddress.address && (
                                    <span className="text-[10px] text-muted-foreground">{resolvedAddress.name}</span>
                                  )}
                                </div>
                              </div>
                            )}
                            <PlacesAutocomplete
                              value={addressOverride}
                              onChange={(v) => {
                                setAddressOverride(v);
                                if (!v.trim()) return;
                                geocodeOverride(v).then((d) => { if (d) setResolvedAddress(d); });
                              }}
                              placeholder={resolvedAddress ? "Override address…" : "Enter exact address…"}
                              className="h-8 text-xs"
                            />
                          </div>

                          {/* Posted date */}
                          {selectedJob.created && (
                            <div className="text-xs text-muted-foreground">
                              Posted {new Date(selectedJob.created).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                            </div>
                          )}

                          {/* Description */}
                          <div className="border-t pt-3">
                            <h4 className="text-sm font-semibold mb-2">Job Description</h4>
                            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                              {stripHtml(selectedJob.description)}
                            </div>
                          </div>

                          {/* Full listing CTA */}
                          {selectedJob.url && (
                            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3">
                              <p className="text-xs text-muted-foreground mb-2">
                                {selectedJob.source === "adzuna"
                                  ? "Adzuna provides a summary. View the full job listing for complete details, requirements, and how to apply."
                                  : "View the full job listing for complete details, requirements, and how to apply."}
                              </p>
                              <a href={selectedJob.url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="outline" className="w-full gap-1 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                                  <ExternalLink className="h-3.5 w-3.5" /> Read Full Job Listing
                                </Button>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      <DialogFooter>
                        {selectedJob.url && (
                          <a href={selectedJob.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" className="gap-1">
                              <ExternalLink className="h-3.5 w-3.5" /> Apply Now
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
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-2.5 h-9 text-sm hover:bg-accent">
                            <Star className="h-3.5 w-3.5" />
                            <ChevronDown className="h-3 w-3" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel className="text-xs">Save to Interest Group</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {interestGroups.map((g) => (
                                <DropdownMenuItem key={g.id} onClick={() => addToGroupMutation.mutate({ groupId: g.id, job: selectedJob })}>
                                  <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: g.color }} />
                                  {g.name}
                                </DropdownMenuItem>
                              ))}
                              {interestGroups.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No groups yet</div>
                              )}
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowNewGroup(true)}>
                              <FolderPlus className="h-3.5 w-3.5 mr-2" /> New Group…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Commute estimate + mode selector */}
                  {searchCenter && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        {COMMUTE_MODES.map((m) => {
                          const Icon = m.icon;
                          return (
                            <Button
                              key={m.value}
                              type="button"
                              size="icon"
                              variant={commuteMode === m.value ? "default" : "outline"}
                              className="h-6 w-6"
                              title={m.label}
                              onClick={() => setCommuteMode(m.value)}
                            >
                              <Icon className="h-3 w-3" />
                            </Button>
                          );
                        })}
                        {commuteLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                      {commuteInfo ? (
                        <div className="flex items-center gap-1 text-xs font-medium">
                          {(() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-3.5 w-3.5 text-blue-500" />; })()}
                          ~{commuteInfo.durationMin} min ({commuteInfo.distanceMi} mi)
                          {commuteInfo.estimated && <span className="text-muted-foreground ml-0.5">(est.)</span>}
                        </div>
                      ) : !commuteLoading && (
                        <span className="text-xs text-muted-foreground">Commute unavailable</span>
                      )}

                      {/* Life Anchors commute breakdown (sidebar) */}
                      {lifeAnchors.length > 0 && Object.keys(anchorCommutes).length > 0 && (() => {
                        const totalYearlyCost = lifeAnchors.reduce((sum, a) => {
                          const ac = anchorCommutes[a.id];
                          return sum + (ac ? yearlyCommuteCost(ac.distanceMi) : 0);
                        }, 0);
                        const midSalary = selectedJob.salaryMin
                          ? selectedJob.salaryMax ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2 : selectedJob.salaryMin
                          : null;
                        return (
                        <div className="space-y-1 pt-1 border-t border-dashed">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <Anchor className="h-3 w-3 text-indigo-500" /> Anchors
                          </div>
                          {lifeAnchors.map((anchor, idx) => {
                            const ac = anchorCommutes[anchor.id];
                            return (
                              <div key={anchor.id} className="flex items-center justify-between text-[11px] px-0.5">
                                <span className="flex items-center gap-1 text-muted-foreground truncate">
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: ANCHOR_COLORS[idx % ANCHOR_COLORS.length] }} />
                                  {anchor.label}
                                </span>
                                {ac ? (
                                  <span className="font-medium shrink-0 ml-1">
                                    ~{ac.durationMin}m · {formatCost(yearlyCommuteCost(ac.distanceMi))}/yr
                                  </span>
                                ) : (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            );
                          })}
                          {totalYearlyCost > 0 && (
                            <div className="pt-0.5 border-t space-y-0.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">Commute</span>
                                <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCost(totalYearlyCost)}/yr</span>
                              </div>
                              {midSalary && (
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">Net Salary</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatSalary(midSalary - totalYearlyCost)}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {lifeScoreCache[selectedJob.id] != null && (
                            <div className="flex items-center justify-between pt-0.5 border-t text-[11px]">
                              <span className="font-semibold flex items-center gap-1"><Anchor className="h-2.5 w-2.5 text-indigo-500" /> Life Score</span>
                              <span className={`font-bold ${lifeScoreCache[selectedJob.id] >= 70 ? "text-emerald-600" : lifeScoreCache[selectedJob.id] >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                                {lifeScoreCache[selectedJob.id]}/100
                              </span>
                            </div>
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Street View preview */}
                  {GOOGLE_MAPS_KEY && effectiveJobCoords && (
                    <div className="rounded-lg overflow-hidden border">
                      <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 text-[10px] font-medium text-muted-foreground">
                        <PersonStanding className="h-3 w-3" /> {resolvedAddress ? "Office View" : "Neighborhood"}
                      </div>
                      <img
                        src={`https://maps.googleapis.com/maps/api/streetview?size=400x200&location=${effectiveJobCoords[0]},${effectiveJobCoords[1]}&key=${GOOGLE_MAPS_KEY}`}
                        alt={`Street view near ${resolvedAddress?.address ?? selectedJob.location}`}
                        className="w-full h-[120px] object-cover"
                        loading="lazy"
                      />
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
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-2 h-8 text-xs hover:bg-accent">
                        <Star className="h-3 w-3" />
                        <ChevronDown className="h-3 w-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs">Save to Interest Group</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {interestGroups.map((g) => (
                            <DropdownMenuItem key={g.id} onClick={() => addToGroupMutation.mutate({ groupId: g.id, job: selectedJob })}>
                              <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: g.color }} />
                              {g.name}
                            </DropdownMenuItem>
                          ))}
                          {interestGroups.length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">No groups yet</div>
                          )}
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowNewGroup(true)}>
                          <FolderPlus className="h-3.5 w-3.5 mr-2" /> New Group…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* ── Paginated job list ── */
              <>
                {sortedJobs.length === 0 && (searched || hasEmailLeads) && !isFetching && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No jobs found in this area</p>
                  </div>
                )}
                {pagedJobs.map((job) => (
                  <Card
                    key={job.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => { setSelectedJob(job); setShowDetails(false); }}
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
                      {commuteCache[`${job.id}:driving`] && (
                        <div className="flex items-center gap-0.5 mt-1 text-xs text-blue-600 dark:text-blue-400">
                          <Car className="h-2.5 w-2.5" />
                          ~{commuteCache[`${job.id}:driving`].durationMin} min ({commuteCache[`${job.id}:driving`].distanceMi} mi)
                          {commuteCache[`${job.id}:driving`].estimated && <span className="opacity-60">(est.)</span>}
                        </div>
                      )}
                      {lifeScoreCache[job.id] != null && (
                        <div className="flex items-center gap-0.5 mt-1 text-xs">
                          <Anchor className="h-2.5 w-2.5 text-indigo-500" />
                          <span className={`font-semibold ${lifeScoreCache[job.id] >= 70 ? "text-emerald-600 dark:text-emerald-400" : lifeScoreCache[job.id] >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500"}`}>
                            Life Score: {lifeScoreCache[job.id]}
                          </span>
                        </div>
                      )}
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
      )}

      {/* New Interest Group dialog */}
      <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Interest Group</DialogTitle>
            <DialogDescription>Create a group to save and compare job postings.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim());
            }}
            className="space-y-3"
          >
            <Input
              placeholder="e.g. Top Picks, Compare PM Roles..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewGroup(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!newGroupName.trim() || createGroupMutation.isPending}>
                {createGroupMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FolderPlus className="h-3.5 w-3.5 mr-1" />}
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Email Import Dialog ── */}
      <Dialog open={showEmailImport} onOpenChange={setShowEmailImport}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-purple-600" /> Import Job Leads from Email
            </DialogTitle>
            <DialogDescription>
              Paste email HTML source below, or set up auto-forwarding to import leads automatically.
            </DialogDescription>
          </DialogHeader>

          {/* ── Auto-Forward Setup ── */}
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-3 space-y-2">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300 w-full"
              onClick={async () => {
                if (!showForwardSetup && !ingestToken) {
                  try {
                    const res = await fetch("/api/email-leads/token");
                    const data = await res.json();
                    if (data.token) setIngestToken(data.token);
                  } catch { /* ignore */ }
                }
                setShowForwardSetup(!showForwardSetup);
              }}
            >
              <Link2 className="h-4 w-4" />
              Auto-Forward Setup
              {showForwardSetup ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showForwardSetup && ingestToken && (
              <div className="space-y-2 text-xs">
                <p className="text-muted-foreground">
                  Forward your job alert emails to your unique Resumsify address. Leads are automatically parsed and added to your map.
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 bg-white dark:bg-zinc-900 border rounded px-2 py-1.5 text-[10px] break-all select-all">
                    {typeof window !== "undefined" ? `${window.location.origin}/api/email-leads/ingest?token=${ingestToken}` : ""}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-7 w-7 p-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/email-leads/ingest?token=${ingestToken}`);
                      toast.success("Webhook URL copied!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/email-leads/token", { method: "POST" });
                        const data = await res.json();
                        if (data.token) { setIngestToken(data.token); toast.success("Token regenerated"); }
                      } catch { toast.error("Failed to regenerate token"); }
                    }}
                  >
                    <RefreshCw className="h-3 w-3" /> Regenerate token
                  </button>
                </div>
                {/* ── Google Apps Script guide ── */}
                <div className="rounded border border-dashed border-purple-300 dark:border-purple-700 bg-white dark:bg-zinc-900 p-2 space-y-2 mt-1">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-[11px] font-medium text-purple-700 dark:text-purple-300 w-full"
                    onClick={() => setShowScript(!showScript)}
                  >
                    <Code className="h-3.5 w-3.5" />
                    Gmail Auto-Forward (Apps Script)
                    {showScript ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                  </button>
                  {showScript && (
                    <div className="space-y-2">
                      <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Go to <strong>script.google.com</strong> → New Project</li>
                        <li>Replace the code with the snippet below</li>
                        <li>Replace <code className="bg-zinc-100 dark:bg-zinc-800 px-0.5 rounded">WEBHOOK_URL</code> with your webhook URL above</li>
                        <li>Click <strong>Run</strong> once to authorize Gmail access</li>
                        <li>Set a trigger: <strong>Triggers → Add → forwardJobAlerts → Time-driven → Every 5 min</strong></li>
                      </ol>
                      <div className="relative">
                        <pre className="text-[9px] leading-snug bg-zinc-100 dark:bg-zinc-800 rounded p-2 overflow-x-auto max-h-[25vh] overflow-y-auto whitespace-pre select-all">{`const WEBHOOK_URL = "${typeof window !== "undefined" ? `${window.location.origin}/api/email-leads/ingest?token=${ingestToken}` : ""}";\n\nfunction forwardJobAlerts() {\n  const senders = ["indeed.com", "linkedin.com", "glassdoor.com", "ziprecruiter.com"];\n  const label = GmailApp.getUserLabelByName("Resumsify/Processed")\n    || GmailApp.createLabel("Resumsify/Processed");\n\n  senders.forEach(sender => {\n    GmailApp.search(\`from:\${sender} newer_than:1d -label:Resumsify-Processed\`, 0, 10)\n      .forEach(thread => {\n        thread.getMessages().forEach(msg => {\n          const html = msg.getBody();\n          UrlFetchApp.fetch(WEBHOOK_URL, {\n            method: "post",\n            contentType: "application/json",\n            payload: JSON.stringify({ html }),\n            muteHttpExceptions: true,\n          });\n        });\n        thread.addLabel(label);\n      });\n  });\n}`}</pre>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 bg-white dark:bg-zinc-800"
                          onClick={() => {
                            const script = `const WEBHOOK_URL = "${window.location.origin}/api/email-leads/ingest?token=${ingestToken}";\n\nfunction forwardJobAlerts() {\n  const senders = ["indeed.com", "linkedin.com", "glassdoor.com", "ziprecruiter.com"];\n  const label = GmailApp.getUserLabelByName("Resumsify/Processed")\n    || GmailApp.createLabel("Resumsify/Processed");\n\n  senders.forEach(sender => {\n    GmailApp.search(\`from:\${sender} newer_than:1d -label:Resumsify-Processed\`, 0, 10)\n      .forEach(thread => {\n        thread.getMessages().forEach(msg => {\n          const html = msg.getBody();\n          UrlFetchApp.fetch(WEBHOOK_URL, {\n            method: "post",\n            contentType: "application/json",\n            payload: JSON.stringify({ html }),\n            muteHttpExceptions: true,\n          });\n        });\n        thread.addLabel(label);\n      });\n  });\n}`;
                            navigator.clipboard.writeText(script);
                            toast.success("Apps Script copied!");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-[9px] text-muted-foreground">
                        Runs every 5 min, scans the last 24h of job alert emails, sends them to your webhook, and labels them so they aren&apos;t sent twice.
                      </p>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-muted-foreground space-y-1 mt-1">
                  <p>Or paste email HTML below and click <strong>Test Forward</strong> to simulate an inbound email hitting the webhook.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 text-xs"
                  disabled={emailBody.length < 20 || emailParsing}
                  onClick={async () => {
                    setEmailParsing(true);
                    try {
                      const res = await fetch(`/api/email-leads/ingest?token=${ingestToken}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ html: emailBody }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        toast.error(data.error || "Webhook test failed");
                        return;
                      }
                      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
                      const msg = `Webhook OK — ${data.parsed} parsed, ${data.stored} new, ${data.duplicates} dupes`;
                      data.stored > 0 ? toast.success(msg) : data.parsed === 0 ? toast.warning("No leads found") : toast.info(msg);
                      if (data.stored > 0) { setEmailBody(""); setShowEmailImport(false); }
                    } catch {
                      toast.error("Webhook test failed");
                    } finally {
                      setEmailParsing(false);
                    }
                  }}
                >
                  {emailParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Test Forward {emailBody.length >= 20 ? "(using paste below)" : ""}
                </Button>
              </div>
            )}
          </div>

          {/* ── Manual Paste ── */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Or paste email source manually:</p>
            <Textarea
              placeholder="Paste email HTML source here..."
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              className="text-xs font-mono max-h-[30vh] overflow-y-auto resize-none"
            />
            {emailLeads.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{emailLeads.length} lead{emailLeads.length !== 1 ? "s" : ""} currently imported</span>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 text-xs"
                  onClick={async () => {
                    await fetch("/api/email-leads?all=true", { method: "DELETE" });
                    queryClient.invalidateQueries({ queryKey: ["email-leads"] });
                    toast.success("All email leads cleared");
                  }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEmailImport(false)}>Cancel</Button>
            <Button
              disabled={emailBody.length < 20 || emailParsing}
              onClick={async () => {
                setEmailParsing(true);
                try {
                  const res = await fetch("/api/email-leads/parse", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emailBody }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    toast.error(data.error || "Failed to parse email");
                    return;
                  }
                  queryClient.invalidateQueries({ queryKey: ["email-leads"] });
                  const msg = `Parsed ${data.parsed} lead${data.parsed !== 1 ? "s" : ""}: ${data.stored} new, ${data.duplicates} duplicate${data.duplicates !== 1 ? "s" : ""}`;
                  if (data.stored > 0) {
                    toast.success(msg);
                  } else if (data.parsed === 0) {
                    toast.warning("No job leads found in this email. Try pasting the full HTML source.");
                  } else {
                    toast.info(msg);
                  }
                  setEmailBody("");
                  if (data.stored > 0) setShowEmailImport(false);
                } catch {
                  toast.error("Failed to parse email");
                } finally {
                  setEmailParsing(false);
                }
              }}
              className="gap-1"
            >
              {emailParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {emailParsing ? "Parsing..." : "Import Leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

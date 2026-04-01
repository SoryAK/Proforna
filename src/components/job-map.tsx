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
  EyeOff,
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
  Phone,
  Flag,
  AlertTriangle,
  Settings,
  Fuel,
  Route,
  Repeat2,
  Lightbulb,
  ArrowRightLeft,
  ShieldAlert,
  CheckSquare,
  Square,
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { CompanyDeepDive, type DeepDiveJob } from "@/components/company-deep-dive";

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

/* ── Dynamically loaded map (Google Maps needs browser) ── */
const LeafletMap = dynamic(
  () => import("@/components/job-map-google"),
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

/* ── Known recruiting/staffing firms (seed list) ── */
const KNOWN_RECRUITERS = new Set([
  "robert half", "randstad", "teksystems", "insight global", "adecco",
  "manpowergroup", "manpower", "kelly services", "hays", "kforce",
  "aerotek", "beacon hill", "allegis group", "staffing solutions",
  "express employment", "spherion", "modis", "volt", "apex systems",
  "cybercoders", "jobot", "michael page", "page personnel", "talent solutions",
  "creative circle", "aquent", "mondo", "procom", "collabera",
  "yoh", "msp staffing", "lhh", "lancesoft", "nelson staffing",
  "nesco resource", "cella", "ettain group", "judge group", "genesis10",
]);
const RECRUITER_KEYWORDS = ["staffing", "recruiting", "recruitment", "talent acquisition", "placement", "workforce solutions", "employment agency"];

/** Check if a company name is likely a recruiter */
function isLikelyRecruiter(companyName: string): boolean {
  const lower = companyName.toLowerCase().trim();
  if (KNOWN_RECRUITERS.has(lower)) return true;
  return RECRUITER_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Check if landmark name differs significantly from poster (mismatch = possible recruiter) */
function hasLandmarkMismatch(posterCompany: string, landmarkName: string | null | undefined): boolean {
  if (!landmarkName) return false;
  const poster = posterCompany.toLowerCase().replace(/[^a-z0-9]/g, "");
  const landmark = landmarkName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!poster || !landmark) return false;
  // If one contains the other, no mismatch
  if (poster.includes(landmark) || landmark.includes(poster)) return false;
  return true;
}

/** localStorage-backed recruiter flag set (user-contributed) */
const RECRUITER_FLAGS_KEY = "resumsify:recruiter-flags";
function getFlaggedRecruiters(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(RECRUITER_FLAGS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function flagRecruiter(companyName: string) {
  const set = getFlaggedRecruiters();
  set.add(companyName.toLowerCase().trim());
  localStorage.setItem(RECRUITER_FLAGS_KEY, JSON.stringify([...set]));
}
function unflagRecruiter(companyName: string) {
  const set = getFlaggedRecruiters();
  set.delete(companyName.toLowerCase().trim());
  localStorage.setItem(RECRUITER_FLAGS_KEY, JSON.stringify([...set]));
}
function isUserFlaggedRecruiter(companyName: string): boolean {
  return getFlaggedRecruiters().has(companyName.toLowerCase().trim());
}

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

/* ── Commute Profile ── */
interface CommuteProfile {
  gasPricePerGallon: number;
  vehicleMpg: number;
  daysInOffice: number;
  avoidTolls: boolean;
  departureHour: number; // 0-23
}
const DEFAULT_COMMUTE_PROFILE: CommuteProfile = {
  gasPricePerGallon: 3.50,
  vehicleMpg: 27.5,
  daysInOffice: 5,
  avoidTolls: false,
  departureHour: 8,
};
const COMMUTE_PROFILE_KEY = "resumsify:commute-profile";
function loadCommuteProfile(): CommuteProfile {
  if (typeof window === "undefined") return DEFAULT_COMMUTE_PROFILE;
  try {
    const raw = localStorage.getItem(COMMUTE_PROFILE_KEY);
    return raw ? { ...DEFAULT_COMMUTE_PROFILE, ...JSON.parse(raw) } : DEFAULT_COMMUTE_PROFILE;
  } catch { return DEFAULT_COMMUTE_PROFILE; }
}
function saveCommuteProfile(p: CommuteProfile) {
  localStorage.setItem(COMMUTE_PROFILE_KEY, JSON.stringify(p));
}

/** A single step in a transit itinerary */
interface TransitStep {
  mode: "WALKING" | "TRANSIT";
  durationMin: number;
  distanceMi: number;
  geometry?: [number, number][];
  instructions?: string;
  lineName?: string;
  lineShort?: string;
  vehicleType?: string;
  vehicleIcon?: string;
  lineColor?: string;
  lineTextColor?: string;
  agencyName?: string;
  departureStop?: string;
  departureTime?: string;
  arrivalStop?: string;
  arrivalTime?: string;
  numStops?: number;
}

/** Route option from the API */
interface RouteOption {
  durationMin: number;
  distanceMi: number;
  summary: string;
  durationInTrafficMin?: number;
  geometry?: [number, number][];
  transitSteps?: TransitStep[];
}

/** Yearly roundtrip commute cost using profile or IRS fallback */
function yearlyCommuteCost(distanceMi: number, profile?: CommuteProfile) {
  if (profile) {
    const costPerMile = profile.gasPricePerGallon / profile.vehicleMpg;
    return distanceMi * 2 * profile.daysInOffice * 52 * costPerMile;
  }
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

/* ── Persistent preferences helper ── */
const JOB_PREFS_KEY = "resumsify-job-search-prefs";
interface JobSearchPrefs {
  tileStyle?: string;
  viewMode?: string;
  source?: string;
  radius?: string;
  sortBy?: string;
  showHeatmap?: boolean;
  showTraffic?: boolean;
  showTransit?: boolean;
  commuteMode?: string;
}
function loadJobPrefs(): JobSearchPrefs {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(JOB_PREFS_KEY) || "{}"); } catch { return {}; }
}
function saveJobPref<K extends keyof JobSearchPrefs>(key: K, value: JobSearchPrefs[K]) {
  if (typeof window === "undefined") return;
  try {
    const prefs = loadJobPrefs();
    prefs[key] = value;
    localStorage.setItem(JOB_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* quota exceeded — ignore */ }
}

/* ── Component ── */
export function JobMap() {
  // Load saved preferences once on mount
  const [savedPrefs] = useState(() => loadJobPrefs());

  const [query, setQuery] = useState("");
  const [where, setWhere] = useState("");
  const [radius, setRadius] = useState(() => savedPrefs.radius || "25");
  const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchParams, setSearchParams] = useState<{ q: string; where: string; apiWhere: string; distance: string } | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState(() => savedPrefs.sortBy || "salary-desc");
  const [minSalary, setMinSalary] = useState("");
  const [page, setPage] = useState(1);
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null);
  const [source, setSource] = useState<"adzuna" | "google" | "both">(() => (savedPrefs.source as "adzuna" | "google" | "both") || "both");
  const [commuteProfile, setCommuteProfile] = useState<CommuteProfile>(DEFAULT_COMMUTE_PROFILE);
  const [showCommuteSettings, setShowCommuteSettings] = useState(false);
  const [commuteInfo, setCommuteInfo] = useState<{
    durationMin: number; distanceMi: number; mode?: CommuteMode; estimated?: boolean;
    geometry?: [number, number][];
    durationInTrafficMin?: number;
    routes?: RouteOption[];
    transitSteps?: TransitStep[];
  } | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteMode, setCommuteMode] = useState<CommuteMode>(() => (savedPrefs.commuteMode as CommuteMode) || "driving");
  const [showDetails, setShowDetails] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">(() => (savedPrefs.viewMode as "map" | "list") || "map");
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  /* Map overlays */
  const [showHeatmap, setShowHeatmap] = useState(() => savedPrefs.showHeatmap ?? false);
  const [showTraffic, setShowTraffic] = useState(() => savedPrefs.showTraffic ?? false);
  const [showTransit, setShowTransit] = useState(() => savedPrefs.showTransit ?? false);
  const [tileStyle, setTileStyle] = useState<"osm" | "google-roadmap" | "google-satellite" | "google-hybrid">(() => (savedPrefs.tileStyle as "osm" | "google-roadmap" | "google-satellite" | "google-hybrid") || "osm");

  // Persist preferences on change
  useEffect(() => { saveJobPref("tileStyle", tileStyle); }, [tileStyle]);
  useEffect(() => { saveJobPref("viewMode", viewMode); }, [viewMode]);
  useEffect(() => { saveJobPref("source", source); }, [source]);
  useEffect(() => { saveJobPref("radius", radius); }, [radius]);
  useEffect(() => { saveJobPref("sortBy", sortBy); }, [sortBy]);
  useEffect(() => { saveJobPref("showHeatmap", showHeatmap); }, [showHeatmap]);
  useEffect(() => { saveJobPref("showTraffic", showTraffic); }, [showTraffic]);
  useEffect(() => { saveJobPref("showTransit", showTransit); }, [showTransit]);
  useEffect(() => { saveJobPref("commuteMode", commuteMode); }, [commuteMode]);

  /* Filters */
  const [showFilters, setShowFilters] = useState(false);
  const [datePosted, setDatePosted] = useState("any");
  const [remoteFilter, setRemoteFilter] = useState("any");
  const [employmentType, setEmploymentType] = useState("any");
  const [hoursFilter, setHoursFilter] = useState("any");
  const [categoryFilter, setCategoryFilter] = useState("any");
  const [companyFilter, setCompanyFilter] = useState("any");
  const [maxCommuteMin, setMaxCommuteMin] = useState("any");
  /* Resolved company address — auto-resolved via Places API or manually overridden */
  type ResolvedAddress = {
    address: string; lat: number; lng: number; name: string | null;
    confidence: "high" | "medium" | "low"; totalResults: number;
    allLocations?: { address: string; lat: number; lng: number; name: string | null }[];
    placeId?: string | null;
    website?: string | null;
    phone?: string | null;
    rating?: number | null;
    ratingCount?: number | null;
    businessStatus?: string | null;
    openNow?: boolean | null;
    hours?: string[] | null;
    editorialSummary?: string | null;
    types?: string[] | null;
  };
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressOverride, setAddressOverride] = useState("");
  const [addressCache, setAddressCache] = useState<Record<string, ResolvedAddress>>({});
  const resolveAbort = useRef<AbortController | null>(null);

  /* ── Company Deep Dive ── */
  const [deepDiveCompany, setDeepDiveCompany] = useState<string | null>(null);

  /* ── DB-backed recruiter flags (crowdsourced) ── */
  type RecruiterFlagInfo = { count: number; confirmed: boolean; flaggedByMe: boolean };
  const [recruiterFlagDb, setRecruiterFlagDb] = useState<Record<string, RecruiterFlagInfo>>({});

  /* ── DB-backed address overrides ── */
  type AddressOverrideData = { address: string; lat: number; lng: number; landmarkName: string | null; source: string };
  const [dbOverrides, setDbOverrides] = useState<Record<string, AddressOverrideData>>({});

  /* ── NLP-extracted locations from job description ── */
  const [nlpLocations, setNlpLocations] = useState<string[]>([]);
  const [nlpConfidence, setNlpConfidence] = useState<"high" | "medium" | "none">("none");

  /* ── Duplicate posting groups ── */
  type DuplicateGroup = { canonical: string; duplicates: string[]; reason: string };
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  /* ── Cluster Preview ── */
  type ClusterPreviewData = { jobs: MapJob[]; position: { lat: number; lng: number } };
  const [clusterPreview, setClusterPreview] = useState<ClusterPreviewData | null>(null);

  /* ── Neighborhood Explorer ── */
  const AMENITY_CATEGORIES = [
    { key: "restaurant", emoji: "🍽️", label: "Restaurants", color: "#f97316" },
    { key: "cafe", emoji: "☕", label: "Cafes", color: "#92400e" },
    { key: "gym", emoji: "💪", label: "Gyms", color: "#ef4444" },
    { key: "gas_station", emoji: "⛽", label: "Gas", color: "#3b82f6" },
    { key: "transit_station", emoji: "🚌", label: "Transit", color: "#8b5cf6" },
    { key: "park", emoji: "🌳", label: "Parks", color: "#22c55e" },
  ] as const;
  type AmenityPlace = { name: string; lat: number; lng: number; rating?: number };
  const [activeAmenities, setActiveAmenities] = useState<Set<string>>(new Set());
  const [amenityCache, setAmenityCache] = useState<Record<string, AmenityPlace[]>>({});
  const [amenityLoading, setAmenityLoading] = useState<Set<string>>(new Set());

  /* Pre-fetched commute times for sidebar cards: jobId → { durationMin, distanceMi, estimated? } */
  const [commuteCache, setCommuteCache] = useState<Record<string, { durationMin: number; distanceMi: number; estimated?: boolean }>>({});
  const commuteCacheRef = useRef(commuteCache);
  commuteCacheRef.current = commuteCache;
  /* Refs to guard effects from refiring when only commuteCache changes */
  const prevCompaniesKeyRef = useRef("");
  const prevDuplicateKeyRef = useRef("");
  const prevPagedKeyRef = useRef("");
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
  // Which anchor commutes are visible on the map (toggled per-anchor)
  const [enabledAnchors, setEnabledAnchors] = useState<Set<string>>(new Set());
  const knownAnchorIds = useRef<Set<string>>(new Set());

  // Load commute profile from localStorage on mount
  useEffect(() => { setCommuteProfile(loadCommuteProfile()); }, []);

  // Sync enabledAnchors when lifeAnchors change — only add genuinely new anchors
  useEffect(() => {
    if (lifeAnchors.length === 0) return;
    const currentIds = new Set(lifeAnchors.map((a) => a.id));
    const newIds = [...currentIds].filter((id) => !knownAnchorIds.current.has(id));
    const deletedIds = [...knownAnchorIds.current].filter((id) => !currentIds.has(id));

    if (newIds.length === 0 && deletedIds.length === 0) return;

    knownAnchorIds.current = currentIds;
    setEnabledAnchors((prev) => {
      const next = new Set(prev);
      // Enable new anchors by default
      for (const id of newIds) next.add(id);
      // Remove deleted anchors
      for (const id of deletedIds) next.delete(id);
      return next;
    });
  }, [lifeAnchors]);

  // Email leads
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [emailParsing, setEmailParsing] = useState(false);
  const [showForwardSetup, setShowForwardSetup] = useState(false);
  const [ingestToken, setIngestToken] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

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

  // Bulk selection helpers for email leads
  const emailJobIds = useMemo(() => mergedJobs.filter((j) => j.source === "email").map((j) => j.id), [mergedJobs]);

  const toggleSelectAllLeads = useCallback(() => {
    setSelectedLeads((prev) => {
      if (prev.size === emailJobIds.length && emailJobIds.every((id) => prev.has(id))) return new Set();
      return new Set(emailJobIds);
    });
  }, [emailJobIds]);

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
    if (maxCommuteMin !== "any") n++;
    return n;
  }, [minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter, companyFilter, maxCommuteMin]);

  const clearAllFilters = useCallback(() => {
    setMinSalary("");
    setDatePosted("any");
    setRemoteFilter("any");
    setEmploymentType("any");
    setHoursFilter("any");
    setCategoryFilter("any");
    setCompanyFilter("any");
    setMaxCommuteMin("any");
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

    // Max commute time filter
    if (maxCommuteMin !== "any") {
      const maxMin = Number(maxCommuteMin);
      filtered = filtered.filter((j) => {
        const cached = commuteCache[`${j.id}:driving`];
        if (!cached) return true; // keep jobs with unknown commute
        return cached.durationMin <= maxMin;
      });
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
  }, [geoJobs, sortBy, minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter, companyFilter, maxCommuteMin, commuteCache, lifeScoreCache]);

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
    // Clear neighborhood explorer & cluster preview when job changes
    setActiveAmenities(new Set());
    setClusterPreview(null);

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

  // ── Apply DB address override when selected job changes ──
  useEffect(() => {
    if (!selectedJob) return;
    const ovr = dbOverrides[selectedJob.id];
    if (ovr) {
      setResolvedAddress((prev) => prev ? {
        ...prev,
        address: ovr.address,
        lat: ovr.lat,
        lng: ovr.lng,
        name: ovr.landmarkName,
        confidence: "high",
      } : { address: ovr.address, lat: ovr.lat, lng: ovr.lng, name: ovr.landmarkName, confidence: "high", totalResults: 1 });
      setAddressOverride(ovr.address);
    }
  }, [selectedJob?.id, dbOverrides]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch DB recruiter flags for visible companies ──
  useEffect(() => {
    if (!sortedJobs || sortedJobs.length === 0) return;
    const companies = [...new Set(sortedJobs.map((j) => j.company.toLowerCase().trim()))];
    if (companies.length === 0) return;
    const key = companies.sort().join(",");
    if (key === prevCompaniesKeyRef.current) return; // same companies — skip
    prevCompaniesKeyRef.current = key;
    fetch(`/api/recruiter-flags?companies=${encodeURIComponent(companies.join(","))}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.flags) setRecruiterFlagDb(d.flags); })
      .catch(() => {});
  }, [sortedJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch DB address overrides for selected job ──
  useEffect(() => {
    if (!selectedJob) return;
    if (dbOverrides[selectedJob.id]) return; // already loaded
    fetch(`/api/address-overrides?jobKeys=${encodeURIComponent(selectedJob.id)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.overrides) setDbOverrides((prev) => ({ ...prev, ...d.overrides })); })
      .catch(() => {});
  }, [selectedJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── NLP extraction of real location from job description ──
  useEffect(() => {
    setNlpLocations([]);
    setNlpConfidence("none");
    if (!selectedJob?.description) return;
    const isRecruiter = isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || recruiterFlagDb[selectedJob.company.toLowerCase().trim()]?.confirmed;
    // Only bother with NLP if job appears recruiter-sourced or has landmark mismatch
    if (!isRecruiter && !hasLandmarkMismatch(selectedJob.company, resolvedAddress?.name)) return;
    fetch("/api/extract-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: selectedJob.description, company: selectedJob.company }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setNlpLocations(d.locations ?? []); setNlpConfidence(d.confidence ?? "none"); } })
      .catch(() => {});
  }, [selectedJob?.id, selectedJob?.description, resolvedAddress?.name, recruiterFlagDb]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect duplicate postings across current results ──
  useEffect(() => {
    if (!sortedJobs || sortedJobs.length < 2) { setDuplicateGroups([]); return; }
    const idsKey = sortedJobs.map((j) => j.id).sort().join(",");
    if (idsKey === prevDuplicateKeyRef.current) return; // same jobs — skip
    prevDuplicateKeyRef.current = idsKey;
    const payload = sortedJobs.slice(0, 200).map((j) => ({
      id: j.id, title: j.title, company: j.company, location: j.location,
      description: j.description?.slice(0, 500),
    }));
    fetch("/api/detect-duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: payload }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.groups) setDuplicateGroups(d.groups); })
      .catch(() => {});
  }, [sortedJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compute dimmed marker IDs (recruiter-flagged jobs) ──
  const prevDimmedIdsRef = useRef<Set<string>>(new Set());
  const dimmedIds = useMemo(() => {
    const set = new Set<string>();
    for (const job of sortedJobs) {
      const norm = job.company.toLowerCase().trim();
      if (isLikelyRecruiter(job.company) || isUserFlaggedRecruiter(job.company) || recruiterFlagDb[norm]?.confirmed) {
        set.add(job.id);
      }
    }
    // Return the previous Set reference if contents haven't changed (prevents marker rebuild)
    const prev = prevDimmedIdsRef.current;
    if (set.size === prev.size && [...set].every((id) => prev.has(id))) return prev;
    prevDimmedIdsRef.current = set;
    return set;
  }, [sortedJobs, recruiterFlagDb]);

  /** Check if a job is part of a duplicate group */
  function getDuplicateInfo(jobId: string): DuplicateGroup | null {
    for (const g of duplicateGroups) {
      if (g.canonical === jobId || g.duplicates.includes(jobId)) return g;
    }
    return null;
  }

  /** Toggle amenity category — fetch if needed, show/hide pins */
  async function toggleAmenityCategory(catKey: string) {
    setActiveAmenities((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) { next.delete(catKey); return next; }
      next.add(catKey);
      return next;
    });

    // Fetch if not cached for this location
    const coords = effectiveJobCoords;
    if (!coords) return;
    const coordKey = `${coords[0]},${coords[1]}`;
    const cacheKey = `${coordKey}:${catKey}`;
    if (amenityCache[cacheKey]) return; // already fetched

    setAmenityLoading((prev) => new Set(prev).add(catKey));
    try {
      const res = await fetch("/api/nearby-amenities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: coords[0], lng: coords[1], categories: [catKey] }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results?.[catKey]) {
          setAmenityCache((prev) => ({ ...prev, [cacheKey]: data.results[catKey] }));
        }
      }
    } catch { /* failed silently */ }
    setAmenityLoading((prev) => { const next = new Set(prev); next.delete(catKey); return next; });
  }

  /** Computed amenity pins for the map */
  const amenityPinsForMap = useMemo(() => {
    if (activeAmenities.size === 0 || !effectiveJobCoords) return [];
    const coordKey = `${effectiveJobCoords[0]},${effectiveJobCoords[1]}`;
    const pins: { category: string; lat: number; lng: number; name: string; rating?: number; color: string; emoji: string }[] = [];
    for (const cat of activeAmenities) {
      const cacheKey = `${coordKey}:${cat}`;
      const places = amenityCache[cacheKey];
      if (!places) continue;
      const info = AMENITY_CATEGORIES.find((c) => c.key === cat);
      if (!info) continue;
      for (const p of places) {
        pins.push({ category: cat, lat: p.lat, lng: p.lng, name: p.name, rating: p.rating, color: info.color, emoji: info.emoji });
      }
    }
    return pins;
  }, [activeAmenities, amenityCache, effectiveJobCoords]);

  /** Amenity radius config for the map */
  const amenityRadiusForMap = useMemo(() => {
    if (activeAmenities.size === 0 || !effectiveJobCoords) return null;
    return { lat: effectiveJobCoords[0], lng: effectiveJobCoords[1], radiusM: 800 };
  }, [activeAmenities, effectiveJobCoords]);

  /** Toggle recruiter flag (DB-backed) */
  async function toggleRecruiterFlag(companyName: string) {
    const norm = companyName.toLowerCase().trim();
    // Optimistic local update
    const prev = recruiterFlagDb[norm];
    const wasFlagged = prev?.flaggedByMe ?? false;
    setRecruiterFlagDb((p) => ({
      ...p,
      [norm]: {
        count: (prev?.count ?? 0) + (wasFlagged ? -1 : 1),
        confirmed: false,
        flaggedByMe: !wasFlagged,
      },
    }));
    // Also toggle localStorage for backwards compat
    if (wasFlagged) unflagRecruiter(companyName); else flagRecruiter(companyName);
    // Persist to DB
    try {
      const res = await fetch("/api/recruiter-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: companyName }),
      });
      if (res.ok) {
        const d = await res.json();
        setRecruiterFlagDb((p) => ({
          ...p,
          [norm]: { count: d.count, confirmed: d.confirmed, flaggedByMe: d.flagged },
        }));
      }
    } catch { /* keep optimistic state */ }
    // Force re-render
    if (selectedJob) setSelectedJob({ ...selectedJob });
  }

  /** Save address override to DB */
  async function saveAddressOverride(jobKey: string, address: string, lat: number, lng: number, landmarkName?: string | null, source?: string) {
    setDbOverrides((p) => ({ ...p, [jobKey]: { address, lat, lng, landmarkName: landmarkName ?? null, source: source ?? "manual" } }));
    try {
      await fetch("/api/address-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobKey, address, lat, lng, landmarkName, source }),
      });
    } catch { /* keep optimistic state */ }
  }

  /** Use an NLP-extracted location as the override */
  async function applyNlpLocation(location: string) {
    const result = await geocodeOverride(location);
    if (result) {
      setResolvedAddress(result);
      setAddressOverride(location);
      if (selectedJob) {
        await saveAddressOverride(selectedJob.id, result.address, result.lat, result.lng, result.name, "nlp");
      }
      toast.success(`Address updated to ${location}`);
    } else {
      toast.error("Could not resolve that location");
    }
  }

  /** One-click swap: use the landmark company as the real employer's address */
  async function swapToLandmark() {
    if (!selectedJob || !resolvedAddress?.name) return;
    // Already resolved to this address, just save as override
    await saveAddressOverride(selectedJob.id, resolvedAddress.address, resolvedAddress.lat, resolvedAddress.lng, resolvedAddress.name, "landmark-swap");
    toast.success(`Confirmed: location is ${resolvedAddress.name}`);
  }

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
    if (commuteProfile.avoidTolls) params.set("avoidTolls", "true");

    // Phase 1: fast duration/distance with alternatives (no geometry)
    const fastCtrl = new AbortController();
    commuteAbort.current = fastCtrl;

    if (!cached) {
      const fastParams = new URLSearchParams(params);
      fastParams.set("alternatives", "true");
      // Use departure_time for traffic-aware estimates (next occurrence of user's departure hour)
      if (commuteMode === "driving" || commuteMode === "transit") {
        const now = new Date();
        const dep = new Date(now);
        dep.setHours(commuteProfile.departureHour, 0, 0, 0);
        if (dep.getTime() <= now.getTime()) dep.setDate(dep.getDate() + 1);
        fastParams.set("departureTime", String(Math.floor(dep.getTime() / 1000)));
      }

      fetch(`/api/commute?${fastParams}`, { signal: fastCtrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && !fastCtrl.signal.aborted) {
            setCommuteInfo({
              durationMin: d.durationMin,
              distanceMi: d.distanceMi,
              mode: commuteMode,
              estimated: d.estimated,
              durationInTrafficMin: d.durationInTrafficMin,
              routes: d.routes,
              transitSteps: d.transitSteps,
            });
            setCommuteCache((prev) => ({ ...prev, [cacheKey]: d }));
          }
        })
        .catch(() => {})
        .finally(() => { if (!fastCtrl.signal.aborted) setCommuteLoading(false); });
    }

    // Phase 2: full geometry in background (for route polyline on map)
    const geoCtrl = new AbortController();
    geometryAbort.current = geoCtrl;

    const geoParams = new URLSearchParams(params);
    geoParams.set("geometry", "true");
    geoParams.set("alternatives", "true");
    if (commuteProfile.avoidTolls) geoParams.set("avoidTolls", "true");
    if (commuteMode === "driving" || commuteMode === "transit") {
      const now = new Date();
      const dep = new Date(now);
      dep.setHours(commuteProfile.departureHour, 0, 0, 0);
      if (dep.getTime() <= now.getTime()) dep.setDate(dep.getDate() + 1);
      geoParams.set("departureTime", String(Math.floor(dep.getTime() / 1000)));
    }

    fetch(`/api/commute?${geoParams}`, { signal: geoCtrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !geoCtrl.signal.aborted) {
          setCommuteInfo((prev) => prev ? {
            ...prev,
            geometry: d.geometry,
            routes: d.routes ?? prev.routes,
            transitSteps: d.transitSteps ?? prev.transitSteps,
          } : d);
        }
      })
      .catch(() => {});

    return () => {
      fastCtrl.abort();
      geoCtrl.abort();
    };
  }, [selectedJob, searchCenter, commuteMode, effectiveJobCoords, addressLoading, commuteProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-fetch commute times for visible sidebar cards (driving only for speed) ──
  useEffect(() => {
    if (!searchCenter || pagedJobs.length === 0) return;
    // Only restart the fetch when the actual page of jobs changes, not on every commuteCache update
    const pageKey = pagedJobs.map((j) => j.id).join(",") + `@${searchCenter[0]},${searchCenter[1]}`;
    if (pageKey === prevPagedKeyRef.current) return;
    prevPagedKeyRef.current = pageKey;

    prefetchAbort.current?.abort();
    const ctrl = new AbortController();
    prefetchAbort.current = ctrl;

    // Only pre-fetch for jobs we haven't cached yet (limit to first 10)
    const uncached = pagedJobs.filter((j) => j.lat && j.lng && !commuteCacheRef.current[`${j.id}:driving`]).slice(0, 10);
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

  // Dismiss an email lead (delete from DB)
  const dismissLeadMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // jobId is "email-<uuid>" — strip the prefix
      const leadId = jobId.replace(/^email-/, "");
      const res = await fetch(`/api/email-leads/${leadId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
      toast.success("Lead dismissed");
    },
    onError: () => toast.error("Failed to dismiss lead"),
  });

  // Bulk dismiss selected email leads
  const bulkDismissMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const leadIds = ids.map((id) => id.replace(/^email-/, ""));
      const res = await fetch("/api/email-leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: leadIds }),
      });
      if (!res.ok) throw new Error("Failed to bulk dismiss");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
      setSelectedLeads(new Set());
      toast.success(`Dismissed ${data.deleted} lead${data.deleted === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Failed to bulk dismiss leads"),
  });

  // Dismiss ALL email leads
  const dismissAllLeadsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/email-leads?all=true", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to dismiss all");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
      setSelectedLeads(new Set());
      toast.success(`Dismissed all ${data.deleted} lead${data.deleted === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Failed to dismiss all leads"),
  });

  const toggleLeadSelection = useCallback((jobId: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

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
    // Reset guard refs so effects re-fire for the new search results
    prevCompaniesKeyRef.current = "";
    prevDuplicateKeyRef.current = "";
    prevPagedKeyRef.current = "";
  }, [query, where, radius]);

  /* Escape key to deselect */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedJob) {
        setSelectedJob(null);
        setShowDetails(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedJob]);

  /* Auto-scroll sidebar to selected job in map view */
  useEffect(() => {
    if (!selectedJob || viewMode !== "map") return;
    const el = document.querySelector(`[data-job-id="${selectedJob.id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedJob, viewMode]);

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
      {/* ── Row 1: Search inputs ── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSearch();
        }}
        className="relative z-20 flex items-center gap-2"
      >
        <div className="relative w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Job title or keywords..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <PlacesAutocomplete
          value={where}
          onChange={setWhere}
          placeholder="Address or city..."
          className="w-48"
          types={[]}
        />
        <Select value={radius} onValueChange={(v) => setRadius(v ?? "25")}>
          <SelectTrigger className="w-24 h-9">
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
          <SelectTrigger className="w-28 h-9">
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
        <Button type="submit" disabled={isFetching} className="h-9">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1.5">Search</span>
        </Button>
      </form>

      {/* ── Row 2: Stats + legend + map controls + view toggle ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {/* Result count */}
        {searched && totalCount > 0 && (
          <span className="whitespace-nowrap">
            {geoJobs.length.toLocaleString()} jobs
            {totalCount > geoJobs.length && (
              <span> / {totalCount.toLocaleString()}</span>
            )}
            {sortedJobs.length < geoJobs.length && (
              <span> ({sortedJobs.length} filtered)</span>
            )}
          </span>
        )}
        {searched && totalCount > 0 && meanSalary && (
          <Badge variant="outline" className="gap-1 h-6 text-xs">
            <DollarSign className="h-3 w-3" />
            Avg {formatSalary(meanSalary)}
          </Badge>
        )}

        {/* Legend (map view only) */}
        {viewMode === "map" && sortedJobs.length > 0 && (
          <>
            <span className="h-4 w-px bg-border" />
            <span className="flex items-center gap-1 text-[10px]">
              <CircleDot className="h-2.5 w-2.5 text-green-500" /> Above avg
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <CircleDot className="h-2.5 w-2.5 text-yellow-500" /> Near avg
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <CircleDot className="h-2.5 w-2.5 text-red-500" /> Below avg
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <CircleDot className="h-2.5 w-2.5 text-blue-500" /> No data
            </span>
            <span className="h-4 w-px bg-border" />
            <Button
              type="button"
              variant={showHeatmap ? "default" : "outline"}
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setShowHeatmap((v) => !v)}
            >
              <Flame className="h-3 w-3" />
              Heatmap
            </Button>
            <Button
              type="button"
              variant={showTraffic ? "default" : "outline"}
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setShowTraffic((v) => !v)}
            >
              <Car className="h-3 w-3" />
              Traffic
            </Button>
            <Button
              type="button"
              variant={showTransit ? "default" : "outline"}
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setShowTransit((v) => !v)}
            >
              <TrainFront className="h-3 w-3" />
              Transit
            </Button>
            <Select value={tileStyle} onValueChange={(v) => setTileStyle((v ?? "osm") as typeof tileStyle)}>
              <SelectTrigger className="h-6 w-28 text-xs">
                <Layers className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="osm">OSM</SelectItem>
                <SelectItem value="google-roadmap">Google Road</SelectItem>
                <SelectItem value="google-satellite">Satellite</SelectItem>
                <SelectItem value="google-hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}

        {/* Map / List toggle — pushed to end */}
        <div className="flex border rounded-md overflow-hidden ml-auto">
          <Button
            type="button"
            size="icon"
            variant={viewMode === "map" ? "default" : "ghost"}
            className="rounded-none h-7 w-7"
            onClick={() => setViewMode("map")}
            title="Map view"
          >
            <MapIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={viewMode === "list" ? "default" : "ghost"}
            className="rounded-none h-7 w-7"
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Max Commute
                        </label>
                        <Select value={maxCommuteMin} onValueChange={(v) => setMaxCommuteMin(v ?? "any")}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any time</SelectItem>
                            <SelectItem value="15">≤ 15 min</SelectItem>
                            <SelectItem value="30">≤ 30 min</SelectItem>
                            <SelectItem value="45">≤ 45 min</SelectItem>
                            <SelectItem value="60">≤ 1 hour</SelectItem>
                            <SelectItem value="90">≤ 1.5 hours</SelectItem>
                            <SelectItem value="120">≤ 2 hours</SelectItem>
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
              {/* Bulk actions bar for email leads */}
              {emailJobIds.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-7"
                    onClick={toggleSelectAllLeads}
                  >
                    {selectedLeads.size === emailJobIds.length && emailJobIds.length > 0
                      ? <><CheckSquare className="h-3 w-3" /> Deselect All</>
                      : <><Square className="h-3 w-3" /> Select All Email Leads</>}
                  </Button>
                  {selectedLeads.size > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5 text-xs h-7"
                      disabled={bulkDismissMutation.isPending}
                      onClick={() => bulkDismissMutation.mutate(Array.from(selectedLeads))}
                    >
                      <Trash2 className="h-3 w-3" />
                      Dismiss Selected ({selectedLeads.size})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs h-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    disabled={dismissAllLeadsMutation.isPending}
                    onClick={() => dismissAllLeadsMutation.mutate()}
                  >
                    <Trash2 className="h-3 w-3" /> Dismiss All ({emailJobIds.length})
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pagedJobs.map((job) => {
                  const desc = stripHtml(job.description);
                  const isExpanded = expandedDescs.has(job.id);
                  return (
                    <Card key={job.id} className={`flex flex-col ${job.source === "email" && selectedLeads.has(job.id) ? "ring-2 ring-purple-500" : ""}`}>
                      <CardContent className="pt-4 space-y-2 flex-1">
                        {/* Header: thumbnail + title/company */}
                        <div className="flex gap-3">
                          {job.source === "email" && (
                            <button
                              type="button"
                              className="self-center shrink-0 text-purple-500 hover:text-purple-700"
                              onClick={() => toggleLeadSelection(job.id)}
                            >
                              {selectedLeads.has(job.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            </button>
                          )}
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
                            <button
                              type="button"
                              className="text-xs text-muted-foreground truncate hover:text-primary hover:underline transition-colors text-left"
                              onClick={(e) => { e.stopPropagation(); setDeepDiveCompany(job.company); }}
                            >
                              {job.company}
                            </button>
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
                        {job.source === "email" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => dismissLeadMutation.mutate(job.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
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

        </div>
      )}

      {/* ── MAP VIEW ── */}
      {viewMode === "map" && (
      <div className="flex gap-3 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border bg-muted relative">
          <LeafletMap
              jobs={selectedJob ? sortedJobs.filter(j => j.id === selectedJob.id) : sortedJobs}
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
              transitSteps={commuteInfo?.transitSteps}
              anchorRoutes={
                selectedJob && anchorCommutes
                  ? Object.entries(anchorCommutes)
                    .filter(([aId]) => enabledAnchors.has(aId))
                    .map(([aId, info], i) => ({
                      anchorId: aId,
                      geometry: (info as any)?.geometry ?? null,
                      color: ANCHOR_COLORS[lifeAnchors.findIndex((a) => a.id === aId) % ANCHOR_COLORS.length],
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
              showTraffic={showTraffic}
              showTransit={showTransit}
              tileStyle={tileStyle}
              resolvedCoords={effectiveJobCoords}
              highlightedIds={pagedJobs.map((j) => j.id)}
              sweetSpot={sweetSpot}
              officeLocations={resolvedAddress?.allLocations}
              onSelectOffice={(office) => {
                setResolvedAddress((prev) => prev ? {
                  ...prev,
                  address: office.address,
                  lat: office.lat,
                  lng: office.lng,
                  name: office.name,
                  confidence: "high",
                } : null);
                toast.success(`Selected: ${office.name || office.address}`);
              }}
              enabledAnchorIds={enabledAnchors}
              onToggleAnchor={(anchorId) => setEnabledAnchors((prev) => {
                const next = new Set(prev);
                next.has(anchorId) ? next.delete(anchorId) : next.add(anchorId);
                return next;
              })}
              dimmedIds={dimmedIds}
              onClusterPreview={(jobs, position) => setClusterPreview({ jobs, position })}
              amenityPins={amenityPinsForMap}
              amenityRadius={amenityRadiusForMap}
            />

          {/* ── Cluster Preview Card ── */}
          {clusterPreview && (
            <div
              className="absolute top-3 left-3 z-[1100] bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-4 w-72 max-h-64 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{clusterPreview.jobs.length} jobs here</span>
                <button onClick={() => setClusterPreview(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              {/* Top companies */}
              {(() => {
                const companies = new Map<string, number>();
                let minSal = Infinity, maxSal = -Infinity;
                for (const j of clusterPreview.jobs) {
                  const co = j.company || "Unknown";
                  companies.set(co, (companies.get(co) || 0) + 1);
                  const sal = j.salaryMax ?? j.salaryMin;
                  if (sal) { minSal = Math.min(minSal, sal); maxSal = Math.max(maxSal, sal); }
                }
                const topCos = [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                return (
                  <>
                    <div className="space-y-1 mb-2">
                      {topCos.map(([co, count]) => (
                        <div key={co} className="flex justify-between text-xs">
                          <span className="truncate max-w-[180px]">{co}</span>
                          <span className="text-muted-foreground">{count} job{count > 1 ? "s" : ""}</span>
                        </div>
                      ))}
                      {companies.size > 3 && <div className="text-xs text-muted-foreground">+{companies.size - 3} more companies</div>}
                    </div>
                    {minSal !== Infinity && (
                      <div className="text-xs text-muted-foreground mb-2">
                        Salary range: ${Math.round(minSal / 1000)}k – ${Math.round(maxSal / 1000)}k
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex gap-2">
                <button
                  className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1 hover:bg-primary/90"
                  onClick={() => {
                    setClusterPreview(null);
                    // Select first job in cluster to zoom in
                    if (clusterPreview.jobs.length > 0) {
                      setSelectedJob(clusterPreview.jobs[0]);
                      setShowDetails(false);
                    }
                  }}
                >
                  Zoom In
                </button>
                <button
                  className="flex-1 text-xs border rounded px-2 py-1 hover:bg-muted"
                  onClick={() => setClusterPreview(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* ── Neighborhood Explorer Pill Bar ── */}
          {selectedJob && effectiveJobCoords && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1100] flex gap-1.5 bg-background/90 backdrop-blur-md border rounded-full px-3 py-1.5 shadow-lg">
              {AMENITY_CATEGORIES.map((cat) => {
                const isActive = activeAmenities.has(cat.key);
                const isLoading = amenityLoading.has(cat.key);
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleAmenityCategory(cat.key)}
                    title={cat.label}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    style={isActive ? { backgroundColor: cat.color } : undefined}
                  >
                    <span>{cat.emoji}</span>
                    {isLoading && <span className="animate-spin text-[10px]">⏳</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Overlay states on top of the map */}
          {!searched && !hasEmailLeads && (
            <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center text-muted-foreground gap-2 pointer-events-none">
              <div className="bg-background/80 backdrop-blur-sm rounded-xl px-6 py-4 flex flex-col items-center gap-2 shadow-lg">
                <MapPin className="h-8 w-8 opacity-50" />
                <p className="text-sm font-medium">Search for jobs to see them on the map</p>
                {profile?.city && (
                  <p className="text-xs opacity-70">
                    Default location: {profile.city}, {profile.state}
                  </p>
                )}
              </div>
            </div>
          )}
          {isFetching && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
              <div className="bg-background/80 backdrop-blur-sm rounded-xl px-6 py-4 flex items-center gap-2 shadow-lg text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Searching{source === "google" ? " Google Jobs" : source === "adzuna" ? " Adzuna" : ""}...
              </div>
            </div>
          )}

          {/* ── Floating job info card on map ── */}
          {selectedJob && (
            <div className="absolute top-3 left-3 z-[1000] w-80 max-h-[calc(100%-24px)] overflow-y-auto rounded-xl border bg-background/95 backdrop-blur-sm shadow-xl">
              <div className="p-3 space-y-2.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm leading-tight">{selectedJob.title}</h3>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors text-left"
                      onClick={() => setDeepDiveCompany(selectedJob.company)}
                    >
                      {selectedJob.company}
                    </button>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 h-6 w-6"
                    onClick={() => { setSelectedJob(null); setShowDetails(false); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="gap-1 text-[10px] h-5">
                    <MapPin className="h-2.5 w-2.5" /> {selectedJob.location}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] h-5 ${sourceBadge(selectedJob.source).className}`}
                  >
                    {sourceBadge(selectedJob.source).label}
                  </Badge>
                  {selectedJob.contractTime && (
                    <Badge variant="outline" className="text-[10px] h-5 capitalize">
                      {selectedJob.contractTime.replace("_", " ")}
                    </Badge>
                  )}
                </div>

                {/* Salary */}
                {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                  <div className="flex items-center gap-1 text-sm">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-medium">
                      {selectedJob.salaryMin && formatSalary(selectedJob.salaryMin)}
                      {selectedJob.salaryMin && selectedJob.salaryMax && " – "}
                      {selectedJob.salaryMax && formatSalary(selectedJob.salaryMax)}
                    </span>
                    {selectedJob.salaryPredicted && (
                      <span className="text-[10px] text-muted-foreground">(est.)</span>
                    )}
                  </div>
                )}

                {/* Resolved address */}
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
                      geocodeOverride(v).then((d) => {
                        if (d) {
                          setResolvedAddress(d);
                          if (selectedJob) saveAddressOverride(selectedJob.id, d.address, d.lat, d.lng, d.name, "manual");
                        }
                      });
                    }}
                    placeholder={resolvedAddress ? "Override address…" : "Enter exact address…"}
                    className="h-7 text-xs"
                  />
                </div>

                {/* "via recruiter" confidence badge + flag count */}
                {selectedJob && (() => {
                  const norm = selectedJob.company.toLowerCase().trim();
                  const dbInfo = recruiterFlagDb[norm];
                  const isRecruiter = isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || dbInfo?.confirmed;
                  const dupInfo = getDuplicateInfo(selectedJob.id);
                  if (!isRecruiter && !dupInfo) return null;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isRecruiter && (
                          <Badge variant="outline" className="text-[10px] h-5 gap-1 border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400">
                            <ShieldAlert className="h-2.5 w-2.5" /> via recruiter
                          </Badge>
                        )}
                        {dbInfo && dbInfo.count > 0 && (
                          <span className="text-[9px] text-muted-foreground">
                            {dbInfo.count} flag{dbInfo.count !== 1 ? "s" : ""}{dbInfo.confirmed ? " · confirmed" : ""}
                          </span>
                        )}
                        {dupInfo && (
                          <Badge variant="outline" className="text-[10px] h-5 gap-1 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                            <Repeat2 className="h-2.5 w-2.5" /> Duplicate posting
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Landmark mismatch alert + one-click swap */}
                {resolvedAddress && selectedJob && hasLandmarkMismatch(selectedJob.company, resolvedAddress.name) && (
                  <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 space-y-1.5">
                    <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Google identifies this location as <strong>{resolvedAddress.name}</strong>
                        {isLikelyRecruiter(selectedJob.company) && <span> — poster may be a staffing agency</span>}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/50"
                      onClick={swapToLandmark}
                    >
                      <ArrowRightLeft className="h-2.5 w-2.5" /> Confirm as {resolvedAddress.name}
                    </Button>
                  </div>
                )}

                {/* "Where's the office?" for recruiter-flagged jobs */}
                {selectedJob && (isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || recruiterFlagDb[selectedJob.company.toLowerCase().trim()]?.confirmed) && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-2.5 py-1.5 space-y-1.5">
                    <p className="text-[10px] text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" /> This job was posted by a recruiter. Know the actual office?
                    </p>
                    <PlacesAutocomplete
                      value={addressOverride}
                      onChange={(v) => {
                        setAddressOverride(v);
                        if (!v.trim()) return;
                        geocodeOverride(v).then((d) => {
                          if (d) {
                            setResolvedAddress(d);
                            if (selectedJob) saveAddressOverride(selectedJob.id, d.address, d.lat, d.lng, d.name, "manual");
                          }
                        });
                      }}
                      placeholder="Enter real office address…"
                      className="h-7 text-xs"
                      types={["address", "establishment"]}
                    />
                    {/* NLP-extracted suggestions */}
                    {nlpLocations.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] text-muted-foreground">Detected in description:</p>
                        {nlpLocations.map((loc, i) => (
                          <Button
                            key={i}
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/30"
                            onClick={() => applyNlpLocation(loc)}
                          >
                            <MapPin className="h-2.5 w-2.5 mr-0.5" /> {loc}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Recruiter flag toggle button */}
                {selectedJob && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-orange-600"
                      onClick={() => toggleRecruiterFlag(selectedJob.company)}
                      title={isUserFlaggedRecruiter(selectedJob.company) ? "Unflag as recruiter" : "Flag as recruiter/staffing"}
                    >
                      <Flag className="h-2.5 w-2.5 mr-0.5" />
                      {(isUserFlaggedRecruiter(selectedJob.company) || recruiterFlagDb[selectedJob.company.toLowerCase().trim()]?.flaggedByMe) ? "Unflag recruiter" : "Flag as recruiter"}
                    </Button>
                  </div>
                )}

                {/* Google Places enrichment */}
                {resolvedAddress && (resolvedAddress.website || resolvedAddress.phone || resolvedAddress.rating != null || resolvedAddress.editorialSummary) && (
                  <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <Building2 className="h-3 w-3" /> Business Info
                    </div>
                    {resolvedAddress.editorialSummary && (
                      <p className="text-[11px] text-muted-foreground leading-snug">{resolvedAddress.editorialSummary}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {resolvedAddress.rating != null && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{resolvedAddress.rating}</span>
                          {resolvedAddress.ratingCount != null && (
                            <span className="text-muted-foreground">({resolvedAddress.ratingCount.toLocaleString()})</span>
                          )}
                        </span>
                      )}
                      {resolvedAddress.businessStatus && resolvedAddress.businessStatus !== "OPERATIONAL" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">
                          {resolvedAddress.businessStatus.replace(/_/g, " ")}
                        </Badge>
                      )}
                      {resolvedAddress.openNow !== undefined && (
                        <Badge variant="outline" className={`text-[10px] h-4 px-1 ${resolvedAddress.openNow ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400" : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"}`}>
                          {resolvedAddress.openNow ? "Open Now" : "Closed"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {resolvedAddress.website && (
                        <a href={resolvedAddress.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[180px]">
                          <Globe className="h-3 w-3 shrink-0" />
                          {new URL(resolvedAddress.website).hostname.replace("www.", "")}
                        </a>
                      )}
                      {resolvedAddress.phone && (
                        <a href={`tel:${resolvedAddress.phone}`} className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          {resolvedAddress.phone}
                        </a>
                      )}
                    </div>
                    {resolvedAddress.hours && resolvedAddress.hours.length > 0 && (
                      <details className="text-[10px] text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> Hours
                        </summary>
                        <div className="mt-1 space-y-0.5 pl-3">
                          {resolvedAddress.hours.map((h, i) => (
                            <div key={i}>{h}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Street View of office location */}
                {resolvedAddress && (
                  <details className="rounded-lg border bg-muted/30 overflow-hidden">
                    <summary className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Street View
                    </summary>
                    <div className="relative">
                      <img
                        src={`https://maps.googleapis.com/maps/api/streetview?size=320x180&location=${resolvedAddress.lat},${resolvedAddress.lng}&fov=90&heading=0&pitch=10&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                        alt={`Street view of ${resolvedAddress.address}`}
                        className="w-full h-[140px] object-cover"
                        loading="lazy"
                      />
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${resolvedAddress.lat},${resolvedAddress.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/70 text-white text-[10px] px-2 py-1 rounded hover:bg-black/90 transition-colors"
                      >
                        <ExternalLink className="h-2.5 w-2.5" /> Open 360°
                      </a>
                    </div>
                  </details>
                )}

                {/* Commute + transport mode selector */}
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
                      <Popover open={showCommuteSettings} onOpenChange={setShowCommuteSettings}>
                        <PopoverTrigger
                          className="inline-flex items-center justify-center h-6 w-6 ml-auto rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Commute settings"
                        >
                            <Settings className="h-3 w-3" />
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3 space-y-3" align="end">
                          <div className="text-xs font-semibold">Commute Profile</div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">Gas $/gal</Label>
                              <Input
                                type="number" step="0.10" min="1" max="10"
                                value={commuteProfile.gasPricePerGallon}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || DEFAULT_COMMUTE_PROFILE.gasPricePerGallon;
                                  const p = { ...commuteProfile, gasPricePerGallon: v };
                                  setCommuteProfile(p); saveCommuteProfile(p);
                                }}
                                className="h-7 w-20 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">Vehicle MPG</Label>
                              <Input
                                type="number" step="0.5" min="5" max="150"
                                value={commuteProfile.vehicleMpg}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || DEFAULT_COMMUTE_PROFILE.vehicleMpg;
                                  const p = { ...commuteProfile, vehicleMpg: v };
                                  setCommuteProfile(p); saveCommuteProfile(p);
                                }}
                                className="h-7 w-20 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">Days in office/wk</Label>
                              <Input
                                type="number" step="1" min="1" max="7"
                                value={commuteProfile.daysInOffice}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value) || DEFAULT_COMMUTE_PROFILE.daysInOffice;
                                  const p = { ...commuteProfile, daysInOffice: Math.min(7, Math.max(1, v)) };
                                  setCommuteProfile(p); saveCommuteProfile(p);
                                }}
                                className="h-7 w-20 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">Departure hour</Label>
                              <Select
                                value={String(commuteProfile.departureHour)}
                                onValueChange={(v) => {
                                  const p = { ...commuteProfile, departureHour: parseInt(v ?? "8") };
                                  setCommuteProfile(p); saveCommuteProfile(p);
                                }}
                              >
                                <SelectTrigger className="h-7 w-20 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 24 }, (_, i) => (
                                    <SelectItem key={i} value={String(i)}>
                                      {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">Avoid tolls</Label>
                              <Switch
                                checked={commuteProfile.avoidTolls}
                                onCheckedChange={(v) => {
                                  const p = { ...commuteProfile, avoidTolls: !!v };
                                  setCommuteProfile(p); saveCommuteProfile(p);
                                }}
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Cost: ${(commuteProfile.gasPricePerGallon / commuteProfile.vehicleMpg).toFixed(2)}/mi · {commuteProfile.daysInOffice}d/wk · {commuteProfile.daysInOffice * 52} trips/yr
                          </p>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {commuteInfo ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs font-medium">
                          {(() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-3.5 w-3.5 text-blue-500" />; })()}
                          {commuteInfo.routes && commuteInfo.routes.length > 1 ? (
                            <span>
                              {Math.min(...commuteInfo.routes.map(r => r.durationMin))}–{Math.max(...commuteInfo.routes.map(r => r.durationMin))} min
                              {" "}({Math.min(...commuteInfo.routes.map(r => r.distanceMi))}–{Math.max(...commuteInfo.routes.map(r => r.distanceMi))} mi)
                            </span>
                          ) : (
                            <span>~{commuteInfo.durationMin} min ({commuteInfo.distanceMi} mi)</span>
                          )}
                          {commuteInfo.estimated && <span className="text-muted-foreground ml-0.5">(est.)</span>}
                        </div>
                        {commuteInfo.durationInTrafficMin && commuteInfo.durationInTrafficMin !== commuteInfo.durationMin && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-2.5 w-2.5" />
                            {commuteInfo.durationInTrafficMin} min in traffic
                            ({commuteProfile.departureHour === 0 ? "12 AM" : commuteProfile.departureHour < 12 ? `${commuteProfile.departureHour} AM` : commuteProfile.departureHour === 12 ? "12 PM" : `${commuteProfile.departureHour - 12} PM`} departure)
                          </div>
                        )}
                        {/* Departure → Arrival ETA */}
                        {(() => {
                          const dur = commuteInfo.durationInTrafficMin ?? commuteInfo.durationMin;
                          const depH = commuteProfile.departureHour;
                          const depLabel = depH === 0 ? "12:00 AM" : depH < 12 ? `${depH}:00 AM` : depH === 12 ? "12:00 PM" : `${depH - 12}:00 PM`;
                          const arrTotalMin = depH * 60 + dur;
                          const arrH = Math.floor(arrTotalMin / 60) % 24;
                          const arrM = arrTotalMin % 60;
                          const arrLabel = `${arrH === 0 ? 12 : arrH > 12 ? arrH - 12 : arrH}:${String(arrM).padStart(2, "0")} ${arrH < 12 ? "AM" : "PM"}`;
                          return (
                            <div className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                              <Navigation className="h-2.5 w-2.5" />
                              Leave {depLabel} → Arrive {arrLabel}
                            </div>
                          );
                        })()}
                        {/* Yearly cost estimate */}
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Fuel className="h-2.5 w-2.5" />
                          {commuteInfo.routes && commuteInfo.routes.length > 1 ? (
                            <span>
                              {formatCost(yearlyCommuteCost(Math.min(...commuteInfo.routes.map(r => r.distanceMi)), commuteProfile))}–{formatCost(yearlyCommuteCost(Math.max(...commuteInfo.routes.map(r => r.distanceMi)), commuteProfile))}/yr
                            </span>
                          ) : (
                            <span>{formatCost(yearlyCommuteCost(commuteInfo.distanceMi, commuteProfile))}/yr</span>
                          )}
                        </div>
                        {/* Route alternatives */}
                        {commuteInfo.routes && commuteInfo.routes.length > 1 && (
                          <details className="text-[10px] text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground flex items-center gap-0.5">
                              <Route className="h-2.5 w-2.5" /> {commuteInfo.routes.length} routes
                            </summary>
                            <div className="mt-1 space-y-0.5 pl-3">
                              {commuteInfo.routes.map((r, i) => (
                                <div key={i} className="flex items-center justify-between">
                                  <span className="truncate max-w-[130px]">{r.summary || `Route ${i + 1}`}</span>
                                  <span className="font-medium shrink-0 ml-1">{r.durationMin} min · {r.distanceMi} mi</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {/* Transit itinerary — bus/train legs */}
                        {commuteInfo.transitSteps && commuteInfo.transitSteps.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-dashed">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <TrainFront className="h-3 w-3 text-blue-500" /> Transit Itinerary
                            </span>
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {commuteInfo.transitSteps.map((step, i) => (
                                <span key={i} className="flex items-center gap-0.5">
                                  {i > 0 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
                                  {step.mode === "WALKING" ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                      <Footprints className="h-3 w-3" /> {step.durationMin}m
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                      style={{
                                        backgroundColor: step.lineColor || "#6366f1",
                                        color: step.lineTextColor || "#fff",
                                      }}
                                    >
                                      {step.vehicleType === "BUS" && <span>🚌</span>}
                                      {(step.vehicleType === "SUBWAY" || step.vehicleType === "METRO_RAIL") && <span>🚇</span>}
                                      {(step.vehicleType === "RAIL" || step.vehicleType === "COMMUTER_TRAIN" || step.vehicleType === "HEAVY_RAIL") && <span>🚆</span>}
                                      {step.vehicleType === "TRAM" && <span>🚊</span>}
                                      {!["BUS", "SUBWAY", "METRO_RAIL", "RAIL", "COMMUTER_TRAIN", "HEAVY_RAIL", "TRAM"].includes(step.vehicleType || "") && <TrainFront className="h-3 w-3" />}
                                      {step.lineShort || step.lineName || "Transit"}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                            {/* Departure/arrival details */}
                            {commuteInfo.transitSteps.filter((s) => s.mode === "TRANSIT").map((step, i) => (
                              <div key={i} className="text-[10px] text-muted-foreground pl-2 border-l-2" style={{ borderColor: step.lineColor || "#6366f1" }}>
                                <div className="font-medium" style={{ color: step.lineColor || undefined }}>
                                  {step.vehicleType === "BUS" ? "🚌" : "🚆"} {step.lineShort || step.lineName}{step.agencyName ? ` · ${step.agencyName}` : ""}
                                </div>
                                {step.departureStop && step.departureTime && (
                                  <div>{step.departureTime} from {step.departureStop}</div>
                                )}
                                {step.arrivalStop && step.arrivalTime && (
                                  <div>{step.arrivalTime} at {step.arrivalStop}</div>
                                )}
                                {step.numStops && <div>{step.numStops} stop{step.numStops !== 1 ? "s" : ""} · {step.durationMin} min</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Transit route alternatives */}
                        {commuteInfo.mode === "transit" && commuteInfo.routes && commuteInfo.routes.length > 1 && (
                          <details className="text-[10px] text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground flex items-center gap-0.5">
                              <Route className="h-2.5 w-2.5" /> {commuteInfo.routes.length} transit options
                            </summary>
                            <div className="mt-1 space-y-1 pl-3">
                              {commuteInfo.routes.map((r, i) => (
                                <div key={i} className="space-y-0.5">
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-0.5 flex-wrap">
                                      {r.transitSteps ? r.transitSteps.filter((s) => s.mode === "TRANSIT").map((s, j) => (
                                        <span
                                          key={j}
                                          className="inline-flex items-center gap-0.5 font-semibold px-1 py-0 rounded text-[9px]"
                                          style={{ backgroundColor: s.lineColor || "#6366f1", color: s.lineTextColor || "#fff" }}
                                        >
                                          {s.lineShort || s.lineName}
                                        </span>
                                      )) : <span className="truncate max-w-[100px]">{r.summary || `Option ${i + 1}`}</span>}
                                    </span>
                                    <span className="font-medium shrink-0 ml-1">{r.durationMin} min</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ) : !commuteLoading && (
                      <span className="text-xs text-muted-foreground">Commute unavailable</span>
                    )}

                    {/* Life Anchors commute breakdown */}
                    {lifeAnchors.length > 0 && Object.keys(anchorCommutes).length > 0 && (() => {
                      const totalYearlyCost = lifeAnchors.reduce((sum, a) => {
                        if (!enabledAnchors.has(a.id)) return sum;
                        const ac = anchorCommutes[a.id];
                        return sum + (ac ? yearlyCommuteCost(ac.distanceMi, commuteProfile) : 0);
                      }, 0);
                      const midSalary = selectedJob.salaryMin
                        ? selectedJob.salaryMax ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2 : selectedJob.salaryMin
                        : null;
                      return (
                      <div className="space-y-1 pt-1 border-t border-dashed">
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          <Anchor className="h-3 w-3 text-indigo-500" /> Anchors
                        </div>
                        {lifeAnchors.map((anchor) => {
                          const ac = anchorCommutes[anchor.id];
                          const enabled = enabledAnchors.has(anchor.id);
                          return (
                            <div key={anchor.id} className={`flex items-center justify-between text-[11px] px-0.5 ${!enabled ? "opacity-40" : ""}`}>
                              <span className="flex items-center gap-1 text-muted-foreground truncate">
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-muted transition-colors"
                                  onClick={() => setEnabledAnchors((prev) => {
                                    const next = new Set(prev);
                                    next.has(anchor.id) ? next.delete(anchor.id) : next.add(anchor.id);
                                    return next;
                                  })}
                                  title={enabled ? `Hide ${anchor.label} route` : `Show ${anchor.label} route`}
                                >
                                  {enabled
                                    ? <Eye className="h-2.5 w-2.5 text-indigo-500" />
                                    : <EyeOff className="h-2.5 w-2.5 text-muted-foreground" />
                                  }
                                </button>
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: enabled ? ANCHOR_COLORS[lifeAnchors.indexOf(anchor) % ANCHOR_COLORS.length] : "transparent" }} />
                                {anchor.label}
                              </span>
                              {ac ? (
                                <span className="font-medium shrink-0 ml-1">
                                  ~{ac.durationMin}m · {formatCost(yearlyCommuteCost(ac.distanceMi, commuteProfile))}/yr
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

                {/* Street View — interactive panorama */}
                {GOOGLE_MAPS_KEY && effectiveJobCoords && (
                  <div className="rounded-lg overflow-hidden border">
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 text-[10px] font-medium text-muted-foreground">
                      <PersonStanding className="h-3 w-3" /> {resolvedAddress ? "Office View" : "Neighborhood"}
                    </div>
                    <iframe
                      src={`https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${effectiveJobCoords[0]},${effectiveJobCoords[1]}&heading=210&pitch=10&fov=90`}
                      className="w-full h-[140px] border-0"
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1 h-7 text-xs"
                    onClick={() => setShowDetails(true)}
                  >
                    <Eye className="h-3 w-3" /> Full Details
                  </Button>
                  {selectedJob.url && (
                    <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" className="w-full gap-1 h-7 text-xs">
                        <ExternalLink className="h-3 w-3" /> Apply
                      </Button>
                    </a>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={trackedIds.has(selectedJob.id) ? "outline" : "secondary"}
                    disabled={trackedIds.has(selectedJob.id)}
                    onClick={() => trackMutation.mutate(selectedJob)}
                    className="flex-1 gap-1 h-7 text-xs"
                  >
                    <Plus className="h-3 w-3" />
                    {trackedIds.has(selectedJob.id) ? "Tracked" : "Track"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-2 h-7 text-xs hover:bg-accent">
                      <Star className="h-3 w-3" />
                      <ChevronDown className="h-2.5 w-2.5" />
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
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — sort/filter + job list / detail */}
        <div className="w-80 shrink-0 flex flex-col">
          {/* Sort & filter controls */}
          {searched && geoJobs.length > 0 && (
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
                  <Select value={maxCommuteMin} onValueChange={(v) => setMaxCommuteMin(v ?? "any")}>
                    <SelectTrigger className="h-7 text-xs">
                      <Navigation className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any commute</SelectItem>
                      <SelectItem value="15">≤ 15 min</SelectItem>
                      <SelectItem value="30">≤ 30 min</SelectItem>
                      <SelectItem value="45">≤ 45 min</SelectItem>
                      <SelectItem value="60">≤ 1 hour</SelectItem>
                      <SelectItem value="90">≤ 1.5 hours</SelectItem>
                      <SelectItem value="120">≤ 2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Collapsible Life Anchors */}
              {showAnchors && (
                <div className="border border-dashed border-violet-300 rounded-lg p-2">
                  <LifeAnchorsPanel
                    compact
                    defaultAddress={where}
                    onAnchorsChange={() => queryClient.invalidateQueries({ queryKey: ["life-anchors"] })}
                    enabledAnchorIds={enabledAnchors}
                    onToggleAnchor={(id) => setEnabledAnchors((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Scrollable job list */}
          <div className="flex-1 overflow-y-auto space-y-2">
                {sortedJobs.length === 0 && (searched || hasEmailLeads) && !isFetching && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No jobs found in this area</p>
                  </div>
                )}
                {pagedJobs.map((job) => (
                  <Card
                    key={job.id}
                    data-job-id={job.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${selectedJob?.id === job.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => { setSelectedJob(job); setShowDetails(false); }}
                  >
                    <CardContent className="py-3 px-3">
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-medium text-sm leading-tight truncate">
                          {job.title}
                        </h4>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 shrink-0 ${job.source === "google" ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400" : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"}`}
                          >
                            {job.source === "google" ? "G" : job.source === "email" ? "E" : "A"}
                          </Badge>
                          {job.source === "email" && (
                            <button
                              type="button"
                              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-500 transition-colors"
                              onClick={(e) => { e.stopPropagation(); dismissLeadMutation.mutate(job.id); }}
                              title="Dismiss lead"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
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
          </div>

          {/* Pagination controls */}
          {sortedJobs.length > PAGE_SIZE && (
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

      {/* ── Full Details Dialog (shared across list & map views) ── */}
      {selectedJob && (
        <Dialog open={showDetails} onOpenChange={(open) => { setShowDetails(open); if (!open && viewMode === "list") setSelectedJob(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{selectedJob.title}</DialogTitle>
              <DialogDescription>
                <button
                  type="button"
                  className="hover:text-primary hover:underline transition-colors"
                  onClick={() => { setShowDetails(false); setDeepDiveCompany(selectedJob.company); }}
                >
                  {selectedJob.company}
                </button>
                {" — "}{selectedJob.location}
              </DialogDescription>
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
                      {resolvedAddress.allLocations && resolvedAddress.allLocations.length > 1 && (
                        <div className="space-y-0.5 max-h-28 overflow-y-auto">
                          {resolvedAddress.allLocations.map((office, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={`flex items-center gap-1.5 text-[10px] w-full text-left px-1.5 py-1 rounded hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors ${
                                resolvedAddress.lat === office.lat && resolvedAddress.lng === office.lng
                                  ? "bg-violet-50 dark:bg-violet-950/30 font-semibold"
                                  : "text-muted-foreground"
                              }`}
                              onClick={() => {
                                setResolvedAddress((prev) => prev ? {
                                  ...prev,
                                  address: office.address,
                                  lat: office.lat,
                                  lng: office.lng,
                                  name: office.name,
                                  confidence: "high",
                                } : null);
                                toast.success(`Selected: ${office.name || office.address}`);
                              }}
                            >
                              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-violet-500 text-white text-[9px] font-bold shrink-0">{idx + 1}</span>
                              <span className="truncate">{office.name || office.address}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <PlacesAutocomplete
                    value={addressOverride}
                    onChange={(v) => {
                      setAddressOverride(v);
                      if (!v.trim()) return;
                      geocodeOverride(v).then((d) => {
                        if (d) {
                          setResolvedAddress(d);
                          if (selectedJob) saveAddressOverride(selectedJob.id, d.address, d.lat, d.lng, d.name, "manual");
                        }
                      });
                    }}
                    placeholder={resolvedAddress ? "Override address…" : "Enter exact address…"}
                    className="h-8 text-xs"
                  />
                </div>

                {/* "via recruiter" confidence badge + flag count (dialog) */}
                {selectedJob && (() => {
                  const norm = selectedJob.company.toLowerCase().trim();
                  const dbInfo = recruiterFlagDb[norm];
                  const isRecruiter = isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || dbInfo?.confirmed;
                  const dupInfo = getDuplicateInfo(selectedJob.id);
                  if (!isRecruiter && !dupInfo) return null;
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      {isRecruiter && (
                        <Badge variant="outline" className="text-xs h-6 gap-1 border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400">
                          <ShieldAlert className="h-3 w-3" /> via recruiter
                        </Badge>
                      )}
                      {dbInfo && dbInfo.count > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {dbInfo.count} flag{dbInfo.count !== 1 ? "s" : ""}{dbInfo.confirmed ? " · confirmed" : ""}
                        </span>
                      )}
                      {dupInfo && (
                        <Badge variant="outline" className="text-xs h-6 gap-1 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                          <Repeat2 className="h-3 w-3" /> Duplicate posting ({dupInfo.duplicates.length + 1} matches)
                        </Badge>
                      )}
                    </div>
                  );
                })()}

                {/* Landmark mismatch alert + one-click swap (dialog) */}
                {resolvedAddress && selectedJob && hasLandmarkMismatch(selectedJob.company, resolvedAddress.name) && (
                  <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 space-y-2">
                    <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p>Google identifies this location as <strong>{resolvedAddress.name}</strong></p>
                        {isLikelyRecruiter(selectedJob.company) && (
                          <p className="text-xs mt-0.5">The job poster appears to be a staffing/recruiting agency.</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/50"
                      onClick={swapToLandmark}
                    >
                      <ArrowRightLeft className="h-3 w-3" /> Confirm this is {resolvedAddress.name}
                    </Button>
                  </div>
                )}

                {/* "Where's the office?" for recruiter-flagged jobs (dialog) */}
                {selectedJob && (isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || recruiterFlagDb[selectedJob.company.toLowerCase().trim()]?.confirmed) && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 space-y-2">
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> This job was posted by a recruiter. Know the actual office?
                    </p>
                    <PlacesAutocomplete
                      value={addressOverride}
                      onChange={(v) => {
                        setAddressOverride(v);
                        if (!v.trim()) return;
                        geocodeOverride(v).then((d) => {
                          if (d) {
                            setResolvedAddress(d);
                            if (selectedJob) saveAddressOverride(selectedJob.id, d.address, d.lat, d.lng, d.name, "manual");
                          }
                        });
                      }}
                      placeholder="Enter real office address…"
                      className="h-8 text-xs"
                      types={["address", "establishment"]}
                    />
                    {/* NLP-extracted location suggestions */}
                    {nlpLocations.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" /> Detected in job description:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {nlpLocations.map((loc, i) => (
                            <Button
                              key={i}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                              onClick={() => applyNlpLocation(loc)}
                            >
                              <MapPin className="h-3 w-3 mr-1" /> {loc}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recruiter flag toggle (dialog) */}
                {selectedJob && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-orange-600"
                      onClick={() => toggleRecruiterFlag(selectedJob.company)}
                    >
                      <Flag className="h-3 w-3 mr-1" />
                      {(isUserFlaggedRecruiter(selectedJob.company) || recruiterFlagDb[selectedJob.company.toLowerCase().trim()]?.flaggedByMe) ? "Unflag recruiter" : "Flag as recruiter"}
                    </Button>
                  </div>
                )}

                {/* Google Places enrichment (dialog) */}
                {resolvedAddress && (resolvedAddress.website || resolvedAddress.phone || resolvedAddress.rating != null || resolvedAddress.editorialSummary) && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" /> Business Info (Google)
                    </div>
                    {resolvedAddress.editorialSummary && (
                      <p className="text-xs text-muted-foreground leading-snug">{resolvedAddress.editorialSummary}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                      {resolvedAddress.rating != null && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{resolvedAddress.rating}</span>
                          {resolvedAddress.ratingCount != null && (
                            <span className="text-xs text-muted-foreground">({resolvedAddress.ratingCount.toLocaleString()} reviews)</span>
                          )}
                        </span>
                      )}
                      {resolvedAddress.businessStatus && resolvedAddress.businessStatus !== "OPERATIONAL" && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">
                          {resolvedAddress.businessStatus.replace(/_/g, " ")}
                        </Badge>
                      )}
                      {resolvedAddress.openNow !== undefined && (
                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${resolvedAddress.openNow ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400" : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"}`}>
                          {resolvedAddress.openNow ? "Open Now" : "Closed"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                      {resolvedAddress.website && (
                        <a href={resolvedAddress.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          {new URL(resolvedAddress.website).hostname.replace("www.", "")}
                        </a>
                      )}
                      {resolvedAddress.phone && (
                        <a href={`tel:${resolvedAddress.phone}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {resolvedAddress.phone}
                        </a>
                      )}
                    </div>
                    {resolvedAddress.hours && resolvedAddress.hours.length > 0 && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Business Hours
                        </summary>
                        <div className="mt-1 space-y-0.5 pl-4">
                          {resolvedAddress.hours.map((h, i) => (
                            <div key={i}>{h}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

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
                    {/* Inline commute profile — visible in dialog */}
                    <div className="grid grid-cols-5 gap-2 rounded-lg border bg-muted/30 p-2.5">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Gas $/gal</Label>
                        <Input
                          type="number" step="0.10" min="1" max="10"
                          value={commuteProfile.gasPricePerGallon}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || DEFAULT_COMMUTE_PROFILE.gasPricePerGallon;
                            const p = { ...commuteProfile, gasPricePerGallon: v };
                            setCommuteProfile(p); saveCommuteProfile(p);
                          }}
                          className="h-7 text-xs text-right"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">MPG</Label>
                        <Input
                          type="number" step="0.5" min="5" max="150"
                          value={commuteProfile.vehicleMpg}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || DEFAULT_COMMUTE_PROFILE.vehicleMpg;
                            const p = { ...commuteProfile, vehicleMpg: v };
                            setCommuteProfile(p); saveCommuteProfile(p);
                          }}
                          className="h-7 text-xs text-right"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Days/wk</Label>
                        <Input
                          type="number" step="1" min="1" max="7"
                          value={commuteProfile.daysInOffice}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || DEFAULT_COMMUTE_PROFILE.daysInOffice;
                            const p = { ...commuteProfile, daysInOffice: Math.min(7, Math.max(1, v)) };
                            setCommuteProfile(p); saveCommuteProfile(p);
                          }}
                          className="h-7 text-xs text-right"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Depart</Label>
                        <Select
                          value={String(commuteProfile.departureHour)}
                          onValueChange={(v) => {
                            const p = { ...commuteProfile, departureHour: parseInt(v ?? "8") };
                            setCommuteProfile(p); saveCommuteProfile(p);
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">No tolls</Label>
                        <div className="flex items-center h-7">
                          <Switch
                            checked={commuteProfile.avoidTolls}
                            onCheckedChange={(v) => {
                              const p = { ...commuteProfile, avoidTolls: !!v };
                              setCommuteProfile(p); saveCommuteProfile(p);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    {commuteInfo && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-sm">
                          {(() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-4 w-4 text-blue-500" />; })()}
                          <span className="font-medium">
                            {commuteInfo.routes && commuteInfo.routes.length > 1 ? (
                              <>
                                {Math.min(...commuteInfo.routes.map(r => r.durationMin))}–{Math.max(...commuteInfo.routes.map(r => r.durationMin))} min
                                {" "}({Math.min(...commuteInfo.routes.map(r => r.distanceMi))}–{Math.max(...commuteInfo.routes.map(r => r.distanceMi))} mi)
                              </>
                            ) : (
                              <>~{commuteInfo.durationMin} min ({commuteInfo.distanceMi} mi)</>
                            )}
                            {commuteInfo.estimated && <span className="text-xs text-muted-foreground ml-1">(est.)</span>}
                          </span>
                        </div>
                        {commuteInfo.durationInTrafficMin && commuteInfo.durationInTrafficMin !== commuteInfo.durationMin && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {commuteInfo.durationInTrafficMin} min in traffic
                            ({commuteProfile.departureHour === 0 ? "12 AM" : commuteProfile.departureHour < 12 ? `${commuteProfile.departureHour} AM` : commuteProfile.departureHour === 12 ? "12 PM" : `${commuteProfile.departureHour - 12} PM`} departure)
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Fuel className="h-3 w-3" />
                          {commuteInfo.routes && commuteInfo.routes.length > 1 ? (
                            <span>
                              {formatCost(yearlyCommuteCost(Math.min(...commuteInfo.routes.map(r => r.distanceMi)), commuteProfile))}–{formatCost(yearlyCommuteCost(Math.max(...commuteInfo.routes.map(r => r.distanceMi)), commuteProfile))}/yr
                            </span>
                          ) : (
                            <span>{formatCost(yearlyCommuteCost(commuteInfo.distanceMi, commuteProfile))}/yr</span>
                          )}
                          <span className="text-[10px]">({commuteProfile.daysInOffice}d/wk · ${(commuteProfile.gasPricePerGallon / commuteProfile.vehicleMpg).toFixed(2)}/mi)</span>
                        </div>
                        {/* Route alternatives */}
                        {commuteInfo.routes && commuteInfo.routes.length > 1 && (
                          <div className="space-y-1 pt-1 border-t">
                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <Route className="h-3 w-3" /> {commuteInfo.routes.length} Route Options
                            </div>
                            {commuteInfo.routes.map((r, i) => (
                              <div key={i} className="flex items-center justify-between text-xs px-1.5 py-1 rounded hover:bg-muted/50">
                                <span className="truncate max-w-[200px]">{r.summary || `Route ${i + 1}`}</span>
                                <span className="font-medium shrink-0 ml-2">
                                  {r.durationMin} min · {r.distanceMi} mi · {formatCost(yearlyCommuteCost(r.distanceMi, commuteProfile))}/yr
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Life Anchors commute breakdown */}
                    {lifeAnchors.length > 0 && Object.keys(anchorCommutes).length > 0 && (() => {
                      const totalYearlyCost = lifeAnchors.reduce((sum, a) => {
                        if (!enabledAnchors.has(a.id)) return sum;
                        const ac = anchorCommutes[a.id];
                        return sum + (ac ? yearlyCommuteCost(ac.distanceMi, commuteProfile) : 0);
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
                          const enabled = enabledAnchors.has(anchor.id);
                          return (
                            <div
                              key={anchor.id}
                              className={`flex items-center justify-between text-xs px-1 w-full rounded hover:bg-muted/50 transition-colors ${!enabled ? "opacity-40" : ""}`}
                            >
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-muted transition-colors"
                                  onClick={() => setEnabledAnchors((prev) => {
                                    const next = new Set(prev);
                                    next.has(anchor.id) ? next.delete(anchor.id) : next.add(anchor.id);
                                    return next;
                                  })}
                                  title={enabled ? `Hide ${anchor.label} route` : `Show ${anchor.label} route`}
                                >
                                  {enabled
                                    ? <Eye className="h-3 w-3 text-indigo-500" />
                                    : <EyeOff className="h-3 w-3 text-muted-foreground" />
                                  }
                                </button>
                                <span className={`h-2 w-2 rounded-full ${!enabled ? "ring-1 ring-muted-foreground" : ""}`} style={{ backgroundColor: enabled ? ANCHOR_COLORS[lifeAnchors.indexOf(anchor) % ANCHOR_COLORS.length] : "transparent" }} />
                                {anchor.label}
                              </span>
                              {ac ? (
                                <span className="font-medium">
                                  ~{ac.durationMin} min ({ac.distanceMi} mi)
                                  <span className="text-muted-foreground ml-1">· {formatCost(yearlyCommuteCost(ac.distanceMi, commuteProfile))}/yr</span>
                                  {ac.estimated && <span className="opacity-60 ml-0.5">(est.)</span>}
                                </span>
                              ) : (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          );
                        })}
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

                {/* Street View — interactive panorama */}
                {GOOGLE_MAPS_KEY && effectiveJobCoords && (
                  <div className="rounded-lg overflow-hidden border">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                      <PersonStanding className="h-3.5 w-3.5" /> {resolvedAddress ? "Office View" : "Neighborhood View"}
                    </div>
                    <iframe
                      src={`https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${effectiveJobCoords[0]},${effectiveJobCoords[1]}&heading=210&pitch=10&fov=90`}
                      className="w-full h-[250px] border-0"
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                )}

                <Separator />
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {stripHtml(selectedJob.description)}
                </div>
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

      {/* ── Company Deep Dive Dialog ── */}
      <Dialog open={!!deepDiveCompany} onOpenChange={(open) => { if (!open) setDeepDiveCompany(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Company Deep Dive
            </DialogTitle>
            <DialogDescription>
              Aggregated intelligence for {deepDiveCompany} across your search results
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-4 px-4 min-h-0">
            {deepDiveCompany && (
              <CompanyDeepDive
                companyName={deepDiveCompany}
                jobs={geoJobs
                  .filter((j) => j.company === deepDiveCompany)
                  .map((j) => ({
                    id: j.id,
                    title: j.title,
                    company: j.company,
                    location: j.location,
                    lat: j.lat,
                    lng: j.lng,
                    salaryMin: j.salaryMin,
                    salaryMax: j.salaryMax,
                    created: j.created,
                    source: j.source,
                    via: j.via,
                    scheduleType: j.scheduleType,
                    contractTime: j.contractTime,
                    contractType: j.contractType,
                    category: j.category,
                    description: j.description,
                  }))}
                placesData={Object.entries(addressCache).find(([k]) => k.startsWith(`${deepDiveCompany}:`))?.[1] ?? null}
                marketMeanSalary={meanSalary}
                allCompanyNames={availableCompanies}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

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

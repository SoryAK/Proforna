"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import type { DrawingSettings, DrawingCanvasHandle, SerializedDrawing } from "@/components/map-drawing-canvas";
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
  Bookmark,
  Home,
  Download,
  Pencil,
  Check,
  FileText,
  ClipboardList,
  TrendingUp,
  PaintbrushVertical,
  Users,
  GraduationCap,
  Heart,
  Calendar,
  ThumbsUp,
  LogOut,
  Monitor,
  Award,
  Zap,
  Camera,
  ImageIcon,
  Landmark,
  BarChart3,
  Images,
  Paperclip,
  Wrench,
  Boxes,
  GripVertical,
  Brain,
  Maximize2,
  Minus,
  LayoutGrid,
  FolderOpen,
  Info,
  Move,
} from "lucide-react";
import { toast } from "sonner";
import { GalleryModal } from "@/components/gallery-modal";
import type { GalleryPhoto as GalleryPhotoType } from "@/components/gallery-modal";
import { PersonalInventory } from "@/components/personal-inventory";
import { BioCardEditor } from "@/components/bio-card-editor";
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
import { estimateTaxes, formatSalaryCompact, resolveState, type TaxBreakdown } from "@/lib/taxes";
import { TAX_ZONE_LEGEND } from "@/data/state-tax-zones";
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
import { UniformBodyMap, UniformMapPopup, type UniformData } from "@/components/uniform-body-map";

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
  source: "adzuna" | "google" | "email" | "usajobs";
  /* Google Jobs enrichment */
  thumbnail?: string | null;
  via?: string;
  applyLinks?: { title: string; link: string }[];
  scheduleType?: string | null;
  /* USAJobs: other duty stations for this posting */
  dutyStations?: { location: string; city: string; state: string; lat: number; lng: number }[];
}

/** Strip basic HTML tags from Adzuna descriptions */
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function formatJobDescription(html: string) {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|section|article|h\d|li|ul|ol)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeHtmlEntities(withBreaks)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const rawLines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const lines = rawLines.length > 1
    ? rawLines
    : (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
        .map((line) => line.trim())
        .filter(Boolean);

  const sections: { type: "paragraph" | "bullets"; items: string[] }[] = [];
  for (const line of lines) {
    const bullet = line.match(/^[-*•]\s*(.+)$/);
    if (bullet) {
      const last = sections[sections.length - 1];
      if (last?.type === "bullets") last.items.push(bullet[1].trim());
      else sections.push({ type: "bullets", items: [bullet[1].trim()] });
    } else {
      sections.push({ type: "paragraph", items: [line] });
    }
  }

  return { text, sections };
}

function getPreferredApplyLink(job: MapJob) {
  const links = job.applyLinks ?? [];
  const aggregatorTerms = ["adzuna", "google", "indeed", "linkedin", "ziprecruiter", "glassdoor", "monster", "simplyhired"];
  const directLink = links.find((link) => {
    const text = `${link.title} ${link.link}`.toLowerCase();
    return !aggregatorTerms.some((term) => text.includes(term));
  });
  return directLink?.link || job.url || links[0]?.link || "";
}

/** Check if two date ranges (YYYY-MM format) overlap */
function dateRangesOverlap(aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null): boolean {
  if (!aStart || !bStart) return false;
  const ae = aEnd ?? "9999-12";
  const be = bEnd ?? "9999-12";
  return aStart <= be && bStart <= ae;
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

const MapDrawingCanvas = dynamic(() => import("@/components/map-drawing-canvas"), { ssr: false });
const MapDrawingPanel = dynamic(() => import("@/components/map-drawing-panel"), { ssr: false });

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
  { value: "usajobs", label: "USAJobs" },
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

/** Ray-casting point-in-polygon for [lng, lat] ring (ORS GeoJSON format) */
function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
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
const ALL_WORK_TYPES = ["job", "school", "military", "volunteer", "internship", "self-employed"] as const;

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
  returnDepartureHour?: number; // 0-23
  parkingMonthly?: number;
  badDayMultiplier?: number;
  transitReliability?: "high" | "medium" | "low";
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleId?: string; // FuelEconomy.gov vehicle id
}
const DEFAULT_COMMUTE_PROFILE: CommuteProfile = {
  gasPricePerGallon: 3.50,
  vehicleMpg: 27.5,
  daysInOffice: 5,
  avoidTolls: false,
  departureHour: 8,
  returnDepartureHour: 17,
  parkingMonthly: 0,
  badDayMultiplier: 1.5,
  transitReliability: "medium",
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
    return distanceMi * 2 * profile.daysInOffice * 52 * costPerMile + (profile.parkingMonthly ?? 0) * 12;
  }
  return distanceMi * 2 * 250 * IRS_MILEAGE_RATE;
}
function formatCost(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

/** Source badge styling + label */
function sourceBadge(src: "adzuna" | "google" | "email" | "usajobs") {
  if (src === "google") return { label: "Google", labelLong: "Google Jobs", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  if (src === "email") return { label: "Email", labelLong: "Email Lead", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" };
  if (src === "usajobs") return { label: "USAJobs", labelLong: "USAJobs (Federal)", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
  return { label: "Adzuna", labelLong: "Adzuna", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
}

/* ── Persistent preferences helper ── */
const JOB_PREFS_KEY = "resumsify-job-search-prefs";
const JOB_COMPARE_SHORTLIST_KEY = "resumsify:job-compare-shortlist";
const JOB_INTENT_KEY = "resumsify:job-intent-states";
const PANEL_GALLERY_VIEW_KEY = "resumsify:panel-gallery-view";
const WORK_HISTORY_PANEL_PREFS_KEY = "resumsify:work-history-panel-prefs";
const WORK_HISTORY_OVERLAPS_KEY = "resumsify:work-history-overlaps";
const WORK_HISTORY_KPI_SLOTS_KEY = "resumsify:work-history-kpi-slots";
const KPI_MAX_SLOTS = 8;
const DEFAULT_KPI_SLOTS = ["tenure", "roles", "miles", "cities", "rtg", "rtn"];

const INVENTORY_PANEL_KEY = "resumsify:inventory-panel-v1";
type InventoryPanelState = { x: number; y: number; w: number; h: number; minimized: boolean };
const INVENTORY_PANEL_DEFAULTS: InventoryPanelState = { x: 80, y: 80, w: 720, h: 560, minimized: false };
const INVENTORY_PANEL_MIN = { w: 360, h: 240 };
function loadInventoryPanel(): InventoryPanelState {
  if (typeof window === "undefined") return { ...INVENTORY_PANEL_DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(INVENTORY_PANEL_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...INVENTORY_PANEL_DEFAULTS };
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    return {
      x: Math.max(0, n(raw.x, INVENTORY_PANEL_DEFAULTS.x)),
      y: Math.max(0, n(raw.y, INVENTORY_PANEL_DEFAULTS.y)),
      w: Math.max(INVENTORY_PANEL_MIN.w, n(raw.w, INVENTORY_PANEL_DEFAULTS.w)),
      h: Math.max(INVENTORY_PANEL_MIN.h, n(raw.h, INVENTORY_PANEL_DEFAULTS.h)),
      minimized: !!raw.minimized,
    };
  } catch { return { ...INVENTORY_PANEL_DEFAULTS }; }
}

type JobIntent = "interested" | "applied" | "interviewing" | "waiting" | "rejected" | "not-fit";

const JOB_INTENT_OPTIONS: { value: JobIntent; label: string; className: string }[] = [
  { value: "interested", label: "Interested", className: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" },
  { value: "applied", label: "Applied", className: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400" },
  { value: "interviewing", label: "Interviewing", className: "border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400" },
  { value: "waiting", label: "Waiting", className: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400" },
  { value: "rejected", label: "Rejected", className: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400" },
  { value: "not-fit", label: "Not a fit", className: "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400" },
];

function loadStringArray(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function loadJobIntentStates(): Record<string, JobIntent> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(JOB_INTENT_KEY) || "{}");
    if (!raw || typeof raw !== "object") return {};
    const allowed = new Set(JOB_INTENT_OPTIONS.map((option) => option.value));
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, JobIntent] => typeof entry[0] === "string" && allowed.has(entry[1] as JobIntent)),
    );
  } catch { return {}; }
}

function loadWorkHistoryPanelPrefs(): { tab?: "list" | "timeline" | "compare"; lastMainTab?: "list" | "timeline"; showTimeFilterPanel?: boolean } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(WORK_HISTORY_PANEL_PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadWorkHistoryOverlapsDefault(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(WORK_HISTORY_OVERLAPS_KEY);
    if (raw == null) return false;
    return raw === "1";
  } catch {
    return false;
  }
}

function loadKpiSlots(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_KPI_SLOTS];
  try {
    const raw = localStorage.getItem(WORK_HISTORY_KPI_SLOTS_KEY);
    if (!raw) return [...DEFAULT_KPI_SLOTS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_KPI_SLOTS];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, KPI_MAX_SLOTS);
  } catch {
    return [...DEFAULT_KPI_SLOTS];
  }
}
interface JobSearchPrefs {
  tileStyle?: string;
  viewMode?: string;
  source?: string;
  radius?: string;
  sortBy?: string;
  showHeatmap?: boolean;
  heatmapMode?: string;
  showTraffic?: boolean;
  showTransit?: boolean;
  showTaxZones?: boolean;
  showStateTax?: boolean;
  showCityTax?: boolean;
  showCountyPropTax?: boolean;
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
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [where, setWhere] = useState("");
  const [radius, setRadius] = useState(() => savedPrefs.radius || "25");
  const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
  const [jobPanelSections, setJobPanelSections] = useState<Set<string>>(() => new Set(["description"]));
  const [streetViewVisible, setStreetViewVisible] = useState(true);
  const [streetViewExpanded, setStreetViewExpanded] = useState(false);
  const [compareShortlistIds, setCompareShortlistIds] = useState<string[]>(() => loadStringArray(JOB_COMPARE_SHORTLIST_KEY).slice(0, 4));
  const [jobIntentById, setJobIntentById] = useState<Record<string, JobIntent>>(() => loadJobIntentStates());
  const [searched, setSearched] = useState(false);
  const [searchParams, setSearchParams] = useState<{ q: string; where: string; apiWhere: string; distance: string } | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const trackedAppsRef = useRef<{ company: string; role: string; url: string | null }[]>([]);
  const [sortBy, setSortBy] = useState(() => savedPrefs.sortBy || "salary-desc");
  const [minSalary, setMinSalary] = useState("");
  const [page, setPage] = useState(1);
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null);
  const [source, setSource] = useState<"adzuna" | "google" | "usajobs" | "both">(() => (savedPrefs.source as "adzuna" | "google" | "usajobs" | "both") || "both");
  const [commuteProfile, setCommuteProfile] = useState<CommuteProfile>(DEFAULT_COMMUTE_PROFILE);
  const [showCommuteSettings, setShowCommuteSettings] = useState(false);
  const [showQuickCommuteEdit, setShowQuickCommuteEdit] = useState(false);
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
  const [showTaxZones, setShowTaxZones] = useState(() => savedPrefs.showTaxZones ?? false);
  const [showStateTax, setShowStateTax] = useState(() => savedPrefs.showStateTax ?? true);
  const [showCityTax, setShowCityTax] = useState(() => savedPrefs.showCityTax ?? true);
  const [showCountyPropTax, setShowCountyPropTax] = useState(() => savedPrefs.showCountyPropTax ?? true);
  const [tileStyle, setTileStyle] = useState<"osm" | "google-roadmap" | "google-satellite" | "google-hybrid">(() => (savedPrefs.tileStyle as "osm" | "google-roadmap" | "google-satellite" | "google-hybrid") || "osm");

  /* ── Drawing mode ── */
  const [drawingActive, setDrawingActive] = useState(false);
  const [drawingSettings, setDrawingSettings] = useState<DrawingSettings>({
    tool: "freehand",
    color: "#3B82F6",
    strokeWidth: 3,
    fontSize: 16,
    emoji: "⭐",
    zoneType: null,
  });
  const [drawingMeasurement, setDrawingMeasurement] = useState<{
    distance?: number;
    area?: number;
    unit?: string;
  } | null>(null);
  const [drawingLayers, setDrawingLayers] = useState<
    { id: string; name: string; visible: boolean; drawingCount: number }[]
  >([]);
  const [activeDrawingLayerId, setActiveDrawingLayerId] = useState<string | null>(null);
  const drawingCanvasRef = useRef<DrawingCanvasHandle | null>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapContainerSize, setMapContainerSize] = useState({ w: 0, h: 0 });

  /* ── Area tax info — tracks map center + zoom ── */
  const [mapViewCenter, setMapViewCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(10);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [areaInfo, setAreaInfo] = useState<{ state: string | null; city: string | null; label: string } | null>(null);
  const areaGeoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleViewChange = useCallback((center: [number, number], zoom: number) => {
    setMapViewCenter(center);
    setMapZoom(zoom);
    // Debounced reverse geocode to get state/city for the area
    if (areaGeoTimer.current) clearTimeout(areaGeoTimer.current);
    areaGeoTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${center[0]}&lon=${center[1]}&zoom=${Math.min(zoom, 18)}&addressdetails=1`
        );
        const data = await res.json();
        const addr = data.address ?? {};
        const city = addr.city || addr.town || addr.village || null;
        const county = addr.county || null;
        const stateStr: string | null = addr.state || null;
        // Build label
        const parts: string[] = [];
        if (zoom >= 12 && city) parts.push(city);
        else if (county) parts.push(county);
        if (stateStr) parts.push(stateStr);
        setAreaInfo({
          state: stateStr,
          city: zoom >= 12 ? city : null,
          label: parts.join(", ") || "Unknown Area",
        });
      } catch {
        setAreaInfo(null);
      }
    }, 600);
  }, []);

  // Persist preferences on change
  useEffect(() => { saveJobPref("tileStyle", tileStyle); }, [tileStyle]);
  useEffect(() => { saveJobPref("viewMode", viewMode); setClusterPreview(null); setActiveAmenities(new Set()); setZoomTarget(null); }, [viewMode]);
  useEffect(() => { saveJobPref("source", source); }, [source]);
  useEffect(() => { saveJobPref("radius", radius); }, [radius]);
  useEffect(() => { saveJobPref("sortBy", sortBy); }, [sortBy]);
  useEffect(() => { saveJobPref("showHeatmap", showHeatmap); }, [showHeatmap]);

  useEffect(() => { saveJobPref("showTraffic", showTraffic); }, [showTraffic]);
  useEffect(() => { saveJobPref("showTransit", showTransit); }, [showTransit]);
  useEffect(() => { saveJobPref("showTaxZones", showTaxZones); }, [showTaxZones]);
  useEffect(() => { saveJobPref("showStateTax", showStateTax); }, [showStateTax]);
  useEffect(() => { saveJobPref("showCityTax", showCityTax); }, [showCityTax]);
  useEffect(() => { saveJobPref("showCountyPropTax", showCountyPropTax); }, [showCountyPropTax]);
  useEffect(() => { saveJobPref("commuteMode", commuteMode); }, [commuteMode]);

  /* ── Drawing: map ready → store ref + observe container size ── */
  const handleMapReady = useCallback((map: google.maps.Map) => {
    googleMapRef.current = map;
  }, []);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setMapContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  const latLngToPixel = useCallback((lat: number, lng: number) => {
    const map = googleMapRef.current;
    if (!map) return null;
    const proj = map.getProjection();
    if (!proj) return null;
    const topRight = proj.fromLatLngToPoint(map.getBounds()!.getNorthEast())!;
    const bottomLeft = proj.fromLatLngToPoint(map.getBounds()!.getSouthWest())!;
    const scale = 2 ** (map.getZoom()! || 10);
    const worldPoint = proj.fromLatLngToPoint(new google.maps.LatLng(lat, lng))!;
    return {
      x: (worldPoint.x - bottomLeft.x) * scale,
      y: (worldPoint.y - topRight.y) * scale,
    };
  }, []);

  const pixelToLatLng = useCallback((x: number, y: number) => {
    const map = googleMapRef.current;
    if (!map) return null;
    const proj = map.getProjection();
    if (!proj) return null;
    const topRight = proj.fromLatLngToPoint(map.getBounds()!.getNorthEast())!;
    const bottomLeft = proj.fromLatLngToPoint(map.getBounds()!.getSouthWest())!;
    const scale = 2 ** (map.getZoom()! || 10);
    const worldX = x / scale + bottomLeft.x;
    const worldY = y / scale + topRight.y;
    const latlng = proj.fromPointToLatLng(new google.maps.Point(worldX, worldY))!;
    return { lat: latlng.lat(), lng: latlng.lng() };
  }, []);

  const mapBoundsForDrawing = useMemo(() => {
    const map = googleMapRef.current;
    if (!map) return null;
    const b = map.getBounds();
    if (!b) return null;
    return {
      north: b.getNorthEast().lat(),
      south: b.getSouthWest().lat(),
      east: b.getNorthEast().lng(),
      west: b.getSouthWest().lng(),
    };
  }, [mapViewCenter, mapZoom]);

  const hiddenDrawingLayerIds = useMemo(
    () => new Set(drawingLayers.filter((l) => !l.visible).map((l) => l.id)),
    [drawingLayers],
  );

  /* ── Drawing: fetch saved drawings from DB ── */
  const { data: savedDrawingsData } = useQuery({
    queryKey: ["map-drawings"],
    queryFn: async () => {
      const res = await fetch("/api/map-drawings");
      if (!res.ok) return { layers: [], drawings: [] };
      return res.json() as Promise<{ layers: { id: string; name: string; visible: boolean; order: number }[]; drawings: unknown[] }>;
    },
  });

  useEffect(() => {
    if (!savedDrawingsData?.layers) return;
    setDrawingLayers(
      savedDrawingsData.layers.map((l: { id: string; name: string; visible: boolean }) => ({
        ...l,
        drawingCount: (savedDrawingsData.drawings as { layerId?: string | null }[]).filter(
          (d) => d.layerId === l.id,
        ).length,
      })),
    );
  }, [savedDrawingsData]);

  /* ── Drawing: save new drawing to DB ── */
  const saveDrawingMut = useMutation({
    mutationFn: async (drawing: SerializedDrawing) => {
      const res = await fetch("/api/map-drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: drawing.type,
          data: drawing,
          color: drawing.color,
          zoneType: drawing.zoneType,
          label: drawing.label,
          layerId: drawing.layerId ?? activeDrawingLayerId,
          scope: drawing.scope ?? activeDrawingScope,
        }),
      });
      if (!res.ok) throw new Error("Failed to save drawing");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["map-drawings"] }),
  });

  const handleDrawingComplete = useCallback(
    (drawing: SerializedDrawing) => {
      // Save to localStorage immediately for offline fallback
      const saved = JSON.parse(localStorage.getItem("resumsify:map-drawings") ?? "[]");
      saved.push(drawing);
      localStorage.setItem("resumsify:map-drawings", JSON.stringify(saved));
      // Persist to DB
      saveDrawingMut.mutate(drawing);
    },
    [saveDrawingMut, activeDrawingLayerId],
  );

  const handleDrawingDelete = useCallback(
    async (localId: string) => {
      // Remove from localStorage
      const saved = JSON.parse(localStorage.getItem("resumsify:map-drawings") ?? "[]") as SerializedDrawing[];
      localStorage.setItem(
        "resumsify:map-drawings",
        JSON.stringify(saved.filter((d) => d.id !== localId)),
      );
      // If it has a DB id, delete from DB too
      const dbId = localId.startsWith("db_") ? localId.slice(3) : null;
      if (dbId) {
        await fetch(`/api/map-drawings?id=${dbId}`, { method: "DELETE" });
        queryClient.invalidateQueries({ queryKey: ["map-drawings"] });
      }
    },
    [queryClient],
  );

  const handleCreateLayer = useCallback(
    async (name: string) => {
      const res = await fetch("/api/map-drawings/layers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["map-drawings"] });
        toast.success(`Layer "${name}" created`);
      }
    },
    [queryClient],
  );

  const handleDeleteLayer = useCallback(
    async (id: string) => {
      await fetch(`/api/map-drawings/layers?id=${id}`, { method: "DELETE" });
      if (activeDrawingLayerId === id) setActiveDrawingLayerId(null);
      queryClient.invalidateQueries({ queryKey: ["map-drawings"] });
    },
    [queryClient, activeDrawingLayerId],
  );

  const handleToggleLayerVisibility = useCallback(
    async (id: string) => {
      const layer = drawingLayers.find((l) => l.id === id);
      if (!layer) return;
      const newVisible = !layer.visible;
      setDrawingLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, visible: newVisible } : l)),
      );
      // Persist to DB
      fetch(`/api/map-drawings/layers?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: newVisible }),
      }).catch(() => {});
    },
    [drawingLayers],
  );

  // Hydrate trackedIds from existing applications
  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.ok ? r.json() : [])
      .then((apps: { company: string; role: string; url?: string | null }[]) => {
        if (Array.isArray(apps) && apps.length > 0) {
          trackedAppsRef.current = apps.map((a) => ({
            company: a.company?.toLowerCase().trim() ?? "",
            role: a.role?.toLowerCase().trim() ?? "",
            url: a.url ?? null,
          }));
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    reviews?: { authorName: string; rating: number; text: string; relativeTime: string }[] | null;
  };
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressOverride, setAddressOverride] = useState("");
  const [addressCache, setAddressCache] = useState<Record<string, ResolvedAddress>>({});
  const resolveAbort = useRef<AbortController | null>(null);

  /* ── Company Deep Dive ── */
  const [deepDiveCompany, setDeepDiveCompany] = useState<string | null>(null);

  /* ── Company Locations Discovery (job search) ── */
  type CompanyLocResult = { placeId: string; name: string; address: string; lat: number; lng: number };
  const [companyLocs, setCompanyLocs] = useState<CompanyLocResult[]>([]);
  const [companyLocsLoading, setCompanyLocsLoading] = useState(false);
  const [companyLocsSearched, setCompanyLocsSearched] = useState(false);
  const [companyLocsRadius, setCompanyLocsRadius] = useState(25000); // metres

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
  const clusterHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoomTarget, setZoomTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

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

  /* ── Life Anchors state ── */
  interface LifeAnchorData { id: string; label: string; icon: string; address: string; lat: number; lng: number; weight: number; placeId?: string | null }
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
  const [showAnchorsPanel, setShowAnchorsPanel] = useState(false);
  // Which anchor commutes are visible on the map (toggled per-anchor)
  const [enabledAnchors, setEnabledAnchors] = useState<Set<string>>(new Set());
  const knownAnchorIds = useRef<Set<string>>(new Set());

  /* ── Work History (past jobs reference pins) ── */
  interface WorkHistoryLocationItem { id: string; label: string; type: string; address: string; lat: number; lng: number; isPrimary: boolean; placeId?: string | null; skills?: string | null; startDate?: string | null; endDate?: string | null; photos?: string | null }
  interface WorkHistoryItem { id: string; type?: string; company: string; title: string | null; address: string; lat: number; lng: number; startDate: string | null; endDate: string | null; locations: WorkHistoryLocationItem[]; placeId?: string | null; degree?: string | null; major?: string | null; gpa?: number | null; coverImage?: string | null; coverImageY?: number | null; uniformData?: string | null }
  const { data: workHistory = [] } = useQuery<WorkHistoryItem[]>({
    queryKey: ["work-history"],
    queryFn: () => fetch("/api/work-history").then((r) => r.json()),
    staleTime: 60_000,
  });

  /* ── Residence History ── */
  interface ResidenceItem { id: string; label: string; address: string; lat: number; lng: number; placeId?: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean }
  const { data: residences = [] } = useQuery<ResidenceItem[]>({
    queryKey: ["residences"],
    queryFn: () => fetch("/api/residences").then((r) => r.json()),
    staleTime: 60_000,
  });

  /* ── Type Filters ── */
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  /* ── Time Filter (year-month slider) ── */
  const [timeFilter, setTimeFilter] = useState<string | null>(null); // e.g. "2022-06" or null for "all time"
  const [showWorkHistory, setShowWorkHistory] = useState(false);
  const [showWorkHistoryPanel, setShowWorkHistoryPanel] = useState(false);
  const [showCareerPath, setShowCareerPath] = useState(false);
  const [showOverlaps, setShowOverlaps] = useState(() => loadWorkHistoryOverlapsDefault());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(WORK_HISTORY_OVERLAPS_KEY, showOverlaps ? "1" : "0");
    } catch {
      // ignore quota/permission issues
    }
  }, [showOverlaps]);
  const [showSweetSpot, setShowSweetSpot] = useState(true);
  const [focusedWorkHistoryId, setFocusedWorkHistoryId] = useState<string | null>(null);
  const preWorkHistoryZoomRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [pinDropCoords, setPinDropCoords] = useState<{ lat: number; lng: number; placeId?: string } | null>(null);
  const [showBuildingHighlights, setShowBuildingHighlights] = useState(false);
  const [buildingFootprints, setBuildingFootprints] = useState<{ coords: { lat: number; lng: number }[]; color: string }[]>([]);
  const buildingCacheRef = useRef<Map<string, { lat: number; lng: number }[][]>>(new Map());

  /* ── Drawing scope: derive from current map context ── */
  const activeDrawingScope = useMemo(() => {
    if (focusedWorkHistoryId) return `work-history:${focusedWorkHistoryId}`;
    if (showWorkHistory) return "work-history";
    if (selectedJob) return `job:${selectedJob.id}`;
    return "global";
  }, [focusedWorkHistoryId, showWorkHistory, selectedJob]);

  const activeScopeLabel = useMemo(() => {
    if (focusedWorkHistoryId) {
      const wh = workHistory.find((w: { id: string }) => w.id === focusedWorkHistoryId);
      return wh ? `📍 ${wh.company}` : "Focused Job";
    }
    if (showWorkHistory) return "🗺️ Work History";
    if (selectedJob) return `💼 ${selectedJob.company}`;
    return "Global";
  }, [focusedWorkHistoryId, showWorkHistory, selectedJob, workHistory]);

  /* ── Drawing: filter by scope ── */
  const scopeFilteredDrawings = useMemo(() => {
    const all = savedDrawingsData?.drawings as ({ scope?: string } & Record<string, unknown>)[] | undefined;
    if (!all) return undefined;
    return all.filter((d) => {
      const s = d.scope ?? "global";
      if (s === "global") return true;            // globals always visible
      if (s === activeDrawingScope) return true;   // exact match
      // Parent scope match: "work-history" shows all "work-history:*"
      if (activeDrawingScope.startsWith(`${s}:`)) return true;
      return false;
    });
  }, [savedDrawingsData?.drawings, activeDrawingScope]);

  // Load commute profile: prefer DB profile, fallback to localStorage
  const commuteProfileSeeded = useRef(false);
  // (profile query is defined later — we just use the effect below after it resolves)

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

  /* ── Home anchor location info ── */
  const homeAnchor = useMemo(
    () => lifeAnchors.find((a) => a.icon === "home" || a.label.toLowerCase() === "home") ?? null,
    [lifeAnchors],
  );
  const [homeLocation, setHomeLocation] = useState<{ label: string; stateCode: string | null } | null>(null);

  // Reverse-geocode the home anchor once to get its state
  useEffect(() => {
    if (!homeAnchor) { setHomeLocation(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${homeAnchor.lat}&lon=${homeAnchor.lng}&zoom=12&addressdetails=1`
        );
        const data = await res.json();
        if (cancelled) return;
        const addr = data.address ?? {};
        const city = addr.city || addr.town || addr.village || null;
        const stateStr: string | null = addr.state || null;
        const sc = stateStr ? resolveState(stateStr) : null;
        const locStr = [city, stateStr].filter(Boolean).join(", ");
        setHomeLocation({ label: locStr || homeAnchor.address, stateCode: sc });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [homeAnchor?.id, homeAnchor?.lat, homeAnchor?.lng]);

  /* ── Gas prices (EIA) ── */
  const [gasPrice, setGasPrice] = useState<{ state: string; price: number; date: string; region?: string } | null>(null);
  const [homeGasPrice, setHomeGasPrice] = useState<{ state: string; price: number; date: string; region?: string } | null>(null);
  const gasFetchedState = useRef<string | null>(null);
  const homeGasFetchedState = useRef<string | null>(null);

  // Fetch gas price for the current area
  useEffect(() => {
    const sc = areaInfo?.state ? resolveState(areaInfo.state) : null;
    if (!sc || sc === gasFetchedState.current) return;
    gasFetchedState.current = sc;
    fetch(`/api/gas-prices?state=${sc}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.price) setGasPrice(d); })
      .catch(() => {});
  }, [areaInfo?.state]);

  // Fetch gas price for home state
  useEffect(() => {
    const sc = homeLocation?.stateCode;
    if (!sc || sc === homeGasFetchedState.current) return;
    homeGasFetchedState.current = sc;
    fetch(`/api/gas-prices?state=${sc}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.price) setHomeGasPrice(d); })
      .catch(() => {});
  }, [homeLocation?.stateCode]);

  /* ── Commute Isochrone ── */
  const [isochroneEnabled, setIsochroneEnabled] = useState(false);
  const [isochroneMode, setIsochroneMode] = useState<"driving-car" | "cycling-regular" | "foot-walking">("driving-car");
  const [isochroneRings, setIsochroneRings] = useState<{ minutes: number; coordinates: [number, number][][] }[] | null>(null);
  const [isochroneLoading, setIsochroneLoading] = useState(false);
  const isochroneFetchKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isochroneEnabled || !homeAnchor) {
      setIsochroneRings(null);
      isochroneFetchKey.current = null;
      return;
    }
    const key = `${homeAnchor.lat.toFixed(4)},${homeAnchor.lng.toFixed(4)},${radius},${isochroneMode}`;
    if (key === isochroneFetchKey.current) return;
    isochroneFetchKey.current = key;
    setIsochroneLoading(true);
    fetch(`/api/isochrone?lat=${homeAnchor.lat}&lng=${homeAnchor.lng}&miles=${radius}&mode=${isochroneMode}&v=2`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.rings?.length) {
          setIsochroneRings(
            data.rings.map((r: { minutes?: number; miles?: number; geometry: { coordinates: [number, number][][] } }) => ({
              minutes: r.minutes ?? r.miles ?? 0,
              coordinates: r.geometry.coordinates,
            }))
          );
        } else {
          setIsochroneRings(null);
        }
      })
      .catch(() => setIsochroneRings(null))
      .finally(() => setIsochroneLoading(false));
  }, [isochroneEnabled, homeAnchor, radius, isochroneMode]);

  /* ── Commute Matrix: per-job travel times ── */
  const [commuteTimesMap, setCommuteTimesMap] = useState<Map<string, number> | null>(null);
  const matrixFetchKey = useRef<string | null>(null);

  // Email leads
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [emailParsing, setEmailParsing] = useState(false);
  const [showForwardSetup, setShowForwardSetup] = useState(false);
  const [ingestToken, setIngestToken] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);
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
  const hasEmailLeads = emailLeads.some((l) => l.lat && l.lng && l.location?.trim());

  // Saved searches
  interface SavedSearchRow {
    id: string; name: string; query: string; location: string; radius: string;
    source: string; lat: number | null; lng: number | null; filters: string | null;
    lastRunAt: string | null; lastCount: number; newCount: number; isActive: boolean;
  }
  const qc = useQueryClient();
  const { data: savedSearches = [] } = useQuery<SavedSearchRow[]>({
    queryKey: ["saved-searches"],
    queryFn: () => fetch("/api/saved-searches").then((r) => r.json()),
    staleTime: 60_000,
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);

  const handleSaveSearch = useCallback(async () => {
    if (!saveSearchName.trim() || !where.trim()) return;
    setSavingSearch(true);
    try {
      const filters = { minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter };
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveSearchName.trim(),
          query: query.trim(),
          location: where.trim(),
          radius,
          source,
          lat: searchCenter?.[0] ?? null,
          lng: searchCenter?.[1] ?? null,
          filters,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      setShowSaveDialog(false);
      setSaveSearchName("");
      toast.success("Search saved");
    } catch {
      toast.error("Could not save search");
    } finally {
      setSavingSearch(false);
    }
  }, [saveSearchName, query, where, radius, source, searchCenter, minSalary, datePosted, remoteFilter, employmentType, hoursFilter, categoryFilter, qc]);

  const handleLoadSearch = useCallback((s: SavedSearchRow) => {
    setQuery(s.query);
    setWhere(s.location);
    setRadius(s.radius);
    setSource(s.source as "adzuna" | "google" | "both");
    if (s.lat && s.lng) setSearchCenter([s.lat, s.lng]);
    if (s.filters) {
      try {
        const f = JSON.parse(s.filters);
        if (f.minSalary) setMinSalary(f.minSalary);
        if (f.datePosted) setDatePosted(f.datePosted);
        if (f.remoteFilter) setRemoteFilter(f.remoteFilter);
        if (f.employmentType) setEmploymentType(f.employmentType);
        if (f.hoursFilter) setHoursFilter(f.hoursFilter);
        if (f.categoryFilter) setCategoryFilter(f.categoryFilter);
      } catch { /* ignore parse errors */ }
    }
    // Trigger the search
    const apiWhere = s.location;
    setSearchParams({ q: s.query, where: s.location, apiWhere, distance: s.radius });
    setSearched(true);
    setSelectedJob(null);
    setShowDetails(false);
    setPage(1);
    // Update lastRunAt
    fetch(`/api/saved-searches/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastRunAt: new Date().toISOString(), newCount: 0 }),
    }).catch(() => {});
  }, []);

  const handleDeleteSearch = useCallback(async (id: string) => {
    await fetch(`/api/saved-searches/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["saved-searches"] });
    toast.success("Search deleted");
  }, [qc]);

  // Fetch user profile for default location + commute data
  const { data: profile } = useQuery<{
    city?: string; state?: string;
    homeAddress?: string; homeLat?: number; homeLng?: number;
    vehicleYear?: string; vehicleMake?: string; vehicleModel?: string;
    vehicleId?: string; vehicleMpg?: number;
    gasPricePerGallon?: number; daysInOffice?: number;
  }>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Set default location from profile (prefer homeAddress, fallback city/state)
  const profileLocationSet = useRef(false);
  useEffect(() => {
    if (profile && !profileLocationSet.current && !where) {
      // Use home lat/lng if available (skip geocoding)
      if (profile.homeLat && profile.homeLng && profile.homeAddress) {
        setWhere(profile.homeAddress);
        setSearchCenter([profile.homeLat, profile.homeLng]);
        profileLocationSet.current = true;
      } else {
        const loc = [profile.city, profile.state].filter(Boolean).join(", ");
        if (loc) {
          setWhere(loc);
          profileLocationSet.current = true;
        }
      }
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed commute profile from DB profile (once)
  useEffect(() => {
    if (!profile || commuteProfileSeeded.current) return;
    commuteProfileSeeded.current = true;
    const local = loadCommuteProfile();
    const merged: CommuteProfile = {
      gasPricePerGallon: profile.gasPricePerGallon ?? local.gasPricePerGallon,
      vehicleMpg: profile.vehicleMpg ?? local.vehicleMpg,
      daysInOffice: profile.daysInOffice ?? local.daysInOffice,
      avoidTolls: local.avoidTolls, // stays local
      departureHour: local.departureHour, // stays local
      returnDepartureHour: local.returnDepartureHour,
      parkingMonthly: local.parkingMonthly,
      badDayMultiplier: local.badDayMultiplier,
      transitReliability: local.transitReliability,
      vehicleYear: profile.vehicleYear ?? local.vehicleYear,
      vehicleMake: profile.vehicleMake ?? local.vehicleMake,
      vehicleModel: profile.vehicleModel ?? local.vehicleModel,
      vehicleId: profile.vehicleId ?? local.vehicleId,
    };
    setCommuteProfile(merged);
    saveCommuteProfile(merged);
  }, [profile]);

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
    enabled: !!searchParams && (source === "both" || source === "adzuna"),
  });

  // Google Jobs query — SerpAPI + batch geocode (up to 5 pages)
  const { data: googleData, isFetching: googleFetching } = useQuery<{ jobs: MapJob[]; total: number }>({
    queryKey: ["google-map", searchParams],
    queryFn: async () => {
      if (!searchParams) return { jobs: [], total: 0 };
      const baseParams = { q: searchParams.q, location: searchParams.apiWhere };

      // Fetch first page
      const firstRes = await fetch(`/api/job-search?${new URLSearchParams(baseParams)}`);
      if (!firstRes.ok) return { jobs: [], total: 0 };
      const firstData = await firstRes.json();
      let allRawJobs = [...(firstData.jobs ?? [])];

      // Fetch additional pages (up to 5 total) using next_page_token
      let nextToken: string | null = firstData.nextPageToken ?? null;
      for (let pg = 2; pg <= 5 && nextToken; pg++) {
        try {
          const pgRes = await fetch(
            `/api/job-search?${new URLSearchParams({ ...baseParams, next_page_token: nextToken })}`
          );
          if (!pgRes.ok) break;
          const pgData = await pgRes.json();
          allRawJobs = [...allRawJobs, ...(pgData.jobs ?? [])];
          nextToken = pgData.nextPageToken ?? null;
        } catch {
          break;
        }
      }

      const rawJobs: Array<{
        jobId: string; title: string; company: string; location: string;
        description: string; thumbnail?: string | null; via?: string;
        applyLinks: { title: string; link: string }[];
        detectedExtensions: Record<string, unknown>;
      }> = allRawJobs;
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
    enabled: !!searchParams && !!searchParams.q && (source === "both" || source === "google"),
  });

  // USAJobs query — federal government job listings
  const { data: usajobsData, isFetching: usajobsFetching } = useQuery<{ jobs: MapJob[]; total: number }>({
    queryKey: ["usajobs-map", searchParams, searchCenter],
    queryFn: async () => {
      if (!searchParams) return { jobs: [], total: 0 };
      const params = new URLSearchParams({ q: searchParams.q });
      if (searchParams.apiWhere) params.set("location", searchParams.apiWhere);
      if (searchParams.distance) params.set("radius", searchParams.distance);
      if (searchCenter) {
        params.set("lat", String(searchCenter[0]));
        params.set("lng", String(searchCenter[1]));
      }
      const res = await fetch(`/api/usajobs?${params}`);
      if (!res.ok) return { jobs: [], total: 0 };
      return res.json();
    },
    enabled: !!searchParams && !!searchParams.q && (source === "both" || source === "usajobs"),
  });

  // Hydrate trackedIds when jobs load — match against existing applications
  useEffect(() => {
    const apps = trackedAppsRef.current;
    if (apps.length === 0) return;
    const allJobs = [
      ...(adzunaData?.jobs ?? []),
      ...(googleData?.jobs ?? []),
      ...(usajobsData?.jobs ?? []),
    ];
    if (allJobs.length === 0) return;
    const matched = new Set<string>();
    for (const job of allJobs) {
      const jCompany = job.company?.toLowerCase().trim() ?? "";
      const jRole = job.title?.toLowerCase().trim() ?? "";
      const jUrl = job.url ?? "";
      for (const app of apps) {
        if (
          (app.url && jUrl && app.url === jUrl) ||
          (app.company === jCompany && app.role === jRole)
        ) {
          matched.add(job.id);
          break;
        }
      }
    }
    if (matched.size > 0) {
      setTrackedIds((prev) => {
        const next = new Set(prev);
        for (const id of matched) next.add(id);
        return next;
      });
    }
  }, [adzunaData, googleData, usajobsData]);

  // Merge results from all sources + email leads
  const isFetching = adzunaFetching || googleFetching || usajobsFetching;
  const mergedJobs = useMemo(() => {
    const a = (source === "both" || source === "adzuna" ? adzunaData?.jobs : []) ?? [];
    const g = (source === "both" || source === "google" ? googleData?.jobs : []) ?? [];
    const u = (source === "both" || source === "usajobs" ? usajobsData?.jobs : []) ?? [];
    // Convert email leads to MapJob format — require location + coordinates
    const e: MapJob[] = emailLeads
      .filter((l) => l.lat && l.lng && l.location?.trim())
      .map((l) => ({
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
    return [...a, ...g, ...u, ...e];
  }, [adzunaData, googleData, usajobsData, source, emailLeads]);
  const totalCount = (source === "both" || source === "adzuna" ? adzunaData?.total ?? 0 : 0) + (source === "both" || source === "google" ? googleData?.total ?? 0 : 0) + (source === "both" || source === "usajobs" ? usajobsData?.total ?? 0 : 0) + emailLeads.filter((l) => l.lat && l.lng && l.location?.trim()).length;
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(JOB_COMPARE_SHORTLIST_KEY, JSON.stringify(compareShortlistIds));
  }, [compareShortlistIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(JOB_INTENT_KEY, JSON.stringify(jobIntentById));
  }, [jobIntentById]);

  const getJobDecisionMetrics = useCallback((job: MapJob) => {
    const midSalary = job.salaryMin && job.salaryMax
      ? (job.salaryMin + job.salaryMax) / 2
      : (job.salaryMin ?? job.salaryMax ?? null);
    const tx = midSalary ? estimateTaxes(midSalary, job.location) : null;
    const cachedCommute = commuteCache[`${job.id}:driving`];
    const commuteCost = cachedCommute ? yearlyCommuteCost(cachedCommute.distanceMi, commuteProfile) : 0;
    const estimatedTrueCost = tx ? tx.takeHomePay - commuteCost : midSalary ? midSalary - commuteCost : null;
    const daysOld = job.created
      ? Math.floor((Date.now() - new Date(job.created).getTime()) / 86_400_000)
      : null;
    return {
      midSalary,
      takeHomePay: tx?.takeHomePay ?? null,
      estimatedTrueCost,
      commuteCost: cachedCommute ? commuteCost : null,
      commuteMinutes: cachedCommute?.durationMin ?? null,
      commuteDistance: cachedCommute?.distanceMi ?? null,
      daysOld,
    };
  }, [commuteCache, commuteProfile]);

  const averageEstimatedTrueCost = useMemo(() => {
    const values = sortedJobs
      .map((job) => getJobDecisionMetrics(job).estimatedTrueCost)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [sortedJobs, getJobDecisionMetrics]);

  const compareShortlistJobs = useMemo(
    () => compareShortlistIds
      .map((id) => geoJobs.find((job) => job.id === id))
      .filter((job): job is MapJob => Boolean(job)),
    [compareShortlistIds, geoJobs],
  );

  const toggleCompareShortlist = useCallback((job: MapJob) => {
    setCompareShortlistIds((prev) => {
      if (prev.includes(job.id)) return prev.filter((id) => id !== job.id);
      if (prev.length >= 4) {
        toast.info("Compare shortlist is limited to 4 jobs");
        return prev;
      }
      return [...prev, job.id];
    });
  }, []);

  const setJobIntent = useCallback((jobId: string, intent: JobIntent | "none") => {
    setJobIntentById((prev) => {
      const next = { ...prev };
      if (intent === "none") delete next[jobId];
      else next[jobId] = intent;
      return next;
    });
  }, []);

  /* ── Commute Matrix: fetch per-job travel times when isochrone enabled ── */
  useEffect(() => {
    if (!isochroneEnabled || !homeAnchor || sortedJobs.length === 0) {
      setCommuteTimesMap(null);
      matrixFetchKey.current = null;
      return;
    }
    const jobIds = sortedJobs.map((j) => j.id).sort().join(",");
    const key = `${homeAnchor.lat.toFixed(4)},${homeAnchor.lng.toFixed(4)},${isochroneMode},${jobIds}`;
    if (key === matrixFetchKey.current) return;
    matrixFetchKey.current = key;

    const destinations = sortedJobs.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng }));
    fetch("/api/commute-matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: homeAnchor.lat,
        lng: homeAnchor.lng,
        mode: isochroneMode,
        destinations,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.times) {
          setCommuteTimesMap(new Map(Object.entries(data.times as Record<string, number>)));
        } else {
          setCommuteTimesMap(null);
        }
      })
      .catch(() => setCommuteTimesMap(null));
  }, [isochroneEnabled, homeAnchor, isochroneMode, sortedJobs]);

  /* ── Extended isochrone rings via convex hulls from matrix data ── */
  const mergedIsochroneRings = useMemo(() => {
    const base = isochroneRings ?? [];
    if (!commuteTimesMap || commuteTimesMap.size === 0 || sortedJobs.length === 0) return base;

    // Find max ORS ring minutes
    const maxOrsMin = base.reduce((m, r) => Math.max(m, r.minutes), 0);
    if (maxOrsMin === 0) return base;

    // Collect jobs beyond ORS range with valid commute times
    const beyond: { lat: number; lng: number; minutes: number }[] = [];
    for (const job of sortedJobs) {
      const min = commuteTimesMap.get(job.id);
      if (min != null && min > maxOrsMin) {
        beyond.push({ lat: job.lat, lng: job.lng, minutes: min });
      }
    }
    if (beyond.length < 3) return base; // need ≥3 points for a polygon

    // Group into bands (e.g. 60–75, 75–90, 90–105, 105+)
    const BAND_SIZE = 15; // minutes per band
    const maxMin = Math.max(...beyond.map((b) => b.minutes));
    const bands: { upTo: number; points: [number, number][] }[] = [];
    for (let lo = maxOrsMin; lo < maxMin; lo += BAND_SIZE) {
      const hi = lo + BAND_SIZE;
      // Cumulative: include ALL points up to this band's upper limit
      // so the hull grows outward (like the ORS rings)
      const pts: [number, number][] = beyond
        .filter((b) => b.minutes <= hi)
        .map((b) => [b.lng, b.lat]); // ORS coordinate order [lng, lat]
      if (pts.length >= 3) {
        bands.push({ upTo: Math.min(hi, maxMin), points: pts });
      }
    }
    if (bands.length === 0) return base;

    // Graham scan convex hull (returns points in CCW order, [lng, lat])
    function cross(O: [number, number], A: [number, number], B: [number, number]) {
      return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
    }
    function convexHull(points: [number, number][]): [number, number][] {
      const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (pts.length <= 2) return pts;
      const lower: [number, number][] = [];
      for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper: [number, number][] = [];
      for (const p of pts.reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }

    // Also include the outermost ORS ring's boundary points so hulls connect seamlessly
    const orsOuterPts: [number, number][] = base.length > 0
      ? (base.reduce((a, b) => (a.minutes > b.minutes ? a : b)).coordinates[0] ?? [])
      : [];

    const extendedRings = bands.map((band) => {
      const allPts: [number, number][] = [...orsOuterPts, ...band.points];
      const hull = convexHull(allPts);
      // Close the ring
      const closed = hull.length > 0 && (hull[0][0] !== hull[hull.length - 1][0] || hull[0][1] !== hull[hull.length - 1][1])
        ? [...hull, hull[0]]
        : hull;
      return {
        minutes: band.upTo,
        coordinates: [closed] as [number, number][][],
      };
    });

    return [...base, ...extendedRings];
  }, [isochroneRings, commuteTimesMap, sortedJobs]);

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
    // Clear company locations search
    setCompanyLocs([]);
    setCompanyLocsSearched(false);
    setCompanyLocsLoading(false);

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

  // ── Walk Score for selected job ──
  const [walkScoreData, setWalkScoreData] = useState<{
    walkScore: number | null;
    transitScore: number | null;
    bikeScore: number | null;
    walkDescription: string | null;
  } | null>(null);
  const walkScoreCache = useRef<Record<string, typeof walkScoreData>>({});

  useEffect(() => {
    setWalkScoreData(null);
    if (!selectedJob?.lat || !selectedJob?.lng) return;
    const cacheKey = `${selectedJob.lat.toFixed(4)},${selectedJob.lng.toFixed(4)}`;
    if (walkScoreCache.current[cacheKey]) {
      setWalkScoreData(walkScoreCache.current[cacheKey]);
      return;
    }
    const params = new URLSearchParams({
      lat: String(selectedJob.lat),
      lng: String(selectedJob.lng),
      address: selectedJob.location || "",
    });
    fetch(`/api/walk-score?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          const ws = {
            walkScore: d.walkScore ?? null,
            transitScore: d.transitScore ?? null,
            bikeScore: d.bikeScore ?? null,
            walkDescription: d.walkDescription ?? null,
          };
          walkScoreCache.current[cacheKey] = ws;
          setWalkScoreData(ws);
        }
      })
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

  // ── Compute dimmed marker IDs (recruiter-flagged + outside isochrone) ──
  const prevDimmedIdsRef = useRef<Set<string>>(new Set());
  const dimmedIds = useMemo(() => {
    const set = new Set<string>();
    for (const job of sortedJobs) {
      const norm = job.company.toLowerCase().trim();
      if (isLikelyRecruiter(job.company) || isUserFlaggedRecruiter(job.company) || recruiterFlagDb[norm]?.confirmed) {
        set.add(job.id);
      }
      if (jobIntentById[job.id] === "rejected" || jobIntentById[job.id] === "not-fit") {
        set.add(job.id);
      }
    }
    // Dim jobs outside isochrone outermost ring (if active)
    if (isochroneEnabled && mergedIsochroneRings && mergedIsochroneRings.length > 0) {
      // Use the outermost (largest minutes) ring for dimming
      const outermost = mergedIsochroneRings.reduce((a, b) => (a.minutes > b.minutes ? a : b));
      const ring = outermost.coordinates[0]; // outer boundary — [lng, lat] pairs from ORS
      for (const job of sortedJobs) {
        if (!set.has(job.id) && !pointInRing(job.lng, job.lat, ring)) {
          set.add(job.id);
        }
      }
    }
    // Return the previous Set reference if contents haven't changed (prevents marker rebuild)
    const prev = prevDimmedIdsRef.current;
    if (set.size === prev.size && [...set].every((id) => prev.has(id))) return prev;
    prevDimmedIdsRef.current = set;
    return set;
  }, [sortedJobs, recruiterFlagDb, jobIntentById, isochroneEnabled, mergedIsochroneRings]);

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

  /** Memoized anchor routes for the map (prevents new reference on every render) */
  const anchorRoutesForMap = useMemo(() => {
    if (!selectedJob || !anchorCommutes) return [];
    return Object.entries(anchorCommutes)
      .filter(([aId]) => enabledAnchors.has(aId))
      .map(([aId, info], i) => ({
        anchorId: aId,
        geometry: (info as any)?.geometry ?? null,
        color: ANCHOR_COLORS[lifeAnchors.findIndex((a) => a.id === aId) % ANCHOR_COLORS.length],
        label: (lifeAnchors ?? []).find((a: LifeAnchorData) => a.id === aId)?.label ?? "",
      })).filter((r) => r.geometry);
  }, [selectedJob, anchorCommutes, enabledAnchors, lifeAnchors]);

  /** Memoized anchor markers for the map */
  const anchorMarkersForMap = useMemo(() => {
    if (!lifeAnchors || lifeAnchors.length === 0) return [];
    return (lifeAnchors as LifeAnchorData[]).map((a, i) => ({
      id: a.id,
      lat: a.lat,
      lng: a.lng,
      label: a.label,
      icon: a.icon ?? "map-pin",
      color: ANCHOR_COLORS[i % ANCHOR_COLORS.length],
    }));
  }, [lifeAnchors]);

  /** Memoized work-history markers for the map */
  const workHistoryMarkersForMap = useMemo(() => {
    if (!showWorkHistory || workHistory.length === 0) return [];
    return workHistory
      .filter((w) => (w.type ?? "job") !== "unemployed")
      .filter((w) => !hiddenTypes.has(w.type ?? "job"))
      .filter((w) => {
        if (!timeFilter) return true;
        // Show entry if timeFilter falls within its [startDate, endDate] range
        const start = w.startDate ?? "0000-01";
        const end = w.endDate ?? "9999-12";
        return timeFilter >= start && timeFilter <= end;
      })
      .map((w) => ({
        id: w.id,
        lat: w.lat,
        lng: w.lng,
        label: w.company,
        title: w.title,
        type: w.type ?? "job",
        startDate: w.startDate ?? null,
        endDate: w.endDate ?? null,
        coverImage: w.coverImage ?? null,
        coverImageY: w.coverImageY ?? 50,
        uniformData: w.uniformData ?? null,
      }));
  }, [showWorkHistory, workHistory, timeFilter, hiddenTypes]);

  /** Active residence for the selected time period */
  const activeResidence = useMemo(() => {
    if (residences.length === 0) return null;
    if (!timeFilter) {
      // No time filter → use current residence or the most recent one
      return residences.find((r) => r.isCurrent) ?? residences[residences.length - 1] ?? null;
    }
    // Find the residence active during timeFilter
    for (const r of residences) {
      const start = r.startDate ?? "0000-01";
      const end = r.endDate ?? "9999-12";
      if (timeFilter >= start && timeFilter <= end) return r;
    }
    return null;
  }, [residences, timeFilter]);

  /** Residence marker for the Google Map */
  const residenceMarkerForMap = useMemo(() => {
    if (!showWorkHistory || !activeResidence) return null;
    return { id: activeResidence.id, lat: activeResidence.lat, lng: activeResidence.lng, label: activeResidence.label, address: activeResidence.address };
  }, [showWorkHistory, activeResidence]);

  /** Time range bounds from all work history + residences */
  const timeRange = useMemo(() => {
    const dates: string[] = [];
    for (const w of workHistory) {
      if (w.startDate) dates.push(w.startDate);
      if (w.endDate) dates.push(w.endDate);
    }
    for (const r of residences) {
      if (r.startDate) dates.push(r.startDate);
      if (r.endDate) dates.push(r.endDate);
    }
    if (dates.length === 0) return null;
    dates.sort();
    const now = new Date();
    const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { min: dates[0], max: dates[dates.length - 1] > nowStr ? dates[dates.length - 1] : nowStr };
  }, [workHistory, residences]);

  /** IDs of work-history entries concurrent with the currently focused one */
  const concurrentWorkHistoryIds = useMemo(() => {
    if (!focusedWorkHistoryId || !showWorkHistory) return new Set<string>();
    const focused = workHistory.find((w: { id: string }) => w.id === focusedWorkHistoryId);
    if (!focused?.startDate) return new Set<string>();
    const ids = new Set<string>();
    for (const w of workHistory) {
      if (w.id === focusedWorkHistoryId) continue;
      if (dateRangesOverlap(focused.startDate, focused.endDate, w.startDate, w.endDate)) {
        ids.add(w.id);
      }
    }
    return ids;
  }, [focusedWorkHistoryId, showWorkHistory, workHistory]);

  /** Memoized sub-location markers for the map */
  const workHistorySubLocationsForMap = useMemo(() => {
    if (!showWorkHistory || workHistory.length === 0) return [];
    return workHistory.flatMap((w) =>
      (w.locations ?? []).map((loc) => {
        let photos: string[] = [];
        try { photos = loc.photos ? JSON.parse(loc.photos) : []; } catch { photos = []; }
        return {
          id: loc.id,
          parentId: w.id,
          lat: loc.lat,
          lng: loc.lng,
          label: loc.label,
          type: loc.type,
          address: loc.address,
          parentLat: w.lat,
          parentLng: w.lng,
          photos,
        };
      })
    );
  }, [showWorkHistory, workHistory]);

  /* ── Building footprints fetch ── */
  useEffect(() => {
    if (!showBuildingHighlights) { setBuildingFootprints([]); return; }

    // Collect all geocoded marker coords with colour
    const markers: { id: string; lat: number; lng: number; color: string }[] = [];

    // Life anchors
    if (lifeAnchors && (lifeAnchors as LifeAnchorData[]).length > 0) {
      (lifeAnchors as LifeAnchorData[]).forEach((a, i) => {
        markers.push({ id: `anchor-${a.id}`, lat: a.lat, lng: a.lng, color: ANCHOR_COLORS[i % ANCHOR_COLORS.length] });
      });
    }

    // Work history
    if (showWorkHistory) {
      workHistory.forEach((w) => {
        markers.push({ id: `wh-${w.id}`, lat: w.lat, lng: w.lng, color: "#6b7280" });
        (w.locations ?? []).forEach((loc) => {
          markers.push({ id: `whloc-${loc.id}`, lat: loc.lat, lng: loc.lng, color: "#9ca3af" });
        });
      });
    }

    // Office locations for selected job
    if (resolvedAddress?.allLocations) {
      resolvedAddress.allLocations.forEach((o, i) => {
        markers.push({ id: `office-${i}`, lat: o.lat, lng: o.lng, color: "#3b82f6" });
      });
    }

    if (markers.length === 0) { setBuildingFootprints([]); return; }

    // Dedupe by rounded key, keep first colour
    const seen = new Map<string, { id: string; lat: number; lng: number; color: string }>();
    for (const m of markers) {
      const k = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
      if (!seen.has(k)) seen.set(k, m);
    }
    const unique = [...seen.values()];

    // Check cache for already-fetched coords
    const toFetch: typeof unique = [];
    const cached: { coords: { lat: number; lng: number }[]; color: string }[] = [];
    for (const m of unique) {
      const k = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
      const hit = buildingCacheRef.current.get(k);
      if (hit) {
        hit.forEach((ring) => cached.push({ coords: ring, color: m.color }));
      } else {
        toFetch.push(m);
      }
    }

    if (toFetch.length === 0) { setBuildingFootprints(cached); return; }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/building-footprints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates: toFetch.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })) }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const fp: { coords: { lat: number; lng: number }[]; color: string }[] = [...cached];
        for (const item of data.footprints ?? []) {
          const source = toFetch.find((m) => m.id === item.id);
          if (!source) continue;
          const k = `${source.lat.toFixed(5)},${source.lng.toFixed(5)}`;
          buildingCacheRef.current.set(k, item.polygons ?? []);
          for (const ring of item.polygons ?? []) {
            fp.push({ coords: ring, color: source.color });
          }
        }
        if (!cancelled) setBuildingFootprints(fp);
      } catch (err) {
        console.error("Building footprint fetch error:", err);
        if (!cancelled) setBuildingFootprints(cached);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBuildingHighlights, lifeAnchors, showWorkHistory, workHistory, resolvedAddress?.allLocations]);

  /** For each job, find closest work-history pin within 3 miles */
  const nearbyWorkHistoryMap = useMemo(() => {
    if (workHistory.length === 0) return {} as Record<string, WorkHistoryItem>;
    const result: Record<string, WorkHistoryItem> = {};
    for (const job of sortedJobs) {
      let closest: WorkHistoryItem | null = null;
      let minDist = Infinity;
      for (const w of workHistory) {
        const dLat = (job.lat - w.lat) * 69;
        const dLng = (job.lng - w.lng) * 69 * Math.cos(job.lat * Math.PI / 180);
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist < 3 && dist < minDist) { closest = w; minDist = dist; }
      }
      if (closest) result[job.id] = closest;
    }
    return result;
  }, [workHistory, sortedJobs]);

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

  /** Search for all company locations nearby (for job search) */
  async function searchCompanyLocations() {
    if (!selectedJob || !resolvedAddress) return;
    setCompanyLocsLoading(true);
    setCompanyLocsSearched(true);
    try {
      const params = new URLSearchParams({
        query: selectedJob.company,
        lat: String(resolvedAddress.lat),
        lng: String(resolvedAddress.lng),
        radius: String(companyLocsRadius),
      });
      const res = await fetch(`/api/nearby-buildings?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCompanyLocs(data.buildings ?? []);
      if ((data.buildings ?? []).length >= 15) {
        toast.info(`${data.buildings.length} locations found — this may be a chain or franchise`);
      }
    } catch {
      toast.error("Could not search company locations");
    } finally {
      setCompanyLocsLoading(false);
    }
  }

  function toggleJobSection(key: string) {
    setJobPanelSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Reset job panel sections when selected job changes
  useEffect(() => {
    setJobPanelSections(new Set(["description"]));
    setStreetViewVisible(true);
  }, [selectedJob?.id]);

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
    if (!query.trim()) {
      toast.error("Enter a job title or keyword to search");
      return;
    }
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

  const selectedJobUtilityControls = selectedJob ? (
    <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/90 p-1 shadow-lg backdrop-blur-sm">
      {GOOGLE_MAPS_KEY && effectiveJobCoords && (
        <Button
          size="icon"
          variant={streetViewVisible ? "secondary" : "ghost"}
          className="h-7 w-7 rounded-full"
          title={streetViewVisible ? "Hide Street View" : "Show Street View"}
          onClick={() => setStreetViewVisible((prev) => !prev)}
        >
          <PersonStanding className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        size="icon"
        variant={trackedIds.has(selectedJob.id) ? "secondary" : "ghost"}
        disabled={trackedIds.has(selectedJob.id)}
        className="h-7 w-7 rounded-full"
        title={trackedIds.has(selectedJob.id) ? "Already tracked" : "Track job"}
        onClick={() => trackMutation.mutate(selectedJob)}
      >
        {trackedIds.has(selectedJob.id) ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Save to interest group">
          <Star className="h-3.5 w-3.5" />
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
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 rounded-full"
        title="Close panel"
        onClick={() => {
          setSelectedJob(null);
          setShowDetails(false);
          if (searchCenter) setZoomTarget({ lat: searchCenter[0], lng: searchCenter[1], zoom: 11 });
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  ) : null;

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
            className="pl-8 pr-7 h-9 text-sm"
          />
          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSearchParams(null);
                setSearched(false);
                setSelectedJob(null);
                setShowDetails(false);
                setPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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

        {/* Save current search */}
        <Popover open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <PopoverTrigger
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border bg-background hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Save this search"
            disabled={!where.trim()}
          >
            <Bookmark className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium">Save Search</p>
              <Input
                placeholder="Name this search..."
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveSearch(); }}
              />
              <p className="text-xs text-muted-foreground">
                {query.trim() ? `"${query.trim()}" in ` : ""}{where.trim()} ({radius}mi)
              </p>
              <Button size="sm" className="w-full h-7" onClick={handleSaveSearch} disabled={savingSearch || !saveSearchName.trim()}>
                {savingSearch ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Load saved searches */}
        {savedSearches.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-2.5 h-9 text-sm hover:bg-accent">
              <Bookmark className="h-3.5 w-3.5" />
              Saved ({savedSearches.length})
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
              <DropdownMenuLabel>Saved Searches</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedSearches.map((s) => (
                <DropdownMenuItem key={s.id} className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => handleLoadSearch(s)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.query ? `${s.query} · ` : ""}{s.location}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded-md hover:bg-accent"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSearch(s.id); }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                  </button>
                </DropdownMenuItem>
              ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
      <div
        className={
          showWorkHistory
            ? "fixed inset-0 z-[60] flex gap-0 bg-background"
            : "flex gap-3 h-[calc(100vh-220px)] min-h-[500px]"
        }
      >
        {/* Map */}
        <div
          ref={mapContainerRef}
          className={
            showWorkHistory
              ? "flex-1 overflow-hidden bg-muted relative"
              : "flex-1 rounded-xl overflow-hidden border bg-muted relative"
          }
        >
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
              onViewChange={handleViewChange}
              routeGeometry={commuteInfo?.geometry ?? null}
              transitSteps={commuteInfo?.transitSteps}
              anchorRoutes={showAnchors ? anchorRoutesForMap : []}
              anchorMarkers={showAnchors ? anchorMarkersForMap : []}
              showHeatmap={showHeatmap}
              showTraffic={showTraffic}
              showTransit={showTransit}
              showTaxZones={showTaxZones}
              showStateTax={showStateTax}
              showCityTax={showCityTax}
              showCountyPropTax={showCountyPropTax}
              tileStyle={tileStyle}
              resolvedCoords={effectiveJobCoords}
              highlightedIds={pagedJobs.map((j) => j.id)}
              sweetSpot={showAnchors && showSweetSpot ? sweetSpot : null}
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
              workHistoryMarkers={workHistoryMarkersForMap}
              workHistorySubLocations={workHistorySubLocationsForMap}
              showCareerPath={showCareerPath}
              focusedWorkHistoryId={focusedWorkHistoryId}
              concurrentWorkHistoryIds={showOverlaps ? concurrentWorkHistoryIds : undefined}
              residenceMarker={residenceMarkerForMap}
              buildingFootprints={buildingFootprints}
              pinDropMode={pinDropMode}
              companyLocationMarkers={companyLocs}
              showWorkHistory={showWorkHistory}
              onToggleWorkHistory={() => {
                if (showWorkHistory && !showWorkHistoryPanel) {
                  setShowWorkHistoryPanel(true);
                } else if (showWorkHistory && showWorkHistoryPanel) {
                  setShowWorkHistory(false);
                  setShowWorkHistoryPanel(false);
                } else {
                  setShowWorkHistory(true);
                  setShowWorkHistoryPanel(true);
                }
              }}
              onMapClick={(coords) => {
                setPinDropCoords(coords);
                setPinDropMode(false);
              }}
              onSelectWorkHistory={(marker) => {
                // Remember current map position for snap-back
                if (searchCenter) {
                  preWorkHistoryZoomRef.current = { lat: searchCenter[0], lng: searchCenter[1], zoom: 11 };
                }
                // Determine the work history entry id
                const whId = "parentId" in marker ? marker.parentId : marker.id;
                setFocusedWorkHistoryId(whId);
                setShowWorkHistoryPanel(true);
                setShowWorkHistory(true);
                // Zoom handled by the map component itself
              }}
              onClusterHover={(jobs, position) => {
                if (clusterHoverTimer.current) clearTimeout(clusterHoverTimer.current);
                setClusterPreview({ jobs, position });
              }}
              onClusterHoverEnd={() => {
                clusterHoverTimer.current = setTimeout(() => setClusterPreview(null), 300);
              }}
              isochroneRings={isochroneEnabled ? mergedIsochroneRings : null}
              commuteTimesMap={isochroneEnabled ? commuteTimesMap : null}
              amenityPins={amenityPinsForMap}
              amenityRadius={amenityRadiusForMap}
              zoomTarget={zoomTarget}
              amenityCategories={AMENITY_CATEGORIES}
              activeAmenities={activeAmenities}
              amenityLoading={amenityLoading}
              onToggleAmenity={toggleAmenityCategory}
              onMapReady={handleMapReady}
              onCursorMove={setCursorCoords}
            />

          {/* ── Drawing canvas overlay (always mounted when there are drawings) ── */}
          {(drawingActive || (scopeFilteredDrawings && scopeFilteredDrawings.length > 0)) && (
            <MapDrawingCanvas
              ref={drawingCanvasRef}
              active={drawingActive}
              settings={drawingSettings}
              mapBounds={mapBoundsForDrawing}
              mapZoom={mapZoom}
              mapCenter={mapViewCenter ? { lat: mapViewCenter[0], lng: mapViewCenter[1] } : null}
              containerWidth={mapContainerSize.w}
              containerHeight={mapContainerSize.h}
              savedDrawings={scopeFilteredDrawings as never}
              activeLayerId={activeDrawingLayerId}
              activeScope={activeDrawingScope}
              hiddenLayerIds={hiddenDrawingLayerIds}
              onDrawingComplete={handleDrawingComplete}
              onDrawingDelete={handleDrawingDelete}
              onMeasurement={setDrawingMeasurement}
              latLngToPixel={latLngToPixel}
              pixelToLatLng={pixelToLatLng}
            />
          )}
          {drawingActive && (
              <MapDrawingPanel
                canvasRef={drawingCanvasRef}
                settings={drawingSettings}
                onSettingsChange={setDrawingSettings}
                layers={drawingLayers}
                activeLayerId={activeDrawingLayerId}
                onActiveLayerChange={setActiveDrawingLayerId}
                onCreateLayer={handleCreateLayer}
                onDeleteLayer={handleDeleteLayer}
                onToggleLayerVisibility={handleToggleLayerVisibility}
                measurement={drawingMeasurement}
                activeScope={activeDrawingScope}
                activeScopeLabel={activeScopeLabel}
                onClose={() => setDrawingActive(false)}
              />
          )}

          {/* ── Dev info overlay (bottom-left) ── */}
          <div className="absolute bottom-2 left-2 z-[1050] bg-black/70 text-green-400 font-mono text-[10px] leading-tight rounded px-2 py-1.5 pointer-events-none select-none max-w-[260px]">
            <div>Zoom: {mapZoom}</div>
            {mapViewCenter && (
              <div>Center: {mapViewCenter[0].toFixed(5)}, {mapViewCenter[1].toFixed(5)}</div>
            )}
            {cursorCoords && (
              <div>Cursor: {cursorCoords.lat.toFixed(5)}, {cursorCoords.lng.toFixed(5)}</div>
            )}
            {searchCenter && (
              <div>Search: {searchCenter[0].toFixed(5)}, {searchCenter[1].toFixed(5)}</div>
            )}
          </div>

          {/* ── Map layer controls (bottom-right, above zoom) ── */}
          <div className="absolute bottom-6 right-[60px] z-[1050] flex flex-row gap-2 pointer-events-auto">
            <div className="rounded-lg overflow-hidden shadow-md border border-gray-300 flex flex-row">
              <button
                type="button"
                onClick={() => setShowHeatmap((v) => !v)}
                title="Heatmap"
                className={`flex items-center justify-center w-10 h-10 border-r border-gray-200 cursor-pointer transition-colors ${showHeatmap ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
              >
                <Flame className={`h-[18px] w-[18px] ${showHeatmap ? "text-blue-600" : "text-gray-600"}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowTraffic((v) => !v)}
                title="Traffic"
                className={`flex items-center justify-center w-10 h-10 border-r border-gray-200 cursor-pointer transition-colors ${showTraffic ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
              >
                <Car className={`h-[18px] w-[18px] ${showTraffic ? "text-blue-600" : "text-gray-600"}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowTransit((v) => !v)}
                title="Transit"
                className={`flex items-center justify-center w-10 h-10 border-r border-gray-200 cursor-pointer transition-colors ${showTransit ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
              >
                <TrainFront className={`h-[18px] w-[18px] ${showTransit ? "text-blue-600" : "text-gray-600"}`} />
              </button>
              <Popover>
                <PopoverTrigger
                  title="Tax Zones"
                  className={`flex items-center justify-center w-10 h-10 border-r border-gray-200 cursor-pointer transition-colors ${showTaxZones ? "bg-emerald-50" : "bg-white hover:bg-gray-50"}`}
                >
                  <Landmark className={`h-[18px] w-[18px] ${showTaxZones ? "text-emerald-600" : "text-gray-600"}`} />
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end" side="left">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Tax Zones</Label>
                      <Switch checked={showTaxZones} onCheckedChange={setShowTaxZones} />
                    </div>
                    {showTaxZones && (
                      <>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">State Income Tax</span>
                          <Switch checked={showStateTax} onCheckedChange={setShowStateTax} className="scale-90" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">City/Local Tax</span>
                          <Switch checked={showCityTax} onCheckedChange={setShowCityTax} className="scale-90" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">County Property Tax</span>
                          <Switch checked={showCountyPropTax} onCheckedChange={setShowCountyPropTax} className="scale-90" />
                        </div>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger
                  title="Commute zone"
                  className={`flex items-center justify-center w-10 h-10 border-r border-gray-200 cursor-pointer transition-colors ${isochroneEnabled ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
                >
                  {isochroneLoading
                    ? <Loader2 className="h-[18px] w-[18px] text-blue-600 animate-spin" />
                    : <Clock className={`h-[18px] w-[18px] ${isochroneEnabled ? "text-blue-600" : "text-gray-600"}`} />
                  }
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end" side="left">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Commute Zone</Label>
                      <Switch checked={isochroneEnabled} onCheckedChange={(v) => {
                        if (v && !homeAnchor) {
                          toast.error("Set a Home anchor first (Life Anchors panel)");
                          return;
                        }
                        setIsochroneEnabled(v);
                      }} />
                    </div>
                    {isochroneEnabled && (
                      <>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Travel mode</Label>
                          <Select value={isochroneMode} onValueChange={(v) => setIsochroneMode(v as typeof isochroneMode)}>
                            <SelectTrigger className="h-7 text-xs mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="driving-car">🚗 Driving</SelectItem>
                              <SelectItem value="cycling-regular">🚲 Cycling</SelectItem>
                              <SelectItem value="foot-walking">🚶 Walking</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Covers your {radius} mi search radius. Jobs outside are dimmed.
                        </p>
                        {mergedIsochroneRings && mergedIsochroneRings.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground font-semibold">Commute Time Key</Label>
                            <div className="flex flex-col gap-0.5">
                              {[...mergedIsochroneRings]
                                .sort((a, b) => a.minutes - b.minutes)
                                .map((ring, i, arr) => {
                                  const count = arr.length;
                                  const progress = count === 1 ? 0 : i / (count - 1);
                                  const h = 120 - progress * 120;
                                  return (
                                    <div key={ring.minutes} className="flex items-center gap-1.5">
                                      <span
                                        className="inline-block w-3 h-3 rounded-sm shrink-0"
                                        style={{ backgroundColor: `hsl(${h}, 75%, 45%)`, opacity: 0.8 }}
                                      />
                                      <span className="text-[10px]">
                                        {i === 0 ? `0 – ${ring.minutes}` : `${arr[i - 1].minutes} – ${ring.minutes}`} min
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger
                  title="Map style"
                  className="flex items-center justify-center w-10 h-10 bg-white cursor-pointer hover:bg-gray-50"
                >
                  <Layers className="h-[18px] w-[18px] text-gray-600" />
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="end" side="left">
                  <div className="space-y-0.5">
                    {([
                      { value: "osm", label: "OSM" },
                      { value: "google-roadmap", label: "Google Road" },
                      { value: "google-satellite", label: "Satellite" },
                      { value: "google-hybrid", label: "Hybrid" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors ${tileStyle === opt.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setTileStyle(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => {
                  if (showAnchors && !showAnchorsPanel) {
                    // Feature on but panel closed → reopen panel
                    setShowAnchorsPanel(true);
                  } else if (showAnchors && showAnchorsPanel) {
                    // Both on → turn everything off
                    setShowAnchors(false);
                    setShowAnchorsPanel(false);
                  } else {
                    // Feature off → turn on + open panel
                    setShowAnchors(true);
                    setShowAnchorsPanel(true);
                  }
                }}
                title="Life Anchors"
                className={`flex items-center justify-center w-10 h-10 border-l border-gray-200 cursor-pointer transition-colors ${showAnchors ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
              >
                <Anchor className={`h-[18px] w-[18px] ${showAnchors ? "text-blue-600" : "text-gray-600"}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowBuildingHighlights(!showBuildingHighlights)}
                title="Highlight Buildings"
                className={`flex items-center justify-center w-10 h-10 border-l border-gray-200 cursor-pointer transition-colors ${showBuildingHighlights ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
              >
                <Building2 className={`h-[18px] w-[18px] ${showBuildingHighlights ? "text-blue-600" : "text-gray-600"}`} />
              </button>
              <button
                type="button"
                onClick={() => setDrawingActive(!drawingActive)}
                title="Drawing Tools"
                className={`flex items-center justify-center w-10 h-10 border-l border-gray-200 cursor-pointer transition-colors ${drawingActive ? "bg-violet-50" : "bg-white hover:bg-gray-50"}`}
              >
                <PaintbrushVertical className={`h-[18px] w-[18px] ${drawingActive ? "text-violet-600" : "text-gray-600"}`} />
              </button>
            </div>
          </div>

          {/* ── Tax Zone Legend ── */}
          {showTaxZones && (
            <div className="absolute bottom-20 right-[60px] z-[1050] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-2.5 text-xs" style={{ minWidth: 170 }}>
              <div className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-emerald-600" />
                State Income Tax
              </div>
              {TAX_ZONE_LEGEND.map((tier) => (
                <div key={tier.label} className="flex items-center gap-2 py-0.5">
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: tier.color }} />
                  <span className="text-gray-600">{tier.label}</span>
                </div>
              ))}
              <div className="mt-1.5 text-[10px] text-gray-400 leading-tight">
                Effective rates at ~$80k income · Click a zone for details
              </div>
            </div>
          )}

          {/* ── Floating Life Anchors panel on map ── */}
          {showAnchorsPanel && (
            <div className="absolute top-3 left-3 z-[1100] bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-80 max-h-[50vh] overflow-y-auto scrollbar-thin pointer-events-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Anchor className="h-4 w-4 text-violet-500" /> Life Anchors
                </span>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowAnchorsPanel(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Sweet Spot toggle */}
              <label className="flex items-center justify-between gap-2 mb-2 px-0.5">
                <span className="text-xs text-muted-foreground">Show Sweet Spot radius</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showSweetSpot}
                  onClick={() => setShowSweetSpot((p) => !p)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${showSweetSpot ? 'bg-violet-500' : 'bg-muted'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${showSweetSpot ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
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

          {/* ── Floating Work History panel on map ── */}
          {showWorkHistoryPanel && (
            <WorkHistoryPanel
              items={workHistory}
              onClose={() => { setShowWorkHistoryPanel(false); setFocusedWorkHistoryId(null); setPinDropMode(false); }}
              onAdded={() => queryClient.invalidateQueries({ queryKey: ["work-history"] })}
              onDeleted={() => queryClient.invalidateQueries({ queryKey: ["work-history"] })}
              showCareerPath={showCareerPath}
              onToggleCareerPath={() => setShowCareerPath((p) => !p)}
              showOverlaps={showOverlaps}
              onToggleOverlaps={() => setShowOverlaps((p) => !p)}
              focusedId={focusedWorkHistoryId}
              pinDropMode={pinDropMode}
              pinDropCoords={pinDropCoords}
              onStartPinDrop={() => setPinDropMode(true)}
              onCancelPinDrop={() => { setPinDropMode(false); setPinDropCoords(null); }}
              onClearPinDrop={() => setPinDropCoords(null)}
              residences={residences}
              activeResidence={activeResidence}
              timeFilter={timeFilter}
              timeRange={timeRange}
              onTimeFilterChange={setTimeFilter}
              onResidenceAdded={() => queryClient.invalidateQueries({ queryKey: ["residences"] })}
              onResidenceDeleted={() => queryClient.invalidateQueries({ queryKey: ["residences"] })}
              hiddenTypes={hiddenTypes}
              onToggleType={(type) => setHiddenTypes((prev) => { const s = new Set(prev); if (s.has(type)) s.delete(type); else s.add(type); return s; })}
              onExitFocus={() => {
                setFocusedWorkHistoryId(null);
                setPinDropMode(false);
                setPinDropCoords(null);
                // Fit map to all work history markers
                if (workHistoryMarkersForMap.length > 0) {
                  const lats = workHistoryMarkersForMap.map((m) => m.lat);
                  const lngs = workHistoryMarkersForMap.map((m) => m.lng);
                  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
                  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
                  const cLat = (minLat + maxLat) / 2;
                  const cLng = (minLng + maxLng) / 2;
                  // Estimate zoom: larger spread → lower zoom
                  const spread = Math.max(maxLat - minLat, maxLng - minLng);
                  const zoom = spread < 0.01 ? 15 : spread < 0.05 ? 13 : spread < 0.2 ? 11 : spread < 1 ? 9 : 7;
                  setZoomTarget({ lat: cLat, lng: cLng, zoom });
                } else if (preWorkHistoryZoomRef.current) {
                  setZoomTarget(preWorkHistoryZoomRef.current);
                }
                preWorkHistoryZoomRef.current = null;
              }}
              onFocusJob={(item) => {
                if (searchCenter) {
                  preWorkHistoryZoomRef.current = { lat: searchCenter[0], lng: searchCenter[1], zoom: 11 };
                }
                setFocusedWorkHistoryId(item.id);
                setZoomTarget({ lat: item.lat, lng: item.lng, zoom: 17 });
              }}
              mapContainer={mapContainerRef.current}
            />
          )}

          {/* ── Isochrone Commute Time Legend (floating on map) ── */}
          {isochroneEnabled && mergedIsochroneRings && mergedIsochroneRings.length > 0 && (
            <div className="absolute bottom-3 left-3 z-[1050] bg-background/90 backdrop-blur-sm border rounded-lg shadow-lg px-3 py-2 pointer-events-auto">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Commute Time</p>
              <div className="flex items-end gap-0.5">
                {[...mergedIsochroneRings]
                  .sort((a, b) => a.minutes - b.minutes)
                  .map((ring, i, arr) => {
                    const count = arr.length;
                    const progress = count === 1 ? 0 : i / (count - 1);
                    const h = 120 - progress * 120;
                    return (
                      <div key={ring.minutes} className="flex flex-col items-center">
                        <div
                          className="w-5 rounded-sm"
                          style={{
                            height: `${12 + (count - 1 - i) * 2}px`,
                            backgroundColor: `hsl(${h}, 75%, 45%)`,
                            opacity: 0.85,
                          }}
                        />
                        <span className="text-[8px] text-muted-foreground mt-0.5">{ring.minutes}</span>
                      </div>
                    );
                  })}
              </div>
              <p className="text-[8px] text-muted-foreground mt-0.5 text-center">minutes</p>
            </div>
          )}

          {/* ── Cluster Preview Card ── */}
          {clusterPreview && (
            <div
              className="absolute top-3 left-3 z-[1100] bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-4 w-72 max-h-64 overflow-y-auto pointer-events-auto"
              onMouseEnter={() => { if (clusterHoverTimer.current) clearTimeout(clusterHoverTimer.current); }}
              onMouseLeave={() => { clusterHoverTimer.current = setTimeout(() => setClusterPreview(null), 300); }}
            >
              <span className="text-sm font-semibold">{clusterPreview.jobs.length} jobs here</span>
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
                    <div className="space-y-1 mt-2">
                      {topCos.map(([co, count]) => (
                        <div key={co} className="flex justify-between text-xs">
                          <span className="truncate max-w-[180px]">{co}</span>
                          <span className="text-muted-foreground">{count} job{count > 1 ? "s" : ""}</span>
                        </div>
                      ))}
                      {companies.size > 3 && <div className="text-xs text-muted-foreground">+{companies.size - 3} more companies</div>}
                    </div>
                    {minSal !== Infinity && (
                      <div className="text-xs text-muted-foreground mt-2">
                        Salary range: ${Math.round(minSal / 1000)}k – ${Math.round(maxSal / 1000)}k
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="text-[10px] text-muted-foreground mt-2">Click cluster to zoom in</div>
            </div>
          )}

          {/* ── Area Tax Info Card ── */}
          {areaInfo && searched && !selectedJob && !focusedWorkHistoryId && (() => {
            const stateCode = areaInfo.state ? resolveState(areaInfo.state) : null;
            const baseSalary = meanSalary ?? 75_000;
            const salaryLabel = meanSalary
                ? `Avg salary ${formatSalaryCompact(baseSalary)}`
                : `Est. @ ${formatSalaryCompact(baseSalary)}`;
            const tx = estimateTaxes(baseSalary, areaInfo.city && stateCode ? `${areaInfo.city}, ${stateCode}` : stateCode ?? "");
            const isZoomedIn = mapZoom >= 12 && areaInfo.city;
            return (
              <div className="absolute top-3 right-3 z-[1100] bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-64">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold truncate">{areaInfo.label}</span>
                  </div>
                </div>

                {/* State Taxes */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">State & Federal</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div className="text-xs text-muted-foreground">Federal</div>
                    <div className="text-xs font-mono text-right">{(tx.marginalFederalRate * 100).toFixed(0)}% marginal</div>
                    <div className="text-xs text-muted-foreground">State{stateCode ? ` (${stateCode})` : ""}</div>
                    <div className="text-xs font-mono text-right">
                      {tx.stateIncomeTax === 0 && stateCode ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">No income tax</span>
                      ) : (
                        `${(tx.marginalStateRate * 100).toFixed(1)}% marginal`
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">FICA</div>
                    <div className="text-xs font-mono text-right">7.65%</div>
                  </div>

                  {/* Local Taxes — only when zoomed in */}
                  {isZoomedIn && tx.localTaxes.length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Local Taxes</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {tx.localTaxes.map((lt) => (
                          <Fragment key={lt.name}>
                            <div className="text-xs text-muted-foreground truncate" title={lt.name}>{lt.name}</div>
                            <div className="text-xs font-mono text-right text-orange-600 dark:text-orange-400">{(lt.amount / baseSalary * 100).toFixed(2)}%</div>
                          </Fragment>
                        ))}
                      </div>
                    </>
                  )}
                  {isZoomedIn && tx.localTaxes.length === 0 && (
                    <>
                      <Separator className="my-1" />
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">No local income/wage tax</div>
                    </>
                  )}

                  <Separator className="my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground truncate" title={salaryLabel}>{salaryLabel}</span>
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{(tx.effectiveRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">≈ Take-home</span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatSalaryCompact(tx.takeHomePay)}/yr</span>
                  </div>

                  {/* Gas Prices (EIA) */}
                  {gasPrice && (
                    <>
                      <Separator className="my-1" />
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gas (Regular)</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Fuel className="h-3 w-3" /> {gasPrice.region && gasPrice.region !== gasPrice.state ? gasPrice.region : gasPrice.state}
                        </span>
                        <span className="text-xs font-mono font-bold">${gasPrice.price.toFixed(2)}/gal</span>
                      </div>
                      {homeGasPrice && homeGasPrice.state !== gasPrice.state && (() => {
                        const diff = gasPrice.price - homeGasPrice.price;
                        return (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Home className="h-3 w-3" /> {homeGasPrice.state}
                            </span>
                            <span className="text-xs font-mono text-right">
                              ${homeGasPrice.price.toFixed(2)}
                              <span className={`ml-1 text-[9px] ${diff > 0.01 ? "text-orange-500" : diff < -0.01 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                ({diff > 0 ? "+" : ""}{diff.toFixed(2)})
                              </span>
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Overlay states on top of the map */}
          {isFetching && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
              <div className="bg-background/80 backdrop-blur-sm rounded-xl px-6 py-4 flex items-center gap-2 shadow-lg text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Searching{source === "google" ? " Google Jobs" : source === "adzuna" ? " Adzuna" : source === "usajobs" ? " USAJobs" : ""}...
              </div>
            </div>
          )}

          {/* ── Floating job info card on map ── */}
          {selectedJob && (
            <div className="absolute top-3 left-3 z-[1000] w-[400px] max-h-[calc(100%-24px)] flex flex-col rounded-xl border bg-background/95 backdrop-blur-sm shadow-xl">

              {/* ═══ STICKY HEADER ═══ */}
              <div className="shrink-0 bg-background/95 rounded-t-xl overflow-hidden border-b">
                {/* Street View Banner */}
                {GOOGLE_MAPS_KEY && effectiveJobCoords && streetViewVisible && (
                  <div
                    className="relative"
                    onPointerEnter={() => setStreetViewExpanded(true)}
                    onPointerLeave={() => setStreetViewExpanded(false)}
                    onFocusCapture={() => setStreetViewExpanded(true)}
                    onBlurCapture={() => setStreetViewExpanded(false)}
                  >
                    <iframe
                      src={`https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${effectiveJobCoords[0]},${effectiveJobCoords[1]}&heading=210&pitch=10&fov=90`}
                      className={`w-full border-0 transition-[height] duration-200 ease-out ${streetViewExpanded ? "h-[240px]" : "h-[108px]"}`}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Office street view"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-1.5 right-1.5">
                      {selectedJobUtilityControls}
                    </div>
                  </div>
                )}

                <div className="p-3 pb-0">
                  {/* Title + Company + Close (only when no banner) */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base leading-snug line-clamp-2 pr-1">{selectedJob.title}</h3>
                      <button
                        type="button"
                        className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline transition-colors text-left mt-1"
                        onClick={() => setDeepDiveCompany(selectedJob.company)}
                      >
                        {selectedJob.company}
                      </button>
                    </div>
                    {(!GOOGLE_MAPS_KEY || !effectiveJobCoords || !streetViewVisible) && selectedJobUtilityControls}
                  </div>

                  {/* Office Snapshot */}
                  {(addressLoading || resolvedAddress) && (
                    <div className="mt-2 space-y-1.5 rounded-lg border bg-muted/15 px-2.5 py-2">
                      {addressLoading && !resolvedAddress && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Resolving address…
                        </div>
                      )}
                      {resolvedAddress && (
                        <div className="flex items-start gap-1.5 text-[11px]">
                          <MapPinned className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1">
                              <span className="truncate text-muted-foreground">{resolvedAddress.address}</span>
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-[9px] px-1 py-0 h-3.5 ${
                                  resolvedAddress.confidence === "high" ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                                  : resolvedAddress.confidence === "medium" ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400"
                                  : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                                }`}
                              >
                                {resolvedAddress.confidence === "high" ? "Exact" : resolvedAddress.confidence === "medium" ? "Likely" : "Multiple"}
                              </Badge>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${jobPanelSections.has("location-edit") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            onClick={() => toggleJobSection("location-edit")}
                            title={jobPanelSections.has("location-edit") ? "Hide edit tools" : "Edit / Verify location"}
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      )}
                      {resolvedAddress && (resolvedAddress.rating != null || resolvedAddress.openNow !== undefined || resolvedAddress.website || resolvedAddress.phone || (resolvedAddress.hours && resolvedAddress.hours.length > 0)) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-[10px] text-muted-foreground">
                          {resolvedAddress.rating != null && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span className="font-medium text-foreground/80">{resolvedAddress.rating}</span>
                              {resolvedAddress.ratingCount != null && <span className="text-muted-foreground/70">({resolvedAddress.ratingCount.toLocaleString()})</span>}
                            </span>
                          )}
                          {resolvedAddress.openNow !== undefined && (
                            <span className={`font-medium ${resolvedAddress.openNow ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                              {resolvedAddress.openNow ? "Open" : "Closed"}
                            </span>
                          )}
                          {resolvedAddress.website && (
                            <a href={resolvedAddress.website} target="_blank" rel="noopener noreferrer" className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted hover:text-foreground" title={new URL(resolvedAddress.website).hostname.replace("www.", "")}>
                              <Globe className="h-3 w-3" />
                            </a>
                          )}
                          {resolvedAddress.phone && (
                            <a href={`tel:${resolvedAddress.phone}`} className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted hover:text-foreground" title={resolvedAddress.phone}>
                              <Phone className="h-3 w-3" />
                            </a>
                          )}
                          {resolvedAddress.hours && resolvedAddress.hours.length > 0 && (
                            <details className="relative group">
                              <summary className="inline-flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full hover:bg-muted hover:text-foreground" title="Hours">
                                <Clock className="h-3 w-3" />
                              </summary>
                              <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg px-2.5 py-2 min-w-[180px] space-y-0.5">
                                {resolvedAddress.hours.map((h, i) => (
                                  <div key={i} className="text-[10px] text-muted-foreground whitespace-nowrap">{h}</div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}

                      {/* Recruiter flags */}
                      {resolvedAddress && (() => {
                        const norm = selectedJob.company.toLowerCase().trim();
                        const dbInfo = recruiterFlagDb[norm];
                        const isRecruiter = isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || dbInfo?.confirmed;
                        const dupInfo = getDuplicateInfo(selectedJob.id);
                        if (!isRecruiter && !dupInfo) return null;
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap pl-5">
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
                                <Repeat2 className="h-2.5 w-2.5" /> Seen {dupInfo.duplicates.length + 1}x
                              </Badge>
                            )}
                          </div>
                        );
                      })()}

                      {/* Edit / Verify drawer */}
                      {resolvedAddress && jobPanelSections.has("location-edit") && (
                        <div className="space-y-2 pt-1 pl-4 border-t border-dashed">
                          {/* Landmark mismatch alert */}
                          {hasLandmarkMismatch(selectedJob.company, resolvedAddress.name) && (
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

                          {/* Address override */}
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

                          {/* Recruiter office override */}
                          {(isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || recruiterFlagDb[selectedJob.company.toLowerCase().trim()]?.confirmed) && (
                            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-2.5 py-1.5 space-y-1.5">
                              <p className="text-[10px] text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" /> Know the actual office?
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
                              {nlpLocations.length > 0 && (
                                <div className="space-y-0.5">
                                  <p className="text-[9px] text-muted-foreground">Detected in description:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {nlpLocations.map((loc, i) => (
                                      <Button key={i} size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/30" onClick={() => applyNlpLocation(loc)}>
                                        <MapPin className="h-2.5 w-2.5 mr-0.5" /> {loc}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Flag as recruiter */}
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

                          {/* Company Locations Discovery */}
                          <div className="space-y-1.5 pt-1 border-t">
                            {!companyLocsSearched ? (
                              <div className="space-y-1">
                                <Button size="sm" variant="outline" className="w-full h-7 text-[10px]" disabled={companyLocsLoading} onClick={searchCompanyLocations}>
                                  {companyLocsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Building2 className="h-3 w-3 mr-1" />}
                                  See All {selectedJob.company} Locations
                                </Button>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-muted-foreground">Radius:</span>
                                  <Select value={String(companyLocsRadius)} onValueChange={(v) => setCompanyLocsRadius(parseInt(v ?? "25000", 10))}>
                                    <SelectTrigger className="h-5 text-[9px] w-[90px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="5000" className="text-xs">5 km</SelectItem>
                                      <SelectItem value="10000" className="text-xs">10 km</SelectItem>
                                      <SelectItem value="25000" className="text-xs">25 km</SelectItem>
                                      <SelectItem value="50000" className="text-xs">50 km</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : companyLocsLoading ? (
                              <div className="flex items-center justify-center py-3">
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground ml-1">Searching locations…</span>
                              </div>
                            ) : companyLocs.length > 0 ? (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="p-1.5 bg-muted/30 flex items-center justify-between">
                                  <span className="text-[10px] font-medium flex items-center gap-1">
                                    <Building2 className="h-3 w-3 text-blue-500" /> {selectedJob.company} Locations ({companyLocs.length})
                                    {companyLocs.length >= 15 && (
                                      <span className="text-[8px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1 rounded">chain?</span>
                                    )}
                                  </span>
                                  <button type="button" className="text-[8px] text-muted-foreground hover:text-foreground" onClick={() => { setCompanyLocsSearched(false); setCompanyLocs([]); }}>
                                    <RefreshCw className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                                <div className="max-h-[180px] overflow-y-auto divide-y">
                                  {companyLocs.map((loc) => (
                                    <button
                                      key={loc.placeId}
                                      type="button"
                                      className="w-full flex items-start gap-1.5 p-1.5 hover:bg-muted/30 transition-colors text-left"
                                      onClick={() => {
                                        setZoomTarget({ lat: loc.lat, lng: loc.lng, zoom: 17 });
                                      }}
                                    >
                                      <MapPin className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-medium truncate">{loc.name}</p>
                                        <p className="text-[8px] text-muted-foreground truncate">{loc.address}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="p-2 rounded-lg border bg-muted/20 text-center">
                                <p className="text-[10px] text-muted-foreground">No other {selectedJob.company} locations found</p>
                                <button type="button" className="text-[9px] text-blue-500 hover:underline mt-0.5" onClick={() => { setCompanyLocsSearched(false); setCompanyLocs([]); }}>Try different radius</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Commute inline drawer */}
                  {searchCenter && jobPanelSections.has("commute") && (
                    <div className="mt-2 rounded-lg border border-sky-200 dark:border-sky-800/50 bg-sky-50/50 dark:bg-sky-950/20 p-2.5 space-y-2">
                      {/* Mode selector */}
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
                            <div className="text-xs font-semibold">Commute Settings</div>
                            <div className="rounded-md border p-2 bg-muted/30 space-y-0.5">
                              {commuteProfile.vehicleYear && commuteProfile.vehicleMake && commuteProfile.vehicleModel ? (
                                <p className="text-[11px] font-medium">{commuteProfile.vehicleYear} {commuteProfile.vehicleMake} {commuteProfile.vehicleModel}</p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground italic">No vehicle set</p>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                {commuteProfile.vehicleMpg} MPG · ${commuteProfile.gasPricePerGallon.toFixed(2)}/gal · {commuteProfile.daysInOffice}d/wk
                              </p>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-[10px]"
                                onClick={() => { setShowQuickCommuteEdit(true); setShowCommuteSettings(false); }}
                              >
                                Edit vehicle &amp; commute →
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px]">Morning commute</Label>
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
                                <Label className="text-[11px]">Evening commute</Label>
                                <Select
                                  value={String(commuteProfile.returnDepartureHour ?? 17)}
                                  onValueChange={(v) => {
                                    const p = { ...commuteProfile, returnDepartureHour: parseInt(v ?? "17") };
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
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-[11px]">Parking / mo</Label>
                                <Input
                                  inputMode="numeric"
                                  value={String(commuteProfile.parkingMonthly ?? 0)}
                                  onChange={(event) => {
                                    const p = { ...commuteProfile, parkingMonthly: Number(event.target.value.replace(/\D/g, "")) || 0 };
                                    setCommuteProfile(p); saveCommuteProfile(p);
                                  }}
                                  className="h-7 w-20 text-xs"
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px]">Bad day commute</Label>
                                <Select
                                  value={String(commuteProfile.badDayMultiplier ?? 1.5)}
                                  onValueChange={(v) => {
                                    const p = { ...commuteProfile, badDayMultiplier: Number(v ?? "1.5") };
                                    setCommuteProfile(p); saveCommuteProfile(p);
                                  }}
                                >
                                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1.25">1.25x</SelectItem>
                                    <SelectItem value="1.5">1.5x</SelectItem>
                                    <SelectItem value="1.75">1.75x</SelectItem>
                                    <SelectItem value="2">2x</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px]">Transit reliability</Label>
                                <Select
                                  value={commuteProfile.transitReliability ?? "medium"}
                                  onValueChange={(v) => {
                                    const p = { ...commuteProfile, transitReliability: (v ?? "medium") as CommuteProfile["transitReliability"] };
                                    setCommuteProfile(p); saveCommuteProfile(p);
                                  }}
                                >
                                  <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
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
                              Cost: ${(commuteProfile.gasPricePerGallon / commuteProfile.vehicleMpg).toFixed(2)}/mi · {commuteProfile.daysInOffice}d/wk · ${(commuteProfile.parkingMonthly ?? 0).toLocaleString()}/mo parking
                            </p>
                          </PopoverContent>
                        </Popover>
                      </div>
                      {/* Commute details */}
                      {commuteInfo ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1 text-xs font-medium">
                            {(() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-3.5 w-3.5 text-sky-500" />; })()}
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
                          <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                            <div className="rounded-md border bg-background/40 px-1.5 py-1">
                              Evening: {(() => {
                                const hour = commuteProfile.returnDepartureHour ?? 17;
                                return hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
                              })()}
                            </div>
                            <div className="rounded-md border bg-background/40 px-1.5 py-1">
                              Bad day: ~{Math.round((commuteInfo.durationInTrafficMin ?? commuteInfo.durationMin) * (commuteProfile.badDayMultiplier ?? 1.5))} min
                            </div>
                          </div>
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
                          {commuteInfo.transitSteps && commuteInfo.transitSteps.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-dashed">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <TrainFront className="h-3 w-3 text-sky-500" /> Transit Itinerary
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
                                        style={{ backgroundColor: step.lineColor || "#6366f1", color: step.lineTextColor || "#fff" }}
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
                    </div>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mt-1.5 pb-2.5">
                    {!resolvedAddress && (
                      <Badge variant="outline" className="gap-0.5 text-[10px] h-[18px] px-1.5">
                        <MapPin className="h-2.5 w-2.5" /> {selectedJob.location}
                      </Badge>
                    )}
                    {selectedJob.dutyStations && selectedJob.dutyStations.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                        +{selectedJob.dutyStations.length} loc
                      </Badge>
                    )}
                    {(walkScoreData?.walkScore != null || walkScoreData?.transitScore != null || walkScoreData?.bikeScore != null) && (
                      <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 gap-1 border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-400">
                        {walkScoreData?.walkScore != null && <span>🚶{walkScoreData.walkScore}</span>}
                        {walkScoreData?.transitScore != null && <span>🚌{walkScoreData.transitScore}</span>}
                        {walkScoreData?.bikeScore != null && <span>🚴{walkScoreData.bikeScore}</span>}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* ═══ SCROLLABLE MIDDLE ═══ */}
              <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 divide-y">

                {/* Estimated True Cost */}
                {(() => {
                  const metrics = getJobDecisionMetrics(selectedJob);
                  const delta = metrics.estimatedTrueCost != null && averageEstimatedTrueCost != null
                    ? metrics.estimatedTrueCost - averageEstimatedTrueCost
                    : null;
                  const missingItems = [
                    !metrics.midSalary ? "salary" : null,
                    metrics.commuteMinutes == null && searchCenter ? "commute" : null,
                    !resolvedAddress && !addressLoading ? "exact address" : null,
                  ].filter(Boolean);
                  return (
                    <div className="px-3 py-2.5 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            <BarChart3 className="h-3 w-3" /> Estimated True Cost
                          </div>
                          <div className="mt-0.5 text-xl font-bold text-emerald-700 dark:text-emerald-300">
                            {metrics.estimatedTrueCost != null ? `${formatSalaryCompact(metrics.estimatedTrueCost)}/yr` : "Needs salary"}
                          </div>
                        </div>
                        {delta != null && (
                          <Badge variant="outline" className={`shrink-0 text-[10px] h-5 ${delta >= 0 ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400" : "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400"}`}>
                            {delta >= 0 ? "+" : ""}{formatSalaryCompact(delta)} vs avg
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-md border bg-background/60 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Take-home</div>
                          <div className="truncate text-[11px] font-semibold">{metrics.takeHomePay != null ? `${formatSalaryCompact(metrics.takeHomePay)}/yr` : "n/a"}</div>
                        </div>
                        <div className="rounded-md border bg-background/60 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Commute cost</div>
                          <div className="truncate text-[11px] font-semibold text-orange-600 dark:text-orange-400">{metrics.commuteCost != null ? `-${formatCost(metrics.commuteCost)}/yr` : "n/a"}</div>
                        </div>
                        <div className="rounded-md border bg-background/60 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Posting</div>
                          <div className="truncate text-[11px] font-semibold">{metrics.daysOld == null ? "unknown" : metrics.daysOld <= 0 ? "today" : `${metrics.daysOld}d old`}</div>
                        </div>
                      </div>
                      {missingItems.length > 0 && (
                        <div className="flex items-center gap-1 rounded-md border border-dashed bg-background/50 px-2 py-1 text-[10px] text-muted-foreground">
                          <Wrench className="h-3 w-3 shrink-0" />
                          <span>Improve this estimate: add {missingItems.join(", ")}.</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Fast Scan */}
                {(() => {
                  const midSalary = selectedJob.salaryMin && selectedJob.salaryMax
                    ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2
                    : (selectedJob.salaryMin ?? selectedJob.salaryMax ?? null);
                  const tx = midSalary ? estimateTaxes(midSalary, selectedJob.location) : null;
                  const lifeScore = lifeScoreCache[selectedJob.id];
                  const commuteCost = commuteInfo ? yearlyCommuteCost(commuteInfo.distanceMi, commuteProfile) : null;
                  const missingItems = [
                    !midSalary ? "pay" : null,
                    !resolvedAddress && !addressLoading ? "exact address" : null,
                    searchCenter && !commuteInfo && !commuteLoading ? "commute" : null,
                  ].filter(Boolean);
                  const daysOld = selectedJob.created
                    ? Math.floor((Date.now() - new Date(selectedJob.created).getTime()) / 86_400_000)
                    : null;
                  return (
                    <div className="px-3 py-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <Zap className="h-3 w-3 text-amber-500" /> Fast Scan
                        <span className="ml-auto text-[10px] normal-case tracking-normal font-medium text-muted-foreground">
                          {daysOld == null ? "freshness unknown" : daysOld <= 0 ? "posted today" : `${daysOld}d old`}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-md border bg-muted/20 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Pay</div>
                          <div className="truncate text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {tx ? `${formatSalaryCompact(tx.takeHomePay)}/yr` : midSalary ? formatSalaryCompact(midSalary) : "n/a"}
                          </div>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Fit</div>
                          <div className={`truncate text-[11px] font-semibold ${lifeScore == null ? "text-muted-foreground" : lifeScore >= 70 ? "text-emerald-600 dark:text-emerald-400" : lifeScore >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500 dark:text-red-400"}`}>
                            {lifeScore != null ? `${lifeScore}/100` : "pending"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`rounded-md border bg-muted/20 px-2 py-1 text-left transition-colors ${searchCenter ? "hover:bg-muted/40" : "cursor-default"} ${jobPanelSections.has("commute") ? "border-sky-300 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-950/30" : ""}`}
                          onClick={() => { if (searchCenter) toggleJobSection("commute"); }}
                          title={searchCenter ? "Toggle commute details" : undefined}
                        >
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Commute</div>
                          <div className="flex items-center gap-1 truncate text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                            {commuteLoading
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : (() => { const ModeIcon = COMMUTE_MODES.find((m) => m.value === (commuteInfo?.mode ?? "driving"))?.icon ?? Car; return <ModeIcon className="h-3 w-3 shrink-0" />; })()
                            }
                            <span className="truncate">{commuteInfo ? `~${commuteInfo.durationMin}m` : commuteLoading ? "checking" : "n/a"}</span>
                          </div>
                        </button>
                      </div>
                      {commuteCost != null && (
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{commuteProfile.daysInOffice}d/wk commute estimate</span>
                          <span className="font-medium text-orange-600 dark:text-orange-400">{formatCost(commuteCost)}/yr</span>
                        </div>
                      )}
                      {missingItems.length > 0 && (
                        <div className="flex items-center gap-1 rounded-md border border-dashed bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                          <Info className="h-3 w-3 shrink-0" />
                          <span>Needs {missingItems.join(", ")} for a stronger read.</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* True Cost calculator */}
                {(() => {
                  const metrics = getJobDecisionMetrics(selectedJob);
                  const midSalary = selectedJob.salaryMin && selectedJob.salaryMax
                    ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2
                    : (selectedJob.salaryMin ?? selectedJob.salaryMax ?? null);
                  const tx = midSalary ? estimateTaxes(midSalary, selectedJob.location) : null;
                  const totalAnchorCost = lifeAnchors.reduce((sum, anchor) => {
                    if (!enabledAnchors.has(anchor.id)) return sum;
                    const anchorCommute = anchorCommutes[anchor.id];
                    return sum + (anchorCommute ? yearlyCommuteCost(anchorCommute.distanceMi, commuteProfile) : 0);
                  }, 0);
                  const lifeScore = lifeScoreCache[selectedJob.id];
                  const missingItems = [
                    !midSalary ? "pay range" : null,
                    !resolvedAddress && !addressLoading ? "exact address" : null,
                    metrics.commuteMinutes == null && searchCenter ? "commute" : null,
                  ].filter(Boolean);
                  const taxRows: { label: string; amount: number }[] = tx ? [
                    { label: "Federal", amount: tx.federalIncomeTax },
                    { label: tx.stateName ? `State (${tx.stateName})` : "State", amount: tx.stateIncomeTax },
                    { label: "Social Security", amount: tx.socialSecurity },
                    { label: "Medicare", amount: tx.medicare },
                    ...tx.localTaxes.map((localTax) => ({ label: localTax.name, amount: localTax.amount })),
                  ] : [];
                  const open = jobPanelSections.has("true-cost");
                  return (
                    <div className="px-3 py-2 space-y-2">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        onClick={() => toggleJobSection("true-cost")}
                      >
                        <BarChart3 className="h-3 w-3 text-emerald-500" />
                        Estimated True Cost
                        {lifeScore != null && (
                          <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal ${lifeScore >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : lifeScore >= 40 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400" : "bg-red-100 text-red-700 dark:bg-red-950/50 text-red-400"}`}>
                            {lifeScore}/100 fit
                          </span>
                        )}
                        {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                      </button>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-md border bg-muted/20 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Gross</div>
                          <div className="truncate text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {selectedJob.salaryMin && formatSalary(selectedJob.salaryMin)}
                            {selectedJob.salaryMin && selectedJob.salaryMax && " - "}
                            {selectedJob.salaryMax && formatSalary(selectedJob.salaryMax)}
                            {!selectedJob.salaryMin && !selectedJob.salaryMax && "n/a"}
                          </div>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Take-home</div>
                          <div className="truncate text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {tx ? `${formatSalaryCompact(tx.takeHomePay)}/yr` : "n/a"}
                          </div>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">True cost</div>
                          <div className="truncate text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {metrics.estimatedTrueCost != null ? `${formatSalaryCompact(metrics.estimatedTrueCost)}/yr` : "n/a"}
                          </div>
                        </div>
                      </div>
                      {missingItems.length > 0 && (
                        <div className="flex items-center gap-1 rounded-md border border-dashed bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                          <Info className="h-3 w-3 shrink-0" />
                          <span>Add {missingItems.join(", ")} to complete this calculation.</span>
                        </div>
                      )}
                      {open && (
                        <div className="space-y-2">
                          {tx && (
                            <div className="rounded-md border bg-muted/15 px-2.5 py-2 space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span>Tax estimate</span>
                                <span className="text-muted-foreground">Effective {(tx.effectiveRate * 100).toFixed(1)}%</span>
                              </div>
                              {taxRows.map((row) => (
                                <div key={row.label} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{row.label}</span>
                                  <span className="font-mono text-red-500 dark:text-red-400">-{formatSalaryCompact(row.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {lifeAnchors.length > 0 && Object.keys(anchorCommutes).length > 0 && (
                            <div className="rounded-md border bg-muted/15 px-2.5 py-2 space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span className="flex items-center gap-1"><Anchor className="h-3 w-3 text-indigo-500" /> Life anchors</span>
                                {totalAnchorCost > 0 && <span className="text-orange-600 dark:text-orange-400">-{formatCost(totalAnchorCost)}/yr</span>}
                              </div>
                              {lifeAnchors.map((anchor) => {
                                const anchorCommute = anchorCommutes[anchor.id];
                                const enabled = enabledAnchors.has(anchor.id);
                                return (
                                  <div key={anchor.id} className={`flex items-center justify-between text-xs ${!enabled ? "opacity-40" : ""}`}>
                                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                      <button
                                        type="button"
                                        className="p-0.5 rounded hover:bg-muted transition-colors"
                                        onClick={() => setEnabledAnchors((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(anchor.id)) next.delete(anchor.id);
                                          else next.add(anchor.id);
                                          return next;
                                        })}
                                        title={enabled ? `Hide ${anchor.label} route` : `Show ${anchor.label} route`}
                                      >
                                        {enabled
                                          ? <Eye className="h-3 w-3 text-indigo-500" />
                                          : <EyeOff className="h-3 w-3 text-muted-foreground" />
                                        }
                                      </button>
                                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: enabled ? ANCHOR_COLORS[lifeAnchors.indexOf(anchor) % ANCHOR_COLORS.length] : "transparent" }} />
                                      <span className="truncate">{anchor.label}</span>
                                    </span>
                                    {anchorCommute ? (
                                      <span className="shrink-0 font-medium ml-2">~{anchorCommute.durationMin}m · {formatCost(yearlyCommuteCost(anchorCommute.distanceMi, commuteProfile))}/yr</span>
                                    ) : (
                                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Missing Data Fixer */}
                {(() => {
                  const norm = selectedJob.company.toLowerCase().trim();
                  const recruiterInfo = recruiterFlagDb[norm];
                  const isRecruiter = isLikelyRecruiter(selectedJob.company) || isUserFlaggedRecruiter(selectedJob.company) || recruiterInfo?.confirmed;
                  const dupInfo = getDuplicateInfo(selectedJob.id);
                  const preferredApplyLink = getPreferredApplyLink(selectedJob);
                  const text = `${selectedJob.title} ${selectedJob.location} ${selectedJob.description} ${selectedJob.scheduleType ?? ""}`.toLowerCase();
                  const hasRemoteSignal = text.includes("remote") || text.includes("hybrid") || text.includes("on-site") || text.includes("onsite");
                  const fixes = [
                    !resolvedAddress && !addressLoading ? "exact address" : null,
                    !selectedJob.salaryMin && !selectedJob.salaryMax ? "salary" : null,
                    !hasRemoteSignal ? "remote/hybrid status" : null,
                    !preferredApplyLink ? "apply link" : null,
                    (isRecruiter || hasLandmarkMismatch(selectedJob.company, resolvedAddress?.name)) ? "company identity" : null,
                  ].filter(Boolean);
                  if (fixes.length === 0 && !dupInfo) return null;
                  return (
                    <div className="px-3 py-2 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Wrench className="h-3 w-3 text-blue-500" /> Improve Posting
                        {dupInfo && (
                          <Badge variant="outline" className="ml-auto h-5 text-[10px] border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400">
                            Seen {dupInfo.duplicates.length + 1}x
                          </Badge>
                        )}
                      </div>
                      {fixes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {fixes.map((fix) => (
                            <Badge key={fix} variant="outline" className="text-[10px] h-5 border-dashed text-muted-foreground">
                              Missing {fix}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        {(!resolvedAddress || isRecruiter || hasLandmarkMismatch(selectedJob.company, resolvedAddress?.name)) && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => toggleJobSection("location-edit")}>
                            <MapPinned className="h-3 w-3" /> Verify office
                          </Button>
                        )}
                        {(!selectedJob.salaryMin && !selectedJob.salaryMax) && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => setDeepDiveCompany(selectedJob.company)}>
                            <DollarSign className="h-3 w-3" /> Research pay
                          </Button>
                        )}
                        {!hasRemoteSignal && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => setShowDetails(true)}>
                            <Wifi className="h-3 w-3" /> Check remote
                          </Button>
                        )}
                        {preferredApplyLink && selectedJob.applyLinks && selectedJob.applyLinks.length > 1 && (
                          <a href={preferredApplyLink} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-7 w-full text-[10px] gap-1">
                              <ExternalLink className="h-3 w-3" /> Direct apply
                            </Button>
                          </a>
                        )}
                        {dupInfo && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => setDeepDiveCompany(selectedJob.company)}>
                            <Repeat2 className="h-3 w-3" /> Review matches
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Commute details stay in the header inline drawer. */}

              </div>

              {/* ═══ STICKY FOOTER ═══ */}
              <div className="shrink-0 p-2.5 pt-2 border-t bg-background/95 rounded-b-xl">
                <div className="mb-1.5 flex gap-1.5">
                  <Select value={jobIntentById[selectedJob.id] ?? "none"} onValueChange={(value) => setJobIntent(selectedJob.id, (value ?? "none") as JobIntent | "none")}>
                    <SelectTrigger className="h-7 flex-1 text-xs">
                      <SelectValue placeholder="Intent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No status</SelectItem>
                      {JOB_INTENT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={compareShortlistIds.includes(selectedJob.id) ? "secondary" : "outline"}
                    className="h-7 gap-1 px-2 text-xs"
                    title={compareShortlistIds.includes(selectedJob.id) ? "Remove from compare shortlist" : "Add to compare shortlist"}
                    onClick={() => toggleCompareShortlist(selectedJob)}
                  >
                    <Bookmark className="h-3 w-3" />
                    {compareShortlistIds.includes(selectedJob.id) ? "Pinned" : "Compare"}
                  </Button>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1 h-7 text-xs"
                    title="Research this company"
                    onClick={() => setDeepDiveCompany(selectedJob.company)}
                  >
                    <Search className="h-3 w-3" /> Deep Dive
                  </Button>
                  <Button
                    size="sm"
                    variant={trackedIds.has(selectedJob.id) ? "secondary" : "outline"}
                    disabled={trackedIds.has(selectedJob.id)}
                    className="flex-1 gap-1 h-7 text-xs"
                    title={trackedIds.has(selectedJob.id) ? "Already tracked" : "Track this job"}
                    onClick={() => trackMutation.mutate(selectedJob)}
                  >
                    {trackedIds.has(selectedJob.id) ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {trackedIds.has(selectedJob.id) ? "Tracked" : "Track"}
                  </Button>
                </div>
              </div>

            </div>
          )}

          {compareShortlistJobs.length > 0 && (
            <div className="absolute bottom-3 left-1/2 z-[1050] w-[min(760px,calc(100%-32px))] -translate-x-1/2 rounded-xl border bg-background/95 p-2 shadow-xl backdrop-blur-sm pointer-events-auto">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Bookmark className="h-3 w-3 text-blue-500" /> Compare Shortlist
                  <span className="text-[10px] font-medium normal-case tracking-normal">{compareShortlistJobs.length}/4 pinned</span>
                </div>
                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setCompareShortlistIds([])}>
                  Clear
                </button>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(compareShortlistJobs.length, 4)}, minmax(0, 1fr))` }}>
                {compareShortlistJobs.map((job) => {
                  const metrics = getJobDecisionMetrics(job);
                  const intent = jobIntentById[job.id];
                  const intentOption = intent ? JOB_INTENT_OPTIONS.find((option) => option.value === intent) : null;
                  return (
                    <div key={job.id} className={`rounded-lg border bg-muted/15 p-2 text-xs ${selectedJob?.id === job.id ? "ring-1 ring-primary" : ""}`}>
                      <div className="flex items-start gap-1.5">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedJob(job); setShowDetails(false); }}>
                          <div className="truncate font-semibold leading-tight">{job.title}</div>
                          <div className="truncate text-[10px] text-muted-foreground">{job.company}</div>
                        </button>
                        <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" title="Remove from compare" onClick={() => toggleCompareShortlist(job)}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                        <span className="text-muted-foreground">True cost</span>
                        <span className="truncate text-right font-semibold text-emerald-600 dark:text-emerald-400">{metrics.estimatedTrueCost != null ? `${formatSalaryCompact(metrics.estimatedTrueCost)}/yr` : "n/a"}</span>
                        <span className="text-muted-foreground">Commute</span>
                        <span className="truncate text-right font-medium">{metrics.commuteMinutes != null ? `${metrics.commuteMinutes}m` : "n/a"}</span>
                        <span className="text-muted-foreground">Distance</span>
                        <span className="truncate text-right font-medium">{metrics.commuteDistance != null ? `${metrics.commuteDistance} mi` : "n/a"}</span>
                        <span className="text-muted-foreground">Age</span>
                        <span className="truncate text-right font-medium">{metrics.daysOld == null ? "unknown" : metrics.daysOld <= 0 ? "today" : `${metrics.daysOld}d`}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge variant="secondary" className={`h-4 px-1 text-[9px] ${sourceBadge(job.source).className}`}>{sourceBadge(job.source).label}</Badge>
                        {lifeScoreCache[job.id] != null && <Badge variant="outline" className="h-4 px-1 text-[9px]">Fit {lifeScoreCache[job.id]}</Badge>}
                        <Badge variant="outline" className={`h-4 px-1 text-[9px] ${intentOption?.className ?? "text-muted-foreground"}`}>{intentOption?.label ?? (trackedIds.has(job.id) ? "Tracked" : "New")}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — sort/filter + job list / detail (hidden in full-screen work-mapping mode) */}
        {!showWorkHistory && (
        <div className="w-[380px] shrink-0 flex flex-col">
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


            </div>
          )}

          {selectedJob ? (() => {
            const formatted = selectedJob.description ? formatJobDescription(selectedJob.description) : null;
            const midSalary = selectedJob.salaryMin && selectedJob.salaryMax
              ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2
              : (selectedJob.salaryMin ?? selectedJob.salaryMax ?? null);
            const tx = midSalary ? estimateTaxes(midSalary, selectedJob.location) : null;
            const drivingCommute = commuteCache[`${selectedJob.id}:driving`];
            const daysOld = selectedJob.created
              ? Math.floor((Date.now() - new Date(selectedJob.created).getTime()) / 86_400_000)
              : null;
            const selectedJobIndex = sortedJobs.findIndex((job) => job.id === selectedJob.id);
            const hasReaderPosition = selectedJobIndex >= 0;
            const readerPrevJob = hasReaderPosition ? sortedJobs[selectedJobIndex - 1] : null;
            const readerNextJob = hasReaderPosition ? sortedJobs[selectedJobIndex + 1] : null;
            const preferredApplyLink = getPreferredApplyLink(selectedJob);
            const openReaderJob = (job: MapJob | null | undefined) => {
              if (!job) return;
              setSelectedJob(job);
              setShowDetails(false);
            };
            return (
              <div className="flex-1 overflow-hidden rounded-lg border bg-background shadow-sm flex flex-col">
                <div className="sticky top-0 z-10 border-b bg-background/95 p-2.5 backdrop-blur-sm">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold leading-snug line-clamp-2">{selectedJob.title}</h3>
                      <button
                        type="button"
                        className="mt-0.5 text-xs font-medium text-muted-foreground hover:text-primary hover:underline"
                        onClick={() => setDeepDiveCompany(selectedJob.company)}
                      >
                        {selectedJob.company}
                      </button>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      title="Back to results"
                      onClick={() => { setSelectedJob(null); setShowDetails(false); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge variant="secondary" className={`text-[9px] h-4 px-1.5 ${sourceBadge(selectedJob.source).className}`}>
                      {sourceBadge(selectedJob.source).labelLong}
                    </Badge>
                    {selectedJob.scheduleType && <Badge variant="outline" className="text-[9px] h-4 px-1.5">{selectedJob.scheduleType}</Badge>}
                    {selectedJob.contractTime && <Badge variant="outline" className="text-[9px] h-4 px-1.5 capitalize">{selectedJob.contractTime.replace("_", " ")}</Badge>}
                    {selectedJob.contractType && <Badge variant="outline" className="text-[9px] h-4 px-1.5 capitalize">{selectedJob.contractType.replace("_", " ")}</Badge>}
                    {daysOld != null && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                        {daysOld <= 0 ? "Posted today" : `${daysOld}d old`}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Pay</div>
                      <div className="truncate text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {selectedJob.salaryMin && formatSalary(selectedJob.salaryMin)}
                        {selectedJob.salaryMin && selectedJob.salaryMax && " - "}
                        {selectedJob.salaryMax && formatSalary(selectedJob.salaryMax)}
                        {!selectedJob.salaryMin && !selectedJob.salaryMax && "n/a"}
                      </div>
                      {tx && <div className="truncate text-[9px] text-muted-foreground">~{formatSalaryCompact(tx.takeHomePay)}/yr net</div>}
                    </div>
                    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Commute</div>
                      <div className="truncate text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                        {drivingCommute ? `~${drivingCommute.durationMin}m` : commuteInfo ? `~${commuteInfo.durationMin}m` : "n/a"}
                      </div>
                      {(drivingCommute || commuteInfo) && (
                        <div className="truncate text-[9px] text-muted-foreground">{(drivingCommute ?? commuteInfo)?.distanceMi} mi</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border bg-muted/10 px-1.5 py-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      disabled={!readerPrevJob}
                      title="Previous posting"
                      onClick={() => openReaderJob(readerPrevJob)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => { setSelectedJob(null); setShowDetails(false); }}
                      title="Back to results"
                    >
                      Results {hasReaderPosition ? `${selectedJobIndex + 1} / ${sortedJobs.length}` : `(${sortedJobs.length})`}
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      disabled={!readerNextJob}
                      title="Next posting"
                      onClick={() => openReaderJob(readerNextJob)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 p-3">
                  {selectedJob.applyLinks && selectedJob.applyLinks.length > 0 && (
                    <div className="rounded-md border bg-muted/20 p-2.5 space-y-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Apply Links</div>
                      {selectedJob.applyLinks.map((link, i) => (
                        <a key={i} href={link.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          <ExternalLink className="h-3 w-3 shrink-0" /> {link.title}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 border-t pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Full Job Description
                    </div>
                    {formatted ? (
                      <div className="space-y-3 text-sm leading-6 text-foreground/85">
                        {formatted.sections.map((section, index) => section.type === "bullets" ? (
                          <ul key={index} className="space-y-1.5 pl-4 list-disc marker:text-muted-foreground/70">
                            {section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                          </ul>
                        ) : (
                          <p key={index}>{section.items[0]}</p>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                        No description was included with this posting.
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 border-t bg-background/95 p-2.5 backdrop-blur-sm">
                  {preferredApplyLink ? (
                    <a href={preferredApplyLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="w-full gap-1 h-8 text-xs">
                        <ExternalLink className="h-3.5 w-3.5" /> Apply to this posting
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" disabled className="w-full h-8 text-xs">
                      No apply link available
                    </Button>
                  )}
                </div>
              </div>
            );
          })() : (
            <>
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
                        className="cursor-pointer hover:shadow-md transition-shadow"
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
                          {nearbyWorkHistoryMap[job.id] && (
                            <div className="flex items-center gap-0.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <Briefcase className="h-2.5 w-2.5" />
                              Near your old role at {nearbyWorkHistoryMap[job.id].company}
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
            </>
          )}
        </div>
        )}
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
                  {walkScoreData?.walkScore != null && (
                    <Badge variant="outline" className="text-xs gap-0.5 border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-400">
                      🚶 Walk {walkScoreData.walkScore}
                    </Badge>
                  )}
                  {walkScoreData?.transitScore != null && (
                    <Badge variant="outline" className="text-xs gap-0.5 border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-400">
                      🚌 Transit {walkScoreData.transitScore}
                    </Badge>
                  )}
                  {walkScoreData?.bikeScore != null && (
                    <Badge variant="outline" className="text-xs gap-0.5 border-lime-300 text-lime-700 dark:border-lime-700 dark:text-lime-400">
                      🚴 Bike {walkScoreData.bikeScore}
                    </Badge>
                  )}
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

                {/* Tax Breakdown */}
                {(selectedJob.salaryMin || selectedJob.salaryMax) && (() => {
                  const mid = selectedJob.salaryMin && selectedJob.salaryMax
                    ? (selectedJob.salaryMin + selectedJob.salaryMax) / 2
                    : (selectedJob.salaryMin ?? selectedJob.salaryMax)!;
                  const tx = estimateTaxes(mid, selectedJob.location);
                  const rows: { label: string; amount: number; color?: string }[] = [
                    { label: "Federal Income Tax", amount: tx.federalIncomeTax },
                    { label: `State Tax${tx.stateName ? ` (${tx.stateName})` : ""}`, amount: tx.stateIncomeTax },
                    { label: "Social Security (6.2%)", amount: tx.socialSecurity },
                    { label: "Medicare (1.45%)", amount: tx.medicare },
                    ...tx.localTaxes.map((lt) => ({ label: lt.name, amount: lt.amount })),
                  ];
                  return (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Tax Breakdown</span>
                        <span className="text-xs text-muted-foreground">
                          Marginal: {(tx.marginalFederalRate * 100).toFixed(0)}% fed + {(tx.marginalStateRate * 100).toFixed(1)}% state
                        </span>
                      </div>
                      <div className="space-y-1">
                        {rows.map((r) => (
                          <div key={r.label} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{r.label}</span>
                            <span className="text-red-500 dark:text-red-400 font-mono">−{formatSalaryCompact(r.amount)}</span>
                          </div>
                        ))}
                        <Separator />
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Total Tax ({(tx.effectiveRate * 100).toFixed(1)}%)</span>
                          <span className="text-red-600 dark:text-red-400 font-mono">−{formatSalaryCompact(tx.totalEmployeeTax)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">Estimated Take-Home</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatSalaryCompact(tx.takeHomePay)}/yr</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                          <span>Employer Cost (FICA + FUTA)</span>
                          <span className="font-mono">{formatSalaryCompact(tx.totalEmployerCost)}/yr</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" /> {selectedJob.location}
                </div>

                {/* Other Duty Stations (USAJobs) */}
                {selectedJob.dutyStations && selectedJob.dutyStations.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Other Duty Stations ({selectedJob.dutyStations.length})</span>
                      <span className="text-[10px] text-muted-foreground">Same posting, different locations</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {selectedJob.dutyStations.map((ds, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded text-muted-foreground"
                        >
                          <MapPin className="h-3 w-3 shrink-0 text-green-500" />
                          <span className="truncate">{ds.location || `${ds.city}, ${ds.state}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                    <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs">
                          {commuteProfile.vehicleYear && commuteProfile.vehicleMake && commuteProfile.vehicleModel ? (
                            <span className="font-medium">{commuteProfile.vehicleYear} {commuteProfile.vehicleMake} {commuteProfile.vehicleModel}</span>
                          ) : (
                            <span className="text-muted-foreground italic">No vehicle set</span>
                          )}
                          <span className="text-muted-foreground ml-2">
                            {commuteProfile.vehicleMpg} MPG · ${commuteProfile.gasPricePerGallon.toFixed(2)}/gal · {commuteProfile.daysInOffice}d/wk
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setShowQuickCommuteEdit(true)}>
                          Edit
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
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
                                    if (next.has(anchor.id)) next.delete(anchor.id);
                                    else next.add(anchor.id);
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
              {getPreferredApplyLink(selectedJob) && (
                <a href={getPreferredApplyLink(selectedJob)} target="_blank" rel="noopener noreferrer">
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
              Company-wide intelligence across your search results
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

          {/* ── Gmail Sync (pull-based) ── */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Mail className="h-4 w-4" /> Sync from Gmail
            </p>
            <p className="text-[11px] text-muted-foreground">
              Automatically scan your Gmail for job alert emails from Indeed, LinkedIn, Glassdoor, and ZipRecruiter (last 7 days). Requires a connected Gmail account.
            </p>
            <Button
              size="sm"
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              disabled={gmailSyncing}
              onClick={async () => {
                setGmailSyncing(true);
                try {
                  const res = await fetch("/api/email-leads/sync", { method: "POST" });
                  const data = await res.json();
                  if (!res.ok) {
                    toast.error(data.error || "Gmail sync failed");
                    return;
                  }
                  queryClient.invalidateQueries({ queryKey: ["email-leads"] });
                  if (data.stored > 0) {
                    toast.success(`Found ${data.parsed} leads from ${data.emails} emails — ${data.stored} new, ${data.duplicates} duplicates`);
                    setShowEmailImport(false);
                  } else if (data.parsed > 0) {
                    toast.info(`${data.parsed} leads found but all duplicates (${data.emails} emails scanned)`);
                  } else if (data.emails > 0) {
                    toast.warning(`Scanned ${data.emails} emails but couldn't extract any leads`);
                  } else {
                    toast.info("No job alert emails found in the last 7 days");
                  }
                } catch {
                  toast.error("Gmail sync failed");
                } finally {
                  setGmailSyncing(false);
                }
              }}
            >
              {gmailSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {gmailSyncing ? "Scanning Gmail…" : "Sync Job Alerts from Gmail"}
            </Button>
          </div>

          <div className="relative flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-muted" />
            <span className="text-[10px] text-muted-foreground">or use manual methods</span>
            <div className="flex-1 border-t border-muted" />
          </div>

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

      {/* ── Quick Commute Edit Dialog ── */}
      <QuickCommuteEditDialog
        open={showQuickCommuteEdit}
        onOpenChange={setShowQuickCommuteEdit}
        commuteProfile={commuteProfile}
        onSaved={(updated) => {
          setCommuteProfile(updated);
          saveCommuteProfile(updated);
        }}
      />
    </div>
  );
}

/* ── Detail Edit Section (collapsible) ──────────────────────── */

function DetailEditSection({ title, icon, sectionKey, expanded, onToggle, children }: {
  title: string; icon: React.ReactNode; sectionKey: string; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={onToggle}>
        <span className="text-[11px] font-medium flex items-center gap-1.5">{icon} {title}</span>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

/* ── Benefits Toggle Chips ─────────────────────────────────── */

const BENEFIT_OPTIONS = ["health","dental","vision","401k","pto","hsa","fsa","life","disability","tuition","gym","stock","parental","commuter","meals"] as const;

function BenefitsToggle({ current, onSave }: { current?: string | null; onSave: (val: string | null) => void }) {
  const parsed: string[] = current ? (() => { try { return JSON.parse(current); } catch { return []; } })() : [];
  const [selected, setSelected] = useState<Set<string>>(new Set(parsed));

  function toggle(b: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(b) ? next.delete(b) : next.add(b);
      const arr = [...next];
      onSave(arr.length > 0 ? JSON.stringify(arr) : null);
      return next;
    });
  }

  return (
    <div className="flex flex-wrap gap-1">
      {BENEFIT_OPTIONS.map((b) => (
        <button key={b} type="button"
          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors capitalize ${selected.has(b) ? "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700" : "bg-muted/30 text-muted-foreground border-transparent hover:border-muted-foreground/30"}`}
          onClick={() => toggle(b)}>
          {b}
        </button>
      ))}
    </div>
  );
}

/* ── Work History Panel (floating on map) ──────────────────── */

type KpiMetric = {
  key: string;
  label: string;
  group: "Career" | "Compensation" | "Composition" | "Skills" | "Lifestyle";
  // returns null when there's no meaningful value to render
  compute: (ctx: KpiContext) => { value: string; color?: string } | null;
};

type KpiContext = {
  items: KpiItem[];
  stats: { tenureStr: string; totalMiles: number; cities: number; count: number } | null;
  cfm: { rtg: number; rtn: number | null } | null;
};

type KpiItem = {
  type?: string;
  company: string;
  title: string | null;
  address: string;
  startDate: string | null;
  endDate: string | null;
  industry?: string | null;
  workMode?: string | null;
  scheduleType?: string | null;
  salaryAmount?: number | null;
  salaryType?: string | null;
  bonusAmount?: number | null;
  commuteMinutes?: number | null;
  commuteDistance?: number | null;
  promotions?: string | null;
  accomplishments?: string | null;
  skillsUsed?: string | null;
  skillsGained?: string | null;
  wouldReturn?: string | null;
};

function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function tenureMonthsOf(start: string | null, end: string | null): number {
  if (!start) return 0;
  const s = new Date(start + "-01");
  const e = end ? new Date(end + "-01") : new Date();
  return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}

function fmtMonths(m: number): string {
  if (m <= 0) return "—";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  return y > 0 ? `${y}y ${mo}m` : `${mo}m`;
}

function jsonArrLen(raw: string | null | undefined): number {
  if (!raw) return 0;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.length : 0; } catch { return 0; }
}

function jsonArrSet(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return new Set();
    return new Set(a.filter((x: unknown): x is string => typeof x === "string").map((s) => s.toLowerCase()));
  } catch { return new Set(); }
}

const KPI_CATALOG: KpiMetric[] = [
  // ── Career ──
  { key: "tenure", label: "Total Tenure", group: "Career", compute: ({ stats }) => stats ? { value: stats.tenureStr } : null },
  { key: "roles", label: "Roles", group: "Career", compute: ({ stats }) => stats ? { value: String(stats.count) } : null },
  { key: "companies", label: "Companies", group: "Career", compute: ({ items }) => {
    const set = new Set(items.map((i) => i.company.trim().toLowerCase()).filter(Boolean));
    return set.size > 0 ? { value: String(set.size) } : null;
  }},
  { key: "industries", label: "Industries", group: "Career", compute: ({ items }) => {
    const set = new Set(items.map((i) => (i.industry ?? "").trim().toLowerCase()).filter(Boolean));
    return set.size > 0 ? { value: String(set.size) } : null;
  }},
  { key: "longestTenure", label: "Longest Tenure", group: "Career", compute: ({ items }) => {
    const m = Math.max(0, ...items.map((i) => tenureMonthsOf(i.startDate, i.endDate)));
    return m > 0 ? { value: fmtMonths(m) } : null;
  }},
  { key: "avgTenure", label: "Avg Tenure / Role", group: "Career", compute: ({ items }) => {
    const months = items.map((i) => tenureMonthsOf(i.startDate, i.endDate)).filter((m) => m > 0);
    if (months.length === 0) return null;
    const avg = Math.round(months.reduce((a, b) => a + b, 0) / months.length);
    return { value: fmtMonths(avg) };
  }},
  { key: "promotions", label: "Promotions", group: "Career", compute: ({ items }) => {
    const total = items.reduce((s, i) => s + jsonArrLen(i.promotions), 0);
    return total > 0 ? { value: String(total) } : null;
  }},
  { key: "accomplishments", label: "Accomplishments", group: "Career", compute: ({ items }) => {
    const total = items.reduce((s, i) => s + jsonArrLen(i.accomplishments), 0);
    return total > 0 ? { value: String(total) } : null;
  }},
  { key: "careerSpan", label: "Career Span", group: "Career", compute: ({ items }) => {
    const starts = items.map((i) => i.startDate).filter(Boolean) as string[];
    if (starts.length === 0) return null;
    const earliest = starts.sort()[0];
    const latestEnd = items.reduce((latest, i) => {
      const end = i.endDate ?? new Date().toISOString().slice(0, 7);
      return end > latest ? end : latest;
    }, "0000-00");
    const m = tenureMonthsOf(earliest, latestEnd === "0000-00" ? null : latestEnd);
    return m > 0 ? { value: fmtMonths(m) } : null;
  }},
  { key: "wouldReturn", label: "Would Return", group: "Career", compute: ({ items }) => {
    const yes = items.filter((i) => i.wouldReturn === "yes").length;
    const total = items.filter((i) => !!i.wouldReturn).length;
    if (total === 0) return null;
    return { value: `${yes}/${total}` };
  }},

  // ── Compensation ──
  { key: "rtg", label: "Recorded Total Gross", group: "Compensation", compute: ({ cfm }) => {
    if (!cfm || cfm.rtg <= 0) return null;
    return { value: fmtMoneyShort(cfm.rtg), color: "text-orange-600 dark:text-orange-400" };
  }},
  { key: "rtn", label: "Recorded Total Net", group: "Compensation", compute: ({ cfm }) => {
    if (!cfm || !cfm.rtn || cfm.rtn <= 0) return null;
    return { value: fmtMoneyShort(cfm.rtn), color: "text-emerald-600 dark:text-emerald-400" };
  }},
  { key: "highestSalary", label: "Highest Salary", group: "Compensation", compute: ({ items }) => {
    const annuals = items
      .filter((i) => typeof i.salaryAmount === "number" && i.salaryAmount! > 0)
      .map((i) => (i.salaryType === "hourly" ? (i.salaryAmount as number) * 2080 : (i.salaryAmount as number)));
    if (annuals.length === 0) return null;
    return { value: fmtMoneyShort(Math.max(...annuals)), color: "text-emerald-600 dark:text-emerald-400" };
  }},
  { key: "avgSalary", label: "Avg Salary", group: "Compensation", compute: ({ items }) => {
    const annuals = items
      .filter((i) => typeof i.salaryAmount === "number" && i.salaryAmount! > 0)
      .map((i) => (i.salaryType === "hourly" ? (i.salaryAmount as number) * 2080 : (i.salaryAmount as number)));
    if (annuals.length === 0) return null;
    const avg = annuals.reduce((a, b) => a + b, 0) / annuals.length;
    return { value: fmtMoneyShort(avg) };
  }},
  { key: "totalBonus", label: "Total Bonus", group: "Compensation", compute: ({ items }) => {
    const total = items.reduce((s, i) => s + (i.bonusAmount ?? 0), 0);
    return total > 0 ? { value: fmtMoneyShort(total), color: "text-amber-600 dark:text-amber-400" } : null;
  }},

  // ── Composition ──
  { key: "miles", label: "Miles Traveled", group: "Lifestyle", compute: ({ stats }) =>
    stats && stats.totalMiles > 0 ? { value: String(stats.totalMiles) } : null
  },
  { key: "cities", label: "Cities", group: "Lifestyle", compute: ({ stats }) =>
    stats && stats.cities > 0 ? { value: String(stats.cities) } : null
  },
  { key: "states", label: "States", group: "Lifestyle", compute: ({ items }) => {
    const states = new Set<string>();
    for (const i of items) {
      const parts = i.address.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        const tail = parts[parts.length - 1];
        const m = tail.match(/\b([A-Z]{2})\b/);
        if (m) states.add(m[1]);
      }
    }
    return states.size > 0 ? { value: String(states.size) } : null;
  }},
  { key: "avgCommute", label: "Avg Commute (min)", group: "Lifestyle", compute: ({ items }) => {
    const mins = items.map((i) => i.commuteMinutes).filter((m): m is number => typeof m === "number" && m > 0);
    if (mins.length === 0) return null;
    return { value: `${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)}m` };
  }},
  { key: "remoteShare", label: "Remote Share", group: "Lifestyle", compute: ({ items }) => {
    const known = items.filter((i) => !!i.workMode);
    if (known.length === 0) return null;
    const remote = known.filter((i) => i.workMode === "remote").length;
    return { value: `${Math.round((remote / known.length) * 100)}%` };
  }},
  { key: "fullTimeCount", label: "Full-Time Roles", group: "Composition", compute: ({ items }) => {
    const n = items.filter((i) => i.scheduleType === "full-time").length;
    return n > 0 ? { value: String(n) } : null;
  }},
  { key: "contractCount", label: "Contract Roles", group: "Composition", compute: ({ items }) => {
    const n = items.filter((i) => i.scheduleType === "contract" || i.scheduleType === "freelance").length;
    return n > 0 ? { value: String(n) } : null;
  }},
  { key: "education", label: "Education", group: "Composition", compute: ({ items }) => {
    const n = items.filter((i) => i.type === "school").length;
    return n > 0 ? { value: String(n) } : null;
  }},
  { key: "military", label: "Military", group: "Composition", compute: ({ items }) => {
    const n = items.filter((i) => i.type === "military").length;
    return n > 0 ? { value: String(n) } : null;
  }},
  { key: "volunteer", label: "Volunteer", group: "Composition", compute: ({ items }) => {
    const n = items.filter((i) => i.type === "volunteer").length;
    return n > 0 ? { value: String(n) } : null;
  }},

  // ── Skills ──
  { key: "skillsUsed", label: "Skills Used", group: "Skills", compute: ({ items }) => {
    const set = new Set<string>();
    for (const i of items) jsonArrSet(i.skillsUsed).forEach((s) => set.add(s));
    return set.size > 0 ? { value: String(set.size) } : null;
  }},
  { key: "skillsGained", label: "Skills Gained", group: "Skills", compute: ({ items }) => {
    const set = new Set<string>();
    for (const i of items) jsonArrSet(i.skillsGained).forEach((s) => set.add(s));
    return set.size > 0 ? { value: String(set.size) } : null;
  }},
];

const KPI_CATALOG_BY_KEY: Record<string, KpiMetric> = Object.fromEntries(KPI_CATALOG.map((m) => [m.key, m]));

function WorkHistoryPanel({
  items, onClose, onAdded, onDeleted, showCareerPath, onToggleCareerPath, showOverlaps, onToggleOverlaps, focusedId, onExitFocus,
  pinDropMode, pinDropCoords, onStartPinDrop, onCancelPinDrop, onClearPinDrop, onFocusJob,
  residences, activeResidence, timeFilter, timeRange, onTimeFilterChange, onResidenceAdded, onResidenceDeleted,
  hiddenTypes, onToggleType, mapContainer,
}: {
  items: { id: string; type?: string; company: string; title: string | null; address: string; lat: number; lng: number; startDate: string | null; endDate: string | null; locations: { id: string; label: string; type: string; address: string; lat: number; lng: number; isPrimary: boolean; placeId?: string | null; skills?: string | null; startDate?: string | null; endDate?: string | null; photos?: string | null }[];
    degree?: string | null; major?: string | null; gpa?: number | null;
    salaryAmount?: number | null; salaryType?: string | null; salaryCurrency?: string | null; bonusAmount?: number | null; equityNotes?: string | null;
    workMode?: string | null; hybridDays?: number | null; scheduleType?: string | null; hoursPerWeek?: number | null; shiftNotes?: string | null;
    benefits?: string | null; ptoDaysOffered?: number | null; ptoDaysUsed?: number | null; ptoNotes?: string | null;
    companySize?: string | null; department?: string | null; teamSize?: number | null; managerName?: string | null;
    industry?: string | null;
    skillsUsed?: string | null; skillsGained?: string | null; promotions?: string | null;
    reasonForLeaving?: string | null; wouldReturn?: string | null; accomplishments?: string | null;
    commuteMinutes?: number | null; commuteDistance?: number | null; commuteMode?: string | null;
    schedule?: string | null; rotatingSchedule?: boolean; scheduleBHours?: number | null;
    otHoursA?: number | null; otHoursB?: number | null; otRate?: number | null;
    differentials?: string | null; payFrequency?: string | null; payType?: string | null;
    coverImage?: string | null;
    coverImageY?: number | null;
    uniformData?: string | null;
  }[];
  onClose: () => void;
  onAdded: () => void;
  onDeleted: () => void;
  showCareerPath: boolean;
  onToggleCareerPath: () => void;
  showOverlaps: boolean;
  onToggleOverlaps: () => void;
  focusedId: string | null;
  pinDropMode: boolean;
  pinDropCoords: { lat: number; lng: number; placeId?: string } | null;
  onStartPinDrop: () => void;
  onCancelPinDrop: () => void;
  onClearPinDrop: () => void;
  onExitFocus: () => void;
  onFocusJob: (item: { id: string; lat: number; lng: number }) => void;
  residences: { id: string; label: string; address: string; lat: number; lng: number; placeId?: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean }[];
  activeResidence: { id: string; label: string; address: string; lat: number; lng: number; startDate: string | null; endDate: string | null; isCurrent: boolean } | null;
  timeFilter: string | null;
  timeRange: { min: string; max: string } | null;
  onTimeFilterChange: (val: string | null) => void;
  onResidenceAdded: () => void;
  onResidenceDeleted: () => void;
  hiddenTypes: Set<string>;
  onToggleType: (type: string) => void;
  mapContainer: HTMLElement | null;
}) {
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<"job" | "school" | "military" | "volunteer" | "internship" | "self-employed" | "unemployed">("job");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [addDegree, setAddDegree] = useState("");
  const [addMajor, setAddMajor] = useState("");
  const [addGpa, setAddGpa] = useState("");
  const [address, setAddress] = useState("");
  const [addCoords, setAddCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addPlaceId, setAddPlaceId] = useState<string | null>(null);

  // CFM summary for RTG/RTN in stats header
  const { data: cfmSummary } = useQuery<{ rtg: number; rtn: number | null; yearSpan: { from: number; to: number } | null }>({
    queryKey: ["cfm-summary"],
    queryFn: async () => {
      const r = await fetch("/api/cfm");
      const d = await r.json();
      return { rtg: d.rtg ?? 0, rtn: d.rtn ?? null, yearSpan: d.yearSpan ?? null };
    },
    staleTime: 120_000,
  });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCoords, setEditCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [editPlaceId, setEditPlaceId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [tab, setTab] = useState<"list" | "timeline" | "compare">(() => {
    const saved = loadWorkHistoryPanelPrefs().tab;
    return saved === "timeline" || saved === "compare" ? saved : "list";
  });
  const [showTypeFilterPanel, setShowTypeFilterPanel] = useState(false);
  const [showPanelSettings, setShowPanelSettings] = useState(false);
  const [kpiSlots, setKpiSlots] = useState<string[]>(() => loadKpiSlots());
  useEffect(() => {
    try { localStorage.setItem(WORK_HISTORY_KPI_SLOTS_KEY, JSON.stringify(kpiSlots)); } catch {}
  }, [kpiSlots]);
  const toggleKpiSlot = useCallback((k: string) => {
    setKpiSlots((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      if (prev.length >= KPI_MAX_SLOTS) return prev;
      return [...prev, k];
    });
  }, []);
  const resetKpiSlots = useCallback(() => setKpiSlots([...DEFAULT_KPI_SLOTS]), []);
  const [showInventoryOverview, setShowInventoryOverview] = useState(false);
  const [inventoryPanel, setInventoryPanel] = useState<InventoryPanelState>(() => loadInventoryPanel());
  const [showInventorySnapMenu, setShowInventorySnapMenu] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(INVENTORY_PANEL_KEY, JSON.stringify(inventoryPanel)); } catch { /* noop */ }
  }, [inventoryPanel]);
  const inventoryDragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; originX: number; originY: number; originW: number; originH: number } | null>(null);
  const onInventoryDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    inventoryDragRef.current = {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      originX: inventoryPanel.x,
      originY: inventoryPanel.y,
      originW: inventoryPanel.w,
      originH: inventoryPanel.h,
    };
  }, [inventoryPanel]);
  const onInventoryResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    inventoryDragRef.current = {
      mode: "resize",
      startX: e.clientX,
      startY: e.clientY,
      originX: inventoryPanel.x,
      originY: inventoryPanel.y,
      originW: inventoryPanel.w,
      originH: inventoryPanel.h,
    };
  }, [inventoryPanel]);
  const onInventoryDragMove = useCallback((e: React.PointerEvent) => {
    const drag = inventoryDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === "move") {
      const maxX = Math.max(0, window.innerWidth - 80);
      const maxY = Math.max(0, window.innerHeight - 60);
      setInventoryPanel((p) => ({
        ...p,
        x: Math.min(maxX, Math.max(0, drag.originX + dx)),
        y: Math.min(maxY, Math.max(0, drag.originY + dy)),
      }));
    } else {
      const maxW = Math.max(INVENTORY_PANEL_MIN.w, window.innerWidth - drag.originX - 8);
      const maxH = Math.max(INVENTORY_PANEL_MIN.h, window.innerHeight - drag.originY - 8);
      setInventoryPanel((p) => ({
        ...p,
        w: Math.min(maxW, Math.max(INVENTORY_PANEL_MIN.w, drag.originW + dx)),
        h: Math.min(maxH, Math.max(INVENTORY_PANEL_MIN.h, drag.originH + dy)),
      }));
    }
  }, []);
  const onInventoryDragEnd = useCallback(() => { inventoryDragRef.current = null; }, []);
  const snapInventoryToCorner = useCallback((corner: "tl" | "tr" | "bl" | "br") => {
    setInventoryPanel((p) => {
      const margin = 16;
      const w = p.w;
      const h = p.minimized ? 44 : p.h;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const x = corner === "tl" || corner === "bl" ? margin : Math.max(margin, vw - w - margin);
      const y = corner === "tl" || corner === "tr" ? margin : Math.max(margin, vh - h - margin);
      return { ...p, x, y };
    });
    setShowInventorySnapMenu(false);
  }, []);
  const [lastMainTab, setLastMainTab] = useState<"list" | "timeline">(() => {
    return loadWorkHistoryPanelPrefs().lastMainTab === "timeline" ? "timeline" : "list";
  });
  const [showTimeFilterPanel, setShowTimeFilterPanel] = useState(() => !!loadWorkHistoryPanelPrefs().showTimeFilterPanel);
  // Collapsible sections in list view
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleListSection = (key: string) => setCollapsedSections((prev) => { const s = new Set(prev); if (s.has(key)) s.delete(key); else s.add(key); return s; });
  // List search + sort
  const [listSearch, setListSearch] = useState("");
  const [listSort, setListSort] = useState<"newest" | "oldest" | "tenure">("newest");
  // Compare mode state
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  // Residence add state
  const [addingResidence, setAddingResidence] = useState(false);
  const [resLabel, setResLabel] = useState("");
  const [resAddress, setResAddress] = useState("");
  const [resCoords, setResCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resPlaceId, setResPlaceId] = useState<string | null>(null);
  const [resStart, setResStart] = useState("");
  const [resEnd, setResEnd] = useState("");
  const [resSaving, setResSaving] = useState(false);
  const [showResidences, setShowResidences] = useState(false);
  // Commute time cache: workHistoryId → { durationMin, distanceMi }
  const [commuteTimes, setCommuteTimes] = useState<Map<string, { durationMin: number; distanceMi: number }>>(new Map());
  const commuteAbortRef = useRef<AbortController | null>(null);

  const formatYearMonth = useCallback((value: string | null) => {
    if (!value) return null;
    const [y, m] = value.split("-");
    const mi = Number(m) - 1;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Number.isFinite(mi) && mi >= 0 && mi < 12 ? `${months[mi]} ${y}` : value;
  }, []);

  const shortAddress = useCallback((address: string) => {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) return `${parts[parts.length - 3]}, ${parts[parts.length - 2]}`;
    if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    return address;
  }, []);

  const applyHiddenTypes = useCallback((nextHidden: Set<string>) => {
    for (const type of ALL_WORK_TYPES) {
      const isHiddenNow = hiddenTypes.has(type);
      const shouldBeHidden = nextHidden.has(type);
      if (isHiddenNow !== shouldBeHidden) onToggleType(type);
    }
  }, [hiddenTypes, onToggleType]);

  useEffect(() => {
    if (timeFilter) setShowTimeFilterPanel(true);
  }, [timeFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        WORK_HISTORY_PANEL_PREFS_KEY,
        JSON.stringify({ tab, lastMainTab, showTimeFilterPanel }),
      );
    } catch {
      // ignore quota/permission issues
    }
  }, [tab, lastMainTab, showTimeFilterPanel]);

  useEffect(() => {
    if (tab !== "compare") setLastMainTab(tab);
  }, [tab]);

  // Fetch commute times from activeResidence to visible items
  useEffect(() => {
    commuteAbortRef.current?.abort();
    if (!activeResidence || !timeFilter) { setCommuteTimes(new Map()); return; }
    const validItems = items.filter((w) => (w.type ?? "job") !== "unemployed" && w.lat !== 0 && w.lng !== 0);
    if (validItems.length === 0) { setCommuteTimes(new Map()); return; }
    const ctrl = new AbortController();
    commuteAbortRef.current = ctrl;
    const fetchAll = async () => {
      const results = new Map<string, { durationMin: number; distanceMi: number }>();
      // Fetch in parallel with a small batch
      const batches = [];
      for (let i = 0; i < validItems.length; i += 3) batches.push(validItems.slice(i, i + 3));
      for (const batch of batches) {
        if (ctrl.signal.aborted) return;
        const promises = batch.map(async (w) => {
          try {
            const url = `/api/commute?fromLat=${activeResidence.lat}&fromLng=${activeResidence.lng}&toLat=${w.lat}&toLng=${w.lng}&mode=driving`;
            const res = await fetch(url, { signal: ctrl.signal });
            if (res.ok) {
              const d = await res.json();
              if (d.durationMin != null) results.set(w.id, { durationMin: Math.round(d.durationMin), distanceMi: Math.round(d.distanceMi ?? 0) });
            }
          } catch { /* aborted or network error */ }
        });
        await Promise.all(promises);
      }
      if (!ctrl.signal.aborted) setCommuteTimes(results);
    };
    fetchAll();
    return () => ctrl.abort();
  }, [activeResidence, timeFilter, items]);

  // Sub-location state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingLocFor, setAddingLocFor] = useState<string | null>(null);
  const [locLabel, setLocLabel] = useState("");
  const [locType, setLocType] = useState("daily-workplace");
  const [customLocType, setCustomLocType] = useState("");
  const [locAddress, setLocAddress] = useState("");
  const [locCoords, setLocCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locPlaceId, setLocPlaceId] = useState<string | null>(null);
  const [locSaving, setLocSaving] = useState(false);

  // Photo upload state
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Skill autocomplete from knowledge graph
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/skills").then((r) => r.ok ? r.json() : []).then((skills: { name: string }[]) => setSkillSuggestions(skills.map((s) => s.name))).catch(() => {});
  }, []);

  async function handlePhotoUpload(workHistoryId: string, locId: string, file: File) {
    setUploadingPhotoFor(locId);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/work-history/${workHistoryId}/locations/${locId}/photos`, { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Upload failed"); return; }
      onAdded();
    } catch { toast.error("Upload failed"); }
    finally { setUploadingPhotoFor(null); }
  }

  async function handlePhotoDelete(workHistoryId: string, locId: string, url: string) {
    try {
      const res = await fetch(`/api/work-history/${workHistoryId}/locations/${locId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) { toast.error("Failed to remove photo"); return; }
      onAdded();
    } catch { toast.error("Failed to remove photo"); }
  }

  async function handleAddResidence() {
    if (!resLabel.trim() || !resAddress.trim() || !resStart) { toast.error("Label, address and start date are required"); return; }
    setResSaving(true);
    try {
      let coords = resCoords;
      if (!coords) {
        coords = await geocode(resAddress);
        if (!coords) { toast.error("Could not geocode address"); setResSaving(false); return; }
      }
      const body: Record<string, unknown> = {
        label: resLabel.trim(),
        address: resAddress.trim(),
        lat: coords.lat,
        lng: coords.lng,
        placeId: resPlaceId,
        startDate: new Date(resStart + "-01").toISOString(),
        isCurrent: !resEnd,
      };
      if (resEnd) body.endDate = new Date(resEnd + "-01").toISOString();
      const res = await fetch("/api/residences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Failed to add residence"); return; }
      toast.success("Residence added");
      onResidenceAdded();
      setAddingResidence(false);
      setResLabel(""); setResAddress(""); setResCoords(null); setResPlaceId(null); setResStart(""); setResEnd("");
    } catch { toast.error("Failed to add residence"); }
    finally { setResSaving(false); }
  }

  async function handleDeleteResidence(id: string) {
    try {
      const res = await fetch(`/api/residences/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete residence"); return; }
      toast.success("Residence deleted");
      onResidenceDeleted();
    } catch { toast.error("Failed to delete residence"); }
  }

  async function geocode(addr: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : null;
    } catch { return null; }
  }

  /** Use Places API getDetails to get exact coords from a placeId */
  function placeDetails(placeId: string): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (typeof google === "undefined" || !google.maps?.places) { resolve(null); return; }
      const div = document.createElement("div");
      const service = new google.maps.places.PlacesService(div);
      service.getDetails({ placeId, fields: ["geometry"] }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          resolve({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
        } else {
          resolve(null);
        }
      });
    });
  }

  /** Resolve coordinates: prefer placeId details, fallback to geocode */
  async function resolveCoords(addr: string, placeId?: string): Promise<{ lat: number; lng: number } | null> {
    if (placeId) {
      const result = await placeDetails(placeId);
      if (result) return result;
    }
    return geocode(addr);
  }

  async function handleImportFromExperience() {
    setImporting(true);
    try {
      const res = await fetch("/api/current-position");
      if (!res.ok) throw new Error("Failed to fetch positions");
      const positions: { company: string; role: string | null; address: string | null; location: string | null; startDate: string | null; endDate: string | null }[] = await res.json();

      const existingCompanies = new Set(items.map((i) => i.company.toLowerCase().trim()));
      const toImport = positions.filter((p) => {
        const addr = p.address || p.location;
        return addr && !existingCompanies.has(p.company.toLowerCase().trim());
      });

      if (toImport.length === 0) {
        toast.info("No new positions to import");
        return;
      }

      let imported = 0;
      for (const pos of toImport) {
        const addr = pos.address || pos.location || "";
        const geo = await geocode(addr);
        if (!geo) continue;

        const sd = pos.startDate ? new Date(pos.startDate).toISOString().slice(0, 7) : null;
        const ed = pos.endDate ? new Date(pos.endDate).toISOString().slice(0, 7) : null;

        const r = await fetch("/api/work-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: pos.company, title: pos.role || null, address: addr, lat: geo.lat, lng: geo.lng, startDate: sd, endDate: ed }),
        });
        if (r.ok) imported++;
      }

      if (imported > 0) {
        toast.success(`Imported ${imported} position${imported > 1 ? "s" : ""}`);
        onAdded();
      } else {
        toast.warning("Could not geocode any position addresses");
      }
    } catch { toast.error("Failed to import positions"); } finally { setImporting(false); }
  }

  async function handleAdd() {
    const isUnemployedType = addType === "unemployed";
    if (!company.trim() || (!isUnemployedType && !address.trim())) { toast.error(isUnemployedType ? "Period label is required" : "Company and address are required"); return; }
    // Duplicate detection
    const dup = items.find((w) => w.company.toLowerCase() === company.trim().toLowerCase());
    if (dup && !confirm(`"${dup.company}" already exists in your work history. Add anyway?`)) return;
    setSaving(true);
    try {
      const geo = isUnemployedType ? { lat: 0, lng: 0 } : (addCoords ?? await geocode(address));
      if (!geo) { toast.error("Could not geocode address"); setSaving(false); return; }
      const res = await fetch("/api/work-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: company.trim(), title: jobTitle.trim() || null, address: isUnemployedType ? "N/A" : address.trim(), lat: geo.lat, lng: geo.lng, placeId: isUnemployedType ? null : addPlaceId, startDate: startDate || null, endDate: endDate || null, type: addType, degree: addDegree.trim() || null, major: addMajor.trim() || null, gpa: addGpa ? parseFloat(addGpa) : null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(addType === "school" ? "Education added" : addType === "internship" ? "Internship added" : addType === "self-employed" ? "Self-employment added" : addType === "unemployed" ? "Gap period added" : "Work history added");
      setCompany(""); setJobTitle(""); setAddress(""); setAddCoords(null); setAddPlaceId(null); setStartDate(""); setEndDate("");
      setAddType("job"); setAddDegree(""); setAddMajor(""); setAddGpa("");
      setAdding(false);
      onAdded();
    } catch { toast.error("Failed to add work history"); } finally { setSaving(false); }
  }

  function startEdit(w: typeof items[0]) {
    setEditingId(w.id);
    setEditCompany(w.company);
    setEditTitle(w.title ?? "");
    setEditAddress(w.address);
    setEditCoords(null);
    setEditPlaceId((w as typeof items[0] & { placeId?: string | null }).placeId ?? null);
    setEditStart(w.startDate ?? "");
    setEditEnd(w.endDate ?? "");
  }

  async function handleSaveEdit() {
    if (!editingId || !editCompany.trim() || !editAddress.trim()) { toast.error("Company and address are required"); return; }
    setEditSaving(true);
    try {
      const original = items.find((i) => i.id === editingId);
      const addressChanged = original && original.address !== editAddress.trim();
      let lat = original?.lat;
      let lng = original?.lng;
      if (addressChanged) {
        const geo = editCoords ?? await geocode(editAddress.trim());
        if (!geo) { toast.error("Could not geocode new address"); setEditSaving(false); return; }
        lat = geo.lat;
        lng = geo.lng;
      }
      const res = await fetch(`/api/work-history/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: editCompany.trim(), title: editTitle.trim() || null, address: editAddress.trim(), lat, lng, placeId: editPlaceId, startDate: editStart || null, endDate: editEnd || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Updated");
      setEditingId(null);
      setEditCoords(null);
      setEditPlaceId(null);
      onAdded();
    } catch { toast.error("Failed to update"); } finally { setEditSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/work-history/${id}`, { method: "DELETE" });
      onDeleted();
    } catch { toast.error("Failed to delete"); }
  }

  const LOC_TYPES = [
    { value: "daily-workplace", label: "Daily workplace" },
    { value: "main-office", label: "Main office" },
    { value: "satellite", label: "Satellite office" },
    { value: "remote", label: "Remote / WFH" },
    { value: "client-site", label: "Client site" },
    { value: "custom", label: "Custom…" },
  ] as const;

  /** Handle PlacesAutocomplete onPlaceSelect for sub-location form */
  async function handleLocPlaceSelect(place: { description: string; placeId: string }) {
    const coords = await resolveCoords(place.description, place.placeId);
    if (coords) setLocCoords(coords);
    setLocPlaceId(place.placeId);
  }

  async function handleAddLocation(workHistoryId: string) {
    if (!locLabel.trim() || !locAddress.trim()) { toast.error("Label and address are required"); return; }
    setLocSaving(true);
    try {
      const geo = locCoords ?? await geocode(locAddress.trim());
      if (!geo) { toast.error("Could not geocode address"); setLocSaving(false); return; }
      const res = await fetch(`/api/work-history/${workHistoryId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: locLabel.trim(), type: locType === "custom" ? customLocType.trim() : locType, address: locAddress.trim(), lat: geo.lat, lng: geo.lng, placeId: locPlaceId, isPrimary: false }),
      });
      if (!res.ok) throw new Error("Failed to add");
      toast.success("Location added");
      setLocLabel(""); setLocType("daily-workplace"); setCustomLocType(""); setLocAddress(""); setLocCoords(null); setLocPlaceId(null);
      setAddingLocFor(null);
      onAdded();
    } catch { toast.error("Failed to add location"); } finally { setLocSaving(false); }
  }

  async function handleDeleteLocation(workHistoryId: string, locId: string) {
    try {
      await fetch(`/api/work-history/${workHistoryId}/locations/${locId}`, { method: "DELETE" });
      onAdded();
    } catch { toast.error("Failed to delete location"); }
  }

  // Tenure helper
  const calcTenureMonths = (startDate: string | null, endDate: string | null) => {
    if (!startDate) return 0;
    const s = new Date(startDate + "-01");
    const e = endDate ? new Date(endDate + "-01") : new Date();
    return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
  };
  const formatTenure = (months: number) => months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months}m`;

  // List view: sorted + filtered
  const listItems = useMemo(() => {
    let arr = [...items];
    if (listSort === "newest") arr.sort((a, b) => (b.startDate ?? "9999").localeCompare(a.startDate ?? "9999"));
    else if (listSort === "oldest") arr.sort((a, b) => (a.startDate ?? "0000").localeCompare(b.startDate ?? "0000"));
    else if (listSort === "tenure") arr.sort((a, b) => calcTenureMonths(b.startDate, b.endDate) - calcTenureMonths(a.startDate, a.endDate));
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase();
      arr = arr.filter((w) => w.company.toLowerCase().includes(q) || (w.title ?? "").toLowerCase().includes(q));
    }
    return arr;
  }, [items, listSort, listSearch]);

  // Timeline view: oldest first (chronological)
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (a.startDate ?? "0000").localeCompare(b.startDate ?? "0000"));
  }, [items]);

  // Overlap map: for each item, which other items overlap in time
  const overlapMap = useMemo(() => {
    const m = new Map<string, { id: string; company: string; type?: string; title?: string | null; schedule?: string | null; hoursPerWeek?: number | null; scheduleType?: string | null; shiftNotes?: string | null; startDate?: string | null; endDate?: string | null }[]>();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a.startDate) continue;
      const overlaps: { id: string; company: string; type?: string; title?: string | null; schedule?: string | null; hoursPerWeek?: number | null; scheduleType?: string | null; shiftNotes?: string | null; startDate?: string | null; endDate?: string | null }[] = [];
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const b = items[j];
        if (dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
          overlaps.push({ id: b.id, company: b.company, type: b.type, title: b.title, schedule: b.schedule, hoursPerWeek: b.hoursPerWeek, scheduleType: b.scheduleType, shiftNotes: b.shiftNotes, startDate: b.startDate, endDate: b.endDate });
        }
      }
      if (overlaps.length > 0) m.set(a.id, overlaps);
    }
    return m;
  }, [items]);

  // Career journey stats
  const stats = useMemo(() => {
    if (items.length === 0) return null;
    let totalMonths = 0;
    for (const w of items) {
      if (!w.startDate) continue;
      const start = new Date(w.startDate + "-01");
      const end = w.endDate ? new Date(w.endDate + "-01") : new Date();
      totalMonths += Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    }
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const tenureStr = years > 0 ? `${years}y ${months}m` : `${months}m`;

    let totalMiles = 0;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const dLat = (b.lat - a.lat) * 69;
      const dLng = (b.lng - a.lng) * 69 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
      totalMiles += Math.sqrt(dLat * dLat + dLng * dLng);
    }

    const cities = new Set(items.map((w) => {
      const parts = w.address.split(",").map((s) => s.trim());
      return parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : w.address.toLowerCase();
    }));

    return { tenureStr, totalMiles: Math.round(totalMiles), cities: cities.size, count: items.length };
  }, [items, sorted]);

  /** Handle PlacesAutocomplete onPlaceSelect for add form */
  async function handleAddPlaceSelect(place: { description: string; placeId: string }) {
    const coords = await resolveCoords(place.description, place.placeId);
    if (coords) setAddCoords(coords);
    setAddPlaceId(place.placeId);
  }

  /** Handle PlacesAutocomplete onPlaceSelect for edit form */
  async function handleEditPlaceSelect(place: { description: string; placeId: string }) {
    const coords = await resolveCoords(place.description, place.placeId);
    if (coords) setEditCoords(coords);
    setEditPlaceId(place.placeId);
  }

  // Focused work history entry
  const queryClient = useQueryClient();
  const focusedItem = focusedId ? items.find((w) => w.id === focusedId) : null;
  const focusedConcurrentJobs = useMemo(() => {
    if (!focusedItem || !showOverlaps) return [];
    return overlapMap.get(focusedItem.id) ?? [];
  }, [focusedItem, showOverlaps, overlapMap]);

  // ── Enriched data from CurrentPosition for focused view ──
  interface MatchedPosition {
    id: string; company: string; role: string; salary: number | null; currency: string;
    payType: string; payRate: string | null; payFrequency: string;
    description: string | null; responsibilities: string | null; techStack: string | null;
    companySynopsis: string | null; industry: string | null; website: string | null;
    ein: string | null; legalName: string | null; managerName: string | null;
    hoursPerWeek: number | null; type: string;
    equipment?: {
      id: string;
      name: string;
      category: string;
      usage: string;
      manufacturer?: string | null;
      model?: string | null;
      condition: string;
      notes?: string | null;
      photos?: {
        id: string;
        filePath: string;
        fileName: string;
        fileMime: string;
        fileSize: number;
        caption?: string | null;
        isCover: boolean;
        createdAt: string;
      }[];
    }[];
    attachments?: { id: string; label: string; category: string; fileName: string; filePath: string; fileMime: string; fileSize: number; createdAt: string }[];
    galleryPhotos?: {
      id: string;
      filePath: string;
      fileName: string;
      fileMime: string;
      fileSize: number;
      caption?: string | null;
      isCover: boolean;
      isFavorite?: boolean;
      isPrivate?: boolean;
      tags?: string | null;
      markers?: string | null;
      dateTaken?: string | null;
      rotation?: number;
      sortOrder?: number | null;
      albumId?: string | null;
      album?: { id: string; name: string } | null;
      createdAt: string;
    }[];
    galleryAlbums?: { id: string; name: string; sortOrder?: number | null; createdAt: string }[];
  }
  interface CompEvent { id: string; type: string; title: string; amount: number; currency: string; effectiveDate: string; recurring: boolean; notes: string | null }
  interface WLog { id: string; title: string; content: string | null; category: string; hours: number | null; accomplishment: boolean; impact: string | null; date: string; tags: string | null }
  interface IncomeHistory { employer: string; years: { year: number; grossIncome: number; netIncome: number | null }[]; totalGross: number; totalNet: number | null; yearCount: number }

  const [matchedPosition, setMatchedPosition] = useState<MatchedPosition | null>(null);
  const [compEvents, setCompEvents] = useState<CompEvent[]>([]);
  const [workLogs, setWorkLogs] = useState<WLog[]>([]);
  const [incomeHistory, setIncomeHistory] = useState<IncomeHistory | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [focusTab, setFocusTab] = useState<"overview" | "edit">("overview");
  const [sidePanel, setSidePanel] = useState<"gallery" | "attachments" | "skills" | "equipment" | null>(null);
  const [panelGalleryView, setPanelGalleryView] = useState<"photos" | "albums">(() => {
    if (typeof window === "undefined") return "photos";
    const saved = localStorage.getItem(PANEL_GALLERY_VIEW_KEY);
    return saved === "albums" ? "albums" : "photos";
  });
  const [panelBusy, setPanelBusy] = useState(false);
  const [galleryModalIdx, setGalleryModalIdx] = useState<number | null>(null);
  const [equipmentPhotoViewer, setEquipmentPhotoViewer] = useState<{ equipmentId: string; index: number } | null>(null);
  const [showFocusInfo, setShowFocusInfo] = useState(false);
  const [showInfoLabel, setShowInfoLabel] = useState(false);
  const [isFocusInfoHovered, setIsFocusInfoHovered] = useState(false);
  const [showLocationsPopover, setShowLocationsPopover] = useState(false);
  const prevFocusedId = useRef<string | null>(null);
  const focusInfoAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(PANEL_GALLERY_VIEW_KEY, panelGalleryView);
  }, [panelGalleryView]);

  /* Gallery refresh helper – hoisted so modal survives tab switches */
  const refreshGallery = useCallback(async () => {
    if (!focusedItem) return;
    const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
    if (posRes.ok) setMatchedPosition(await posRes.json());
    queryClient.invalidateQueries({ queryKey: ["work-history"] });
  }, [focusedItem, queryClient]);

  const equipmentViewerEquipment = equipmentPhotoViewer
    ? matchedPosition?.equipment?.find((item) => item.id === equipmentPhotoViewer.equipmentId) ?? null
    : null;
  const equipmentViewerPhotos = equipmentViewerEquipment?.photos ?? [];
  const equipmentViewerIndex = equipmentPhotoViewer
    ? Math.min(equipmentPhotoViewer.index, Math.max(0, equipmentViewerPhotos.length - 1))
    : 0;
  const equipmentViewerPhoto = equipmentViewerPhotos[equipmentViewerIndex] ?? null;

  const confirmMediaUpload = useCallback((surface: "gallery" | "equipment") => {
    const target = surface === "gallery" ? "gallery" : "equipment";
    return confirm(
      `Before uploading to ${target}, make sure the image does not expose private faces, serial numbers, customer information, proprietary dashboards, or other sensitive details.`
    );
  }, []);

  const refreshFocusedPosition = useCallback(async () => {
    if (!focusedItem) return;
    const res = await fetch(`/api/current-position/${focusedItem.id}`);
    if (res.ok) setMatchedPosition(await res.json());
    queryClient.invalidateQueries({ queryKey: ["work-history"] });
  }, [focusedItem, queryClient]);

  const handleEquipmentPhotoUpload = useCallback(async (equipmentId: string, file: File, isFirst: boolean) => {
    if (!confirmMediaUpload("equipment")) return false;
    setPanelBusy(true);
    try {
      const fd = new FormData();
      fd.append("equipmentId", equipmentId);
      fd.append("file", file);
      if (isFirst) fd.append("isCover", "true");
      const res = await fetch("/api/equipment/photos", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error || "Failed to upload equipment photo");
        return false;
      }
      await refreshFocusedPosition();
      toast.success("Equipment photo uploaded");
      return true;
    } finally {
      setPanelBusy(false);
    }
  }, [confirmMediaUpload, refreshFocusedPosition]);

  const handleEquipmentPhotoDelete = useCallback(async (photoId: string) => {
    if (!confirm("Delete this equipment photo?")) return false;
    setPanelBusy(true);
    try {
      const res = await fetch(`/api/equipment/photos?id=${photoId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete equipment photo");
        return false;
      }
      await refreshFocusedPosition();
      toast.success("Equipment photo deleted");
      return true;
    } finally {
      setPanelBusy(false);
    }
  }, [refreshFocusedPosition]);

  const handleEquipmentPhotoSetCover = useCallback(async (photoId: string) => {
    setPanelBusy(true);
    try {
      const res = await fetch("/api/equipment/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photoId, isCover: true }),
      });
      if (!res.ok) {
        toast.error("Failed to set equipment cover");
        return false;
      }
      await refreshFocusedPosition();
      toast.success("Equipment cover updated");
      return true;
    } finally {
      setPanelBusy(false);
    }
  }, [refreshFocusedPosition]);

  const handleEquipmentPhotoCaption = useCallback(async (photoId: string, currentCaption?: string | null) => {
    const caption = prompt("Photo caption:", currentCaption ?? "");
    if (caption === null) return false;
    setPanelBusy(true);
    try {
      const res = await fetch("/api/equipment/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photoId, caption: caption.trim() || null }),
      });
      if (!res.ok) {
        toast.error("Failed to update equipment photo caption");
        return false;
      }
      await refreshFocusedPosition();
      toast.success("Equipment photo caption saved");
      return true;
    } finally {
      setPanelBusy(false);
    }
  }, [refreshFocusedPosition]);

  useEffect(() => {
    if (equipmentPhotoViewer && !equipmentViewerPhoto) {
      setEquipmentPhotoViewer(null);
    }
  }, [equipmentPhotoViewer, equipmentViewerPhoto]);

  // Fetch enriched data when focused item changes
  useEffect(() => {
    if (!focusedItem || focusedId === prevFocusedId.current) return;
    prevFocusedId.current = focusedId;
    setMatchedPosition(null); setCompEvents([]); setWorkLogs([]); setIncomeHistory(null); setExpandedSections(new Set()); setSidePanel(null); setUniformMapOpen(false);
    setShowFocusInfo(false);

    let cancelled = false;
    (async () => {
      setEnrichLoading(true);
      try {
        // Fetch position data for enrichment (all positions are WorkHistory now)
        const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
        if (cancelled) return;

        if (posRes.ok) {
          const match: MatchedPosition = await posRes.json();
          if (cancelled) return;
          setMatchedPosition(match);
          // Fetch compensation events + work logs in parallel
          const [ceRes, wlRes, ihRes] = await Promise.all([
            fetch(`/api/compensation?positionId=${match.id}`),
            fetch(`/api/work-logs?positionId=${match.id}&accomplishments=true`),
            fetch(`/api/income-history?employer=${encodeURIComponent(match.company)}`),
          ]);
          if (cancelled) return;
          if (ceRes.ok) setCompEvents(await ceRes.json());
          if (wlRes.ok) setWorkLogs(await wlRes.json());
          if (ihRes.ok) { const ih = await ihRes.json(); if (ih.yearCount > 0) setIncomeHistory(ih); }
        }
        // No match = no enrichment. WorkHistory's own detail sections will render below.
      } catch { /* silent */ } finally { if (!cancelled) setEnrichLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [focusedId, focusedItem]);

  useEffect(() => {
    if (!focusedItem || focusTab !== "overview") return;
    setShowInfoLabel(true);
    const timer = setTimeout(() => setShowInfoLabel(false), 2200);
    return () => clearTimeout(timer);
  }, [focusedItem?.id, focusTab]);

  useEffect(() => {
    if (!showFocusInfo || isFocusInfoHovered) {
      if (focusInfoAutoCloseTimerRef.current) {
        clearTimeout(focusInfoAutoCloseTimerRef.current);
        focusInfoAutoCloseTimerRef.current = null;
      }
      return;
    }

    focusInfoAutoCloseTimerRef.current = setTimeout(() => {
      setShowFocusInfo(false);
      focusInfoAutoCloseTimerRef.current = null;
    }, 3200);

    return () => {
      if (focusInfoAutoCloseTimerRef.current) {
        clearTimeout(focusInfoAutoCloseTimerRef.current);
        focusInfoAutoCloseTimerRef.current = null;
      }
    };
  }, [showFocusInfo, isFocusInfoHovered]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ── Detail field editing ──
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailSavedField, setDetailSavedField] = useState<string | null>(null);

  // ── Cover image upload ──
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  async function handleCoverImageUpload(file: File) {
    if (!focusedItem) return;
    setCoverUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const MAX = 900;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.82));
          };
          img.onerror = reject;
          img.src = reader.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/work-history/${focusedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: dataUrl }),
      });
      if (!res.ok) throw new Error();
      onAdded();
    } catch { toast.error("Failed to save cover image"); }
    finally { setCoverUploading(false); }
  }

  async function handleCoverImageRemove() {
    if (!focusedItem) return;
    setCoverUploading(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: null }),
      });
      if (!res.ok) throw new Error();
      onAdded();
    } catch { toast.error("Failed to remove cover image"); }
    finally { setCoverUploading(false); }
  }

  // ── Cover image repositioning ──
  const [repositioning, setRepositioning] = useState(false);
  const [coverYDraft, setCoverYDraft] = useState<number>(50);
  const repoStartRef = useRef<{ mouseY: number; startY: number; h: number } | null>(null);
  const bannerContainerRef = useRef<HTMLDivElement | null>(null);
  const coverImgRef = useRef<HTMLImageElement | null>(null);

  async function saveReposition() {
    if (!focusedItem) return;
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageY: coverYDraft }),
      });
      if (!res.ok) throw new Error();
      onAdded();
    } catch { toast.error("Failed to save position"); }
    setRepositioning(false);
  }

  function cancelReposition() { setRepositioning(false); }

  // ── Uniform ──
  const [uniformDraft, setUniformDraft] = useState<UniformData | null>(null);
  const [uniformSaving, setUniformSaving] = useState(false);
  const [uniformMapOpen, setUniformMapOpen] = useState(false);

  function openUniformEditor() {
    if (!focusedItem) return;
    let parsed: UniformData = { enabled: true, zones: {} };
    if (focusedItem.uniformData) {
      try { parsed = JSON.parse(focusedItem.uniformData); } catch { /* ignore */ }
    }
    setUniformDraft(parsed);
    toggleSection("uniform");
  }

  async function saveUniform() {
    if (!focusedItem || !uniformDraft) return;
    setUniformSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniformData: JSON.stringify(uniformDraft) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Uniform saved");
      onAdded();
    } catch { toast.error("Failed to save uniform"); }
    finally { setUniformSaving(false); }
  }

  async function clearUniform() {
    if (!focusedItem) return;
    try {
      await fetch(`/api/work-history/${focusedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniformData: null }),
      });
      onAdded();
    } catch { toast.error("Failed to remove uniform"); }
  }

  async function saveDetail(fields: Record<string, unknown>) {
    if (!focusedItem) return;
    const fieldKey = Object.keys(fields)[0] ?? null;
    setDetailSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
      onAdded(); // refresh data
      // Flash checkmark on the saved field
      if (fieldKey) { setDetailSavedField(fieldKey); setTimeout(() => setDetailSavedField(null), 1500); }
    } catch { toast.error("Failed to save"); }
    finally { setDetailSaving(false); }
  }

  // ── Feature A: Pin-drop sub-location ──
  const [pinDropLabel, setPinDropLabel] = useState("");
  const [pinDropType, setPinDropType] = useState("daily-workplace");
  const [pinDropCustomType, setPinDropCustomType] = useState("");
  const [pinDropSaving, setPinDropSaving] = useState(false);
  const [pinDropReversed, setPinDropReversed] = useState<string>("");

  // Reverse geocode when pinDropCoords arrive (or fetch Place Details if placeId provided)
  useEffect(() => {
    if (!pinDropCoords) { setPinDropReversed(""); setPinDropLabel(""); return; }
    (async () => {
      if (pinDropCoords.placeId) {
        // POI was clicked — fetch details from our API
        try {
          const res = await fetch("/api/nearby-buildings", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId: pinDropCoords.placeId }),
          });
          if (res.ok) {
            const d = await res.json();
            setPinDropReversed(d.address || `${pinDropCoords.lat.toFixed(5)}, ${pinDropCoords.lng.toFixed(5)}`);
            setPinDropLabel(d.name || "");
            return;
          }
        } catch { /* fall through to geocode */ }
      }
      // Reverse geocode via server-side API
      try {
        const res = await fetch(`/api/reverse-geocode?lat=${pinDropCoords.lat}&lng=${pinDropCoords.lng}`);
        if (res.ok) {
          const data = await res.json();
          setPinDropReversed(data.address ?? `${pinDropCoords.lat.toFixed(5)}, ${pinDropCoords.lng.toFixed(5)}`);
        }
      } catch {
        setPinDropReversed(`${pinDropCoords.lat.toFixed(5)}, ${pinDropCoords.lng.toFixed(5)}`);
      }
    })();
  }, [pinDropCoords]);

  async function handlePinDropSave() {
    if (!focusedItem || !pinDropCoords || !pinDropLabel.trim()) return;
    setPinDropSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: pinDropLabel.trim(), type: pinDropType === "custom" ? pinDropCustomType.trim() : pinDropType, address: pinDropReversed, lat: pinDropCoords.lat, lng: pinDropCoords.lng, placeId: pinDropCoords.placeId ?? null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Sub-location added");
      setPinDropLabel(""); setPinDropType("daily-workplace"); setPinDropCustomType(""); onClearPinDrop();
      onAdded();
    } catch { toast.error("Failed to add sub-location"); } finally { setPinDropSaving(false); }
  }

  // ── Nearby Buildings Discovery ──
  interface NearbyBuilding { placeId: string; name: string; address: string; lat: number; lng: number; types: string[] }
  const [nearbyBuildings, setNearbyBuildings] = useState<NearbyBuilding[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbySearched, setNearbySearched] = useState(false);
  const [claimingPlaceId, setClaimingPlaceId] = useState<string | null>(null);

  async function searchNearbyBuildings() {
    if (!focusedItem) return;
    setNearbyLoading(true);
    setNearbySearched(true);
    try {
      const existingPlaceIds = new Set((focusedItem.locations ?? []).map((l) => l.placeId).filter(Boolean));
      const res = await fetch(`/api/nearby-buildings?query=${encodeURIComponent(focusedItem.company)}&lat=${focusedItem.lat}&lng=${focusedItem.lng}&radius=2000`);
      if (res.ok) {
        const data = await res.json();
        // Filter out buildings already added as sub-locations
        setNearbyBuildings((data.buildings ?? []).filter((b: NearbyBuilding) => !existingPlaceIds.has(b.placeId)));
      }
    } catch { toast.error("Failed to search nearby buildings"); }
    finally { setNearbyLoading(false); }
  }

  async function claimBuilding(building: NearbyBuilding) {
    if (!focusedItem) return;
    setClaimingPlaceId(building.placeId);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: building.name,
          type: "satellite",
          address: building.address,
          lat: building.lat,
          lng: building.lng,
          placeId: building.placeId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Added ${building.name}`);
      setNearbyBuildings((prev) => prev.filter((b) => b.placeId !== building.placeId));
      onAdded();
    } catch { toast.error("Failed to claim building"); }
    finally { setClaimingPlaceId(null); }
  }

  // Reset nearby search when focused item changes
  useEffect(() => {
    setNearbyBuildings([]);
    setNearbySearched(false);
  }, [focusedItem?.id]);

  // ── Feature B: Commute route from life anchors ──
  interface LifeAnchorItem { id: string; label: string; lat: number; lng: number; icon: string }
  const [lifeAnchors, setLifeAnchors] = useState<LifeAnchorItem[]>([]);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [commuteResult, setCommuteResult] = useState<{ durationMin: number; distanceMi: number; mode: string } | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteMode, setCommuteMode] = useState<"driving" | "transit" | "walking" | "bicycling">("driving");

  // Fetch life anchors once when focus mode opens
  useEffect(() => {
    if (!focusedItem) return;
    (async () => {
      try {
        const res = await fetch("/api/life-anchors");
        if (res.ok) setLifeAnchors(await res.json());
      } catch { /* silent */ }
    })();
  }, [focusedItem]);

  async function computeCommute(anchorId: string, modeOverride?: "driving" | "transit" | "walking" | "bicycling") {
    if (!focusedItem) return;
    const anchor = lifeAnchors.find((a) => a.id === anchorId);
    if (!anchor) return;
    const mode = modeOverride ?? commuteMode;
    setSelectedAnchorId(anchorId);
    setCommuteLoading(true);
    setCommuteResult(null);
    try {
      const res = await fetch(`/api/commute?fromLat=${anchor.lat}&fromLng=${anchor.lng}&toLat=${focusedItem.lat}&toLng=${focusedItem.lng}&mode=${mode}`);
      if (res.ok) setCommuteResult(await res.json());
    } catch { /* silent */ } finally { setCommuteLoading(false); }
  }

  // ── Feature D: Notes ──
  interface WHNote { id: string; content: string; imageUrl: string | null; createdAt: string }
  const [notes, setNotes] = useState<WHNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    if (!focusedItem) return;
    let cancelled = false;
    (async () => {
      setNotesLoading(true);
      try {
        const res = await fetch(`/api/work-history/${focusedItem.id}/notes`);
        if (res.ok && !cancelled) setNotes(await res.json());
      } catch { /* silent */ } finally { if (!cancelled) setNotesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [focusedItem]);

  async function handleAddNote() {
    if (!focusedItem || !newNote.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) { const note = await res.json(); setNotes((prev) => [note, ...prev]); setNewNote(""); toast.success("Note added"); }
    } catch { toast.error("Failed to add note"); } finally { setNoteSaving(false); }
  }

  async function handleDeleteNote(noteId: string) {
    if (!focusedItem) return;
    try {
      await fetch(`/api/work-history/${focusedItem.id}/notes`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId }) });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch { toast.error("Failed to delete note"); }
  }

  // ── Feature E: Milestones ──
  interface WHMilestone { id: string; title: string; description: string | null; type: string; date: string }
  const [milestones, setMilestones] = useState<WHMilestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [newMsTitle, setNewMsTitle] = useState("");
  const [newMsType, setNewMsType] = useState("achievement");
  const [newMsDate, setNewMsDate] = useState("");
  const [msSaving, setMsSaving] = useState(false);

  useEffect(() => {
    if (!focusedItem) return;
    let cancelled = false;
    (async () => {
      setMilestonesLoading(true);
      try {
        const res = await fetch(`/api/work-history/${focusedItem.id}/milestones`);
        if (res.ok && !cancelled) setMilestones(await res.json());
      } catch { /* silent */ } finally { if (!cancelled) setMilestonesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [focusedItem]);

  async function handleAddMilestone() {
    if (!focusedItem || !newMsTitle.trim() || !newMsDate) return;
    setMsSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/milestones`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newMsTitle.trim(), type: newMsType, date: newMsDate }),
      });
      if (res.ok) {
        const ms = await res.json();
        setMilestones((prev) => [...prev, ms].sort((a, b) => a.date.localeCompare(b.date)));
        setNewMsTitle(""); setNewMsType("achievement"); setNewMsDate(""); toast.success("Milestone added");
      }
    } catch { toast.error("Failed to add milestone"); } finally { setMsSaving(false); }
  }

  async function handleDeleteMilestone(milestoneId: string) {
    if (!focusedItem) return;
    try {
      await fetch(`/api/work-history/${focusedItem.id}/milestones`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ milestoneId }) });
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
    } catch { toast.error("Failed to delete milestone"); }
  }

  const MILESTONE_TYPES = [
    { value: "promotion", label: "Promotion", icon: "🚀" },
    { value: "project", label: "Project", icon: "📦" },
    { value: "certification", label: "Certification", icon: "📜" },
    { value: "award", label: "Award", icon: "🏆" },
    { value: "achievement", label: "Achievement", icon: "⭐" },
    { value: "other", label: "Other", icon: "📌" },
  ] as const;

  // ── Sub-location edit / delete ──
  const [expandedLocId, setExpandedLocId] = useState<string | null>(null);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editLocLabel, setEditLocLabel] = useState("");
  const [editLocType, setEditLocType] = useState("daily-workplace");
  const [editCustomLocType, setEditCustomLocType] = useState("");
  const [editLocStartDate, setEditLocStartDate] = useState("");
  const [editLocEndDate, setEditLocEndDate] = useState("");
  const [editLocSaving, setEditLocSaving] = useState(false);
  const [deletingLocId, setDeletingLocId] = useState<string | null>(null);

  function startEditLoc(loc: { id: string; label: string; type: string; startDate?: string | null; endDate?: string | null }) {
    setEditingLocId(loc.id);
    setEditLocLabel(loc.label);
    const isPreset = LOC_TYPES.some((t) => t.value === loc.type && t.value !== "custom");
    setEditLocType(isPreset ? loc.type : "custom");
    setEditCustomLocType(isPreset ? "" : loc.type);
    setEditLocStartDate(loc.startDate ?? "");
    setEditLocEndDate(loc.endDate ?? "");
  }

  async function handleSaveEditLoc(locId: string) {
    if (!focusedItem || !editLocLabel.trim()) return;
    setEditLocSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/locations/${locId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLocLabel.trim(), type: editLocType === "custom" ? editCustomLocType.trim() : editLocType, startDate: editLocStartDate || null, endDate: editLocEndDate || null }),
      });
      if (res.ok) { setEditingLocId(null); onAdded(); toast.success("Location updated"); }
      else toast.error("Failed to update location");
    } catch { toast.error("Failed to update location"); }
    finally { setEditLocSaving(false); }
  }

  async function handleDeleteLoc(locId: string) {
    if (!focusedItem) return;
    setDeletingLocId(locId);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/locations/${locId}`, { method: "DELETE" });
      if (res.ok) { onAdded(); toast.success("Location removed"); }
      else toast.error("Failed to delete location");
    } catch { toast.error("Failed to delete location"); }
    finally { setDeletingLocId(null); }
  }

  // ── Feature F: Skills per sub-location ──
  const [editingSkillsLocId, setEditingSkillsLocId] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");

  async function handleAddSkill(locId: string, existingSkills: string[]) {
    if (!focusedItem || !skillInput.trim()) return;
    const updated = [...existingSkills, skillInput.trim()];
    try {
      await fetch(`/api/work-history/${focusedItem.id}/locations/${locId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: updated }),
      });
      setSkillInput("");
      onAdded();
    } catch { toast.error("Failed to update skills"); }
  }

  async function handleRemoveSkill(locId: string, existingSkills: string[], skillToRemove: string) {
    if (!focusedItem) return;
    const updated = existingSkills.filter((s) => s !== skillToRemove);
    try {
      await fetch(`/api/work-history/${focusedItem.id}/locations/${locId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: updated }),
      });
      onAdded();
    } catch { toast.error("Failed to update skills"); }
  }

  // ── Feature G: Workplace Rating ──
  interface WRating { culture: number; growth: number; compensation: number; workLifeBalance: number; management: number; overall: number; notes: string | null }
  const [rating, setRating] = useState<WRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingDraft, setRatingDraft] = useState<WRating>({ culture: 0, growth: 0, compensation: 0, workLifeBalance: 0, management: 0, overall: 0, notes: null });
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingEditing, setRatingEditing] = useState(false);

  useEffect(() => {
    if (!focusedItem) return;
    let cancelled = false;
    (async () => {
      setRatingLoading(true);
      try {
        const res = await fetch(`/api/work-history/${focusedItem.id}/rating`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data) { setRating(data); setRatingDraft(data); }
          else { setRating(null); setRatingDraft({ culture: 0, growth: 0, compensation: 0, workLifeBalance: 0, management: 0, overall: 0, notes: null }); }
        }
      } catch { /* silent */ } finally { if (!cancelled) setRatingLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [focusedItem]);

  async function handleSaveRating() {
    if (!focusedItem) return;
    setRatingSaving(true);
    try {
      const res = await fetch(`/api/work-history/${focusedItem.id}/rating`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ratingDraft),
      });
      if (res.ok) { setRating(await res.json()); setRatingEditing(false); toast.success("Rating saved"); }
    } catch { toast.error("Failed to save rating"); } finally { setRatingSaving(false); }
  }

  function StarRatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)} className={`text-sm transition-colors ${n <= value ? "text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`}>
            ★
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
    {/* ── Uniform Map Popup ── */}
    {uniformMapOpen && focusedItem?.uniformData && (() => {
      let ud: UniformData | null = null;
      try { ud = JSON.parse(focusedItem.uniformData); } catch { /* ignore */ }
      return ud ? (
        <div className="absolute top-3 z-[1200] pointer-events-auto" style={{ left: "calc(12px + 384px + 12px)" }}>
          <UniformMapPopup
            data={ud}
            companyName={focusedItem.company}
            onClose={() => setUniformMapOpen(false)}
          />
        </div>
      ) : null;
    })()} 
    {/* ── Main Card (with bio card stacked above) ── */}
    <div className="absolute top-3 left-3 z-[1100] flex flex-col gap-2 pointer-events-none max-h-[calc(100vh-24px)]">
      <div className="pointer-events-auto">
        <BioCardEditor />
      </div>
      <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-96 max-h-[60vh] overflow-y-auto scrollbar-thin pointer-events-auto">

      {/* ── Focused Detail View ── */}
      {focusedItem ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button type="button" className="text-muted-foreground hover:text-foreground shrink-0" onClick={onExitFocus} title="Back to all">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold truncate">{focusedItem.company}</span>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {focusTab === "overview" && (
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-all ${showFocusInfo ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300" : "bg-muted/60 text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setShowFocusInfo((p) => !p)}
                  title="Quick info"
                >
                  <Info className="h-3 w-3" />
                  {showInfoLabel && <span className="whitespace-nowrap">Quick info</span>}
                </button>
              )}
              {(focusedItem.locations ?? []).length > 0 && (
                <button type="button" className={`p-1 rounded transition-colors relative ${showLocationsPopover ? "text-blue-500 bg-blue-500/10" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setShowLocationsPopover((p) => !p)} title={`Locations (${focusedItem.locations.length})`}>
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-blue-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">{focusedItem.locations.length}</span>
                </button>
              )}
              {focusedItem.uniformData && (() => {
                let ud: UniformData | null = null;
                try { ud = JSON.parse(focusedItem.uniformData); } catch { /* ignore */ }
                return ud ? (
                  <button type="button"
                    className={`p-1 rounded transition-colors ${uniformMapOpen ? "text-orange-500 bg-orange-500/10" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setUniformMapOpen(p => !p)} title="View Uniform">
                    <PersonStanding className="h-3.5 w-3.5" />
                  </button>
                ) : null;
              })()}
              <button type="button" className={`p-1 rounded transition-colors ${focusTab === "edit" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setFocusTab(focusTab === "edit" ? "overview" : "edit")} title={focusTab === "edit" ? "Back to overview" : "Edit"}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="p-1 text-muted-foreground hover:text-foreground" onClick={onClose}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {focusTab === "overview" && showFocusInfo && (
            <div
              className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5 space-y-1"
              onMouseEnter={() => setIsFocusInfoHovered(true)}
              onMouseLeave={() => setIsFocusInfoHovered(false)}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">Quick info</p>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setShowFocusInfo(false)}
                >
                  Hide
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <div className="text-muted-foreground">Role</div>
                <div className="truncate">{focusedItem.title ?? "Not set"}</div>
                <div className="text-muted-foreground">Period</div>
                <div className="truncate">{focusedItem.startDate ?? "?"} – {focusedItem.endDate ?? "present"}</div>
                <div className="text-muted-foreground">Schedule</div>
                <div className="truncate">{focusedItem.schedule ?? focusedItem.shiftNotes ?? "Not set"}</div>
                <div className="text-muted-foreground">Locations</div>
                <div>{focusedItem.locations?.length ?? 0}</div>
              </div>

              <div className="pt-1 border-t border-cyan-500/20">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300 mb-0.5">
                  Concurrent jobs ({focusedConcurrentJobs.length})
                </p>
                {focusedConcurrentJobs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No overlapping jobs in this period.</p>
                ) : (
                  <div className="space-y-0.5">
                    {focusedConcurrentJobs.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-cyan-500/10"
                        onClick={() => {
                          const it = items.find((i) => i.id === c.id);
                          if (it) onFocusJob(it);
                        }}
                      >
                        <Briefcase className="h-3 w-3 text-cyan-500 shrink-0" />
                        <span className="text-xs font-medium truncate">{c.company}</span>
                        {c.title && <span className="text-[11px] text-muted-foreground truncate">· {c.title}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Company & Title + Employment Period + Key Facts */}
          {(() => {
            const isCurrent = !focusedItem.endDate;
            const isSchool = focusedItem.type === "school";
            const isInternship = focusedItem.type === "internship";
            const isSelfEmployed = focusedItem.type === "self-employed";
            const isUnemployed = focusedItem.type === "unemployed";
            let tenure = "";
            if (focusedItem.startDate) {
              const s = new Date(focusedItem.startDate + "-01");
              const e = focusedItem.endDate ? new Date(focusedItem.endDate + "-01") : new Date();
              const m = Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
              tenure = m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;
            }
            // Shorten address to city, state
            const shortAddr = (() => {
              const parts = focusedItem.address.split(",").map((p) => p.trim());
              if (parts.length >= 3) return `${parts[parts.length - 3]}, ${parts[parts.length - 2]}`;
              if (parts.length === 2) return parts.join(", ");
              return focusedItem.address;
            })();
            // Parse differentials
            const diffs: string[] = focusedItem.differentials ? focusedItem.differentials.split("\n").filter(Boolean) : [];
            const firstDiff = diffs.length > 0 ? diffs[0] : null;
            // Currency symbol
            const cSym = focusedItem.salaryCurrency === "USD" || !focusedItem.salaryCurrency ? "$" : focusedItem.salaryCurrency;
            // Format "YYYY-MM" → "Mon YYYY"
            const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const fmtDate = (d: string | null) => {
              if (!d) return null;
              const [y, m] = d.split("-");
              const mi = parseInt(m, 10) - 1;
              return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : d;
            };
            const startStr = fmtDate(focusedItem.startDate);
            const endStr = focusedItem.endDate ? fmtDate(focusedItem.endDate) : "Present";
            return (
              <div className="rounded-lg bg-muted/40 border overflow-hidden">
                {/* Cover Image Banner */}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCoverImageUpload(f);
                    e.target.value = "";
                  }}
                />
                {focusedItem.coverImage ? (
                  <div
                    ref={bannerContainerRef}
                    className={`relative group${repositioning ? " select-none" : ""}`}
                  >
                    <img
                      ref={coverImgRef}
                      src={focusedItem.coverImage}
                      alt="Cover"
                      className="w-full h-24 object-cover pointer-events-none"
                      style={{ objectPosition: `center ${repositioning ? coverYDraft : (focusedItem.coverImageY ?? 50)}%` }}
                      draggable={false}
                    />
                    {repositioning ? (
                      <div
                        className="absolute inset-0 bg-black/30 flex items-center justify-center gap-2 cursor-ns-resize touch-none"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          repoStartRef.current = {
                            mouseY: e.clientY,
                            startY: coverYDraft,
                            h: bannerContainerRef.current?.offsetHeight ?? 96,
                          };
                        }}
                        onPointerMove={(e) => {
                          if (!repoStartRef.current) return;
                          const delta = e.clientY - repoStartRef.current.mouseY;
                          const newY = Math.max(0, Math.min(100,
                            repoStartRef.current.startY + (delta / repoStartRef.current.h) * 100
                          ));
                          // Directly mutate DOM — no React re-render, so pointer capture is never lost
                          if (coverImgRef.current) {
                            coverImgRef.current.style.objectPosition = `center ${newY}%`;
                          }
                          repoStartRef.current.startY = newY;
                          repoStartRef.current.mouseY = e.clientY;
                        }}
                        onPointerUp={(e) => {
                          if (!repoStartRef.current) return;
                          const finalY = parseFloat(
                            coverImgRef.current?.style.objectPosition?.match(/([\d.]+)%/)?.[1] ?? String(coverYDraft)
                          );
                          setCoverYDraft(finalY);
                          repoStartRef.current = null;
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }}
                      >
                        <button
                          type="button"
                          className="bg-white/95 text-green-600 text-[11px] font-medium rounded px-2.5 py-1 shadow hover:bg-white cursor-pointer"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={saveReposition}
                        >Done</button>
                        <button
                          type="button"
                          className="bg-white/95 text-gray-600 text-[11px] rounded px-2.5 py-1 shadow hover:bg-white cursor-pointer"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={cancelReposition}
                        >Cancel</button>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          title="Reposition"
                          className="bg-white/90 text-gray-800 rounded-full p-1.5 hover:bg-white shadow"
                          onClick={() => { setCoverYDraft(focusedItem.coverImageY ?? 50); setRepositioning(true); }}
                        >
                          <Move className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Change cover photo"
                          className="bg-white/90 text-gray-800 rounded-full p-1.5 hover:bg-white shadow"
                          onClick={() => coverInputRef.current?.click()}
                        >
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Remove cover photo"
                          className="bg-white/90 text-red-600 rounded-full p-1.5 hover:bg-white shadow"
                          onClick={handleCoverImageRemove}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {coverUploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full h-8 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border-b border-dashed border-border/50"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={coverUploading}
                  >
                    {coverUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-3 w-3" />
                        <span>Add cover photo</span>
                      </>
                    )}
                  </button>
                )}
                <div className="p-2.5 space-y-1.5">
                {/* Row 1 — Company + type badges + company size */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isSchool ? <GraduationCap className="h-3.5 w-3.5 text-violet-500 shrink-0" /> : isSelfEmployed ? <span className="text-xs shrink-0">🧑‍💻</span> : isUnemployed ? <Search className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <Briefcase className={`h-3.5 w-3.5 shrink-0 ${isInternship ? "text-cyan-600" : "text-gray-500"}`} />}
                  <span className="text-sm font-semibold">{focusedItem.company}</span>
                  {focusedItem.scheduleType && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">{focusedItem.scheduleType.replace("-", " ")}</span>}
                  {focusedItem.workMode && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">{focusedItem.workMode}{focusedItem.hybridDays != null ? ` ${focusedItem.hybridDays}d` : ""}</span>}
                  {isSchool && <span className="text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">School</span>}
                  {isInternship && <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">Internship</span>}
                  {isSelfEmployed && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">Self-Employed</span>}
                  {isUnemployed && <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">Unemployed</span>}
                  {(focusedItem.schedule || focusedItem.shiftNotes) && <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded shrink-0">{focusedItem.schedule ?? focusedItem.shiftNotes}</span>}
                  {matchedPosition?.industry && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded shrink-0">{matchedPosition.industry}</span>}
                  {focusedItem.companySize && <span className="ml-auto text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded capitalize shrink-0">{focusedItem.companySize.replace("-", " ")}</span>}
                </div>

                {/* Row 2 — Position / Degree */}
                {isSchool ? (
                  <div className="space-y-0.5">
                    {(focusedItem.degree || focusedItem.major) && (
                      <p className="text-xs text-muted-foreground">
                        {focusedItem.degree}{focusedItem.degree && focusedItem.major ? " in " : ""}{focusedItem.major}
                      </p>
                    )}
                    {focusedItem.gpa != null && <p className="text-[10px] text-muted-foreground">GPA: {focusedItem.gpa}</p>}
                  </div>
                ) : (
                  focusedItem.title && <p className="text-xs text-muted-foreground">{focusedItem.title}</p>
                )}

                {/* Row 3 — Address + Date range (merged) */}
                {!isUnemployed && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{shortAddr}</span>
                    {(focusedItem.startDate || focusedItem.endDate) && (
                      <>
                        <span className="shrink-0">·</span>
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        <span className="shrink-0">{startStr ?? "?"} – {endStr}</span>
                        {isCurrent && <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 rounded shrink-0">current</span>}
                        {tenure && <span className="text-muted-foreground/70 shrink-0">({tenure})</span>}
                      </>
                    )}
                  </div>
                )}

                {/* Row 4 — Work Environment accordion */}
                {(focusedItem.department || focusedItem.teamSize != null || focusedItem.managerName) && (() => {
                  const mgrAbbrev = (name: string) => {
                    const n = name.toLowerCase();
                    if (n.includes("supervisor") || n.includes("supv")) return "Supv.";
                    if (n.includes("director") || n.includes("dir")) return "Dir.";
                    if (n.includes("lead")) return "Lead";
                    if (n.includes("vp") || n.includes("vice president")) return "VP";
                    if (n.includes("chief")) return "Chief";
                    return "Mgr.";
                  };
                  const hasExpandedContent = focusedItem.rotatingSchedule || focusedItem.scheduleBHours != null || focusedItem.otHoursA != null || focusedItem.otHoursB != null || focusedItem.otRate != null;
                  return (
                    <div className="pt-1 border-t border-border/50">
                      <button type="button" className="w-full flex items-center gap-1.5" onClick={() => hasExpandedContent && toggleSection("work-env")}>
                        <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <div className="flex-1 flex items-center gap-1 flex-wrap text-xs">
                          {focusedItem.department && <span className="font-medium">{focusedItem.department}</span>}
                          {focusedItem.teamSize != null && <><span className="text-muted-foreground">·</span><span className="text-muted-foreground">Team of {focusedItem.teamSize}</span></>}
                          {focusedItem.managerName && <><span className="text-muted-foreground">·</span><span className="text-muted-foreground">{mgrAbbrev(focusedItem.managerName)} {focusedItem.managerName}</span></>}
                        </div>
                        {hasExpandedContent && (
                          expandedSections.has("work-env") ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                      </button>
                      {expandedSections.has("work-env") && hasExpandedContent && (
                        <div className="mt-1.5 ml-5 space-y-1 text-xs">
                          {focusedItem.rotatingSchedule && (
                            <div className="flex justify-between"><span className="text-muted-foreground">Rotating Schedule</span><span className="font-medium">Yes (A/B weeks)</span></div>
                          )}
                          {focusedItem.scheduleBHours != null && (
                            <div className="flex justify-between"><span className="text-muted-foreground">Schedule B Hours</span><span className="font-medium">{focusedItem.scheduleBHours}h/wk</span></div>
                          )}
                          {(focusedItem.otHoursA != null || focusedItem.otHoursB != null) && (
                            <div className="flex justify-between"><span className="text-muted-foreground">OT Hours{focusedItem.otHoursA != null && focusedItem.otHoursB != null ? " (A / B)" : ""}</span><span className="font-medium">{focusedItem.otHoursA != null ? `${focusedItem.otHoursA}h` : "—"}{focusedItem.otHoursB != null ? ` / ${focusedItem.otHoursB}h` : ""}</span></div>
                          )}
                          {focusedItem.otRate != null && focusedItem.otRate !== 1.5 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">OT Rate</span><span className="font-medium">{focusedItem.otRate}×</span></div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Row 5 — Compensation line (salary + differential + frequency + hours) */}
                {(focusedItem.salaryAmount != null || focusedItem.bonusAmount != null || focusedItem.hoursPerWeek != null) && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <div className="flex-1 flex items-baseline gap-1 flex-wrap text-xs">
                      {focusedItem.salaryAmount != null && (
                        <span className="font-semibold">
                          {cSym}{focusedItem.salaryAmount.toLocaleString()}{focusedItem.salaryType === "hourly" ? "/hr" : "/yr"}
                        </span>
                      )}
                      {firstDiff && <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">({firstDiff})</span>}
                      {diffs.length > 1 && <span className="text-[10px] text-muted-foreground">+{diffs.length - 1} more</span>}
                      {focusedItem.bonusAmount != null && (
                        <span className="text-muted-foreground">+ {cSym}{focusedItem.bonusAmount.toLocaleString()} bonus</span>
                      )}
                      {focusedItem.payFrequency && <span className="text-muted-foreground capitalize">· {focusedItem.payFrequency}</span>}
                      {focusedItem.hoursPerWeek != null && <span className="text-muted-foreground">· {focusedItem.hoursPerWeek}h/wk</span>}
                    </div>
                  </div>
                )}
                </div>{/* end p-2.5 space-y-1.5 */}
              </div>
            );
          })()}

          {/* ── Quick-access toolbar (horizontal icon strip) ── */}
          <div className="flex items-center gap-1 px-1">
            {([
              { key: "gallery" as const, icon: Images, label: "Gallery", color: "text-pink-500", activeColor: "bg-pink-500/10 text-pink-500" },
              { key: "attachments" as const, icon: Paperclip, label: "Attachments", color: "text-amber-500", activeColor: "bg-amber-500/10 text-amber-500" },
              { key: "skills" as const, icon: Brain, label: "Skills", color: "text-violet-500", activeColor: "bg-violet-500/10 text-violet-500" },
              { key: "equipment" as const, icon: Wrench, label: "Equipment", color: "text-cyan-500", activeColor: "bg-cyan-500/10 text-cyan-500" },
            ] as const).map(({ key, icon: Icon, label, activeColor }) => (
              <button
                key={key}
                type="button"
                title={label}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors ${sidePanel === key ? activeColor : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                onClick={() => setSidePanel(sidePanel === key ? null : key)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* ── Inline panel (expands below toolbar) ── */}
          {sidePanel && (
            <div className="relative rounded-lg border bg-muted/30 p-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
              {panelBusy && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {sidePanel === "gallery" && (() => {
                const galleryPhotos = matchedPosition?.galleryPhotos ?? [];
                const galleryAlbums = matchedPosition?.galleryAlbums ?? [];
                const locPhotos: { src: string; label: string; locId: string; photoUrl: string }[] = [];
                for (const loc of focusedItem.locations ?? []) {
                  if (loc.photos) {
                    try {
                      const photos: string[] = JSON.parse(loc.photos);
                      photos.forEach((p, i) => locPhotos.push({ src: p, label: `${loc.label} #${i + 1}`, locId: loc.id, photoUrl: p }));
                    } catch { /* skip */ }
                  }
                }
                const totalCount = galleryPhotos.length + locPhotos.length;

                const uploadPhoto = async (file: File, opts?: { albumName?: string; isCover?: boolean }) => {
                  if (!focusedItem) return false;
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("positionId", focusedItem.id);
                    if (opts?.albumName) fd.append("albumName", opts.albumName);
                    const setCover = opts?.isCover ?? (galleryPhotos.length === 0);
                    if (setCover) fd.append("isCover", "true");
                    const res = await fetch("/api/gallery", { method: "POST", body: fd });
                    if (res.ok) return true;
                    const data = await res.json().catch(() => ({}));
                    toast.error(`${file.name}: ${data?.error || "upload failed"}`);
                    return false;
                  } catch (e) {
                    toast.error(`${file.name}: ${String(e)}`);
                    return false;
                  }
                };

                /** Upload many files into a single (auto-created) album, with bounded concurrency
                 *  and live progress. Used by the "Upload album" button to ingest a phone-camera roll. */
                const uploadAlbum = async (files: File[], albumName: string) => {
                  if (!focusedItem || files.length === 0) return;
                  setPanelBusy(true);
                  const toastId = toast.loading(`Uploading 0/${files.length} to "${albumName}"…`);
                  let done = 0;
                  let failed = 0;
                  const CONCURRENCY = 3;
                  let i = 0;
                  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
                    while (i < files.length) {
                      const idx = i++;
                      const ok = await uploadPhoto(files[idx], { albumName, isCover: false });
                      if (ok) done++; else failed++;
                      toast.loading(`Uploading ${done + failed}/${files.length} to "${albumName}"…`, { id: toastId });
                    }
                  });
                  try {
                    await Promise.all(workers);
                    const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                    if (posRes.ok) setMatchedPosition(await posRes.json());
                    queryClient.invalidateQueries({ queryKey: ["work-history"] });
                    if (failed === 0) {
                      toast.success(`Uploaded ${done} photo${done === 1 ? "" : "s"} to "${albumName}"`, { id: toastId });
                    } else {
                      toast.warning(`Uploaded ${done} of ${files.length}; ${failed} failed`, { id: toastId });
                    }
                  } finally { setPanelBusy(false); }
                };

                const wrappedSinglePhoto = async (file: File) => {
                  setPanelBusy(true);
                  try {
                    const ok = await uploadPhoto(file);
                    if (ok) {
                      const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                      if (posRes.ok) setMatchedPosition(await posRes.json());
                      queryClient.invalidateQueries({ queryKey: ["work-history"] });
                      toast.success("Gallery photo uploaded");
                    }
                  } finally { setPanelBusy(false); }
                };

                const deleteLocPhoto = async (locId: string, photoUrl: string) => {
                  if (!focusedItem || !confirm("Remove this location photo?")) return;
                  setPanelBusy(true);
                  try {
                    await fetch(`/api/work-history/${focusedItem.id}/locations/${locId}/photos`, {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: photoUrl }),
                    });
                    const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                    if (posRes.ok) setMatchedPosition(await posRes.json());
                    queryClient.invalidateQueries({ queryKey: ["work-history"] });
                  } finally { setPanelBusy(false); }
                };



                const parseTags = (raw?: string | null): string[] => { if (!raw) return []; try { return JSON.parse(raw); } catch { return []; } };
                const parseMarkers = (raw?: string | null): unknown[] => { if (!raw) return []; try { return JSON.parse(raw); } catch { return []; } };
                const getAlbumCount = (albumId: string | null) => galleryPhotos.filter((p) => (p.albumId ?? null) === albumId).length;
                const getAlbumCover = (albumId: string | null) => galleryPhotos.find((p) => (p.albumId ?? null) === albumId) ?? null;

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Images className="h-3.5 w-3.5 text-pink-500" />
                      <span className="text-xs font-semibold">Gallery</span>
                      <div className="ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-0.5">
                        <button
                          type="button"
                          title="Photos view"
                          onClick={() => setPanelGalleryView("photos")}
                          className={`p-0.5 rounded ${panelGalleryView === "photos" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <LayoutGrid className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Albums view"
                          onClick={() => setPanelGalleryView("albums")}
                          className={`p-0.5 rounded ${panelGalleryView === "albums" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <FolderOpen className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{totalCount} photo{totalCount !== 1 ? "s" : ""}</span>
                      {galleryPhotos.length > 0 && (
                        <button type="button" className="p-0.5 rounded hover:bg-pink-500/10 text-pink-500 transition-colors" title="Expand gallery" onClick={() => setGalleryModalIdx(0)}>
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <label className="cursor-pointer p-0.5 rounded hover:bg-pink-500/10 text-pink-500 transition-colors" title="Add photo(s)">
                        <Plus className="h-3.5 w-3.5" />
                        <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                          const files = e.target.files;
                          if (!files?.length) return;
                          if (!confirmMediaUpload("gallery")) { e.target.value = ""; return; }
                          for (const file of Array.from(files)) {
                            await wrappedSinglePhoto(file);
                          }
                          e.target.value = "";
                        }} />
                      </label>
                      <label className="cursor-pointer p-0.5 rounded hover:bg-pink-500/10 text-pink-500 transition-colors" title="Upload entire album from your phone or computer">
                        <FolderPlus className="h-3.5 w-3.5" />
                        <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                          const files = e.target.files ? Array.from(e.target.files) : [];
                          e.target.value = "";
                          if (files.length === 0) return;
                          if (!confirmMediaUpload("gallery")) return;
                          const defaultName = `Album ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
                          const name = window.prompt(`Album name for these ${files.length} photo${files.length === 1 ? "" : "s"}:`, defaultName);
                          const trimmed = name?.trim();
                          if (!trimmed) return;
                          await uploadAlbum(files, trimmed.slice(0, 80));
                        }} />
                      </label>
                      {/* Desktop-only "pick a whole folder" — webkitdirectory is silently
                       *  ignored on iOS/Android, so this is a no-op there. We still keep the
                       *  multi-file picker above for those users. */}
                      <label className="cursor-pointer p-0.5 rounded hover:bg-pink-500/10 text-pink-500 transition-colors hidden md:inline-flex" title="Upload an entire folder (incl. OneDrive / Drive / Dropbox synced folders)">
                        <FolderOpen className="h-3.5 w-3.5" />
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          // Non-standard but supported in Chrome, Edge, Safari, Firefox desktop.
                          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                          onChange={async (e) => {
                            const all = e.target.files ? Array.from(e.target.files) : [];
                            e.target.value = "";
                            // Filter to images only (folders may contain anything).
                            const images = all.filter((f) => f.type.startsWith("image/"));
                            const skipped = all.length - images.length;
                            if (images.length === 0) {
                              if (all.length > 0) toast.error("No images found in that folder.");
                              return;
                            }
                            if (!confirmMediaUpload("gallery")) return;
                            // Derive a default album name from the folder path of the first file.
                            // webkitRelativePath is "FolderName/sub/file.jpg".
                            const firstRel = (images[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
                            const folderName = firstRel.split("/")[0] || "Folder";
                            const name = window.prompt(
                              `Album name for ${images.length} photo${images.length === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} non-image file${skipped === 1 ? "" : "s"} skipped)` : ""}:`,
                              folderName,
                            );
                            const trimmed = name?.trim();
                            if (!trimmed) return;
                            await uploadAlbum(images, trimmed.slice(0, 80));
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80">
                      Avoid uploading faces, serial numbers, proprietary screens, or customer-sensitive images.
                    </p>
                    {totalCount === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">No photos yet. Click + to add photos.</p>
                    ) : panelGalleryView === "photos" ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {galleryPhotos.map((p, i) => {
                          const tagCount = parseTags(p.tags).length;
                          const markerCount = parseMarkers(p.markers).length;
                          return (
                            <div key={p.id} className="group/photo relative rounded-md overflow-hidden aspect-square bg-muted cursor-pointer" onClick={() => setGalleryModalIdx(i)}>
                              <img src={p.filePath} alt={p.caption || p.fileName} className="w-full h-full object-cover" />
                              {p.isCover && (
                                <div className="absolute top-0.5 left-0.5">
                                  <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 drop-shadow" />
                                </div>
                              )}
                              {/* Tag/marker badges */}
                              {(tagCount > 0 || markerCount > 0) && (
                                <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                                  {tagCount > 0 && <span className="px-1 py-0.5 rounded-full bg-pink-500/80 text-white text-[8px] font-bold leading-none">{tagCount}</span>}
                                  {markerCount > 0 && <span className="px-1 py-0.5 rounded-full bg-blue-500/80 text-white text-[8px] font-bold leading-none">{markerCount}</span>}
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-0.5">
                                <span className="text-[9px] text-white truncate block">{p.caption || (p.isCover ? "Cover" : p.fileName)}</span>
                              </div>
                            </div>
                          );
                        })}
                        {locPhotos.map((p, i) => (
                          <div key={`loc-${i}`} className="group/photo relative rounded-md overflow-hidden aspect-square bg-muted">
                            <img src={p.src} alt={p.label} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-0.5">
                              <span className="text-[9px] text-white truncate block">{p.label}</span>
                            </div>
                            <div className="absolute top-0.5 right-0.5 opacity-0 group-hover/photo:opacity-100 transition-opacity">
                              <button type="button" className="p-0.5 rounded bg-black/40 hover:bg-red-500/40" title="Remove" onClick={() => deleteLocPhoto(p.locId, p.photoUrl)}>
                                <X className="h-2.5 w-2.5 text-white" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {[{ id: "__all", name: "All Photos", count: totalCount }, { id: "__unassigned", name: "Unassigned", count: getAlbumCount(null) }, ...galleryAlbums.map((a) => ({ id: a.id, name: a.name, count: getAlbumCount(a.id) }))].map((album) => {
                          const cover = album.id === "__all" ? (galleryPhotos[0]?.filePath ?? locPhotos[0]?.src ?? null) : album.id === "__unassigned" ? (getAlbumCover(null)?.filePath ?? null) : (getAlbumCover(album.id)?.filePath ?? null);
                          return (
                            <button
                              key={album.id}
                              type="button"
                              className="group relative rounded-md overflow-hidden bg-muted border border-border/60 hover:border-pink-500/40 text-left"
                              onClick={() => {
                                if (album.id === "__all") {
                                  if (galleryPhotos.length > 0) setGalleryModalIdx(0);
                                  return;
                                }
                                const idx = album.id === "__unassigned"
                                  ? galleryPhotos.findIndex((p) => !p.albumId)
                                  : galleryPhotos.findIndex((p) => p.albumId === album.id);
                                if (idx >= 0) setGalleryModalIdx(idx);
                              }}
                            >
                              <div className="aspect-video bg-muted/60">
                                {cover ? (
                                  <img src={cover} alt={album.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">No cover</div>
                                )}
                              </div>
                              <div className="p-1">
                                <p className="text-[10px] font-semibold truncate">{album.name}</p>
                                <p className="text-[9px] text-muted-foreground">{album.count} photo{album.count !== 1 ? "s" : ""}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {sidePanel === "attachments" && (() => {
                const atts = matchedPosition?.attachments ?? [];
                const catLabels: Record<string, string> = { "offer-letter": "Offer Letter", w2: "W-2", "pay-stub": "Pay Stub", contract: "Contract", cert: "Certificate", review: "Review", other: "Other" };
                const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
                const uploadAtt = async (file: File) => {
                  if (!focusedItem) return;
                  const label = prompt("Label for this file:", file.name.replace(/\.[^.]+$/, ""));
                  if (!label?.trim()) return;
                  const cat = prompt("Category (offer-letter, w2, pay-stub, contract, cert, review, other):", "other") || "other";
                  setPanelBusy(true);
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("positionId", focusedItem.id);
                    fd.append("label", label.trim());
                    fd.append("category", cat.trim());
                    const res = await fetch("/api/attachments", { method: "POST", body: fd });
                    if (res.ok) {
                      const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                      if (posRes.ok) setMatchedPosition(await posRes.json());
                      queryClient.invalidateQueries({ queryKey: ["work-history"] });
                    }
                  } finally { setPanelBusy(false); }
                };
                const deleteAtt = async (id: string) => {
                  if (!confirm("Delete this attachment?")) return;
                  setPanelBusy(true);
                  try {
                    const res = await fetch(`/api/attachments?id=${id}`, { method: "DELETE" });
                    if (res.ok && focusedItem) {
                      const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                      if (posRes.ok) setMatchedPosition(await posRes.json());
                      queryClient.invalidateQueries({ queryKey: ["work-history"] });
                    }
                  } finally { setPanelBusy(false); }
                };
                const editAtt = async (a: { id: string; label: string; category: string }) => {
                  if (!focusedItem) return;
                  const label = prompt("Label:", a.label);
                  if (label === null) return;
                  const category = prompt("Category (offer-letter, w2, pay-stub, contract, cert, review, other):", a.category) || a.category;
                  await fetch("/api/attachments", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: a.id, label: label.trim() || a.label, category: category.trim() }),
                  });
                  const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                  if (posRes.ok) setMatchedPosition(await posRes.json());
                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                };
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-semibold">Attachments</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{atts.length} file{atts.length !== 1 ? "s" : ""}</span>
                      <label className="cursor-pointer p-0.5 rounded hover:bg-amber-500/10 text-amber-500 transition-colors" title="Upload file">
                        <Plus className="h-3.5 w-3.5" />
                        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await uploadAtt(file);
                          e.target.value = "";
                        }} />
                      </label>
                    </div>
                    {atts.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">No attachments yet. Click + to upload offer letters, W-2s, pay stubs, and more.</p>
                    ) : (
                      <div className="space-y-1">
                        {atts.map((a) => (
                          <div key={a.id} className="group flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5">
                            <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium truncate">{a.label}</p>
                              <p className="text-[10px] text-muted-foreground">{catLabels[a.category] ?? a.category} · {fmtSize(a.fileSize)}</p>
                            </div>
                            <button type="button" className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" title="Edit" onClick={() => editAtt(a)}>
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <a href={a.filePath} target="_blank" rel="noopener noreferrer" download className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                              <Download className="h-3 w-3 text-muted-foreground" />
                            </a>
                            <button type="button" className="p-0.5 rounded hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete" onClick={() => deleteAtt(a.id)}>
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {sidePanel === "skills" && (() => {
                const used: string[] = focusedItem.skillsUsed ? (() => { try { return JSON.parse(focusedItem.skillsUsed); } catch { return []; } })() : [];
                const gained: string[] = focusedItem.skillsGained ? (() => { try { return JSON.parse(focusedItem.skillsGained); } catch { return []; } })() : [];
                const tech = matchedPosition?.techStack?.split(",").map((t: string) => t.trim()).filter(Boolean) ?? [];
                const hasContent = used.length > 0 || gained.length > 0 || tech.length > 0;

                const addSkill = async (field: "skillsUsed" | "skillsGained", current: string[]) => {
                  const name = prompt(field === "skillsUsed" ? "Skill used:" : "Skill gained:");
                  if (!name?.trim() || !focusedItem) return;
                  const updated = [...current, name.trim()];
                  await fetch(`/api/current-position/${focusedItem.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ [field]: JSON.stringify(updated) }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                  if (res.ok) setMatchedPosition(await res.json());
                };

                const removeSkill = async (field: "skillsUsed" | "skillsGained", current: string[], index: number) => {
                  const updated = current.filter((_, i) => i !== index);
                  await fetch(`/api/current-position/${focusedItem.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ [field]: JSON.stringify(updated) }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                  if (res.ok) setMatchedPosition(await res.json());
                };

                const addTech = async () => {
                  const name = prompt("Tech stack item:");
                  if (!name?.trim() || !focusedItem) return;
                  const updated = [...tech, name.trim()].join(", ");
                  await fetch(`/api/current-position/${focusedItem.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ techStack: updated }),
                  });
                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                  if (res.ok) setMatchedPosition(await res.json());
                };

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-semibold">Skills</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{used.length + gained.length + tech.length}</span>
                    </div>
                    {!hasContent ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">No skills logged yet. Use the buttons below to add.</p>
                    ) : null}
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tech Stack</span>
                          <button type="button" className="p-0.5 rounded hover:bg-cyan-500/10 text-cyan-500 transition-colors" title="Add tech" onClick={addTech}><Plus className="h-3 w-3" /></button>
                        </div>
                        {tech.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {tech.map((t: string, i: number) => (
                              <span key={i} className="group/pill px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[10px] inline-flex items-center gap-0.5">
                                {t}
                                <button type="button" className="opacity-0 group-hover/pill:opacity-100 transition-opacity" onClick={async () => {
                                  const newName = prompt("Edit tech:", t);
                                  if (newName === null) return;
                                  const updated = newName.trim() ? tech.map((x: string, j: number) => j === i ? newName.trim() : x) : tech.filter((_: string, j: number) => j !== i);
                                  await fetch(`/api/current-position/${focusedItem.id}`, {
                                    method: "PATCH", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ techStack: updated.join(", ") }),
                                  });
                                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                                  if (res.ok) setMatchedPosition(await res.json());
                                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                                }} title="Edit (clear to remove)"><Pencil className="h-2.5 w-2.5" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Skills Used</span>
                          <button type="button" className="p-0.5 rounded hover:bg-violet-500/10 text-violet-500 transition-colors" title="Add skill used" onClick={() => addSkill("skillsUsed", used)}><Plus className="h-3 w-3" /></button>
                        </div>
                        {used.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {used.map((s, i) => (
                              <span key={i} className="group px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] inline-flex items-center gap-0.5">
                                {s}
                                <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                                  const newName = prompt("Edit skill:", s);
                                  if (newName === null) return;
                                  const updated = newName.trim() ? used.map((x, j) => j === i ? newName.trim() : x) : used.filter((_, j) => j !== i);
                                  await fetch(`/api/current-position/${focusedItem.id}`, {
                                    method: "PATCH", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ skillsUsed: JSON.stringify(updated) }),
                                  });
                                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                                  if (res.ok) setMatchedPosition(await res.json());
                                }} title="Edit (clear to remove)"><Pencil className="h-2.5 w-2.5" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Skills Gained</span>
                          <button type="button" className="p-0.5 rounded hover:bg-emerald-500/10 text-emerald-500 transition-colors" title="Add skill gained" onClick={() => addSkill("skillsGained", gained)}><Plus className="h-3 w-3" /></button>
                        </div>
                        {gained.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {gained.map((s, i) => (
                              <span key={i} className="group px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] inline-flex items-center gap-0.5">
                                {s}
                                <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                                  const newName = prompt("Edit skill:", s);
                                  if (newName === null) return;
                                  const updated = newName.trim() ? gained.map((x, j) => j === i ? newName.trim() : x) : gained.filter((_, j) => j !== i);
                                  await fetch(`/api/current-position/${focusedItem.id}`, {
                                    method: "PATCH", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ skillsGained: JSON.stringify(updated) }),
                                  });
                                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                                  if (res.ok) setMatchedPosition(await res.json());
                                }} title="Edit (clear to remove)"><Pencil className="h-2.5 w-2.5" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {sidePanel === "equipment" && (() => {
                const allEquip = matchedPosition?.equipment ?? [];
                const used = allEquip.filter(e => e.usage !== "worked-on");
                const workedOn = allEquip.filter(e => e.usage === "worked-on");

                const addEquipment = async (usage: "used" | "worked-on") => {
                  const name = prompt(usage === "used" ? "Equipment/tool name (assigned to you):" : "Equipment/tool name (you worked on):");
                  if (!name?.trim() || !focusedItem) return;
                  await fetch("/api/equipment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ positionId: focusedItem.id, name: name.trim(), usage }),
                  });
                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                  if (res.ok) setMatchedPosition(await res.json());
                };

                const uploadEquipmentPhoto = async (equipmentId: string, file: File, isFirst: boolean) => {
                  await handleEquipmentPhotoUpload(equipmentId, file, isFirst);
                };

                const deleteEquipmentPhoto = async (photoId: string) => {
                  await handleEquipmentPhotoDelete(photoId);
                };

                const setEquipmentCover = async (photoId: string) => {
                  await handleEquipmentPhotoSetCover(photoId);
                };

                const editEquipmentPhotoCaption = async (photo: { id: string; caption?: string | null }) => {
                  await handleEquipmentPhotoCaption(photo.id, photo.caption);
                };

                const deleteEquip = async (id: string) => {
                  if (!focusedItem || !confirm("Delete this equipment?")) return;
                  setPanelBusy(true);
                  try {
                    const res = await fetch(`/api/equipment?id=${id}`, { method: "DELETE" });
                    if (res.ok) {
                      const posRes = await fetch(`/api/current-position/${focusedItem.id}`);
                      if (posRes.ok) setMatchedPosition(await posRes.json());
                      queryClient.invalidateQueries({ queryKey: ["work-history"] });
                    }
                  } finally { setPanelBusy(false); }
                };

                const editEquip = async (e: { id: string; name: string; category: string; condition: string; manufacturer?: string | null; model?: string | null; notes?: string | null }) => {
                  if (!focusedItem) return;
                  const name = prompt("Name:", e.name);
                  if (name === null) return;
                  const category = prompt("Category (hardware, software, vehicle, tool, other):", e.category) || e.category;
                  const manufacturer = prompt("Manufacturer:", e.manufacturer ?? "") ?? "";
                  const model = prompt("Model:", e.model ?? "") ?? "";
                  const condition = prompt("Condition (good, fair, poor):", e.condition) || e.condition;
                  const notes = prompt("Notes:", e.notes ?? "") ?? "";
                  await fetch("/api/equipment", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: e.id, name: name.trim() || e.name, category, manufacturer, model, condition, notes }),
                  });
                  const res = await fetch(`/api/current-position/${focusedItem.id}`);
                  if (res.ok) setMatchedPosition(await res.json());
                  queryClient.invalidateQueries({ queryKey: ["work-history"] });
                };

                const EquipCard = ({ e }: { e: { id: string; name: string; category: string; usage: string; manufacturer?: string | null; model?: string | null; condition: string; notes?: string | null; photos?: { id: string; filePath: string; caption?: string | null; isCover: boolean }[] } }) => (
                  <div className="group rounded-md border p-1.5 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{e.name}</span>
                      <div className="flex items-center gap-0.5">
                        <span className={`px-1 py-0.5 rounded text-[9px] ${e.condition === "good" ? "bg-emerald-500/10 text-emerald-600" : e.condition === "fair" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600"}`}>
                          {e.condition}
                        </span>
                        <button type="button" className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity" title="Edit" onClick={() => editEquip(e)}>
                          <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                        </button>
                        <button type="button" className="p-0.5 rounded hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete" onClick={() => deleteEquip(e.id)}>
                          <Trash2 className="h-2.5 w-2.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                    <div className="text-muted-foreground">
                      {e.category}{e.manufacturer ? ` · ${e.manufacturer}` : ""}{e.model ? ` ${e.model}` : ""}
                    </div>
                    {e.notes && <div className="text-muted-foreground italic">{e.notes}</div>}
                    <div className="pt-1">
                      <div className="flex items-center gap-1 mb-1">
                        <Camera className="h-3 w-3 text-cyan-500" />
                        <span className="text-[10px] text-muted-foreground">Photos {(e.photos?.length ?? 0)}/3</span>
                        {(e.photos?.length ?? 0) < 3 && (
                          <label className="ml-auto cursor-pointer p-0.5 rounded hover:bg-cyan-500/10 text-cyan-500" title="Add photo">
                            <Plus className="h-3 w-3" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (ev) => {
                                const file = ev.target.files?.[0];
                                if (!file) return;
                                await uploadEquipmentPhoto(e.id, file, (e.photos?.length ?? 0) === 0);
                                ev.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {(e.photos?.length ?? 0) > 0 ? (
                        <div className="grid grid-cols-3 gap-1">
                          {e.photos!.map((p) => (
                            <button key={p.id} type="button" className="group/p relative aspect-square rounded overflow-hidden bg-muted" onClick={() => setEquipmentPhotoViewer({ equipmentId: e.id, index: e.photos!.findIndex((photo) => photo.id === p.id) })}>
                              <img src={p.filePath} alt={p.caption ?? e.name} className="w-full h-full object-cover" />
                              {p.isCover && <Star className="absolute top-0.5 left-0.5 h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />}
                              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-0.5 py-0.5 text-[8px] text-white truncate">
                                {p.caption || "photo"}
                              </div>
                              <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover/p:opacity-100 transition-opacity">
                                <button type="button" className="p-0.5 rounded bg-black/50 hover:bg-yellow-500/30" title="Set cover" onClick={(ev) => { ev.stopPropagation(); setEquipmentCover(p.id); }}>
                                  <Star className="h-2 w-2 text-yellow-300" />
                                </button>
                                <button type="button" className="p-0.5 rounded bg-black/50 hover:bg-blue-500/30" title="Edit caption" onClick={(ev) => { ev.stopPropagation(); editEquipmentPhotoCaption(p); }}>
                                  <Pencil className="h-2 w-2 text-blue-300" />
                                </button>
                                <button type="button" className="p-0.5 rounded bg-black/50 hover:bg-red-500/30" title="Delete photo" onClick={(ev) => { ev.stopPropagation(); deleteEquipmentPhoto(p.id); }}>
                                  <Trash2 className="h-2 w-2 text-red-300" />
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">No photos added yet.</p>
                      )}
                      <p className="pt-1 text-[10px] text-muted-foreground/80">
                        Keep equipment visuals clean of faces, serial numbers, customer info, and proprietary displays.
                      </p>
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-3">
                    {/* Assigned / Used */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-cyan-500" />
                        <span className="text-xs font-semibold">Assigned to Me</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{used.length}</span>
                        <button type="button" className="p-0.5 rounded hover:bg-cyan-500/10 text-cyan-500 transition-colors" title="Add equipment you used" onClick={() => addEquipment("used")}><Plus className="h-3 w-3" /></button>
                      </div>
                      {used.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-2">No tools assigned. Click + to add.</p>
                      ) : (
                        <div className="space-y-1">
                          {used.map(e => <EquipCard key={e.id} e={e} />)}
                        </div>
                      )}
                    </div>

                    <div className="border-t" />

                    {/* Worked On / Maintained */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Settings className="h-3.5 w-3.5 text-orange-500" />
                        <span className="text-xs font-semibold">Worked On</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{workedOn.length}</span>
                        <button type="button" className="p-0.5 rounded hover:bg-orange-500/10 text-orange-500 transition-colors" title="Add equipment you worked on" onClick={() => addEquipment("worked-on")}><Plus className="h-3 w-3" /></button>
                      </div>
                      {workedOn.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-2">No equipment logged. Click + to add.</p>
                      ) : (
                        <div className="space-y-1">
                          {workedOn.map(e => <EquipCard key={e.id} e={e} />)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Gallery pop-out modal – rendered outside sidePanel so it persists across tab switches */}
          {galleryModalIdx !== null && (matchedPosition?.galleryPhotos ?? []).length > 0 && (
            <GalleryModal
              photos={(matchedPosition?.galleryPhotos ?? []) as GalleryPhotoType[]}
              albums={matchedPosition?.galleryAlbums ?? []}
              initialIndex={galleryModalIdx}
              positionId={focusedItem.id}
              container={mapContainer}
              onClose={() => setGalleryModalIdx(null)}
              onRefresh={refreshGallery}
            />
          )}

          <Dialog open={!!equipmentPhotoViewer} onOpenChange={(open) => { if (!open) setEquipmentPhotoViewer(null); }}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
              {equipmentViewerEquipment && equipmentViewerPhoto ? (
                <>
                  <DialogHeader className="px-4 py-3 border-b">
                    <DialogTitle className="flex items-center gap-2 text-sm">
                      <Camera className="h-4 w-4 text-cyan-500" />
                      {equipmentViewerEquipment.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {equipmentViewerIndex + 1} / {equipmentViewerPhotos.length} photo{equipmentViewerPhotos.length !== 1 ? "s" : ""}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="relative flex-1 min-h-0 bg-black/80 flex items-center justify-center">
                    {equipmentViewerPhotos.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                          onClick={() => setEquipmentPhotoViewer((prev) => prev ? { ...prev, index: prev.index > 0 ? prev.index - 1 : equipmentViewerPhotos.length - 1 } : prev)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                          onClick={() => setEquipmentPhotoViewer((prev) => prev ? { ...prev, index: prev.index < equipmentViewerPhotos.length - 1 ? prev.index + 1 : 0 } : prev)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <img src={equipmentViewerPhoto.filePath} alt={equipmentViewerPhoto.caption ?? equipmentViewerEquipment.name} className="max-w-full max-h-[60vh] object-contain" />
                    {equipmentViewerPhoto.isCover && (
                      <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-yellow-500/90 text-black text-[10px] font-medium inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current" /> Cover
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3 border-t bg-background space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{equipmentViewerPhoto.caption || equipmentViewerPhoto.fileName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{equipmentViewerPhoto.fileName}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!equipmentViewerPhoto.isCover && (
                          <button type="button" className="px-2 py-1 rounded-md bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 text-[11px] inline-flex items-center gap-1" onClick={() => void handleEquipmentPhotoSetCover(equipmentViewerPhoto.id)}>
                            <Star className="h-3 w-3" /> Cover
                          </button>
                        )}
                        <button type="button" className="px-2 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 text-[11px] inline-flex items-center gap-1" onClick={() => void handleEquipmentPhotoCaption(equipmentViewerPhoto.id, equipmentViewerPhoto.caption)}>
                          <Pencil className="h-3 w-3" /> Caption
                        </button>
                        <button type="button" className="px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-600 text-[11px] inline-flex items-center gap-1" onClick={async () => {
                          await handleEquipmentPhotoDelete(equipmentViewerPhoto.id);
                        }}>
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Keep equipment visuals free of faces, serial numbers, customer information, and proprietary screens.
                    </p>
                  </div>
                </>
              ) : null}
            </DialogContent>
          </Dialog>

          {/* ═══ OVERVIEW TAB ═══ */}
          {focusTab === "overview" && (<>

          {/* ── Enriched sections from CurrentPosition ── */}
          {enrichLoading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground ml-1.5">Loading details…</span>
            </div>
          )}

          {matchedPosition && !enrichLoading && (
            <div className="space-y-1.5">

              {/* A — Compensation Details (only extras not in header) */}
              {(compEvents.length > 0 || focusedItem?.equityNotes || focusedItem?.differentials) && (
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("comp")}>
                    <span className="text-[13px] font-medium flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-500" /> Compensation Details
                    </span>
                    {expandedSections.has("comp") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("comp") && (
                    <div className="px-2 pb-2 space-y-1.5">
                      {/* Differentials breakdown */}
                      {focusedItem?.differentials && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Differentials</p>
                          {focusedItem.differentials.split("\n").filter(Boolean).map((d, i) => (
                            <p key={i} className="text-xs text-emerald-600 dark:text-emerald-400">{d}</p>
                          ))}
                        </div>
                      )}
                      {/* Equity notes */}
                      {focusedItem?.equityNotes && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Equity</p>
                          <p className="text-xs">{focusedItem.equityNotes}</p>
                        </div>
                      )}
                      {/* Compensation Events */}
                      {compEvents.length > 0 && (
                        <div className="pt-1 border-t space-y-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Events</p>
                          {compEvents.slice(0, 5).map((ev) => (
                            <div key={ev.id} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1 truncate">
                                <TrendingUp className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                                <span className="truncate">{ev.title}</span>
                                {ev.recurring && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-0.5 rounded">recurring</span>}
                              </span>
                              <span className="font-medium shrink-0 ml-1">{ev.currency === "USD" ? "$" : ev.currency}{ev.amount.toLocaleString()}</span>
                            </div>
                          ))}
                          {compEvents.length > 5 && <p className="text-[10px] text-muted-foreground text-center">+{compEvents.length - 5} more</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* B — Role Description & Tech Stack */}
              {(matchedPosition.description || matchedPosition.responsibilities || matchedPosition.techStack) && (
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("role")}>
                    <span className="text-[13px] font-medium flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-blue-500" /> Role & Tech Stack
                    </span>
                    {expandedSections.has("role") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("role") && (
                    <div className="px-2 pb-2 space-y-1.5">
                      {matchedPosition.description && (
                        <div>
                          <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Description</p>
                          <p className="text-xs leading-relaxed">{matchedPosition.description}</p>
                        </div>
                      )}
                      {matchedPosition.responsibilities && (
                        <div>
                          <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Responsibilities</p>
                          <p className="text-xs leading-relaxed whitespace-pre-line">{matchedPosition.responsibilities}</p>
                        </div>
                      )}
                      {matchedPosition.techStack && (
                        <div>
                          <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Tech Stack</p>
                          <div className="flex flex-wrap gap-1">
                            {matchedPosition.techStack.split(",").map((t, i) => (
                              <span key={i} className="text-[13px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                {t.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* D — Work Log Highlights */}
              {workLogs.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("logs")}>
                    <span className="text-[13px] font-medium flex items-center gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5 text-amber-500" /> Key Accomplishments
                      <span className="text-[13px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1 rounded">{workLogs.length}</span>
                    </span>
                    {expandedSections.has("logs") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("logs") && (
                    <div className="px-2 pb-2 space-y-1.5">
                      {(() => {
                        const totalHours = workLogs.reduce((s, l) => s + (l.hours ?? 0), 0);
                        const categories = new Map<string, number>();
                        workLogs.forEach((l) => categories.set(l.category, (categories.get(l.category) ?? 0) + 1));
                        return (
                          <>
                            {totalHours > 0 && (
                              <p className="text-xs text-muted-foreground">Total logged: <span className="text-foreground font-medium">{Math.round(totalHours * 10) / 10}h</span> across <span className="text-foreground font-medium">{workLogs.length}</span> entries</p>
                            )}
                            {categories.size > 1 && (
                              <div className="flex flex-wrap gap-1">
                                {[...categories.entries()].sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                                  <span key={cat} className="text-[13px] bg-muted px-1.5 py-0.5 rounded capitalize">{cat} ({count})</span>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div className="space-y-1 pt-0.5">
                        {workLogs.slice(0, 6).map((log) => (
                          <div key={log.id} className="p-1.5 rounded bg-muted/30">
                            <div className="flex items-start gap-1">
                              <Star className="h-2.5 w-2.5 text-amber-500 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{log.title}</p>
                                {log.impact && <p className="text-[13px] text-muted-foreground truncate">Impact: {log.impact}</p>}
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-xs text-muted-foreground">{new Date(log.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                                  {log.hours != null && <span className="text-xs text-muted-foreground">{log.hours}h</span>}
                                  <span className="text-xs bg-muted px-1 rounded capitalize">{log.category}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {workLogs.length > 6 && <p className="text-[13px] text-muted-foreground text-center">+{workLogs.length - 6} more accomplishments</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* E — Income History (from Equifax / Career Model) */}
              {incomeHistory && incomeHistory.yearCount > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("income")}>
                    <span className="text-[13px] font-medium flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-teal-500" /> Income History
                      <span className="text-[13px] bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-1 rounded">{incomeHistory.yearCount}y</span>
                    </span>
                    {expandedSections.has("income") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("income") && (
                    <div className="px-2 pb-2 space-y-1.5">
                      {/* Total earned */}
                      <div className="p-2 rounded bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Earned at {incomeHistory.employer}</p>
                        <p className="text-sm font-bold text-teal-700 dark:text-teal-300">${incomeHistory.totalGross.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                        {incomeHistory.totalNet != null && incomeHistory.totalNet > 0 && (
                          <p className="text-[11px] text-muted-foreground">Net: ${incomeHistory.totalNet.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                        )}
                      </div>
                      {/* Year-by-year bars */}
                      <div className="space-y-1">
                        {incomeHistory.years.map((y) => {
                          const pct = incomeHistory.totalGross > 0 ? (y.grossIncome / Math.max(...incomeHistory.years.map(yy => yy.grossIncome))) * 100 : 0;
                          return (
                            <div key={y.year} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-8 shrink-0">{y.year}</span>
                              <div className="flex-1 h-4 bg-muted/40 rounded overflow-hidden">
                                <div className="h-full bg-teal-500/70 dark:bg-teal-400/60 rounded" style={{ width: `${Math.max(pct, 4)}%` }} />
                              </div>
                              <span className="text-xs font-medium w-16 text-right shrink-0">${y.grossIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* F — Company Intel Card */}
              {(matchedPosition.companySynopsis || matchedPosition.industry || matchedPosition.website || matchedPosition.legalName) && (
                <div className="rounded-lg border overflow-hidden">
                  <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("intel")}>
                    <span className="text-[13px] font-medium flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-violet-500" /> Company Intel
                    </span>
                    {expandedSections.has("intel") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("intel") && (
                    <div className="px-2 pb-2 space-y-1.5">
                      {matchedPosition.companySynopsis && (
                        <p className="text-xs leading-relaxed">{matchedPosition.companySynopsis}</p>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        {matchedPosition.industry && (
                          <div className="p-1.5 rounded bg-muted/30">
                            <p className="text-[13px] text-muted-foreground">Industry</p>
                            <p className="text-xs font-medium">{matchedPosition.industry}</p>
                          </div>
                        )}
                        {matchedPosition.type && (
                          <div className="p-1.5 rounded bg-muted/30">
                            <p className="text-[13px] text-muted-foreground">Work Type</p>
                            <p className="text-xs font-medium capitalize">{matchedPosition.type}</p>
                          </div>
                        )}
                      </div>
                      {matchedPosition.legalName && (
                        <p className="text-xs text-muted-foreground">Legal name: <span className="text-foreground">{matchedPosition.legalName}</span></p>
                      )}
                      {matchedPosition.ein && (
                        <p className="text-xs text-muted-foreground">EIN: <span className="text-foreground">{matchedPosition.ein}</span></p>
                      )}
                      {matchedPosition.managerName && (
                        <p className="text-xs text-muted-foreground">Manager: <span className="text-foreground">{matchedPosition.managerName}</span></p>
                      )}
                      {matchedPosition.website && (
                        <a href={matchedPosition.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 truncate">
                          <Globe className="h-3 w-3 shrink-0" /> {matchedPosition.website}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Direct Work History Detail Sections ── */}

          {/* Equity notes (extra detail not in header) */}
          {focusedItem.equityNotes && (
            <div className="px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-muted-foreground">Equity: <span className="text-foreground font-medium">{focusedItem.equityNotes}</span></p>
            </div>
          )}




          {/* Benefits & PTO */}
          {(focusedItem.benefits || focusedItem.ptoDaysOffered != null || focusedItem.ptoNotes) && (() => {
            const benefitsList: string[] = focusedItem.benefits ? (() => { try { return JSON.parse(focusedItem.benefits); } catch { return []; } })() : [];
            return (
              <div className="rounded-lg border overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("wh-benefits")}>
                  <span className="text-[13px] font-medium flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-pink-500" /> Benefits & PTO
                  </span>
                  {expandedSections.has("wh-benefits") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {expandedSections.has("wh-benefits") && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {benefitsList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {benefitsList.map((b) => (
                          <span key={b} className="text-[13px] bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-1.5 py-0.5 rounded capitalize">{b}</span>
                        ))}
                      </div>
                    )}
                    {(focusedItem.ptoDaysOffered != null || focusedItem.ptoDaysUsed != null) && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {focusedItem.ptoDaysOffered != null && (
                          <div className="p-1.5 rounded bg-muted/30">
                            <p className="text-[13px] text-muted-foreground">PTO Offered</p>
                            <p className="text-xs font-medium">{focusedItem.ptoDaysOffered} days/yr</p>
                          </div>
                        )}
                        {focusedItem.ptoDaysUsed != null && (
                          <div className="p-1.5 rounded bg-muted/30">
                            <p className="text-[13px] text-muted-foreground">PTO Used</p>
                            <p className="text-xs font-medium">{focusedItem.ptoDaysUsed} days</p>
                          </div>
                        )}
                      </div>
                    )}
                    {focusedItem.ptoNotes && <p className="text-xs text-muted-foreground">{focusedItem.ptoNotes}</p>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Skills & Growth */}
          {(focusedItem.skillsUsed || focusedItem.skillsGained || focusedItem.promotions) && (() => {
            const used: string[] = focusedItem.skillsUsed ? (() => { try { return JSON.parse(focusedItem.skillsUsed); } catch { return []; } })() : [];
            const gained: string[] = focusedItem.skillsGained ? (() => { try { return JSON.parse(focusedItem.skillsGained); } catch { return []; } })() : [];
            const promos: { title: string; date: string }[] = focusedItem.promotions ? (() => { try { return JSON.parse(focusedItem.promotions); } catch { return []; } })() : [];
            return (
              <div className="rounded-lg border overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("wh-skills")}>
                  <span className="text-[13px] font-medium flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-purple-500" /> Skills & Growth
                  </span>
                  {expandedSections.has("wh-skills") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {expandedSections.has("wh-skills") && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {used.length > 0 && (
                      <div>
                        <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Skills Used</p>
                        <div className="flex flex-wrap gap-1">{used.map((s) => <span key={s} className="text-[13px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">{s}</span>)}</div>
                      </div>
                    )}
                    {gained.length > 0 && (
                      <div>
                        <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Skills Gained</p>
                        <div className="flex flex-wrap gap-1">{gained.map((s) => <span key={s} className="text-[13px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">{s}</span>)}</div>
                      </div>
                    )}
                    {promos.length > 0 && (
                      <div>
                        <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Promotions</p>
                        {promos.map((p, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs">
                            <Award className="h-3 w-3 text-amber-500 shrink-0" />
                            <span className="font-medium">{p.title}</span>
                            <span className="text-muted-foreground">{p.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Departure & Reflection */}
          {(focusedItem.reasonForLeaving || focusedItem.wouldReturn || focusedItem.accomplishments) && (() => {
            const accs: string[] = focusedItem.accomplishments ? (() => { try { return JSON.parse(focusedItem.accomplishments); } catch { return []; } })() : [];
            const leaveLabels: Record<string, string> = { "better-offer": "Better Offer", layoff: "Layoff", relocation: "Relocation", growth: "Growth", culture: "Culture", personal: "Personal", "contract-end": "Contract End", other: "Other" };
            return (
              <div className="rounded-lg border overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("wh-depart")}>
                  <span className="text-[13px] font-medium flex items-center gap-1.5">
                    <LogOut className="h-3.5 w-3.5 text-orange-500" /> Departure & Reflection
                  </span>
                  {expandedSections.has("wh-depart") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {expandedSections.has("wh-depart") && (
                  <div className="px-2 pb-2 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {focusedItem.reasonForLeaving && (
                        <div className="p-1.5 rounded bg-muted/30">
                          <p className="text-[13px] text-muted-foreground">Reason for Leaving</p>
                          <p className="text-xs font-medium">{leaveLabels[focusedItem.reasonForLeaving] ?? focusedItem.reasonForLeaving}</p>
                        </div>
                      )}
                      {focusedItem.wouldReturn && (
                        <div className="p-1.5 rounded bg-muted/30">
                          <p className="text-[13px] text-muted-foreground">Would Return?</p>
                          <p className="text-xs font-medium flex items-center gap-1">
                            <ThumbsUp className={`h-3 w-3 ${focusedItem.wouldReturn === "yes" ? "text-emerald-500" : focusedItem.wouldReturn === "no" ? "text-red-500" : "text-amber-500"}`} />
                            <span className="capitalize">{focusedItem.wouldReturn}</span>
                          </p>
                        </div>
                      )}
                    </div>
                    {accs.length > 0 && (
                      <div>
                        <p className="text-[13px] text-muted-foreground uppercase tracking-wide mb-0.5">Key Accomplishments</p>
                        <ul className="space-y-0.5">
                          {accs.map((a, i) => (
                            <li key={i} className="text-xs flex items-start gap-1">
                              <Star className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Feature B: Commute from Life Anchors ── */}
          {lifeAnchors.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("commute")}>
                <span className="text-[13px] font-medium flex items-center gap-1.5">
                  <Navigation className="h-3.5 w-3.5 text-cyan-500" /> Commute
                </span>
                {expandedSections.has("commute") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </button>
              {expandedSections.has("commute") && (
                <div className="px-2 pb-2 space-y-1.5">
                  {/* Mode selector */}
                  <div className="flex gap-1 rounded-md bg-muted/40 p-0.5">
                    {([["driving", Car, "Drive"], ["transit", TrainFront, "Transit"], ["walking", Footprints, "Walk"], ["bicycling", Bike, "Bike"]] as const).map(([mode, Icon, label]) => (
                      <button key={mode} type="button"
                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[13px] transition-colors ${commuteMode === mode ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => { setCommuteMode(mode); if (selectedAnchorId) computeCommute(selectedAnchorId, mode); }}>
                        <Icon className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {lifeAnchors.map((a) => (
                      <button key={a.id} type="button"
                        className={`w-full flex items-center gap-1.5 p-1.5 rounded text-xs transition-colors ${selectedAnchorId === a.id ? "bg-cyan-100 dark:bg-cyan-900/30 border border-cyan-300 dark:border-cyan-700" : "bg-muted/30 hover:bg-muted/50"}`}
                        onClick={() => computeCommute(a.id)}>
                        <Home className="h-3 w-3 shrink-0 text-cyan-500" />
                        <span className="truncate font-medium">{a.label}</span>
                        {selectedAnchorId === a.id && commuteLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                      </button>
                    ))}
                  </div>
                  {commuteResult && (
                    <div className="p-1.5 rounded bg-muted/30 grid grid-cols-2 gap-1.5">
                      <div>
                        <p className="text-[13px] text-muted-foreground">Distance</p>
                        <p className="text-xs font-semibold">{commuteResult.distanceMi.toFixed(1)} mi</p>
                      </div>
                      <div>
                        <p className="text-[13px] text-muted-foreground">{{ driving: "Drive", transit: "Transit", walking: "Walk", bicycling: "Bike" }[commuteMode]} Time</p>
                        <p className="text-xs font-semibold">{Math.round(commuteResult.durationMin)} min</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Uniform / PPE ── */}
          {(() => {
            let parsedUniform: UniformData | null = null;
            if (focusedItem.uniformData) {
              try { parsedUniform = JSON.parse(focusedItem.uniformData); } catch { /* ignore */ }
            }
            const hasUniform = parsedUniform?.enabled && Object.keys(parsedUniform.zones ?? {}).length > 0;
            const zoneCount = Object.values(parsedUniform?.zones ?? {}).filter(z => z?.item || z?.notes || z?.photo).length;
            return (
              <div className="rounded-lg border overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors"
                  onClick={() => {
                    if (!expandedSections.has("uniform")) openUniformEditor();
                    else toggleSection("uniform");
                  }}>
                  <span className="text-[13px] font-medium flex items-center gap-1.5">
                    <PersonStanding className="h-3.5 w-3.5 text-orange-500" /> Uniform / PPE
                    {hasUniform && (
                      <span className="ml-1 text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full">
                        {parsedUniform?.category ?? "Custom"} · {zoneCount} zone{zoneCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  {expandedSections.has("uniform") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {expandedSections.has("uniform") && uniformDraft && (
                  <div className="p-2 space-y-2">
                    <UniformBodyMap value={uniformDraft} onChange={setUniformDraft} />
                    <div className="flex gap-1.5 pt-1">
                      <button type="button"
                        onClick={saveUniform}
                        disabled={uniformSaving}
                        className="flex-1 text-[12px] bg-primary text-primary-foreground rounded py-1 hover:bg-primary/90 disabled:opacity-50">
                        {uniformSaving ? "Saving…" : "Save Uniform"}
                      </button>
                      {hasUniform && (
                        <button type="button" onClick={clearUniform}
                          className="text-[12px] text-destructive border border-destructive/30 rounded px-2 py-1 hover:bg-destructive/10">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          </>)}
          {/* ═══ END OVERVIEW TAB ═══ */}

          {/* ═══ EDIT TAB ═══ */}
          {focusTab === "edit" && (<>

          {/* ── Add Sub-locations: Discovery + Claim + Pin Drop ── */}
          {pinDropMode && !pinDropCoords && (
            <div className="p-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-50/10">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <MapPinned className="h-3 w-3" /> Click a building or any spot on the map
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Clicking a labeled building will auto-fill its name and address</p>
              <button type="button" className="text-[13px] text-muted-foreground hover:text-foreground mt-1" onClick={onCancelPinDrop}>Cancel</button>
            </div>
          )}
          {pinDropCoords && (
            <div className="p-2 rounded-lg border border-blue-500/30 bg-blue-50/10 space-y-1.5">
              <p className="text-xs font-medium flex items-center gap-1">
                <MapPinned className="h-3 w-3 text-blue-500" />
                {pinDropCoords.placeId ? "Claim this building" : "New sub-location pin"}
              </p>
              <p className="text-[13px] text-muted-foreground truncate">{pinDropReversed || "Resolving address…"}</p>
              <Input value={pinDropLabel} onChange={(e) => setPinDropLabel(e.target.value)} placeholder="Label *" className="h-6 text-xs" />
              <Select value={pinDropType} onValueChange={(v) => { setPinDropType(v ?? "daily-workplace"); if (v !== "custom") setPinDropCustomType(""); }}>
                <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{LOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
              </Select>
              {pinDropType === "custom" && (
                <Input value={pinDropCustomType} onChange={(e) => setPinDropCustomType(e.target.value)} placeholder="Type name (e.g. Warehouse)" className="h-6 text-xs" />
              )}
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-6 text-xs" disabled={pinDropSaving || !pinDropLabel.trim() || (pinDropType === "custom" && !pinDropCustomType.trim())} onClick={handlePinDropSave}>
                  {pinDropSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onCancelPinDrop}>Cancel</Button>
              </div>
            </div>
          )}
          {!pinDropMode && !pinDropCoords && (
            <div className="space-y-1.5">
              {/* Nearby Buildings Discovery */}
              {!nearbySearched ? (
                <Button size="sm" variant="outline" className="w-full h-7 text-xs" disabled={nearbyLoading} onClick={searchNearbyBuildings}>
                  {nearbyLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                  Find Company Buildings Nearby
                </Button>
              ) : nearbyBuildings.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="p-1.5 bg-muted/30 flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-blue-500" /> Nearby Buildings ({nearbyBuildings.length})
                    </span>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setNearbySearched(false); setNearbyBuildings([]); }}>
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <div className="max-h-[150px] overflow-y-auto divide-y">
                    {nearbyBuildings.map((b) => (
                      <div key={b.placeId} className="flex items-center gap-1.5 p-1.5 hover:bg-muted/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{b.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{b.address}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 text-[13px] shrink-0 px-2" disabled={claimingPlaceId === b.placeId}
                          onClick={() => claimBuilding(b)}>
                          {claimingPlaceId === b.placeId ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <><Plus className="h-2.5 w-2.5 mr-0.5" /> Claim</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : nearbyLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground ml-1">Searching nearby…</span>
                </div>
              ) : (
                <div className="p-2 rounded-lg border bg-muted/20 text-center">
                  <p className="text-xs text-muted-foreground">No additional buildings found nearby</p>
                  <button type="button" className="text-[13px] text-blue-500 hover:underline mt-0.5" onClick={() => { setNearbySearched(false); setNearbyBuildings([]); }}>Search again</button>
                </div>
              )}
              {/* Action button */}
              <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1 rounded-md hover:bg-muted/50 border border-dashed transition-colors" onClick={onStartPinDrop}>
                <MapPinned className="h-3 w-3" /> Add from Map
              </button>
            </div>
          )}

          {/* ── Feature E: Timeline Milestones ── */}
          <div className="rounded-lg border overflow-hidden">
            <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("milestones")}>
              <span className="text-[13px] font-medium flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" /> Milestones
                {milestones.length > 0 && <span className="text-[13px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1 rounded">{milestones.length}</span>}
              </span>
              {expandedSections.has("milestones") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>
            {expandedSections.has("milestones") && (
              <div className="px-2 pb-2 space-y-1.5">
                {milestonesLoading && <Loader2 className="h-3 w-3 animate-spin mx-auto" />}
                {/* Mini timeline */}
                {milestones.length > 0 && (
                  <div className="relative pl-3 border-l-2 border-orange-200 dark:border-orange-800 space-y-2">
                    {milestones.map((ms) => {
                      const mt = MILESTONE_TYPES.find((t) => t.value === ms.type);
                      return (
                        <div key={ms.id} className="relative">
                          <div className="absolute -left-[19px] top-0.5 w-3 h-3 rounded-full bg-orange-400 border-2 border-background flex items-center justify-center text-[7px]">{mt?.icon ?? "📌"}</div>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs font-medium">{ms.title}</p>
                              <p className="text-xs text-muted-foreground">{ms.date} · {mt?.label ?? ms.type}</p>
                            </div>
                            <button type="button" className="text-muted-foreground hover:text-red-500 shrink-0" onClick={() => handleDeleteMilestone(ms.id)}>
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Add milestone form */}
                <div className="space-y-1 pt-1 border-t">
                  <Input value={newMsTitle} onChange={(e) => setNewMsTitle(e.target.value)} placeholder="Milestone title" className="h-6 text-xs" />
                  <div className="flex gap-1">
                    <Select value={newMsType} onValueChange={(v) => setNewMsType(v ?? "achievement")}>
                      <SelectTrigger className="h-6 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{MILESTONE_TYPES.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.icon} {t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="month" value={newMsDate} onChange={(e) => setNewMsDate(e.target.value)} className="h-6 text-xs flex-1" />
                  </div>
                  <Button size="sm" className="w-full h-6 text-xs" disabled={msSaving || !newMsTitle.trim() || !newMsDate} onClick={handleAddMilestone}>
                    {msSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Plus className="h-2.5 w-2.5 mr-0.5" /> Add Milestone</>}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Feature D: Notes ── */}
          <div className="rounded-lg border overflow-hidden">
            <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("notes")}>
              <span className="text-[13px] font-medium flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-yellow-500" /> Notes
                {notes.length > 0 && <span className="text-[13px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-1 rounded">{notes.length}</span>}
              </span>
              {expandedSections.has("notes") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>
            {expandedSections.has("notes") && (
              <div className="px-2 pb-2 space-y-1.5">
                {notesLoading && <Loader2 className="h-3 w-3 animate-spin mx-auto" />}
                {notes.map((n) => (
                  <div key={n.id} className="p-1.5 rounded bg-muted/30 group">
                    <div className="flex items-start justify-between">
                      <p className="text-xs leading-relaxed whitespace-pre-line flex-1">{n.content}</p>
                      <button type="button" className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" onClick={() => handleDeleteNote(n.id)}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(n.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
                {/* Add note */}
                <div className="flex gap-1 pt-1 border-t">
                  <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Write a note…" className="text-xs min-h-[32px] flex-1 resize-none" rows={2} />
                  <Button size="sm" className="h-8 w-8 shrink-0 p-0" disabled={noteSaving || !newNote.trim()} onClick={handleAddNote}>
                    {noteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Feature G: Workplace Rating Card ── */}
          <div className="rounded-lg border overflow-hidden">
            <button type="button" className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors" onClick={() => toggleSection("rating")}>
              <span className="text-[13px] font-medium flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500" /> Workplace Rating
                {rating && <span className="text-[13px] text-amber-600">{"★".repeat(rating.overall)}{"☆".repeat(5 - rating.overall)}</span>}
              </span>
              {expandedSections.has("rating") ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>
            {expandedSections.has("rating") && (
              <div className="px-2 pb-2 space-y-1.5">
                {ratingLoading && <Loader2 className="h-3 w-3 animate-spin mx-auto" />}
                {!ratingLoading && (rating || ratingEditing) && (
                  <div className="space-y-1">
                    {([
                      ["culture", "Culture"],
                      ["growth", "Growth"],
                      ["compensation", "Compensation"],
                      ["workLifeBalance", "Work-Life Balance"],
                      ["management", "Management"],
                      ["overall", "Overall"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        {ratingEditing ? (
                          <StarRatingInput value={ratingDraft[key]} onChange={(v) => setRatingDraft((d) => ({ ...d, [key]: v }))} />
                        ) : (
                          <span className="text-xs text-amber-500">{"★".repeat(rating?.[key] ?? 0)}{"☆".repeat(5 - (rating?.[key] ?? 0))}</span>
                        )}
                      </div>
                    ))}
                    {ratingEditing && (
                      <Textarea value={ratingDraft.notes ?? ""} onChange={(e) => setRatingDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes (optional)" className="text-xs min-h-[28px] resize-none" rows={2} />
                    )}
                    {rating?.notes && !ratingEditing && <p className="text-[13px] text-muted-foreground italic">{rating.notes}</p>}
                  </div>
                )}
                <div className="flex gap-1">
                  {ratingEditing ? (
                    <>
                      <Button size="sm" className="flex-1 h-6 text-xs" disabled={ratingSaving} onClick={handleSaveRating}>
                        {ratingSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Rating"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setRatingEditing(false); if (rating) setRatingDraft(rating); }}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full h-6 text-xs" onClick={() => setRatingEditing(true)}>
                      <Pencil className="h-2.5 w-2.5 mr-0.5" /> {rating ? "Edit Rating" : "Rate Workplace"}
                    </Button>
                  )}
                  {!ratingEditing && !rating && <p className="text-xs text-muted-foreground text-center italic">Click above to rate this workplace</p>}
                </div>
              </div>
            )}
          </div>

          {/* ── Edit Detail Fields ── */}
          <DetailEditSection
            title="Compensation"
            icon={<DollarSign className="h-3.5 w-3.5 text-emerald-500" />}
            sectionKey="edit-comp"
            expanded={expandedSections.has("edit-comp")}
            onToggle={() => toggleSection("edit-comp")}
          >
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Salary</p>
                  <Input type="number" defaultValue={focusedItem.salaryAmount ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ salaryAmount: e.target.value ? Number(e.target.value) : null })} placeholder="Amount" />
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Type</p>
                  <Select value={focusedItem.salaryType ?? ""} onValueChange={(v) => saveDetail({ salaryType: v || null })}>
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual" className="text-xs">Annual</SelectItem>
                      <SelectItem value="hourly" className="text-xs">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Annual Bonus</p>
                  <Input type="number" defaultValue={focusedItem.bonusAmount ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ bonusAmount: e.target.value ? Number(e.target.value) : null })} placeholder="Bonus" />
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Currency</p>
                  <Input defaultValue={focusedItem.salaryCurrency ?? "USD"} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ salaryCurrency: e.target.value || null })} placeholder="USD" />
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Equity Notes</p>
                <Input defaultValue={focusedItem.equityNotes ?? ""} className="h-6 text-xs"
                  onBlur={(e) => saveDetail({ equityNotes: e.target.value || null })} placeholder="Stock options, RSUs…" />
              </div>
            </div>
          </DetailEditSection>

          <DetailEditSection
            title="Schedule"
            icon={<Calendar className="h-3.5 w-3.5 text-blue-500" />}
            sectionKey="edit-sched"
            expanded={expandedSections.has("edit-sched")}
            onToggle={() => toggleSection("edit-sched")}
          >
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Employment Type</p>
                  <Select value={focusedItem.scheduleType ?? ""} onValueChange={(v) => saveDetail({ scheduleType: v || null })}>
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["full-time","part-time","contract","internship","freelance"].map((v) => <SelectItem key={v} value={v} className="text-xs capitalize">{v.replace("-"," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Work Mode</p>
                  <Select value={focusedItem.workMode ?? ""} onValueChange={(v) => saveDetail({ workMode: v || null })}>
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["on-site","hybrid","remote"].map((v) => <SelectItem key={v} value={v} className="text-xs capitalize">{v.replace("-"," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Days On-Site (hybrid)</p>
                  <Input type="number" min={0} max={7} defaultValue={focusedItem.hybridDays ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ hybridDays: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Hours/Week</p>
                  <Input type="number" defaultValue={focusedItem.hoursPerWeek ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ hoursPerWeek: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Shift</p>
                <div className="grid grid-cols-3 gap-1">
                  <Select
                    value={(() => {
                      const s = (focusedItem.schedule ?? "").toLowerCase();
                      if (s.includes("1st") || s.includes("day")) return "1st";
                      if (s.includes("2nd") || s.includes("swing") || s.includes("afternoon")) return "2nd";
                      if (s.includes("3rd") || s.includes("night") || s.includes("overnight")) return "3rd";
                      if (s) return "custom";
                      return "";
                    })()}
                    onValueChange={(v) => {
                      if (!v) return;
                      const defaults: Record<string, string> = { "1st": "1st Shift (7am - 3pm)", "2nd": "2nd Shift (3pm - 11pm)", "3rd": "3rd Shift (11pm - 7am)" };
                      saveDetail({ schedule: defaults[v] || (v === "custom" ? focusedItem.schedule || "Custom Shift" : null) });
                    }}
                  >
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Shift" /></SelectTrigger>
                    <SelectContent>
                      {[{v:"1st",l:"1st (Day)"},{v:"2nd",l:"2nd (Swing)"},{v:"3rd",l:"3rd (Night)"},{v:"custom",l:"Custom"}].map((o) => <SelectItem key={o.v} value={o.v} className="text-xs">{o.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    className="h-6 text-xs"
                    defaultValue={(() => {
                      const m = (focusedItem.schedule ?? "").match(/\((\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
                      if (!m) return "";
                      const t = m[1].trim().toLowerCase();
                      const [hm, ap] = [t.replace(/(am|pm)/, "").trim(), t.match(/(am|pm)/)?.[1]];
                      const [h, mn] = hm.split(":").map(Number);
                      const h24 = ap === "pm" && h !== 12 ? h + 12 : ap === "am" && h === 12 ? 0 : h;
                      return `${String(h24).padStart(2,"0")}:${String(mn || 0).padStart(2,"0")}`;
                    })()}
                    onBlur={(e) => {
                      if (!e.target.value) return;
                      const [h, m] = e.target.value.split(":").map(Number);
                      const ap = h >= 12 ? "pm" : "am";
                      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                      const startStr = `${h12}${m ? `:${String(m).padStart(2,"0")}` : ""}${ap}`;
                      const cur = focusedItem.schedule ?? "";
                      const endMatch = cur.match(/-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\)/i);
                      const endPart = endMatch ? endMatch[1] : "?";
                      const prefix = cur.replace(/\(.*\)/, "").trim() || "Shift";
                      saveDetail({ schedule: `${prefix} (${startStr} - ${endPart})` });
                    }}
                  />
                  <Input
                    type="time"
                    className="h-6 text-xs"
                    defaultValue={(() => {
                      const m = (focusedItem.schedule ?? "").match(/-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\)/i);
                      if (!m) return "";
                      const t = m[1].trim().toLowerCase();
                      const [hm, ap] = [t.replace(/(am|pm)/, "").trim(), t.match(/(am|pm)/)?.[1]];
                      const [h, mn] = hm.split(":").map(Number);
                      const h24 = ap === "pm" && h !== 12 ? h + 12 : ap === "am" && h === 12 ? 0 : h;
                      return `${String(h24).padStart(2,"0")}:${String(mn || 0).padStart(2,"0")}`;
                    })()}
                    onBlur={(e) => {
                      if (!e.target.value) return;
                      const [h, m] = e.target.value.split(":").map(Number);
                      const ap = h >= 12 ? "pm" : "am";
                      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                      const endStr = `${h12}${m ? `:${String(m).padStart(2,"0")}` : ""}${ap}`;
                      const cur = focusedItem.schedule ?? "";
                      const startMatch = cur.match(/\((\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-/i);
                      const startPart = startMatch ? startMatch[1] : "?";
                      const prefix = cur.replace(/\(.*\)/, "").trim() || "Shift";
                      saveDetail({ schedule: `${prefix} (${startPart} - ${endStr})` });
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Shift Notes</p>
                <Input defaultValue={focusedItem.shiftNotes ?? ""} className="h-6 text-xs"
                  onBlur={(e) => saveDetail({ shiftNotes: e.target.value || null })} placeholder="4x10, rotating days off, etc." />
              </div>
            </div>
          </DetailEditSection>

          <DetailEditSection
            title="Benefits & PTO"
            icon={<Heart className="h-3.5 w-3.5 text-pink-500" />}
            sectionKey="edit-benefits"
            expanded={expandedSections.has("edit-benefits")}
            onToggle={() => toggleSection("edit-benefits")}
          >
            <div className="space-y-1.5">
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Benefits (click to toggle)</p>
                <BenefitsToggle current={focusedItem.benefits} onSave={(val) => saveDetail({ benefits: val })} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">PTO Days Offered</p>
                  <Input type="number" defaultValue={focusedItem.ptoDaysOffered ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ ptoDaysOffered: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">PTO Days Used</p>
                  <Input type="number" defaultValue={focusedItem.ptoDaysUsed ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ ptoDaysUsed: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">PTO Notes</p>
                <Input defaultValue={focusedItem.ptoNotes ?? ""} className="h-6 text-xs"
                  onBlur={(e) => saveDetail({ ptoNotes: e.target.value || null })} placeholder="Unlimited, sabbatical…" />
              </div>
            </div>
          </DetailEditSection>

          <DetailEditSection
            title="Work Environment"
            icon={<Monitor className="h-3.5 w-3.5 text-indigo-500" />}
            sectionKey="edit-env"
            expanded={expandedSections.has("edit-env")}
            onToggle={() => toggleSection("edit-env")}
          >
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Company Size</p>
                  <Select value={focusedItem.companySize ?? ""} onValueChange={(v) => saveDetail({ companySize: v || null })}>
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["startup","small","mid-market","enterprise"].map((v) => <SelectItem key={v} value={v} className="text-xs capitalize">{v.replace("-"," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Team Size</p>
                  <Input type="number" defaultValue={focusedItem.teamSize ?? ""} className="h-6 text-xs"
                    onBlur={(e) => saveDetail({ teamSize: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Department</p>
                <Input defaultValue={focusedItem.department ?? ""} className="h-6 text-xs"
                  onBlur={(e) => saveDetail({ department: e.target.value || null })} placeholder="Engineering, Sales…" />
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Manager</p>
                <Input defaultValue={focusedItem.managerName ?? ""} className="h-6 text-xs"
                  onBlur={(e) => saveDetail({ managerName: e.target.value || null })} placeholder="Manager name" />
              </div>
            </div>
          </DetailEditSection>

          <DetailEditSection
            title="Skills & Growth"
            icon={<GraduationCap className="h-3.5 w-3.5 text-purple-500" />}
            sectionKey="edit-skills"
            expanded={expandedSections.has("edit-skills")}
            onToggle={() => toggleSection("edit-skills")}
          >
            <div className="space-y-1.5">
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Skills Used (comma-separated)</p>
                <Input defaultValue={(() => { try { return JSON.parse(focusedItem.skillsUsed ?? "[]").join(", "); } catch { return ""; } })()}
                  className="h-6 text-xs" list="wh-skill-suggestions"
                  onBlur={(e) => { const v = e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean); saveDetail({ skillsUsed: v.length ? JSON.stringify(v) : null }); }}
                  placeholder="React, Python, SQL…" />
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Skills Gained (comma-separated)</p>
                <Input defaultValue={(() => { try { return JSON.parse(focusedItem.skillsGained ?? "[]").join(", "); } catch { return ""; } })()}
                  className="h-6 text-xs" list="wh-skill-suggestions"
                  onBlur={(e) => { const v = e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean); saveDetail({ skillsGained: v.length ? JSON.stringify(v) : null }); }}
                  placeholder="Docker, K8s…" />
                <datalist id="wh-skill-suggestions">
                  {skillSuggestions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              {/* Promotions inline editor */}
              {(() => {
                const promos: { title: string; date: string }[] = (() => { try { return JSON.parse(focusedItem.promotions ?? "[]"); } catch { return []; } })();
                return (
                  <div>
                    <p className="text-[13px] text-muted-foreground mb-0.5">Promotions</p>
                    {promos.length > 0 && (
                      <div className="space-y-0.5 mb-1">
                        {promos.map((p, i) => (
                          <div key={i} className="flex items-center gap-1 text-xs">
                            <Award className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                            <span className="font-medium truncate">{p.title}</span>
                            <span className="text-muted-foreground shrink-0">{p.date}</span>
                            <button type="button" className="text-muted-foreground hover:text-red-500 ml-auto shrink-0"
                              onClick={() => { const next = promos.filter((_, j) => j !== i); saveDetail({ promotions: next.length ? JSON.stringify(next) : null }); }}>
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1">
                      <Input placeholder="Title (e.g. Senior Dev)" className="h-6 text-xs flex-1" id="promo-title-input" />
                      <Input type="month" className="h-6 text-xs w-[110px]" id="promo-date-input" />
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs"
                        onClick={() => {
                          const titleEl = document.getElementById("promo-title-input") as HTMLInputElement;
                          const dateEl = document.getElementById("promo-date-input") as HTMLInputElement;
                          if (!titleEl?.value.trim()) return;
                          const next = [...promos, { title: titleEl.value.trim(), date: dateEl?.value || "" }];
                          saveDetail({ promotions: JSON.stringify(next) });
                          titleEl.value = ""; if (dateEl) dateEl.value = "";
                        }}>
                        <Plus className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </DetailEditSection>

          <DetailEditSection
            title="Departure & Reflection"
            icon={<LogOut className="h-3.5 w-3.5 text-orange-500" />}
            sectionKey="edit-depart"
            expanded={expandedSections.has("edit-depart")}
            onToggle={() => toggleSection("edit-depart")}
          >
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Reason for Leaving</p>
                  <Select value={focusedItem.reasonForLeaving ?? ""} onValueChange={(v) => saveDetail({ reasonForLeaving: v || null })}>
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {[["better-offer","Better Offer"],["layoff","Layoff"],["relocation","Relocation"],["growth","Growth"],["culture","Culture"],["personal","Personal"],["contract-end","Contract End"],["other","Other"]].map(([v,l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground mb-0.5">Would Return?</p>
                  <Select value={focusedItem.wouldReturn ?? ""} onValueChange={(v) => saveDetail({ wouldReturn: v || null })}>
                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["yes","no","maybe"].map((v) => <SelectItem key={v} value={v} className="text-xs capitalize">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">Key Accomplishments (one per line)</p>
                <Textarea defaultValue={(() => { try { return JSON.parse(focusedItem.accomplishments ?? "[]").join("\n"); } catch { return ""; } })()}
                  className="text-xs min-h-[60px]"
                  onBlur={(e) => { const v = e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean); saveDetail({ accomplishments: v.length ? JSON.stringify(v) : null }); }}
                  placeholder="Led migration to microservices&#10;Reduced build time by 60%" />
              </div>
            </div>
          </DetailEditSection>

          {/* Actions */}
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => { startEdit(focusedItem); onExitFocus(); }}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-red-500 hover:text-red-600" onClick={() => { handleDelete(focusedItem.id); onExitFocus(); }}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>

          </>)}
          {/* ═══ END EDIT TAB ═══ */}

          {/* Exit button */}
          <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1.5 rounded-md hover:bg-muted/50 transition-colors" onClick={onExitFocus}>
            <ChevronLeft className="h-3 w-3" /> Back to all work history
          </button>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-gray-500" /> Work History
        </span>
        <div className="relative flex items-center gap-1">
          {items.length >= 2 && (
            <button
              type="button"
              className={`transition-colors ${tab === "compare" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="Compare roles"
              onClick={() => setTab((prev) => (prev === "compare" ? lastMainTab : "compare"))}
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            className={`transition-colors ${showTypeFilterPanel ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title="Filter work history"
            onClick={() => {
              setShowTypeFilterPanel((p) => !p);
              setShowPanelSettings(false);
            }}
          >
            <Filter className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`transition-colors ${showPanelSettings ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title="Panel settings"
            onClick={() => {
              setShowPanelSettings((p) => !p);
              setShowTypeFilterPanel(false);
            }}
          >
            <Settings className="h-4 w-4" />
          </button>
          <button type="button" className={`transition-colors ${showInventoryOverview ? "text-emerald-600" : "text-muted-foreground hover:text-foreground"}`} title="My Tools & Inventory" onClick={() => setShowInventoryOverview((p) => !p)}>
            <Boxes className="h-4 w-4" />
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" title="Import from experience" onClick={handleImportFromExperience} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>

          {showTypeFilterPanel && (() => {
            const typeMeta: { key: string; label: string; emoji: string }[] = [
              { key: "job", label: "Jobs", emoji: "💼" },
              { key: "school", label: "Schools", emoji: "🎓" },
              { key: "internship", label: "Internships", emoji: "🏢" },
              { key: "military", label: "Military", emoji: "🎖️" },
              { key: "volunteer", label: "Volunteer", emoji: "🤝" },
              { key: "self-employed", label: "Self-Employed", emoji: "🧑‍💻" },
            ];
            const counts = new Map<string, number>();
            for (const w of items) {
              const t = w.type ?? "job";
              if (t === "unemployed") continue;
              counts.set(t, (counts.get(t) ?? 0) + 1);
            }
            const visibleMeta = typeMeta.filter((m) => (counts.get(m.key) ?? 0) > 0);

            return (
              <div className="absolute right-0 top-7 z-[1200] w-64 rounded-lg border bg-background/95 backdrop-blur-md shadow-xl p-2 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">History Filters</p>

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground px-1">Quick Presets</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button type="button" className="text-[11px] rounded-md border px-1.5 py-1 hover:bg-muted/40" onClick={() => applyHiddenTypes(new Set())}>All</button>
                    <button
                      type="button"
                      className="text-[11px] rounded-md border px-1.5 py-1 hover:bg-muted/40"
                      onClick={() => applyHiddenTypes(new Set<string>(["school", "military", "volunteer"]))}
                    >
                      Work Map
                    </button>
                    <button
                      type="button"
                      className="text-[11px] rounded-md border px-1.5 py-1 hover:bg-muted/40"
                      onClick={() => applyHiddenTypes(new Set<string>(["job", "internship", "military", "volunteer", "self-employed"]))}
                    >
                      School Only
                    </button>
                    <button
                      type="button"
                      className="text-[11px] rounded-md border px-1.5 py-1 hover:bg-muted/40"
                      onClick={() => applyHiddenTypes(new Set<string>(["military", "volunteer", "self-employed"]))}
                    >
                      Core
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground px-1">Entry Types</p>
                  {visibleMeta.map((m) => {
                    const hidden = hiddenTypes.has(m.key);
                    const count = counts.get(m.key) ?? 0;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        className="w-full flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-muted/40"
                        onClick={() => onToggleType(m.key)}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{m.emoji}</span>
                          <span>{m.label}</span>
                        </span>
                        <span className={`text-[11px] ${hidden ? "text-muted-foreground" : "text-primary"}`}>{hidden ? "Off" : "On"} · {count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {showPanelSettings && (
            <div className="absolute right-0 top-7 z-[1200] w-60 rounded-lg border bg-background/95 backdrop-blur-md shadow-xl p-2 space-y-1.5 max-h-[70vh] overflow-y-auto scrollbar-thin">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">Panel Settings</p>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-muted/40"
                onClick={onToggleCareerPath}
              >
                <span className="flex items-center gap-1.5"><Route className="h-3.5 w-3.5" /> Career Path Line</span>
                <span className={`text-[11px] ${showCareerPath ? "text-blue-600" : "text-muted-foreground"}`}>{showCareerPath ? "On" : "Off"}</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-muted/40"
                onClick={onToggleOverlaps}
              >
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Concurrent Badges</span>
                <span className={`text-[11px] ${showOverlaps ? "text-cyan-600" : "text-muted-foreground"}`}>{showOverlaps ? "On" : "Off"}</span>
              </button>
              <div className="pt-1.5 mt-1.5 border-t border-border/60">
                <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Stat Slots ({kpiSlots.length}/{KPI_MAX_SLOTS})
                  </p>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    onClick={resetKpiSlots}
                  >
                    Reset
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground px-1 mb-1.5 leading-snug">
                  Pick which metrics show in the stats card. Click to add/remove.
                </p>
                {(["Career", "Compensation", "Lifestyle", "Composition", "Skills"] as const).map((group) => {
                  const inGroup = KPI_CATALOG.filter((m) => m.group === group);
                  return (
                    <div key={group} className="mb-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-0.5">{group}</p>
                      {inGroup.map((m) => {
                        const selected = kpiSlots.includes(m.key);
                        const order = selected ? kpiSlots.indexOf(m.key) + 1 : null;
                        const atCap = !selected && kpiSlots.length >= KPI_MAX_SLOTS;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            disabled={atCap}
                            className={`w-full flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-muted/40 ${atCap ? "opacity-40 cursor-not-allowed" : ""}`}
                            onClick={() => toggleKpiSlot(m.key)}
                          >
                            <span className="truncate">{m.label}</span>
                            <span className={`text-[10px] ml-2 shrink-0 ${selected ? "text-primary font-medium" : "text-muted-foreground"}`}>
                              {selected ? `✓ #${order}` : (atCap ? "max" : "+")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Career Journey Stats (user-configurable metric slots) */}
      {(() => {
        const ctx: KpiContext = {
          items,
          stats,
          cfm: cfmSummary ? { rtg: cfmSummary.rtg, rtn: cfmSummary.rtn } : null,
        };
        const rendered = kpiSlots
          .map((k) => {
            const def = KPI_CATALOG_BY_KEY[k];
            if (!def) return null;
            const out = def.compute(ctx);
            return out ? { key: k, label: def.label, value: out.value, color: out.color } : null;
          })
          .filter((x): x is { key: string; label: string; value: string; color?: string } => x !== null);
        if (rendered.length === 0) return null;
        // pick a sensible grid: 1–2 → cols match; 3 → 3; 4 → 4; 5–6 → 3; 7–8 → 4
        const n = rendered.length;
        const colsClass =
          n === 1 ? "grid-cols-1" :
          n === 2 ? "grid-cols-2" :
          n === 3 ? "grid-cols-3" :
          n === 4 ? "grid-cols-4" :
          n <= 6 ? "grid-cols-3" : "grid-cols-4";
        return (
          <div className="mb-2.5 p-2 rounded-lg bg-muted/40 border">
            <div className={`grid ${colsClass} gap-x-1 gap-y-1.5`}>
              {rendered.map((m) => (
                <div key={m.key} className="text-center min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate" title={m.label}>{m.label}</p>
                  <p className={`text-sm font-semibold truncate ${m.color ?? ""}`} title={m.value}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      {items.length > 0 && (
        <div className="flex gap-1 mb-2">
          <button type="button" className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${tab === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`} onClick={() => setTab("list")}>
            List
          </button>
          <button type="button" className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${tab === "timeline" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`} onClick={() => setTab("timeline")}>
            Timeline
          </button>
        </div>
      )}

      {/* Residences */}
      <div className="mb-2.5">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
          onClick={() => setShowResidences(!showResidences)}
        >
          <Home className="h-3 w-3" />
          Residences ({residences.length})
          {showResidences ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {showResidences && (
          <div className="mt-1.5 space-y-1.5">
            {residences.map((r) => (
              <div key={r.id} className={`flex items-center gap-1.5 p-1.5 rounded border text-xs ${activeResidence?.id === r.id ? "border-blue-400 bg-blue-500/10" : "bg-muted/30"}`}>
                <span>🏠</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.label}{r.isCurrent && <span className="text-blue-500 ml-1">(current)</span>}</p>
                  <p className="text-muted-foreground truncate">{r.address}</p>
                  <p className="text-muted-foreground">
                    {r.startDate ? new Date(r.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "?"}
                    {" — "}
                    {r.endDate ? new Date(r.endDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Present"}
                  </p>
                </div>
                <button type="button" className="text-destructive/60 hover:text-destructive p-0.5" onClick={() => handleDeleteResidence(r.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {!addingResidence ? (
              <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setAddingResidence(true)}>
                <Plus className="h-3 w-3" /> Add residence
              </button>
            ) : (
              <div className="space-y-1.5 p-2 border rounded-lg bg-muted/30">
                <Input placeholder="Label (e.g. College dorm)" className="h-7 text-xs" value={resLabel} onChange={(e) => setResLabel(e.target.value)} />
                <PlacesAutocomplete
                  value={resAddress}
                  onChange={(v) => { setResAddress(v); setResCoords(null); setResPlaceId(null); }}
                  onPlaceSelect={async (place) => { setResAddress(place.description); setResPlaceId(place.placeId); const c = await resolveCoords(place.description, place.placeId); if (c) setResCoords(c); }}
                  placeholder="Address"
                  className="h-7 text-xs"
                  types={[]}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[13px] text-muted-foreground block mb-0.5">Start</label>
                    <Input type="month" className="h-7 text-xs w-full" value={resStart} onChange={(e) => setResStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[13px] text-muted-foreground block mb-0.5">End (blank = current)</label>
                    <Input type="month" className="h-7 text-xs w-full" value={resEnd} onChange={(e) => setResEnd(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-6 text-xs flex-1" disabled={resSaving} onClick={handleAddResidence}>
                    {resSaving ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setAddingResidence(false); setResLabel(""); setResAddress(""); setResCoords(null); setResPlaceId(null); setResStart(""); setResEnd(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showInventoryOverview && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[2000] flex flex-col bg-background border rounded-xl shadow-2xl select-none"
          style={{
            left: inventoryPanel.x,
            top: inventoryPanel.y,
            width: inventoryPanel.w,
            height: inventoryPanel.minimized ? undefined : inventoryPanel.h,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 16px)",
          }}
          onPointerMove={onInventoryDragMove}
          onPointerUp={onInventoryDragEnd}
          onPointerCancel={onInventoryDragEnd}
        >
          <div
            className="flex items-center gap-2 px-3 py-2 border-b cursor-grab active:cursor-grabbing bg-muted/40 rounded-t-xl"
            onPointerDown={onInventoryDragStart}
            onDoubleClick={() => setInventoryPanel((p) => ({ ...p, minimized: !p.minimized }))}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <Boxes className="h-4 w-4 text-emerald-600" />
            <div className="flex-1 text-sm font-semibold">My Tools & Inventory</div>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowInventorySnapMenu((v) => !v); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
                title="Snap to corner"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              {showInventorySnapMenu && (
                <div
                  className="absolute right-0 top-6 z-[2100] grid grid-cols-2 gap-1 p-1.5 rounded-lg border bg-background shadow-xl"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button type="button" onClick={() => snapInventoryToCorner("tl")} className="h-7 w-7 rounded border hover:bg-muted flex items-center justify-center" title="Top-left">
                    <span className="block h-2 w-2 bg-foreground/70 rounded-sm -translate-x-1 -translate-y-1" />
                  </button>
                  <button type="button" onClick={() => snapInventoryToCorner("tr")} className="h-7 w-7 rounded border hover:bg-muted flex items-center justify-center" title="Top-right">
                    <span className="block h-2 w-2 bg-foreground/70 rounded-sm translate-x-1 -translate-y-1" />
                  </button>
                  <button type="button" onClick={() => snapInventoryToCorner("bl")} className="h-7 w-7 rounded border hover:bg-muted flex items-center justify-center" title="Bottom-left">
                    <span className="block h-2 w-2 bg-foreground/70 rounded-sm -translate-x-1 translate-y-1" />
                  </button>
                  <button type="button" onClick={() => snapInventoryToCorner("br")} className="h-7 w-7 rounded border hover:bg-muted flex items-center justify-center" title="Bottom-right">
                    <span className="block h-2 w-2 bg-foreground/70 rounded-sm translate-x-1 translate-y-1" />
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setInventoryPanel((p) => ({ ...p, minimized: !p.minimized })); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
              title={inventoryPanel.minimized ? "Restore" : "Minimize"}
            >
              {inventoryPanel.minimized ? <Square className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowInventoryOverview(false); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {!inventoryPanel.minimized && (
            <>
              <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
                <PersonalInventory
                  focusedPositionId={focusedItem?.id ?? null}
                  focusedPositionLabel={focusedItem ? `${focusedItem.role || "Position"} @ ${focusedItem.company}` : null}
                />
              </div>
              <div
                onPointerDown={onInventoryResizeStart}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
                title="Drag to resize"
                style={{
                  background:
                    "linear-gradient(135deg, transparent 0%, transparent 50%, hsl(var(--muted-foreground) / 0.5) 50%, hsl(var(--muted-foreground) / 0.5) 60%, transparent 60%, transparent 70%, hsl(var(--muted-foreground) / 0.5) 70%, hsl(var(--muted-foreground) / 0.5) 80%, transparent 80%)",
                  borderBottomRightRadius: "0.75rem",
                }}
              />
            </>
          )}
        </div>,
        document.body,
      )}

      {/* Add form */}
      {adding && (
        <div className="space-y-2 mb-3 p-2 border rounded-lg bg-muted/30">
          <Select value={addType} onValueChange={(v) => setAddType(v as typeof addType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="job">💼 Job</SelectItem>
              <SelectItem value="school">🎓 School</SelectItem>
              <SelectItem value="internship">🏢 Internship</SelectItem>
              <SelectItem value="military">🎖️ Military</SelectItem>
              <SelectItem value="volunteer">🤝 Volunteer</SelectItem>
              <SelectItem value="self-employed">🧑‍💻 Self-Employed</SelectItem>
              <SelectItem value="unemployed">🔍 Unemployed</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder={addType === "school" ? "Institution *" : addType === "self-employed" ? "Business name *" : addType === "unemployed" ? "Period label *" : "Company *"} value={company} onChange={(e) => setCompany(e.target.value)} className="h-7 text-xs" />
          {addType === "school" ? (
            <>
              <Input placeholder="Degree (e.g. B.S., M.A.)" value={addDegree} onChange={(e) => setAddDegree(e.target.value)} className="h-7 text-xs" />
              <Input placeholder="Major / Field of study" value={addMajor} onChange={(e) => setAddMajor(e.target.value)} className="h-7 text-xs" />
              <Input placeholder="GPA (optional)" type="number" step="0.01" min="0" max="5" value={addGpa} onChange={(e) => setAddGpa(e.target.value)} className="h-7 text-xs" />
            </>
          ) : (
            <Input placeholder={addType === "military" ? "Rank / Role (optional)" : addType === "volunteer" ? "Role (optional)" : addType === "internship" ? "Internship role (optional)" : addType === "self-employed" ? "Business description (optional)" : addType === "unemployed" ? "Notes (optional)" : "Job title (optional)"} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="h-7 text-xs" />
          )}
          {addType !== "unemployed" && <PlacesAutocomplete value={address} onChange={(v) => { setAddress(v); setAddCoords(null); setAddPlaceId(null); }} onPlaceSelect={handleAddPlaceSelect} placeholder={addType === "school" ? "Campus address *" : addType === "self-employed" ? "Business address *" : "Work address *"} className="h-7 text-xs" types={[]} />}
          <div className="grid grid-cols-2 gap-2">
            <Input type="month" placeholder="Start" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-7 text-xs" />
            <Input type="month" placeholder="End" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-7 text-xs" />
          </div>
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Add
          </Button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No past jobs added yet. Click + to add or <button type="button" className="underline hover:text-foreground" onClick={handleImportFromExperience}>import from experience</button>.
        </p>
      )}

      {/* Search + Sort bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search…"
              className="h-6 text-xs pl-6 pr-2"
            />
            {listSearch && (
              <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setListSearch("")}>
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
          <select
            value={listSort}
            onChange={(e) => setListSort(e.target.value as "newest" | "oldest" | "tenure")}
            className="h-6 text-[10px] rounded border border-input bg-background px-1 text-foreground shrink-0 cursor-pointer"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="tenure">Longest</option>
          </select>
        </div>
      )}

      {/* Time Slider (timeline tab only) */}
      {tab === "timeline" && timeRange && timeRange.min && timeRange.max && (() => {
        const minD = new Date(timeRange.min);
        const maxD = new Date(timeRange.max);
        const minMonth = minD.getFullYear() * 12 + minD.getMonth();
        const maxMonth = maxD.getFullYear() * 12 + maxD.getMonth();
        const steps = maxMonth - minMonth;
        if (steps <= 0) return null;
        const currentVal = timeFilter
          ? new Date(timeFilter + "-01").getFullYear() * 12 + new Date(timeFilter + "-01").getMonth() - minMonth
          : steps;
        const formatMonth = (val: number) => {
          const totalMonths = minMonth + val;
          const y = Math.floor(totalMonths / 12);
          const m = (totalMonths % 12) + 1;
          return `${y}-${String(m).padStart(2, "0")}`;
        };
        return (
          <div className="mb-2.5 p-2 rounded-lg bg-muted/40 border space-y-1.5">
            <button
              type="button"
              className="w-full flex items-center justify-between text-left"
              onClick={() => setShowTimeFilterPanel((p) => !p)}
            >
              <span className="text-xs font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time Filter
              </span>
              <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                <span>{timeFilter ?? "All time"}</span>
                {showTimeFilterPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
            </button>

            {(showTimeFilterPanel || !!timeFilter) && (
              <>
                <div className="flex items-center justify-end">
                  {timeFilter && (
                    <button type="button" className="text-[13px] text-primary hover:underline" onClick={() => onTimeFilterChange(null)}>
                      Clear (all time)
                    </button>
                  )}
                </div>
                <input
                  type="range"
                  min={0}
                  max={steps}
                  step={1}
                  value={currentVal > steps ? steps : currentVal}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= steps) { onTimeFilterChange(null); }
                    else { onTimeFilterChange(formatMonth(v)); }
                  }}
                  className="w-full h-1.5 accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[13px] text-muted-foreground">
                  <span>{formatMonth(0)}</span>
                  {timeFilter && <span className="font-semibold text-foreground">{timeFilter}</span>}
                  <span>Now</span>
                </div>
                {timeFilter && activeResidence && (
                  <div className="flex items-center gap-1 text-[13px] bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5">
                    <span>🏠</span>
                    <span className="font-medium truncate">{activeResidence.label}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate">{activeResidence.address}</span>
                  </div>
                )}
                {timeFilter && !activeResidence && residences.length === 0 && (
                  <p className="text-[13px] text-amber-600 dark:text-amber-400">Add a residence to see your home marker on the map</p>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* List view — most recent first */}
      {tab === "list" && (() => {
        // Group items by category
        const sections: { key: string; label: string; emoji: string; icon: React.ReactNode; items: typeof listItems }[] = [];
        const groups = new Map<string, typeof listItems>();
        for (const w of listItems) {
          const t = w.type ?? "job";
          if (!groups.has(t)) groups.set(t, []);
          groups.get(t)!.push(w);
        }
        const sectionDefs: { key: string; label: string; emoji: string; icon: React.ReactNode }[] = [
          { key: "job", label: "Jobs", emoji: "💼", icon: <Briefcase className="h-3 w-3 text-gray-500" /> },
          { key: "school", label: "Education", emoji: "🎓", icon: <GraduationCap className="h-3 w-3 text-violet-500" /> },
          { key: "internship", label: "Internships", emoji: "🏢", icon: <Briefcase className="h-3 w-3 text-cyan-600" /> },
          { key: "volunteer", label: "Volunteering", emoji: "🤝", icon: <Heart className="h-3 w-3 text-amber-500" /> },
          { key: "military", label: "Military", emoji: "🎖️", icon: <Award className="h-3 w-3 text-emerald-600" /> },
          { key: "self-employed", label: "Self-Employed", emoji: "🧑‍💻", icon: <Monitor className="h-3 w-3 text-amber-700" /> },
          { key: "unemployed", label: "Gaps", emoji: "🔍", icon: <Search className="h-3 w-3 text-red-500" /> },
        ];
        for (const def of sectionDefs) {
          const g = groups.get(def.key);
          if (g && g.length > 0) sections.push({ ...def, items: g });
        }
        // If only one section, don't show headers
        const singleSection = sections.length === 1;
        return (
          <div className="space-y-1">
            {sections.map((sec) => (
              <div key={sec.key}>
                {!singleSection && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full py-1 px-1 rounded hover:bg-muted/50 transition-colors"
                    onClick={() => toggleListSection(sec.key)}
                  >
                    <span className="text-xs">{sec.emoji}</span>
                    <span className="text-sm font-semibold">{sec.label}</span>
                    <span className="text-[13px] text-muted-foreground">({sec.items.length})</span>
                    <ChevronDown className={`h-3 w-3 ml-auto text-muted-foreground transition-transform ${collapsedSections.has(sec.key) ? "-rotate-90" : ""}`} />
                  </button>
                )}
                {!collapsedSections.has(sec.key) && (
                  <div className="space-y-1.5">
                    {sec.items.map((w) => editingId === w.id ? (
            <div key={w.id} className="space-y-1.5 p-2 border rounded-lg bg-muted/30">
              <Input placeholder="Company *" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} className="h-7 text-xs" />
              <Input placeholder="Job title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-7 text-xs" />
              <PlacesAutocomplete value={editAddress} onChange={(v) => { setEditAddress(v); setEditCoords(null); setEditPlaceId(null); }} onPlaceSelect={handleEditPlaceSelect} placeholder="Work address *" className="h-7 text-xs" types={[]} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="month" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="h-7 text-xs" />
                <Input type="month" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="h-7 text-xs" />
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div key={w.id} className="rounded-md hover:bg-muted/50 group">
              <div className="flex items-start justify-between gap-2 p-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {(w.locations?.length ?? 0) > 0 && (
                      <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground transition-transform" onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}>
                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedId === w.id ? "" : "-rotate-90"}`} />
                      </button>
                    )}
                    <p className="text-sm font-medium cursor-pointer hover:underline shrink-0" onClick={() => onFocusJob(w)}>{w.company}</p>
                    {w.scheduleType && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">{w.scheduleType.replace(/_/g, " ")}</span>}
                    {w.workMode && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">{w.workMode}{w.hybridDays != null ? ` ${w.hybridDays}d` : ""}</span>}
                    {w.industry && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">{w.industry}</span>}
                    {w.salaryAmount != null && (
                      <span className="ml-auto shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {w.salaryCurrency === "USD" || !w.salaryCurrency ? "$" : w.salaryCurrency}{w.salaryType === "hourly" ? `${w.salaryAmount}/hr` : w.salaryAmount >= 1000 ? `${Math.round(w.salaryAmount / 1000)}k` : w.salaryAmount}
                      </span>
                    )}
                  </div>
                  {w.type === "school" ? (
                    (w.degree || w.major) && <p className="text-xs text-muted-foreground truncate">{w.degree}{w.degree && w.major ? " in " : ""}{w.major}</p>
                  ) : (
                    w.title && <p className="text-xs text-muted-foreground truncate">{w.title}</p>
                  )}
                  {(w.type !== "unemployed" || w.startDate || w.endDate) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {w.type !== "unemployed" && shortAddress(w.address)}
                      {w.type !== "unemployed" && (w.startDate || w.endDate) && " · "}
                      {(w.startDate || w.endDate) && `${formatYearMonth(w.startDate) ?? "?"} – ${w.endDate ? (formatYearMonth(w.endDate) ?? w.endDate) : "Present"}`}
                      {w.startDate && <span className="ml-1 text-foreground/60">({formatTenure(calcTenureMonths(w.startDate, w.endDate))})</span>}
                    </p>
                  )}
                  {activeResidence && timeFilter && w.type !== "unemployed" && (() => {
                    const ct = commuteTimes.get(w.id);
                    if (ct) return <p className="text-[13px] text-blue-600 dark:text-blue-400">🏠 {ct.durationMin} min · {ct.distanceMi} mi</p>;
                    const dLat = (w.lat - activeResidence.lat) * 69;
                    const dLng = (w.lng - activeResidence.lng) * 69 * Math.cos(((w.lat + activeResidence.lat) / 2) * Math.PI / 180);
                    const dist = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
                    return dist > 1 ? <p className="text-[13px] text-muted-foreground">🏠 ~{dist} mi</p> : null;
                  })()}
                  {showOverlaps && overlapMap.has(w.id) && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {overlapMap.get(w.id)!.map((o) => (
                        <span key={o.id} className="inline-flex items-center gap-0.5 text-[13px] bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 px-1 rounded cursor-pointer hover:bg-cyan-200 dark:hover:bg-cyan-900/60" onClick={(e) => { e.stopPropagation(); onFocusJob(items.find((i) => i.id === o.id)!); }}>
                          <Zap className="h-2 w-2" /> {o.type === "school" ? "🎓" : o.type === "military" ? "🎖️" : o.type === "volunteer" ? "🤝" : o.type === "internship" ? "🏢" : o.type === "self-employed" ? "🧑‍💻" : o.type === "unemployed" ? "🔍" : "💼"} {o.company}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" className="text-muted-foreground hover:text-blue-500" title="Add location" onClick={() => { setAddingLocFor(addingLocFor === w.id ? null : w.id); setExpandedId(w.id); }}>
                    <MapPin className="h-3 w-3" />
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => startEdit(w)}>
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-red-500" onClick={() => handleDelete(w.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Expanded sub-locations */}
              <div className={`grid transition-all duration-200 ease-in-out ${expandedId === w.id ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                {expandedId === w.id && (
                <div className="px-1.5 pb-1.5 space-y-1" ref={(el) => { if (el && expandedId === w.id) el.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}>
                  {(w.locations ?? []).length > 0 && (
                    <div className="pl-2 border-l-2 border-muted space-y-1">
                      {w.locations.map((loc) => {
                        const photos: string[] = (() => { try { return loc.photos ? JSON.parse(loc.photos) : []; } catch { return []; } })();
                        return (
                        <div key={loc.id} className="space-y-1 group/loc">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{loc.label}</p>
                              <div className="flex items-center gap-1">
                                <p className="text-[13px] text-muted-foreground truncate">{loc.address}</p>
                                <button type="button" className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/loc:opacity-100 transition-opacity" title="Copy address" onClick={() => { navigator.clipboard.writeText(loc.address); toast.success("Address copied"); }}>
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </div>
                              {loc.lat != null && loc.lng != null && (
                                <div className="flex items-center gap-1">
                                  <p className="text-xs text-muted-foreground font-mono">📍 {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}</p>
                                  <button type="button" className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/loc:opacity-100 transition-opacity" title="Copy coordinates" onClick={() => { navigator.clipboard.writeText(`${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}`); toast.success("Coordinates copied"); }}>
                                    <Copy className="h-2 w-2" />
                                  </button>
                                </div>
                              )}
                              <span className="text-[13px] bg-muted px-1 rounded">{LOC_TYPES.find((t) => t.value === loc.type)?.label ?? loc.type}</span>
                            </div>
                            <button type="button" className="text-muted-foreground hover:text-red-500 opacity-0 group-hover/loc:opacity-100 transition-opacity shrink-0" onClick={() => handleDeleteLocation(w.id, loc.id)}>
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>

                          {/* Photo gallery */}
                          <div className="flex flex-wrap gap-1 items-center">
                            {photos.map((url) => (
                              <div key={url} className="relative group/photo w-10 h-10 rounded overflow-hidden border">
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity"
                                  onClick={() => handlePhotoDelete(w.id, loc.id, url)}
                                >
                                  <X className="h-3 w-3 text-white" />
                                </button>
                              </div>
                            ))}
                            {photos.length < 5 && (
                              <>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                  className="hidden"
                                  ref={(el) => { photoInputRefs.current[loc.id] = el; }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handlePhotoUpload(w.id, loc.id, f);
                                    e.target.value = "";
                                  }}
                                />
                                <button
                                  type="button"
                                  className="w-10 h-10 rounded border border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                                  onClick={() => photoInputRefs.current[loc.id]?.click()}
                                  disabled={uploadingPhotoFor === loc.id}
                                >
                                  {uploadingPhotoFor === loc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                                </button>
                              </>
                            )}
                            {photos.length > 0 && (
                              <span className="text-xs text-muted-foreground">📷 {photos.length}/5</span>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add sub-location form */}
                  {addingLocFor === w.id && (
                    <div className="space-y-1.5 p-1.5 border rounded bg-muted/20">
                      <Input placeholder="Label (e.g. Downtown office) *" value={locLabel} onChange={(e) => setLocLabel(e.target.value)} className="h-6 text-xs" />
                      <select value={locType} onChange={(e) => { setLocType(e.target.value); if (e.target.value !== "custom") setCustomLocType(""); }} className="w-full h-6 text-xs rounded border bg-background px-1">
                        {LOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      {locType === "custom" && (
                        <Input value={customLocType} onChange={(e) => setCustomLocType(e.target.value)} placeholder="Type name (e.g. Warehouse)" className="h-6 text-xs" />
                      )}
                      <PlacesAutocomplete value={locAddress} onChange={(v) => { setLocAddress(v); setLocCoords(null); setLocPlaceId(null); }} onPlaceSelect={handleLocPlaceSelect} placeholder="Address *" className="h-6 text-xs" types={[]} />
                      <div className="flex gap-1">
                        <Button size="sm" className="flex-1 h-6 text-xs" onClick={() => handleAddLocation(w.id)} disabled={locSaving || (locType === "custom" && !customLocType.trim())}>
                          {locSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Plus className="h-2.5 w-2.5 mr-0.5" />}
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAddingLocFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {addingLocFor !== w.id && (
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5" onClick={() => setAddingLocFor(w.id)}>
                      <Plus className="h-2.5 w-2.5" /> Add location
                    </button>
                  )}
                </div>
              )}
                </div>
              </div>
            </div>
          ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Timeline view — most recent first */}
      {tab === "timeline" && listItems.length > 0 && (
        <div className="relative pl-4 space-y-0">
          {/* Vertical connecting line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          {listItems.map((w, i) => {
            let tenure = "";
            if (w.startDate) {
              const s = new Date(w.startDate + "-01");
              const e = w.endDate ? new Date(w.endDate + "-01") : new Date();
              const m = Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
              tenure = m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;
            }
            // Distance / commute from home (if time filter active) or chronologically-previous role
            let distStr = "";
            if (activeResidence && timeFilter) {
              const ct = commuteTimes.get(w.id);
              if (ct) {
                distStr = `${ct.durationMin} min · ${ct.distanceMi} mi from 🏠`;
              } else {
                // Fallback while loading
                const dLat = (w.lat - activeResidence.lat) * 69;
                const dLng = (w.lng - activeResidence.lng) * 69 * Math.cos(((w.lat + activeResidence.lat) / 2) * Math.PI / 180);
                const dist = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
                if (dist > 1) distStr = `~${dist} mi from 🏠`;
              }
            } else if (i < listItems.length - 1) {
              const prev = listItems[i + 1];
              const dLat = (w.lat - prev.lat) * 69;
              const dLng = (w.lng - prev.lng) * 69 * Math.cos(((w.lat + prev.lat) / 2) * Math.PI / 180);
              const dist = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
              if (dist > 1) distStr = `${dist} mi from prev`;
            }
            const isCurrent = !w.endDate;
            return (
              <div key={w.id} className="relative pb-3 last:pb-0">
                <div className={`absolute -left-4 top-1 w-3.5 h-3.5 rounded-full border-2 ${isCurrent ? "bg-emerald-500 border-emerald-300" : "bg-gray-400 border-gray-300"}`} />
                <div className="ml-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <p className="text-xs font-medium shrink-0 cursor-pointer hover:underline" onClick={() => onFocusJob(w)}>{w.company}</p>
                    {isCurrent && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 rounded">current</span>}
                    {w.scheduleType && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">{w.scheduleType.replace(/_/g, " ")}</span>}
                    {w.workMode && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">{w.workMode}{w.hybridDays != null ? ` ${w.hybridDays}d` : ""}</span>}
                    {w.industry && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">{w.industry}</span>}
                  </div>
                  {w.title && <p className="text-xs text-muted-foreground">{w.title}</p>}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
                    {(w.startDate || w.endDate) && (
                      <p className="text-xs text-muted-foreground">
                        {formatYearMonth(w.startDate) ?? "?"} – {w.endDate ? (formatYearMonth(w.endDate) ?? w.endDate) : "Present"}
                        {tenure && <span className="ml-1 text-foreground/70">({tenure})</span>}
                      </p>
                    )}
                    {distStr && (
                      <p className="text-xs text-muted-foreground italic flex items-center gap-0.5">
                        <Route className="h-2.5 w-2.5" /> {distStr}
                      </p>
                    )}
                  </div>
                  {w.type !== "unemployed" && <p className="text-xs text-muted-foreground truncate">{shortAddress(w.address)}</p>}
                  {showOverlaps && overlapMap.has(w.id) && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {overlapMap.get(w.id)!.map((o) => (
                        <span key={o.id} className="inline-flex items-center gap-0.5 text-[13px] bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 px-1 rounded">
                          <Zap className="h-2 w-2" /> {o.type === "school" ? "🎓" : o.type === "military" ? "🎖️" : o.type === "volunteer" ? "🤝" : o.type === "internship" ? "🏢" : o.type === "self-employed" ? "🧑‍💻" : o.type === "unemployed" ? "🔍" : "💼"} {o.company}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Sub-locations in timeline */}
                  {(w.locations ?? []).length > 0 && (
                    <div className="mt-0.5 pl-2 border-l border-dashed border-muted-foreground/30 space-y-0.5">
                      {w.locations.map((loc) => (
                        <p key={loc.id} className="text-[13px] text-muted-foreground flex items-center gap-0.5 flex-wrap">
                          <MapPin className="h-2 w-2 shrink-0" /> {loc.label} <span className="opacity-60">({LOC_TYPES.find((t) => t.value === loc.type)?.label ?? loc.type})</span>
                          {loc.lat != null && loc.lng != null && <span className="font-mono text-xs opacity-50">📍 {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}</span>}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Compare view — side-by-side role comparison */}
      {tab === "compare" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {([0, 1] as const).map((slot) => (
              <select key={slot} value={compareIds[slot] ?? ""} onChange={(e) => setCompareIds((prev) => { const next = [...prev] as [string | null, string | null]; next[slot] = e.target.value || null; return next; })} className="w-full h-7 text-xs rounded border bg-background px-1">
                <option value="">Select role…</option>
                {listItems.map((w) => (
                  <option key={w.id} value={w.id} disabled={compareIds[1 - slot] === w.id}>
                    {w.company}{w.title ? ` — ${w.title}` : ""}
                  </option>
                ))}
              </select>
            ))}
          </div>
          {(() => {
            const a = compareIds[0] ? items.find((w) => w.id === compareIds[0]) : null;
            const b = compareIds[1] ? items.find((w) => w.id === compareIds[1]) : null;
            if (!a || !b) return <p className="text-xs text-muted-foreground text-center py-4">Select two roles above to compare.</p>;

            function tenure(item: { startDate: string | null; endDate: string | null }) {
              if (!item.startDate) return "—";
              const s = new Date(item.startDate + "-01");
              const e = item.endDate ? new Date(item.endDate + "-01") : new Date();
              const m = Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
              return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;
            }

            function salaryStr(item: { salaryAmount?: number | null; salaryType?: string | null; salaryCurrency?: string | null }) {
              if (!item.salaryAmount) return "—";
              const c = item.salaryCurrency ?? "USD";
              return `${c} ${item.salaryAmount.toLocaleString()}${item.salaryType === "hourly" ? "/hr" : "/yr"}`;
            }

            const rows: { label: string; aVal: string; bVal: string }[] = [
              { label: "Company", aVal: a.company, bVal: b.company },
              { label: "Title", aVal: a.title ?? "—", bVal: b.title ?? "—" },
              { label: "Tenure", aVal: tenure(a), bVal: tenure(b) },
              { label: "Salary", aVal: salaryStr(a), bVal: salaryStr(b) },
              { label: "Bonus", aVal: a.bonusAmount ? `${a.salaryCurrency ?? "USD"} ${a.bonusAmount.toLocaleString()}` : "—", bVal: b.bonusAmount ? `${b.salaryCurrency ?? "USD"} ${b.bonusAmount.toLocaleString()}` : "—" },
              { label: "Work Mode", aVal: a.workMode?.replace("-", " ") ?? "—", bVal: b.workMode?.replace("-", " ") ?? "—" },
              { label: "Team Size", aVal: a.teamSize?.toString() ?? "—", bVal: b.teamSize?.toString() ?? "—" },
              { label: "Company Size", aVal: a.companySize?.replace("-", " ") ?? "—", bVal: b.companySize?.replace("-", " ") ?? "—" },
              { label: "Commute", aVal: a.commuteMinutes ? `${a.commuteMinutes} min` : "—", bVal: b.commuteMinutes ? `${b.commuteMinutes} min` : "—" },
              { label: "PTO", aVal: a.ptoDaysOffered ? `${a.ptoDaysOffered} days` : "—", bVal: b.ptoDaysOffered ? `${b.ptoDaysOffered} days` : "—" },
              { label: "Locations", aVal: (a.locations?.length ?? 0).toString(), bVal: (b.locations?.length ?? 0).toString() },
            ];

            return (
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_1fr] text-xs">
                  <div className="p-1.5 bg-muted/40 font-medium border-b" />
                  <div className="p-1.5 bg-muted/40 font-medium border-b border-l truncate">{a.company}</div>
                  <div className="p-1.5 bg-muted/40 font-medium border-b border-l truncate">{b.company}</div>
                  {rows.map((r) => (
                    <Fragment key={r.label}>
                      <div className="p-1.5 text-muted-foreground border-b">{r.label}</div>
                      <div className="p-1.5 border-b border-l truncate">{r.aVal}</div>
                      <div className="p-1.5 border-b border-l truncate">{r.bVal}</div>
                    </Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      </>
      )}
    </div>
    </div>

    {/* ── Locations Popover (floating below header) ── */}
    {focusedItem && showLocationsPopover && (focusedItem.locations ?? []).length > 0 && (
      <div className="absolute top-[52px] left-[calc(0.75rem+24rem-12rem)] z-[1150] bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-2.5 w-72 max-h-[40vh] overflow-y-auto scrollbar-thin pointer-events-auto">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Locations ({focusedItem.locations.length})</p>
          <button type="button" className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setShowLocationsPopover(false)}>
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="space-y-0.5">
          {focusedItem.locations.map((loc) => {
            const locSkills: string[] = loc.skills ? (() => { try { return JSON.parse(loc.skills); } catch { return []; } })() : [];
            const isEditing = editingLocId === loc.id;
            const isExpanded = expandedLocId === loc.id;
            const isDeleting = deletingLocId === loc.id;
            const typeInfo = LOC_TYPES.find((t) => t.value === loc.type);
            const dateRange = loc.startDate ? `${loc.startDate} – ${loc.endDate ?? "present"}` : null;
            return (
              <div key={loc.id} className="rounded-md border bg-muted/20 group/loc">
                {isEditing ? (
                  <div className="p-2 space-y-1.5">
                    <Input value={editLocLabel} onChange={(e) => setEditLocLabel(e.target.value)} placeholder="Label" className="h-6 text-xs" />
                    <Select value={editLocType} onValueChange={(v) => { setEditLocType(v ?? "daily-workplace"); if (v !== "custom") setEditCustomLocType(""); }}>
                      <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{LOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {editLocType === "custom" && (
                      <Input value={editCustomLocType} onChange={(e) => setEditCustomLocType(e.target.value)} placeholder="Type name (e.g. Warehouse)" className="h-6 text-xs" />
                    )}
                    <div className="flex gap-1">
                      <Input type="month" value={editLocStartDate} onChange={(e) => setEditLocStartDate(e.target.value)} className="h-6 text-xs flex-1" placeholder="Start" />
                      <Input type="month" value={editLocEndDate} onChange={(e) => setEditLocEndDate(e.target.value)} className="h-6 text-xs flex-1" placeholder="End" />
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" className="flex-1 h-6 text-xs" disabled={editLocSaving || !editLocLabel.trim()} onClick={() => handleSaveEditLoc(loc.id)}>
                        {editLocSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-2.5 w-2.5 mr-0.5" /> Save</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingLocId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div role="button" tabIndex={0} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left cursor-pointer" onClick={() => setExpandedLocId(isExpanded ? null : loc.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedLocId(isExpanded ? null : loc.id); }}>
                      <MapPin className="h-3 w-3 shrink-0 text-blue-500" />
                      <span className="text-xs font-medium truncate flex-1">{loc.label}</span>
                      <span className="text-[10px] bg-muted px-1 rounded shrink-0">{typeInfo?.label ?? loc.type}</span>
                      <span className="flex items-center gap-0.5 opacity-0 group-hover/loc:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit" onClick={() => startEditLoc(loc)}>
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button type="button" className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500" title="Delete"
                          disabled={isDeleting} onClick={() => handleDeleteLoc(loc.id)}>
                          {isDeleting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                        </button>
                      </span>
                      <ChevronDown className={`h-2.5 w-2.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                    {isExpanded && (
                      <div className="px-2 pb-2 pt-0.5 space-y-1 border-t">
                        <div className="flex items-center gap-1">
                          <p className="text-[11px] text-muted-foreground truncate flex-1">{loc.address}</p>
                          <button type="button" className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Copy address" onClick={() => { navigator.clipboard.writeText(loc.address); toast.success("Address copied"); }}>
                            <Copy className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        {dateRange && <p className="text-[10px] text-muted-foreground">{dateRange}</p>}
                        {locSkills.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {locSkills.map((s) => (
                              <span key={s} className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1 py-0.5 rounded">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}

    </>
  );
}

/* ── Quick Commute Edit Dialog ──────────────────────────────── */
function QuickCommuteEditDialog({
  open, onOpenChange, commuteProfile, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commuteProfile: CommuteProfile;
  onSaved: (p: CommuteProfile) => void;
}) {
  const qc = useQueryClient();
  const [carYears, setCarYears] = useState<{ text: string; value: string }[]>([]);
  const [carMakes, setCarMakes] = useState<{ text: string; value: string }[]>([]);
  const [carModels, setCarModels] = useState<{ text: string; value: string }[]>([]);
  const [carOptions, setCarOptions] = useState<{ text: string; value: string }[]>([]);
  const [carLoading, setCarLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState({
    vehicleYear: commuteProfile.vehicleYear ?? "",
    vehicleMake: commuteProfile.vehicleMake ?? "",
    vehicleModel: commuteProfile.vehicleModel ?? "",
    vehicleId: commuteProfile.vehicleId ?? "",
    vehicleMpg: commuteProfile.vehicleMpg,
    gasPricePerGallon: commuteProfile.gasPricePerGallon,
    daysInOffice: commuteProfile.daysInOffice,
  });

  // Reset draft when dialog opens
  useEffect(() => {
    if (open) {
      setDraft({
        vehicleYear: commuteProfile.vehicleYear ?? "",
        vehicleMake: commuteProfile.vehicleMake ?? "",
        vehicleModel: commuteProfile.vehicleModel ?? "",
        vehicleId: commuteProfile.vehicleId ?? "",
        vehicleMpg: commuteProfile.vehicleMpg,
        gasPricePerGallon: commuteProfile.gasPricePerGallon,
        daysInOffice: commuteProfile.daysInOffice,
      });
    }
  }, [open, commuteProfile]);

  const fetchMenu = useCallback(async (action: string, params?: Record<string, string>) => {
    const sp = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/vehicle-lookup?${sp}`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.menuItem;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  }, []);

  // Load years on open
  useEffect(() => {
    if (open && carYears.length === 0) fetchMenu("years").then(setCarYears);
  }, [open, carYears.length, fetchMenu]);

  const selectYear = useCallback((y: string | null) => {
    if (!y) return;
    setDraft((d) => ({ ...d, vehicleYear: y, vehicleMake: "", vehicleModel: "", vehicleId: "" }));
    setCarMakes([]); setCarModels([]); setCarOptions([]);
    if (y) fetchMenu("makes", { year: y }).then(setCarMakes);
  }, [fetchMenu]);

  const selectMake = useCallback((m: string | null) => {
    if (!m) return;
    setDraft((d) => ({ ...d, vehicleMake: m, vehicleModel: "", vehicleId: "" }));
    setCarModels([]); setCarOptions([]);
    if (m) fetchMenu("models", { year: draft.vehicleYear, make: m }).then(setCarModels);
  }, [fetchMenu, draft.vehicleYear]);

  const selectModel = useCallback((model: string | null) => {
    if (!model) return;
    setDraft((d) => ({ ...d, vehicleModel: model, vehicleId: "" }));
    setCarOptions([]);
    if (model) fetchMenu("options", { year: draft.vehicleYear, make: draft.vehicleMake, model }).then((opts) => {
      setCarOptions(opts);
      if (opts.length === 1) selectOption(opts[0].value);
    });
  }, [fetchMenu, draft.vehicleYear, draft.vehicleMake]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectOption = useCallback(async (optId: string | null) => {
    if (!optId) return;
    setDraft((d) => ({ ...d, vehicleId: optId }));
    setCarLoading(true);
    try {
      const [vRes, pRes] = await Promise.all([
        fetch(`/api/vehicle-lookup?action=vehicle&id=${optId}`),
        fetch(`/api/vehicle-lookup?action=fuelprices`),
      ]);
      const veh = vRes.ok ? await vRes.json() : null;
      const prices = pRes.ok ? await pRes.json() : null;
      if (veh) {
        const mpg = veh.comb08 || veh.highway08 || veh.city08 || DEFAULT_COMMUTE_PROFILE.vehicleMpg;
        setDraft((d) => ({ ...d, vehicleMpg: mpg }));
        if (prices?.regular) {
          const ft = (veh.fuelType || "").toLowerCase();
          let price = parseFloat(prices.regular);
          if (ft.includes("premium")) price = parseFloat(prices.premium) || price;
          else if (ft.includes("diesel")) price = parseFloat(prices.diesel) || price;
          if (price > 0) setDraft((d) => ({ ...d, gasPricePerGallon: Math.round(price * 100) / 100 }));
        }
      }
    } finally { setCarLoading(false); }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update local commute profile
      const updated: CommuteProfile = {
        ...commuteProfile,
        vehicleYear: draft.vehicleYear || undefined,
        vehicleMake: draft.vehicleMake || undefined,
        vehicleModel: draft.vehicleModel || undefined,
        vehicleId: draft.vehicleId || undefined,
        vehicleMpg: draft.vehicleMpg,
        gasPricePerGallon: draft.gasPricePerGallon,
        daysInOffice: draft.daysInOffice,
      };
      onSaved(updated);
      // Persist to DB profile
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleYear: draft.vehicleYear || null,
          vehicleMake: draft.vehicleMake || null,
          vehicleModel: draft.vehicleModel || null,
          vehicleId: draft.vehicleId || null,
          vehicleMpg: draft.vehicleMpg,
          gasPricePerGallon: draft.gasPricePerGallon,
          daysInOffice: draft.daysInOffice,
        }),
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Car className="h-4 w-4" /> Edit Commute Profile
          </DialogTitle>
          <DialogDescription className="text-xs">
            Update your vehicle and commute defaults. Changes apply immediately to cost calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Vehicle selectors */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Vehicle</Label>
            <Select value={draft.vehicleYear} onValueChange={selectYear}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent className="max-h-48">
                {carYears.map((y) => <SelectItem key={y.value} value={y.value}>{y.text}</SelectItem>)}
              </SelectContent>
            </Select>
            {draft.vehicleYear && (
              <Select value={draft.vehicleMake} onValueChange={selectMake}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Make" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {carMakes.map((m) => <SelectItem key={m.value} value={m.value}>{m.text}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {draft.vehicleYear && draft.vehicleMake && (
              <Select value={draft.vehicleModel} onValueChange={selectModel}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Model" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {carModels.map((m) => <SelectItem key={m.value} value={m.value}>{m.text}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {draft.vehicleYear && draft.vehicleMake && draft.vehicleModel && carOptions.length > 1 && (
              <Select value={draft.vehicleId} onValueChange={selectOption}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Trim / Engine" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {carOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.text}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {carLoading && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading EPA data...
              </p>
            )}
          </div>

          {/* Numeric fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Gas $/gal</Label>
              <Input
                type="number" step="0.10" min="1" max="10"
                value={draft.gasPricePerGallon}
                onChange={(e) => setDraft({ ...draft, gasPricePerGallon: parseFloat(e.target.value) || 3.50 })}
                className="h-8 text-xs text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">MPG</Label>
              <Input
                type="number" step="0.5" min="5" max="150"
                value={draft.vehicleMpg}
                onChange={(e) => setDraft({ ...draft, vehicleMpg: parseFloat(e.target.value) || 27.5 })}
                className="h-8 text-xs text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Days/wk</Label>
              <Input
                type="number" step="1" min="1" max="7"
                value={draft.daysInOffice}
                onChange={(e) => setDraft({ ...draft, daysInOffice: Math.min(7, Math.max(1, parseInt(e.target.value) || 5)) })}
                className="h-8 text-xs text-right"
              />
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Cost: ${(draft.gasPricePerGallon / draft.vehicleMpg).toFixed(2)}/mi · {draft.daysInOffice}d/wk · {draft.daysInOffice * 52} trips/yr
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

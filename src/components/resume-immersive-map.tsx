/// <reference types="@types/google.maps" />
"use client";

/**
 * ResumeImmersiveMap — full-page, viewer-mode counterpart to the editor's
 * job-map work history panel. Shows the candidate's career as an immersive
 * map. Recruiters can browse roles, click a company, and see the same
 * rich detail the candidate sees in their work-mapping editor — read-only.
 *
 * Layout:
 *   • Map fills the viewport
 *   • Top-left:  profile chip (name, headline, location)
 *   • Top-right: "Sections" pill → opens drawer with Skills / Certs / Contact
 *   • Left:      Work History panel (KPIs + role list, click to focus)
 *   • Right:     Company focus card (slides in when a role is selected)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { differenceInMonths } from "date-fns";
import {
  Briefcase,
  GraduationCap,
  Shield,
  Heart,
  Building2,
  MapPin,
  Calendar,
  Clock,
  X,
  Award,
  Code2,
  Mail,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  User as UserIcon,
  Users,
  Search as SearchIcon,
  Images,
  Paperclip,
  Brain,
  Wrench,
  BarChart3,
  Navigation,
  PersonStanding,
  Share2,
  Check,
  Phone,
  Linkedin,
  Github,
  Globe,
  Copy,
  DollarSign,
  Play,
  Pause,
  RotateCcw,
  Route,
  StickyNote,
  Target,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { useIrAnalytics, type IrEventType } from "@/lib/use-ir-analytics";
import RecruiterPanel from "@/components/recruiter-panel";
import { getCalApi } from "@calcom/embed-react";
import { AnnotationViewer } from "@/components/annotation-viewer";
import type { Annotation } from "@/components/annotation-overlay";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

let optionsSet = false;
function ensureOptions() {
  if (!optionsSet && GOOGLE_KEY) {
    setOptions({ key: GOOGLE_KEY, v: "weekly" });
    optionsSet = true;
  }
}

/* ── Types ──────────────────────────────────────────────────────── */

export interface ImmersiveWorkItem {
  id: string;
  type?: string | null;
  company: string;
  role?: string | null;
  title?: string | null;
  department?: string | null;
  address?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive?: boolean;
  /** OSM way ID for building footprint outline (resolved on first focus, cached server-side) */
  osmWayId?: number | null;

  // Rich detail (already present in API response)
  coverImage?: string | null;
  coverImageY?: number | null;
  description?: string | null;
  responsibilities?: string | null;
  techStack?: string | null;
  accomplishments?: string | null;
  industry?: string | null;
  workMode?: string | null;
  scheduleType?: string | null;
  companySize?: string | null;
  teamSize?: number | null;
  managerName?: string | null;

  // Education-specific
  degree?: string | null;
  major?: string | null;

  // Compensation
  salaryAmount?: number | null;
  salaryType?: string | null;
  salaryCurrency?: string | null;
  bonusAmount?: number | null;
  payType?: string | null;
  payFrequency?: string | null;
  hoursPerWeek?: number | null;
  hybridDays?: number | null;
  schedule?: string | null;
  shiftNotes?: string | null;
  payRate?: string | null;

  // Skills / commute / uniform
  skillsUsed?: string | null;
  commuteMinutes?: number | null;
  commuteDistance?: number | null;
  commuteMode?: string | null;
  uniformData?: string | null;

  // Relations
  galleryPhotos?: {
    id: string;
    filePath: string;
    caption?: string | null;
    fileName: string;
    rotation?: number;
    annotations?: Array<{
      id: string;
      kind: string;
      geometry: string;
      title?: string | null;
      body?: string | null;
      color?: string | null;
      tags?: string | null;
      sortOrder?: number | null;
    }>;
  }[];
  attachments?: { id: string; label: string; category: string; fileName: string; filePath: string; fileMime: string; fileSize: number }[];
  equipment?: { id: string; name: string; category: string; manufacturer?: string | null; model?: string | null; photos?: { id: string; filePath: string; isCover: boolean }[] }[];
}

export interface ImmersiveProfile {
  fullName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  schedulingUrl?: string | null;
  contactCtaMessage?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface ImmersiveSkill { id: string; name: string; category: string; proficiency: string }
export interface ImmersiveCert  { id: string; name: string; issuer: string; issueDate: string; expiryDate: string | null; credentialUrl: string | null }

export interface ImmersiveInventoryItem {
  id: string;
  name: string;
  category: string;
  ownership: string;
  manufacturer: string | null;
  model: string | null;
  condition: string;
  proficiency: number | null;
  location: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  currentValue: number | null;
  notes: string | null;
  tags: string[];
  photos: { id: string; filePath: string; caption: string | null; isCover: boolean; focalX: number; focalY: number; zoom: number }[];
}

export interface ImmersiveCompensation {
  period: "annual" | "hourly" | "monthly";
  currency: string;
  salaryMin: number | null;
  salaryTarget: number | null;
  salaryMax: number | null;
  hasHardFloor: boolean;
  employmentTypes: string[];
  openToRelocation: boolean;
  openToEquity: boolean;
  openToBonus: boolean;
  openToSignOn: boolean;
  remotePreference: "any" | "remote" | "hybrid" | "onsite";
  benefitsMustHaves: string[];
  notes: string | null;
  visibility: "public" | "recruiters" | "hidden";
}

interface Props {
  items: ImmersiveWorkItem[];
  profile: ImmersiveProfile | null;
  skills?: ImmersiveSkill[];
  certifications?: ImmersiveCert[];
  summary?: string | null;
  updatedAt?: string | null;
  /** IR slug from the page route — required for engagement-event tracking. */
  slug?: string | null;
  /** Optional approved AccessRequest id (token-based viewers). */
  accessRequestId?: string | null;
  /** Candidate's compensation expectations (sanitized for public consumption). */
  compensation?: ImmersiveCompensation | null;
  /** Approximate home centroid + max one-way commute miles for Recruit Mode. */
  recruitMeta?: {
    homeLat: number | null;
    homeLng: number | null;
    maxCommuteMiles: number | null;
  } | null;
  /** Public-safe personal inventory items (filtered upstream). Empty array hides the toggle. */
  inventory?: ImmersiveInventoryItem[];
}

/* ── Helpers ────────────────────────────────────────────────────── */

const TYPE_META: Record<string, { emoji: string; bg: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  job:             { emoji: "💼", bg: "#6b7280", label: "Past workplace", Icon: Briefcase },
  internship:      { emoji: "🏢", bg: "#0891b2", label: "Internship",     Icon: Briefcase },
  "self-employed": { emoji: "🧑‍💻", bg: "#92400e", label: "Self-Employed",   Icon: Briefcase },
  school:          { emoji: "🎓", bg: "#7c3aed", label: "School",         Icon: GraduationCap },
  military:        { emoji: "🎖️", bg: "#047857", label: "Military",       Icon: Shield },
  volunteer:       { emoji: "🤝", bg: "#d97706", label: "Volunteer",      Icon: Heart },
};
const metaFor = (t?: string | null) => TYPE_META[t || "job"] ?? TYPE_META.job;

function parseYM(s: string | null): Date | null {
  if (!s) return null;
  const [y, m] = s.split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, 1);
}
function fmtYM(s: string | null): string {
  const d = parseYM(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
}
function tenureMonths(start: string | null, end: string | null): number {
  const s = parseYM(start);
  if (!s) return 0;
  const e = end ? parseYM(end) : new Date();
  return e ? Math.max(0, differenceInMonths(e, s)) : 0;
}
function fmtTenure(m: number): string {
  const y = Math.floor(m / 12), r = m % 12;
  if (y > 0 && r > 0) return `${y}y ${r}m`;
  if (y > 0) return `${y}y`;
  return `${r || 1}m`;
}
function markerSize(months: number): number {
  if (months < 3)  return 26;
  if (months < 12) return 30;
  if (months < 36) return 34;
  if (months < 60) return 38;
  if (months < 96) return 42;
  return 44;
}

/** Border ring color based on how recently the role ended (matches editor) */
function recencyRingColor(endDate: string | null | undefined): string {
  if (!endDate) return "#22c55e"; // current
  const end = parseYM(endDate);
  if (!end) return "#9ca3af";
  const now = new Date();
  const monthsAgo = (now.getFullYear() - end.getFullYear()) * 12 + (now.getMonth() - end.getMonth());
  if (monthsAgo <= 24)  return "#34d399";
  if (monthsAgo <= 60)  return "#60a5fa";
  if (monthsAgo <= 120) return "#fbbf24";
  return "#9ca3af";
}

/** Compact year-range badge, e.g. "'19–'22" or "'20–now" */
function yearLabel(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate) return "";
  const sy = startDate.slice(2, 4);
  if (!endDate) return `'${sy}–now`;
  const ey = endDate.slice(2, 4);
  return sy === ey ? `'${sy}` : `'${sy}–'${ey}`;
}
function distMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
function shortLoc(s?: string | null): string {
  if (!s) return "";
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  const last = parts[parts.length - 1].toUpperCase();
  const trimmed = ["USA", "US", "UNITED STATES", "U.S.", "U.S.A."].includes(last)
    ? parts.slice(0, -1)
    : parts;
  return trimmed.slice(-2).join(", ");
}
function parseTechStack(s?: string | null): string[] {
  if (!s) return [];
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}
function parseAccomplishments(s?: string | null): string[] {
  if (!s) return [];
  // Try JSON array first; fall back to newline split
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(String).filter(Boolean);
  } catch { /* fall through */ }
  return s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function parseSkillsUsed(s?: string | null): string[] {
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(String).filter(Boolean);
  } catch { /* fall through */ }
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

function parseUniform(s?: string | null): { enabled?: boolean; category?: string; zones?: Record<string, { item?: string; color?: string; providedBy?: string; notes?: string }> } | null {
  if (!s) return null;
  try {
    const j = JSON.parse(s);
    if (j && typeof j === "object") return j;
  } catch { /* ignore */ }
  return null;
}

function formatPay(item: ImmersiveWorkItem): string | null {
  const cSym = !item.salaryCurrency || item.salaryCurrency === "USD" ? "$" : item.salaryCurrency;
  if (item.salaryAmount != null) {
    const isHourly = item.salaryType === "hourly" || item.payType === "hourly";
    if (isHourly) return `${cSym}${item.salaryAmount}/hr`;
    return `${cSym}${item.salaryAmount.toLocaleString()}/yr`;
  }
  if (item.payRate) return item.payRate;
  return null;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Format a compensation amount with k-shorthand for annual figures, locale-aware currency. */
function fmtCompAmount(n: number, period: "annual" | "hourly" | "monthly", currency: string): string {
  const cur = (currency || "USD").toUpperCase();
  const fmt = (val: number, opts: Intl.NumberFormatOptions = {}) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 0,
        ...opts,
      }).format(val);
    } catch {
      // Unknown currency code → fall back to plain number with code prefix
      return `${cur} ${val.toLocaleString()}`;
    }
  };
  if (period === "hourly") return `${fmt(n, { maximumFractionDigits: 2 })}/hr`;
  if (period === "monthly") return `${fmt(n)}/mo`;
  // annual — k-shorthand using compact notation when ≥ 1000
  if (n >= 1000) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
    } catch {
      return `${cur} ${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
    }
  }
  return fmt(n);
}

/** Build a one-line headline for the compensation chip, e.g. "$140k–$170k · FT · Remote OK". */
function formatCompChip(c: ImmersiveCompensation): string {
  const parts: string[] = [];
  const { salaryMin: min, salaryMax: max, salaryTarget: tgt, period, currency } = c;
  if (min != null && max != null) {
    parts.push(`${fmtCompAmount(min, period, currency)}–${fmtCompAmount(max, period, currency)}`);
  } else if (tgt != null) {
    parts.push(`~${fmtCompAmount(tgt, period, currency)}`);
  } else if (min != null) {
    parts.push(`${fmtCompAmount(min, period, currency)}+`);
  } else if (max != null) {
    parts.push(`up to ${fmtCompAmount(max, period, currency)}`);
  }
  if (c.employmentTypes.length > 0) {
    const short = c.employmentTypes.map(employmentShort).filter(Boolean).join("/");
    if (short) parts.push(short);
  }
  if (c.remotePreference !== "any") {
    parts.push(c.remotePreference === "remote" ? "Remote" : c.remotePreference === "hybrid" ? "Hybrid" : "On-site");
  }
  return parts.join(" · ") || "Open to offers";
}

function employmentShort(t: string): string {
  switch (t) {
    case "full_time": return "FT";
    case "part_time": return "PT";
    case "contract": return "Contract";
    case "1099": return "1099";
    case "internship": return "Intern";
    case "temp": return "Temp";
    default: return "";
  }
}

/** Derive a "negotiation room" signal from min↔max spread. */
function compFlexLabel(c: ImmersiveCompensation): { label: string; cls: string } | null {
  const { salaryMin: min, salaryMax: max } = c;
  if (min == null || max == null || min <= 0) return null;
  if (min === max) return { label: "Firm", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
  const spread = (max - min) / min;
  if (spread >= 0.25) return { label: "Flexible", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
  return { label: "Some flex", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" };
}

function employmentLabel(t: string): string {
  switch (t) {
    case "full_time": return "Full-time";
    case "part_time": return "Part-time";
    case "contract": return "Contract";
    case "1099": return "1099";
    case "internship": return "Internship";
    case "temp": return "Temp";
    default: return t;
  }
}

function benefitLabel(b: string): string {
  return b.replace(/_/g, " ");
}

/* ── Component ──────────────────────────────────────────────────── */

export default function ResumeImmersiveMap({ items, profile, skills = [], certifications = [], summary, updatedAt, slug = null, accessRequestId = null, compensation = null, recruitMeta = null, inventory = [] }: Props) {
  const analytics = useIrAnalytics(slug, accessRequestId);
  const geocoded = useMemo(
    () => items.filter((i) => typeof i.lat === "number" && typeof i.lng === "number") as (ImmersiveWorkItem & { lat: number; lng: number })[],
    [items],
  );

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [viewingTool, setViewingTool] = useState<ImmersiveInventoryItem | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchOpen, setMatchOpen] = useState(false);
  const [jdText, setJdText] = useState("");
  const [matchAnalyzed, setMatchAnalyzed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set());
  const [mapStyle, setMapStyle] = useState<"roadmap" | "satellite" | "hybrid">("roadmap");
  const focused = useMemo(() => items.find((i) => i.id === focusedId) ?? null, [items, focusedId]);

  // Hover prefetch: warm the building-footprint server cache when a row is hovered.
  const prefetchedHoverRef = useRef<Set<string>>(new Set());
  const prefetchFootprint = useCallback((id: string) => {
    if (prefetchedHoverRef.current.has(id)) return;
    const target = items.find((i) => i.id === id);
    if (!target || target.lat == null || target.lng == null) return;
    prefetchedHoverRef.current.add(id);
    fetch("/api/building-footprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [{ id: target.id, lat: target.lat, lng: target.lng, wayId: target.osmWayId ?? null }],
        radiusM: 150,
      }),
    }).catch(() => {
      prefetchedHoverRef.current.delete(id);
    });
  }, [items]);

  // Read ?focus= deep-link on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const f = url.searchParams.get("focus");
    if (f && items.some((i) => i.id === f)) setFocusedId(f);
    // intentionally no deps — run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cal.com inline embed init (only when scheduling URL is a cal.com link)
  const calLink = useMemo(() => {
    const raw = profile?.schedulingUrl?.trim();
    if (!raw) return null;
    const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?cal\.com\/(.+?)\/?(?:\?.*)?$/i);
    return m ? m[1] : null;
  }, [profile?.schedulingUrl]);

  useEffect(() => {
    if (!calLink) return;
    let cancelled = false;
    (async () => {
      try {
        const cal = await getCalApi({ namespace: "resumsify" });
        if (cancelled) return;
        cal("ui", { hideEventTypeDetails: false, layout: "month_view" });
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [calLink]);

  // Sync focus to URL (?focus=)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (focusedId) url.searchParams.set("focus", focusedId);
    else url.searchParams.delete("focus");
    window.history.replaceState({}, "", url.toString());
  }, [focusedId]);

  // Keyboard shortcuts: Esc closes focus, ←/→ navigate
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!focusedId) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setFocusedId(null);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const list = items;
        const idx = list.findIndex((i) => i.id === focusedId);
        if (idx < 0) return;
        const nextIdx = e.key === "ArrowLeft"
          ? (idx - 1 + list.length) % list.length
          : (idx + 1) % list.length;
        e.preventDefault();
        setFocusedId(list[nextIdx].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedId, items]);

  // Available type chips (only types actually present)
  const availableTypes = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => s.add(i.type || "job"));
    return [...s];
  }, [items]);

  const filterActive = typeFilter.size > 0 && typeFilter.size < availableTypes.length;
  const visibleItems = useMemo(
    () => (filterActive ? items.filter((i) => typeFilter.has(i.type || "job")) : items),
    [items, typeFilter, filterActive],
  );
  const visibleGeocoded = useMemo(
    () => visibleItems.filter((i) => typeof i.lat === "number" && typeof i.lng === "number") as (ImmersiveWorkItem & { lat: number; lng: number })[],
    [visibleItems],
  );

  const toggleType = (t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev.size === 0 ? availableTypes : prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      // If user toggled all back on (== all available), reset to "all" sentinel (empty set)
      if (next.size === availableTypes.length) return new Set();
      if (next.size === 0) return new Set(); // can't fully empty — show all
      return next;
    });
  };
  const isTypeOn = (t: string) => typeFilter.size === 0 || typeFilter.has(t);

  // KPIs (exclude schools — those live in the bio card now)
  const kpis = useMemo(() => {
    const workItems = items.filter((i) => (i.type || "").toLowerCase() !== "school");
    const workGeocoded = geocoded.filter((i) => (i.type || "").toLowerCase() !== "school");
    const totalMonths = workItems.reduce((s, i) => s + tenureMonths(i.startDate, i.endDate), 0);
    const cities = new Set(
      workItems.map((i) => i.location || i.address || "").filter(Boolean)
        .map((s) => s.split(",").slice(0, 2).join(",").trim()),
    );
    let miles = 0;
    if (workGeocoded.length >= 2) {
      const lats = workGeocoded.map((g) => g.lat), lngs = workGeocoded.map((g) => g.lng);
      miles = Math.round(distMiles(
        { lat: Math.min(...lats), lng: Math.min(...lngs) },
        { lat: Math.max(...lats), lng: Math.max(...lngs) },
      ));
    }
    return { tenure: fmtTenure(totalMonths), roles: workItems.length, cities: cities.size, miles };
  }, [items, geocoded]);

  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioCardOpen, setBioCardOpen] = useState(true);
  const [eduExpanded, setEduExpanded] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactUnlocked, setContactUnlocked] = useState(false);
  const [contactForm, setContactForm] = useState({
    recruiterName: "",
    recruiterEmail: "",
    recruiterPhone: "",
    company: "",
    jobTitle: "",
    message: "",
    linkedinUrl: "",
    location: "",
    jobType: "",
    salaryMin: "",
    salaryMax: "",
    jobDescription: "",
    joinNetwork: false,
  });
  const [offerDetailsOpen, setOfferDetailsOpen] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [recruitOpen, setRecruitOpen] = useState(false);
  const [recruitMode, setRecruitMode] = useState(false);
  const [showRecruitRadius, setShowRecruitRadius] = useState(false);
  const [jobSite, setJobSite] = useState<{
    address: string;
    lat: number;
    lng: number;
    miles: number | null;
    durationMin: number | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const contactBtnRef = useRef<HTMLButtonElement | null>(null);
  const contactPopoverRef = useRef<HTMLDivElement | null>(null);
  const recruitBtnRef = useRef<HTMLButtonElement | null>(null);
  const recruitPopoverRef = useRef<HTMLDivElement | null>(null);
  const aboutBtnRef = useRef<HTMLButtonElement | null>(null);
  const aboutPopoverRef = useRef<HTMLDivElement | null>(null);

  // Outside click + Escape close for the recruitment popout
  useEffect(() => {
    if (!recruitOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setRecruitOpen(false); }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (recruitPopoverRef.current?.contains(t) || recruitBtnRef.current?.contains(t)) return;
      setRecruitOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [recruitOpen]);

  // Outside click + Escape close for the 'Get to know me' popout
  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setAboutOpen(false); }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (aboutPopoverRef.current?.contains(t) || aboutBtnRef.current?.contains(t)) return;
      setAboutOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [aboutOpen]);

  // Hydrate contact-unlocked state from sessionStorage so a recruiter who already
  // submitted the form on this IR doesn't have to re-fill it on the same browser session.
  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(`ir-contact-unlocked-${slug}`) === "1") {
        setContactUnlocked(true);
      }
    } catch {
      // sessionStorage unavailable (private mode etc.) — silently ignore
    }
  }, [slug]);

  // Outside click + Escape close + focus management for the contact popover
  useEffect(() => {
    if (!contactOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move focus into the popover
    const t = window.setTimeout(() => {
      const first = contactPopoverRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      first?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setContactOpen(false);
        return;
      }
      if (e.key === "Tab" && contactPopoverRef.current) {
        const focusables = contactPopoverRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        contactPopoverRef.current?.contains(target) ||
        contactBtnRef.current?.contains(target)
      ) {
        return;
      }
      setContactOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      // Restore focus to the trigger
      previouslyFocused?.focus?.();
    };
  }, [contactOpen]);

  // Prefill contact form from Recruit Mode jobSite when the form opens
  useEffect(() => {
    if (!contactOpen || !jobSite) return;
    const within = jobSite.miles != null && recruitMeta?.maxCommuteMiles != null
      ? jobSite.miles <= recruitMeta.maxCommuteMiles
      : null;
    setContactForm((prev) => {
      const next = { ...prev };
      if (!prev.location.trim()) next.location = jobSite.address;
      if (!prev.message.trim()) {
        if (within === false) {
          next.message = `FYI — this role is ~${jobSite.miles?.toFixed(1)} mi from my home (above my ${recruitMeta?.maxCommuteMiles} mi commute cap). Would the role support remote or hybrid work?`;
        } else if (within === true) {
          next.message = `Quick note — your job site is within my commute range (~${jobSite.miles?.toFixed(1)} mi · ~${jobSite.durationMin} min driving). Happy to chat further.`;
        }
      }
      return next;
    });
    // intentionally only when contact opens or jobsite changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactOpen, jobSite?.lat, jobSite?.lng, jobSite?.miles]);

  const educationItems = useMemo(
    () => items.filter((i) => (i.type || "").toLowerCase() === "school"),
    [items],
  );

  // Pick the most recent / highest-ranked degree to display inline near the name
  const topEducation = useMemo(() => {
    if (!educationItems.length) return null;
    const rank = (deg?: string | null) => {
      const d = (deg || "").toLowerCase();
      if (/ph\.?d|doctor/.test(d)) return 6;
      if (/master|m\.s|m\.a|mba/.test(d)) return 5;
      if (/bachelor|b\.s|b\.a/.test(d)) return 4;
      if (/associate|a\.s|a\.a/.test(d)) return 3;
      if (/diploma|certificate/.test(d)) return 2;
      if (/high school/.test(d)) return 1;
      return 0;
    };
    return [...educationItems].sort((a, b) => {
      const r = rank(b.degree) - rank(a.degree);
      if (r !== 0) return r;
      const ay = a.endDate || a.startDate || "";
      const by = b.endDate || b.startDate || "";
      return by.localeCompare(ay);
    })[0];
  }, [educationItems]);

  // ── Career timeline scrubber + journey playback ──────────────────
  // Year span is computed from ALL items (including school/military/volunteer)
  // so the scrubber covers the candidate's full life arc.
  const yearSpan = useMemo<[number, number] | null>(() => {
    const nowY = new Date().getFullYear();
    const ys: number[] = [];
    items.forEach((i) => {
      const s = parseYM(i.startDate);
      const e = parseYM(i.endDate);
      if (s) ys.push(s.getFullYear());
      if (e) ys.push(e.getFullYear());
      else if (s) ys.push(nowY);
    });
    if (ys.length === 0) return null;
    return [Math.min(...ys), Math.max(...ys, nowY)];
  }, [items]);

  // Selected year range — initially the full span. We keep [number, number] | null.
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (yearSpan && !yearRange) setYearRange([yearSpan[0], yearSpan[1]]);
  }, [yearSpan, yearRange]);

  // Journey playback
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 2 | 4>(1);
  const [showJourneyLine, setShowJourneyLine] = useState(false);
  const playTimerRef = useRef<number | null>(null);
  // When the user starts playback, we snap the END handle to the start
  // and let it crawl forward year-by-year.
  useEffect(() => {
    if (!playing || !yearSpan) return;
    const tick = () => {
      setYearRange((cur) => {
        if (!cur) return cur;
        const next = cur[1] + 1;
        if (next > yearSpan[1]) {
          setPlaying(false);
          return [yearSpan[0], yearSpan[1]];
        }
        return [cur[0], next];
      });
    };
    const intervalMs = Math.round(1100 / playSpeed);
    playTimerRef.current = window.setInterval(tick, intervalMs);
    return () => {
      if (playTimerRef.current !== null) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [playing, playSpeed, yearSpan]);

  const startPlayback = () => {
    if (!yearSpan) return;
    setYearRange([yearSpan[0], yearSpan[0]]);
    setPlaying(true);
    analytics.track("journey_play", { from: yearSpan[0], to: yearSpan[1] });
  };
  const resetTimeline = () => {
    setPlaying(false);
    if (yearSpan) setYearRange([yearSpan[0], yearSpan[1]]);
  };

  // ── Recruiter Search ────────────────────────────────────────────
  // Build a flat searchable index across the entire IR so a recruiter can
  // type a keyword (e.g. "kubernetes") and instantly see every place it
  // appears — work history, skills, certifications, equipment, etc.
  type SearchHit = {
    /** Stable key */
    key: string;
    /** Group label */
    group: "Work" | "Skill" | "Certification" | "Education" | "Tool" | "Attachment";
    /** Primary line */
    title: string;
    /** Secondary line (company / dates / category) */
    subtitle?: string | null;
    /** Snippet showing the matched text in context */
    snippet?: string | null;
    /** Click target → focus this work item if present */
    focusItemId?: string | null;
    /** Optional badge label (e.g. proficiency) */
    badge?: string | null;
    Icon: React.ComponentType<{ className?: string }>;
    iconClass?: string;
    /** Relevance score (lower = better) */
    score: number;
  };

  const searchResults = useMemo<SearchHit[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/).filter((t) => t.length >= 2);
    if (terms.length === 0) return [];

    const matchAll = (haystack: string): boolean => {
      const h = haystack.toLowerCase();
      return terms.every((t) => h.includes(t));
    };
    const matchAny = (haystack: string): number => {
      const h = haystack.toLowerCase();
      return terms.reduce((acc, t) => acc + (h.includes(t) ? 1 : 0), 0);
    };
    const snippet = (text: string, maxLen = 140): string => {
      const lower = text.toLowerCase();
      let idx = -1;
      for (const t of terms) {
        const i = lower.indexOf(t);
        if (i >= 0) { idx = i; break; }
      }
      if (idx < 0) return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + maxLen - 30);
      return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
    };

    const hits: SearchHit[] = [];

    // Work items: company, role, description, responsibilities, accomplishments, techStack, skillsUsed, industry, location
    for (const it of items) {
      const company = it.company || "";
      const role = it.role || it.title || "";
      const headline = `${role} · ${company}`.trim();
      const fields: Array<{ label: string; text: string }> = [];
      if (it.description) fields.push({ label: "Description", text: it.description });
      if (it.responsibilities) fields.push({ label: "Responsibilities", text: it.responsibilities });
      if (it.accomplishments) fields.push({ label: "Accomplishments", text: it.accomplishments });
      if (it.techStack) fields.push({ label: "Tech", text: it.techStack });
      if (it.skillsUsed) fields.push({ label: "Skills", text: it.skillsUsed });
      if (it.industry) fields.push({ label: "Industry", text: it.industry });
      if (it.degree) fields.push({ label: "Degree", text: it.degree });
      if (it.major) fields.push({ label: "Major", text: it.major });
      if (it.department) fields.push({ label: "Dept", text: it.department });
      if (it.location) fields.push({ label: "Location", text: it.location });

      // Headline match (high priority)
      if (matchAll(headline) || matchAll(company) || matchAll(role)) {
        const isEducation = it.type === "school";
        hits.push({
          key: `wh-${it.id}`,
          group: isEducation ? "Education" : "Work",
          title: role || company,
          subtitle: `${role && company ? company : ""}${yearLabel(it.startDate, it.endDate) ? ` · ${yearLabel(it.startDate, it.endDate)}` : ""}`,
          snippet: it.description ? snippet(it.description) : null,
          focusItemId: it.id,
          Icon: isEducation ? GraduationCap : Briefcase,
          iconClass: isEducation ? "text-violet-500" : "text-blue-500",
          score: 0,
        });
        continue;
      }

      // Field-level matches (one row per matching field, dedup on item)
      const fieldMatches = fields.filter((f) => matchAll(f.text));
      if (fieldMatches.length > 0) {
        const top = fieldMatches[0];
        hits.push({
          key: `wh-${it.id}-${top.label}`,
          group: it.type === "school" ? "Education" : "Work",
          title: headline || it.company,
          subtitle: `Matched in ${fieldMatches.map((f) => f.label).join(", ")}${yearLabel(it.startDate, it.endDate) ? ` · ${yearLabel(it.startDate, it.endDate)}` : ""}`,
          snippet: snippet(top.text),
          focusItemId: it.id,
          Icon: it.type === "school" ? GraduationCap : Briefcase,
          iconClass: it.type === "school" ? "text-violet-500" : "text-blue-500",
          score: 1,
        });
      }

      // Equipment used at this job
      for (const eq of it.equipment || []) {
        const eqText = `${eq.name} ${eq.manufacturer || ""} ${eq.model || ""} ${eq.category}`;
        if (matchAll(eqText)) {
          hits.push({
            key: `wh-${it.id}-eq-${eq.id}`,
            group: "Tool",
            title: eq.name,
            subtitle: `Used at ${company}${yearLabel(it.startDate, it.endDate) ? ` · ${yearLabel(it.startDate, it.endDate)}` : ""}`,
            snippet: [eq.manufacturer, eq.model].filter(Boolean).join(" "),
            focusItemId: it.id,
            Icon: Wrench,
            iconClass: "text-orange-500",
            score: 2,
          });
        }
      }

      // Attachment labels
      for (const at of it.attachments || []) {
        if (matchAll(`${at.label} ${at.category} ${at.fileName}`)) {
          hits.push({
            key: `wh-${it.id}-at-${at.id}`,
            group: "Attachment",
            title: at.label || at.fileName,
            subtitle: `${at.category} · ${company}`,
            focusItemId: it.id,
            Icon: Paperclip,
            iconClass: "text-slate-500",
            score: 3,
          });
        }
      }
    }

    // Skills
    for (const s of skills) {
      if (matchAll(`${s.name} ${s.category} ${s.proficiency}`)) {
        hits.push({
          key: `sk-${s.id}`,
          group: "Skill",
          title: s.name,
          subtitle: s.category,
          badge: s.proficiency,
          // Skill clicks open the skills section in the drawer (no map focus)
          Icon: Brain,
          iconClass: "text-emerald-500",
          score: matchAny(s.name) > 0 ? 0 : 1,
        });
      }
    }

    // Certifications
    for (const c of certifications) {
      if (matchAll(`${c.name} ${c.issuer}`)) {
        hits.push({
          key: `ct-${c.id}`,
          group: "Certification",
          title: c.name,
          subtitle: c.issuer,
          Icon: Award,
          iconClass: "text-amber-500",
          score: 1,
        });
      }
    }

    // Inventory tools (personal, not job-tied)
    for (const inv of inventory) {
      if (matchAll(`${inv.name} ${inv.manufacturer || ""} ${inv.model || ""} ${inv.category} ${inv.tags.join(" ")}`)) {
        hits.push({
          key: `inv-${inv.id}`,
          group: "Tool",
          title: inv.name,
          subtitle: `${inv.category}${inv.manufacturer ? ` · ${inv.manufacturer}` : ""}`,
          Icon: Wrench,
          iconClass: "text-orange-500",
          score: 2,
        });
      }
    }

    return hits.sort((a, b) => a.score - b.score).slice(0, 50);
  }, [searchQuery, items, skills, certifications, inventory]);

  // ── JD Match (Phase B) ─────────────────────────────────────────
  // Build a "candidate vocabulary" from the IR — every skill/tech/tool the
  // candidate has ever touched. Used to detect which JD requirements the
  // candidate has evidence for.
  type Vocab = {
    /** lowercased term → display variant + provenance */
    terms: Map<string, { display: string; sources: Array<{ kind: "skill" | "tech" | "tool" | "cert"; itemId?: string; label: string }> }>;
    /** All work-history descriptive text concatenated, lowercased — for "soft" matches */
    softCorpus: string;
  };

  const candidateVocab = useMemo<Vocab>(() => {
    const terms = new Map<string, { display: string; sources: Array<{ kind: "skill" | "tech" | "tool" | "cert"; itemId?: string; label: string }> }>();
    const softParts: string[] = [];

    const add = (raw: string, source: { kind: "skill" | "tech" | "tool" | "cert"; itemId?: string; label: string }) => {
      const t = raw.trim();
      if (t.length < 2) return;
      const key = t.toLowerCase();
      const existing = terms.get(key);
      if (existing) {
        existing.sources.push(source);
      } else {
        terms.set(key, { display: t, sources: [source] });
      }
    };

    for (const s of skills) add(s.name, { kind: "skill", label: `Skill (${s.proficiency})` });
    for (const c of certifications) add(c.name, { kind: "cert", label: `Cert from ${c.issuer}` });

    for (const it of items) {
      const label = `${it.role || it.title || ""} · ${it.company}`.trim();
      for (const t of parseTechStack(it.techStack)) add(t, { kind: "tech", itemId: it.id, label });
      for (const t of parseSkillsUsed(it.skillsUsed)) add(t, { kind: "tech", itemId: it.id, label });
      for (const eq of it.equipment || []) add(eq.name, { kind: "tool", itemId: it.id, label });

      if (it.description) softParts.push(it.description);
      if (it.responsibilities) softParts.push(it.responsibilities);
      if (it.accomplishments) softParts.push(it.accomplishments);
      if (it.industry) softParts.push(it.industry);
    }
    for (const inv of inventory) add(inv.name, { kind: "tool", label: `Personal: ${inv.category}` });

    return { terms, softCorpus: softParts.join("\n").toLowerCase() };
  }, [items, skills, certifications, inventory]);

  // Stopwords for JD requirement extraction
  const JD_STOP = new Set([
    "the","and","for","with","you","your","our","will","that","this","are","have","has","not","but",
    "from","into","using","use","used","work","working","experience","years","year","plus","preferred",
    "required","must","should","strong","ability","able","skills","skill","knowledge","understanding",
    "include","including","etc","such","various","across","over","more","than","least","most","other",
    "all","any","new","day","team","teams","environment","environments","role","roles","position","positions",
    "candidate","candidates","ideal","looking","seeking","join","help","build","builds","building","develop",
    "develops","developing","design","designs","designing","manage","manages","managing","lead","leads","leading",
    "support","supports","supporting","ensure","ensures","ensuring","drive","drives","driving","work","works",
    "responsibilities","requirements","qualifications","what","who","where","when","how","why","etc","also",
    "well","good","great","excellent","proven","track","record","years\u2019","yrs","yr","best","practices",
  ]);

  type MatchReport = {
    score: number;
    /** Vocab terms that explicitly appear in the JD — strong evidence */
    strong: Array<{ term: string; sources: Vocab["terms"] extends Map<string, infer V> ? V : never }>;
    /** JD-extracted phrases that don't match vocab but DO appear in candidate's free-text — partial evidence */
    partial: Array<{ term: string }>;
    /** JD-extracted phrases with no match anywhere — gaps */
    gaps: Array<{ term: string }>;
    /** Strong vocab not asked for in JD but recently used — bonus */
    bonus: Array<{ term: string; sources: Vocab["terms"] extends Map<string, infer V> ? V : never }>;
    /** Any years-of-experience phrases extracted */
    yearsAsked: number | null;
    /** Total candidate tenure in years (for years comparison) */
    candidateYears: number;
  };

  const matchReport = useMemo<MatchReport | null>(() => {
    if (!matchAnalyzed) return null;
    const jd = jdText.trim();
    if (jd.length < 20) return null;
    const jdLower = jd.toLowerCase();

    // 1. Strong matches: any vocab term that appears as a whole word in the JD
    const strong: MatchReport["strong"] = [];
    const matchedKeys = new Set<string>();
    for (const [key, val] of candidateVocab.terms) {
      // Word boundary match (escape regex special chars)
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
      if (re.test(jdLower)) {
        strong.push({ term: val.display, sources: val });
        matchedKeys.add(key);
      }
    }

    // 2. Extract candidate JD requirement phrases (n-grams of capitalized/quoted/bulleted terms)
    // Heuristic: look at lines that are bullets or after "experience with", "knowledge of", "proficient in", etc.
    const requirementPhrases = new Set<string>();
    const lines = jd.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim().replace(/^[-•*–·]\s*/, "");
      if (!trimmed) continue;
      // Phrase after common requirement leaders
      const leaderRe = /\b(experience (?:with|in|using)|knowledge of|proficien(?:cy|t) (?:with|in)|familiar(?:ity)? with|expertise (?:in|with)|skills? (?:in|with)|background in|hands-on (?:with|in)|working (?:knowledge of|with))\s+([^.,;:()]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = leaderRe.exec(line)) !== null) {
        const phrase = m[2].trim();
        // Split on conjunctions
        for (const piece of phrase.split(/\s*(?:,|\band\b|\bor\b|\/)\s*/i)) {
          const p = piece.trim().replace(/[.,;:()]+$/, "");
          if (p.length >= 2 && p.length <= 40) requirementPhrases.add(p);
        }
      }
    }
    // Also pull capitalized acronyms / TitleCase tokens from anywhere
    const capRe = /\b([A-Z][A-Za-z0-9+#.\-]{1,}(?:\.[a-z]+)?)\b/g;
    let cm: RegExpExecArray | null;
    while ((cm = capRe.exec(jd)) !== null) {
      const tok = cm[1];
      if (tok.length >= 2 && tok.length <= 30 && !JD_STOP.has(tok.toLowerCase())) {
        requirementPhrases.add(tok);
      }
    }

    // 3. Bucket each requirement phrase into strong / partial / gap
    const partial: MatchReport["partial"] = [];
    const gaps: MatchReport["gaps"] = [];
    const seenLower = new Set<string>();
    for (const phrase of requirementPhrases) {
      const lower = phrase.toLowerCase();
      if (seenLower.has(lower)) continue;
      seenLower.add(lower);
      // Skip if it's a stopword fragment or already a strong match
      if (JD_STOP.has(lower)) continue;
      if (matchedKeys.has(lower)) continue;
      // Skip generic fluff
      if (lower.length < 3) continue;

      // Partial: present in candidate's free-text but not as a tagged skill/tech
      if (candidateVocab.softCorpus.includes(lower)) {
        partial.push({ term: phrase });
      } else {
        gaps.push({ term: phrase });
      }
    }

    // 4. Bonus: vocab terms NOT asked for that come from the most recent role
    const recentItem = items
      .filter((i) => !i.endDate || tenureMonths(i.startDate, i.endDate) > 0)
      .sort((a, b) => (b.endDate || "9999").localeCompare(a.endDate || "9999"))[0];
    const bonus: MatchReport["bonus"] = [];
    if (recentItem) {
      const recentTerms = [...parseTechStack(recentItem.techStack), ...parseSkillsUsed(recentItem.skillsUsed)];
      for (const t of recentTerms) {
        const key = t.trim().toLowerCase();
        if (key.length < 2) continue;
        if (matchedKeys.has(key)) continue;
        const v = candidateVocab.terms.get(key);
        if (v && !bonus.some((b) => b.term.toLowerCase() === key)) {
          bonus.push({ term: v.display, sources: v });
        }
        if (bonus.length >= 6) break;
      }
    }

    // 5. Years ask & candidate total
    let yearsAsked: number | null = null;
    const yrMatch = jd.match(/(\d+)\s*\+?\s*(?:to\s*\d+\s*)?(?:years?|yrs?)\b/i);
    if (yrMatch) yearsAsked = parseInt(yrMatch[1], 10);
    const candidateMonths = items.reduce((sum, i) => sum + tenureMonths(i.startDate, i.endDate), 0);
    const candidateYears = Math.round((candidateMonths / 12) * 10) / 10;

    // 6. Score: strong vs (strong + partial*0.5 + gaps)
    const denom = strong.length + partial.length * 0.5 + gaps.length;
    const score = denom === 0 ? 0 : Math.round((strong.length / denom) * 100);

    // Limit list sizes for UX
    return {
      score,
      strong: strong.slice(0, 30),
      partial: partial.slice(0, 15),
      gaps: gaps.slice(0, 15),
      bonus: bonus.slice(0, 6),
      yearsAsked,
      candidateYears,
    };
  }, [matchAnalyzed, jdText, candidateVocab, items]);

  // ⌘/Ctrl+K opens search; Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (searchOpen) setSearchOpen(false);
        else if (matchOpen) setMatchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, matchOpen]);

  const recruitTrigger = (compensation || kpis.roles > 0 || topEducation) ? (
    <div className="relative shrink-0">
      <button
        ref={recruitBtnRef}
        type="button"
        onClick={() => {
          setRecruitOpen((v) => {
            if (!v) analytics.track("comp_view");
            return !v;
          });
        }}
        aria-expanded={recruitOpen}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white dark:bg-emerald-500 px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors shadow-sm"
        title="Recruitment card — at-a-glance fit signals"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Recruitment
        {recruitOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
      {recruitOpen && (
        <div
          ref={recruitPopoverRef}
          role="dialog"
          aria-modal="false"
          aria-label="Recruitment card"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-80 max-h-[70vh] overflow-y-auto scrollbar-thin rounded-lg border bg-background shadow-2xl p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Recruitment Card
            </span>
            <button
              type="button"
              onClick={() => setRecruitOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Enter Recruit Mode */}
          {recruitMeta && recruitMeta.homeLat != null && recruitMeta.homeLng != null && recruitMeta.maxCommuteMiles != null && (
            <button
              type="button"
              onClick={() => {
                setRecruitOpen(false);
                setRecruitMode(true);
                analytics.track("recruit_mode_open");
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 py-1.5 transition-colors"
              title="Drop a job site and instantly check if it's within travel range"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Enter Recruit Mode
              <span className="text-[10px] opacity-80">· {recruitMeta.maxCommuteMiles} mi radius</span>
            </button>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-1.5">
            {kpis.roles > 0 && kpis.tenure && (
              <div className="rounded-md border bg-sky-500/10 border-sky-500/30 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-sky-700 dark:text-sky-300 leading-none flex items-center gap-1">
                  <Briefcase className="h-2.5 w-2.5" /> Experience
                </div>
                <div className="text-xs font-semibold text-sky-900 dark:text-sky-100 mt-1 truncate">{kpis.tenure}</div>
                <div className="text-[10px] text-sky-700/80 dark:text-sky-300/80 truncate">{kpis.roles} role{kpis.roles === 1 ? "" : "s"} · {kpis.cities} {kpis.cities === 1 ? "city" : "cities"}</div>
              </div>
            )}
            {topEducation && (() => {
              const credential = [topEducation.degree, topEducation.major].filter(Boolean).join(", ");
              const display = topEducation.degree || credential || topEducation.company;
              return (
                <button
                  type="button"
                  onClick={() => {
                    setFocusedId(topEducation.id);
                    setRecruitOpen(false);
                    analytics.track("education_click", { workItemId: topEducation.id, label: display });
                  }}
                  className="text-left rounded-md border bg-violet-500/10 border-violet-500/30 px-2 py-1.5 hover:brightness-110 transition-colors"
                  title={credential ? `${credential} · ${topEducation.company}` : topEducation.company}
                >
                  <div className="text-[9px] uppercase tracking-wider text-violet-700 dark:text-violet-300 leading-none flex items-center gap-1">
                    <GraduationCap className="h-2.5 w-2.5" /> Education
                  </div>
                  <div className="text-xs font-semibold text-violet-900 dark:text-violet-100 mt-1 truncate">{display}</div>
                  {topEducation.company && (
                    <div className="text-[10px] text-violet-700/80 dark:text-violet-300/80 truncate">{topEducation.company}</div>
                  )}
                </button>
              );
            })()}
          </div>

          {/* Compensation block */}
          {compensation && (compensation.salaryMin != null || compensation.salaryMax != null || compensation.salaryTarget != null || compensation.employmentTypes.length > 0 || compensation.remotePreference !== "any") && (
            <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 px-2.5 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300 shrink-0" />
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 truncate">
                  {formatCompChip(compensation)}
                </span>
                {(() => {
                  const flex = compFlexLabel(compensation);
                  return flex ? (
                    <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${flex.cls}`}>
                      {flex.label}
                    </span>
                  ) : null;
                })()}
              </div>
              {(compensation.employmentTypes.length > 0 || compensation.remotePreference !== "any") && (
                <div className="flex items-center gap-1 flex-wrap">
                  {compensation.employmentTypes.map((t) => (
                    <span key={t} className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 text-[10px] font-medium">
                      {employmentLabel(t)}
                    </span>
                  ))}
                  {compensation.remotePreference !== "any" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 text-[10px] font-medium capitalize">
                      {compensation.remotePreference}
                    </span>
                  )}
                </div>
              )}
              {(compensation.openToRelocation || compensation.openToEquity || compensation.openToSignOn || compensation.openToBonus) && (
                <div className="text-[11px] text-emerald-800 dark:text-emerald-200">
                  <span className="font-medium">Open to:</span>{" "}
                  {[
                    compensation.openToBonus && "bonus",
                    compensation.openToEquity && "equity",
                    compensation.openToSignOn && "sign-on",
                    compensation.openToRelocation && "relocation",
                  ].filter(Boolean).join(", ")}
                </div>
              )}
              {compensation.benefitsMustHaves.length > 0 && (
                <div className="text-[11px] text-emerald-800 dark:text-emerald-200">
                  <span className="font-medium">Must-haves:</span> {compensation.benefitsMustHaves.map(benefitLabel).join(", ")}
                </div>
              )}
              {compensation.notes && (
                <p className="text-[11px] text-emerald-800 dark:text-emerald-200 whitespace-pre-line">{compensation.notes}</p>
              )}
              {compensation.hasHardFloor && (
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 italic">
                  Candidate has set a private minimum floor.
                </p>
              )}
            </div>
          )}

          {!compensation && (
            <p className="text-[11px] text-muted-foreground italic px-1">
              Candidate hasn&apos;t shared compensation expectations publicly.
            </p>
          )}
        </div>
      )}
    </div>
  ) : null;

  const searchTrigger = (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      title="Search this resume (Ctrl/⌘ K)"
      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
    >
      <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden md:inline-flex items-center rounded border bg-muted/60 px-1 py-0.5 text-[9px] font-mono text-muted-foreground ml-0.5">
        ⌘K
      </kbd>
    </button>
  );

  const matchTrigger = (
    <button
      type="button"
      onClick={() => setMatchOpen(true)}
      title="Paste a job description to see how this candidate matches"
      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
    >
      <Target className="h-3.5 w-3.5 text-violet-500" />
      <span className="hidden sm:inline">Match JD</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-gray-950">
      {/* Map */}
      <ImmersiveMapView
        items={visibleGeocoded}
        focusedId={focusedId}
        onFocus={(id) => {
          setFocusedId(id);
          const w = visibleGeocoded.find((x) => x.id === id);
          const label = w ? `${w.role || w.title || "Role"} @ ${w.company}` : null;
          analytics.track("role_click", { workItemId: id, label });
        }}
        mapStyle={mapStyle}
        yearRange={yearRange}
        playing={playing}
        showJourneyLine={showJourneyLine}
        recruitMode={recruitMode}
        recruitHome={recruitMeta && recruitMeta.homeLat != null && recruitMeta.homeLng != null ? { lat: recruitMeta.homeLat, lng: recruitMeta.homeLng } : null}
        recruitRadiusMiles={showRecruitRadius ? (recruitMeta?.maxCommuteMiles ?? null) : null}
        jobSite={jobSite ? { lat: jobSite.lat, lng: jobSite.lng } : null}
        onJobSitePicked={(p) => {
          setJobSite({ address: p.address, lat: p.lat, lng: p.lng, miles: null, durationMin: null, loading: true, error: null });
          analytics.track("job_site_dropped", { address: p.address });
        }}
        onJobSiteResult={(r) => {
          setJobSite((prev) => prev ? { ...prev, miles: r.miles, durationMin: r.durationMin, loading: false, error: r.error ?? null } : prev);
          if (r.miles != null && recruitMeta?.maxCommuteMiles != null) {
            analytics.track(r.miles <= recruitMeta.maxCommuteMiles ? "radius_match" : "radius_miss", { miles: r.miles });
          }
        }}
      />

      {/* Recruit Mode top banner */}
      {recruitMode && recruitMeta && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[min(640px,calc(100vw-7rem))] rounded-xl bg-background/95 backdrop-blur-md border shadow-xl px-3 py-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Recruit Mode
            </span>
            <span className="text-[10px] text-muted-foreground">
              {recruitMeta.maxCommuteMiles ? `${recruitMeta.maxCommuteMiles} mi radius from home` : "no radius set"}
            </span>
            {recruitMeta.maxCommuteMiles ? (
              <button
                type="button"
                onClick={() => setShowRecruitRadius((s) => !s)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                title={showRecruitRadius ? "Hide radius ring" : "Show radius ring"}
              >
                {showRecruitRadius ? "Hide ring" : "Show ring"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setRecruitMode(false);
                setJobSite(null);
                analytics.track("recruit_mode_close");
              }}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Exit Recruit Mode"
            >
              <X className="h-3.5 w-3.5" /> Exit
            </button>
          </div>

          {/* Job-site autocomplete input — handled inside ImmersiveMapView via portal-like ref attachment */}
          <input
            id="ir-recruit-jobsite-input"
            type="text"
            placeholder="Enter a job site address to check commute…"
            className="w-full text-xs h-8 px-2.5 rounded-md border bg-background placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoComplete="off"
          />

          {/* Result banner */}
          {jobSite && (
            <div className="mt-1.5 flex items-start gap-2 text-[11px]">
              {jobSite.loading ? (
                <span className="text-muted-foreground">Calculating distance…</span>
              ) : jobSite.error ? (
                <span className="text-red-600 dark:text-red-400">{jobSite.error}</span>
              ) : jobSite.miles != null ? (() => {
                const within = recruitMeta.maxCommuteMiles != null && jobSite.miles <= recruitMeta.maxCommuteMiles;
                return (
                  <div className={`flex-1 rounded-md px-2 py-1.5 border ${within ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-100" : "bg-red-500/10 border-red-500/40 text-red-900 dark:text-red-100"}`}>
                    <div className="font-semibold">
                      {within ? "✓ Within range" : "✗ Outside range"} · {jobSite.miles.toFixed(1)} mi
                      {jobSite.durationMin != null && ` · ~${jobSite.durationMin} min driving`}
                    </div>
                    <div className="text-[10px] opacity-80 truncate">{jobSite.address}</div>
                  </div>
                );
              })() : null}
              {jobSite && !jobSite.loading && jobSite.miles != null && (
                <button
                  type="button"
                  onClick={() => {
                    setContactOpen(true);
                    analytics.track("contact_open");
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium px-2 py-1 hover:bg-primary/90"
                  title="Send this job to the candidate (prefilled)"
                >
                  <Mail className="h-3 w-3" /> Send
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setJobSite(null);
                  const el = document.getElementById("ir-recruit-jobsite-input") as HTMLInputElement | null;
                  if (el) el.value = "";
                }}
                className="text-muted-foreground hover:text-foreground"
                title="Clear job site"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Top-right sections pill */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="absolute top-3 right-3 z-30 inline-flex items-center gap-2 rounded-xl bg-background/95 backdrop-blur-md border px-3 py-2 text-sm font-medium text-foreground shadow-xl hover:bg-muted/40 transition-colors"
      >
        <Layers className="h-4 w-4 text-muted-foreground" />
        More
      </button>

      {/* Recruiter search modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4 bg-background/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-background border shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${profile?.fullName?.split(" ")[0] || "this candidate"}'s experience, skills, tools…`}
                className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                  title="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center rounded border bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {searchQuery.trim().length < 2 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <SearchIcon className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  <p>Start typing to search across work history, skills, tools, and certifications.</p>
                  <p className="mt-2 text-xs opacity-70">Try &ldquo;kubernetes&rdquo;, &ldquo;led team&rdquo;, or a job title.</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No matches for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <ul className="divide-y">
                  {(["Work", "Education", "Skill", "Certification", "Tool", "Attachment"] as const).map((group) => {
                    const groupHits = searchResults.filter((h) => h.group === group);
                    if (groupHits.length === 0) return null;
                    return (
                      <li key={group} className="py-1">
                        <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                          {group} <span className="opacity-60 font-normal">({groupHits.length})</span>
                        </div>
                        <ul>
                          {groupHits.map((h) => (
                            <li key={h.key}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (h.focusItemId) {
                                    setFocusedId(h.focusItemId);
                                  } else if (h.group === "Skill" || h.group === "Certification") {
                                    setDrawerOpen(true);
                                  } else if (h.group === "Tool") {
                                    setToolsOpen(true);
                                  }
                                  setSearchOpen(false);
                                }}
                                className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                              >
                                <h.Icon className={`h-4 w-4 mt-0.5 shrink-0 ${h.iconClass || "text-muted-foreground"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">{h.title}</span>
                                    {h.badge && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize shrink-0">
                                        {h.badge}
                                      </span>
                                    )}
                                  </div>
                                  {h.subtitle && (
                                    <div className="text-xs text-muted-foreground truncate">{h.subtitle}</div>
                                  )}
                                  {h.snippet && (
                                    <div className="text-xs text-muted-foreground/90 mt-0.5 line-clamp-2">
                                      {h.snippet}
                                    </div>
                                  )}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="px-4 py-2 border-t text-[10px] text-muted-foreground bg-muted/20 flex items-center justify-between">
                <span>{searchResults.length} {searchResults.length === 1 ? "result" : "results"}</span>
                <span>Click a result to jump to it on the map</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* JD Match modal (Phase B) */}
      {matchOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh] px-4 bg-background/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setMatchOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-background border shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-200 flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
              <Target className="h-4 w-4 text-violet-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Match a job description</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Paste a JD to instantly see how {profile?.fullName?.split(" ")[0] || "this candidate"} stacks up.
                </div>
              </div>
              {matchAnalyzed && (
                <button
                  type="button"
                  onClick={() => { setMatchAnalyzed(false); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground border rounded px-2 py-1"
                  title="Edit the JD and re-analyze"
                >
                  Edit JD
                </button>
              )}
              <button
                type="button"
                onClick={() => setMatchOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!matchAnalyzed ? (
                <div className="p-4 space-y-3">
                  <textarea
                    autoFocus
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder={"Paste the full job description here…\n\nExample:\n• 5+ years of experience with Kubernetes and Terraform\n• Strong knowledge of AWS, observability, and CI/CD\n• Experience leading platform migrations"}
                    className="w-full h-72 rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Analysis runs locally in your browser — nothing is sent to a server.
                    </p>
                    <div className="flex items-center gap-2">
                      {jdText && (
                        <button
                          type="button"
                          onClick={() => setJdText("")}
                          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={jdText.trim().length < 20}
                        onClick={() => setMatchAnalyzed(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5 transition-colors"
                      >
                        <Target className="h-3.5 w-3.5" />
                        Analyze match
                      </button>
                    </div>
                  </div>
                </div>
              ) : !matchReport ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Paste a longer job description to analyze (at least 20 characters).
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Score header */}
                  <div className="rounded-xl border bg-gradient-to-br from-violet-500/10 to-blue-500/10 p-4 flex items-center gap-4">
                    <div className="relative shrink-0">
                      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke={matchReport.score >= 70 ? "#10b981" : matchReport.score >= 40 ? "#f59e0b" : "#ef4444"}
                          strokeWidth="3"
                          strokeDasharray={`${matchReport.score} 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold">{matchReport.score}%</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold mb-1">
                        {matchReport.score >= 70 ? "Strong match" : matchReport.score >= 40 ? "Partial match" : "Light match"}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-1">
                          <div className="font-semibold text-emerald-700 dark:text-emerald-300">{matchReport.strong.length}</div>
                          <div className="text-muted-foreground">strong</div>
                        </div>
                        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1">
                          <div className="font-semibold text-amber-700 dark:text-amber-300">{matchReport.partial.length}</div>
                          <div className="text-muted-foreground">partial</div>
                        </div>
                        <div className="rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-1">
                          <div className="font-semibold text-rose-700 dark:text-rose-300">{matchReport.gaps.length}</div>
                          <div className="text-muted-foreground">gaps</div>
                        </div>
                      </div>
                      {matchReport.yearsAsked != null && (
                        <div className="text-[11px] text-muted-foreground mt-2">
                          Experience asked: <span className="font-medium text-foreground">{matchReport.yearsAsked}+ yrs</span>
                          {" · "}Candidate has: <span className={`font-medium ${matchReport.candidateYears >= matchReport.yearsAsked ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>~{matchReport.candidateYears} yrs</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Strong matches */}
                  {matchReport.strong.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Strong matches ({matchReport.strong.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {matchReport.strong.map((s) => {
                          const firstSourceWithItem = s.sources.sources.find((x) => x.itemId);
                          return (
                            <button
                              key={s.term}
                              type="button"
                              onClick={() => {
                                if (firstSourceWithItem?.itemId) {
                                  setFocusedId(firstSourceWithItem.itemId);
                                  setMatchOpen(false);
                                } else {
                                  // Skill/cert — open Search prefilled with term
                                  setSearchQuery(s.term);
                                  setSearchOpen(true);
                                  setMatchOpen(false);
                                }
                              }}
                              title={s.sources.sources.map((x) => x.label).join(" · ")}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs hover:bg-emerald-500/25 transition-colors"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {s.term}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Partial matches */}
                  {matchReport.partial.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Mentioned in their experience ({matchReport.partial.length})
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Found in role descriptions but not tagged as a primary skill.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchReport.partial.map((p) => (
                          <button
                            key={p.term}
                            type="button"
                            onClick={() => {
                              setSearchQuery(p.term);
                              setSearchOpen(true);
                              setMatchOpen(false);
                            }}
                            title="See where this is mentioned"
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-xs hover:bg-amber-500/25 transition-colors"
                          >
                            <SearchIcon className="h-3 w-3" />
                            {p.term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gaps */}
                  {matchReport.gaps.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 mb-2">
                        <XCircle className="h-3.5 w-3.5" />
                        Not found in resume ({matchReport.gaps.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {matchReport.gaps.map((g) => (
                          <span
                            key={g.term}
                            className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-xs"
                          >
                            {g.term}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 italic">
                        Worth asking the candidate about — these may simply be undocumented.
                      </p>
                    </div>
                  )}

                  {/* Bonus */}
                  {matchReport.bonus.length > 0 && (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
                        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                        Recent strengths not in your JD
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        From their most recent role — could be relevant adjacent value.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchReport.bonus.map((b) => (
                          <span
                            key={b.term}
                            className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-xs"
                          >
                            {b.term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recruiter save + notes (anonymous, cookie-keyed) — rendered inside the bottom action bar */}

      {/* Recency legend (bottom-left) */}
      <div className="absolute bottom-3 left-3 z-20 rounded-xl bg-background/95 backdrop-blur-md border shadow-xl px-2.5 py-2 text-[10px] pointer-events-none">
        <div className="flex items-center gap-1 text-muted-foreground mb-1 font-medium uppercase tracking-wider">
          <Sparkles className="h-3 w-3" />
          Recency
        </div>
        <div className="flex items-center gap-2 flex-wrap max-w-[260px]">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#10b981" }} />Current</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#3b82f6" }} />≤2y</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#8b5cf6" }} />≤5y</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#a855f7" }} />≤10y</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#9ca3af" }} />Older</span>
        </div>
      </div>

      {/* Career timeline scrubber + recruiter actions (bottom-center) */}
      {yearSpan && yearRange && yearSpan[1] > yearSpan[0] ? (
        <TimelineScrubber
          minYear={yearSpan[0]}
          maxYear={yearSpan[1]}
          range={yearRange}
          onRangeChange={(r) => { setPlaying(false); setYearRange(r); }}
          playing={playing}
          onPlay={startPlayback}
          onPause={() => setPlaying(false)}
          onReset={resetTimeline}
          speed={playSpeed}
          onSpeedChange={setPlaySpeed}
          showJourneyLine={showJourneyLine}
          onToggleJourneyLine={() => setShowJourneyLine((v) => !v)}
          actionsSlot={(
            <>
              {searchTrigger}
              {matchTrigger}
              <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
              <MapStyleButton value={mapStyle} onChange={setMapStyle} />
              {recruitTrigger && (
                <>
                  <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
                  {recruitTrigger}
                </>
              )}
              {slug && (
                <>
                  <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
                  <RecruiterPanel
                    irSlug={slug}
                    candidateName={profile?.fullName ?? null}
                    candidateHeadline={profile?.headline ?? null}
                  />
                </>
              )}
            </>
          )}
        />
      ) : (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 rounded-xl bg-background/95 backdrop-blur-md border shadow-xl px-2 py-2">
          <div className="flex items-center gap-1.5">
            {searchTrigger}
            {matchTrigger}
            <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
            <MapStyleButton value={mapStyle} onChange={setMapStyle} />
            {recruitTrigger && (
              <>
                <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
                {recruitTrigger}
              </>
            )}
            {slug && (
              <>
                <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
                <RecruiterPanel
                  irSlug={slug}
                  candidateName={profile?.fullName ?? null}
                  candidateHeadline={profile?.headline ?? null}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Left column: bio card + work-history panel */}
      {!panelCollapsed ? (
        <div className="absolute top-3 left-3 z-20 w-[26rem] max-w-[calc(100vw-24px)] flex flex-col gap-2 pointer-events-none">
          {/* Bio card — relative + z-10 so the recruitment popover spills above the work-history sibling */}
          <div className="relative z-10 bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 pointer-events-auto">
            <div className="flex items-center gap-3">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/30 shrink-0" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <UserIcon className="h-10 w-10 text-primary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-base font-semibold text-foreground truncate flex-1 min-w-0">{profile?.fullName || "Candidate"}</p>
                  {updatedAt && (
                    <span
                      className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap shrink-0"
                      title={new Date(updatedAt).toLocaleString()}
                    >
                      Updated {fmtRelative(updatedAt)}
                    </span>
                  )}
                </div>
                {topEducation && (() => {
                  const credential = [topEducation.degree, topEducation.major].filter(Boolean).join(", ");
                  const display = credential || topEducation.company;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setFocusedId((cur) => (cur === topEducation.id ? null : topEducation.id));
                        analytics.track("education_click", { workItemId: topEducation.id, label: display });
                      }}
                      className="text-left flex items-start gap-1 text-sm text-violet-600 dark:text-violet-300 hover:underline w-full"
                      title={credential ? `${credential} · ${topEducation.company}` : topEducation.company}
                    >
                      <GraduationCap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 break-words">{display}</span>
                    </button>
                  );
                })()}
                {(profile?.city || profile?.state) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[profile?.city, profile?.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {profile && (profile.email || profile.phone || profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl || profile.schedulingUrl) && (
                  <div className="mt-1.5 relative flex items-center gap-2 flex-wrap">
                    {summary && (
                      <button
                        ref={aboutBtnRef}
                        type="button"
                        onClick={() => {
                          setAboutOpen((v) => {
                            if (!v) analytics.track("bio_open");
                            return !v;
                          });
                        }}
                        aria-expanded={aboutOpen}
                        aria-haspopup="dialog"
                        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white dark:bg-violet-500 px-2.5 py-1 text-xs font-medium hover:bg-violet-700 dark:hover:bg-violet-400 transition-colors"
                        title="Get to know me — bio & background"
                      >
                        <UserIcon className="h-3.5 w-3.5" />
                        Get to know me
                        {aboutOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                    <button
                      ref={contactBtnRef}
                      type="button"
                      onClick={() => {
                        setContactOpen((v) => {
                          if (!v) analytics.track("contact_open");
                          return !v;
                        });
                      }}
                      aria-expanded={contactOpen}
                      aria-haspopup="dialog"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Get in touch
                      {contactOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {contactOpen && (() => {
                      const copyToClipboard = (key: string, text: string) => {
                        navigator.clipboard?.writeText(text).then(() => {
                          setCopiedKey(key);
                          setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
                        });
                      };
                      const rows: {
                        key: string;
                        Icon: React.ComponentType<{ className?: string }>;
                        label: string;
                        value: string;
                        href: string;
                        external?: boolean;
                        copyValue?: string;
                      }[] = [];
                      if (profile.email) rows.push({
                        key: "email", Icon: Mail, label: "Email", value: profile.email,
                        href: `mailto:${profile.email}?subject=${encodeURIComponent("Re: " + (profile?.headline || "your resume"))}`,
                        copyValue: profile.email,
                      });
                      if (profile.phone) rows.push({
                        key: "phone", Icon: Phone, label: "Phone", value: profile.phone,
                        href: `tel:${profile.phone.replace(/[^+0-9]/g, "")}`,
                        copyValue: profile.phone,
                      });
                      const ensureHttp = (u: string) => {
                        const t = u.trim();
                        return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
                      };
                      if (profile.linkedinUrl) {
                        const href = ensureHttp(profile.linkedinUrl);
                        rows.push({
                          key: "linkedin", Icon: Linkedin, label: "LinkedIn", value: href.replace(/^https?:\/\/(www\.)?/, ""),
                          href, external: true, copyValue: href,
                        });
                      }
                      if (profile.githubUrl) {
                        const href = ensureHttp(profile.githubUrl);
                        rows.push({
                          key: "github", Icon: Github, label: "GitHub", value: href.replace(/^https?:\/\/(www\.)?/, ""),
                          href, external: true, copyValue: href,
                        });
                      }
                      if (profile.portfolioUrl) {
                        const href = ensureHttp(profile.portfolioUrl);
                        rows.push({
                          key: "portfolio", Icon: Globe, label: "Portfolio", value: href.replace(/^https?:\/\/(www\.)?/, ""),
                          href, external: true, copyValue: href,
                        });
                      }
                      if (profile.schedulingUrl) {
                        const href = ensureHttp(profile.schedulingUrl);
                        rows.push({
                          key: "schedule", Icon: Calendar, label: "Schedule a call", value: "Book a time",
                          href, external: true, copyValue: href,
                        });
                      }

                      const submitContactForm = async (e: React.FormEvent) => {
                        e.preventDefault();
                        if (contactSubmitting) return;
                        setContactError(null);
                        const name = contactForm.recruiterName.trim();
                        const email = contactForm.recruiterEmail.trim();
                        const role = contactForm.jobTitle.trim();
                        if (!name || !email || !role) {
                          setContactError("Name, email, and role are required.");
                          return;
                        }
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                          setContactError("Please enter a valid email address.");
                          return;
                        }
                        setContactSubmitting(true);
                        try {
                          if (slug) {
                            const linkedinUrl = contactForm.linkedinUrl.trim();
                            const salaryMin = contactForm.salaryMin.trim();
                            const salaryMax = contactForm.salaryMax.trim();
                            const salaryMinNum = salaryMin ? Number(salaryMin.replace(/[^0-9.]/g, "")) : NaN;
                            const salaryMaxNum = salaryMax ? Number(salaryMax.replace(/[^0-9.]/g, "")) : NaN;
                            const res = await fetch(`/api/interactive-resumes/public/${slug}/contact`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                recruiterName: name,
                                recruiterEmail: email,
                                recruiterPhone: contactForm.recruiterPhone.trim() || undefined,
                                company: contactForm.company.trim() || undefined,
                                jobTitle: role,
                                message: contactForm.message.trim() || undefined,
                                linkedinUrl: linkedinUrl || undefined,
                                location: contactForm.location.trim() || undefined,
                                jobType: contactForm.jobType.trim() || undefined,
                                salaryMin: Number.isFinite(salaryMinNum) ? salaryMinNum : undefined,
                                salaryMax: Number.isFinite(salaryMaxNum) ? salaryMaxNum : undefined,
                                jobDescription: contactForm.jobDescription.trim() || undefined,
                                joinNetwork: contactForm.joinNetwork,
                                // Recruit Mode metadata (only when a job site has been dropped & resolved)
                                ...(jobSite && jobSite.miles != null ? {
                                  jobLat: jobSite.lat,
                                  jobLng: jobSite.lng,
                                  commuteMiles: jobSite.miles,
                                  commuteMinutes: jobSite.durationMin ?? undefined,
                                  withinRange: recruitMeta?.maxCommuteMiles != null
                                    ? jobSite.miles <= recruitMeta.maxCommuteMiles
                                    : undefined,
                                } : {}),
                              }),
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              throw new Error(data?.error || "Submission failed");
                            }
                          }
                          try {
                            if (slug && typeof window !== "undefined") {
                              sessionStorage.setItem(`ir-contact-unlocked-${slug}`, "1");
                            }
                          } catch { /* ignore */ }
                          setContactUnlocked(true);
                        } catch (err) {
                          setContactError(err instanceof Error ? err.message : "Submission failed. Please try again.");
                        } finally {
                          setContactSubmitting(false);
                        }
                      };

                      return createPortal(
                        <div
                          className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                          onClick={(e) => {
                            if (e.target === e.currentTarget) setContactOpen(false);
                          }}
                        >
                          <div
                            ref={contactPopoverRef}
                            role="dialog"
                            aria-modal="true"
                            aria-label={contactUnlocked ? "Contact options" : "Introduce yourself"}
                            className="w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin rounded-xl border bg-background shadow-2xl"
                          >
                            <div className="flex items-center justify-between px-4 py-3 border-b">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">
                                  {contactUnlocked
                                    ? `Contact ${profile.fullName?.split(" ")[0] || ""}`.trim()
                                    : `Get in touch with ${profile.fullName?.split(" ")[0] || "the candidate"}`}
                                </div>
                                {!contactUnlocked && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {profile.contactCtaMessage?.trim()
                                      ? profile.contactCtaMessage
                                      : "Share a quick intro and we'll reveal contact options."}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setContactOpen(false)}
                                className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                                title="Close"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>

                            {!contactUnlocked ? (
                              <form onSubmit={submitContactForm} className="p-4 space-y-3">
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                    Your name <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    autoFocus
                                    value={contactForm.recruiterName}
                                    onChange={(e) => setContactForm((f) => ({ ...f, recruiterName: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="Jane Doe"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                    Email <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="email"
                                    required
                                    value={contactForm.recruiterEmail}
                                    onChange={(e) => setContactForm((f) => ({ ...f, recruiterEmail: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="jane@company.com"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                                    Phone
                                    <span className="text-[10px] font-normal text-muted-foreground/80">— so {profile?.fullName?.split(" ")[0] || "they"} recognize{profile?.fullName ? "s" : ""} your call</span>
                                  </label>
                                  <input
                                    type="tel"
                                    value={contactForm.recruiterPhone}
                                    onChange={(e) => setContactForm((f) => ({ ...f, recruiterPhone: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="+1 (555) 123-4567"
                                    autoComplete="tel"
                                  />
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    We&apos;ll add your details to {profile?.fullName?.split(" ")[0] || "their"} contacts so calls and texts come through with your name &amp; company.
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                    Company
                                  </label>
                                  <input
                                    type="text"
                                    value={contactForm.company}
                                    onChange={(e) => setContactForm((f) => ({ ...f, company: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="Acme Corp"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                    Role / job title <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={contactForm.jobTitle}
                                    onChange={(e) => setContactForm((f) => ({ ...f, jobTitle: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="Senior Software Engineer"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                    Message
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={contactForm.message}
                                    onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                                    placeholder="A short note about the opportunity..."
                                  />
                                </div>

                                {/* Optional offer details */}
                                <div className="border rounded-md">
                                  <button
                                    type="button"
                                    onClick={() => setOfferDetailsOpen((v) => !v)}
                                    aria-expanded={offerDetailsOpen}
                                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 rounded-md"
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                                      Add offer details (optional)
                                    </span>
                                    {offerDetailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </button>
                                  {offerDetailsOpen && (
                                    <div className="p-2.5 pt-1 space-y-2.5 border-t">
                                      <div>
                                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                          Your LinkedIn
                                        </label>
                                        <input
                                          type="url"
                                          value={contactForm.linkedinUrl}
                                          onChange={(e) => setContactForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                                          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                          placeholder="https://linkedin.com/in/..."
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                            Location
                                          </label>
                                          <input
                                            type="text"
                                            value={contactForm.location}
                                            onChange={(e) => setContactForm((f) => ({ ...f, location: e.target.value }))}
                                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            placeholder="Austin, TX"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                            Work mode
                                          </label>
                                          <select
                                            value={contactForm.jobType}
                                            onChange={(e) => setContactForm((f) => ({ ...f, jobType: e.target.value }))}
                                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                          >
                                            <option value="">Select…</option>
                                            <option value="remote">Remote</option>
                                            <option value="hybrid">Hybrid</option>
                                            <option value="on-site">On-site</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                          Salary range (USD/yr)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={contactForm.salaryMin}
                                            onChange={(e) => setContactForm((f) => ({ ...f, salaryMin: e.target.value }))}
                                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            placeholder="Min  e.g. 150000"
                                          />
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={contactForm.salaryMax}
                                            onChange={(e) => setContactForm((f) => ({ ...f, salaryMax: e.target.value }))}
                                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            placeholder="Max  e.g. 200000"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                          Job description / link
                                        </label>
                                        <textarea
                                          rows={3}
                                          value={contactForm.jobDescription}
                                          onChange={(e) => setContactForm((f) => ({ ...f, jobDescription: e.target.value }))}
                                          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                                          placeholder="Paste a JD link or key highlights, perks, talking points..."
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {contactError && (
                                  <p className="text-xs text-red-600 dark:text-red-400">{contactError}</p>
                                )}
                                <label className="flex items-start gap-2 rounded-md border bg-violet-500/5 border-violet-500/30 px-2.5 py-2 cursor-pointer hover:bg-violet-500/10 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={contactForm.joinNetwork}
                                    onChange={(e) => setContactForm((f) => ({ ...f, joinNetwork: e.target.checked }))}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-violet-400 text-violet-600 focus:ring-violet-500"
                                  />
                                  <span className="text-[11px] leading-snug text-foreground">
                                    <span className="font-medium">Join {profile.fullName?.split(" ")[0] || "the candidate"}&apos;s network.</span>{" "}
                                    <span className="text-muted-foreground">Stay connected for future opportunities even if this role isn&apos;t a fit.</span>
                                  </span>
                                </label>
                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setContactOpen(false)}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/40"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={contactSubmitting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                                  >
                                    {contactSubmitting ? "Sending…" : "Reveal contact info"}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <ul className="p-2 space-y-0.5">
                                {rows.map((r) => {
                                  const isCalSchedule = r.key === "schedule" && !!calLink;
                                  const Inner = (
                                    <>
                                      <r.Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                      <div className="min-w-0">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{r.label}</div>
                                        <div className="text-xs text-foreground truncate">{r.value}</div>
                                      </div>
                                    </>
                                  );
                                  return (
                                  <li key={r.key} className="group flex items-center gap-2 rounded-md hover:bg-muted/40 transition-colors">
                                    {isCalSchedule ? (
                                      <button
                                        type="button"
                                        data-cal-namespace="resumsify"
                                        data-cal-link={calLink!}
                                        data-cal-config='{"layout":"month_view"}'
                                        onClick={() => analytics.track("contact_method_click", { method: r.key })}
                                        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left"
                                      >
                                        {Inner}
                                      </button>
                                    ) : (
                                    <a
                                      href={r.href}
                                      target={r.external ? "_blank" : undefined}
                                      rel={r.external ? "noopener noreferrer" : undefined}
                                      onClick={() => analytics.track("contact_method_click", { method: r.key })}
                                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2"
                                    >
                                      {Inner}
                                    </a>
                                    )}
                                    {r.copyValue && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          copyToClipboard(r.key, r.copyValue!);
                                        }}
                                        className="px-2 py-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                        title={`Copy ${r.label.toLowerCase()}`}
                                      >
                                        {copiedKey === r.key ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                  </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>,
                        document.body
                      );
                    })()}
                    {aboutOpen && summary && typeof window !== "undefined" && createPortal(
                      <div
                        className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                        onClick={(e) => {
                          if (e.target === e.currentTarget) setAboutOpen(false);
                        }}
                      >
                        <div
                          ref={aboutPopoverRef}
                          role="dialog"
                          aria-modal="true"
                          aria-label="Get to know me"
                          className="w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin rounded-xl border bg-background shadow-2xl p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300 inline-flex items-center gap-1.5">
                              <UserIcon className="h-3.5 w-3.5" />
                              Get to know {profile.fullName?.split(" ")[0] || "me"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAboutOpen(false)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Close"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {profile?.headline && (
                            <p className="text-sm font-medium text-primary leading-snug">
                              {profile.headline}
                            </p>
                          )}
                          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">
                            {summary}
                          </p>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setBioCardOpen((v) => !v)}
                aria-expanded={bioCardOpen}
                aria-label={bioCardOpen ? "Collapse bio details" : "Expand bio details"}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0 self-start"
                title={bioCardOpen ? "Collapse details" : "Show details"}
              >
                {bioCardOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
            {bioCardOpen && (
              <>
            {/* Headline (always visible, above the bio) */}
            {profile?.headline && (
              <p className="mt-2 text-sm font-medium text-primary leading-snug">
                {profile.headline}
              </p>
            )}

            {/* Education */}
            {educationItems.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEduExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[10px]">
                    <GraduationCap className="h-3.5 w-3.5 text-violet-500" />
                    Education
                  </span>
                  {eduExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {eduExpanded && (
                  <ul className="mt-2 space-y-2">
                    {educationItems.map((e) => {
                      const yrStart = e.startDate ? e.startDate.slice(0, 4) : null;
                      const yrEnd = e.endDate ? e.endDate.slice(0, 4) : null;
                      const years = yrStart && yrEnd && yrStart !== yrEnd
                        ? `${yrStart} – ${yrEnd}`
                        : (yrEnd || yrStart || "");
                      const credential = [e.degree, e.major].filter(Boolean).join(", ");
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusedId((cur) => (cur === e.id ? null : e.id));
                              const label = [e.company, [e.degree, e.major].filter(Boolean).join(", ")]
                                .filter(Boolean)
                                .join(" — ") || null;
                              analytics.track("education_click", { workItemId: e.id, label });
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors ${
                              focusedId === e.id ? "bg-muted/60" : ""
                            }`}
                            title={`Show ${e.company} on map`}
                          >
                            {credential ? (
                              <>
                                <div className="text-sm font-semibold text-foreground leading-snug">
                                  {credential}
                                </div>
                                <div className="text-xs text-foreground/80 leading-snug mt-0.5">
                                  {e.company}
                                </div>
                              </>
                            ) : (
                              <div className="text-sm font-semibold text-foreground leading-snug">
                                {e.company}
                              </div>
                            )}
                            {years && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {years}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Certifications collapsible */}
            {certifications.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setBioExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Award className="h-3 w-3 text-amber-500" />
                    {`${certifications.length} cert${certifications.length === 1 ? "" : "s"}`}
                  </span>
                  {bioExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {bioExpanded && (
                  <ul className="mt-2 space-y-1">
                    {certifications.map((c) => (
                      <li key={c.id ?? c.name} className="text-[11px] flex items-start gap-1.5">
                        <Award className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          {(c.issuer || c.issueDate) && (
                            <div className="text-muted-foreground text-[10px] truncate">
                              {[c.issuer, c.issueDate].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
              </>
            )}
          </div>

          {/* Work history panel — replaced by focus card when a job is selected, or by Recruiter Brief in Recruit Mode */}
          {focused ? (
            <FocusCard
              item={focused}
              items={visibleItems}
              onClose={() => setFocusedId(null)}
              onNavigate={(id) => setFocusedId(id)}
              analytics={analytics}
            />
          ) : recruitMode ? (
            <RecruiterBriefPanel
              items={items}
              skills={skills}
              certifications={certifications}
              compensation={compensation}
              kpis={kpis}
              jobSite={jobSite}
              maxCommuteMiles={recruitMeta?.maxCommuteMiles ?? null}
              onCollapse={() => setPanelCollapsed(true)}
              onSelectRole={(id) => setFocusedId(id)}
            />
          ) : (
            <WorkHistoryViewerPanel
              items={visibleItems.filter((i) => (i.type || "").toLowerCase() !== "school")}
              kpis={kpis}
              focusedId={focusedId}
              onSelect={(id) => setFocusedId((cur) => (cur === id ? null : id))}
              onHover={prefetchFootprint}
              onCollapse={() => { setPanelCollapsed(true); setToolsOpen(false); }}
              availableTypes={availableTypes}
              isTypeOn={isTypeOn}
              toggleType={toggleType}
              metaFor={metaFor}
              inventory={inventory}
              toolsOpen={toolsOpen}
              onToggleTools={() => setToolsOpen((v) => !v)}
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPanelCollapsed(false)}
          className="absolute top-3 left-3 z-30 h-10 w-10 rounded-xl bg-background/95 backdrop-blur-md border text-foreground shadow-xl flex items-center justify-center hover:bg-muted/40 transition-colors"
          title="Show work history"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Tools & Inventory pop-out panel — slides out to the right of the work history panel */}
      {!panelCollapsed && toolsOpen && inventory.length > 0 && (
        <div
          className="absolute top-3 left-[27rem] z-20 w-[26rem] max-w-[calc(100vw-27.5rem)] pointer-events-none animate-in slide-in-from-left-4 fade-in duration-200"
        >
          <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 max-h-[calc(75vh-110px)] overflow-y-auto scrollbar-thin pointer-events-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-base font-semibold flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-cyan-500" />
                My Tools &amp; Inventory
                <span className="text-xs text-muted-foreground tabular-nums">({inventory.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setToolsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Close"
                aria-label="Close tools panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ToolsInventoryPanel inventory={inventory} onSelect={(it) => setViewingTool(it)} />
          </div>
        </div>
      )}

      {viewingTool && (
        <ToolDetailModal item={viewingTool} onClose={() => setViewingTool(null)} />
      )}

      {/* Sections drawer */}
      {drawerOpen && (
        <SectionsDrawer
          profile={profile}
          summary={summary}
          skills={skills}
          certifications={certifications}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Map view ───────────────────────────────────────────────────── */

function TimelineScrubber({
  minYear,
  maxYear,
  range,
  onRangeChange,
  playing,
  onPlay,
  onPause,
  onReset,
  speed,
  onSpeedChange,
  showJourneyLine,
  onToggleJourneyLine,
  actionsSlot,
}: {
  minYear: number;
  maxYear: number;
  range: [number, number];
  onRangeChange: (r: [number, number]) => void;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  speed: 1 | 2 | 4;
  onSpeedChange: (s: 1 | 2 | 4) => void;
  showJourneyLine: boolean;
  onToggleJourneyLine: () => void;
  actionsSlot?: React.ReactNode;
}) {
  const [lo, hi] = range;
  const span = Math.max(1, maxYear - minYear);
  const loPct = ((lo - minYear) / span) * 100;
  const hiPct = ((hi - minYear) / span) * 100;
  const isFullRange = lo === minYear && hi === maxYear;
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Auto-pause when collapsing
  useEffect(() => {
    if (!timelineOpen && playing) onPause();
  }, [timelineOpen, playing, onPause]);

  return (
    <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 rounded-xl bg-background/95 backdrop-blur-md border shadow-xl px-2 py-2 transition-[width] ${timelineOpen ? "w-[min(720px,calc(100vw-32px))]" : "w-auto"}`}>
      <div className="flex items-center gap-1.5">
        {/* Timeline expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setTimelineOpen((v) => !v)}
          aria-label={timelineOpen ? "Collapse timeline" : "Expand timeline"}
          aria-pressed={timelineOpen}
          title={timelineOpen ? "Collapse timeline" : "Career timeline"}
          className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center border transition-colors ${
            timelineOpen
              ? "bg-primary text-primary-foreground border-transparent"
              : !isFullRange
                ? "bg-amber-500/15 text-amber-600 border-amber-500/40"
                : "bg-background text-muted-foreground hover:bg-muted/40"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
        </button>

        {timelineOpen && (
          <>
            {/* Play / Pause */}
            <button
              type="button"
              onClick={() => (playing ? onPause() : onPlay())}
              aria-label={playing ? "Pause journey playback" : "Play career journey"}
              title={playing ? "Pause" : "Play career journey"}
              className="h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={onReset}
              aria-label="Reset timeline to full range"
              title="Reset timeline"
              disabled={isFullRange && !playing}
              className="h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center border bg-background hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Year readout */}
            <div className="text-[11px] font-mono tabular-nums text-foreground shrink-0 w-[88px] text-center">
              {lo === hi ? lo : `${lo} – ${hi}`}
            </div>

            {/* Dual-handle range track */}
            <div className="relative flex-1 h-8 select-none min-w-[120px]">
              {/* Track background */}
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted" />
              {/* Selected fill */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary"
                style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
              />
              {/* Min thumb input */}
              <input
                type="range"
                min={minYear}
                max={maxYear}
                step={1}
                value={lo}
                onChange={(e) => {
                  const v = Math.min(Number(e.target.value), hi);
                  onRangeChange([v, hi]);
                }}
                aria-label={`Start year (${lo})`}
                className="absolute inset-0 w-full h-8 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-grab"
                style={{ zIndex: 3 }}
              />
              {/* Max thumb input */}
              <input
                type="range"
                min={minYear}
                max={maxYear}
                step={1}
                value={hi}
                onChange={(e) => {
                  const v = Math.max(Number(e.target.value), lo);
                  onRangeChange([lo, v]);
                }}
                aria-label={`End year (${hi})`}
                className="absolute inset-0 w-full h-8 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-grab"
                style={{ zIndex: 4 }}
              />
            </div>

            {/* Journey-line toggle */}
            <button
              type="button"
              onClick={onToggleJourneyLine}
              aria-label={showJourneyLine ? "Hide journey path" : "Show journey path"}
              aria-pressed={showJourneyLine}
              title={showJourneyLine ? "Hide journey path" : "Show journey path"}
              className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center border transition-colors ${showJourneyLine ? "bg-primary text-primary-foreground border-transparent" : "bg-background text-muted-foreground hover:bg-muted/40"}`}
            >
              <Route className="h-3.5 w-3.5" />
            </button>

            {/* Speed control */}
            <div className="flex items-center rounded-md border overflow-hidden text-[10px] shrink-0">
              {([1, 2, 4] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSpeedChange(s)}
                  className={`px-1.5 py-1 transition-colors ${speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                  aria-label={`Playback speed ${s}x`}
                  aria-pressed={speed === s}
                >
                  {s}x
                </button>
              ))}
            </div>
          </>
        )}

        {/* Trailing actions slot (e.g. Save / Notes) */}
        {actionsSlot && (
          <>
            <div className="h-6 w-px bg-border mx-0.5 shrink-0" aria-hidden="true" />
            {actionsSlot}
          </>
        )}
      </div>
    </div>
  );
}

function ImmersiveMapView({
  items,
  focusedId,
  onFocus,
  mapStyle = "roadmap",
  yearRange,
  playing = false,
  showJourneyLine = true,
  recruitMode = false,
  recruitHome = null,
  recruitRadiusMiles = null,
  jobSite = null,
  onJobSitePicked,
  onJobSiteResult,
}: {
  items: (ImmersiveWorkItem & { lat: number; lng: number })[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  mapStyle?: "roadmap" | "satellite" | "hybrid";
  yearRange?: [number, number] | null;
  playing?: boolean;
  showJourneyLine?: boolean;
  recruitMode?: boolean;
  recruitHome?: { lat: number; lng: number } | null;
  recruitRadiusMiles?: number | null;
  jobSite?: { lat: number; lng: number } | null;
  onJobSitePicked?: (p: { address: string; lat: number; lng: number }) => void;
  onJobSiteResult?: (r: { miles: number | null; durationMin: number | null; error?: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const markerById = useRef<Map<string, { marker: google.maps.marker.AdvancedMarkerElement; el: HTMLElement }>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const journeyPolylineRef = useRef<google.maps.Polyline | null>(null);
  const radiusCircleRef = useRef<google.maps.Circle | null>(null);
  const jobSiteMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const focusedFootprintRef = useRef<google.maps.Polygon[]>([]);
  const onFocusRef = useRef(onFocus);
  useEffect(() => { onFocusRef.current = onFocus; }, [onFocus]);
  const onJobSitePickedRef = useRef(onJobSitePicked);
  const onJobSiteResultRef = useRef(onJobSiteResult);
  useEffect(() => { onJobSitePickedRef.current = onJobSitePicked; }, [onJobSitePicked]);
  useEffect(() => { onJobSiteResultRef.current = onJobSiteResult; }, [onJobSiteResult]);
  const [ready, setReady] = useState(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      ensureOptions();
      if (!GOOGLE_KEY) return;
      const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;
      await importLibrary("marker");
      if (cancelled || !containerRef.current) return;
      mapRef.current = new Map(containerRef.current, {
        center: { lat: items[0]?.lat ?? 39.95, lng: items[0]?.lng ?? -75.16 },
        zoom: 9,
        mapId: "resume_immersive_map",
        mapTypeId: mapStyle,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [items]);

  // React to map style changes
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setMapTypeId(mapStyle);
  }, [ready, mapStyle]);

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    clustererRef.current?.clearMarkers();
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
    markerById.current.clear();
    if (items.length === 0) return;

    const typeByMarker = new Map<google.maps.marker.AdvancedMarkerElement, string>();
    const companyByMarker = new Map<google.maps.marker.AdvancedMarkerElement, string>();

    items.forEach((w) => {
      const meta = metaFor(w.type);
      const months = tenureMonths(w.startDate, w.endDate);
      const size = markerSize(months);
      const ringColor = recencyRingColor(w.endDate);
      const ringWidth = !w.endDate ? 3 : 2.5;
      const emojiSize = size < 30 ? 12 : size < 36 ? 14 : 16;
      const yLabel = yearLabel(w.startDate, w.endDate);

      const el = document.createElement("div");
      el.dataset.id = w.id;
      el.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;";
      // Year metadata for the timeline scrubber dim effect
      const startY = parseYM(w.startDate)?.getFullYear();
      const endY = parseYM(w.endDate)?.getFullYear() ?? new Date().getFullYear();
      if (startY) el.dataset.startYear = String(startY);
      el.dataset.endYear = String(endY);
      const yrs0 = Math.floor(months / 12);
      const mos0 = months % 12;
      const tenureLabel =
        months > 0
          ? `${yrs0 > 0 ? `${yrs0} year${yrs0 === 1 ? "" : "s"}${mos0 ? " " : ""}` : ""}${mos0 ? `${mos0} month${mos0 === 1 ? "" : "s"}` : ""}`
          : "";
      const ariaLabel = `${meta.label}: ${w.company}${w.title ? `, ${w.title}` : ""}${tenureLabel ? `, ${tenureLabel}` : ""}. Click to focus.`;
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", ariaLabel);
      el.innerHTML = `
        <div data-circle="1" style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${meta.bg};border:${ringWidth}px solid ${ringColor};box-shadow:0 2px 6px rgba(0,0,0,0.28);font-size:${emojiSize}px;line-height:1;opacity:0.92;transition:transform 0.15s, box-shadow 0.15s;" title="${escapeHtml(w.company)}${w.title ? " \u2013 " + escapeHtml(w.title) : ""}" aria-hidden="true">${meta.emoji}</div>
        ${yLabel ? `<span style="font-size:8px;color:#1f2937;background:rgba(255,255,255,0.9);padding:0 3px;border-radius:3px;font-weight:700;pointer-events:none;white-space:nowrap;line-height:1.5;box-shadow:0 1px 2px rgba(0,0,0,0.15);" aria-hidden="true">${yLabel}</span>` : ""}
      `;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: w.lat, lng: w.lng },
        map: mapRef.current,
        content: el,
        zIndex: 1800,
      });

      const circle = el.firstElementChild as HTMLElement;

      // Build rich tooltip HTML (matches editor's WH tooltip)
      const titleStr  = w.title ? `<div style="color:#6b7280;margin-top:1px">${escapeHtml(w.title)}</div>` : "";
      const yrs       = Math.floor(months / 12);
      const mos       = months % 12;
      const tenureStr = months > 0 ? `<div style="color:#9ca3af;font-size:10px;margin-top:2px">${yrs > 0 ? yrs + "y " : ""}${mos}m tenure</div>` : "";
      const cover     = w.coverImage
        ? `<img src="${w.coverImage}" style="width:100%;height:72px;object-fit:cover;display:block;object-position:center ${w.coverImageY ?? 50}%" />`
        : "";
      const tipHtml = `<div style="overflow:hidden;">
        ${cover}
        <div style="padding:6px 8px 5px;">
          <div style="font-weight:700;font-size:12px;color:#111">${meta.emoji} ${escapeHtml(w.company)}</div>
          ${titleStr}${tenureStr}
          <div style="color:#9ca3af;margin-top:2px;font-size:10px">${escapeHtml(meta.label)} \u2022 Click to focus</div>
        </div>
      </div>`;

      el.addEventListener("mouseenter", () => {
        circle.style.transform = "scale(1.2)";
        showTooltip(tipHtml, el);
      });
      el.addEventListener("mouseleave", () => {
        circle.style.transform = el.dataset.focused === "1" ? "scale(1.25)" : "scale(1)";
        hideTooltip();
      });
      marker.addListener("click", () => {
        const map = mapRef.current;
        if (map) {
          map.panTo({ lat: w.lat, lng: w.lng });
          const z = map.getZoom() ?? 10;
          if (z < 17) map.setZoom(17);
        }
        onFocusRef.current(w.id);
      });
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          const map = mapRef.current;
          if (map) {
            map.panTo({ lat: w.lat, lng: w.lng });
            const z = map.getZoom() ?? 10;
            if (z < 17) map.setZoom(17);
          }
          onFocusRef.current(w.id);
        }
      });

      markersRef.current.push(marker);
      markerById.current.set(w.id, { marker, el });
      typeByMarker.set(marker, w.type || "job");
      if (w.company) companyByMarker.set(marker, w.company);
    });

    if (markersRef.current.length >= 4) {
      clustererRef.current = new MarkerClusterer({
        map: mapRef.current,
        markers: markersRef.current,
        algorithm: new SuperClusterAlgorithm({ radius: 80 }),
        renderer: {
          render: ({ count, position, markers: clusterMarkers }) => {
            const typeCounts = new Map<string, number>();
            const companyCounts = new Map<string, number>();
            for (const m of (clusterMarkers ?? [])) {
              const am = m as google.maps.marker.AdvancedMarkerElement;
              const t = typeByMarker.get(am) ?? "job";
              typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
              const c = companyByMarker.get(am);
              if (c) companyCounts.set(c, (companyCounts.get(c) ?? 0) + 1);
            }
            const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
            const dominantType = sortedTypes[0]?.[0] ?? "job";
            const allSameType = typeCounts.size === 1;
            const meta = metaFor(dominantType);
            const clBg = allSameType ? meta.bg : "#4b5563";
            const clIcon = allSameType ? meta.emoji : "";
            const sz = count < 10 ? 36 : count < 20 ? 40 : 44;
            const clEl = document.createElement("div");
            const breakdown = sortedTypes
              .map(([t, n]) => `${n} ${metaFor(t).label.toLowerCase()}${n === 1 ? "" : "s"}`)
              .join(", ");
            const topCompanies = [...companyCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([name]) => name);
            const remaining = companyCounts.size - topCompanies.length;
            const previewLine = topCompanies.length > 0
              ? topCompanies.join(", ") + (remaining > 0 ? ` +${remaining} more` : "")
              : "";
            clEl.setAttribute("role", "button");
            clEl.setAttribute(
              "aria-label",
              `Cluster of ${count} locations${previewLine ? `: ${previewLine}` : ""}. ${breakdown}. Click to zoom in.`
            );
            clEl.style.position = "relative";
            const tooltipHtml = `
              <div data-cluster-tooltip style="
                position:absolute;
                bottom:calc(100% + 6px);
                left:50%;
                transform:translateX(-50%);
                background:#0b1220;
                color:#fff;
                padding:8px 12px;
                border-radius:10px;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                font-size:13px;
                font-weight:500;
                line-height:1.4;
                white-space:nowrap;
                border:1px solid rgba(255,255,255,0.12);
                box-shadow:0 8px 24px rgba(0,0,0,0.5);
                pointer-events:none;
                opacity:0;
                transition:opacity 120ms ease-out;
                z-index:2000;
                -webkit-font-smoothing:antialiased;
                text-rendering:geometricPrecision;
              ">
                ${previewLine ? `<div style="font-weight:700;font-size:13px;color:#fff">${previewLine.replace(/</g, "&lt;")}</div>` : ""}
                <div style="opacity:0.9;font-size:11px;color:#cbd5e1;margin-top:2px">${breakdown}</div>
                <div style="
                  position:absolute;
                  top:100%;
                  left:50%;
                  transform:translateX(-50%);
                  width:0;
                  height:0;
                  border-left:5px solid transparent;
                  border-right:5px solid transparent;
                  border-top:5px solid #0b1220;
                "></div>
              </div>
            `;
            clEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:2px;width:${sz}px;height:${sz}px;border-radius:50%;background:${clBg};border:2.5px solid #fff;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;" aria-hidden="true">${clIcon ? `<span style="font-size:13px">${clIcon}</span>` : ""}<span>${count}</span></div>${tooltipHtml}`;
            const tipEl = clEl.querySelector<HTMLElement>("[data-cluster-tooltip]");
            const clusterMarker = new google.maps.marker.AdvancedMarkerElement({ position, content: clEl, zIndex: 1900 });
            if (tipEl) {
              clEl.addEventListener("mouseenter", () => {
                tipEl.style.opacity = "1";
                clusterMarker.zIndex = 9999;
              });
              clEl.addEventListener("mouseleave", () => {
                tipEl.style.opacity = "0";
                clusterMarker.zIndex = 1900;
              });
            }
            return clusterMarker;
          },
        },
      });
    }

    if (items.length === 1) {
      mapRef.current.setCenter({ lat: items[0].lat, lng: items[0].lng });
      mapRef.current.setZoom(13);
    } else {
      const b = new google.maps.LatLngBounds();
      items.forEach((i) => b.extend({ lat: i.lat, lng: i.lng }));
      mapRef.current.fitBounds(b, 80);
    }
  }, [ready, items]);

  // Apply timeline scrubber: dim out-of-range markers + draw journey polyline
  // for in-range work items (job / internship / self-employed only).
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    // Cleanup previous polyline
    if (journeyPolylineRef.current) {
      journeyPolylineRef.current.setMap(null);
      journeyPolylineRef.current = null;
    }

    if (!yearRange) {
      // No scrubber active — make sure all markers are fully visible
      markerById.current.forEach(({ el }) => {
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
        el.setAttribute("tabindex", "0");
      });
      return;
    }

    const [lo, hi] = yearRange;

    // Dim out-of-range markers
    markerById.current.forEach(({ el }) => {
      const sY = Number(el.dataset.startYear || NaN);
      const eY = Number(el.dataset.endYear || NaN);
      const inRange = !Number.isNaN(sY) && !Number.isNaN(eY) && sY <= hi && eY >= lo;
      el.style.opacity = inRange ? "1" : "0.25";
      el.style.pointerEvents = inRange ? "auto" : "none";
      el.setAttribute("tabindex", inRange ? "0" : "-1");
    });

    // Build chronological polyline of in-range "career" items
    // (excludes school / military / volunteer per design — career arc only)
    const careerTypes = new Set(["job", "internship", "self-employed"]);
    const careerInRange = items
      .filter((i) => {
        const t = (i.type || "job").toLowerCase();
        if (!careerTypes.has(t)) return false;
        const sY = parseYM(i.startDate)?.getFullYear();
        const eY = parseYM(i.endDate)?.getFullYear() ?? new Date().getFullYear();
        if (!sY) return false;
        return sY <= hi && eY >= lo;
      })
      .sort((a, b) => {
        const aS = parseYM(a.startDate)?.getTime() ?? 0;
        const bS = parseYM(b.startDate)?.getTime() ?? 0;
        return aS - bS;
      });

    if (showJourneyLine && careerInRange.length >= 2) {
      const path = careerInRange.map((i) => ({ lat: i.lat, lng: i.lng }));
      journeyPolylineRef.current = new google.maps.Polyline({
        path,
        map: mapRef.current,
        strokeColor: "#6366f1",
        strokeOpacity: 0.85,
        strokeWeight: 2.5,
        geodesic: true,
        zIndex: 100,
        icons: [
          {
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 3,
              strokeColor: "#6366f1",
              fillColor: "#6366f1",
              fillOpacity: 1,
            },
            offset: "0%",
            repeat: "120px",
          },
        ],
      });
    }

    // During journey playback, pan the camera to the most recent in-range
    // career item so the viewer follows the candidate's path.
    if (playing && careerInRange.length > 0) {
      const latest = careerInRange[careerInRange.length - 1];
      mapRef.current.panTo({ lat: latest.lat, lng: latest.lng });
      onFocusRef.current(latest.id);
    }
  }, [ready, items, yearRange, playing, showJourneyLine]);

  // Apply focus visual + pan/zoom
  useEffect(() => {
    if (!mapRef.current) return;
    markerById.current.forEach(({ el }, id) => {
      const circle = el.firstElementChild as HTMLElement | null;
      if (!circle) return;
      if (id === focusedId) {
        el.dataset.focused = "1";
        circle.style.transform = "scale(1.25)";
        circle.style.boxShadow = "0 0 0 4px rgba(99,102,241,0.45), 0 4px 14px rgba(0,0,0,0.5)";
      } else {
        el.dataset.focused = "0";
        circle.style.transform = "scale(1)";
        circle.style.boxShadow = "0 2px 6px rgba(0,0,0,0.28)";
      }
    });
    if (focusedId) {
      const target = items.find((i) => i.id === focusedId);
      if (target) {
        mapRef.current.panTo({ lat: target.lat, lng: target.lng });
        const z = mapRef.current.getZoom() ?? 10;
        if (z < 17) mapRef.current.setZoom(17);
      }
    } else {
      // Restore overview view when focus is cleared
      if (items.length === 1) {
        mapRef.current.setCenter({ lat: items[0].lat, lng: items[0].lng });
        mapRef.current.setZoom(13);
      } else if (items.length > 1) {
        const b = new google.maps.LatLngBounds();
        items.forEach((i) => b.extend({ lat: i.lat, lng: i.lng }));
        mapRef.current.fitBounds(b, 80);
      }
    }
  }, [focusedId, items]);

  // ── Focus mode: outline the focused job's building via OSM footprint ──
  // Outlines are only drawn when zoom >= 16 (OUTLINE_MIN_ZOOM); a zoom_changed
  // listener toggles their map handle so they fade in/out as the user zooms.
  const OUTLINE_MIN_ZOOM = 16;
  useEffect(() => {
    // Always tear down previous polygons first
    focusedFootprintRef.current.forEach((p) => p.setMap(null));
    focusedFootprintRef.current = [];
    if (!ready || !mapRef.current || !focusedId) return;
    const target = items.find((i) => i.id === focusedId);
    if (!target || target.lat == null || target.lng == null) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/building-footprints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: [
              {
                id: target.id,
                lat: target.lat,
                lng: target.lng,
                wayId: target.osmWayId ?? null,
              },
            ],
            radiusM: 150,
          }),
        });
        if (!res.ok) return;
        if (cancelled || !mapRef.current) return;
        const data: { footprints?: { id: string; wayId: number | null; polygons: { lat: number; lng: number }[][] }[] } =
          await res.json();
        // Bail if focus changed during the fetch
        if (cancelled || focusedId !== target.id) return;
        const entry = data.footprints?.find((f) => f.id === target.id);
        const polygons = entry?.polygons ?? [];
        if (polygons.length === 0) return;
        const color = recencyRingColor(target.endDate) || "#10b981";
        const map = mapRef.current;
        const zoom = map.getZoom() ?? 0;
        const visible = zoom >= OUTLINE_MIN_ZOOM;
        polygons.forEach((ring, idx) => {
          if (ring.length < 3) return;
          const isPrimary = idx === 0;
          const poly = new google.maps.Polygon({
            paths: ring,
            map: visible ? map : null,
            strokeColor: color,
            strokeOpacity: isPrimary ? 1 : 0.7,
            strokeWeight: isPrimary ? 3 : 2,
            fillColor: color,
            fillOpacity: isPrimary ? 0.25 : 0.12,
            clickable: false,
            zIndex: isPrimary ? 9999 : 9998,
          });
          focusedFootprintRef.current.push(poly);
        });
      } catch {
        // Silent — outline is a nice-to-have, not critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, focusedId, items]);

  // Toggle building-outline polygons on/off when zoom crosses OUTLINE_MIN_ZOOM.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const apply = () => {
      const zoom = map.getZoom() ?? 0;
      const visible = zoom >= OUTLINE_MIN_ZOOM;
      focusedFootprintRef.current.forEach((p) => {
        const onMap = p.getMap() != null;
        if (visible && !onMap) p.setMap(map);
        else if (!visible && onMap) p.setMap(null);
      });
    };
    const listener = map.addListener("zoom_changed", apply);
    return () => listener.remove();
  }, [ready]);

  // ── Recruit Mode: radius circle around home ──
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // Always tear down any existing circle from a prior run first
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setMap(null);
      radiusCircleRef.current = null;
    }
    if (!recruitMode || !recruitHome || !recruitRadiusMiles || recruitRadiusMiles <= 0) {
      // Nothing to draw — return a no-op cleanup so React always has one
      return () => {};
    }
    const metersPerMile = 1609.344;
    const circle = new google.maps.Circle({
      map: mapRef.current,
      center: recruitHome,
      radius: recruitRadiusMiles * metersPerMile,
      strokeColor: "#10b981",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#10b981",
      fillOpacity: 0.08,
      clickable: false,
    });
    radiusCircleRef.current = circle;
    // Fit map to the circle bounds for context
    const bounds = circle.getBounds();
    if (bounds) mapRef.current.fitBounds(bounds, 60);
    return () => {
      circle.setMap(null);
      if (radiusCircleRef.current === circle) radiusCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, recruitMode, recruitHome?.lat, recruitHome?.lng, recruitRadiusMiles]);

  // ── Recruit Mode: dim work-history pins to keep focus on radius/job-site ──
  useEffect(() => {
    markerById.current.forEach(({ el }) => {
      const circle = el.firstElementChild as HTMLElement | null;
      if (circle) circle.style.opacity = recruitMode ? "0.35" : "0.92";
    });
  }, [recruitMode, ready, items]);

  // ── Recruit Mode: attach Places Autocomplete to the input in the parent banner ──
  useEffect(() => {
    if (!ready || !recruitMode) return;
    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;
    (async () => {
      try {
        await importLibrary("places");
        if (cancelled) return;
        const input = document.getElementById("ir-recruit-jobsite-input") as HTMLInputElement | null;
        if (!input) return;
        autocompleteRef.current = new google.maps.places.Autocomplete(input, {
          fields: ["formatted_address", "geometry", "name"],
          types: ["geocode", "establishment"],
        });
        listener = autocompleteRef.current.addListener("place_changed", () => {
          const place = autocompleteRef.current?.getPlace();
          const loc = place?.geometry?.location;
          if (!loc) return;
          const lat = loc.lat();
          const lng = loc.lng();
          const address = place?.formatted_address || place?.name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          onJobSitePickedRef.current?.({ address, lat, lng });
        });
      } catch (e) {
        console.warn("Failed to init Places autocomplete", e);
      }
    })();
    return () => {
      cancelled = true;
      if (listener) listener.remove();
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [ready, recruitMode]);

  // ── Recruit Mode: drop job-site marker + Distance Matrix lookup ──
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (jobSiteMarkerRef.current) {
      jobSiteMarkerRef.current.map = null;
      jobSiteMarkerRef.current = null;
    }
    if (!recruitMode || !jobSite) return;
    const el = document.createElement("div");
    el.style.cssText = "display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#0ea5e9;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:16px;line-height:1;";
    el.textContent = "📍";
    jobSiteMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
      position: jobSite,
      map: mapRef.current,
      content: el,
      zIndex: 9999,
    });
    // Pan to fit both home + job site if home present
    if (recruitHome) {
      const b = new google.maps.LatLngBounds();
      b.extend(recruitHome);
      b.extend(jobSite);
      mapRef.current.fitBounds(b, 100);
    } else {
      mapRef.current.panTo(jobSite);
    }

    // Distance Matrix lookup
    if (recruitHome) {
      let cancelled = false;
      (async () => {
        try {
          await importLibrary("routes");
          if (cancelled) return;
          const svc = new google.maps.DistanceMatrixService();
          svc.getDistanceMatrix({
            origins: [recruitHome],
            destinations: [jobSite],
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.IMPERIAL,
          }, (res, status) => {
            if (cancelled) return;
            if (status !== "OK" || !res) {
              onJobSiteResultRef.current?.({ miles: null, durationMin: null, error: "Could not calculate distance" });
              return;
            }
            const elem = res.rows?.[0]?.elements?.[0];
            if (!elem || elem.status !== "OK") {
              onJobSiteResultRef.current?.({ miles: null, durationMin: null, error: "No route found" });
              return;
            }
            const meters = elem.distance?.value ?? 0;
            const seconds = elem.duration?.value ?? 0;
            onJobSiteResultRef.current?.({
              miles: meters / 1609.344,
              durationMin: Math.round(seconds / 60),
            });
          });
        } catch {
          if (!cancelled) onJobSiteResultRef.current?.({ miles: null, durationMin: null, error: "Distance service unavailable" });
        }
      })();
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, recruitMode, jobSite?.lat, jobSite?.lng, recruitHome?.lat, recruitHome?.lng]);

  function showTooltip(html: string, anchorEl: HTMLElement) {
    const tooltip = tooltipRef.current;
    const outer = containerRef.current?.parentElement;
    if (!tooltip || !outer) return;
    const a = anchorEl.getBoundingClientRect();
    const o = outer.getBoundingClientRect();
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    tooltip.style.left = `${a.left - o.left + a.width / 2}px`;
    tooltip.style.top = `${a.top - o.top - 8}px`;
  }
  function hideTooltip() {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }

  if (!GOOGLE_KEY) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-sm text-gray-400">
        Map unavailable — Google Maps API key not configured.
      </div>
    );
  }
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted/20 animate-pulse pointer-events-none" />
      )}
      <div
        ref={tooltipRef}
        style={{
          display: "none",
          position: "absolute",
          zIndex: 9999,
          pointerEvents: "none",
          transform: "translateX(-50%) translateY(-100%)",
          background: "white",
          borderRadius: "10px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
          overflow: "hidden",
          maxWidth: "220px",
          minWidth: "160px",
          fontSize: "11px",
          lineHeight: 1.4,
          color: "#111",
        }}
      />
    </div>
  );
}

/* ── Map style picker (Layers icon → popover) ─────────────────── */

function MapStyleButton({
  value,
  onChange,
}: {
  value: "roadmap" | "satellite" | "hybrid";
  onChange: (v: "roadmap" | "satellite" | "hybrid") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const options: { key: "roadmap" | "satellite" | "hybrid"; label: string }[] = [
    { key: "roadmap", label: "Map" },
    { key: "satellite", label: "Satellite" },
    { key: "hybrid", label: "Hybrid" },
  ];
  const currentLabel = options.find((o) => o.key === value)?.label ?? "Map";
  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Map style: ${currentLabel}`}
        title={`Map style: ${currentLabel}`}
        className={`h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors ${open ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
      >
        <Layers className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 min-w-[8rem] rounded-lg border bg-background shadow-xl py-1 z-40"
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitemradio"
              aria-checked={value === o.key}
              onClick={() => { onChange(o.key); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors ${value === o.key ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span>{o.label}</span>
              {value === o.key && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Recruiter Brief panel (replaces work history when in Recruit Mode) ─ */

// Fire a global event so the floating RecruiterPanel can append this to the note.
function pinToNotes(label: string, kind?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("recruiter:add-talking-point", { detail: { label, kind } }));
}

function RecruiterBriefPanel({
  items, skills, certifications, compensation, kpis, jobSite, maxCommuteMiles, onCollapse, onSelectRole,
}: {
  items: ImmersiveWorkItem[];
  skills: ImmersiveSkill[];
  certifications: ImmersiveCert[];
  compensation: ImmersiveCompensation | null;
  kpis: { tenure: string; roles: number; miles: number; cities: number };
  jobSite: { address: string; lat: number; lng: number; miles: number | null; durationMin: number | null; loading: boolean; error: string | null } | null;
  maxCommuteMiles: number | null;
  onCollapse: () => void;
  onSelectRole: (id: string) => void;
}) {
  // Aggregate industries
  const industries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const v = (i.industry || "").trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  // Aggregate tools/tech from techStack + skillsUsed
  const tools = useMemo(() => {
    const counts = new Map<string, number>();
    const split = (s: string | null | undefined) =>
      (s || "").split(/[,;|\n]+/).map((x) => x.trim()).filter(Boolean);
    for (const i of items) {
      for (const t of split(i.techStack)) counts.set(t, (counts.get(t) || 0) + 1);
      for (const t of split(i.skillsUsed)) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  // Top skills (by proficiency rank)
  const topSkills = useMemo(() => {
    const rank: Record<string, number> = { expert: 4, advanced: 3, intermediate: 2, beginner: 1 };
    return [...skills].sort((a, b) => (rank[b.proficiency] || 0) - (rank[a.proficiency] || 0)).slice(0, 10);
  }, [skills]);

  // Work mode breakdown
  const workModes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const m = (i.workMode || "").trim().toLowerCase();
      if (m) counts.set(m, (counts.get(m) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  // Active roles in commute range when a job site is set
  const inRangeRoles = useMemo(() => {
    if (!jobSite || jobSite.miles == null || maxCommuteMiles == null) return null;
    return items.filter((i) => i.lat != null && i.lng != null).slice(0, 8);
  }, [items, jobSite, maxCommuteMiles]);

  const within = jobSite && jobSite.miles != null && maxCommuteMiles != null
    ? jobSite.miles <= maxCommuteMiles
    : null;

  return (
    <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-full max-h-[calc(75vh-110px)] overflow-y-auto scrollbar-thin pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-semibold flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-600" /> Recruiter Brief
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="text-muted-foreground hover:text-foreground"
          title="Collapse"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 text-[10px] text-muted-foreground inline-flex items-center gap-1">
        <StickyNote className="h-3 w-3 text-amber-500" />
        Tip: click any chip below to pin it as a talking point in your notes.
      </div>

      {/* Commute verdict */}
      {jobSite && (
        <div className={`mb-2 rounded-md px-2.5 py-1.5 text-[11px] border ${
          within === true ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-100" :
          within === false ? "bg-red-500/10 border-red-500/40 text-red-900 dark:text-red-100" :
          "bg-muted border-border text-muted-foreground"
        }`}>
          {jobSite.loading ? "Calculating commute…" :
           jobSite.error ? jobSite.error :
           within === true ? `✓ Commute fits (${jobSite.miles?.toFixed(1)} mi · ~${jobSite.durationMin} min)` :
           within === false ? `✗ Outside commute range (${jobSite.miles?.toFixed(1)} mi vs ${maxCommuteMiles} mi cap) — consider remote/hybrid` :
           "Drop a job site to check commute"}
        </div>
      )}

      {/* Quick KPIs */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Tenure</div>
          <div className="text-sm font-semibold">{kpis.tenure || "—"}</div>
        </div>
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Roles</div>
          <div className="text-sm font-semibold">{kpis.roles}</div>
        </div>
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Cities</div>
          <div className="text-sm font-semibold">{kpis.cities}</div>
        </div>
      </div>

      {/* Compensation */}
      {compensation && (compensation.salaryMin != null || compensation.salaryMax != null || compensation.salaryTarget != null || compensation.employmentTypes.length > 0) && (
        <BriefSection icon={<DollarSign className="h-3 w-3" />} label="Pay Expectations">
          <div className="text-[11px] text-foreground">{formatCompChip(compensation)}</div>
          {compensation.hasHardFloor && compensation.salaryMin != null && (
            <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
              Hard floor at {fmtCompAmount(compensation.salaryMin, compensation.period, compensation.currency)}
            </div>
          )}
          {compensation.benefitsMustHaves.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {compensation.benefitsMustHaves.map((b) => (
                <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {benefitLabel(b)}
                </span>
              ))}
            </div>
          )}
        </BriefSection>
      )}

      {/* Industries */}
      {industries.length > 0 && (
        <BriefSection icon={<Building2 className="h-3 w-3" />} label="Industries">
          <div className="flex flex-wrap gap-1">
            {industries.map(([name, n]) => (
              <button
                key={name}
                type="button"
                onClick={() => pinToNotes(name, "Industry")}
                title="Click to add to recruiter notes"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30 hover:ring-2 hover:ring-amber-400/60 transition"
              >
                {name}{n > 1 ? ` ×${n}` : ""}
              </button>
            ))}
          </div>
        </BriefSection>
      )}

      {/* Tools / Tech */}
      {tools.length > 0 && (
        <BriefSection icon={<Wrench className="h-3 w-3" />} label="Tools & Tech">
          <div className="flex flex-wrap gap-1">
            {tools.map(([name, n]) => (
              <button
                key={name}
                type="button"
                onClick={() => pinToNotes(name, "Tool")}
                title="Click to add to recruiter notes"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 hover:ring-2 hover:ring-amber-400/60 transition"
              >
                {name}{n > 1 ? ` ×${n}` : ""}
              </button>
            ))}
          </div>
        </BriefSection>
      )}

      {/* Skills */}
      {topSkills.length > 0 && (
        <BriefSection icon={<Brain className="h-3 w-3" />} label="Top Skills">
          <div className="flex flex-wrap gap-1">
            {topSkills.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pinToNotes(`${s.name} (${s.proficiency})`, "Skill")}
                title="Click to add to recruiter notes"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30 hover:ring-2 hover:ring-amber-400/60 transition"
              >
                {s.name}
                <span className="opacity-60"> · {s.proficiency}</span>
              </button>
            ))}
          </div>
        </BriefSection>
      )}

      {/* Work mode mix */}
      {workModes.length > 0 && (
        <BriefSection icon={<Navigation className="h-3 w-3" />} label="Work Mode History">
          <div className="flex flex-wrap gap-1">
            {workModes.map(([m, n]) => (
              <button
                key={m}
                type="button"
                onClick={() => pinToNotes(`${m} ×${n}`, "Work mode")}
                title="Click to add to recruiter notes"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 capitalize hover:ring-2 hover:ring-amber-400/60 transition"
              >
                {m} ×{n}
              </button>
            ))}
          </div>
        </BriefSection>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <BriefSection icon={<Award className="h-3 w-3" />} label={`Certifications (${certifications.length})`}>
          <div className="flex flex-wrap gap-1">
            {certifications.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pinToNotes(c.name, "Certification")}
                title="Click to add to recruiter notes"
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:ring-2 hover:ring-amber-400/60 transition"
              >
                {c.name}
              </button>
            ))}
          </div>
        </BriefSection>
      )}

      {/* Roles preview */}
      {inRangeRoles && inRangeRoles.length > 0 && (
        <BriefSection icon={<Briefcase className="h-3 w-3" />} label="Recent Roles">
          <ul className="space-y-0.5">
            {inRangeRoles.map((r) => (
              <li key={r.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectRole(r.id)}
                  className="flex-1 text-left text-[11px] px-1.5 py-1 rounded hover:bg-muted/60 truncate"
                  title={`${r.role || r.title || "Role"} @ ${r.company}`}
                >
                  <span className="font-medium">{r.role || r.title || "Role"}</span>
                  <span className="text-muted-foreground"> @ {r.company}</span>
                </button>
                <button
                  type="button"
                  onClick={() => pinToNotes(`${r.role || r.title || "Role"} @ ${r.company}`, "Role")}
                  title="Add to recruiter notes"
                  className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-amber-500/15 hover:text-amber-600"
                  aria-label="Pin role to notes"
                >
                  <StickyNote className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </BriefSection>
      )}
    </div>
  );
}

function BriefSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1 mb-1">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── Left panel (read-only viewer of work history) ──────────────── */

function WorkHistoryViewerPanel({
  items, kpis, focusedId, onSelect, onHover, onCollapse,
  availableTypes, isTypeOn, toggleType, metaFor,
  inventory = [],
  toolsOpen = false,
  onToggleTools,
}: {
  items: ImmersiveWorkItem[];
  kpis: { tenure: string; roles: number; cities: number; miles: number };
  focusedId: string | null;
  onSelect: (id: string) => void;
  onHover?: (id: string) => void;
  onCollapse: () => void;
  availableTypes: string[];
  isTypeOn: (t: string) => boolean;
  toggleType: (t: string) => void;
  metaFor: (t: string) => { label: string; emoji: string };
  inventory?: ImmersiveInventoryItem[];
  toolsOpen?: boolean;
  onToggleTools?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "tenure">("newest");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (k: string) =>
    setCollapsed((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const sorted = useMemo(() => {
    const filtered = items.filter((i) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        i.company.toLowerCase().includes(s) ||
        (i.title || "").toLowerCase().includes(s) ||
        (i.role || "").toLowerCase().includes(s) ||
        (i.location || "").toLowerCase().includes(s)
      );
    });
    return filtered.sort((a, b) => {
      if (sort === "tenure") {
        return tenureMonths(b.startDate, b.endDate) - tenureMonths(a.startDate, a.endDate);
      }
      if (sort === "newest") {
        // Active jobs always on top, then most recent start date
        const aActive = a.isActive || !a.endDate ? 1 : 0;
        const bActive = b.isActive || !b.endDate ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
      }
      const da = parseYM(a.startDate)?.getTime() ?? 0;
      const db = parseYM(b.startDate)?.getTime() ?? 0;
      return sort === "newest" ? db - da : da - db;
    });
  }, [items, search, sort]);

  // Group by type, ordered like the editor
  const groups = useMemo(() => {
    const order = ["job", "internship", "self-employed", "school", "military", "volunteer"];
    const m = new Map<string, ImmersiveWorkItem[]>();
    for (const i of sorted) {
      const t = i.type || "job";
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(i);
    }
    const labelFor = (t: string) =>
      t === "job" ? "Jobs" :
      t === "internship" ? "Internships" :
      t === "self-employed" ? "Self-Employed" :
      t === "school" ? "Education" :
      t === "military" ? "Military" :
      t === "volunteer" ? "Volunteer" : metaFor(t).label;
    return [...m.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([t, list]) => ({ type: t, label: labelFor(t), list }));
  }, [sorted]);

  return (
    <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-full max-h-[calc(75vh-110px)] overflow-y-auto scrollbar-thin pointer-events-auto">
      {/* Header — matches editor */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-semibold flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-muted-foreground" /> Work History
        </span>
        <div className="flex items-center gap-1">
          {inventory.length > 0 && onToggleTools && (
            <button
              type="button"
              onClick={onToggleTools}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold shadow-sm transition-all ${toolsOpen ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-transparent shadow-cyan-500/30" : "bg-gradient-to-r from-cyan-500/15 to-blue-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/40 hover:from-cyan-500/25 hover:to-blue-500/25 hover:border-cyan-500/60"}`}
              title={toolsOpen ? "Hide My Tools & Inventory" : `Show My Tools & Inventory (${inventory.length})`}
              aria-pressed={toolsOpen}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>My Tools</span>
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums font-bold ${toolsOpen ? "bg-white/30" : "bg-cyan-500/20"}`}>{inventory.length}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCollapse}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Career Journey Stats — matches editor */}
      <div className="mb-2.5 p-2 rounded-lg bg-muted/40 border">
        <div className="grid grid-cols-4 gap-1">
          <KpiCell label="Tenure" value={kpis.tenure} />
          <KpiCell label="Roles" value={String(kpis.roles)} />
          <KpiCell label="Miles" value={kpis.miles > 0 ? String(kpis.miles) : "—"} />
          <KpiCell label="Cities" value={String(kpis.cities)} />
        </div>
      </div>

      <>
      {/* Marker type filters */}
      {availableTypes.length > 1 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap" role="group" aria-label="Marker type filters">
          {availableTypes.map((t) => {
            const meta = metaFor(t);
            const on = isTypeOn(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                title={meta.label}
                aria-pressed={on}
                aria-label={`${on ? "Hide" : "Show"} ${meta.label}`}
                className={`inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-[11px] font-medium transition-colors ${on ? "bg-muted/60 text-foreground border-border" : "text-muted-foreground/60 border-transparent hover:text-muted-foreground hover:bg-muted/30"}`}
              >
                <span style={{ fontSize: 12, lineHeight: 1, opacity: on ? 1 : 0.45 }}>{meta.emoji}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + Sort — matches editor */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-full rounded-md border border-input bg-background pl-6 pr-6 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "oldest" | "tenure")}
            className="h-7 text-xs rounded border border-input bg-background px-1 text-foreground shrink-0 cursor-pointer"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="tenure">Longest</option>
          </select>
        </div>
      )}

      {/* Grouped list */}
      {groups.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No results.</p>
      )}
      {groups.map(({ type, label, list }) => {
        const meta = metaFor(type);
        const isCollapsed = collapsed.has(type);
        return (
          <div key={type} className="mb-2">
            <button
              type="button"
              onClick={() => toggleSection(type)}
              className="w-full flex items-center gap-1.5 text-sm font-semibold text-foreground/80 hover:text-foreground py-1"
            >
              <span>{meta.emoji}</span>
              <span>{label}</span>
              <span className="text-muted-foreground">({list.length})</span>
              {isCollapsed
                ? <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />}
            </button>
            {!isCollapsed && (
              <ul className="space-y-1">
                {list.map((w) => {
                  const months = tenureMonths(w.startDate, w.endDate);
                  const active = focusedId === w.id;
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(w.id)}
                        onMouseEnter={() => onHover?.(w.id)}
                        onFocus={() => onHover?.(w.id)}
                        className={`w-full text-left rounded-md px-2 py-1.5 border transition-colors ${
                          active
                            ? "bg-primary/10 border-primary/40"
                            : "border-transparent hover:bg-muted/40 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-medium text-foreground truncate">{w.company}</span>
                          {w.scheduleType && <Badge>{w.scheduleType}</Badge>}
                          {w.workMode && <Badge variant="secondary">{w.workMode}</Badge>}
                          {!w.endDate && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 ml-auto">● Now</span>
                          )}
                        </div>
                        {(w.title || w.role) && (
                          <p className="text-sm font-medium text-foreground/90 truncate mt-0.5">{w.title || w.role}</p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {(() => {
                            const loc = shortLoc(w.location || w.address);
                            return loc ? <span>{loc} · </span> : null;
                          })()}
                          {fmtYM(w.startDate)} – {w.endDate ? fmtYM(w.endDate) : "Present"}
                          {months > 0 && ` (${fmtTenure(months)})`}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      </>

    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

/* ── Tools & Inventory (read-only viewer) ───────────────────────── */

const INV_CATEGORY_LABEL: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  vehicle: "Vehicle",
  safety: "Safety",
  tool: "Tool",
  instrument: "Instrument",
  other: "Other",
};
const INV_CATEGORY_DOT: Record<string, string> = {
  hardware: "bg-blue-500",
  software: "bg-violet-500",
  vehicle: "bg-amber-500",
  safety: "bg-red-500",
  tool: "bg-cyan-500",
  instrument: "bg-emerald-500",
  other: "bg-slate-400",
};
const INV_CONDITION_BADGE: Record<string, string> = {
  new: "bg-emerald-500/10 text-emerald-600",
  good: "bg-blue-500/10 text-blue-600",
  fair: "bg-amber-500/10 text-amber-600",
  poor: "bg-red-500/10 text-red-600",
};

function ToolsInventoryPanel({ inventory, onSelect }: { inventory: ImmersiveInventoryItem[]; onSelect: (it: ImmersiveInventoryItem) => void }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("all");

  const cats = useMemo(() => {
    const s = new Set<string>();
    inventory.forEach((i) => s.add(i.category));
    return ["all", ...[...s].sort()];
  }, [inventory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((i) => {
      if (cat !== "all" && i.category !== cat) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.manufacturer ?? "").toLowerCase().includes(q) ||
        (i.model ?? "").toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [inventory, search, cat]);

  if (inventory.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">No public inventory items.</p>;
  }

  return (
    <div>
      {/* Search + category */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools…"
            className="h-7 w-full rounded-md border border-input bg-background pl-6 pr-6 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-7 text-xs rounded border border-input bg-background px-1 text-foreground shrink-0 cursor-pointer capitalize"
        >
          {cats.map((c) => (
            <option key={c} value={c}>{c === "all" ? "All" : INV_CATEGORY_LABEL[c] ?? c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No matches.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((it) => {
            const cover = it.photos.find((p) => p.isCover) ?? it.photos[0];
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onSelect(it)}
                className="text-left rounded-md border border-border hover:border-foreground/30 hover:bg-muted/40 transition-colors overflow-hidden flex flex-col"
              >
                <div className="relative aspect-square bg-muted">
                  {cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cover.filePath}
                      alt={it.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{
                        objectPosition: `${cover.focalX}% ${cover.focalY}%`,
                        transform: `scale(${cover.zoom})`,
                        transformOrigin: `${cover.focalX}% ${cover.focalY}%`,
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                      <Wrench className="h-6 w-6" />
                    </div>
                  )}
                  <span className={`absolute top-1 left-1 h-2 w-2 rounded-full shadow ${INV_CATEGORY_DOT[it.category] ?? "bg-slate-400"}`} />
                </div>
                <div className="p-1.5 space-y-0.5">
                  <p className="text-xs font-semibold leading-tight line-clamp-2">{it.name}</p>
                  {(it.manufacturer || it.model) && (
                    <p className="text-[10px] text-muted-foreground truncate">{[it.manufacturer, it.model].filter(Boolean).join(" ")}</p>
                  )}
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    <span className={`px-1 py-0 rounded text-[9px] capitalize ${INV_CONDITION_BADGE[it.condition] ?? "bg-muted text-muted-foreground"}`}>{it.condition}</span>
                    {it.currentValue != null && (
                      <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">${Number(it.currentValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolDetailModal({ item, onClose }: { item: ImmersiveInventoryItem; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const photo = item.photos[idx] ?? item.photos[0];
  const subtitle = [item.manufacturer, item.model].filter(Boolean).join(" ");
  const next = () => item.photos.length && setIdx((i) => (i + 1) % item.photos.length);
  const prev = () => item.photos.length && setIdx((i) => (i - 1 + item.photos.length) % item.photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.photos.length]);

  return (
    <div
      className="fixed inset-0 z-[2150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background text-foreground rounded-lg shadow-2xl border border-border max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${INV_CATEGORY_DOT[item.category] ?? "bg-slate-400"}`} />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{INV_CATEGORY_LABEL[item.category] ?? item.category}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-muted" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-0 overflow-y-auto">
          <div className="bg-muted/30 p-4 flex flex-col items-center gap-3 border-b md:border-b-0 md:border-r border-border">
            <div className="relative w-full aspect-square max-w-md bg-muted rounded-lg overflow-hidden">
              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.filePath}
                    alt={photo.caption ?? item.name}
                    className="w-full h-full object-cover"
                    style={{
                      objectPosition: `${photo.focalX}% ${photo.focalY}%`,
                      transform: `scale(${photo.zoom})`,
                      transformOrigin: `${photo.focalX}% ${photo.focalY}%`,
                    }}
                  />
                  {item.photos.length > 1 && (
                    <>
                      <button type="button" onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60" title="Previous (←)">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60" title="Next (→)">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white tabular-nums">
                        {idx + 1} / {item.photos.length}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                  <Wrench className="h-10 w-10" />
                </div>
              )}
            </div>
            {item.photos.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {item.photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`h-12 w-12 rounded overflow-hidden border-2 transition-all ${i === idx ? "border-foreground" : "border-transparent opacity-60 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.filePath}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition: `${p.focalX}% ${p.focalY}%`,
                        transform: `scale(${p.zoom})`,
                        transformOrigin: `${p.focalX}% ${p.focalY}%`,
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-xl font-semibold leading-tight">{item.name}</h2>
              {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            {item.currentValue != null && (
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold tabular-nums">${Number(item.currentValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                {item.purchasePrice != null && item.purchasePrice !== item.currentValue && (
                  <span className="text-sm text-muted-foreground line-through tabular-nums">
                    ${Number(item.purchasePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">current value</span>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${INV_CONDITION_BADGE[item.condition] ?? "bg-muted text-muted-foreground"}`}>{item.condition}</span>
              <span className="px-2 py-0.5 rounded-full text-xs capitalize bg-muted text-muted-foreground">{item.ownership}</span>
            </div>
            {item.proficiency != null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Skill level</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`h-2 w-2 rounded-full ${n <= (item.proficiency ?? 0) ? "bg-orange-500" : "bg-muted"}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{item.proficiency}/5</span>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {item.manufacturer && (<><dt className="text-xs text-muted-foreground">Manufacturer</dt><dd>{item.manufacturer}</dd></>)}
              {item.model && (<><dt className="text-xs text-muted-foreground">Model</dt><dd>{item.model}</dd></>)}
              {item.location && (<><dt className="text-xs text-muted-foreground">Location</dt><dd>📍 {item.location}</dd></>)}
              {item.purchaseDate && (<><dt className="text-xs text-muted-foreground">Purchased</dt><dd>{new Date(item.purchaseDate).toLocaleDateString()}</dd></>)}
              {item.purchasePrice != null && (<><dt className="text-xs text-muted-foreground">Purchase price</dt><dd className="tabular-nums">${Number(item.purchasePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}</dd></>)}
            </dl>
            {item.tags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {item.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
                <p className="text-sm whitespace-pre-wrap text-foreground/90">{item.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "secondary" }) {
  const cls = variant === "secondary"
    ? "bg-muted text-muted-foreground border-border"
    : "bg-primary/10 text-primary border-primary/20";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0 text-[11px] font-medium border ${cls}`}>
      {children}
    </span>
  );
}

/* ── Right focus card (mirrors editor work-history detail) ──────── */

function FocusCard({
  item,
  items,
  onClose,
  onNavigate,
  analytics,
}: {
  item: ImmersiveWorkItem;
  items: ImmersiveWorkItem[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  analytics?: { track: (eventType: IrEventType, eventData?: unknown) => void };
}) {
  const meta = metaFor(item.type);
  const months = tenureMonths(item.startDate, item.endDate);
  const tech = parseTechStack(item.techStack);
  const skillsUsed = parseSkillsUsed(item.skillsUsed);
  const allSkills = Array.from(new Set([...skillsUsed, ...tech]));
  const accomplishments = parseAccomplishments(item.accomplishments);
  const responsibilities = parseAccomplishments(item.responsibilities);
  const gallery = item.galleryPhotos ?? [];
  const attachments = item.attachments ?? [];
  const equipment = item.equipment ?? [];
  const uniform = parseUniform(item.uniformData);
  const uniformZones = uniform?.zones ? Object.entries(uniform.zones).filter(([, z]) => z?.item) : [];
  const payText = formatPay(item);
  const hasIncome = !!(payText || item.bonusAmount != null || item.hoursPerWeek != null || item.payFrequency);
  const hasCommute = item.commuteMinutes != null || item.commuteDistance != null || !!item.commuteMode;
  const hasUniform = !!uniform?.enabled || uniformZones.length > 0;
  const isSchool = item.type === "school";
  const isInternship = item.type === "internship";
  const isSelfEmployed = item.type === "self-employed";
  const isUnemployed = item.type === "unemployed";
  const isCurrent = !item.endDate || !!item.isActive;

  const startStr = fmtYM(item.startDate);
  const endStr = item.endDate ? fmtYM(item.endDate) : "Present";
  const tenure = months > 0 ? fmtTenure(months) : null;
  const addr = item.address || item.location || "";
  const shortAddr = addr ? shortLoc(addr) : "";

  const mgrAbbrev = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("supervisor") || n.includes("supv")) return "Supv.";
    if (n.includes("director") || n.includes("dir")) return "Dir.";
    if (n.includes("lead")) return "Lead";
    if (n.includes("vp") || n.includes("vice president")) return "VP";
    if (n.includes("chief")) return "Chief";
    return "Mgr.";
  };

  const [envOpen, setEnvOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"gallery" | "attachments" | "skills" | "equipment" | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxPhotoId, setLightboxPhotoId] = useState<string | null>(null);
  const [lightboxAnnId, setLightboxAnnId] = useState<string | null>(null);

  // Deep link: ?ann=<annotationId> auto-opens the lightbox on the matching photo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const annId = params.get("ann");
    if (!annId) return;
    const target = (item.galleryPhotos ?? []).find((p) =>
      (p.annotations ?? []).some((a) => a.id === annId)
    );
    if (target) {
      setSidePanel("gallery");
      setLightboxPhotoId(target.id);
      setLightboxAnnId(annId);
    }
  }, [item.id, item.galleryPhotos]);
  const toggleSection = (k: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const hasEnv = !!(item.department || item.teamSize != null || item.managerName);

  const idx = items.findIndex((i) => i.id === item.id);
  const prev = idx > 0 ? items[idx - 1] : items[items.length - 1];
  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : items[0];
  const canNavigate = items.length > 1;

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("focus", item.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  return (
    <div className="w-full max-h-[calc(100vh-200px)] flex flex-col rounded-xl bg-background/95 backdrop-blur-md border shadow-xl text-foreground overflow-hidden pointer-events-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md px-1.5 py-1 hover:bg-muted/50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Work History</span>
        </button>
        <div className="flex items-center gap-0.5">
          {canNavigate && (
            <>
              <button
                type="button"
                onClick={() => prev && onNavigate(prev.id)}
                title="Previous"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => next && onNavigate(next.id)}
                title="Next"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleShare}
            title={copied ? "Copied!" : "Copy link"}
            className={`h-7 w-7 rounded-md hover:bg-muted/50 flex items-center justify-center transition-colors ${copied ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"}`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body — scrolls */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-2.5">
          <div className="rounded-lg bg-muted/40 border overflow-hidden">
            {/* Cover Image Banner */}
            {item.coverImage ? (
              <div className="relative h-24 overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverImage}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-[6000ms] ease-out group-hover:scale-110"
                  style={{ objectPosition: `center ${item.coverImageY ?? 50}%` }}
                />
              </div>
            ) : (
              <div
                className="w-full h-12"
                style={{ background: `linear-gradient(135deg, ${meta.bg}33, ${meta.bg}11)` }}
              />
            )}

            <div className="p-2.5 space-y-1.5">
              {/* Row 1 — Company + type/schedule/mode badges + size */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {isSchool ? (
                  <GraduationCap className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                ) : isSelfEmployed ? (
                  <span className="text-xs shrink-0">🧑‍💻</span>
                ) : isUnemployed ? (
                  <SearchIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
                ) : (
                  <Briefcase className={`h-3.5 w-3.5 shrink-0 ${isInternship ? "text-cyan-600" : "text-gray-500"}`} />
                )}
                <span className="text-sm font-semibold">{item.company}</span>
                {item.scheduleType && (
                  <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">
                    {item.scheduleType.replace("-", " ")}
                  </span>
                )}
                {item.workMode && (
                  <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded capitalize">
                    {item.workMode}
                  </span>
                )}
                {isSchool && (
                  <span className="text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">School</span>
                )}
                {isInternship && (
                  <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">Internship</span>
                )}
                {isSelfEmployed && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">Self-Employed</span>
                )}
                {item.industry && (
                  <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded shrink-0">
                    {item.industry}
                  </span>
                )}
                {item.companySize && (
                  <span className="ml-auto text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded capitalize shrink-0">
                    {item.companySize.replace("-", " ")}
                  </span>
                )}
              </div>

              {/* Row 2 — Position / Degree */}
              {isSchool ? (
                (item.degree || item.major) && (
                  <p className="text-sm font-medium text-foreground/90">
                    {item.degree}
                    {item.degree && item.major ? " in " : ""}
                    {item.major}
                  </p>
                )
              ) : (
                (item.title || item.role) && (
                  <p className="text-sm font-medium text-foreground/90">{item.title || item.role}</p>
                )
              )}

              {/* Row 3 — Address + Date range */}
              {!isUnemployed && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {shortAddr && (
                    <>
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{shortAddr}</span>
                    </>
                  )}
                  {(item.startDate || item.endDate) && (
                    <>
                      {shortAddr && <span className="shrink-0">·</span>}
                      <Clock className="h-2.5 w-2.5 shrink-0" />
                      <span className="shrink-0">{startStr ?? "?"} – {endStr}</span>
                      {isCurrent && (
                        <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 rounded shrink-0">
                          current
                        </span>
                      )}
                      {tenure && <span className="text-muted-foreground/70 shrink-0">({tenure})</span>}
                    </>
                  )}
                </div>
              )}

              {/* Row 4 — Work environment */}
              {hasEnv && (
                <div className="pt-1 border-t border-border/50">
                  <button
                    type="button"
                    className="w-full flex items-center gap-1.5"
                    onClick={() => setEnvOpen((v) => !v)}
                  >
                    <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <div className="flex-1 flex items-center gap-1 flex-wrap text-xs">
                      {item.department && <span className="font-medium">{item.department}</span>}
                      {item.teamSize != null && (
                        <>
                          {item.department && <span className="text-muted-foreground">·</span>}
                          <span className="text-muted-foreground">Team of {item.teamSize}</span>
                        </>
                      )}
                      {item.managerName && (
                        <>
                          {(item.department || item.teamSize != null) && (
                            <span className="text-muted-foreground">·</span>
                          )}
                          <span className="text-muted-foreground">
                            {mgrAbbrev(item.managerName)} {item.managerName}
                          </span>
                        </>
                      )}
                    </div>
                    {envOpen ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Inline skills chips (preview) ── */}
          {allSkills.length > 0 && (
            <div className="mt-2 px-1 flex flex-wrap gap-1 items-center">
              {(skillsExpanded ? allSkills : allSkills.slice(0, 5)).map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 text-[10px] rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/20"
                >
                  {s}
                </span>
              ))}
              {allSkills.length > 5 && (
                <button
                  type="button"
                  onClick={() => setSkillsExpanded((v) => !v)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {skillsExpanded ? "Show less" : `+${allSkills.length - 5} more`}
                </button>
              )}
            </div>
          )}

          {/* ── Quick-access toolbar (tabs) — only show tabs with data ── */}
          {(gallery.length > 0 || attachments.length > 0 || allSkills.length > 0 || equipment.length > 0) && (
            <div className="mt-2 flex items-center gap-1 px-1 flex-wrap">
              {([
                { key: "gallery" as const, icon: Images, label: "Gallery", count: gallery.length, activeColor: "bg-pink-500/10 text-pink-500" },
                { key: "attachments" as const, icon: Paperclip, label: "Attachments", count: attachments.length, activeColor: "bg-amber-500/10 text-amber-500" },
                { key: "skills" as const, icon: Brain, label: "Skills", count: allSkills.length, activeColor: "bg-violet-500/10 text-violet-500" },
                { key: "equipment" as const, icon: Wrench, label: "Equipment", count: equipment.length, activeColor: "bg-cyan-500/10 text-cyan-500" },
              ] as const).filter((t) => t.count > 0).map(({ key, icon: Icon, label, count, activeColor }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors ${sidePanel === key ? activeColor : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                  onClick={() => setSidePanel(sidePanel === key ? null : key)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  <span className="text-[10px] opacity-70">{count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tab content panel */}
          {sidePanel && (
            <div className="mt-2 rounded-lg border bg-muted/30 p-2.5">
              {sidePanel === "skills" && allSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allSkills.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 text-[11px] rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/20"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {sidePanel === "gallery" && gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {gallery.map((p) => {
                    const annCount = p.annotations?.length ?? 0;
                    const hasAnn = annCount > 0;
                    if (hasAnn) {
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setLightboxPhotoId(p.id); setLightboxAnnId(null); }}
                          className="relative aspect-square overflow-hidden rounded border bg-muted hover:opacity-90 transition-opacity text-left"
                          title={p.caption ?? p.fileName}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.filePath} alt={p.caption ?? ""} className="absolute inset-0 h-full w-full object-cover" />
                          <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-black/70 text-white text-[10px] font-semibold">
                            {annCount}
                          </span>
                        </button>
                      );
                    }
                    return (
                      <a
                        key={p.id}
                        href={p.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-square overflow-hidden rounded border bg-muted hover:opacity-90 transition-opacity"
                        title={p.caption ?? p.fileName}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.filePath} alt={p.caption ?? ""} className="absolute inset-0 h-full w-full object-cover" />
                      </a>
                    );
                  })}
                </div>
              )}
              {sidePanel === "attachments" && attachments.length > 0 && (
                <ul className="space-y-1">
                  {attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2 py-1.5 rounded border bg-background hover:bg-muted/40 transition-colors text-[11px]"
                      >
                        <Paperclip className="h-3 w-3 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{a.label}</div>
                          <div className="truncate text-muted-foreground text-[10px]">
                            {a.category} · {fmtBytes(a.fileSize)}
                          </div>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {sidePanel === "equipment" && equipment.length > 0 && (
                <ul className="space-y-1.5">
                  {equipment.map((e) => {
                    const cover = e.photos?.find((p) => p.isCover) ?? e.photos?.[0];
                    return (
                      <li key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded border bg-background text-[11px]">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover.filePath} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Wrench className="h-3.5 w-3.5 text-cyan-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{e.name}</div>
                          <div className="truncate text-muted-foreground text-[10px]">
                            {[e.manufacturer, e.model].filter(Boolean).join(" · ") || e.category}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ── Income History ── */}
          {hasIncome && (
            <div className="mt-2 rounded-lg border overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors"
                onClick={() => toggleSection("income")}
              >
                <span className="text-[13px] font-medium flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-teal-500" /> Income
                </span>
                {openSections.has("income") ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              {openSections.has("income") && (
                <div className="px-2 pb-2 space-y-1 text-[11px]">
                  {payText && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pay rate</span>
                      <span className="font-medium">{payText}</span>
                    </div>
                  )}
                  {item.payFrequency && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frequency</span>
                      <span className="font-medium capitalize">{item.payFrequency}</span>
                    </div>
                  )}
                  {item.hoursPerWeek != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hours / week</span>
                      <span className="font-medium">{item.hoursPerWeek}h</span>
                    </div>
                  )}
                  {item.bonusAmount != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Annual bonus</span>
                      <span className="font-medium">
                        {(!item.salaryCurrency || item.salaryCurrency === "USD" ? "$" : item.salaryCurrency)}
                        {item.bonusAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Commute ── */}
          {hasCommute && (
            <div className="mt-2 rounded-lg border overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors"
                onClick={() => toggleSection("commute")}
              >
                <span className="text-[13px] font-medium flex items-center gap-1.5">
                  <Navigation className="h-3.5 w-3.5 text-cyan-500" /> Commute
                </span>
                {openSections.has("commute") ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              {openSections.has("commute") && (
                <div className="px-2 pb-2 space-y-1 text-[11px]">
                  {item.commuteMode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mode</span>
                      <span className="font-medium capitalize">{item.commuteMode}</span>
                    </div>
                  )}
                  {item.commuteMinutes != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time (one-way)</span>
                      <span className="font-medium">{item.commuteMinutes} min</span>
                    </div>
                  )}
                  {item.commuteDistance != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Distance (one-way)</span>
                      <span className="font-medium">{item.commuteDistance} mi</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Uniform / PPE ── */}
          {hasUniform && (
            <div className="mt-2 rounded-lg border overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors"
                onClick={() => toggleSection("uniform")}
              >
                <span className="text-[13px] font-medium flex items-center gap-1.5">
                  <PersonStanding className="h-3.5 w-3.5 text-orange-500" /> Uniform / PPE
                </span>
                {openSections.has("uniform") ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              {openSections.has("uniform") && (
                <div className="px-2 pb-2 space-y-1 text-[11px]">
                  {uniform?.category && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category</span>
                      <span className="font-medium capitalize">{uniform.category}</span>
                    </div>
                  )}
                  {uniformZones.length > 0 ? (
                    <ul className="space-y-1 pt-1">
                      {uniformZones.map(([id, z]) => (
                        <li key={id} className="flex items-center gap-1.5">
                          {z.color && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border"
                              style={{ background: z.color }}
                            />
                          )}
                          <span className="font-medium capitalize">{id.replace(/-/g, " ")}:</span>
                          <span className="text-muted-foreground truncate">{z.item}</span>
                          {z.providedBy && (
                            <span className="text-[10px] text-muted-foreground/70 ml-auto shrink-0">
                              {z.providedBy}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Required</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Description / About */}
          {item.description && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70 mb-2">About</h4>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                {item.description}
              </p>
            </div>
          )}

          {/* Responsibilities */}
          {responsibilities.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70 mb-2 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Responsibilities
              </h4>
              <ul className="space-y-1.5 text-sm text-foreground/90 leading-relaxed">
                {responsibilities.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary shrink-0 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Accomplishments */}
          {accomplishments.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70 mb-2 flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-amber-500" /> Accomplishments
              </h4>
              <ul className="space-y-1.5 text-sm text-foreground/90 leading-relaxed">
                {accomplishments.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500 shrink-0 mt-0.5">★</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tech stack */}
          {tech.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70 mb-2 flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5" /> Tech & Tools
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {tech.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <button
          type="button"
          onClick={onClose}
          className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-2 border-t hover:bg-muted/50 transition-colors"
        >
          <ChevronLeft className="h-3 w-3" /> Back to all work history
        </button>
      </div>

      {/* Photo lightbox with annotations */}
      {lightboxPhotoId && (() => {
        const photo = gallery.find((p) => p.id === lightboxPhotoId);
        if (!photo) return null;
        const anns: Annotation[] = (photo.annotations ?? []).map((a) => {
          let parsedTags: string[] | null = null;
          if (a.tags) {
            try {
              const t = JSON.parse(a.tags);
              if (Array.isArray(t)) parsedTags = t.filter((x): x is string => typeof x === "string");
            } catch {}
          }
          let parsedGeometry: unknown = a.geometry;
          try { parsedGeometry = JSON.parse(a.geometry); } catch {}
          return {
            id: a.id,
            kind: a.kind as Annotation["kind"],
            geometry: parsedGeometry,
            title: a.title ?? null,
            body: a.body ?? null,
            color: a.color ?? "#ef4444",
            sortOrder: a.sortOrder ?? null,
            isPrivate: false,
            tags: parsedTags,
          };
        });
        return (
          <div
            className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
            onClick={() => { setLightboxPhotoId(null); setLightboxAnnId(null); }}
          >
            <div
              className="relative max-w-[95vw] max-h-[95vh] bg-background rounded-lg shadow-2xl overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => { setLightboxPhotoId(null); setLightboxAnnId(null); }}
                className="absolute top-2 right-2 z-10 inline-flex items-center justify-center h-8 w-8 rounded-full bg-black/70 text-white hover:bg-black"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="max-w-[90vw]">
                <AnnotationViewer
                  imageUrl={photo.filePath}
                  imageRotation={photo.rotation ?? 0}
                  annotations={anns}
                  initialAnnotationId={lightboxAnnId}
                  autoTour={false}
                  onAnnotationView={(annId) => {
                    analytics?.track("annot_view", { photoId: photo.id, annotationId: annId, workHistoryId: item.id });
                  }}
                  onTourComplete={() => {
                    analytics?.track("tour_complete", { photoId: photo.id, workHistoryId: item.id });
                  }}
                />
                {photo.caption && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t">{photo.caption}</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {title}
      </h4>
      {children}
    </div>
  );
}

function FactPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-gray-300">
      <Icon className="h-3 w-3 text-indigo-300" />
      <span className="truncate max-w-[180px]">{label}</span>
    </span>
  );
}

function DLRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-200">{value}</dd>
    </div>
  );
}

/* ── Sections drawer (Skills / Certs / Contact) ─────────────────── */

function SectionsDrawer({
  profile, summary, skills, certifications, onClose,
}: {
  profile: ImmersiveProfile | null;
  summary?: string | null;
  skills: ImmersiveSkill[];
  certifications: ImmersiveCert[];
  onClose: () => void;
}) {
  const skillsByCategory = useMemo(() => {
    const acc: Record<string, ImmersiveSkill[]> = {};
    for (const s of skills) {
      (acc[s.category || "Other"] ??= []).push(s);
    }
    return acc;
  }, [skills]);

  return (
    <>
      <div
        className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-gray-900 border-l border-white/10 text-gray-100 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-base font-semibold">Profile</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-white/10 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {summary && (
            <Section title="Summary" icon={UserIcon}>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{summary}</p>
            </Section>
          )}

          {skills.length > 0 && (
            <Section title="Skills" icon={Code2}>
              <div className="space-y-3">
                {Object.entries(skillsByCategory).map(([cat, list]) => (
                  <div key={cat}>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{cat}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((s) => (
                        <span
                          key={s.id}
                          className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/15 text-indigo-200 border border-indigo-400/20"
                          title={s.proficiency}
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {certifications.length > 0 && (
            <Section title="Certifications" icon={Award}>
              <ul className="space-y-2">
                {certifications.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.issuer}
                        {c.issueDate && ` · ${fmtYM(c.issueDate.slice(0, 7))}`}
                      </p>
                    </div>
                    {c.credentialUrl && (
                      <a
                        href={c.credentialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

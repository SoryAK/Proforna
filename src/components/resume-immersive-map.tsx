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

import { useEffect, useMemo, useRef, useState } from "react";
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
  Play,
  Pause,
  RotateCcw,
  Route,
} from "lucide-react";
import { useIrAnalytics } from "@/lib/use-ir-analytics";
import RecruiterPanel from "@/components/recruiter-panel";

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
  galleryPhotos?: { id: string; filePath: string; caption?: string | null; fileName: string }[];
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
  city?: string | null;
  state?: string | null;
}

export interface ImmersiveSkill { id: string; name: string; category: string; proficiency: string }
export interface ImmersiveCert  { id: string; name: string; issuer: string; issueDate: string; expiryDate: string | null; credentialUrl: string | null }

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

/* ── Component ──────────────────────────────────────────────────── */

export default function ResumeImmersiveMap({ items, profile, skills = [], certifications = [], summary, updatedAt, slug = null, accessRequestId = null }: Props) {
  const analytics = useIrAnalytics(slug, accessRequestId);
  const geocoded = useMemo(
    () => items.filter((i) => typeof i.lat === "number" && typeof i.lng === "number") as (ImmersiveWorkItem & { lat: number; lng: number })[],
    [items],
  );

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set());
  const [mapStyle, setMapStyle] = useState<"roadmap" | "satellite" | "hybrid">("roadmap");
  const focused = useMemo(() => items.find((i) => i.id === focusedId) ?? null, [items, focusedId]);

  // Read ?focus= deep-link on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const f = url.searchParams.get("focus");
    if (f && items.some((i) => i.id === f)) setFocusedId(f);
    // intentionally no deps — run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Years of experience (excluding school) — coarse, based on earliest start date
  const yrsExp = useMemo(() => {
    const starts = items
      .filter((i) => i.type !== "school")
      .map((i) => parseYM(i.startDate)?.getTime())
      .filter((t): t is number => typeof t === "number");
    if (starts.length === 0) return 0;
    const earliest = Math.min(...starts);
    const ms = Date.now() - earliest;
    return Math.max(0, Math.floor(ms / (365.25 * 24 * 3600 * 1000)));
  }, [items]);

  const [bioExpanded, setBioExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [eduExpanded, setEduExpanded] = useState(true);
  const [contactOpen, setContactOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const contactBtnRef = useRef<HTMLButtonElement | null>(null);
  const contactPopoverRef = useRef<HTMLDivElement | null>(null);

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

  const educationItems = useMemo(
    () => items.filter((i) => (i.type || "").toLowerCase() === "school"),
    [items],
  );

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
  const [showJourneyLine, setShowJourneyLine] = useState(true);
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
      />

      {/* Top-right sections pill */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="absolute top-3 right-3 z-30 inline-flex items-center gap-2 rounded-xl bg-background/95 backdrop-blur-md border px-3 py-2 text-sm font-medium text-foreground shadow-xl hover:bg-muted/40 transition-colors"
      >
        <Layers className="h-4 w-4 text-muted-foreground" />
        More
      </button>

      {/* Recruiter save + notes (anonymous, cookie-keyed) — rendered inside the bottom action bar */}

      {/* Map style toggle (right side, under More) */}
      <div className="absolute top-16 right-3 z-30 inline-flex items-center rounded-xl bg-background/95 backdrop-blur-md border shadow-xl overflow-hidden text-xs">
        {([
          { key: "roadmap" as const, label: "Map" },
          { key: "satellite" as const, label: "Satellite" },
          { key: "hybrid" as const, label: "Hybrid" },
        ]).map((s, idx) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setMapStyle(s.key)}
            className={`px-2.5 py-1.5 transition-colors ${idx > 0 ? "border-l" : ""} ${mapStyle === s.key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/40"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Type filter chips (top-center) */}
      {availableTypes.length > 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-xl bg-background/95 backdrop-blur-md border shadow-xl px-2 py-1.5">
          {availableTypes.map((t) => {
            const meta = metaFor(t);
            const on = isTypeOn(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                title={meta.label}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${on ? "text-foreground bg-muted/50" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
              >
                <span style={{ fontSize: 14, lineHeight: 1, opacity: on ? 1 : 0.4 }}>{meta.emoji}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}

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
          actionsSlot={slug ? (
            <RecruiterPanel
              irSlug={slug}
              candidateName={profile?.fullName ?? null}
              candidateHeadline={profile?.headline ?? null}
            />
          ) : null}
        />
      ) : (
        slug && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 rounded-xl bg-background/95 backdrop-blur-md border shadow-xl px-2 py-2">
            <RecruiterPanel
              irSlug={slug}
              candidateName={profile?.fullName ?? null}
              candidateHeadline={profile?.headline ?? null}
            />
          </div>
        )
      )}

      {/* Left column: bio card + work-history panel */}
      {!panelCollapsed ? (
        <div className="absolute top-3 left-3 z-20 w-96 max-w-[calc(100vw-24px)] flex flex-col gap-2 pointer-events-none">
          {/* Bio card */}
          <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 pointer-events-auto">
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
                  <p className="text-base font-semibold text-foreground truncate">{profile?.fullName || "Candidate"}</p>
                  {yrsExp > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                      {yrsExp}+ yrs
                    </span>
                  )}
                </div>
                {profile?.headline && (
                  <p className="text-sm text-primary truncate">{profile.headline}</p>
                )}
                {(profile?.city || profile?.state) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[profile?.city, profile?.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {profile && (profile.email || profile.phone || profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl || profile.schedulingUrl) && (
                  <div className="mt-1.5 relative flex items-center gap-2 flex-wrap">
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
                    {updatedAt && (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title={new Date(updatedAt).toLocaleString()}
                      >
                        Updated {fmtRelative(updatedAt)}
                      </span>
                    )}
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
                      if (profile.linkedinUrl) rows.push({
                        key: "linkedin", Icon: Linkedin, label: "LinkedIn", value: profile.linkedinUrl.replace(/^https?:\/\/(www\.)?/, ""),
                        href: profile.linkedinUrl, external: true, copyValue: profile.linkedinUrl,
                      });
                      if (profile.githubUrl) rows.push({
                        key: "github", Icon: Github, label: "GitHub", value: profile.githubUrl.replace(/^https?:\/\/(www\.)?/, ""),
                        href: profile.githubUrl, external: true, copyValue: profile.githubUrl,
                      });
                      if (profile.portfolioUrl) rows.push({
                        key: "portfolio", Icon: Globe, label: "Portfolio", value: profile.portfolioUrl.replace(/^https?:\/\/(www\.)?/, ""),
                        href: profile.portfolioUrl, external: true, copyValue: profile.portfolioUrl,
                      });
                      if (profile.schedulingUrl) rows.push({
                        key: "schedule", Icon: Calendar, label: "Schedule a call", value: "Book a time",
                        href: profile.schedulingUrl, external: true, copyValue: profile.schedulingUrl,
                      });
                      return (
                        <div
                          ref={contactPopoverRef}
                          role="dialog"
                          aria-modal="false"
                          aria-label="Contact options"
                          className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-lg border bg-background shadow-xl p-1.5"
                        >
                          <div className="flex items-center justify-between px-1.5 py-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Contact {profile.fullName?.split(" ")[0] || ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => setContactOpen(false)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Close"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <ul className="space-y-0.5">
                            {rows.map((r) => (
                              <li key={r.key} className="group flex items-center gap-2 rounded-md hover:bg-muted/40 transition-colors">
                                <a
                                  href={r.href}
                                  target={r.external ? "_blank" : undefined}
                                  rel={r.external ? "noopener noreferrer" : undefined}
                                  onClick={() => analytics.track("contact_method_click", { method: r.key })}
                                  className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5"
                                >
                                  <r.Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{r.label}</div>
                                    <div className="text-xs text-foreground truncate">{r.value}</div>
                                  </div>
                                </a>
                                {r.copyValue && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      copyToClipboard(r.key, r.copyValue!);
                                    }}
                                    className="px-2 py-1.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                    title={`Copy ${r.label.toLowerCase()}`}
                                  >
                                    {copiedKey === r.key ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPanelCollapsed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0 self-start"
                title="Collapse"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            {summary && (
              <div className="mt-2">
                <p
                  className={`text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line ${
                    summaryExpanded ? "" : "line-clamp-4"
                  }`}
                >
                  {summary}
                </p>
                {summary.length > 220 && (
                  <button
                    type="button"
                    onClick={() => setSummaryExpanded((v) => !v)}
                    className="mt-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    {summaryExpanded ? "Show less" : "Read more"}
                  </button>
                )}
              </div>
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
          </div>

          {/* Work history panel — replaced by focus card when a job is selected */}
          {focused ? (
            <FocusCard
              item={focused}
              items={visibleItems}
              onClose={() => setFocusedId(null)}
              onNavigate={(id) => setFocusedId(id)}
            />
          ) : (
            <WorkHistoryViewerPanel
              items={visibleItems.filter((i) => (i.type || "").toLowerCase() !== "school")}
              kpis={kpis}
              focusedId={focusedId}
              onSelect={(id) => setFocusedId((cur) => (cur === id ? null : id))}
              onCollapse={() => setPanelCollapsed(true)}
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
}: {
  items: (ImmersiveWorkItem & { lat: number; lng: number })[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  mapStyle?: "roadmap" | "satellite" | "hybrid";
  yearRange?: [number, number] | null;
  playing?: boolean;
  showJourneyLine?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const markerById = useRef<Map<string, { marker: google.maps.marker.AdvancedMarkerElement; el: HTMLElement }>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const journeyPolylineRef = useRef<google.maps.Polyline | null>(null);
  const onFocusRef = useRef(onFocus);
  useEffect(() => { onFocusRef.current = onFocus; }, [onFocus]);
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
        if (z < 14) mapRef.current.setZoom(15);
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

/* ── Left panel (read-only viewer of work history) ──────────────── */

function WorkHistoryViewerPanel({
  items, kpis, focusedId, onSelect, onCollapse,
}: {
  items: ImmersiveWorkItem[];
  kpis: { tenure: string; roles: number; cities: number; miles: number };
  focusedId: string | null;
  onSelect: (id: string) => void;
  onCollapse: () => void;
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
    <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-full max-h-[calc(60vh-110px)] overflow-y-auto scrollbar-thin pointer-events-auto">
      {/* Header — matches editor */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-semibold flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-muted-foreground" /> Work History
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Collapse"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
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
                          <p className="text-sm text-muted-foreground truncate mt-0.5">{w.title || w.role}</p>
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
}: {
  item: ImmersiveWorkItem;
  items: ImmersiveWorkItem[];
  onClose: () => void;
  onNavigate: (id: string) => void;
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
    <div className="w-full max-h-[calc(60vh-110px)] flex flex-col rounded-xl bg-background/95 backdrop-blur-md border shadow-xl text-foreground overflow-hidden pointer-events-auto">
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
      <div className="flex-1 overflow-y-auto">
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
                  <p className="text-xs text-muted-foreground">
                    {item.degree}
                    {item.degree && item.major ? " in " : ""}
                    {item.major}
                  </p>
                )
              ) : (
                (item.title || item.role) && (
                  <p className="text-xs text-muted-foreground">{item.title || item.role}</p>
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
                  {gallery.map((p) => (
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
                  ))}
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
            <div className="mt-3 rounded-lg border bg-muted/40 p-2.5">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">About</h4>
              <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line">
                {item.description}
              </p>
            </div>
          )}

          {/* Responsibilities */}
          {responsibilities.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-2.5">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Responsibilities
              </h4>
              <ul className="space-y-1 text-xs text-foreground/90">
                {responsibilities.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Accomplishments */}
          {accomplishments.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-2.5">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Award className="h-3 w-3 text-amber-500" /> Accomplishments
              </h4>
              <ul className="space-y-1 text-xs text-foreground/90">
                {accomplishments.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500 shrink-0">★</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tech stack */}
          {tech.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-2.5">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Code2 className="h-3 w-3" /> Tech & Tools
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {tech.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 text-[11px] rounded-full bg-primary/10 text-primary border border-primary/20"
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

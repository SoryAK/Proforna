"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  User as UserIcon,
  MapPin,
  Mail,
  Phone,
  Linkedin,
  Github,
  Globe,
  Calendar,
  ChevronDown,
  ChevronUp,
  Settings,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PortalSettingsPanel } from "@/components/portal-settings-panel";

/* ── Types ────────────────────────────────────────────────── */
interface Profile {
  fullName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  schedulingUrl: string | null;
  contactCtaMessage: string | null;
  maxCommuteMiles: number | null;
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  bio: string | null;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
  salaryPeriod: string | null;
  currency: string | null;
}

interface PublishStatus {
  everPublished: boolean;
  publishedAt: string | null;
  publishNote: string | null;
}

function fmtSalaryRange(min: number | null, max: number | null, currency: string | null, period: string | null) {
  const sym = (currency ?? "USD") === "USD" ? "$" : `${currency ?? "USD"} `;
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  const suffix = period === "hourly" ? "/hr" : period === "monthly" ? "/mo" : "/yr";
  if (min && max) return `${sym}${fmt(min)}–${sym}${fmt(max)}${suffix}`;
  if (min) return `from ${sym}${fmt(min)}${suffix}`;
  if (max) return `up to ${sym}${fmt(max)}${suffix}`;
  return null;
}

function fmtRel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return `${mo}mo ago`;
}

/* ── Component ────────────────────────────────────────────── */
export function BioCardEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [collapsed, setCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Brief lockout right after a successful publish to discourage spam clicks.
  const [justPublished, setJustPublished] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/publish"),
      ]);
      if (pRes.ok) setProfile(await pRes.json());
      if (sRes.ok) setStatus(await sRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", { method: "POST" });
      if (!res.ok) throw new Error("Publish failed");
      const data = await res.json().catch(() => ({} as { noChange?: boolean }));
      const sRes = await fetch("/api/publish");
      if (sRes.ok) setStatus(await sRes.json());
      if (data?.noChange) {
        toast.success("Already up to date");
      } else {
        toast.success("Published to your Interactive Resume");
        // Notify any open IR tabs (same browser) so they re-fetch without a reload.
        if (typeof BroadcastChannel !== "undefined") {
          try {
            const ch = new BroadcastChannel("resumsify-publish");
            ch.postMessage({ type: "publish", at: Date.now() });
            ch.close();
          } catch {
            // Best-effort; ignore environments that block BroadcastChannel.
          }
        }
      }
      // 5-second lockout to discourage spam re-clicks.
      setJustPublished(true);
      window.setTimeout(() => setJustPublished(false), 5000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const view = profile;
  const compStr = profile ? fmtSalaryRange(profile.targetSalaryMin, profile.targetSalaryMax, profile.currency, profile.salaryPeriod) : null;
  const everPublished = !!status?.everPublished;
  // Block publish only when there's literally no profile to snapshot yet, or while in flight / cool-down.
  const noProfile = !view;
  const publishDisabled = publishing || justPublished || (noProfile && !everPublished);

  if (loading && !view) {
    return (
      <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-96 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading bio…
      </div>
    );
  }

  return (
    <>
    <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl w-full max-h-[70vh] overflow-y-auto scrollbar-thin">
      {/* ── Publish status strip ── */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${
          everPublished ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-1.5 text-xs min-w-0">
          {everPublished ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                Last published
              </span>
              {status?.publishedAt && (
                <span className="text-muted-foreground truncate">· {fmtRel(status.publishedAt)}</span>
              )}
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Never published</span>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs px-2.5"
          disabled={publishDisabled}
          onClick={publish}
          title={
            noProfile && !everPublished
              ? "Add your bio first"
              : justPublished
                ? "Just published — try again in a moment"
                : "Publish current state to your Interactive Resume"
          }
        >
          {publishing ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Publishing…</>
          ) : justPublished ? (
            <><CheckCircle2 className="h-3 w-3 mr-1" /> Published</>
          ) : (
            <><CloudUpload className="h-3 w-3 mr-1" /> Publish</>
          )}
        </Button>
      </div>

      {/* ── Card body ── */}
      <div className="p-3">
        {/* Top row: avatar + identity + edit toggle */}
        <div className="flex items-start gap-3">
          {view?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/30 shrink-0" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold truncate">{view?.fullName || "Your name"}</p>
            {view?.headline && (
              <p className="text-sm text-primary line-clamp-2 mt-0.5">{view.headline}</p>
            )}
            {(view?.city || view?.state) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3.5 w-3.5" />
                {[view?.city, view?.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              title="Edit profile settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Comp chip (preview) */}
        {compStr && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-900/20 px-2 py-1">
            <DollarSign className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">{compStr}</span>
            {comp && comp.visibility !== "public" && (
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{comp.visibility}</span>
            )}
          </div>
        )}

        {/* Bio summary preview */}
        {view?.bio && !collapsed && (
          <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{view.bio}</div>
        )}

        {/* Contact preview */}
        {!collapsed && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {view?.email && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"><Mail className="h-3.5 w-3.5" /> {view.email}</span>}
            {view?.phone && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"><Phone className="h-3.5 w-3.5" /> {view.phone}</span>}
            {view?.linkedinUrl && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"><Linkedin className="h-3.5 w-3.5" /> LinkedIn</span>}
            {view?.githubUrl && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"><Github className="h-3.5 w-3.5" /> GitHub</span>}
            {view?.portfolioUrl && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"><Globe className="h-3.5 w-3.5" /> Portfolio</span>}
            {view?.schedulingUrl && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/60"><Calendar className="h-3.5 w-3.5" /> Scheduling</span>}
          </div>
        )}
      </div>
    </div>
    <Dialog open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (!open) load(); }}>
      <DialogContent className="w-[90vw] max-w-6xl sm:max-w-6xl h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Portal Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <PortalSettingsPanel />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

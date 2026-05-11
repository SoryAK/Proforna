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
  Pencil,
  Save,
  X,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

interface Comp {
  period: "annual" | "hourly" | "monthly";
  currency: string;
  salaryMin: number | null;
  salaryTarget: number | null;
  salaryMax: number | null;
  employmentTypes: string[];
  remotePreference: "any" | "remote" | "hybrid" | "onsite";
  openToRelocation: boolean;
  openToEquity: boolean;
  openToBonus: boolean;
  openToSignOn: boolean;
  notes: string | null;
  visibility: "public" | "recruiters" | "hidden";
}

interface PublishStatus {
  everPublished: boolean;
  publishedAt: string | null;
  publishNote: string | null;
}

const EMPLOYMENT_OPTS = ["full_time", "part_time", "contract", "1099", "internship", "temp"];
const REMOTE_OPTS: Comp["remotePreference"][] = ["any", "remote", "hybrid", "onsite"];

function fmtSalary(c: Comp) {
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  const sym = c.currency === "USD" ? "$" : c.currency + " ";
  const suffix = c.period === "hourly" ? "/hr" : c.period === "monthly" ? "/mo" : "/yr";
  if (c.salaryMin && c.salaryMax) return `${sym}${fmt(c.salaryMin)}–${sym}${fmt(c.salaryMax)}${suffix}`;
  if (c.salaryTarget) return `${sym}${fmt(c.salaryTarget)}${suffix}`;
  if (c.salaryMin) return `from ${sym}${fmt(c.salaryMin)}${suffix}`;
  if (c.salaryMax) return `up to ${sym}${fmt(c.salaryMax)}${suffix}`;
  return "Open";
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
  const [comp, setComp] = useState<Comp | null>(null);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [collapsed, setCollapsed] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Brief lockout right after a successful publish to discourage spam clicks.
  const [justPublished, setJustPublished] = useState(false);

  // Edit drafts (separate from server state so cancel works)
  const [draftP, setDraftP] = useState<Profile | null>(null);
  const [draftC, setDraftC] = useState<Comp | null>(null);
  const [geocodingHome, setGeocodingHome] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, cRes, sRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/profile/compensation"),
        fetch("/api/publish"),
      ]);
      if (pRes.ok) setProfile(await pRes.json());
      if (cRes.ok) setComp(await cRes.json());
      if (sRes.ok) setStatus(await sRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    if (!profile) return;
    setDraftP({ ...profile });
    setDraftC(comp ? { ...comp } : null);
    setEditing(true);
    setCollapsed(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftP(null);
    setDraftC(null);
  };

  const save = async () => {
    if (!draftP) return;
    setSaving(true);
    try {
      const pRes = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftP),
      });
      if (!pRes.ok) throw new Error("Profile save failed");
      const newP = await pRes.json();
      setProfile(newP);

      if (draftC) {
        const cRes = await fetch("/api/profile/compensation", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftC),
        });
        if (!cRes.ok) throw new Error("Compensation save failed");
        const newC = await cRes.json();
        setComp(newC);
      }
      // Refresh publish status (changes pending now)
      const sRes = await fetch("/api/publish");
      if (sRes.ok) setStatus(await sRes.json());
      setEditing(false);
      setDraftP(null);
      setDraftC(null);
      toast.success("Saved as draft — publish to update your IR");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

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
  const compStr = comp && (comp.salaryMin || comp.salaryMax || comp.salaryTarget) ? fmtSalary(comp) : null;
  const everPublished = !!status?.everPublished;
  // Block publish only when there's literally no profile to snapshot yet, or while in flight / cool-down.
  const noProfile = !view;
  const publishDisabled = publishing || justPublished || (noProfile && !everPublished);

  const toggleEmp = (val: string) => {
    if (!draftC) return;
    const next = draftC.employmentTypes.includes(val)
      ? draftC.employmentTypes.filter((v) => v !== val)
      : [...draftC.employmentTypes, val];
    setDraftC({ ...draftC, employmentTypes: next });
  };

  const empLabel = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading && !view) {
    return (
      <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3 w-96 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading bio…
      </div>
    );
  }

  return (
    <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl w-full max-h-[70vh] overflow-y-auto scrollbar-thin">
      {/* ── Publish status strip ── */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${
          everPublished ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
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
          className="h-6 text-[11px] px-2"
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
            <p className="text-sm font-semibold truncate">{view?.fullName || "Your name"}</p>
            {view?.headline && (
              <p className="text-xs text-primary line-clamp-2 mt-0.5">{view.headline}</p>
            )}
            {(view?.city || view?.state) && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {[view?.city, view?.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {!editing ? (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-muted-foreground hover:text-foreground"
                  title="Edit bio"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed((v) => !v)}
                  className="text-muted-foreground hover:text-foreground"
                  title={collapsed ? "Expand" : "Collapse"}
                >
                  {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-muted-foreground hover:text-foreground"
                title="Cancel edit"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Comp chip (preview) */}
        {!editing && compStr && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-900/20 px-2 py-1">
            <DollarSign className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
            <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-100">{compStr}</span>
            {comp && comp.visibility !== "public" && (
              <span className="text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{comp.visibility}</span>
            )}
          </div>
        )}

        {/* Bio summary preview */}
        {!editing && view?.bio && !collapsed && (
          <div className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{view.bio}</div>
        )}

        {/* Contact preview */}
        {!editing && !collapsed && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {view?.email && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"><Mail className="h-3 w-3" /> {view.email}</span>}
            {view?.phone && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"><Phone className="h-3 w-3" /> {view.phone}</span>}
            {view?.linkedinUrl && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"><Linkedin className="h-3 w-3" /> LinkedIn</span>}
            {view?.githubUrl && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"><Github className="h-3 w-3" /> GitHub</span>}
            {view?.portfolioUrl && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"><Globe className="h-3 w-3" /> Portfolio</span>}
            {view?.schedulingUrl && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"><Calendar className="h-3 w-3" /> Scheduling</span>}
          </div>
        )}

        {/* ── Edit form ── */}
        {editing && draftP && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-[11px]">Avatar URL</Label>
                <Input
                  className="h-7 text-xs"
                  value={draftP.avatarUrl ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, avatarUrl: e.target.value || null })}
                  placeholder="https://…"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Full name</Label>
                <Input
                  className="h-7 text-xs"
                  value={draftP.fullName ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, fullName: e.target.value || null })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Headline / tagline</Label>
                <Input
                  className="h-7 text-xs"
                  value={draftP.headline ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, headline: e.target.value || null })}
                  placeholder="3+ yrs in Mechatronics — Design, Manufacturing, Automation"
                />
              </div>
              <div>
                <Label className="text-[11px]">City</Label>
                <Input
                  className="h-7 text-xs"
                  value={draftP.city ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, city: e.target.value || null })}
                />
              </div>
              <div>
                <Label className="text-[11px]">State</Label>
                <Input
                  className="h-7 text-xs"
                  value={draftP.state ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, state: e.target.value || null })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Bio summary</Label>
                <Textarea
                  className="text-xs min-h-[72px]"
                  value={draftP.bio ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, bio: e.target.value || null })}
                  placeholder="Short paragraph recruiters see at the top of your IR…"
                />
              </div>

              <div className="col-span-2 pt-1 border-t">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Contact</p>
              </div>
              <div>
                <Label className="text-[11px]">Email</Label>
                <Input className="h-7 text-xs" value={draftP.email ?? ""} onChange={(e) => setDraftP({ ...draftP, email: e.target.value || null })} />
              </div>
              <div>
                <Label className="text-[11px]">Phone</Label>
                <Input className="h-7 text-xs" value={draftP.phone ?? ""} onChange={(e) => setDraftP({ ...draftP, phone: e.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">LinkedIn URL</Label>
                <Input className="h-7 text-xs" value={draftP.linkedinUrl ?? ""} onChange={(e) => setDraftP({ ...draftP, linkedinUrl: e.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">GitHub URL</Label>
                <Input className="h-7 text-xs" value={draftP.githubUrl ?? ""} onChange={(e) => setDraftP({ ...draftP, githubUrl: e.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Portfolio URL</Label>
                <Input className="h-7 text-xs" value={draftP.portfolioUrl ?? ""} onChange={(e) => setDraftP({ ...draftP, portfolioUrl: e.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Scheduling URL (Calendly, Cal.com, etc.)</Label>
                <Input className="h-7 text-xs" value={draftP.schedulingUrl ?? ""} onChange={(e) => setDraftP({ ...draftP, schedulingUrl: e.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">&ldquo;Get in touch&rdquo; message <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  maxLength={280}
                  value={draftP.contactCtaMessage ?? ""}
                  onChange={(e) => setDraftP({ ...draftP, contactCtaMessage: e.target.value || null })}
                  placeholder="Custom CTA or disclosure shown above the contact form (e.g. &lsquo;Only contact me about Senior+ roles&rsquo; or &lsquo;Replies within 48h&rsquo;)…"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">{(draftP.contactCtaMessage ?? "").length}/280</p>
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Home address <span className="text-muted-foreground font-normal">(used for commute radius — kept private)</span></Label>
                <div className="flex gap-1.5">
                  <Input
                    className="h-7 text-xs flex-1"
                    value={draftP.homeAddress ?? ""}
                    onChange={(e) => setDraftP({ ...draftP, homeAddress: e.target.value || null })}
                    placeholder="123 Main St, City, ST 12345"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    disabled={geocodingHome}
                    title="Pull from Life Anchor 'Home', current Residence, or Job-Search portal"
                    onClick={async () => {
                      setGeocodingHome(true);
                      try {
                        // 1) Life Anchor labeled Home (or icon=home)
                        const aRes = await fetch("/api/life-anchors");
                        if (aRes.ok) {
                          const anchors = await aRes.json();
                          const home = Array.isArray(anchors)
                            ? anchors.find((a: { label?: string; icon?: string }) =>
                                /^home$/i.test(a.label || "") || (a.icon || "").toLowerCase() === "home")
                            : null;
                          if (home && home.lat != null && home.lng != null) {
                            setDraftP({ ...draftP, homeAddress: home.address, homeLat: home.lat, homeLng: home.lng });
                            toast.success("Pulled from Life Anchor 'Home'");
                            return;
                          }
                        }
                        // 2) Current residence
                        const rRes = await fetch("/api/residences");
                        if (rRes.ok) {
                          const residences = await rRes.json();
                          const current = Array.isArray(residences)
                            ? residences.find((r: { isCurrent?: boolean }) => r.isCurrent)
                              ?? residences.find((r: { endDate?: string | null }) => !r.endDate)
                            : null;
                          if (current && current.lat != null && current.lng != null) {
                            setDraftP({ ...draftP, homeAddress: current.address, homeLat: current.lat, homeLng: current.lng });
                            toast.success("Pulled from current residence");
                            return;
                          }
                        }
                        // 3) Job-search portal settings (already on UserProfile.homeAddress)
                        const pRes = await fetch("/api/profile");
                        if (pRes.ok) {
                          const p = await pRes.json();
                          if (p.homeLat != null && p.homeLng != null) {
                            setDraftP({ ...draftP, homeAddress: p.homeAddress, homeLat: p.homeLat, homeLng: p.homeLng });
                            toast.success("Pulled from Portal Settings");
                            return;
                          }
                        }
                        toast.error("No home location found in Life Anchors, Residences, or Portal Settings");
                      } catch {
                        toast.error("Auto-fill failed");
                      } finally {
                        setGeocodingHome(false);
                      }
                    }}
                  >
                    Auto-fill
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    disabled={geocodingHome || !draftP.homeAddress?.trim()}
                    onClick={async () => {
                      const addr = draftP.homeAddress?.trim();
                      if (!addr) return;
                      setGeocodingHome(true);
                      try {
                        const res = await fetch(`/api/resolve-address?address=${encodeURIComponent(addr)}&mode=geocode`);
                        if (!res.ok) throw new Error("Geocode failed");
                        const data = await res.json();
                        if (data.lat && data.lng) {
                          setDraftP({ ...draftP, homeAddress: addr, homeLat: data.lat, homeLng: data.lng });
                          toast.success("Home location pinned");
                        } else {
                          toast.error("Couldn't find that address");
                        }
                      } catch {
                        toast.error("Geocoding failed");
                      } finally {
                        setGeocodingHome(false);
                      }
                    }}
                  >
                    {geocodingHome ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pin"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {draftP.homeLat != null && draftP.homeLng != null
                    ? `✓ Pinned at ${draftP.homeLat.toFixed(4)}, ${draftP.homeLng.toFixed(4)} · only a ~1km-jittered version is exposed publicly.`
                    : "Click Pin to geocode — required for IR Recruit Mode."}
                </p>
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">Max commute distance <span className="text-muted-foreground font-normal">(miles, one-way)</span></Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={500}
                  value={draftP.maxCommuteMiles ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return setDraftP({ ...draftP, maxCommuteMiles: null });
                    const n = Number(raw);
                    setDraftP({ ...draftP, maxCommuteMiles: Number.isFinite(n) ? Math.max(0, Math.min(500, Math.round(n))) : null });
                  }}
                  placeholder="e.g. 35"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Used by IR Recruit Mode to draw a travel radius around your home address.</p>
              </div>
            </div>

            {draftC && (
              <div className="border-t pt-2 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Compensation Expectations</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px]">Period</Label>
                    <Select value={draftC.period} onValueChange={(v) => setDraftC({ ...draftC, period: (v as Comp["period"]) ?? "annual" })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Min</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={draftC.salaryMin ?? ""}
                      onChange={(e) => setDraftC({ ...draftC, salaryMin: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Max</Label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={draftC.salaryMax ?? ""}
                      onChange={(e) => setDraftC({ ...draftC, salaryMax: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Employment types</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {EMPLOYMENT_OPTS.map((v) => {
                      const on = draftC.employmentTypes.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleEmp(v)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            on ? "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-muted text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          {empLabel(v)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Remote pref</Label>
                    <Select value={draftC.remotePreference} onValueChange={(v) => setDraftC({ ...draftC, remotePreference: (v as Comp["remotePreference"]) ?? "any" })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REMOTE_OPTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Visibility</Label>
                    <Select value={draftC.visibility} onValueChange={(v) => setDraftC({ ...draftC, visibility: (v as Comp["visibility"]) ?? "public" })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="recruiters">Recruiters only</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  {(["openToRelocation", "openToEquity", "openToBonus", "openToSignOn"] as const).map((flag) => (
                    <label key={flag} className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftC[flag]}
                        onChange={(e) => setDraftC({ ...draftC, [flag]: e.target.checked })}
                      />
                      {flag.replace("openTo", "").replace(/([A-Z])/g, " $1").trim()}
                    </label>
                  ))}
                </div>
                <div>
                  <Label className="text-[11px]">Notes</Label>
                  <Textarea
                    className="text-xs min-h-[44px]"
                    value={draftC.notes ?? ""}
                    onChange={(e) => setDraftC({ ...draftC, notes: e.target.value || null })}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={saving}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save draft
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  lastChangeAt: string | null;
  hasChanges: boolean;
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

  // Edit drafts (separate from server state so cancel works)
  const [draftP, setDraftP] = useState<Profile | null>(null);
  const [draftC, setDraftC] = useState<Comp | null>(null);

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
      const sRes = await fetch("/api/publish");
      if (sRes.ok) setStatus(await sRes.json());
      toast.success("Published to your Interactive Resume");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const view = profile;
  const compStr = comp && (comp.salaryMin || comp.salaryMax || comp.salaryTarget) ? fmtSalary(comp) : null;
  const hasChanges = !!status?.hasChanges;
  const everPublished = !!status?.everPublished;

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
    <div className="bg-background/95 backdrop-blur-md border rounded-xl shadow-xl w-96 max-h-[70vh] overflow-y-auto scrollbar-thin">
      {/* ── Publish status strip ── */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${
          hasChanges
            ? "bg-amber-500/10 border-amber-500/30"
            : everPublished
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
          {hasChanges ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {everPublished ? "Pending changes" : "Not published"}
              </span>
              {status?.lastChangeAt && (
                <span className="text-muted-foreground truncate">· edited {fmtRel(status.lastChangeAt)}</span>
              )}
            </>
          ) : everPublished ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">Up to date</span>
              {status?.publishedAt && (
                <span className="text-muted-foreground truncate">· published {fmtRel(status.publishedAt)}</span>
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
          variant={hasChanges ? "default" : "outline"}
          className="h-6 text-[11px] px-2"
          disabled={publishing || (!hasChanges && everPublished)}
          onClick={publish}
        >
          {publishing ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Publishing…</>
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

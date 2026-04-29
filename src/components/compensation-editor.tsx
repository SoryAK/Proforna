"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, Loader2, Save, Lock, Calculator } from "lucide-react";
import Link from "next/link";

type Period = "annual" | "hourly" | "monthly";
type Remote = "any" | "remote" | "hybrid" | "onsite";
type Visibility = "public" | "recruiters" | "hidden";

interface CompForm {
  period: Period;
  currency: string;
  salaryMin: string;
  salaryTarget: string;
  salaryMax: string;
  hardFloor: string;
  employmentTypes: string[];
  openToRelocation: boolean;
  openToEquity: boolean;
  openToBonus: boolean;
  openToSignOn: boolean;
  remotePreference: Remote;
  benefitsMustHaves: string[];
  notes: string;
  visibility: Visibility;
}

const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "1099", label: "1099" },
  { value: "internship", label: "Internship" },
  { value: "temp", label: "Temp" },
];

const BENEFIT_OPTIONS: { value: string; label: string }[] = [
  { value: "health", label: "Health insurance" },
  { value: "dental", label: "Dental" },
  { value: "vision", label: "Vision" },
  { value: "401k_match", label: "401(k) match" },
  { value: "unlimited_pto", label: "Unlimited PTO" },
  { value: "paid_parental_leave", label: "Paid parental leave" },
  { value: "remote_stipend", label: "Remote stipend" },
  { value: "learning_budget", label: "Learning budget" },
  { value: "equity_refresh", label: "Equity refresh" },
];

const EMPTY: CompForm = {
  period: "annual",
  currency: "USD",
  salaryMin: "",
  salaryTarget: "",
  salaryMax: "",
  hardFloor: "",
  employmentTypes: [],
  openToRelocation: false,
  openToEquity: false,
  openToBonus: true,
  openToSignOn: false,
  remotePreference: "any",
  benefitsMustHaves: [],
  notes: "",
  visibility: "public",
};

export function CompensationEditor() {
  const [form, setForm] = useState<CompForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/compensation")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setForm({
          period: (data.period as Period) ?? "annual",
          currency: data.currency ?? "USD",
          salaryMin: data.salaryMin != null ? String(data.salaryMin) : "",
          salaryTarget: data.salaryTarget != null ? String(data.salaryTarget) : "",
          salaryMax: data.salaryMax != null ? String(data.salaryMax) : "",
          hardFloor: data.hardFloor != null ? String(data.hardFloor) : "",
          employmentTypes: Array.isArray(data.employmentTypes) ? data.employmentTypes : [],
          openToRelocation: !!data.openToRelocation,
          openToEquity: !!data.openToEquity,
          openToBonus: data.openToBonus ?? true,
          openToSignOn: !!data.openToSignOn,
          remotePreference: (data.remotePreference as Remote) ?? "any",
          benefitsMustHaves: Array.isArray(data.benefitsMustHaves) ? data.benefitsMustHaves : [],
          notes: data.notes ?? "",
          visibility: (data.visibility as Visibility) ?? "public",
        });
      })
      .catch(() => { /* keep defaults */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  // Inline validation — mirrors server rules so users see issues before submit.
  const errors = (() => {
    const e: { min?: string; target?: string; max?: string; floor?: string; range?: string } = {};
    const parseField = (s: string): number | null => {
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    };
    const min = parseField(form.salaryMin);
    const tgt = parseField(form.salaryTarget);
    const max = parseField(form.salaryMax);
    const floor = parseField(form.hardFloor);
    if (Number.isNaN(min)) e.min = "Must be a number";
    else if (min != null && min < 0) e.min = "Must be ≥ 0";
    if (Number.isNaN(tgt)) e.target = "Must be a number";
    else if (tgt != null && tgt < 0) e.target = "Must be ≥ 0";
    if (Number.isNaN(max)) e.max = "Must be a number";
    else if (max != null && max < 0) e.max = "Must be ≥ 0";
    if (Number.isNaN(floor)) e.floor = "Must be a number";
    else if (floor != null && floor < 0) e.floor = "Must be ≥ 0";
    if (typeof min === "number" && typeof max === "number" && min > max) {
      e.range = "Min must be less than or equal to Max";
    }
    if (typeof min === "number" && typeof tgt === "number" && min > tgt) {
      e.range = "Min must be less than or equal to Target";
    }
    if (typeof tgt === "number" && typeof max === "number" && tgt > max) {
      e.range = "Target must be less than or equal to Max";
    }
    return e;
  })();
  const hasErrors = Object.keys(errors).length > 0;

  // True when the user hasn't filled in any actionable comp signal yet.
  const isEmpty =
    !form.salaryMin && !form.salaryTarget && !form.salaryMax && !form.hardFloor &&
    form.employmentTypes.length === 0 && form.benefitsMustHaves.length === 0 &&
    !form.notes;

  // Spread-based flex signal: helps recruiters frame offers.
  const flexLabel = (() => {
    const min = form.salaryMin ? Number(form.salaryMin) : null;
    const max = form.salaryMax ? Number(form.salaryMax) : null;
    if (min == null || max == null || min <= 0) return null;
    if (min === max) return { label: "Firm", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" };
    const spread = (max - min) / min;
    if (spread >= 0.25) return { label: "Flexible", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" };
    return { label: "Some flex", className: "bg-sky-500/10 text-sky-700 border-sky-500/30" };
  })();

  const save = async () => {
    if (hasErrors) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const body = {
        period: form.period,
        currency: form.currency,
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
        salaryTarget: form.salaryTarget ? parseInt(form.salaryTarget) : null,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
        hardFloor: form.hardFloor ? parseInt(form.hardFloor) : null,
        employmentTypes: form.employmentTypes,
        openToRelocation: form.openToRelocation,
        openToEquity: form.openToEquity,
        openToBonus: form.openToBonus,
        openToSignOn: form.openToSignOn,
        remotePreference: form.remotePreference,
        benefitsMustHaves: form.benefitsMustHaves,
        notes: form.notes || null,
        visibility: form.visibility,
      };
      const res = await fetch("/api/profile/compensation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      toast.success("Compensation expectations saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Compensation Expectations
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Surface your pay requirements upfront so recruiters can self-filter before reaching out.
          Shown on your immersive resume based on the visibility setting below.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {isEmpty && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                <DollarSign className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  <strong className="font-semibold">Tip:</strong> candidates who publish a salary range
                  get fewer mismatched recruiter outreach messages. Add at least a min &amp; max so
                  recruiters can self-filter.
                </p>
              </div>
            )}
            {flexLabel && (
              <div className="flex items-center gap-2 -mb-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${flexLabel.className}`}>
                  {flexLabel.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Negotiation signal recruiters will see.
                </span>
                <Link
                  href="/offer-compare"
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <Calculator className="h-3 w-3" />
                  Score an offer
                </Link>
              </div>
            )}
            {/* Visibility */}
            <div>
              <Label className="mb-1">Who sees this</Label>
              <Select
                value={form.visibility}
                onValueChange={(v) => setForm({ ...form, visibility: ((v as Visibility) ?? "public") })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — anyone with the IR link</SelectItem>
                  <SelectItem value="recruiters">Recruiters only — token / approved access</SelectItem>
                  <SelectItem value="hidden">Hidden — nobody sees it</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pay range */}
            <div>
              <Label className="mb-1">Pay range</Label>
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="sm:col-span-1">
                  <Select
                    value={form.period}
                    onValueChange={(v) => setForm({ ...form, period: ((v as Period) ?? "annual") })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1">
                  <Select
                    value={form.currency}
                    onValueChange={(v) => setForm({ ...form, currency: v ?? "USD" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  placeholder="Min"
                  aria-invalid={!!errors.min}
                  value={form.salaryMin}
                  onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Target"
                  aria-invalid={!!errors.target}
                  value={form.salaryTarget}
                  onChange={(e) => setForm({ ...form, salaryTarget: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  aria-invalid={!!errors.max}
                  value={form.salaryMax}
                  onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                />
              </div>
              {(errors.min || errors.target || errors.max || errors.range) && (
                <p className="text-xs text-destructive mt-1">
                  {errors.range || errors.min || errors.target || errors.max}
                </p>
              )}
            </div>

            {/* Hard floor */}
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                Private hard floor (optional)
              </Label>
              <Input
                type="number"
                placeholder="e.g. 130000"
                aria-invalid={!!errors.floor}
                value={form.hardFloor}
                onChange={(e) => setForm({ ...form, hardFloor: e.target.value })}
              />
              {errors.floor && (
                <p className="text-xs text-destructive mt-1">{errors.floor}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The exact number is never shown to recruiters. They&apos;ll only see a &ldquo;verified minimum&rdquo;
                indicator that you have a floor set.
              </p>
            </div>

            {/* Employment types */}
            <div>
              <Label className="mb-1">Employment types you&apos;ll consider</Label>
              <div className="flex flex-wrap gap-1.5">
                {EMPLOYMENT_OPTIONS.map((opt) => {
                  const on = form.employmentTypes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, employmentTypes: toggle(form.employmentTypes, opt.value) })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:bg-muted/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Remote preference */}
            <div>
              <Label className="mb-1">Work mode preference</Label>
              <Select
                value={form.remotePreference}
                onValueChange={(v) => setForm({ ...form, remotePreference: ((v as Remote) ?? "any") })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="remote">Remote only</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="onsite">On-site</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Open-to flags */}
            <div>
              <Label className="mb-2 block">Open to</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { key: "openToBonus" as const, label: "Bonus" },
                  { key: "openToEquity" as const, label: "Equity" },
                  { key: "openToSignOn" as const, label: "Sign-on bonus" },
                  { key: "openToRelocation" as const, label: "Relocation package" },
                ].map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm">{row.label}</span>
                    <Switch
                      checked={form[row.key]}
                      onCheckedChange={(c) => setForm({ ...form, [row.key]: c })}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Benefits must-haves */}
            <div>
              <Label className="mb-1">Benefit must-haves</Label>
              <div className="flex flex-wrap gap-1.5">
                {BENEFIT_OPTIONS.map((opt) => {
                  const on = form.benefitsMustHaves.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, benefitsMustHaves: toggle(form.benefitsMustHaves, opt.value) })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        on
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-background text-muted-foreground border-input hover:bg-muted/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="mb-1">Notes (optional)</Label>
              <Textarea
                rows={3}
                placeholder="e.g. Negotiable for equity-heavy startups; prefer companies with strong engineering culture."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value.slice(0, 1000) })}
              />
              <p className="text-xs text-muted-foreground mt-1">{form.notes.length}/1000</p>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || hasErrors}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save compensation
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
